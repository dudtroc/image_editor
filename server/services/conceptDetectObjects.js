/**
 * 인게임 컨셉 아트 이미지에서 등장하는 객체 목록을 Vision API로 추출 (최대 20개)
 */

import { GoogleGenAI } from "@google/genai";

const GEMINI_VISION_MODEL = "gemini-2.0-flash";

function getMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[8] === 0x57 && buffer[9] === 0x45) return "image/webp";
  return "image/png";
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} apiKey
 * @returns {Promise<{ en: string, ko: string }[]>} 객체 목록 (영어 프롬프트용 en, 표시용 한국어 ko)
 */
export async function detectObjectsGemini(imageBuffer, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const base64 = imageBuffer.toString("base64");
  const mime = getMime(imageBuffer);

  const response = await ai.models.generateContent({
    model: GEMINI_VISION_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: { mimeType: mime, data: base64 },
          },
          {
            text: `This image is a Unity in-game concept art or game scene. List every distinct object, prop, or character. For EACH item return TWO labels:

1. "en": a DETAILED English phrase for an image generator. Include: (a) scene/theme (e.g. desert wasteland, medieval dungeon), (b) object type and material (e.g. wooden barrel, stone tombstone), (c) condition and style (e.g. weathered, rusty, cracked), (d) key visual details (color, size hint, texture). Example: "weathered wooden barrel with metal bands, desert or western theme, dry cracked wood, dusty brown and gray tones" or "large desert dinosaur skull skeleton, bleached bone, sandy beige, partially buried, arid wasteland style".
2. "ko": a short label in KOREAN for display (e.g. "나무 통", "사막 공룡 해골").

Rules:
- "en" must be one rich phrase (1–2 sentences ok), English only; "ko" is a brief Korean label.
- Return ONLY a JSON array: [{"en": "detailed english phrase", "ko": "한국어"}, ...]
- Maximum 20 items. Pick the 20 most prominent.
- No numbering, no explanation, only the JSON array.`,
          },
        ],
      },
    ],
  });

  const text =
    (typeof response.text === "function" ? response.text() : response.text) ??
    response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");

  const trimmed = String(text).trim().replace(/^```json?\s*|\s*```$/g, "");
  let arr;
  try {
    arr = JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\[[\s\S]*\]/);
    arr = match ? JSON.parse(match[0]) : [];
  }
  if (!Array.isArray(arr)) throw new Error("Response is not an array");

  return arr
    .slice(0, 20)
    .filter((item) => item && (typeof item.en === "string" || typeof item === "string"))
    .map((item) => {
      if (typeof item === "string") return { en: item.trim(), ko: item.trim() };
      const en = String(item.en ?? "").trim();
      const ko = String(item.ko ?? "").trim();
      return { en, ko: ko || en };
    })
    .filter(({ en }) => en.length > 0);
}
