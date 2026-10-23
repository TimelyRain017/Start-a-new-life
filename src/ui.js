// ui.js — 页面渲染（移动端优先，无框架）
// v1.5 改动：① 局内可回主页、继续进行中的一局 ② 新增「我的」页：结局图鉴 + 成就 + 记录
// v1.8 改动：标题改用 12×12 点阵矢量字标（src/title.js，883 字节），去掉 gsap 洗牌动画；
//            旁白逐字流出时配一声打字机「嗒」（Web Audio 合成，无音频文件）
import { STREAMS } from './engine.js';
import { treeSvg } from './tree.js';
import { icon, attrIcon } from './icons.js';
import { buildShareCard } from './share.js';
import { typeTick, isMuted, setMuted } from './sound.js';
import { TITLE_PATH, TITLE_VIEWBOX } from './title.js';
import { piecePath, pieceCenter, labelSize, PUZZLE_VIEWBOX, PUZZLE_COLS } from './puzzle.js';
import {
  loadArchive, archiveStats, achievementState, clearArchive, fmtWhen,
  archivePayload, mergeArchive,
} from './records.js';
import { storageInfo, storageOk } from './storage.js';
import trLogo from './assets/tr-logo.png';

const screen = () => document.querySelector('#screen');
const app = () => document.querySelector('#app');
// 每次换页都回到顶部（否则从结算页回主页会停在半截）
function setScreen(html) {
  screen().innerHTML = html;
  window.scrollTo(0, 0);
}
// 主页/我的页不需要顶部属性条
function hideAttrBar() {
  const bar = document.querySelector('#attr-bar');
  if (bar) bar.hidden = true;
}
const ATTR_LABEL = { lifespan: '寿命', money: '金钱', freedom: '自由', health: '健康', legalRisk: '法律风险', fraudHits: '中招', time: '时间', energy: '精力' };

export function fmtMoneyRaw(v) {
  return (v < 0 ? '−¥' : '¥') + Math.abs(v).toLocaleString('en-US');
}

// 顶部属性条用紧凑写法（¥15.97万），避免大额金钱把 4 列挤成两行
function fmtMoneyShort(v) {
  const a = Math.abs(v);
  if (a < 10000) return fmtMoneyRaw(v);
  return (v < 0 ? '−¥' : '¥') + (a / 10000).toFixed(a >= 100000 ? 1 : 2) + '万';
}

function chipText(k, v) {
  const mark = attrIcon(k);
  if (k === 'money') return mark + '金钱 ' + (v < 0 ? '−' : '+') + '¥' + Math.abs(v).toLocaleString('en-US');
  if (k === 'time') return mark + '时间 ' + v + ' 年';
  if (k === 'energy') return mark + '精力 ' + v;
  return mark + ATTR_LABEL[k] + ' ' + (v > 0 ? '+' : '') + v;
}

function deltaChips(delta) {
  const items = Object.entries(delta).filter(([, v]) => v !== 0);
  if (!items.length) return '<span class="chip chip-none">这一岁，什么也没变</span>';
  return items
    .map(([k, v]) => `<span class="chip ${v > 0 ? 'chip-up' : 'chip-down'}">${chipText(k, v)}</span>`).join('');
}

// 顶部属性条的图标由这里补齐（index.html 里只放空占位，避免静态页里手写一堆 SVG）
let attrIconsReady = false;
function hydrateAttrIcons() {
  if (attrIconsReady) return;
  document.querySelectorAll('.attr-ico[data-ico]').forEach(el => {
    el.innerHTML = attrIcon(el.dataset.ico);
  });
  attrIconsReady = true;
}

export function renderAttrBar(state, opts = {}) {
  const bar = document.querySelector('#attr-bar');
  bar.hidden = false;
  hydrateAttrIcons();
  const set = (id, text, cls) => {
    const el = document.querySelector(id);
    el.textContent = text;
    if (cls !== undefined) el.classList.toggle('attr-negative', cls);
    if (opts.bump) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  };
  set('#attr-lifespan', state.attrs.lifespan + ' 岁');
  set('#attr-money', fmtMoneyShort(state.attrs.money), state.attrs.money < 0);
  set('#attr-freedom', state.attrs.freedom);
  set('#attr-health', state.attrs.health);
}

// TR 品牌：个人 IP 图 + 拉丁副名
function brandCorner() {
  return `<div class="brand-corner">
    <img src="${trLogo}" alt="TR 及时雨" />
    <span class="brand-latin">AI Timely Rain</span>
  </div>`;
}

