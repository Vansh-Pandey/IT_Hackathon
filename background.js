// background.js

let session = null;
let translators = new Map();

// ---------------------- SESSION ----------------------
async function ensureSession() {
  console.log("[BG] ensureSession() called");

  if (session) {
    console.log("[BG] using cached session");
    return session;
  }

  if (typeof LanguageModel === "undefined") {
    throw new Error("LanguageModel API not available — requires Chrome Canary with Gemini Nano enabled.");
  }

  console.log("[BG] Checking availability...");
  const availability = await LanguageModel.availability();
  console.log("[BG] availability:", availability);

  if (availability === "unavailable") {
    throw new Error("Gemini Nano not available");
  }

  console.log("[BG] Fetching params...");
  const params = await LanguageModel.params();

  console.log("[BG] Creating session...");
  session = await LanguageModel.create({
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        console.log(`[BG] Downloaded ${(e.loaded * 100).toFixed(1)}%`);
      });
    },
    initialPrompts: [
      {
        role: "system",
        content: `...Your system prompt here...`
      }
    ],
    temperature: 1.2,
    topK: 3,
  });

  console.log("[BG] Session created!");
  return session;
}

// ---------------------- TRANSLATOR ----------------------
async function ensureTranslator(sourceLang, targetLang, forceNew = false) {
  const key = `${sourceLang}-${targetLang}`;
  
  if (!forceNew && translators.has(key)) {
    console.log(`[BG] Reusing cached translator for ${key}`);
    return translators.get(key);
  }

  console.log(`[BG] Creating new translator for ${sourceLang} -> ${targetLang}`);
  if (typeof Translator === "undefined") {
    throw new Error("[BG] Translator API not available");
  }

  const availability = await Translator.availability({
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
  });
  console.log(`[BG] Translator availability for ${key}:`, availability);

  if (availability === "unavailable") {
    throw new Error(`[BG] Translation from ${sourceLang} to ${targetLang} not available`);
  }

  const translator = await Translator.create({
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        console.log(`[BG] Translator downloaded ${(e.loaded * 100).toFixed(1)}%`);
      });
    },
  });

  console.log("[BG] Translator created:", translator);
  translators.set(key, translator);
  return translator;
}

async function translateText(text, sourceLang, targetLang, forceNew = false) {
  if (sourceLang === targetLang) return text;

  console.log(`[BG] translateText() called`);
  console.log(`[BG] Input text: "${text}"`);
  console.log(`[BG] Source: ${sourceLang}, Target: ${targetLang}, Force new: ${forceNew}`);

  try {
    // For queries, force a new translator instance
    const translator = await ensureTranslator(sourceLang, targetLang, forceNew);
    console.log("[BG] Translator instance ready:", translator);

    const translated = await translator.translate(text);
    console.log(`[BG] Translated text: "${translated}"`);

    if (!translated || translated === text) {
      console.warn("[BG] Warning: Translation returned the same text as input. Possible misconfiguration.");
    }

    return translated;
  } catch (err) {
    console.error("[BG] Translation failed:", err);
    throw err;
  }
}

// ---------------------- UTILS ----------------------
async function getUserLanguage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userLanguage'], (result) => {
      resolve(result.userLanguage || 'en');
    });
  });
}

// ---------------------- MESSAGE HANDLER ----------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ASK_QUERY") {
    console.log("[BG] Received ASK_QUERY:", msg);

    (async () => {
      try {
        const sess = await ensureSession();
        console.log("[BG] Session ready, sending prompt...");
        const userLanguage = await getUserLanguage();

        let queryToSend = msg.query;

        // ------------------ QUERY TRANSLATION ------------------
        if (userLanguage !== 'en') {
          console.log("[BG] Translating user query to English...");
          queryToSend = await translateText(msg.query, userLanguage, 'en', true); // force new translator
          console.log("[BG] Translated query:", queryToSend);
        }

        const result = await sess.prompt([
          {
            role: "user",
            content: `Page:\n${msg.page}\n\nQuestion:\n${queryToSend}`, // use translated query
          },
        ]);

        console.log("[BG] Session response (English):", result);

        let finalAnswer = result;

        // ------------------ TRANSLATE ANSWER BACK ------------------
        if (userLanguage !== 'en') {
          console.log("[BG] Translating answer back to user language...");
          finalAnswer = await translateText(result, 'en', userLanguage, true); // force new translator
          console.log("[BG] Translated answer:", finalAnswer);
        }

        sendResponse({ ok: true, answer: finalAnswer });
      } catch (e) {
        console.error("[BG] ASK_QUERY failed:", e);
        sendResponse({ ok: false, error: e.message });
      }
    })();

    return true;
  }

  if (msg.type === "TRANSLATE_TEXT") {
    (async () => {
      try {
        const translated = await translateText(msg.text, msg.sourceLang, msg.targetLang, true);
        sendResponse({ ok: true, translatedText: translated });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});
