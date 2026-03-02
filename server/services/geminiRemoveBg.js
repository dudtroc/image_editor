import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.0-flash-exp-image-generation";

export async function removeBackgroundGemini(imageBuffer, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const base64 = imageBuffer.toString("base64");
  const mime = getMime(imageBuffer);

  const response = await ai.models.generateContent({
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
            text: "Remove the background of this image completely. Keep only the main subject. Output a single image as PNG with transparent background. Do not add any text or watermark.",
          },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      responseMimeType: "image/png",
    },
  });

  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) throw new Error("No content in Gemini response");

  for (const part of candidate.content.parts) {
    if (part.inlineData?.data) {
      const d = part.inlineData.data;
      return typeof d === "string" ? d : Buffer.from(d).toString("base64");
    }
  }

  throw new Error("Gemini did not return an image. Try OpenAI for background removal.");
}

function getMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[8] === 0x57 && buffer[9] === 0x45) return "image/webp";
  return "image/png";
}
