# Image Editor

React 기반 웹 UI로 이미지 배경 제거(RGB → RGBA)와 텍스트→이미지(Text2Image) 기능을 제공합니다.  
API는 **OpenAI**와 **Gemini** 중 선택해 사용할 수 있습니다.

## 환경 설정

프로젝트 루트의 `.env` 파일에 다음 환경 변수를 설정하세요.

- `OPEN_AI_API_KEY` — OpenAI API 키 (배경 제거·DALL·E 3 사용)
- `GEMINI_API_KEY` — Google Gemini API 키 (배경 제거·이미지 생성 사용)
- `FFMPEG_PATH` — (선택) 동영상 작업 탭에서 "동영상(MP4)으로 저장" 시 사용. ffmpeg 실행 파일 전체 경로.  
  예: `FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe` (Windows), `FFMPEG_PATH=/usr/bin/ffmpeg` (Linux/Mac).  
  설정하지 않으면 시스템 PATH에 있는 `ffmpeg`를 사용합니다. [ffmpeg 다운로드](https://ffmpeg.org/download.html)

실행 시 이 키들이 서버에서 읽혀 API 호출에 사용됩니다.

## 기능

- **API 선택**: 상단에서 OpenAI / Gemini 중 사용할 API를 선택합니다.
- **Tab 1 — 배경 제거 (RGB → RGBA)**  
  - JPEG/PNG/WebP 이미지를 업로드하면 투명 배경 PNG(RGBA)로 변환합니다.  
  - 여러 장 동시 업로드 가능 (최대 16장).  
  - 처리 후 결과 이미지를 미리보기 및 다운로드할 수 있습니다.
- **Tab 2 — 텍스트 → 이미지 (Text2Image)**  
  - 프롬프트를 입력하면 선택한 API(OpenAI DALL·E 3 또는 Gemini)로 이미지를 생성합니다.  
  - 생성된 이미지는 PNG로 다운로드할 수 있습니다.

## Web UI 구동 방법

### 1. 의존성 설치

**백엔드 (서버)**

```bash
cd server
npm install
```

**프론트엔드 (클라이언트)**

```bash
cd client
npm install
```

(또는 프로젝트 루트에서 한 번에: `cd server && npm install` 후 `cd ../client && npm install`)

### 2. 서버 실행

API 키는 서버에서만 사용되므로, 반드시 **서버를 먼저** 실행합니다.

```bash
cd server
npm start
```

기본 주소: `http://localhost:3001`  
개발 시 자동 재시작이 필요하면:

```bash
npm run dev
```

### 3. 클라이언트(Web UI) 실행

새 터미널에서:

```bash
cd client
npm run dev
```

브라우저에서 `http://localhost:5173` 로 접속합니다.  
Vite 개발 서버가 `/api` 요청을 `http://localhost:3001` 로 프록시하므로, 같은 머신에서 서버가 떠 있으면 API가 정상 동작합니다.

### 4. 빌드 후 실행 (선택)

프론트엔드를 빌드해 정적 파일로 서빙하려면:

```bash
cd client
npm run build
npm run preview
```

이때 프록시는 `preview` 모드에 따라 다를 수 있으므로, 실제 배포 시에는 같은 호스트에서 API 서버를 프록시하거나, 환경 변수로 API 베이스 URL을 지정하는 방식으로 연동하면 됩니다.

## 프로젝트 구조

```
image_editor/
├── .env                 # OPEN_AI_API_KEY, GEMINI_API_KEY
├── README.md
├── client/              # React + Vite 프론트엔드
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/   # ApiSelector, TabRemoveBg, TabText2Image
│   │   └── ...
│   └── package.json
└── server/              # Express 백엔드
    ├── index.js
    ├── routes/          # removeBg, text2image
    ├── services/         # OpenAI / Gemini 호출
    └── package.json
```

## 요약

| 단계 | 명령 | 위치 |
|------|------|------|
| 1 | `npm install` | `server/` |
| 2 | `npm install` | `client/` |
| 3 | `npm start` (또는 `npm run dev`) | `server/` |
| 4 | `npm run dev` | `client/` |
| 5 | 브라우저에서 `http://localhost:5173` 접속 | - |

`.env`에 `OPEN_AI_API_KEY`와 `GEMINI_API_KEY`를 설정한 뒤, 위 순서대로 실행하면 Web UI를 사용할 수 있습니다.
