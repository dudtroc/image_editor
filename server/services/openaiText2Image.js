import OpenAI from "openai";

const MODEL = "dall-e-3";

export async function generateImageOpenAI(prompt, apiKey) {
  const openai = new OpenAI({ apiKey });

  const response = await openai.images.generate({
    model: MODEL,
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
  });

  if (!response.data || !response.data[0]) {
    throw new Error("No image data in OpenAI response");
  }

  const img = response.data[0];
  if (img.b64_json) return img.b64_json;
  if (img.url) {
    const r = await fetch(img.url);
    const buf = await r.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  }
  throw new Error("No b64_json or url in response");
}
