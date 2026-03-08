import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./TabStyleTransfer.css";

const API_BASE = "/api";
const DEFAULT_MODELS = {
  openai: "gpt-image-1.5",
  gemini: "gemini-2.0-flash-exp-image-generation",
};

function modelId(entry) {
  return typeof entry === "string" ? entry : entry?.id;
}
function modelLabel(entry) {
  return typeof entry === "string" ? entry : entry?.label;
}

function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TabStyleTransfer({ provider }) {
  const [inputFile, setInputFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [resultB64, setResultB64] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState({ openai: [], gemini: [] });
  const [model, setModel] = useState(DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.gemini);
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("medium");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/image2image/models`)
      .then((r) => r.json())
      .then((data) => setModels(data))
      .catch(() =>
        setModels({
          openai: [
            { id: "gpt-image-1.5", label: "GPT Image 1.5", sizes: [], qualities: [] },
            { id: "gpt-image-1", label: "GPT Image 1", sizes: [], qualities: [] },
            { id: "dall-e-2", label: "DALL·E 2", sizes: [] },
          ],
          gemini: [
            { id: "gemini-2.0-flash-exp-image-generation", label: "Gemini 2.0 Flash (실험)", aspectRatios: [], imageSizes: [] },
            { id: "gemini-2.5-flash-preview-image", label: "Gemini 2.5 Flash Image", aspectRatios: [], imageSizes: [] },
            { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", aspectRatios: [], imageSizes: [] },
            { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", aspectRatios: [], imageSizes: [] },
          ],
        })
      );
  }, []);

  const currentModelEntry = useMemo(() => {
    const list = models[provider] || [];
    return list.find((m) => modelId(m) === model) || list[0];
  }, [provider, models, model]);

  useEffect(() => {
    const list = models[provider];
    if (list?.length) {
      const ids = list.map(modelId);
      setModel((prev) => (ids.includes(prev) ? prev : ids[0]));
    } else {
      setModel(DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.gemini);
    }
  }, [provider, models]);

  useEffect(() => {
    const entry = currentModelEntry;
    if (!entry) return;
    if (provider === "openai" && entry.sizes?.length) {
      const validSizes = entry.sizes.map((s) => s.value);
      setSize((prev) => (validSizes.includes(prev) ? prev : validSizes[0]));
      if (entry.qualities?.length) {
        const validQualities = entry.qualities.map((q) => q.value);
        setQuality((prev) => (validQualities.includes(prev) ? prev : validQualities[0]));
      }
    }
    if (provider === "gemini" && entry.aspectRatios?.length) {
      const validRatios = entry.aspectRatios.map((r) => r.value);
      setAspectRatio((prev) => (validRatios.includes(prev) ? prev : validRatios[0]));
      if (entry.imageSizes?.length) {
        const validSizes = entry.imageSizes.map((s) => s.value);
        setImageSize((prev) => (validSizes.includes(prev) ? prev : validSizes[0]));
      }
    }
  }, [provider, currentModelEntry]);

  const onSelectFile = useCallback((fileList) => {
    const file = Array.from(fileList || []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setInputFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResultB64("");
    setError("");
  }, [previewUrl]);

  const runStyleTransfer = async () => {
    if (!inputFile) {
      setError("이미지를 먼저 올려 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResultB64("");
    try {
      const imageB64 = await fileToB64(inputFile);
      const res = await fetch(`${API_BASE}/concept-assets/style-transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          image: imageB64,
          size,
          quality,
          aspectRatio,
          imageSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "스타일 변환 실패");
      setResultB64(data.data || "");
    } catch (err) {
      setError(err.message || "스타일 변환 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = useCallback(() => {
    if (!resultB64) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${resultB64}`;
    a.download = "style-transfer-result.png";
    a.click();
  }, [resultB64]);

  return (
    <div className="tab-style-transfer">
      <p className="tab-desc">
        이미지를 업로드하면 client/data 폴더의 이미지들과 동일한 스타일로 변환합니다. 구도와 물체는 유지하고, 스타일만 적용합니다.
      </p>

      <div className="model-row">
        <label className="model-label">모델</label>
        <select
          className="model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="스타일 변환 모델 선택"
        >
          {(models[provider] || []).map((m) => (
            <option key={modelId(m)} value={modelId(m)}>
              {modelLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {provider === "openai" && currentModelEntry?.sizes?.length > 0 && (
        <>
          <div className="model-row">
            <label className="model-label">해상도</label>
            <select
              className="model-select"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              aria-label="해상도 선택"
            >
              {currentModelEntry.sizes.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {currentModelEntry.qualities?.length > 0 && (
            <div className="model-row">
              <label className="model-label">품질</label>
              <select
                className="model-select"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                aria-label="품질 선택"
              >
                {currentModelEntry.qualities.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {provider === "gemini" && currentModelEntry?.aspectRatios?.length > 0 && (
        <>
          <div className="model-row">
            <label className="model-label">비율</label>
            <select
              className="model-select"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              aria-label="비율 선택"
            >
              {currentModelEntry.aspectRatios.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {currentModelEntry.imageSizes?.length > 0 && (
            <div className="model-row">
              <label className="model-label">해상도</label>
              <select
                className="model-select"
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                aria-label="해상도 선택"
              >
                {currentModelEntry.imageSizes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <section className="section">
        <label className="section-label">입력 이미지</label>
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            onSelectFile(e.dataTransfer?.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={(e) => onSelectFile(e.target.files)}
            className="upload-input"
          />
          {previewUrl ? (
            <img src={previewUrl} alt="입력" className="preview-img" />
          ) : (
            <span className="upload-text">클릭하거나 이미지를 여기에 드래그</span>
          )}
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={runStyleTransfer}
          disabled={loading || !inputFile}
        >
          {loading ? "스타일 변환 중…" : "client/data 스타일로 변환"}
        </button>
      </section>

      {error && <div className="message error">{error}</div>}

      {resultB64 && (
        <section className="result-section">
          <h3 className="result-title">변환 결과</h3>
          <div className="result-box">
            <img
              src={`data:image/png;base64,${resultB64}`}
              alt="스타일 변환 결과"
              className="result-preview"
            />
            <button type="button" className="btn-download" onClick={download}>
              PNG 다운로드
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
