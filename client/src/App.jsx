import { useState } from "react";
import ApiSelector from "./components/ApiSelector";
import "./components/ApiSelector.css";
import TabRemoveBg from "./components/TabRemoveBg";
import TabResize from "./components/TabResize";
import TabTileImage from "./components/TabTileImage";
import TabSplitImage from "./components/TabSplitImage";
import TabGeminiImage from "./components/TabGeminiImage";
import TabStyleTransfer from "./components/TabStyleTransfer";
import TabCropToAsset from "./components/TabCropToAsset";
import TabVideoWork from "./components/TabVideoWork";
import TabVeoGenerate from "./components/TabVeoGenerate";
import TabGeminiVideo from "./components/TabGeminiVideo";
import TabMaskImage from "./components/TabMaskImage";
import TabVideoMaskReplace from "./components/TabVideoMaskReplace";
import "./App.css";

/** 상위: 생성 / 이미지 처리 — 하위에 기존 기능 탭 배치 */
const TAB_GROUPS = [
  {
    id: "generate",
    label: "생성",
    tabs: [
      { id: "gemini-image", label: "Gemini 이미지 생성" },
      { id: "gemini-video", label: "Gemini 동영상 생성" },
      { id: "crop-to-asset", label: "크롭 → 에셋" },
      { id: "veo-generate", label: "동영상 생성 (Veo)" },
    ],
  },
  {
    id: "process",
    label: "이미지 처리",
    tabs: [
      { id: "video-work", label: "동영상 작업" },
      { id: "video-mask-replace", label: "마스크 영역 교체 (A/B)" },
      { id: "resize", label: "이미지 리사이즈" },
      { id: "tile", label: "이미지 이어붙이기" },
      { id: "split", label: "이미지 분할" },
      { id: "mask-image", label: "마스크 이미지 (흰색 유지)" },
      { id: "remove-bg", label: "배경 제거 (RGB → RGBA)" },
      { id: "style-transfer", label: "스타일 변환" },
    ],
  },
];

const ALL_TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
const DEFAULT_TAB = TAB_GROUPS[0]?.tabs[0]?.id ?? "gemini-image";

function groupForTabId(tabId) {
  return TAB_GROUPS.find((g) => g.tabs.some((t) => t.id === tabId));
}

export default function App() {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [provider, setProvider] = useState("openai");
  const effectiveTab = ALL_TAB_IDS.includes(activeTab) ? activeTab : DEFAULT_TAB;
  const activeGroup = groupForTabId(effectiveTab) ?? TAB_GROUPS[0];

  return (
    <div className="app">
      <header className="header">
        <h1>Image Editor</h1>
        <ApiSelector value={provider} onChange={setProvider} />
      </header>

      <div className="tab-nav">
        <nav className="tabs tabs--categories" aria-label="기능 분류">
          {TAB_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`tab tab--category ${activeGroup.id === group.id ? "active" : ""}`}
              onClick={() => setActiveTab(group.tabs[0].id)}
            >
              {group.label}
            </button>
          ))}
        </nav>
        <nav className="tabs tabs--sub" aria-label="세부 기능">
          {activeGroup.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${effectiveTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="main">
        {effectiveTab === "gemini-image" && <TabGeminiImage />}
        {effectiveTab === "gemini-video" && <TabGeminiVideo />}
        {effectiveTab === "crop-to-asset" && (
          <TabCropToAsset provider={provider} />
        )}
        {effectiveTab === "video-work" && (
          <TabVideoWork provider={provider} />
        )}
        {effectiveTab === "video-mask-replace" && <TabVideoMaskReplace />}
        {effectiveTab === "veo-generate" && (
          <TabVeoGenerate />
        )}
        {effectiveTab === "style-transfer" && (
          <TabStyleTransfer provider={provider} />
        )}
        {effectiveTab === "remove-bg" && (
          <TabRemoveBg provider={provider} />
        )}
        {effectiveTab === "resize" && (
          <TabResize />
        )}
        {effectiveTab === "tile" && (
          <TabTileImage />
        )}
        {effectiveTab === "split" && (
          <TabSplitImage />
        )}
        {effectiveTab === "mask-image" && (
          <TabMaskImage />
        )}
      </main>
    </div>
  );
}
