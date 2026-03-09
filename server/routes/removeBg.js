import express from "express";
import multer from "multer";
import { removeBackgroundOpenAI } from "../services/openaiRemoveBg.js";
import { removeBackgroundGemini } from "../services/geminiRemoveBg.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|webp)/.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WebP images are allowed."));
  },
});

router.post("/", upload.array("images", 16), async (req, res) => {
  try {
    const provider = (req.body.provider || "openai").toLowerCase();
    const quality = req.body.quality || "auto"; // OpenAI only: low | medium | high | auto
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ error: "No images uploaded." });
    }

    const apiKey = provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : process.env.OPEN_AI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        error: provider === "gemini"
          ? "GEMINI_API_KEY is not set in .env"
          : "OPEN_AI_API_KEY is not set in .env",
      });
    }

    const processOne = provider === "gemini"
      ? (buffer) => removeBackgroundGemini(buffer, apiKey)
      : (buffer) => removeBackgroundOpenAI(buffer, apiKey, { quality });

    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const b64 = await processOne(file.buffer);
          return { success: true, filename: file.originalname, data: b64 };
        } catch (err) {
          return {
            success: false,
            filename: file.originalname,
            error: err.message || String(err),
          };
        }
      })
    );

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Remove background failed." });
  }
});

export default router;
