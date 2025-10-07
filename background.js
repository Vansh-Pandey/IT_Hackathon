 const MAX_PAGES_TO_CRAWL = 5;   // change as needed
const TAB_LOAD_TIMEOUT = 20000; // ms
 
const visitedUrls = new Set();      // URLs we've already processed
const tabsBeingCrawled = new Set(); // tabIds we opened ourselves to extract (ignore their content-script messages)

// --- Helpers ---
function createTabAsync(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve(tab);
    });
  });
}

function waitForTabComplete(tabId, timeout = TAB_LOAD_TIMEOUT) {
  return new Promise((resolve) => {
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(true);
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(false);
    }, timeout);
  });
}

async function extractTextFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let text = "";
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.nodeValue && node.nodeValue.trim().length > 0) {
            text += node.nodeValue.trim() + " ";
          }
        }
        return text.trim();
      }
    });
    return (results && results[0] && results[0].result) ? results[0].result : "";
  } catch (e) {
    console.error("extractTextFromTab error:", e);
    return "";
  }
}

// Utility: safe origin parsing
function safeOriginOf(url) {
  try { return new URL(url).origin; } catch (e) { return null; }
}

// Send optional progress update to popup/UI
function sendProgressUpdate(statusObj) {
  chrome.runtime.sendMessage({ type: "CRAWL_PROGRESS", ...statusObj }, () => { /* ignore response */ });
}

// --- Main handler ---
chrome.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type !== "PAGE_TEXT_AND_LINKS") return;

  // If message came from a tab we opened for extraction, ignore it (we extracted via scripting.executeScript)
  if (sender && sender.tab && tabsBeingCrawled.has(sender.tab.id)) {
    console.log("Ignoring message from tabBeingCrawled:", sender.tab.id, sender.tab.url);
    return;
  }

  const fromUrl = message.from || (sender && sender.tab && sender.tab.url) || "";
  const origin = safeOriginOf(fromUrl);
  const { text = "", links = [] } = message.data || {};

  // If fromUrl is empty (rare), we still proceed but be cautious
  if (fromUrl && visitedUrls.has(fromUrl)) {
    console.log("Already visited (fromUrl):", fromUrl, "— ignoring incoming duplicate message.");
    return;
  }

  // Mark this URL as visited (so we don't re-open it later)
  if (fromUrl) visitedUrls.add(fromUrl);

  let combinedText = text || "";
  console.log("Background: received page. main text length:", (combinedText || "").length);

  // Determine candidate links: same origin, not visited
  let saneLinks = (links || []).filter(l => {
    try {
      const u = new URL(l);
      // / only same origin
      return origin ? u.origin === origin : true;
    } catch (e) { return false; }
  });

  // normalize (strip fragments) and deduplicate
  saneLinks = saneLinks.map(href => {
    try {
      const u = new URL(href);
      u.hash = "";
      return u.href;
    } catch (e) { return href; }
  });
  saneLinks = [...new Set(saneLinks)];

  // Remove already visited links
  saneLinks = saneLinks.filter(href => !visitedUrls.has(href));

  // Limit how many to crawl
  saneLinks = saneLinks.slice(0, MAX_PAGES_TO_CRAWL);

  console.log(`Background: will crawl ${saneLinks.length} links (filtered).`);

  // Crawl sequentially (safe). You can convert to parallel with throttling if you want.
  let count = 0;
  for (const link of saneLinks) {
    try {
      count++;
      sendProgressUpdate({ stage: "startLink", index: count, total: saneLinks.length, url: link });

      // If link already visited in the small window, skip
      if (visitedUrls.has(link)) {
        console.log("Skipping already visited link:", link);
        continue;
      }

      // Mark visited early to avoid races / duplicates
      visitedUrls.add(link);

      // create the tab and note that we are crawling this tab (so content.js messages from it are ignored)
      const tab = await createTabAsync(link);
      const tabId = tab && tab.id;
      if (!tabId) {
        console.warn("Could not create tab for", link);
        continue;
      }
      tabsBeingCrawled.add(tabId);

      // Wait for load (or timeout)
      const loaded = await waitForTabComplete(tabId);
      if (!loaded) {
        console.warn("Tab did not finish loading in time:", link);
      }

      // extract text from the loaded tab
      const pageText = await extractTextFromTab(tabId);
      console.log("→ extracted text length from", link, ":", (pageText || "").length);

      if (pageText && pageText.trim().length > 0) {
        combinedText += "\n\n" + `--- Content from: ${link} ---\n` + pageText;
      }

      // Close it
      try { chrome.tabs.remove(tabId); } catch (e) { /* ignore */ }

      // remove from tabsBeingCrawled (cleanup)
      tabsBeingCrawled.delete(tabId);

      sendProgressUpdate({ stage: "doneLink", index: count, total: saneLinks.length, url: link, extractedLength: (pageText||"").length });
    } catch (err) {
      console.error("Error crawling link:", link, err);
      // ensure tab cleanup in case of error
      if (err && err.tabId) {
        try { chrome.tabs.remove(err.tabId); } catch(e) { /* ignore */ }
      }
    }
  }

  // Save aggregated result
  try {
    await chrome.storage.local.set({ lastPageText: combinedText });
    console.log("✅ All texts saved. Combined length:", (combinedText || "").length);
    chrome.runtime.sendMessage({ type: "CRAWL_COMPLETE", data: { length: (combinedText || "").length } });
  } catch (e) {
    console.error("Error saving aggregated text:", e);
  }
});
