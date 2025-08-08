import React, { useEffect, useRef, useState } from "react";

/**
 * DM AI — 全功能单文件（玩法自适应 + 记录系统 + AI 环境推理 混合引擎）
 * 功能：
 * 1) 世界状态（时间/地点/危险度/玩家）
 * 2) 掷骰系统（d4~d100 + 优势/劣势）
 * 3) 技能判定（关键字→技能；可扩展）
 * 4) 随机遭遇（权重表，25% 触发）
 * 5) 任务系统（添加/完成）
 * 6) 背包系统（拾取/消耗）
 * 7) 玩法自适应：不匹配时进入“澄清模式”向玩家追问，再做裁定（只推进一次时间）
 * 8) 记录系统：聊天记录 + 事件日志；支持导入/导出；localStorage 自动保存
 * 9) 环境修正（混合）：本地规则 + 可选 AI 推理（外太空等超常环境）
 *
 * 提醒：前端直接填 API Key 会暴露，生产环境请用你自己的后端代理。
 */

/* =============== 样式（响应式 UI） =============== */
const styles = `
:root{
  --bg:#f7f7fb; --card:#fff; --border:#e6e6ef; --muted:#6b7280; --ink:#111827; --ink-2:#374151;
}
*{box-sizing:border-box}
body{margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;}
.app{min-height:100vh; background:linear-gradient(180deg,#fafafe, #f4f6ff);}
.container{max-width:1200px; margin:0 auto; padding:16px; display:flex; gap:16px; align-items:start}
@media (max-width: 960px){ .container{flex-direction:column} }
.card{background:var(--card); border:1px solid var(--border); border-radius:16px; box-shadow:0 2px 6px rgba(0,0,0,0.04)}
.section{padding:12px 14px}
.hstack{display:flex; align-items:center; gap:8px}
.vstack{display:flex; flex-direction:column; gap:8px}
.badge{display:inline-block; font-size:12px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; background:#fafafa;}
.label{color:var(--muted); font-size:12px}
.btn{border:1px solid var(--border); background:#fff; padding:8px 12px; border-radius:10px; cursor:pointer}
.btn:hover{background:#f8f8ff}
.btn.pri{background:#111827; color:#fff; border-color:#111827}
.input, .select, .textarea{width:100%; border:1px solid var(--border); border-radius:10px; padding:8px 10px; background:#fff}
.textarea{min-height:120px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;}
.grid{display:grid; gap:12px}
.grid-2{grid-template-columns:1fr 1fr}
.grid-3{grid-template-columns:repeat(3,1fr)}
@media (max-width: 720px){ .grid-2,.grid-3{grid-template-columns:1fr}}
.title{font-weight:700; color:var(--ink)}
.muted{color:var(--muted)}
.small{font-size:12px}
.rightcol{width:380px}
@media (max-width: 960px){ .rightcol{width:100%} }
.chat{height:60vh; min-height:420px; overflow:auto; padding:12px}
@media (max-height: 760px){ .chat{height:52vh} }
.msg{max-width:75%; padding:10px 12px; border-radius:14px; border:1px solid var(--border); background:#fff; display:inline-block}
.msg.user{background:#e6f1ff}
.msg.sys{border:none; background:transparent; color:var(--muted); text-align:center; display:block}
.kv{display:flex; flex-wrap:wrap; gap:6px 10px; font-size:13px}
.kv .k{color:var(--muted)}
.toolbar{display:flex; gap:8px; flex-wrap:wrap}
.table{width:100%; border-collapse:collapse; font-size:13px}
.table th,.table td{border-bottom:1px solid var(--border); padding:8px; text-align:left}
`;

