/**
 * AutoScribe REST API Router
 * Handles Teacher Authentication, Student Verification, Exam Management,
 * Autosaving, and Final Locked Exam Submissions.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'autoscribe_jwt_secret_change_in_production_2026';

/**
 * Authentication Middleware for Teacher & Admin protected endpoints
 */
function requireTeacherAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Access denied. Valid Teacher Bearer token required.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'teacher') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions. Teacher role required.'
      });
    }
    req.teacher = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Session token has expired or is invalid. Please log in again.'
    });
  }
}

// -------------------------------------------------------------
// Database Health
// -------------------------------------------------------------
router.get('/db/health', (req, res) => {
  const connected = db.isConnected();
  res.json({
    status: connected ? 'connected' : 'offline',
    connected: connected,
    database: db.dbConfig.database,
    host: db.dbConfig.host,
    port: db.dbConfig.port,
    error: db.getConnectionError()
  });
});

// -------------------------------------------------------------
// Teacher Authentication
// -------------------------------------------------------------
router.post('/auth/teacher/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Teacher email is required.' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password is required.' });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'MySQL database is unreachable. Please verify MySQL service is running.',
        isOffline: true
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const rows = await db.query(
      'SELECT id, name, email, password_hash FROM teachers WHERE email = ?',
      [cleanEmail]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid teacher email or password.' });
    }

    const teacher = rows[0];
    const isPasswordValid = await bcrypt.compare(password, teacher.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid teacher email or password.' });
    }

    const token = jwt.sign(
      { id: teacher.id, email: teacher.email, name: teacher.name, role: 'teacher' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      success: true,
      token,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email
      }
    });
  } catch (err) {
    console.error('Error in /api/auth/teacher/login:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process teacher login.' });
  }
});

router.get('/auth/teacher/me', requireTeacherAuth, async (req, res) => {
  res.json({
    authenticated: true,
    teacher: req.teacher
  });
});

// -------------------------------------------------------------
// Student Authentication & Identity Validation
// -------------------------------------------------------------
router.post('/auth/student/login', async (req, res) => {
  try {
    const { rollNumber, name, preferredVoice } = req.body || {};

    const cleanRoll = String(rollNumber || '').trim().toUpperCase();
    const cleanName = String(name || '').trim();
    const voice = (preferredVoice && String(preferredVoice).toLowerCase() === 'female') ? 'female' : 'male';

    if (!cleanRoll) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Roll number is required.' });
    }
    if (!cleanName) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Student name is required.' });
    }

    if (db.isConnected()) {
      await db.query(
        `INSERT INTO students (roll_number, name, preferred_voice)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), preferred_voice = VALUES(preferred_voice), last_login = CURRENT_TIMESTAMP`,
        [cleanRoll, cleanName, voice]
      );
    }

    return res.json({
      success: true,
      student: {
        rollNumber: cleanRoll,
        name: cleanName,
        preferredVoice: voice
      },
      dbSynced: db.isConnected()
    });
  } catch (err) {
    console.error('Error in /api/auth/student/login:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to authenticate student.' });
  }
});

// -------------------------------------------------------------
// Exam Listing & Question Retrieval
// -------------------------------------------------------------
router.get('/exams', async (req, res) => {
  try {
    if (db.isConnected()) {
      const rows = await db.query(
        `SELECT id, title, code, duration_minutes AS durationMinutes, total_questions AS totalQuestions, structure, is_active AS isActive
         FROM exams
         WHERE is_active = TRUE
         ORDER BY id ASC`
      );
      if (rows && rows.length > 0) {
        return res.json(rows);
      }
    }

    // Fallback to default school subjects when DB is not yet populated
    const fallbackExams = db.DEFAULT_SUBJECTS.map(s => ({
      id: s.id,
      title: s.title,
      code: s.code,
      durationMinutes: s.durationMinutes,
      totalQuestions: s.totalQuestions,
      structure: s.structure,
      isActive: true
    }));
    return res.json(fallbackExams);
  } catch (err) {
    console.error('Error in /api/exams:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve exams.' });
  }
});

