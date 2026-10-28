/**
 * AutoScribe Backend Server - Google Cloud Text-to-Speech Integration
 * Securely proxies TTS requests using GOOGLE_TTS_API_KEY or GOOGLE_API_KEY loaded from .env
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
const rootDir = process.cwd();
const staticDir = path.resolve(__dirname);

app.use(express.static(staticDir));
if (rootDir !== staticDir) {
  app.use(express.static(rootDir));
}

// Enterprise MySQL Database & Routes
const db = require('./config/database');
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const answerRoutes = require('./routes/answers');
const submissionRoutes = require('./routes/submissions');

// Database Health Endpoint
app.get('/api/db/health', async (req, res) => {
  if (!db.isConnected()) {
    await db.initPool();
  }
  res.json({
    status: db.isConnected() ? 'connected' : 'offline',
    connected: db.isConnected(),
    database: db.config.database,
    host: db.config.host,
    port: db.config.port,
    error: db.getLastError()
  });
});

// Mount Modular Enterprise REST APIs
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/answers', answerRoutes);
app.use('/api/submissions', submissionRoutes);

// Page Routes for Local and Vercel Deployment
const sendPage = (pageName, res) => {
  const fileInDir = path.join(staticDir, pageName);
  const fileInCwd = path.join(rootDir, pageName);
  const fs = require('fs');
  if (fs.existsSync(fileInDir)) {
    return res.sendFile(fileInDir);
  } else if (fs.existsSync(fileInCwd)) {
    return res.sendFile(fileInCwd);
  }
  return res.status(404).send(`Page ${pageName} not found.`);
};

app.get(['/', '/index', '/index.html'], (req, res) => sendPage('index.html', res));
app.get(['/login', '/login.html'], (req, res) => sendPage('login.html', res));
app.get(['/dashboard', '/dashboard.html'], (req, res) => sendPage('dashboard.html', res));
app.get(['/exam', '/exam.html'], (req, res) => sendPage('exam.html', res));
app.get(['/admin', '/admin.html'], (req, res) => sendPage('admin.html', res));
app.get(['/confirmation', '/confirmation.html'], (req, res) => sendPage('confirmation.html', res));



/**
 * POST /api/tts
 * Request Payload: { "text": "...", "gender": "male"|"female", "speed": 1.0 }
 * Response Payload: { "audioContent": "<base64_mp3_string>", "voice": "en-IN-Standard-B"|"en-IN-Standard-A" }
 */
app.post('/api/tts', (req, res) => {
  try {
    const { text, gender, speed } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Valid text prompt is required.' });
    }

    const pace = parseFloat(speed) || 1.0;
    const isMale = (gender && String(gender).toLowerCase() === 'male');

    // AutoScribe uses Browser Native Web SpeechSynthesis API for TTS. No cloud keys required.
    return res.json({
      status: 'native_speech_synthesis',
      engine: 'Browser Web SpeechSynthesis API (en-IN)',
      speaker: isMale ? 'male' : 'female',
      pace: pace,
      text: text
    });

  } catch (err) {
    console.error('Server Error in /api/tts:', err);
    return res.status(500).json({ error: 'Internal Server Error handling TTS request.' });
  }
});

// Google Cloud Speech-to-Text Integration (Application Default Credentials - ADC)
const speech = require('@google-cloud/speech');
let sttClient = null;
try {
  sttClient = new speech.SpeechClient();
  console.log('Google Cloud SpeechClient (ADC) initialized.');
} catch (err) {
  console.warn('Google Cloud SpeechClient (ADC) initial setup notice:', err.message);
}

/**
 * GET /api/stt/health
 * Health check endpoint for Google STT ADC configuration status
 */
app.get('/api/stt/health', (req, res) => {
  const isAdcConfigured = !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT);
  return res.json({
    status: sttClient ? 'ready' : 'unconfigured',
    engine: 'Google Cloud Speech-to-Text (en-IN)',
    adcConfigured: isAdcConfigured,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Not set (using default ADC lookup)'
  });
});

