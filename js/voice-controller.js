/**
 * AutoScribe Universal Voice Accessibility Controller
 * Enterprise-grade, 100% hands-free voice input and output system for visually impaired students.
 * 
 * Features:
 * - Unified State Machine: IDLE, LISTENING, PROCESSING, SUCCESS, ERROR, SPEAKING
 * - Robust Web Speech Recognition with anti-stall, debounced recovery, and echo suppression
 * - Anti-stall SpeechSynthesis keepalive with Indian English (en-IN), English, and Tamil (ta-IN) support
 * - Shared Command Parser & Page-Aware Registry (Global & Page-Specific commands)
 * - Voice-Guided Form Interaction with Digit/Spelling Parsing and MASKED Passwords
 * - Accessible Live Transcript Widget & Voice Status Bar (ARIA Live Regions, High Contrast)
 * - Accessible Voice Settings (Rate, Volume, Voice Gender, Language)
 * - Complete Backward-Compatibility Bridge for window.AutoScribeSpeech
 */

(function (window, document) {
  'use strict';

  // Constants & Enumerations
  const MicState = {
    IDLE: 'idle',
    LISTENING: 'listening',
    PROCESSING: 'processing',
    SUCCESS: 'success',
    ERROR: 'error',
    SPEAKING: 'speaking'
  };

  class VoiceController {
    constructor() {
      this.state = MicState.IDLE;
      this.recognition = null;
      this.synth = window.speechSynthesis || null;
      this.isRecognitionSupported = false;
      this.isSynthSupported = !!this.synth;

      // Settings (persisted in localStorage)
      this.settings = this.loadSettings();

      // Audio & Speech Runtime State
      this.audioCtx = null;
      this.isSpeaking = false;
      this.isListeningActive = false;
      this.lastSpokenText = '';
      this.squelchTimer = null;
      this.keepaliveTimer = null;
      this.recognitionRestartTimer = null;
      this.lastInterimTranscript = '';
      this.lastFinalTranscript = '';

      // Callbacks & Registries
      this.pageCommands = new Map();
      this.globalCommands = new Map();
      this.onTranscriptHook = null;
      this.activeFormWizard = null;
      this.stateListeners = new Set();

      // DOM Elements cache
      this.ui = {
        bar: null,
        statusDot: null,
        statusText: null,
        transcriptPill: null,
        micBtn: null,
        stopBtn: null,
        settingsModal: null
      };

      this.initCapability();
      this.initGlobalCommands();
    }

    /**
     * Load settings from localStorage with accessible defaults
     */
    loadSettings() {
      const defaults = {
        rate: 1.0,
        volume: 1.0,
        pitch: 1.0,
        preferredVoiceGender: 'male',
        preferredLang: 'en-IN',
        autoListen: true,
        highContrastVoiceGuide: true
      };

      try {
        const saved = localStorage.getItem('autoscribe_voice_settings');
        if (saved) {
          return { ...defaults, ...JSON.parse(saved) };
        }
      } catch (e) {
        console.warn("[AutoScribe Voice] Failed to load voice settings from localStorage:", e);
      }
      return defaults;
    }

    saveSettings() {
      try {
        localStorage.setItem('autoscribe_voice_settings', JSON.stringify(this.settings));
      } catch (e) {}
    }

    /**
     * Detect Browser Speech Capabilities
     */
    initCapability() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.isRecognitionSupported = !!SpeechRecognition;

      if (!this.isRecognitionSupported) {
        console.warn("[AutoScribe Voice] Web Speech Recognition is not natively supported in this browser. Voice output is enabled; for speech input, please use Google Chrome or Microsoft Edge.");
      }

      if (this.synth) {
        this.loadVoices();
        if (typeof this.synth.onvoiceschanged !== 'undefined') {
          this.synth.onvoiceschanged = () => this.loadVoices();
        }
      }
    }

    loadVoices() {
      if (!this.synth) return;
      this.voices = this.synth.getVoices() || [];
    }

    /**
     * Mounts Accessible Voice UI Bar and Transcript Region into page
     */
    mountUI() {
      if (document.getElementById('autoscribe-global-voice-container')) {
        this.cacheUIElements();
        return;
      }

      const container = document.createElement('aside');
      container.id = 'autoscribe-global-voice-container';
      container.className = 'autoscribe-voice-system-bar';
      container.setAttribute('aria-label', 'AutoScribe Voice Accessibility Controller');
      container.setAttribute('role', 'region');

      container.innerHTML = `
        <div class="voice-sys-inner">
          <div class="voice-sys-status-group">
            <div id="voiceSysDot" class="voice-sys-dot state-idle" aria-hidden="true"></div>
            <div class="voice-sys-text-wrap">
              <span id="voiceSysStatus" class="voice-sys-status-label" role="status" aria-live="polite">Microphone Idle</span>
              <span id="voiceSysTranscript" class="voice-sys-transcript" aria-live="polite" aria-atomic="true">Say "Help" for voice commands</span>
            </div>
          </div>

          <div class="voice-sys-controls" role="toolbar" aria-label="Voice Controls">
            <button id="voiceSysMicToggle" class="voice-btn voice-btn-mic" aria-label="Toggle Microphone (Shortcut: Alt + M)" title="Toggle Microphone (Alt+M)">
              <span class="btn-icon" aria-hidden="true">🎙️</span>
              <span class="btn-text">Mic</span>
            </button>
            <button id="voiceSysStopBtn" class="voice-btn voice-btn-stop" aria-label="Stop Speaking (Shortcut: Escape or Alt + S)" title="Stop Speaking (Alt+S)">
              <span class="btn-icon" aria-hidden="true">⏹️</span>
              <span class="btn-text">Mute</span>
            </button>
            <button id="voiceSysHelpBtn" class="voice-btn voice-btn-help" aria-label="Voice Help Guide (Shortcut: Alt + H)" title="Voice Commands Guide (Alt+H)">
              <span class="btn-icon" aria-hidden="true">❓</span>
              <span class="btn-text">Help</span>
            </button>
            <button id="voiceSysSettingsBtn" class="voice-btn voice-btn-settings" aria-label="Voice Settings (Shortcut: Alt + O)" title="Voice Settings (Alt+O)">
              <span class="btn-icon" aria-hidden="true">⚙️</span>
              <span class="btn-text">Settings</span>
            </button>
          </div>
        </div>

        <!-- Accessible Voice Settings Modal -->
        <div id="voiceSettingsModal" class="voice-settings-backdrop" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="voiceSettingsTitle">
          <div class="voice-settings-panel">
            <div class="voice-settings-header">
              <h2 id="voiceSettingsTitle" class="voice-settings-title">⚙️ AutoScribe Voice & Accessibility Settings</h2>
              <button id="voiceSettingsCloseBtn" class="voice-settings-close" aria-label="Close Voice Settings">&times;</button>
            </div>
            <div class="voice-settings-body">
              <div class="setting-row">
                <label for="settingSpeechRate" class="setting-label">Speech Reading Speed: <span id="rateDisplay">1.0x</span></label>
                <input type="range" id="settingSpeechRate" min="0.7" max="1.6" step="0.1" value="${this.settings.rate}" class="setting-slider" aria-valuemin="0.7" aria-valuemax="1.6" aria-valuenow="${this.settings.rate}">
              </div>
              <div class="setting-row">
                <label for="settingSpeechVolume" class="setting-label">Speech Volume: <span id="volumeDisplay">100%</span></label>
                <input type="range" id="settingSpeechVolume" min="0.2" max="1.0" step="0.1" value="${this.settings.volume}" class="setting-slider" aria-valuemin="0.2" aria-valuemax="1.0" aria-valuenow="${this.settings.volume}">
              </div>
              <div class="setting-row">
                <label for="settingVoiceGender" class="setting-label">Preferred Voice Gender</label>
                <select id="settingVoiceGender" class="form-control">
                  <option value="male" ${this.settings.preferredVoiceGender === 'male' ? 'selected' : ''}>Male Voice (en-IN)</option>
                  <option value="female" ${this.settings.preferredVoiceGender === 'female' ? 'selected' : ''}>Female Voice (en-IN)</option>
                </select>
              </div>
              <div class="setting-row">
                <label for="settingVoiceLang" class="setting-label">Accent / Language</label>
                <select id="settingVoiceLang" class="form-control">
                  <option value="en-IN" ${this.settings.preferredLang === 'en-IN' ? 'selected' : ''}>Indian English (en-IN)</option>
                  <option value="en-US" ${this.settings.preferredLang === 'en-US' ? 'selected' : ''}>Standard English (en-US)</option>
                  <option value="ta-IN" ${this.settings.preferredLang === 'ta-IN' ? 'selected' : ''}>Tamil / Tanglish (ta-IN / en-IN)</option>
                </select>
              </div>
            </div>
            <div class="voice-settings-footer">
              <button id="voiceSettingsTestBtn" class="btn btn-secondary">🔊 Test Voice</button>
              <button id="voiceSettingsSaveBtn" class="btn btn-primary">Save & Apply</button>
            </div>
          </div>
        </div>
      `;

      // Prepend to top of body or header
      const header = document.querySelector('.app-header');
      if (header && header.parentNode) {
        header.parentNode.insertBefore(container, header.nextSibling);
      } else {
        document.body.insertBefore(container, document.body.firstChild);
      }

      this.cacheUIElements();
      this.attachUIEventListeners();
    }

    cacheUIElements() {
      this.ui.bar = document.getElementById('autoscribe-global-voice-container');
      this.ui.statusDot = document.getElementById('voiceSysDot');
      this.ui.statusText = document.getElementById('voiceSysStatus');
      this.ui.transcriptPill = document.getElementById('voiceSysTranscript');
      this.ui.micBtn = document.getElementById('voiceSysMicToggle');
      this.ui.stopBtn = document.getElementById('voiceSysStopBtn');
      this.ui.settingsModal = document.getElementById('voiceSettingsModal');
    }

    attachUIEventListeners() {
      if (this.ui.micBtn) {
        this.ui.micBtn.addEventListener('click', () => {
          if (this.isListeningActive) {
            this.stopListening();
            this.speak("Microphone paused.");
          } else {
            this.startListening();
            this.speak("Microphone active. I am listening.");
          }
        });
      }

      if (this.ui.stopBtn) {
        this.ui.stopBtn.addEventListener('click', () => {
          this.stopSpeaking();
          this.setMicrophoneState(MicState.IDLE, 'Speech paused.');
        });
      }

      const helpBtn = document.getElementById('voiceSysHelpBtn');
      if (helpBtn) {
        helpBtn.addEventListener('click', () => this.speakHelpGuide());
      }

      const settingsBtn = document.getElementById('voiceSysSettingsBtn');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => this.openSettingsModal());
      }

      const closeBtn = document.getElementById('voiceSettingsCloseBtn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeSettingsModal());
      }

      const saveBtn = document.getElementById('voiceSettingsSaveBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.applyAndSaveSettings());
      }

      const testBtn = document.getElementById('voiceSettingsTestBtn');
      if (testBtn) {
        testBtn.addEventListener('click', () => {
          const gender = document.getElementById('settingVoiceGender')?.value || 'male';
          const rate = parseFloat(document.getElementById('settingSpeechRate')?.value) || 1.0;
          this.speak("Hello! This is your AutoScribe voice accessibility assistant.", null, {
            gender,
            rate
          });
        });
      }

      // Slider dynamic labels
      const rateSlider = document.getElementById('settingSpeechRate');
      const rateLabel = document.getElementById('rateDisplay');
      if (rateSlider && rateLabel) {
        rateSlider.addEventListener('input', (e) => {
          rateLabel.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
        });
      }

      const volSlider = document.getElementById('settingSpeechVolume');
      const volLabel = document.getElementById('volumeDisplay');
      if (volSlider && volLabel) {
        volSlider.addEventListener('input', (e) => {
          volLabel.textContent = `${Math.round(parseFloat(e.target.value) * 100)}%`;
        });
      }

      // Keyboard Accessibility Shortcuts
      window.addEventListener('keydown', (e) => {
        // Alt + M: Toggle Mic
        if (e.altKey && (e.key === 'm' || e.key === 'M')) {
          e.preventDefault();
          this.ui.micBtn?.click();
        }
        // Alt + S or Escape: Stop Speaking
        else if ((e.altKey && (e.key === 's' || e.key === 'S')) || e.key === 'Escape') {
          if (this.isSpeaking) {
            e.preventDefault();
            this.stopSpeaking();
          }
        }
        // Alt + R: Read Page / Repeat
        else if (e.altKey && (e.key === 'r' || e.key === 'R')) {
          e.preventDefault();
          this.readCurrentPage();
        }
        // Alt + H: Help Guide
        else if (e.altKey && (e.key === 'h' || e.key === 'H')) {
          e.preventDefault();
          this.speakHelpGuide();
        }
        // Alt + O: Settings Modal
        else if (e.altKey && (e.key === 'o' || e.key === 'O')) {
          e.preventDefault();
          this.openSettingsModal();
        }
      });
    }

    openSettingsModal() {
      if (this.ui.settingsModal) {
        this.ui.settingsModal.style.display = 'flex';
        document.getElementById('voiceSettingsCloseBtn')?.focus();
        this.speak("Voice settings dialog opened.");
      }
    }

    closeSettingsModal() {
      if (this.ui.settingsModal) {
        this.ui.settingsModal.style.display = 'none';
        this.speak("Settings dialog closed.");
      }
    }

    applyAndSaveSettings() {
      const rate = parseFloat(document.getElementById('settingSpeechRate')?.value) || 1.0;
      const volume = parseFloat(document.getElementById('settingSpeechVolume')?.value) || 1.0;
      const gender = document.getElementById('settingVoiceGender')?.value || 'male';
      const lang = document.getElementById('settingVoiceLang')?.value || 'en-IN';

      this.settings.rate = rate;
      this.settings.volume = volume;
      this.settings.preferredVoiceGender = gender;
      this.settings.preferredLang = lang;
      this.saveSettings();

      this.closeSettingsModal();
      this.speak("Voice settings saved and applied.");
    }

    /**
     * Updates visual and accessible state pill
     */
    setMicrophoneState(state, statusMessage, transcriptText = null, isMasked = false) {
      this.state = state;

      if (this.ui.statusDot) {
        this.ui.statusDot.className = `voice-sys-dot state-${state}`;
      }

      if (this.ui.statusText && statusMessage) {
        this.ui.statusText.textContent = statusMessage;
      }

      if (this.ui.transcriptPill && transcriptText !== null) {
        if (isMasked) {
          this.ui.transcriptPill.textContent = `Password: ${'•'.repeat(Math.max(6, transcriptText.length))}`;
        } else {
          this.ui.transcriptPill.textContent = transcriptText;
        }
      }

      // Also sync existing page status bars if they exist in legacy DOM
      const legacyState = document.getElementById('speechStatusText') || 
                          document.getElementById('voiceLoginState') || 
                          document.getElementById('dashboardStatusText');
      if (legacyState && statusMessage) {
        legacyState.innerHTML = statusMessage;
      }
      const legacyDot = document.getElementById('statusDot');
      if (legacyDot) {
        legacyDot.className = `status-dot ${state === MicState.LISTENING ? 'active' : ''}`;
      }

      // Notify any registered state listeners
      this.stateListeners.forEach(listener => {
        try { listener(this.state, statusMessage, transcriptText); } catch (e) {}
      });
    }

    onStateChange(callback) {
      if (typeof callback === 'function') {
        this.stateListeners.add(callback);
      }
    }

    /**
     * High-Level Speech Synthesis with keepalive & anti-loopback
     */
    speak(text, onEndCallback = null, customOptions = {}) {
      if (!text || typeof text !== 'string') {
        if (onEndCallback) onEndCallback();
        return;
      }

      const cleanText = text.trim();
      this.lastSpokenText = cleanText;

      // Squelch active recognition while speaking to prevent feedback loops
      this.pauseRecognitionForSpeech();
      this.isSpeaking = true;
      this.setMicrophoneState(MicState.SPEAKING, "AutoScribe Speaking...", cleanText);

      if (!this.synth) {
        console.warn("[AutoScribe Voice] SpeechSynthesis unavailable:", cleanText);
        this.isSpeaking = false;
        this.setMicrophoneState(MicState.IDLE, "Speech output unavailable");
        if (onEndCallback) onEndCallback();
        return;
      }

      // Cancel previous utterances
      window.speechSynthesis.cancel();
      if (this.keepaliveTimer) {
        clearInterval(this.keepaliveTimer);
        this.keepaliveTimer = null;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);

      // Apply settings
      const rate = customOptions.rate || this.settings.rate || 1.0;
      const volume = customOptions.volume || this.settings.volume || 1.0;
      const pitch = customOptions.pitch || this.settings.pitch || 1.0;
      const gender = customOptions.gender || this.settings.preferredVoiceGender || 'male';
      const lang = customOptions.lang || this.settings.preferredLang || 'en-IN';

      utterance.rate = Math.max(0.6, Math.min(1.8, rate));
      utterance.volume = Math.max(0, Math.min(1.0, volume));
      utterance.pitch = Math.max(0.7, Math.min(1.3, pitch));

      const selectedVoice = this.pickBestVoice(gender, lang);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = lang;
      }

      let finished = false;
      const cleanupAndResume = () => {
        if (finished) return;
        finished = true;

        if (this.keepaliveTimer) {
          clearInterval(this.keepaliveTimer);
          this.keepaliveTimer = null;
        }

        // Post-speech squelch buffer (350ms) to ensure laptop speaker echo completely subsides
        clearTimeout(this.squelchTimer);
        this.squelchTimer = setTimeout(() => {
          this.isSpeaking = false;
          if (this.isListeningActive) {
            this.setMicrophoneState(MicState.LISTENING, "Microphone Listening...", "I am listening for commands");
            this.resumeRecognition();
          } else {
            this.setMicrophoneState(MicState.IDLE, "Microphone Idle");
          }

          if (typeof onEndCallback === 'function') {
            onEndCallback();
          }
        }, 350);
      };

      utterance.onend = cleanupAndResume;
      utterance.onerror = (err) => {
        console.warn("[AutoScribe Voice] Utterance finished with notice:", err.error || err);
        cleanupAndResume();
      };

      // Anti-stall ping for Chromium / Edge on long text blocks
      this.keepaliveTimer = setInterval(() => {
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      try {
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error("[AutoScribe Voice] Exception speaking text:", e);
        cleanupAndResume();
      }
    }

    stopSpeaking() {
      if (this.synth) {
        window.speechSynthesis.cancel();
      }
      if (this.keepaliveTimer) {
        clearInterval(this.keepaliveTimer);
        this.keepaliveTimer = null;
      }
      this.isSpeaking = false;
    }

    pickBestVoice(gender = 'male', lang = 'en-IN') {
      if (!this.voices || this.voices.length === 0) {
        this.loadVoices();
      }
      const list = this.voices || [];
      if (list.length === 0) return null;

      const g = String(gender).toLowerCase();
      const targetLang = String(lang).toLowerCase().replace('_', '-');

      // 1. Language matching candidate (e.g. en-in, ta-in)
      const langMatches = list.filter(v => (v.lang || '').toLowerCase().replace('_', '-') === targetLang);
      if (langMatches.length > 0) {
        if (g === 'female') {
          const f = langMatches.find(v => /\b(female|veena|heera|neerja|zira|kavita|priya|google)\b/i.test(v.name));
          if (f) return f;
        } else {
          const m = langMatches.find(v => /\b(male|rishi|prabhat|david|mark|google)\b/i.test(v.name));
          if (m) return m;
        }
        return langMatches[0];
      }

      // 2. Fallback to any English voice
      const anyEn = list.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
      if (anyEn.length > 0) {
        if (g === 'female') {
          const f = anyEn.find(v => /\b(female|zira|samantha|victoria|karen)\b/i.test(v.name));
          if (f) return f;
        } else {
          const m = anyEn.find(v => /\b(male|david|alex|george|daniel)\b/i.test(v.name));
          if (m) return m;
        }
        return anyEn[0];
      }

      return list[0];
    }

    /**
     * Speech Recognition Engine Initialization
     */
    initRecognition() {
      if (this.recognition) return true;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.setMicrophoneState(MicState.ERROR, "Browser microphone not supported. Please use Chrome or Edge.");
        return false;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.settings.preferredLang || 'en-IN';

      this.recognition.onstart = () => {
        this.setMicrophoneState(MicState.LISTENING, "Listening for commands or answers...", "Say a command or dictate your answer");
      };

      this.recognition.onresult = (event) => {
        // Discard any audio heard while TTS is speaking to prevent self-loopback
        if (this.isSpeaking || (this.synth && this.synth.speaking)) {
          return;
        }

        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        const heardText = (final || interim).trim();
        if (!heardText) return;

        // Discard speaker echo prompt loopbacks
        if (this.isSpeakerEcho(heardText)) {
          return;
        }

        const isFinal = Boolean(final);
        this.lastInterimTranscript = interim;
        if (isFinal) {
          this.lastFinalTranscript = final;
        }

        // Active Form Wizard Interception (if currently guiding through a form)
        if (this.activeFormWizard) {
          this.setMicrophoneState(MicState.PROCESSING, "Transcribing form input...", heardText, this.activeFormWizard.isPasswordField);
          this.activeFormWizard.handleInput(heardText, isFinal);
          return;
        }

        // Dedicated Page Transcript Hook (e.g. ExamSession answer dictation)
        if (this.onTranscriptHook) {
          const handled = this.onTranscriptHook(heardText, isFinal);
          if (handled === true) {
            return;
          }
        }

        // Global Command Processing (only on final speech or high-confidence single words)
        if (isFinal || this.isImmediateCommand(heardText)) {
          this.setMicrophoneState(MicState.PROCESSING, `Command: "${heardText}"`, heardText);
          const executed = this.executeCommand(heardText);
          if (executed) {
            this.setMicrophoneState(MicState.SUCCESS, `Command recognized: "${heardText}"`, heardText);
          } else if (isFinal) {
            this.setMicrophoneState(MicState.LISTENING, "Listening...", `Heard: "${heardText}"`);
          }
        } else {
          this.setMicrophoneState(MicState.LISTENING, "Listening...", heardText);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn("[AutoScribe Voice] Recognition Notice:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.isListeningActive = false;
          this.setMicrophoneState(
            MicState.ERROR, 
            "Microphone permission blocked. Please allow microphone access in your browser bar.",
            "Mic Permission Required"
          );
        } else if (event.error === 'no-speech') {
          // Normal silence, keep listening
        } else if (event.error === 'network') {
          this.setMicrophoneState(MicState.ERROR, "Network speech recognition error. Retrying in 1s...", "Network Error");
          this.debounceRestart(1000);
        }
      };

      this.recognition.onend = () => {
        if (this.isListeningActive && !this.isSpeaking) {
          this.debounceRestart(250);
        } else if (!this.isListeningActive) {
          this.setMicrophoneState(MicState.IDLE, "Microphone Idle");
        }
      };

      return true;
    }

    debounceRestart(delayMs = 250) {
      clearTimeout(this.recognitionRestartTimer);
      this.recognitionRestartTimer = setTimeout(() => {
        try {
          if (this.isListeningActive && !this.isSpeaking && this.recognition) {
            this.recognition.start();
          }
        } catch (e) {
          // Already active or starting
        }
      }, delayMs);
    }

    pauseRecognitionForSpeech() {
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
      }
    }

    resumeRecognition() {
      if (this.isListeningActive && this.recognition && !this.isSpeaking) {
        try { this.recognition.start(); } catch (e) {}
      }
    }

    startListening(customHook = null) {
      if (!this.initRecognition()) return;

      this.isListeningActive = true;
      if (customHook) {
        this.onTranscriptHook = customHook;
      }

      try {
        this.recognition.start();
        this.setMicrophoneState(MicState.LISTENING, "Microphone Active & Listening...");
      } catch (e) {
        // Recognition may already be running
      }
    }

    stopListening() {
      this.isListeningActive = false;
      this.onTranscriptHook = null;
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
      }
      this.setMicrophoneState(MicState.IDLE, "Microphone Inactive (Paused)");
    }

    /**
     * Squelch filter against echo from laptop speakers
     */
    isSpeakerEcho(text) {
      const lower = text.toLowerCase();
      const echoPatterns = [
        /welcome to autoscribe/i,
        /microphone is active/i,
        /can i read the question/i,
        /say read again or i will write/i,
        /please say read again/i,
        /please say your answer/i,
        /if you want to change it say change/i,
        /otherwise say no changes/i,
        /can i read your answer/i,
        /exam or move to the next subject/i,
        /congratulations your examination/i
      ];
      return echoPatterns.some(p => p.test(lower));
    }

    isImmediateCommand(text) {
      const lower = text.toLowerCase().trim();
      return /^(stop|help|repeat|back|yes|no|login|start)$/i.test(lower);
    }

    /**
     * Shared Command Parser and Registry
     */
    initGlobalCommands() {
      // 1. Navigation Commands
      this.registerGlobalCommand(
        /\b(open\s*login|go\s*to\s*login|student\s*login|sign\s*in|login)\b/i,
        () => this.navigateTo('login.html', 'Opening student login page.'),
        'Open login screen'
      );

      this.registerGlobalCommand(
        /\b(open\s*student\s*dashboard|student\s*dashboard|go\s*to\s*dashboard|open\s*dashboard|dashboard)\b/i,
        () => this.navigateTo('dashboard.html', 'Opening student dashboard.'),
        'Open student dashboard'
      );

      this.registerGlobalCommand(
        /\b(open\s*teacher\s*dashboard|teacher\s*dashboard|teacher\s*portal|admin\s*portal|open\s*admin|admin)\b/i,
        () => this.navigateTo('admin.html', 'Opening teacher and administrator portal.'),
        'Open teacher portal'
      );

      this.registerGlobalCommand(
        /\b(open\s*exams|view\s*exams|scheduled\s*exams|available\s*exams|exams)\b/i,
        () => this.navigateTo('dashboard.html', 'Opening scheduled exams list.'),
        'List available exams'
      );

      this.registerGlobalCommand(
        /\b(open\s*settings|voice\s*settings|settings|preferences)\b/i,
        () => this.openSettingsModal(),
        'Open voice and accessibility settings'
      );

      this.registerGlobalCommand(
        /\b(go\s*back|back\s*page|previous\s*page|back)\b/i,
        () => {
          this.speak("Going back to previous page.", () => window.history.back());
        },
        'Go back to previous page'
      );

      this.registerGlobalCommand(
        /\b(go\s*to\s*home|go\s*home|home\s*page|main\s*menu|home)\b/i,
        () => this.navigateTo('index.html', 'Returning to main home menu.'),
        'Go to home page'
      );

      // 2. Speech & Assistance Control Commands
      this.registerGlobalCommand(
        /\b(read\s*this\s*page|read\s*page|where\s*am\s*i|describe\s*page)\b/i,
        () => this.readCurrentPage(),
        'Read page description and active options'
      );

      this.registerGlobalCommand(
        /\b(repeat|say\s*again|read\s*again)\b/i,
        () => {
          if (this.lastSpokenText) {
            this.speak(this.lastSpokenText);
          } else {
            this.speak("Nothing to repeat. Say Help for instructions.");
          }
        },
        'Repeat last audio prompt'
      );

      this.registerGlobalCommand(
        /\b(stop\s*speaking|shut\s*up|silence|be\s*quiet|mute|stop\s*audio)\b/i,
        () => {
          this.stopSpeaking();
          this.setMicrophoneState(MicState.IDLE, "Audio muted by voice command.");
        },
        'Stop and cancel active speech playback'
      );

      this.registerGlobalCommand(
        /\b(help|what\s*can\s*i\s*say|commands|voice\s*help)\b/i,
        () => this.speakHelpGuide(),
        'Speak list of available voice commands'
      );

      this.registerGlobalCommand(
        /\b(high\s*contrast|toggle\s*contrast)\b/i,
        () => {
          if (window.AutoScribeApp) {
            window.AutoScribeApp.toggleHighContrast();
          }
        },
        'Toggle high-contrast display'
      );
    }

    registerGlobalCommand(regexPattern, handler, description) {
      this.globalCommands.set(regexPattern, { handler, description });
    }

    registerPageCommand(pageId, regexPattern, handler, description) {
      if (!this.pageCommands.has(pageId)) {
        this.pageCommands.set(pageId, new Map());
      }
      this.pageCommands.get(pageId).set(regexPattern, { handler, description });
    }

    getCurrentPageId() {
      const path = (window.location.pathname || '').toLowerCase();
      if (path.endsWith('login.html') || path.includes('/login')) return 'login';
      if (path.endsWith('dashboard.html') || path.includes('/dashboard')) return 'dashboard';
      if (path.endsWith('exam.html') || path.includes('/exam')) return 'exam';
      if (path.endsWith('confirmation.html') || path.includes('/confirmation')) return 'confirmation';
      if (path.endsWith('admin.html') || path.includes('/admin')) return 'admin';
      return 'index';
    }

    executeCommand(rawText) {
      if (!rawText) return false;
      const text = rawText.trim();
      const currentPageId = this.getCurrentPageId();

      // 1. Check page-specific commands first
      const pageCmds = this.pageCommands.get(currentPageId);
      if (pageCmds) {
        for (const [pattern, item] of pageCmds.entries()) {
          if (pattern.test(text)) {
            console.log(`[AutoScribe Voice] Matched Page Command (${currentPageId}):`, pattern);
            item.handler(text);
            return true;
          }
        }
      }

      // 2. Check global commands
      for (const [pattern, item] of this.globalCommands.entries()) {
        if (pattern.test(text)) {
          console.log("[AutoScribe Voice] Matched Global Command:", pattern);
          item.handler(text);
          return true;
        }
      }

      return false;
    }

    navigateTo(targetUrl, announcement) {
      this.stopSpeaking();
      this.stopListening();
      this.speak(announcement, () => {
        window.location.href = targetUrl;
      });
      // Safety navigation timeout
      setTimeout(() => { window.location.href = targetUrl; }, 1200);
    }

    readCurrentPage() {
      const pageId = this.getCurrentPageId();
      let summary = "";

      switch (pageId) {
        case 'index':
          summary = "AutoScribe Home Page. You can say: Login to access your student profile, Start Exam to begin immediately, or Teacher Portal for administrator sign in.";
          break;
        case 'login':
          summary = "Student Voice Login. Say your Roll Number, followed by your Student Name. You can spell your name letter by letter.";
          break;
        case 'dashboard':
          summary = "Student Examination Dashboard. Available scheduled subjects are listed. Say 'Read subjects' to listen to available examinations, or say 'Start' to enter a subject.";
          break;
        case 'exam':
          summary = "Active Examination Session. Say 'Read question' to hear the question, 'Start answer' to dictate, 'Read my answer' to review, 'Next question' to advance, or 'Submit exam' when finished.";
          break;
        case 'confirmation':
          summary = "Examination Submission Confirmation. Your examination has been timestamped and locked in the database. Say 'Dashboard' or 'Home' to return.";
          break;
        case 'admin':
          summary = "Teacher and Coordinator Portal. You can sign in with examiner credentials, create examinations, or inspect student submissions.";
          break;
        default:
          summary = "AutoScribe Accessible Examination Aid. Say 'Help' to hear available voice commands.";
      }

      this.speak(summary);
    }

    speakHelpGuide() {
      const pageId = this.getCurrentPageId();
      let help = "Here are the voice commands you can speak: ";

      // Global navigation commands
      help += "Global navigation: Say 'Go to home', 'Open login', 'Open dashboard', 'Open teacher dashboard', 'Open settings', 'Go back', 'Read this page', or 'Stop speaking'. ";

      // Page-specific commands
      if (pageId === 'exam') {
        help += "In this exam, say: 'Read question', 'Start answer' or 'I will write', 'Read my answer', 'Delete last sentence', 'Clear answer', 'Next question', 'Previous question', or 'Submit exam'.";
      } else if (pageId === 'login') {
        help += "On this login screen, say your roll number clearly. Then say your student name. Say 'Confirm' or 'Login' to proceed.";
      } else if (pageId === 'dashboard') {
        help += "On this dashboard, say 'Read subjects', 'Start', or 'Next subject'.";
      } else if (pageId === 'admin') {
        help += "In the teacher portal, say 'Sign in', 'Create exam', 'Read submissions', or 'Refresh submissions'.";
      }

      this.speak(help);
    }

    /**
     * Voice-Guided Form Interaction Wizard
     */
    startFormWizard(formElement, options = {}) {
      if (!formElement) return null;

      const wizard = {
        controller: this,
        form: formElement,
        fields: Array.from(formElement.querySelectorAll('input:not([type="hidden"]), select, textarea')),
        currentIndex: 0,
        isPasswordField: false,
        isConfirming: false,
        pendingValue: '',

        start() {
          if (this.fields.length === 0) return;
          this.currentIndex = 0;
          this.controller.activeFormWizard = this;
          this.promptCurrentField();
        },

        getCurrentField() {
          return this.fields[this.currentIndex];
        },

        promptCurrentField() {
          const field = this.getCurrentField();
          if (!field) {
            this.confirmSubmission();
            return;
          }

          field.focus();
          const label = this.getFieldLabel(field);
          this.isPasswordField = (field.type === 'password');
          this.isConfirming = false;
          this.pendingValue = '';

          let prompt = `Please say your ${label}. `;
          if (this.isPasswordField) {
            prompt += "For your security, passwords are never spoken aloud and are masked on screen. Speak your password clearly.";
          } else if (field.name === 'rollNumber' || field.id.includes('roll') || field.id.includes('Id')) {
            prompt += "You can speak digits or code like two five I S R zero two three.";
          } else if (field.tagName === 'SELECT') {
            prompt += "Say your preferred option.";
          }

          this.controller.speak(prompt, () => {
            this.controller.startListening();
          });
        },

        getFieldLabel(field) {
          if (field.labels && field.labels.length > 0) {
            return field.labels[0].innerText.replace('*', '').trim();
          }
          const prev = field.previousElementSibling;
          if (prev && prev.tagName === 'LABEL') {
            return prev.innerText.replace('*', '').trim();
          }
          return field.placeholder || field.name || 'field';
        },

        handleInput(rawTranscript, isFinal) {
          if (!isFinal && !this.controller.isImmediateCommand(rawTranscript)) {
            return;
          }

          const text = rawTranscript.trim();
          const lower = text.toLowerCase();

          // Global escape commands inside form
          if (/\b(cancel|exit\s*form|stop)\b/i.test(lower)) {
            this.controller.activeFormWizard = null;
            this.controller.speak("Form entry cancelled. Microphone paused.");
            return;
          }
          if (/\b(help|commands)\b/i.test(lower)) {
            this.controller.speak("Please say your value. Say 'Skip' to move to next field, or 'Cancel' to exit.");
            return;
          }
          if (/\b(skip|next\s*field)\b/i.test(lower)) {
            this.currentIndex++;
            this.promptCurrentField();
            return;
          }

          const field = this.getCurrentField();
          if (!field) return;

          // If awaiting confirmation of previous entry
          if (this.isConfirming) {
            if (/\b(yes|yeah|correct|right|confirm|okay|ok|submit)\b/i.test(lower)) {
              // Apply confirmed value
              field.value = this.pendingValue;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));

              this.currentIndex++;
              this.promptCurrentField();
            } else if (/\b(no|nope|wrong|retry|change)\b/i.test(lower)) {
              this.promptCurrentField();
            } else {
              this.controller.speak("Please say Yes to confirm, or No to try again.");
            }
            return;
          }

          // Process field entry
          let parsedValue = text;
          if (field.type === 'number') {
            parsedValue = this.parseDigits(text);
          } else if (field.name === 'rollNumber' || field.id.includes('roll') || field.id.includes('Id')) {
            parsedValue = this.parseRollNumber(text);
          } else if (field.type === 'email') {
            parsedValue = this.parseEmail(text);
          } else if (field.type !== 'password') {
            parsedValue = this.parseNameOrSpelling(text);
          }

          this.pendingValue = parsedValue;
          this.isConfirming = true;

          if (this.isPasswordField) {
            this.controller.speak("Password recorded securely. Say Yes to confirm, or No to re-enter.");
          } else {
            this.controller.speak(`I heard ${parsedValue}. Is that correct? Say Yes or No.`);
          }
        },

        confirmSubmission() {
          this.controller.speak("All fields completed. Submitting form now.", () => {
            this.controller.activeFormWizard = null;
            this.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          });
        },

        parseDigits(text) {
          const map = { 'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9' };
          let res = text.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, m => map[m]);
          res = res.replace(/[^\d]/g, '');
          return res;
        },

        parseRollNumber(text) {
          let str = text.trim().toLowerCase();
          str = str.replace(/^(my\s+)?(roll\s+number|student\s+id|id|number)(\s+is)?\s*/i, '');
          str = str.replace(/\b(dash|hyphen|minus)\b/gi, '-');
          str = str.replace(/\b(space|blank)\b/gi, '');
          const numMap = { 'zero': '0', 'oh': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9' };
          str = str.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, m => numMap[m] || m);
          return str.replace(/\s+/g, '').toUpperCase();
        },

        parseEmail(text) {
          let str = text.trim().toLowerCase();
          str = str.replace(/\b(at\s*the\s*rate|at\s*rate|at)\b/gi, '@');
          str = str.replace(/\b(dot|period)\b/gi, '.');
          str = str.replace(/\s+/g, '');
          return str;
        },

        parseNameOrSpelling(text) {
          let str = text.trim().replace(/\b(space|blank)\b/gi, ' ');
          // Collapse multiple spaces
          return str.replace(/\s+/g, ' ');
        }
      };

      wizard.start();
      return wizard;
    }

    /**
     * Connect and Wire All Existing Pages Smoothly
     */
    wirePageAccessibility() {
      this.mountUI();

      const pageId = this.getCurrentPageId();
      console.log(`[AutoScribe Voice] Page detected: ${pageId}. Wiring page accessibility.`);

      // Page-specific setup
      if (pageId === 'index') {
        this.wireIndexPage();
      } else if (pageId === 'dashboard') {
        this.wireDashboardPage();
      } else if (pageId === 'admin') {
        this.wireAdminPage();
      } else if (pageId === 'confirmation') {
        this.wireConfirmationPage();
      }
    }

    wireIndexPage() {
      this.registerPageCommand('index', /\b(start\s*exam|launch\s*exam|begin\s*exam)\b/i, () => {
        if (window.AutoScribeApp) AutoScribeApp.navigateToExam();
      }, 'Direct exam launch');

      this.registerPageCommand('index', /\b(student\s*login|login|sign\s*in)\b/i, () => {
        if (window.AutoScribeApp) AutoScribeApp.navigateToLogin();
      }, 'Student login');
    }

    wireDashboardPage() {
      this.registerPageCommand('dashboard', /\b(read\s*subjects|read\s*exams|list\s*exams)\b/i, () => {
        const cards = document.querySelectorAll('[id^="examCard_"]');
        if (cards.length === 0) {
          this.speak("No examinations currently available.");
          return;
        }
        let listStr = `There are ${cards.length} available exams. `;
        cards.forEach((c, idx) => {
          const title = c.querySelector('h3')?.textContent || `Exam ${idx + 1}`;
          listStr += `Subject ${idx + 1}: ${title}. `;
        });
        listStr += "Say 'Start subject 1' or click start to begin.";
        this.speak(listStr);
      }, 'Read available subject list');

      this.registerPageCommand('dashboard', /\b(start\s*subject\s*(\d+)|start\s*exam\s*(\d+)|subject\s*(\d+))\b/i, (text) => {
        const match = text.match(/\d+/);
        if (match) {
          const idx = parseInt(match[0], 10) - 1;
          const card = document.getElementById(`examCard_${idx}`);
          const link = card?.querySelector('a');
          if (link) {
            this.speak(`Starting subject ${idx + 1}.`, () => link.click());
            return;
          }
        }
        this.speak("Subject not found. Say 'Read subjects' to list available options.");
      }, 'Start selected subject');
    }

    wireAdminPage() {
      // Teacher Login Form by Voice
      const teacherForm = document.getElementById('teacherLoginForm');
      if (teacherForm) {
        this.registerPageCommand('admin', /\b(voice\s*login|sign\s*in\s*by\s*voice|fill\s*login|start\s*login)\b/i, () => {
          this.speak("Starting voice-guided examiner login.", () => {
            this.startFormWizard(teacherForm);
          });
        }, 'Voice-guided teacher login');
      }

      // Read submissions by voice
      this.registerPageCommand('admin', /\b(read\s*submissions|check\s*submissions|list\s*submissions)\b/i, () => {
        const rows = document.querySelectorAll('#submissionsTableBody tr');
        if (!rows || rows.length === 0) {
          this.speak("No student exam submissions recorded yet in the database.");
          return;
        }
        let msg = `Found ${rows.length} student submissions. `;
        rows.forEach((r, idx) => {
          const cells = r.querySelectorAll('td');
          if (cells.length >= 5) {
            const roll = cells[1]?.textContent?.trim() || `Candidate ${idx + 1}`;
            const status = cells[4]?.textContent?.trim() || 'Submitted';
            msg += `Candidate ${idx + 1}: ${roll}, status ${status}. `;
          }
        });
        this.speak(msg);
      }, 'Read student submissions aloud');

      // Refresh submissions
      this.registerPageCommand('admin', /\b(refresh\s*submissions|update\s*submissions|reload\s*submissions)\b/i, () => {
        if (window.AutoScribeAdmin) {
          this.speak("Refreshing submissions from central database.", () => {
            window.AutoScribeAdmin.renderSubmissions();
          });
        }
      }, 'Refresh submissions from database');

      // Create new exam by voice
      const createExamForm = document.getElementById('createExamForm');
      if (createExamForm) {
        this.registerPageCommand('admin', /\b(create\s*exam\s*by\s*voice|voice\s*create\s*exam|new\s*exam)\b/i, () => {
          this.speak("Starting voice-guided examination creation.", () => {
            this.startFormWizard(createExamForm);
          });
        }, 'Voice-guided exam creation');
      }
    }

    wireConfirmationPage() {
      this.registerPageCommand('confirmation', /\b(read\s*receipt|read\s*details|summary)\b/i, () => {
        const receipt = document.getElementById('receiptContainer');
        if (receipt) {
          this.speak(receipt.innerText.replace(/\n+/g, '. '));
        }
      }, 'Read submission confirmation receipt');
    }

    /**
     * Audio Context gesture unlocker
     */
    getAudioContext() {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    }
  }

  // Create Universal Singleton Instance
  const controller = new VoiceController();
  window.AutoScribeVoice = controller;

  // Backward-Compatibility Bridge for window.AutoScribeSpeech (only if speech-engine.js is not present)
  if (!window.AutoScribeSpeech || !window.AutoScribeSpeech.parseSpokenNameOrSpelling) {
    window.AutoScribeSpeech = {
      get isListening() { return controller.isListeningActive; },
      get speechActive() { return controller.isSpeaking; },
      get recognition() { return controller.recognition; },
      get synth() { return controller.synth; },
      
      init() { return controller.initRecognition(); },
      speak(text, onEnd) { controller.speak(text, onEnd); },
      speakText(text, gender, speed, onEnd) {
        controller.speak(text, onEnd, { gender, rate: parseFloat(speed) || 1.0 });
      },
      stopSpeaking() { controller.stopSpeaking(); },
      startListening(onTranscript, onCommand, options) {
        controller.startListening((heardText, isFinal) => {
          if (onTranscript) onTranscript(heardText, isFinal);
          if (onCommand && isFinal) {
            controller.executeCommand(heardText);
          }
        });
      },
      stopListening() { controller.stopListening(); },
      getAudioContext() { return controller.getAudioContext(); },
      normalizeTranscript(t) { return (t || '').toLowerCase().trim(); },
      normalizeRollNumber(t) {
        if (controller.activeFormWizard) {
          return controller.activeFormWizard.parseRollNumber(t);
        }
        return (t || '').toUpperCase().replace(/\s+/g, '');
      },
      updateVoiceLogDisplay(text, type) {
        controller.setMicrophoneState(
          type === 'error' ? MicState.ERROR : MicState.LISTENING,
          text,
          text
        );
      }
    };
  } else {
    // Preserve full AutoScribeSpeech engine from speech-engine.js, and link controller
    window.AutoScribeSpeech.voiceController = controller;
  }

  // Auto-wire upon DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => controller.wirePageAccessibility());
  } else {
    controller.wirePageAccessibility();
  }

})(window, document);