export function renderStart(onStream, onContinue, save, perspectives = [], defaultId = '', handlers = {}) {
  const list = perspectives.length ? perspectives : [{ id: 'explorer', name: '探索者', hint: '', sub: '' }];
  let picked = list.some(p => p.id === defaultId) ? defaultId : list[0].id;
  const cur = list.find(p => p.id === picked);
  const archive = loadArchive();
  const st = archiveStats(archive);
  const saveInfo = save ? describeSave(save) : null;

  hideAttrBar();
  setScreen(`
    <section class="card hero">
      ${soundToggle('hero-sound')}
      <button class="me-entry" id="btn-me" aria-label="我的">
        ${icon('user')}<span>我的</span>${st.achievements ? `<i class="me-dot">${st.achievements}</i>` : ''}
      </button>
      <div class="brand-lockup">
        <img src="${trLogo}" alt="TR 及时雨 · AI Timely Rain" />
        <span class="brand-latin">AI Timely Rain</span>
      </div>
      <h1 class="pixel-title">
        <span class="sr-only">人生重开</span>
        <svg class="pixel-logo" viewBox="${TITLE_VIEWBOX}" aria-hidden="true" focusable="false"><path fill="currentColor" d="${TITLE_PATH}"/></svg>
      </h1>
      <p class="poem">好雨知时节，当春乃发生</p>

      ${saveInfo ? `
      <button class="continue-card" id="btn-continue">
        <span class="continue-kicker">${saveInfo.finished ? '上一局已经走完' : '上一局还没走完'}</span>
        <span class="continue-main">${saveInfo.finished ? '回到结算页' : '继续上局人生'}</span>
        <span class="continue-meta">${saveMeta(saveInfo)}</span>
      </button>` : ''}

      <p class="pick-tip">先选一个视角 · 同一段人生，两种看法</p>
      <div class="views">
        ${list.map(p => `
          <button class="btn view-opt${p.id === picked ? ' on' : ''}" data-view="${p.id}">
            <span class="view-name">${p.name}</span>
            <span class="view-hint">${p.hint || ''}</span>
          </button>`).join('')}
      </div>

      <p class="sub" id="start-sub">${cur.sub || ''}</p>

      <p class="pick-tip">再选一种活法 · 决定结局的评分权重</p>
      <div class="streams">
        ${Object.values(STREAMS).map(s => `
          <button class="btn stream" data-stream="${s.id}">
            <span class="stream-name">${s.name}</span>
            <span class="stream-desc">${s.desc}</span>
            <span class="stream-weight">${attrIcon(s.weight)}${ATTR_LABEL[s.weight]}权重 ×1.5</span>
          </button>`).join('')}
      </div>

      <button class="me-strip" id="btn-me-strip">
        <span>走完 <b>${st.runs}</b> 局 · 结局 <b>${st.endings}/8</b> · 成就 <b>${st.achievements}/${achievementState(archive).list.length}</b></span>
        <span class="me-strip-go">我的记录 ›</span>
      </button>
      ${storageOk() ? '' : '<p class="store-warn">当前浏览器不允许本地存储（可能是无痕模式），记录关掉页面就会消失。</p>'}
    </section>`);

  wireSound();

  screen().querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    picked = b.dataset.view;
    screen().querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x.dataset.view === picked));
    const p = list.find(v => v.id === picked);
    const sub = screen().querySelector('#start-sub');
    sub.textContent = p.sub || '';
    sub.classList.remove('swap'); void sub.offsetWidth; sub.classList.add('swap');
  }));

  screen().querySelectorAll('[data-stream]').forEach(b =>
    b.addEventListener('click', () => onStream(b.dataset.stream, picked)));
  const c = screen().querySelector('#btn-continue');
  if (c) c.addEventListener('click', onContinue);
  ['#btn-me', '#btn-me-strip'].forEach(sel => {
    const el = screen().querySelector(sel);
    if (el && handlers.onMe) el.addEventListener('click', handlers.onMe);
  });
}

