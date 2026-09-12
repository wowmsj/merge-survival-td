# 暖土方块风格 · KIMI 资源交付

## 坐标与加载

- 基地：13×13，中心 `(col-6, 0, row-6)`，地块边长 `0.925`，单格建筑不超过该范围。
- 地形和建筑按 `warm-base-layout.json` 的 `tiles` / `buildings` 读取；逻辑仍由 Phaser/TypeScript 负责。
- 合成物品层已并入基地 13×13 网格（独立棋盘已废弃，棋子与建筑共用同一套基地坐标规则）。
- Three.js 使用 `GLTFLoader`，每个 GLB 缓存后 `clone(true)`；模型不负责碰撞、寻路、HP 或攻击。

## 文件

目录：`assets/models/blender-samples/`

- 基地完整场景：`warm_base_13x13.glb`；源文件：`warm_base_13x13.blend`。
- 地基：`warm_ground_0.glb`、`warm_ground_1.glb`、`warm_ground_2.glb`，三种轻微磨损变体。
- 地形：`warm_grass.glb`、`warm_woods.glb`、`warm_rubble.glb`、`warm_shack.glb`、`warm_pond.glb`。
- 废墟：`warm_ruin.glb`、`warm_ruin_1.glb`、`warm_ruin_2.glb`。
- 建筑视觉占位：`warm_building_tower.glb`、`warm_building_resource.glb`、`warm_building_trap.glb`、`warm_building_wall.glb`。按 `building.json` 的 `kind` 和 `cfgId` 映射；正式建筑可继续替换这些视觉文件，不改规则。
- 怪物视觉占位：`warm_enemy_1.glb` 至 `warm_enemy_8.glb`，对应 `zombie.json` 的 id。速度、血量、飞行/钻地、拆墙等级全部读取配置，不能由模型推断。

## 怪物映射

`1普通`、`2快速`、`3坦克`、`4自爆`、`5精英`、`6Boss`、`7飞行`、`8钻地`。出生、路线、攻击和死亡由 `NightSystem` 控制；模型只显示当前单位。

## 美术约定

暖土褐色、低饱和绿植、铁件/锈色点缀；基地预览页动态阴影。怪物采用可读的色块轮廓，保持小尺寸下的辨识度。模型原点在格中心、Y-up、GLB 内不含游戏光照。

## 生成与验证

- 生成：`Blender --background --factory-startup --python scripts/blender-warm-runtime-pack.py`。
- 基地验证：`node scripts/check-base-style.cjs`。
- 当前交付是可接入视觉包；生产接入后再做压缩、真机性能和逐怪物动画。
