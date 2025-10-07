// content.js
function extractVisibleText() {
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

function getInternalLinks(limit = 10) {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const currentOrigin = location.origin;
  const urls = anchors
    .map(a => {
      try {
        // ensure absolute URL
        return new URL(a.href, location.href).href;
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .filter(href => {
      try {
        return new URL(href).origin === currentOrigin;
      } catch (e) {
        return false;
      }
    })
    .map(href => {
      // strip fragment to avoid duplicates like /page#section
      const u = new URL(href);
      u.hash = "";
      return u.href;
    });

  // unique and limited
  const unique = [...new Set(urls)];
  return unique.slice(0, limit);
}

const text = extractVisibleText();
const links = getInternalLinks(5); // default: limit to 5 links (change as needed)

chrome.runtime.sendMessage({ type: "PAGE_TEXT_AND_LINKS", data: { text, links }, from: location.href });
