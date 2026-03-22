import { GoogleGenAI } from "@google/genai";
import { logGeminiRequestError, logGeminiResponseDiagnostic } from "./geminiResponseDebug.js";

const MODEL = "gemini-2.0-flash-exp-image-generation";

export async function removeBackgroundGemini(imageBuffer, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const base64 = imageBuffer.toString("base64");
  const mime = getMime(imageBuffer);

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mime,
                data: base64,
              },
            },
            {
              text: `CRITICAL: The ONLY change allowed is making the background transparent. You must NOT change the subject in any way.

STRICT RULES—do not violate:
- Do NOT change the shape, form, silhouette, or proportions of any object. Every object must look exactly the same as in the input.
- Do NOT change the image style: no redrawing, no style transfer, no changing colors/contrast/line weight. The subject must look identical to the input.
- Do NOT change composition, layout, framing, or crop. Do NOT add or remove any detail.

Preserve exactly: (a) Line work—bold, clean black outlines; consistent line weight; no rough or wobbly lines. (b) Shading and volume—existing cel-shading; clear highlight/shadow boundaries; at least three tones (highlight, mid-tone, shadow). (c) Shadows: render all shadows in neutral gray tones (grayscale); do not use colored shadows—keep shadow color consistent as gray so it does not change between runs.

Output: same subject pixel-for-pixel, only background removed. Single image as PNG with transparent background. No text or watermark.`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        responseMimeType: "image/png",
      },
    });
  } catch (err) {
    logGeminiRequestError("geminiRemoveBg", err, { model: MODEL, mode: "remove-bg" });
    throw err;
  }

  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) {
    logGeminiResponseDiagnostic("geminiRemoveBg", response, { model: MODEL, mode: "remove-bg", reason: "missing_content_parts" });
    throw new Error("No content in Gemini response");
  }

  for (const part of candidate.content.parts) {
    if (part.inlineData?.data) {
      const d = part.inlineData.data;
      return typeof d === "string" ? d : Buffer.from(d).toString("base64");
    }
  }

  logGeminiResponseDiagnostic("geminiRemoveBg", response, { model: MODEL, mode: "remove-bg", reason: "no_image_inline_data" });
  throw new Error("Gemini did not return an image. Try OpenAI for background removal.");
}

function getMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[8] === 0x57 && buffer[9] === 0x45) return "image/webp";
  return "image/png";
}
