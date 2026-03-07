import express from "express";
import { image2imageOpenAI } from "../services/openaiImage2Image.js";
import { image2imageGemini } from "../services/geminiImage2Image.js";
import { OPENAI_IMAGE2IMAGE_MODELS } from "../services/openaiImage2Image.js";
import { GEMINI_IMAGE2IMAGE_MODELS } from "../services/geminiImage2Image.js";

const router = express.Router();

/** GET /api/image2image/models - API별 이미지2이미지 모델 목록 */
router.get("/models", (_req, res) => {
  res.json({
    openai: OPENAI_IMAGE2IMAGE_MODELS,
    gemini: GEMINI_IMAGE2IMAGE_MODELS,
  });
});

router.post("/", async (req, res) => {
  try {
    const {
      prompt,
      provider = "openai",
      model,
      size,
      quality,
      aspectRatio,
      imageSize,
      images: imagesB64,
    } = req.body;
    const prov = String(provider).toLowerCase();

    if (!Array.isArray(imagesB64) || imagesB64.length === 0) {
      return res.status(400).json({ error: "최소 1개 이상의 이미지가 필요합니다." });
    }
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "프롬프트를 입력해 주세요." });
    }

    const apiKey =
      prov === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPEN_AI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        error:
          prov === "gemini"
            ? ".env에 GEMINI_API_KEY를 설정해 주세요."
            : ".env에 OPEN_AI_API_KEY를 설정해 주세요.",
      });
    }

    const generate =
      prov === "gemini"
        ? () =>
            image2imageGemini(imagesB64, prompt.trim(), apiKey, model, {
              aspectRatio,
              imageSize,
            })
        : () =>
            image2imageOpenAI(imagesB64, prompt.trim(), apiKey, model, {
              size,
              quality,
            });

    const b64 = await generate();
    res.json({ success: true, data: b64 });
  } catch (err) {
    console.error(err);
    const status = err.status ?? err.statusCode ?? (err.error?.code === 429 ? 429 : 500);
    let message = err.message || "이미지 변환에 실패했습니다.";
    const isQuotaError =
      status === 429 ||
      /429|quota|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(message);
    if (isQuotaError) {
      message =
        "API 할당량을 초과했습니다. 다른 모델을 선택하거나 잠시 후 다시 시도해 주세요.";
    } else {
      const raw = err.error ?? err.response ?? err.body;
      const errObj = typeof raw === "string" ? tryParseJson(raw) : raw;
      if (errObj?.error?.message && !/quota/i.test(errObj.error.message)) {
        message = errObj.error.message;
      }
    }
    res
      .status(status >= 400 && status < 600 ? status : 500)
      .json({ error: message });
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