/* =============== 工具 =============== */
const nowISO = () => new Date().toISOString();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function roll(n, d) {
  return Array.from({ length: n }, () => rand(1, d));
}
function rollD20(mod = 0, adv = 0) {
  const r1 = rand(1, 20);
  const r2 = rand(1, 20);
  let base = r1;
  let picked = `${r1}`;
  if (adv > 0) { base = Math.max(r1, r2); picked = `max(${r1},${r2})`; }
  else if (adv < 0) { base = Math.min(r1, r2); picked = `min(${r1},${r2})`; }
  const total = base + mod;
  return { r1, r2, picked, mod, total };
}
function weightedChoice(items) {
  const sum = items.reduce((a, b) => a + (b.weight || 1), 0);
  let r = Math.random() * sum;
  for (const it of items) {
    r -= (it.weight || 1);
    if (r <= 0) return it;
  }
  return items[0];
}

/* =============== 世界 & 默认数据 =============== */
const DEFAULT_STATE = {
  clock: { day: 1, time: "morning" }, // morning/noon/evening/night
  location: { name: "灰烬之路·边镇", danger: 2, tags: ["集市", "冒险者据点"] },
  player: {
    name: "z",
    class: "血法师",
    hp: 12,
    ac: 12,
    skills: { arcana: 4, stealth: 1, persuasion: 0 },
    traits: ["不死特性"],
    inventory: ["仪式匕首", "绷带", "硬币x12"],
  },
  quests: [{ id: "Q001", name: "失踪的驿卒", stage: 0, notes: "最后在北侧林带被目击" }],
};

const ENCOUNTERS = {
  wilderness_day: [
    { weight: 3, type: "rumor", text: "路边石桩刻着旧王朝的符记，似乎指向林中废井。" },
    { weight: 2, type: "combat", text: "两名黑斗篷探子正埋伏在倒木后，低语着“驿卒”。" },
    { weight: 1, type: "boon", text: "一株发光的灰叶草，研磨后可在一次掷骰中 +1。" },
  ],
};

const ACTION_PATTERNS = [
  [/调查|观察|搜索|检视/, { skill: "arcana", label: "调查/学识", ability: "int" }],
  [/潜行|躲藏|无声靠近/, { skill: "stealth", label: "潜行", ability: "dex" }],
  [/交涉|说服|谈判|恳求|请求/, { skill: "persuasion", label: "说服", ability: "cha" }],
  [/施法|仪式|奥术|魔法/, { skill: "arcana", label: "奥术", ability: "int" }],
  [/攻击|砍|射击|劈砍|斩击|刺击|挥砍/, { skill: "attack", label: "攻击", ability: "str" }],
];

/* =============== 存档键 =============== */
const KEY_STATE = "dm_state_v1";
const KEY_HISTORY = "dm_history_v1";
const KEY_LOG = "dm_log_v1";

/* =============== 组件 =============== */
function Style() { return <style dangerouslySetInnerHTML={{ __html: styles }} />; }

function Section({ title, children, extra }) {
  return (
    <div className="card">
      <div className="section vstack">
        <div className="hstack" style={{ justifyContent: "space-between" }}>
          <div className="title">{title}</div>
          {extra}
        </div>
        {children}
      </div>
    </div>
  );
}

