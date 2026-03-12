export default function ApiSelector({ value, onChange }) {
  return (
    <div className="api-selector">
      <span className="api-selector-label">API</span>
      <select
        className="api-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="openai">OpenAI</option>
        <option value="gemini">Gemini</option>
        <option value="triton">Triton (로컬)</option>
      </select>
    </div>
  );
}
