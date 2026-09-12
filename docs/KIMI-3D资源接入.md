# Kimi 接入交接：全量棋子 3D 原型

这是一份文件交接，不代表已经向 Kimi 发送消息或连接其 VS Code 插件。

## 当前交付

- assets/models/manifest.json：可加载的模型清单。
- assets/models/props/prop_<id>.glb：463 个独立道具原型，覆盖全部运行时道具 ID。
- assets/models/inventory.json：依据正式配置生成的资源盘点；建筑本体、英雄和僵尸标为 out-of-this-prop-batch。
- assets/models/index.html：原图与 GLB 对照，提供搜索、分类、分页和旋转查看；通过下述本地服务打开。
- assets/models/sheets/page-<n>.png：20 页整组对照图，每页最多 24 件。
- assets/models/contact-sheet.png：保留的首批 18 件历史预览，不代表全量清单。
- assets/models/previews/prop_<id>.png：逐个 GLB 回读生成的 384×384 透明预览。
- docs/3D模型制作与接入规格.md：已核实的 Phaser 布局和完整制作规范。

所有已导出的 GLB 为正常直立、底部居中，+Y 向上、+Z 正面，最大包围盒尺寸 0.83 单位。几何与所需表面贴图内嵌，不需要 models.js、surfaces.js 或 Canvas 才能显示。
模型尚属 prototype，覆盖全部棋子不等于全部精修美术验收完成。建筑本体、英雄和僵尸不在本次棋子制作范围内。

用户已从首批 18 件扩展到全部棋子。清单读取 getAllProps()，共 454 条 JSON 记录加 9 个代码追加的支撑建筑蓝图碎片，总计 463 条，包含可选货币/奖励展示模型。并非 463 个完全不同的手工雕刻：同类物体复用组件，部分共享外观，manifest 的 family、variant 明确记录。12 个支撑蓝图条目没有对应 2D 原图，reference 为 null，按建筑用途设计图案；预览页明确标注。

采用棕色描边、局部磨损、无投影。全部为真实几何的静态 GLB；纸张、蓝图、书封和徽记允许表面绘图。相对原图仍有程序化简化，尤其毛发、玻璃折射、纸张褶皱和工具轮廓，不是逐像素复刻，也不包含角色动画。

导出前按相同材质合并静态网格并去重顶点，降低绘制次数；保留透明物体的独立排序。manifest 记录每个文件的 bytes、triangles、meshes 和 pixelError。无需额外几何解码器。尚未做真实手机的 54 格满盘帧率验收，不要一次预加载全部模型；按当前棋盘需求加载并缓存。

本次导出统计：463 个 GLB 共 101,502,112 字节（约 101.5 MB），每件平均 5.1 个 Mesh、最多 20 个。包围盒按真实顶点计算，避免旋转工具在合并网格后悬浮。单一验收视角的导出前后像素平均差最大约 0.282/255；该检查验证导出一致性，不代表与 2D 原图的相似度评分。

描边使用反向绕序的几何外壳，避免 glTF 不支持 Three.js BackSide 材质造成整块棕色遮挡。接入时保留该几何和内嵌材质，不要统一覆盖材质或开启双面渲染。加载后将所有 Mesh 的 castShadow、receiveShadow 设为 false；不要额外添加底部阴影贴片。

## 接入要求

正式棋盘 6 行 9 列共 54 格；正式基地 13 行 13 列共 169 格，初始中央 49 格领地。运行时读取存档行列数，不用 Demo 的旧常量。

保留 Phaser 原有合成、任务、发射次数、冷却、体力和存档系统。GLB 仅替换显示层，不搬用 Demo 的简化算法。
Three.js GLTFLoader 加载模型；参考已有 src/three/Night3DRenderer.ts 和 Night3DScene.ts。

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const gltf = await new GLTFLoader().loadAsync('/assets/models/props/prop_20011.glb');
const object = gltf.scene;
object.position.set(col - (cols - 1) / 2, 0, row - (rows - 1) / 2);
scene.add(object);
```

上例 URL 是部署约定：需由接入方配置静态复制，确保 assets/models 被发布；当前不声称正式构建已包含该目录。
多个相同道具应缓存资源并克隆节点，共享几何和材质。场景负责环境反射与光照，GLB 不内嵌 Demo 灯光。
棋盘可在模型外增加展示 pivot 进行倾斜和投影居中，不直接修改资产原始姿态；相机与拾取要同步。

## 验证与重建

本地演示服务启动后执行 `node scripts/export-model-pack.cjs`，将导出并使用 GLTFLoader 回读每个文件，检查尺寸和地面原点。
导出时同时比较源模型和 GLB 回读渲染，防止描边或材质在导出过程中变化。
`node scripts/serve-three-demo.cjs 58922` 启动预览服务，打开 `http://127.0.0.1:58922/models/` 查看整批。
`node scripts/check-model-pack.cjs` 检查文件、透明预览和手机对照页并生成总览图；`node scripts/check-merge-3d.cjs` 检查 58921 上棋盘的合成、拖动、发射器选择和手机显示。
导出命令要求 58922 服务运行；棋盘回归检查另要求 58921 服务运行。
`node scripts/export-model-pack.cjs --ids=10013,10026` 可只更新指定模型并保留其余 manifest 条目。
生成命令会重新生成同名资源和清单，不要直接在生成产物上手改。模型源文件位于 public/merge-demo/ 的 all-models.js、model-parts.js、prop-model-families.js、organic-models.js、device-models.js；首批样式保留在 reference-models.js。

资源验收需在 54 格满盘和 169 格基地中进行，检查手机识别度、遮挡、动画、内存与实际帧率；当前原型不代表这些批量验收已完成。
