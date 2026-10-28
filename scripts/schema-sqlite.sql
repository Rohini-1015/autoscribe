-- AutoScribe SQLite Database Schema
-- Production DDL with constraints, indexes, and views

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 1. Teachers Table (Secure Examiner Accounts)
CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Students Table (Authorized Candidate Roster)
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    preferred_voice TEXT NOT NULL DEFAULT 'male',
    is_authorized INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL DEFAULT NULL
);

-- 3. Exams Table (Examination Modules)
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 90,
    total_questions INTEGER NOT NULL DEFAULT 7,
    structure TEXT NOT NULL DEFAULT 'Part A: 5 Questions (2 Marks Each) | Part B: 2 Questions (10 Marks Each)',
    created_by INTEGER NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE SET NULL
);

-- 4. Questions Table (Question Bank)
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id TEXT NOT NULL,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    marks INTEGER NOT NULL DEFAULT 2,
    section TEXT NOT NULL DEFAULT 'Part A (2 Marks)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    UNIQUE (exam_id, question_number)
);

-- 5. Answers Autosave Table (Persistent Live Drafts)
CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_roll TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    answer_text TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_roll, exam_id, question_id)
);

-- View alias for answers_autosave
CREATE VIEW IF NOT EXISTS answers_autosave AS SELECT * FROM answers;

-- 6. Submissions Table (Immutable Final Locked Exam Papers)
CREATE TABLE IF NOT EXISTS submissions (
    submission_id TEXT PRIMARY KEY,
    student_roll TEXT NOT NULL,
    student_name TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Submitted',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    server_confirmed INTEGER NOT NULL DEFAULT 1,
    ip_address TEXT NULL,
    UNIQUE (student_roll, exam_id)
);

-- 7. Audit Logs Table (Enterprise Security & Action Tracking)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NULL,
    target_id TEXT NULL,
    details_json TEXT NULL,
    ip_address TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_teacher_email ON teachers (email);
CREATE INDEX IF NOT EXISTS idx_student_roll ON students (roll_number);
CREATE INDEX IF NOT EXISTS idx_exam_active ON exams (is_active);
CREATE INDEX IF NOT EXISTS idx_exam_questions ON questions (exam_id);
CREATE INDEX IF NOT EXISTS idx_candidate_exam ON answers (student_roll, exam_id);
CREATE INDEX IF NOT EXISTS idx_submission_roll ON submissions (student_roll);
CREATE INDEX IF NOT EXISTS idx_submission_exam ON submissions (exam_id);
CREATE INDEX IF NOT EXISTS idx_submission_date ON submissions (submitted_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs (created_at);
