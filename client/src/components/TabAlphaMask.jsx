import { useState, useRef } from "react";
import "./TabResize.css";
import "./TabAlphaMask.css";

/**
 * 알파 채널 기준으로 투명 영역을 흰색 마스크로 변환합니다.
 * 알파 <= threshold → 흰색(마스크), 그 외 → 검정(배경)
 */
function buildAlphaMask(file, alphaThreshold) {
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

      // 원본 캔버스
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = w;
      srcCanvas.height = h;
      const srcCtx = srcCanvas.getContext("2d");
      srcCtx.drawImage(img, 0, 0);
      const srcData = srcCtx.getImageData(0, 0, w, h);
      const sd = srcData.data;

      const t = Math.min(255, Math.max(0, Number.isFinite(alphaThreshold) ? alphaThreshold : 128));

      // 마스크 캔버스: 알파 <= threshold → 흰색, 그 외 → 검정
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const maskCtx = maskCanvas.getContext("2d");
      const maskData = maskCtx.createImageData(w, h);
      const md = maskData.data;

      for (let i = 0; i < sd.length; i += 4) {
        const alpha = sd[i + 3];
        const isMask = alpha <= t;
        md[i] = isMask ? 255 : 0;
        md[i + 1] = isMask ? 255 : 0;
        md[i + 2] = isMask ? 255 : 0;
        md[i + 3] = 255;
      }
      maskCtx.putImageData(maskData, 0, 0);

      // 오버레이 캔버스: 원본 위에 마스크 흰색 영역을 반투명 빨간색으로 표시
      const overlayCanvas = document.createElement("canvas");
      overlayCanvas.width = w;
      overlayCanvas.height = h;
      const overlayCtx = overlayCanvas.getContext("2d");
      // 체커보드 배경 그리기 (투명 영역 시각화)
      const checkerSize = 8;
      for (let y = 0; y < h; y += checkerSize) {
        for (let x = 0; x < w; x += checkerSize) {
          const isEven = ((x / checkerSize) + (y / checkerSize)) % 2 === 0;
          overlayCtx.fillStyle = isEven ? "#ccc" : "#fff";
          overlayCtx.fillRect(x, y, checkerSize, checkerSize);
        }
      }
      overlayCtx.drawImage(srcCanvas, 0, 0);
      // 마스크 영역을 반투명 빨간색으로 오버레이
      overlayCtx.globalAlpha = 0.45;
      for (let y2 = 0; y2 < h; y2++) {
        for (let x2 = 0; x2 < w; x2++) {
          const i = (y2 * w + x2) * 4;
          if (md[i] === 255) {
            overlayCtx.fillStyle = "rgba(255, 60, 60, 1)";
            overlayCtx.fillRect(x2, y2, 1, 1);
          }
        }
      }
      overlayCtx.globalAlpha = 1.0;

      // 결과 blob 생성
      maskCanvas.toBlob(
        (maskBlob) => {
          if (!maskBlob) {
            reject(new Error(`마스크 인코딩 실패: ${file.name}`));
            return;
          }
          overlayCanvas.toBlob(
            (overlayBlob) => {
              if (!overlayBlob) {
                reject(new Error(`오버레이 인코딩 실패: ${file.name}`));
                return;
              }
              const maskUrl = URL.createObjectURL(maskBlob);
              const overlayUrl = URL.createObjectURL(overlayBlob);
              resolve({
                filename: file.name,
                w,
                h,
                maskUrl,
                maskBlob,
                overlayUrl,
                overlayBlob,
              });
            },
            "image/png",
            1
          );
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

export default function TabAlphaMask() {
  const [files, setFiles] = useState([]);
  const [alphaThreshold, setAlphaThreshold] = useState(128);
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
    // 이전 결과 URL 정리
    results.forEach((r) => {
      URL.revokeObjectURL(r.maskUrl);
      URL.revokeObjectURL(r.overlayUrl);
    });
    setResults([]);
    try {
      const list = await Promise.all(
        files.map((file) => buildAlphaMask(file, alphaThreshold))
      );
      setResults(list);
    } catch (err) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const downloadMask = (result) => {
    const a = document.createElement("a");
    a.href = result.maskUrl;
    const base = result.filename.replace(/\.[^.]+$/, "") || "image";
    a.download = `${base}-mask.png`;
    a.click();
  };

  const downloadAllMasks = () => {
    results.forEach((r, i) => {
      setTimeout(() => downloadMask(r), i * 300);
    });
  };

  return (
    <div className="tab-resize tab-alpha-mask">
      <p className="tab-desc">
        투명(알파) 영역이 있는 PNG 이미지에서 투명 부분을 흰색으로 표시한 마스크 이미지를 생성합니다.
        알파 임계값 이하인 픽셀이 흰색(마스크) 영역이 됩니다.
      </p>

      <div className="resize-options alpha-mask-options">
        <div className="option-row">
          <label>
            <span className="option-label">알파 임계값 (0–255)</span>
            <div className="alpha-mask-threshold-row">
              <input
                type="range"
                min={0}
                max={255}
                value={alphaThreshold}
                onChange={(e) => setAlphaThreshold(Number(e.target.value))}
                className="alpha-mask-slider"
              />
              <input
                type="number"
                min={0}
                max={255}
                value={alphaThreshold}
                onChange={(e) => setAlphaThreshold(Number(e.target.value))}
                className="size-input alpha-mask-number"
              />
            </div>
          </label>
          <p className="alpha-mask-hint">
            알파 값이 이 임계값 이하인 픽셀을 흰색(마스크)으로 처리합니다.
            값이 높을수록 반투명 영역도 마스크에 포함됩니다.
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
            <button type="button" className="btn-download-all" onClick={downloadAllMasks}>
              마스크 전체 다운로드
            </button>
          </div>
          <div className="results-grid alpha-mask-results-grid">
            {results.map((r, i) => (
              <div key={i} className="result-card alpha-mask-result-card">
                <span className="result-filename">{r.filename} ({r.w}×{r.h})</span>
                <div className="alpha-mask-previews">
                  <div className="alpha-mask-preview-item">
                    <span className="alpha-mask-preview-label">마스크</span>
                    <img src={r.maskUrl} alt={`${r.filename} 마스크`} className="result-preview" />
                  </div>
                  <div className="alpha-mask-preview-item">
                    <span className="alpha-mask-preview-label">오버레이</span>
                    <img src={r.overlayUrl} alt={`${r.filename} 오버레이`} className="result-preview" />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => downloadMask(r)}
                >
                  마스크 다운로드
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
