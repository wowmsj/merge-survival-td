# 基地暖土色渲染参数

## 目标

将基地场景调整为：

- 暖土色、低饱和、轻微末世感
- 方块模型边缘清晰，但不出现厚重黑框
- 地面、建筑和地形有明确层次
- 保留柔和接触阴影，避免模型漂浮
- 斜45度左右的可读视角，不使用纯俯视

## 1. Renderer 参数

```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

不要使用纯黑背景，也不要叠加黑色全屏遮罩。

## 2. 场景背景

```js
scene.background = new THREE.Color('#cbb996');
```

如果使用地面承接平面，建议：

```js
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({
    color: '#c4b397',
    roughness: 1.0,
    metalness: 0.0
  })
);

backdrop.rotation.x = -Math.PI / 2;
backdrop.position.y = -0.29;
backdrop.receiveShadow = true;
scene.add(backdrop);
```

## 3. 环境光

```js
const hemiLight = new THREE.HemisphereLight(
  0xffefd2, // 天空色：暖白
  0x685645, // 地面反光：深土褐
  1.8
);
scene.add(hemiLight);
```

## 4. 主光

```js
const keyLight = new THREE.DirectionalLight(0xffd6a6, 2.4);
keyLight.position.set(-7, 11, 6);
keyLight.castShadow = true;

keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0002;
keyLight.shadow.normalBias = 0.02;

keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 40;

