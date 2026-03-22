import express from "express";
import { generateImageOpenAI } from "../services/openaiText2Image.js";
import { generateImageGemini } from "../services/geminiText2Image.js";
import { OPENAI_IMAGE_MODELS } from "../services/openaiText2Image.js";
import { GEMINI_IMAGE_MODELS } from "../services/geminiText2Image.js";

const router = express.Router();

/** GET /api/text2image/models - API별 사용 가능 이미지 생성 모델 목록 */
router.get("/models", (_req, res) => {
  res.json({
    openai: OPENAI_IMAGE_MODELS,
    gemini: GEMINI_IMAGE_MODELS,
  });
});

router.post("/", async (req, res) => {
  try {
    const { prompt, provider = "openai", model, size, quality, aspectRatio, imageSize, referenceImages } = req.body;
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

    const refList = Array.isArray(referenceImages)
      ? referenceImages.filter((x) => typeof x === "string" && x.trim())
      : [];
    const geminiOpts = { aspectRatio, imageSize };
    if (refList.length) geminiOpts.referenceImagesB64 = refList;

    const generate = prov === "gemini"
      ? () => generateImageGemini(prompt.trim(), apiKey, model, geminiOpts)
      : () => generateImageOpenAI(prompt.trim(), apiKey, model, { size, quality });

    const b64 = await generate();
    res.json({ success: true, data: b64 });
  } catch (err) {
    console.error(err);

    const status = err.status ?? err.statusCode ?? (err.error?.code === 429 ? 429 : 500);
    let message = err.message || "Text2Image failed.";

    const isQuotaError =
      status === 429 ||
      message.includes("429") ||
      message.includes("quota") ||
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("exceeded your current quota");

    if (isQuotaError) {
      message =
        "Gemini API 할당량을 초과했습니다. 무료 한도에서는 Nano Banana Pro 등 일부 모델 사용이 제한될 수 있습니다. " +
        "다른 모델(예: Gemini 2.0 Flash)을 선택하거나, 잠시 후 다시 시도해 주세요.";
    } else {
      const raw = err.error ?? err.response ?? err.body;
      const errObj = typeof raw === "string" ? tryParseJson(raw) : raw;
      if (errObj?.error?.message && !errObj.error.message.includes("quota")) {
        message = errObj.error.message;
      }
    }

    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
});

function tryParseJson(str) {
  try {
    return typeof str === "string" ? JSON.parse(str) : str;
  } catch {
    return null;
  }
}

export default router;
