/**
 * Standalone verification script for Google Cloud Text-to-Speech integration in server.js
 */
const http = require('http');

async function makeTTSRequest(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/api/tts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, error: err.message });
    });

    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log("==========================================");
  console.log("Testing Google Cloud TTS Server Endpoint...");
  console.log("==========================================");

  // Test 1: Female Voice
  console.log("\n[Test 1] Testing Female Voice (en-IN-Standard-A)...");
  const res1 = await makeTTSRequest({ text: "Welcome to AutoScribe voice examination.", gender: "female", speed: 1.0 });
  console.log("Status:", res1.status);
  console.log("Response:", JSON.stringify(res1.body, null, 2));

  // Test 2: Male Voice
  console.log("\n[Test 2] Testing Male Voice (en-IN-Standard-B)...");
  const res2 = await makeTTSRequest({ text: "Please dictating your answer clearly.", gender: "male", speed: 1.0 });
  console.log("Status:", res2.status);
  console.log("Response:", JSON.stringify(res2.body, null, 2));

  // Test 3: Custom Voice Speed (0.8 and 1.25)
  console.log("\n[Test 3] Testing Custom Speech Speed (0.8x and 1.25x)...");
  const res3a = await makeTTSRequest({ text: "Slow speech rate test.", gender: "female", speed: 0.8 });
  console.log("Speed 0.8 Status:", res3a.status, "Pace:", res3a.body.pace);
  const res3b = await makeTTSRequest({ text: "Fast speech rate test.", gender: "male", speed: 1.25 });
  console.log("Speed 1.25 Status:", res3b.status, "Pace:", res3b.body.pace);

  console.log("\n==========================================");
  console.log("TTS Backend Integration Verification Complete.");
  console.log("==========================================");
}

runTests();
