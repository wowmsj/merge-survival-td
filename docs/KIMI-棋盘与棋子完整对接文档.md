# 棋盘与 3D 方块棋子对接文档

> **2026-09 现状更新**：独立二合棋盘（2D GridRenderer/ItemSprite 与 3D BoardRenderer 两条路线）已整体废弃，棋盘 GLB `board_7x9_voxel.glb`、其 Blender 源文件与生成脚本 `scripts/blender-board-7x9.py` 均已删除。当前物品层直接落在基地 13×13 网格上（基地即合成场），由 `src/phaser/scenes/BaseScene.ts`（唯一主场景）+ `src/three/Base3DRenderer.ts` / `src/three/BoardItemView.ts` 渲染。棋子方块 GLB（`voxel_32_<id>.glb`）、素材清单与回退规则仍然有效。下文标注「历史」的棋盘底板小节仅留档。

## 1. 目标

将现有 Phaser 游戏的 2D 棋盘和图标替换为 Three.js/GLB 视觉表现。只替换渲染层，不能重写棋盘数据、合成、存档和特殊道具规则。

> 现状：该目标已以「基地 13×13 网格直接承载物品层」的方式落地（Base3DRenderer + BoardItemView），独立棋盘底板不再需要。

## 2. 正式棋盘规则

源码常量：`src/core/model/GameState.ts`（物品层）+ `src/core/model/Base.ts`（基地尺寸）

```js
const ROWS = 13;
const COLS = 13;
const CENTER = 6; // 核心固定 (6,6)
const CELL_COUNT = ROWS * COLS; // 169
```

物品层网格与基地格 **一一对应**，坐标从左上角开始。逻辑数据结构为 `grid.cells[row][col]`，每格为 `{ item: IItemData | null }`。可承载格由 `canHostItem(state, row, col)` 判定：在网格内、无物品、已认领、无建筑、无地形。初始物品填中央 7×7 的四个象限，核心所在行/列留作僵尸通行走廊；物品与建筑一样挡寻路。正式合成由 `MergeSystem.moveOrMerge()` 执行，不能在 Three.js 层自行判断。

## 3. 棋盘 GLB 素材（历史，已删除）

独立棋盘 GLB `board_7x9_voxel.glb` 已删除，不再有棋盘底板模型。棋子直接摆放在基地 13×13 格上：

- 1 格 = 1 单位；`x = col - 6`，`z = row - 6`（与 `Night3DRenderer`/`Base3DRenderer` 一致）。
- 基地中心为世界原点；不要用模型边界推导行列。
- 暖土地基/地形/建筑 GLB 见《KIMI-暖土资源交付清单.md》。

## 4. 相机

基地 3D 使用 `Base3DRenderer` 的轨道相机（方位角自由 360°，俯仰钳位 25°~75°，缩放钳位，zoom=1 时 13×13 全景恰好铺满）。移动端必须根据容器宽高重新计算取景，保证完整基地不横向溢出；不要固定像素宽度。

## 5. 棋子素材目录

所有方块棋子位于：`assets/models/blender-samples/`。

命名格式：

```text
voxel_32_<正式道具ID>.glb
```

例如：

```text
voxel_32_10001.glb
voxel_32_40039.glb
voxel_32_70001.glb
```

全部463项的模型可用性、名称、合成后继快照见同目录 `KIMI-棋子素材清单.json`（407个model非空、56个model为空）。运行时名称仍使用i18n，不将中文快照直接作为英文UI文案。

下面的文件只覆盖第31～68组，并非全量目录：

```text
assets/models/blender-samples/remaining-chains.json
```

字段：

```js
{
  seq: 31,
  key: 'chain31',
  title: '花篮',
  items: [{ id: 40039, name: '藤绳', next: 40040 }]
}
```

制作元数据的 `next` 只供查阅。正式后继必须调用 `src/core/config/PropConfig.ts` 的 `getMergeNextId(id)`；配置含TypeScript补充项，不可只读取原始JSON。禁止用 `id + 1` 推算。

## 6. GLB 加载与棋子摆放

```js
const modelCache = new Map();
async function loadPropModel(id) {
  if (!modelCache.has(id)) {
    const { scene } = await loader.loadAsync(`/assets/models/blender-samples/voxel_32_${id}.glb`);
    modelCache.set(id, scene);
  }
  return modelCache.get(id).clone(true);
}

function cellWorldPosition(row, col) {
  return new THREE.Vector3(col - 6, 0.16, row - 6); // 基地 13×13，1 格 = 1 单位
}
```

推荐棋子缩放：`0.76`。模型底部已经归一化到 Y=0，放置时不要再额外向下偏移。拖拽时临时抬高到约 `Y=0.9`，释放后恢复格子中心。

## 7. 交互规则

Three.js 只负责把指针位置转换为格子坐标，然后调用正式业务层：

