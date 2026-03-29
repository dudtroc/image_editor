import { useState, useRef } from "react";
import "./TabPasteImages.css";

const CELL = 512;
const OUT = 1024;

const SLOT_LABELS = ["왼쪽 위", "오른쪽 위", "왼쪽 아래", "오른쪽 아래"];

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`이미지를 불러올 수 없습니다: ${file.name}`));
    };
    img.src = url;
  });
}

export default function TabPasteImages() {
  const [files, setFiles] = useState([null, null, null, null]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragSlot, setDragSlot] = useState(null);
  const inputRef0 = useRef(null);
  const inputRef1 = useRef(null);
  const inputRef2 = useRef(null);
  const inputRef3 = useRef(null);
  const inputRefs = [inputRef0, inputRef1, inputRef2, inputRef3];

  const setFileAt = (index, file) => {
    if (!file?.type.startsWith("image/")) return;
    setFiles((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
    setResult(null);
    setError("");
  };

  const clearFileAt = (index) => {
    setFiles((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setResult(null);
    if (inputRefs[index].current) inputRefs[index].current.value = "";
  };

  const clearAll = () => {
    setFiles([null, null, null, null]);
    setResult(null);
    setError("");
    inputRefs.forEach((r) => {
      if (r.current) r.current.value = "";
    });
  };

  const handleSlotSelect = (index) => (e) => {
    const f = e.target.files?.[0];
    if (f) setFileAt(index, f);
    if (e.target) e.target.value = "";
  };

  const handleDragOver = (index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragSlot(index);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragSlot(null);
  };

  const handleDrop = (index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragSlot(null);
    const f = e.dataTransfer.files?.[0];
    if (f?.type.startsWith("image/")) setFileAt(index, f);
  };

  const process = async () => {
    if (files.some((f) => !f)) {
      setError("네 칸 모두에 이미지를 넣어 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const images = await Promise.all(files.map((f) => loadImageFromFile(f)));
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      const slots = [
        [0, 0],
        [CELL, 0],
        [0, CELL],
        [CELL, CELL],
      ];
      for (let i = 0; i < 4; i++) {
        const img = images[i];
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        ctx.drawImage(img, 0, 0, w, h, slots[i][0], slots[i][1], CELL, CELL);
      }
      const dataUrl = canvas.toDataURL("image/png", 0.95);
      setResult({ dataUrl });
    } catch (err) {
      setError(err.message || "붙이기 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = "pasted-1024x1024.png";
    a.click();
  };

  const allFilled = files.every(Boolean);

  return (
    <div className="tab-paste-images">
      <p className="tab-desc">
        512×512 크기 이미지 네 장을 각 칸에 넣으면, 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래 순으로
        1024×1024 한 장으로 붙입니다. 다른 크기도 각 칸(512×512)에 맞춰 스케일됩니다.
      </p>

      <div className="paste-grid" aria-label="512×512 이미지 네 칸">
        {SLOT_LABELS.map((label, index) => (
          <div key={index} className="paste-slot-wrap">
            <span className="paste-slot-label">{label}</span>
            <div
              role="button"
              tabIndex={0}
              className={`paste-slot ${dragSlot === index ? "dragging" : ""} ${files[index] ? "has-file" : ""}`}
              onClick={() => inputRefs[index].current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRefs[index].current?.click();
                }
              }}
              onDragOver={handleDragOver(index)}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop(index)}
            >
              <input
                ref={inputRefs[index]}
                type="file"
                accept="image/*"
                onChange={handleSlotSelect(index)}
                className="upload-input"
                aria-label={`${label} 이미지 선택`}
              />
              {files[index] ? (
                <>
                  <span className="paste-slot-name">{files[index].name}</span>
                  <button
                    type="button"
                    className="paste-slot-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFileAt(index);
                    }}
                  >
                    제거
                  </button>
                </>
              ) : (
                <span className="paste-slot-placeholder">클릭 또는 드롭</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="paste-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={process}
          disabled={loading || !allFilled}
        >
          {loading ? "처리 중…" : "1024×1024로 붙이기"}
        </button>
        <button type="button" className="btn-clear" onClick={clearAll}>
          전체 초기화
        </button>
      </div>

      {error && <div className="message error">{error}</div>}

      {result && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>결과 (1024 × 1024)</h3>
            <button type="button" className="btn-download-all" onClick={download}>
              다운로드
            </button>
          </div>
          <div className="result-preview-wrap">
            <img src={result.dataUrl} alt="붙인 결과" className="result-preview" />
          </div>
        </div>
      )}
    </div>
  );
}
