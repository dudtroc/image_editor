import { useState, useRef } from "react";
import "./TabResize.css";

export default function TabResize() {
  const [files, setFiles] = useState([]);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepRatio, setKeepRatio] = useState(false);
  const [keepOriginalDownloadName, setKeepOriginalDownloadName] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const PRESET_SIZES = [
    { label: "2016 × 1512", w: 2016, h: 1512 },
    { label: "1024 × 1024", w: 1024, h: 1024 },
    { label: "512 × 512", w: 512, h: 512 },
    { label: "288 × 216", w: 288, h: 216 },
  ];

  const applyPreset = (w, h) => {
    setWidth(String(w));
    setHeight(String(h));
  };

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

  const resizeImage = (file, targetW, targetH, keepAspect) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
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
            reader.onloadend = () => resolve({ blob, dataUrl: reader.result, filename: file.name, w, h });
            reader.readAsDataURL(blob);
          },
          "image/png",
          0.95
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load: ${file.name}`));
      };
      img.src = url;
    });
  };

  const process = async () => {
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) {
      setError("가로·세로에 1 이상의 숫자를 입력해 주세요.");
      return;
    }
    if (w > 8000 || h > 8000) {
      setError("가로·세로는 8000 이하로 입력해 주세요.");
      return;
    }
    if (!files.length) {
      setError("이미지를 한 개 이상 선택해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const list = await Promise.all(
        files.map((file) => resizeImage(file, w, h, keepRatio))
      );
      setResults(list);
    } catch (err) {
      setError(err.message || "리사이즈 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = (dataUrl, filename, w, h) => {
    const base = filename.replace(/\.[^.]+$/, "") || "image";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = keepOriginalDownloadName ? `${base}.png` : `${base}-${w}x${h}.png`;
    a.click();
  };

  const downloadAll = () => {
    results.forEach((r, i) => {
      setTimeout(() => download(r.dataUrl, r.filename, r.w, r.h), i * 300);
    });
  };

  return (
    <div className="tab-resize">
      <p className="tab-desc">
        이미지를 선택한 뒤 원하는 가로·세로 크기(px)로 리사이즈합니다. 여러 장 동시 처리 가능합니다.
      </p>

      <div className="resize-options">
        <div className="option-row">
          <label>
            <span className="option-label">가로 (px)</span>
            <input
              type="number"
              min={1}
              max={8000}
              placeholder="예: 800"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="size-input"
            />
          </label>
          <label>
            <span className="option-label">세로 (px)</span>
            <input
              type="number"
              min={1}
              max={8000}
              placeholder="예: 600"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
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
                onClick={() => applyPreset(w, h)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={keepRatio}
            onChange={(e) => setKeepRatio(e.target.checked)}
          />
          <span>비율 유지 (지정 크기 안에 맞춤)</span>
        </label>
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
        <span className="upload-text">
          클릭하거나 이미지를 여기에 드래그 앤 드롭
        </span>
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
                <button type="button" className="file-chip-remove" onClick={() => removeFile(i)} aria-label="제거">
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={process}
            disabled={loading}
          >
            {loading ? "처리 중…" : "리사이즈 실행"}
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
                <span className="result-filename">{r.filename} → {r.w}×{r.h}</span>
                <img
                  src={r.dataUrl}
                  alt={r.filename}
                  className="result-preview"
                />
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
