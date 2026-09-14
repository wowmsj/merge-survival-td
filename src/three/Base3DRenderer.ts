/**
 * 基地白天建造场景 3D 渲染器（BaseScene 的网格区域）
 *
 * 与 Night3DRenderer 同架构：WebGL 画布只覆盖 13×13 网格矩形，
 * 顶栏 HUD / 底部建造栏 / 弹窗仍是 Phaser。渲染参数与暖土 GLB 走 warmSceneKit
 * （docs/KIMI-基地渲染参数.md），布局映射同夜战（warm-base-layout.json：
 * 169 格地基 + 地形特征 modules + 作者指定建筑条目）。
 *
 * 交互：单指拖动 = 方位角/俯仰（俯仰 25°~75° 不翻转），双指 = 平移 + 捏合缩放，
 * 滚轮/＋－按钮 = 缩放（1~3 倍），轻点（<8px）= 格子点击（走 BaseScene.handleCellTap 同一判定树）。
 * 物品层（基地即合成场）：棋子复用 BoardItemView（GLB/billboard + 状态覆盖层），
 * 按下落在可拖物品格 → 物品手势（>8px 拖起幽灵棋子，落点回调 host.onItemDrop），
 * 空格/建筑/地图外 → 保持相机手势；建造摆放/英雄部署模式下物品手势禁用。
 * 弹窗/剧情打开时（host.inputBlocked）隐藏画布与覆盖层，让位 Phaser 弹窗（同棋盘 3D 纪律）。
 *
 * 模型只管显示：建造/升级/拆除/地形清除/英雄部署全部由 BaseScene 调 syncAll() 驱动刷新，
 * 物品层由 BaseScene 监听 GRID_ITEM_* 事件调 refreshCell/refreshItems 刷新。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { IGameState, IBuilding, IPoint, ItemStatus } from '../core/types';
import { getBuildingConfig, IBuildingConfig } from '../core/config/BuildingConfig';
import { getHeroConfig } from '../core/config/HeroConfig';
import { BASE_COLS, BASE_ROWS, INNER_CITY_MAX, INNER_CITY_MIN, WORLD_CITY_ORIGIN, WORLD_SIZE, findCoreBuilding, isInnerCity } from '../core/model/Base';

/** 战争迷雾渲染盘的边长（世界单位）：远大于逻辑世界（64），保证缩到最小时雾铺满视野、看不见盘边界 */
const WORLD_FOG_SPAN = 120;

/**
 * 内城/外城地板色调：地基瓦片的贴图是暖沙色，色调只能"乘"（0..1 只能压暗不能提亮），
 * 所以内城保持原色（明亮的合成区），外城乘一层偏灰的暖褐（更暗、更"土"的防御环带）。
 */
const INNER_FLOOR_TINT = 0xffffff;
const OUTER_FLOOR_TINT = 0xa8927c;
import { getItem } from '../core/model/Grid';
import { itemCanDrag, itemIsBubble } from '../core/model/Item';
import {
  canChargerTarget, canLvUpTarget, canSplitTarget, getMergeNextId, getProp, PROP_IDS
} from '../core/config/PropConfig';
import { getHeroName, getText } from '../core/i18n';
import { BoardItemView, IBoardItemHost } from './BoardItemView';
import type { IRouteCell } from '../core/systems/RoutePreview';
import {
  WARM_LAYOUT_URL, cellToWorld13, worldToCell13, applyWarmRendererSettings, createWarmScene,
  WarmOrbitCamera, WarmGlbCache, makeViewControls, disposeObjectTree,
  ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION, ORBIT_MIN_ZOOM,
  ORBIT_ROTATE_STEP, ORBIT_TILT_STEP
} from './warmSceneKit';

declare const __DEV_FEATURES__: boolean;
declare const __ASSET_VERSION__: string;

/** 布局清单结构（只取用到的字段，与夜战一致） */
interface IWarmLayoutTile { row: number; col: number; model: string }
interface IWarmLayoutBuilding { cfgId: number; row: number; col: number; model: string; rotationY?: number }
interface IWarmLayout {
  modules: Record<string, string>;
  tiles: IWarmLayoutTile[];
  buildings: IWarmLayoutBuilding[];
}

/** 建筑 kind → GLB（cfgId 细分差异由配置驱动逻辑，模型只做视觉） */
const BUILDING_GLB: Record<string, string> = {
  core: 'warm_core.glb',
  tower: 'arrow_tower_v6.glb',
  resource: 'reference_house.glb',
  trap: 'warm_building_trap.glb',
  wall: 'warm_building_wall.glb'
};
const BUILDING_GLB_BY_CFG: Record<number, string> = {
  202: 'medical_station.glb',
  203: 'power_station.glb',
  204: 'outpost.glb',
  205: 'warehouse.glb',
  206: 'workshop.glb',
  207: 'collection_station.glb',
  208: 'ammo_depot.glb',
  209: 'radar_station.glb',
  210: 'repair_station.glb'
};
/** 废墟三种变体（布局未指定的运行时新增废墟按格哈希取变体） */
const RUIN_GLBS = ['warm_ruin.glb', 'warm_ruin_1.glb', 'warm_ruin_2.glb'];

// ---------- 物品层常量 ----------
/** 棋子放置高度（地基顶 0 + 防贴面闪烁，同棋盘 CELL_Y） */
const ITEM_Y = 0.162;
/** 僵尸路线箭头贴地高度：在地面之上、棋子(0.162)/落点提示(0.065)之下 */
const ROUTE_Y = 0.055;
/** 拖拽抬升高度（拖拽跟随平面同高，棋子视觉正好贴在指针下） */
const DRAG_Y = 0.9;
const DRAG_THRESHOLD = 8;
/** 拖棋子时靠近画布边缘多少像素内开始自动平移地图，以及最大平移速度（CSS 像素/秒） */
const EDGE_PAN_MARGIN = 48;
const EDGE_PAN_MAX_SPEED = 620;

/** 核心格长按判定时长（ms）：与 BaseScene.CORE_HOLD_MS 一致（短按=发射，长按=核心面板） */
const CORE_HOLD_MS = 480;
const IDLE_HINT_DELAY = 5000; // 玩家空闲 5 秒后提示可合成对（对齐旧棋盘渲染器）
const ITEM_MODEL_DIR = 'assets/models/blender-samples';
/** 棋子统一视觉尺寸：包围盒最大边归一化到该值 */
const ITEM_TARGET_SIZE = 0.8;

/** quad 贴片纹理缺失时的纯色兜底 */
const QUAD_FALLBACK_COLOR: Record<string, string> = {
  'cell-select': 'rgba(255,224,102,0.45)',
  'cell-hint': 'rgba(81,207,102,0.45)',
  'spider': 'rgba(255,255,255,0.35)'
};

/** 暖土包无英雄模型：程序化替身（胶囊 + 头），用英雄配置色 */
function createHeroStandin(fxColor: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: fxColor, roughness: 0.82, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), mat);
  body.position.y = 0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat);
  head.position.y = 0.72;
  g.add(body, head);
  return g;
}

/** 建筑程序化占位（GLB 到达前即时显示/回退）：色块按 kind 取规范色板 */
const PROC_COLORS: Record<string, number> = {
  core: 0xd4be95, tower: 0x986c45, resource: 0x9c9988, trap: 0x8c9060, wall: 0x986c45, ruin: 0x827e70
};
function createProcBuilding(cfgId: number): THREE.Group {
  const cfg = getBuildingConfig(cfgId);
  const g = new THREE.Group();
  const color = PROC_COLORS[cfg?.kind ?? ''] ?? 0x9c9988;
  const h = cfg?.kind === 'tower' ? 0.9 : cfg?.kind === 'trap' ? 0.15 : cfg?.kind === 'ruin' ? 0.2 : 0.45;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, h, 0.8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.05, flatShading: true })
  );
  box.position.y = h / 2;
  g.add(box);
  return g;
}

/** 建筑视图：group 承载位置，content 可被 GLB 升级替换（GLB 实例材质已克隆，可单体压暗） */
interface IBuildingView {
  group: THREE.Group;
  content: THREE.Object3D;
  cfgId: number;
  glbApplied: boolean;
  tag: HTMLDivElement;
  hpBar: HTMLDivElement;
  hpFill: HTMLDivElement;
}

interface IHeroView {
  group: THREE.Group;
  key: string;
  tag: HTMLDivElement;
  hpFill: HTMLDivElement;
}

/** BaseScene 注入的能力（场景持有 baseSystem/heroSystem 与弹窗状态） */
export interface IBase3DHost {
  /** 弹窗/剧情打开时隐藏 3D 层并屏蔽输入 */
  inputBlocked(): boolean;
  /** 轻点格子（<8px）→ BaseScene.handleCellTap 同一判定树 */
  onCellTap(row: number, col: number): void;
  /** 长按格子（基地核心格 ≥480ms）→ 打开核心面板；缺省则长按无效果 */
  onCellLongPress?(row: number, col: number): void;
  /** 摆放模式下悬停格变化（含 null = 移出网格）→ 用于「放这里之后僵尸改走哪」的路线预览 */
  onCellHover?(row: number | null, col: number | null): void;
  /** 物品拖拽落点（源格≠目标格）→ BaseScene.handleItemDrop → MergeSystem.moveOrMerge */
  onItemDrop(src: IPoint, target: IPoint): void;
  /** 当前待摆放建筑配置（null=非摆放模式；塔类带 range 用于悬停范围圈） */
  placingCfg(): IBuildingConfig | null;
  /** 英雄部署模式 */
  placingHero(): boolean;
  /** 摆放/部署合法格判定（绿色提示格） */
  canPlaceAt(row: number, col: number): boolean;
  /** 建筑徽标信息：供电 / 对空覆盖 */
  decorate(b: IBuilding): { powered: boolean; antiAir: boolean };
  /** 物品是否被进行中任务需要（棋子角标勾；可选，缺省恒 false） */
  taskNeeded?(id: number): boolean;
}

export class Base3DRenderer implements IBoardItemHost {
  readonly scene: Phaser.Scene;
  readonly state: IGameState;
  private host: IBase3DHost;

