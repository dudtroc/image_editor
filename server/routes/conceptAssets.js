import express from "express";
import { detectObjectsGemini } from "../services/conceptDetectObjects.js";
import { detectObjectsOpenAI } from "../services/conceptDetectObjectsOpenAI.js";
import { generateConceptAssets } from "../services/conceptGenerateAssets.js";
import { styleTransfer } from "../services/conceptStyleTransfer.js";

const router = express.Router();

/** POST /api/concept-assets/detect-objects - 컨셉 아트 이미지에서 객체 목록 추출 (최대 20개). body: { provider, image } (image = base64 문자열) */
router.post("/detect-objects", async (req, res) => {
  try {
    const provider = (req.body?.provider || "gemini").toLowerCase();
    const imageB64 = req.body?.image;
    if (!imageB64 || typeof imageB64 !== "string") {
      return res.status(400).json({ error: "이미지를 업로드해 주세요." });
    }

    const cleanB64 = imageB64.replace(/^data:image\/\w+;base64,/, "");
    let buffer;
    try {
      buffer = Buffer.from(cleanB64, "base64");
    } catch {
      return res.status(400).json({ error: "잘못된 이미지 데이터입니다." });
    }
    if (buffer.length === 0) return res.status(400).json({ error: "이미지를 업로드해 주세요." });

    const apiKey =
      provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPEN_AI_API_KEY;
    if (!apiKey)
      return res.status(400).json({
        error: provider === "gemini" ? "GEMINI_API_KEY가 없습니다." : "OPEN_AI_API_KEY가 없습니다.",
      });

    const detect = provider === "gemini" ? detectObjectsGemini : detectObjectsOpenAI;
    const objects = await detect(buffer, apiKey);
    res.json({ objects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "객체 목록 추출 실패" });
  }
});

/** POST /api/concept-assets/generate - 선택한 객체들을 client/data 스타일로 에셋 생성 */
router.post("/generate", async (req, res) => {
  try {
    const {
      provider = "gemini",
      model,
      objects,
      targetImages,
      size,
      quality,
      aspectRatio,
      imageSize,
    } = req.body;

    if (!Array.isArray(objects) || objects.length === 0)
      return res.status(400).json({ error: "생성할 객체 목록을 입력해 주세요." });

    const prov = String(provider).toLowerCase();
    const apiKey = prov === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPEN_AI_API_KEY;
    if (!apiKey)
      return res.status(400).json({
        error: prov === "gemini" ? "GEMINI_API_KEY가 없습니다." : "OPEN_AI_API_KEY가 없습니다.",
      });

    const targetList = Array.isArray(targetImages)
      ? targetImages.filter((img) => typeof img === "string" && img.length > 0)
      : [];

    const results = await generateConceptAssets(
      objects.map((o) => (typeof o === "string" ? o : o?.en ?? o?.name ?? "").trim()).filter(Boolean),
      prov,
      model || (prov === "gemini" ? "gemini-2.0-flash-exp-image-generation" : "gpt-image-1.5"),
      apiKey,
      { size, quality, aspectRatio, imageSize, targetImages: targetList }
    );
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "에셋 생성 실패" });
  }
});

/** POST /api/concept-assets/style-transfer - 이미지를 client/data 스타일로만 변환 (구도 유지) */
router.post("/style-transfer", async (req, res) => {
  try {
    const {
      provider = "gemini",
      model,
      image,
      size,
      quality,
      aspectRatio,
      imageSize,
    } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "이미지를 업로드해 주세요." });
    }

    const prov = String(provider).toLowerCase();
    const apiKey = prov === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPEN_AI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: prov === "gemini" ? "GEMINI_API_KEY가 없습니다." : "OPEN_AI_API_KEY가 없습니다.",
      });
    }

    const data = await styleTransfer(
      image,
      prov,
      model || (prov === "gemini" ? "gemini-2.0-flash-exp-image-generation" : "gpt-image-1.5"),
      apiKey,
      { size, quality, aspectRatio, imageSize }
    );
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "스타일 변환 실패" });
  }
});

export default router;
