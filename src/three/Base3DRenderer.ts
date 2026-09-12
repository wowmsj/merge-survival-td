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
import { BASE_COLS, BASE_ROWS, findCoreBuilding } from '../core/model/Base';
import { getItem } from '../core/model/Grid';
import { itemCanDrag, itemIsBubble } from '../core/model/Item';
import {
  canChargerTarget, canLvUpTarget, canSplitTarget, getMergeNextId, getProp, PROP_IDS
} from '../core/config/PropConfig';
import { getHeroName, getText } from '../core/i18n';
import { BoardItemView, IBoardItemHost } from './BoardItemView';
import {
  WARM_LAYOUT_URL, cellToWorld13, worldToCell13, applyWarmRendererSettings, createWarmScene,
  WarmOrbitCamera, WarmGlbCache, makeZoomControls, disposeObjectTree,
  ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION, ORBIT_MIN_ZOOM, ORBIT_MAX_ZOOM
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
/** 废墟三种变体（布局未指定的运行时新增废墟按格哈希取变体） */
const RUIN_GLBS = ['warm_ruin.glb', 'warm_ruin_1.glb', 'warm_ruin_2.glb'];

// ---------- 物品层常量 ----------
/** 棋子放置高度（地基顶 0 + 防贴面闪烁，同棋盘 CELL_Y） */
const ITEM_Y = 0.162;
/** 拖拽抬升高度（拖拽跟随平面同高，棋子视觉正好贴在指针下） */
const DRAG_Y = 0.9;
const DRAG_THRESHOLD = 8;

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
  readonly overlayLayer: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private tscene: THREE.Scene;
  private orbit = new WarmOrbitCamera();
  private glbs = new WarmGlbCache();

  private layout: IWarmLayout | null = null;
  private terrainGroup: THREE.Group | null = null;
  private terrainMeshes = new Map<string, THREE.Object3D>();
  private groundTileCount = 0;
  private terrainLoaded = false;
  private terrainFallback = false;
  private gridHelper: THREE.GridHelper;
  private border: THREE.Mesh;

  private buildingViews = new Map<string, IBuildingView>();
  private heroViews = new Map<string, IHeroView>();
  private placementHints = new THREE.Group();
  private hoverRing: THREE.Mesh | null = null;
  private selectedRing: THREE.Mesh | null = null;

  private pointers = new Map<number, { sx: number; sy: number; px: number; py: number }>();
  private pinch: { d0: number; z0: number; mx: number; my: number } | null = null;
  private camDragging = false;
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

    // fixed 容器对齐 Phaser 画布上的 13×13 网格矩形；弹窗打开时整体隐藏
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:fixed;z-index:5;pointer-events:none;overflow:hidden;';
    document.body.appendChild(this.root);
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:auto;touch-action:none;';
    this.root.appendChild(this.canvas);
    this.overlayLayer = document.createElement('div');
    this.overlayLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    this.root.appendChild(this.overlayLayer);
    makeZoomControls(this.root, 'base3dCtl',
      () => this.orbit.setZoom(this.orbit.zoom * 1.25),
      () => this.orbit.setZoom(this.orbit.zoom / 1.25));

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

    this.placementHints.renderOrder = 2;
    this.tscene.add(this.placementHints);

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

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('pointerleave', this.onPointerCancel);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

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
          minElevation: ORBIT_MIN_ELEVATION,
          maxElevation: ORBIT_MAX_ELEVATION,
          minZoom: ORBIT_MIN_ZOOM,
          maxZoom: ORBIT_MAX_ZOOM
        }),
        fit: () => this.orbit.fitProbe(BASE_COLS / 2, BASE_ROWS / 2),
        dialogOpen: () => this.host.inputBlocked(),
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

  /** 按 Phaser 画布缩放把网格设计矩形换算成 fixed CSS 矩形，并重取景 */
  layoutRect(gridRect: { left: number; top: number; size: number }): void {
    const gameCanvas = this.scene.game.canvas;
    const rect = gameCanvas.getBoundingClientRect();
    const scale = rect.width / 1080;
    const left = rect.left + gridRect.left * scale;
    const top = rect.top + gridRect.top * scale;
    const size = gridRect.size * scale;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.width = `${size}px`;
    this.root.style.height = `${size}px`;
    this.renderer.setSize(Math.round(size), Math.round(size));
    this.orbit.fit(size, size, BASE_COLS / 2 + 0.6, BASE_ROWS / 2 + 0.6);
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
    if (!view) return;
    const item = getItem(this.state.grid, row, col);
    view.setItem(item, item ? (this.host.taskNeeded?.(item.id) ?? false) : false);
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
    this.syncTerrain();
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
    return BUILDING_GLB[cfg.kind] ?? null;
  }

  // ---------- 同步 ----------

  /** 全量同步：地形特征 / 建筑（含 GLB 升级与徽标）/ 英雄 / 物品棋子 / 摆放提示。BaseScene 每次 renderGrid 都调 */
  syncAll(): void {
    if (this.disposed) return;
    this.syncTerrain();
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
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private eventCell(e: PointerEvent): { row: number; col: number } | null {
    this.raycaster.setFromCamera(this.ndcFromEvent(e), this.orbit.camera);
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
    this.canvas.setPointerCapture(e.pointerId);
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
      this.raycaster.setFromCamera(this.ndcFromEvent(e), this.orbit.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, hit) && this.dragView) {
        this.dragView.root.position.set(hit.x, DRAG_Y, hit.z);
      }
      this.updateDragHover(e);
      return;
    }
    // 相机手势：单指拖动 = 方位角/俯仰（原逻辑不变）
    if (!this.camDragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
    this.camDragging = true;
    this.orbit.rotateBy(stepX, stepY);
  };

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
    const cell = this.eventCell(e);
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
    const cell = cfg && cfg.kind === 'tower' && cfg.range ? this.eventCell(e) : null;
    const ok = !!cfg && !!cell && !!cfg.range && this.host.canPlaceAt(cell!.row, cell!.col);
    if (!ok || !cfg || !cell || !cfg.range) {
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
    const { x, z } = cellToWorld13(cell.row, cell.col);
    this.hoverRing.position.set(x, 0.05, z);
  }

  // ---------- 帧更新 ----------

  /** 每帧（BaseScene.update 驱动）：弹窗屏蔽切换 + 覆盖层投影 + 渲染 */
  update(): void {
    if (this.disposed) return;
    const blocked = this.host.inputBlocked();
    if (blocked !== this.lastBlocked) {
      this.lastBlocked = blocked;
      this.root.style.visibility = blocked ? 'hidden' : 'visible';
    }
    if (blocked) return;
    this.checkIdleHint(Date.now());

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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerleave', this.onPointerCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);

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