// 存档摘要：走到哪一年、走了几步、什么活法；已结算的一局要和小时候区分开
function describeSave(s) {
  const last = s.history && s.history.length ? s.history[s.history.length - 1] : null;
  return {
    stream: STREAMS[s.stream] ? STREAMS[s.stream].name : '',
    age: last ? last.age : 18,
    steps: (s.history || []).length,
    finished: !!s.finished,
  };
}
const saveMeta = d => `${d.stream} · ${d.finished ? '' : '走到 '}${d.age} 岁 · ${d.steps} 个抉择`;

// ── 我的：结局图鉴 + 成就 + 记录 + 进行中的一局 ────────────
export function renderMe(mainEndings, save, handlers = {}, flash = '') {
  const archive = loadArchive();
  const st = archiveStats(archive);
  const ach = achievementState(archive).list;
  const counts = {};
  archive.forEach(r => { counts[r.ending] = (counts[r.ending] || 0) + 1; });
  const total = mainEndings.length || 8;
  const store = storageInfo();

  hideAttrBar();
  setScreen(`
    <section class="card me">
      <div class="me-head">
        <button class="me-back" id="btn-me-back" aria-label="返回">${icon('arrowLeft')}</button>
        <span class="kicker" style="margin:0">我的</span>
      </div>

      <div class="me-stats">
        <div><b>${st.runs}</b><span>走完的局</span></div>
        <div><b>${st.best}</b><span>最高分</span></div>
        <div><b>${st.endings}<i>/${total}</i></b><span>拼图块</span></div>
        <div><b>${st.achievements}<i>/${ach.length}</i></b><span>成就</span></div>
      </div>

      <!-- 本地存储状态：记录只在这台设备的这个浏览器里，明说出来 + 给一条搬走的路 -->
      <div class="store-strip${store.ok ? '' : ' warn'}">
        <span class="store-dot" aria-hidden="true"></span>
        <span class="store-txt">${store.ok
          ? `已存在本机 · ${store.kb} KB`
          : '本机存储不可用 · 关页即失'}</span>
        <button class="store-btn" id="btn-export">备份</button>
        <button class="store-btn" id="btn-import">恢复</button>
        <input type="file" id="file-import" accept="application/json,.json" hidden />
      </div>
      <p class="store-tip">${store.ok
        ? `记录保存在这个浏览器（${store.host}），自动存，不需要登录。换浏览器、换网址（端口或域名不同）、清浏览数据都会看不到旧记录 —— 想留着就点「备份」存成文件。`
        : '这个浏览器不允许本地存储（常见于无痕 / 隐私模式），这一局的记录关掉页面就会消失。换成普通窗口打开就好。'}</p>
      <p class="store-msg" id="store-msg"${flash ? '' : ' hidden'}>${flash}</p>

      ${save ? `<div class="me-save">
        <p><span class="me-save-kicker">${save.finished ? '已结算' : '进行中'}</span>${saveMeta(describeSave(save))}</p>
        <div class="me-save-actions">
          <button class="btn-mini primary" id="btn-me-resume">${save.finished ? '回到结算页' : '继续这一局'}</button>
          <button class="btn-mini" id="btn-me-abandon">${save.finished ? '收起' : '放弃'}</button>
        </div>
      </div>` : ''}

      <h3 class="sec-title">${icon('bookOpen')}人生拼图<span>${st.endings}/${total} 块</span></h3>
      <div class="puzzle-wrap">
        ${puzzleSvg(mainEndings, counts)}
        <p class="puzzle-cap">${st.endings >= total
          ? '八块拼齐了 —— 这就是一个人这一生能活出的全部样子。'
          : `每走完一种人生，就拼上一块。还差 ${total - st.endings} 块。`}</p>
      </div>
      <div class="puzzle-note" id="pz-note"></div>

      <h3 class="sec-title">${icon('trophy')}成就<span>${st.achievements}/${ach.length}</span></h3>
      <ul class="ach-list">
        ${ach.map(a => `
          <li class="ach${a.unlocked ? ' on' : ''}">
            <span class="ach-ico">${icon(a.unlocked ? a.icon : 'lock')}</span>
            <div class="ach-body">
              <b>${a.name}</b>
              <p>${a.desc}</p>
            </div>
            <span class="ach-when">${a.unlocked ? fmtWhen(a.at) : ''}</span>
          </li>`).join('')}
      </ul>

      <h3 class="sec-title">${icon('rotateCcw')}最近的记录<span>${archive.length}</span></h3>
      ${archive.length ? `<ul class="rec-list">
        ${archive.slice(0, 12).map(r => `
          <li>
            <div class="rec-main">
              <b>${r.endingName || r.ending}</b>
              <span>${r.streamName || ''} · ${r.perspectiveName || ''}视角</span>
            </div>
            <div class="rec-side">
              <b>${r.score}</b>
              <time>${fmtWhen(r.at)}</time>
            </div>
          </li>`).join('')}
      </ul>` : '<p class="empty">还没有走完任何一局。走完第一局，这里会开始记下你的人生。</p>'}

      ${archive.length ? '<button class="btn btn-ghost btn-block me-clear" id="btn-me-clear">清空我的记录与成就</button>' : ''}
    </section>`);

  wirePuzzle(mainEndings, counts);
  wireStore(mainEndings, save, handlers);
  screen().querySelector('#btn-me-back').addEventListener('click', handlers.onBack);
  const resume = screen().querySelector('#btn-me-resume');
  if (resume) resume.addEventListener('click', handlers.onResume);
  const abandon = screen().querySelector('#btn-me-abandon');
  if (abandon) abandon.addEventListener('click', handlers.onAbandon);

  const clearBtn = screen().querySelector('#btn-me-clear');
  if (clearBtn) {
    let armed = false;
    clearBtn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        clearBtn.textContent = '再点一次，确认清空（不可恢复）';
        clearBtn.classList.add('danger');
        return;
      }
      clearArchive();
      renderMe(mainEndings, save, handlers);
    });
  }
}

