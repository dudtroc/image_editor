import { useState } from "react";
import ApiSelector from "./components/ApiSelector";
import "./components/ApiSelector.css";
import TabRemoveBg from "./components/TabRemoveBg";
import TabResize from "./components/TabResize";
import TabText2Image from "./components/TabText2Image";
import "./App.css";

const TABS = [
  { id: "remove-bg", label: "배경 제거 (RGB → RGBA)" },
  { id: "text2image", label: "텍스트 → 이미지" },
  { id: "resize", label: "이미지 리사이즈" },
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
        {activeTab === "resize" && (
          <TabResize />
        )}
      </main>
    </div>
  );
}
