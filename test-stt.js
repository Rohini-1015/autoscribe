/**
 * Standalone verification script to test Google Cloud Speech-to-Text ADC connection
 */
require('dotenv').config();
const speech = require('@google-cloud/speech');

async function testGoogleSTTConnection() {
  console.log("==========================================");
  console.log("Testing Google Cloud Speech-to-Text ADC Connection...");
  console.log("==========================================");

  try {
    // Instantiate SpeechClient using Application Default Credentials (ADC)
    const client = new speech.SpeechClient();
    console.log("SpeechClient initialized successfully with ADC.");

    // Perform a lightweight dummy recognition request or project check
    // We create a minimal 1-second silence LINEAR16 16kHz audio buffer
    const sampleRate = 16000;
    const durationSec = 1;
    const bufferSize = sampleRate * 2 * durationSec; // 16-bit = 2 bytes per sample
    const dummyAudioBuffer = Buffer.alloc(bufferSize);

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: sampleRate,
      languageCode: 'en-IN',
    };

    const audio = {
      content: dummyAudioBuffer.toString('base64'),
    };

    const request = {
      config: config,
      audio: audio,
    };

    console.log("Sending test audio recognition request to Google Cloud STT (en-IN)...");
    const [response] = await client.recognize(request);
    
    console.log("✅ Google Cloud STT API Connection SUCCESSFUL!");
    console.log("Response results count:", response.results ? response.results.length : 0);
    console.log("ADC Authentication and API Access are functioning properly.");
    console.log("==========================================");
    return true;

  } catch (err) {
    console.error("❌ Google Cloud STT ADC Connection Failed!");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    if (err.details) {
      console.error("Error Details:", err.details);
    }
    console.log("\nSetup Instructions for ADC:");
    console.log("1. Ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid service account JSON file in .env or environment.");
    console.log("   Example in .env: GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service_account.json");
    console.log("2. Or run: gcloud auth application-default login");
    console.log("3. Ensure Cloud Speech-to-Text API is enabled in your GCP Console.");
    console.log("==========================================");
    return false;
  }
}

testGoogleSTTConnection();
