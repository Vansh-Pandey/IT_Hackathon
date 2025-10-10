// // content.js
function quickScrape() {
  try {
    const title = document.title;
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map(h => h.innerText.trim())
      .filter(Boolean);
    const paras = Array.from(document.querySelectorAll("p"))
      .slice(0, 20) // limit paragraphs
      .map(p => p.innerText.trim())
      .filter(Boolean);

    const result = `${title}\n\n${headings.join("\n")}\n\n${paras.join("\n")}`;
    console.log("[Scraper] ✅ Page scraped successfully.");
    return result;
  } catch (err) {
    console.error("[Scraper ❌ Error]:", err);
    return "";
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCRAPE_PAGE") {
    try {
      const data = quickScrape();
      console.log(data);
      sendResponse({ ok: true, data });
      console.log("Successfully sent data to nano")
    } catch (err) {
      console.error("[Scraper ❌ Failed to scrape]:", err);
      sendResponse({ ok: false, error: err.message });
    }
  }
});
// console.log(quickScrape());

// document.body.style.backgroundColor = "red";