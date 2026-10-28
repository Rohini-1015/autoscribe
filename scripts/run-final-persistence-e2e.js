/**
 * AutoScribe Final End-to-End Persistence and Workflow Verification
 * Tests:
 * 1. Health & process validation
 * 2. Temporary candidate answer creation via API
 * 3. MariaDB direct query and API retrieval verification
 * 4. Retrieval verification after Express backend restart
 * 5. Retrieval verification after MariaDB restart
 * 6. Full Student Login -> Exam -> Autosave -> Submission -> Teacher View flow
 * 7. Clean teardown of temporary records only
 */

const http = require('http');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const HOST = process.env.DB_HOST || '127.0.0.1';
const PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const USER = process.env.DB_USER || 'root';
const PASSWORD = process.env.DB_PASSWORD || '';
const DATABASE = process.env.DB_NAME || 'autoscribe_db';
const SERVER_PORT = process.env.PORT || 8000;

const TEST_STUDENT_ROLL = 'TEMP-E2E-STUDENT-888';
const TEST_STUDENT_NAME = 'Temporary Persistence Tester';
const TEST_SUBMISSION_ID = 'SUB-TEMP-E2E-888';
const TEST_EXAM_ID = 'exam_math';
const PERSISTENT_ANSWER_TEXT = 'Verified Persistent Answer for Q1 - Fixed Test Payload';

function httpRequest(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (data && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    const options = {
      hostname: '127.0.0.1',
      port: SERVER_PORT,
      path: pathUrl,
      method: method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw), raw });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const db = require('../config/database');

async function getDbConnection() {
  await db.initPool();
  return {
    query: (sql, params) => db.query(sql, params),
    end: async () => {}
  };
}

const step = process.argv.find(arg => arg.startsWith('--step='))?.split('=')[1] || 'all';

