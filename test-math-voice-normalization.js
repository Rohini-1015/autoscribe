const fs = require('fs');
const path = require('path');

// Mock browser globals for Node.js environment
global.window = global;
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.document = {
  getElementById: () => null,
  body: { addEventListener: () => {} }
};
global.AutoScribeApp = {};
global.AutoScribeDB = { getExams: async () => [] };
global.AutoScribeSpeech = {
  init: () => {},
  speak: (t, cb) => { if (cb) cb(); },
  startListening: () => {},
  stopListening: () => {},
  getAudioContext: () => {}
};

// Load exam-session.js
require('./js/exam-session.js');

console.log('=== MATHEMATICS VOICE NORMALIZATION TEST SUITE ===\n');

const testCases = [
  {
    name: 'Example 1: Quadratic Expression',
    input: 'x squared plus five x equals twenty five',
    expected: 'x²+5x=25'
  },
  {
    name: 'Example 2: Arithmetic Operations',
    input: 'ten divided by two multiplied by three',
    expected: '10÷2×3'
  },
  {
    name: 'Example 3: Linear Equation',
    input: 'two x plus three equals eleven',
    expected: '2x+3=11'
  },
  {
    name: 'Example 4: Quadratic Equation with Subtraction',
    input: 'x squared minus four x plus four equals zero',
    expected: 'x²−4x+4=0'
  },
  {
    name: 'Example 5: Parentheses / Brackets',
    input: 'open bracket x plus two close bracket multiplied by three',
    expected: '(x+2)×3'
  },
  {
    name: 'Example 6: Pythagorean Theorem',
    input: 'a squared plus b squared equals c squared',
    expected: 'a²+b²=c²'
  },
  {
    name: 'Example 7: Complex Polynomial',
    input: 'five x squared plus three x minus two equals zero',
    expected: '5x²+3x−2=0'
  },
  {
    name: 'Example 8: Digit sequence merging',
    input: 'two five',
    expected: '25'
  },
  {
    name: 'Example 9: Inequalities',
    input: 'x plus five greater than or equal to ten',
    expected: 'x+5≥10'
  }
];

let passedCount = 0;
let failedCount = 0;

testCases.forEach((tc, index) => {
  const actual = AutoScribeExamSession.normalizeMathExpression(tc.input);
  if (actual === tc.expected) {
    console.log(`✅ PASS [${index + 1}]: "${tc.input}"`);
    console.log(`   Result: "${actual}"\n`);
    passedCount++;
  } else {
    console.error(`❌ FAIL [${index + 1}]: "${tc.input}"`);
    console.error(`   Expected: "${tc.expected}"`);
    console.error(`   Actual:   "${actual}"\n`);
    failedCount++;
  }
});

console.log('=== SUMMARY ===');
console.log(`Passed: ${passedCount}`);
console.log(`Failed: ${failedCount}`);

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('\nALL MATHEMATICS NORMALIZATION TESTS PASSED PERFECTLY! 🎉');
}
