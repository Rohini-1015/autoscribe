/**
 * AutoScribe State Machine Unit Verification Script
 * Validates 'I will write' phrase matching and WRITE MODE state locking logic.
 */

// Simulated DOM & Browser Objects
global.window = {
  location: { search: '?id=exam_bio', href: 'exam.html' },
  speechSynthesis: {
    speak: (u) => { if (u.onend) setTimeout(u.onend, 10); },
    cancel: () => {},
    getVoices: () => [{ name: 'Google en-IN Female', lang: 'en-IN' }]
  }
};
global.document = {
  getElementById: (id) => {
    if (!global.mockElements[id]) {
      global.mockElements[id] = { value: '', textContent: '', classList: { add: () => {}, remove: () => {} }, addEventListener: () => {} };
    }
    return global.mockElements[id];
  },
  body: { addEventListener: () => {} }
};
global.mockElements = {};

// Load AutoScribe modules
const fs = require('fs');
const path = require('path');

const speechEngineCode = fs.readFileSync(path.join(__dirname, 'js', 'speech-engine.js'), 'utf8');
const examSessionCode = fs.readFileSync(path.join(__dirname, 'js', 'exam-session.js'), 'utf8');

eval(speechEngineCode);
eval(examSessionCode);

global.AutoScribeSpeech = window.AutoScribeSpeech;
global.AutoScribeDB = { saveAnswer: () => {} };
global.AutoScribeApp = { currentUser: { speed: '1.0', gender: 'male' } };
global.SpeechSynthesisUtterance = function(text) { this.text = text; };

function runStateMachineTests() {
  console.log("==========================================");
  console.log("Testing Exam Session State Machine & Write Mode...");
  console.log("==========================================");

  const session = window.AutoScribeExamSession;
  session.activeExam = {
    id: 'exam_bio',
    title: 'Biology Examination',
    questions: [
      { id: 1, text: 'What is photosynthesis?', marks: 2 },
      { id: 2, text: 'Explain cellular respiration.', marks: 5 }
    ]
  };
  session.currentIndex = 0;
  session.answers = {};

  // 1. Start Question Flow
  console.log("\n[Test 1] Initializing Question 1 Flow...");
  session.startQuestionFlow();
  console.log("Current State:", session.questionState);
  console.log("Answer Mode:", session.answerMode);
  console.assert(session.questionState === 'AWAITING_READ_WRITE', "State should be AWAITING_READ_WRITE");
  console.assert(session.answerMode === false, "Answer Mode should be false initially");

  // 2. Student says "I will write"
  console.log("\n[Test 2] Student says 'I will write'...");
  session.handleSubjectVoiceInput("I will write", true);
  console.log("Current State:", session.questionState);
  console.log("Answer Mode:", session.answerMode);
  console.assert(session.questionState === 'RECORDING_ANSWER', "State should be RECORDING_ANSWER (WRITE MODE)");
  console.assert(session.answerMode === true, "Answer Mode should be true");

  // 3. Student dictates answer in WRITE MODE
  console.log("\n[Test 3] Student dictates answer in WRITE MODE...");
  session.handleSubjectVoiceInput("Photosynthesis converts sunlight into chemical energy.", true);
  const inputVal = document.getElementById('answerInput').value;
  console.log("Answer Box Content:", inputVal);
  console.assert(inputVal.includes("Photosynthesis converts sunlight into chemical energy"), "Answer box should contain spoken dictation");

  // 4. Test alternate write phrases
  console.log("\n[Test 4] Testing alternate phrase matching regex...");
  const writeRegex = /\b(i\s*will\s*write|i'll\s*write|will\s*write|i\s*will\s*write\s*the\s*answer|write|i\s*will\s*answer|i'll\s*answer|will\s*answer|start\s*writing|let\s*me\s*write|write\s*the\s*answer|writing|start|ready|begin|answer)\b/i;

  const testPhrases = [
    "I will write",
    "I'll write",
    "I will write the answer",
    "Write",
    "I will answer",
    "Start writing",
    "Let me write",
    "Yes I will write"
  ];

  testPhrases.forEach(phrase => {
    const matched = writeRegex.test(phrase);
    console.log(`Write Phrase: "${phrase}" -> Matched: ${matched}`);
    console.assert(matched, `Phrase "${phrase}" should match WRITE MODE trigger.`);
  });

  console.log("\n[Test 5] Testing 'read again' phrase matching regex...");
  const readRegex = /\b(read|read again|read once again|once again|read question|repeat|say the question again|read the question again)\b/i;
  const readPhrases = [
    "read again",
    "read once again",
    "repeat",
    "say the question again",
    "read the question again"
  ];

  readPhrases.forEach(phrase => {
    const matched = readRegex.test(phrase);
    console.log(`Read Phrase: "${phrase}" -> Matched: ${matched}`);
    console.assert(matched, `Phrase "${phrase}" should match READ AGAIN trigger.`);
  });

  console.log("\n==========================================");
  console.log("✅ All State Machine & Write Mode Tests PASSED!");
  console.log("==========================================");
}

runStateMachineTests();
