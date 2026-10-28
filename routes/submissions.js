/**
 * AutoScribe Final Submissions & Educator Review Router
 * Transactional Final Examination Submissions, Duplicate Prevention, and Submissions Reporting.
 */

const express = require('express');
const db = require('../config/database');
const { requireTeacherAuth, requireCandidateOrTeacher } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

/**
 * POST /api/submissions
 * Transactional Final Examination Submission with Duplicate Prevention & Server Confirmation
 */
router.post('/', requireCandidateOrTeacher, async (req, res) => {
  try {
    const { submissionId, studentRoll, studentName, examId, answers } = req.body || {};
    const ip = req.ip || req.connection.remoteAddress;

    const cleanRoll = String(studentRoll || '').trim().toUpperCase();
    const cleanName = String(studentName || '').trim();
    const eid = String(examId || '').trim();
    const subId = String(submissionId || '').trim() || ('SUB-' + Date.now());
    const answersObj = (typeof answers === 'object' && answers !== null) ? answers : {};

    if (!cleanRoll) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Student roll number is required for final submission.' });
    }
    if (!eid) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Exam ID is required for final submission.' });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently offline. Final submission could not be confirmed by central server.',
        isOffline: true,
        submissionId: subId
      });
    }

    // 1. Concurrency & Duplicate Check: Ensure exam has not already been submitted
    const existingRows = await db.query(
      'SELECT submission_id AS submissionId, submitted_at AS submittedAt FROM submissions WHERE student_roll = ? AND exam_id = ?',
      [cleanRoll, eid]
    );

    if (existingRows && existingRows.length > 0) {
      const prev = existingRows[0];
      return res.status(409).json({
        error: 'DUPLICATE_SUBMISSION',
        message: `This examination was already submitted and locked on ${new Date(prev.submittedAt).toLocaleString()}. Duplicate submissions are strictly prevented.`,
        submissionId: prev.submissionId,
        alreadySubmitted: true
      });
    }

    // 2. Transactional Commit
    let committedSubmission = null;
    await db.transaction(async (conn) => {
      const now = new Date();
      await conn.query(
        `INSERT INTO submissions (submission_id, student_roll, student_name, exam_id, answers_json, status, submitted_at, server_confirmed, ip_address)
         VALUES (?, ?, ?, ?, ?, 'Submitted', ?, TRUE, ?)`,
        [subId, cleanRoll, cleanName || 'Student', eid, JSON.stringify(answersObj), now, ip]
      );

      await conn.query(
        `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details_json, ip_address)
         VALUES ('student', ?, 'EXAM_SUBMISSION_FINALIZED', 'submission', ?, ?, ?)`,
        [cleanRoll, subId, JSON.stringify({ examId: eid, answersCount: Object.keys(answersObj).length }), ip]
      );

      committedSubmission = {
        submissionId: subId,
        studentRoll: cleanRoll,
        studentName: cleanName,
        examId: eid,
        submittedAt: now.toISOString(),
        status: 'Submitted',
        serverConfirmed: true
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Examination submission confirmed and locked in database.',
      ...committedSubmission
    });
  } catch (err) {
    console.error('Error in POST /api/submissions:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'DUPLICATE_SUBMISSION',
        message: 'Duplicate submission rejected by database constraint.'
      });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to record examination submission.' });
  }
});

/**
 * GET /api/submissions
 * Teacher: Retrieve all student examination submissions across all subjects
 */
router.get('/', requireTeacherAuth, async (req, res) => {
  try {
    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable.',
        isOffline: true
      });
    }

    const rows = await db.query(
      `SELECT s.submission_id AS submissionId, s.student_roll AS studentRoll,
              s.student_name AS studentName, s.exam_id AS examId,
              e.title AS examTitle, s.answers_json AS answersJson,
              s.status, s.submitted_at AS submittedAt, s.server_confirmed AS serverConfirmed
       FROM submissions s
       LEFT JOIN exams e ON s.exam_id = e.id
       ORDER BY s.submitted_at DESC`
    );

    const submissions = rows.map(r => {
      let answers = {};
      try {
        answers = JSON.parse(r.answersJson);
      } catch (e) {}

      return {
        submissionId: r.submissionId,
        studentId: r.studentRoll,
        studentName: r.studentName,
        examId: r.examId,
        examTitle: r.examTitle || r.examId,
        status: r.status,
        submittedAt: r.submittedAt,
        serverConfirmed: Boolean(r.serverConfirmed),
        answersCount: Object.keys(answers).length,
        answers: answers
      };
    });

    return res.json(submissions);
  } catch (err) {
    console.error('Error in GET /api/submissions:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch examination submissions.' });
  }
});

/**
 * GET /api/submissions/:id
 * Teacher: Retrieve single submission with question details and candidate answers
 */
router.get('/:id', requireTeacherAuth, async (req, res) => {
  try {
    const subId = String(req.params.id || '').trim();

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable.',
        isOffline: true
      });
    }

    const rows = await db.query(
      `SELECT s.submission_id AS submissionId, s.student_roll AS studentRoll,
              s.student_name AS studentName, s.exam_id AS examId,
              e.title AS examTitle, s.answers_json AS answersJson,
              s.status, s.submitted_at AS submittedAt, s.server_confirmed AS serverConfirmed
       FROM submissions s
       LEFT JOIN exams e ON s.exam_id = e.id
       WHERE s.submission_id = ?`,
      [subId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `Submission '${subId}' not found.` });
    }

    const r = rows[0];
    let answers = {};
    try {
      answers = JSON.parse(r.answersJson);
    } catch (e) {}

    // Fetch corresponding questions for comprehensive grading view
    const questions = await db.query(
      `SELECT question_number AS id, question_text AS text, marks, section
       FROM questions
       WHERE exam_id = ?
       ORDER BY question_number ASC`,
      [r.examId]
    );

    return res.json({
      submissionId: r.submissionId,
      studentId: r.studentRoll,
      studentName: r.studentName,
      examId: r.examId,
      examTitle: r.examTitle || r.examId,
      status: r.status,
      submittedAt: r.submittedAt,
      serverConfirmed: Boolean(r.serverConfirmed),
      answers: answers,
      questions: questions
    });
  } catch (err) {
    console.error('Error in GET /api/submissions/:id:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch submission detail.' });
  }
});

module.exports = router;
