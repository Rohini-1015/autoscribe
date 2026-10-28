/**
 * AutoScribe Autosave & Answer Recovery Router
 * Persists continuous candidate answers to MySQL and restores drafts on reconnection.
 */

const express = require('express');
const db = require('../config/database');
const { requireCandidateOrTeacher } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/answers/autosave
 * Persists an in-progress answer for a question to MySQL
 */
router.post('/autosave', requireCandidateOrTeacher, async (req, res) => {
  try {
    const { studentRoll, examId, questionId, answerText } = req.body || {};

    const roll = String(studentRoll || '').trim().toUpperCase();
    const eid = String(examId || '').trim();
    const qid = parseInt(questionId, 10);
    const ans = String(answerText || '');

    if (!roll || !eid || isNaN(qid)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Valid studentRoll, examId, and questionId are required.'
      });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable. Answer saved locally in browser cache.',
        isOffline: true
      });
    }

    // 1. Lock check: Prevent edits if final exam was already submitted
    const existingSubs = await db.query(
      'SELECT submission_id FROM submissions WHERE student_roll = ? AND exam_id = ?',
      [roll, eid]
    );

    if (existingSubs && existingSubs.length > 0) {
      return res.status(403).json({
        error: 'EXAM_LOCKED',
        message: 'This examination has already been finalized and submitted. Answers cannot be modified.',
        submissionId: existingSubs[0].submission_id
      });
    }

    // 2. Upsert answer in MySQL
    await db.query(
      `INSERT INTO answers (student_roll, exam_id, question_id, answer_text)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text), updated_at = CURRENT_TIMESTAMP`,
      [roll, eid, qid, ans]
    );

    return res.json({
      success: true,
      savedAt: new Date().toISOString(),
      studentRoll: roll,
      examId: eid,
      questionId: qid
    });
  } catch (err) {
    console.error('Error in POST /api/answers/autosave:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to persist autosave.' });
  }
});

/**
 * GET /api/answers/:rollNumber/:examId
 * Restores candidate's previously saved answers upon browser reload or reconnection
 */
router.get('/:rollNumber/:examId', requireCandidateOrTeacher, async (req, res) => {
  try {
    const roll = String(req.params.rollNumber || '').trim().toUpperCase();
    const eid = String(req.params.examId || '').trim();

    if (!roll || !eid) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Both candidate roll and exam ID are required.' });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is unreachable. Cannot restore answers.',
        isOffline: true
      });
    }

    const rows = await db.query(
      `SELECT question_id AS questionId, answer_text AS answerText, updated_at AS updatedAt
       FROM answers
       WHERE student_roll = ? AND exam_id = ?
       ORDER BY question_id ASC`,
      [roll, eid]
    );

    const answersMap = {};
    rows.forEach(r => {
      answersMap[r.questionId] = r.answerText || '';
    });

    return res.json({
      success: true,
      studentRoll: roll,
      examId: eid,
      answers: answersMap,
      count: rows.length
    });
  } catch (err) {
    console.error('Error in GET /api/answers/:rollNumber/:examId:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve saved answers.' });
  }
});

module.exports = router;
