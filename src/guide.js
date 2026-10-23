// guide.js — 第一次进站的玩法引导（聚光灯式）
// 第一屏先交代这是什么，之后把高亮框依次打到主页上的真实元素：
// 视角按钮 → 视角说明 → 活法 → 记录条。走完写标记，跳过也算看过。
// 洞内可点（标了 free 的步骤），其余区域由 SVG 遮罩拦截，不会误触到「开始这一局」。
import { KEYS, readRaw, writeRaw } from './storage.js';

const STEPS = [
  {
    title: '先花一分钟，看看这页怎么用',
    body: '没有账号，也没有教程。你只要选两样东西 —— 一个视角、一种活法，然后一路走到 55 岁。',
    next: '带我看看',
  },
  {
    target: '.views',
    free: true, // 洞内可点：让人真的点一下试试
    title: '① 先选一个视角',
    body: '同一段人生，两种看法。它只换讲法，不动任何数值 —— 挑你更愿意听的那个。',
  },
  {
    target: '.sub',
    title: '② 换个视角，这段就换了',
    body: '上面这段话会跟着视角换口吻。选错了随时改，不影响这一局的任何数值。',
  },
  {
    target: '.streams',
    title: '③ 再选一种活法',
    body: '活法决定评分往哪儿偏：对应属性的权重 ×1.5。护命选长寿，攒钱选财富，留退路选自由。',
  },
  {
    target: '.me-strip',
    title: '④ 这里记着你走过的路',
    body: '走完的局、拼上的图块、解锁的成就都收在「我的」里，点这条就能进。',
  },
  {
    title: '剩下的，走一遍就懂了',
    body: '55 岁才结算，8 个结局散在拼图里。有些选项当场看着赚，往后要连本带利地还。',
    next: '开始这一生',
  },
];

const seen = () => readRaw(KEYS.guide) === 'done';
const markSeen = () => writeRaw(KEYS.guide, 'done');

// 等开场幕布真的拆掉再弹：幕布是淡出的，「booting」类撤掉后还要 0.7s 才移除节点，
// 这期间弹出引导等于让它的入场动画浪费在残影下面。
function whenCurtainUp(cb) {
  let ticks = 0;
  const ready = () => !document.querySelector('#boot');
  if (ready()) { cb(); return; }
  const t = setInterval(() => {
    ticks++;
    if (ready() || ticks > 125) { clearInterval(t); cb(); } // 15s 兜底：幕布万一没拆，也别永远不弹
  }, 120);
}

