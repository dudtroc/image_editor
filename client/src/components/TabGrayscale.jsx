import { useState, useRef } from "react";
import "./TabResize.css";

/** ITU-R BT.601 luma. R=G=B=Y, 알파(data[i+3])는 항상 그대로. α=0 픽셀은 RGBA 전부 원본 유지 */
function applyGrayscaleToImageData(data) {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
  }
}

function grayscaleFromFile(file) {
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
      const ctx = canvas.getContext("2d", { alpha: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      applyGrayscaleToImageData(imageData.data);
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

export default function TabGrayscale() {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [keepOriginalDownloadName, setKeepOriginalDownloadName] = useState(false);
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
      const list = await Promise.all(files.map((file) => grayscaleFromFile(file)));
      setResults(list);
    } catch (err) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = (dataUrl, filename, w, h) => {
    const base = filename.replace(/\.[^.]+$/, "") || "image";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = keepOriginalDownloadName ? `${base}.png` : `${base}-grayscale-${w}x${h}.png`;
    a.click();
  };

  const downloadAll = () => {
    results.forEach((r, i) => {
      setTimeout(() => download(r.dataUrl, r.filename, r.w, r.h), i * 300);
    });
  };

  return (
    <div className="tab-resize tab-grayscale">
      <p className="tab-desc">
        컬러 이미지를 단순 흑백(그레이스케일)으로 바꿉니다. RGB는 동일한 명도값으로 맞추고, 알파
        채널은 건드리지 않습니다. 완전 투명(α=0) 픽셀은 RGBA를 원본 그대로 둡니다. 결과는 PNG(RGBA)로
        저장됩니다.
      </p>

      <div className="resize-options">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={keepOriginalDownloadName}
            onChange={(e) => setKeepOriginalDownloadName(e.target.checked)}
          />
          <span>다운로드 시 원본 파일명 유지 (접미사 없음, PNG)</span>
        </label>
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
            {loading ? "처리 중…" : "흑백 변환"}
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
                  {r.filename} → {r.w}×{r.h} 흑백
                </span>
                <img src={r.dataUrl} alt={r.filename} className="result-preview" />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => download(r.dataUrl, r.filename, r.w, r.h)}
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
