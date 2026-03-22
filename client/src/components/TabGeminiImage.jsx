import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./TabText2Image.css";
import "./TabGeminiImage.css";

const API_BASE = "/api";

const DEFAULT_MODEL = "gemini-2.0-flash-exp-image-generation";

function modelId(entry) {
  return typeof entry === "string" ? entry : entry.id;
}
function modelLabel(entry) {
  return typeof entry === "string" ? entry : entry.label;
}

export default function TabGeminiImage() {
  const [prompt, setPrompt] = useState("");
  const [imageB64, setImageB64] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");
  const [inputImageDataUrl, setInputImageDataUrl] = useState("");
  const [inputDragging, setInputDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/text2image/models`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.gemini) ? data.gemini : [];
        setModels(list);
      })
      .catch(() =>
        setModels([
          { id: "gemini-2.0-flash-exp-image-generation", label: "Gemini 2.0 Flash (실험)", aspectRatios: [], imageSizes: [] },
          { id: "gemini-2.5-flash-preview-image", label: "Gemini 2.5 Flash Image", aspectRatios: [], imageSizes: [] },
          { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", aspectRatios: [], imageSizes: [] },
          { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", aspectRatios: [], imageSizes: [] },
        ])
      )
      .finally(() => setModelsLoaded(true));
  }, []);

  const currentModelEntry = useMemo(() => {
    return models.find((m) => modelId(m) === model) || models[0];
  }, [models, model]);

  useEffect(() => {
    if (models.length) {
      const ids = models.map(modelId);
      setModel((prev) => (ids.includes(prev) ? prev : ids[0]));
    }
  }, [models]);

  useEffect(() => {
    const entry = currentModelEntry;
    if (!entry) return;
    if (entry.aspectRatios?.length) {
      const validRatios = entry.aspectRatios.map((r) => r.value);
      setAspectRatio((prev) => (validRatios.includes(prev) ? prev : validRatios[0]));
    }
    if (entry.imageSizes?.length) {
      const validSizes = entry.imageSizes.map((s) => s.value);
      setImageSize((prev) => (validSizes.includes(prev) ? prev : validSizes[0]));
    }
  }, [currentModelEntry]);

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
      r.readAsDataURL(file);
    });

  const applyInputImageFile = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
      setError("PNG, JPEG, WebP, GIF 이미지만 넣을 수 있습니다.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setInputImageDataUrl(dataUrl);
      setError("");
    } catch (e) {
      setError(e.message || "이미지를 불러오지 못했습니다.");
    }
  };

  const clearInputImage = () => {
    setInputImageDataUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const generate = async () => {
    if (!models.length) {
      setError("모델 목록을 불러올 수 없습니다. 서버를 확인해 주세요.");
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("프롬프트를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setImageB64("");
    try {
      const body = {
        prompt: trimmed,
        provider: "gemini",
        model,
        aspectRatio,
        imageSize,
      };
      if (inputImageDataUrl) {
        body.referenceImages = [inputImageDataUrl];
      }
      const res = await fetch(`${API_BASE}/text2image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
      if (data.data) setImageB64(data.data);
      else throw new Error("이미지 데이터 없음");
    } catch (err) {
      setError(err.message || "이미지 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = useCallback(() => {
    if (!imageB64) return;
    const safeModel = model.replace(/[^\w.-]/g, "_");
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${imageB64}`;
    a.download = `gemini-${safeModel}-${Date.now()}.png`;
    a.click();
  }, [imageB64, model]);

  return (
    <div className="tab-text2image tab-gemini-image">
      <p className="tab-desc">
        Google Gemini 이미지 생성 전용입니다. 서버 <code className="tab-gemini-image-env">.env</code>에{" "}
        <code className="tab-gemini-image-env">GEMINI_API_KEY</code>가 설정되어 있어야 합니다. 모델은{" "}
        <a
          href="https://ai.google.dev/gemini-api/docs/image-generation"
          target="_blank"
          rel="noopener noreferrer"
          className="tab-gemini-image-link"
        >
          Gemini 이미지 생성 문서
        </a>
        기준으로 호환 목록을 유지합니다. 참조 이미지는 넣지 않으면 텍스트만으로 생성하고, 넣으면 그 이미지와 프롬프트를 함께 사용합니다.
      </p>

      <div className="tab-gemini-image-input-section">
        <span className="tab-gemini-image-input-label">참조 이미지 (선택)</span>
        <div
          className={`tab-gemini-image-drop ${inputDragging ? "dragging" : ""} ${inputImageDataUrl ? "has-image" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setInputDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setInputDragging(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setInputDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) applyInputImageFile(file);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          {inputImageDataUrl ? (
            <img className="tab-gemini-image-input-preview" src={inputImageDataUrl} alt="참조 이미지 미리보기" />
          ) : (
            <span className="tab-gemini-image-drop-text">클릭 또는 드래그하여 이미지 추가 · 비워 두면 텍스트만 사용</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="tab-gemini-image-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) applyInputImageFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {inputImageDataUrl && (
          <button type="button" className="tab-gemini-image-remove-input btn-secondary" onClick={clearInputImage}>
            참조 이미지 제거
          </button>
        )}
      </div>

      <div className="model-row">
        <label className="model-label">모델</label>
        {!modelsLoaded ? (
          <span className="tab-gemini-image-muted">목록 불러오는 중…</span>
        ) : (
          <select
            className="model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Gemini 이미지 생성 모델"
            disabled={!models.length}
          >
            {models.map((m) => (
              <option key={modelId(m)} value={modelId(m)}>
                {modelLabel(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      {currentModelEntry?.aspectRatios?.length > 0 && (
        <div className="model-row">
          <label className="model-label">비율</label>
          <select
            className="model-select"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            aria-label="종횡비"
          >
            {currentModelEntry.aspectRatios.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentModelEntry?.imageSizes?.length > 0 && (
        <div className="model-row">
          <label className="model-label">해상도</label>
          <select
            className="model-select"
            value={imageSize}
            onChange={(e) => setImageSize(e.target.value)}
            aria-label="이미지 해상도"
          >
            {currentModelEntry.imageSizes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="prompt-row">
        <textarea
          className="prompt-input"
          placeholder="생성할 이미지를 설명해 주세요. 예: 달 위를 걷는 고양이, 수채화 스타일"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={generate}
          disabled={loading || !modelsLoaded || !models.length}
        >
          {loading ? "생성 중…" : "이미지 생성"}
        </button>
      </div>

      {error && <div className="message error">{error}</div>}

      {imageB64 && (
        <div className="result-box">
          <img src={`data:image/png;base64,${imageB64}`} alt="Gemini 생성 이미지" className="generated-image" />
          <button type="button" className="btn-secondary" onClick={download}>
            PNG 다운로드
          </button>
        </div>
      )}
    </div>
  );
}
