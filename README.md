# 及时雨 · 人生重开

> 从 18 岁高考结束那个岔路口，重新走一遍人生。24 个抉择，7 个人生阶段，8 种结局，每一步都算数。

**[▶ 在线玩](https://timelyrain017.github.io/Start-a-new-life/)** · WorkBuddy「1024 造物挑战」参赛作品

<img src="./public/icon-512.png" width="96" alt="图标：把 T 旋转 45°，一条大路与岔出去的一支">

---

## 这是什么

一个在浏览器里跑完一生的文字模拟游戏。没有注册、没有后端、没有广告，打开就能玩，关掉记录还在。

你不是在「刷属性」，而是在**做选择并承担它的延迟后果**：18 岁选了「去学门手艺」，28 岁那次晋升就轮不到你；25 岁为省钱没交社保，55 岁结算时才发现少了一笔养老钱。有些账，要等二十年才寄到。

每局结束会给出一个结局、一个 S~D 评级，以及一条**可回看的决策路径**——你能看到自己在哪一步拐错了弯。

## 怎么玩

1. 选一个视角（**探索者** 往前看，**回望者** 往后看），再选一种活法（长寿流 / 财富流 / 自由流）。视角只改叙述口吻，不动数值与判定。
2. 从 18 岁开始一年一年往下走，每次在几个选项里挑一个。
3. 顶部四格是**寿命、现金、自由、健康**，每次选择都会动它们；有些代价不写在明面上。
4. 走到 55 岁统一结算（隐藏项在这里揭晓），给出结局与评分。
5. 结果可生成一张 1080×1920 的分享卡；历史记录攒在「我的」里，还能解锁 12 个成就。

24 个决策点分布在 18 / 22 / 25 / 28 / 32 / 40 / 55 岁七个阶段。八种结局从「寿终正寝」到「铁窗泪」都有，另有两个徽章结局藏在细节里。

## 三个设计选择

**代价是延期的。** 选项上标的「时间 4 年 / 精力 30」不是寿数，是这一年你花掉的东西；真正的惩罚往往通过 flag 在十年后才生效。所以第一次玩常常死得莫名其妙——这是设计的一部分。

**每条建议都有出处。** 每个选项带一个 `evidence` 等级和一个 `ref`（原书章节号），结果页可以点开看依据。这是它和一般「选择你的结局」小游戏最大的区别。

**存档是本地的。** `localStorage` 分三处存：当前进度、历史档案、偏好设置。换浏览器、换域名、清缓存都会丢，所以「我的」页里给了导出/导入备份。这是纯静态的代价，不是 bug。

## 技术

| | |
|---|---|
| 构建 | Vite 5，`base: './'`，产物可直接放任意子路径 |
| 运行时 | 原生 JS，**零运行时依赖**（没引框架、没引 UI 库、没引图标库） |
| 样式 | 手写 CSS，深色系 + 晨光金，移动端优先 |
| 图标 | Lucide 按需内嵌 SVG path，不发外部请求 |
| 存档 | `src/storage.js` 统一入口，带可用性探测与内存降级 |
| 分享卡 | Canvas 手绘 1080×1920，无第三方截图库 |
| 开场动画 | 内联 SVG 镜头推移（rAF 插值 `viewBox`），不用视频 |
| 新手引导 | 聚光灯式：SVG evenodd 挖洞 + 四条透明矩形做命中拦截 |
| 部署 | GitHub Actions → GitHub Pages，推 `main` 即发布 |

产物大小：CSS 约 28 kB、JS 约 89 kB（gzip 后 6.5 kB + 44 kB）。首屏不依赖任何外部请求。

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 dist/
npm run preview    # 本地预览生产构建
```

需要 Node 18+。

**注意**：`dev` 与 `build` 的 `base` 不同（`/` 与 `./`）。开发时若资源被 SPA fallback 成 `index.html` 会白屏，别手改这一行。

## 目录结构

```
├── index.html              入口：开场动画 + 页面骨架（内联，首屏不等 JS）
├── data/                   全部游戏内容都是数据，改 JSON 就能改剧情
│   ├── decisions.json      24 个决策点 / 7 个阶段 / 选项代价与出处
│   ├── endings.json        8 主结局 + 2 徽章结局，含条件与评分区间
│   ├── perspectives.json   两个视角的旁白
│   ├── events.json         随机事件
│   └── attribution.json    署名、免责、品牌（页脚与分享卡用）
├── src/
│   ├── main.js             启动、路由、各屏装配
│   ├── engine.js           结算核心：选项 → 属性变化 → 结局判定
│   ├── ui.js               所有屏的渲染
│   ├── guide.js            聚光灯新手引导
│   ├── records.js          历史档案、成就、导入消毒
│   ├── storage.js          localStorage 唯一入口（含降级）
│   ├── share.js            Canvas 分享卡
│   ├── title.js            像素字形「人生重开」
│   ├── icons.js            Lucide 图标子集
│   ├── puzzle.js           八格人生拼图
│   ├── tree.js             决策路径树
│   ├── sound.js            音效（WebAudio 合成，无音频文件）
│   └── style.css
├── public/                 图标全套：SVG / ICO / iOS / PWA / maskable
├── tools/
│   ├── sim.mjs             8 种结局可达性回归
│   ├── make-icons.mjs      图标生成器（SVG → ICO/PNG 全套）
│   └── mark-lab.mjs        图标比稿器
└── .github/workflows/deploy.yml
```

想改剧情只动 `data/*.json`，不用碰代码——`schemaVersion` 会兜住格式变更。

## 署名与许可

内容改编自 **[《高性价比人生指南》](https://github.com/eternity4719/HowToLiveBetter)**，作者 eternity4719，以 **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** 授权，**本文有修改**（改写为 24 个决策点、补齐代价与出处、加入评分与结局）。再分发请保留署名与许可链接。

- 字体：标题四字取自 [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)（SIL OFL 1.1），按 12×12 点阵光栅化为矢量方块
- 图标：[Lucide](https://lucide.dev)（ISC）

> 本游戏仅为娱乐与科普，所有选项不构成医疗、法律、投资建议。身体不适请就医，法律问题请咨询律师。

---

参赛项目：WorkBuddy「1024 造物挑战」程序员节应用创作大赛 · `#WorkBuddy` `#1024程序员节`
