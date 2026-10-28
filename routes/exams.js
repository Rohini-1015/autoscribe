/**
 * AutoScribe Examination Management Router
 * Handles Exam Listing, Question Bank Retrieval, and Teacher Exam CRUD with ACID Transactions.
 */

const express = require('express');
const db = require('../config/database');
const { requireTeacherAuth } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/exams
 * Student & Public: Fetch all currently active examinations from MySQL
 */
router.get('/', async (req, res) => {
  try {
    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable. Cannot load examination list.',
        isOffline: true
      });
    }

    const rows = await db.query(
      `SELECT e.id, e.title, e.code, e.duration_minutes AS durationMinutes,
              e.total_questions AS totalQuestions, e.structure, e.is_active AS isActive,
              COUNT(q.id) AS questionCount
       FROM exams e
       LEFT JOIN questions q ON e.id = q.exam_id
       WHERE e.is_active = TRUE
       GROUP BY e.id, e.title, e.code, e.duration_minutes, e.total_questions, e.structure, e.is_active
       ORDER BY e.title ASC`
    );

    return res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/exams:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve active exams.' });
  }
});

/**
 * GET /api/exams/manage/all
 * Teacher: Fetch all exams (including inactive drafts) with statistics
 */
router.get('/manage/all', requireTeacherAuth, async (req, res) => {
  try {
    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable.',
        isOffline: true
      });
    }

    const rows = await db.query(
      `SELECT e.id, e.title, e.code, e.duration_minutes AS durationMinutes,
              e.total_questions AS totalQuestions, e.structure, e.is_active AS isActive,
              e.created_at AS createdAt,
              COUNT(DISTINCT q.id) AS questionCount,
              COUNT(DISTINCT s.submission_id) AS submissionCount
       FROM exams e
       LEFT JOIN questions q ON e.id = q.exam_id
       LEFT JOIN submissions s ON e.id = s.exam_id
       GROUP BY e.id, e.title, e.code, e.duration_minutes, e.total_questions, e.structure, e.is_active, e.created_at
       ORDER BY e.created_at DESC`
    );

    return res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/exams/manage/all:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve exam management list.' });
  }
});

/**
 * GET /api/exams/:id
 * Retrieve exam details and all associated questions from MySQL
 */
router.get('/:id', async (req, res) => {
  try {
    const examId = String(req.params.id || '').trim();

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable. Cannot load exam.',
        isOffline: true
      });
    }

    const exams = await db.query(
      `SELECT id, title, code, duration_minutes AS durationMinutes, total_questions AS totalQuestions, structure, is_active AS isActive
       FROM exams
       WHERE id = ?`,
      [examId]
    );

    if (!exams || exams.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `Exam '${examId}' not found.` });
    }

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
  } catch (err) {
    console.error('Error in GET /api/exams/:id:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve exam details.' });
  }
});

/**
 * POST /api/exams
 * Teacher: Create and publish a new examination with question bank (ACID Transaction)
 */
router.post('/', requireTeacherAuth, async (req, res) => {
  try {
    const { title, code, durationMinutes, questions, structure } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Exam title is required.' });
    }

    const duration = parseInt(durationMinutes, 10) || 90;
    const examCode = String(code || '').trim();
    const examId = 'exam_' + Date.now();
    const qList = Array.isArray(questions) && questions.length > 0 ? questions : [
      { id: 1, text: 'Question 1', marks: 10, section: 'Part A' }
    ];

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Cannot create exam while database is offline.',
        isOffline: true
      });
    }

    const examStructure = structure || `Total Questions: ${qList.length}`;

    // Execute atomic creation inside a MySQL transaction
    await db.transaction(async (conn) => {
      await conn.query(
        `INSERT INTO exams (id, title, code, duration_minutes, total_questions, structure, created_by, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [examId, title.trim(), examCode, duration, qList.length, examStructure, req.teacher.id]
      );

      for (let i = 0; i < qList.length; i++) {
        const q = qList[i];
        await conn.query(
          `INSERT INTO questions (exam_id, question_number, question_text, marks, section)
           VALUES (?, ?, ?, ?, ?)`,
          [examId, q.id || (i + 1), q.text || `Question ${i + 1}`, q.marks || 2, q.section || 'Part A (2 Marks)']
        );
      }
    });

    await logAction('teacher', req.teacher.email, 'EXAM_CREATED', 'exam', examId, {
      title: title.trim(),
      totalQuestions: qList.length
    });

    return res.status(201).json({
      success: true,
      message: 'Examination created and questions committed to database.',
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
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to commit new examination.' });
  }
});

/**
 * PATCH /api/exams/:id/status
 * Teacher: Toggle exam active / inactive status
 */
router.patch('/:id/status', requireTeacherAuth, async (req, res) => {
  try {
    const examId = String(req.params.id || '').trim();
    const { isActive } = req.body || {};

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'isActive boolean flag is required.' });
    }

    const result = await db.query(
      'UPDATE exams SET is_active = ? WHERE id = ?',
      [isActive, examId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `Exam '${examId}' not found.` });
    }

    await logAction('teacher', req.teacher.email, 'EXAM_STATUS_TOGGLED', 'exam', examId, { isActive });
    return res.json({ success: true, examId, isActive });
  } catch (err) {
    console.error('Error in PATCH /api/exams/:id/status:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update exam status.' });
  }
});

/**
 * DELETE /api/exams/:id
 * Teacher: Safely delete or deactivate an exam
 */
router.delete('/:id', requireTeacherAuth, async (req, res) => {
  try {
    const examId = String(req.params.id || '').trim();

    // Check if exam has submissions
    const [subCount] = await db.query(
      'SELECT COUNT(*) AS count FROM submissions WHERE exam_id = ?',
      [examId]
    );

    if (subCount && subCount[0] && subCount[0].count > 0) {
      // Cannot hard delete an exam with student submissions; deactivate instead
      await db.query('UPDATE exams SET is_active = FALSE WHERE id = ?', [examId]);
      await logAction('teacher', req.teacher.email, 'EXAM_DEACTIVATED_PRESERVED_SUBMISSIONS', 'exam', examId);
      return res.json({
        success: true,
        message: 'Exam contains student submissions and was archived/deactivated to preserve grading records.',
        archived: true
      });
    }

    await db.query('DELETE FROM exams WHERE id = ?', [examId]);
    await logAction('teacher', req.teacher.email, 'EXAM_DELETED', 'exam', examId);
    return res.json({ success: true, message: `Exam '${examId}' deleted successfully.` });
  } catch (err) {
    console.error('Error in DELETE /api/exams/:id:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete exam.' });
  }
});

module.exports = router;
