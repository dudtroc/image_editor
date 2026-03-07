import OpenAI, { toFile } from "openai";

const DEFAULT_MODEL = "gpt-image-1.5";

/** 이미지 편집 지원 모델만 (edits 엔드포인트) */
const OPENAI_IMAGE2IMAGE_MODEL_IDS = [
  "gpt-image-1.5",
  "gpt-image-1",
  "dall-e-2",
];

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
const DALLE2_SIZES = [
  { value: "256x256", label: "256×256" },
  { value: "512x512", label: "512×512" },
  { value: "1024x1024", label: "1024×1024" },
];

/** image2image(edit)용 모델 목록: gpt-image-1, dall-e-2만 지원 */
export const OPENAI_IMAGE2IMAGE_MODELS = [
  { id: "gpt-image-1.5", label: "GPT Image 1.5", sizes: GPT_IMAGE_SIZES, qualities: GPT_IMAGE_QUALITIES },
  { id: "gpt-image-1", label: "GPT Image 1", sizes: GPT_IMAGE_SIZES, qualities: GPT_IMAGE_QUALITIES },
  { id: "dall-e-2", label: "DALL·E 2", sizes: DALLE2_SIZES },
];

const GPT_IMAGE_IDS = ["gpt-image-1.5", "gpt-image-1"];

function getDefaults(model) {
  if (GPT_IMAGE_IDS.includes(model)) return { size: "1024x1024", quality: "medium" };
  return { size: "1024x1024" };
}

/**
 * @param {string[]} imagesB64 - base64 이미지 배열 (data URL 제거된 순수 base64)
 * @param {string} prompt
 * @param {string} apiKey
 * @param {string} model
 * @param {{ size?: string, quality?: string }} opts
 */
export async function image2imageOpenAI(imagesB64, prompt, apiKey, model = DEFAULT_MODEL, opts = {}) {
  if (!imagesB64?.length) throw new Error("At least one image is required.");
  const openai = new OpenAI({ apiKey });
  const effectiveModel = OPENAI_IMAGE2IMAGE_MODEL_IDS.includes(model) ? model : DEFAULT_MODEL;
  const defaults = getDefaults(effectiveModel);
  const size = opts.size ?? defaults.size;
  const quality = opts.quality ?? defaults.quality;

  const isDalle2 = effectiveModel === "dall-e-2";
  const imagesToUse = isDalle2 ? imagesB64.slice(0, 1) : imagesB64;

  const imageFiles = await Promise.all(
    imagesToUse.map((b64, i) => {
      const clean = b64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(clean, "base64");
      return toFile(buffer, `image_${i}.png`, { type: "image/png" });
    })
  );

  const body = {
    image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
    prompt: prompt.trim(),
    model: effectiveModel,
    n: 1,
  };

  if (GPT_IMAGE_IDS.includes(effectiveModel)) {
    body.size = size;
    if (quality) body.quality = quality;
  } else {
    body.response_format = "b64_json";
    body.size = size;
  }

  const response = await openai.images.edit(body);

  if (!response.data?.[0]) throw new Error("No image data in OpenAI response");
  const img = response.data[0];
  if (img.b64_json) return img.b64_json;
  if (img.url) {
    const r = await fetch(img.url);
    const buf = await r.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  }
  throw new Error("No b64_json or url in response");
}
