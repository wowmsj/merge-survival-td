# KIMI 基地场景素材对接（第一版）

本批只提供基地视觉素材，不改正式项目玩法。2026-09-09核对；工程根目录为 `D:/小程序和小游戏/二合+生存建造`，下列路径均相对该目录。

## 交付

### 2026-09-10 暖土色候选版本

延续已认可的独立方块地板小样，新增完整13×13候选场景；旧版文件保留，尚未接入正式游戏。

- 预览：`assets/models/blender-samples/base-style.html`，默认完整基地，可切换原3×3小样和独立模块。
- 完整场景及源文件：`warm_base_13x13.glb`、`warm_base_13x13.blend`。
- 布局：`warm-base-layout.json`，包含169格、46个去重建筑实例；已与当前 `createDefaultBase()` 比较。
- 12个单格模块：`warm_core.glb`、`warm_ground_0/1/2.glb`、`warm_grass.glb`、`warm_woods.glb`、`warm_rubble.glb`、`warm_shack.glb`、`warm_pond.glb`、`warm_ruin.glb`、`warm_ruin_1/2.glb`（斜线数字表示各自独立文件）。
- 格距1、地块宽0.925、表面Y=0；地块中心仍为 `(col-6,0,row-6)`。读取建筑 `rotationY`（弧度），东/西侧废墟旋转90°。逻辑占地、通路不变。
- 土地三种微差、废墟三种破损外观均仅影响视觉，不新增地形规则。
- 模块内部已应用变换、倒角并按材质合并；地块、地形、建筑节点仍独立。整场景约0.95MiB，尚未做压缩或移动真机性能验收。
- 光照为浏览器动态光照，柔和阴影和米色背景不包含在GLB内。参考预览页的灯光、色调映射配置；不要把当前截图当成模型自带贴图。
- 重建：Blender后台运行 `scripts/blender-base-style-full.py`；核验：`node scripts/check-base-style.cjs`。

以下为旧版交付清单，规则说明仍适用；选用暖土版时按上面的新文件名接入。

目录：`assets/models/blender-samples/`

| 文件 | 用途 |
| --- | --- |
| `base_13x13_voxel.glb` | 按正式开局配置组装的完整场景，节点未焊死 |
| `base_13x13_voxel.blend` | 完整场景的Blender源文件 |
| `base_ground.glb` | 单格地块，复制169份可重建底板 |
| `base_core.glb` | 初始核心，单格占地 |
| `base_grass.glb` | 杂草地形装饰 |
| `base_woods.glb` | 树林地形装饰 |
| `base_rubble.glb` | 瓦砾地形装饰 |
| `base_shack.glb` | 破旧建筑地形装饰，不是可建造建筑 |
| `base_pond.glb` | 水池地形装饰 |
| `base_ruin.glb` | 外围可坍塌废墟建筑 |
| `base_13x13-layout.json` | 169格初始状态、建筑实例、模块映射、单位约定 |
| `base-runtime-snapshot.json` | 本次提取的createDefaultBase结果，保留原始重复角点供核对 |
| `base.html` | 独立验收页，可旋转、缩放、查看单件及隐藏地形/废墟 |

本批不含箭塔、炮塔、发电站等可建造建筑全集，不含敌人/英雄、升级外观、动画或战斗效果。这些不能用棋子的蓝图模型冒充。

## 正式规则与坐标

- 基地13行×13列，共169格，核心(row=6,col=6)；不是合成棋盘6行×9列。
- `BaseScene.ts`：CELL=74px，GAP=6px，中心间距80px。可见区域为1034×1034px。
- 3D格距1单位，地块边长74/80=0.925单位。坐标 `(x,y,z)=(col-6,0,row-6)`，地表高度0；建筑/地形直接放在此坐标，不使用合成棋子的0.76缩放。
- GLB已转换为Y-up，不能再转90度。模型XZ中心为格中心；地块向下延伸至约-0.26，装饰在地表上方。
- 核心占地宽深0.88单位，其他模块不超过单格地块宽深；地面层与装饰层分别加载，清除地形只删装饰，保留底板。
- 初始已认领49格，切比雪夫距离<=3；62个地形实例。**实际地形配置中有7处在已认领区**，注释“中央7×7全平地”已过时，本批忠实保留实际配置。
- 外围废墟45个唯一位置，核心1个，总计46个建筑视觉实例。createDefaultBase原始建筑数组48项，北西/南西角重复；本批仅渲染去重，不修改游戏状态。
- 东边col=12，row=4/5/6留缺口；不要误改成5/6/7。废墟按正式系统north→west→south→east顺序坍塌，不由动画或模型计时器决定。

