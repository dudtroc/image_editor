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

function newPromptRow() {
  return { id: crypto.randomUUID(), text: "" };
}

export default function TabGeminiImage() {
  const [promptRows, setPromptRows] = useState(() => [newPromptRow()]);
  const [batchResults, setBatchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");
  const [referenceImages, setReferenceImages] = useState([]);
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

  const addReferenceImageFiles = async (files) => {
    const list = Array.from(files || []).filter((f) => /^image\/(png|jpeg|webp|gif)$/i.test(f.type));
    if (!list.length) {
      if (files?.length) setError("PNG, JPEG, WebP, GIF 이미지만 넣을 수 있습니다.");
      return;
    }
    try {
      const newItems = await Promise.all(
        list.map(async (file) => ({
          id: crypto.randomUUID(),
          dataUrl: await readFileAsDataUrl(file),
        }))
      );
      setReferenceImages((prev) => [...prev, ...newItems]);
      setError("");
    } catch (e) {
      setError(e.message || "이미지를 불러오지 못했습니다.");
    }
  };

  const removeReferenceImage = (id) => {
    setReferenceImages((prev) => prev.filter((x) => x.id !== id));
  };

  const clearReferenceImages = () => {
    setReferenceImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updatePromptText = (id, text) => {
    setPromptRows((prev) => prev.map((row) => (row.id === id ? { ...row, text } : row)));
  };

  const addPromptRow = () => {
    setPromptRows((prev) => [...prev, newPromptRow()]);
  };

  const removePromptRow = (id) => {
    setPromptRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const fetchOneImage = async (promptText) => {
    const body = {
      prompt: promptText,
      provider: "gemini",
      model,
      aspectRatio,
      imageSize,
    };
    if (referenceImages.length) {
      body.referenceImages = referenceImages.map((r) => r.dataUrl);
    }
    const res = await fetch(`${API_BASE}/text2image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "생성 실패");
    if (!data.data) throw new Error("이미지 데이터 없음");
    return data.data;
  };

  const generate = async () => {
    if (!models.length) {
      setError("모델 목록을 불러올 수 없습니다. 서버를 확인해 주세요.");
      return;
    }
    const jobs = promptRows
      .map((row) => ({ id: row.id, prompt: row.text.trim() }))
      .filter((j) => j.prompt);
    if (!jobs.length) {
      setError("프롬프트를 하나 이상 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setBatchResults(null);
    try {
      const settled = await Promise.allSettled(jobs.map((j) => fetchOneImage(j.prompt)));
      const next = jobs.map((j, i) => {
        const s = settled[i];
        if (s.status === "fulfilled") {
          return { id: j.id, prompt: j.prompt, imageB64: s.value, error: null };
        }
        return {
          id: j.id,
          prompt: j.prompt,
          imageB64: null,
          error: s.reason?.message || "생성 실패",
        };
      });
      setBatchResults(next);
    } catch (err) {
      setError(err.message || "이미지 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const downloadOne = useCallback(
    (imageB64, index) => {
      if (!imageB64) return;
      const safeModel = model.replace(/[^\w.-]/g, "_");
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${imageB64}`;
      a.download = `gemini-${safeModel}-${index + 1}-${Date.now()}.png`;
      a.click();
    },
    [model]
  );

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
        기준으로 호환 목록을 유지합니다. 참조 이미지는 넣지 않으면 텍스트만으로 생성하고, 넣으면 여러 장을 함께 넣을 수 있으며 프롬프트와 함께 사용됩니다.{" "}
        <span className="tab-gemini-image-batch-hint">+ 프롬프트 추가</span>로 칸을 늘리면 여러 개를 한 번에(병렬) 생성할 수 있으며, 비어 있는 칸은 건너뜁니다.
      </p>

      <div className="tab-gemini-image-input-section">
        <span className="tab-gemini-image-input-label">참조 이미지 (선택, 여러 장)</span>
        <div
          className={`tab-gemini-image-drop ${inputDragging ? "dragging" : ""}`}
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
            const fl = e.dataTransfer.files;
            if (fl?.length) addReferenceImageFiles(fl);
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
          <span className="tab-gemini-image-drop-text">
            클릭 또는 드래그하여 이미지 추가 (여러 파일 선택 가능) · 비워 두면 텍스트만 사용
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="tab-gemini-image-file-input"
            multiple
            onChange={(e) => {
              const fl = e.target.files;
              if (fl?.length) addReferenceImageFiles(fl);
              e.target.value = "";
            }}
          />
        </div>
        {referenceImages.length > 0 && (
          <ul className="tab-gemini-image-thumb-grid" aria-label="참조 이미지 목록">
            {referenceImages.map((item, idx) => (
              <li key={item.id} className="tab-gemini-image-thumb-item">
                <img
                  className="tab-gemini-image-thumb-img"
                  src={item.dataUrl}
                  alt={`참조 이미지 ${idx + 1}`}
                />
                <button
                  type="button"
                  className="tab-gemini-image-thumb-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeReferenceImage(item.id);
                  }}
                  aria-label={`참조 이미지 ${idx + 1} 제거`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {referenceImages.length > 0 && (
          <button type="button" className="tab-gemini-image-remove-input btn-secondary" onClick={clearReferenceImages}>
            참조 이미지 모두 제거
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

      <div className="prompt-row tab-gemini-image-prompt-block">
        <div className="tab-gemini-image-prompt-list" role="list">
          {promptRows.map((row, idx) => (
            <div key={row.id} className="tab-gemini-image-prompt-row" role="listitem">
              <label className="tab-gemini-image-prompt-label" htmlFor={`gemini-prompt-${row.id}`}>
                프롬프트 {idx + 1}
              </label>
              <div className="tab-gemini-image-prompt-row-inner">
                <textarea
                  id={`gemini-prompt-${row.id}`}
                  className="prompt-input tab-gemini-image-prompt-textarea"
                  placeholder="생성할 이미지를 설명해 주세요. 예: 달 위를 걷는 고양이, 수채화 스타일"
                  value={row.text}
                  onChange={(e) => updatePromptText(row.id, e.target.value)}
                  rows={3}
                />
                <div className="tab-gemini-image-prompt-side">
                  <button
                    type="button"
                    className="tab-gemini-image-prompt-btn tab-gemini-image-prompt-minus"
                    onClick={() => removePromptRow(row.id)}
                    disabled={promptRows.length <= 1}
                    aria-label={`프롬프트 ${idx + 1} 칸 제거`}
                    title="이 칸 제거"
                  >
                    −
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="tab-gemini-image-prompt-actions">
          <button
            type="button"
            className="btn-secondary tab-gemini-image-prompt-btn tab-gemini-image-prompt-plus"
            onClick={addPromptRow}
            aria-label="프롬프트 칸 추가"
          >
            + 프롬프트 추가
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={generate}
            disabled={loading || !modelsLoaded || !models.length}
          >
            {loading ? "생성 중…" : "이미지 생성 (전체)"}
          </button>
        </div>
      </div>

      {error && <div className="message error">{error}</div>}

      {batchResults && batchResults.length > 0 && (
        <div className="tab-gemini-image-results">
          <h3 className="tab-gemini-image-results-title">생성 결과</h3>
          <ul className="tab-gemini-image-results-grid">
            {batchResults.map((item, index) => (
              <li key={item.id} className="tab-gemini-image-result-card">
                <p className="tab-gemini-image-result-prompt" title={item.prompt}>
                  {item.prompt}
                </p>
                {item.error ? (
                  <div className="tab-gemini-image-result-error message error">{item.error}</div>
                ) : (
                  <>
                    <img
                      src={`data:image/png;base64,${item.imageB64}`}
                      alt=""
                      className="generated-image tab-gemini-image-result-img"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => downloadOne(item.imageB64, index)}
                    >
                      PNG 다운로드
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
