import { useState, useRef } from "react";
import "./TabRemoveBg.css";

const API_BASE = "/api";

export default function TabRemoveBg({ provider }) {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (fileList) => {
    const chosen = Array.from(fileList || []);
    if (!chosen.length) return;
    const valid = chosen.filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...valid].slice(0, 16));
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
      const form = new FormData();
      form.append("provider", provider);
      files.forEach((f) => form.append("images", f));
      const res = await fetch(`${API_BASE}/remove-bg`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "요청 실패");
      setResults(data.results || []);
    } catch (err) {
      setError(err.message || "배경 제거 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = (b64, filename) => {
    const base = filename.replace(/\.[^.]+$/, "") || "image";
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${b64}`;
    a.download = `${base}-transparent.png`;
    a.click();
  };

  const downloadAll = () => {
    const successResults = results.filter((r) => r.success);
    successResults.forEach((r, i) => {
      setTimeout(() => download(r.data, r.filename), i * 300);
    });
  };

  return (
    <div className="tab-remove-bg">
      <p className="tab-desc">
        RGB 이미지를 업로드하면 RGBA(투명 배경) PNG로 변환합니다. 여러 장 동시 업로드 가능 (최대 16장).
      </p>

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
          accept="image/jpeg,image/png,image/webp"
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
            {loading ? "처리 중…" : "배경 제거 실행"}
          </button>
        </div>
      )}

      {error && <div className="message error">{error}</div>}

      {results.length > 0 && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>결과 (RGBA PNG)</h3>
            {results.some((r) => r.success) && (
              <button type="button" className="btn-download-all" onClick={downloadAll}>
                전체 다운로드
              </button>
            )}
          </div>
          <div className="results-grid">
            {results.map((r, i) => (
              <div key={i} className="result-card">
                <span className="result-filename">{r.filename}</span>
                {r.success ? (
                  <>
                    <img
                      src={`data:image/png;base64,${r.data}`}
                      alt={r.filename}
                      className="result-preview"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => download(r.data, r.filename)}
                    >
                      다운로드
                    </button>
                  </>
                ) : (
                  <div className="result-error">{r.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
