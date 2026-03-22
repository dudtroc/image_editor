import { GoogleGenAI } from "@google/genai";
import {
  VEO_MODEL_IDS,
  validateGeminiVideoParams,
  normalizeResolution,
  getGeminiVideoModel,
} from "./geminiVideoModels.js";

export { VEO_MODEL_IDS } from "./geminiVideoModels.js";

const LAST_FRAME_SUPPORTED_MODELS = new Set(VEO_MODEL_IDS);

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes

function buildPrompt(subject, animationDesc) {
  return `작업 목적: 제공된 시작 프레임과 끝 프레임 사이를 부드럽게 연결하여 완벽하게 이어지는 무한 반복(Seamless Looping) 애니메이션 비디오를 생성합니다.

입력 데이터
- 시작 프레임: [입력 이미지와 완벽하게 동일한 이미지]
- 마지막 프레임: [시작 프레임과 완벽하게 동일한 이미지]

피사체: ${subject}
애니메이션 상세 설명: ${animationDesc}
움직임: ${animationDesc} 부분만 애니메이션화합니다. 시작 프레임의 형태에서 출발해 부드럽게 움직인 뒤 다시 끝 프레임의 형태로 완벽하게 돌아와야 하며, 영상이 반복될 때 끊김이나 튀는 현상이 없어야 합니다.

일관성 및 정적 요소 (매우 중요)
- 고정 요소: ${animationDesc}를 제외한 다른 부분들은 절대적으로 바뀌면 형태를 고정합니다. 전체적인 뼈대, 형태, 바라보는 방향, 위치는 완벽하게 고정되어야 하며 절대 일그러지거나 움직여서는 안 됩니다.
- 배경: 배경은 전혀 움직이거나 색이 변해서는 안 됩니다.

이미지 스타일
- 스타일 유지: 입력 프레임의 2D 아트 스타일을 정확히 유지하십시오.
- 외곽선: 굵고 일정하며 깨끗한 검은색 외곽선을 유지하십시오. 선이 흔들리거나 거칠어지면 안 됩니다.
- 명암: 경계가 뚜렷한 하이라이트, 중간 톤, 그림자의 3가지 톤으로 구성된 2D 셀 셰이딩(Cel-shading) 기법을 그대로 보존하십시오. 3D 사실적인 조명이나 부드러운 그라데이션, 실사 효과를 절대 추가하지 마십시오.`;
}

/**
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   durationSeconds: number,
 *   subject?: string,
 *   animationDesc?: string,
 *   prompt?: string (사용자 전체 프롬프트 — 있으면 내부 템플릿 미사용)
 *   startFrameBase64: string,
 *   endFrameBase64?: string,
 *   startMimeType?: string,
 *   endMimeType?: string,
 *   aspectRatio?: string,
 *   resolution?: string,
 * }} params
 * @returns {Promise<Buffer>} MP4 video buffer
 */
export async function generateVeoVideo({
  apiKey,
  model,
  durationSeconds,
  subject,
  animationDesc,
  prompt: userPrompt,
  startFrameBase64,
  endFrameBase64,
  startMimeType = "image/png",
  endMimeType = "image/png",
  aspectRatio = "16:9",
  resolution = "720p",
}) {
  if (!VEO_MODEL_IDS.includes(model)) {
    throw new Error(`지원하지 않는 Veo 모델입니다: ${model}`);
  }

  const validation = validateGeminiVideoParams(model, {
    resolution,
    aspectRatio,
    durationSeconds,
  });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const meta = getGeminiVideoModel(model);
  const ai = new GoogleGenAI({ apiKey });
  const trimmedUser = typeof userPrompt === "string" ? userPrompt.trim() : "";
  const prompt = trimmedUser
    ? trimmedUser
    : buildPrompt(subject ?? "", animationDesc ?? "");

  const supportsLastFrame = LAST_FRAME_SUPPORTED_MODELS.has(model);

  const videoConfig = {
    numberOfVideos: 1,
    durationSeconds,
    aspectRatio: aspectRatio || "16:9",
    ...(meta?.supportsResolutionParam
      ? { resolution: normalizeResolution(resolution) }
      : {}),
    ...(supportsLastFrame && endFrameBase64
      ? {
          lastFrame: {
            imageBytes: endFrameBase64,
            mimeType: endMimeType,
          },
        }
      : {}),
  };

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    image: {
      imageBytes: startFrameBase64,
      mimeType: startMimeType,
    },
    config: videoConfig,
  });

  const startTime = Date.now();

  while (!operation.done) {
    if (Date.now() - startTime > MAX_WAIT_MS) {
      throw new Error("동영상 생성 시간이 초과되었습니다 (최대 10분).");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (operation.error) {
    throw new Error(`Veo 오류: ${JSON.stringify(operation.error)}`);
  }

  const response = operation.response;
  console.log("[Veo] full response:", JSON.stringify(response, null, 2));

  const generatedVideos = response?.generatedVideos;
  if (!generatedVideos?.length) {
    const filtered = response?.raiMediaFilteredCount;
    throw new Error(
      `생성된 동영상이 없습니다.${filtered ? ` (RAI 필터로 ${filtered}개 차단됨)` : ""}`
    );
  }

  const video = generatedVideos[0]?.video;
  console.log("[Veo] video object:", JSON.stringify(video, null, 2));

  if (video?.videoBytes) {
    return Buffer.from(video.videoBytes, "base64");
  }

  if (video?.uri) {
    const separator = video.uri.includes("?") ? "&" : "?";
    const downloadUrl = `${video.uri}${separator}key=${apiKey}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`동영상 다운로드 실패 (${res.status}): ${await res.text()}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error(`동영상 데이터가 없습니다. video 객체: ${JSON.stringify(video)}`);
}
