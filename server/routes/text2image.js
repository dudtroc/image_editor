import express from "express";
import { generateImageOpenAI } from "../services/openaiText2Image.js";
import { generateImageGemini } from "../services/geminiText2Image.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { prompt, provider = "openai" } = req.body;
    const prov = String(provider).toLowerCase();

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const apiKey = prov === "gemini"
      ? process.env.GEMINI_API_KEY
      : process.env.OPEN_AI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        error: prov === "gemini"
          ? "GEMINI_API_KEY is not set in .env"
          : "OPEN_AI_API_KEY is not set in .env",
      });
    }

    const generate = prov === "gemini"
      ? () => generateImageGemini(prompt.trim(), apiKey)
      : () => generateImageOpenAI(prompt.trim(), apiKey);

    const b64 = await generate();
    res.json({ success: true, data: b64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Text2Image failed." });
  }
});

export default router;
