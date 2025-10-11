// popup.js (Milo Mate AI Assistant)

const defaultLang = document.getElementById('default-lang');
const translateInput = document.getElementById('translate-input');
const translateOutput = document.getElementById('translate-output');
const translateBtn = document.getElementById('translate-btn');
const fromLang = document.getElementById('from-lang');
const toLang = document.getElementById('to-lang');
const swapBtn = document.getElementById('swap-languages');

// ADD to initializeEventListeners():
defaultLang.addEventListener('change', saveUserPreferences);
translateBtn.addEventListener('click', handleTranslation);
swapBtn.addEventListener('click', swapLanguages);

document.addEventListener('DOMContentLoaded', async() => {
    await initLanguageDetector();

  // --- 1. Tab switching logic ---
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab + '-content';
      const targetContent = document.getElementById(targetId);
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

  // --- 2. Chat logic ---
  const chatInputField = document.getElementById('chat-input-field');
  const sendButton = document.getElementById('send-btn');
  const chatMessages = document.getElementById('chat-messages');

  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('[Popup]', ...args);

  const createMessageElement = (text, type) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type);

    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble');

    const textElement = document.createElement('div');
    textElement.classList.add('message-text');
    textElement.textContent = text;

    const timeElement = document.createElement('div');
    timeElement.classList.add('message-time');
    timeElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageBubble.appendChild(textElement);
    messageBubble.appendChild(timeElement);
    messageElement.appendChild(messageBubble);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageElement;
  };
    // <-- Add this line right after createMessageElement definition:
  window.createMessageElement = createMessageElement;

  const handleSend = async () => {
    const query = chatInputField.value.trim();
    if (!query) return;

    createMessageElement(query, 'user');
    chatInputField.value = '';

    const statusMessage = createMessageElement('🔍 Scraping current page...', 'assistant');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found.');

      // Send message to content script (assumes content.js is loaded via manifest)
      const scrapedRes = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' });

      if (!scrapedRes?.ok) {
        statusMessage.querySelector('.message-text').textContent =
          '❌ Failed to scrape page. Please refresh or reload the tab.';
        console.log('Scrape failed:', scrapedRes);
        return;
      }

      const scrapedData = scrapedRes.data;
      console.log('✅ Got structured page data:', scrapedData);

      // Ask query to background
      statusMessage.querySelector('.message-text').textContent = '🧠 Thinking...';
      console.log("[Popup] : Sending query from popup.js to background.js = ",query);
      const res = await chrome.runtime.sendMessage({
        type: 'ASK_QUERY',
        page: scrapedData,
        query
      });
      
      if (res?.ok) {
  const answer = res.answer;
  statusMessage.querySelector(".message-text").textContent = answer;

  // ✅ Save latest response
  window.latestAIResponse = answer;

  // ✅ Auto-play TTS (optional)
  speakTextWithDeepgram(answer);
} else {
  statusMessage.querySelector(".message-text").textContent =
    `❌ ${res?.error || "Unknown background error"}`;
}

    } catch (err) {
      statusMessage.querySelector('.message-text').textContent =
        `⚠️ Uncaught Error: ${err.message}`;
      log('❌ Uncaught Error:', err);
    }
  };

  sendButton.addEventListener('click', handleSend);
  chatInputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  });
});




// ADD new functions:
function loadUserPreferences() {
  chrome.storage.local.get(['userLanguage'], (result) => {
    if (result.userLanguage) {
      defaultLang.value = result.userLanguage;
    }
  });
}

function saveUserPreferences() {
  const preferences = {
    userLanguage: defaultLang.value
  };
  chrome.storage.local.set(preferences);
}

async function handleTranslation() {
  const text = translateInput.value.trim();
  if (!text) return;

  const sourceLang = fromLang.value;
  const targetLang = toLang.value;

  translateOutput.textContent = 'Translating...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_TEXT",
      text: text,
      sourceLang: sourceLang,
      targetLang: targetLang
    });

    if (response.ok) {
      translateOutput.textContent = response.translatedText;
    } else {
      translateOutput.textContent = `Translation error: ${response.error}`;
    }
  } catch (error) {
    translateOutput.textContent = `Error: ${error.message}`;
  }
}

