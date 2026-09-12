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