// 8 个结局拼成一张图：解锁的那块用统一的晨光渐变填充，
// 相邻几块拼起来是连续的一整幅画（同一套 userSpaceOnUse 渐变），不是 8 张各画各的卡。
function puzzleSvg(list, counts) {
  const cells = list.slice(0, PUZZLE_COLS * 2).map((e, i) => {
    const r = Math.floor(i / PUZZLE_COLS);
    const c = i % PUZZLE_COLS;
    const n = counts[e.id] || 0;
    const { x, y } = pieceCenter(r, c);
    return `<g class="pz-piece${n ? ' on' : ''}" data-id="${e.id}" tabindex="0" role="button"
      aria-label="${n ? e.name + '，已拼上，达成 ' + n + ' 次' : '这一块还没拼上'}">
      <path class="pz-shape" d="${piecePath(r, c)}"/>
      ${n ? `<path class="pz-glow" d="${piecePath(r, c)}"/>` : ''}
      <text class="pz-label" x="${x}" y="${y}" style="font-size:${labelSize(n ? e.name : '？')}px">${n ? e.name : '？'}</text>
      ${n > 1 ? `<text class="pz-count" x="${x}" y="${y + 13}">×${n}</text>` : ''}
    </g>`;
  }).join('');

  return `<svg class="puzzle" viewBox="${PUZZLE_VIEWBOX}" role="img"
    aria-label="人生拼图，已拼上 ${Object.keys(counts).length} 块">
    <defs>
      <!-- 整幅画是一张图：斜向晨光渐变铺满 4×2 全场，拼上的块各自露出自己那一角，
           所以越往右下越暖、越深；中间再压一团柔光当太阳。八块拼齐时才看得出是同一张画。 -->
      <linearGradient id="pzArt" gradientUnits="userSpaceOnUse" x1="40" y1="-30" x2="360" y2="230">
        <stop offset="0" stop-color="#fdf6e6"/>
        <stop offset="0.34" stop-color="#f6e3bd"/>
        <stop offset="0.66" stop-color="#e8c98c"/>
        <stop offset="1" stop-color="#d3a862"/>
      </linearGradient>
      <radialGradient id="pzSun" gradientUnits="userSpaceOnUse" cx="196" cy="88" r="176">
        <stop offset="0" stop-color="#fffdf4" stop-opacity="0.6"/>
        <stop offset="0.55" stop-color="#fff8e2" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#fff8e2" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${cells}
  </svg>`;
}

