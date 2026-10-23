// share.js — canvas 分享卡（9:16 竖版，PRD F9 / 里程碑 D7）
// 版式沿用预演定稿：品牌条 → 流派与视角 → 综合评分 → 结局名 → 金句 → 属性 → 徽章 → 脚注
// 全部本地绘制：无服务端、无外部字体、无网络请求。
import trLogo from './assets/tr-logo.png';

const W = 1080;
const H = 1920;
const PAD = 96;
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

const fmtMoney = v => (v < 0 ? '−¥' : '¥') + Math.abs(v).toLocaleString('en-US');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (line && ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImg(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// 卡面下半部：这一生的三个岔路口（比装饰图形更有信息量，也更能引起共鸣）
function drawMoments(ctx, topY, history) {
  const picks = [];
  const n = history.length;
  if (n >= 3) {
    [0.22, 0.5, 0.8].forEach(r => {
      let i = Math.min(n - 1, Math.max(0, Math.round(n * r)));
      while (picks.includes(i) && i < n - 1) i++;
      if (!picks.includes(i)) picks.push(i);
    });
  } else {
    history.forEach((_, i) => picks.push(i));
  }
  if (!picks.length) return;

  ctx.fillStyle = '#9aa4aa';
  ctx.font = `400 23px ${FONT}`;
  ctx.letterSpacing = '8px';
  ctx.fillText('这一生的几个岔路口', PAD, topY);
  ctx.letterSpacing = '0px';

  const startY = topY + 62;
  const rowH = 148;
  const lineX = PAD + 13;
  const textX = PAD + 52;

  // 竖线：把三个岔路口串成一条路
  ctx.strokeStyle = 'rgba(30, 37, 41, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(lineX, startY - 22);
  ctx.lineTo(lineX, startY + rowH * (picks.length - 1) + 6);
  ctx.stroke();

  picks.forEach((idx, k) => {
    const h = history[idx];
    const y = startY + k * rowH;
    // 节点
    ctx.beginPath();
    ctx.arc(lineX, y + 4, k === picks.length - 1 ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = k === picks.length - 1 ? '#c39a4b' : '#5b7d90';
    ctx.fill();
    // 年龄 + 标题
    ctx.fillStyle = '#c39a4b';
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(`${h.age} 岁`, textX, y + 10);
    // 选择文字（最多两行）
    ctx.fillStyle = '#1e2529';
    ctx.font = `500 33px ${FONT}`;
    const tl = wrapText(ctx, h.text, W - textX - PAD);
    tl.slice(0, 2).forEach((ln, i2) => ctx.fillText(ln, textX, y + 52 + i2 * 46));
  });
}

export async function buildShareCard(p) {
  const { state, ending, score, badgeList = [] } = p;
  const persp = p.persp || {};

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── 底：晨光暖白 → 天青 ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fdfaf2');
  bg.addColorStop(0.42, '#f7f6ef');
  bg.addColorStop(1, '#eaf1f5');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部暖光（黎明）
  const glow = ctx.createRadialGradient(W / 2, -120, 60, W / 2, -120, 900);
  glow.addColorStop(0, 'rgba(255, 238, 205, 0.95)');
  glow.addColorStop(1, 'rgba(255, 238, 205, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 900);

  // 雨丝（极淡，斜向）
  ctx.strokeStyle = 'rgba(91, 125, 144, 0.07)';
  ctx.lineWidth = 2;
  for (let i = -20; i < 60; i++) {
    const x = i * 26;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 120, H);
    ctx.stroke();
  }

  // ── 品牌条 ──
  let y = 112;
  const logo = await loadImg(trLogo);
  if (logo) {
    const lh = 112;
    const lw = Math.min(280, (logo.naturalWidth / logo.naturalHeight) * lh);
    ctx.globalCompositeOperation = 'multiply'; // 白底融入纸面
    ctx.drawImage(logo, PAD, y, lw, lh);
    ctx.globalCompositeOperation = 'source-over';
    y += lh + 26;
  } else {
    y += 20;
  }
  ctx.fillStyle = '#9aa4aa';
  ctx.font = `500 22px ${FONT}`;
  ctx.letterSpacing = '10px';
  ctx.fillText('AI TIMELY RAIN', PAD, y + 16);
  ctx.letterSpacing = '0px';

  // ── 流派 · 视角 ──
  y += 108;
  ctx.fillStyle = '#9aa4aa';
  ctx.font = `400 26px ${FONT}`;
  ctx.letterSpacing = '8px';
  const kicker = [score.stream.name, persp.name && persp.name + '视角', '此生结算'].filter(Boolean).join('  ·  ');
  ctx.fillText(kicker, PAD, y);
  ctx.letterSpacing = '0px';

  // ── 综合评分 ──
  y += 232;
  ctx.fillStyle = '#c39a4b';
  ctx.font = `500 208px ${FONT}`;
  ctx.fillText(String(score.total), PAD - 6, y);
  const scoreW = ctx.measureText(String(score.total)).width;
  ctx.fillStyle = '#8b9499';
  ctx.font = `400 40px ${FONT}`;
  ctx.fillText(`${score.grade} 级人生`, PAD + scoreW + 30, y - 12);

  // ── 结局名 ──
  y += 118;
  ctx.fillStyle = '#1e2529';
  ctx.font = `500 76px ${FONT}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(ending.name, PAD, y);
  ctx.letterSpacing = '0px';

  // ── 金句（自动换行，最多 4 行） ──
  y += 74;
  ctx.fillStyle = '#5d6a72';
  ctx.font = `400 33px ${FONT}`;
  const quote = `「${ending.copy}」`;
  const lines = wrapText(ctx, quote, W - PAD * 2);
  lines.slice(0, 4).forEach((ln, i) => {
    ctx.fillText(ln, PAD, y + i * 58);
  });
  y += Math.min(lines.length, 4) * 58;

  // ── 分隔线 ──
  y += 48;
  ctx.strokeStyle = 'rgba(30, 37, 41, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // ── 四项属性（两列两行） ──
  const attrs = [
    ['寿命', `${state.attrs.lifespan} 岁`],
    ['金钱', fmtMoney(state.attrs.money)],
    ['自由', String(state.attrs.freedom)],
    ['健康', String(state.attrs.health)],
  ];
  y += 72;
  attrs.forEach(([label, val], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = PAD + col * ((W - PAD * 2) / 2);
    const yy = y + row * 84;
    ctx.fillStyle = '#9aa4aa';
    ctx.font = `400 26px ${FONT}`;
    ctx.letterSpacing = '3px';
    ctx.fillText(label, x, yy);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = label === '金钱' && state.attrs.money < 0 ? '#c05a49' : '#1e2529';
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(val, x + 190, yy);
  });
  y += 190;

  // ── 徽章 ──
  if (badgeList.length) {
    let bx = PAD;
    ctx.font = `400 25px ${FONT}`;
    badgeList.slice(0, 3).forEach(b => {
      const w = ctx.measureText(b.name).width + 46;
      if (bx + w > W - PAD) return;
      roundRect(ctx, bx, y - 32, w, 48, 24);
      ctx.fillStyle = 'rgba(195, 154, 75, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(195, 154, 75, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#9a7429';
      ctx.fillText(b.name, bx + 23, y);
      bx += w + 16;
    });
    y += 78;
  }

  // ── 三个岔路口（填满卡面下半部，也是最有共鸣的部分） ──
  const footY = H - 168;
  drawMoments(ctx, y + 30, state.history);

  // ── 脚注 ──
  ctx.fillStyle = '#8b9499';
  ctx.font = `400 25px ${FONT}`;
  ctx.fillText(`本局 ${state.history.length} 个抉择 · 每一个结果，都要走完那一步才知道`, PAD, footY);
  ctx.fillStyle = '#5b7d90';
  ctx.font = `500 26px ${FONT}`;
  ctx.letterSpacing = '4px';
  ctx.fillText('及时雨 · 人生重开', PAD, footY + 50);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#9aa4aa';
  ctx.font = `400 23px ${FONT}`;
  ctx.fillText('#人生重开  #1024程序员节  #WorkBuddy', PAD, footY + 94);

  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