```js
onDropItem(source, target) {
  // 接到 BaseScene 现有拖拽/合成入口，而不是另造状态/存档路径。
  existingOnDropItem(source, target);
}
```

必须保留：

- 空格移动
- 同 ID 且 `blessId > 0` 才合成
- 蜘蛛网、纸箱、气泡限制
- 背包投入
- 充能器、拆解器、升级卡等特殊拖拽
- 发射器首次点击只选中，第二次点击才产出
- 蓝图最终级点击使用并解锁建筑
- 任务、计数、体力、冷却和存档更新

## 8. 发射器与蓝图

- 本批70001～70017蓝图发射器的后继为0，不能合成；不能推广为“所有发射器不可合成”，工具箱等生成器自身也有升级链。始终以正式配置和MergeSystem为准。
- 蓝图链一般为：碎片 → 图纸 → 设计图 → 蓝图。
- 序号66～68的展示顺序需要按 `items.slice(1) + items.slice(0,1)` 调整，使碎片在前、完整蓝图在后。
- 第35组包含 ID `50036`，不可假设连续 ID。
- `50023` 小猫窝的后继是跨链 ID `50024`，必须加载两个链的数据。

## 9. 资源回退

当前 463 个运行时配置中，407 个已有方块 GLB；货币、宝箱等部分配置没有 GLB。加载失败时必须回退到现有 2D 图标，不得显示空对象或抛出异常。

## 10. 交付文件

- 棋子 GLB：`voxel_32_<id>.glb`
- 链元数据：`remaining-chains.json`
- 普通棋子生成脚本：`scripts/blender-voxel-remaining-props.py`
- 蓝图生成脚本：`scripts/blender-voxel-blueprints.py`

（棋盘底板 GLB / `board_7x9_voxel.blend` / `scripts/blender-board-7x9.py` 已随独立棋盘废弃删除。）

## 11. 验收清单

- [ ] 物品层显示在基地 13×13 网格上，共 169 格；可承载格遵循 `canHostItem`（已认领/无建筑/无地形）。
- [ ] 第一格为 `row=0,col=0`，最后一格为 `row=12,col=12`，核心固定 `(6,6)`。
- [ ] 棋子中心与格中心重合，无漂浮、穿模、越界。
- [ ] 相邻等级有明显轮廓或颜色差异。
- [ ] 拖拽、合成、发射器、蓝图和特殊道具仍调用正式业务逻辑。
- [ ] 手机宽度下棋盘不横向溢出；处理pointercancel及安全边距。网页无法保证禁止所有系统级侧滑返回，不承诺完全屏蔽。

## 12. 正式工程接入边界（必读）

核对日期：2026-09-09。工程依赖是Phaser `^4.0.0`、Three.js `^0.185.1`、TypeScript和Webpack；不是Unity，也不需要重建为React/Vite项目。

关键文件：

| 文件 | 职责 |
| --- | --- |
| `src/core/model/GameState.ts` | 物品层网格（13×13，与基地格 1:1）、canHostItem 与初始状态 |
| `src/core/model/Base.ts` | 基地 13×13 常量、核心居中、领地/地形 |
| `src/core/types.ts` | IGrid、IItemData、IPoint等正式类型 |
| `src/core/model/Grid.ts` | cells[row][col]、邻接、交换、空格查询 |
| `src/phaser/scenes/BaseScene.ts` | 唯一主场景：布局、物品/格子点击、拖拽编排、面板与菜单 |
| `src/three/Base3DRenderer.ts` | 基地+物品层 3D 渲染、输入、选择、提示和动画 |
| `src/three/BoardItemView.ts` | 单个棋子的模型、等级、CD及封印覆盖层 |
| `src/core/systems/MergeSystem.ts` | 移动、交换、合成、特殊拖拽 |
| `src/core/config/PropConfig.ts` | getProp/getMergeNextId及运行时补充配置 |
| `src/phaser/config/ItemIconMap.ts` | 缺模型时使用的真实2D图标映射 |

（历史说明：原 GameScene/GridRenderer/ItemSprite/BoardRenderer 路线已删除，基地 3D 画布只覆盖 13×13 网格矩形，与 Phaser UI 层共存。）

同一时刻只能有一套棋盘输入监听；弹窗/剧情打开时同步inputBlocked。场景退出时清理pointer监听、ResizeObserver、render loop、画布及renderer。不要把点击同时派给两套引擎。

## 13. 单位、拾取与状态覆盖

基地 13×13 网格：1 格 = 1 单位，`x=col-6`、`z=row-6`；暖土地基单格边长约 0.925，装饰边框不属于可操作格子。棋子建议底部 Y≈0.162，避免贴面闪烁。

