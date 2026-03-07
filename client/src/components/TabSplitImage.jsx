import { useState, useRef } from "react";
import "./TabSplitImage.css";

export default function TabSplitImage() {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState("2");
  const [cols, setCols] = useState("2");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleSelect = (e) => {
    const chosen = e.target.files?.[0];
    if (!chosen?.type.startsWith("image/")) return;
    setFile(chosen);
    setResults([]);
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
      setResults([]);
      setError("");
    }
  };

  const splitImage = (img, numRows, numCols, baseName) => {
    const w = img.width;
    const h = img.height;
    const cellW = Math.floor(w / numCols);
    const cellH = Math.floor(h / numRows);
    const tiles = [];

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const sx = col * cellW;
        const sy = row * cellH;
        const tw = col === numCols - 1 ? w - sx : cellW;
        const th = row === numRows - 1 ? h - sy : cellH;

        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, tw, th, 0, 0, tw, th);

        const dataUrl = canvas.toDataURL("image/png", 0.95);
        const index = row * numCols + col;
        tiles.push({
          dataUrl,
          name: `${baseName}-r${row + 1}c${col + 1}.png`,
          row: row + 1,
          col: col + 1,
          index,
        });
      }
    }
    return tiles;
  };

  const process = () => {
    const r = parseInt(rows, 10);
    const c = parseInt(cols, 10);
    if (!Number.isFinite(r) || r < 1 || !Number.isFinite(c) || c < 1) {
      setError("행과 열에 1 이상의 숫자를 입력해 주세요.");
      return;
    }
    if (r > 50 || c > 50) {
      setError("행·열은 50 이하로 입력해 주세요.");
      return;
    }
    if (!file) {
      setError("이미지를 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);

    const img = new Image();
    const url = URL.createObjectURL(file);
    const baseName = (file.name || "image").replace(/\.[^.]+$/, "") || "image";

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const tiles = splitImage(img, r, c, baseName);
        setResults(tiles);
      } catch (err) {
        setError(err.message || "분할 중 오류가 발생했습니다.");
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

  const download = (dataUrl, filename) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const downloadAll = () => {
    results.forEach((tile, i) => {
      setTimeout(() => download(tile.dataUrl, tile.name), i * 200);
    });
  };

  return (
    <div className="tab-split-image">
      <p className="tab-desc">
        이미지 하나를 선택한 뒤 행·열 개수를 입력하면, 해당 개수만큼 균등하게 나누어 저장할 수 있습니다.
      </p>

      <div className="split-options">
        <div className="option-row">
          <label>
            <span className="option-label">행 (개수)</span>
            <input
              type="number"
              min={1}
              max={50}
              placeholder="예: 2"
              value={rows}
              onChange={(e) => setRows(e.target.value)}
              className="size-input"
            />
          </label>
          <label>
            <span className="option-label">열 (개수)</span>
            <input
              type="number"
              min={1}
              max={50}
              placeholder="예: 2"
              value={cols}
              onChange={(e) => setCols(e.target.value)}
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
        {file ? (
          <span className="upload-text upload-filename">{file.name}</span>
        ) : (
          <span className="upload-text">클릭하거나 이미지를 여기에 드래그 앤 드롭</span>
        )}
      </div>

      {file && (
        <div className="split-actions">
          <button
            type="button"
            className="btn-clear"
            onClick={() => {
              setFile(null);
              setResults([]);
              setError("");
            }}
          >
            이미지 지우기
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={process}
            disabled={loading}
          >
            {loading ? "분할 중…" : "이미지 분할"}
          </button>
        </div>
      )}

      {error && <div className="message error">{error}</div>}

      {results.length > 0 && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>분할 결과 ({results.length}개)</h3>
            <button type="button" className="btn-download-all" onClick={downloadAll}>
              전체 다운로드
            </button>
          </div>
          <div className="results-grid">
            {results.map((tile) => (
              <div key={tile.index} className="result-card">
                <span className="result-filename">{tile.name}</span>
                <img
                  src={tile.dataUrl}
                  alt={tile.name}
                  className="result-preview"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => download(tile.dataUrl, tile.name)}
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