scene.add(keyLight);
```

主光方向从左前上方来，建筑正面应有可读亮面，背面保留柔和阴影。

## 5. 补光

```js
const fillLight = new THREE.DirectionalLight(0x9eabc0, 0.35);
fillLight.position.set(6, 5, -6);
scene.add(fillLight);
```

补光只负责保留暗部细节，不要超过主光强度的25%。

## 6. 相机

```js
camera.position.set(-10, 8.5, -10);
camera.up.set(0, 1, 0);
camera.lookAt(0, 0, 0);
```

如果使用正交相机：

```js
const camera = new THREE.OrthographicCamera(
  -8, 8, 8, -8, 0.1, 60
);
```

移动端必须根据容器宽高动态更新 `left/right/top/bottom`，不能写死画布像素尺寸。

### 6.1 手势分工（白天基地与夜战同一套，改一处必须改两处）

| 操作 | 行为 | 说明 |
| --- | --- | --- |
| 单指 / 鼠标左键拖动 | **平移地图** | 内容跟手；地图扩大后靠它翻看边缘 |
| 鼠标右键（或中键）拖动 | **旋转视角** | 与 three.js `OrbitControls` 逐符号一致 |
| 双指捏合 | 缩放 | 双指中点拖动也会平移 |
| 滚轮 | 缩放 | ±15%/格 |
| 轻点（<8px） | 格点击 | 选中/合成/发射/开面板，未变 |
| 拖棋子到画布边缘 | **地图自动平移** | RTS 边缘滑动，见 §6.2 |

旋转方向沿用「**抓住场景**」手感（`sphericalDelta.theta -= dx`、`sphericalDelta.phi -= dy`，
俯角 `elevation = 90° - phi`），即右键向右拖 → 场景向右转、向下拖 → 相机抬高更俯视。

验收：右键拖右时近景格的屏幕 X 必须增大；一指拖右时方位角/俯仰**不能**变化而平移量必须变化
（`scripts/check-base-3d.cjs` 与 `scripts/check-night-3d.cjs`）。玩家曾反馈"旋转是反的"，
说明人眼对"相机跟随拖拽"（`azimuth += dx`）的观感是错的，不要再改回正号。

### 6.2 视角按钮组与边缘滑动

右下角 7 个键（`data-base3d-ctl` / `data-night3d-ctl`，工厂 `makeViewControls`）：

| 键 | 行为 |
| --- | --- |
| ⟲ / ⟳ | 场景左转 / 右转 15°（`azimuth ± 15°`） |
| ⌃ / ⌄ | 相机抬高 / 压低 12°（`elevation ± 12°`，钳位 25°~75°） |
| ⌂ | 回正：方位角/俯仰/缩放/平移全部复位到默认读图视角 |
| ＋ / － | 缩放 ×1.25 / ÷1.25（下限 1，上限见下「放大上限」） |

按钮用 `pointerdown` 触发（不用 `click`）：点一下走一步、按住 320ms 后每 70ms 连续步进。

**默认视角 = 完整基地，绝不裁切**：`WarmOrbitCamera.fitDefaultZoom(底座半边长, 顶高)` 在**默认角度**下
把底座（13/2+0.25=6.75）与建筑顶（2.6）投影一遍，迭代三次反推「刚好不裁切」的倍率（本机 13×13 下 ≈1.246，
四角 NDC 0.98）。⌂ 回正与开局都用它；地图扩大/窗口变化会自动重算。
验收：`check-base-3d.cjs`「默认视角基地完整不裁切」+「边长占用 ≥ 85%」。

**放大上限 = 可用宽度的 2 倍**（`ORBIT_MAX_ZOOM_FACTOR = 2`，绝对上限 `ORBIT_MAX_ZOOM = 8`）：
`fitMaxZoom(底座半边长, 顶高, 可用宽度, 倍数)` 同法迭代，可用宽度 = `min(窗口宽, 游戏画布宽)`
（宽屏桌面上游戏画布只占中间一条，按窗口宽算会把 UI 全盖住）。玩家明确要求"场景能放大到超过屏幕范围、
至少是原来的两倍"，所以上限不再卡在"刚好铺满"：基地最大宽到屏幕的 2 倍，超出部分靠一指平移看，
压住 HUD/卡片栏也允许（DOM 视角按钮仍在最上层，始终可点）。验收：`check-base-3d.cjs`
「倍率上限 ≥ 默认倍率的 2 倍」+「放大到底基地宽度 ≈ 可用宽度的 2 倍」+「放大到底基地确实超出屏幕」。

**平移范围（对角线口径）**：`panLimit = max(取景余量, √2×半边长 + 0.5 − √2×(半边长+余量)/zoom)`。
系数 √2 是因为要拉得到的是**对角角格**（离中心 √2×半边长 ≈ 9.7）而不是轴上的 6.5：
zoom=1 时差值为负 → 退回取景余量（全景仍推不出画面，与旧行为一致）；放到 2 倍时约 5.9，
正好够把任意角格拉进画面。半边长取自 `fit()`，地图扩大后自动跟着变大。验收：`check-base-3d.cjs`
「放大到顶时一指平移能把边角格拉进画面」+「zoom=1 时平移范围收回到取景余量」。

**3D 层铺满整屏、压在最上层（§6.3）**：渲染画布 = 整个窗口（`pointer-events:none`），
基地放大后可以画到网格矩形之外——玩家反馈的"场景左右两侧被界面盖掉一块"就是旧版把画布限制在
网格矩形又被 `overflow:hidden` 裁掉的结果。改法：

| 元素 | 尺寸 | 事件 |
| --- | --- | --- |
| `root`（fixed 容器） | 整屏 | `none` |
| `canvas[data-base3d]` | 整屏 | `none`（不吃 UI 事件） |
| `[data-base3d-input]` 输入层 | 网格矩形 | `auto`（原有交互范围不变） |
| 视角按钮组 | 网格矩形右下角 −8px | 自身 `auto` |

取景用 `WarmOrbitCamera.setFraming(视口, 取景框)` + `camera.setViewOffset`：视锥中心挪到网格矩形中心，
所以**默认构图与旧版逐像素一致**（基地仍落在网格矩形里），只是放大时不再被框线裁掉。
`fit()`/`fitProbe()` 的探针一律以**取景框中心**为原点换算（取景框不在画布中心，只做缩放会算歪），
且投影前必须 `camera.updateMatrixWorld()`——取景迭代里连续改姿态但不渲染，否则 `project()` 读到上一轮姿态
（曾把取景距离迭代到 500 的钳位、基地缩成一点）。

**画布居中**：`#game-container` 已是 flex 居中，Phaser **不要**再开 `scale.autoCenter`
（`CENTER_BOTH` 会再给画布加 margin，两者叠加＝双居中，1280×800 下偏出 622px 深色空边）。
居中只交给 flex；验收：`check-base-3d.cjs` 的「画布居中：620×719 / 412×915 四边留边对称」。

