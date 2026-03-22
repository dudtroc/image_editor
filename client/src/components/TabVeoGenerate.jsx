import { useState, useRef } from "react";
import "./TabVeoGenerate.css";

const VEO_MODELS = [
  { id: "veo-3.1-generate-preview", label: "Veo 3.1 (Preview)" },
  { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast (Preview)" },
  { id: "veo-3.1-generate-001", label: "Veo 3.1" },
  { id: "veo-3.1-fast-generate-001", label: "Veo 3.1 Fast" },
  { id: "veo-3.0-generate-001", label: "Veo 3.0" },
  { id: "veo-3.0-fast-generate-001", label: "Veo 3.0 Fast" },
  { id: "veo-3.0-generate-exp", label: "Veo 3.0 (실험 · generate-exp)" },
  { id: "veo-2.0-generate-001", label: "Veo 2.0" },
];

const DURATION_OPTIONS = [4, 6, 8];

function FrameUpload({ label, file, previewUrl, onFile, isDragging, onDragEnter, onDragLeave, onDrop }) {
  const inputRef = useRef(null);

  return (
    <div className="veo-frame-slot">
      <span className="veo-section-label">{label}</span>
      <div
        className={`veo-upload-zone ${isDragging ? "dragging" : ""} ${previewUrl ? "has-image" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {previewUrl ? (
          <img className="veo-frame-preview" src={previewUrl} alt={label} />
        ) : (
          <span className="veo-upload-text">클릭 또는 드래그하여 이미지 업로드</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="veo-upload-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {file && (
        <span className="veo-file-name">{file.name}</span>
      )}
    </div>
  );
}

export default function TabVeoGenerate() {
  const [model, setModel] = useState(VEO_MODELS[0].id);
  const [duration, setDuration] = useState(6);
  const [subject, setSubject] = useState("");
  const [animationDesc, setAnimationDesc] = useState("");

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

  function handleFileSelect(file, setFile, setPreview) {
    setFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
    setError("");
    setVideoUrl("");
  }

  function makeDragHandlers(setFile, setPreview, setDragging) {
    return {
      onDragEnter: (e) => { e.preventDefault(); setDragging(true); },
      onDragLeave: (e) => { e.preventDefault(); setDragging(false); },
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

  async function handleGenerate() {
    if (!startFile || !endFile) {
      setError("시작 프레임과 끝 프레임 이미지를 모두 업로드해주세요.");
      return;
    }
    if (!subject.trim()) {
      setError("피사체(input1)를 입력해주세요.");
      return;
    }
    if (!animationDesc.trim()) {
      setError("애니메이션 상세 설명(input2)을 입력해주세요.");
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
      formData.append("endFrame", endFile);
      formData.append("model", model);
      formData.append("durationSeconds", String(duration));
      formData.append("subject", subject.trim());
      formData.append("animationDesc", animationDesc.trim());
      formData.append("aspectRatio", "16:9");
      formData.append("resolution", "720p");

      const res = await fetch("/api/veo/generate", {
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
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = "veo-generated.mp4";
    a.click();
  }

  const canGenerate = !loading && !!startFile && !!endFile && subject.trim() && animationDesc.trim();

  return (
    <div className="tab-veo-generate">
      <p className="veo-desc">
        Veo API를 사용하여 시작 프레임과 끝 프레임 사이를 무한 반복(Seamless Looping) 애니메이션으로 생성합니다.
        <br />
        <span className="veo-note">API 선택 콤보박스와 무관하게 항상 Veo (Gemini) API를 사용합니다.</span>
      </p>

      {/* Model + Duration */}
      <div className="veo-config-row">
        <div className="veo-field">
          <label className="veo-section-label" htmlFor="veo-model">Veo 모델</label>
          <select
            id="veo-model"
            className="veo-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading}
          >
            {VEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="veo-field">
          <span className="veo-section-label">동영상 길이</span>
          <div className="veo-duration-buttons">
            {DURATION_OPTIONS.map((sec) => (
              <button
                key={sec}
                type="button"
                className={`veo-btn-duration ${duration === sec ? "active" : ""}`}
                onClick={() => setDuration(sec)}
                disabled={loading}
              >
                {sec}초
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Frame Uploads */}
      <div className="veo-frames-row">
        <FrameUpload
          label="시작 프레임 (첫 번째 이미지)"
          file={startFile}
          previewUrl={startPreview}
          onFile={(f) => handleFileSelect(f, setStartFile, setStartPreview)}
          isDragging={startDragging}
          {...makeDragHandlers(setStartFile, setStartPreview, setStartDragging)}
        />
        <FrameUpload
          label="끝 프레임 (마지막 이미지)"
          file={endFile}
          previewUrl={endPreview}
          onFile={(f) => handleFileSelect(f, setEndFile, setEndPreview)}
          isDragging={endDragging}
          {...makeDragHandlers(setEndFile, setEndPreview, setEndDragging)}
        />
      </div>

      {/* Text Inputs */}
      <div className="veo-inputs-section">
        <div className="veo-input-field">
          <label className="veo-section-label" htmlFor="veo-subject">
            [input1] 피사체
          </label>
          <input
            id="veo-subject"
            type="text"
            className="veo-text-input"
            placeholder="예: 파란 드레스를 입은 소녀 캐릭터"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="veo-input-field">
          <label className="veo-section-label" htmlFor="veo-anim-desc">
            [input2] 애니메이션 상세 설명
          </label>
          <textarea
            id="veo-anim-desc"
            className="veo-textarea"
            placeholder="예: 드레스의 하단 裾 부분이 바람에 부드럽게 흔들리는 움직임"
            value={animationDesc}
            onChange={(e) => setAnimationDesc(e.target.value)}
            disabled={loading}
            rows={3}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="veo-actions">
        <button
          type="button"
          className="veo-btn-primary"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          동영상 생성
        </button>
        {loading && (
          <button
            type="button"
            className="veo-btn-secondary"
            onClick={handleCancel}
          >
            취소
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="veo-loading">
          <div className="veo-spinner" />
          <span>동영상 생성 중... (수 분 소요될 수 있습니다)</span>
        </div>
      )}

      {/* Error */}
      {error && <p className="veo-message error">{error}</p>}

      {/* Result */}
      {videoUrl && (
        <div className="veo-result">
          <h3 className="veo-result-title">생성 완료</h3>
          <video
            className="veo-video-preview"
            src={videoUrl}
            controls
            loop
            autoPlay
          />
          <div className="veo-result-actions">
            <button type="button" className="veo-btn-primary" onClick={handleDownload}>
              MP4 다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
