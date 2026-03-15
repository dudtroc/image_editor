import { useState, useRef, useCallback } from "react";
import "./TabCropToAsset.css";

const API_BASE = "/api";
const HANDLE_SIZE = 12;
const MIN_BOX = 24;

function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function b64ToBlob(b64, mime = "image/png") {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** 컨테이너 내 디스플레이 좌표 → 원본 이미지 좌표 */
function displayToImageCoords(img, displayX, displayY) {
  const rect = img.getBoundingClientRect();
  const scaleX = img.naturalWidth / rect.width;
  const scaleY = img.naturalHeight / rect.height;
  return {
    x: (displayX - rect.left) * scaleX,
    y: (displayY - rect.top) * scaleY,
  };
}

function cropImageToDataUrl(img, sx, sy, sw, sh) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** 박스 + 마우스 위치 → 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'body'|null */
function hitTest(box, mx, my) {
  const { x, y, w, h } = box;
  const hs = HANDLE_SIZE;
  if (mx < x || mx > x + w || my < y || my > y + h) return null;
  const inN = my <= y + hs;
  const inS = my >= y + h - hs;
  const inW = mx <= x + hs;
  const inE = mx >= x + w - hs;
  if (inN && inW) return "nw";
  if (inN && inE) return "ne";
  if (inS && inW) return "sw";
  if (inS && inE) return "se";
  if (inN) return "n";
  if (inS) return "s";
  if (inW) return "w";
  if (inE) return "e";
  return "body";
}

export default function TabCropToAsset({ provider }) {
  const [conceptFile, setConceptFile] = useState(null);
  const [conceptPreviewUrl, setConceptPreviewUrl] = useState("");
  const [cropBox, setCropBox] = useState(null); // { x, y, w, h } 컨테이너 기준 px
  const [dragState, setDragState] = useState(null); // { type: 'move'|'resize', handle?, startX, startY, startBox }
  const [crops, setCrops] = useState([]);
  const [cropError, setCropError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  /** 좌표 입력 크롭: 좌상단(x1,y1), 우하단(x2,y2) - 이미지 픽셀 기준 */
  const [pointTopLeft, setPointTopLeft] = useState({ x: "", y: "" });
  const [pointBottomRight, setPointBottomRight] = useState({ x: "", y: "" });
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const nextIdRef = useRef(1);

  const onSelectFile = useCallback((fileList) => {
    const file = Array.from(fileList || []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    if (conceptPreviewUrl) URL.revokeObjectURL(conceptPreviewUrl);
    setConceptFile(file);
    setConceptPreviewUrl(URL.createObjectURL(file));
    setCrops([]);
    setCropBox(null);
    setDragState(null);
    setCropError("");
    setPointTopLeft({ x: "", y: "" });
    setPointBottomRight({ x: "", y: "" });
  }, [conceptPreviewUrl]);

  /** 이미지 로드 시 기본 박스 표시 (중앙 70% 영역) */
  const onImageLoad = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    if (W < MIN_BOX || H < MIN_BOX) return;
    const marginX = W * 0.15;
    const marginY = H * 0.15;
    setCropBox({
      x: marginX,
      y: marginY,
      w: W - marginX * 2,
      h: H - marginY * 2,
    });
  }, []);

  /** "박스 다시 표시" 버튼용 */
  const showBox = useCallback(() => {
    onImageLoad();
  }, [onImageLoad]);

  const getSelectionRect = useCallback(() => {
    if (!cropBox || !imgRef.current || !containerRef.current) return null;
    const img = imgRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    const p1 = displayToImageCoords(img, rect.left + cropBox.x, rect.top + cropBox.y);
    const p2 = displayToImageCoords(img, rect.left + cropBox.x + cropBox.w, rect.top + cropBox.y + cropBox.h);
    const x = Math.max(0, Math.min(p1.x, p2.x));
    const y = Math.max(0, Math.min(p1.y, p2.y));
    let w = Math.abs(p2.x - p1.x);
    let h = Math.abs(p2.y - p1.y);
    if (x + w > img.naturalWidth) w = img.naturalWidth - x;
    if (y + h > img.naturalHeight) h = img.naturalHeight - y;
    if (w < 5 || h < 5) return null;
    return { x, y, w, h };
  }, [cropBox]);

  const onMouseDown = useCallback(
    (e) => {
      if (!containerRef.current || !cropBox) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(cropBox, mx, my);
      if (!hit) return;
      e.preventDefault();
      setDragState({
        type: hit === "body" ? "move" : "resize",
        handle: hit === "body" ? undefined : hit,
        startX: mx,
        startY: my,
        startBox: { ...cropBox },
      });
    },
    [cropBox]
  );

  const onMouseMove = useCallback(
    (e) => {
      if (!containerRef.current || !dragState) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = rect.width;
      const H = rect.height;

      setCropBox((prev) => {
        if (!prev) return prev;
        const { startX, startY, startBox } = dragState;
        const dx = mx - startX;
        const dy = my - startY;

        if (dragState.type === "move") {
          let nx = startBox.x + dx;
          let ny = startBox.y + dy;
          nx = Math.max(0, Math.min(nx, W - startBox.w));
          ny = Math.max(0, Math.min(ny, H - startBox.h));
          return { ...startBox, x: nx, y: ny };
        }

        const handle = dragState.handle;
        let { x, y, w, h } = startBox;
        switch (handle) {
          case "e":
            w = Math.max(MIN_BOX, Math.min(W - x, startBox.w + (mx - startX)));
            break;
          case "w":
            w = Math.max(MIN_BOX, Math.min(startBox.x + startBox.w, startBox.w - (mx - startX)));
            x = startBox.x + startBox.w - w;
            break;
          case "s":
            h = Math.max(MIN_BOX, Math.min(H - y, startBox.h + (my - startY)));
            break;
          case "n":
            h = Math.max(MIN_BOX, Math.min(startBox.y + startBox.h, startBox.h - (my - startY)));
            y = startBox.y + startBox.h - h;
            break;
          case "se":
            w = Math.max(MIN_BOX, Math.min(W - x, startBox.w + (mx - startX)));
            h = Math.max(MIN_BOX, Math.min(H - y, startBox.h + (my - startY)));
            break;
          case "sw":
            w = Math.max(MIN_BOX, Math.min(startBox.x + startBox.w, startBox.w - (mx - startX)));
            x = startBox.x + startBox.w - w;
            h = Math.max(MIN_BOX, Math.min(H - y, startBox.h + (my - startY)));
            break;
          case "ne":
            w = Math.max(MIN_BOX, Math.min(W - x, startBox.w + (mx - startX)));
            h = Math.max(MIN_BOX, Math.min(startBox.y + startBox.h, startBox.h - (my - startY)));
            y = startBox.y + startBox.h - h;
            break;
          case "nw":
            w = Math.max(MIN_BOX, Math.min(startBox.x + startBox.w, startBox.w - (mx - startX)));
            x = startBox.x + startBox.w - w;
            h = Math.max(MIN_BOX, Math.min(startBox.y + startBox.h, startBox.h - (my - startY)));
            y = startBox.y + startBox.h - h;
            break;
          default:
            return prev;
        }
        return { x, y, w, h };
      });
    },
    [dragState]
  );

  const onMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const onMouseLeave = useCallback(() => {
    setDragState(null);
  }, []);

  const addCrop = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.complete) {
      setCropError("이미지가 아직 로드되지 않았습니다.");
      return;
    }
    const rect = getSelectionRect();
    if (!rect) {
      setCropError("박스를 불러온 뒤 영역을 조절하고 크롭해 주세요.");
      return;
    }
    setCropError("");
    const dataUrl = cropImageToDataUrl(img, rect.x, rect.y, rect.w, rect.h);
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const id = nextIdRef.current++;
    setCrops((prev) => [
      ...prev,
      { id, name: `에셋_${id}`, dataUrl, data: b64, rgba: null, rgbaLoading: false, rgbaError: null },
    ]);
  }, [getSelectionRect]);

  /** 좌상단·우하단 좌표(이미지 픽셀)로 크롭 */
  const addCropByPoints = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.complete) {
      setCropError("이미지가 아직 로드되지 않았습니다.");
      return;
    }
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const x1 = Number(pointTopLeft.x);
    const y1 = Number(pointTopLeft.y);
    const x2 = Number(pointBottomRight.x);
    const y2 = Number(pointBottomRight.y);
    if (Number.isNaN(x1) || Number.isNaN(y1) || Number.isNaN(x2) || Number.isNaN(y2)) {
      setCropError("좌상단·우하단 좌표를 모두 숫자로 입력해 주세요.");
      return;
    }
    const left = Math.max(0, Math.min(x1, x2));
    const top = Math.max(0, Math.min(y1, y2));
    let w = Math.abs(x2 - x1);
    let h = Math.abs(y2 - y1);
    if (left + w > nw) w = nw - left;
    if (top + h > nh) h = nh - top;
    if (w < 5 || h < 5) {
      setCropError("영역이 너무 작습니다. 좌상단과 우하단이 충분히 떨어져 있어야 합니다.");
      return;
    }
    setCropError("");
    const dataUrl = cropImageToDataUrl(img, left, top, w, h);
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const id = nextIdRef.current++;
    setCrops((prev) => [
      ...prev,
      { id, name: `에셋_${id}`, dataUrl, data: b64, rgba: null, rgbaLoading: false, rgbaError: null },
    ]);
  }, [pointTopLeft, pointBottomRight]);

  const removeCrop = useCallback((id) => {
    setCrops((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toRgba = useCallback(
    async (id) => {
      const item = crops.find((c) => c.id === id);
      if (!item?.data) return;
      setCrops((prev) =>
        prev.map((c) => (c.id === id ? { ...c, rgbaLoading: true, rgbaError: null } : c))
      );
      try {
        const form = new FormData();
        form.append("provider", provider);
        form.append("images", b64ToBlob(item.data), "crop.png");
        const res = await fetch(`${API_BASE}/remove-bg`, { method: "POST", body: form });
        const data = await res.json();
        const first = data.results?.[0];
        if (!res.ok || !first?.success) throw new Error(first?.error || "배경 제거 실패");
        setCrops((prev) =>
          prev.map((c) => (c.id === id ? { ...c, rgba: first.data, rgbaLoading: false } : c))
        );
      } catch (err) {
        setCrops((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, rgbaError: err.message, rgbaLoading: false } : c
          )
        );
      }
    },
    [provider, crops]
  );

  const downloadCrop = useCallback((item) => {
    const b64 = item.rgba ?? item.data;
    if (!b64) return;
    const name = (item.name || "crop").replace(/[^\w가-힣-]/g, "_");
    const suffix = item.rgba ? "-rgba" : "";
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${b64}`;
    a.download = `${name}${suffix}.png`;
    a.click();
  }, []);

  const downloadAll = useCallback(() => {
    crops.forEach((c, i) => {
      if (c.data || c.rgba) {
        setTimeout(() => downloadCrop(c), i * 300);
      }
    });
  }, [crops, downloadCrop]);

  const hasValidSelection = !!getSelectionRect();

  return (
    <div className="tab-crop-to-asset">
      <p className="tab-desc">
        컨셉 이미지를 올린 뒤, 박스를 불러와 이동·리사이즈하여 영역을 잡습니다. &quot;선택 영역 크롭&quot; 후
        &quot;타일 제외 (배경 제거)&quot;로 에셋 형태로 저장할 수 있습니다.
      </p>

      <section className="crop-section">
        <label className="section-label">1. 컨셉 이미지</label>
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            onSelectFile(e.dataTransfer?.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={(e) => onSelectFile(e.target.files)}
            className="upload-input"
          />
          {conceptPreviewUrl ? (
            <div
              ref={containerRef}
              className="crop-container"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
            >
              <img
                ref={imgRef}
                src={conceptPreviewUrl}
                alt="컨셉"
                className="crop-source-img"
                draggable={false}
                onLoad={onImageLoad}
                onContextMenu={(e) => e.preventDefault()}
              />
              {cropBox && (
                <div
                  className="crop-box"
                  style={{
                    left: cropBox.x,
                    top: cropBox.y,
                    width: cropBox.w,
                    height: cropBox.h,
                  }}
                >
                  <div className="crop-box-handle crop-box-handle-nw" data-handle="nw" />
                  <div className="crop-box-handle crop-box-handle-n" data-handle="n" />
                  <div className="crop-box-handle crop-box-handle-ne" data-handle="ne" />
                  <div className="crop-box-handle crop-box-handle-e" data-handle="e" />
                  <div className="crop-box-handle crop-box-handle-se" data-handle="se" />
                  <div className="crop-box-handle crop-box-handle-s" data-handle="s" />
                  <div className="crop-box-handle crop-box-handle-sw" data-handle="sw" />
                  <div className="crop-box-handle crop-box-handle-w" data-handle="w" />
                </div>
              )}
            </div>
          ) : (
            <span className="upload-text">클릭하거나 이미지를 여기에 드래그</span>
          )}
        </div>
        {conceptPreviewUrl && (
          <>
            <p className="crop-hint">
              이미지 로드 시 박스가 나타납니다. 박스 안을 드래그해 이동, 모서리·가장자리를 드래그해 크기를 조절하세요.
            </p>
            <div className="crop-buttons">
              <button type="button" className="btn-secondary" onClick={showBox}>
                박스 다시 표시
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={addCrop}
                disabled={!hasValidSelection}
              >
                선택 영역 크롭
              </button>
            </div>
            <div className="crop-by-points">
              <span className="crop-by-points-label">좌표로 크롭 (이미지 픽셀)</span>
              <div className="crop-by-points-inputs">
                <label>
                  좌상단 X
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={pointTopLeft.x}
                    onChange={(e) => setPointTopLeft((p) => ({ ...p, x: e.target.value }))}
                  />
                </label>
                <label>
                  좌상단 Y
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={pointTopLeft.y}
                    onChange={(e) => setPointTopLeft((p) => ({ ...p, y: e.target.value }))}
                  />
                </label>
                <label>
                  우하단 X
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={pointBottomRight.x}
                    onChange={(e) => setPointBottomRight((p) => ({ ...p, x: e.target.value }))}
                  />
                </label>
                <label>
                  우하단 Y
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={pointBottomRight.y}
                    onChange={(e) => setPointBottomRight((p) => ({ ...p, y: e.target.value }))}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={addCropByPoints}
              >
                좌표로 크롭
              </button>
            </div>
            {cropError && <div className="message error">{cropError}</div>}
          </>
        )}
      </section>

      {crops.length > 0 && (
        <section className="results-section">
          <div className="results-section-header">
            <h3 className="results-title">크롭된 에셋</h3>
            <button type="button" className="btn-download-all" onClick={downloadAll}>
              전체 다운로드
            </button>
          </div>
          <div className="crops-grid">
            {crops.map((c) => (
              <div key={c.id} className="crop-card">
                <span className="crop-name">{c.name}</span>
                <img
                  src={`data:image/png;base64,${c.rgba ?? c.data}`}
                  alt={c.name}
                  className="crop-preview"
                />
                <div className="crop-actions">
                  <button
                    type="button"
                    className="btn-small"
                    onClick={() => removeCrop(c.id)}
                  >
                    삭제
                  </button>
                  <button
                    type="button"
                    className="btn-small btn-rgba"
                    onClick={() => toRgba(c.id)}
                    disabled={c.rgbaLoading}
                  >
                    {c.rgbaLoading
                      ? "변환 중…"
                      : c.rgba
                        ? "타일 제외 완료"
                        : "타일 제외 (배경 제거)"}
                  </button>
                  <button
                    type="button"
                    className="btn-small btn-download"
                    onClick={() => downloadCrop(c)}
                  >
                    다운로드
                  </button>
                </div>
                {c.rgbaError && <div className="crop-rgba-error">{c.rgbaError}</div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
