import { useState, useRef } from "react";
import "./TabResize.css";
import "./TabMaskRemoveBg.css";

/**
 * 마스크 이미지의 흰색 영역에 해당하는 입력 이미지 픽셀을 투명하게 만듭니다.
 */
function applyMaskRemoveBg(file, maskImageData, maskW, maskH, whiteThreshold) {
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

      // 마스크를 입력 이미지 크기로 스케일링하여 적용
      const md = maskImageData.data;
      const t = Math.min(255, Math.max(0, Number.isFinite(whiteThreshold) ? whiteThreshold : 250));

      for (let y = 0; y < h; y++) {
        // 마스크 좌표 매핑 (크기가 다를 수 있으므로 비율 계산)
        const my = Math.min(Math.floor((y / h) * maskH), maskH - 1);
        for (let x = 0; x < w; x++) {
          const mx = Math.min(Math.floor((x / w) * maskW), maskW - 1);
          const mi = (my * maskW + mx) * 4;
          const mr = md[mi];
          const mg = md[mi + 1];
          const mb = md[mi + 2];
          // 마스크의 흰색 영역 → 투명 처리
          const isWhite = mr >= t && mg >= t && mb >= t;
          if (isWhite) {
            const pi = (y * w + x) * 4;
            d[pi + 3] = 0; // 알파를 0으로
          }
        }
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

function loadImageData(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        reject(new Error("마스크 이미지 크기를 알 수 없습니다."));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve({ data: ctx.getImageData(0, 0, w, h), w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("마스크 이미지를 불러올 수 없습니다."));
    };
    img.src = url;
  });
}

export default function TabMaskRemoveBg() {
  const [files, setFiles] = useState([]);
  const [maskFile, setMaskFile] = useState(null);
  const [maskPreview, setMaskPreview] = useState("");
  const [whiteThreshold, setWhiteThreshold] = useState(250);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isMaskDragging, setIsMaskDragging] = useState(false);
  const inputRef = useRef(null);
  const maskInputRef = useRef(null);

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

  const handleMaskSelect = (e) => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith("image/")) {
      setMaskFile(f);
      setMaskPreview(URL.createObjectURL(f));
      setError("");
    }
    if (maskInputRef.current) maskInputRef.current.value = "";
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

  const handleMaskDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMaskDragging(true);
  };

  const handleMaskDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMaskDragging(false);
  };

  const handleMaskDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMaskDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) {
      setMaskFile(f);
      setMaskPreview(URL.createObjectURL(f));
      setError("");
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeMask = () => {
    if (maskPreview) URL.revokeObjectURL(maskPreview);
    setMaskFile(null);
    setMaskPreview("");
  };

  const process = async () => {
    if (!files.length) {
      setError("처리할 이미지를 한 개 이상 선택해 주세요.");
      return;
    }
    if (!maskFile) {
      setError("마스크 이미지를 선택해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const { data: maskImgData, w: maskW, h: maskH } = await loadImageData(maskFile);
      const list = await Promise.all(
        files.map((file) => applyMaskRemoveBg(file, maskImgData, maskW, maskH, whiteThreshold))
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
    a.download = `${base}-nobg.png`;
    a.click();
  };

  const downloadAll = () => {
    results.forEach((r, i) => {
      setTimeout(() => download(r.dataUrl, r.filename), i * 300);
    });
  };

  return (
    <div className="tab-resize tab-mask-remove-bg">
      <p className="tab-desc">
        마스크 이미지의 흰색 영역에 해당하는 부분을 투명하게 만들어 배경을 제거합니다.
        AI 모델 없이 마스크 기반으로 즉시 처리되므로 빠릅니다.
      </p>

      <div className="resize-options mask-remove-bg-options">
        <div className="option-row">
          <label>
            <span className="option-label">흰색 임계값 (0–255)</span>
            <div className="mask-remove-bg-threshold-row">
              <input
                type="range"
                min={0}
                max={255}
                value={whiteThreshold}
                onChange={(e) => setWhiteThreshold(Number(e.target.value))}
                className="mask-remove-bg-slider"
              />
              <input
                type="number"
                min={0}
                max={255}
                value={whiteThreshold}
                onChange={(e) => setWhiteThreshold(Number(e.target.value))}
                className="size-input mask-remove-bg-number"
              />
            </div>
          </label>
          <p className="mask-remove-bg-hint">
            마스크 이미지에서 R·G·B가 모두 이 값 이상인 픽셀을 &quot;흰색(제거 대상)&quot;으로 판단합니다.
          </p>
        </div>
      </div>

      <div className="mask-remove-bg-inputs">
        <div className="mask-remove-bg-input-group">
          <span className="mask-remove-bg-input-label">마스크 이미지 (흰색 = 제거할 영역)</span>
          <div
            className={`upload-zone mask-remove-bg-mask-zone ${isMaskDragging ? "dragging" : ""}`}
            onClick={() => maskInputRef.current?.click()}
            onDragOver={handleMaskDragOver}
            onDragLeave={handleMaskDragLeave}
            onDrop={handleMaskDrop}
          >
            <input
              ref={maskInputRef}
              type="file"
              accept="image/*"
              onChange={handleMaskSelect}
              className="upload-input"
            />
            {maskPreview ? (
              <img src={maskPreview} alt="마스크 미리보기" className="mask-remove-bg-mask-preview" />
            ) : (
              <span className="upload-text">클릭하거나 마스크 이미지를 드래그</span>
            )}
          </div>
          {maskFile && (
            <div className="mask-remove-bg-mask-info">
              <span className="mask-remove-bg-mask-name">{maskFile.name}</span>
              <button type="button" className="btn-clear" onClick={removeMask}>
                제거
              </button>
            </div>
          )}
        </div>

        <div className="mask-remove-bg-input-group">
          <span className="mask-remove-bg-input-label">처리할 이미지 (여러 장 가능)</span>
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
        </div>
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
            {loading ? "처리 중…" : "배경 제거"}
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
                  {r.filename} → {r.w}×{r.h} (RGBA)
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
