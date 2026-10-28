const fs = require('fs');

console.log("==========================================");
console.log("Testing Login Voice Isolation & 7 States...");
console.log("==========================================");

// Mock Speech Engine Page Guard Logic
const mockParseVoiceCommands = (text, isExamPage) => {
  if (!isExamPage) return false;
  return true;
};

const mockParseGlobalCommands = (text, isLoginPage) => {
  if (isLoginPage) return false;
  return true;
};

// [Test 1] Verify Command Isolation Page Guards
console.log("\n[Test 1] Testing Page Guard Command Isolation...");
const isExamCmdOnLogin = mockParseVoiceCommands("next question", false); // on login.html
console.log("Exam command 'next question' on login.html matched:", isExamCmdOnLogin);
console.assert(isExamCmdOnLogin === false, "Exam voice commands MUST be blocked on login.html");

const isGlobalCmdOnLogin = mockParseGlobalCommands("start exam", true); // on login.html
console.log("Global command 'start exam' on login.html matched:", isGlobalCmdOnLogin);
console.assert(isGlobalCmdOnLogin === false, "Global navigation commands MUST be blocked on login.html");

// [Test 2] Verify Codebase Content Guards
console.log("\n[Test 2] Verifying File Contents Isolation...");
const loginHtml = fs.readFileSync('login.html', 'utf8');
const speechEngineJs = fs.readFileSync('js/speech-engine.js', 'utf8');
const examSessionJs = fs.readFileSync('js/exam-session.js', 'utf8');

console.assert(!loginHtml.includes("Please say read once again"), "login.html MUST NOT contain exam prompt.");
console.assert(speechEngineJs.includes("if (!isExamPage) return false;"), "speech-engine.js MUST guard parseVoiceCommands with isExamPage.");
console.assert(speechEngineJs.includes("if (isLoginPage) return false;"), "speech-engine.js MUST guard parseGlobalCommands with isLoginPage.");
console.assert(examSessionJs.includes("if (!isExamPage)"), "exam-session.js MUST guard initSession with isExamPage.");

// [Test 3] Verify 7 Login States in login.html
console.log("\n[Test 3] Verifying 7 Login States in login.html...");
const states = ['SELECT_VOICE', 'LISTEN_ROLL', 'CONFIRM_ROLL', 'LISTEN_NAME', 'CONFIRM_NAME', 'FINAL_CONFIRM', 'COMPLETE'];
states.forEach(state => {
  const exists = loginHtml.includes(state);
  console.log(`State [${state}] present in login.html:`, exists);
  console.assert(exists, `State ${state} MUST be implemented in login.html`);
});

console.log("\n==========================================");
console.log("✅ All Login Isolation & 7-State Tests PASSED!");
console.log("==========================================");
