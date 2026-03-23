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

/** ffmpeg는 Windows에서 백슬래시 경로를 시퀀스 패턴으로 잘못 해석하는 경우가 있어 / 로 통일 */
function ffmpegPathPosix(p) {
  return p.split(path.sep).join("/");
}

async function prepareFramesTmp(req, res, next) {
  req.framesTmpDir = path.join(os.tmpdir(), `video-frames-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    await fs.mkdir(req.framesTmpDir, { recursive: true });
    next();
  } catch (e) {
    next(e);
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, req.framesTmpDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname || "frame.png");
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // per frame (고해상도 PNG 대비)
  fileFilter: (_, file, cb) => {
    const ok = /image\/(png|jpeg|jpg)/.test(file.mimetype);
    cb(null, !!ok);
  },
});

/** 프레임 이미지들을 임시 폴더에 저장한 뒤 ffmpeg로 MP4 생성, 스트림 반환 후 정리 */
router.post(
  "/frames-to-mp4",
  prepareFramesTmp,
  (req, res, next) => {
    upload.array("frames", 2000)(req, res, (err) => {
      if (err && req.framesTmpDir) {
        fs.rm(req.framesTmpDir, { recursive: true, force: true }).catch(() => {});
      }
      next(err);
    });
  },
  async (req, res) => {
    const tmpDir = req.framesTmpDir;
    const files = [...(req.files || [])].sort((a, b) =>
      String(a.originalname).localeCompare(String(b.originalname), undefined, { numeric: true })
    );
    const fps = Math.max(1, Math.min(60, Number(req.body.fps) || 30));
    const outPath = path.join(tmpDir, "output.mp4");

    try {
      if (files.length === 0) {
        return res.status(400).json({ error: "프레임 이미지가 없습니다." });
      }

      const pad = Math.max(4, String(files.length).length);
      // 클라이언트 파일명과 무관하게 ffmpeg 패턴과 일치하는 이름으로 맞춤 (이름 충돌 방지: 임시명 거쳐 이동)
      const tempPaths = files.map((_, i) => path.join(tmpDir, `__part_${i}.png`));
      for (let i = 0; i < files.length; i++) {
        await fs.rename(files[i].path, tempPaths[i]);
      }
      for (let i = 0; i < files.length; i++) {
        const targetName = `frame_${String(i + 1).padStart(pad, "0")}.png`;
        await fs.rename(tempPaths[i], path.join(tmpDir, targetName));
      }

      const inputPattern = ffmpegPathPosix(path.join(tmpDir, `frame_%0${pad}d.png`));
      const ffmpegPath = getFfmpegPath();

      // 이미지2 demuxer 기본 start_number=0 인데, 클라이언트는 frame_0001.png 부터 보냄 → 반드시 1로 지정
      await new Promise((resolve, reject) => {
        const cmd = ffmpeg();
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        cmd
          .input(inputPattern)
          .inputOptions(["-framerate", String(fps), "-start_number", "1"])
          .outputOptions(["-c:v libx264", "-pix_fmt yuv420p", "-preset", "ultrafast"])
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
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
);

export default router;
