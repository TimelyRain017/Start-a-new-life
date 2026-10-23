// tree.js — 人生之树（核心视觉）
// 站在节点上：先看到面前伸出的几条暗色小路（pending），选完其中一条点亮，
// 其余收成短枝桠（「你没走的那条路」），往上再长出下一步的候选枝。
// 坐标：根节点为原点，向上为负 y；整棵树随步数变高，超过视野后由 ty 上推。
const W = 320;
const CX = W / 2;
const DY = 36;        // 每一步向上的高度
const SPREAD = 66;    // 分叉的最大横向偏移
const PULL = 0.75;    // 枝干惯性（避免折线感）

const clampX = x => Math.min(W - 42, Math.max(42, x));

function layout(stepCount) {
  const contentH = stepCount * DY;
  const H = Math.min(270, 110 + contentH);
  // 当前节点恒定在视野 31% 处（上方留给「面前的路」），来路自然沉到视野下方
  const ty = 84 + contentH;
  return { H, ty };
}

// 从 from 点朝「第 k 条岔路」走一步后的落点（walk / stub / pending 共用，保证不走位）
function stepPoint(fromX, fromY, k, n) {
  const half = (n - 1) / 2 || 1;
  const t = (k - half) / half;                 // -1 .. 1
  return {
    x: clampX(fromX + (CX + t * SPREAD - fromX) * PULL),
    y: fromY - DY,
    t,
  };
}

export function projectTree(steps) {
  let x = CX;
  let y = 0;
  const nodes = [{ x, y, age: steps.length ? steps[0].age : 18, start: true }];
  steps.forEach(s => {
    const n = Math.max(2, s.branch || 2);
    const p = stepPoint(x, y, s.pick, n);
    x = p.x;
    y = p.y;
    nodes.push({ x, y, age: s.age, pick: s.pick, branch: n, title: s.title, from: nodes[nodes.length - 1] });
  });
  return nodes;
}

// 竖直方向的 S 形枝干
const sCurve = (x0, y0, x1, y1) =>
  `M${x0} ${y0} C ${x0} ${y0 - DY * 0.55}, ${x1} ${y1 + DY * 0.55}, ${x1} ${y1}`;

// 未走的分支：只长出一小截就停住
function stubPath(from, k, n) {
  const p = stepPoint(from.x, from.y, k, n);
  const bx = clampX(from.x + (p.x - from.x) * 0.58);
  const by = from.y - DY * 0.5;
  return {
    d: `M${from.x} ${from.y} C ${from.x} ${from.y - DY * 0.28}, ${bx} ${by + DY * 0.22}, ${bx} ${by}`,
    x: bx, y: by,
  };
}

/**
 * @param {Array} steps   已完成的选择 [{age, pick, branch}]
 * @param {Object} opts   { pending: 当前决策的选项数 } —— 画出面前的候选岔路
 */
export function treeSvg(steps, opts = {}) {
  const { H, ty } = layout(steps.length);
  const nodes = projectTree(steps);
  const cur = nodes[nodes.length - 1];

  const walked = nodes.slice(1).map((n, i) => {
    const isNew = i === nodes.length - 2;
    return `<path class="tree-walk${isNew ? ' tree-new' : ''}" pathLength="1" d="${sCurve(n.from.x, n.from.y, n.x, n.y)}" />`;
  }).join('');

  // 走过的岔路口留下的短枝
  const stubs = [];
  nodes.slice(1).forEach(n => {
    for (let k = 0; k < n.branch; k++) {
      if (k === n.pick) continue;
      const s = stubPath(n.from, k, n.branch);
      stubs.push(`<path class="tree-stub" d="${s.d}" /><circle class="tree-stub-dot" cx="${s.x}" cy="${s.y}" r="1.5" />`);
    }
  });

  const dots = nodes.slice(1, -1).map(n =>
    `<circle class="tree-node" cx="${n.x}" cy="${n.y}" r="2.2" />`).join('');

  // 面前的路：当前决策的候选分支（暗色虚线 + 选项序号）
  let pending;
  const n = opts.pending || 0;
  if (n >= 2) {
    pending = '';
    for (let k = 0; k < n; k++) {
      const p = stepPoint(cur.x, cur.y, k, n);
      pending += `
        <path class="tree-pending" d="${sCurve(cur.x, cur.y, p.x, p.y)}" />
        <circle class="tree-pending-dot" cx="${p.x}" cy="${p.y}" r="1.9" />
        <text class="tree-pending-no" x="${p.x}" y="${p.y - 8}" text-anchor="middle">${k + 1}</text>`;
    }
  } else {
    pending = `<line class="tree-future" x1="${cur.x}" y1="${cur.y - 12}" x2="${cur.x}" y2="${cur.y - 48}" />`;
  }

  return `
  <svg class="tree" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <g transform="translate(0 ${ty.toFixed(1)})">
      <line class="tree-trunk" x1="${CX}" y1="0" x2="${CX}" y2="24" />
      ${stubs.join('')}
      ${walked}
      ${dots}
      ${pending}
      <circle class="tree-halo" cx="${cur.x}" cy="${cur.y}" r="10" />
      <circle class="tree-here" cx="${cur.x}" cy="${cur.y}" r="3.2" />
      <text class="tree-age" x="${cur.x + 13}" y="${cur.y + 4}" text-anchor="start">${cur.age} 岁</text>
    </g>
  </svg>`;
}
