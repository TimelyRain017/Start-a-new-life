// records.js — 局外记录：过往每一局的档案 + 成就解锁（localStorage，纯前端）
// 一局结算时写入一条记录；「我的」页读取它算统计、结局图鉴、成就进度。
// 落盘统一走 storage.js：写不进去会降级成内存，并在「我的」页明说。
import { KEYS, readRaw, writeRaw, removeRaw } from './storage.js';

const ARCHIVE_KEY = KEYS.archive;
const ARCHIVE_MAX = 200;

export function loadArchive() {
  try {
    const raw = readRaw(ARCHIVE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function persist(list) {
  // 新记录在前；超量只留最近的，避免把 localStorage 撑爆
  writeRaw(ARCHIVE_KEY, JSON.stringify(list.slice(0, ARCHIVE_MAX)));
}

export function addRecord(rec) {
  const list = loadArchive();
  // 同一局（同 id）不重复入档：读档后再结算也只算一次
  if (rec.id && list.some(r => r.id === rec.id)) return list;
  list.unshift(rec);
  persist(list);
  return list;
}

export function clearArchive() {
  removeRaw(ARCHIVE_KEY);
}

export function removeRecord(id) {
  const list = loadArchive().filter(r => r.id !== id);
  persist(list);
  return list;
}

// ── 备份：换浏览器 / 换网址 / 换设备时，把记录带走 ─────────────
// 记录只存在当前 origin 的 localStorage 里（http://127.0.0.1:5174 和 http://localhost:5174
// 在浏览器眼里是两个不同的站），所以导出/导入是唯一可靠的搬运方式。
export function archivePayload() {
  return {
    app: 'life-restart',
    kind: 'archive',
    version: 1,
    exportedAt: Date.now(),
    records: loadArchive(),
  };
}

const stamp = r => (r && r.id) || `${r && r.at}-${r && r.ending}-${r && r.score}`;

export function mergeArchive(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: '这不是一个备份文件（读不出 JSON）' }; }
  const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.records) ? data.records : null);
  if (!incoming) return { ok: false, error: '备份文件里没有找到记录' };
  const clean = incoming.filter(r => r && typeof r === 'object' && r.ending);
  if (!clean.length) return { ok: false, error: '备份文件里的记录是空的' };

  const list = loadArchive();
  const seen = new Set(list.map(stamp));
  let added = 0;
  clean.forEach(r => {
    const k = stamp(r);
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ ...r, id: r.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    added++;
  });
  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  persist(list);
  return { ok: true, added, total: Math.min(list.length, ARCHIVE_MAX), totalBefore: list.length - added };
}

// ── 成就（PRD F15） ─────────────────────────
// test(ctx) 里 ctx: { list, runs, endings:Set, badges:Set, streams:Set, perspectives:Set, best, grades:Set }
const hasEnding = (ctx, id) => ctx.endings.has(id);

export const ACHIEVEMENTS = [
  {
    id: 'firstRun', name: '第一次重开', icon: 'sparkles', tier: 'bronze',
    desc: '走完一局人生，看到结算页。',
    test: ctx => ctx.runs >= 1,
  },
  {
    id: 'threeEndings', name: '三种活法', icon: 'bookOpen', tier: 'silver',
    desc: '解锁 3 种不同的主结局。',
    test: ctx => ctx.endings.size >= 3,
  },
  {
    id: 'allEndings', name: '八种人生', icon: 'layers', tier: 'gold',
    desc: '解锁全部 8 种主结局。',
    test: ctx => ctx.endings.size >= 8,
  },
  {
    id: 'sGrade', name: 'S 级人生', icon: 'trophy', tier: 'gold',
    desc: '任意一局拿到 S 级评分。',
    test: ctx => ctx.grades.has('S'),
  },
  {
    id: 'wealthy', name: '百万现金', icon: 'coins', tier: 'silver',
    desc: '任意一局结算时金钱 ≥ 100 万。',
    test: ctx => ctx.list.some(r => r.attrs && r.attrs.money >= 1000000),
  },
  {
    id: 'freedomWin', name: '财务自由', icon: 'wallet', tier: 'gold',
    desc: '拿到「财务自由」结局。',
    test: ctx => hasEnding(ctx, 'financialFreedom'),
  },
  {
    id: 'longLife', name: '养生有方', icon: 'heart', tier: 'silver',
    desc: '任意一局寿命 ≥ 90 岁。',
    test: ctx => ctx.list.some(r => r.attrs && r.attrs.lifespan >= 90),
  },
  {
    id: 'antiFraud', name: '反诈达人', icon: 'shieldCheck', tier: 'silver',
    desc: '任意一局中招 0 次，且法律风险 < 20。',
    test: ctx => ctx.list.some(r => r.attrs && (r.attrs.fraudHits || 0) === 0 && (r.attrs.legalRisk || 0) < 20),
  },
  {
    id: 'bothViews', name: '两种目光', icon: 'eye', tier: 'silver',
    desc: '探索者与回望者，各走完一局。',
    test: ctx => ctx.perspectives.size >= 2,
  },
  {
    id: 'allStreams', name: '三流合一', icon: 'compass', tier: 'silver',
    desc: '长寿流、财富流、自由流各走完一局。',
    test: ctx => ctx.streams.size >= 3,
  },
  {
    id: 'noRewind', name: '一往无前', icon: 'flame', tier: 'gold',
    desc: '一次都不回到岔路口，走完一局。',
    test: ctx => ctx.list.some(r => (r.rewinds || 0) === 0 && r.decisions >= 20),
  },
  {
    id: 'tenRuns', name: '十次重开', icon: 'rotateCcw', tier: 'gold',
    desc: '累计走完 10 局。',
    test: ctx => ctx.runs >= 10,
  },
];

function contextOf(list) {
  return {
    list,
    runs: list.length,
    endings: new Set(list.map(r => r.ending).filter(Boolean)),
    badges: new Set(list.flatMap(r => r.badges || [])),
    streams: new Set(list.map(r => r.stream).filter(Boolean)),
    perspectives: new Set(list.map(r => r.perspective).filter(Boolean)),
    grades: new Set(list.map(r => r.grade).filter(Boolean)),
  };
}

export function achievementState(list) {
  // 按时间正序逐局推进：第一次满足条件的那一局，就是解锁时间（累计型成就也能正确归时）
  const asc = [...list].sort((a, b) => (a.at || 0) - (b.at || 0));
  const items = ACHIEVEMENTS.map(a => {
    for (let i = 0; i < asc.length; i++) {
      let ok = false;
      try { ok = a.test(contextOf(asc.slice(0, i + 1))); } catch { ok = false; }
      if (ok) return { ...a, unlocked: true, at: asc[i].at || 0 };
    }
    return { ...a, unlocked: false, at: 0 };
  });
  return { ctx: contextOf(list), list: items };
}

export function archiveStats(list) {
  const best = list.reduce((m, r) => Math.max(m, r.score || 0), 0);
  return {
    runs: list.length,
    best,
    endings: new Set(list.map(r => r.ending).filter(Boolean)).size,
    achievements: achievementState(list).list.filter(a => a.unlocked).length,
  };
}

export function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
