// main.js — 入口 + 流程装配
// 流程：视角+流派选择 → 阶段白描 → 决策点 → (随机事件) → 反馈弹窗 → …… → 55 岁结算 → 结局
// 局外：每一次结算写入「我的」档案（结局图鉴 / 成就 / 记录），随时可回主页再继续
import decisionsData from '../data/decisions.json';
import eventsData from '../data/events.json';
import endingsData from '../data/endings.json';
import attribution from '../data/attribution.json';
import perspectivesData from '../data/perspectives.json';
import {
  createState, applyOption, settle, scoreState, STREAMS,
  determineEnding, determineBadges,
  snapshot, rewind, saveState, loadState, clearSave,
} from './engine.js';
import { addRecord, removeRecord, loadArchive, achievementState } from './records.js';
import * as ui from './ui.js';
import { unlock as unlockSound } from './sound.js';

const decisions = decisionsData.decisions;
const stages = decisionsData.stages;
const events = eventsData.events;
const endings = endingsData.endings;
const perspectives = perspectivesData.perspectives;
const mainEndings = endings.filter(e => e.as === 'main');

// 视角（PRD §2.8）：只换叙事语气，不参与任何数值与判定
const perspOf = id => perspectives.find(p => p.id === id) || perspectives[0];

// 事件节奏（PRD §2.5）：一局 24 个决策 + 4–6 个事件 ≈ 10 分钟
const EVENT_CHANCE = 0.55;
const EVENT_MAX_PER_RUN = 5;

let state = null;

// 人生之树的输入：每一步选了哪条、当时有几条岔路
function treeSteps() {
  return state.history.map(h => ({ age: h.age, pick: h.pick ?? 0, branch: h.branch || 2 }));
}

function startStream(streamId, perspectiveId) {
  state = createState(streamId, perspectiveId || perspectivesData.default);
  clearSave();
  ui.renderAttrBar(state);
  nextStep();
}

function continueGame() {
  const s = loadState();
  if (!s) { boot(); return; }
  state = s;
  state.rewindCount = state.rewindCount || 0;
  ui.renderAttrBar(state);
  if (state.finished) { showEnding(); return; }
  // 上一局在插曲中途离开的，接着把那件事看完，不要悄无声息地跳过
  if (!resumeEvent()) nextStep();
}

// 局内回主页：进度已经落盘，随时可以回来接着走
function backHome() {
  if (state) saveState(state);
  boot();
}

// flag 轻分支：requireFlags 不满足 / forbidFlags 命中的决策整段跳过（PRD §2.4）
function nextDecision() {
  while (state.cursor < decisions.length) {
    const d = decisions[state.cursor];
    const ok = (d.requireFlags || []).every(f => state.flags.has(f))
      && !(d.forbidFlags || []).some(f => state.flags.has(f));
    if (ok) return d;
    state.cursor++;
  }
  return null;
}

function nextStep() {
  const d = nextDecision();
  if (!d) { showEnding(); return; }
  saveState(state); // 指针已指向这一步，刷新/回主页都能原样接上
  const stageKey = String(d.stage);
  const stage = stages[stageKey];
  // 视角只替换开场白文案：perspectives.json 有覆盖就用，没有就回落原文（PRD §2.8）
  const persp = perspOf(state.perspective);
  const stageView = stage ? { ...stage, intro: (persp.stages && persp.stages[stageKey]) || stage.intro } : null;
  const enterStage = () => {
    snapshot(state); // 决策点前的快照：读档回到这里
    ui.renderDecision(d, treeSteps(), i => choose(d, i), backHome);
  };
  if (stageView && !state.seenStages.includes(stageKey)) {
    state.seenStages.push(stageKey);
    ui.renderStage(stageView, treeSteps(), enterStage, d.options.length, persp.name, backHome);
  } else {
    enterStage();
  }
}

// 选前不泄露任何数值：先结算 → 弹窗揭晓 → 关窗后才刷新属性条
function handleChoice(item, i, after) {
  const { delta, option, bombNote } = applyOption(state, item, i);
  saveState(state);
  ui.showOutcome({
    kicker: `${item.age} 岁 · ${item.title}`,
    choice: option.text,
    delta,
    bomb: bombNote,
    note: !bombNote && option.choice === 'pit' ? '当时看不出问题。人生的账单，往往在后面才到。' : '',
    luck: !!item.luck,
  }, () => {
    ui.renderAttrBar(state, { bump: true });
    after();
  });
}

function choose(decision, i) {
  // 先把指针推到下一步：任何时刻落盘的存档都指向「还没走的那个抉择」，
  // 否则中途关页 / 回主页后再继续，会把同一个抉择重走一遍
  state.cursor++;
  handleChoice(decision, i, () => {
    saveState(state);
    maybeFireEvent(() => nextStep());
  });
}

