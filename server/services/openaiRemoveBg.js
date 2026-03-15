const MODEL = "gpt-image-1.5";

function getMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[8] === 0x57 && buffer[9] === 0x45) return "image/webp";
  return "image/png";
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} apiKey
 * @param {{ quality?: string }} opts - quality: "low" | "medium" | "high" | "auto" (GPT Image only)
 */
export async function removeBackgroundOpenAI(imageBuffer, apiKey, opts = {}) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("image", new Blob([imageBuffer], { type: getMime(imageBuffer) }), "image.png");
  form.append(
    "prompt",
    `CRITICAL: The ONLY change allowed is making the background transparent. You must NOT change the subject in any way.

STRICT RULES—do not violate:
- Do NOT change the shape, form, silhouette, or proportions of any object. Every object must look exactly the same as in the input.
- Do NOT change the image style: no redrawing, no style transfer, no changing colors/contrast/line weight. The subject must look identical to the input.
- Do NOT change composition, layout, framing, or crop. Do NOT add or remove any detail.

Preserve exactly: (a) Line work—bold, clean black outlines; consistent line weight; no rough or wobbly lines. (b) Shading and volume—existing cel-shading; clear highlight/shadow boundaries; at least three tones (highlight, mid-tone, shadow). (c) Shadows: render all shadows in neutral gray tones (grayscale); do not use colored shadows—keep shadow color consistent as gray so it does not change between runs.

Output: same subject pixel-for-pixel, only background removed. PNG with transparent background.`
  );
  form.append("background", "transparent");
  form.append("output_format", "png");
  const quality = opts.quality && ["low", "medium", "high", "auto"].includes(opts.quality) ? opts.quality : "auto";
  form.append("quality", quality);

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
