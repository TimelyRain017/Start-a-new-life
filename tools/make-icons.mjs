// tools/make-icons.mjs — 从一份 SVG 定义生成全站图标（favicon / iOS / PWA）
// 说明：本脚本依赖 playwright 的 chromium 做 SVG→PNG 栅格化，不在 package.json 里，
//      跑之前先 `npx playwright install chromium` 或用本机已有 chromium。
//      改品牌色改 PALETTE；换图形改 MARK（'T' 丁字路口 / 'Y' 岔路），再跑一次即可。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pw from 'file:///C:/Users/86176/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core/index.js';

// 必须用 fileURLToPath：目录名带中文时 URL.pathname 会缩成 %E4%BA%A7… 的转义形式
const OUT = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const PALETTE = {
  ink: '#1e2529',   // 底：与正文色同源的墨蓝
  g1: '#fdf3e0',    // 笔画高光
  g2: '#dcb877',    // 晨光金
  g3: '#bf9445',    // 笔画暗部
};

// 图形：主线 + 支路。两条几何都留在下面，改 MARK 一行就能换。
const MARK = 'T';
const MARKS = {
  // T 型路口：横是那条大路（粗），竖是走进去的支路（细）。T 也是 TimelyRain 的首字母，
  // 英文里 T-junction 就是丁字路口 —— IP 与主题共用一笔。
  T: `<g fill="none" stroke="url(#mark)" stroke-linecap="round">
        <path d="M13 26.5Q32 24.2 51 26.5" stroke-width="7.8"/>
        <path d="M32 28.4V51" stroke-width="5.9"/>
      </g>`,
  // Y 岔路：一眼就是分叉与选择。两枝角度略微不对称——总有一条是你没走的。
  Y: `<g fill="none" stroke="url(#mark)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 52V35.5"/>
        <path d="M32 35.5 22.8 17.5"/>
        <path d="M32 35.5 41.2 19"/>
      </g>`,
};

// 图标主体（viewBox 0 0 64 64）。rx 传 0 = 满出血（给 iOS / maskable 用）
// 渐变必须 userSpaceOnUse：objectBoundingBox 在零宽度的竖直笔上会退化，整笔直接不渲染（踩过）
function body({ rx = 14.5, pad = 0, size = 64 } = {}) {
  const s = size / 64;
  return `
  <rect width="${size}" height="${size}" rx="${rx}" fill="${PALETTE.ink}"/>
  <g transform="translate(${pad},${pad}) scale(${s})">
    <defs>
      <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="10" y1="14" x2="54" y2="54">
        <stop offset="0" stop-color="${PALETTE.g1}"/>
        <stop offset=".5" stop-color="${PALETTE.g2}"/>
        <stop offset="1" stop-color="${PALETTE.g3}"/>
      </linearGradient>
    </defs>
    ${MARKS[MARK]}
  </g>`;
}

const wrap = (inner, vb = 64) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}">${inner}</svg>`;

// ── 1. 矢量 favicon（浏览器优先用这个，任意缩放都锐利） ──────────
writeFileSync(OUT + 'icon.svg', wrap(body()) + '\n');

// ── 2. Safari 固定标签页用的单色版（系统自己上色，只能有一个色） ──
const mono = MARKS[MARK].replace(/stroke="url\(#mark\)"/g, 'stroke="#000"');
writeFileSync(OUT + 'safari-pinned-tab.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  ${mono}
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

console.log(`生成 PNG（图形：${MARK}）：`);
await png(wrap(body()), 32, 'icon-32.png');
await png(wrap(body()), 180, 'icon-180.png');
await png(wrap(body()), 192, 'icon-192.png');
await png(wrap(body()), 512, 'icon-512.png');
// iOS 会自己裁圆角：给满出血 + 不透明，否则套两层圆角
await png(wrap(body({ rx: 0 })), 180, 'apple-touch-icon.png', true);
// Android 自适应图标：内容收进中间 80% 安全区
await png(wrap(body({ rx: 0, pad: 10, size: 80 }), 80), 512, 'icon-maskable-512.png', true);

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
