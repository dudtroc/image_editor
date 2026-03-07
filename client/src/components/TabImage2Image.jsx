import { useState, useEffect, useMemo, useCallback } from "react";
import "./TabImage2Image.css";

const API_BASE = "/api";

const DEFAULT_MODELS = {
  openai: "gpt-image-1.5",
  gemini: "gemini-2.0-flash-exp-image-generation",
};

function modelId(entry) {
  return typeof entry === "string" ? entry : entry.id;
}
function modelLabel(entry) {
  return typeof entry === "string" ? entry : entry.label;
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

export default function TabImage2Image({ provider }) {
  const [inputImagesB64, setInputImagesB64] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [outputImageB64, setOutputImageB64] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState({ openai: [], gemini: [] });
  const [model, setModel] = useState(DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.openai);
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("medium");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");

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
      setModel(DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.openai);
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

  const addFilesAsImages = useCallback((files) => {
    const imageFiles = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    Promise.all(imageFiles.map(fileToB64)).then((b64List) => {
      setInputImagesB64((prev) => [...prev, ...b64List]);
    });
  }, []);

  const onFilesChange = useCallback(
    (e) => {
      addFilesAsImages(e.target.files);
      e.target.value = "";
    },
    [addFilesAsImages]
  );

  const [isDragging, setIsDragging] = useState(false);
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      addFilesAsImages(e.dataTransfer?.files);
    },
    [addFilesAsImages]
  );

  const removeInputImage = useCallback((index) => {
    setInputImagesB64((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const generate = async () => {
    if (!inputImagesB64.length) {
      setError("최소 1개 이상의 이미지를 올려 주세요.");
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("프롬프트를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setOutputImageB64("");
    try {
      const body = {
        prompt: trimmed,
        provider,
        model,
        images: inputImagesB64,
      };
      if (provider === "openai") {
        body.size = size;
        if (currentModelEntry?.qualities?.length) body.quality = quality;
      } else {
        body.aspectRatio = aspectRatio;
        body.imageSize = imageSize;
      }
      const res = await fetch(`${API_BASE}/image2image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "변환 실패");
      if (data.data) setOutputImageB64(data.data);
      else throw new Error("이미지 데이터 없음");
    } catch (err) {
      setError(err.message || "이미지 변환 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!outputImageB64) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${outputImageB64}`;
    a.download = "image2image-output.png";
    a.click();
  };

  const useOutputAsInput = () => {
    if (!outputImageB64) return;
    setInputImagesB64([outputImageB64]);
  };

  return (
    <div className="tab-image2image">
      <p className="tab-desc">
        이미지를 여러 개 올리고 프롬프트를 입력하면, 선택한 API·모델로 새 이미지를 생성합니다.
      </p>

      <div className="model-row">
        <label className="model-label">모델</label>
        <select
          className="model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="이미지 변환 모델 선택"
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

      <div className="upload-section">
        <label className="upload-label">입력 이미지 (여러 개 선택 가능)</label>
        <div
          className={`upload-area ${isDragging ? "upload-area--dragging" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesChange}
            className="upload-input"
            aria-label="이미지 파일 선택"
          />
          <span className="upload-hint">클릭하거나 파일을 끌어다 놓으세요</span>
        </div>
        {inputImagesB64.length > 0 && (
          <div className="input-preview-list">
            {inputImagesB64.map((b64, i) => (
              <div key={i} className="input-preview-wrap">
                <img
                  src={`data:image/png;base64,${b64}`}
                  alt={`입력 ${i + 1}`}
                  className="input-preview-img"
                />
                <button
                  type="button"
                  className="input-preview-remove"
                  onClick={() => removeInputImage(i)}
                  aria-label={`입력 이미지 ${i + 1} 제거`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="prompt-row">
        <textarea
          className="prompt-input"
          placeholder="예: 배경을 바다로 바꿔 주세요 / 이 스타일로 다시 그려 주세요"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={generate}
          disabled={loading || inputImagesB64.length === 0}
        >
          {loading ? "변환 중…" : "이미지 변환"}
        </button>
      </div>

      {error && <div className="message error">{error}</div>}

      {outputImageB64 && (
        <div className="result-box">
          <img
            src={`data:image/png;base64,${outputImageB64}`}
            alt="변환 결과"
            className="generated-image"
          />
          <div className="result-actions">
            <button type="button" className="btn-secondary" onClick={download}>
              PNG 다운로드
            </button>
            <button type="button" className="btn-use-as-input" onClick={useOutputAsInput}>
              출력 이미지를 입력으로 사용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
