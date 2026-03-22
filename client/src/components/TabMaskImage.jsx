import { useState, useRef } from "react";
import "./TabResize.css";
import "./TabMaskImage.css";

/**
 * 흰색(및 임계값 이상의 밝은 픽셀)은 유지하고, 나머지는 검정으로 만든 마스크 이미지를 생성합니다.
 */
function buildMaskFromFile(file, whiteThreshold) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        reject(new Error(`크기를 알 수 없음: ${file.name}`));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;
      const t = Math.min(
        255,
        Math.max(0, Number.isFinite(whiteThreshold) ? whiteThreshold : 250)
      );
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const isWhite = r >= t && g >= t && b >= t;
        if (isWhite) {
          d[i] = 255;
          d[i + 1] = 255;
          d[i + 2] = 255;
        } else {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
        }
        d[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(`인코딩 실패: ${file.name}`));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve({
              blob,
              dataUrl: reader.result,
              filename: file.name,
              w,
              h,
            });
          reader.readAsDataURL(blob);
        },
        "image/png",
        1
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`불러오기 실패: ${file.name}`));
    };
    img.src = url;
  });
}

export default function TabMaskImage() {
  const [files, setFiles] = useState([]);
  const [whiteThreshold, setWhiteThreshold] = useState(250);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (fileList) => {
    const chosen = Array.from(fileList || []);
    if (!chosen.length) return;
    const valid = chosen.filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...valid]);
    setError("");
  };

  const handleSelect = (e) => {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const process = async () => {
    if (!files.length) {
      setError("이미지를 한 개 이상 선택해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const list = await Promise.all(
        files.map((file) => buildMaskFromFile(file, whiteThreshold))
      );
      setResults(list);
    } catch (err) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = (dataUrl, filename) => {
    const base = filename.replace(/\.[^.]+$/, "") || "image";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${base}-mask.png`;
    a.click();
  };

  const downloadAll = () => {
    results.forEach((r, i) => {
      setTimeout(() => download(r.dataUrl, r.filename), i * 300);
    });
  };

  return (
    <div className="tab-resize tab-mask-image">
      <p className="tab-desc">
        입력 이미지에서 흰색에 가까운 영역은 그대로 두고, 나머지 픽셀은 검정으로 만든 마스크 PNG를
        만듭니다. 여러 장을 한 번에 처리할 수 있습니다.
      </p>

      <div className="resize-options mask-options">
        <div className="option-row">
          <label>
            <span className="option-label">흰색 임계값 (0–255)</span>
            <input
              type="number"
              min={0}
              max={255}
              value={whiteThreshold}
              onChange={(e) => setWhiteThreshold(Number(e.target.value))}
              className="size-input"
            />
          </label>
          <p className="mask-hint">
            R·G·B가 모두 이 값 이상이면 흰색으로 유지합니다. (기본 250 — 살짝 회색 가장자리도
            흰색으로 묶고 싶으면 낮추세요.)
          </p>
        </div>
      </div>

      <div
        className={`upload-zone ${isDragging ? "dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleSelect}
          className="upload-input"
        />
        <span className="upload-text">클릭하거나 이미지를 여기에 드래그 앤 드롭</span>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <span>선택된 이미지 ({files.length}장)</span>
            <button type="button" className="btn-clear" onClick={() => setFiles([])}>
              전체 삭제
            </button>
          </div>
          <div className="file-chips">
            {files.map((f, i) => (
              <div key={i} className="file-chip">
                <span className="file-chip-name">{f.name}</span>
                <button
                  type="button"
                  className="file-chip-remove"
                  onClick={() => removeFile(i)}
                  aria-label="제거"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-primary" onClick={process} disabled={loading}>
            {loading ? "처리 중…" : "마스크 생성"}
          </button>
        </div>
      )}

      {error && <div className="message error">{error}</div>}

      {results.length > 0 && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>결과</h3>
            <button type="button" className="btn-download-all" onClick={downloadAll}>
              전체 다운로드
            </button>
          </div>
          <div className="results-grid">
            {results.map((r, i) => (
              <div key={i} className="result-card">
                <span className="result-filename">
                  {r.filename} → {r.w}×{r.h}
                </span>
                <img src={r.dataUrl} alt={r.filename} className="result-preview" />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => download(r.dataUrl, r.filename)}
                >
                  다운로드
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
