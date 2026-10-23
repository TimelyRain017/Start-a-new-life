// tools/sim.mjs — 结局可达性 & 数值平衡自测（开发期脚本，不进构建）
// 用法：node tools/sim.mjs [runs=200000]
// 复刻 src/main.js 的推进逻辑：决策 → (可能) 随机事件 → 下一决策 …… → 结算 → 结局判定
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createState, applyOption, settle, scoreState,
  determineEnding, determineBadges, STREAMS,
} from '../src/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));

const decisions = read('decisions.json').decisions;
const events = read('events.json').events;
const endings = read('endings.json').endings;

const EVENT_CHANCE = 0.55;
const EVENT_MAX_PER_RUN = 5;

// 用固定种子的伪随机，结果可复现
let seed = 20261023;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function nextDecision(state) {
  while (state.cursor < decisions.length) {
    const d = decisions[state.cursor];
    const ok = (d.requireFlags || []).every(f => state.flags.has(f))
      && !(d.forbidFlags || []).some(f => state.flags.has(f));
    if (ok) return d;
    state.cursor++;
  }
  return null;
}

function maybeFireEvent(state, age) {
  if (state.firedEvents.length >= EVENT_MAX_PER_RUN) return;
  const pool = events.filter(e => {
    if (state.firedEvents.includes(e.id)) return false;
    if (age < e.window[0] || age > e.window[1]) return false;
    if ((e.requireFlags || []).some(f => !state.flags.has(f))) return false;
    if (e.requireAnyFlags && e.requireAnyFlags.length && !e.requireAnyFlags.some(f => state.flags.has(f))) return false;
    if ((e.forbidFlags || []).some(f => state.flags.has(f))) return false;
    return true;
  });
  if (!pool.length) return;
  const luckFired = state.firedEvents.some(id => events.find(e => e.id === id)?.luck);
  const luckPool = pool.filter(e => e.luck);
  let ev;
  if (!luckFired && luckPool.length && state.firedEvents.length > 0) {
    ev = luckPool[Math.floor(rnd() * luckPool.length)];
  } else {
    if (rnd() > EVENT_CHANCE) return;
    ev = pool[Math.floor(rnd() * pool.length)];
  }
  state.firedEvents.push(ev.id);
  applyOption(state, ev, Math.floor(rnd() * ev.options.length));
}

export function playOnce(streamId, strategy = 'random', plan = null) {
  const state = createState(streamId, 'explorer');
  let d;
  let guard = 0;
  while ((d = nextDecision(state)) && guard++ < 80) {
    let pick = 0;
    if (plan && plan[d.id] !== undefined) {
      pick = Math.min(plan[d.id], d.options.length - 1); // 定向路径：手工指定这一步选哪个
    } else if (strategy === 'good') {
      // 总选第一个 good，其次 neutral，最后 pit
      const order = d.options.map((o, i) => ({ o, i, rank: o.choice === 'good' ? 0 : o.choice === 'neutral' ? 1 : 2 }));
      order.sort((a, b) => a.rank - b.rank);
      pick = order[0].i;
    } else if (strategy === 'pit') {
      const order = d.options.map((o, i) => ({ o, i, rank: o.choice === 'pit' ? 0 : o.choice === 'neutral' ? 1 : 2 }));
      order.sort((a, b) => a.rank - b.rank);
      pick = order[0].i;
    } else if (strategy === 'maxMoney' || strategy === 'maxFreedom' || strategy === 'maxRisk' || strategy === 'minHealth') {
      // 贪心：按某一种数值倾向挑选项（不计隐藏结算）
      const scoreOf = (o) => {
        const c = o.cost || {};
        const g = o.gain || {};
        const net = k => (g[k] || 0) + (c[k] || 0);
        if (strategy === 'maxMoney') return net('money');
        if (strategy === 'maxFreedom') return net('freedom');
        if (strategy === 'maxRisk') return net('legalRisk');
        return -net('health');
      };
      let best = 0;
      d.options.forEach((o, i) => { if (scoreOf(o) > scoreOf(d.options[best])) best = i; });
      pick = best;
    } else {
      pick = Math.floor(rnd() * d.options.length);
    }
    applyOption(state, d, pick);
    state.cursor++;
    maybeFireEvent(state, d.age);
  }
  const revealed = settle(state);
  const score = scoreState(state);
  const mainId = determineEnding(state, endings);
  const badges = determineBadges(state, endings, mainId);
  return { state, score, mainId, badges, revealed };
}

const RUNS = Number(process.argv[2] || 200000);
const streams = Object.keys(STREAMS);

