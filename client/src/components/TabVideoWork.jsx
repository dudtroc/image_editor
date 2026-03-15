import { useState, useRef, useCallback, useEffect } from "react";
import "./TabVideoWork.css";

const API_BASE = "/api";

/** 비디오에서 N 프레임마다 이미지 추출 (브라우저에서 canvas 사용) */
function extractFramesFromVideo(video, frameInterval, onProgress) {
  return new Promise((resolve, reject) => {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      reject(new Error("비디오 길이를 읽을 수 없습니다. 비디오가 로드될 때까지 잠시 기다린 뒤 다시 시도하세요."));
      return;
    }
    // 비디오 메타데이터에서 fps 추정 (일반적으로 30)
    const fps = 30;
    const totalFrames = Math.floor(duration * fps);
    const framesToExtract = [];
    for (let i = 0; i < totalFrames; i += frameInterval) {
      framesToExtract.push(i);
    }
    if (framesToExtract.length === 0) {
      reject(new Error("추출할 프레임이 없습니다. 간격을 줄여 보세요."));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    const results = [];
    let index = 0;

    function seekNext() {
      if (index >= framesToExtract.length) {
        resolve({ blobs: results, fps });
        return;
      }
      const frameIndex = framesToExtract[index];
      const time = frameIndex / fps;
      video.currentTime = time;
    }

    video.onseeked = () => {
      try {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) results.push(blob);
            index++;
            onProgress?.(index, framesToExtract.length);
            seekNext();
          },
          "image/png",
          0.95
        );
      } catch (e) {
        reject(e);
      }
    };

    video.onerror = () => reject(new Error("비디오 재생 오류"));
    seekNext();
  });
}

/** 이미지(blob)를 중앙 기준으로 크롭한 blob 반환 */
function centerCropBlob(blob, targetW, targetH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const sx = Math.max(0, (w - targetW) / 2);
      const sy = Math.max(0, (h - targetH) / 2);
      const sw = Math.min(targetW, w);
      const sh = Math.min(targetH, h);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("크롭 실패"))),
        "image/png",
        0.95
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = url;
  });
}

function b64ToBlob(b64, mime = "image/png") {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Blob 이미지의 너비/높이 반환 */
function blobGetSize(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = url;
  });
}

/** 배경 제거 탭과 동일: 1024x1024 캔버스에 이미지를 비율 유지하며 중앙에 맞춰 그린 Blob (Triton 모델 입력 형식) */
const REMOVEBG_CANVAS_SIZE = 1024;
function blobTo1024Centered(blob, bgColor = "#ffffff") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = REMOVEBG_CANVAS_SIZE;
      canvas.height = REMOVEBG_CANVAS_SIZE;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, REMOVEBG_CANVAS_SIZE, REMOVEBG_CANVAS_SIZE);
      const scale = Math.min(REMOVEBG_CANVAS_SIZE / img.naturalWidth, REMOVEBG_CANVAS_SIZE / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const x = (REMOVEBG_CANVAS_SIZE - w) / 2;
      const y = (REMOVEBG_CANVAS_SIZE - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("1024 변환 실패"))),
        "image/png",
        0.95
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = url;
  });
}

/** base64 이미지를 지정 크기로 리사이즈한 뒤 base64 반환 */
function resizeBase64To(base64, targetW, targetH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL("image/png", 0.95);
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(b64);
    };
    img.onerror = () => reject(new Error("리사이즈용 이미지 로드 실패"));
    img.src = `data:image/png;base64,${base64}`;
  });
}