拾取：指针先减去Three画布getBoundingClientRect的left/top，再换算NDC并建立Raycaster；先拾取棋子以选择实例，拖放目标使用格顶平面。平面命中点换算：`col=floor(x+6.5)`、`row=floor(z+6.5)`，只接受 col/row∈[0,12]，且落点需过 `canHostItem`。若整体基地根节点发生变换，先worldToLocal。不得使用整页clientX直接映射，也不能按斜视投影的屏幕方格平均分区。

移动阈值参考正式实现的 8px；指针取消、移出画布、页面隐藏时结束拖拽并恢复视觉，不提交合成。抬起棋子的抓取偏移用拖拽平面与实际抓取点计算，避免斜视拖拽时棋子跳离手指。

每个格内物品必须保留完整IItemData，不仅是id：st、times、spawnedCount、cd/cdSum、timesAuto/cdAuto、cdBubble、clickPropId、roomArr、putTime、unlock、startTime、notSubCd。冷却为毫秒到期时间戳，不能改成渲染帧数。渲染缓存ID不是存档ID；同一propId可出现很多实例，不得让它们共用一个Object3D。

纸箱、蜘蛛网、气泡、CD遮罩、等级、选中框、可合成提示及核心范围提示不在棋子GLB中，必须保留现有状态表现，可用2D覆盖层；用camera.project投影到实际画布位置。普通不同物品的拖放在正式系统可能交换，不能照抄预览页的“不能合成就弹回”。

## 14. 素材限制与资源生命周期

现有棋子是静态材质模型，32指体素制作精度，不是棋盘格数。通常最大边长不超过0.83单位、底部居中；缩放0.76是已选定的展示参数，不是正式玩法数值。不要逐级重新拉伸到同一高度，否则会抹掉体型区别。

按棋盘实际ID及其可能后继按需加载并缓存Promise，防止同时出现相同ID时重复请求。上文loadPropModel为简化示意，正式实现还需catch、失败缓存/重试和回退。不得因模型缺失而拒绝业务合成。异步返回前重新检查格子是否仍是原物品，防止把旧模型放回新状态。

clone(true)适用于当前静态模型；实例通常共享geometry/material。移除单个棋子不要dispose共享资源；仅清空整个缓存时统一释放。实例高亮若要改材质，应先clone材质并单独释放。

使用GLTFLoader保留导出材质，不统一覆盖成白色；设置背景、环境光和方向光。保留无投影效果，不添加棋子下的假阴影贴片。移动端像素比建议上限1.5～2。当前素材尚未做生产压缩、骨骼动画或完整手机性能验收，不能仅凭文件存在就称为生产优化完成。

## 15. 文件传递、构建与验收步骤

本项目根目录：`D:/小程序和小游戏/二合+生存建造`。文中的相对路径均相对于项目根；仅把本文发给另一台电脑的KIMI不会自动传输模型。

同工作区：让KIMI读取本文、同目录素材清单及上述源文件。异地工作区：还需传输清单中407个非空model文件、正式源码/配置、2D回退资源；.blend只供美术修改，可不进运行包。不要传key.env等凭据。

Webpack当前复制assets目录，所以正式URL为`<部署基路径>/assets/models/blender-samples/...`。演示服务器的`/models/`、`/vendor/`、`/data/`是专用路由，不可照搬到正式部署。iframe或子目录部署需正确拼接基路径。仅发布运行时所需GLB和清单，避免把.blend、参考图、验收截图全部带入发布包；目前复制配置需由KIMI核对调整。更新资源版本以避免旧GLB缓存。

实施顺序：先验证 13×13 格映射（含 canHostItem 落点）；再挂真实存档物品和2D回退；再接点击/拖拽到 BaseScene 入口；再恢复状态覆盖层及动画；最后做构建和手机验收。不要将public/merge-demo/main.js整文件搬到正式场景，其reset、produce、简化drop和演示体力均不是真实玩法。

检查命令：`npm run build`、`npm run smoke`。基地 3D 运行时验收：`node scripts/check-base-merge.cjs`、`node scripts/check-base-3d.cjs`。素材旧预览检查：`node scripts/check-remaining.cjs 31 68`（依赖58922演示服务，只验证这38组，不能替代新集成验收）。

必须实测：四角格映射、多个相同ID、空格移动、不同ID交换、合法/非法合成、满级、跨链50023→50024、蓝图700xx不可合成、可升级普通生成器、首次选中再次产出、满盘不错误消耗、累计spawnedCount、CD跨刷新、特殊拖拽、纸箱/蜘蛛网/气泡、背包、任务提交、剧情弹窗阻断输入、存档重载、缺模型/404、手机安全边距、退出场景无残留循环。

给KIMI的执行要求：先报告接入触点与真实素材缺口，再实现渲染替换；不得改合成收益、任务、发射器次数、存档格式或基地规则。完成后提供棋子 GLB 真实加载截图、上述交互检查结果、构建结果和仍未解决的问题。
- [ ] 缺少 GLB 时正常回退 2D 图标。
