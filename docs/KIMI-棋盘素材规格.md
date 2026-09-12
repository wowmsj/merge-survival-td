# KIMI 可用棋盘素材规格

> **2026-09 现状**：独立二合棋盘已废弃，棋盘 GLB `board_7x9_voxel.glb` 及其 Blender 源文件、生成脚本 `scripts/blender-board-7x9.py` 均已删除。本文原来的 6×9/7×9 棋盘尺寸与底板接入约束全部失效，仅留档。棋子（方块 GLB）规格见同目录《KIMI-棋盘与棋子完整对接文档.md》。

## 真实游戏规则（当前）

- 物品层 = 基地 **13×13 网格**，与基地格一一对应（`src/core/model/GameState.ts`，基地常量见 `src/core/model/Base.ts`）。
- 可承载格由 `canHostItem` 判定：在网格内、无物品、已认领、无建筑、无地形；物品与建筑一样挡寻路。
- 初始物品填中央 7×7 的四个象限，核心所在行/列留作僵尸通行走廊（`src/core/init/GameInitializer.ts`）。
- 棋子 GLB 仍是 `voxel_32_<正式道具ID>.glb`，由 `src/three/Base3DRenderer.ts` 摆放在基地格中心（1 格 = 1 单位，`x=col-6, z=row-6`）。

## 给 KIMI 的接入约束

```js
const ROWS = 13;
const COLS = 13;
const CENTER = 6; // 核心固定 (6,6)
```

GLB 只负责视觉；物品数组、拖拽、合成和存档继续使用项目现有规则，不要在模型层推导行列。
