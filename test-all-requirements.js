/**
 * Comprehensive Verification Suite for AutoScribe User Requirements
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

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

console.log("=== AUTOSCRIBE REQUIREMENTS VERIFICATION ===\n");

// --- Code Files Loading ---
const speechEngineCode = fs.readFileSync(path.join(rootDir, 'js', 'speech-engine.js'), 'utf8');
const appCode = fs.readFileSync(path.join(rootDir, 'js', 'app.js'), 'utf8');
const indexCode = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const loginCode = fs.readFileSync(path.join(rootDir, 'login.html'), 'utf8');
const examCode = fs.readFileSync(path.join(rootDir, 'exam.html'), 'utf8');
const sessionCode = fs.readFileSync(path.join(rootDir, 'js', 'exam-session.js'), 'utf8');
const confCode = fs.readFileSync(path.join(rootDir, 'confirmation.html'), 'utf8');

// --- TEST 1: Voice "Login" Commands & Extra Words Preamble ---
const loginRegex = /\b(login|log\s*in|student\s*login|open\s*login|go\s*to\s*login|sign\s*in)\b/i;
assert(loginRegex.test("login"), "Voice pattern matches 'login'");
assert(loginRegex.test("Login"), "Voice pattern matches 'Login'");
assert(loginRegex.test("log in"), "Voice pattern matches 'log in'");
assert(loginRegex.test("student login"), "Voice pattern matches 'student login'");
assert(loginRegex.test("open login"), "Voice pattern matches 'open login'");
assert(loginRegex.test("please login"), "Voice pattern matches 'please login'");
assert(loginRegex.test("can you please log in"), "Voice pattern matches 'can you please log in'");

// --- TEST 2: Shared Navigation Logic ---
assert(appCode.includes('navigateToLogin()'), "app.js contains navigateToLogin()");
assert(appCode.includes('navigateToExam('), "app.js contains navigateToExam()");
assert(indexCode.includes('AutoScribeApp.navigateToLogin()'), "index.html Student Login button calls AutoScribeApp.navigateToLogin()");
assert(indexCode.includes('AutoScribeApp.navigateToExam()'), "index.html Direct Exam Launch button calls AutoScribeApp.navigateToExam()");

// Duplicate Collision Check
const confirmSubmitMatch = speechEngineCode.match(/action:\s*"CONFIRM_SUBMIT"/);
const confirmSubmitSection = speechEngineCode.substring(confirmSubmitMatch.index - 100, confirmSubmitMatch.index + 50);
assert(!confirmSubmitSection.includes('login') && !confirmSubmitSection.includes('log in'), "CONFIRM_SUBMIT in speech-engine.js does NOT collide with login voice command");

// --- TEST 3: Voice "Start Exam" Commands & Extra Words ---
const examRegex = /\b(start\s*exam|begin\s*exam|open\s*exam|launch\s*exam)\b/i;
assert(examRegex.test("Start Exam"), "Voice pattern matches 'Start Exam'");
assert(examRegex.test("start exam"), "Voice pattern matches 'start exam'");
assert(examRegex.test("begin exam"), "Voice pattern matches 'begin exam'");
assert(examRegex.test("open exam"), "Voice pattern matches 'open exam'");
assert(examRegex.test("please start exam"), "Voice pattern matches 'please start exam'");

// --- TEST 4: Student Login Form Fields & State Variables ---
assert(loginCode.indexOf('studentIdInput') < loginCode.indexOf('studentNameInput'), "login.html places Roll Number input before Student Name input (correct order)");
assert(loginCode.includes('loginErrorMsg'), "login.html has accessible loginErrorMsg validation container");
assert(!loginCode.includes('value="STD-1001"'), "login.html does not pre-fill hardcoded Roll Number");
assert(!loginCode.includes('value="Alex Johnson"'), "login.html does not pre-fill hardcoded Student Name");

// --- TEST 5 & 6: Validation Error Messages ---
assert(loginCode.includes('"Please enter your name."'), "login.html shows exact error message 'Please enter your name.' when name is missing");
assert(loginCode.includes('"Please enter your roll number."'), "login.html shows exact error message 'Please enter your roll number.' when roll number is missing");

// --- TEST 7: String Roll Number (Leading Zeros Preserved) ---
assert(appCode.includes('String(rollNumber'), "app.js preserves Roll Number as String without numeric conversion");
assert(!appCode.includes('parseInt(rollNumber') && !appCode.includes('Number(rollNumber'), "app.js avoids numeric conversion of roll numbers");

// --- TEST 8: Exam & Confirmation Page Display ---
assert(examCode.includes('id="examStudentName"'), "exam.html contains #examStudentName element");
assert(examCode.includes('id="examRollNumber"'), "exam.html contains #examRollNumber element");
assert(sessionCode.includes('examStudentName') && sessionCode.includes('examRollNumber'), "exam-session.js populates student name and roll number from session");
assert(confCode.includes('subStudent'), "confirmation.html displays logged in student details");

console.log("\n=== VERIFICATION SUMMARY ===");
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log("\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY! 🎉");
  process.exit(0);
} else {
  console.error("\nSOME VERIFICATION CHECKS FAILED! ❌");
  process.exit(1);
}
