import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import ffmpeg from "fluent-ffmpeg";

const router = express.Router();

function getFfmpegPath() {
  const envPath = process.env.FFMPEG_PATH;
  if (!envPath) return null;
  return path.normalize(envPath.replace(/\//g, path.sep));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per frame
  fileFilter: (_, file, cb) => {
    const ok = /image\/(png|jpeg|jpg)/.test(file.mimetype);
    cb(null, !!ok);
  },
});

/** 프레임 이미지들을 임시 폴더에 저장한 뒤 ffmpeg로 MP4 생성, 스트림 반환 후 정리 */
router.post(
  "/frames-to-mp4",
  upload.array("frames", 1000),
  async (req, res) => {
    const files = req.files || [];
    const fps = Math.max(1, Math.min(60, Number(req.body.fps) || 30));
    if (files.length === 0) {
      return res.status(400).json({ error: "프레임 이미지가 없습니다." });
    }

    const tmpDir = path.join(os.tmpdir(), `video-frames-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const outPath = path.join(tmpDir, "output.mp4");

    try {
      await fs.mkdir(tmpDir, { recursive: true });
      const pad = String(files.length).length;
      for (let i = 0; i < files.length; i++) {
        const name = `frame_${String(i + 1).padStart(Math.max(4, pad), "0")}.png`;
        await fs.writeFile(path.join(tmpDir, name), files[i].buffer);
      }

      const inputPattern = path.join(tmpDir, `frame_%0${Math.max(4, pad)}d.png`);
      const ffmpegPath = getFfmpegPath();

      await new Promise((resolve, reject) => {
        const cmd = ffmpeg();
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        cmd
          .input(inputPattern)
          .inputOptions([`-framerate ${fps}`])
          .outputOptions(["-c:v libx264", "-pix_fmt yuv420p"])
          .output(outPath)
          .on("end", resolve)
          .on("error", (err) => reject(new Error(err.message)))
          .run();
      });

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="output.mp4"');
      const src = createReadStream(outPath);
      await pipeline(src, res);
    } catch (err) {
      console.error("frames-to-mp4 error:", err);
      let message = err.message || "동영상 생성 실패.";
      if (/cannot find ffmpeg|ffmpeg not found|ENOENT/i.test(message)) {
        message =
          "ffmpeg를 찾을 수 없습니다. " +
          "1) ffmpeg를 설치한 뒤 PATH에 추가하거나, " +
          "2) 프로젝트 루트 .env에 FFMPEG_PATH=설치경로\\ffmpeg.exe 를 설정하세요. " +
          "예: FFMPEG_PATH=C:\\ffmpeg\\bin\\ffmpeg.exe";
      }
      res.status(500).json({ error: message });
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
);

export default router;
