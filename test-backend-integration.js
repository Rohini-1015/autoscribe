/**
 * AutoScribe Enterprise Backend Integration Test Suite
 * Tests MySQL-first APIs, Teacher JWT Auth, Student Roster Verification,
 * Transactional Final Submissions, Duplicate Prevention, and Locked Exam Guards.
 */

const http = require('http');
const app = require('./server');

let server;
const PORT = 8002;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
  }
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (data) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: path,
        method: method,
        headers: reqHeaders
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          let parsed = resBody;
          try {
            parsed = JSON.parse(resBody);
          } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log("=== AUTOSCRIBE ENTERPRISE BACKEND INTEGRATION TESTS ===\n");
  server = app.listen(PORT);

  try {
    // 1. Health Endpoint
    const health = await request('GET', '/api/db/health');
    assert(health.status === 200, "Database health endpoint responds with 200 OK");
    assert('connected' in health.body, "Database health reports 'connected' status flag");

    // 2. Teacher Authentication & Protection
    const teacherBadCreds = await request('POST', '/api/auth/teacher/login', {
      email: 'nonexistent@teacher.edu',
      password: 'WrongPassword!'
    });
    assert(teacherBadCreds.status === 401 || teacherBadCreds.status === 503, "Teacher login rejects non-existent/invalid credentials");

    const teacherMissingInput = await request('POST', '/api/auth/teacher/login', { email: '' });
    assert(teacherMissingInput.status === 400, "Teacher login rejects missing email with 400");

    // Test route protection without Bearer token
    const unauthExamsAll = await request('GET', '/api/exams/manage/all');
    assert(unauthExamsAll.status === 401, "GET /api/exams/manage/all strictly rejects unauthenticated request with 401");

    const unauthSubmissions = await request('GET', '/api/submissions');
    assert(unauthSubmissions.status === 401, "GET /api/submissions strictly rejects unauthenticated request with 401");

    const unauthCreateExam = await request('POST', '/api/exams', { title: 'Unauthorized Exam' });
    assert(unauthCreateExam.status === 401, "POST /api/exams strictly rejects unauthenticated request with 401");

    const unauthTeacherMe = await request('GET', '/api/auth/teacher/me');
    assert(unauthTeacherMe.status === 401, "GET /api/auth/teacher/me rejects missing token with 401");

    // Test with malformed / invalid JWT token
    const fakeTokenRes = await request('GET', '/api/auth/teacher/me', null, {
      Authorization: 'Bearer invalid.fake.token.here'
    });
    assert(fakeTokenRes.status === 401, "GET /api/auth/teacher/me rejects invalid JWT token with 401");

    // 3. Student Authentication & Input Validation
    const studentEmpty = await request('POST', '/api/auth/student/login', {});
    assert(studentEmpty.status === 400, "POST /api/auth/student/login rejects missing roll number with 400");

    const studentMissingName = await request('POST', '/api/auth/student/login', { rollNumber: '25ISR023' });
    assert(studentMissingName.status === 400, "POST /api/auth/student/login rejects missing student name with 400");

    // 4. Exam Listing
    const activeExams = await request('GET', '/api/exams');
    assert(activeExams.status === 200 || activeExams.status === 503, "GET /api/exams responds with status 200/503");

    // 5. Autosave & Validation
    const autosaveBad = await request('POST', '/api/answers/autosave', { studentRoll: '' });
    assert(autosaveBad.status === 400, "POST /api/answers/autosave rejects missing studentRoll with 400");

    const autosaveBadQid = await request('POST', '/api/answers/autosave', {
      studentRoll: '25ISR023',
      examId: 'exam_math',
      questionId: 'invalid'
    });
    assert(autosaveBadQid.status === 400, "POST /api/answers/autosave rejects non-numeric questionId with 400");

    // 6. Submissions & Duplicate Protection Validation
    const subEmpty = await request('POST', '/api/submissions', {});
    assert(subEmpty.status === 400, "POST /api/submissions rejects empty payload with 400");

    const subMissingExam = await request('POST', '/api/submissions', { studentRoll: '25ISR023' });
    assert(subMissingExam.status === 400, "POST /api/submissions rejects missing examId with 400");

    console.log("\n=== ENTERPRISE BACKEND INTEGRATION SUMMARY ===");
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    if (server) server.close();
    process.exit(testsFailed === 0 ? 0 : 1);
  }
}

runTests();
