import React, { useEffect, useRef, useState, useLayoutEffect } from "react";

/**
 * DM AI — 终极单文件版
 * - 核心：时间推进 / 判定 / 掷骰 / 遭遇 / 背包 / 任务 / 日志
 * - 自适应：未命中规则进入“澄清模式”，只推进一次时间
 * - 环境修正：本地规则 + 可选 AI 推理（外太空等超常）
 * - 记录：聊天记录、事件日志、本地存档、导入/导出
 * - UI 稳定：同步滚底、IME 安全输入、textarea 自动增高
 * - ✅ 新增：初始设定向导（角色卡 + 战役设定），可随时重开修改
 *
 * 提醒：前端直填 API Key 会暴露，生产请用自己的后端代理。
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
.btn.ghost{background:transparent}
.input, .select, .textarea{width:100%; border:1px solid var(--border); border-radius:10px; padding:8px 10px; background:#fff}
.textarea{min-height:84px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;}
.grid{display:grid; gap:12px}
.grid-2{grid-template-columns:1fr 1fr}
.grid-3{grid-template-columns:repeat(3,1fr)}
@media (max-width: 720px){ .grid-2,.grid-3{grid-template-columns:1fr}}
.title{font-weight:700; color:var(--ink)}
.muted{color:var(--muted)}
.small{font-size:12px}
.rightcol{width:390px}
@media (max-width: 960px){ .rightcol{width:100%} }
.chat{
  height:60vh; min-height:420px; overflow:auto; padding:12px;
  overscroll-behavior: contain;
  overflow-anchor: none;
  -webkit-overflow-scrolling: touch;
}
@media (max-height: 760px){ .chat{height:52vh} }
.msg{max-width:75%; padding:10px 12px; border-radius:14px; border:1px solid var(--border); background:#fff; display:inline-block}
.msg.user{background:#e6f1ff}
.msg.sys{border:none; background:transparent; color:var(--muted); text-align:center; display:block}
.kv{display:flex; flex-wrap:wrap; gap:6px 10px; font-size:13px}
.kv .k{color:var(--muted)}
.toolbar{display:flex; gap:8px; flex-wrap:wrap}
.table{width:100%; border-collapse:collapse; font-size:13px}
.table th,.table td{border-bottom:1px solid var(--border); padding:8px; text-align:left}
.modal{
  position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(17,24,39,0.45); z-index:50; padding:16px;
}
.modal .dialog{
  width:min(920px, 100%); max-height:90vh; overflow:auto;
  background:var(--card); border:1px solid var(--border); border-radius:16px; padding:16px;
}
`;

/* =============== 工具 =============== */
const nowISO = () => new Date().toISOString();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function roll(n, d) { return Array.from({ length: n }, () => rand(1, d)); }
function rollD20(mod = 0, adv = 0) {
  const r1 = rand(1, 20), r2 = rand(1, 20);
  let base = r1, picked = `${r1}`;
  if (adv > 0) { base = Math.max(r1, r2); picked = `max(${r1},${r2})`; }
  else if (adv < 0) { base = Math.min(r1, r2); picked = `min(${r1},${r2})`; }
  const total = base + mod;
  return { r1, r2, picked, mod, total };
}
function weightedChoice(items) {
  const sum = items.reduce((a, b) => a + (b.weight || 1), 0);
  let r = Math.random() * sum;
  for (const it of items) { r -= (it.weight || 1); if (r <= 0) return it; }
  return items[0];
}

