import express from "express";
import multer from "multer";
import { generateVeoVideo } from "../services/veoGenerate.js";

const router = express.Router();

const VALID_DURATIONS = [4, 6, 8];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /image\/(png|jpeg|jpg)/.test(file.mimetype);
    cb(null, !!ok);
  },
});

router.post(
  "/generate",
  (req, res, next) => {
    req.setTimeout(12 * 60 * 1000); // 12 minutes timeout for this route
    next();
  },
  upload.fields([
    { name: "startFrame", maxCount: 1 },
    { name: "endFrame", maxCount: 1 },
  ]),
  async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." });
    }

    const { model, durationSeconds, subject, animationDesc } = req.body;
    const startFrameFile = req.files?.startFrame?.[0];
    const endFrameFile = req.files?.endFrame?.[0];

    if (!startFrameFile) {
      return res.status(400).json({ error: "시작 프레임 이미지가 없습니다." });
    }
    if (!endFrameFile) {
      return res.status(400).json({ error: "끝 프레임 이미지가 없습니다." });
    }
    if (!model) {
      return res.status(400).json({ error: "모델을 선택해주세요." });
    }
    if (!subject?.trim()) {
      return res.status(400).json({ error: "피사체(input1)를 입력해주세요." });
    }
    if (!animationDesc?.trim()) {
      return res.status(400).json({ error: "애니메이션 상세 설명(input2)을 입력해주세요." });
    }

    const duration = VALID_DURATIONS.includes(Number(durationSeconds))
      ? Number(durationSeconds)
      : 6;

    try {
      const videoBuffer = await generateVeoVideo({
        apiKey,
        model,
        durationSeconds: duration,
        subject: subject.trim(),
        animationDesc: animationDesc.trim(),
        startFrameBase64: startFrameFile.buffer.toString("base64"),
        endFrameBase64: endFrameFile.buffer.toString("base64"),
        startMimeType: startFrameFile.mimetype,
        endMimeType: endFrameFile.mimetype,
      });

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="veo-generated.mp4"');
      res.send(videoBuffer);
    } catch (err) {
      console.error("Veo generate error:", err);
      res.status(500).json({ error: err.message || "동영상 생성 실패." });
    }
  }
);

export default router;
