import { useState, useEffect, useMemo } from "react";
import "./TabText2Image.css";

const API_BASE = "/api";

const DEFAULT_MODELS = { openai: "gpt-image-2", gemini: "gemini-2.0-flash-exp-image-generation" };

function modelId(entry) {
  return typeof entry === "string" ? entry : entry.id;
}
function modelLabel(entry) {
  return typeof entry === "string" ? entry : entry.label;
}

export default function TabText2Image({ provider }) {
  const [prompt, setPrompt] = useState("");
  const [imageB64, setImageB64] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState({ openai: [], gemini: [] });
  const [model, setModel] = useState(DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.openai);
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("medium");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");

  useEffect(() => {
    fetch(`${API_BASE}/text2image/models`)
      .then((r) => r.json())
      .then((data) => setModels(data))
      .catch(() => setModels({
        openai: [
          { id: "gpt-image-2", label: "GPT Image 2", sizes: [], qualities: [] },
          { id: "gpt-image-1.5", label: "GPT Image 1.5", sizes: [], qualities: [] },
          { id: "gpt-image-1", label: "GPT Image 1", sizes: [], qualities: [] },
          { id: "dall-e-3", label: "DALL·E 3", sizes: [], qualities: [] },
          { id: "dall-e-2", label: "DALL·E 2", sizes: [] },
        ],
        gemini: [
          { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", aspectRatios: [], imageSizes: [] },
          { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", aspectRatios: [], imageSizes: [] },
          { id: "gemini-2.0-flash-exp-image-generation", label: "Gemini 2.0 Flash (실험)", aspectRatios: [], imageSizes: [] },
          { id: "gemini-2.5-flash-preview-image", label: "Gemini 2.5 Flash Image", aspectRatios: [], imageSizes: [] },
        ],
      }));
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

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("프롬프트를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setImageB64("");
    try {
      const body = { prompt: trimmed, provider, model };
      if (provider === "openai") {
        body.size = size;
        if (currentModelEntry?.qualities?.length) body.quality = quality;
      } else {
        body.aspectRatio = aspectRatio;
        body.imageSize = imageSize;
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

  const download = () => {
    if (!imageB64) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${imageB64}`;
    a.download = "generated.png";
    a.click();
  };

  return (
    <div className="tab-text2image">
      <p className="tab-desc">
        설명을 입력하면 선택한 API와 모델로 이미지를 생성합니다.
      </p>

      <div className="model-row">
        <label className="model-label">모델</label>
        <select
          className="model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="이미지 생성 모델 선택"
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

      <div className="prompt-row">
        <textarea
          className="prompt-input"
          placeholder="예: 달 위를 걷는 고양이, 수채화 스타일"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "생성 중…" : "이미지 생성"}
        </button>
      </div>

      {error && <div className="message error">{error}</div>}

      {imageB64 && (
        <div className="result-box">
          <img
            src={`data:image/png;base64,${imageB64}`}
            alt="Generated"
            className="generated-image"
          />
          <button type="button" className="btn-secondary" onClick={download}>
            PNG 다운로드
          </button>
        </div>
      )}
    </div>
  );
}