  private root: HTMLDivElement;      // fixed 容器（对齐网格矩形）
  private canvas: HTMLCanvasElement;
  /** 输入层：只盖网格矩形的透明层（渲染画布 pointer-events:none，UI 事件照常） */
  private inputLayer: HTMLDivElement;
  /** 视角按钮组（锚在网格矩形右下角，随窗口尺寸重排） */
  private viewControls: HTMLDivElement;
  readonly overlayLayer: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private tscene: THREE.Scene;
  private orbit = new WarmOrbitCamera();
  private glbs = new WarmGlbCache();

  private layout: IWarmLayout | null = null;
  private terrainGroup: THREE.Group | null = null;
  private terrainMeshes = new Map<string, THREE.Object3D>();
  /** 纸箱封印外观实例（复用地图瓦砾堆 GLB，键 = "row,col"） */
  private sealMeshes = new Map<string, THREE.Object3D>();
  private groundTileCount = 0;
  private terrainLoaded = false;
  private terrainFallback = false;
  private gridHelper: THREE.GridHelper;
  private border: THREE.Mesh;
  /** 兜底内城浅色板（仅在没有 GLB 地基时显示） */
  private innerPlate: THREE.Mesh | null = null;

  private buildingViews = new Map<string, IBuildingView>();
  private heroViews = new Map<string, IHeroView>();
  private placementHints = new THREE.Group();
  /** 僵尸路线箭头（贴地 quad 池，复用避免每次重建） */
  private routeGroup = new THREE.Group();
  private routeMeshes: THREE.Mesh[] = [];
  /** 上一次上报的悬停格（避免重复重算路线） */
  private lastHoverCell: string | null = null;
  private hoverRing: THREE.Mesh | null = null;
  private selectedRing: THREE.Mesh | null = null;

  private pointers = new Map<number, { sx: number; sy: number; px: number; py: number }>();
  private pinch: { d0: number; z0: number; mx: number; my: number } | null = null;
  private camDragging = false;
  /** 单指相机手势模式：true = 旋转（鼠标右键/中键拖动），false = 平移地图（触摸与左键） */
  private camRotate = false;
  /** 首次布局时把相机压到「默认不裁切」倍率；之后窗口尺寸变化不打断玩家当前视角 */
  private viewInitialized = false;
  /** 拖棋子时靠近画布边缘自动平移地图：上一帧时间戳（按 dt 计步，帧率无关） */
  private lastFrameTs = 0;
  private downCell: { row: number; col: number } | null = null;
  /** 核心格长按计时（长按 = 打开核心面板，短按 = 发射/选中） */
  private holdTimer: number | null = null;
  private holdFired = false;
  private disposed = false;
  private lastBlocked = false;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // ---- 物品层（棋盘棋子同套 BoardItemView，13×13 与基地格 1:1） ----
  private itemViews: BoardItemView[][] = [];
  private itemLoader = new GLTFLoader();
  private itemModelCache = new Map<number, Promise<THREE.Object3D | null>>();
  private texUrlCache = new Map<string, string | null>();
  private quadMaterialCache = new Map<string, THREE.Material>();
  private quadDisposables: { dispose(): void }[] = [];
  /** 战争迷雾贴图（懒生成 + 复用；dispose 由 quadDisposables 负责） */
  private worldFogTex: THREE.Texture | null = null;
  /** 迷雾材质：透明度随缩放淡入淡出（update() 里改） */
  private fogMat: THREE.MeshBasicMaterial | null = null;
  /** 内城/外城地板材质（按源材质 + 区域共享，避免 169 份材质） */
  private zoneMats = new Map<string, THREE.Material>();
  /** 各取一个代表网格，供 e2e 断言内外城地板颜色确实不同 */
  private innerFloorMesh: THREE.Mesh | null = null;
  private outerFloorMesh: THREE.Mesh | null = null;
  readonly billboardQuat = new THREE.Quaternion();
  /** 状态贴片共享几何（格顶 quad，1 格见方）；实例级，dispose 时释放 */
  readonly quadGeo: THREE.BufferGeometry = new THREE.PlaneGeometry(0.946, 0.946).rotateX(-Math.PI / 2);
  /** 选中框（贴格顶 3D quad，随相机透视） */
  private selectMesh: THREE.Mesh;
  private selectPos: IPoint | null = null;
  private hintMeshes: THREE.Mesh[] = [];
  private hoverQuad: THREE.Mesh | null = null;

