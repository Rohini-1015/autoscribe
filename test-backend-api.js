/**
 * AutoScribe Backend REST API Integration Test Suite
 * Validates Teacher Auth, Student Login, Exam Retrieval, Autosave, and Submissions endpoints.
 */

const http = require('http');
const app = require('./server');

let server;
const PORT = 8001; // Test server port
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
  console.log("=== AUTOSCRIBE BACKEND API VERIFICATION SUITE ===\n");

  server = app.listen(PORT);

  try {
    // 1. Health Endpoint
    const healthRes = await request('GET', '/api/db/health');
    assert(healthRes.status === 200, "GET /api/db/health returns 200 OK");
    assert('connected' in healthRes.body, "Health response includes 'connected' status flag");

    // 2. Student Authentication
    const studentEmpty = await request('POST', '/api/auth/student/login', {});
    assert(studentEmpty.status === 400, "POST /api/auth/student/login rejects missing roll number with 400");

    const studentLogin = await request('POST', '/api/auth/student/login', {
      rollNumber: '25ISR023',
      name: 'Suresh Kumar',
      preferredVoice: 'male'
    });
    assert(studentLogin.status === 200, "POST /api/auth/student/login succeeds with 200 OK");
    assert(studentLogin.body.student.rollNumber === '25ISR023', "Student response preserves roll number string '25ISR023'");
    assert(studentLogin.body.student.name === 'Suresh Kumar', "Student response returns correct student name");

    // 3. Exam Listing & Question Retrieval
    const examsRes = await request('GET', '/api/exams');
    assert(examsRes.status === 200, "GET /api/exams returns 200 OK");
    assert(Array.isArray(examsRes.body) && examsRes.body.length >= 6, "GET /api/exams returns at least 6 standard subjects");
    const mathExam = examsRes.body.find(e => e.id === 'exam_math' || e.title.includes('Math'));
    assert(!!mathExam, "Mathematics exam exists in exams list");

    const singleExamRes = await request('GET', '/api/exams/exam_math');
    assert(singleExamRes.status === 200, "GET /api/exams/exam_math returns 200 OK");
    assert(singleExamRes.body.id === 'exam_math', "Exam detail returns Mathematics subject");
    assert(Array.isArray(singleExamRes.body.questions) && singleExamRes.body.questions.length === 7, "Mathematics subject has 7 questions (5 two-mark + 2 ten-mark)");

    // 4. Autosave Endpoint
    const autosaveBad = await request('POST', '/api/answers/autosave', { studentRoll: '' });
    assert(autosaveBad.status === 400, "POST /api/answers/autosave rejects missing student roll with 400");

    const autosaveGood = await request('POST', '/api/answers/autosave', {
      studentRoll: '25ISR023',
      examId: 'exam_math',
      questionId: 1,
      answerText: '3x + 7 = 22 => 3x = 15 => x = 5'
    });
    assert(autosaveGood.status === 200, "POST /api/answers/autosave saves question answer with 200 OK");
    assert(autosaveGood.body.success === true, "Autosave response returns success: true");

    const getAnswersRes = await request('GET', '/api/answers/25ISR023/exam_math');
    assert(getAnswersRes.status === 200, "GET /api/answers/:rollNumber/:examId returns 200 OK");

    // 5. Final Submissions Endpoint
    const subBad = await request('POST', '/api/submissions', {});
    assert(subBad.status === 400, "POST /api/submissions rejects empty payload with 400");

    const subGood = await request('POST', '/api/submissions', {
      submissionId: 'SUB-TEST-12345',
      studentRoll: '25ISR023',
      studentName: 'Suresh Kumar',
      examId: 'exam_math',
      answers: { 1: 'x = 5' }
    });
    assert(subGood.status === 201 || subGood.status === 202, "POST /api/submissions records submission with 201/202 status");
    assert(subGood.body.submissionId === 'SUB-TEST-12345', "Submission response returns correct submission ID");

    // 6. Teacher Authentication & Protected Admin Endpoints
    const teacherMissing = await request('POST', '/api/auth/teacher/login', {});
    assert(teacherMissing.status === 400, "POST /api/auth/teacher/login rejects empty body with 400");

    const teacherBadCreds = await request('POST', '/api/auth/teacher/login', {
      email: 'invalid@teacher.com',
      password: 'wrongpassword'
    });
    assert(teacherBadCreds.status === 401 || teacherBadCreds.status === 503, "POST /api/auth/teacher/login rejects invalid credentials");

    // Test protected route rejection without token
    const unauthSubmissions = await request('GET', '/api/submissions');
    assert(unauthSubmissions.status === 401, "GET /api/submissions strictly rejects unauthenticated access with 401");

    const unauthCreateExam = await request('POST', '/api/exams', { title: 'Test Exam' });
    assert(unauthCreateExam.status === 401, "POST /api/exams strictly rejects unauthenticated access with 401");

    const unauthMe = await request('GET', '/api/auth/teacher/me');
    assert(unauthMe.status === 401, "GET /api/auth/teacher/me strictly rejects missing bearer token with 401");

    // Test with invalid token
    const invalidTokenRes = await request('GET', '/api/auth/teacher/me', null, {
      Authorization: 'Bearer invalid.fake.token'
    });
    assert(invalidTokenRes.status === 401, "GET /api/auth/teacher/me rejects fake bearer token with 401");

    console.log("\n=== BACKEND API TEST SUMMARY ===");
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