export default function TabVideoWork({ provider = "openai" }) {
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [frameInterval, setFrameInterval] = useState(5);
  const [frames, setFrames] = useState([]); // { blob, cropBlob?, rgba? } - rgba는 배경 제거 결과(base64)
  const [extractProgress, setExtractProgress] = useState(null); // { current, total }
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropWidth, setCropWidth] = useState(720);
  const [cropHeight, setCropHeight] = useState(720);
  const [cropProgress, setCropProgress] = useState(null);
  const [removeBgProgress, setRemoveBgProgress] = useState(null);
  const [videoFps, setVideoFps] = useState(24);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [mp4Loading, setMp4Loading] = useState(false);
  const inputRef = useRef(null);
  const videoRef = useRef(null);

  const onSelectVideo = useCallback((fileList) => {
    const file = Array.from(fileList || []).find((f) => f.type.startsWith("video/"));
    if (!file) return;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setFrames([]);
    setExtractProgress(null);
    setCropProgress(null);
    setError("");
  }, [videoPreviewUrl]);

  const runExtract = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoFile) {
      setError("비디오를 먼저 선택해 주세요.");
      return;
    }
    setError("");
    setExtractProgress({ current: 0, total: 1 });
    try {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        await new Promise((resolve, reject) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          video.addEventListener("error", () => reject(new Error("비디오 로드 실패")), { once: true });
          if (video.readyState >= 1) resolve();
          else video.load();
        });
      }
      const { blobs, fps } = await extractFramesFromVideo(
        video,
        Math.max(1, Number(frameInterval) || 1),
        (current, total) => setExtractProgress({ current, total })
      );
      setVideoFps(fps);
      setFrames(blobs.map((blob) => ({ blob, cropBlob: null })));
    } catch (e) {
      setError(e.message || "프레임 추출 실패");
    } finally {
      setExtractProgress(null);
    }
  }, [videoFile, frameInterval]);

  const applyCrop = useCallback(async () => {
    if (frames.length === 0) return;
    const tw = Math.max(1, Number(cropWidth) || 720);
    const th = Math.max(1, Number(cropHeight) || 720);
    setError("");
    setCropProgress({ current: 0, total: frames.length });
    const next = [];
    for (let i = 0; i < frames.length; i++) {
      try {
        const cropBlob = await centerCropBlob(frames[i].blob, tw, th);
        next.push({ ...frames[i], cropBlob, rgba: null });
      } catch (e) {
        next.push({ ...frames[i], rgba: null });
      }
      setCropProgress({ current: i + 1, total: frames.length });
    }
    setFrames(next);
    setCropProgress(null);
  }, [frames, cropWidth, cropHeight]);

  /** 배경 제거: 1024x1024로 변환 후 전송 → 결과 수신 → 원본 크기로 리사이즈하여 저장 */
  const applyRemoveBg = useCallback(async () => {
    if (frames.length === 0) return;
    setError("");
    setRemoveBgProgress({ current: 0, total: frames.length });
    const getBlob = (f) => (cropEnabled && f.cropBlob ? f.cropBlob : f.blob);
    try {
      const next = [...frames];
      for (let i = 0; i < frames.length; i++) {
        const rawBlob = getBlob(frames[i]);
        const { w: origW, h: origH } = await blobGetSize(rawBlob);
        const blobToSend = await blobTo1024Centered(rawBlob);
        const form = new FormData();
        form.append("provider", "triton");
        form.append("images", blobToSend, `frame_${i + 1}.png`);
        const res = await fetch(`${API_BASE}/remove-bg`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "배경 제거 요청 실패");
        const result = data.results?.[0];
        if (result?.success && result?.data) {
          const rgbaOriginalSize = await resizeBase64To(result.data, origW, origH);
          next[i] = { ...next[i], rgba: rgbaOriginalSize };
        }
        setFrames([...next]);
        setRemoveBgProgress({ current: i + 1, total: frames.length });
      }
    } catch (e) {
      setError(e.message || "배경 제거 실패");
    } finally {
      setRemoveBgProgress(null);
    }
  }, [frames, cropEnabled]);

  /** 다운로드: rgba 있으면 사용, 없으면 크롭/원본 blob */
  const getFrameBlob = useCallback((f) => {
    if (f.rgba) return b64ToBlob(f.rgba);
    return cropEnabled && f.cropBlob ? f.cropBlob : f.blob;
  }, [cropEnabled]);

  const downloadAsZip = useCallback(async () => {
    if (frames.length === 0) return;
    setError("");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const folder = zip.folder("frames");
      for (let i = 0; i < frames.length; i++) {
        const blob = getFrameBlob(frames[i]);
        if (blob) folder.file(`frame_${String(i + 1).padStart(4, "0")}.png`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "frames.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e.message || "ZIP 다운로드 실패");
    }
  }, [frames, getFrameBlob]);

  /** 서버에 프레임 전송 후 MP4 받기 */
  const exportAsMp4 = useCallback(async () => {
    if (frames.length === 0) return;
    setError("");
    setMp4Loading(true);
    try {
      const form = new FormData();
      form.append("fps", String(videoFps));
      const blobsToSend = frames.map((f) => getFrameBlob(f));
      blobsToSend.forEach((blob, i) => {
        form.append("frames", blob, `frame_${String(i + 1).padStart(4, "0")}.png`);
      });
      const res = await fetch(`${API_BASE}/video/frames-to-mp4`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `서버 오류 ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "output.mp4";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e.message || "동영상 변환 실패");
    } finally {
      setMp4Loading(false);
    }
  }, [frames, getFrameBlob, videoFps]);

  const [previewUrls, setPreviewUrls] = useState([]);
  useEffect(() => {
    const list = frames.map((f) =>
      f.rgba ? `data:image/png;base64,${f.rgba}` : (cropEnabled && f.cropBlob ? f.cropBlob : f.blob)
    );
    const urls = list.slice(0, 24).map((item) =>
      typeof item === "string" ? item : URL.createObjectURL(item)
    );
    setPreviewUrls((prev) => {
      prev.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
      return urls;
    });
    return () => urls.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
  }, [frames, cropEnabled]);

  return (
    <div className="tab-video-work">
      <p className="tab-desc">
        동영상을 업로드한 뒤 프레임 간격을 정해 이미지로 나눕니다. (선택) 중앙 크롭 후 이미지 ZIP 또는 MP4로 저장할 수 있습니다.
      </p>

      <section className="video-section">
        <label className="section-label">1단계: 동영상 입력 및 프레임 추출</label>
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            onSelectVideo(e.dataTransfer?.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            onChange={(e) => onSelectVideo(e.target.files)}
            className="upload-input"
          />
          {videoPreviewUrl ? (
            <div
              className="video-preview-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                ref={videoRef}
                src={videoPreviewUrl}
                muted
                playsInline
                preload="metadata"
                className="video-preview"
              />
            </div>
          ) : (
            <span className="upload-text">클릭하거나 동영상을 여기에 드래그</span>
          )}
        </div>
        {videoPreviewUrl && (
          <div className="frame-options">
            <div className="frame-interval-group">
              <span className="frame-interval-label">프레임 간격 (매 N번째 프레임만 추출)</span>
              <div className="frame-interval-buttons">
                {[4, 8, 16].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn-interval ${frameInterval === n ? "active" : ""}`}
                    onClick={() => setFrameInterval(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label className="frame-interval-custom">
                직접 입력
                <input
                  type="number"
                  min={1}
                  value={frameInterval}
                  onChange={(e) => setFrameInterval(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={runExtract}
              disabled={!!extractProgress}
            >
              {extractProgress
                ? `추출 중… ${extractProgress.current}/${extractProgress.total}`
                : "프레임 추출"}
            </button>
          </div>
        )}
      </section>

      {frames.length > 0 && (
        <>
          <section className="crop-section">
            <label className="section-label">2단계 (선택): 중앙 기준 크롭</label>
            <div className="crop-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={cropEnabled}
                  onChange={(e) => setCropEnabled(e.target.checked)}
                />
                크롭 적용
              </label>
              <label>
                크롭 너비 (px)
                <input
                  type="number"
                  min={1}
                  value={cropWidth}
                  onChange={(e) => setCropWidth(Number(e.target.value) || 720)}
                />
              </label>
              <label>
                크롭 높이 (px)
                <input
                  type="number"
                  min={1}
                  value={cropHeight}
                  onChange={(e) => setCropHeight(Number(e.target.value) || 720)}
                />
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={applyCrop}
                disabled={!!cropProgress}
              >
                {cropProgress
                  ? `적용 중… ${cropProgress.current}/${cropProgress.total}`
                  : "크롭 적용"}
              </button>
            </div>
            <p className="crop-hint">
              예: 1280×720 동영상에서 720×720 중앙 크롭 시, 좌우 280px씩 잘려 나갑니다.
            </p>
          </section>

          <section className="removebg-section">
            <label className="section-label">3단계 (선택): 배경 제거 (RGB → RGBA)</label>
            <p className="removebg-hint">
              프레임 이미지를 한 장씩 Triton API로 배경 제거합니다. (상단 API 설정과 무관하게 Triton만 사용)
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={applyRemoveBg}
              disabled={!!removeBgProgress}
            >
              {removeBgProgress
                ? `배경 제거 중… ${removeBgProgress.current}/${removeBgProgress.total}장`
                : "배경 제거 적용"}
            </button>
          </section>

          <section className="download-section">
            <label className="section-label">4단계: 다운로드</label>
            <div className="download-fps-row">
              <span className="fps-label">동영상 FPS (MP4 저장 시)</span>
              <div className="fps-buttons">
                {[8, 16, 24, 32].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn-fps ${videoFps === n ? "active" : ""}`}
                    onClick={() => setVideoFps(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="download-options">
              <button type="button" className="btn-primary" onClick={downloadAsZip}>
                이미지 ZIP 다운로드
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={exportAsMp4}
                disabled={mp4Loading}
              >
                {mp4Loading ? "동영상 생성 중…" : "동영상(MP4)으로 저장"}
              </button>
            </div>
            <p className="download-hint">
              ZIP·MP4 모두 현재 적용된 단계(크롭·배경 제거 포함)가 반영됩니다. MP4는 서버에서 생성됩니다.
            </p>
          </section>

          <section className="frames-preview">
            <h3 className="results-title">추출된 프레임 ({frames.length}장)</h3>
            <div className="frames-grid">
              {previewUrls.map((url, i) => (
                <div key={i} className="frame-card">
                  <img src={url} alt={`프레임 ${i + 1}`} className="frame-preview" />
                  <span className="frame-num">{i + 1}</span>
                </div>
              ))}
            </div>
            {frames.length > 24 && (
              <p className="frames-more">외 {frames.length - 24}장 …</p>
            )}
          </section>
        </>
      )}

      {error && <div className="message error">{error}</div>}
    </div>
  );
}
