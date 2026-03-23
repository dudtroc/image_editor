import { useState, useRef, useEffect } from "react";
import "./TabResize.css";
import "./TabMaskImage.css";
import "./TabMaskUnion.css";

function loadImagePixels(file) {
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
      resolve({ w, h, data: imageData.data });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`불러오기 실패: ${file.name}`));
    };
    img.src = url;
  });
}

function isWhiteAt(data, i, threshold) {
  const t = threshold;
  return data[i] >= t && data[i + 1] >= t && data[i + 2] >= t;
}

async function unionMasks(fileA, fileB, whiteThreshold) {
  const [a, b] = await Promise.all([loadImagePixels(fileA), loadImagePixels(fileB)]);
  if (a.w !== b.w || a.h !== b.h) {
    throw new Error(
      `가로·세로 크기가 같아야 합니다. (마스크 1: ${a.w}×${a.h}, 마스크 2: ${b.w}×${b.h})`
    );
  }
  const w = a.w;
  const h = a.h;
  const t = Math.min(255, Math.max(0, Number.isFinite(whiteThreshold) ? whiteThreshold : 250));
  const da = a.data;
  const db = b.data;
  const out = new ImageData(w, h);
  const d = out.data;
  for (let i = 0; i < da.length; i += 4) {
    const on = isWhiteAt(da, i, t) || isWhiteAt(db, i, t);
    const v = on ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(out, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("인코딩에 실패했습니다."));
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () =>
          resolve({
            blob,
            dataUrl: reader.result,
            w,
            h,
          });
        reader.readAsDataURL(blob);
      },
      "image/png",
      1
    );
  });
}

export default function TabMaskUnion() {
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [previewA, setPreviewA] = useState("");
  const [previewB, setPreviewB] = useState("");
  const [whiteThreshold, setWhiteThreshold] = useState(250);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragA, setDragA] = useState(false);
  const [dragB, setDragB] = useState(false);
  const inputARef = useRef(null);
  const inputBRef = useRef(null);

  useEffect(() => {
    if (!fileA) {
      setPreviewA("");
      return;
    }
    const u = URL.createObjectURL(fileA);
    setPreviewA(u);
    return () => URL.revokeObjectURL(u);
  }, [fileA]);

  useEffect(() => {
    if (!fileB) {
      setPreviewB("");
      return;
    }
    const u = URL.createObjectURL(fileB);
    setPreviewB(u);
    return () => URL.revokeObjectURL(u);
  }, [fileB]);

  const pickImage = (list) => {
    const chosen = Array.from(list || []).filter((f) => f.type.startsWith("image/"));
    return chosen[0] ?? null;
  };

  const setFromDrop = (slot, fileList) => {
    const f = pickImage(fileList);
    if (!f) return;
    setError("");
    if (slot === "a") setFileA(f);
    else setFileB(f);
  };

  const process = async () => {
    if (!fileA || !fileB) {
      setError("마스크 이미지를 두 장 모두 선택해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await unionMasks(fileA, fileB, whiteThreshold);
      setResult(r);
    } catch (err) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!result?.dataUrl) return;
    const base =
      [fileA?.name, fileB?.name]
        .filter(Boolean)
        .map((n) => n.replace(/\.[^.]+$/, ""))
        .join("-") || "mask-union";
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = `${base}-union.png`;
    a.click();
  };

  return (
    <div className="tab-resize tab-mask-image tab-mask-union">
      <p className="tab-desc">
        같은 크기의 마스크 이미지 두 장에서 흰색(또는 임계값 이상)인 픽셀을 합칩니다. 한쪽이라도
        흰이면 결과는 흰색, 둘 다 아니면 검정입니다.
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
            R·G·B가 모두 이 값 이상이면 흰색으로 봅니다. (기본 250 — 「마스크 이미지 (흰색 유지)」와
            동일)
          </p>
        </div>
      </div>

      <div className="mask-pair-upload">
        <div className="mask-pair-slot">
          <span className="mask-pair-label">마스크 1</span>
          <div
            className={`upload-zone ${dragA ? "dragging" : ""}`}
            onClick={() => inputARef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragA(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragA(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragA(false);
              setFromDrop("a", e.dataTransfer.files);
            }}
          >
            <input
              ref={inputARef}
              type="file"
              accept="image/*"
              className="upload-input"
              onChange={(e) => {
                setFromDrop("a", e.target.files);
                if (inputARef.current) inputARef.current.value = "";
              }}
            />
            <span className="upload-text">
              {fileA ? fileA.name : "클릭 또는 드롭으로 이미지 선택"}
            </span>
          </div>
          {previewA && <img src={previewA} alt="" className="mask-pair-preview" />}
        </div>

        <div className="mask-pair-slot">
          <span className="mask-pair-label">마스크 2</span>
          <div
            className={`upload-zone ${dragB ? "dragging" : ""}`}
            onClick={() => inputBRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragB(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragB(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragB(false);
              setFromDrop("b", e.dataTransfer.files);
            }}
          >
            <input
              ref={inputBRef}
              type="file"
              accept="image/*"
              className="upload-input"
              onChange={(e) => {
                setFromDrop("b", e.target.files);
                if (inputBRef.current) inputBRef.current.value = "";
              }}
            />
            <span className="upload-text">
              {fileB ? fileB.name : "클릭 또는 드롭으로 이미지 선택"}
            </span>
          </div>
          {previewB && <img src={previewB} alt="" className="mask-pair-preview" />}
        </div>
      </div>

      <div className="mask-pair-actions">
        <button
          type="button"
          className="btn-clear"
          onClick={() => {
            setFileA(null);
            setFileB(null);
            setResult(null);
            setError("");
          }}
        >
          선택 초기화
        </button>
        <button type="button" className="btn-primary" onClick={process} disabled={loading}>
          {loading ? "처리 중…" : "마스크 합치기"}
        </button>
      </div>

      {error && <div className="message error">{error}</div>}

      {result && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>결과 ({result.w}×{result.h})</h3>
            <button type="button" className="btn-download-all" onClick={download}>
              PNG 다운로드
            </button>
          </div>
          <div className="results-grid">
            <div className="result-card">
              <img src={result.dataUrl} alt="합쳐진 마스크" className="result-preview" />
              <button type="button" className="btn-secondary" onClick={download}>
                다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
