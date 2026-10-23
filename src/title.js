// title.js — 标题「人生重开」的像素字标（矢量，任意放缩都不糊）
// 字形来自 Fusion Pixel Font 12px Proportional（作者 TakWolf，SIL OFL 1.1），
// 这里把四个字按 12×12 点阵光栅化后合并成一条 path：每个像素一个 1×1 方块，
// 同行相邻的方块合成一段，全字标只有 68 个矩形、883 字节。
// 用矢量而不是 webfont，是因为浏览器对字体一定会做灰度抗锯齿，放大后边缘发虚。
export const TITLE_VIEWBOX = '0 0 48 11';

export const TITLE_PATH = 'M5 0h1v1h-1zM5 1h1v1h-1zM5 2h1v1h-1zM5 3h1v1h-1zM4 4h1v1h-1zM6 4h1v1h-1zM4 5h1v1h-1zM6 5h1v1h-1zM3 6h1v1h-1zM7 6h1v1h-1zM3 7h1v1h-1zM7 7h1v1h-1zM2 8h1v1h-1zM8 8h1v1h-1zM1 9h1v1h-1zM9 9h1v1h-1zM0 10h1v1h-1zM10 10h1v1h-1zM13 0h1v1h-1zM17 0h1v1h-1zM13 1h1v1h-1zM17 1h1v1h-1zM13 2h9v1h-9zM13 3h1v1h-1zM17 3h1v1h-1zM12 4h1v1h-1zM17 4h1v1h-1zM17 5h1v1h-1zM13 6h9v1h-9zM17 7h1v1h-1zM17 8h1v1h-1zM17 9h1v1h-1zM12 10h11v1h-11zM25 0h9v1h-9zM29 1h1v1h-1zM24 2h11v1h-11zM25 3h1v1h-1zM29 3h1v1h-1zM33 3h1v1h-1zM25 4h9v1h-9zM25 5h1v1h-1zM29 5h1v1h-1zM33 5h1v1h-1zM25 6h9v1h-9zM29 7h1v1h-1zM25 8h9v1h-9zM29 9h1v1h-1zM24 10h11v1h-11zM36 0h11v1h-11zM38 1h1v1h-1zM44 1h1v1h-1zM38 2h1v1h-1zM44 2h1v1h-1zM38 3h1v1h-1zM44 3h1v1h-1zM38 4h1v1h-1zM44 4h1v1h-1zM36 5h11v1h-11zM38 6h1v1h-1zM44 6h1v1h-1zM38 7h1v1h-1zM44 7h1v1h-1zM37 8h1v1h-1zM44 8h1v1h-1zM37 9h1v1h-1zM44 9h1v1h-1zM36 10h1v1h-1zM44 10h1v1h-1z';