function swapLanguages() {
  const fromValue = fromLang.value;
  const toValue = toLang.value;
  
  fromLang.value = toValue;
  toLang.value = fromValue;
  
  const inputText = translateInput.value;
  const outputText = translateOutput.textContent;
  
  if (outputText && outputText !== 'Translation will appear here...' && outputText !== 'Translating...') {
    translateInput.value = outputText;
    translateOutput.textContent = inputText;
  }
}


// Shared function to handle AI responses from text or voice queries
function handleAIResponse(messageEl, res) {
  if (res?.ok) {
    const answer = res.answer;
    messageEl.querySelector(".message-text").textContent = answer;

    // ✅ Store and optionally play via Deepgram
    window.latestAIResponse = answer;
    speakTextWithDeepgram(answer);
  } else {
    messageEl.querySelector(".message-text").textContent =
      `❌ ${res?.error || "Unknown background error"}`;
  }
}


// =====================
// Step 1 — Basic mic recording (no Deepgram yet)
// =====================
(function () {
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('[VoiceChat]', ...args);

  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) {
    log('❌ mic button not found');
    return;
  }

  let recorder = null;
  let chunks = [];

  async function startRecording() {
    try {
      log('🎙 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream,{
  mimeType: 'audio/webm;codecs=opus' // ✅ explicitly request Opus codec
});
console.log("Supported types:", MediaRecorder.isTypeSupported('audio/webm;codecs=opus'));

      chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstart = () => {
        log('🟢 Recording started');
        micBtn.style.color = 'red';
      };
  recorder.onstop = async () => {
  log('🔴 Recording stopped');
  micBtn.style.color = '';

  const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
  log("[Popup][Voice] 🎙️ Recorded blob:", blob);

  // Convert Blob to Base64 safely
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000; // prevents call stack overflow
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const subArray = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...subArray);
  }
  const base64Audio = btoa(binary);
  log("[Popup][Voice] 📤 Sending base64 audio, length:", base64Audio.length);

  chrome.runtime.sendMessage({
    type: "TRANSCRIBE_AUDIO",
    audioBase64: base64Audio,
    mimeType: blob.type,
    language: defaultLang.value || "en"
  },  async (response) => {
    console.log("[Popup][Voice] Deepgram transcription response:", response);
      // 🧠 Show the transcript as user's message
  window.createMessageElement(response.transcript, "user");

  // 🔍 Status message while processing
  const thinkingMsg = window.createMessageElement("🔍 Scraping current page...", "assistant");
  

  // =====added part===
  try {
      // --- 4️⃣ Get current tab ---
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab found.");

      // --- 5️⃣ Ask content.js to scrape ---
      const scrapedRes = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PAGE" });
      console.log("[Popup][Voice] 📄 Scrape response:", scrapedRes);

      if (!scrapedRes?.ok) {
        thinkingMsg.querySelector(".message-text").textContent = "❌ Failed to scrape page.";
        return;
      }

      // --- 6️⃣ Send transcript as query to LLM ---
      const scrapedData = scrapedRes.data;
      thinkingMsg.querySelector(".message-text").textContent = "🧠 Thinking...";

      const res = await chrome.runtime.sendMessage({
        type: "ASK_QUERY",
        page: scrapedData,
        query: response.transcript,
      });

      console.log("[Popup][Voice] 🤖 LLM response:", res);

      handleAIResponse(thinkingMsg, res);


    } catch (err) {
      console.error("[Popup][Voice] ❌ Error while sending query:", err);
      window.createMessageElement(`⚠️ Error: ${err.message}`, "assistant");
    }
    // === added part end

 
  
  }  );

  // --- Playback Preview ---
  const audioURL = URL.createObjectURL(blob);
  const audio = new Audio(audioURL);
  audio.controls = true;
  const chatContainer = document.getElementById('chat-container') || document.body;
  const playerWrapper = document.createElement('div');
  playerWrapper.className = 'voice-preview';
  playerWrapper.style.margin = '8px 0';
  playerWrapper.textContent = '▶️ Recorded audio preview: ';
  playerWrapper.appendChild(audio);
  chatContainer.appendChild(playerWrapper);
};



      recorder.start();
    } catch (err) {
      log('❌ Microphone error:', err);
      alert('Microphone permission denied or unavailable.');
    }
  }

  function stopRecording() {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  }

  micBtn.addEventListener('click', () => {
    if (!recorder || recorder.state === 'inactive') {
      startRecording();
    } else {
      stopRecording();
    }
  });
})();

