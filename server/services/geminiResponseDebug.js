/**
 * Gemini generateContent 응답/에러를 서버 로그에서 원인 파악하기 쉽게 요약합니다.
 * inlineData는 길이만 기록하고 base64 본문은 넣지 않습니다.
 */

/** @param {unknown} data */
function inlineDataSize(data) {
  if (data == null) return 0;
  if (typeof data === "string") return data.length;
  if (data instanceof Uint8Array) return data.byteLength;
  if (typeof data === "object" && "length" in data) return Number(data.length) || 0;
  return 0;
}

/**
 * @param {unknown} response - ai.models.generateContent 결과
 * @param {{ model?: string, aspectRatio?: string, imageSize?: string, mode?: string }} meta
 */
export function summarizeGeminiGenerateResponse(response, meta = {}) {
  const r = response && typeof response === "object" ? response : {};
  const candidates = Array.isArray(r.candidates) ? r.candidates : [];
  const summary = {
    ...meta,
    promptFeedback: r.promptFeedback ?? null,
    usageMetadata: r.usageMetadata ?? null,
    modelVersion: r.modelVersion ?? null,
    responseId: r.responseId ?? null,
    candidatesCount: candidates.length,
    candidates: candidates.map((c, index) => {
      const parts = c?.content?.parts;
      const list = Array.isArray(parts) ? parts : null;
      return {
        index,
        finishReason: c?.finishReason ?? null,
        safetyRatings: c?.safetyRatings ?? null,
        hasContent: !!c?.content,
        partsPresent: list !== null,
        partsLength: list ? list.length : parts === undefined ? "parts_undefined" : "parts_not_array",
        parts: list
          ? list.map((p, pi) => ({
              partIndex: pi,
              hasText: typeof p?.text === "string" && p.text.length > 0,
              textPreview:
                typeof p?.text === "string" && p.text.length
                  ? `${p.text.slice(0, 160)}${p.text.length > 160 ? "…" : ""}`
                  : null,
              hasInlineData: !!p?.inlineData?.data,
              mimeType: p?.inlineData?.mimeType ?? null,
              inlineDataCharLength: inlineDataSize(p?.inlineData?.data),
            }))
          : null,
      };
    }),
  };
  return summary;
}

/** @param {unknown} err */
export function summarizeGeminiApiError(err) {
  if (err == null) return { message: "null_error" };
  if (typeof err !== "object") return { message: String(err) };
  const e = /** @type {Record<string, unknown>} */ (err);
  const out = {
    name: typeof e.name === "string" ? e.name : undefined,
    message: typeof e.message === "string" ? e.message : String(err),
    status: e.status ?? e.statusCode,
    code: e.code,
  };
  if (e.cause != null) {
    out.cause =
      typeof e.cause === "object" && e.cause && "message" in e.cause
        ? String(/** @type {{ message?: string }} */ (e.cause).message)
        : String(e.cause);
  }
  if (e.error != null) {
    try {
      out.error = typeof e.error === "string" ? e.error.slice(0, 4000) : JSON.parse(JSON.stringify(e.error));
    } catch {
      out.error = String(e.error).slice(0, 2000);
    }
  }
  if (typeof e.details === "string") out.details = e.details.slice(0, 2000);
  else if (e.details != null) {
    try {
      out.details = JSON.parse(JSON.stringify(e.details));
    } catch {
      out.details = String(e.details).slice(0, 2000);
    }
  }
  return out;
}

/**
 * @param {string} label - 예: geminiText2Image, geminiImage2Image
 * @param {unknown} response
 * @param {{ model?: string, aspectRatio?: string, imageSize?: string, mode?: string }} meta
 */
export function logGeminiResponseDiagnostic(label, response, meta = {}) {
  const line = `[${label}] Gemini response diagnostic`;
  const payload = summarizeGeminiGenerateResponse(response, meta);
  console.error(`${line}\n${JSON.stringify(payload, null, 2)}`);
}

/**
 * @param {string} label
 * @param {unknown} err
 * @param {{ model?: string, mode?: string }} meta
 */
export function logGeminiRequestError(label, err, meta = {}) {
  const payload = { ...meta, apiError: summarizeGeminiApiError(err) };
  console.error(`[${label}] Gemini API request failed\n${JSON.stringify(payload, null, 2)}`);
}
