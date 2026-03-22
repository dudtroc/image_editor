/**
 * Gemini API(Veo) 동영상 생성 — 모델별 지원 해상도·비율·길이
 * @see https://ai.google.dev/gemini-api/docs/video
 * @see https://ai.google.dev/gemini-api/docs/pricing (Veo 모델 코드)
 */

/** @type {{ value: string, label: string }[]} */
const ASPECT_16_9_9_16 = [
  { value: "16:9", label: "16:9 (가로)" },
  { value: "9:16", label: "9:16 (세로)" },
];

/** Veo 3.1 / 3.1 Fast — 문서 기준 720p·1080p·4K, 1080p/4K는 8초 */
const RES_V31 = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p (8초 전용)" },
  { value: "4k", label: "4K (8초 전용)" },
];

/** Veo 3 / 3 Fast — 1080p는 16:9·8초 제약 (기능 표 기준) */
const RES_V30 = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p (16:9, 8초 전용)" },
];

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   supportsResolutionParam: boolean,
 *   resolutions: { value: string, label: string }[],
 *   aspectRatios: { value: string, label: string }[],
 *   durations: number[],
 *   forceEightSecondResolutions?: string[],
 *   forceAspect16x9Resolutions?: string[],
 * }} GeminiVeoVideoModel
 */

/** @type {GeminiVeoVideoModel[]} */
export const GEMINI_VEO_VIDEO_MODELS = [
  {
    id: "veo-3.1-generate-preview",
    label: "Veo 3.1 (Preview)",
    supportsResolutionParam: true,
    resolutions: RES_V31,
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
    forceEightSecondResolutions: ["1080p", "4k"],
  },
  {
    id: "veo-3.1-fast-generate-preview",
    label: "Veo 3.1 Fast (Preview)",
    supportsResolutionParam: true,
    resolutions: RES_V31,
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
    forceEightSecondResolutions: ["1080p", "4k"],
  },
  {
    id: "veo-3.1-generate-001",
    label: "Veo 3.1",
    supportsResolutionParam: true,
    resolutions: RES_V31,
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
    forceEightSecondResolutions: ["1080p", "4k"],
  },
  {
    id: "veo-3.1-fast-generate-001",
    label: "Veo 3.1 Fast",
    supportsResolutionParam: true,
    resolutions: RES_V31,
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
    forceEightSecondResolutions: ["1080p", "4k"],
  },
  {
    id: "veo-3.0-generate-001",
    label: "Veo 3.0",
    supportsResolutionParam: true,
    resolutions: RES_V30,
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
    forceEightSecondResolutions: ["1080p"],
    forceAspect16x9Resolutions: ["1080p"],
  },
  {
    id: "veo-3.0-fast-generate-001",
    label: "Veo 3.0 Fast",
    supportsResolutionParam: true,
    resolutions: RES_V30,
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
    forceEightSecondResolutions: ["1080p"],
    forceAspect16x9Resolutions: ["1080p"],
  },
  {
    id: "veo-3.0-generate-exp",
    label: "Veo 3.0 (실험 · generate-exp)",
    supportsResolutionParam: true,
    resolutions: RES_V30,
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
    forceEightSecondResolutions: ["1080p"],
    forceAspect16x9Resolutions: ["1080p"],
  },
  {
    id: "veo-2.0-generate-001",
    label: "Veo 2.0",
    supportsResolutionParam: false,
    resolutions: [{ value: "720p", label: "720p (모델 기본)" }],
    aspectRatios: ASPECT_16_9_9_16,
    durations: [4, 6, 8],
  },
];

export const VEO_MODEL_IDS = GEMINI_VEO_VIDEO_MODELS.map((m) => m.id);

export function normalizeResolution(res) {
  const s = String(res || "720p").trim().toLowerCase();
  if (s === "4k") return "4k";
  if (s === "1080p") return "1080p";
  return "720p";
}

/**
 * @param {string} model
 * @param {{ resolution?: string, aspectRatio?: string, durationSeconds?: number }} params
 */
export function validateGeminiVideoParams(model, params) {
  const entry = GEMINI_VEO_VIDEO_MODELS.find((m) => m.id === model);
  if (!entry) {
    return { ok: false, error: `지원하지 않는 모델입니다: ${model}` };
  }

  const resolution = normalizeResolution(params.resolution);
  const aspectRatio = params.aspectRatio || "16:9";
  const durationSeconds = Number(params.durationSeconds);

  if (!entry.resolutions.some((r) => r.value === resolution)) {
    return { ok: false, error: `이 모델에서 선택할 수 없는 해상도입니다: ${resolution}` };
  }
  if (!entry.aspectRatios.some((a) => a.value === aspectRatio)) {
    return { ok: false, error: `지원하지 않는 화면 비율입니다: ${aspectRatio}` };
  }
  if (!entry.durations.includes(durationSeconds)) {
    return { ok: false, error: `지원하지 않는 길이입니다: ${durationSeconds}초` };
  }

  const force8 = entry.forceEightSecondResolutions || [];
  if (force8.includes(resolution) && durationSeconds !== 8) {
    return {
      ok: false,
      error: `${resolution} 해상도는 8초 길이만 지원합니다. 길이를 8초로 맞춰 주세요.`,
    };
  }

  const force169 = entry.forceAspect16x9Resolutions || [];
  if (force169.includes(resolution) && aspectRatio !== "16:9") {
    return {
      ok: false,
      error: "선택한 해상도에서는 16:9 화면만 사용할 수 있습니다.",
    };
  }

  return { ok: true };
}

export function getGeminiVideoModel(modelId) {
  return GEMINI_VEO_VIDEO_MODELS.find((m) => m.id === modelId);
}
