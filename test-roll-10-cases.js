/**
 * Extended Roll Number Test Suite — Tests all 10 cases from user prompt
 * including twenty-five compound form and phonetic letters
 */

global.window = global;
global.document = {
  getElementById: () => null,
  body: { addEventListener: () => {} }
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

const fs = require('fs');
eval(fs.readFileSync('./js/speech-engine.js', 'utf8'));

console.log("=== FULL 10-CASE ROLL NUMBER TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function runTest(testNum, input, expected) {
  const actual = global.AutoScribeSpeech.normalizeRollNumber(input);
  if (actual === expected) {
    console.log(`✅ TEST ${testNum} PASSED: "${input}" → "${actual}"`);
    passed++;
  } else {
    console.error(`❌ TEST ${testNum} FAILED: "${input}" → Expected "${expected}", got "${actual}"`);
    failed++;
  }
}

runTest(1,  "25ISR023",                           "25ISR023");
runTest(2,  "25 ISR 023",                         "25ISR023");
runTest(3,  "two five I S R zero two three",      "25ISR023");
runTest(4,  "two five I S R 0 2 3",               "25ISR023");
runTest(5,  "twenty five I S R zero two three",   "25ISR023");
runTest(6,  "24 C S E 101",                       "24CSE101");
runTest(7,  "001 ABC 25",                         "001ABC25");
runTest(8,  "1001",                               "1001");
runTest(9,  "one zero zero one",                  "1001");
runTest(10, "two five",                           "25");

console.log("\n=== TEST SUMMARY ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log("\nALL 10 REQUIRED TESTS PASSED! 🎉");
  process.exit(0);
} else {
  console.error("\nSOME TESTS FAILED ❌");
  process.exit(1);
}
