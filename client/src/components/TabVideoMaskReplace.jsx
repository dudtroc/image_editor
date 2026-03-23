import { useState, useRef, useCallback, useEffect } from "react";
import { downloadZip as buildZipResponse } from "client-zip";
import "./TabVideoWork.css";
import "./TabVideoMaskReplace.css";

const API_BASE = "/api";

/** 마스크 픽셀당 B 가중치 0–255 (흰색 → 255) */
function loadMaskWeights(file, whiteThreshold) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error("마스크 크기를 알 수 없습니다."));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;
      const t = Math.min(255, Math.max(0, Number.isFinite(whiteThreshold) ? whiteThreshold : 250));
      const weights = new Uint8Array(w * h);
      let p = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const isWhite = r >= t && g >= t && b >= t;
        weights[p++] = isWhite ? 255 : 0;
      }
      resolve({ w, h, weights });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("마스크 이미지를 불러올 수 없습니다."));
    };
    img.src = url;
  });
}

function waitVideoReady(video) {
  return new Promise((resolve, reject) => {
    const ok = () =>
      Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0;
    if (ok()) {
      resolve();
      return;
    }
    const done = () => {
      if (ok()) {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("loadeddata", done);
        video.removeEventListener("canplay", done);
        resolve();
      }
    };
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("loadeddata", done);
    video.addEventListener("canplay", done);
    video.addEventListener("error", () => reject(new Error("동영상을 불러올 수 없습니다.")), { once: true });
    video.load();
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const dur = video.duration;
    const clamped =
      !Number.isFinite(dur) || dur <= 0
        ? 0
        : Math.min(Math.max(0, time), Math.max(0, dur - 1e-4));
    if (Math.abs(video.currentTime - clamped) < 1e-4) {
      requestAnimationFrame(() => resolve());
      return;
    }
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("동영상 탐색 실패"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onErr, { once: true });
    video.currentTime = clamped;
  });
}

async function seekPair(videoA, videoB, time) {
  const t = time;
  await seekVideo(videoA, t);
  await seekVideo(videoB, t);
}

