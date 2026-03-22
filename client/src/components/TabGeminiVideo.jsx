import { useState, useEffect, useMemo, useRef } from "react";
import "./TabText2Image.css";
import "./TabGeminiVideo.css";

const API_BASE = "/api";

function FrameSlot({ label, file, previewUrl, onFile, isDragging, onDragEnter, onDragLeave, onDrop }) {
  const inputRef = useRef(null);

  return (
    <div className="tab-gemini-video-frame-slot">
      <span className="tab-gemini-video-frame-label">{label}</span>
      <div
        className={`tab-gemini-video-drop ${isDragging ? "dragging" : ""} ${previewUrl ? "has-image" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {previewUrl ? (
          <img className="tab-gemini-video-frame-preview" src={previewUrl} alt={label} />
        ) : (
          <span className="tab-gemini-video-drop-text">PNG / JPEG · 클릭 또는 드래그</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="tab-gemini-video-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {file && <span className="tab-gemini-video-file-name">{file.name}</span>}
    </div>
  );
}

export default function TabGeminiVideo() {
  const [models, setModels] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [model, setModel] = useState("veo-3.1-generate-preview");
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(6);
  const [prompt, setPrompt] = useState("");

  const [startFile, setStartFile] = useState(null);
  const [startPreview, setStartPreview] = useState("");
  const [startDragging, setStartDragging] = useState(false);

  const [endFile, setEndFile] = useState(null);
  const [endPreview, setEndPreview] = useState("");
  const [endDragging, setEndDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/veo/models`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.models) ? data.models : [];
        setModels(list);
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoaded(true));
  }, []);

  const currentModel = useMemo(() => models.find((m) => m.id === model), [models, model]);

  useEffect(() => {
    if (!models.length) return;
    const ids = models.map((m) => m.id);
    if (!ids.includes(model)) setModel(ids[0]);
  }, [models, model]);

  useEffect(() => {
    if (!currentModel) return;
    const resIds = currentModel.resolutions.map((r) => r.value);
    setResolution((prev) => (resIds.includes(prev) ? prev : resIds[0]));
    const ars = currentModel.aspectRatios.map((a) => a.value);
    setAspectRatio((prev) => (ars.includes(prev) ? prev : ars[0]));
    const durs = currentModel.durations;
    setDuration((prev) => (durs.includes(prev) ? prev : durs[0]));
  }, [currentModel?.id]);

  useEffect(() => {
    if (!currentModel) return;
    if (currentModel.forceEightSecondResolutions?.includes(resolution)) {
      setDuration(8);
    }
    if (currentModel.forceAspect16x9Resolutions?.includes(resolution)) {
      setAspectRatio("16:9");
    }
  }, [currentModel, resolution]);

  function handleFileSelect(file, setFile, setPreview) {
    setFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
    setError("");
    setVideoUrl("");
  }

  function makeDragHandlers(setFile, setPreview, setDragging) {
    return {
      onDragEnter: (e) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: (e) => {
        e.preventDefault();
        setDragging(false);
      },
      onDrop: (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && /image\/(png|jpeg)/.test(file.type)) {
          handleFileSelect(file, setFile, setPreview);
        }
      },
    };
  }

  const needEight = currentModel?.forceEightSecondResolutions?.includes(resolution);
  const need169 = currentModel?.forceAspect16x9Resolutions?.includes(resolution);

  async function handleGenerate() {
    if (!startFile) {
      setError("시작 이미지(첫 프레임)를 넣어 주세요.");
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("프롬프트를 입력해 주세요.");
      return;
    }
    if (!modelsLoaded || !currentModel) {
      setError("모델 정보를 불러오는 중이거나 사용할 수 없습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setVideoUrl("");

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => controller.abort(), 12 * 60 * 1000);

    try {
      const formData = new FormData();
      formData.append("startFrame", startFile);
      if (endFile) {
        formData.append("endFrame", endFile);
      }
      formData.append("model", model);
      const effDuration = needEight ? 8 : duration;
      const effAspect = need169 ? "16:9" : aspectRatio;
      formData.append("durationSeconds", String(effDuration));
      formData.append("prompt", trimmed);
      formData.append("aspectRatio", effAspect);
      formData.append("resolution", resolution);

      const res = await fetch(`${API_BASE}/veo/generate`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        let msg = "동영상 생성 실패.";
        try {
          const data = await res.json();
          msg = data.error || msg;
        } catch (_) {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (err) {
      if (err.name === "AbortError") {
        setError("요청이 취소되었거나 시간이 초과되었습니다.");
      } else {
        setError(err.message || "동영상 생성 중 오류가 발생했습니다.");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function handleDownload() {
    if (!videoUrl) return;
    const safe = model.replace(/[^\w.-]/g, "_");
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `gemini-video-${safe}-${Date.now()}.mp4`;
    a.click();
  }

  const canGenerate =
    !loading && !!startFile && prompt.trim() && modelsLoaded && !!currentModel;

  return (
    <div className="tab-text2image tab-gemini-video-page">
      <p className="tab-desc tab-gemini-video-intro">
        시작 이미지는 필수이고, 마지막 프레임은 넣지 않으면 첫 이미지 기준으로만 생성합니다. 프롬프트는 입력한 내용이{" "}
        <strong>그대로</strong> API에 전달됩니다(서버에서 문장을 덧붙이지 않습니다).{" "}
        <code className="tab-gemini-video-code">GEMINI_API_KEY</code>가 필요합니다. 해상도·비율 제약은{" "}
        <a
          href="https://ai.google.dev/gemini-api/docs/video"
          target="_blank"
          rel="noopener noreferrer"
          className="tab-gemini-video-doc-link"
        >
          Veo 문서
        </a>
        와 동일합니다.
        {needEight && <span className="tab-gemini-video-hint"> 선택한 해상도는 8초만 지원합니다.</span>}
        {need169 && <span className="tab-gemini-video-hint"> 선택한 해상도는 16:9만 지원합니다.</span>}
      </p>

      <div className="tab-gemini-video-toolbar">
        <div className="model-row tab-gemini-video-field">
          <label className="model-label" htmlFor="gemini-video-model">
            모델
          </label>
          {!modelsLoaded ? (
            <span className="tab-gemini-video-muted">불러오는 중…</span>
          ) : (
            <select
              id="gemini-video-model"
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading || !models.length}
              aria-label="Veo 모델"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="model-row tab-gemini-video-field">
          <label className="model-label" htmlFor="gemini-video-resolution">
            해상도
          </label>
          <select
            id="gemini-video-resolution"
            className="model-select"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={loading || !currentModel}
            aria-label="해상도"
          >
            {(currentModel?.resolutions || []).map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="model-row tab-gemini-video-field">
          <label className="model-label" htmlFor="gemini-video-aspect">
            화면 비율
          </label>
          <select
            id="gemini-video-aspect"
            className="model-select"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            disabled={loading || !currentModel || need169}
            aria-label="화면 비율"
          >
            {(currentModel?.aspectRatios || []).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="tab-gemini-video-duration">
          <span className="model-label">길이</span>
          <div className="tab-gemini-video-duration-btns">
            {(currentModel?.durations || [4, 6, 8]).map((sec) => (
              <button
                key={sec}
                type="button"
                className={`tab-gemini-video-dur ${duration === sec ? "active" : ""}`}
                onClick={() => setDuration(sec)}
                disabled={loading || needEight}
                title={needEight ? "이 해상도는 8초만 가능합니다" : undefined}
              >
                {sec}초
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tab-gemini-video-frames">
        <FrameSlot
          label="시작 이미지 (첫 프레임)"
          file={startFile}
          previewUrl={startPreview}
          onFile={(f) => handleFileSelect(f, setStartFile, setStartPreview)}
          isDragging={startDragging}
          {...makeDragHandlers(setStartFile, setStartPreview, setStartDragging)}
        />
        <FrameSlot
          label="마지막 프레임 이미지 (선택)"
          file={endFile}
          previewUrl={endPreview}
          onFile={(f) => handleFileSelect(f, setEndFile, setEndPreview)}
          isDragging={endDragging}
          {...makeDragHandlers(setEndFile, setEndPreview, setEndDragging)}
        />
      </div>

      <div className="prompt-row tab-gemini-video-prompt-block">
        <label className="tab-gemini-video-prompt-label" htmlFor="gemini-video-prompt">
          프롬프트
        </label>
        <textarea
          id="gemini-video-prompt"
          className="prompt-input tab-gemini-video-prompt-text"
          placeholder="원하는 장면·움직임·스타일 등을 자유롭게 한국어 또는 영어로 작성하세요."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          rows={8}
        />
      </div>

      <div className="tab-gemini-video-actions">
        <button type="button" className="btn-primary" onClick={handleGenerate} disabled={!canGenerate}>
          {loading ? "생성 중…" : "동영상 생성"}
        </button>
        {loading && (
          <button type="button" className="btn-secondary" onClick={handleCancel}>
            취소
          </button>
        )}
      </div>

      {loading && (
        <div className="tab-gemini-video-loading">
          <div className="tab-gemini-video-spinner" />
          <span>동영상 생성 중… (수 분 걸릴 수 있습니다)</span>
        </div>
      )}

      {error && <div className="message error">{error}</div>}

      {videoUrl && (
        <div className="tab-gemini-video-result">
          <h3 className="tab-gemini-video-result-title">생성 완료</h3>
          <video className="tab-gemini-video-player" src={videoUrl} controls playsInline />
          <button type="button" className="btn-secondary" onClick={handleDownload}>
            MP4 다운로드
          </button>
        </div>
      )}
    </div>
  );
}