  // ---- 物品拖拽手势（'none'|'item'；相机手势沿用 camDragging/pinch） ----
  private gesture: 'none' | 'item' = 'none';
  private dragView: BoardItemView | null = null;
  private dragSrc: IPoint | null = null;
  private hasDragged = false;
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_Y);
  /** 空闲合成对提示：上次操作时间（pointerdown 重置，IDLE_HINT_DELAY 无操作后两个可合成棋子跳起） */
  private lastActionTime = Date.now();

  constructor(scene: Phaser.Scene, state: IGameState, host: IBase3DHost, gridRect: { left: number; top: number; size: number }) {
    this.scene = scene;
    this.state = state;
    this.host = host;

    this.tscene = createWarmScene({ transparent: true }).scene;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    applyWarmRendererSettings(this.renderer);
    this.renderer.setClearColor(0x000000, 0); // 透明：基地模型浮在 Phaser 背景上
    this.renderer.setPixelRatio(Math.min(3, window.devicePixelRatio || 1)); // 清晰度优先（与棋盘一致）
    this.canvas = this.renderer.domElement;
    this.canvas.dataset.base3d = '1';

    // fixed 容器铺满整屏（3D 场景在最顶层）；弹窗打开时整体隐藏
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:fixed;left:0;top:0;z-index:5;pointer-events:none;overflow:hidden;';
    document.body.appendChild(this.root);
    // 渲染画布铺满整屏但不收事件：放大后基地可以画到艺术背景/字面 UI 之上，不再被网格矩形切掉
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;touch-action:none;';
    this.root.appendChild(this.canvas);
    // 输入层：严格只盖网格矩形（保持原有交互范围，HUD/菜单/卡片栏不受影响）
    this.inputLayer = document.createElement('div');
    this.inputLayer.dataset.base3dInput = '1';
    this.inputLayer.style.cssText = 'position:absolute;pointer-events:auto;touch-action:none;';
    this.root.appendChild(this.inputLayer);
    this.overlayLayer = document.createElement('div');
    this.overlayLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    this.root.appendChild(this.overlayLayer);
    // 视角按钮组：锚在网格矩形右下角（root 现在铺满整屏，默认的 right/bottom 会跑到屏幕角落压住卡片栏）
    this.viewControls = makeViewControls(this.root, 'base3dCtl', {
      rotateLeft: () => this.orbit.nudgeAzimuth(ORBIT_ROTATE_STEP),
      rotateRight: () => this.orbit.nudgeAzimuth(-ORBIT_ROTATE_STEP),
      tiltUp: () => this.orbit.nudgeElevation(ORBIT_TILT_STEP),
      tiltDown: () => this.orbit.nudgeElevation(-ORBIT_TILT_STEP),
      reset: () => this.orbit.resetView(),
      zoomIn: () => this.orbit.setZoom(this.orbit.zoom * 1.25),
      zoomOut: () => this.orbit.setZoom(this.orbit.zoom / 1.25)
    }, 'position:absolute;display:grid;grid-template-columns:repeat(2,36px);gap:6px;pointer-events:none;');

    // 程序化兜底网格/边界（§8 暖褐格线不纯黑；GLB 地基就位后隐藏）
    const gridSize = Math.max(BASE_COLS, BASE_ROWS);
    this.gridHelper = new THREE.GridHelper(gridSize, gridSize, 0x594636, 0x594636);
    (this.gridHelper.material as THREE.LineBasicMaterial).transparent = true;
    (this.gridHelper.material as THREE.LineBasicMaterial).opacity = 0.35;
    this.gridHelper.position.y = 0.01;
    this.tscene.add(this.gridHelper);
    this.border = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_COLS + 0.5, 0.1, BASE_ROWS + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x79604b, roughness: 0.82, metalness: 0.05 })
    );
    this.border.position.y = 0.05;
    this.tscene.add(this.border);

    // 无 GLB 地基时的兜底：内城再叠一块略高的浅色板，保证内外城地板颜色仍然能区分
    {
      const inner = INNER_CITY_MAX - INNER_CITY_MIN + 1; // 9
      const innerCenter = (INNER_CITY_MIN + INNER_CITY_MAX) / 2; // 6
      const innerMat = new THREE.MeshStandardMaterial({ color: 0x8d7358, roughness: 0.82, metalness: 0.05 });
      const innerPlate = new THREE.Mesh(new THREE.BoxGeometry(inner, 0.08, inner), innerMat);
      const world = cellToWorld13(innerCenter, innerCenter);
      innerPlate.position.set(world.x, 0.09, world.z);
      this.innerPlate = innerPlate;
      this.tscene.add(innerPlate);
      this.quadDisposables.push(innerPlate.geometry, innerMat);
    }

    // 内城/外城分界：中央 9×9 的内城描一圈金线（内城只合成，炮塔只能建在外城环带）
    {
      const inner = INNER_CITY_MAX - INNER_CITY_MIN + 1; // 9
      const innerCenter = (INNER_CITY_MIN + INNER_CITY_MAX) / 2; // 6
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(inner + 0.06, 0.02, inner + 0.06)),
        new THREE.LineBasicMaterial({ color: 0xd4a94e, transparent: true, opacity: 0.75 })
      );
      frame.position.set(
        cellToWorld13(innerCenter, innerCenter).x,
        0.075,
        cellToWorld13(innerCenter, innerCenter).z
      );
      this.tscene.add(frame);
    }

    // 世界层（战争迷雾）：64×64 地面 + 城市之外近不透明的雾，城市 13×13 居中
    this.buildWorld();

    this.tscene.add(this.placementHints);

    // 僵尸路线箭头层（贴地，压在选择框/落点提示之下，免得挡住交互提示）
    this.routeGroup.renderOrder = 1;
    this.tscene.add(this.routeGroup);

    // 物品选中框（贴格顶 3D quad，随透视贴合地面）
    this.selectMesh = new THREE.Mesh(this.quadGeo, this.quadMaterial('cell-select'));
    this.selectMesh.position.y = 0.06;
    this.selectMesh.visible = false;
    this.tscene.add(this.selectMesh);

    // 13×13 物品棋子视图（基地即合成场，与 state.grid 1:1）
    for (let r = 0; r < BASE_ROWS; r++) {
      const row: BoardItemView[] = [];
      for (let c = 0; c < BASE_COLS; c++) {
        const view = new BoardItemView(this, r, c);
        this.tscene.add(view.root);
        row.push(view);
      }
      this.itemViews.push(row);
    }

    this.layoutRect(gridRect);
    void this.initWarmTerrain();

    // 输入挂在「只盖网格矩形」的输入层上（渲染画布 pointer-events:none，不吃 UI 事件）
    this.inputLayer.addEventListener('pointerdown', this.onPointerDown);
    this.inputLayer.addEventListener('pointermove', this.onPointerMove);
    this.inputLayer.addEventListener('pointerup', this.onPointerUp);
    this.inputLayer.addEventListener('pointercancel', this.onPointerCancel);
    this.inputLayer.addEventListener('pointerleave', this.onPointerCancel);
    this.inputLayer.addEventListener('wheel', this.onWheel, { passive: false });
    // 右键拖动 = 旋转：屏蔽右键菜单，否则一按就弹菜单打断手势
    this.inputLayer.addEventListener('contextmenu', this.onContextMenu);

    this.syncAll();

    // 开发调试钩子（e2e 验收用），生产包不注入
    if (__DEV_FEATURES__) {
      (window as unknown as Record<string, unknown>).__base3d = {
        type: 'base3d',
        owner: this,
        terrain: () => ({
          loaded: this.terrainLoaded,
          fallback: this.terrainFallback,
          tiles: this.groundTileCount,
          features: this.terrainMeshes.size
        }),
        buildings: () => {
          let glb = 0;
          for (const v of this.buildingViews.values()) if (v.glbApplied) glb++;
          return { total: this.buildingViews.size, glb, procedural: this.buildingViews.size - glb };
        },
        heroes: () => this.heroViews.size,
        placementHints: () => this.placementHints.children.length,
        camera: () => ({
          azimuth: this.orbit.azimuth,
          elevation: this.orbit.elevation,
          zoom: this.orbit.zoom,
          defaultZoom: this.orbit.homeZoom,
          targetX: this.orbit.target.x,
          targetZ: this.orbit.target.z,
          panLimit: this.orbit.panLimit,
          minElevation: ORBIT_MIN_ELEVATION,
          maxElevation: ORBIT_MAX_ELEVATION,
          minZoom: ORBIT_MIN_ZOOM,
          maxZoom: this.orbit.zoomMax
        }),
        fit: (halfExtent?: number, topY?: number) =>
          this.orbit.fitProbe(halfExtent ?? BASE_COLS / 2, halfExtent ?? BASE_ROWS / 2, topY ?? 1.8),
        /** 取景框（世界窗口 = 网格矩形）与基地中心投影，校验 viewOffset 有没有把基地摆回框中心 */
        framing: () => ({
          frame: this.orbit.frameCenter,
          projected: this.orbit.projectCenter(),
          baseDist: this.orbit.baseDist,
          inputRect: this.inputLayer.getBoundingClientRect().toJSON(),
          canvasRect: this.canvas.getBoundingClientRect().toJSON()
        }),
        dialogOpen: () => this.host.inputBlocked(),
        /** 内城/外城地板颜色（e2e 断言两区确实不同色） */
        zones: () => {
          const hex = (m: THREE.Mesh | null): string | null => {
            const mat = m && (Array.isArray(m.material) ? m.material[0] : m.material);
            const col = (mat as THREE.MeshStandardMaterial | undefined)?.color;
            return col ? `#${col.getHexString()}` : null;
          };
          return {
            inner: hex(this.innerFloorMesh),
            outer: hex(this.outerFloorMesh),
            innerTint: `#${new THREE.Color(INNER_FLOOR_TINT).getHexString()}`,
            outerTint: `#${new THREE.Color(OUTER_FLOOR_TINT).getHexString()}`,
            innerPlateVisible: !!this.innerPlate?.visible,
            loaded: this.terrainLoaded
          };
        },
        /** 世界层/战争迷雾：世界尺寸、城市位置、雾贴图上「城内透明 / 城外不透明」的实测像素 */
        world: () => {
          const fog = this.worldFogTex?.image as HTMLCanvasElement | undefined;
          let city: number[] | null = null;
          let outside: number[] | null = null;
          if (fog) {
            const g = fog.getContext('2d');
            if (g) {
              const center = fog.width / 2;
              city = Array.from(g.getImageData(center, center, 1, 1).data);
              // 城外的采样点要落在"雾盘有效范围内"：贴图外缘有一圈渐隐（避免看见雾盘边界），
              // 取正上方 0.28 处（离中心 0.22 < 渐隐起点 0.3）才是真正的不透明雾。
              outside = Array.from(g.getImageData(center, Math.round(fog.height * 0.28), 1, 1).data);
            }
          }
          return {
            size: WORLD_SIZE,
            cityOrigin: WORLD_CITY_ORIGIN,
            fogSpan: WORLD_FOG_SPAN,
            cellToWorld: cellToWorld13(0, 0),
            cityCornerWorld: cellToWorld13(0, 0),
            fogOpacity: this.fogMat?.opacity ?? 0,
            fogCityAlpha: city ? city[3] / 255 : null,
            fogOutsideAlpha: outside ? outside[3] / 255 : null
          };
        },
        cellToScreen: (row: number, col: number) => {
          const { x, z } = cellToWorld13(row, col);
          const v = new THREE.Vector3(x, 0, z).project(this.orbit.camera);
          const rect = this.canvas.getBoundingClientRect();
          return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
        },
        isDisposed: () => this.disposed,
        // ---- 物品层调试（基地合成 e2e 验收用） ----
        state: this.state,
        cellScreen: (row: number, col: number) => {
          const { x, z } = cellToWorld13(row, col);
          const v = new THREE.Vector3(x, 0, z).project(this.orbit.camera);
          const rect = this.canvas.getBoundingClientRect();
          return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
        },
        getSelection: () => (this.selectPos ? { ...this.selectPos } : null),
        getItemAt: (row: number, col: number) => getItem(this.state.grid, row, col),
        itemCount: () => {
          let n = 0;
          for (const row of this.itemViews) for (const view of row) if (view.root.visible) n++;
          return n;
        },
        refreshItems: () => this.refreshItems()
      };
    }
  }

  /**
   * 布局：3D 渲染画布铺满**整屏**（在 UI 之上），输入层只盖网格矩形，取景框 = 网格矩形。
   *
   * 这样基地放大后可以画到网格矩形之外（艺术背景、甚至 HUD/卡片栏之上）——
   * 玩家反馈"场景左右两侧被界面盖掉一块"就是旧版把画布限制在网格矩形、又被 overflow:hidden 裁掉的结果。
   */
  layoutRect(gridRect: { left: number; top: number; size: number }): void {
    const gameCanvas = this.scene.game.canvas;
    const rect = gameCanvas.getBoundingClientRect();
    const scale = rect.width / 1080;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    // 渲染画布：整屏
    this.root.style.width = `${vw}px`;
    this.root.style.height = `${vh}px`;
    this.renderer.setSize(Math.round(vw), Math.round(vh));
    // 输入层与取景框：网格矩形（世界窗口）
    const fx = rect.left + gridRect.left * scale;
    const fy = rect.top + gridRect.top * scale;
    const size = gridRect.size * scale;
    this.inputLayer.style.left = `${fx}px`;
    this.inputLayer.style.top = `${fy}px`;
    this.inputLayer.style.width = `${size}px`;
    this.inputLayer.style.height = `${size}px`;
    // 视角按钮组贴网格矩形右下角（与旧版位置一致，不压卡片栏）
    const cw = this.viewControls.getBoundingClientRect().width || 78;
    const ch = this.viewControls.getBoundingClientRect().height || 162;
    this.viewControls.style.left = `${fx + size - cw - 8}px`;
    this.viewControls.style.top = `${fy + size - ch - 8}px`;
    // 取景：视口整屏、取景框网格矩形（viewOffset 把基地摆回网格矩形中心）
    this.orbit.setFraming(vw, vh, size, size, fx + size / 2, fy + size / 2);
    this.orbit.fit(BASE_COLS / 2 + 0.6, BASE_ROWS / 2 + 0.6);
    // 默认视角：按「底座 + 建筑顶高」在默认角度下的投影顶到刚好不裁切
    // （写死放大倍率会把基地左右两侧切出世界窗口）
    this.orbit.fitDefaultZoom(BASE_COLS / 2 + 0.25, BASE_ROWS / 2 + 0.25, 2.6);
    // 放大上限：基地刚好铺满可用宽度（= min(窗口宽, 游戏画布宽)），再大就压 UI
    this.orbit.fitMaxZoom(BASE_COLS / 2 + 0.25, BASE_ROWS / 2 + 0.25, 2.6, Math.min(vw, rect.width));
    if (!this.viewInitialized) {
      this.viewInitialized = true;
      this.orbit.setZoom(this.orbit.homeZoom);
    }
  }

  // ---------- IBoardItemHost（棋子视图宿主能力） ----------

  cellWorld(row: number, col: number): { x: number; z: number } {
    return cellToWorld13(row, col);
  }

  /** 模型缓存：voxel_32 优先，缺失回退 props/prop_<id>.glb，再缺回退 2D；缓存 Promise 防重复请求 */
  loadModel(id: number): Promise<THREE.Object3D | null> {
    let p = this.itemModelCache.get(id);
    if (!p) {
      p = this.itemLoader.loadAsync(`${ITEM_MODEL_DIR}/voxel_32_${id}.glb?v=${__ASSET_VERSION__}`)
        .catch(() => this.itemLoader.loadAsync(`assets/models/props/prop_${id}.glb?v=${__ASSET_VERSION__}`))
        .then(gltf => {
          // 统一视觉尺寸：量包围盒，最大边归一化到目标值，保留各自形状比例
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const maxEdge = Math.max(size.x, size.y, size.z) || 1;
          const s = Math.min(3, Math.max(0.5, ITEM_TARGET_SIZE / maxEdge));
          gltf.scene.scale.setScalar(s);
          return gltf.scene as THREE.Object3D;
        })
        .catch(() => null);
      this.itemModelCache.set(id, p);
    }
    return p;
  }

  /** Phaser 纹理（BootScene 已加载/程序化生成）→ dataURL，覆盖层背景用 */
  textureDataUrl(key: string): string | null {
    if (this.texUrlCache.has(key)) return this.texUrlCache.get(key) ?? null;
    let url: string | null = null;
    try {
      if (this.scene.textures.exists(key)) {
        const img = this.scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);
        url = c.toDataURL();
      }
    } catch { /* 纹理不可读时回退纯色 */ }
    this.texUrlCache.set(key, url);
    return url;
  }

  /** 贴格顶 quad 材质（懒加载共享）：280px canvas 画 Phaser 纹理，缺失回退纯色；darkBase 先垫暗底 */
  quadMaterial(texKey: string, darkBase = false): THREE.Material {
    const cacheKey = darkBase ? `${texKey}#dark` : texKey;
    const cached = this.quadMaterialCache.get(cacheKey);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = c.height = 280; // 2× 超采样，高分屏下框线不发虚
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    if (darkBase) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, 0, 140, 140);
    }
    let drawn = false;
    try {
      if (this.scene.textures.exists(texKey)) {
        const img = this.scene.textures.get(texKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        g.drawImage(img, 0, 0, 140, 140);
        drawn = true;
      }
    } catch { /* 纹理不可读时回退纯色 */ }
    if (!drawn) {
      g.fillStyle = QUAD_FALLBACK_COLOR[texKey] ?? 'rgba(255,255,255,0.3)';
      g.fillRect(0, 0, 140, 140);
    }
    const ctex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false });
    this.quadMaterialCache.set(cacheKey, mat);
    this.quadDisposables.push(ctex, mat);
    return mat;
  }

  /** 蜘蛛网贴片材质（暗底 + 网） */
  spiderMaterial(): THREE.Material {
    return this.quadMaterial('spider', true);
  }

  /**
   * 僵尸路线箭头材质：与 quadMaterial 分开的原因有两条——
   *   1. 贴图按 sRGB 声明：quadMaterial 未声明 colorSpace，sRGB 画面会把金色洗成灰紫；
   *   2. toneMapped=false：暖土场景开了 ACES 色调映射，不关掉箭头会发灰、失去警示色。
   * 两处都会让箭头「看不出是箭头」，所以这里单独建材质。
   */
  /**
   * 世界层（战争迷雾）：64×64 世界里，城市（13×13，居中）之外罩一层近不透明的雾。
   *
   * 玩家要求"整个地图 64×64，但只有 13×13 属于玩家，其他位置在战争迷雾中"。实现要点：
   * - **只有一个大平面**（雾），不是 4096 个格模型——draw call 不随世界尺寸增长；
   * - 城市范围内不打雾（贴图中央打洞 + 26px 模糊），所以城市完全清晰、出城 1~2 格开始起雾；
   * - 不铺自己的地面：城市脚下的地面继续用现有背景美术（刚换的那张沙漠图），
   *   雾只是罩在城市之外，缩到最小时看起来就是"迷雾里的一座城"；
   * - 城市之外不可交互/不可建/不刷怪：格坐标映射只认 0..12，越界本来就忽略。
   */
  private buildWorld(): void {
    const fogGeo = new THREE.PlaneGeometry(WORLD_FOG_SPAN, WORLD_FOG_SPAN).rotateX(-Math.PI / 2);
    const fogMat = new THREE.MeshBasicMaterial({
      map: this.worldFogTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0
    });
    const fog = new THREE.Mesh(fogGeo, fogMat);
    fog.position.y = 0.16;
    fog.renderOrder = 0.6;
    this.tscene.add(fog);
    this.fogMat = fogMat;
    this.quadDisposables.push(fogGeo, fogMat);
  }

  /**
   * 战争迷雾贴图（1024²）：整张近不透明的暖灰雾 + 云絮噪点，城市范围打一个带模糊的洞。
   * 雾盘比"逻辑世界"（64）大得多（FOG_SPAN=120，±60 单位），这样缩到最小时雾铺满整个视野、
   * 看不见盘的边界；洞按**城市**尺寸折算（13 格 + 每边 1.5 格余量），所以城市清晰、出城就开始起雾。
   */
  private worldFogTexture(): THREE.Texture {
    if (this.worldFogTex) return this.worldFogTex;
    const size = 1024;
    const pxPerCell = size / WORLD_FOG_SPAN; // ≈8.5
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(58,48,42,0.94)';
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 260; i++) {
      const r = 20 + Math.random() * 90;
      g.globalAlpha = 0.05 + Math.random() * 0.07;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(120,104,92,1)' : 'rgba(30,24,20,1)';
      g.beginPath();
      g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    const inner = (BASE_COLS + 3) * pxPerCell;
    const x0 = (size - inner) / 2;
    g.globalCompositeOperation = 'destination-out';
    g.filter = 'blur(14px)';
    g.fillStyle = '#000';
    g.fillRect(x0, x0, inner, inner);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-over';
    // 外缘柔化：雾盘边缘渐隐到 0，避免缩小到最小时看见一块"雾的方盘"边界（读作自然的雾散）
    const rad = g.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.52);
    rad.addColorStop(0, 'rgba(0,0,0,0)');
    rad.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = rad;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.quadDisposables.push(tex);
    this.worldFogTex = tex;
    return tex;
  }

  private routeMaterial(texKey: string): THREE.Material {
    const cacheKey = `${texKey}#route`;
    const cached = this.quadMaterialCache.get(cacheKey);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = c.height = 280; // 2× 超采样，与 quadMaterial 一致
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    let drawn = false;
    try {
      if (this.scene.textures.exists(texKey)) {
        const img = this.scene.textures.get(texKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        g.drawImage(img, 0, 0, 140, 140);
        drawn = true;
      }
    } catch { /* 纹理不可读时回退纯色 */ }
    if (!drawn) {
      g.fillStyle = texKey === 'route-entry' ? 'rgba(255,107,107,0.9)'
        : texKey === 'route-breach' ? 'rgba(255,146,43,0.95)'
          : 'rgba(255,209,102,0.9)';
      g.fillRect(0, 0, 140, 140);
    }
    const ctex = new THREE.CanvasTexture(c);
    ctex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: ctex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.92
    });
    this.quadMaterialCache.set(cacheKey, mat);
    this.quadDisposables.push(ctex, mat);
    return mat;
  }

  /** 可合成提示材质：加粗绿框 + 淡绿底 */
  private hintMaterial(): THREE.Material {
    const cached = this.quadMaterialCache.get('hint-bold');
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = c.height = 280;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    g.fillStyle = 'rgba(81,207,102,0.16)';
    g.fillRect(0, 0, 140, 140);
    g.strokeStyle = '#51cf66';
    g.lineWidth = 18;
    g.beginPath();
    g.roundRect(10, 10, 120, 120, 16);
    g.stroke();
    const ctex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false });
    this.quadMaterialCache.set('hint-bold', mat);
    this.quadDisposables.push(ctex, mat);
    return mat;
  }

  // ---------- 物品层同步（BaseScene 事件驱动） ----------

  /** 全量刷新物品棋子（syncAll 链路；加载幂等，id 不变不重建模型） */
  refreshItems(): void {
    if (this.disposed) return;
    for (let r = 0; r < BASE_ROWS; r++) {
      for (let c = 0; c < BASE_COLS; c++) {
        this.refreshCell(r, c);
      }
    }
  }

  /** 单格刷新（GRID_ITEM_* 事件驱动；任务需求角标由 host.taskNeeded 提供） */
  refreshCell(row: number, col: number): void {
    if (this.disposed) return;
    const view = this.itemViews[row]?.[col];
    if (view) {
      const item = getItem(this.state.grid, row, col);
      view.setItem(item, item ? (this.host.taskNeeded?.(item.id) ?? false) : false);
    }
    this.syncSealAt(row, col);
  }

  // ---------- 纸箱封印的 3D 外观（复用地图瓦砾堆模型） ----------

  /**
   * 封印外观是否已用 3D 模型：地形布局加载完成且有瓦砾模块。
   * 未就绪时 BoardItemView 仍画 2D 纸箱图（加载窗口内的兜底）。
   */
  sealIs3D(): boolean {
    return this.terrainLoaded && !!this.layout?.modules?.rubble;
  }

  /** 某格封印外观同步：纸箱 → 瓦砾堆模型；解开/移走 → 移除模型 */
  private syncSealAt(row: number, col: number): void {
    const key = `${row},${col}`;
    const item = getItem(this.state.grid, row, col);
    const isCarton = !!item && item.st === ItemStatus.Carton;
    const exist = this.sealMeshes.get(key);
    if (!isCarton) {
      if (exist) {
        this.tscene.remove(exist);
        this.sealMeshes.delete(key);
      }
      return;
    }
    if (exist || !this.sealIs3D()) return;
    const file = this.layout!.modules.rubble;
    const { x, z } = cellToWorld13(row, col);
    void this.glbs.load(file).then(tpl => {
      if (!tpl || this.disposed) return;
      if (this.sealMeshes.has(key)) return;
      const now = getItem(this.state.grid, row, col);
      if (!now || now.st !== ItemStatus.Carton) return; // 异步期间已解开
      const inst = tpl.clone(true); // 与地形瓦砾共用几何/材质
      // 每格确定性随机（朝向/缩放/微位移）：32 个同款瓦砾不排成一张"贴瓷砖"
      const seed = ((row * 73856093) ^ (col * 19349663)) >>> 0;
      inst.rotation.y = (seed % 8) * (Math.PI / 4);
      inst.scale.setScalar(0.9 + ((seed >>> 3) % 5) * 0.05);
      inst.position.set(
        x + (((seed >>> 5) % 9) - 4) * 0.02,
        0,
        z + (((seed >>> 9) % 9) - 4) * 0.02
      );
      inst.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; } });
      this.tscene.add(inst);
      this.sealMeshes.set(key, inst);
    }).catch(() => { /* load 内部已 catch→null */ });
  }

  /** 全量同步封印外观（syncAll 链路） */
  private syncSeals(): void {
    for (let r = 0; r < BASE_ROWS; r++) {
      for (let c = 0; c < BASE_COLS; c++) {
        this.syncSealAt(r, c);
      }
    }
  }

  /** 物品选中高亮（贴格顶 quad；null 清除） */
  setSelection(pos: IPoint | null): void {
    this.selectPos = pos;
    if (!pos) {
      this.selectMesh.visible = false;
      return;
    }
    const { x, z } = cellToWorld13(pos.row, pos.col);
    this.selectMesh.position.set(x, 0.06, z);
    this.selectMesh.visible = true;
  }

  playMergeEffect(pos: IPoint): void {
    this.itemViews[pos.row]?.[pos.col]?.playMerge();
  }

  /**
   * 僵尸路线箭头层：把（白天布防算好的）路线格画成贴地箭头。
   * 每格一个 quad（复用池），方向靠 rotation.y 旋转；刷怪点用另一种颜色的箭头。
   * 传 null / 空数组即隐藏整层。
   */
  setRoutePreview(cells: IRouteCell[] | null): void {
    if (this.disposed) return;
    const list = cells ?? [];
    // 按需扩池
    while (this.routeMeshes.length < list.length) {
      const mesh = new THREE.Mesh(this.quadGeo, this.routeMaterial('route-arrow'));
      mesh.renderOrder = 1;
      mesh.visible = false;
      this.routeGroup.add(mesh);
      this.routeMeshes.push(mesh);
    }
    for (let i = 0; i < this.routeMeshes.length; i++) {
      const mesh = this.routeMeshes[i];
      const cell = list[i];
      if (!cell) {
        mesh.visible = false;
        continue;
      }
      mesh.material = this.routeMaterial(cell.breach ? 'route-breach' : cell.spawn ? 'route-entry' : 'route-arrow');
      // 贴图默认朝北（-Z）；按主流向绕 Y 旋转
      mesh.rotation.y = cell.dr === -1 ? 0 : cell.dr === 1 ? Math.PI : cell.dc === 1 ? -Math.PI / 2 : Math.PI / 2;
      const { x, z } = cellToWorld13(cell.row, cell.col);
      mesh.position.set(x, ROUTE_Y, z);
      mesh.visible = true;
    }
  }

  playSpawnEffect(pos: IPoint): void {
    this.itemViews[pos.row]?.[pos.col]?.playSpawn();
  }


  // ---------- 暖土 GLB 地基/地形 ----------

  private async initWarmTerrain(): Promise<void> {
    let layout: IWarmLayout;
    try {
      const res = await fetch(`${WARM_LAYOUT_URL}?v=${__ASSET_VERSION__}`);
      if (!res.ok) throw new Error(`layout ${res.status}`);
      layout = await res.json() as IWarmLayout;
    } catch {
      this.terrainFallback = true;
      return;
    }
    this.layout = layout;
    const group = new THREE.Group();
    await Promise.all(layout.tiles.map(tile =>
      this.glbs.load(tile.model).then(tpl => {
        if (!tpl || this.disposed) return;
        const inst = tpl.clone(true); // 地基共享几何/材质
        const { x, z } = cellToWorld13(tile.row, tile.col);
        inst.position.set(x, 0, z);
        inst.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; } });
        this.applyZoneTint(inst, tile.row, tile.col); // 内城/外城地板颜色区分
        group.add(inst);
        this.groundTileCount++;
      }).catch(() => { /* load 内部已 catch→null */ })
    ));
    if (this.disposed) return;
    if (this.groundTileCount === 0) {
      this.terrainFallback = true;
      return;
    }
    this.terrainGroup = group;
    this.tscene.add(group);
    this.terrainLoaded = true;
    this.gridHelper.visible = false;
    this.border.visible = false;
    if (this.innerPlate) this.innerPlate.visible = false; // GLB 地基自带内外城分色，兜底板让位
    this.syncTerrain();
    // 封印外观此时才具备 3D 条件：铺上瓦砾堆、并让棋子视图撤掉 2D 纸箱图
    this.syncSeals();
    this.refreshItems();
  }

  /**
   * 内城/外城地板颜色区分：把地基瓦片的材质按区域换成共享的染色克隆。
   *
   * 内城（中央 9×9，合成区）保持原色（明亮）；外城环带乘一层偏灰暖褐（更暗更土）。
   * 材质按「源材质 + 区域」缓存复用，所以最多只有几份材质，不会给 169 格各克隆一份。
   */
  private applyZoneTint(root: THREE.Object3D, row: number, col: number): void {
    const inner = isInnerCity(row, col);
    root.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!src || !(src as THREE.MeshStandardMaterial).color) return;
      const key = `${src.uuid}#${inner ? 'in' : 'out'}`;
      let mat = this.zoneMats.get(key);
      if (!mat) {
        const clone = (src as THREE.MeshStandardMaterial).clone();
        clone.color.multiply(new THREE.Color(inner ? INNER_FLOOR_TINT : OUTER_FLOOR_TINT));
        this.zoneMats.set(key, clone);
        this.quadDisposables.push(clone);
        mat = clone;
      }
      obj.material = mat;
      if (inner && !this.innerFloorMesh) this.innerFloorMesh = obj;
      if (!inner && !this.outerFloorMesh) this.outerFloorMesh = obj;
    });
  }

  /** 地形特征：以运行时 tile.terrain 为准（付费清除会真实移除），GLB 失败该格留空 */
  private syncTerrain(): void {
    if (!this.terrainLoaded || !this.layout || !this.terrainGroup) return;
    const seen = new Set<string>();
    for (let r = 0; r < BASE_ROWS; r++) {
      for (let c = 0; c < BASE_COLS; c++) {
        const kind = this.state.base.tiles?.[r]?.[c]?.terrain;
        if (!kind) continue;
        const key = `${r},${c}`;
        seen.add(key);
        if (this.terrainMeshes.has(key)) continue;
        const file = this.layout.modules[kind];
        if (!file) continue;
        const { x, z } = cellToWorld13(r, c);
        void this.glbs.load(file).then(tpl => {
          if (!tpl || this.disposed || !this.terrainGroup) return;
          if (this.terrainMeshes.has(key)) return;
          if (this.state.base.tiles?.[r]?.[c]?.terrain !== kind) return; // 异步期间已被清除
          const inst = tpl.clone(true);
          inst.position.set(x, 0, z);
          inst.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
          this.terrainGroup!.add(inst);
          this.terrainMeshes.set(key, inst);
        }).catch(() => {});
      }
    }
    for (const [key, mesh] of this.terrainMeshes) {
      if (!seen.has(key)) {
        this.terrainGroup.remove(mesh);
        this.terrainMeshes.delete(key);
      }
    }
  }

  /** 布局清单里按 (row,col,cfgId) 作者指定的建筑条目（核心 + 初始废墟圈） */
  private layoutBuilding(row: number, col: number, cfgId: number): IWarmLayoutBuilding | undefined {
    return this.layout?.buildings.find(b => b.row === row && b.col === col && b.cfgId === cfgId);
  }

  private buildingGlbFile(row: number, col: number, cfgId: number): string | null {
    const lb = this.layoutBuilding(row, col, cfgId);
    if (lb) return lb.model;
    const cfg = getBuildingConfig(cfgId);
    if (!cfg) return null;
    if (cfg.kind === 'ruin') return RUIN_GLBS[(row * BASE_COLS + col) % RUIN_GLBS.length];
    return BUILDING_GLB_BY_CFG[cfgId] ?? BUILDING_GLB[cfg.kind] ?? null;
  }

  // ---------- 同步 ----------

  /** 全量同步：地形特征 / 建筑（含 GLB 升级与徽标）/ 英雄 / 物品棋子 / 摆放提示。BaseScene 每次 renderGrid 都调 */
  syncAll(): void {
    if (this.disposed) return;
    this.syncTerrain();
    this.syncSeals();
    this.syncBuildings();
    this.syncHeroes();
    this.refreshItems();
    this.syncPlacementHints();
  }

  private syncBuildings(): void {
    const currentIds = new Set<string>();
    for (const b of this.state.base.buildings) {
      const key = `${b.row},${b.col}`;
      currentIds.add(key);
      let view = this.buildingViews.get(key);
      if (view && view.cfgId !== b.cfgId) {
        this.removeBuildingView(key, view);
        view = undefined;
      }
      if (!view) {
        const group = new THREE.Group();
        const proc = createProcBuilding(b.cfgId);
        proc.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
        group.add(proc);
        const { x, z } = cellToWorld13(b.row, b.col);
        group.position.set(x, 0, z);
        this.tscene.add(group);
        const tag = this.makeTag();
        view = { group, content: proc, cfgId: b.cfgId, glbApplied: false, tag: tag.root, hpBar: tag.hpBar, hpFill: tag.hpFill };
        this.buildingViews.set(key, view);
        this.upgradeBuildingGlb(key, b.row, b.col, b.cfgId);
      }
      this.updateBuildingTag(view, b);
    }
    for (const [key, view] of this.buildingViews) {
      if (!currentIds.has(key)) this.removeBuildingView(key, view);
    }
  }

  private upgradeBuildingGlb(key: string, row: number, col: number, cfgId: number): void {
    const file = this.buildingGlbFile(row, col, cfgId);
    if (!file) return;
    void this.glbs.load(file).then(tpl => {
      if (!tpl || this.disposed) return;
      const view = this.buildingViews.get(key);
      if (!view || view.cfgId !== cfgId) return; // 异步期间格子已换建筑/被拆
      const inst = tpl.clone(true);
      // GLB 克隆默认共享模板材质，克隆成实例材质并记录原色（供电/受损压暗可还原）
      inst.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.material = (obj.material as THREE.Material).clone();
          const m = obj.material as THREE.MeshStandardMaterial;
          if (m && m.color) obj.userData.baseColor = m.color.getHex();
        }
        obj.castShadow = true;
        obj.receiveShadow = true;
      });
      inst.rotation.y = this.layoutBuilding(row, col, cfgId)?.rotationY ?? 0;
      view.group.remove(view.content);
      disposeObjectTree(view.content); // 程序化占位资源实例独占
      view.group.add(inst);
      view.content = inst;
      view.glbApplied = true;
      const b = this.state.base.buildings.find(x => x.row === row && x.col === col);
      if (b) this.updateBuildingTag(view, b); // 压暗状态随升级重放
    }).catch(() => {});
  }

  /** 徽标 + 压暗：Lv 已隐藏（玩家要求）；战斗类建筑或受损显血条；缺电压暗 + 红角标；通电雷达覆盖箭塔亮对空 */
  private updateBuildingTag(view: IBuildingView, b: IBuilding): void {
    const cfg = getBuildingConfig(b.cfgId);
    const { powered, antiAir } = this.host.decorate(b);
    const factor = !powered ? 0.6 : b.hp < b.maxHp * 0.3 ? 0.55 : 1;
    view.content.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        const m = obj.material as THREE.MeshStandardMaterial;
        if (m && m.color && obj.userData.baseColor !== undefined) {
          m.color.setHex(obj.userData.baseColor as number).multiplyScalar(factor);
        } else if (m && m.color) {
          obj.userData.baseColor = m.color.getHex();
          m.color.multiplyScalar(factor);
        }
      }
    });

    const combatKind = cfg && (cfg.kind === 'tower' || cfg.kind === 'wall' || cfg.kind === 'trap' || cfg.kind === 'core');
    const showHp = combatKind || b.hp < b.maxHp;
    const badges: string[] = [];
    if (!powered) badges.push(`<span style="background:#c92a2a;border-radius:4px;padding:0 4px;">${getText('base.noPower')}</span>`);
    if (antiAir) badges.push(`<span style="background:#1971c2;border-radius:4px;padding:0 4px;">${getText('base.antiAir')}</span>`);
    view.tag.innerHTML = '';
    if (badges.length) {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:10px;color:#fff;font-weight:bold;white-space:nowrap;';
      row.innerHTML = badges.join(' ');
      view.tag.appendChild(row);
    }
    // 3D 基地不显示 Lv 等级徽标（玩家要求隐藏；缺电/对空功能徽标与血条保留）
    const bar = view.hpBar;
    bar.style.display = showHp ? '' : 'none';
    if (showHp) {
      const ratio = b.hp / b.maxHp;
      view.hpFill.style.width = `${Math.round(ratio * 100)}%`;
      view.hpFill.style.background = ratio > 0.5 ? '#51cf66' : '#ff6b6b';
    }
  }

  private makeTag(): { root: HTMLDivElement; hpBar: HTMLDivElement; hpFill: HTMLDivElement } {
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;font-size:12px;line-height:1.25;pointer-events:none;display:none;';
    const hp = document.createElement('div');
    hp.style.cssText = 'width:44px;height:6px;background:rgba(0,0,0,0.6);margin:1px auto 0;border-radius:2px;overflow:hidden;';
    const hpFill = document.createElement('div');
    hpFill.style.cssText = 'height:100%;width:100%;background:#51cf66;';
    hp.appendChild(hpFill);
    root.appendChild(hp);
    this.overlayLayer.appendChild(root);
    return { root, hpBar: hp, hpFill };
  }

  private removeBuildingView(key: string, view: IBuildingView): void {
    this.tscene.remove(view.group);
    if (view.glbApplied) {
      view.group.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          const m = obj.material;
          if (Array.isArray(m)) m.forEach(x => x.dispose());
          else m?.dispose();
        }
      });
    } else {
      disposeObjectTree(view.group);
    }
    view.tag.remove();
    this.buildingViews.delete(key);
  }

  /** 英雄：暖土包无英雄 GLB，程序化替身（胶囊 + 头，英雄配置色）+ 名字/血条覆盖层 */
  private syncHeroes(): void {
    const current = new Set<string>();
    for (const h of this.state.heroes) {
      if (h.row < 0) continue; // 未部署
      current.add(h.key);
      let view = this.heroViews.get(h.key);
      if (!view) {
        const cfg = getHeroConfig(h.key);
        const group = createHeroStandin(cfg?.fxColor ?? 0x4caf50);
        group.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
        this.tscene.add(group);
        const tag = this.makeTag();
        const name = document.createElement('div');
        name.textContent = getHeroName(h.key);
        name.style.cssText = 'color:#fff;font-weight:bold;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;';
        tag.root.insertBefore(name, tag.root.firstChild);
        view = { group, key: h.key, tag: tag.root, hpFill: tag.hpFill };
        this.heroViews.set(h.key, view);
      }
      const { x, z } = cellToWorld13(h.row, h.col);
      view.group.position.set(x, 0, z);
      const cfg = getHeroConfig(h.key);
      const maxHp = h.maxHp ?? cfg?.hp ?? 100;
      const ratio = Math.max(0, (h.hp ?? maxHp) / maxHp);
      view.hpFill.style.width = `${Math.round(ratio * 100)}%`;
      view.hpFill.style.background = '#60d394';
    }
    for (const [key, view] of this.heroViews) {
      if (!current.has(key)) {
        this.tscene.remove(view.group);
        disposeObjectTree(view.group);
        view.tag.remove();
        this.heroViews.delete(key);
      }
    }
  }

  /** 摆放/部署模式：合法格绿色提示（对齐 2D cell-hint，只标合法格） */
  private syncPlacementHints(): void {
    while (this.placementHints.children.length > 0) {
      const c = this.placementHints.children[0] as THREE.Mesh;
      this.placementHints.remove(c);
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
    if (!this.host.placingCfg() && !this.host.placingHero()) return;
    for (let r = 0; r < BASE_ROWS; r++) {
      for (let c = 0; c < BASE_COLS; c++) {
        if (!this.host.canPlaceAt(r, c)) continue;
        const quad = new THREE.Mesh(
          new THREE.PlaneGeometry(0.92, 0.92),
          new THREE.MeshBasicMaterial({ color: 0x51cf66, transparent: true, opacity: 0.35, depthWrite: false })
        );
        quad.rotation.x = -Math.PI / 2;
        const { x, z } = cellToWorld13(r, c);
        quad.position.set(x, 0.03, z);
        this.placementHints.add(quad);
      }
    }
  }

  /** 选中防御塔的攻击范围圈（BaseScene.openBuildingDialog 驱动；null 清除） */
  setSelectedRange(row: number, col: number, range: number | null): void {
    if (this.selectedRing) {
      this.tscene.remove(this.selectedRing);
      this.selectedRing.geometry.dispose();
      (this.selectedRing.material as THREE.Material).dispose();
      this.selectedRing = null;
    }
    if (range === null || range <= 0) return;
    this.selectedRing = this.makeRangeRing(range);
    const { x, z } = cellToWorld13(row, col);
    this.selectedRing.position.set(x, 0.04, z);
    this.tscene.add(this.selectedRing);
  }

  private makeRangeRing(range: number): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.1, range - 0.06), range, 48),
      new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    return ring;
  }

  // ---------- 输入 ----------

  private ndcFromEvent(e: PointerEvent): THREE.Vector2 {
    return this.ndcFromClient(e.clientX, e.clientY);
  }

  /** 屏幕坐标 → NDC（拖拽跟手/边缘自动平移要按坐标而不是事件取点） */
  private ndcFromClient(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  /** 画布上禁用右键菜单（右键拖动 = 旋转视图） */
  private onContextMenu = (e: Event): void => { e.preventDefault(); };

  private eventCell(e: PointerEvent): { row: number; col: number } | null {
    return this.cellFromClient(e.clientX, e.clientY);
  }

  /** 屏幕坐标落在地面平面上的格（边缘自动平移时也按坐标取格） */
  private cellFromClient(clientX: number, clientY: number): { row: number; col: number } | null {
    this.raycaster.setFromCamera(this.ndcFromClient(clientX, clientY), this.orbit.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return worldToCell13(hit.x, hit.z);
  }

  /** 先拾取棋子实例选格（棋子视觉高于地面，斜视角下盖住邻格），未命中回退地面平面换算 */
  private pickCell(e: PointerEvent): { row: number; col: number } | null {
    this.raycaster.setFromCamera(this.ndcFromEvent(e), this.orbit.camera);
    const roots: THREE.Object3D[] = [];
    for (const row of this.itemViews) {
      for (const view of row) {
        if (view.root.visible) roots.push(view.content);
      }
    }
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const cp = o.userData.cellPos as IPoint | undefined;
        if (cp) return { row: cp.row, col: cp.col };
        o = o.parent;
      }
    }
    return this.eventCell(e);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.disposed || this.host.inputBlocked()) return;
    this.lastActionTime = Date.now();
    this.stopIdleHint();
    this.inputLayer.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY });
    if (this.pointers.size === 2) {
      this.endItemDrag(); // 第二指落下：取消进行中的物品拖拽（棋子复位）
      const pts = [...this.pointers.values()];
      this.pinch = {
        d0: Math.hypot(pts[0].px - pts[1].px, pts[0].py - pts[1].py),
        z0: this.orbit.zoom,
        mx: (pts[0].px + pts[1].px) / 2,
        my: (pts[0].py + pts[1].py) / 2
      };
      this.camDragging = true; // 双指即相机手势，抬起不成点击
      this.clearCoreHold();
      this.downCell = null;
      return;
    }
    this.downCell = this.pickCell(e);
    this.camDragging = false;
    this.hasDragged = false;
    this.gesture = 'none';
    // 相机手势模式：鼠标右键/中键拖动 = 旋转，其它（触摸、左键）= 平移地图
    this.camRotate = e.pointerType === 'mouse' && e.button !== 0;
    this.beginCoreHold();

    // 物品手势：非摆放/部署模式、按下格有可拖物品（纸箱/气泡不可拖）
    const placing = !!this.host.placingCfg() || this.host.placingHero();
    const cell = this.downCell;
    const item = cell ? getItem(this.state.grid, cell.row, cell.col) : null;
    if (!placing && cell && item && itemCanDrag(item, this.state.timestamp)) {
      this.gesture = 'item';
      this.dragSrc = cell;
      this.dragView = this.itemViews[cell.row]?.[cell.col] ?? null;
      if (this.dragView) this.dragView.overlay.style.opacity = '0.85';
      this.showHints(item.id);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      this.updateHover(e); // 无按键悬停：摆放塔时范围圈跟随
      return;
    }
    if (this.disposed) return;
    // 手指离开按下点超过轻点阈值：不再算长按（含已到点的长按标记）
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) >= DRAG_THRESHOLD) this.clearCoreHold();
    const stepX = e.clientX - p.px;
    const stepY = e.clientY - p.py;
    p.px = e.clientX;
    p.py = e.clientY;
    if (this.pinch && this.pointers.size >= 2) {
      // 双指：间距捏合缩放 + 中点拖动平移
      const pts = [...this.pointers.values()];
      const d = Math.hypot(pts[0].px - pts[1].px, pts[0].py - pts[1].py);
      if (d > 0 && this.pinch.d0 > 0) this.orbit.setZoom(this.pinch.z0 * d / this.pinch.d0);
      const mx = (pts[0].px + pts[1].px) / 2;
      const my = (pts[0].py + pts[1].py) / 2;
      const rect = this.canvas.getBoundingClientRect();
      this.orbit.panBy(mx - this.pinch.mx, my - this.pinch.my, rect.height);
      this.pinch.mx = mx;
      this.pinch.my = my;
      return;
    }
    if (this.pointers.size !== 1) return;
    if (this.gesture === 'item') {
      // 物品拖拽：>8px 阈值后拖起幽灵棋子跟随（Y=DRAG_Y 平面，棋子视觉正好在指针下）
      if (!this.hasDragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
      this.hasDragged = true;
      this.placeDragGhost(e.clientX, e.clientY);
      this.updateDragHover(e);
      return;
    }
    // 相机手势：>8px 阈值后 右键拖动=旋转（方位角/俯仰），单指/左键拖动=平移地图
    if (!this.camDragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
    this.camDragging = true;
    if (this.camRotate) {
      this.orbit.rotateBy(stepX, stepY);
    } else {
      this.orbit.panBy(stepX, stepY, this.canvas.getBoundingClientRect().height);
    }
  };

  /** 拖拽中的棋子在 DRAG_Y 平面上跟到指针对应的世界点（棋子视觉正好贴在指针下） */
  private placeDragGhost(clientX: number, clientY: number): void {
    if (!this.dragView) return;
    this.raycaster.setFromCamera(this.ndcFromClient(clientX, clientY), this.orbit.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.dragPlane, hit)) {
      this.dragView.root.position.set(hit.x, DRAG_Y, hit.z);
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    if (this.gesture === 'item') {
      // 物品手势：拖拽落点提交 / 轻点转格子点击；复位视觉
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      const src = this.dragSrc;
      const dragged = this.hasDragged;
      if (!this.host.inputBlocked() && src) {
        if (dragged) {
          // 落点仍按地面平面换算：指针 visually 指着哪个格就落哪个格（抬升只影响棋子视觉高度）
          const target = this.eventCell(e);
          if (target && (target.row !== src.row || target.col !== src.col)) {
            // 业务判定全部交给 BaseScene.handleItemDrop → MergeSystem.moveOrMerge
            this.host.onItemDrop(src, target);
          }
        } else {
          const up = this.pickCell(e);
          if (up && up.row === src.row && up.col === src.col) {
            this.host.onCellTap(up.row, up.col);
          }
        }
      }
      this.endItemDrag();
      this.downCell = null;
      return;
    }
    const wasGesture = this.camDragging || !!this.pinch;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.camDragging = false;
    // 轻点（<8px 未触发手势）= 格子点击，走 BaseScene 同一判定树；长按到点则抬手开核心面板
    if (!wasGesture && this.downCell && !this.host.inputBlocked()) {
      const up = this.eventCell(e);
      if (this.holdFired && this.downCell) {
        this.host.onCellLongPress?.(this.downCell.row, this.downCell.col);
      } else if (up && up.row === this.downCell.row && up.col === this.downCell.col) {
        this.host.onCellTap(up.row, up.col);
      }
    }
    this.clearCoreHold();
    this.downCell = null;
  };

  /** 核心格长按计时：到点只记标记，抬手才开面板（仅核心格；其它格不参与长按，保持原有点击手感） */
  private beginCoreHold(): void {
    this.clearCoreHold();
    this.holdFired = false;
    const cell = this.downCell;
    if (!cell || this.host.inputBlocked()) return;
    const core = findCoreBuilding(this.state.base);
    if (!core || core.row !== cell.row || core.col !== cell.col) return;
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null;
      this.holdFired = true;
    }, CORE_HOLD_MS);
  }

  /** 取消长按：手指移开/多指手势/销毁时调用，同时撤销已到点的长按标记 */
  private clearCoreHold(): void {
    if (this.holdTimer !== null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdFired = false;
  }

  private onPointerCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.camDragging = false;
    this.endItemDrag();
    this.clearCoreHold();
    this.downCell = null;
  };

  /** 物品拖拽结束：棋子复位到格心、还原覆盖层、清落点提示（弹回不在这里做，业务层不改状态即自然弹回） */
  private endItemDrag(): void {
    if (this.dragView) {
      const { x, z } = cellToWorld13(this.dragView.row, this.dragView.col);
      this.dragView.root.position.set(x, ITEM_Y, z);
      this.dragView.overlay.style.opacity = '';
    }
    this.clearHints();
    if (this.hoverQuad) this.hoverQuad.visible = false;
    this.gesture = 'none';
    this.dragView = null;
    this.dragSrc = null;
    this.hasDragged = false;
  }

  /** 拖拽中途悬停格视觉反馈（贴格顶黄框 quad，随指针取格） */
  private updateDragHover(e: PointerEvent): void {
    this.updateDragHoverAt(e.clientX, e.clientY);
  }

  private updateDragHoverAt(clientX: number, clientY: number): void {
    const cell = this.cellFromClient(clientX, clientY);
    if (!cell) {
      if (this.hoverQuad) this.hoverQuad.visible = false;
      return;
    }
    if (!this.hoverQuad) {
      this.hoverQuad = new THREE.Mesh(this.quadGeo, this.quadMaterial('cell-select'));
      this.hoverQuad.renderOrder = 2;
      this.tscene.add(this.hoverQuad);
    }
    this.hoverQuad.visible = true;
    const { x, z } = cellToWorld13(cell.row, cell.col);
    this.hoverQuad.position.set(x, 0.07, z);
  }

  // ---------- 可落点提示 ----------

  private showHints(srcId: number): void {
    const srcProp = getProp(srcId);
    if (!srcProp) return;
    const isSpecial = srcProp.mdt === 3 || srcProp.mdt === 4 || (srcProp.mdt >= 6 && srcProp.mdt <= 10);
    const mergeNext = getMergeNextId(srcId);

    for (let r = 0; r < this.state.grid.rowNum; r++) {
      for (let c = 0; c < this.state.grid.colNum; c++) {
        const item = getItem(this.state.grid, r, c);
        if (!item) continue;
        let ok = false;
        if (isSpecial) {
          switch (srcProp.mdt) {
            case 3: ok = canChargerTarget(item.id); break;
            case 4: ok = canSplitTarget(srcId, item.id); break;
            default: ok = canLvUpTarget(srcId, item.id); break;
          }
          if (item.id === srcId && mergeNext > 0) ok = true;
        } else {
          if (item.st === ItemStatus.Carton) {
            ok = false;
          } else {
            ok = (item.id === srcId && mergeNext > 0 && item.id !== PROP_IDS.bag)
              || item.id === PROP_IDS.bag;
          }
        }
        if (ok) {
          // 可落点提示：贴格顶 3D quad（加粗绿框，随透视贴合地面，棋子遮挡下仍可见）
          const mesh = new THREE.Mesh(this.quadGeo, this.hintMaterial());
          const { x, z } = cellToWorld13(r, c);
          mesh.position.set(x, 0.065, z);
          mesh.renderOrder = 2;
          this.tscene.add(mesh);
          this.hintMeshes.push(mesh);
        }
      }
    }
  }

  private clearHints(): void {
    for (const m of this.hintMeshes) this.tscene.remove(m);
    this.hintMeshes = [];
  }

  // ---------- 空闲合成对提示（停止几秒后两个可合成棋子跳起，对齐旧棋盘渲染器） ----------

  private checkIdleHint(nowMs: number): void {
    if (this.pointers.size > 0 || this.gesture === 'item') return;
    if (nowMs - this.lastActionTime < IDLE_HINT_DELAY) return;
    const pair = this.findMergeablePair();
    // 没有可合成对时延后再次检测
    this.lastActionTime = nowMs;
    if (!pair) return;
    this.itemViews[pair[0].row]?.[pair[0].col]?.playIdlePulse();
    this.itemViews[pair[1].row]?.[pair[1].col]?.playIdlePulse();
  }

  /** 找一对可合成（同 id、非纸箱/气泡、可合成升级）的材料 */
  private findMergeablePair(): [IPoint, IPoint] | null {
    const candidates: IPoint[] = [];
    for (let r = 0; r < this.state.grid.rowNum; r++) {
      for (let c = 0; c < this.state.grid.colNum; c++) {
        const item = getItem(this.state.grid, r, c);
        if (!item) continue;
        if (item.st === ItemStatus.Carton) continue;
        if (itemIsBubble(item, this.state.timestamp)) continue;
        if (getMergeNextId(item.id) <= 0) continue;
        candidates.push({ row: r, col: c });
      }
    }
    for (let i = 0; i < candidates.length; i++) {
      const a = getItem(this.state.grid, candidates[i].row, candidates[i].col);
      if (!a) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        const b = getItem(this.state.grid, candidates[j].row, candidates[j].col);
        if (b && a.id === b.id) {
          // 两个蜘蛛网不能互相合成，跳过
          if (a.st === ItemStatus.Spider && b.st === ItemStatus.Spider) continue;
          return [candidates[i], candidates[j]];
        }
      }
    }
    return null;
  }

  private stopIdleHint(): void {
    for (const row of this.itemViews) {
      for (const view of row) view.stopIdlePulse();
    }
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.disposed) return;
    e.preventDefault();
    this.orbit.setZoom(this.orbit.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  /** 摆放塔时悬停格的范围圈（对齐 2D updateRangeHint 的显示条件） */
  private hoverRingRange = 0;
  private updateHover(e: PointerEvent): void {
    const cfg = this.host.placingCfg();
    // 路线改道预览：摆放模式下把悬停格当作「将建建筑」重算路线（非摆放模式恒为 null）
    if (this.host.onCellHover) {
      const hoverCell = cfg ? this.eventCell(e) : null;
      const key = hoverCell ? `${hoverCell.row},${hoverCell.col}` : null;
      if (key !== this.lastHoverCell) {
        this.lastHoverCell = key;
        this.host.onCellHover(hoverCell?.row ?? null, hoverCell?.col ?? null);
      }
    }
    const cell = cfg ? this.eventCell(e) : null;
    const placeable = !!cfg && !!cell && this.host.canPlaceAt(cell.row, cell.col);
    // 摆放模式悬停格高亮：2D 有整片绿框，3D 至少把当前这一格标出来（同时指示改道预览的落点）
    if (cfg && cell && placeable) {
      if (!this.hoverQuad) {
        this.hoverQuad = new THREE.Mesh(this.quadGeo, this.quadMaterial('cell-select'));
        this.hoverQuad.renderOrder = 2;
        this.tscene.add(this.hoverQuad);
      }
      const { x, z } = cellToWorld13(cell.row, cell.col);
      this.hoverQuad.visible = true;
      this.hoverQuad.position.set(x, 0.07, z);
    } else if (this.hoverQuad && !this.dragView) {
      this.hoverQuad.visible = false;
    }
    const ringCell = cfg && cfg.kind === 'tower' && cfg.range && placeable ? cell : null;
    const ok = !!cfg && !!ringCell && !!cfg!.range;
    if (!ok || !cfg || !ringCell || !cfg.range) {
      if (this.hoverRing) this.hoverRing.visible = false;
      return;
    }
    if (!this.hoverRing || this.hoverRingRange !== cfg.range) {
      if (this.hoverRing) {
        this.tscene.remove(this.hoverRing);
        this.hoverRing.geometry.dispose();
        (this.hoverRing.material as THREE.Material).dispose();
      }
      this.hoverRing = this.makeRangeRing(cfg.range);
      this.hoverRingRange = cfg.range;
      this.tscene.add(this.hoverRing);
    }
    this.hoverRing.visible = true;
    const { x, z } = cellToWorld13(ringCell.row, ringCell.col);
    this.hoverRing.position.set(x, 0.05, z);
  }

  // ---------- 帧更新 ----------

  /**
   * 拖棋子时指针贴近画布边缘 → 地图自动平移（RTS 边缘滑动）。
   * 地图扩大后这是把棋子搬到屏幕外格子的唯一办法：平移量按 dt 计步（与帧率无关），
   * 平移后立刻把棋子与落点提示按同一坐标重新投影，视觉上棋子始终贴在指针下、不脱手。
   */
  private autoPanWhileDragging(nowMs: number): void {
    const dt = this.lastFrameTs ? Math.min(64, nowMs - this.lastFrameTs) : 0;
    this.lastFrameTs = nowMs;
    if (dt <= 0 || this.gesture !== 'item' || !this.hasDragged || this.pointers.size !== 1) return;
    const p = [...this.pointers.values()][0];
    const rect = this.canvas.getBoundingClientRect();
    // 指针所在的边（右/下为 +1，左/上为 -1，中间为 0）；内容要往反方向移动才露得出新格子
    const edge = (pos: number, size: number): number => {
      if (pos < EDGE_PAN_MARGIN) return -Math.min(1, (EDGE_PAN_MARGIN - pos) / EDGE_PAN_MARGIN);
      if (pos > size - EDGE_PAN_MARGIN) return Math.min(1, (pos - (size - EDGE_PAN_MARGIN)) / EDGE_PAN_MARGIN);
      return 0;
    };
    const ex = edge(p.px - rect.left, rect.width);
    const ey = edge(p.py - rect.top, rect.height);
    if (ex === 0 && ey === 0) return;
    const k = dt / 1000 * EDGE_PAN_MAX_SPEED;
    this.orbit.panBy(-ex * k, -ey * k, rect.height);
    this.placeDragGhost(p.px, p.py);
    this.updateDragHoverAt(p.px, p.py);
  }

  /** 每帧（BaseScene.update 驱动）：弹窗屏蔽切换 + 覆盖层投影 + 渲染 */
  update(): void {
    if (this.disposed) return;
    const blocked = this.host.inputBlocked();
    if (blocked !== this.lastBlocked) {
      this.lastBlocked = blocked;
      this.root.style.visibility = blocked ? 'hidden' : 'visible';
    }
    if (blocked) return;
    // 战争迷雾随缩放淡入：正常读图视角（zoom ≥ 0.95）完全不显示——否则这层雾会把
    // 顶栏/卡片栏一起罩暗（3D 层在 UI 之上）；缩出去看世界（< 0.95）时才逐渐显现。
    if (this.fogMat) {
      const t = Math.min(1, Math.max(0, (0.95 - this.orbit.zoom) / 0.35));
      this.fogMat.opacity = t * 0.95;
    }
    this.checkIdleHint(Date.now());
    this.autoPanWhileDragging(Date.now());

    // 覆盖层投影：建筑/英雄徽标锚点在格子上空
    const rect = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    for (const [key, view] of this.buildingViews) {
      const [r, c] = key.split(',').map(Number);
      const { x, z } = cellToWorld13(r, c);
      v.set(x, 1.25, z).project(this.orbit.camera);
      view.tag.style.display = '';
      view.tag.style.left = `${(v.x + 1) / 2 * rect.width}px`;
      view.tag.style.top = `${(1 - v.y) / 2 * rect.height}px`;
    }
    for (const view of this.heroViews.values()) {
      v.copy(view.group.position).setY(1.05).project(this.orbit.camera);
      view.tag.style.display = '';
      view.tag.style.left = `${(v.x + 1) / 2 * rect.width}px`;
      view.tag.style.top = `${(1 - v.y) / 2 * rect.height}px`;
    }

    // 物品棋子：CD/呼吸/特效逐帧驱动 + 覆盖层投影（轨道相机可逐帧变化，每帧重投影）+ billboard 面向相机
    const now = Date.now();
    this.billboardQuat.copy(this.orbit.camera.quaternion);
    const v2 = new THREE.Vector3();
    for (const row of this.itemViews) {
      for (const view of row) {
        view.update(now);
        if (!view.root.visible) continue;
        const { x, z } = cellToWorld13(view.row, view.col);
        v.set(x, 0.42, z).project(this.orbit.camera);
        // 格子屏幕尺寸：相邻格心投影间距近似
        v2.set(x + 1, 0.42, z).project(this.orbit.camera);
        const cssSize = Math.hypot((v2.x - v.x) / 2 * rect.width, (v2.y - v.y) / 2 * rect.height);
        view.layout((v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height, cssSize);
        view.syncBillboard(this.billboardQuat);
      }
    }
    this.renderer.render(this.tscene, this.orbit.camera);
  }

  /** 销毁（幂等）：断监听、删 DOM、释放模板共享资源与程序化/克隆材质 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearCoreHold();
    this.inputLayer.removeEventListener('pointerdown', this.onPointerDown);
    this.inputLayer.removeEventListener('pointermove', this.onPointerMove);
    this.inputLayer.removeEventListener('pointerup', this.onPointerUp);
    this.inputLayer.removeEventListener('pointercancel', this.onPointerCancel);
    this.inputLayer.removeEventListener('pointerleave', this.onPointerCancel);
    this.inputLayer.removeEventListener('wheel', this.onWheel);
    this.inputLayer.removeEventListener('contextmenu', this.onContextMenu);
    this.routeMeshes = [];
    this.routeGroup.clear();
    this.tscene.remove(this.routeGroup);

    if (__DEV_FEATURES__) {
      const w = window as unknown as Record<string, { owner?: unknown } | number | undefined>;
      if ((w.__base3d as { owner?: unknown } | undefined)?.owner === this) delete w.__base3d;
      w.__base3dDestroyed = ((w.__base3dDestroyed as number | undefined) ?? 0) + 1;
    }

    this.glbs.disposeAll();
    // 物品棋子视图：移除 DOM 覆盖层与本实例独占贴图（共享几何/材质统一在下面释放）
    for (const row of this.itemViews) {
      for (const view of row) view.destroy();
    }
    this.itemViews = [];
    // 棋子模型模板共享资源整体释放（单个移除时从不 dispose）
    for (const p of this.itemModelCache.values()) {
      void p.then(tpl => { if (tpl) disposeObjectTree(tpl); }).catch(() => {});
    }
    this.itemModelCache.clear();
    this.texUrlCache.clear();
    this.hintMeshes = [];
    this.hoverQuad = null;
    for (const d of this.quadDisposables) d.dispose();
    this.quadDisposables = [];
    this.quadMaterialCache.clear();
    this.quadGeo.dispose();
    for (const view of this.buildingViews.values()) {
      if (view.glbApplied) {
        view.group.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            const m = obj.material;
            if (Array.isArray(m)) m.forEach(x => x.dispose());
            else m?.dispose();
          }
        });
      } else {
        disposeObjectTree(view.group);
      }
    }
    for (const view of this.heroViews.values()) disposeObjectTree(view.group);
    this.buildingViews.clear();
    this.heroViews.clear();
    this.terrainMeshes.clear();

    this.renderer.dispose();
    this.root.remove();
  }
}