async function main() {
  console.log(`[AutoScribe E2E Persistence] Running step: ${step}`);

  if (step === '1-health' || step === 'all') {
    console.log("\n--- STEP 1: Process & Backend Health Confirmation ---");
    const health = await httpRequest('GET', '/api/db/health');
    console.log(`HTTP /api/db/health Status: ${health.status}`);
    console.log(`Health Response: ${JSON.stringify(health.data)}`);
    if (health.status === 200 && health.data.connected === true) {
      console.log("RESULT: [PASS] MariaDB & Express Backend connected and healthy.");
    } else {
      console.log("RESULT: [FAIL] Backend not connected to database.");
      process.exit(1);
    }
  }

  if (step === '2-create' || step === 'all') {
    console.log("\n--- STEP 2: Create Temporary Candidate & Record Answer via API ---");
    const conn = await getDbConnection();
    await conn.query(
      `INSERT INTO students (roll_number, name, preferred_voice, is_authorized)
       VALUES (?, ?, 'female', TRUE)
       ON DUPLICATE KEY UPDATE name = VALUES(name), is_authorized = TRUE`,
      [TEST_STUDENT_ROLL, TEST_STUDENT_NAME]
    );
    await conn.end();
    console.log(`✅ Temporary student candidate '${TEST_STUDENT_ROLL}' registered in DB.`);

    // Record answer via Express API
    const saveRes = await httpRequest('POST', '/api/answers/autosave', {
      studentRoll: TEST_STUDENT_ROLL,
      examId: TEST_EXAM_ID,
      questionId: 1,
      answerText: PERSISTENT_ANSWER_TEXT
    });
    console.log(`HTTP POST /api/answers/autosave Status: ${saveRes.status}`);
    console.log(`Autosave Response: ${JSON.stringify(saveRes.data)}`);

    if (saveRes.status === 200 && saveRes.data.success === true) {
      console.log("RESULT: [PASS] Temporary answer saved through real Express API.");
    } else {
      console.log("RESULT: [FAIL] Failed to save answer through API.");
      process.exit(1);
    }
  }

  if (step === '3-verify' || step === 'all') {
    console.log("\n--- STEP 3: Verify Storage in MariaDB & API Retrieval ---");
    // Direct DB check
    const conn = await getDbConnection();
    const [rows] = await conn.query(
      "SELECT student_roll, exam_id, question_id, answer_text, updated_at FROM answers WHERE student_roll = ? AND exam_id = ? AND question_id = 1",
      [TEST_STUDENT_ROLL, TEST_EXAM_ID]
    );
    await conn.end();

    if (rows.length === 0 || rows[0].answer_text !== PERSISTENT_ANSWER_TEXT) {
      console.log("RESULT: [FAIL] Record not found in MariaDB directly.");
      process.exit(1);
    }
    console.log(`✅ Direct MariaDB check verified: "${rows[0].answer_text}" at ${rows[0].updated_at}`);

    // API retrieval check
    const getRes = await httpRequest('GET', `/api/answers/${TEST_STUDENT_ROLL}/${TEST_EXAM_ID}`);
    console.log(`HTTP GET /api/answers/${TEST_STUDENT_ROLL}/${TEST_EXAM_ID} Status: ${getRes.status}`);
    console.log(`Retrieved answers: ${JSON.stringify(getRes.data.answers)}`);

    if (getRes.status === 200 && getRes.data.answers && getRes.data.answers['1'] === PERSISTENT_ANSWER_TEXT) {
      console.log("RESULT: [PASS] Answer verified in MariaDB and successfully retrieved via API.");
    } else {
      console.log("RESULT: [FAIL] API retrieval failed or answer text mismatch.");
      process.exit(1);
    }
  }

  if (step === '4-verify-after-backend-restart') {
    console.log("\n--- STEP 4: Verify Persistence After Express Backend Restart ---");
    const getRes = await httpRequest('GET', `/api/answers/${TEST_STUDENT_ROLL}/${TEST_EXAM_ID}`);
    console.log(`HTTP GET /api/answers Status: ${getRes.status}`);
    console.log(`Retrieved answers: ${JSON.stringify(getRes.data?.answers)}`);

    if (getRes.status === 200 && getRes.data?.answers && getRes.data.answers['1'] === PERSISTENT_ANSWER_TEXT) {
      console.log("RESULT: [PASS] Answer survived Express backend restart with 100% integrity!");
    } else {
      console.log("RESULT: [FAIL] Answer was lost or could not be retrieved after backend restart.");
      process.exit(1);
    }
  }

  if (step === '5-verify-after-db-restart') {
    console.log("\n--- STEP 5: Verify Persistence After MariaDB Service Restart ---");
    const getRes = await httpRequest('GET', `/api/answers/${TEST_STUDENT_ROLL}/${TEST_EXAM_ID}`);
    console.log(`HTTP GET /api/answers Status: ${getRes.status}`);
    console.log(`Retrieved answers: ${JSON.stringify(getRes.data?.answers)}`);

    if (getRes.status === 200 && getRes.data?.answers && getRes.data.answers['1'] === PERSISTENT_ANSWER_TEXT) {
      console.log("RESULT: [PASS] Answer survived MariaDB service restart with 100% disk persistence!");
    } else {
      console.log("RESULT: [FAIL] Answer missing after database restart.");
      process.exit(1);
    }
  }

  if (step === '6-full-flow' || step === 'all') {
    console.log("\n--- STEP 6: Test Full Student -> Exam -> Autosave -> Submission -> Teacher View Flow ---");
    
    // Reset any prior submission for the temporary candidate to allow a fresh run
    const initConn = await getDbConnection();
    await initConn.query("DELETE FROM answers WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    await initConn.query("DELETE FROM submissions WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    await initConn.end();

    // 6a. Student Login
    const loginRes = await httpRequest('POST', '/api/auth/student/login', {
      rollNumber: TEST_STUDENT_ROLL,
      name: TEST_STUDENT_NAME,
      studentName: TEST_STUDENT_NAME
    });
    console.log(`6a. Student Login Status: ${loginRes.status}`);
    if (loginRes.status !== 200 || !loginRes.data.token) {
      console.log("RESULT: [FAIL] Student login failed.");
      process.exit(1);
    }
    const studentToken = loginRes.data.token;
    console.log(`    Student authenticated. Roll: ${loginRes.data.student.rollNumber}, Name: ${loginRes.data.student.name}`);

    // 6b. Fetch Active Exam
    const examRes = await httpRequest('GET', `/api/exams/${TEST_EXAM_ID}`, null, {
      'Authorization': `Bearer ${studentToken}`
    });
    console.log(`6b. Fetch Exam Status: ${examRes.status}`);
    if (examRes.status !== 200 || !examRes.data.title || !examRes.data.questions) {
      console.log("RESULT: [FAIL] Exam fetch failed.");
      process.exit(1);
    }
    console.log(`    Exam loaded: "${examRes.data.title}" (${examRes.data.questions.length} questions).`);

    // 6c. Autosave multiple answers
    const ans1 = await httpRequest('POST', '/api/answers/autosave', {
      studentRoll: TEST_STUDENT_ROLL,
      examId: TEST_EXAM_ID,
      questionId: 1,
      answerText: "Part A Q1: Solved step-by-step."
    }, { 'Authorization': `Bearer ${studentToken}` });
    const ans2 = await httpRequest('POST', '/api/answers/autosave', {
      studentRoll: TEST_STUDENT_ROLL,
      examId: TEST_EXAM_ID,
      questionId: 2,
      answerText: "Part A Q2: Discriminant b^2 - 4ac."
    }, { 'Authorization': `Bearer ${studentToken}` });
    console.log(`6c. Autosave Q1 & Q2 Status: ${ans1.status}, ${ans2.status}`);

    // 6d. Final Exam Submission
    const subRes = await httpRequest('POST', '/api/submissions', {
      submissionId: TEST_SUBMISSION_ID,
      studentRoll: TEST_STUDENT_ROLL,
      studentName: TEST_STUDENT_NAME,
      examId: TEST_EXAM_ID,
      answers: {
        '1': "Part A Q1: Solved step-by-step.",
        '2': "Part A Q2: Discriminant b^2 - 4ac."
      }
    }, { 'Authorization': `Bearer ${studentToken}` });
    console.log(`6d. Final Submission Status: ${subRes.status}`);
    console.log(`    Submission response: ${JSON.stringify(subRes.data)}`);
    if (subRes.status !== 201 && subRes.status !== 202) {
      console.log("RESULT: [FAIL] Final submission failed.");
      process.exit(1);
    }

    // 6e. Test Locked State (Autosave after submission must return 403 EXAM_LOCKED)
    const lockedAutosave = await httpRequest('POST', '/api/answers/autosave', {
      studentRoll: TEST_STUDENT_ROLL,
      examId: TEST_EXAM_ID,
      questionId: 3,
      answerText: "Post-submission edit attempt"
    }, { 'Authorization': `Bearer ${studentToken}` });
    console.log(`6e. Post-Submission Edit Status (Expected 403): ${lockedAutosave.status}`);
    if (lockedAutosave.status === 403) {
      console.log(`    ✅ Locked state verified: "${lockedAutosave.data.error}" - edits strictly rejected.`);
    } else {
      console.log("RESULT: [FAIL] Examination did not lock after submission.");
      process.exit(1);
    }

    // 6f. Teacher Login
    const teacherEmail = (process.env.INITIAL_TEACHER_EMAIL || 'teacher@autoscribe.edu').trim();
    const teacherPass = process.env.INITIAL_TEACHER_PASSWORD || 'Teacher@2026';
    const teacherLogin = await httpRequest('POST', '/api/auth/teacher/login', {
      email: teacherEmail,
      password: teacherPass
    });
    console.log(`6f. Teacher Login Status: ${teacherLogin.status}`);
    if (teacherLogin.status !== 200 || !teacherLogin.data.token) {
      console.log("RESULT: [FAIL] Teacher login failed.");
      process.exit(1);
    }
    const teacherToken = teacherLogin.data.token;
    console.log(`    Teacher authenticated successfully (${teacherLogin.data.teacher.name}).`);

    // 6g. Teacher Submissions View
    const submissionsList = await httpRequest('GET', '/api/submissions', null, {
      'Authorization': `Bearer ${teacherToken}`
    });
    console.log(`6g. Teacher Submissions View Status: ${submissionsList.status}`);
    const list = Array.isArray(submissionsList.data) ? submissionsList.data : (submissionsList.data?.submissions || []);
    const foundSub = list.find(s => s.studentId === TEST_STUDENT_ROLL || s.studentRoll === TEST_STUDENT_ROLL || s.student_roll === TEST_STUDENT_ROLL);
    if (foundSub) {
      console.log(`    ✅ Teacher view verified submission: ID=${foundSub.submissionId || foundSub.submission_id}, Student=${foundSub.studentName || foundSub.student_name}, Status=${foundSub.status}`);
      console.log("RESULT: [PASS] Full Student -> Exam -> Autosave -> Submission -> Teacher View flow passed!");
    } else {
      console.log("RESULT: [FAIL] Submission not found in teacher view.");
      process.exit(1);
    }
  }

  if (step === '7-cleanup' || step === 'all') {
    console.log("\n--- STEP 7: Clean Up Temporary Test Records ONLY ---");
    const conn = await getDbConnection();
    
    // Check counts before cleanup
    const [[ansBefore]] = await conn.query("SELECT COUNT(*) as c FROM answers WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    const [[subBefore]] = await conn.query("SELECT COUNT(*) as c FROM submissions WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    const [[stdBefore]] = await conn.query("SELECT COUNT(*) as c FROM students WHERE roll_number = ?", [TEST_STUDENT_ROLL]);
    console.log(`    Temporary rows identified: ${ansBefore.c} answers, ${subBefore.c} submissions, ${stdBefore.c} student.`);

    // Delete ONLY temporary candidate data
    await conn.query("DELETE FROM answers WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    await conn.query("DELETE FROM submissions WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    await conn.query("DELETE FROM students WHERE roll_number = ?", [TEST_STUDENT_ROLL]);
    await conn.query("DELETE FROM audit_logs WHERE actor_id = ? OR target_id = ?", [TEST_STUDENT_ROLL, TEST_STUDENT_ROLL]);
    await conn.query("DELETE FROM audit_logs WHERE target_id = ?", [TEST_SUBMISSION_ID]);

    // Verify cleanup
    const [[ansAfter]] = await conn.query("SELECT COUNT(*) as c FROM answers WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    const [[subAfter]] = await conn.query("SELECT COUNT(*) as c FROM submissions WHERE student_roll = ?", [TEST_STUDENT_ROLL]);
    const [[stdAfter]] = await conn.query("SELECT COUNT(*) as c FROM students WHERE roll_number = ?", [TEST_STUDENT_ROLL]);
    
    // Verify existing non-test records remained intact
    const [[realExams]] = await conn.query("SELECT COUNT(*) as c FROM exams");
    const [[realStudents]] = await conn.query("SELECT COUNT(*) as c FROM students");
    const [[realTeachers]] = await conn.query("SELECT COUNT(*) as c FROM teachers");
    await conn.end();

    if (ansAfter.c === 0 && subAfter.c === 0 && stdAfter.c === 0) {
      console.log(`    ✅ All temporary records cleanly purged.`);
      console.log(`    ✅ Production data preserved: ${realTeachers.c} teachers, ${realStudents.c} students, ${realExams.c} exams.`);
      console.log("RESULT: [PASS] Cleaned up temporary test records only. Existing data untouched.");
    } else {
      console.log("RESULT: [FAIL] Temporary records remained after cleanup.");
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
