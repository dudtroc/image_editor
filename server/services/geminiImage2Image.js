import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.0-flash-exp-image-generation";

const GEMINI_IMAGE_MODEL_IDS = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.5-flash-preview-image",
];

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

export const GEMINI_IMAGE2IMAGE_MODELS = [
  { id: "gemini-2.0-flash-exp-image-generation", label: "Gemini 2.0 Flash (실험)", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
  { id: "gemini-2.5-flash-preview-image", label: "Gemini 2.5 Flash Image", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
  { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
  { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", aspectRatios: GEMINI_ASPECT_RATIOS, imageSizes: GEMINI_IMAGE_SIZES },
];

/**
 * @param {string[]} imagesB64 - base64 이미지 배열 (data URL 제거된 순수 base64)
 * @param {string} prompt
 * @param {string} apiKey
 * @param {string} model
 * @param {{ aspectRatio?: string, imageSize?: string }} opts
 */
export async function image2imageGemini(imagesB64, prompt, apiKey, model = DEFAULT_MODEL, opts = {}) {
  if (!imagesB64?.length) throw new Error("At least one image is required.");
  const ai = new GoogleGenAI({ apiKey });
  const effectiveModel = GEMINI_IMAGE_MODEL_IDS.includes(model) ? model : DEFAULT_MODEL;
  const aspectRatio = opts.aspectRatio ?? "1:1";
  const imageSize = opts.imageSize ?? "1K";

  const parts = [
    { text: prompt.trim() },
    ...imagesB64.map((b64) => {
      const clean = b64.replace(/^data:image\/\w+;base64,/, "");
      return {
        inlineData: {
          mimeType: "image/png",
          data: clean,
        },
      };
    }),
  ];

  const config = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio,
      imageSize,
    },
  };

  const response = await ai.models.generateContent({
    model: effectiveModel,
    contents: parts,
    config,
  });

  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) throw new Error("No content in Gemini response");

  for (const part of candidate.content.parts) {
    if (part.inlineData?.data) {
      const d = part.inlineData.data;
      return typeof d === "string" ? d : Buffer.from(d).toString("base64");
    }
  }

  throw new Error("Gemini did not return an image.");
}