const counts = Object.fromEntries(endings.filter(e => e.as === 'main').map(e => [e.id, 0]));
const badgeCounts = Object.fromEntries(endings.filter(e => e.as === 'badge').map(e => [e.id, 0]));
const gradeCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
const mins = { money: Infinity, lifespan: Infinity, freedom: Infinity, health: Infinity, legalRisk: 0, fraudHits: 0 };
const maxs = { money: -Infinity, lifespan: -Infinity, freedom: -Infinity, health: -Infinity, legalRisk: 0, fraudHits: 0 };
let scoreSum = 0;

for (let i = 0; i < RUNS; i++) {
  const r = playOnce(streams[i % streams.length]);
  counts[r.mainId]++;
  r.badges.forEach(b => badgeCounts[b]++);
  gradeCounts[r.score.grade]++;
  scoreSum += r.score.total;
  for (const k of ['money', 'lifespan', 'freedom', 'health', 'legalRisk', 'fraudHits']) {
    mins[k] = Math.min(mins[k], r.state.attrs[k]);
    maxs[k] = Math.max(maxs[k], r.state.attrs[k]);
  }
}

const pct = n => ((n / RUNS) * 100).toFixed(2) + '%';
console.log(`\n随机策略 ${RUNS} 局（三流派均分）\n`);
console.log('结局分布');
for (const e of endings.filter(e => e.as === 'main')) {
  console.log(`  ${counts[e.id] ? '✓' : '✗'} ${e.id.padEnd(16)} ${String(counts[e.id]).padStart(7)}  ${pct(counts[e.id])}  ${e.name}`);
}
console.log('\n徽章分布');
for (const e of endings.filter(e => e.as === 'badge')) {
  console.log(`  ${badgeCounts[e.id] ? '✓' : '✗'} ${e.id.padEnd(16)} ${String(badgeCounts[e.id]).padStart(7)}  ${pct(badgeCounts[e.id])}  ${e.name}`);
}
console.log('\n评级分布', gradeCounts, '平均分', (scoreSum / RUNS).toFixed(1));
console.log('属性区间');
for (const k of ['money', 'lifespan', 'freedom', 'health', 'legalRisk', 'fraudHits']) {
  console.log(`  ${k.padEnd(10)} min ${String(mins[k]).padStart(9)}   max ${String(maxs[k]).padStart(9)}`);
}

// 极值策略：全选「好」/全选「坑」，看两种极端能不能覆盖到稀有结局
for (const s of ['good', 'pit']) {
  const c = {};
  for (let i = 0; i < 400; i++) {
    const r = playOnce(streams[i % streams.length], s);
    c[r.mainId] = (c[r.mainId] || 0) + 1;
  }
  console.log(`\n策略 ${s}：`, c);
}

// ── 定向路径：证明稀有结局有一条「人真的能走出来」的路（不靠运气） ──
const PATHS = [
  ['financialFreedom', 'wealth', 'maxMoney', null, '每一步都往现金流最高的选项走：硬证 + 大厂 + 定投 + 创业'],
  ['flatMaster', 'freedom', 'maxFreedom', null, '每一步都往自由度最高的选项走'],
  ['prison', 'wealth', 'maxRisk', null, '每一步都往法律风险最高的选项走'],
  ['suddenDeath', 'wealth', 'minHealth', { S6D4: 1 }, '长期熬健康 + 凌晨那次不去医院'],
  ['peacefulDeath', 'longevity', 'good', null, '全程按「好」选项走'],
];

console.log('\n定向路径（确定性验证：只靠选择，不靠事件运气）');
const detSeen = new Set();
for (const [target, stream, strategy, plan, note] of PATHS) {
  const r = playOnce(stream, strategy, plan);
  const e = endings.find(x => x.id === r.mainId);
  const ok = r.mainId === target ? '✓' : '✗';
  detSeen.add(r.mainId);
  console.log(`  ${ok} 目标「${endings.find(x => x.id === target).name}」→ 实得「${e?.name}」${r.score.total} 分 ${r.score.grade} · 钱 ${r.state.attrs.money} 寿命 ${r.state.attrs.lifespan} 自由 ${r.state.attrs.freedom} 健康 ${r.state.attrs.health} 风险 ${r.state.attrs.legalRisk} 中招 ${r.state.attrs.fraudHits}（${note}）`);
}

const allIds = endings.filter(e => e.as === 'main').map(e => e.id);
const missed = allIds.filter(id => !counts[id]);
console.log(`\n可达性（随机分布 + 定向路径合并）：${allIds.length - missed.length}/${allIds.length} 个主结局可达` + (missed.length ? `，未覆盖：${missed.join(', ')}` : '，无死角'));
console.log(`  定向路径额外验证：${[...detSeen].map(id => endings.find(e => e.id === id).name).join('、')}`);
console.log('  仅靠随机分布可达：' + allIds.filter(id => counts[id] && !detSeen.has(id)).map(id => endings.find(e => e.id === id).name).join('、'));