// 圆角矩形路径（给 SVG 遮罩挖洞用）
function roundRect(x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + rad} ${y}H${x + w - rad}A${rad} ${rad} 0 0 1 ${x + w} ${y + rad}`
    + `V${y + h - rad}A${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}`
    + `H${x + rad}A${rad} ${rad} 0 0 1 ${x} ${y + h - rad}`
    + `V${y + rad}A${rad} ${rad} 0 0 1 ${x + rad} ${y}Z`;
}

let live = null;

export function openGuide(opts = {}) {
  if (live) return live;
  if (document.querySelector('#tour')) return null;

  // 只留能定位到的步骤：不在主页（比如从结算页打开）时，也不会指着空气讲
  const steps = STEPS.filter(s => !s.target || document.querySelector(s.target));

  const el = document.createElement('div');
  el.className = 'tour';
  el.id = 'tour';
  el.innerHTML = `
    <svg class="tour-dim" id="tour-dim" aria-hidden="true" preserveAspectRatio="none">
      <path fill-rule="evenodd" d=""/>
    </svg>
    <div class="tour-ring" id="tour-ring" aria-hidden="true" hidden></div>
    <div class="tour-block" id="tour-block" aria-hidden="true"></div>
    <div class="tour-card" id="tour-card" role="dialog" aria-modal="true"
         aria-labelledby="tour-title" tabindex="-1">
      <div class="tour-head">
        <span class="tour-count" id="tour-count"></span>
        <button class="tour-skip" id="tour-skip">跳过</button>
      </div>
      <h2 class="tour-title" id="tour-title"></h2>
      <p class="tour-body" id="tour-body"></p>
      <div class="tour-foot">
        <div class="tour-dots" id="tour-dots" aria-hidden="true"></div>
        <div class="tour-btns">
          <button class="tour-btn ghost" id="tour-prev">上一步</button>
          <button class="tour-btn solid" id="tour-next">下一步</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const $ = id => el.querySelector('#' + id);
  const refs = {
    svg: $('tour-dim'),
    dim: $('tour-dim').querySelector('path'),
    ring: $('tour-ring'),
    block: $('tour-block'),
    card: $('tour-card'),
    count: $('tour-count'),
    title: $('tour-title'),
    body: $('tour-body'),
    dots: $('tour-dots'),
    prev: $('tour-prev'),
    next: $('tour-next'),
    skip: $('tour-skip'),
  };

  let i = 0;
  let closed = false;
  let raf = 0;

  refs.dots.innerHTML = steps.map((_, k) => `<i${k === 0 ? ' class="on"' : ''}></i>`).join('');

  // 目标元素的位置（外扩 8px，再夹进视口）
  function measure(step) {
    if (!step.target) return null;
    const t = document.querySelector(step.target);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    let x = r.left - pad;
    let y = r.top - pad;
    let w = r.width + pad * 2;
    let h = r.height + pad * 2;
    if (x < 6) { w -= 6 - x; x = 6; }
    if (y < 6) { h -= 6 - y; y = 6; }
    if (x + w > vw - 6) w = vw - 6 - x;
    if (y + h > vh - 6) h = vh - 6 - y;
    return { x, y, w: Math.max(10, w), h: Math.max(10, h) };
  }

  function placeCard(rect, vw, vh) {
    const card = refs.card;
    card.style.visibility = 'hidden';
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    let left;
    let top;
    let side = '';
    if (!rect) {
      left = Math.round((vw - cw) / 2);
      top = Math.round((vh - ch) / 2);
    } else {
      const gap = 16;
      if (rect.y + rect.h + gap + ch + 10 <= vh) { top = rect.y + rect.h + gap; side = 'below'; }
      else if (rect.y - gap - ch - 10 >= 0) { top = rect.y - gap - ch; side = 'above'; }
      else top = vh - ch - 14; // 目标太高，上下都放不下：贴屏幕底部，至少把目标的上半截露出来
      left = Math.round(Math.max(16, Math.min(vw - cw - 16, rect.x + rect.w / 2 - cw / 2)));
      // 箭头对着目标中心，别跑到卡片外面
      const arrow = Math.round(Math.max(20, Math.min(cw - 20, rect.x + rect.w / 2 - left)));
      card.style.setProperty('--arrow-x', arrow + 'px');
    }
    top = Math.max(10, Math.min(vh - ch - 10, top));
    // 压到高亮框上就没有「指着谁」这回事了，箭头收起来（否则会插进卡片里）
    if (rect && side) {
      const overlap = top < rect.y + rect.h && top + ch > rect.y
        && left < rect.x + rect.w && left + cw > rect.x;
      if (overlap) side = '';
    }
    card.classList.toggle('below', side === 'below');
    card.classList.toggle('above', side === 'above');
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.visibility = 'visible';
  }

  // 拦截点击：不用 SVG 的洞来做命中测试（Chrome 不认 evenodd 的洞，会整块挡住），
  // 改成围着洞铺四条透明矩形，洞内是真的空的 —— 想让人点的地方才点得到。
  function block(rect, free, vw, vh) {
    const rects = [];
    if (!rect) {
      rects.push({ x: 0, y: 0, w: vw, h: vh });
    } else {
      rects.push({ x: 0, y: 0, w: vw, h: rect.y });
      rects.push({ x: 0, y: rect.y + rect.h, w: vw, h: vh - rect.y - rect.h });
      rects.push({ x: 0, y: rect.y, w: rect.x, h: rect.h });
      rects.push({ x: rect.x + rect.w, y: rect.y, w: vw - rect.x - rect.w, h: rect.h });
      // 不让点的步骤，把洞也补上：这几处点下去会直接开局，引导就断了
      if (!free) rects.push(rect);
    }
    refs.block.innerHTML = rects
      .filter(r => r.w > 0.5 && r.h > 0.5)
      .map(r => `<i style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"></i>`)
      .join('');
  }

  function layout() {
    if (closed) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const step = steps[i];
    const rect = measure(step);
    const outer = `M0 0H${vw}V${vh}H0Z`;

    refs.svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    if (rect) {
      const rad = Math.min(14, rect.h / 2);
      refs.dim.setAttribute('d', outer + roundRect(rect.x, rect.y, rect.w, rect.h, rad));
      refs.ring.hidden = false;
      refs.ring.style.left = rect.x + 'px';
      refs.ring.style.top = rect.y + 'px';
      refs.ring.style.width = rect.w + 'px';
      refs.ring.style.height = rect.h + 'px';
      refs.ring.style.borderRadius = rad + 'px';
    } else {
      refs.dim.setAttribute('d', outer);
      refs.ring.hidden = true;
    }
    block(rect, !!step.free, vw, vh);
    placeCard(rect, vw, vh);
  }

  function paint(step) {
    refs.count.textContent = `${i + 1} / ${steps.length}`;
    refs.title.textContent = step.title;
    refs.body.textContent = step.body;
    refs.next.textContent = step.next || (i === steps.length - 1 ? '开始这一生' : '下一步');
    refs.prev.style.visibility = i === 0 ? 'hidden' : 'visible';
    Array.prototype.forEach.call(refs.dots.children, (d, k) => d.classList.toggle('on', k === i));
  }

  function go(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const step = steps[i];
    paint(step);
    // 先把页面挪到「高亮框 + 说明卡都放得下」的位置，再谈绘制
    if (step.target) {
      const t = document.querySelector(step.target);
      if (t) {
        const vh = window.innerHeight;
        const ch = refs.card.offsetHeight;
        const r = t.getBoundingClientRect();
        const fitsBelow = r.bottom + 26 + ch + 10 <= vh;
        const fitsAbove = r.top - 26 - ch - 10 >= 0;
        if (!fitsBelow && !fitsAbove) {
          // 上下都塞不下（活法区那种高块）：把目标顶到上面去，下面整块留给卡片
          t.scrollIntoView({ block: 'start', behavior: 'auto' });
          window.scrollBy(0, t.getBoundingClientRect().top - 14);
        } else if (r.top < 60 || r.bottom > vh - 60) {
          t.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        }
      }
    } else {
      window.scrollTo(0, 0); // 首尾两张居中卡：回到页顶，别让人停在页面半截
    }
    requestAnimationFrame(() => requestAnimationFrame(layout));
  }

  function close() {
    if (closed) return;
    closed = true;
    markSeen();
    live = null;
    window.removeEventListener('scroll', onView);
    window.removeEventListener('resize', onView);
    document.removeEventListener('keydown', onKey);
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
    if (opts.onClose) opts.onClose();
  }

  function onView() {
    if (raf || closed) return;
    raf = requestAnimationFrame(() => { raf = 0; layout(); });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      if (i === steps.length - 1) close(); else go(i + 1);
      return;
    }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
  }

  refs.next.addEventListener('click', () => (i === steps.length - 1 ? close() : go(i + 1)));
  refs.prev.addEventListener('click', () => go(i - 1));
  refs.skip.addEventListener('click', close);
  window.addEventListener('scroll', onView, { passive: true });
  window.addEventListener('resize', onView);
  document.addEventListener('keydown', onKey);

  paint(steps[0]);
  refs.card.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(layout));

  live = { close, next: () => (i === steps.length - 1 ? close() : go(i + 1)) };
  return live;
}

// 第一次进站自动弹一次；之后不再打扰
export function maybeShowGuide() {
  if (seen()) return;
  whenCurtainUp(() => {
    if (!seen()) openGuide();
  });
}

export const guideSeen = seen;