/* =============== 主组件 =============== */
export default function App() {
  // ---------- 初始加载 ----------
  const [state, setState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_STATE)) || DEFAULT_STATE; }
    catch { return DEFAULT_STATE; }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_HISTORY)) || []; }
    catch { return []; }
  });
  const [eventLog, setEventLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_LOG)) || []; }
    catch { return []; }
  });

  // 自适应玩法：pendingAction 为“澄清模式”下正在处理的行动
  const [pendingAction, setPendingAction] = useState(null);

  // —— 可选：AI 环境推理开关 & 配置 ——（演示用，Key 会在浏览器暴露）
  const [useLLM, setUseLLM] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");

  // 输入框
  const [input, setInput] = useState("");

  const chatRef = useRef(null);

  // ---------- 持久化 ----------
  useEffect(() => { localStorage.setItem(KEY_STATE, JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem(KEY_HISTORY, JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem(KEY_LOG, JSON.stringify(eventLog)); }, [eventLog]);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  // ---------- 小工具 ----------
  function pushHistory(msgs) { setHistory((h) => [...h, ...msgs]); }
  function addLog(kind, text, extra = {}) {
    const item = { t: nowISO(), kind, text, ...extra };
    setEventLog((l) => [item, ...l]);
    return item;
  }

  function stepClock(s) {
    const order = ["morning", "noon", "evening", "night"];
    const idx = (order.indexOf(s.clock.time) + 1) % order.length;
    if (idx === 0) s.clock.day += 1;
    s.clock.time = order[idx];
  }

  function maybeEncounter(s) {
    if ((s.location?.danger ?? 0) <= 0) return null;
    if (Math.random() < 0.25) {
      const e = weightedChoice(ENCOUNTERS.wilderness_day);
      return e.text;
    }
    return null;
  }

  // === 环境修正：本地规则（根据时间/地点标签/文本线索） ===
  function envEffectForSkillLocal(state, skill, text = "") {
    let dcDelta = 0;
    let adv = 0;
    const notes = [];
    const t = state.clock?.time;
    const tags = state.location?.tags || [];
    const s = String(text);

    // 时间
    if (t === "night") {
      if (skill === "stealth") { adv += 1; notes.push("夜色遮蔽：潜行优势"); }
      if (skill === "persuasion") { adv -= 1; notes.push("夜间社交不便：说服劣势"); }
      if (skill === "attack") { dcDelta += 1; notes.push("光线不佳：攻击更难"); }
    }
    if (t === "evening") {
      if (skill === "persuasion") { adv += 1; notes.push("黄昏人群活跃：社交优势"); }
    }

    // 地点标签
    if (tags.includes("集市")) {
      if (skill === "persuasion") { adv += 1; notes.push("集市讨价：说服优势"); }
      if (skill === "stealth") { adv -= 1; notes.push("人潮与摊灯：潜行劣势"); }
    }
    if (tags.includes("冒险者据点")) {
      if (skill === "arcana") { adv += 1; notes.push("有行家可请教：学识优势"); }
    }

    // 文本线索
    if (/雨|下雨|泥|泥泞|湿滑/.test(s)) {
      if (skill === "stealth") { adv += 1; notes.push("雨声掩护：潜行优势"); }
      if (skill === "attack") { adv -= 1; notes.push("地面湿滑：攻击劣势"); }
    }
    if (/嘈杂|喧哗|拥挤/.test(s)) {
      if (skill === "persuasion") { dcDelta += 1; notes.push("环境嘈杂：说服更难"); }
    }
    if (/昏暗|黑暗|无光/.test(s)) {
      if (skill === "stealth") { adv += 1; notes.push("光线昏暗：潜行优势"); }
      if (skill === "attack") { dcDelta += 1; notes.push("光线不佳：攻击更难"); }
    }

    if (adv > 1) adv = 1;
    if (adv < -1) adv = -1;

    return { dcDelta, adv, notes };
  }

  // === AI 环境修正（可选；失败自动降级为本地规则） ===
  async function aiEnvEffect(state, skill, text) {
    if (!useLLM || !apiKey) return null;

    const sys = `你是桌面RPG的DM助理。根据“世界状态/环境、技能种类、玩家行动文本”，
只输出一个JSON对象：
{"dcDelta": -2..2 的整数, "adv": -1|0|1, "notes": ["简短说明", ...]}
规则：
- dcDelta 是对基准DC的微调（+更难，-更易），范围 -2..+2。
- adv 只允许 -1（劣势）/0/1（优势）。
- 必须是纯JSON，不要多余文本。`;

    const user = {
      skill, text,
      time: state.clock?.time,
      danger: state.location?.danger,
      location: state.location?.name,
      tags: state.location?.tags || [],
      player: { skills: state.player?.skills, traits: state.player?.traits }
    };

    const ctrl = new AbortController();
    const to = setTimeout(()=>ctrl.abort(), 8000);

    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0.2,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: JSON.stringify(user) }
          ]
        }),
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const textOut = String(data.choices?.[0]?.message?.content || "").trim();
      const parsed = JSON.parse(textOut);
      let { dcDelta=0, adv=0, notes=[] } = parsed || {};
      if (!Array.isArray(notes)) notes = [];
      dcDelta = Math.max(-2, Math.min(2, parseInt(dcDelta||0,10)));
      adv = Math.max(-1, Math.min(1, parseInt(adv||0,10)));
      return { dcDelta, adv, notes };
    } catch(e) {
      return null;
    }
  }

  // === 混合环境修正：本地 + AI 合并 ===
  async function envEffectForSkillHybrid(state, skill, text = "") {
    const local = envEffectForSkillLocal(state, skill, text);
    const ai = await aiEnvEffect(state, skill, text);
    if (!ai) return local;

    let dcDelta = local.dcDelta + ai.dcDelta;
    if (dcDelta > 3) dcDelta = 3;
    if (dcDelta < -3) dcDelta = -3;

    let adv = local.adv;
    if (ai.adv === 0) adv = adv;
    else if (adv === 0) adv = ai.adv;
    else if (ai.adv === adv) adv = adv;
    else adv = 0; // 相反抵消

    const notes = [...(local.notes||[]), ...(ai.notes||[])];
    return { dcDelta, adv, notes };
  }

  // ---------- 自适应玩法：澄清问答 ----------
  const clarifySchema = [
    { key: "goal", q: "你这么做的**目标**是什么？想达到什么结果？" },
    { key: "approach", q: "你打算**怎么做**？描述一下你的方法或手段。" },
    { key: "risk", q: "你愿意承担哪些**代价或风险**？（比如耗费精力/金钱/道具）" },
  ];

  function startClarify(originalText) {
    setPendingAction({ original: originalText, answers: {}, index: 0 });
    pushHistory([
      { role: "user", content: originalText, t: nowISO() },
      { role: "assistant", content: "这个行动超出了现有规则，我需要确认细节。", t: nowISO() },
      { role: "assistant", content: clarifySchema[0].q, t: nowISO() },
    ]);
  }

  async function continueClarify(answerText) {
    setPendingAction((p) => {
      const next = { ...p, answers: { ...p.answers, [clarifySchema[p.index].key]: answerText }, index: p.index + 1 };
      if (next.index < clarifySchema.length) {
        pushHistory([
          { role: "user", content: answerText, t: nowISO() },
          { role: "assistant", content: clarifySchema[next.index].q, t: nowISO() },
        ]);
        return next;
      }
      // 回答完毕：做裁定（只在这里推进时间）
      pushHistory([{ role: "user", content: answerText, t: nowISO() }]);
      (async () => { await resolveClarifiedAction(next); })();
      return null;
    });
  }

  async function resolveClarifiedAction(payload) {
    const { goal = "", approach = "", risk = "" } = payload.answers;
    const s = JSON.parse(JSON.stringify(state));

    // 澄清结束时才推进时间（只推进一次）
    stepClock(s);

    const text = `[澄清完成] 你的目标是「${goal}」，方法是「${approach}」，可接受的代价/风险是「${risk || "（未声明）"}」。`;
    pushHistory([{ role: "system", content: text, t: nowISO() }]);

    let skill = null, label = "常规", mod = 0;
    if (/仪式|奥术|符文|研究|准备|工具|学识/.test(approach)) { skill = "arcana"; label = "奥术/学识"; }
    else if (/潜行|躲避|无声|隐秘|跟踪|埋伏/.test(approach)) { skill = "stealth"; label = "潜行"; }
    else if (/交流|请求|说服|谈判|讨价|求助|演说/.test(approach)) { skill = "persuasion"; label = "说服"; }

    if (skill) mod = Number(s.player?.skills?.[skill] || 0);

    const dcBase = 10 + (s.location?.danger ?? 0);
    const env = skill ? await envEffectForSkillHybrid(s, skill, approach) : { dcDelta: 0, adv: 0, notes: [] };
    const dc = dcBase + (risk ? 0 : 1) + (env?.dcDelta || 0);
    const roll = skill ? rollD20(mod, env?.adv || 0) : { total: 11, mod: 0 };
    const ok = roll.total >= dc;

    const envNote = env && env.notes && env.notes.length ? `（环境：${env.notes.join("，")}）` : "";
    let desc;
    if (skill) {
      desc = ok
        ? `采用【${label}】检定 成功（DC${dc}，结果${roll.total}）${envNote}。${risk ? "你承担了风险，难度未上调。" : "你未声明风险，难度略有上调。"}`
        : `采用【${label}】检定 失败（DC${dc}，结果${roll.total}）${envNote}。你付出代价但得到线索。`;
    } else {
      desc = ok
        ? `在没有明确技能的情况下，你的小心尝试仍然奏效（常识性行动）。`
        : `尝试未果，局势暂时没有改善。`;
    }

    // 这里只触发一次遭遇
    const enc = maybeEncounter(s);
    if (enc) {
      pushHistory([{ role: "system", content: `[遭遇] ${enc}`, t: nowISO() }]);
      addLog("encounter", enc);
    }

    pushHistory([{ role: "assistant", content: desc, t: nowISO() }]);
    addLog(ok ? "success" : "failure", `澄清行动：（${label}）${ok ? "成功" : "失败"} — 目标：${goal}`);

    setState(s);
  }

  // ---------- 常规判定 ----------
  function parseAction(text) {
    for (const [re, tag] of ACTION_PATTERNS) { if (re.test(text)) return tag; }
    return null;
  }

  async function handleUserInput(raw) {
    const userText = raw.trim();
    if (!userText) return;

    // 如果处于澄清模式，就把用户输入当成答案
    if (pendingAction) {
      await continueClarify(userText);
      setInput("");
      return;
    }

    // 先记录玩家输入，但暂不推进时间
    const s = JSON.parse(JSON.stringify(state));
    const messages = [{ role: "user", content: userText, t: nowISO() }];

    // 尝试解析行动
    const tag = parseAction(userText);
    if (!tag) {
      // 不匹配：进入澄清模式（这里不推进时间、不触发遭遇）
      setState(s);
      setInput("");
      startClarify(userText);
      return;
    }

    // 命中常规行动 → 这时才推进时间并可能遭遇
    stepClock(s);
    const enc = maybeEncounter(s);
    if (enc) {
      messages.push({ role: "system", content: `[遭遇] ${enc}`, t: nowISO() });
      addLog("encounter", enc);
    }

    const mod = Number(s.player?.skills?.[tag.skill] || 0);
    const env = await envEffectForSkillHybrid(s, tag.skill, userText);
    const dc = 10 + (s.location?.danger ?? 0) + (env?.dcDelta || 0);
    const r = rollD20(mod, env?.adv || 0);
    const ok = r.total >= dc;

    const envNote = env?.notes?.length ? `（环境：${env.notes.join("，")}）` : "";
    const desc = ok
      ? `你的【${tag.label}】检定成功（DC${dc}，结果${r.total}）${envNote}。局势向你有利推进。`
      : `你的【${tag.label}】检定失败（DC${dc}，结果${r.total}）${envNote}。局势变复杂，你付出了一点代价。`;

    messages.push({ role: "assistant", content: desc, t: nowISO() });
    addLog(ok ? "success" : "failure", `常规行动：（${tag.label}）${ok ? "成功" : "失败"}`);

    setState(s);
    pushHistory(messages);
    setInput("");
  }

  // ---------- 背包 & 任务 ----------
  function addItem(name) {
    const s = JSON.parse(JSON.stringify(state));
    const nm = String(name || "").trim();
    if (!nm) return;
    s.player.inventory.push(nm);
    setState(s);
    addLog("item_gain", `获得物品：${nm}`);
  }
  function removeItem(idx) {
    const s = JSON.parse(JSON.stringify(state));
    if (idx < 0 || idx >= s.player.inventory.length) return;
    const [it] = s.player.inventory.splice(idx, 1);
    setState(s);
    addLog("item_use", `移除/使用物品：${it}`);
  }
  function addQuest(name) {
    const s = JSON.parse(JSON.stringify(state));
    const nm = String(name || "").trim();
    if (!nm) return;
    const q = { id: `Q${String(Date.now()).slice(-5)}`, name: nm, stage: 0, notes: "" };
    s.quests.push(q);
    setState(s);
    addLog("quest_add", `接受新任务：${nm}`);
  }
  function advanceQuest(i, delta = 1) {
    const s = JSON.parse(JSON.stringify(state));
    if (i < 0 || i >= s.quests.length) return;
    s.quests[i].stage += delta;
    setState(s);
    addLog("quest_adv", `任务推进：${s.quests[i].name} → 阶段 ${s.quests[i].stage}`);
  }

  // ---------- 掷骰面板 ----------
  function DicePanel() {
    const [dn, setDn] = useState(20);
    const [cnt, setCnt] = useState(1);
    const [adv, setAdv] = useState(0);
    const [mod, setMod] = useState(0);
    const [res, setRes] = useState(null);

    return (
      <div className="vstack">
        <div className="toolbar">
          {[4, 6, 8, 10, 12, 20, 100].map((d) => (
            <button key={d} className={`btn ${dn === d ? "pri" : ""}`} onClick={() => setDn(d)}>d{d}</button>
          ))}
        </div>
        <div className="grid grid-3">
          <label className="label">数量
            <input className="input" type="number" value={cnt} onChange={(e) => setCnt(Math.max(1, Number(e.target.value)||1))} />
          </label>
          <label className="label">优势/劣势
            <select className="select" value={adv} onChange={(e) => setAdv(Number(e.target.value))}>
              <option value={0}>普通</option>
              <option value={1}>优势</option>
              <option value={-1}>劣势</option>
            </select>
          </label>
          <label className="label">加值
            <input className="input" type="number" value={mod} onChange={(e) => setMod(Number(e.target.value)||0)} />
          </label>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => {
            if (dn === 20 && cnt === 1) {
              const r = rollD20(mod, adv);
              setRes({ kind: "d20", r });
              addLog("roll", `d20 掷骰：r1=${r.r1}, r2=${r.r2}, 选=${r.picked}, 加值=${r.mod}, 总计=${r.total}`);
            } else {
              const arr = roll(cnt, dn);
              const total = arr.reduce((a,b)=>a+b,0) + mod;
              setRes({ kind:`d${dn}`, arr, mod, total });
              addLog("roll", `d${dn}×${cnt} 掷骰：${arr.join(",")} + ${mod} = ${total}`);
            }
          }}>掷！</button>
        </div>
        {res && (
          <div className="small muted">
            {res.kind === "d20"
              ? <>r1={res.r.r1}, r2={res.r.r2}, 选={res.r.picked}, 加值={res.r.mod}, <b>总计={res.r.total}</b></>
              : <>结果=[{res.arr.join(", ")}]，加值={res.mod}，<b>总计={res.total}</b></>}
          </div>
        )}
      </div>
    );
  }

  // ---------- 右侧面板 ----------
  function StatePanel() {
    const p = state.player;
    return (
      <div className="vstack small">
        <div className="kv">
          <span className="k">时间</span><span>第{state.clock.day}日 {state.clock.time}</span>
          <span className="k">地点</span><span>{state.location.name}</span>
          <span className="k">危险度</span><span>{state.location.danger}</span>
        </div>
        <div className="kv">
          <span className="k">角色</span><span>{p.name}（{p.class}）</span>
          <span className="k">HP</span><span>{p.hp}</span>
          <span className="k">AC</span><span>{p.ac}</span>
        </div>
        <div className="kv">
          <span className="k">技能</span>
          {Object.entries(p.skills).map(([k,v]) => <span key={k}>{k}:{String(v)}</span>)}
        </div>
        <div className="kv">
          <span className="k">特性</span>
          {p.traits.map((t,i)=><span key={i} className="badge">{t}</span>)}
        </div>
      </div>
    );
  }

  function InventoryPanel() {
    const [newItem, setNewItem] = useState("");
    return (
      <div className="vstack small">
        <div className="toolbar">
          <input className="input" placeholder="物品名…" value={newItem} onChange={(e)=>setNewItem(e.target.value)} />
          <button className="btn" onClick={()=>{ if(newItem.trim()){ addItem(newItem.trim()); setNewItem(""); }}}>添加</button>
        </div>
        <table className="table">
          <thead><tr><th>物品</th><th style={{width:80}}>操作</th></tr></thead>
          <tbody>
            {state.player.inventory.map((it, idx)=>(
              <tr key={idx}>
                <td>{it}</td>
                <td><button className="btn" onClick={()=>removeItem(idx)}>移除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function QuestPanel() {
    const [qName, setQName] = useState("");
    return (
      <div className="vstack small">
        <div className="toolbar">
          <input className="input" placeholder="新任务名…" value={qName} onChange={(e)=>setQName(e.target.value)} />
          <button className="btn" onClick={()=>{ if(qName.trim()){ addQuest(qName.trim()); setQName(""); }}}>添加任务</button>
        </div>
        <table className="table">
          <thead><tr><th>任务</th><th>阶段</th><th style={{width:140}}>操作</th></tr></thead>
          <tbody>
            {state.quests.map((q,i)=>(
              <tr key={q.id}>
                <td>{q.name}</td>
                <td>{q.stage}</td>
                <td className="hstack">
                  <button className="btn" onClick={()=>advanceQuest(i, +1)}>+1</button>
                  <button className="btn" onClick={()=>advanceQuest(i, -1)}>-1</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function LogsPanel() {
    function exportAll() {
      const blob = new Blob([JSON.stringify({ state, history, eventLog }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `dm_save_${Date.now()}.json`; a.click();
    }
    function resetWorld() {
      if (!confirm("重置世界与日志？此操作不可恢复。")) return;
      setState(DEFAULT_STATE);
      setHistory([]);
      setEventLog([]);
    }
    function importAll(file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          if (data.state) setState(data.state);
          if (data.history) setHistory(data.history);
          if (data.eventLog) setEventLog(data.eventLog);
          alert("导入完成");
        } catch (e) {
          alert("导入失败：JSON 格式不正确");
        }
      };
      reader.readAsText(file);
    }

    return (
      <div className="vstack small">
        <div className="toolbar">
          <button className="btn" onClick={exportAll}>导出存档(JSON)</button>
          <label className="btn">
            导入存档
            <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => {
              const f = e.target.files?.[0]; if (f) importAll(f);
            }} />
          </label>
          <button className="btn" onClick={resetWorld}>重置世界</button>
          <button className="btn" onClick={()=>{
            if (!confirm("清空事件日志与聊天记录？此操作不可恢复。")) return;
            setEventLog([]); setHistory([]);
          }}>清空日志</button>
        </div>

        <div className="label">事件日志（最新在前）</div>
        <table className="table">
          <thead><tr><th>时间</th><th>类型</th><th>详情</th></tr></thead>
          <tbody>
            {eventLog.map((e, i)=>(
              <tr key={i}>
                <td className="small muted">{new Date(e.t).toLocaleString()}</td>
                <td>{e.kind}</td>
                <td>{e.text}</td>
              </tr>
            ))}
            {!eventLog.length && <tr><td colSpan={3} className="muted small">暂无事件</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  function AISettings() {
    return (
      <div className="vstack small">
        <label className="label">
          启用 AI 环境推理
          <input type="checkbox" checked={useLLM} onChange={e=>setUseLLM(e.target.checked)} style={{marginLeft:8}}/>
        </label>
        <label className="label">Base URL
          <input className="input" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1"/>
        </label>
        <label className="label">Model
          <input className="input" value={model} onChange={e=>setModel(e.target.value)} placeholder="gpt-4o-mini"/>
        </label>
        <label className="label">API Key（仅演示用，浏览器中会暴露）
          <input className="input" type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-..."/>
        </label>
        <div className="muted small">建议生产环境使用你自己的后端代理保护 Key。</div>
      </div>
    );
  }

  // ---------- 左侧：聊天 ----------
  function Chat() {
    return (
      <Section
        title="DM 对话"
        extra={
          <div className="hstack small muted">
            <span>地点：{state.location.name}</span>
            <span className="badge">第{state.clock.day}日 {state.clock.time}</span>
          </div>
        }
      >
        <div className="card" style={{borderRadius:12}}>
          <div className="chat" ref={chatRef}>
            {history.length === 0 && (
              <div className="msg sys">提示：输入你的行动（如“在集市调查失踪的驿卒线索”）。无法识别的行动将触发“澄清模式”。</div>
            )}
            <div className="vstack">
              {history.map((m, i) => (
                <div key={i} style={{ textAlign: m.role === "user" ? "right" : m.role === "system" ? "center" : "left" }}>
                  <div className={`msg ${m.role === "user" ? "user" : ""} ${m.role === "system" ? "sys" : ""}`}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="section vstack">
            {pendingAction && (
              <div className="small muted">
                澄清模式进行中（{pendingAction.index}/{clarifySchema.length}）… 回答完问题后会立刻结算一次行动与时间推进。
              </div>
            )}
            <div className="hstack">
              <input
                className="input"
                placeholder={pendingAction ? "回答 DM 的问题…" : "输入你的行动…（回车发送）"}
                value={input}
                onChange={(e)=>setInput(e.target.value)}
                onKeyDown={async (e)=>{ if (e.key === "Enter") { await handleUserInput(input); } }}
              />
              <button className="btn pri" onClick={()=>handleUserInput(input)}>发送</button>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  // ---------- 右侧：状态/掷骰/背包/任务/日志/AI ----------
  function Right() {
    const [tab, setTab] = useState("state");
    return (
      <div className="rightcol vstack">
        <Section
          title="世界状态"
          extra={
            <div className="toolbar small">
              <button className={`btn ${tab==="state"?"pri":""}`} onClick={()=>setTab("state")}>概览</button>
              <button className={`btn ${tab==="dice"?"pri":""}`} onClick={()=>setTab("dice")}>掷骰</button>
              <button className={`btn ${tab==="inv"?"pri":""}`} onClick={()=>setTab("inv")}>背包</button>
              <button className={`btn ${tab==="quest"?"pri":""}`} onClick={()=>setTab("quest")}>任务</button>
              <button className={`btn ${tab==="log"?"pri":""}`} onClick={()=>setTab("log")}>日志</button>
              <button className={`btn ${tab==="ai"?"pri":""}`} onClick={()=>setTab("ai")}>AI 设置</button>
            </div>
          }
        >
          {tab==="state" && <StatePanel/>}
          {tab==="dice" && <DicePanel/>}
          {tab==="inv" && <InventoryPanel/>}
          {tab==="quest" && <QuestPanel/>}
          {tab==="log" && <LogsPanel/>}
          {tab==="ai" && <AISettings/>}
        </Section>
      </div>
    );
  }

  return (
    <div className="app">
      <Style/>
      <div className="container">
        <div style={{flex:1}}><Chat/></div>
        <Right/>
      </div>
      <div className="section muted small" style={{textAlign:"center"}}>
        DM AI Web — 自适应玩法 / 本地+AI 环境修正 / 本地存档 / 无后端（AI模式建议接你自己的代理）。
      </div>
    </div>
  );
}