router.get('/exams/:id', async (req, res) => {
  try {
    const examId = String(req.params.id || '').trim();

    if (db.isConnected()) {
      const exams = await db.query(
        `SELECT id, title, code, duration_minutes AS durationMinutes, total_questions AS totalQuestions, structure
         FROM exams WHERE id = ?`,
        [examId]
      );

      if (exams && exams.length > 0) {
        const exam = exams[0];
        const questions = await db.query(
          `SELECT question_number AS id, question_text AS text, marks, section
           FROM questions
           WHERE exam_id = ?
           ORDER BY question_number ASC`,
          [examId]
        );
        exam.questions = questions;
        return res.json(exam);
      }
    }

    // Fallback search in default subjects
    const defaultSub = db.DEFAULT_SUBJECTS.find(s => s.id === examId || s.title.toLowerCase() === examId.toLowerCase());
    if (defaultSub) {
      return res.json(defaultSub);
    }

    return res.status(404).json({ error: 'NOT_FOUND', message: `Exam ${examId} not found.` });
  } catch (err) {
    console.error('Error in /api/exams/:id:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve exam questions.' });
  }
});

// Teacher: Create & Publish New Exam (Protected)
router.post('/exams', requireTeacherAuth, async (req, res) => {
  try {
    const { title, code, durationMinutes, questions, structure } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Exam title is required.' });
    }

    const duration = parseInt(durationMinutes, 10) || 60;
    const examCode = String(code || '').trim();
    const examId = 'exam_' + Date.now();
    const qList = Array.isArray(questions) && questions.length > 0 ? questions : [
      { id: 1, text: 'Sample Question', marks: 10, section: 'Section A' }
    ];

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Cannot publish exam while database is offline.',
        isOffline: true
      });
    }

    const examStructure = structure || `Total Questions: ${qList.length}`;
    await db.query(
      `INSERT INTO exams (id, title, code, duration_minutes, total_questions, structure, created_by, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [examId, title.trim(), examCode, duration, qList.length, examStructure, req.teacher.id]
    );

    for (let i = 0; i < qList.length; i++) {
      const q = qList[i];
      await db.query(
        `INSERT INTO questions (exam_id, question_number, question_text, marks, section)
         VALUES (?, ?, ?, ?, ?)`,
        [examId, q.id || (i + 1), q.text || 'Question Statement', q.marks || 2, q.section || 'General']
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Exam published successfully.',
      exam: {
        id: examId,
        title: title.trim(),
        code: examCode,
        durationMinutes: duration,
        totalQuestions: qList.length
      }
    });
  } catch (err) {
    console.error('Error in POST /api/exams:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to publish exam.' });
  }
});

// -------------------------------------------------------------
// Autosave & Answer Recovery
// -------------------------------------------------------------
router.post('/answers/autosave', async (req, res) => {
  try {
    const { studentRoll, examId, questionId, answerText } = req.body || {};

    const roll = String(studentRoll || '').trim().toUpperCase();
    const eid = String(examId || '').trim();
    const qid = parseInt(questionId, 10);
    const ans = String(answerText || '');

    if (!roll || !eid || isNaN(qid)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'studentRoll, examId, and valid questionId are required.' });
    }

    if (db.isConnected()) {
      await db.query(
        `INSERT INTO answers_autosave (student_roll, exam_id, question_id, answer_text)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text)`,
        [roll, eid, qid, ans]
      );
      return res.json({ success: true, savedAt: new Date().toISOString(), dbSynced: true });
    }

    return res.json({ success: true, savedAt: new Date().toISOString(), dbSynced: false, offlineDraft: true });
  } catch (err) {
    console.error('Error in /api/answers/autosave:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Autosave failed on server.' });
  }
});

router.get('/answers/:rollNumber/:examId', async (req, res) => {
  try {
    const roll = String(req.params.rollNumber || '').trim().toUpperCase();
    const eid = String(req.params.examId || '').trim();

    if (!roll || !eid) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Roll number and Exam ID are required.' });
    }

    if (db.isConnected()) {
      const rows = await db.query(
        `SELECT question_id, answer_text, updated_at
         FROM answers_autosave
         WHERE student_roll = ? AND exam_id = ?`,
        [roll, eid]
      );

      const answersMap = {};
      rows.forEach(r => {
        answersMap[r.question_id] = r.answer_text;
      });

      return res.json({ answers: answersMap, dbSynced: true });
    }

    return res.json({ answers: {}, dbSynced: false });
  } catch (err) {
    console.error('Error in /api/answers/:rollNumber/:examId:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve saved answers.' });
  }
});

// -------------------------------------------------------------
// Final Submissions & Teacher Submission Viewing
// -------------------------------------------------------------
router.post('/submissions', async (req, res) => {
  try {
    const { submissionId, studentRoll, studentName, examId, answers } = req.body || {};

    const cleanRoll = String(studentRoll || '').trim().toUpperCase();
    const cleanName = String(studentName || '').trim();
    const eid = String(examId || '').trim();
    const subId = String(submissionId || '').trim() || ('SUB-' + Date.now());
    const answersObj = (typeof answers === 'object' && answers !== null) ? answers : {};

    if (!cleanRoll) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Student roll number is required for submission.' });
    }
    if (!eid) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Exam ID is required for submission.' });
    }

    const now = new Date();
    if (db.isConnected()) {
      await db.query(
        `INSERT INTO submissions (submission_id, student_roll, student_name, exam_id, answers_json, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, 'Submitted', ?)`,
        [subId, cleanRoll, cleanName || 'Student', eid, JSON.stringify(answersObj), now]
      );

      return res.status(201).json({
        success: true,
        submissionId: subId,
        studentRoll: cleanRoll,
        studentName: cleanName,
        examId: eid,
        submittedAt: now.toISOString(),
        status: 'Submitted',
        serverConfirmed: true
      });
    }

    // Database is offline - notify caller that save is unconfirmed on server
    return res.status(202).json({
      success: true,
      submissionId: subId,
      studentRoll: cleanRoll,
      studentName: cleanName,
      examId: eid,
      submittedAt: now.toISOString(),
      status: 'Submitted (Local Draft Only)',
      serverConfirmed: false,
      warning: 'Database offline. Submission stored locally and will sync when server reconnects.'
    });
  } catch (err) {
    console.error('Error in /api/submissions:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to record examination submission.' });
  }
});

// Teacher: View All Submissions (Protected)
router.get('/submissions', requireTeacherAuth, async (req, res) => {
  try {
    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Cannot view submissions while database is offline.',
        isOffline: true
      });
    }

    const rows = await db.query(
      `SELECT submission_id AS submissionId, student_roll AS studentRoll, student_name AS studentName,
              exam_id AS examId, answers_json AS answersJson, status, submitted_at AS submittedAt
       FROM submissions
       ORDER BY submitted_at DESC`
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
        status: r.status,
        submittedAt: r.submittedAt,
        answers: answers
      };
    });

    return res.json(submissions);
  } catch (err) {
    console.error('Error in GET /api/submissions:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve submissions.' });
  }
});

// Teacher: View Single Submission Detail (Protected)
router.get('/submissions/:id', requireTeacherAuth, async (req, res) => {
  try {
    const subId = String(req.params.id || '').trim();

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Cannot view submission while database is offline.',
        isOffline: true
      });
    }

    const rows = await db.query(
      `SELECT submission_id AS submissionId, student_roll AS studentRoll, student_name AS studentName,
              exam_id AS examId, answers_json AS answersJson, status, submitted_at AS submittedAt
       FROM submissions
       WHERE submission_id = ?`,
      [subId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' });
    }

    const r = rows[0];
    let answers = {};
    try {
      answers = JSON.parse(r.answersJson);
    } catch (e) {}

    return res.json({
      submissionId: r.submissionId,
      studentId: r.studentRoll,
      studentName: r.studentName,
      examId: r.examId,
      status: r.status,
      submittedAt: r.submittedAt,
      answers: answers
    });
  } catch (err) {
    console.error('Error in GET /api/submissions/:id:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve submission detail.' });
  }
});

module.exports = router;
