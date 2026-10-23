// puzzle.js — 结局图鉴的拼图形状
// 8 个主结局 = 4 列 × 2 行 = 8 块拼图；外框平直，内部用凸/凹咬合。
// 每块的 path 由「切口表」现算，相邻两块共用同一条曲线（只是遍历方向相反），所以严丝合缝。
const COLS = 4;
const ROWS = 2;
const CELL = 100;   // 每块在 viewBox 里的边长
const TAB = 23;     // 凸起伸出的高度

export const PUZZLE_VIEWBOX = `0 0 ${COLS * CELL} ${ROWS * CELL}`;
export const PUZZLE_COLS = COLS;
export const PUZZLE_CELL = CELL;

// 内部切口的咬合方向：1 = 朝 +x（右）/ +y（下）凸。
// 棋盘式交错，避免整排都朝同一侧——那样看起来像百叶窗，不像拼图。
const HCUT = [
  [1, -1, 1],    // 第 0 行：第 0|1、1|2、2|3 列之间
  [-1, 1, -1],   // 第 1 行
];
const VCUT = [[1, -1, 1, -1]];  // 第 0|1 行之间，逐列

// 一条咬合边在归一化空间里的形状：t 沿边 0→1，u 朝凸起方向 0→1（1 = TAB）。
// 收腰在 0.42/0.58，鼓包从 0.33 到 0.67 —— 颈窄头宽（头是颈的两倍宽），
// 这个「倒扣」是拼图能咬住、也是看起来像拼图的关键；颈太粗就会变成一排胶囊。
const SHAPE = [
  ['L', 0.42, 0],
  ['C', 0.42, 0.20, 0.33, 0.26, 0.33, 0.50],
  ['C', 0.33, 0.80, 0.41, 1.00, 0.50, 1.00],
  ['C', 0.59, 1.00, 0.67, 0.80, 0.67, 0.50],
  ['C', 0.67, 0.26, 0.58, 0.20, 0.58, 0],
  ['L', 1, 0],
];

const n = v => Math.round(v * 10) / 10;

// 直线段 (x0,y0)→(x1,y1) 之间生成一条咬合边；凸起沿全局单位方向 (ox,oy) 伸出。
// 用「全局方向」而不是「行进方向的左右」，相邻两块才能各自从自己的行进方向画出同一条曲线。
function edge(x0, y0, x1, y1, ox, oy) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const px = (t, u) => n(x0 + dx * t + ox * TAB * u);
  const py = (t, u) => n(y0 + dy * t + oy * TAB * u);
  let d = '';
  for (const s of SHAPE) {
    if (s[0] === 'L') d += `L${px(s[1], s[2])} ${py(s[1], s[2])}`;
    else d += `C${px(s[1], s[2])} ${py(s[1], s[2])} ${px(s[3], s[4])} ${py(s[3], s[4])} ${px(s[5], s[6])} ${py(s[5], s[6])}`;
  }
  return d;
}

// 第 r 行第 c 列那一块的轮廓（顺时针：上 → 右 → 下 → 左）
export function piecePath(r, c) {
  const x = c * CELL;
  const y = r * CELL;
  const R = x + CELL;
  const B = y + CELL;
  let d = `M${x} ${y}`;
  d += r === 0 ? `L${R} ${y}` : edge(x, y, R, y, 0, VCUT[r - 1][c]);
  d += c === COLS - 1 ? `L${R} ${B}` : edge(R, y, R, B, HCUT[r][c], 0);
  d += r === ROWS - 1 ? `L${x} ${B}` : edge(R, B, x, B, 0, VCUT[r][c]);
  d += c === 0 ? `L${x} ${y}` : edge(x, B, x, y, HCUT[r][c - 1], 0);
  return `${d}Z`;
}

// 一块的中心点（摆名字用）
export const pieceCenter = (r, c) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });

// 名字越长字越小，六字「普通人的一生」也能塞进一块里
export const labelSize = name => (name.length >= 6 ? 10 : name.length === 5 ? 10.6 : 12);
