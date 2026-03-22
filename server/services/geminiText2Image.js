import { GoogleGenAI } from "@google/genai";
import { image2imageGemini } from "./geminiImage2Image.js";
import { logGeminiRequestError, logGeminiResponseDiagnostic } from "./geminiResponseDebug.js";

const DEFAULT_MODEL = "gemini-2.0-flash-exp-image-generation";

const GEMINI_IMAGE_MODEL_IDS = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.5-flash-preview-image",
];

/** Gemini ImageConfig: aspectRatio, imageSize (1K, 2K, 4K) */
const GEMINI_ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 (정사각)" },
  { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" },
  { value: "3:4", label: "3:4" },
  { value: "4:3", label: "4:3" },
  { value: "9:16", label: "9:16 (세로)" },
  { value: "16:9", label: "16:9 (가로)" },
  { value: "21:9", label: "21:9 (울트라 와이드)" },
];
const GEMINI_IMAGE_SIZES = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

/** 무료 한도에서 사용 가능한 모델을 상단에 배치 (Nano Banana Pro 등은 무료 한도 0일 수 있음) */
/** @type {{ id: string, label: string, aspectRatios: { value: string, label: string }[], imageSizes: { value: string, label: string }[] }[]} */
export const GEMINI_IMAGE_MODELS = [
  { id: "gemini-2.0-flash-exp-image-generation", label: "Gemini 2.0 Flash (실험)", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
  { id: "gemini-2.5-flash-preview-image", label: "Gemini 2.5 Flash Image", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
  { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2 (Gemini 3.1 Flash Image)", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
  { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro (Gemini 3 Pro Image)", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
];

export async function generateImageGemini(prompt, apiKey, model = DEFAULT_MODEL, opts = {}) {
  const refs = opts.referenceImagesB64;
  if (Array.isArray(refs) && refs.length > 0) {
    return image2imageGemini(refs, prompt, apiKey, model, opts);
  }

  const ai = new GoogleGenAI({ apiKey });
  const effectiveModel = GEMINI_IMAGE_MODEL_IDS.includes(model) ? model : DEFAULT_MODEL;
  const aspectRatio = opts.aspectRatio ?? "1:1";
  const imageSize = opts.imageSize ?? "1K";

  const config = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio,
      imageSize,
    },
  };

  let response;
  try {
    response = await ai.models.generateContent({
      model: effectiveModel,
      contents: prompt,
      config,
    });
  } catch (err) {
    logGeminiRequestError("geminiText2Image", err, { model: effectiveModel, mode: "text-only" });
    throw err;
  }

  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) {
    logGeminiResponseDiagnostic("geminiText2Image", response, {
      model: effectiveModel,
      mode: "text-only",
      aspectRatio,
      imageSize,
      reason: "missing_content_parts",
    });
    throw new Error("No content in Gemini response");
  }

  for (const part of candidate.content.parts) {
    if (part.inlineData?.data) {
      const d = part.inlineData.data;
      return typeof d === "string" ? d : Buffer.from(d).toString("base64");
    }
  }

  logGeminiResponseDiagnostic("geminiText2Image", response, {
    model: effectiveModel,
    mode: "text-only",
    aspectRatio,
    imageSize,
    reason: "no_image_inline_data",
  });
  throw new Error("Gemini did not return an image.");
}
