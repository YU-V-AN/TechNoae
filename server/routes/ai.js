const express = require("express");
const router = express.Router();

router.post("/chat", async (req, res) => {
  const { prompt, language = "English" } = req.body || {};

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Graceful offline response if no API key is set
    return res.json({
      text: `Tech Nova Platform: For "${prompt}", our verified recycling network accepts PCBs, Copper Wires, Batteries, Screens, and Mixed E-Scrap. Submit your pickup request with your contact number and verified recyclers will connect with you!`
    });
  }

  try {
    const systemInstruction = `You are an expert e-waste assistant for Tech Nova. Answer concisely in ${language} regarding how to categorize, handle, or safely dispose of e-waste: "${prompt}"`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemInstruction }] }]
        })
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
    return res.json({ text });
  } catch (err) {
    console.error("Gemini proxy error:", err);
    return res.status(500).json({ error: "Could not contact Gemini AI service." });
  }
});

module.exports = router;
