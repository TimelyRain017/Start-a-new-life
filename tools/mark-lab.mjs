// tools/mark-lab.mjs — 图标几何试片：一次渲染多个候选，拼成对比图看效果
// 用法：node tools/mark-lab.mjs  →  .shots/lab.png
// 只用于比稿，不影响 public/ 里的正式产物。
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pw from 'file:///C:/Users/86176/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core/index.js';

const OUT = fileURLToPath(new URL('../.shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const INK = '#0a0a0a';
const PAPER = '#ffffff';

const pen = (inner, c) =>
  `<g fill="none" stroke="${c}" stroke-linecap="butt" stroke-linejoin="miter">${inner}</g>`;

// 主形：旋转 45° 的 T —— 长笔是那条路，短笔是从中点岔出去的一支
const T45 = (c, { w = 9.5, tail = 47, a = 12, b = 52 } = {}) =>
  pen(
    `<path d="M${a} ${b} L${b} ${a}" stroke-width="${w}"/>` +
      `<path d="M32 32 L${tail} ${tail}" stroke-width="${w}"/>`,
    c
  );

// 海报版：同款两笔 + 一个方点，点在主笔左上方，构成三角重心
const T45dot = (c, { w = 9.5, tail = 47, dot = [22, 22], ds = 8.6 } = {}) =>
  T45(c, { w, tail }) +
  `<rect x="${dot[0] - ds / 2}" y="${dot[1] - ds / 2}" width="${ds}" height="${ds}" fill="${c}"/>`;

// 主次版：横粗支细，一眼分得清「大路」和「岔出去的那条」
const T45thin = (c, { w = 10.5, w2 = 6.6, tail = 47 } = {}) =>
  pen(
    `<path d="M12 52 L52 12" stroke-width="${w}"/>` + `<path d="M32 32 L${tail} ${tail}" stroke-width="${w2}"/>`,
    c
  );

const CANDS = [
  { id: 'w95-47', name: 'A1', sub: '等粗 9.5 / 支 47', mark: (c) => T45(c, { w: 9.5, tail: 47 }) },
  { id: 'w105-48', name: 'A3', sub: '等粗 10.5', mark: (c) => T45(c, { w: 10.5, tail: 48 }) },
  { id: 'thin1', name: 'A6', sub: '主 10.5 / 支 6.6', mark: (c) => T45thin(c, { w: 10.5, w2: 6.6 }) },
  { id: 'thin2', name: 'A7', sub: '主 11 / 支 7.2', mark: (c) => T45thin(c, { w: 11, w2: 7.2, tail: 48 }) },
  { id: 'dot', name: 'A5 · 带点', sub: '海报版，加点作重音', mark: (c) => T45dot(c, { w: 9.5, tail: 47 }) },
];

const svg = (mark, { bg, round = 14 } = {}) =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
     <rect width="64" height="64" rx="${round}" fill="${bg}"/>
     ${mark(bg === INK ? PAPER : INK)}
   </svg>`;

const card = (c, bg) => `
  <div class="card">
    <div class="row">
      <div class="big">${svg(c.mark, { bg })}</div>
      <div class="stack">
        <div class="m">${svg(c.mark, { bg })}</div>
        <div class="s">${svg(c.mark, { bg })}</div>
        <div class="xs">${svg(c.mark, { bg })}</div>
        <div class="xxs">${svg(c.mark, { bg })}</div>
      </div>
    </div>
    <div class="meta"><b>${c.name}</b><span>${c.sub}</span></div>
  </div>`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { margin:0; padding:26px; background:#f2f2f0; font-family:-apple-system,'PingFang SC',sans-serif; }
  .grid { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; }
  .card { background:#fff; border-radius:12px; padding:14px; }
  .row { display:flex; gap:12px; align-items:flex-start; }
  .big svg { width:104px; height:104px; display:block; }
  .stack { display:flex; flex-direction:column; gap:7px; align-items:center; padding-top:2px; }
  .stack svg { display:block; }
  .m svg { width:34px; height:34px; } .s svg { width:24px; height:24px; }
  .xs svg { width:16px; height:16px; } .xxs svg { width:12px; height:12px; }
  .meta { margin-top:12px; }
  .meta b { display:block; font-size:12px; font-weight:600; }
  .meta span { font-size:10.5px; color:#999; }
  .row2 { margin-top:24px; }
  .hd { font-size:11px; letter-spacing:2px; color:#aaa; margin:0 0 10px; }
  .zoom { margin-top:24px; display:flex; gap:0; align-items:center; }
  .zoom div { padding:4px; background:#fff; margin-right:2px; }
  .zoom svg { display:block; image-rendering:pixelated; }
</style></head><body>
  <p class="hd">黑底白形（标签栏首选）</p>
  <div class="grid">${CANDS.map((c) => card(c, INK)).join('')}</div>
  <div class="row2"></div>
  <p class="hd">白底黑形（海报原味）</p>
  <div class="grid">${CANDS.map((c) => card(c, PAPER)).join('')}</div>
  <div class="row2"></div>
  <p class="hd">16px 像素级放大（左：A1，右：A3）</p>
  <div class="zoom" id="zoom"></div>
  <script>
    const z = document.getElementById('zoom');
    for (const w of [9.5, 10.5]) {
      const d = Math.round(w / 64 * 16 * 8) / 8;
      const tail = w === 9.5 ? 47 : 48;
      z.insertAdjacentHTML('beforeend', '<div><svg viewBox="0 0 16 16" width="256" height="256"><rect width="16" height="16" rx="3.5" fill="#0a0a0a"/><g stroke="#fff" stroke-linecap="butt" stroke-width="' + d + '"><path d="M3 13 L13 3"/><path d="M8 8 L' + ((tail/64)*16) + ' ' + ((tail/64)*16) + '"/></g></svg></div>');
    }
  </script>
</body></html>`;

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: OUT + 'lab.png', fullPage: true });
await browser.close();
console.log('→ .shots/lab.png');
