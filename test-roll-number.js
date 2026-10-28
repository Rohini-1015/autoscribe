/**
 * Roll Number Alphanumeric Parsing Verification Suite
 * Tests all 7 required cases from user prompt
 */

const fs = require('fs');
const path = require('path');

global.window = global;
global.document = {
  getElementById: () => null,
  body: { addEventListener: () => {} }
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

const speechEngineCode = fs.readFileSync(path.join(__dirname, 'js', 'speech-engine.js'), 'utf8');
eval(speechEngineCode);

console.log("=== ROLL NUMBER ALPHANUMERIC PARSING TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function runTest(testNum, input, expected) {
  const actual = global.AutoScribeSpeech.normalizeRollNumber(input);
  if (actual === expected) {
    console.log(`✅ TEST ${testNum} PASSED: Input "${input}" → Output "${actual}"`);
    passed++;
  } else {
    console.error(`❌ TEST ${testNum} FAILED: Input "${input}" → Expected "${expected}", got "${actual}"`);
    failed++;
  }
}

// 7 Required Test Cases
runTest(1, "25ISR023", "25ISR023");
runTest(2, "25 ISR 023", "25ISR023");
runTest(3, "two five I S R zero two three", "25ISR023");
runTest(4, "two five I S R 0 2 3", "25ISR023");
runTest(5, "two five", "25");
runTest(6, "one zero zero one", "1001");
runTest(7, "001ABC25", "001ABC25");

// Additional Alphanumeric Edge Cases
runTest(8, "24CSE101", "24CSE101");
runTest(9, "23IT045", "23IT045");
runTest(10, "25ECE001", "25ECE001");
runTest(11, "22CS100", "22CS100");
runTest(12, "my roll number is 25ISR023", "25ISR023");
runTest(13, "00123", "00123");

console.log("\n=== TEST SUMMARY ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log("\nALL 13 ROLL NUMBER TESTS PASSED! 🎉");
  process.exit(0);
} else {
  console.error("\nTEST SUITE FAILED ❌");
  process.exit(1);
}
