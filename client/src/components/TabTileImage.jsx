import { useState, useRef } from "react";
import "./TabTileImage.css";

export default function TabTileImage() {
  const [file, setFile] = useState(null);
  const [rowRepeat, setRowRepeat] = useState("7");
  const [colRepeat, setColRepeat] = useState("7");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleSelect = (e) => {
    const chosen = e.target.files?.[0];
    if (!chosen?.type.startsWith("image/")) return;
    setFile(chosen);
    setResult(null);
    setError("");
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
    const f = e.dataTransfer.files?.[0];
    if (f?.type.startsWith("image/")) {
      setFile(f);
      setResult(null);
      setError("");
    }
  };

  const tileImage = (img, rows, cols) => {
    const w = img.width * rows;
    const h = img.height * cols;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    for (let y = 0; y < cols; y++) {
      for (let x = 0; x < rows; x++) {
        ctx.drawImage(img, x * img.width, y * img.height, img.width, img.height);
      }
    }
    return canvas.toDataURL("image/png", 0.95);
  };

  const process = () => {
    const rows = parseInt(rowRepeat, 10);
    const cols = parseInt(colRepeat, 10);
    if (!Number.isFinite(rows) || rows < 1 || !Number.isFinite(cols) || cols < 1) {
      setError("행·열에 1 이상의 숫자를 입력해 주세요.");
      return;
    }
    if (rows > 50 || cols > 50) {
      setError("행·열은 50 이하로 입력해 주세요.");
      return;
    }
    if (!file) {
      setError("이미지를 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const dataUrl = tileImage(img, rows, cols);
        const outW = img.width * rows;
        const outH = img.height * cols;
        setResult({ dataUrl, outW, outH, rows, cols });
      } catch (err) {
        setError(err.message || "이어붙이기 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("이미지를 불러올 수 없습니다.");
      setLoading(false);
    };
    img.src = url;
  };

  const download = () => {
    if (!result) return;
    const base = (file?.name || "image").replace(/\.[^.]+$/, "") || "image";
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = `${base}-tile-${result.rows}x${result.cols}.png`;
    a.click();
  };

  return (
    <div className="tab-tile-image">
      <p className="tab-desc">
        이미지 하나를 선택한 뒤, 행(가로 반복 횟수)·열(세로 반복 횟수)만큼 이어붙입니다. 예: 행 7, 열 4 → 가로로 7개 이어붙인 뒤, 그 스트립을 세로로 4번 반복합니다.
      </p>

      <div className="tile-options">
        <div className="option-row">
          <label>
            <span className="option-label">행 (가로 반복)</span>
            <input
              type="number"
              min={1}
              max={50}
              placeholder="예: 7"
              value={rowRepeat}
              onChange={(e) => setRowRepeat(e.target.value)}
              className="size-input"
            />
          </label>
          <label>
            <span className="option-label">열 (세로 반복)</span>
            <input
              type="number"
              min={1}
              max={50}
              placeholder="예: 4"
              value={colRepeat}
              onChange={(e) => setColRepeat(e.target.value)}
              className="size-input"
            />
          </label>
        </div>
      </div>

      <div
        className={`upload-zone ${isDragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleSelect}
          className="upload-input"
        />
        <span className="upload-text">
          {file ? file.name : "클릭하거나 이미지를 여기에 드래그 앤 드롭"}
        </span>
      </div>

      {file && (
        <div className="tile-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={process}
            disabled={loading}
          >
            {loading ? "처리 중…" : "이어붙이기 실행"}
          </button>
          <button type="button" className="btn-clear" onClick={() => { setFile(null); setResult(null); setError(""); }}>
            이미지 초기화
          </button>
        </div>
      )}

      {error && <div className="message error">{error}</div>}

      {result && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>결과 ({result.outW} × {result.outH})</h3>
            <button type="button" className="btn-download-all" onClick={download}>
              다운로드
            </button>
          </div>
          <div className="result-preview-wrap">
            <img
              src={result.dataUrl}
              alt="타일 결과"
              className="result-preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
