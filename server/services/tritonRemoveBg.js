const TRITON_BRIDGE_URL = process.env.TRITON_BRIDGE_URL || "http://localhost:8100";

/** Express → 브릿지 fetch 전체 대기 시간(ms). 기본 24시간. */
const TRITON_BRIDGE_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.TRITON_BRIDGE_FETCH_TIMEOUT_MS || String(24 * 60 * 60 * 1000),
  10
);

/**
 * Triton 브릿지 서버를 통해 배경 제거
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>} base64-encoded PNG
 */
export async function removeBackgroundTriton(imageBuffer) {
  const form = new FormData();
  form.append(
    "image",
    new Blob([imageBuffer], { type: "image/png" }),
    "image.png"
  );

  const signal =
    Number.isFinite(TRITON_BRIDGE_FETCH_TIMEOUT_MS) && TRITON_BRIDGE_FETCH_TIMEOUT_MS > 0
      ? AbortSignal.timeout(TRITON_BRIDGE_FETCH_TIMEOUT_MS)
      : undefined;

  let res;
  try {
    res = await fetch(`${TRITON_BRIDGE_URL}/remove-bg`, {
      method: "POST",
      body: form,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (err?.name === "AbortError" || err?.cause?.name === "AbortError") {
      throw new Error(
        `Triton 브릿지 요청 시간 초과(${TRITON_BRIDGE_FETCH_TIMEOUT_MS}ms). 네트워크·서버 부하를 확인하거나 TRITON_BRIDGE_FETCH_TIMEOUT_MS 로 조정하세요.`
      );
    }
    const msg = err.cause?.code === "ECONNREFUSED" || err.message === "fetch failed"
      ? `Triton 브릿지에 연결할 수 없습니다. ${TRITON_BRIDGE_URL} 이 실행 중인지 확인하세요. (run-all.ps1의 Triton 브릿지 창을 켜 두세요.)`
      : (err.message || "Triton 브릿지 요청 실패");
    throw new Error(msg);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Triton bridge error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.success || !data.data) {
    throw new Error(data.detail || "Triton 배경 제거 실패");
  }

  return data.data;
}
