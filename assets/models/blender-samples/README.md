# Blender 三件美术样品

样品：10005 旧工具箱、10028 加固手套、50025 橘猫。以项目 `assets/generated/icon_p<ID>.png` 为造型与配色参考，通过 Blender MCP 执行 `scripts/blender-samples.py` 制作。

运行 `node scripts/serve-three-demo.cjs 58922`，打开 http://127.0.0.1:58922/models/blender-samples/index.html 。原图、旧版 GLB、新版 GLB 并排；滑条控制两个模型同步旋转。网页禁用投影。

`refined-samples.blend` 是可编辑源文件副本，样品在 `ArtSamples_Refined` 最新后缀场景中；`prop_*.glb` 为独立静态模型，Y 向上、底部近原点，最大尺寸约 0.83 格。`prop_*.png` 和 `lineup.png` 是 Blender 透明背景渲染。

这些是视觉验证样品，尚未替换正式游戏素材。橘猫未绑定骨骼或制作动画；手套几何量偏高，批量接入前需要进一步减面。手绘笔触和磨损贴图仍未达到原画的还原度。

验证：`node scripts/check-blender-samples.cjs`，检查 GLB 加载、尺寸、底部位置、旋转交互、桌面/手机溢出及 JavaScript 错误。
