const GEMINI_API_KEY = "AIzaSyAHEsDDeORQrdRpd4oahmGEInKmng2Bj6Q";  

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get("lastPageText");
  const text = data.lastPageText || "No text captured yet.";
  document.getElementById("output").value = text.slice(0, 4000);

  // Summarize button
  document.getElementById("summarizeBtn").addEventListener("click", async () => {
    const summary = await summarizeWithGemini(text);
    document.getElementById("output").value = summary;
  });

  // Read aloud button
  document.getElementById("readBtn").addEventListener("click", () => {
    const utterance = new SpeechSynthesisUtterance(
      document.getElementById("output").value
    );
    utterance.rate = 1.05;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  });
});

async function summarizeWithGemini(text) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    alert("Please add your Gemini API key in popup.js");
    return "⚠️ API key missing.";
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Summarize the following webpage text in clear, concise language:\n\n${text}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const summary =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No summary generated.";
    return summary;
  } catch (error) {
    console.error("Error with Gemini API:", error);
    return "Error summarizing text.";
  }
}