function maybeFireEvent(onDone) {
  if (state.firedEvents.length >= EVENT_MAX_PER_RUN) { onDone(); return; }
  const last = state.history[state.history.length - 1];
  const age = last ? last.age : 18;
  const pool = events.filter(e => {
    if (state.firedEvents.includes(e.id)) return false;
    if (age < e.window[0] || age > e.window[1]) return false;
    if ((e.requireFlags || []).some(f => !state.flags.has(f))) return false;
    if (e.requireAnyFlags && e.requireAnyFlags.length && !e.requireAnyFlags.some(f => state.flags.has(f))) return false;
    if ((e.forbidFlags || []).some(f => state.flags.has(f))) return false;
    return true;
  });
  if (!pool.length) { onDone(); return; }

  // 好运保底（PRD §2.5 规则 4）：本局出过事件但还没出过好运时，优先补一次好运
  const luckFired = state.firedEvents.some(id => events.find(e => e.id === id)?.luck);
  const luckPool = pool.filter(e => e.luck);
  let ev;
  if (!luckFired && luckPool.length && state.firedEvents.length > 0) {
    ev = luckPool[Math.floor(Math.random() * luckPool.length)];
  } else {
    if (Math.random() > EVENT_CHANCE) { onDone(); return; }
    ev = pool[Math.floor(Math.random() * pool.length)];
  }

  // 随机事件本身不带 age（只有 age window），补上当前年龄供树与弹窗使用
  ev = { ...ev, age };
  state.pendingEvent = { id: ev.id, age };
  saveState(state);
  showEvent(ev, onDone);
}

// 事件页（含「中途离开、回来接着看」的情况）
function showEvent(ev, onDone) {
  ui.renderEvent(ev, treeSteps(), i => {
    state.firedEvents.push(ev.id);
    state.pendingEvent = null;
    handleChoice(ev, i, onDone);
  }, backHome);
}

function resumeEvent() {
  const pe = state.pendingEvent;
  if (!pe) return false;
  const ev = events.find(e => e.id === pe.id);
  if (!ev || state.firedEvents.includes(ev.id)) { state.pendingEvent = null; return false; }
  showEvent({ ...ev, age: pe.age }, () => nextStep());
  return true;
}

// 一局的档案：写进「我的」，供结局图鉴 / 成就 / 记录使用
function archiveRun({ ending, score, badgeList }) {
  const before = achievementState(loadArchive()).list;
  const rec = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    stream: state.stream,
    streamName: STREAMS[state.stream] ? STREAMS[state.stream].name : '',
    perspective: state.perspective,
    perspectiveName: perspOf(state.perspective).name,
    ending: ending.id,
    endingName: ending.name,
    score: score.total,
    grade: score.grade,
    attrs: { ...state.attrs },
    badges: badgeList.map(b => b.id),
    decisions: state.history.length,
    rewinds: state.rewindCount || 0,
  };
  addRecord(rec);
  state.recordId = rec.id;
  const after = achievementState(loadArchive()).list;
  const prevIds = new Set(before.filter(a => a.unlocked).map(a => a.id));
  return {
    recId: rec.id,
    runNo: loadArchive().length,
    newAch: after.filter(a => a.unlocked && !prevIds.has(a.id)),
  };
}

function showEnding() {
  let revealed;
  let fresh = false;
  if (state.finished) {
    revealed = state.hidden.map(h => ({ ...h })); // 读档后不再重复结算
  } else {
    revealed = settle(state);
    fresh = true;
    saveState(state);
  }
  const score = scoreState(state);
  const mainId = determineEnding(state, endings);
  const ending = endings.find(e => e.id === mainId);
  const badgeList = determineBadges(state, endings, mainId).map(id => endings.find(e => e.id === id));
  const extra = fresh ? archiveRun({ ending, score, badgeList }) : { runNo: loadArchive().length, newAch: [] };

  ui.renderEnding(
    {
      state, ending, badgeList, score, revealed,
      perspNote: perspOf(state.perspective).endingNote,
      runNo: extra.runNo, newAch: extra.newAch,
    },
    {
      onRewind: () => {
        if (rewind(state)) {
          state.rewindCount = (state.rewindCount || 0) + 1;
          if (state.recordId) { removeRecord(state.recordId); state.recordId = null; } // 这局还没结束，先撤回档案
          saveState(state);
          ui.renderAttrBar(state);
          nextStep();
        }
      },
      onRestart: () => startStream(state.stream, state.perspective),
      onHome: () => { clearSave(); boot(); },
      onMe: () => openMe(() => showEnding()),
      onShare: () => ui.openShareCard({
        state, ending, badgeList, score, revealed,
        persp: perspOf(state.perspective),
      }),
    },
  );
}

// returnTo：从主页进来返回主页，从结算页进来返回结算页
function openMe(returnTo = boot) {
  ui.renderMe(mainEndings, loadState(), meHandlers(returnTo));
}

const meHandlers = (returnTo = boot) => ({
  onBack: () => returnTo(),
  onResume: () => continueGame(),
  onAbandon: () => { clearSave(); ui.renderMe(mainEndings, null, meHandlers(returnTo)); },
});

function boot() {
  ui.renderFooter(attribution);
  const save = loadState();
  ui.renderStart(startStream, continueGame, save, perspectives,
    (save && save.perspective) || perspectivesData.default,
    { onMe: () => openMe(boot) });
  // 主页已经画好，可以撤开场幕布了（它在 index.html 的内联脚本里等这个信号）
  if (window.__bootReady) window.__bootReady();
}

// 开发期快进：一次点完剩余抉择直达结算，用于验证结局/分享卡版式（生产构建被 tree-shaking 剔除）
if (import.meta.env.DEV) {
  window.__finish = () => {
    let d;
    let guard = 0;
    while ((d = nextDecision()) && guard++ < 60) {
      applyOption(state, d, 0);
      state.cursor++;
    }
    showEnding();
    return state.attrs;
  };
}

// 浏览器要求先有用户手势才允许出声：第一次点屏幕时把 AudioContext 打开，之后就随打随响
['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => unlockSound(), { once: true, passive: true }));

boot();