// 点一块，看看这一生是怎么走完的
function wirePuzzle(list, counts) {
  const note = screen().querySelector('#pz-note');
  if (!note) return;
  const byId = new Map(list.map(e => [e.id, e]));
  const show = id => {
    const e = byId.get(id);
    if (!e) return;
    const n = counts[id] || 0;
    screen().querySelectorAll('.pz-piece').forEach(g => g.classList.toggle('sel', g.dataset.id === id));
    note.innerHTML = n
      ? `<p class="pz-note-name">${e.name}<span>达成 ${n} 次</span></p><p class="pz-note-copy">${e.copy}</p>`
      : `<p class="pz-note-name">还没走到<span>未拼上</span></p><p class="pz-note-copy">这一块还空着。换一种活法，也许就会走到这里。</p>`;
    note.classList.add('in');
  };
  screen().querySelectorAll('.pz-piece').forEach(g => {
    g.addEventListener('click', () => show(g.dataset.id));
    g.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); show(g.dataset.id); }
    });
  });
  // 默认点亮第一块已解锁的，没有就点亮第一块
  const first = list.find(e => counts[e.id]) || list[0];
  if (first) show(first.id);
}

// 备份 / 恢复：记录只认 origin，换浏览器或换端口就断了，所以给一条搬家的路
function wireStore(mainEndings, save, handlers) {
  const msg = screen().querySelector('#store-msg');
  const say = t => { if (msg) { msg.textContent = t; msg.hidden = false; } };

  const exp = screen().querySelector('#btn-export');
  if (exp) exp.addEventListener('click', () => {
    const payload = archivePayload();
    if (!payload.records.length) { say('还没有记录，先走完一局再来备份。'); return; }
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const name = `及时雨人生重开-记录-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    say(`已导出 ${payload.records.length} 局记录，文件在「下载」里。`);
  });

  const imp = screen().querySelector('#btn-import');
  const file = screen().querySelector('#file-import');
  if (imp && file) {
    imp.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const done = text => {
        const r = mergeArchive(text);
        if (!r.ok) { say(r.error); return; }
        // 重画整页，把补进来的记录一并算进拼图与成就
        renderMe(mainEndings, save, handlers,
          r.added ? `补进 ${r.added} 局，现在一共 ${r.total} 局。` : `这些记录这里都已经有了（${r.total} 局）。`);
      };
      if (f.text) f.text().then(done).catch(() => say('文件读不出来，换一个备份文件试试。'));
      else {
        const fr = new FileReader();
        fr.onload = () => done(String(fr.result));
        fr.onerror = () => say('文件读不出来，换一个备份文件试试。');
        fr.readAsText(f);
      }
    });
  }
}

const reduceMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// 逐字流出（中文按字符），句读处略作停顿；返回 skip 供点击跳过
function typeText(el, text, onDone) {
  if (reduceMotion()) {
    el.textContent = text;
    onDone();
    return { skip() {} };
  }
  const chars = Array.from(text);
  let i = 0;
  let done = false;
  let timer = 0;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.textContent = text;
    onDone();
  };
  const tick = () => {
    if (done) return;
    i += 1;
    el.textContent = chars.slice(0, i).join('');
    typeTick();
    if (i >= chars.length) { finish(); return; }
    const ch = chars[i - 1];
    // 句末长停、句读短停——读起来才像有人在慢慢讲
    const pause = /[。！？…]/.test(ch) ? 170 : /[，、；：]/.test(ch) ? 65 : 24;
    timer = setTimeout(tick, pause);
  };
  timer = setTimeout(tick, 110);
  return { skip: finish };
}

// 音效开关：一个喇叭图标，点一下静音/恢复，状态记在本地
function soundToggle(extra = '') {
  const off = isMuted();
  return `<button class="sound-toggle${off ? ' off' : ''}${extra ? ' ' + extra : ''}" id="btn-sound"
    aria-pressed="${!off}" aria-label="${off ? '打开打字音效' : '关闭打字音效'}"
    title="${off ? '打开打字音效' : '关闭打字音效'}">${icon(off ? 'volumeX' : 'volume2')}</button>`;
}
function homeBtn() {
  return `<button class="game-home" id="btn-game-home">${icon('home')}<span>主页</span></button>`;
}
function wireSound() {
  screen().querySelectorAll('.sound-toggle').forEach(b => {
    if (b.dataset.wired) return;
    b.dataset.wired = '1';
    b.addEventListener('click', () => {
      setMuted(!isMuted());
      const off = isMuted();
      b.classList.toggle('off', off);
      b.innerHTML = icon(off ? 'volumeX' : 'volume2');
      b.setAttribute('aria-pressed', String(!off));
      const label = off ? '打开打字音效' : '关闭打字音效';
      b.setAttribute('aria-label', label);
      b.title = label;
      if (!off) typeTick(true); // 打开时当场响一声，确认没白点
    });
  });
}

let activeType = null;

function optionsHtml(item) {
  return item.options.map((o, i) => `
    <button class="btn option" data-i="${i}" disabled>
      <span class="option-text">${o.text}</span>
      <span class="option-detail">${o.detail || ''}</span>
    </button>`).join('');
}

// 对话流页：顶部人生之树 → 旁白逐字流出 → 玩家选项气泡依次浮现
function renderFlow({ kicker, scene, item, treeSteps, luck, prepare, onHome }, onChoose) {
  setScreen(`
    <section class="card flow${luck ? ' flow-luck' : ''}">
      <div class="tree-wrap">${treeSvg(treeSteps, { pending: item.options.length })}</div>
      <div class="kicker-row">
        <p class="kicker">${kicker}</p>
        <span class="kicker-actions">${soundToggle()}${homeBtn()}</span>
      </div>
      ${prepare ? `<div class="prepare-chip">✓ 前置准备：${prepare}</div>` : ''}
      <div class="narr-stream">
        <div class="bubble bubble-narrator"><p class="bubble-text" id="narr"></p><span class="caret"></span></div>
      </div>
      <p class="tap-hint" id="tap-hint">轻触跳过</p>
      <div class="options" id="opts">${optionsHtml(item)}</div>
    </section>`);

  const bubble = screen().querySelector('.bubble-narrator');
  const textEl = screen().querySelector('#narr');
  const hint = screen().querySelector('#tap-hint');
  const optsBox = screen().querySelector('#opts');
  const home = screen().querySelector('#btn-game-home');
  if (home && onHome) home.addEventListener('click', onHome);
  wireSound();

  const showOptions = () => {
    bubble.classList.add('done');
    if (hint) hint.remove();
    if (optsBox.classList.contains('ready')) return;
    optsBox.classList.add('ready');
    optsBox.querySelectorAll('.option').forEach((b, i) => {
      b.style.animationDelay = `${i * 70}ms`;
      b.disabled = false;
    });
    activeType = null;
  };

  activeType = typeText(textEl, scene, showOptions);
  // 急着选的时候，先点一下把话听完
  bubble.addEventListener('click', () => {
    if (activeType) { activeType.skip(); activeType = null; showOptions(); }
  });
  if (hint) hint.addEventListener('click', () => { if (activeType) { activeType.skip(); activeType = null; showOptions(); } });

  optsBox.querySelectorAll('.option').forEach(b =>
    b.addEventListener('click', () => { if (!b.disabled) onChoose(Number(b.dataset.i)); }));
}

export function renderStage(stage, treeSteps, onDone, pendingCount, perspName, onHome) {
  setScreen(`
    <section class="card stage">
      <div class="tree-wrap">${treeSvg(treeSteps, { pending: pendingCount || 0 })}</div>
      <div class="kicker-row">
        <p class="kicker">${perspName ? perspName + ' · ' : ''}${stage.age} 岁 · ${stage.title}</p>
        <span class="kicker-actions">${soundToggle()}${homeBtn()}</span>
      </div>
      <div class="narr-stream">
        <div class="bubble bubble-narrator"><p class="bubble-text" id="narr"></p><span class="caret"></span></div>
      </div>
      <p class="tap-hint" id="tap-hint">轻触跳过</p>
      <button class="btn btn-primary btn-block" id="btn-stage-next" disabled>走进这一岁</button>
    </section>`);

  const bubble = screen().querySelector('.bubble-narrator');
  const textEl = screen().querySelector('#narr');
  const hint = screen().querySelector('#tap-hint');
  const next = screen().querySelector('#btn-stage-next');
  const home = screen().querySelector('#btn-game-home');
  if (home && onHome) home.addEventListener('click', onHome);
  wireSound();
  const reveal = () => {
    bubble.classList.add('done');
    if (hint) hint.remove();
    next.disabled = false;
    activeType = null;
  };
  activeType = typeText(textEl, stage.intro, reveal);
  const skip = () => { if (activeType) { activeType.skip(); activeType = null; reveal(); } };
  bubble.addEventListener('click', skip);
  if (hint) hint.addEventListener('click', skip);
  next.addEventListener('click', onDone);
}

// 决策页：顶部是人生之树（保留已走过的全部路径），下方是场景与选项
export function renderDecision(decision, treeSteps, onChoose, onHome) {
  renderFlow({
    kicker: `${decision.age} 岁 · ${decision.title}`,
    scene: decision.scene,
    item: decision,
    treeSteps,
    onHome,
  }, onChoose);
}

export function renderEvent(event, treeSteps, onChoose, onHome) {
  renderFlow({
    kicker: `${event.luck ? '插曲 · 好运' : '插曲'} · ${event.title}`,
    scene: event.scene,
    item: event,
    treeSteps,
    luck: !!event.luck,
    prepare: event.prepare,
    onHome,
  }, onChoose);
}

// 选择结果弹窗：居中弹出，先亮出「你说」的原话，再揭晓数值
export function showOutcome({ kicker, choice, delta, bomb, note, luck }, onNext) {
  closeOutcome();
  const layer = document.createElement('div');
  layer.className = 'outcome-layer';
  layer.id = 'outcome';
  layer.innerHTML = `
    <div class="outcome-mask"></div>
    <div class="outcome-panel" role="dialog" aria-modal="true">
      <p class="kicker">${kicker || '你的选择'}</p>
      <div class="outcome-choice"><span class="said-label">你说</span>${choice}</div>
      <div class="outcome-rule"></div>
      <div class="chips">${deltaChips(delta)}</div>
      ${bomb ? `<p class="outcome-bomb">${bomb}</p>` : ''}
      ${note ? `<p class="outcome-note">${note}</p>` : ''}
      ${luck ? '<p class="outcome-note outcome-luck">这一次，是运气站在了你这边。</p>' : ''}
      <button class="btn btn-primary btn-block" id="btn-outcome-next">继续往前走</button>
    </div>`;
  app().appendChild(layer);
  const close = () => { closeOutcome(); onNext(); };
  layer.querySelector('#btn-outcome-next').addEventListener('click', close);
  layer.querySelector('.outcome-mask').addEventListener('click', close);
}

function closeOutcome() {
  const o = document.querySelector('#outcome');
  if (o) o.remove();
}

export function renderEnding(r, handlers) {
  const { state, ending, badgeList, score, revealed } = r;
  hideAttrBar(); // 结算页下方已列属性，顶部条不重复占位
  setScreen(`
    <section class="card ending">
      ${r.incomplete ? `<p class="banner">开发中（D3 进度）：已录入 ${r.loaded}/${r.total} 个抉择（17–22 岁），完整一局为 24 个抉择、7 个人生阶段。本页数值仅用于验证流程，不代表最终平衡。</p>` : ''}
      ${brandCorner()}
      <p class="kicker">${score.stream.name} · 此生结算</p>
      <div class="score-row">
        <span class="score-total">${score.total}</span>
        <span class="score-grade">${score.grade} 级人生</span>
      </div>
      <h2 class="ending-name">${ending.name}</h2>
      <p class="ending-copy">「${ending.copy}」</p>
      ${badgeList.length ? `<div class="badges">${badgeList.map(b => `<span class="badge">${b.name}</span>`).join('')}</div>` : ''}
      <div class="final-attrs">
        <div><span>${attrIcon('lifespan')}寿命</span><b>${state.attrs.lifespan} 岁</b></div>
        <div><span>${attrIcon('money')}金钱</span><b class="${state.attrs.money < 0 ? 'attr-negative' : ''}">${fmtMoneyRaw(state.attrs.money)}</b></div>
        <div><span>${attrIcon('freedom')}自由</span><b>${state.attrs.freedom}</b></div>
        <div><span>${attrIcon('health')}健康</span><b>${state.attrs.health}</b></div>
      </div>
      ${r.perspNote ? `<p class="ending-persp">${r.perspNote}</p>` : ''}
      ${revealed.length ? `<div class="hidden-reveal"><p class="kicker">到最后才揭晓的账</p><ul>${revealed.map(h => `<li>${h.note}：${fmtMoneyRaw(h.money)}</li>`).join('')}</ul></div>` : ''}
      ${r.newAch && r.newAch.length ? `<div class="new-ach">
        <p class="kicker">新解锁 · ${r.newAch.length} 个成就</p>
        <div class="new-ach-list">${r.newAch.map(a => `<span class="ach-chip">${icon(a.icon)}${a.name}</span>`).join('')}</div>
      </div>` : ''}
      ${state.history.length ? `<details class="run-log">
        <summary>这一生的 ${state.history.length} 步</summary>
        <ol>${state.history.map(h => `<li><span class="log-age">${h.age} 岁</span><span class="log-text">${h.text}</span></li>`).join('')}</ol>
      </details>` : ''}
      <p class="stats">第 ${r.runNo} 局 · 本局 ${state.history.length} 个抉择 · ${attrIcon('legalRisk')}法律风险 ${state.attrs.legalRisk} · ${attrIcon('fraudHits')}中招 ${state.attrs.fraudHits} 次</p>
      <div class="ending-actions">
        <button class="btn btn-primary" id="btn-rewind">回到上一个岔路口</button>
        <button class="btn btn-ghost" id="btn-share">生成人生卡片</button>
        <button class="btn btn-ghost" id="btn-restart">同一活法，重开一次</button>
        <button class="btn btn-ghost" id="btn-home">回到主页 · 换一种活法</button>
        <button class="btn btn-ghost" id="btn-me">我的记录</button>
      </div>
    </section>`);
  const q = id => screen().querySelector(id);
  q('#btn-rewind').addEventListener('click', handlers.onRewind);
  q('#btn-restart').addEventListener('click', handlers.onRestart);
  q('#btn-home').addEventListener('click', handlers.onHome);
  q('#btn-me').addEventListener('click', handlers.onMe);
  q('#btn-share').addEventListener('click', () => {
    const b = q('#btn-share');
    b.disabled = true;
    b.textContent = '正在生成…';
    Promise.resolve(handlers.onShare()).finally(() => {
      b.disabled = false;
      b.textContent = '生成人生卡片';
    });
  });
}

// 分享卡预览：9:16 竖版，长按保存或直接下载（纯前端，无服务端）
export async function openShareCard(payload) {
  let dataUrl = '';
  try {
    const canvas = await buildShareCard(payload);
    dataUrl = canvas.toDataURL('image/png');
  } catch (e) {
    return;
  }
  const old = document.querySelector('#share-sheet');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'share-sheet';
  el.id = 'share-sheet';
  el.innerHTML = `
    <div class="share-panel">
      <p class="share-tip">长按图片保存，或点下面的按钮下载</p>
      <img class="share-img" src="${dataUrl}" alt="我的人生卡片" />
      <div class="share-actions">
        <button class="btn btn-primary btn-block" id="btn-share-save">保存图片</button>
        <button class="btn btn-ghost btn-block" id="btn-share-close">回到结算</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#btn-share-save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `及时雨-人生重开-${payload.ending.name}.png`;
    a.click();
  });
  el.querySelector('#btn-share-close').addEventListener('click', () => el.remove());
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

// 页脚：品牌为主；内容许可收进一个不显眼的入口（CC BY 4.0 要求可被查阅）
export function renderFooter(attribution) {
  const brand = attribution.brand || {};
  document.querySelector('#site-footer').innerHTML = `
    <p class="footer-brand">${brand.name || 'TR及时雨'}${brand.latin ? ' · ' + brand.latin : ''}</p>
    <p>${attribution.disclaimer}</p>
    <p class="footer-legal">部分内容基于开源知识库改编 · <button id="btn-legal">查看许可与声明</button></p>`;
  document.querySelector('#btn-legal').addEventListener('click', () => openLegal(attribution));
}

function openLegal(a) {
  const old = document.querySelector('#legal-sheet');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'legal-sheet';
  el.id = 'legal-sheet';
  el.innerHTML = `
    <div class="legal-panel">
      <h3>内容许可与声明</h3>
      <p>本作品部分文字内容改编自开源作品《${a.workTitle}》（<a href="${a.workUrl}" target="_blank" rel="noopener">原作仓库</a>），
      依据 <a href="${a.licenseUrl}" target="_blank" rel="noopener">${a.licenseName}</a> 许可使用，${a.modifiedNote}：
      原文建议已被改写为游戏选项与情境叙事，数值与结局均为虚构演绎。</p>
      <p>${a.disclaimer}</p>
      ${(a.assets || []).length ? `<div class="legal-assets">
        <p class="kicker">字体与图标</p>
        <ul>${a.assets.map(x => `<li><b>${x.what}</b>：${x.name}${x.author ? '（' + x.author + '）' : ''}，<a href="${x.licenseUrl}" target="_blank" rel="noopener">${x.licenseName}</a>${x.note ? ' · ' + x.note : ''}</li>`).join('')}</ul>
      </div>` : ''}
      <button class="btn btn-primary btn-block" id="btn-legal-close">知道了</button>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelector('#btn-legal-close').addEventListener('click', close);
}
