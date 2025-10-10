// popup.js (Milo Mate AI Assistant)
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

  // Helper to safely send message to content script
  const trySendToContent = async (tabId, msg) => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, msg);
      return res;
    } catch (err) {
      // This happens if content script not loaded
      log('Content script not found, injecting manually...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        log('✅ Injected content.js manually.');
        const retryRes = await chrome.tabs.sendMessage(tabId, msg);
        return retryRes;
      } catch (injectErr) {
        log('❌ Failed to inject or message content script:', injectErr);
        throw injectErr;
      }
    }
  };

  const handleSend = async () => {
    const query = chatInputField.value.trim();
    if (!query) return;

    createMessageElement(query, 'user');
    chatInputField.value = '';

    const statusMessage = createMessageElement('🔍 Scraping current page...', 'assistant');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found.');

      // Try scraping (content script message)
      const scrapedRes = await trySendToContent(tab.id, { type: 'SCRAPE_PAGE' });

      if (!scrapedRes?.ok) {
        statusMessage.querySelector('.message-text').textContent =
          '❌ Failed to scrape page. Please refresh or reload the tab.';
        log('Scrape failed:', scrapedRes);
        return;
      }

      const scrapedData = scrapedRes.data;
      log('✅ Got structured page data:', scrapedData);

      // Ask query
      statusMessage.querySelector('.message-text').textContent = '🧠 Thinking...';

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
