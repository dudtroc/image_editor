const TRITON_BRIDGE_URL = process.env.TRITON_BRIDGE_URL || "http://localhost:8100";

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

  const res = await fetch(`${TRITON_BRIDGE_URL}/remove-bg`, {
    method: "POST",
    body: form,
  });

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
