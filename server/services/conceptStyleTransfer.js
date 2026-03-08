/**
 * 입력 이미지를 client/data 스타일로만 변환 (구도·물체 유지, 스타일만 적용)
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

const STYLE_ONLY_PROMPT =
  "You are doing style transfer only. " +
  "IMAGE 1 (the first image) is the ONLY content source: redraw exactly what is in image 1—same composition, same objects, same layout. " +
  "The other image(s) are STYLE references only. From them use ONLY: color palette, lighting, brushwork, texture, and rendering style. " +
  "Do NOT draw, include, or copy any objects, characters, or subjects from the style reference images. " +
  "The output must show only the content from image 1, redrawn in the style of the references. Nothing from the reference images may appear as content.";

/**
 * @param {string} imageB64 - 사용자 입력 이미지 (base64)
 * @param {string} provider - "openai" | "gemini"
 * @param {string} model
 * @param {string} apiKey
 * @param {{ size?: string, quality?: string, aspectRatio?: string, imageSize?: string }} opts
 * @returns {Promise<string>} 결과 이미지 base64
 */
export async function styleTransfer(imageB64, provider, model, apiKey, opts = {}) {
  const styleB64List = loadStyleReferenceB64();
  if (!styleB64List.length) throw new Error("client/data에 참조용 이미지가 없습니다. PNG/JPEG/WebP 파일을 넣어 주세요.");

  const cleanInput = imageB64.replace(/^data:image\/\w+;base64,/, "");
  // 스타일만 참조하도록 참조 이미지 1장만 사용 (여러 장이면 모델이 참조 속 물체를 결과에 넣는 경향이 있음)
  const styleB64 = styleB64List.slice(0, 1);
  const imagesForApi = [cleanInput, ...styleB64];

  if (provider === "gemini") {
    return image2imageGemini(imagesForApi, STYLE_ONLY_PROMPT, apiKey, model, {
      aspectRatio: opts.aspectRatio ?? "1:1",
      imageSize: opts.imageSize ?? "1K",
    });
  }
  return image2imageOpenAI(imagesForApi, STYLE_ONLY_PROMPT, apiKey, model, {
    size: opts.size ?? "1024x1024",
    quality: opts.quality ?? "medium",
  });
}

export { GEMINI_IMAGE2IMAGE_MODELS, OPENAI_IMAGE2IMAGE_MODELS };