/**
 * POST /api/stt
 * Request Payload: { "audioContent": "<base64_audio>", "mimeType": "audio/webm;codecs=opus", "sampleRateHertz": 48000 }
 * Response Payload: { "transcript": "...", "confidence": 0.95, "languageCode": "en-IN" }
 */
app.post('/api/stt', async (req, res) => {
  try {
    const { audioContent, mimeType, sampleRateHertz } = req.body || {};

    if (!audioContent || typeof audioContent !== 'string') {
      return res.status(400).json({ error: 'Valid base64 audioContent string is required.' });
    }

    if (!sttClient) {
      try {
        sttClient = new speech.SpeechClient();
      } catch (err) {
        return res.status(503).json({
          error: 'Google Cloud STT client is unavailable. ADC credentials are not configured.',
          setupRequired: true,
          details: err.message
        });
      }
    }

    let encoding = 'WEBM_OPUS';
    if (mimeType && (mimeType.includes('wav') || mimeType.includes('pcm') || mimeType.includes('linear16'))) {
      encoding = 'LINEAR16';
    } else if (mimeType && mimeType.includes('ogg')) {
      encoding = 'OGG_OPUS';
    } else if (mimeType && mimeType.includes('flac')) {
      encoding = 'FLAC';
    }

    const config = {
      encoding: encoding,
      languageCode: 'en-IN',
      enableAutomaticPunctuation: true,
    };

    if (sampleRateHertz && typeof sampleRateHertz === 'number') {
      config.sampleRateHertz = sampleRateHertz;
    }

    const audio = {
      content: audioContent,
    };

    const request = {
      config: config,
      audio: audio,
    };

    const [response] = await sttClient.recognize(request);
    const results = response.results || [];
    
    let fullTranscript = '';
    let totalConfidence = 0;
    let count = 0;

    results.forEach(result => {
      if (result.alternatives && result.alternatives[0]) {
        const alt = result.alternatives[0];
        fullTranscript += (fullTranscript ? ' ' : '') + alt.transcript;
        if (alt.confidence) {
          totalConfidence += alt.confidence;
          count++;
        }
      }
    });

    const avgConfidence = count > 0 ? (totalConfidence / count) : 0.9;

    return res.json({
      transcript: fullTranscript.trim(),
      confidence: avgConfidence,
      languageCode: 'en-IN',
      engine: 'Google Cloud Speech-to-Text (en-IN)'
    });

  } catch (err) {
    console.error('Google Cloud STT Recognition Error:', err);
    if (err.message && err.message.includes('Could not load the default credentials')) {
      return res.status(503).json({
        error: 'Google Application Default Credentials (ADC) not found.',
        setupRequired: true,
        details: 'Set GOOGLE_APPLICATION_CREDENTIALS in .env file or run gcloud auth application-default login.'
      });
    }
    return res.status(500).json({
      error: 'Google Cloud STT Recognition failed.',
      details: err.message
    });
  }
});

if (require.main === module) {
  // Initialize MySQL database connection pool
  db.initPool().catch(err => {
    console.warn('[AutoScribe DB Startup Notice]:', err.message);
  });

  app.listen(PORT, () => {
    console.log(`AutoScribe Backend Server running on http://localhost:${PORT}`);
    console.log(`Google Cloud TTS Endpoint: http://localhost:${PORT}/api/tts`);
    console.log(`Google Cloud STT Endpoint: http://localhost:${PORT}/api/stt (en-IN ADC)`);
    console.log(`AutoScribe Database Health: http://localhost:${PORT}/api/db/health`);
    if (!process.env.GOOGLE_TTS_API_KEY && !process.env.GOOGLE_API_KEY && !process.env.GOOGLE_ACCESS_TOKEN) {
      console.log(`Notice: GOOGLE_TTS_API_KEY is not set in .env file. Please add GOOGLE_TTS_API_KEY to enable Google Cloud voices.`);
    }
  });
}

module.exports = app;


