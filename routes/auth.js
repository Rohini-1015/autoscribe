/**
 * AutoScribe Authentication Router
 * Secure Teacher Authentication, Student Roster Identity Verification, and Token Issuance.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { requireTeacherAuth, generateTeacherToken, generateStudentToken } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

/**
 * POST /api/auth/teacher/login
 * Validates teacher email and password against MySQL with bcrypt
 */
router.post('/teacher/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const ip = req.ip || req.connection.remoteAddress;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Teacher email is required.' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password is required.' });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable. Please check MySQL server status.',
        isOffline: true
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const rows = await db.query(
      'SELECT id, name, email, password_hash, role FROM teachers WHERE email = ?',
      [cleanEmail]
    );

    if (!rows || rows.length === 0) {
      await logAction('teacher', cleanEmail, 'TEACHER_LOGIN_FAILED', 'teacher', cleanEmail, { reason: 'User not found' }, ip);
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid teacher email or password.' });
    }

    const teacher = rows[0];
    const isPasswordValid = await bcrypt.compare(password, teacher.password_hash);
    if (!isPasswordValid) {
      await logAction('teacher', cleanEmail, 'TEACHER_LOGIN_FAILED', 'teacher', cleanEmail, { reason: 'Invalid password' }, ip);
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid teacher email or password.' });
    }

    const token = generateTeacherToken(teacher);
    await logAction('teacher', cleanEmail, 'TEACHER_LOGIN_SUCCESS', 'teacher', teacher.id, { email: cleanEmail }, ip);

    return res.json({
      success: true,
      token,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role
      }
    });
  } catch (err) {
    console.error('Error in POST /api/auth/teacher/login:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process teacher login.' });
  }
});

/**
 * GET /api/auth/teacher/me
 * Protected endpoint returning current authenticated teacher
 */
router.get('/teacher/me', requireTeacherAuth, async (req, res) => {
  res.json({
    authenticated: true,
    teacher: req.teacher
  });
});

/**
 * POST /api/auth/student/login
 * Validates candidate against authorized student roster in MySQL
 */
router.post('/student/login', async (req, res) => {
  try {
    const { rollNumber, name, studentName, preferredVoice } = req.body || {};
    const ip = req.ip || req.connection.remoteAddress;

    const cleanRoll = String(rollNumber || '').trim().toUpperCase();
    const cleanName = String(name || studentName || '').trim();
    const voice = (preferredVoice && String(preferredVoice).toLowerCase() === 'female') ? 'female' : 'male';

    if (!cleanRoll) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Roll number is required.' });
    }
    if (!cleanName) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Student name is required.' });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        error: 'DATABASE_OFFLINE',
        message: 'Database is currently unreachable. Cannot verify student roster.',
        isOffline: true
      });
    }

    // 1. Query student from authorized roster in MySQL
    const rows = await db.query(
      'SELECT id, roll_number, name, preferred_voice, is_authorized FROM students WHERE roll_number = ?',
      [cleanRoll]
    );

    if (!rows || rows.length === 0) {
      await logAction('student', cleanRoll, 'STUDENT_LOGIN_REJECTED', 'student', cleanRoll, { reason: 'Not in roster' }, ip);
      return res.status(403).json({
        error: 'STUDENT_NOT_AUTHORIZED',
        message: `Candidate with roll number ${cleanRoll} is not enrolled in the authorized examination roster. Please contact your coordinator.`,
        rollNumber: cleanRoll
      });
    }

    const student = rows[0];
    if (!student.is_authorized) {
      await logAction('student', cleanRoll, 'STUDENT_LOGIN_REJECTED', 'student', cleanRoll, { reason: 'Account de-authorized' }, ip);
      return res.status(403).json({
        error: 'STUDENT_ACCESS_REVOKED',
        message: `Candidate access for roll number ${cleanRoll} has been revoked. Please contact your coordinator.`,
        rollNumber: cleanRoll
      });
    }

    // Update student name spelling preference and last login timestamp
    await db.query(
      'UPDATE students SET name = ?, preferred_voice = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [cleanName, voice, student.id]
    );

    const token = generateStudentToken({ ...student, name: cleanName, preferred_voice: voice });
    await logAction('student', cleanRoll, 'STUDENT_LOGIN_SUCCESS', 'student', student.id, { rollNumber: cleanRoll }, ip);

    return res.json({
      success: true,
      token,
      student: {
        id: student.id,
        rollNumber: cleanRoll,
        name: cleanName,
        preferredVoice: voice
      }
    });
  } catch (err) {
    console.error('Error in POST /api/auth/student/login:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to verify candidate login.' });
  }
});

/**
 * POST /api/auth/teacher/students
 * Teacher adds an authorized student to the candidate roster
 */
router.post('/teacher/students', requireTeacherAuth, async (req, res) => {
  try {
    const { rollNumber, name, preferredVoice } = req.body || {};
    const cleanRoll = String(rollNumber || '').trim().toUpperCase();
    const cleanName = String(name || '').trim();
    const voice = (preferredVoice && String(preferredVoice).toLowerCase() === 'female') ? 'female' : 'male';

    if (!cleanRoll || !cleanName) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Both roll number and student name are required.' });
    }

    await db.query(
      `INSERT INTO students (roll_number, name, preferred_voice, is_authorized)
       VALUES (?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE name = VALUES(name), preferred_voice = VALUES(preferred_voice), is_authorized = TRUE`,
      [cleanRoll, cleanName, voice]
    );

    await logAction('teacher', req.teacher.email, 'STUDENT_ROSTER_ADDED', 'student', cleanRoll, { name: cleanName });

    return res.status(201).json({
      success: true,
      message: `Candidate ${cleanName} (${cleanRoll}) enrolled in examination roster.`
    });
  } catch (err) {
    console.error('Error in POST /api/auth/teacher/students:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to register student on roster.' });
  }
});

/**
 * GET /api/auth/teacher/students
 * Teacher retrieves candidate roster
 */
router.get('/teacher/students', requireTeacherAuth, async (req, res) => {
  try {
    const students = await db.query(
      'SELECT id, roll_number AS rollNumber, name, preferred_voice AS preferredVoice, is_authorized AS isAuthorized, last_login AS lastLogin, created_at AS createdAt FROM students ORDER BY roll_number ASC'
    );
    return res.json(students);
  } catch (err) {
    console.error('Error in GET /api/auth/teacher/students:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch candidate roster.' });
  }
});

module.exports = router;