export default function TabVideoMaskReplace() {
  const [videoAFile, setVideoAFile] = useState(null);
  const [videoBFile, setVideoBFile] = useState(null);
  const [maskFile, setMaskFile] = useState(null);
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [whiteThreshold, setWhiteThreshold] = useState(250);
  const [fps, setFps] = useState(30);
  const [frames, setFrames] = useState([]);
  const [progress, setProgress] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [mp4Loading, setMp4Loading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState("");
  const [previewUrls, setPreviewUrls] = useState([]);

  const videoARef = useRef(null);
  const videoBRef = useRef(null);
  const inputARef = useRef(null);
  const inputBRef = useRef(null);
  const inputMaskRef = useRef(null);

  useEffect(() => {
    return () => {
      if (urlA) URL.revokeObjectURL(urlA);
      if (urlB) URL.revokeObjectURL(urlB);
    };
  }, [urlA, urlB]);

  useEffect(() => {
    if (!maskFile) {
      setMaskPreviewUrl("");
      return;
    }
    const u = URL.createObjectURL(maskFile);
    setMaskPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [maskFile]);

  useEffect(() => {
    const urls = frames.slice(0, 24).map((b) => URL.createObjectURL(b));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [frames]);

  const setVideoA = useCallback((file) => {
    const f = file && file.type?.startsWith("video/") ? file : null;
    if (!f) return;
    setUrlA((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setVideoAFile(f);
    setFrames([]);
    setMeta(null);
    setError("");
  }, []);

  const setVideoB = useCallback((file) => {
    const f = file && file.type?.startsWith("video/") ? file : null;
    if (!f) return;
    setUrlB((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setVideoBFile(f);
    setFrames([]);
    setMeta(null);
    setError("");
  }, []);

  const setMask = useCallback((file) => {
    const f = file && file.type?.startsWith("image/") ? file : null;
    if (!f) return;
    setMaskFile(f);
    setFrames([]);
    setMeta(null);
    setError("");
  }, []);

  const runComposite = useCallback(async () => {
    if (!videoAFile || !urlA || !videoBFile || !urlB || !maskFile) {
      setError("동영상 A, 동영상 B, 마스크 이미지를 모두 선택해 주세요.");
      return;
    }
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!videoA || !videoB) {
      setError("비디오 요소가 준비되지 않았습니다.");
      return;
    }

    setError("");
    setFrames([]);
    setProgress({ current: 0, total: 1 });

    try {
      await waitVideoReady(videoA);
      await waitVideoReady(videoB);

      const { w: mw, h: mh, weights } = await loadMaskWeights(maskFile, whiteThreshold);
      const vw = videoA.videoWidth;
      const vh = videoA.videoHeight;
      if (vw !== videoB.videoWidth || vh !== videoB.videoHeight) {
        throw new Error(
          `동영상 A와 B의 해상도가 같아야 합니다. (A: ${vw}×${vh}, B: ${videoB.videoWidth}×${videoB.videoHeight})`
        );
      }
      if (vw !== mw || vh !== mh) {
        throw new Error(
          `동영상과 마스크 해상도가 같아야 합니다. (동영상: ${vw}×${vh}, 마스크: ${mw}×${mh})`
        );
      }

      const fpsVal = Math.max(1, Math.min(120, Number(fps) || 30));
      const framesA = Math.floor(videoA.duration * fpsVal);
      const framesB = Math.floor(videoB.duration * fpsVal);
      const frameCount = Math.min(framesA, framesB);

      setMeta({
        framesA,
        framesB,
        frameCount,
        fps: fpsVal,
        w: vw,
        h: vh,
      });

      if (frameCount <= 0) {
        throw new Error("사용할 프레임이 없습니다. FPS를 조정하거나 짧은 동영상인지 확인하세요.");
      }

      const readOpt = { willReadFrequently: true };
      const canvas = document.createElement("canvas");
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d", readOpt);
      const cA = document.createElement("canvas");
      cA.width = vw;
      cA.height = vh;
      const ctxA = cA.getContext("2d", readOpt);
      const cB = document.createElement("canvas");
      cB.width = vw;
      cB.height = vh;
      const ctxB = cB.getContext("2d", readOpt);

      const out = ctx.createImageData(vw, vh);
      const o = out.data;
      const blobs = [];

      for (let i = 0; i < frameCount; i++) {
        const time = i / fpsVal;
        await seekPair(videoA, videoB, time);

        ctxA.drawImage(videoA, 0, 0);
        ctxB.drawImage(videoB, 0, 0);
        const idA = ctxA.getImageData(0, 0, vw, vh);
        const idB = ctxB.getImageData(0, 0, vw, vh);
        const a = idA.data;
        const b = idB.data;

        for (let j = 0; j < a.length; j += 4) {
          const pidx = j / 4;
          const m = weights[pidx];
          o[j] = ((a[j] * (255 - m) + b[j] * m) / 255) | 0;
          o[j + 1] = ((a[j + 1] * (255 - m) + b[j + 1] * m) / 255) | 0;
          o[j + 2] = ((a[j + 2] * (255 - m) + b[j + 2] * m) / 255) | 0;
          o[j + 3] = 255;
        }

        ctx.putImageData(out, 0, 0);
        const blob = await new Promise((res, rej) =>
          canvas.toBlob((bl) => (bl ? res(bl) : rej(new Error("프레임 인코딩 실패"))), "image/png", 0.95)
        );
        blobs.push(blob);
        if (i % 8 === 0 || i === frameCount - 1) {
          setProgress({ current: i + 1, total: frameCount });
        }
      }

      setFrames(blobs);
    } catch (e) {
      setError(e.message || "합성 중 오류가 발생했습니다.");
      setFrames([]);
      setMeta(null);
    } finally {
      setProgress(null);
    }
  }, [videoAFile, urlA, videoBFile, urlB, maskFile, whiteThreshold, fps]);

  const downloadZip = useCallback(async () => {
    if (frames.length === 0) return;
    setError("");
    try {
      const entries = frames.map((blob, i) => ({
        name: `frames/frame_${String(i + 1).padStart(4, "0")}.png`,
        input: blob,
      }));
      const response = buildZipResponse(entries);

      if (typeof window !== "undefined" && window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: "mask-composite-frames.zip",
            types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }],
          });
          const writable = await handle.createWritable();
          await response.body.pipeTo(writable);
          return;
        } catch (pickerErr) {
          if (pickerErr?.name === "AbortError") return;
        }
      }

      const content = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "mask-composite-frames.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      const msg = e?.message || "ZIP 다운로드 실패";
      setError(
        /allocation|memory|out of memory/i.test(msg)
          ? `${msg} — Chrome/Edge에서 저장 위치를 선택하면 메모리 부담이 줄어듭니다. 또는 FPS를 낮추거나 길이를 줄이세요.`
          : msg
      );
    }
  }, [frames]);

  const exportMp4 = useCallback(async () => {
    if (frames.length === 0) return;
    const fpsVal = meta?.fps ?? Math.max(1, Number(fps) || 30);
    setError("");
    setMp4Loading(true);
    try {
      const form = new FormData();
      form.append("fps", String(fpsVal));
      frames.forEach((blob, i) => {
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
      a.download = "mask-composite.mp4";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e.message || "동영상 변환 실패");
    } finally {
      setMp4Loading(false);
    }
  }, [frames, meta, fps]);

  return (
    <div className="tab-video-work tab-video-mask-replace">
      <p className="tab-desc">
        동영상 A를 바탕으로, 마스크 C에서 <strong>흰색</strong>인 위치만 동영상 B의 같은 프레임으로 덮어 씁니다. A와 B 중{" "}
        <strong>짧은 쪽 프레임 수</strong>만 사용하고 나머지는 버립니다. A, B, C의 가로·세로 픽셀 수는 같아야 합니다.
      </p>

      <div className="mask-replace-inputs">
        <section className="video-section">
          <label className="section-label">동영상 A (베이스)</label>
          <div
            className={`upload-zone ${isDragging ? "dragging" : ""}`}
            onClick={() => inputARef.current?.click()}
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
              const f = Array.from(e.dataTransfer?.files || []).find((x) => x.type.startsWith("video/"));
              if (f) setVideoA(f);
            }}
          >
            <input
              ref={inputARef}
              type="file"
              accept="video/*"
              className="upload-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setVideoA(f);
                e.target.value = "";
              }}
            />
            {urlA ? (
              <div className="video-preview-wrap" onClick={(e) => e.stopPropagation()}>
                <video ref={videoARef} src={urlA} muted playsInline preload="auto" className="video-preview" />
              </div>
            ) : (
              <span className="upload-text">클릭 또는 드래그로 선택</span>
            )}
          </div>
        </section>

        <section className="video-section">
          <label className="section-label">동영상 B (마스크 흰색 영역에 표시)</label>
          <div
            className={`upload-zone ${isDragging ? "dragging" : ""}`}
            onClick={() => inputBRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = Array.from(e.dataTransfer?.files || []).find((x) => x.type.startsWith("video/"));
              if (f) setVideoB(f);
            }}
          >
            <input
              ref={inputBRef}
              type="file"
              accept="video/*"
              className="upload-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setVideoB(f);
                e.target.value = "";
              }}
            />
            {urlB ? (
              <div className="video-preview-wrap" onClick={(e) => e.stopPropagation()}>
                <video ref={videoBRef} src={urlB} muted playsInline preload="auto" className="video-preview" />
              </div>
            ) : (
              <span className="upload-text">클릭 또는 드래그로 선택</span>
            )}
          </div>
        </section>

        <section className="video-section">
          <label className="section-label">마스크 C (흰색 = B 적용)</label>
          <div
            className={`upload-zone ${isDragging ? "dragging" : ""}`}
            onClick={() => inputMaskRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = Array.from(e.dataTransfer?.files || []).find((x) => x.type.startsWith("image/"));
              if (f) setMask(f);
            }}
          >
            <input
              ref={inputMaskRef}
              type="file"
              accept="image/*"
              className="upload-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setMask(f);
                e.target.value = "";
              }}
            />
            {maskFile && maskPreviewUrl ? (
              <div className="video-preview-wrap" onClick={(e) => e.stopPropagation()}>
                <img
                  src={maskPreviewUrl}
                  alt="마스크"
                  className="video-preview"
                  style={{ objectFit: "contain" }}
                />
              </div>
            ) : (
              <span className="upload-text">클릭 또는 드래그로 선택</span>
            )}
          </div>
        </section>
      </div>

      <section className="frame-options" style={{ marginTop: 8 }}>
        <label className="frame-interval-custom">
          흰색 임계값 (RGB 모두 이 값 이상이면 흰색)
          <input
            type="number"
            min={0}
            max={255}
            value={whiteThreshold}
            onChange={(e) => setWhiteThreshold(Math.min(255, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
        <label className="frame-interval-custom">
          FPS (프레임 수 = 재생 길이×FPS, MP4에도 동일)
          <input
            type="number"
            min={1}
            max={120}
            value={fps}
            onChange={(e) => setFps(Math.max(1, Math.min(120, Number(e.target.value) || 30)))}
          />
        </label>
        <button type="button" className="btn-primary" onClick={runComposite} disabled={!!progress}>
          {progress ? `합성 중… ${progress.current}/${progress.total}` : "마스크 합성 실행"}
        </button>
      </section>

      {meta && (
        <p className="crop-hint" style={{ marginTop: 12 }}>
          A 추정 프레임 {meta.framesA}장 · B 추정 프레임 {meta.framesB}장 →{" "}
          <strong>{meta.frameCount}장</strong>만 사용 ({meta.w}×{meta.h}px). 긴 쪽의 나머지 프레임은 사용하지 않습니다.
        </p>
      )}

      {frames.length > 0 && (
        <>
          <section className="download-section" style={{ marginTop: 24 }}>
            <label className="section-label">다운로드</label>
            <div className="download-options">
              <button type="button" className="btn-primary" onClick={downloadZip}>
                PNG 시퀀스 (ZIP)
              </button>
              <button type="button" className="btn-primary" onClick={exportMp4} disabled={mp4Loading}>
                {mp4Loading ? "MP4 생성 중…" : "MP4로 저장"}
              </button>
            </div>
            <p className="download-hint">
              PNG ZIP은 가능하면 저장 대화상자(Chrome/Edge)에서 스트리밍으로 저장해 메모리를 덜 씁니다. MP4는 서버(ffmpeg)에서 합성하며, 인코딩은 빠른 프리셋(ultrafast)을 사용합니다.
            </p>
          </section>

          <section className="frames-preview">
            <h3 className="results-title">결과 프레임 ({frames.length}장, 미리보기 최대 24장)</h3>
            <div className="frames-grid">
              {previewUrls.map((url, i) => (
                <div key={i} className="frame-card">
                  <img src={url} alt={`프레임 ${i + 1}`} className="frame-preview" />
                  <span className="frame-num">{i + 1}</span>
                </div>
              ))}
            </div>
            {frames.length > 24 && <p className="frames-more">외 {frames.length - 24}장 …</p>}
          </section>
        </>
      )}

      {error && <div className="message error">{error}</div>}
    </div>
  );
}
