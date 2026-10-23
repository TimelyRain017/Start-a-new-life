// engine.js — 状态机 / 属性计算 / flag / 流派加权 / 隐藏结算 / 结局判定
// 规则冻结自 PRD v1.1：§2.2 属性与叠罚上限、§2.7 预演调衡、§5.2 数据 Schema
import { KEYS, LEGACY_KEYS, readRaw, writeRaw, removeRaw } from './storage.js';

// 存档「结构」版本：state 里字段增删时 +1，读到别的版本直接作废（避免半旧半新的状态）。
// 注意它和 localStorage 的 key 名无关——key 只是命名空间（storage.js 的 KEYS.save，
// 不带版本号），版本号只写在存档内容里，这样改名和改结构互不牵连。
const SAVE_VERSION = 4;

export const ATTR_INIT = { lifespan: 78, money: 0, freedom: 50, health: 80, legalRisk: 0, fraudHits: 0 };
const ATTR_KEYS = Object.keys(ATTR_INIT);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const STREAMS = {
  longevity: { id: 'longevity', name: '长寿流', weight: 'lifespan', factor: 1.5, desc: '把命当本钱：规律作息、定期体检、拒绝透支。' },
  wealth:    { id: 'wealth',    name: '财富流', weight: 'money',    factor: 1.5, desc: '把钱当命：会攒会算，每一分都要有出处。' },
  freedom:   { id: 'freedom',   name: '自由流', weight: 'freedom', factor: 1.5, desc: '把时间当命：保留说「不」的底气。' },
};

export function createState(streamId, perspectiveId = 'explorer') {
  return {
    version: SAVE_VERSION,
    stream: streamId,
    perspective: perspectiveId, // 视角：只影响叙事文案，不参与任何判定（PRD §2.8）
    attrs: { ...ATTR_INIT },
    flags: new Set(),        // flag 轻分支：已婚/已生/已创业/marriedNoMoneyTalk 等
    history: [],             // 决策回顾（对/错/坑）
    refs: new Set(),         // 引用过的指南条目「章.条」
    hidden: [],              // 55 岁才揭晓的隐藏结算项 { money, note }
    firedEvents: [],         // 已触发的随机事件 id（去重）
    seenStages: [],          // 已展示过白描的阶段
    snapshots: [],           // 读档快照（每个决策点前一份）
    cursor: 0,               // decisions.json 推进下标
    finished: false,
  };
}

// 叠罚上限：单次金钱损失 ≤ 净资产 40% 且 ≤ 30 万（PRD §2.2 / 调衡 T1）
export function clampMoneyDelta(state, delta) {
  if (delta >= 0) return delta;
  const assets = Math.max(0, state.attrs.money);
  const cap = Math.min(300000, assets * 0.4);
  return Math.max(delta, -cap);
}

export function snapshot(state) {
  state.snapshots.push(JSON.stringify({
    attrs: { ...state.attrs },
    flags: [...state.flags],
    refs: [...state.refs],
    hidden: state.hidden.map(h => ({ ...h })),
    firedEvents: [...state.firedEvents],
    seenStages: [...state.seenStages],
    history: state.history.map(h => ({ ...h })),
    cursor: state.cursor,
  }));
  if (state.snapshots.length > 40) state.snapshots.shift();
}

// 回到上一分歧点（PRD F10 / 调衡 T3）
export function rewind(state) {
  const raw = state.snapshots.pop();
  if (!raw) return false;
  const s = JSON.parse(raw);
  state.attrs = s.attrs;
  state.flags = new Set(s.flags);
  state.refs = new Set(s.refs);
  state.hidden = s.hidden;
  state.firedEvents = s.firedEvents;
  state.seenStages = s.seenStages;
  state.history = s.history;
  state.cursor = s.cursor;
  state.finished = false;
  return true;
}

// cost.money 是「自己决定花出去的钱」（学费、房租、首付），全额扣；
// gain.money 的负数与炸弹是「被动损失」（被骗、被罚、分割），受叠罚上限约束——
// 上限只防一票定生死，不该把主动支出抹成 0（资产为 0 时 cap=0，学费会凭空消失）。
export function applyOption(state, decision, optionIndex) {
  const option = decision.options[optionIndex];
  // time / energy 不是属性，只表示「走这一步要花掉几年、多少精力」。
  // 它们必须留在 delta 里：结果弹窗要如实揭晓代价（数据里 28 个选项写了 cost.time / cost.energy，
  // 漏掉就等于把「上大学要四年」这种关键信息藏着不说）。
  // 不会污染属性：下面的写入循环只遍历 ATTR_KEYS，里面没有这两项。
  const delta = {
    lifespan: 0, money: 0, freedom: 0, health: 0, legalRisk: 0, fraudHits: 0,
    time: 0, energy: 0,
  };
  let spend = 0;
  let loss = 0;

  for (const [k, v] of Object.entries(option.cost || {})) {
    if (k === 'money') spend += v;
    // cost 的约定是「写正数 = 要付出多少」（"time": 4 就是四年、"energy": 30 就是三十点精力），
    // 这里统一转成负数进 delta，弹窗才能标成「花掉 / 耗去」。
    else if (k === 'time' || k === 'energy') delta[k] -= Math.abs(v);
    else if (k in delta) delta[k] += v;
  }
  for (const [k, v] of Object.entries(option.gain || {})) {
    if (k === 'money') { if (v < 0) loss += v; else delta.money += v; }
    else if (k in delta) delta[k] += v;
  }

  let bombNote = '';
  const bomb = decision.bombIfFlag;
  if (bomb && state.flags.has(bomb.flag)) {
    for (const [k, v] of Object.entries(bomb.cost || {})) {
      if (k === 'money') loss += v;
      else if (k in delta) delta[k] += v;
    }
    bombNote = bomb.note || '';
    state.flags.delete(bomb.flag); // 只爆一次
  }

  delta.money += spend;
  if (loss < 0 && !option.bypassCap) loss = clampMoneyDelta(state, loss);
  delta.money += loss;

  for (const k of ATTR_KEYS) state.attrs[k] += delta[k];
  state.attrs.freedom = clamp(state.attrs.freedom, 0, 100);
  state.attrs.health = clamp(state.attrs.health, 0, 100);
  state.attrs.legalRisk = clamp(state.attrs.legalRisk, 0, 100);
  (option.flags || []).forEach(f => state.flags.add(f));
  (option.clearFlags || []).forEach(f => state.flags.delete(f)); // R13 拆弹用
  (decision.source || []).forEach(s => state.refs.add(s));
  (option.hiddenSettlement || []).forEach(h => state.hidden.push({ ...h }));
  // pick/branch 供人生之树定位这一段枝干伸向哪边（tree.js 消费）
  state.history.push({
    id: decision.id, title: decision.title, age: decision.age,
    text: option.text, choice: option.choice || 'neutral', delta,
    pick: optionIndex, branch: decision.options.length,
  });
  return { delta, option, bombNote };
}

