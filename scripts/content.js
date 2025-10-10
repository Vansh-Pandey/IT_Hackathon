function quickScrape() {
  try {
    const title = document.title;
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map(h => h.innerText.trim())
      .filter(Boolean);

    const paras = Array.from(document.querySelectorAll("p"))
      .slice(0, 30)
      .map(p => p.innerText.trim())
      .filter(Boolean);

    // Capture navigation links and visible anchors
    const links = Array.from(document.querySelectorAll("a"))
      .filter(a => a.offsetParent !== null && a.href && a.innerText.trim().length > 2)
      .slice(0, 100)
      .map(a => ({
        text: a.innerText.trim(),
        href: a.href
      }));

    // Combine all into structured JSON
    const data = {
      title,
      headings,
      paras,
      links
    };

    console.log("[Scraper ✅] Collected structured page data:", data);
    return data;

  } catch (err) {
    console.error("[Scraper ❌ Error]:", err);
    return {};
  }
}
