/**
 * AutoScribe Database Connection Manager
 * Supports SQLite (default, zero-setup, embedded) and MySQL (production/external).
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DB_CLIENT = (process.env.DB_CLIENT || 'sqlite').toLowerCase();
let SQLITE_FILE = process.env.SQLITE_DB_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
  : path.join(__dirname, '..', 'autoscribe.db');

// If running in Vercel serverless environment, copy seed database to writable /tmp
if (process.env.VERCEL && !process.env.SQLITE_DB_PATH) {
  const tmpDbPath = '/tmp/autoscribe.db';
  if (!fs.existsSync(tmpDbPath)) {
    const bundledDbPath = path.join(__dirname, '..', 'autoscribe.db');
    if (fs.existsSync(bundledDbPath)) {
      try {
        fs.copyFileSync(bundledDbPath, tmpDbPath);
      } catch (_) {}
    }
  }
  SQLITE_FILE = tmpDbPath;
}

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  // sqlite3 module will be loaded if available
}

let mysql = null;
try {
  mysql = require('mysql2/promise');
} catch (e) {
  // mysql2 module will be loaded if available
}

let sqliteDb = null;
let mysqlPool = null;
let isConnected = false;
let lastError = null;
let currentClient = DB_CLIENT; // 'sqlite' or 'mysql'

const config = {
  client: currentClient,
  host: process.env.DB_HOST || 'localhost',
  port: currentClient === 'sqlite' ? 'sqlite' : (parseInt(process.env.DB_PORT, 10) || 3306),
  user: currentClient === 'sqlite' ? 'sqlite' : (process.env.DB_USER || 'root'),
  password: process.env.DB_PASSWORD || '',
  database: currentClient === 'sqlite' ? path.basename(SQLITE_FILE) : (process.env.DB_NAME || 'autoscribe_db'),
  filePath: SQLITE_FILE,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: '+00:00'
};

/**
 * 6 Default School Examination Subjects with 7 Questions Each
 */
