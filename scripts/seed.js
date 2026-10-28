/**
 * AutoScribe Explicit Development & Production Seeding Script
 * Seeds initial teacher account, authorized student candidate roster,
 * and standard school examination question banks into MySQL.
 * 
 * Run with: node scripts/seed.js
 */

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const path = require('path');
const initSchema = require('./init-db');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_EXAMS = [
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

async function seed() {
  console.log("=== AUTOSCRIBE DATABASE SEEDING SCRIPT ===");

  const ok = await initSchema();
  if (!ok) {
    console.error("❌ Schema initialization failed. Cannot seed database.");
    return false;
  }

  const db = require('../config/database');
  await db.initPool();

  try {
    // 1. Seed Initial Teacher
    const teacherEmail = (process.env.INITIAL_TEACHER_EMAIL || 'teacher@autoscribe.edu').trim().toLowerCase();
    const teacherPass = process.env.INITIAL_TEACHER_PASSWORD || 'Teacher@2026';
    const teacherName = process.env.INITIAL_TEACHER_NAME || 'Chief Examiner';
    const passwordHash = await bcrypt.hash(teacherPass, 12);

    await db.query(
      `INSERT INTO teachers (name, email, password_hash, role)
       VALUES (?, ?, ?, 'teacher')
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
      [teacherName, teacherEmail, passwordHash]
    );
    console.log(`✅ Teacher Account Seeded: ${teacherEmail} (${teacherName})`);

    // 2. Seed Authorized Candidate Roster
    for (const student of AUTHORIZED_STUDENTS) {
      await db.query(
        `INSERT INTO students (roll_number, name, preferred_voice, is_authorized)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE name = VALUES(name), preferred_voice = VALUES(preferred_voice), is_authorized = TRUE`,
        [student.rollNumber, student.name, student.preferredVoice]
      );
    }
    console.log(`✅ Authorized Student Roster Seeded: ${AUTHORIZED_STUDENTS.length} candidates registered.`);

    // 3. Seed Standard Subject Examinations & Questions
    for (const exam of DEFAULT_EXAMS) {
      await db.query(
        `INSERT INTO exams (id, title, code, duration_minutes, total_questions, structure, is_active)
         VALUES (?, ?, ?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE title = VALUES(title), code = VALUES(code), duration_minutes = VALUES(duration_minutes), total_questions = VALUES(total_questions), structure = VALUES(structure)`,
        [exam.id, exam.title, exam.code, exam.durationMinutes, exam.totalQuestions, exam.structure]
      );

      for (const q of exam.questions) {
        await db.query(
          `INSERT INTO questions (exam_id, question_number, question_text, marks, section)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE question_text = VALUES(question_text), marks = VALUES(marks), section = VALUES(section)`,
          [exam.id, q.id, q.text, q.marks, q.section]
        );
      }
    }
    console.log(`✅ Examination Modules & Question Banks Seeded: ${DEFAULT_EXAMS.length} subjects.`);

    // 4. Log Audit Trail
    await db.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details_json)
       VALUES ('system', 'scripts/seed.js', 'DATABASE_SEEDED', 'system', 'all', ?)`,
      [JSON.stringify({ examsCount: DEFAULT_EXAMS.length, studentsCount: AUTHORIZED_STUDENTS.length })]
    );

    console.log("\n🎉 [AutoScribe DB] Database successfully seeded with authoritative live data!\n");
    return true;
  } catch (err) {
    console.error("❌ Seeding Error:", err.message);
    return false;
  }
}

if (require.main === module) {
  seed().then((success) => process.exit(success ? 0 : 1));
}

module.exports = { seed, DEFAULT_EXAMS, AUTHORIZED_STUDENTS };
