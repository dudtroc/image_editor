import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-image-1.5";

/** GPT Image: gpt-image-1.5, gpt-image-1. DALL·E: dall-e-3, dall-e-2 (deprecated 2026-05-12) */
const OPENAI_IMAGE_MODEL_IDS = [
  "gpt-image-1.5",
  "gpt-image-1",
  "dall-e-3",
  "dall-e-2",
];

/** 모델별 size/quality 옵션 (API 문서 기준) */
const GPT_IMAGE_SIZES = [
  { value: "1024x1024", label: "1024×1024 (정사각)" },
  { value: "1536x1024", label: "1536×1024 (가로)" },
  { value: "1024x1536", label: "1024×1536 (세로)" },
  { value: "auto", label: "자동" },
];
const GPT_IMAGE_QUALITIES = [
  { value: "high", label: "고품질" },
  { value: "medium", label: "중간" },
  { value: "low", label: "저품질" },
  { value: "auto", label: "자동" },
];
const DALLE3_SIZES = [
  { value: "1024x1024", label: "1024×1024 (정사각)" },
  { value: "1024x1792", label: "1024×1792 (세로)" },
  { value: "1792x1024", label: "1792×1024 (가로)" },
];
const DALLE3_QUALITIES = [
  { value: "standard", label: "표준" },
  { value: "hd", label: "HD" },
];
const DALLE2_SIZES = [
  { value: "256x256", label: "256×256" },
  { value: "512x512", label: "512×512" },
  { value: "1024x1024", label: "1024×1024" },
];

/** @type {{ id: string, label: string, sizes: { value: string, label: string }[], qualities?: { value: string, label: string }[] }[]} */
export const OPENAI_IMAGE_MODELS = [
  { id: "gpt-image-1.5", label: "GPT Image 1.5", sizes: GPT_IMAGE_SIZES, qualities: GPT_IMAGE_QUALITIES },
  { id: "gpt-image-1", label: "GPT Image 1", sizes: GPT_IMAGE_SIZES, qualities: GPT_IMAGE_QUALITIES },
  { id: "dall-e-3", label: "DALL·E 3", sizes: DALLE3_SIZES, qualities: DALLE3_QUALITIES },
  { id: "dall-e-2", label: "DALL·E 2", sizes: DALLE2_SIZES },
];

const GPT_IMAGE_IDS = ["gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"];

function getOpenAIDefaults(model) {
  if (GPT_IMAGE_IDS.includes(model)) return { size: "1024x1024", quality: "medium" };
  if (model === "dall-e-3") return { size: "1024x1024", quality: "standard" };
  return { size: "1024x1024" };
}

export async function generateImageOpenAI(prompt, apiKey, model = DEFAULT_MODEL, opts = {}) {
  const openai = new OpenAI({ apiKey });
  const effectiveModel = OPENAI_IMAGE_MODEL_IDS.includes(model) ? model : DEFAULT_MODEL;
  const defaults = getOpenAIDefaults(effectiveModel);
  const size = opts.size ?? defaults.size;
  const quality = opts.quality ?? defaults.quality;

  const options = {
    model: effectiveModel,
    prompt,
    n: 1,
  };

  if (GPT_IMAGE_IDS.includes(effectiveModel)) {
    options.size = size;
    if (quality) options.quality = quality;
  } else {
    options.response_format = "b64_json";
    options.size = size;
    if (effectiveModel === "dall-e-3" && quality) options.quality = quality;
  }

  const response = await openai.images.generate(options);

  if (!response.data || !response.data[0]) {
    throw new Error("No image data in OpenAI response");
  }

  const img = response.data[0];
  if (img.b64_json) return img.b64_json;
  if (img.url) {
    const r = await fetch(img.url);
    const buf = await r.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  }
  throw new Error("No b64_json or url in response");
}