const DEFAULT_SUBJECTS = [
  {
    id: "exam_math",
    title: "Mathematics",
    code: "MATH-101",
    durationMinutes: 90,
    totalQuestions: 7,
    structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
    questions: [
      { id: 1, text: "Solve for x: 3x + 7 = 22.", marks: 2, section: "Part A (2 Marks)" },
      { id: 2, text: "Find the discriminant and nature of roots for the quadratic equation x^2 - 5x + 6 = 0.", marks: 2, section: "Part A (2 Marks)" },
      { id: 3, text: "State the Pythagorean Theorem and write its mathematical formula.", marks: 2, section: "Part A (2 Marks)" },
      { id: 4, text: "Find the area of a circle with radius 7 cm.", marks: 2, section: "Part A (2 Marks)" },
      { id: 5, text: "Evaluate sin 30 degrees + cos 60 degrees.", marks: 2, section: "Part A (2 Marks)" },
      { id: 6, text: "Prove that square root of 2 is an irrational number. State the Fundamental Theorem of Arithmetic and find the HCF and LCM of 96 and 404 using prime factorization.", marks: 10, section: "Part B (10 Marks)" },
      { id: 7, text: "State and prove Thales Theorem (Basic Proportionality Theorem). In triangle ABC, DE is parallel to BC with AD = 3 cm, DB = 5 cm, and AE = 4.5 cm. Calculate EC.", marks: 10, section: "Part B (10 Marks)" }
    ]
  },
  {
    id: "exam_phys",
    title: "Physics",
    code: "PHYS-101",
    durationMinutes: 90,
    totalQuestions: 7,
    structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
    questions: [
      { id: 1, text: "State Newton's Second Law of Motion and write its mathematical equation F = ma.", marks: 2, section: "Part A (2 Marks)" },
      { id: 2, text: "Define Electric Current and state its SI unit.", marks: 2, section: "Part A (2 Marks)" },
      { id: 3, text: "State Ohm's Law and write the relationship between Voltage V, Current I, and Resistance R.", marks: 2, section: "Part A (2 Marks)" },
      { id: 4, text: "Describe the optical ray diagram for a Convex Lens and state its focal length sign convention.", marks: 2, section: "Part A (2 Marks)" },
      { id: 5, text: "Define Work done by a force and write its SI unit (Joule).", marks: 2, section: "Part A (2 Marks)" },
      { id: 6, text: "State and derive the Lens Formula 1/f = 1/v - 1/u. Draw neat ray diagrams showing image formation by a concave mirror when an object is placed between F and C.", marks: 10, section: "Part B (10 Marks)" },
      { id: 7, text: "State Ohm's Law. Derive expressions for equivalent resistance when three resistors R1, R2, and R3 are connected in (a) Series and (b) Parallel.", marks: 10, section: "Part B (10 Marks)" }
    ]
  },
  {
    id: "exam_chem",
    title: "Chemistry",
    code: "CHEM-101",
    durationMinutes: 90,
    totalQuestions: 7,
    structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
    questions: [
      { id: 1, text: "Define pH and write the equation pH = -log[H+].", marks: 2, section: "Part A (2 Marks)" },
      { id: 2, text: "Balance the chemical equation: Fe + H2O -> Fe3O4 + H2.", marks: 2, section: "Part A (2 Marks)" },
      { id: 3, text: "State Avogadro's Law and define one Mole of a substance.", marks: 2, section: "Part A (2 Marks)" },
      { id: 4, text: "Define Oxidation and Reduction in terms of electron transfer.", marks: 2, section: "Part A (2 Marks)" },
      { id: 5, text: "Write the molecular formula and structural formula of Ethanoic Acid (CH3COOH).", marks: 2, section: "Part A (2 Marks)" },
      { id: 6, text: "Explain the metallurgical extraction of Iron from Haematite ore using a Blast Furnace with chemical equations for reactions occurring in different temperature zones.", marks: 10, section: "Part B (10 Marks)" },
      { id: 7, text: "Discuss Covalent Bonding in Carbon compounds. Explain Tetravalency and Catenation. Describe the preparation, properties, and chemical reactions of Ethanol.", marks: 10, section: "Part B (10 Marks)" }
    ]
  },
  {
    id: "exam_cs",
    title: "Computer Science",
    code: "CS-101",
    durationMinutes: 90,
    totalQuestions: 7,
    structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
    questions: [
      { id: 1, text: "What is a Variable in programming and state two naming rules?", marks: 2, section: "Part A (2 Marks)" },
      { id: 2, text: "Differentiate between Compiler and Interpreter.", marks: 2, section: "Part A (2 Marks)" },
      { id: 3, text: "What is an Array and how is its zero-based index represented?", marks: 2, section: "Part A (2 Marks)" },
      { id: 4, text: "Define the term 'Algorithm' in problem solving.", marks: 2, section: "Part A (2 Marks)" },
      { id: 5, text: "What is the difference between == and = operators in programming?", marks: 2, section: "Part A (2 Marks)" },
      { id: 6, text: "Explain Object-Oriented Programming (OOP) principles: Encapsulation, Inheritance, Polymorphism, and Abstraction with clear code examples.", marks: 10, section: "Part B (10 Marks)" },
      { id: 7, text: "Describe linear search and binary search algorithms. Write code or pseudocode for Binary Search and analyze their time complexities O(n) and O(log n).", marks: 10, section: "Part B (10 Marks)" }
    ]
  },
  {
    id: "exam_bio",
    title: "Biology",
    code: "BIO-101",
    durationMinutes: 90,
    totalQuestions: 7,
    structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
    questions: [
      { id: 1, text: "Define Photosynthesis and write its overall chemical equation.", marks: 2, section: "Part A (2 Marks)" },
      { id: 2, text: "What is the role of Stomata in plant leaves during gas exchange?", marks: 2, section: "Part A (2 Marks)" },
      { id: 3, text: "Differentiate between Arteries and Veins in the human circulatory system.", marks: 2, section: "Part A (2 Marks)" },
      { id: 4, text: "Define Reflex Arc and give one daily life example.", marks: 2, section: "Part A (2 Marks)" },
      { id: 5, text: "What is DNA and where is it located inside a eukaryotic cell?", marks: 2, section: "Part A (2 Marks)" },
      { id: 6, text: "Describe the anatomical structure and working diagram of the Human Heart. Explain double circulation (Systemic and Pulmonary circulation) in detail.", marks: 10, section: "Part B (10 Marks)" },
      { id: 7, text: "Explain Human Digestive System organs and process. Trace the path of food from mouth to small intestine, stating digestive enzymes involved for carbohydrates, proteins, and fats.", marks: 10, section: "Part B (10 Marks)" }
    ]
  },
  {
    id: "exam_eng",
    title: "English",
    code: "ENG-101",
    durationMinutes: 90,
    totalQuestions: 7,
    structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
    questions: [
      { id: 1, text: "Define Active Voice and Passive Voice with an example sentence for each.", marks: 2, section: "Part A (2 Marks)" },
      { id: 2, text: "Correct the sentence: 'Neither of the two students are present today.'", marks: 2, section: "Part A (2 Marks)" },
      { id: 3, text: "What is a Simile? Give a suitable sentence example.", marks: 2, section: "Part A (2 Marks)" },
      { id: 4, text: "Define Precis writing and mention two key rules of summary writing.", marks: 2, section: "Part A (2 Marks)" },
      { id: 5, text: "Identify the noun and adjective in: 'The courageous firefighter saved the family.'", marks: 2, section: "Part A (2 Marks)" },
      { id: 6, text: "Write a formal essay (approx 250 words) on 'The Importance of Digital Literacy and AI in Modern School Education'.", marks: 10, section: "Part B (10 Marks)" },
      { id: 7, text: "Write a formal application letter to the School Principal requesting permission and audio-visual facilities to organize a Science & Assistive Technology Exhibition.", marks: 10, section: "Part B (10 Marks)" }
    ]
  }
];