## 动态接入

推荐使用独立模块，布局读取**当前存档state.base**；交付JSON只用于新开局核对，不可覆盖老玩家进度。

1. 每个格子创建ground实例。
2. 若`tiles[row][col].terrain`存在，加载相应地形实例。
3. 遍历`buildings[]`按cfgId映射建筑素材，本批只有cfgId=1核心及正式RUIN_ID对应废墟。
4. 按claimed生成可变领地提示/迷雾，提示不烘焙进地块材质。预览金色边界只是初始49格的验收辅助线，不包含在GLB中。
5. 地形清除、扩张、废墟坍塌、建筑移动/拆除后，根据业务状态增删对应节点。完整GLB的组名：`tile_<row>_<col>`、`terrain_<row>_<col>`、`building_<row>_<col>`。本批命名顺序是row,col，与旧合成棋盘tile_col_row不同。

GLTFLoader模板按资源缓存，实例clone(true)，不要复用同一个Object3D到多个格。共享geometry/material不能在删除一个实例时dispose；场景退出或释放整个缓存时再统一清理。

## 逻辑边界

继续调用`src/core/systems/BaseSystem.ts`的canPlace/place等正式入口，不在渲染器里复写建造和通路判断。旧BaseZone“塔只能在外围”的注释不能当作当前建造规则；当前canPlace检查解锁、占格、地形、领地、通道及金币。

地形和外围废墟不是同一种东西：地形存在tiles.terrain中，无HP；外围废墟在buildings中，有生命值和坍塌流程。

- 地面怪：杂草、树林可走；瓦砾、破旧建筑、水池不可走。
- 钻地怪：只有水池阻挡（其他行为继续走战斗系统）。
- 边缘地形允许刷怪的是杂草、树林。
- 核心和陷阱的通行语义继续服从Base.ts；不得用模型几何碰撞代替网格寻路。
- 别把外缘做成无法移除的完整围墙，否则会破坏扩张和刷怪入口变化。

## 渲染、预览与发布

延续土褐地面、低饱和绿植、金属/锈色点缀的方块风格，无投影。预览采用正交斜45度相机，可Orbit旋转查看；该镜头参数仅为展示建议，不修改正式坐标。

素材包含材质，不需要外部贴图；保留GLTF材质和灯光，避免统一覆盖成白模。地面磨损限于格子边缘，不遮挡建筑和路线标识。

本批为可接入第一版静态素材，已检查布局/坐标/占地和浏览器显示，但**未完成生产级压缩、draw-call优化、整套战斗集成或真机性能验收**。大量重复地块/装饰可由接入者在材质分组后做InstancedMesh；不影响按格动态显隐的能力。

本地预览：`http://127.0.0.1:58922/models/blender-samples/base.html`。正式Webpack URL应为`<部署基路径>/assets/models/blender-samples/...`，不要照搬演示服务器专属/models路由。发布只带所需GLB/JSON，不带.blend、参考截图和脚本。

生成：`Blender --background --factory-startup --python scripts/blender-base-13x13.py`（读取本次运行时快照）。规则更新后先重新提取createDefaultBase，再生成；检查脚本会检测快照与当前配置偏差。

验证：`node scripts/check-base-assets.mjs`；浏览器验证：`node scripts/check-base-preview.cjs`（需58922演示服务）。两项已通过，覆盖169格、49格claimed、实际地形/建筑、8模块占地、Y-up、东侧缺口、单件加载、隐藏废墟、手机页面无横向溢出及控制台错误。

接入后额外验收：读取老存档、清地形后格子还在、认领扩张、四边废墟逐步移除、怪物出生点/路线不被视觉改变、核心不覆盖邻格、无素材时回退原图、弹窗阻断输入、退出场景释放渲染循环。
