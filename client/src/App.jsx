import { useState } from "react";
import ApiSelector from "./components/ApiSelector";
import "./components/ApiSelector.css";
import TabRemoveBg from "./components/TabRemoveBg";
import TabResize from "./components/TabResize";
import TabText2Image from "./components/TabText2Image";
import TabImage2Image from "./components/TabImage2Image";
import TabSplitImage from "./components/TabSplitImage";
import "./App.css";

const TABS = [
  { id: "text2image", label: "텍스트 → 이미지" },
  { id: "image2image", label: "이미지 → 이미지" },
  { id: "resize", label: "이미지 리사이즈" },
  { id: "split", label: "이미지 분할" },
  { id: "remove-bg", label: "배경 제거 (RGB → RGBA)" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("remove-bg");
  const [provider, setProvider] = useState("openai");

  return (
    <div className="app">
      <header className="header">
        <h1>Image Editor</h1>
        <ApiSelector value={provider} onChange={setProvider} />
      </header>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {activeTab === "remove-bg" && (
          <TabRemoveBg provider={provider} />
        )}
        {activeTab === "text2image" && (
          <TabText2Image provider={provider} />
        )}
        {activeTab === "image2image" && (
          <TabImage2Image provider={provider} />
        )}
        {activeTab === "resize" && (
          <TabResize />
        )}
        {activeTab === "split" && (
          <TabSplitImage />
        )}
      </main>
    </div>
  );
}