**平移范围**：`WarmOrbitCamera.panLimit = max(取景余量, 半边长 − (半边长+余量)/zoom)`。
zoom=1 时正好等于取景余量（全景仍铺满、推不出画面），放大后范围线性放大，到 zoom=3 时
足够把任意角落推到屏幕中心；半边长取自 `fit()`，**地图扩大后自动跟着变大**，不用改常量。

**边缘滑动**：拖棋子时指针进入画布边缘 48px 内，按 `dt` 计步自动平移（最大 620 px/s），
平移后立刻把棋子与落点提示按同一坐标重投影，棋子始终贴在指针下不脱手。

## 7. 阴影

所有基地建筑、地形和地基设置：

```js
model.traverse((object) => {
  if (!object.isMesh) return;
  object.castShadow = true;
  object.receiveShadow = true;
});
```

棋盘上的合成棋子可以关闭阴影，但基地场景建议保留阴影，否则建筑会像贴在地面上。

## 8. 格线

格线不要使用纯黑。推荐：

```js
const gridLineMaterial = new THREE.LineBasicMaterial({
  color: 0x594636,
  transparent: true,
  opacity: 0.35
});
```

如果格线仍然过重，将透明度降到 `0.25`；不要通过加黑色遮罩解决对比度问题。

## 9. 材质

基础材质参数：

```js
const material = new THREE.MeshStandardMaterial({
  color: '#b09067',
  roughness: 0.82,
  metalness: 0.05
});
```

推荐色板：

| 用途 | 颜色 |
| --- | --- |
| 土地主色 | `#b09067` |
| 土地磨损 | `#c2a57b` |
| 土层侧面 | `#79604b` |
| 沙土 | `#c2a57b` |
| 核心墙体 | `#d4be95` |
| 木材 | `#986c45` |
| 深色木材 | `#735238` |
| 屋顶锈红 | `#a5654d` |
| 石材 | `#9c9988` |
| 深色石材 | `#827e70` |
| 金属 | `#535c58` |
| 金属高光 | `#858a79` |
| 低饱和绿植 | `#8c9060` |
| 水面 | `#657f7a` |

材质原则：

- 墙体不能使用纯白。
- 金属不能使用纯黑。
- 绿色和青色降低饱和度，避免抢过核心建筑。
- 地面使用高粗糙度，避免塑料感。
- 不要给每个方块随机大幅换色，只保留轻微色差。

## 10. 色调映射验收

完成后检查：

1. 地块之间仍能看出独立格子，但格线不应成为画面主体。
2. 核心建筑亮面、暗面和屋顶都能区分。
3. 废墟、树林、水池有不同轮廓，不依赖高饱和颜色区分。
4. 场景四角不能比中心黑太多。
5. 关闭阴影时模型仍可见，开启阴影后只增加空间感，不改变整体色调。
6. 移动端画面不能横向溢出。

## 11. 基地坐标约定

正式基地为 `13×13`：

```js
const x = col - 6;
const z = row - 6;
const y = 0;
```

单格地块边长为 `0.925`，格距为 `1.0`。模型只负责显示，不能用模型边界代替基地逻辑、寻路、建筑占用或怪物碰撞判断。

## 12. 推荐初始化顺序

```js
// 1. 创建 renderer、scene、camera
// 2. 设置色彩空间和 ACES 色调映射
// 3. 添加背景和地面承接平面
// 4. 添加 HemisphereLight
// 5. 添加 DirectionalLight 和阴影
// 6. 加载地基、地形、建筑 GLB
// 7. 设置 castShadow / receiveShadow
// 8. 根据当前存档 state.base 摆放格子
// 9. 最后添加 UI、领地边界和战斗提示
```

## 13. 当前资源入口

- 完整基地：`assets/models/blender-samples/warm_base_13x13.glb`
- 新版布局：`assets/models/blender-samples/warm-base-layout.json`
- 基地预览：`assets/models/blender-samples/base-style.html`
- Blender 源文件：`assets/models/blender-samples/warm_base_13x13.blend`

本参数文档只约束渲染表现，不改变 Phaser 的基地规则、怪物规则、建筑数值或存档结构。
