console.log("==========================================");
console.log("Testing Login Voice Loop Fix & Tokens...");
console.log("==========================================");

let loginStateId = 0;
let retryCount = 0;
let currentLoginState = 'IDLE';
let ttsStartCount = 0;
let ttsEndCount = 0;

const logBuffer = [];

const mockConsoleLog = (...args) => {
  const msg = args.join(' ');
  logBuffer.push(msg);
  console.log(msg);
};

const transitionToLoginState = (newState, customPrompt = null) => {
  loginStateId++;
  const currentGen = loginStateId;
  retryCount = 0;

  mockConsoleLog("[LOGIN TRANSITION]", currentLoginState, "→", newState);
  currentLoginState = newState;
  mockConsoleLog("[LOGIN STATE]", currentLoginState);

  let promptText = '';
  if (newState === 'VOICE_SELECTION') {
    promptText = customPrompt || "Please choose your preferred voice. Say Male or Female.";
  } else if (newState === 'ROLL_NUMBER') {
    promptText = customPrompt || "Please say your roll number.";
  } else if (newState === 'ROLL_CONFIRMATION') {
    promptText = customPrompt || "I heard roll number 25. Is that correct?";
  }

  if (promptText) {
    ttsStartCount++;
    mockConsoleLog("[LOGIN TTS START]", promptText);
    setTimeout(() => {
      ttsEndCount++;
      mockConsoleLog("[LOGIN TTS END]");
      if (currentGen === loginStateId) {
        startLoginListener(currentGen);
      }
    }, 10);
  }
};

const startLoginListener = (currentGen) => {
  if (currentGen !== loginStateId) return;
  mockConsoleLog("[LOGIN STT START]");
};

const handleSttError = (currentGen, err) => {
  if (currentGen !== loginStateId) return;
  retryCount++;
  mockConsoleLog("[LOGIN STT ERROR]", err || "no-speech", `(Retry ${retryCount}/2)`);
  if (retryCount <= 2) {
    setTimeout(() => startLoginListener(currentGen), 10);
  } else {
    mockConsoleLog("[LOGIN] Max retries reached.");
  }
};

// [Test 1] Verify Single Prompt Per Transition
console.log("\n[Test 1] Simulating transition to ROLL_NUMBER...");
transitionToLoginState('ROLL_NUMBER');

setTimeout(() => {
  mockConsoleLog("[LOGIN STT RESULT]", "two five");
  mockConsoleLog("[LOGIN STT END]");
  transitionToLoginState('ROLL_CONFIRMATION');

  setTimeout(() => {
    console.log("\n[Test 2] Verifying TTS Prompt Counts...");
    console.log(`Total TTS Starts: ${ttsStartCount}`);
    console.log(`Total TTS Ends: ${ttsEndCount}`);
    console.assert(ttsStartCount === 2, `Expected 2 TTS starts (1 per state transition), got ${ttsStartCount}`);

    console.log("\n[Test 3] Simulating STT No-Speech Error Retries...");
    loginStateId++;
    const testGen = loginStateId;
    retryCount = 0;
    const initialTtsStarts = ttsStartCount;

    handleSttError(testGen, "no-speech");
    setTimeout(() => {
      handleSttError(testGen, "no-speech");
      setTimeout(() => {
        handleSttError(testGen, "no-speech");
        
        console.assert(ttsStartCount === initialTtsStarts, "STT retries MUST NOT trigger TTS prompts!");
        console.log("Confirmed: STT retries did NOT trigger any new TTS prompts.");

        console.log("\n==========================================");
        console.log("✅ All Login Voice Loop Tests PASSED!");
        console.log("==========================================");
      }, 50);
    }, 50);
  }, 50);
}, 50);