/* =============== 默认世界 =============== */
const DEFAULT_STATE = {
  meta: { setupDone: false, campaign: { title: "灰烬之路", theme: ["调查","低魔"], rules: "" } },
  clock: { day: 1, time: "morning" }, // morning/noon/evening/night
  location: { name: "灰烬之路·边镇", danger: 2, tags: ["集市", "冒险者据点"] },
  player: {
    name: "z", class: "血法师", hp: 12, ac: 12,
    skills: { arcana: 4, stealth: 1, persuasion: 0 },
    traits: ["不死特性"], inventory: ["仪式匕首", "绷带", "硬币x12"],
  },
  weather: "clear",
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
          <div className="title">{title}</div>{extra}
        </div>{children}
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

  // 自适应玩法
  const [pendingAction, setPendingAction] = useState(null);

  // AI 环境推理配置（演示用）
  const [useLLM, setUseLLM] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");

  // 输入
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // 设定向导
  const [showSetup, setShowSetup] = useState(!state?.meta?.setupDone);
  const [setupDraft, setSetupDraft] = useState(() => deriveSetupFromState(state));

  const chatRef = useRef(null);
  const lastLenRef = useRef(0);

  // ---------- 持久化 ----------
  useEffect(() => { localStorage.setItem(KEY_STATE, JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem(KEY_HISTORY, JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem(KEY_LOG, JSON.stringify(eventLog)); }, [eventLog]);

  // 同步滚底，仅在新增消息时
  useLayoutEffect(() => {
    const el = chatRef.current; if (!el) return;
    if (history.length > lastLenRef.current) {
      el.scrollTop = el.scrollHeight;
      lastLenRef.current = history.length;
    }
  }, [history.length]);

  // ---------- 小工具 ----------
  function pushHistory(msgs) {
    setHistory(h => [
      ...h,
      ...msgs.map(m => ({ id: m.id || (Date.now()+"-"+Math.random().toString(16).slice(2)), ...m }))
    ]);
  }
  function addLog(kind, text, extra = {}) {
    const item = { t: nowISO(), kind, text, ...extra };
    setEventLog(l => [item, ...l]);
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

  // === 环境修正：本地规则 ===
  function envEffectForSkillLocal(st, skill, text = "") {
    let dcDelta = 0, adv = 0; const notes = [];
    const t = st.clock?.time; const tags = st.location?.tags || []; const s = String(text);
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
      if (skill === "stealth")) { adv -= 1; notes.push("人潮与摊灯：潜行劣势"); }
    }
    if (tags.includes("冒险者据点")) {
      if (skill === "arcana") { adv += 1; notes.push("有行家可请教：学识优势"); }
    }
    // 天气（简单示例）
    if (st.weather === "rain") {
      if (skill === "stealth") { adv += 1; notes.push("雨声掩护：潜行优势"); }
      if (skill === "attack") { adv -= 1; notes.push("湿滑：攻击劣势"); }
      if (skill === "persuasion") { dcDelta += 1; notes.push("阴雨心情差：说服更难"); }
    }
    // 文本线索
    if (/嘈杂|喧哗|拥挤/.test(s)) { if (skill === "persuasion") { dcDelta += 1; notes.push("环境嘈杂：说服更难"); } }
    if (/昏暗|黑暗|无光/.test(s)) {
      if (skill === "stealth") { adv += 1; notes.push("光线昏暗：潜行优势"); }
      if (skill === "attack") { dcDelta += 1; notes.push("光线不佳：攻击更难"); }
    }
    if (adv > 1) adv = 1; if (adv < -1) adv = -1;
    return { dcDelta, adv, notes };
  }

  // === AI 环境修正（可选） ===
  async function aiEnvEffect(st, skill, text) {
    if (!useLLM || !apiKey) return null;
    const sys = `你是桌面RPG的DM助理。根据“世界状态/环境、技能、玩家行动文本”，只输出JSON：
{"dcDelta": -2..2, "adv": -1|0|1, "notes": ["简短说明", ...]}
+ 表示更难。必须是纯JSON，不要多余文本。`;
    const user = {
      skill, text,
      time: st.clock?.time, danger: st.location?.danger,
      location: st.location?.name, tags: st.location?.tags || [],
      weather: st.weather, player: { skills: st.player?.skills, traits: st.player?.traits },
      campaign: st.meta?.campaign
    };
    const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort(), 8000);
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature:0.2,
          messages:[ {role:"system", content:sys}, {role:"user", content:JSON.stringify(user)} ]
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
    } catch { return null; }
  }

  // === 混合：本地 + AI 合并 ===
  async function envEffectForSkillHybrid(st, skill, text="") {
    const local = envEffectForSkillLocal(st, skill, text);
    const ai = await aiEnvEffect(st, skill, text);
    if (!ai) return local;
    let dcDelta = local.dcDelta + ai.dcDelta; dcDelta = Math.max(-3, Math.min(3, dcDelta));
    let adv = local.adv;
    if (ai.adv === 0) adv = adv;
    else if (adv === 0) adv = ai.adv;
    else if (ai.adv === adv) adv = adv;
    else adv = 0;
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
    setPendingAction(p => {
      const next = { ...p, answers: { ...p.answers, [clarifySchema[p.index].key]: answerText }, index: p.index + 1 };
      if (next.index < clarifySchema.length) {
        pushHistory([{ role: "user", content: answerText, t: nowISO() }, { role: "assistant", content: clarifySchema[next.index].q, t: nowISO() }]);
        return next;
      }
      pushHistory([{ role: "user", content: answerText, t: nowISO() }]);
      (async () => { await resolveClarifiedAction(next); })();
      return null;
    });
  }
  async function resolveClarifiedAction(payload) {
    const { goal = "", approach = "", risk = "" } = payload.answers;
    const s = JSON.parse(JSON.stringify(state));
    stepClock(s); // 澄清结束后推进一次
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

    const envNote = env?.notes?.length ? `（环境：${env.notes.join("，")}）` : "";
    let desc;
    if (skill) {
      desc = ok
        ? `采用【${label}】检定 成功（DC${dc}，结果${roll.total}）${envNote}。${risk ? "你承担了风险，难度未上调。" : "你未声明风险，难度略有上调。"}`
        : `采用【${label}】检定 失败（DC${dc}，结果${roll.total}）${envNote}。你付出代价但得到线索。`;
    } else {
      desc = ok ? `在没有明确技能的情况下，你的小心尝试仍然奏效（常识性行动）。`
                : `尝试未果，局势暂时没有改善。`;
    }

    const enc = maybeEncounter(s);
    if (enc) { pushHistory([{ role: "system", content: `[遭遇] ${enc}`, t: nowISO() }]); addLog("encounter", enc); }

    pushHistory([{ role: "assistant", content: desc, t: nowISO() }]);
    addLog(ok ? "success" : "failure", `澄清行动：（${label}）${ok ? "成功" : "失败"} — 目标：${goal}`);

    setState(s);
  }

  // ---------- 常规判定 ----------
  function parseAction(text) { for (const [re, tag] of ACTION_PATTERNS) { if (re.test(text)) return tag; } return null; }

  async function handleUserInput(raw) {
    const userText = raw.trim(); if (!userText) return;
    if (pendingAction) { await continueClarify(userText); setInput(""); return; }

    const s = JSON.parse(JSON.stringify(state));
    const messages = [{ role: "user", content: userText, t: nowISO() }];

    const tag = parseAction(userText);
    if (!tag) { setState(s); setInput(""); startClarify(userText); return; }

    stepClock(s);
    const enc = maybeEncounter(s);
    if (enc) { messages.push({ role: "system", content: `[遭遇] ${enc}`, t: nowISO() }); addLog("encounter", enc); }

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

  // ---------- 发送包装，防重复 ----------
  async function safeSend() {
    const text = input;
    if (sending) return;
    if (!text || !text.trim()) return;
    try { setSending(true); await handleUserInput(text); setInput(""); }
    finally { setSending(false); }
  }

  // ---------- 背包 & 任务 ----------
  function addItem(name) {
    const s = JSON.parse(JSON.stringify(state));
    const nm = String(name || "").trim(); if (!nm) return;
    s.player.inventory.push(nm); setState(s); addLog("item_gain", `获得物品：${nm}`);
  }
  function removeItem(idx) {
    const s = JSON.parse(JSON.stringify(state));
    if (idx < 0 || idx >= s.player.inventory.length) return;
    const [it] = s.player.inventory.splice(idx, 1);
    setState(s); addLog("item_use", `移除/使用物品：${it}`);
  }
  function addQuest(name) {
    const s = JSON.parse(JSON.stringify(state));
    const nm = String(name || "").trim(); if (!nm) return;
    const q = { id: `Q${String(Date.now()).slice(-5)}`, name: nm, stage: 0, notes: "" };
    s.quests.push(q); setState(s); addLog("quest_add", `接受新任务：${nm}`);
  }
  function advanceQuest(i, delta = 1) {
    const s = JSON.parse(JSON.stringify(state));
    if (i < 0 || i >= s.quests.length) return;
    s.quests[i].stage += delta; setState(s);
    addLog("quest_adv", `任务推进：${s.quests[i].name} → 阶段 ${s.quests[i].stage}`);
  }

  // ---------- 设定向导 ----------
  function deriveSetupFromState(st) {
    return {
      campaignTitle: st?.meta?.campaign?.title || "灰烬之路",
      campaignTheme: (st?.meta?.campaign?.theme || ["调查"]).join("、"),
      campaignRules: st?.meta?.campaign?.rules || "",
      time: st?.clock?.time || "morning",
      day: st?.clock?.day || 1,
      locationName: st?.location?.name || "起始城镇",
      danger: st?.location?.danger ?? 1,
      tags: (st?.location?.tags || []).join("、"),
      weather: st?.weather || "clear",
      playerName: st?.player?.name || "z",
      playerClass: st?.player?.class || "新手冒险者",
      hp: st?.player?.hp ?? 10,
      ac: st?.player?.ac ?? 10,
      arcana: st?.player?.skills?.arcana ?? 0,
      stealth: st?.player?.skills?.stealth ?? 0,
      persuasion: st?.player?.skills?.persuasion ?? 0,
      traits: (st?.player?.traits || []).join("、"),
      inventory: (st?.player?.inventory || []).join("、"),
    };
  }

  function applySetup() {
    const d = setupDraft;
    const newState = {
      ...state,
      meta: { setupDone: true, campaign: {
        title: d.campaignTitle.trim() || "未命名战役",
        theme: splitList(d.campaignTheme),
        rules: d.campaignRules || ""
      }},
      clock: { day: clampInt(d.day, 1, 9999), time: d.time },
      location: { name: d.locationName.trim() || "起始地点", danger: clampInt(d.danger, 0, 10), tags: splitList(d.tags) },
      weather: d.weather,
      player: {
        name: d.playerName.trim() || "玩家",
        class: d.playerClass.trim() || "冒险者",
        hp: clampInt(d.hp, 1, 999),
        ac: clampInt(d.ac, 1, 30),
        skills: {
          arcana: clampInt(d.arcana, -5, 10),
          stealth: clampInt(d.stealth, -5, 10),
          persuasion: clampInt(d.persuasion, -5, 10),
        },
        traits: splitList(d.traits),
        inventory: splitList(d.inventory),
      },
      quests: state.quests?.length ? state.quests : [],
    };
    setState(newState);
    setShowSetup(false);
    pushHistory([{ role:"system", content:`[战役就绪] 《${newState.meta.campaign.title}》 — 主题：${newState.meta.campaign.theme.join("、")}`, t: nowISO() }]);
    addLog("setup", `初始化完成：地点 ${newState.location.name}，危险度 ${newState.location.danger}，天气 ${newState.weather}`);
  }

  function splitList(s) {
    return String(s||"").split(/[,，、\s]+/).map(x=>x.trim()).filter(Boolean);
  }
  function clampInt(v, min, max) {
    const n = parseInt(v,10); if (isNaN(n)) return min; return Math.max(min, Math.min(max, n));
  }

  function SetupWizard() {
    return (
      <div className="modal">
        <div className="dialog vstack">
          <div className="hstack" style={{justifyContent:"space-between"}}>
            <div className="title">战役设定向导</div>
            <button className="btn ghost" onClick={()=>setShowSetup(false)}>先跳过</button>
          </div>

          <div className="grid grid-2">
            <div className="vstack">
              <div className="label">战役标题</div>
              <input className="input" value={setupDraft.campaignTitle} onChange={e=>setSetupDraft({...setupDraft, campaignTitle:e.target.value})}/>
            </div>
            <div className="vstack">
              <div className="label">战役主题（用、或逗号分隔）</div>
              <input className="input" value={setupDraft.campaignTheme} onChange={e=>setSetupDraft({...setupDraft, campaignTheme:e.target.value})}/>
            </div>
            <div className="vstack grid-2" style={{gridColumn:"1 / -1"}}>
              <div>
                <div className="label">起始时间</div>
                <select className="select" value={setupDraft.time} onChange={e=>setSetupDraft({...setupDraft, time:e.target.value})}>
                  <option value="morning">morning</option><option value="noon">noon</option>
                  <option value="evening">evening</option><option value="night">night</option>
                </select>
              </div>
              <div>
                <div className="label">起始日（第几天）</div>
                <input className="input" type="number" value={setupDraft.day} onChange={e=>setSetupDraft({...setupDraft, day:e.target.value})}/>
              </div>
            </div>

            <div className="vstack">
              <div className="label">起始地点</div>
              <input className="input" value={setupDraft.locationName} onChange={e=>setSetupDraft({...setupDraft, locationName:e.target.value})}/>
            </div>
            <div className="vstack">
              <div className="label">地点标签（用、或逗号分隔）</div>
              <input className="input" value={setupDraft.tags} onChange={e=>setSetupDraft({...setupDraft, tags:e.target.value})}/>
            </div>

            <div className="vstack">
              <div className="label">危险度（0-10）</div>
              <input className="input" type="number" value={setupDraft.danger} onChange={e=>setSetupDraft({...setupDraft, danger:e.target.value})}/>
            </div>
            <div className="vstack">
              <div className="label">天气</div>
              <select className="select" value={setupDraft.weather} onChange={e=>setSetupDraft({...setupDraft, weather:e.target.value})}>
                <option value="clear">晴</option><option value="rain">雨</option>
                <option value="fog">雾</option><option value="storm">风暴</option>
              </select>
            </div>

            <div className="vstack">
              <div className="label">角色名</div>
              <input className="input" value={setupDraft.playerName} onChange={e=>setSetupDraft({...setupDraft, playerName:e.target.value})}/>
            </div>
            <div className="vstack">
              <div className="label">职业/背景</div>
              <input className="input" value={setupDraft.playerClass} onChange={e=>setSetupDraft({...setupDraft, playerClass:e.target.value})}/>
            </div>

            <div className="vstack grid-3" style={{gridColumn:"1 / -1"}}>
              <label className="label">HP<input className="input" type="number" value={setupDraft.hp} onChange={e=>setSetupDraft({...setupDraft, hp:e.target.value})}/></label>
              <label className="label">AC<input className="input" type="number" value={setupDraft.ac} onChange={e=>setSetupDraft({...setupDraft, ac:e.target.value})}/></label>
              <div />
            </div>

            <div className="vstack grid-3" style={{gridColumn:"1 / -1"}}>
              <label className="label">学识(arcana)
                <input className="input" type="number" value={setupDraft.arcana} onChange={e=>setSetupDraft({...setupDraft, arcana:e.target.value})}/>
              </label>
              <label className="label">潜行(stealth)
                <input className="input" type="number" value={setupDraft.stealth} onChange={e=>setSetupDraft({...setupDraft, stealth:e.target.value})}/>
              </label>
              <label className="label">说服(persuasion)
                <input className="input" type="number" value={setupDraft.persuasion} onChange={e=>setSetupDraft({...setupDraft, persuasion:e.target.value})}/>
              </label>
            </div>

            <div className="vstack">
              <div className="label">特性（用、或逗号分隔）</div>
              <input className="input" value={setupDraft.traits} onChange={e=>setSetupDraft({...setupDraft, traits:e.target.value})}/>
            </div>
            <div className="vstack">
              <div className="label">初始物品（用、或逗号分隔）</div>
              <input className="input" value={setupDraft.inventory} onChange={e=>setSetupDraft({...setupDraft, inventory:e.target.value})}/>
            </div>

            <div className="vstack" style={{gridColumn:"1 / -1"}}>
              <div className="label">自订规则/备注（可空）</div>
              <textarea className="textarea" value={setupDraft.campaignRules} onChange={e=>setSetupDraft({...setupDraft, campaignRules:e.target.value})}/>
            </div>
          </div>

          <div className="hstack" style={{justifyContent:"flex-end"}}>
            <button className="btn" onClick={()=>{ setSetupDraft(deriveSetupFromState(DEFAULT_STATE)); }}>恢复默认</button>
            <button className="btn pri" onClick={applySetup}>完成并开始</button>
          </div>
        </div>
      </div>
    );
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
          {[4,6,8,10,12,20,100].map(d => (
            <button key={d} className={`btn ${dn===d?"pri":""}`} onClick={()=>setDn(d)}>d{d}</button>
          ))}
        </div>
        <div className="grid grid-3">
          <label className="label">数量
            <input className="input" type="number" value={cnt} onChange={e=>setCnt(Math.max(1, Number(e.target.value)||1))}/>
          </label>
          <label className="label">优势/劣势
            <select className="select" value={adv} onChange={e=>setAdv(Number(e.target.value))}>
              <option value={0}>普通</option><option value={1}>优势</option><option value={-1}>劣势</option>
            </select>
          </label>
          <label className="label">加值
            <input className="input" type="number" value={mod} onChange={e=>setMod(Number(e.target.value)||0)}/>
          </label>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={()=>{
            if (dn===20 && cnt===1) {
              const r = rollD20(mod, adv); setRes({kind:"d20", r});
              addLog("roll", `d20 掷骰：r1=${r.r1}, r2=${r.r2}, 选=${r.picked}, 加值=${r.mod}, 总计=${r.total}`);
            } else {
              const arr = roll(cnt, dn); const total = arr.reduce((a,b)=>a+b,0) + mod;
              setRes({kind:`d${dn}`, arr, mod, total});
              addLog("roll", `d${dn}×${cnt} 掷骰：${arr.join(",")} + ${mod} = ${total}`);
            }
          }}>掷！</button>
        </div>
        {res && (
          <div className="small muted">
            {res.kind==="d20"
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
          <span className="k">战役</span><span>《{state.meta?.campaign?.title}》</span>
          <span className="k">时间</span><span>第{state.clock.day}日 {state.clock.time}</span>
          <span className="k">天气</span><span>{state.weather}</span>
        </div>
        <div className="kv">
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
        <div className="toolbar">
          <button className="btn" onClick={()=>{ setSetupDraft(deriveSetupFromState(state)); setShowSetup(true); }}>
            修改战役/角色设定
          </button>
        </div>
      </div>
    );
  }

  function InventoryPanel() {
    const [newItem, setNewItem] = useState("");
    return (
      <div className="vstack small">
        <div className="toolbar">
          <input className="input" placeholder="物品名…" value={newItem} onChange={e=>setNewItem(e.target.value)}/>
          <button className="btn" onClick={()=>{ if(newItem.trim()) { addItem(newItem.trim()); setNewItem(""); }}}>添加</button>
        </div>
        <table className="table">
          <thead><tr><th>物品</th><th style={{width:80}}>操作</th></tr></thead>
          <tbody>
            {state.player.inventory.map((it, idx)=>(
              <tr key={idx}><td>{it}</td>
                <td><button className="btn" onClick={()=>removeItem(idx)}>移除</button></td></tr>
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
          <input className="input" placeholder="新任务名…" value={qName} onChange={e=>setQName(e.target.value)}/>
          <button className="btn" onClick={()=>{ if(qName.trim()){ addQuest(qName.trim()); setQName(""); }}}>添加任务</button>
        </div>
        <table className="table">
          <thead><tr><th>任务</th><th>阶段</th><th style={{width:140}}>操作</th></tr></thead>
          <tbody>
            {state.quests.map((q,i)=>(
              <tr key={q.id}>
                <td>{q.name}</td><td>{q.stage}</td>
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
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `dm_save_${Date.now()}.json`; a.click();
    }
    function resetWorld() {
      if (!confirm("重置世界与日志？此操作不可恢复。")) return;
      setState({ ...DEFAULT_STATE, meta: { ...DEFAULT_STATE.meta, setupDone: false } });
      setHistory([]); setEventLog([]); setShowSetup(true); setSetupDraft(deriveSetupFromState(DEFAULT_STATE));
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
        } catch { alert("导入失败：JSON 格式不正确"); }
      };
      reader.readAsText(file);
    }

    return (
      <div className="vstack small">
        <div className="toolbar">
          <button className="btn" onClick={exportAll}>导出存档(JSON)</button>
          <label className="btn">导入存档
            <input type="file" accept="application/json" style={{display:"none"}}
                   onChange={e=>{ const f = e.target.files?.[0]; if (f) importAll(f); }}/>
          </label>
          <button className="btn" onClick={resetWorld}>重置/重新设定</button>
          <button className="btn" onClick={()=>{
            if (!confirm("清空事件日志与聊天记录？此操作不可恢复。")) return;
            setEventLog([]); setHistory([]);
          }}>清空日志</button>
        </div>

        <div className="label">事件日志（最新在前）</div>
        <table className="table">
          <thead><tr><th>时间</th><th>类型</th><th>详情</th></tr></thead>
          <tbody>
            {eventLog.map((e,i)=>(
              <tr key={i}>
                <td className="small muted">{new Date(e.t).toLocaleString()}</td>
                <td>{e.kind}</td><td>{e.text}</td>
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
        <label className="label">启用 AI 环境推理
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
            <span className="badge">天气:{state.weather}</span>
          </div>
        }
      >
        <div className="card" style={{borderRadius:12}}>
          <div className="chat" ref={chatRef}>
            {history.length === 0 && (
              <div className="msg sys">提示：输入你的行动（如“在集市调查失踪的驿卒线索”）。无法识别将触发“澄清模式”。</div>
            )}
            <div className="vstack">
              {history.map((m) => (
                <div key={m.id} style={{ textAlign: m.role === "user" ? "right" : m.role === "system" ? "center" : "left" }}>
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
            <div className="vstack">
              <textarea
                className="textarea"
                rows={3}
                placeholder={pendingAction ? "回答 DM 的问题…" : "输入你的行动…（Enter发送 / Shift+Enter换行）"}
                value={input}
                onChange={(e)=>setInput(e.target.value)}
                onKeyDown={async (e)=>{ 
                  if (e.isComposing || e.keyCode === 229) return;
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); await safeSend(); }
                }}
                onInput={(e)=>{ e.currentTarget.style.height="auto"; e.currentTarget.style.height=Math.min(e.currentTarget.scrollHeight, 200)+"px"; }}
              />
              <div className="hstack" style={{justifyContent:"space-between"}}>
                <div className="small muted">{sending ? "判定进行中…" : " "}</div>
                <button className="btn pri" disabled={sending || !input.trim()} onClick={safeSend}>
                  {sending ? "发送中…" : "发送"}
                </button>
              </div>
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
        DM AI Web — 自适应玩法 / 本地+AI 环境修正 / 可视设定向导 / 本地存档 / 无后端（AI模式建议接代理）。
      </div>
      {showSetup && <SetupWizard/>}
    </div>
  );
}