// Function: Convert AI text → speech using Deepgram TTS (English & Spanish only)
async function speakTextWithDeepgram(text) {
  try {
    if (!text || text.trim() === "") return;

    const langCode = await detectLanguageAI(text); // Detect language
    console.log(`[TTS] 🧠 Language detected: ${langCode}`);

    // ✅ Allowed languages: English and Spanish only
    const allowedLangs = ["en-US", "es-ES"];
    if (!allowedLangs.includes(langCode)) {
      alert(`🔔 Text-to-Speech is currently supported only for English and Spanish. We are working to support your language soon!`);
      return; // Exit without calling TTS
    }

    // Prepare TTS payload
    const payload = { text };
    let model_name = "aura-asteria-en"; // default English voice

    if (langCode === "es-ES") {
      model_name = "aura-2-sirio-es"; // Spanish voice
    }

    console.log(`[TTS] 🎯 Using model: ${model_name}`);
    console.log(`[TTS] 🗣 Text for TTS: ${text}`);

    const response = await fetch(`https://api.deepgram.com/v1/speak?model=${model_name}`, {
      method: "POST",
      headers: {
        "Authorization": `Token ef2c8061467bd30d586456e55bfb751027e553fb`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TTS] ❌ Deepgram error:", errorText);
      return;
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audioEl = document.getElementById("voice-audio");
    
    if (audioEl) {
      audioEl.src = audioUrl;
      audioEl.style.display = "block";
      await audioEl.play();
      console.log("[TTS] ✅ Played voice successfully!");
    } else {
      console.error("[TTS] ❌ Audio element not found");
    }
  } catch (err) {
    console.error("[TTS] ⚠️ Error:", err);
  }
}




document.getElementById("voice-reply-btn").addEventListener("click", async () => {
  if (!window.latestAIResponse) {
    alert("No AI response to speak yet!");
    return;
  }
  await speakTextWithDeepgram(window.latestAIResponse);
});



// =======================================
// 🔍 Built-in AI Language Detection (Chrome 138+)
// =======================================

let languageDetector = null;

async function initLanguageDetector() {
  if (!('LanguageDetector' in self)) {
    console.warn("[LangDetect] ❌ Language Detector API not supported in this browser.");
    return null;
  }

  const availability = await LanguageDetector.availability();
  console.log("[LangDetect] Model availability:", availability);

  if (availability === 'downloadable') {
    console.log("[LangDetect] ⏬ Downloading model...");
  }

  languageDetector = await LanguageDetector.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        console.log(`[LangDetect] Downloaded ${(e.loaded * 100).toFixed(1)}%`);
      });
    },
  });

  console.log("[LangDetect] ✅ Detector ready");
  return languageDetector;
}

async function detectLanguageAI(text) {
  if (!languageDetector) {
    console.warn("[LangDetect] ⚠️ Detector not ready — initializing...");
    await initLanguageDetector();
  }

  if (!text || text.trim().length < 3) {
    console.warn("[LangDetect] ⚠️ Text too short for detection.");
    return "en-US"; // fallback
  }

  try {
    const results = await languageDetector.detect(text);
    const top = results[0];
    console.log("[LangDetect] 🔠 Detected:", top.detectedLanguage, "confidence:", top.confidence);

    // Convert short language code → Deepgram-compatible locale
    const langMap = {
      en: "en-US",
      hi: "hi-IN",
      ta: "ta-IN",
      te: "te-IN",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
      zh: "zh-CN",
      ja: "ja-JP",
    };

    const locale = langMap[top.detectedLanguage] || "en-US";
    console.log("[LangDetect] 🌍 Mapped locale:", locale);
    return locale;
  } catch (err) {
    console.error("[LangDetect] ❌ Detection failed:", err);
    return "en-US";
  }
}
