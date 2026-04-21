import { useState, useEffect, useCallback, useRef } from "react";
import "./TabItemGenerate.css";

const API_BASE = "/api";
const MODEL = "gemini-3.1-flash-image-preview"; // Nano Banana 2
const ASPECT_RATIO = "1:1";
const IMAGE_SIZE = "1K";
const ALPHA_THRESHOLD = 250;
const TRIM_PADDING = 20;
const CELL_PX = 128;

/* ── 유틸 ─────────────────────────────────────────── */

function parseStages(data) {
  if (!data) return [];
  return Object.keys(data)
    .filter((k) => k.startsWith("stage"))
    .sort((a, b) => {
      const na = parseInt(a.replace("stage", ""), 10);
      const nb = parseInt(b.replace("stage", ""), 10);
      return na - nb;
    })
    .map((stageKey) => {
      const stage = data[stageKey];
      const items = Object.keys(stage)
        .filter((k) => k.startsWith("item"))
        .sort((a, b) => {
          const na = parseInt(a.replace("item", ""), 10);
          const nb = parseInt(b.replace("item", ""), 10);
          return na - nb;
        })
        .map((itemKey) => ({
          key: `${stageKey}.${itemKey}`,
          ...stage[itemKey],
        }));
      return { key: stageKey, name: stage._name, items };
    });
}

function findAlphaBounds(data, width, height, threshold) {
  const t = Math.min(254, Math.max(0, threshold));
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > t) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY };
}

function loadImageFromB64(b64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = `data:image/png;base64,${b64}`;
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = dataUrl;
  });
}

function canvasToDataUrl(canvas) {
  return canvas.toDataURL("image/png");
}

/** b64 PNG → 투명 영역 자르기 (패딩 포함) → dataUrl */
async function trimAlphaWithPadding(b64, threshold, padding) {
  const img = await loadImageFromB64(b64);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const bounds = findAlphaBounds(id.data, w, h, threshold);
  if (!bounds) throw new Error("불투명 픽셀 없음");

  const minX = Math.max(0, bounds.minX - padding);
  const minY = Math.max(0, bounds.minY - padding);
  const maxX = Math.min(w - 1, bounds.maxX + padding);
  const maxY = Math.min(h - 1, bounds.maxY + padding);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d").drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
  return canvasToDataUrl(out);
}

/** dataUrl → 리사이즈 → dataUrl */
async function resizeImage(dataUrl, tw, th) {
  const img = await loadImageFromDataUrl(dataUrl);
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  c.getContext("2d").drawImage(img, 0, 0, tw, th);
  return canvasToDataUrl(c);
}

/* ── 진행 상태 라벨 ───────────────────────────────── */
const STEP_LABELS = {
  waiting: "대기",
  generating: "이미지 생성 중…",
  "removing-bg": "배경 제거 중…",
  trimming: "투명 영역 자르기…",
  resizing: "리사이즈 중…",
  done: "완료",
  error: "오류",
};

/* ── 컴포넌트 ─────────────────────────────────────── */

