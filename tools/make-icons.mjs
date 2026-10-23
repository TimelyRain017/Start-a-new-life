// tools/make-icons.mjs — 从一份 SVG 定义生成全站图标（favicon / iOS / PWA）
// 说明：本脚本依赖 playwright 的 chromium 做 SVG→PNG 栅格化，不在 package.json 里，
//      跑之前先 `npx playwright install chromium` 或用本机已有 chromium。
//      改了品牌色只要改下面 PALETTE，再 `node tools/make-icons.mjs` 重出全套。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pw from 'file:///C:/Users/86176/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core/index.js';

// 必须用 fileURLToPath：目录名带中文时 URL.pathname 会缩成 %E4%BA%A7… 的转义形式
const OUT = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const PALETTE = {
  ink: '#1e2529',   // 底：与正文字色同源的墨蓝
  g1: '#fdf3e0',    // 雨滴高光
  g2: '#dcb877',    // 晨光金
  g3: '#bb9040',    // 雨滴暗部
};

// 图标主体（viewBox 0 0 64 64）。rx 传 0 = 满出血（给 iOS / maskable 用）
function body({ rx = 14.5, pad = 0, size = 64 } = {}) {
  const s = size / 64;
  return `
  <rect width="${size}" height="${size}" rx="${rx}" fill="${PALETTE.ink}"/>
  <g transform="translate(${pad},${pad}) scale(${s})">
    <defs>
      <linearGradient id="drop" x1="0.18" y1="0" x2="0.52" y2="1">
        <stop offset="0" stop-color="${PALETTE.g1}"/>
        <stop offset=".48" stop-color="${PALETTE.g2}"/>
        <stop offset="1" stop-color="${PALETTE.g3}"/>
      </linearGradient>
    </defs>
    <path d="M32 6.6c0 0 14.2 19 14.2 29a14.2 14.2 0 0 1-28.4 0c0-10 14.2-29 14.2-29Z" fill="url(#drop)"/>
    <path d="M32 44.6V34.2M32 34.2 24.7 27M32 34.2 39.3 27"
          fill="none" stroke="${PALETTE.ink}" stroke-width="3.1"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

const wrap = (inner, vb = 64) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}">${inner}</svg>`;

// ── 1. 矢量 favicon（浏览器优先用这个，任意缩放都锐利） ──────────
writeFileSync(OUT + 'icon.svg', wrap(body()) + '\n');

// ── 2. Safari 固定标签页用的单色版（系统自己上色，只能有一个色） ──
writeFileSync(OUT + 'safari-pinned-tab.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <mask id="cut">
    <rect width="64" height="64" fill="#fff"/>
    <path d="M32 44.6V34.2M32 34.2 24.7 27M32 34.2 39.3 27" fill="none" stroke="#000" stroke-width="3.1" stroke-linecap="round"/>
  </mask>
  <path d="M32 6.6c0 0 14.2 19 14.2 29a14.2 14.2 0 0 1-28.4 0c0-10 14.2-29 14.2-29Z" fill="#000" mask="url(#cut)"/>
</svg>\n`);

// ── 3. 栅格化 ────────────────────────────────────────────────
const browser = await pw.chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

async function png(svg, size, file, opaque = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">
       <div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>
     </body></html>`,
    { waitUntil: 'load' }
  );
  await page.screenshot({
    path: OUT + file, omitBackground: !opaque,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  console.log('  ✓', file, `${size}×${size}`, opaque ? '(不透明)' : '(透明底)');
}

console.log('生成 PNG：');
await png(wrap(body()), 32, 'icon-32.png');
await png(wrap(body()), 180, 'icon-180.png');
await png(wrap(body()), 192, 'icon-192.png');
await png(wrap(body()), 512, 'icon-512.png');
// iOS 会自己裁圆角：给满出血 + 不透明，否则套两层圆角
await png(wrap(body({ rx: 0 })), 180, 'apple-touch-icon.png', true);
// Android 自适应图标：内容收进中间 80% 安全区
await png(wrap(body({ rx: 0, pad: 8, size: 80 }), 80), 512, 'icon-maskable-512.png', true);

// ── 4. favicon.ico（内含 16/32/48 三个 PNG，Vista 起通用） ──────
const icoSizes = [16, 32, 48];
const chunks = [];
for (const s of icoSizes) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${s}px;height:${s}px">${wrap(body()).replace('<svg ', `<svg width="${s}" height="${s}" `)}</div></body></html>`,
    { waitUntil: 'load' }
  );
  chunks.push({ s, buf: await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } }) });
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);           // reserved
header.writeUInt16LE(1, 2);           // type: icon
header.writeUInt16LE(chunks.length, 4);
let offset = 6 + 16 * chunks.length;
const dir = [];
for (const { s, buf } of chunks) {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);  // width
  e.writeUInt8(s >= 256 ? 0 : s, 1);  // height
  e.writeUInt8(0, 2);                 // 调色板数
  e.writeUInt8(0, 3);                 // reserved
  e.writeUInt16LE(1, 4);              // planes
  e.writeUInt16LE(32, 6);             // bpp
  e.writeUInt32LE(buf.length, 8);     // 数据长度
  e.writeUInt32LE(offset, 12);        // 数据偏移
  offset += buf.length;
  dir.push(e);
}
writeFileSync(OUT + 'favicon.ico', Buffer.concat([header, ...dir, ...chunks.map(c => c.buf)]));
console.log('  ✓ favicon.ico (16/32/48)');

await browser.close();
console.log('全部写入 public/');
