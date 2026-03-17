#!/bin/bash

# image_editor - 서버와 클라이언트 동시 실행 스크립트
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# .env 파일 로드
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  . "$SCRIPT_DIR/.env"
  set +a
fi

# 종료 시 자식 프로세스 정리
cleanup() {
  echo ""
  echo "종료 중..."
  kill $SERVER_PID $CLIENT_PID $TRITON_BRIDGE_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "서버 시작 중... (server/)"
cd server && npm run dev &
SERVER_PID=$!
cd "$SCRIPT_DIR"

echo "클라이언트 시작 중... (client/)"
cd client && npm run dev &
CLIENT_PID=$!
cd "$SCRIPT_DIR"

echo "Triton 브릿지 시작 중... (server/triton_bridge/)"
cd server/triton_bridge && pip install -q -r requirements.txt && python main.py &
TRITON_BRIDGE_PID=$!
cd "$SCRIPT_DIR"

echo ""
echo "서버 PID: $SERVER_PID | 클라이언트 PID: $CLIENT_PID | Triton 브릿지 PID: $TRITON_BRIDGE_PID"
echo "종료하려면 Ctrl+C 를 누르세요."
echo ""

wait
