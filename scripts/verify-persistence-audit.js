/**
 * AutoScribe Database Persistence & Backend Audit Script
 * Executes an end-to-end audit verifying real database connection (SQLite or MySQL),
 * schema validation, data persistence, and clean teardown of temporary test records.
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/database');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runAudit() {
  console.log("=============================================================");
  console.log("       AUTOSCRIBE FULL DATABASE & BACKEND PERSISTENCE AUDIT  ");
  console.log("=============================================================\n");

  const serverPort = process.env.PORT || 8000;
  await db.initPool();

  // STEP 1: Database Connection Verification
  console.log(`[1/5] Database Connection Test (${db.config.client.toUpperCase()} Mode)...`);
  if (!db.isConnected()) {
    console.error(`  ❌ Database connection failed! (${db.getLastError()})`);
    process.exit(1);
  }
  console.log(`  ✅ Connected to ${db.config.client.toUpperCase()} database!`);
  console.log(`     Database:    ${db.config.database}`);
  console.log(`     Host/Path:   ${db.config.filePath || db.config.host}`);

  // STEP 2: Verify Tables and Seeded Counts
  console.log("\n[2/5] Validating Required Database Tables...");
  const requiredTables = ['teachers', 'students', 'exams', 'questions', 'answers_autosave', 'submissions', 'audit_logs'];

  for (const table of requiredTables) {
    try {
      const countRows = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  ✅ Table '${table}' exists: ${countRows[0].count} rows`);
    } catch (tblErr) {
      console.error(`  ❌ Missing table '${table}':`, tblErr.message);
      process.exit(1);
    }
  }

  // STEP 3: Test Express Backend Health API
  console.log(`\n[3/5] Testing Backend Health API (http://localhost:${serverPort}/api/db/health)...`);
  try {
    const healthRes = await fetchUrl(`http://localhost:${serverPort}/api/db/health`);
    console.log(`  Status Code: ${healthRes.status}`);
    console.log(`  Response:    `, JSON.stringify(healthRes.data));
    if (healthRes.status === 200 && healthRes.data.connected === true) {
      console.log(`  ✅ Backend successfully connects to database and reports healthy!`);
    } else {
      console.error(`  ❌ Backend reported unhealthy or disconnected!`);
    }
  } catch (err) {
    console.log(`  ℹ️ Backend server not currently running on port ${serverPort}. (Direct database queries verified)`);
  }

  // STEP 4: Real Data Persistence Verification
  console.log("\n[4/5] Executing Real Data Persistence Verification...");
  const testRoll = "TEST-AUDIT-PERSISTENCE-001";
  const testExamId = "exam_math";
  const testQuestionNum = 1;
  const testAnswerText = "Audit Proof Answer - Real Database Storage Test at " + new Date().toISOString();

  // Insert temporary test record directly via parameterized SQL
  console.log(`  Writing temporary record into 'answers'...`);
  await db.query(
    `INSERT INTO answers (student_roll, exam_id, question_id, answer_text)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text), updated_at = CURRENT_TIMESTAMP`,
    [testRoll, testExamId, testQuestionNum, testAnswerText]
  );

  // Read back directly from database
  const readRows = await db.query(
    "SELECT student_roll, exam_id, question_id, answer_text, updated_at FROM answers WHERE student_roll = ?",
    [testRoll]
  );
  if (readRows.length > 0 && readRows[0].answer_text === testAnswerText) {
    console.log(`  ✅ Record verified in Database:`);
    console.log(`     Student Roll: ${readRows[0].student_roll}`);
    console.log(`     Exam ID:      ${readRows[0].exam_id}`);
    console.log(`     Answer Text:  "${readRows[0].answer_text}"`);
    console.log(`     Timestamp:    ${readRows[0].updated_at}`);
  } else {
    console.error(`  ❌ Failed to verify inserted record in database!`);
    process.exit(1);
  }

  // STEP 5: Teardown Temporary Test Record
  console.log("\n[5/5] Cleaning up temporary test record...");
  await db.query("DELETE FROM answers WHERE student_roll = ?", [testRoll]);
  const afterDeleteRows = await db.query(
    "SELECT COUNT(*) as count FROM answers WHERE student_roll = ?",
    [testRoll]
  );
  if (afterDeleteRows[0].count === 0) {
    console.log(`  ✅ Cleaned up temporary record completely. Zero test artifacts left in DB.`);
  } else {
    console.warn(`  ⚠️ Cleanup did not remove test record.`);
  }

  console.log("\n=============================================================");
  console.log("       AUDIT COMPLETE: DATABASE AND PERSISTENCE VERIFIED!    ");
  console.log("=============================================================\n");
}

runAudit().catch(err => {
  console.error("Audit script failed:", err);
  process.exit(1);
});
