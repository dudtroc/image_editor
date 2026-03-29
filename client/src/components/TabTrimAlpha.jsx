import { useState, useRef } from "react";
import "./TabResize.css";
import "./TabTrimAlpha.css";

/**
 * 알파 채널 기준으로 불투명 픽셀의 최소 바운딩 박스를 구한 뒤, 그 영역만 남기고 잘라냅니다.
 */
function findAlphaBounds(data, width, height, alphaThreshold) {
  const raw = Number.isFinite(alphaThreshold) ? alphaThreshold : 0;
  const t = Math.min(254, Math.max(0, raw));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a > t) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function trimAlphaFromFile(file, alphaThreshold) {
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
      const bounds = findAlphaBounds(imageData.data, w, h, alphaThreshold);
      if (!bounds) {
        reject(new Error(`불투명 픽셀이 없습니다: ${file.name}`));
        return;
      }
      const cw = bounds.maxX - bounds.minX + 1;
      const ch = bounds.maxY - bounds.minY + 1;
      const out = document.createElement("canvas");
      out.width = cw;
      out.height = ch;
      const octx = out.getContext("2d");
      octx.drawImage(canvas, bounds.minX, bounds.minY, cw, ch, 0, 0, cw, ch);
      out.toBlob(
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
              w: cw,
              h: ch,
              origW: w,
              origH: h,
              bounds,
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

export default function TabTrimAlpha() {
  const [files, setFiles] = useState([]);
  const [alphaThreshold, setAlphaThreshold] = useState(0);
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
        files.map((file) => trimAlphaFromFile(file, alphaThreshold))
      );
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
    a.download = `${base}-trim-${w}x${h}.png`;
    a.click();
  };

  const downloadAll = () => {
    results.forEach((r, i) => {
      setTimeout(() => download(r.dataUrl, r.filename, r.w, r.h), i * 300);
    });
  };

  return (
    <div className="tab-resize tab-trim-alpha">
      <p className="tab-desc">
        RGBA(또는 투명 PNG) 이미지에서 불투명 픽셀이 차지하는 가장 위·아래·왼쪽·오른쪽 끝을 찾아,
        투명 여백을 제거하고 캔버스 크기를 아이콘 실제 영역에 맞춥니다. 여러 장을 한 번에 처리할 수
        있습니다.
      </p>

      <div className="resize-options trim-alpha-options">
        <div className="option-row">
          <label>
            <span className="option-label">알파 임계값 (0–254)</span>
            <input
              type="number"
              min={0}
              max={254}
              value={alphaThreshold}
              onChange={(e) => setAlphaThreshold(Number(e.target.value))}
              className="size-input"
            />
          </label>
          <p className="trim-alpha-hint">
            알파가 이 값보다 큰 픽셀만 &quot;내용&quot;으로 봅니다. (0이면 알파 1 이상이면 포함.
            반투명 가장자리를 잘라내려면 값을 올리세요.)
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
            {loading ? "처리 중…" : "투명 영역 자르기"}
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
                  {r.filename} → {r.origW}×{r.origH}에서 {r.w}×{r.h}로 자름
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
