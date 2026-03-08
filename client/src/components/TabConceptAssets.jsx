import { useState, useRef, useCallback } from "react";
import "./TabConceptAssets.css";

const API_BASE = "/api";

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

function b64ToBlob(b64, mime = "image/png") {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** base64 이미지를 지정 크기로 리사이즈 (리사이즈 탭과 동일한 방식). keepAspect면 비율 유지. */
function resizeImageFromBase64(b64, targetW, targetH, keepAspect) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const dataUrl = `data:image/png;base64,${b64}`;
    img.onload = () => {
      let w = targetW;
      let h = targetH;
      if (keepAspect && img.width && img.height) {
        const r = Math.min(targetW / img.width, targetH / img.height);
        w = Math.round(img.width * r);
        h = Math.round(img.height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({ dataUrl: reader.result, w, h });
          reader.readAsDataURL(blob);
        },
        "image/png",
        0.95
      );
    };
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = dataUrl;
  });
}

const PRESET_SIZES = [
  { label: "2016 × 1512", w: 2016, h: 1512 },
  { label: "1024 × 1024", w: 1024, h: 1024 },
  { label: "512 × 512", w: 512, h: 512 },
  { label: "288 × 216", w: 288, h: 216 },
];

export default function TabConceptAssets({ provider }) {
  const [conceptFile, setConceptFile] = useState(null);
  const [conceptPreviewUrl, setConceptPreviewUrl] = useState("");
  const [objects, setObjects] = useState([]);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectError, setDetectError] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [results, setResults] = useState([]); // { objectName, data?, error?, rgba?: base64 }
  const [rgbaAllLoading, setRgbaAllLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadWidth, setDownloadWidth] = useState("");
  const [downloadHeight, setDownloadHeight] = useState("");
  const [downloadKeepRatio, setDownloadKeepRatio] = useState(false);
  const [targetFiles, setTargetFiles] = useState([]); // 배치할 대상 이미지들 (실제 생성될 이미지)
  const [targetPreviewUrls, setTargetPreviewUrls] = useState([]);
  const inputRef = useRef(null);
  const targetInputRef = useRef(null);

  const applyDownloadPreset = (w, h) => {
    setDownloadWidth(String(w));
    setDownloadHeight(String(h));
  };

  const onSelectFile = useCallback((fileList) => {
    const file = Array.from(fileList || []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setConceptFile(file);
    setConceptPreviewUrl(URL.createObjectURL(file));
    setObjects([]);
    setDetectError("");
    setResults([]);
  }, []);

  const onDetect = async () => {
    if (!conceptFile) {
      setDetectError("컨셉 아트 이미지를 먼저 올려 주세요.");
      return;
    }
    setDetectLoading(true);
    setDetectError("");
    setObjects([]);
    try {
      const imageB64 = await fileToB64(conceptFile);
      const res = await fetch(`${API_BASE}/concept-assets/detect-objects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, image: imageB64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "객체 추출 실패");
      const raw = data.objects || [];
      const list = raw.map((o) =>
        typeof o === "string" ? { en: o, ko: o } : { en: o.en || "", ko: o.ko || o.en || "" }
      );
      setObjects(list);
      if (list.length === 0) setDetectError("추출된 객체가 없습니다.");
    } catch (err) {
      setDetectError(err.message || "객체 목록 추출 중 오류가 발생했습니다.");
    } finally {
      setDetectLoading(false);
    }
  };

  const [customObjectInput, setCustomObjectInput] = useState("");

  const addCustomObject = useCallback(() => {
    const name = customObjectInput.trim();
    if (!name) return;
    setObjects((prev) => [...prev, { en: name, ko: name }]);
    setCustomObjectInput("");
  }, [customObjectInput]);

  const removeObject = useCallback((index) => {
    setObjects((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onSelectTargetFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const newUrls = files.map((f) => URL.createObjectURL(f));
    setTargetFiles((prev) => [...prev, ...files]);
    setTargetPreviewUrls((prev) => [...prev, ...newUrls]);
  }, []);

  const removeTargetImage = useCallback((index) => {
    setTargetFiles((prev) => prev.filter((_, i) => i !== index));
    setTargetPreviewUrls((prev) => {
      const next = [...prev];
      if (next[index]) URL.revokeObjectURL(next[index]);
      return next.filter((_, i) => i !== index);
    });
  }, []);

  const generateAssets = async () => {
    if (objects.length === 0) {
      setGenerateError("생성할 객체를 최소 1개 이상 남겨 주세요.");
      return;
    }
    setGenerateLoading(true);
    setGenerateError("");
    setResults([]);
    try {
      const targetImagesB64 = targetFiles.length
        ? await Promise.all(targetFiles.map((f) => fileToB64(f)))
        : undefined;
      const res = await fetch(`${API_BASE}/concept-assets/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: provider === "gemini" ? "gemini-2.0-flash-exp-image-generation" : "gpt-image-1.5",
          objects: objects.map((o) => (typeof o === "string" ? o : o.en)),
          aspectRatio: "1:1",
          imageSize: "1K",
          size: "1024x1024",
          quality: "medium",
          targetImages: targetImagesB64,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "에셋 생성 실패");
      setResults((data.results || []).map((r) => ({ ...r, rgba: null })));
    } catch (err) {
      setGenerateError(err.message || "에셋 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerateLoading(false);
    }
  };

  const removeResult = useCallback((index) => {
    setResults((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toRgba = useCallback(async (index) => {
    const item = results[index];
    if (!item?.data) return;
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, rgbaLoading: true } : r))
    );
    try {
      const form = new FormData();
      form.append("provider", provider);
      form.append("images", b64ToBlob(item.data), "asset.png");
      const res = await fetch(`${API_BASE}/remove-bg`, { method: "POST", body: form });
      const data = await res.json();
      const first = data.results?.[0];
      if (!res.ok || !first?.success) throw new Error(first?.error || "RGBA 변환 실패");
      setResults((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, rgba: first.data, rgbaLoading: false } : r
        )
      );
    } catch (err) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, rgbaError: err.message, rgbaLoading: false } : r
        )
      );
    }
  }, [provider, results]);

  const downloadAsset = useCallback(
    async (item, suffix = "") => {
      const b64 = item.rgba ?? item.data;
      if (!b64) return;
      const name = (item.objectName || "asset").replace(/[^\w가-힣-]/g, "_");
      const w = parseInt(downloadWidth, 10);
      const h = parseInt(downloadHeight, 10);
      const useResize =
        Number.isFinite(w) &&
        w >= 1 &&
        w <= 8000 &&
        Number.isFinite(h) &&
        h >= 1 &&
        h <= 8000;
      if (useResize) {
        try {
          const { dataUrl, w: outW, h: outH } = await resizeImageFromBase64(
            b64,
            w,
            h,
            downloadKeepRatio
          );
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `${name}${suffix}-${outW}x${outH}.png`;
          a.click();
        } catch (err) {
          console.error(err);
          const a = document.createElement("a");
          a.href = `data:image/png;base64,${b64}`;
          a.download = `${name}${suffix}.png`;
          a.click();
        }
      } else {
        const a = document.createElement("a");
        a.href = `data:image/png;base64,${b64}`;
        a.download = `${name}${suffix}.png`;
        a.click();
      }
    },
    [downloadWidth, downloadHeight, downloadKeepRatio]
  );

  const downloadAll = useCallback(async () => {
    const withData = results.filter((r) => r.data && !r.error);
    for (let i = 0; i < withData.length; i++) {
      await downloadAsset(withData[i], withData[i].rgba ? "-rgba" : "");
      if (i < withData.length - 1) await new Promise((r) => setTimeout(r, 300));
    }
  }, [results, downloadAsset]);

  const toRgbaAll = useCallback(async () => {
    const indices = results
      .map((r, i) => (r.data && !r.error && !r.rgba ? i : -1))
      .filter((i) => i >= 0);
    if (indices.length === 0) return;
    setRgbaAllLoading(true);
    for (const index of indices) {
      const item = results[index];
      if (!item?.data || item.rgba) continue;
      setResults((prev) =>
        prev.map((r, i) => (i === index ? { ...r, rgbaLoading: true } : r))
      );
      try {
        const form = new FormData();
        form.append("provider", provider);
        form.append("images", b64ToBlob(item.data), "asset.png");
        const res = await fetch(`${API_BASE}/remove-bg`, { method: "POST", body: form });
        const data = await res.json();
        const first = data.results?.[0];
        if (!res.ok || !first?.success) throw new Error(first?.error || "RGBA 변환 실패");
        setResults((prev) =>
          prev.map((r, i) =>
            i === index ? { ...r, rgba: first.data, rgbaLoading: false } : r
          )
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r, i) =>
            i === index ? { ...r, rgbaError: err.message, rgbaLoading: false } : r
          )
        );
      }
    }
    setRgbaAllLoading(false);
  }, [provider, results]);

  return (
    <div className="tab-concept-assets">
      <p className="tab-desc">
        Unity 인게임 컨셉 아트 사진을 넣으면 등장 객체 목록을 추출하고, client/data 스타일의
        에셋 이미지를 생성할 수 있습니다. (객체 중앙 배치, 얕은 그림자 포함)
      </p>

      <section className="concept-section">
        <label className="section-label">1. 인게임 컨셉 아트 이미지</label>
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
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
          {conceptPreviewUrl ? (
            <img src={conceptPreviewUrl} alt="컨셉 아트" className="concept-preview" />
          ) : (
            <span className="upload-text">클릭하거나 이미지를 여기에 드래그</span>
          )}
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={onDetect}
          disabled={detectLoading || !conceptFile}
        >
          {detectLoading ? "객체 추출 중…" : "객체 목록 추출 (최대 20개)"}
        </button>
        {detectError && <div className="message error">{detectError}</div>}
      </section>

      {conceptFile && (
        <section className="objects-section">
          <label className="section-label">2. 생성할 객체 (직접 입력 추가 가능, 삭제는 × 클릭)</label>
          <div className="object-add-row">
            <input
              type="text"
              className="object-add-input"
              placeholder="원하는 객체 이름 입력 후 추가"
              value={customObjectInput}
              onChange={(e) => setCustomObjectInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomObject()}
            />
            <button
              type="button"
              className="btn-add-object"
              onClick={addCustomObject}
              disabled={!customObjectInput.trim()}
            >
              추가
            </button>
          </div>
          {objects.length > 0 && (
            <div className="object-chips">
              {objects.map((obj, i) => {
                const en = typeof obj === "string" ? obj : obj.en;
                const ko = typeof obj === "string" ? obj : obj.ko;
                const hasKo = ko && ko !== en && /[\uac00-\ud7a3]/.test(ko);
                return (
                  <div key={`${i}-${en}`} className="object-chip">
                    <span className="object-chip-name">
                      {hasKo ? (
                        <>
                          <span className="object-chip-ko">{ko}</span>
                          <span className="object-chip-en">{en}</span>
                        </>
                      ) : (
                        en
                      )}
                    </span>
                    <button
                      type="button"
                      className="object-chip-remove"
                      onClick={() => removeObject(i)}
                      aria-label="제거"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <section className="target-images-section">
            <label className="section-label">3. 배치할 대상 이미지 (선택)</label>
            <p className="target-images-desc">
              생성된 에셋을 올려둘 실제 장면/배경 이미지를 넣으면, 해당 이미지 위에 자연스럽게 올라가도록 에셋이 생성됩니다.
            </p>
            <div
              className="upload-zone upload-zone-target"
              onClick={() => targetInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                onSelectTargetFiles(e.dataTransfer?.files);
              }}
            >
              <input
                ref={targetInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onSelectTargetFiles(e.target.files)}
                className="upload-input"
              />
              <span className="upload-text">클릭하거나 이미지를 드래그 (여러 장 가능)</span>
            </div>
            {targetPreviewUrls.length > 0 && (
              <div className="target-thumbnails">
                {targetPreviewUrls.map((url, i) => (
                  <div key={i} className="target-thumb-wrap">
                    <img src={url} alt={`대상 ${i + 1}`} className="target-thumb" />
                    <button
                      type="button"
                      className="target-thumb-remove"
                      onClick={() => removeTargetImage(i)}
                      aria-label="제거"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <button
            type="button"
            className="btn-primary btn-generate"
            onClick={generateAssets}
            disabled={generateLoading || objects.length === 0}
          >
            {generateLoading ? "에셋 생성 중…" : "client/data 스타일로 에셋 생성"}
          </button>
          {generateError && <div className="message error">{generateError}</div>}
        </section>
      )}

      {results.length > 0 && (
        <section className="results-section">
          <div className="results-section-header">
            <h3 className="results-title">생성된 에셋</h3>
            {results.some((r) => r.data && !r.error) && (
              <div className="results-header-actions">
                <button
                  type="button"
                  className="btn-rgba-all"
                  onClick={toRgbaAll}
                  disabled={rgbaAllLoading || !results.some((r) => r.data && !r.error && !r.rgba)}
                >
                  {rgbaAllLoading ? "전체 RGBA 변환 중…" : "전체 RGBA 변환"}
                </button>
                <button type="button" className="btn-download-all" onClick={downloadAll}>
                  전체 다운로드
                </button>
              </div>
            )}
          </div>
          {results.some((r) => r.data && !r.error) && (
            <div className="download-resize-options">
              <span className="download-resize-label">다운로드 크기 (리사이즈 탭과 동일)</span>
              <div className="download-resize-row">
                <label>
                  <span className="option-label">가로 (px)</span>
                  <input
                    type="number"
                    min={1}
                    max={8000}
                    placeholder="원본"
                    value={downloadWidth}
                    onChange={(e) => setDownloadWidth(e.target.value)}
                    className="size-input"
                  />
                </label>
                <label>
                  <span className="option-label">세로 (px)</span>
                  <input
                    type="number"
                    min={1}
                    max={8000}
                    placeholder="원본"
                    value={downloadHeight}
                    onChange={(e) => setDownloadHeight(e.target.value)}
                    className="size-input"
                  />
                </label>
              </div>
              <div className="preset-sizes">
                <span className="preset-label">자주 쓰는 사이즈</span>
                <div className="preset-buttons">
                  {PRESET_SIZES.map(({ label, w, h }) => (
                    <button
                      key={label}
                      type="button"
                      className="preset-btn"
                      onClick={() => applyDownloadPreset(w, h)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={downloadKeepRatio}
                  onChange={(e) => setDownloadKeepRatio(e.target.checked)}
                />
                <span>비율 유지 (지정 크기 안에 맞춤)</span>
              </label>
              <p className="download-resize-hint">가로·세로를 모두 입력하면 다운로드 시 해당 크기로 리사이즈됩니다. 비워두면 원본 크기로 다운로드됩니다.</p>
            </div>
          )}
          <div className="results-grid">
            {results.map((r, i) => {
              const obj = objects.find(
                (o) => (typeof o === "string" ? o : o.en) === r.objectName
              );
              const ko = obj && typeof obj === "object" ? obj.ko : null;
              const hasKo = ko && ko !== r.objectName && /[\uac00-\ud7a3]/.test(ko);
              const displayName = hasKo ? (
                <>
                  <span className="result-name-ko">{ko}</span>
                  <span className="result-name-en">{r.objectName}</span>
                </>
              ) : (
                r.objectName
              );
              return (
              <div key={i} className="result-card">
                <span className="result-name">{displayName}</span>
                {r.error ? (
                  <div className="result-error">{r.error}</div>
                ) : (
                  <>
                    <img
                      src={`data:image/png;base64,${r.rgba ?? r.data}`}
                      alt={r.objectName}
                      className="result-preview"
                    />
                    <div className="result-actions">
                      <button
                        type="button"
                        className="btn-small"
                        onClick={() => removeResult(i)}
                      >
                        삭제
                      </button>
                      {r.data && (
                        <button
                          type="button"
                          className="btn-small btn-rgba"
                          onClick={() => toRgba(i)}
                          disabled={r.rgbaLoading}
                        >
                          {r.rgbaLoading ? "변환 중…" : r.rgba ? "RGBA 적용됨" : "RGBA로 변환"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-small btn-download"
                        onClick={() => downloadAsset(r, r.rgba ? "-rgba" : "")}
                      >
                        다운로드
                      </button>
                    </div>
                    {r.rgbaError && <div className="result-rgba-error">{r.rgbaError}</div>}
                  </>
                )}
              </div>
            );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