export default function TabItemGenerate() {
  const [itemData, setItemData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({});
  const [results, setResults] = useState({});
  const abortRef = useRef(false);

  // item.json 로드
  useEffect(() => {
    fetch(`${API_BASE}/items`)
      .then((r) => r.json())
      .then((data) => setItemData(data))
      .catch((e) => setLoadError(e.message || "아이템 데이터를 불러올 수 없습니다."));
  }, []);

  const stages = parseStages(itemData);
  const allKeys = stages.flatMap((s) => s.items.map((i) => i.key));

  /* ── 선택 ─────────────────────────────────────── */
  const toggleItem = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleStage = (stage) => {
    const keys = stage.items.map((i) => i.key);
    const allSelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allKeys));
  const deselectAll = () => setSelected(new Set());

  /* ── 파이프라인 ───────────────────────────────── */
  const updateProg = useCallback((key, step, error) => {
    setProgress((prev) => ({ ...prev, [key]: { step, error } }));
  }, []);

  const processOneItem = useCallback(
    async (item, stylePrompt) => {
      const key = item.key;

      // 1. 이미지 생성
      updateProg(key, "generating");
      const prompt = stylePrompt + " " + item.prompt;
      const genRes = await fetch(`${API_BASE}/text2image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider: "gemini",
          model: MODEL,
          aspectRatio: ASPECT_RATIO,
          imageSize: IMAGE_SIZE,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok || !genData.data) throw new Error(genData.error || "이미지 생성 실패");
      const genB64 = genData.data;

      // 2. 배경 제거 (Triton)
      updateProg(key, "removing-bg");
      const blob = await (await fetch(`data:image/png;base64,${genB64}`)).blob();
      const form = new FormData();
      form.append("images", blob, "image.png");
      form.append("provider", "triton");
      const bgRes = await fetch(`${API_BASE}/remove-bg`, { method: "POST", body: form });
      const bgData = await bgRes.json();
      const bgResult = bgData.results?.[0];
      if (!bgRes.ok || !bgResult?.success) throw new Error(bgResult?.error || "배경 제거 실패");
      const removedB64 = bgResult.data;

      // 3. 투명 영역 자르기 (alpha 250, padding 20px)
      updateProg(key, "trimming");
      const trimmedDataUrl = await trimAlphaWithPadding(removedB64, ALPHA_THRESHOLD, TRIM_PADDING);

      // 4. 리사이즈
      updateProg(key, "resizing");
      const tw = item.size_w * CELL_PX;
      const th = item.size_h * CELL_PX;
      const finalDataUrl = await resizeImage(trimmedDataUrl, tw, th);

      updateProg(key, "done");
      return {
        dataUrl: finalDataUrl,
        width: tw,
        height: th,
        name: item.name,
        name_kr: item.name_kr,
        removedBgB64: removedB64,
        size_w: item.size_w,
        size_h: item.size_h,
      };
    },
    [updateProg]
  );

  const generate = useCallback(async () => {
    if (!itemData || selected.size === 0) return;
    const stylePrompt = itemData.style_prompt || "";
    const items = stages.flatMap((s) => s.items).filter((i) => selected.has(i.key));

    setProcessing(true);
    setResults({});
    setProgress({});
    abortRef.current = false;

    // 초기 대기 상태
    const initProg = {};
    items.forEach((i) => { initProg[i.key] = { step: "waiting" }; });
    setProgress(initProg);

    // 순차 처리 (API 부하 방지)
    for (const item of items) {
      if (abortRef.current) break;
      try {
        const result = await processOneItem(item, stylePrompt);
        setResults((prev) => ({ ...prev, [item.key]: result }));
      } catch (err) {
        updateProg(item.key, "error", err.message || "처리 실패");
      }
    }
    setProcessing(false);
  }, [itemData, selected, stages, processOneItem, updateProg]);

  const stopProcessing = () => { abortRef.current = true; };

  /* ── 패딩 재적용 ───────────────────────────────── */
  const [padding, setPadding] = useState(TRIM_PADDING);
  const [reapplying, setReapplying] = useState(false);

  const reapplyPadding = useCallback(async () => {
    const keys = Object.keys(results);
    if (!keys.length) return;
    setReapplying(true);
    try {
      const updated = { ...results };
      for (const key of keys) {
        const r = updated[key];
        if (!r.removedBgB64) continue;
        const trimmed = await trimAlphaWithPadding(r.removedBgB64, ALPHA_THRESHOLD, padding);
        const tw = r.size_w * CELL_PX;
        const th = r.size_h * CELL_PX;
        const finalDataUrl = await resizeImage(trimmed, tw, th);
        updated[key] = { ...r, dataUrl: finalDataUrl, width: tw, height: th };
      }
      setResults(updated);
    } finally {
      setReapplying(false);
    }
  }, [results, padding]);

  /* ── 다운로드 ─────────────────────────────────── */
  const downloadOne = (key) => {
    const r = results[key];
    if (!r) return;
    const a = document.createElement("a");
    a.href = r.dataUrl;
    a.download = `${r.name.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  const downloadAll = () => {
    const keys = Object.keys(results);
    keys.forEach((key, i) => {
      setTimeout(() => downloadOne(key), i * 300);
    });
  };

  /* ── 로딩 / 에러 ──────────────────────────────── */
  if (loadError) return <div className="tab-item-gen"><div className="message error">{loadError}</div></div>;
  if (!itemData) return <div className="tab-item-gen"><p className="tab-item-gen-muted">아이템 데이터 불러오는 중…</p></div>;

  const doneCount = Object.values(progress).filter((p) => p.step === "done").length;
  const errorCount = Object.values(progress).filter((p) => p.step === "error").length;
  const totalSelected = selected.size;
  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="tab-item-gen">
      <p className="tab-desc">
        <code>item.json</code>의 아이템을 stage별로 선택하여 이미지를 자동 생성합니다.
        파이프라인: <strong>Gemini 이미지 생성</strong> → <strong>Triton 배경 제거</strong> → <strong>투명 영역 자르기</strong> (alpha {ALPHA_THRESHOLD}, padding {TRIM_PADDING}px) → <strong>리사이즈</strong> (size × {CELL_PX}px)
      </p>

      {/* ── Stage / Item 선택 영역 ──────────────── */}
      <div className="tab-item-gen-stages">
        <div className="tab-item-gen-select-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={selectAll} disabled={processing}>
            전체 선택
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={deselectAll} disabled={processing}>
            전체 해제
          </button>
          <span className="tab-item-gen-count">{totalSelected}개 선택됨</span>
        </div>

        <div className="tab-item-gen-stage-grid">
          {stages.map((stage) => {
            const stageKeys = stage.items.map((i) => i.key);
            const allChecked = stageKeys.every((k) => selected.has(k));
            const someChecked = stageKeys.some((k) => selected.has(k));
            return (
              <div key={stage.key} className="tab-item-gen-stage-card">
                <label className="tab-item-gen-stage-header">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={() => toggleStage(stage)}
                    disabled={processing}
                  />
                  <span className="tab-item-gen-stage-name">
                    {stage.key.replace("stage", "Stage ")} — {stage.name}
                  </span>
                </label>
                <ul className="tab-item-gen-item-list">
                  {stage.items.map((item) => {
                    const prog = progress[item.key];
                    const isError = prog?.step === "error";
                    const isDone = prog?.step === "done";
                    return (
                      <li key={item.key} className="tab-item-gen-item-row">
                        <label className={`tab-item-gen-item-label ${isDone ? "done" : ""} ${isError ? "err" : ""}`}>
                          <input
                            type="checkbox"
                            checked={selected.has(item.key)}
                            onChange={() => toggleItem(item.key)}
                            disabled={processing}
                          />
                          <span className="tab-item-gen-item-name">{item.name_kr}</span>
                          <span className="tab-item-gen-item-size">{item.size_w}×{item.size_h}</span>
                        </label>
                        {prog && prog.step !== "waiting" && (
                          <span className={`tab-item-gen-step ${prog.step}`}>
                            {STEP_LABELS[prog.step]}
                            {isError && prog.error && <span className="tab-item-gen-err-msg" title={prog.error}> ({prog.error})</span>}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 실행 버튼 ──────────────────────────── */}
      <div className="tab-item-gen-actions">
        {!processing ? (
          <button
            type="button"
            className="btn-primary"
            onClick={generate}
            disabled={totalSelected === 0}
          >
            선택 아이템 생성 ({totalSelected}개)
          </button>
        ) : (
          <button type="button" className="btn-danger" onClick={stopProcessing}>
            중지
          </button>
        )}
        {processing && (
          <span className="tab-item-gen-progress-summary">
            진행: {doneCount + errorCount} / {totalSelected} (완료 {doneCount}, 오류 {errorCount})
          </span>
        )}
      </div>

      {/* ── 결과 ───────────────────────────────── */}
      {hasResults && (
        <div className="tab-item-gen-results">
          <div className="tab-item-gen-results-header">
            <h3>결과 ({Object.keys(results).length}개)</h3>
            <button type="button" className="btn-download-all" onClick={downloadAll}>
              전체 다운로드
            </button>
          </div>
          <div className="tab-item-gen-padding-row">
            <label className="tab-item-gen-padding-label">
              패딩 (px)
              <input
                type="number"
                min={0}
                max={200}
                value={padding}
                onChange={(e) => setPadding(Math.max(0, Number(e.target.value)))}
                className="tab-item-gen-padding-input"
                disabled={reapplying}
              />
            </label>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={reapplyPadding}
              disabled={reapplying}
            >
              {reapplying ? "적용 중…" : "패딩 재적용"}
            </button>
          </div>
          <div className="tab-item-gen-results-grid">
            {stages.flatMap((s) => s.items).filter((i) => results[i.key]).map((item) => {
              const r = results[item.key];
              return (
                <div key={item.key} className="tab-item-gen-result-card">
                  <span className="tab-item-gen-result-name">{item.name_kr} ({item.name})</span>
                  <span className="tab-item-gen-result-size">{r.width}×{r.height}px</span>
                  <img src={r.dataUrl} alt={item.name_kr} className="tab-item-gen-result-img" />
                  <button type="button" className="btn-secondary" onClick={() => downloadOne(item.key)}>
                    다운로드
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
