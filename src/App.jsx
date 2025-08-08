import React, { useState } from 'react';

export default function DMAIWeb() {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim()) return;
    const reply = `你说: ${input}\nDM回覆: 这是一个简单的回应（完整版会有掷骰与叙事逻辑）`;
    setHistory([
      ...history,
      { role: "user", content: input },
      { role: "assistant", content: reply }
    ]);
    setInput("");
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1>DM AI Web 极速版</h1>
      <div
        style={{
          border: "1px solid #ccc",
          padding: 10,
          height: 400,
          overflowY: "auto",
          marginBottom: 10
        }}
      >
        {history.map((m, i) => (
          <div key={i} style={{ textAlign: m.role === "user" ? "right" : "left" }}>
            <div
              style={{
                display: "inline-block",
                background: m.role === "user" ? "#def" : "#eee",
                padding: "5px 10px",
                borderRadius: 5,
                margin: "3px 0"
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <input
          style={{ flex: 1, padding: "5px" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的行动..."
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button onClick={handleSend}>发送</button>
      </div>
    </div>
  );
}
