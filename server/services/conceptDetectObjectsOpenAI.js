/**
 * OpenAI Vision으로 인게임 컨셉 아트 이미지에서 객체 목록 추출 (최대 20개)
 */

import OpenAI from "openai";

const VISION_MODEL = "gpt-4o-mini";

/**
 * @param {Buffer} imageBuffer
 * @param {string} apiKey
 * @returns {Promise<{ en: string, ko: string }[]>} 객체 목록 (영어 프롬프트용 en, 표시용 한국어 ko)
 */
export async function detectObjectsOpenAI(imageBuffer, apiKey) {
  const openai = new OpenAI({ apiKey });
  const base64 = imageBuffer.toString("base64");
  const mime = imageBuffer[0] === 0xff ? "image/jpeg" : "image/png";

  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${base64}` },
          },
          {
            type: "text",
            text: `This image is a Unity in-game concept art or game scene. List every distinct object, prop, or character. For EACH item return TWO labels:

1. "en": a DETAILED English phrase for an image generator. Include: (a) scene/theme (e.g. desert wasteland, medieval dungeon), (b) object type and material (wooden barrel, stone tombstone), (c) condition and style (weathered, rusty, cracked), (d) key visual details (color, texture). Example: "weathered wooden barrel with metal bands, desert or western theme, dry cracked wood, dusty brown and gray" or "large desert dinosaur skull skeleton, bleached bone, sandy beige, arid wasteland style".
2. "ko": a short label in KOREAN for display (e.g. "나무 통", "사막 공룡 해골").

Return ONLY a JSON array: [{"en": "detailed english phrase", "ko": "한국어"}, ...]. Maximum 20 items. No explanation, only the JSON array.`,
          },
        ],
      },
    ],
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No content in OpenAI response");

  const trimmed = raw.trim().replace(/^```json?\s*|\s*```$/g, "");
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
