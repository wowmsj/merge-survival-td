# 二合 + 生存建造 + 塔防

基于 **Phaser 3 + TypeScript** 的轻量小游戏项目。
二合玩法核心逻辑移植自 Cocos 项目 `merge/Project_Merge`（`composeModel.ts`），包含完整的核心循环 + 特殊道具。

## 项目结构

```
merge-survival-td/
├── src/
│   ├── core/                  ← 纯逻辑层，不依赖 Phaser
│   │   ├── config/            ← 配置访问层
│   │   │   ├── data/          ← 从 merge 项目导入的 JSON 配置表（8 个）
│   │   │   ├── PropConfig.ts  ← 物品表访问（拼音字段→语义 getter）
│   │   │   └── TableConfig.ts ← 初始棋盘/任务/合成奖励/背包格/全局常量
│   │   ├── ecs/               ← ECS 框架（World/System）
│   │   ├── events/            ← 事件总线
│   │   ├── init/              ← 游戏初始化器
│   │   ├── model/             ← GameState / Grid / Item
│   │   ├── systems/           ← Merge/Spawn/Economy/Task/Bag/SpecialItem/Storage
│   │   ├── types.ts           ← 核心类型
│   │   └── utils/             ← 工具函数
│   ├── phaser/                ← Phaser 表现层（只渲染+输入，无逻辑）
│   │   ├── objects/           ← GridRenderer、ItemSprite
│   │   ├── scenes/            ← BootScene、GameScene
│   │   └── ui/                ← HUD、TaskBar、CardBar、InfoBar、BagPanel、HandGuide
│   ├── platform/              ← 平台适配层
│   └── main.ts                ← 入口（1080×1920 竖屏）
├── scripts/smoke.ts           ← core 层无头冒烟测试
├── public/index.html
└── webpack.config.js
```

## 已实现的二合玩法

- **9 行 × 7 列棋盘**；物品等级编码在 id 链条里，合成结果由配表 `blessId` 指定
- **拖拽规则**：空格→移动；同 id→合成；不同→交换；纸箱/蜘蛛网目标→弹回；拖到背包→入包
- **发射器**：点击次数、cd 累加、耗体力（`noPower` 除外）、耗尽消失(`wsb`)/变身(`doge`)/进 cd 恢复、首次指定产出队列(`clickPropId`)、`atom/matic` 权重产出
- **自动生成器**：九宫格产出，首次 1 次，cd 后恢复 `kishu` 次
- **气泡**：合成奖励按 `composeAward` 权重产出，60 秒不破变成 id 203，可花钻戳破
- **纸箱/蜘蛛网**：合成时十字邻居纸箱破开变蜘蛛网；蜘蛛网物品参与合成即解封
- **背包**（棋盘 id=401）：初始纸箱封印、旁边合成解锁，入包暂停 cd、取出补偿，金币扩容
- **卡片列表**：货币类直接入账，其余奖励进卡片列表，点击取出到棋盘
- **任务**：新手任务链 → 随机订单（等级段/权重/品质/产出链可达）→ 保底任务，`taskProb` 概率补充
- **特殊道具（mdt）**：解锁型/无限能量/充能器/拆分器/全屏减 cd/升级卡×5/加速装置/点击领奖
- **出售/撤销**、**体力自动恢复**、**钻石跳过 cd**、**简版新手引导**、**整局 localStorage 存档**

## 配置表说明

物品表 `prop_prop.json`（365 行）字段为原策划表拼音命名，语义映射集中在 `PropConfig.ts`：

| 原字段 | 语义 | 原字段 | 语义 |
|--------|------|--------|------|
| luna | 等级 | blessId | 合成结果 id（0=满级） |
| anc/times/milo | 可点击/次数/cd秒 | kishu/fair/faircd | 自动次数/产出id/cd秒 |
| atom/matic | 产出id串/权重串 | clickPropId | 首次指定产出队列 |
| wsb/doge | 耗尽消失/变身id | levelGold/she | 售价/可出售 |
| bubble | 戳泡钻价 | mdt/p1 | 特殊道具类型/参数 |
| lunc | 品质 | type/typeson | 大类/子类（合成链） |

## 运行方式

```bash
npm install

# 开发模式（8080 端口）
npm run dev

# 生产构建
npm run build

# core 层冒烟测试（54 项断言，不依赖浏览器）
npm run smoke

# 微信/抖音小游戏构建（预留，需接入对应适配器）
npm run build:wx
npm run build:tt
```

## 操作说明

- **拖拽物品**：空格移动、同 id 合成（绿框提示可合成目标）、拖到背包格入包
- **点击物品**：发射器产出、特殊道具触发、背包格打开背包、其他选中查看详情
- **底部信息栏**：出售 / 戳破气泡 / 跳过 CD
- **任务条**：进度满足后点击提交，获得星星
- **卡片栏**：点击取出卡片到棋盘

## 与源项目的偏差

1. 图鉴系统未迁移 → 随机订单候选物品用「棋盘产出链可达」近似（`TaskSystem.collectReachableIds`）
2. 合成额外奖励按 `composeAward` 表权重正常抽取（源项目写死取 id=1，是其 bug）
3. 服务器时间 → `Date.now()`；每格单 key 存档 → 整局 JSON 存档
4. 未迁移：3203 行主线任务、店长值班日、图鉴、战令、商店、装修场景

## 后续规划

- 生存建造：用星星/资源建造防御塔、墙、设施
- 塔防：敌人波次进攻、防御塔自动攻击
- 长连接：实时对战/合作模式
