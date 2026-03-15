import { useState } from "react";
import ApiSelector from "./components/ApiSelector";
import "./components/ApiSelector.css";
import TabRemoveBg from "./components/TabRemoveBg";
import TabResize from "./components/TabResize";
import TabText2Image from "./components/TabText2Image";
import TabImage2Image from "./components/TabImage2Image";
import TabTileImage from "./components/TabTileImage";
import TabSplitImage from "./components/TabSplitImage";
import TabConceptAssets from "./components/TabConceptAssets";
import TabStyleTransfer from "./components/TabStyleTransfer";
import TabCropToAsset from "./components/TabCropToAsset";
import TabVideoWork from "./components/TabVideoWork";
import "./App.css";

const TABS = [
  { id: "concept-assets", label: "컨셉 → 에셋" },
  { id: "crop-to-asset", label: "크롭 → 에셋" },
  { id: "video-work", label: "동영상 작업" },
  { id: "style-transfer", label: "스타일 변환" },
  { id: "text2image", label: "텍스트 → 이미지", disabled: true },
  { id: "image2image", label: "이미지 → 이미지", disabled: true },
  { id: "resize", label: "이미지 리사이즈" },
  { id: "tile", label: "이미지 이어붙이기" },
  { id: "split", label: "이미지 분할" },
  { id: "remove-bg", label: "배경 제거 (RGB → RGBA)" },
];

const VISIBLE_TABS = TABS.filter((tab) => !tab.disabled);
const DEFAULT_TAB = VISIBLE_TABS[0]?.id ?? "concept-assets";

export default function App() {
  const [activeTab, setActiveTab] = useState("concept-assets");
  const [provider, setProvider] = useState("openai");
  const effectiveTab = VISIBLE_TABS.some((t) => t.id === activeTab) ? activeTab : DEFAULT_TAB;

  return (
    <div className="app">
      <header className="header">
        <h1>Image Editor</h1>
        <ApiSelector value={provider} onChange={setProvider} />
      </header>

      <nav className="tabs">
        {VISIBLE_TABS.map((tab) => (
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

      <main className="main">
        {effectiveTab === "concept-assets" && (
          <TabConceptAssets provider={provider} />
        )}
        {effectiveTab === "crop-to-asset" && (
          <TabCropToAsset provider={provider} />
        )}
        {effectiveTab === "video-work" && (
          <TabVideoWork provider={provider} />
        )}
        {effectiveTab === "style-transfer" && (
          <TabStyleTransfer provider={provider} />
        )}
        {effectiveTab === "remove-bg" && (
          <TabRemoveBg provider={provider} />
        )}
        {effectiveTab === "text2image" && (
          <TabText2Image provider={provider} />
        )}
        {effectiveTab === "image2image" && (
          <TabImage2Image provider={provider} />
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
      </main>
    </div>
  );
}
