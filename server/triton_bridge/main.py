"""
Triton 서버와 통신하기 위한 FastAPI 브릿지 서버.
Express 백엔드에서 이미지를 받아 Triton 서버로 전달하고 결과를 반환합니다.

Usage:
    cd /home/ktva/PROJECT/game/image_editor/server/triton_bridge
    python main.py
"""

import sys
import os
import io
import base64
import logging

# media_graph_triton 경로를 sys.path에 추가
# 환경변수 또는 기본 경로 (Linux/Windows 모두 지원)
TRITON_PROJECT_PATH = os.environ.get(
    "TRITON_PROJECT_PATH",
    os.path.join(os.path.expanduser("~"), "PROJECT", "media_graph_triton")
)
TRITON_PROJECT_PATH = os.path.abspath(TRITON_PROJECT_PATH)
src_dir = os.path.join(TRITON_PROJECT_PATH, "src")
if not os.path.isdir(src_dir):
    print("오류: media_graph_triton 프로젝트를 찾을 수 없습니다.")
    print(f"  기대 경로: {TRITON_PROJECT_PATH}")
    print("  해당 경로에 media_graph_triton 저장소가 있어야 하며, 그 안에 src/ 폴더가 있어야 합니다.")
    print("  다른 경로에 있다면 환경 변수를 설정하세요:")
    print("    set TRITON_PROJECT_PATH=C:\\경로\\media_graph_triton   (CMD)")
    print("    $env:TRITON_PROJECT_PATH=\"C:\\경로\\media_graph_triton\"   (PowerShell)")
    sys.exit(1)
sys.path.insert(0, TRITON_PROJECT_PATH)

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
import uvicorn

from src.was.connection.client_manager import ClientManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s: %(message)s")
logger = logging.getLogger("triton_bridge")

app = FastAPI(title="Triton Bridge")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Triton 서버 기본 설정
TRITON_URL = os.environ.get("TRITON_URL", "localhost:18000")
TRITON_PROTOCOL = os.environ.get("TRITON_PROTOCOL", "http")

# ClientManager 초기화 (client_yaml 없이 req()에서 직접 파라미터 전달)
client_manager = ClientManager()


def pil_to_base64_png(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/remove-bg")
async def remove_bg(
    image: UploadFile = File(...),
    triton_url: str = Query(default=None),
):
    """
    이미지를 받아 Triton Rembg 모델로 배경 제거 후 base64 PNG 반환.
    """
    url = triton_url or TRITON_URL

    try:
        img_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지를 읽을 수 없습니다: {e}")

    try:
        model_name = "background_rembg"
        task = "inference"

        user_input = {
            "model_name": model_name,
            "task": task,
            "image": pil_image,
        }

        result = client_manager.req(
            model_name=model_name,
            task=task,
            user_input=user_input,
            protocol=TRITON_PROTOCOL,
            url=url,
            init_timeout_s=120,
            ssl=False,
            insecure=True,
        )

        if result is None:
            raise HTTPException(status_code=500, detail="Triton 서버에서 결과를 받지 못했습니다.")

        # result는 [PIL.Image] 형태
        if isinstance(result, list) and len(result) > 0:
            output_image = result[0]
        elif isinstance(result, Image.Image):
            output_image = result
        else:
            raise HTTPException(status_code=500, detail=f"예상치 못한 결과 형식: {type(result)}")

        b64 = pil_to_base64_png(output_image)
        return JSONResponse({"success": True, "data": b64})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Triton 추론 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Triton 추론 실패: {e}")


if __name__ == "__main__":
    port = int(os.environ.get("TRITON_BRIDGE_PORT", 8100))
    logger.info(f"Triton Bridge 서버 시작: http://0.0.0.0:{port}")
    logger.info(f"Triton 서버 주소: {TRITON_URL}")
    uvicorn.run(app, host="0.0.0.0", port=port)
