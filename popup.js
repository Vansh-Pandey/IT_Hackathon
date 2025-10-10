// popup.js
const domainEl = document.getElementById("domain");
const inputEl = document.getElementById("query");
const buttonEl = document.getElementById("ask");
const outputEl = document.getElementById("output");

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  domainEl.textContent = new URL(tab.url).hostname;

  buttonEl.onclick = async () => {
    outputEl.textContent = "Scraping the current web...";
    const scrapedRes = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PAGE" });
    if (!scrapedRes?.ok) {
      outputEl.textContent = "Failed to scrape page....";
      return;
    }
    const scraped = scrapedRes.data;
    outputEl.textContent = "Thinking...";
    // outputEl.textContent = scraped;

    try {
      const res = await chrome.runtime.sendMessage({
        type: "ASK_QUERY",
        page: scraped,
        query: inputEl.value,
      });
      outputEl.textContent = res.ok ? res.answer : `Error 1: ${res.error}`;
    } catch (err) {
      outputEl.textContent = `Error 2: ${err.message}`;
    }
  };

})();
