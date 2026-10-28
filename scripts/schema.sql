-- AutoScribe Enterprise Database Schema
-- Production-ready MySQL DDL with constraints, indexes, and audit logging

-- 1. Teachers Table (Secure Examiner Accounts)
CREATE TABLE IF NOT EXISTS teachers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'teacher',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_teacher_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Students Table (Authorized Candidate Roster)
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    preferred_voice VARCHAR(20) NOT NULL DEFAULT 'male',
    is_authorized BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_student_roll (roll_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Exams Table (Examination Modules)
CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL DEFAULT '',
    duration_minutes INT NOT NULL DEFAULT 90,
    total_questions INT NOT NULL DEFAULT 7,
    structure VARCHAR(255) NOT NULL DEFAULT 'Part A: 5 Questions (2 Marks Each) | Part B: 2 Questions (10 Marks Each)',
    created_by INT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE SET NULL,
    INDEX idx_exam_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Questions Table (Question Bank)
CREATE TABLE IF NOT EXISTS questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id VARCHAR(50) NOT NULL,
    question_number INT NOT NULL,
    question_text TEXT NOT NULL,
    marks INT NOT NULL DEFAULT 2,
    section VARCHAR(100) NOT NULL DEFAULT 'Part A (2 Marks)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    UNIQUE KEY uk_exam_qnum (exam_id, question_number),
    INDEX idx_exam_questions (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Answers Autosave Table (Persistent Live Drafts)
CREATE TABLE IF NOT EXISTS answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_roll VARCHAR(50) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    question_id INT NOT NULL,
    answer_text LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_candidate_exam_q (student_roll, exam_id, question_id),
    INDEX idx_candidate_exam (student_roll, exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View alias for answers_autosave
CREATE OR REPLACE VIEW answers_autosave AS SELECT * FROM answers;

-- 6. Submissions Table (Immutable Final Locked Exam Papers)
CREATE TABLE IF NOT EXISTS submissions (
    submission_id VARCHAR(50) PRIMARY KEY,
    student_roll VARCHAR(50) NOT NULL,
    student_name VARCHAR(150) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    answers_json LONGTEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Submitted',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    server_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
    ip_address VARCHAR(45) NULL,
    UNIQUE KEY uk_submission_student_exam (student_roll, exam_id),
    INDEX idx_submission_roll (student_roll),
    INDEX idx_submission_exam (exam_id),
    INDEX idx_submission_date (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Audit Logs Table (Enterprise Security & Action Tracking)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_type VARCHAR(50) NOT NULL,         -- 'teacher', 'student', 'system'
    actor_id VARCHAR(150) NOT NULL,           -- Teacher email, Student roll, or system ID
    action VARCHAR(100) NOT NULL,             -- 'TEACHER_LOGIN', 'EXAM_CREATED', 'EXAM_SUBMITTED', etc.
    target_type VARCHAR(50) NULL,             -- 'exam', 'student', 'submission'
    target_id VARCHAR(150) NULL,
    details_json JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_action (action),
    INDEX idx_audit_actor (actor_type, actor_id),
    INDEX idx_audit_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