// 55 岁结算：隐藏项统一揭晓 + 寿命按健康修正 ±(health-80)×0.5（PRD §2.2 / §2.7）
export function settle(state) {
  const revealed = state.hidden.map(h => ({ ...h }));
  revealed.forEach(h => { state.attrs.money += h.money; });
  state.attrs.lifespan = Math.floor(state.attrs.lifespan + (state.attrs.health - 80) * 0.5);
  state.finished = true;
  return revealed;
}

// 评分公式与预演实测一致（2026-10-22 playtest：54 分 B 级）
function attrScores(attrs) {
  return {
    lifespan: clamp(50 + (attrs.lifespan - 78) * 2.5, 0, 100),
    money: clamp(50 + attrs.money / 10000, 0, 100),
    freedom: clamp(attrs.freedom, 0, 100),
    health: clamp(attrs.health, 0, 100),
  };
}
const gradeOf = t => (t >= 90 ? 'S' : t >= 75 ? 'A' : t >= 60 ? 'B' : t >= 40 ? 'C' : 'D');

export function scoreState(state) {
  const parts = attrScores(state.attrs);
  const stream = STREAMS[state.stream];
  const weighted = { ...parts, [stream.weight]: parts[stream.weight] * stream.factor };
  // 流派加权后理论上限 112.5，对玩家来说「108 分」很怪，封顶 100
  const total = Math.min(100, Math.floor((weighted.lifespan + weighted.money + weighted.freedom + weighted.health) / 4));
  return { parts, weighted, total, grade: gradeOf(total), stream };
}

// 条件求值器：支持 "lifespan>=85 && health>=60"（数据驱动结局条件，不使用 eval）
export function matchCondition(cond, attrs) {
  if (!cond || cond === 'default') return true;
  return String(cond).split('&&').every(term => {
    const m = term.trim().match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return false;
    const v = attrs[m[1]];
    const n = parseFloat(m[3]);
    switch (m[2]) {
      case '>=': return v >= n;
      case '<=': return v <= n;
      case '==': return v === n;
      case '!=': return v !== n;
      case '>': return v > n;
      case '<': return v < n;
      default: return false;
    }
  });
}

// 主结局优先级（PRD §2.6）：负资产先于寿终正寝，与预演一致
const MAIN_ORDER = ['suddenDeath', 'prison', 'financialFreedom', 'flatMaster', 'negativeAssets', 'fraudVictim', 'peacefulDeath', 'ordinary'];

export function determineEnding(state, endings) {
  const mains = endings.filter(e => e.as === 'main').sort((a, b) => MAIN_ORDER.indexOf(a.id) - MAIN_ORDER.indexOf(b.id));
  for (const e of mains) if (matchCondition(e.condition, state.attrs)) return e.id;
  return 'ordinary';
}

export function determineBadges(state, endings, mainId) {
  return endings
    .filter(e => e.as === 'badge' && e.id !== mainId && matchCondition(e.condition, state.attrs))
    .map(e => e.id);
}

// 本机存档：刷新不丢（PRD F4）—— 落盘细节（无痕模式降级）交给 storage.js
const SAVE_KEY = KEYS.save;
export function saveState(state) {
  const plain = { ...state, flags: [...state.flags], refs: [...state.refs] };
  writeRaw(SAVE_KEY, JSON.stringify(plain));
}
export function loadState() {
  try {
    let raw = readRaw(SAVE_KEY);
    if (!raw) {
      // 老 key 里可能躺着升级前没走完的一局：搬一次到新 key，别让改 key 名把进度弄丢
      raw = readRaw(LEGACY_KEYS.save);
      if (!raw) return null;
      writeRaw(SAVE_KEY, raw);
      removeRaw(LEGACY_KEYS.save);
    }
    const s = JSON.parse(raw);
    s.flags = new Set(s.flags || []);
    s.refs = new Set(s.refs || []);
    if (s.version !== SAVE_VERSION) return null; // 旧版本存档作废
    return s;
  } catch { return null; }
}
export function clearSave() {
  removeRaw(SAVE_KEY);
}
