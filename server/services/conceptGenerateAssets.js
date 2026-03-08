/**
 * client/data 스타일 참조 이미지를 바탕으로 객체별 에셋 이미지 생성
 * (객체 중앙 배치, 물체 바로 밑 얕은 그림자)
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { image2imageGemini } from "./geminiImage2Image.js";
import { image2imageOpenAI } from "./openaiImage2Image.js";
import { GEMINI_IMAGE2IMAGE_MODELS } from "./geminiImage2Image.js";
import { OPENAI_IMAGE2IMAGE_MODELS } from "./openaiImage2Image.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../client/data");

/** client/data 폴더의 이미지 파일 base64 배열 반환 */
function loadStyleReferenceB64() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs.readdirSync(DATA_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  const b64List = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DATA_DIR, f));
    b64List.push(buf.toString("base64"));
  }
  return b64List;
}

// 스타일 유지를 위한 명시적 프롬프트 (참조 이미지와 함께 사용)
// 1. 외곽선: 굵고 일정한 검은색만, 내부 세세한 선 없음
const STYLE_OUTLINE =
  "Thick, uniform black outline only—constant line weight everywhere, no thin or varying strokes. No fine internal lines: no fur strands, no hair lines, no texture lines; one simplified outline defining the shape. Vector art style, casual game asset. ";
// 2. 채색·명암: 평면 채색, 부드러운 그라데이션/입체 하이라이트 금지
const STYLE_FLAT =
  "Flat color fill only—flat shading, no soft gradients, no smooth blending. No 3D highlights: no white dots, no specular highlights on fur or surface. Shadows with hard edges only: simple flat shadow shapes with crisp boundaries, no soft shadow edges. ";
const STYLE_COLOR =
  "Muted colors, limited color palette. For wood: warm brown tones, simple lines for planks. For metal or stone: matte grey, smooth flat surface, minimal wear lines. ";
const STYLE_FORM =
  "Rounded corners, rounded shapes, exaggerated features, minimalist details, compact design. ";
const STYLE_BG_SHADOW =
  "Isolated object on white or transparent background, centered. Simple flat contact shadow (light grey, hard-edged ellipse) directly underneath the object only. ";

const ASSET_PROMPT_PREFIX =
  "Game asset image, RGBA format with transparent background. Single object only, centered. Match the reference image style and strictly follow these style rules: " +
  STYLE_OUTLINE +
  STYLE_FLAT +
  STYLE_COLOR +
  STYLE_FORM +
  STYLE_BG_SHADOW;
const ASSET_PROMPT_SUFFIX =
  " Output: fully transparent background (alpha channel), no environment or scenery—only the isolated object and its flat hard-edged contact shadow. PNG with alpha. No text, no watermark.";

/** 대상 이미지 위에 올라갈 에셋일 때 추가하는 프롬프트 */
const OVERLAY_PROMPT =
  " This asset will be overlaid/composited onto the attached target scene image(s). Ensure the asset's lighting, perspective, and visual style are compatible with these scenes so it looks natural when placed on them.";

/**
 * @param {string[]} objectNames - 생성할 객체 이름 배열
 * @param {string} provider - "openai" | "gemini"
 * @param {string} model
 * @param {string} apiKey
 * @param {{ size?: string, quality?: string, aspectRatio?: string, imageSize?: string, targetImages?: string[] }} opts
 * @returns {Promise<{ objectName: string, data: string }[]>}
 */
export async function generateConceptAssets(objectNames, provider, model, apiKey, opts = {}) {
  const styleB64 = loadStyleReferenceB64();
  if (!styleB64.length) throw new Error("client/data에 참조용 이미지가 없습니다. PNG/JPEG/WebP 파일을 넣어 주세요.");

  const targetImages = (Array.isArray(opts.targetImages) ? opts.targetImages : [])
    .map((b) => (b || "").replace(/^data:image\/\w+;base64,/, "").trim())
    .filter(Boolean);
  const imagesForPrompt = targetImages.length > 0
    ? [...styleB64, ...targetImages]
    : styleB64;

  const generateOne = async (objectName) => {
    const suffix = targetImages.length > 0 ? ASSET_PROMPT_SUFFIX + OVERLAY_PROMPT : ASSET_PROMPT_SUFFIX;
    const prompt = `${ASSET_PROMPT_PREFIX}Draw: ${objectName}.${suffix}`;
    if (provider === "gemini") {
      const b64 = await image2imageGemini(imagesForPrompt, prompt, apiKey, model, {
        aspectRatio: opts.aspectRatio ?? "1:1",
        imageSize: opts.imageSize ?? "1K",
      });
      return { objectName, data: b64 };
    } else {
      const b64 = await image2imageOpenAI(imagesForPrompt, prompt, apiKey, model, {
        size: opts.size ?? "1024x1024",
        quality: opts.quality ?? "medium",
      });
      return { objectName, data: b64 };
    }
  };

  // API는 요청별 독립 호출이므로 병렬 생성 (Gemini/OpenAI 모두 동시 요청 가능)
  const settled = await Promise.allSettled(
    objectNames.map((name) => generateOne(name))
  );
  const results = settled.map((out, i) => {
    const name = objectNames[i];
    if (out.status === "fulfilled") return out.value;
    return { objectName: name, error: out.reason?.message || String(out.reason) };
  });
  return results;
}

export { GEMINI_IMAGE2IMAGE_MODELS, OPENAI_IMAGE2IMAGE_MODELS };
