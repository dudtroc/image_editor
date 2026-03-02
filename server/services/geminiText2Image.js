import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.0-flash-exp-image-generation";

export async function generateImageGemini(prompt, apiKey) {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
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

  throw new Error("Gemini did not return an image.");
}