const AUTHORIZED_STUDENTS = [
  { rollNumber: '25ISR023', name: 'Suresh Kumar', preferredVoice: 'male' },
  { rollNumber: '25ISR024', name: 'Swaathi B', preferredVoice: 'female' },
  { rollNumber: '25ISR025', name: 'Priya Sharma', preferredVoice: 'female' },
  { rollNumber: '23CS001', name: 'Ramesh P', preferredVoice: 'male' },
  { rollNumber: 'STD-1001', name: 'Alex Johnson', preferredVoice: 'male' }
];

/**
 * Translates MySQL-specific queries (such as ON DUPLICATE KEY UPDATE) into SQLite syntax.
 */
function translateMySqlToSqlite(sql) {
  let cleanSql = sql.trim();

  // Handle SHOW TABLES query
  if (/^SHOW\s+TABLES/i.test(cleanSql)) {
    return "SELECT name AS `Tables_in_database` FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'";
  }

  // Handle ON DUPLICATE KEY UPDATE
  if (/ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(cleanSql)) {
    const tableMatch = cleanSql.match(/INSERT\s+INTO\s+([`"\w]+)/i);
    const table = tableMatch ? tableMatch[1].replace(/[`"]/g, '').toLowerCase() : '';
    let target = '';
    if (table === 'answers') target = '(student_roll, exam_id, question_id)';
    else if (table === 'students') target = '(roll_number)';
    else if (table === 'teachers') target = '(email)';
    else if (table === 'exams') target = '(id)';
    else if (table === 'questions') target = '(exam_id, question_number)';
    else if (table === 'submissions') target = '(student_roll, exam_id)';

    cleanSql = cleanSql.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE/i, `ON CONFLICT${target ? ' ' + target : ''} DO UPDATE SET`);
    cleanSql = cleanSql.replace(/VALUES\s*\(\s*([`"\w]+)\s*\)/gi, 'excluded.$1');
  }

  return cleanSql;
}

/**
 * Initializes SQLite database tables and initial default data.
 */
async function initSqliteSchema() {
  if (!sqliteDb) return false;

  const runRaw = (sql) => new Promise((resolve, reject) => {
    sqliteDb.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  await runRaw('PRAGMA foreign_keys = ON;');
  await runRaw('PRAGMA journal_mode = WAL;');

  // 1. Teachers
  await runRaw(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'teacher',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Students
  await runRaw(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_number TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      preferred_voice TEXT NOT NULL DEFAULT 'male',
      is_authorized INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP DEFAULT NULL
    );
  `);

  // 3. Exams
  await runRaw(`
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
  `);

  // 4. Questions
  await runRaw(`
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
  `);

  // 5. Answers
  await runRaw(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_roll TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      answer_text TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_roll, exam_id, question_id)
    );
  `);

  // View alias for answers_autosave
  try {
    await runRaw('CREATE VIEW IF NOT EXISTS answers_autosave AS SELECT * FROM answers;');
  } catch (_) {}

  // 6. Submissions
  await runRaw(`
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
  `);

  // 7. Audit Logs
  await runRaw(`
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
  `);

  // Indexes
  await runRaw('CREATE INDEX IF NOT EXISTS idx_teacher_email ON teachers (email);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_student_roll ON students (roll_number);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_exam_active ON exams (is_active);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_exam_questions ON questions (exam_id);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_candidate_exam ON answers (student_roll, exam_id);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_submission_roll ON submissions (student_roll);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_submission_exam ON submissions (exam_id);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_submission_date ON submissions (submitted_at);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_type, actor_id);');
  await runRaw('CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs (created_at);');

  // Automatic initial data seeding if empty
  await seedSqliteDefaults();
  return true;
}

/**
 * Seeds initial teacher, authorized student candidates, and default subjects if not present.
 */
async function seedSqliteDefaults() {
  // 1. Initial Teacher
  const teacherRows = await query('SELECT COUNT(*) AS count FROM teachers');
  if (teacherRows && teacherRows[0] && teacherRows[0].count === 0) {
    const teacherEmail = (process.env.INITIAL_TEACHER_EMAIL || 'teacher@autoscribe.edu').trim().toLowerCase();
    const teacherPass = process.env.INITIAL_TEACHER_PASSWORD || 'Teacher@2026';
    const teacherName = process.env.INITIAL_TEACHER_NAME || 'Exam Coordinator';
    const passwordHash = await bcrypt.hash(teacherPass, 10);

    await query(
      'INSERT INTO teachers (name, email, password_hash, role) VALUES (?, ?, ?, "teacher")',
      [teacherName, teacherEmail, passwordHash]
    );
    console.log(`[AutoScribe DB] SQLite seeded default teacher: ${teacherEmail}`);
  }

  // 2. Authorized Student Roster
  const studentRows = await query('SELECT COUNT(*) AS count FROM students');
  if (studentRows && studentRows[0] && studentRows[0].count === 0) {
    for (const student of AUTHORIZED_STUDENTS) {
      await query(
        `INSERT INTO students (roll_number, name, preferred_voice, is_authorized)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(roll_number) DO UPDATE SET name = excluded.name, preferred_voice = excluded.preferred_voice, is_authorized = 1`,
        [student.rollNumber, student.name, student.preferredVoice]
      );
    }
    console.log(`[AutoScribe DB] SQLite seeded ${AUTHORIZED_STUDENTS.length} authorized candidates into roster.`);
  }

  // 3. Default School Examination Subjects
  const examRows = await query('SELECT COUNT(*) AS count FROM exams');
  if (examRows && examRows[0] && examRows[0].count === 0) {
    for (const sub of DEFAULT_SUBJECTS) {
      await query(
        `INSERT INTO exams (id, title, code, duration_minutes, total_questions, structure, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [sub.id, sub.title, sub.code, sub.durationMinutes, sub.totalQuestions, sub.structure]
      );

      for (const q of sub.questions) {
        await query(
          `INSERT INTO questions (exam_id, question_number, question_text, marks, section)
           VALUES (?, ?, ?, ?, ?)`,
          [sub.id, q.id, q.text, q.marks, q.section]
        );
      }
    }
    console.log(`[AutoScribe DB] SQLite seeded ${DEFAULT_SUBJECTS.length} standard exam subjects with question banks.`);
  }
}

let initSqlitePromise = null;

/**
 * Initializes SQLite database connection
 */
async function initSqlite() {
  if (sqliteDb && isConnected) return sqliteDb;
  if (initSqlitePromise) return initSqlitePromise;

  if (!sqlite3) {
    throw new Error('sqlite3 module is not installed');
  }

  initSqlitePromise = new Promise((resolve, reject) => {
    const dbDir = path.dirname(SQLITE_FILE);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbInstance = new sqlite3.Database(SQLITE_FILE, async (err) => {
      if (err) {
        isConnected = false;
        lastError = err;
        console.error(`[AutoScribe DB Error] Failed to open SQLite database at ${SQLITE_FILE}:`, err.message);
        return reject(err);
      }

      sqliteDb = dbInstance;
      isConnected = true;
      lastError = null;
      currentClient = 'sqlite';
      config.client = 'sqlite';
      config.database = path.basename(SQLITE_FILE);
      config.host = 'localhost';
      config.port = 'sqlite';

      try {
        await initSqliteSchema();
        console.log(`[AutoScribe DB] Connected to SQLite database: ${SQLITE_FILE}`);
        resolve(sqliteDb);
      } catch (schemaErr) {
        console.error('[AutoScribe DB Error] Failed to initialize SQLite schema:', schemaErr.message);
        reject(schemaErr);
      }
    });
  });

  try {
    return await initSqlitePromise;
  } catch (e) {
    initSqlitePromise = null;
    throw e;
  }
}

/**
 * Initializes MySQL pool (used when DB_CLIENT === 'mysql')
 */
async function initMysqlPool() {
  if (mysqlPool && isConnected) return mysqlPool;
  if (!mysql) throw new Error('mysql2 module is not installed');

  const mysqlConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'autoscribe_db',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    timezone: '+00:00'
  };

  try {
    try {
      const adminConn = await mysql.createConnection({
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        user: mysqlConfig.user,
        password: mysqlConfig.password
      });
      await adminConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${mysqlConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await adminConn.end();
    } catch (_) {}

    mysqlPool = mysql.createPool(mysqlConfig);
    const connection = await mysqlPool.getConnection();
    connection.release();

    isConnected = true;
    lastError = null;
    currentClient = 'mysql';
    config.client = 'mysql';
    config.database = mysqlConfig.database;
    config.host = mysqlConfig.host;
    config.port = mysqlConfig.port;
    console.log(`[AutoScribe DB] MySQL Pool connected: ${mysqlConfig.user}@${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
    return mysqlPool;
  } catch (err) {
    isConnected = false;
    lastError = err;
    console.warn(`[AutoScribe DB Error] MySQL connection failed (${mysqlConfig.host}:${mysqlConfig.port}): ${err.message}`);
    return null;
  }
}

/**
 * Initializes database pool or connection depending on DB_CLIENT configuration.
 * Defaults to SQLite. If MySQL is requested but unavailable, falls back to SQLite.
 */
async function initPool() {
  if (isConnected && (sqliteDb || mysqlPool)) {
    return currentClient === 'sqlite' ? sqliteDb : mysqlPool;
  }

  if (DB_CLIENT === 'mysql') {
    try {
      const pool = await initMysqlPool();
      if (pool) return pool;
      console.warn('[AutoScribe DB] MySQL unavailable. Falling back to SQLite database for continuous operation.');
    } catch (err) {
      console.warn('[AutoScribe DB] MySQL initialization failed. Falling back to SQLite database.');
    }
  }

  // Connect to SQLite
  try {
    return await initSqlite();
  } catch (err) {
    isConnected = false;
    lastError = err;
    return null;
  }
}

/**
 * Executes a parameterized SQL query on the active database (SQLite or MySQL).
 */
async function query(sql, params = []) {
  if (!isConnected || (!sqliteDb && !mysqlPool)) {
    await initPool();
  }

  if (!isConnected || (!sqliteDb && !mysqlPool)) {
    const err = new Error('Database connection is not available');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  if (currentClient === 'sqlite' && sqliteDb) {
    const sqliteSql = translateMySqlToSqlite(sql);
    const isSelect = /^(SELECT|PRAGMA|EXPLAIN)/i.test(sqliteSql.trim());

    return new Promise((resolve, reject) => {
      if (isSelect) {
        sqliteDb.all(sqliteSql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      } else {
        sqliteDb.run(sqliteSql, params, function(err) {
          if (err) {
            // Map SQLite UNIQUE constraint failure to MySQL ER_DUP_ENTRY for compatibility
            if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('SQLITE_CONSTRAINT'))) {
              err.code = 'ER_DUP_ENTRY';
            }
            return reject(err);
          }
          resolve({
            insertId: this.lastID,
            affectedRows: this.changes,
            lastID: this.lastID,
            changes: this.changes
          });
        });
      }
    });
  }

  // MySQL query execution
  const [results] = await mysqlPool.query(sql, params);
  return results;
}

/**
 * Executes callback inside an atomic ACID database transaction.
 */
async function transaction(callback) {
  if (!isConnected || (!sqliteDb && !mysqlPool)) {
    await initPool();
  }

  if (!isConnected || (!sqliteDb && !mysqlPool)) {
    const err = new Error('Database connection is not available');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  if (currentClient === 'sqlite' && sqliteDb) {
    await query('BEGIN IMMEDIATE TRANSACTION');
    try {
      const connWrapper = {
        query: (sql, params) => query(sql, params)
      };
      const result = await callback(connWrapper);
      await query('COMMIT');
      return result;
    } catch (err) {
      try {
        await query('ROLLBACK');
      } catch (_) {}
      throw err;
    }
  }

  // MySQL transaction
  const conn = await mysqlPool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Automatically initiate database on module load
initPool().catch((err) => {
  console.warn('[AutoScribe DB Notice] Background database auto-connect:', err.message);
});

module.exports = {
  config,
  initPool,
  initSqlite,
  query,
  transaction,
  getPool: () => (currentClient === 'sqlite' ? sqliteDb : mysqlPool),
  getSqliteDb: () => sqliteDb,
  isConnected: () => isConnected,
  isSqlite: () => currentClient === 'sqlite',
  getLastError: () => (lastError ? lastError.message : null),
  DEFAULT_SUBJECTS,
  AUTHORIZED_STUDENTS
};
