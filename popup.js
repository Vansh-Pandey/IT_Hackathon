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

document.addEventListener('DOMContentLoaded', () => {
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
        statusMessage.querySelector('.message-text').textContent = res.answer;
        log('✅ Answer received:', res.answer);
      } else {
        statusMessage.querySelector('.message-text').textContent =
          `❌ Error: ${res?.error || 'Unknown background error'}`;
        log('❌ Error from background:', res);
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

      if (res?.ok) {
        thinkingMsg.querySelector(".message-text").textContent = res.answer;
      } else {
        thinkingMsg.querySelector(".message-text").textContent =
          `❌ ${res?.error || "Unknown background error"}`;
      }
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














