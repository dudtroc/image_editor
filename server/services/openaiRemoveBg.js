const MODEL = "gpt-image-1.5";

function getMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[8] === 0x57 && buffer[9] === 0x45) return "image/webp";
  return "image/png";
}

export async function removeBackgroundOpenAI(imageBuffer, apiKey) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("image", new Blob([imageBuffer], { type: getMime(imageBuffer) }), "image.png");
  form.append("prompt", "Remove the background. Keep the main subject only. Output as PNG with transparent background.");
  form.append("background", "transparent");
  form.append("output_format", "png");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.data || !data.data[0]) throw new Error("No image data in OpenAI response");

  const img = data.data[0];
  if (img.b64_json) return img.b64_json;
  if (img.url) {
    const r = await fetch(img.url);
    const buf = await r.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  }
  throw new Error("No b64_json or url in response");
}
