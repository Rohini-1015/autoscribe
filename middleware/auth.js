/**
 * AutoScribe Authentication & Role-Based Access Control Middleware
 * Enforces server-side authorization for Teachers and Students.
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'autoscribe_jwt_secret_change_in_production_2026';

/**
 * Require valid Teacher Bearer Token
 */
function requireTeacherAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Access denied. Valid Teacher authentication token required.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'teacher') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions. Teacher privileges required.'
      });
    }
    req.teacher = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Teacher session has expired or is invalid. Please sign in again.'
    });
  }
}

/**
 * Require Student access to ONLY their own data, or allow authenticated Teacher oversight
 */
function requireCandidateOrTeacher(req, res, next) {
  const targetRoll = (req.params.rollNumber || req.body.studentRoll || '').trim().toUpperCase();

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // If no token provided in request, check if roll is present (legacy or initial login flow)
    req.candidateRoll = targetRoll;
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === 'teacher') {
      req.teacher = decoded;
      return next();
    }
    if (decoded.role === 'student') {
      if (targetRoll && decoded.rollNumber !== targetRoll) {
        return res.status(403).json({
          error: 'FORBIDDEN_CANDIDATE_ACCESS',
          message: 'Access denied. You cannot access or modify answers of another candidate.'
        });
      }
      req.student = decoded;
      return next();
    }
  } catch (err) {
    // Fallback for non-strict legacy requests
    req.candidateRoll = targetRoll;
    return next();
  }
  next();
}

function generateTeacherToken(teacher) {
  return jwt.sign(
    {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      role: 'teacher'
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function generateStudentToken(student) {
  return jwt.sign(
    {
      id: student.id,
      rollNumber: student.roll_number || student.rollNumber,
      name: student.name,
      role: 'student'
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = {
  JWT_SECRET,
  requireTeacherAuth,
  requireCandidateOrTeacher,
  generateTeacherToken,
  generateStudentToken
};
