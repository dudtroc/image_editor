import { useState } from "react";
import "./TabText2Image.css";

const API_BASE = "/api";

export default function TabText2Image({ provider }) {
  const [prompt, setPrompt] = useState("");
  const [imageB64, setImageB64] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("프롬프트를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setImageB64("");
    try {
      const res = await fetch(`${API_BASE}/text2image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
      if (data.data) setImageB64(data.data);
      else throw new Error("이미지 데이터 없음");
    } catch (err) {
      setError(err.message || "이미지 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!imageB64) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${imageB64}`;
    a.download = "generated.png";
    a.click();
  };

  return (
    <div className="tab-text2image">
      <p className="tab-desc">
        설명을 입력하면 선택한 API(OpenAI DALL·E 3 / Gemini)로 이미지를 생성합니다.
      </p>

      <div className="prompt-row">
        <textarea
          className="prompt-input"
          placeholder="예: 달 위를 걷는 고양이, 수채화 스타일"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "생성 중…" : "이미지 생성"}
        </button>
      </div>

      {error && <div className="message error">{error}</div>}

      {imageB64 && (
        <div className="result-box">
          <img
            src={`data:image/png;base64,${imageB64}`}
            alt="Generated"
            className="generated-image"
          />
          <button type="button" className="btn-secondary" onClick={download}>
            PNG 다운로드
          </button>
        </div>
      )}
    </div>
  );
}
