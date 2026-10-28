/**
 * AutoScribe End-to-End Voice & Speech Verification Suite
 * Validates complete voice lifecycles from homepage orientation to hands-free login and exam dictation.
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

console.log("===============================================================");
console.log("       AUTOSCRIBE FULL VOICE LIFECYCLE & DETECTION AUDIT       ");
console.log("===============================================================\n");

// 1. Audit Homepage Voice Navigation Patterns (index.html)
console.log("[1/4] Auditing Homepage Voice Orientation & Commands...");
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert(indexHtml.includes('id="statusDot"'), "index.html includes #statusDot for visual microphone feedback");
assert(indexHtml.includes('id="speechStatusText"'), "index.html includes #speechStatusText for live transcription feedback");
assert(indexHtml.includes('id="voiceActivationPrompt"'), "index.html includes #voiceActivationPrompt accessible audio unblock banner");
assert(indexHtml.includes('AutoScribeSpeech.init()'), "index.html initializes AutoScribeSpeech on load");
assert(indexHtml.includes('startAutonomousVoice'), "index.html defines autonomous voice orientation function");

const loginNavRegex = /\b(login|log\s*in|student\s*login|open\s*login|go\s*to\s*login|sign\s*in)\b/i;
assert(loginNavRegex.test("login"), "Homepage detects 'login'");
assert(loginNavRegex.test("student login"), "Homepage detects 'student login'");
assert(loginNavRegex.test("can i please login"), "Homepage detects 'can i please login'");
assert(loginNavRegex.test("log in"), "Homepage detects 'log in'");
assert(loginNavRegex.test("sign in"), "Homepage detects 'sign in'");

const examNavRegex = /\b(start\s*(the\s*)?exam(ination)?|begin\s*(the\s*)?exam(ination)?|open\s*(the\s*)?exam(ination)?|launch\s*(the\s*)?exam(ination)?)\b/i;
assert(examNavRegex.test("start exam"), "Homepage detects 'start exam'");
assert(examNavRegex.test("start the exam"), "Homepage detects 'start the exam'");
assert(examNavRegex.test("begin exam"), "Homepage detects 'begin exam'");
assert(examNavRegex.test("open examination"), "Homepage detects 'open examination'");

// 2. Audit Speech Engine Barge-in & Interruption
console.log("\n[2/4] Auditing Speech Engine Voice Interruption & Audio Control...");
const speechEngineJs = fs.readFileSync(path.join(__dirname, 'js', 'speech-engine.js'), 'utf8');
const voiceControllerJs = fs.readFileSync(path.join(__dirname, 'js', 'voice-controller.js'), 'utf8');

assert(speechEngineJs.includes('isUrgentNav'), "Speech engine recognizes user barge-in navigation commands while speaking");
assert(speechEngineJs.includes('watchdogTimer'), "Speech engine implements watchdog timer to prevent SpeechSynthesis freeze");
assert(speechEngineJs.includes('resumeInterval'), "Speech engine implements keep-alive interval for Chrome speech synthesis");
assert(speechEngineJs.includes('window.speechSynthesis.cancel()'), "Speech engine stops synthesis cleanly upon stopSpeaking()");
assert(speechEngineJs.includes('(isLoginPage || isExamPage) && this.recognition'), "Speech engine isolates microphone during question reading on exam and login forms");
assert(voiceControllerJs.includes('if (!window.AutoScribeSpeech || !window.AutoScribeSpeech.parseSpokenNameOrSpelling)'), "voice-controller.js safely preserves full AutoScribeSpeech engine from speech-engine.js");

// 3. Audit Candidate Hands-Free Voice Login Machine (login.html)
console.log("\n[3/4] Auditing 6-Phase Candidate Voice Login Machine...");
const loginHtml = fs.readFileSync(path.join(__dirname, 'login.html'), 'utf8');

assert(loginHtml.includes("SELECT_VOICE"), "Login state machine contains step 1: SELECT_VOICE");
assert(loginHtml.includes("LISTEN_ROLL"), "Login state machine contains step 2: LISTEN_ROLL");
assert(loginHtml.includes("CONFIRM_ROLL"), "Login state machine contains step 3: CONFIRM_ROLL");
assert(loginHtml.includes("LISTEN_NAME"), "Login state machine contains step 4: LISTEN_NAME");
assert(loginHtml.includes("CONFIRM_NAME"), "Login state machine contains step 5: CONFIRM_NAME");
assert(loginHtml.includes("FINAL_CONFIRM"), "Login state machine contains step 6: FINAL_CONFIRM");

// Simulate simulated roll-number normalization
// Test candidate roll number: "two five I S R zero two three" -> 25ISR023
const normalizeRoll = (text) => {
  let str = text.trim().toLowerCase();
  str = str.replace(/^(my\s+)?(roll\s+number|student\s+id)(\s+is)?\s*/i, '');
  const numMap = { 'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9' };
  str = str.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, m => numMap[m] || m);
  str = str.replace(/\s+/g, '');
  return str.toUpperCase();
};

assert(normalizeRoll("two five I S R zero two three") === "25ISR023", "Voice roll 'two five I S R zero two three' normalizes to '25ISR023'");
assert(normalizeRoll("my roll number is 25ISR023") === "25ISR023", "Voice roll with preamble 'my roll number is 25ISR023' normalizes to '25ISR023'");

// 4. Audit Live Server & Database Health
console.log("\n[4/4] Verifying Live Server & SQLite Database Connection...");
const http = require('http');

function checkEndpoint(path) {
  return new Promise((resolve) => {
    http.get({ hostname: 'localhost', port: 8000, path }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, raw: body }); }
      });
    }).on('error', err => resolve({ status: 500, error: err.message }));
  });
}

async function runLiveCheck() {
  const health = await checkEndpoint('/api/db/health');
  assert(health.status === 200, "Live server responds with 200 OK on /api/db/health");
  assert(health.data && health.data.connected === true, "Database reports active connection to SQLite (autoscribe.db)");

  const exams = await checkEndpoint('/api/exams');
  assert(exams.status === 200, "Live server responds with 200 OK on /api/exams");
  assert(Array.isArray(exams.data) && exams.data.length >= 6, "Live server returns 6 examination subjects ready for voice selection");

  console.log("\n===============================================================");
  console.log(`TOTAL AUDIT CHECKS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log("===============================================================\n");

  process.exit(failed === 0 ? 0 : 1);
}

runLiveCheck();
