const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment in Node
global.window = global;
global.location = {
  pathname: '/exam.html',
  href: 'http://localhost:8000/exam.html',
  search: '?subject=math'
};

// Create a DOM with the exact textarea element from exam.html
const answerInputTextarea = {
  id: 'answerInput',
  value: '',
  setAttribute: () => {},
  getAttribute: () => null
};

const elements = {
  'answerInput': answerInputTextarea,
  'questionHeader': { innerHTML: '' },
  'questionText': { textContent: '' },
  'questionProgress': { textContent: '' },
  'timerDisplay': { textContent: '' },
  'saveStatus': { textContent: '' },
  'statusDot': { classList: { add: () => {}, remove: () => {} } },
  'speechStatusText': { textContent: '', innerHTML: '' },
  'examStudentName': { textContent: '' },
  'examRollNumber': { textContent: '' }
};

global.document = {
  getElementById: (id) => elements[id] || null,
  body: {
    addEventListener: () => {}
  },
  createElement: (tag) => ({
    id: '',
    style: {},
    setAttribute: () => {},
    appendChild: () => {}
  })
};

global.localStorage = {
  getItem: (key) => {
    if (key === 'autoscribe_exams') {
      return JSON.stringify([
        {
          id: "exam_math",
          title: "Mathematics",
          durationMinutes: 90,
          totalQuestions: 7,
          questions: [
            { id: 1, text: "Solve for x: 3x + 7 = 22.", marks: 2, section: "Part A (2 Marks)" }
          ]
        }
      ]);
    }
    return null;
  },
  setItem: () => {},
  removeItem: () => {}
};

global.sessionStorage = {
  getItem: () => null,
  setItem: () => {}
};

// Mock SpeechRecognition API
class MockSpeechRecognition {
  constructor() {
    this.continuous = true;
    this.interimResults = true;
    this.lang = 'en-IN';
    this.onresult = null;
    this.onend = null;
    this.onerror = null;
  }
  start() {
    console.log("[Mock SpeechRecognition] microphone started in browser!");
  }
  stop() {
    console.log("[Mock SpeechRecognition] microphone stopped.");
  }
}

global.SpeechRecognition = MockSpeechRecognition;
global.webkitSpeechRecognition = MockSpeechRecognition;

// Mock SpeechSynthesis API
global.speechSynthesis = {
  speaking: false,
  cancel: () => {},
  speak: (utterance) => {
    console.log("[Mock SpeechSynthesis] TTS Speaking:", utterance.text.slice(0, 60) + "...");
    // Simulate TTS completion after prompt
    setTimeout(() => {
      if (utterance.onend) utterance.onend();
    }, 50);
  },
  getVoices: () => []
};

global.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
    this.onend = null;
    this.onerror = null;
  }
};

// Load AutoScribe DB, App, Speech Engine, and Exam Session
global.AutoScribeDB = {
  getExams: async () => JSON.parse(localStorage.getItem('autoscribe_exams')),
  saveAnswer: () => {}
};

global.AutoScribeApp = {
  currentUser: { name: "Test Student", rollNumber: "25ISR023" }
};

require('./js/speech-engine.js');
require('./js/exam-session.js');

async function testBrowserMathFlow() {
  console.log("=== TESTING REAL BROWSER SEQUENTIAL TTS & CUMULATIVE MATH BUFFER ===\n");

  // Initialize Exam Session (Simulates DOMContentLoaded in browser)
  await AutoScribeExamSession.initSession();

  // Wait for 3 sequential TTS calls to complete: Question Read 1 -> Question Read 2 -> Answer Prompt -> Microphone Start
  console.log("Waiting for 3-phase sequential TTS to finish and microphone to activate...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n--- TEST 1: MULTI-PAUSE CUMULATIVE DICTATION ---");

  // Segment 1: Student says "x cube"
  console.log('Student Segment 1: "x cube"');
  AutoScribeSpeech.recognition.onresult({
    resultIndex: 0,
    results: [ Object.assign([{ transcript: "x cube" }], { isFinal: true }) ]
  });
  console.log(`Buffer after Segment 1: "${answerInputTextarea.value}" (Expected: "x³")`);
  if (answerInputTextarea.value !== "x³") {
    console.error("❌ TEST 1 FAILED: Expected x³ but got", answerInputTextarea.value);
    process.exit(1);
  }

  // Segment 2: Student pauses, then says "plus three"
  console.log('\nStudent Segment 2: "plus three"');
  AutoScribeSpeech.recognition.onresult({
    resultIndex: 0,
    results: [ Object.assign([{ transcript: "plus three" }], { isFinal: true }) ]
  });
  console.log(`Buffer after Segment 2: "${answerInputTextarea.value}" (Expected: "x³+3")`);
  if (answerInputTextarea.value !== "x³+3") {
    console.error("❌ TEST 1 FAILED: Expected x³+3 but got", answerInputTextarea.value);
    process.exit(1);
  }

  // Segment 3: Student pauses, then says "equals ten"
  console.log('\nStudent Segment 3: "equals ten"');
  AutoScribeSpeech.recognition.onresult({
    resultIndex: 0,
    results: [ Object.assign([{ transcript: "equals ten" }], { isFinal: true }) ]
  });
  console.log(`Buffer after Segment 3: "${answerInputTextarea.value}" (Expected: "x³+3=10")`);
  if (answerInputTextarea.value !== "x³+3=10") {
    console.error("❌ TEST 1 FAILED: Expected x³+3=10 but got", answerInputTextarea.value);
    process.exit(1);
  }

  console.log("\n✅ SUCCESS: Multi-pause cumulative dictation verified perfectly!");
}

testBrowserMathFlow();
