import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { IGameState } from '../core/types';
import { IBattle } from '../core/systems/NightSystem';
import { GameEvents, eventBus } from '../core/events/EventBus';
import { getBuildingConfig } from '../core/config/BuildingConfig';
import { getZombieConfig } from '../core/config/ZombieConfig';
import { BASE_COLS, BASE_ROWS } from '../core/model/Base';

/** webpack DefinePlugin 注入的构建版本号（GLB URL 缓存破除用） */
declare const __ASSET_VERSION__: string;
/** webpack DefinePlugin 注入：开发专用功能开关（调试钩子等） */
declare const __DEV_FEATURES__: boolean;

/** 暖土资源目录与布局清单（docs/KIMI-暖土资源交付清单.md） */
const MODEL_DIR = 'assets/models/blender-samples';
const LAYOUT_URL = `${MODEL_DIR}/warm-base-layout.json`;

/** 布局清单结构（只取用到的字段） */
interface IWarmLayoutTile { row: number; col: number; model: string; terrain?: string }
interface IWarmLayoutBuilding { cfgId: number; row: number; col: number; model: string; rotationY?: number }
interface IWarmLayout {
  modules: Record<string, string>;
  tiles: IWarmLayoutTile[];
  buildings: IWarmLayoutBuilding[];
}

/** 建筑 kind → GLB 占位模型（cfgId 细分差异由配置驱动逻辑，模型只做视觉） */
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

/** 3D 世界坐标：1 格 = 1 单位，基地中心在世界原点 */
const CELL_SIZE = 1;
const GRID_OFFSET_X = -((BASE_COLS - 1) * CELL_SIZE) / 2;
const GRID_OFFSET_Z = -((BASE_ROWS - 1) * CELL_SIZE) / 2;

/** 相机轨道参数：俯仰角带（永不触地/翻转），缩放范围（1=全景恰好铺满，3=三倍放大） */
const MIN_ELEVATION = THREE.MathUtils.degToRad(25);
const MAX_ELEVATION = THREE.MathUtils.degToRad(75);
/** 默认视角（docs/KIMI-基地渲染参数.md §6）：≈ position(-10, 8.5, -10) 看向原点，斜 45° 可读视角 */
const DEFAULT_ELEVATION = Math.atan2(8.5, Math.hypot(10, 10)); // ≈31°
const DEFAULT_AZIMUTH = Math.atan2(-10, -10);
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
/** 拖动超过该距离才算相机手势，否则原样放行给 Phaser（剧情对话/结算按钮点击） */
const DRAG_THRESHOLD_PX = 8;

function cellToWorld(row: number, col: number): { x: number; z: number } {
  return {
    x: GRID_OFFSET_X + col * CELL_SIZE,
    z: GRID_OFFSET_Z + row * CELL_SIZE
  };
}

/** 程序化材质缓存（§9 基础材质：高粗糙度低金属度避免塑料感；仅作模板，模型创建时会 clone） */
const materialCache = new Map<string, THREE.Material>();
function getMaterial(color: number, emissive = 0x000000): THREE.MeshStandardMaterial {
  const key = `${color}-${emissive}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({
      color,
      emissive,
      roughness: 0.82,
      metalness: 0.05,
      flatShading: true
    }));
  }
  return materialCache.get(key) as THREE.MeshStandardMaterial;
}

/** 程序化木纹贴图（Canvas 生成，所有木件共享） */
let woodTexCache: { light: THREE.Texture; dark: THREE.Texture } | null = null;
function woodTextures(): { light: THREE.Texture; dark: THREE.Texture } {
  if (woodTexCache) return woodTexCache;
  const make = (base: string, dark: string, light: string): THREE.Texture => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 22; i++) {
      g.strokeStyle = Math.random() < 0.5 ? dark : light;
      g.globalAlpha = 0.12 + Math.random() * 0.15;
      g.lineWidth = 1 + Math.random() * 1.5;
      const y = Math.random() * 64;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(20, y + (Math.random() * 6 - 3), 44, y + (Math.random() * 6 - 3), 64, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };
  woodTexCache = { light: make('#9c6b3f', '#5f3d1e', '#c89a68'), dark: make('#7a4f2a', '#4a2d14', '#9c6b3f') };
  return woodTexCache;
}

/** 木纹材质（低多边形 + 贴图） */
function woodMaterial(dark = false): THREE.MeshStandardMaterial {
  const tex = woodTextures();
  return new THREE.MeshStandardMaterial({
    map: dark ? tex.dark : tex.light,
    roughness: 0.9, metalness: 0.05, flatShading: true
  });
}

/** 把组内共享的缓存材质克隆成独立材质，后续单体压暗/闪烁互不影响 */
function cloneMaterials(group: THREE.Object3D): void {
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.material = (obj.material as THREE.Material).clone();
    }
  });
}

/** 创建建筑模型（低多边形） */
function createBuildingModel(cfgId: number): THREE.Group {
  const group = new THREE.Group();
  const cfg = getBuildingConfig(cfgId);
  if (!cfg) return group;

  switch (cfg.kind) {
    case 'core': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), getMaterial(0x666677));
      base.position.y = 0.2;
      group.add(base);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), getMaterial(0x4dabf7, 0x1c7ed6));
      top.position.y = 0.7;
      group.add(top);
      break;
    }
    case 'tower': {
      if (cfgId === 101) {
        // 箭塔：CoC 风格瞭望塔——石墩脚 + 外八斜腿 + 横撑绳结 + 木板平台 + 梯子 + 小旗
        for (const [lx, lz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) {
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), getMaterial(0x9aa0a8));
          foot.position.set(lx, 0.05, lz);
          group.add(foot);
        }
        const legGeo = new THREE.BoxGeometry(0.085, 0.85, 0.085);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const leg = new THREE.Mesh(legGeo, woodMaterial(true));
          leg.position.set(sx * 0.23, 0.5, sz * 0.23);
          leg.rotation.z = -sx * 0.09;
          leg.rotation.x = sz * 0.09;
          group.add(leg);
        }
        const braceGeo = new THREE.BoxGeometry(0.56, 0.06, 0.06);
        for (const s of [-1, 1]) {
          const bx = new THREE.Mesh(braceGeo, woodMaterial());
          bx.position.set(0, 0.42, s * 0.235);
          group.add(bx);
          const bz = new THREE.Mesh(braceGeo, woodMaterial());
          bz.position.set(s * 0.235, 0.42, 0);
          bz.rotation.y = Math.PI / 2;
          group.add(bz);
        }
        const ropeGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.07, 6);
        for (const [lx, lz] of [[-0.23, -0.23], [0.23, -0.23], [-0.23, 0.23], [0.23, 0.23]]) {
          const rope = new THREE.Mesh(ropeGeo, getMaterial(0xd8b98a));
          rope.position.set(lx, 0.42, lz);
          group.add(rope);
        }
        const slatCount = 5;
        const slatW = 0.66 / slatCount;
        for (let i = 0; i < slatCount; i++) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.07, slatW - 0.015), woodMaterial(i % 2 === 1));
          slat.position.set(0, 0.9, -0.33 + slatW / 2 + i * slatW);
          group.add(slat);
        }
        const postGeo = new THREE.BoxGeometry(0.05, 0.16, 0.05);
        for (const [lx, lz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
          const post = new THREE.Mesh(postGeo, woodMaterial(true));
          post.position.set(lx, 1.0, lz);
          group.add(post);
        }
        const ladder = new THREE.Group();
        const railGeo = new THREE.BoxGeometry(0.05, 0.95, 0.03);
        for (const s of [-1, 1]) {
          const rail = new THREE.Mesh(railGeo, woodMaterial(true));
          rail.position.set(s * 0.09, 0, 0);
          ladder.add(rail);
        }
        const rungGeo = new THREE.BoxGeometry(0.18, 0.035, 0.035);
        for (let i = 0; i < 5; i++) {
          const rung = new THREE.Mesh(rungGeo, woodMaterial());
          rung.position.set(0, -0.36 + i * 0.18, 0.01);
          ladder.add(rung);
        }
        ladder.position.set(0.12, 0.47, 0.42);
        ladder.rotation.x = -0.28;
        group.add(ladder);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 5), woodMaterial(true));
        pole.position.set(0.3, 1.12, 0.3);
        group.add(pole);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.02), getMaterial(0xff6b6b, 0x661111));
        flag.position.set(0.4, 1.24, 0.3);
        group.add(flag);
      } else {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), getMaterial(0x8a8a99));
        base.position.y = 0.15;
        group.add(base);
      }
      if (cfgId === 102) { // 炮塔
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.9, 6), getMaterial(0x495057));
        barrel.position.y = 0.75;
        barrel.rotation.x = Math.PI / 2;
        group.add(barrel);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), getMaterial(0x343a40));
        ball.position.y = 0.75;
        ball.position.z = 0.35;
        group.add(ball);
      } else if (cfgId === 103) { // 电磁塔
        const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 6), getMaterial(0x66d9ff, 0x1c7ed6));
        coil.position.y = 0.75;
        group.add(coil);
      } else if (cfgId === 104) { // 冰冻塔
        const ice = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 6), getMaterial(0x74c0fc, 0x339af0));
        ice.position.y = 0.7;
        group.add(ice);
      }
      break;
    }
    case 'wall': {
      // §9 色板：木材 / 石材 / 深色石材
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), getMaterial(cfgId === 401 ? 0x986c45 : cfgId === 402 ? 0x9c9988 : 0x827e70));
      wall.position.y = 0.25;
      group.add(wall);
      break;
    }
    case 'trap': {
      // §9：绿色降饱和，避免抢过核心建筑
      const trap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), getMaterial(cfgId === 301 ? 0x8c9060 : cfgId === 302 ? 0xa5654d : 0x657f7a));
      trap.position.y = 0.075;
      group.add(trap);
      break;
    }
    case 'resource': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), getMaterial(0x9c9988));
      base.position.y = 0.2;
      group.add(base);
      if (cfgId === 203) { // 风力发电站
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.8, 6), getMaterial(0x9c9988));
        pole.position.y = 0.8;
        group.add(pole);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), getMaterial(0xd9d9cf)); // 不用纯白
        blade.position.y = 1.2;
        group.add(blade);
      } else if (cfgId === 209) { // 雷达站
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4, 0, Math.PI), getMaterial(0x858a79)); // 金属高光色
        dish.position.y = 0.6;
        dish.rotation.x = Math.PI / 2;
        group.add(dish);
      }
      break;
    }
    case 'ruin': {
      const ruin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.85), getMaterial(0x5d4037));
      ruin.position.y = 0.1;
      ruin.rotation.y = Math.random() * 0.3;
      group.add(ruin);
      break;
    }
  }
  cloneMaterials(group);
  return group;
}

/** 创建僵尸模型（低多边形） */
function createZombieModel(cfgId: number): THREE.Group {
  const group = new THREE.Group();
  const cfg = getZombieConfig(cfgId);
  if (!cfg) return group;

  const color = cfg.color;
  let size = 0.5;
  if (cfgId === 2) size = 0.45; // 快速
  if (cfgId === 3) size = 0.7;  // 坦克
  if (cfgId === 6) size = 0.9;  // Boss
  if (cfgId === 7) size = 0.4;  // 飞行

  const body = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), getMaterial(color));
  body.position.y = size / 2 + 0.1;
  group.add(body);

  if (cfgId === 7) { // 飞行翅膀
    const wingGeo = new THREE.BoxGeometry(0.4, 0.05, 0.15);
    const wingL = new THREE.Mesh(wingGeo, getMaterial(0xe3f2fd));
    wingL.position.set(-0.4, size / 2 + 0.1, 0);
    group.add(wingL);
    const wingR = new THREE.Mesh(wingGeo, getMaterial(0xe3f2fd));
    wingR.position.set(0.4, size / 2 + 0.1, 0);
    group.add(wingR);
  }

  cloneMaterials(group);
  return group;
}

/** 塔/英雄弹道颜色 */
function tracerColor(cfgId?: number): number {
  switch (cfgId) {
    case 101: return 0xffe066; // 箭塔
    case 102: return 0xff922b; // 炮塔
    case 103: return 0x66d9ff; // 电磁塔
    case 104: return 0x74c0fc; // 冰冻塔
    default: return 0x51cf66;  // 英雄/其他
  }
}

interface IEffect {
  obj: THREE.Object3D;
  start: number;
  duration: number;
  kind: 'tracer' | 'ring';
}

/** 建筑视图：group 承载位置，content 可被 GLB 升级替换（GLB 实例材质已克隆，可单体压暗） */
interface IBuildingView {
  group: THREE.Group;
  content: THREE.Object3D;
  cfgId: number;
  glbApplied: boolean;
  damaged: boolean;
}

/** 僵尸视图：group 承载位移/朝向（与逻辑时钟同步），content 可被 GLB 升级替换 */
interface IZombieView {
  group: THREE.Group;
  content: THREE.Object3D;
  cfgId: number;
  glb: boolean;
  fly: boolean;
}

/**
 * 夜战 3D 渲染器
 * 轨道相机围绕基地中心：方位角自由 360°，俯仰钳位 25°~75°（永不翻转），缩放 1~3 倍；
 * 优先加载暖土 GLB 模型（docs/KIMI-暖土资源交付清单.md），
 * 加载失败时回退到程序化低多边形模型；画布尺寸与 Phaser 游戏画布一致
 */
export class Night3DRenderer {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private ground!: THREE.Mesh;
  private gridHelper!: THREE.GridHelper;

  private buildingMeshes = new Map<string, IBuildingView>();
  private zombieSegs = new Map<number, { fx: number; fz: number; tx: number; tz: number; t0: number; dur: number }>();
  private zombieMeshes = new Map<number, IZombieView>();
  private damagedKeys = new Set<string>();
  private effects: IEffect[] = [];
  private coreLight!: THREE.PointLight;
  private border!: THREE.Mesh;

  // ---- 暖土 GLB 资源 ----
  private loader = new GLTFLoader();
  /** GLB 模板缓存：Promise 缓存防重复请求，失败记 null（回退程序化模型） */
  private modelCache = new Map<string, Promise<THREE.Object3D | null>>();
  private layout: IWarmLayout | null = null;
  /** GLB 地基/地形图层（加载完成后隐藏程序化地面） */
  private terrainGroup: THREE.Group | null = null;
  private terrainMeshes = new Map<string, THREE.Object3D>();
  private groundTileCount = 0;
  private terrainLoaded = false;
  private terrainFallback = false;
  private disposed = false;
  /** 每帧 sync 时记录，供异步 GLB 回调校验实体仍存在/状态未变 */
  private lastState: IGameState | null = null;
  private lastBattle: IBattle | null = null;

  // ---- 相机轨道控制（方位角自由 360°，俯仰钳位不翻转，缩放钳位） ----
  private azimuth = DEFAULT_AZIMUTH;
  private elevation = DEFAULT_ELEVATION;
  private zoom = 1;
  /** fitCamera 计算的全景距离（zoom=1 时相机到基地中心的距离） */
  private baseDist = 20;
  private readonly camTarget = new THREE.Vector3(0, 0, 0.3);
  private controlsDiv: HTMLDivElement | null = null;
  private pointers = new Map<number, { sx: number; sy: number; px: number; py: number }>();
  private pinch: { d0: number; z0: number } | null = null;
  private camDragging = false;
  /** Phaser 画布原 touch-action，dispose 时还原 */
  private savedTouchAction: string | null = null;

  private onTowerFire = (d: { fromRow: number; fromCol: number; toRow: number; toCol: number; cfgId?: number }) => {
    this.spawnTracer(d.fromRow, d.fromCol, d.toRow, d.toCol, tracerColor(d.cfgId));
  };
  private onHeroFire = (d: { fromRow: number; fromCol: number; toRow: number; toCol: number }) => {
    this.spawnTracer(d.fromRow, d.fromCol, d.toRow, d.toCol, 0x51cf66);
  };
  private onZombieDie = (d: { row: number; col: number }) => {
    this.spawnRing(d.row, d.col, 0xff6b6b);
  };
  private onZombieAttack = (d: { toRow: number; toCol: number }) => {
    this.spawnRing(d.toRow, d.toCol, 0xffd43b, 0.25);
  };

  constructor(container: HTMLElement, width: number, height: number) {
    this.container = container;

    this.scene = new THREE.Scene();
    // 透明背景：场景浮在 Phaser 夜战 UI/底色之上，不再铺暖土底色
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3)); // 清晰度优先（与棋盘一致）
    this.renderer.setClearColor(0x000000, 0);
    // §1：色彩空间 + ACES 色调映射
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 覆盖在 Phaser canvas 上方同尺寸居中，但不可交互（输入仍走 Phaser）
    const el = this.renderer.domElement;
    el.dataset.night3d = '1';
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '10';
    this.container.style.position = 'relative';
    this.container.appendChild(el);
    this.resize(width, height);

    // 光照（§3/§4/§5）：半球环境光 + 左前上方暖色主光（投影）+ 冷色弱补光（≤主光 25%）
    const hemiLight = new THREE.HemisphereLight(0xffefd2, 0x685645, 1.8);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffd6a6, 2.4);
    keyLight.position.set(-7, 11, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0002;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 40;
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9eabc0, 0.35);
    fillLight.position.set(6, 5, -6);
    this.scene.add(fillLight);

    // 核心发光（战斗可读性点缀，非照明）
    this.coreLight = new THREE.PointLight(0x4dabf7, 2, 8);
    this.coreLight.position.set(0, 1.5, 0);
    this.scene.add(this.coreLight);

    // 地面承接平面：ShadowMaterial 只承接接触阴影，不遮下层 UI/底色
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.29;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // 基地网格（§8）：暖褐格线、半透明，不做画面主体（仅程序化回退时可见）
    const gridSize = Math.max(BASE_COLS, BASE_ROWS) * CELL_SIZE;
    this.gridHelper = new THREE.GridHelper(gridSize, Math.max(BASE_COLS, BASE_ROWS), 0x594636, 0x594636);
    (this.gridHelper.material as THREE.LineBasicMaterial).transparent = true;
    (this.gridHelper.material as THREE.LineBasicMaterial).opacity = 0.35;
    this.gridHelper.position.y = 0.01;
    this.scene.add(this.gridHelper);

    // 基地边界框（§9 土层侧面色）
    const borderGeo = new THREE.BoxGeometry(BASE_COLS * CELL_SIZE + 0.5, 0.1, BASE_ROWS * CELL_SIZE + 0.5);
    this.border = new THREE.Mesh(borderGeo, getMaterial(0x79604b));
    this.border.position.y = 0.05;
    this.scene.add(this.border);

    // 暖土 GLB 地基/地形：异步接入，完成前保持程序化地面（失败则整体回退，绝不空白）
    void this.initWarmTerrain();

    // 战斗事件 → 特效
    eventBus.on(GameEvents.NIGHT_TOWER_FIRE, this.onTowerFire);
    eventBus.on(GameEvents.NIGHT_HERO_FIRE, this.onHeroFire);
    eventBus.on(GameEvents.NIGHT_ZOMBIE_DIE, this.onZombieDie);
    eventBus.on(GameEvents.NIGHT_ZOMBIE_ATTACK, this.onZombieAttack);

    // 相机手势：3D 画布 pointer-events:none，事件落在 Phaser 画布上，
    // 用 window 捕获阶段监听；<8px 点击原样放行（剧情对话/结算按钮），拖动才接管
    window.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointermove', this.onPointerMove, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('pointercancel', this.onPointerCancel, true);
    this.container.addEventListener('wheel', this.onWheel, { passive: false });
    // 双指捏合需要禁掉浏览器默认触摸缩放（仅本场景存活期间）
    const phaserCanvas = Array.from(this.container.querySelectorAll('canvas')).find(c => c !== el);
    if (phaserCanvas) {
      this.savedTouchAction = phaserCanvas.style.touchAction;
      phaserCanvas.style.touchAction = 'none';
    }
    this.makeControls();

    // 开发调试钩子（e2e 验收用）：GLB/程序化回退计数、地形状态、战斗状态，生产包不注入
    if (__DEV_FEATURES__) {
      (window as unknown as Record<string, unknown>).__night3d = {
        type: 'night3d',
        owner: this,
        terrain: () => ({
          loaded: this.terrainLoaded,
          fallback: this.terrainFallback,
          tiles: this.groundTileCount,
          features: this.terrainMeshes.size
        }),
        buildings: () => {
          let glb = 0;
          for (const v of this.buildingMeshes.values()) if (v.glbApplied) glb++;
          return { total: this.buildingMeshes.size, glb, procedural: this.buildingMeshes.size - glb };
        },
        zombies: () => {
          let glb = 0;
          for (const v of this.zombieMeshes.values()) if (v.glb) glb++;
          return { total: this.zombieMeshes.size, glb, procedural: this.zombieMeshes.size - glb };
        },
        state: () => this.lastState,
        battle: () => (this.lastBattle ? {
          status: this.lastBattle.status,
          wave: this.lastBattle.wave,
          totalWaves: this.lastBattle.totalWaves,
          zombies: this.lastBattle.zombies.length,
          spawnQueue: this.lastBattle.spawnQueue.length
        } : null),
        camera: () => ({
          azimuth: this.azimuth,
          elevation: this.elevation,
          zoom: this.zoom,
          minElevation: MIN_ELEVATION,
          maxElevation: MAX_ELEVATION,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM
        }),
        /** 渲染参数探针（docs/KIMI-基地渲染参数.md §1 验收用；背景为透明，由下层 UI 底色呈现） */
        style: () => ({
          background: this.scene.background
            ? '#' + (this.scene.background as THREE.Color).getHexString()
            : 'transparent',
          toneMapping: this.renderer.toneMapping,
          aces: this.renderer.toneMapping === THREE.ACESFilmicToneMapping,
          exposure: this.renderer.toneMappingExposure,
          srgb: this.renderer.outputColorSpace === THREE.SRGBColorSpace,
          shadows: this.renderer.shadowMap.enabled
        }),
        /** 格心 → 屏幕像素（相机拖拽方向验收用：拖右时近景格必须跟着右移） */
        cellToScreen: (row: number, col: number) => {
          const { x, z } = cellToWorld(row, col);
          const v = new THREE.Vector3(x, 0, z).project(this.camera);
          const rect = this.renderer.domElement.getBoundingClientRect();
          return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
        },
        /** 取景探针：基地四角（含建筑顶高）投影的最大 |NDC|，≤1 即无溢出 */
        fit: () => {
          const gx = (BASE_COLS * CELL_SIZE) / 2;
          const gz = (BASE_ROWS * CELL_SIZE) / 2;
          const v = new THREE.Vector3();
          let mx = 0;
          let my = 0;
          for (const y of [0, 1.8]) {
            for (const x of [-gx, gx]) {
              for (const z of [-gz, gz]) {
                v.set(x, y, z).project(this.camera);
                mx = Math.max(mx, Math.abs(v.x));
                my = Math.max(my, Math.abs(v.y));
              }
            }
          }
          return { maxNdcX: mx, maxNdcY: my };
        },
        isDisposed: () => this.disposed
      };
    }
  }

  /**
   * 取景：数值法求 zoom=1 全景距离——把基地 8 个角点（含建筑顶高）投到最不利视角
   * （方位 45° 水平投影最长；俯仰取下限/默认/上限），保证任意角度旋转都不横向/纵向溢出
   */
  private fitCamera(width: number, height: number): void {
    this.camera.aspect = width / height;
    const gx = (BASE_COLS * CELL_SIZE + 1.2) / 2;
    const gz = (BASE_ROWS * CELL_SIZE + 1.2) / 2;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanW = tanH * this.camera.aspect;
    let need = 0;
    const u = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (const az of [Math.PI / 4, -Math.PI * 3 / 4]) { // 方形基地水平投影最长在 45° 奇数倍
      for (const el of [MIN_ELEVATION, DEFAULT_ELEVATION, MAX_ELEVATION]) {
        u.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        fwd.copy(u).negate();
        right.set(Math.cos(az), 0, -Math.sin(az));
        up.crossVectors(right, fwd);
        for (const sy of [0, 1.8]) { // 地面与建筑顶
          for (const sx of [-gx, gx]) {
            for (const sz of [-gz, gz]) {
              v.set(sx, sy, sz).sub(this.camTarget);
              // 视图空间：|x|≤tanW·(d+v·fwd)，|y|≤tanH·(d+v·fwd)，解 d 的下界
              need = Math.max(need,
                Math.abs(v.dot(right)) / tanW - v.dot(fwd),
                Math.abs(v.dot(up)) / tanH - v.dot(fwd));
            }
          }
        }
      }
    }
    this.baseDist = need * 1.05;
    this.camera.updateProjectionMatrix();
    this.applyCamera();
  }

  /** 按方位角/俯仰/缩放更新相机（轨道围绕基地中心，俯仰钳位永不翻到地平线以下） */
  private applyCamera(): void {
    const dist = this.baseDist / this.zoom;
    const r = dist * Math.cos(this.elevation);
    this.camera.position.set(
      this.camTarget.x + r * Math.sin(this.azimuth),
      dist * Math.sin(this.elevation),
      this.camTarget.z + r * Math.cos(this.azimuth)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camTarget);
  }

  private setZoom(z: number): void {
    const nz = THREE.MathUtils.clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (nz === this.zoom) return;
    this.zoom = nz;
    this.applyCamera();
  }

  private setElevation(e: number): void {
    const ne = THREE.MathUtils.clamp(e, MIN_ELEVATION, MAX_ELEVATION);
    if (ne === this.elevation) return;
    this.elevation = ne;
    this.applyCamera();
  }

  // ---------- 相机手势输入 ----------

  /** 事件是否落在游戏画布区域内（缩放按钮自行处理，不算手势起点） */
  private isGamePointer(e: PointerEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t || !this.container.contains(t)) return false;
    if (t.closest('button')) return false;
    return true;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.disposed || !this.isGamePointer(e)) return;
    this.pointers.set(e.pointerId, { sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY });
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinch = { d0: Math.hypot(pts[0].px - pts[1].px, pts[0].py - pts[1].py), z0: this.zoom };
      this.camDragging = true; // 进入双指即视为相机手势，阻止 Phaser 收到后续事件
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p || this.disposed) return;
    const stepX = e.clientX - p.px;
    const stepY = e.clientY - p.py;
    p.px = e.clientX;
    p.py = e.clientY;

    if (this.pinch && this.pointers.size >= 2) {
      const pts = [...this.pointers.values()];
      const d = Math.hypot(pts[0].px - pts[1].px, pts[0].py - pts[1].py);
      if (d > 0 && this.pinch.d0 > 0) this.setZoom(this.pinch.z0 * d / this.pinch.d0);
      e.stopPropagation();
      return;
    }
    if (this.pointers.size !== 1) return;
    if (!this.camDragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD_PX) return;
    this.camDragging = true;
    // 单指拖动：水平 → 方位角（自由 360°），垂直 → 俯仰（钳位带内）
    // 方向与白天基地一致：场景跟随拖拽（three.js OrbitControls 手感）
    this.azimuth -= stepX * 0.008;
    this.setElevation(this.elevation + stepY * 0.006);
    this.applyCamera();
    e.stopPropagation(); // 拖动手势不传给 Phaser，避免误触 UI
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const wasGesture = this.camDragging || !!this.pinch;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.camDragging = false;
    if (wasGesture) e.stopPropagation(); // 手势的抬起不变成 Phaser 点击
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.camDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.disposed) return;
    e.preventDefault();
    this.setZoom(this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  // ---------- 缩放按钮（样式同棋盘 3D：深色底 + 金边，字符图标不走 i18n） ----------

  private makeControls(): void {
    this.controlsDiv = document.createElement('div');
    this.controlsDiv.style.cssText = 'position:absolute;z-index:11;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
    this.container.appendChild(this.controlsDiv);
    const mkBtn = (label: string, ctl: string, onTap: () => void): void => {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.night3dCtl = ctl;
      b.style.cssText = 'width:36px;height:36px;pointer-events:auto;border:2px solid #d4a94e;border-radius:8px;' +
        'background:rgba(20,16,10,0.78);color:#ffe066;font-size:20px;line-height:1;padding:0;cursor:pointer;';
      b.addEventListener('click', ev => { ev.stopPropagation(); onTap(); });
      this.controlsDiv!.appendChild(b);
    };
    mkBtn('＋', 'zoom-in', () => this.setZoom(this.zoom * 1.25));
    mkBtn('－', 'zoom-out', () => this.setZoom(this.zoom / 1.25));
    this.positionControls();
  }

  /** 按钮贴 3D 画布右下角（画布位置由 syncToCanvas 按游戏画布 rect 决定） */
  private positionControls(): void {
    if (!this.controlsDiv) return;
    const el = this.renderer.domElement;
    const w = el.clientWidth || parseFloat(el.style.width) || 0;
    const h = el.clientHeight || parseFloat(el.style.height) || 0;
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    this.controlsDiv.style.left = `${left + w - 46}px`;
    this.controlsDiv.style.top = `${top + h - 88}px`;
  }

  // ---------- 暖土 GLB 资源 ----------

  /** GLB 模板缓存加载：Promise 缓存防重复请求，失败记 null（调用方回退程序化模型，绝不抛出） */
  private loadGlb(file: string): Promise<THREE.Object3D | null> {
    let p = this.modelCache.get(file);
    if (!p) {
      p = this.loader.loadAsync(`${MODEL_DIR}/${file}?v=${__ASSET_VERSION__}`)
        .then(gltf => gltf.scene as THREE.Object3D)
        .catch(() => null);
      this.modelCache.set(file, p);
    }
    return p;
  }

  /** 读布局清单并铺 169 格暖土地基；任一环节失败保持程序化地面（回退不抛错、不空白） */
  private async initWarmTerrain(): Promise<void> {
    let layout: IWarmLayout;
    try {
      const res = await fetch(`${LAYOUT_URL}?v=${__ASSET_VERSION__}`);
      if (!res.ok) throw new Error(`layout ${res.status}`);
      layout = await res.json() as IWarmLayout;
    } catch {
      this.terrainFallback = true;
      return;
    }
    this.layout = layout;

    const group = new THREE.Group();
    await Promise.all(layout.tiles.map(tile =>
      this.loadGlb(tile.model).then(tpl => {
        if (!tpl || this.disposed) return;
        const inst = tpl.clone(true); // 地基无单体改写，共享几何/材质
        const { x, z } = cellToWorld(tile.row, tile.col);
        inst.position.set(x, 0, z);
        inst.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; } });
        group.add(inst);
        this.groundTileCount++;
      }).catch(() => { /* loadGlb 内部已 catch→null，单格失败跳过该格 */ })
    ));
    if (this.disposed) return;
    if (this.groundTileCount === 0) {
      this.terrainFallback = true;
      return;
    }
    this.terrainGroup = group;
    this.scene.add(group);
    this.terrainLoaded = true;
    // GLB 地基就位后隐藏程序化网格/边界（地面承接平面 §2 始终保留；对象保留，dispose 统一清理）
    this.gridHelper.visible = false;
    this.border.visible = false;
  }

  /** 地形特征同步：以运行时 tile.terrain 为准（付费清除地形会真实移除），GLB 失败该格留空 */
  private syncTerrain(state: IGameState): void {
    if (!this.terrainLoaded || !this.layout || !this.terrainGroup) return;
    const seen = new Set<string>();
    for (let r = 0; r < BASE_ROWS; r++) {
      for (let c = 0; c < BASE_COLS; c++) {
        const kind = state.base.tiles?.[r]?.[c]?.terrain;
        if (!kind) continue;
        const key = `${r},${c}`;
        seen.add(key);
        const existing = this.terrainMeshes.get(key);
        if (existing && existing.userData.kind === kind) continue;
        if (existing) {
          this.terrainGroup.remove(existing);
          this.terrainMeshes.delete(key);
        }
        const file = this.layout.modules[kind];
        if (!file) continue;
        const { x, z } = cellToWorld(r, c);
        void this.loadGlb(file).then(tpl => {
          if (!tpl || this.disposed || !this.terrainGroup) return;
          if (this.terrainMeshes.has(key)) return;
          // 异步期间地形可能已被清除/更换
          if (this.lastState?.base.tiles?.[r]?.[c]?.terrain !== kind) return;
          const inst = tpl.clone(true);
          inst.position.set(x, 0, z);
          inst.userData.kind = kind;
          inst.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
          this.terrainGroup!.add(inst);
          this.terrainMeshes.set(key, inst);
        }).catch(() => { /* loadGlb 内部已 catch→null */ });
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

  /** 建筑 → GLB 文件：布局清单指定优先，否则按 building.json kind 映射（废墟按格哈希取变体） */
  private buildingGlbFile(row: number, col: number, cfgId: number): string | null {
    const lb = this.layoutBuilding(row, col, cfgId);
    if (lb) return lb.model;
    const cfg = getBuildingConfig(cfgId);
    if (!cfg) return null;
    if (cfg.kind === 'ruin') return RUIN_GLBS[(row * BASE_COLS + col) % RUIN_GLBS.length];
    return BUILDING_GLB_BY_CFG[cfgId] ?? BUILDING_GLB[cfg.kind] ?? null;
  }

  /** 尝试用暖土 GLB 升级建筑视图：成功则原位替换程序化占位；失败/异步期间被拆则不动 */
  private upgradeBuildingGlb(key: string, row: number, col: number, cfgId: number): void {
    const file = this.buildingGlbFile(row, col, cfgId);
    if (!file) return;
    void this.loadGlb(file).then(tpl => {
      if (!tpl || this.disposed) return;
      const view = this.buildingMeshes.get(key);
      if (!view || view.cfgId !== cfgId) return; // 异步期间格子已换建筑/被拆
      const inst = tpl.clone(true);
      cloneMaterials(inst); // GLB 克隆默认共享模板材质，克隆成实例材质供单体压暗
      inst.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
      inst.rotation.y = this.layoutBuilding(row, col, cfgId)?.rotationY ?? 0;
      view.group.remove(view.content);
      this.disposeObject(view.content); // 程序化占位：几何/材质均为实例所有
      view.group.add(inst);
      view.content = inst;
      view.glbApplied = true;
      if (view.damaged) this.darkenView(view); // 压暗状态随升级保留
    }).catch(() => { /* loadGlb 内部已 catch→null，兜底防未处理拒绝 */ });
  }

  /** 尝试用暖土 GLB 升级僵尸视图（zombie.json id → warm_enemy_<id>.glb）；已死亡则放弃 */
  private upgradeZombieGlb(uid: number, cfgId: number): void {
    void this.loadGlb(`warm_enemy_${cfgId}.glb`).then(tpl => {
      if (!tpl || this.disposed) return;
      const view = this.zombieMeshes.get(uid);
      if (!view || view.cfgId !== cfgId) return;
      const inst = tpl.clone(true); // 僵尸无单体材质改写，共享几何/材质
      inst.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
      inst.position.y = view.content.position.y; // 保留悬浮/颠簸高度
      view.group.remove(view.content);
      this.disposeObject(view.content);
      view.group.add(inst);
      view.content = inst;
      view.glb = true;
    }).catch(() => { /* loadGlb 内部已 catch→null */ });
  }

  /** 血量 <30% 压暗（材质已按实例克隆，不影响同模板其他建筑） */
  private darkenView(view: IBuildingView): void {
    view.group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        const m = obj.material as THREE.MeshStandardMaterial;
        if (m && m.color) m.color.multiplyScalar(0.55);
      }
    });
  }

  /** 移除建筑视图：GLB 实例只释放克隆材质（几何共享模板），程序化模型整体释放 */
  private removeBuildingView(key: string, view: IBuildingView): void {
    this.scene.remove(view.group);
    if (view.glbApplied) this.disposeInstanceMaterials(view.group);
    else this.disposeObject(view.group);
    this.buildingMeshes.delete(key);
    this.damagedKeys.delete(key);
  }

  /** 释放实例上克隆出来的材质（不动共享几何） */
  private disposeInstanceMaterials(root: THREE.Object3D): void {
    root.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        const m = obj.material;
        if (Array.isArray(m)) m.forEach(x => x.dispose());
        else m?.dispose();
      }
    });
  }

  /** 释放实例独占资源（程序化模型用；GLB 克隆共享模板几何，不可走这里） */
  private disposeObject(root: THREE.Object3D): void {
    root.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach(x => x.dispose());
        else m?.dispose();
      }
    });
  }

  /** 塔/英雄开火弹道：一道短促的亮线 */
  private spawnTracer(fromRow: number, fromCol: number, toRow: number, toCol: number, color: number): void {
    const a = cellToWorld(fromRow, fromCol);
    const b = cellToWorld(toRow, toCol);
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, 1.0, a.z),
      new THREE.Vector3(b.x, 0.45, b.z)
    ]);
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({ obj: line, start: performance.now(), duration: 140, kind: 'tracer' });
  }

  /** 地面扩散环：僵尸死亡/建筑被击 */
  private spawnRing(row: number, col: number, color: number, duration = 0.35): void {
    const { x, z } = cellToWorld(row, col);
    const geo = new THREE.RingGeometry(0.15, 0.4, 16);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    this.scene.add(ring);
    this.effects.push({ obj: ring, start: performance.now(), duration: duration * 1000, kind: 'ring' });
  }

  /** 同步建筑状态到 3D 场景（程序化模型即时占位，暖土 GLB 到达后原位升级替换） */
  syncBuildings(state: IGameState): void {
    this.lastState = state;
    this.syncTerrain(state);
    const currentIds = new Set<string>();
    for (const b of state.base.buildings) {
      const key = `${b.row},${b.col}`;
      currentIds.add(key);
      let view = this.buildingMeshes.get(key);
      if (view && view.cfgId !== b.cfgId) {
        // 同格换建筑（废墟坍塌后重建等）：拆旧视图按新 cfgId 重建
        this.removeBuildingView(key, view);
        view = undefined;
      }
      if (!view) {
        view = { group: new THREE.Group(), content: new THREE.Group(), cfgId: b.cfgId, glbApplied: false, damaged: false };
        const proc = createBuildingModel(b.cfgId);
        proc.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
        view.content = proc;
        view.group.add(proc);
        const { x, z } = cellToWorld(b.row, b.col);
        view.group.position.set(x, 0, z);
        this.scene.add(view.group);
        this.buildingMeshes.set(key, view);
        this.upgradeBuildingGlb(key, b.row, b.col, b.cfgId);
      }
      // 血量低时压暗一次（GLB/程序化材质均已按实例克隆，不会影响其他建筑）
      const cfg = getBuildingConfig(b.cfgId);
      if (cfg && b.hp < b.maxHp * 0.3 && !this.damagedKeys.has(key)) {
        this.damagedKeys.add(key);
        view.damaged = true;
        this.darkenView(view);
      }
    }
    // 移除已不存在的建筑
    for (const [key, view] of this.buildingMeshes) {
      if (!currentIds.has(key)) this.removeBuildingView(key, view);
    }
  }

  /** 同步僵尸状态到 3D 场景（位移/朝向与逻辑时钟同步；模型只显示当前单位） */
  syncZombies(battle: IBattle): void {
    this.lastBattle = battle;
    const currentUids = new Set<number>();
    const now = Date.now();
    for (const z of battle.zombies) {
      currentUids.add(z.uid);
      const { x, z: wz } = cellToWorld(z.row, z.col);
      // 堆叠时按 uid 错开一点，避免完全重叠
      const jx = ((z.uid % 3) - 1) * 0.14;
      const jz = ((Math.floor(z.uid / 3) % 3) - 1) * 0.14;
      const tx = x + jx;
      const tz = wz + jz;

      let view = this.zombieMeshes.get(z.uid);
      if (!view) {
        view = {
          group: new THREE.Group(),
          content: new THREE.Group(),
          cfgId: z.cfgId,
          glb: false,
          fly: getZombieConfig(z.cfgId)?.moveType === 'fly'
        };
        const proc = createZombieModel(z.cfgId);
        proc.traverse(obj => { obj.castShadow = true; obj.receiveShadow = true; });
        view.content = proc;
        view.group.add(proc);
        // 直接在出生点出现，避免从地图中心飞过去
        view.group.position.set(tx, 0, tz);
        this.scene.add(view.group);
        this.zombieMeshes.set(z.uid, view);
        this.zombieSegs.set(z.uid, { fx: tx, fz: tz, tx, tz, t0: battle.time, dur: 1 });
        this.upgradeZombieGlb(z.uid, z.cfgId);
      }
      const mesh = view.group;
      let seg = this.zombieSegs.get(z.uid)!;
      // 目标格变化 → 从当前位置开始新的匀速段，时长 = 走一格的时间（与逻辑同步）
      if (seg.tx !== tx || seg.tz !== tz) {
        const cfg = getZombieConfig(z.cfgId);
        const slowed = z.slowUntil > battle.time;
        const dur = cfg ? (1000 / cfg.speed) * (slowed ? 2 : 1) : 1000;
        seg = { fx: mesh.position.x, fz: mesh.position.z, tx, tz, t0: battle.time, dur };
        this.zombieSegs.set(z.uid, seg);
      }
      const p = seg.dur > 0 ? Math.min(1, (battle.time - seg.t0) / seg.dur) : 1;
      mesh.position.x = seg.fx + (seg.tx - seg.fx) * p;
      mesh.position.z = seg.fz + (seg.tz - seg.fz) * p;
      // 行走颠簸 + 朝向移动方向；飞行单位悬浮（底座 0.42 + 轻微起伏）
      if (p < 1 && (seg.tx !== seg.fx || seg.tz !== seg.fz)) {
        mesh.rotation.y = Math.atan2(seg.tx - seg.fx, seg.tz - seg.fz);
        view.content.position.y = (view.fly ? 0.42 : 0) + Math.abs(Math.sin(now * 0.012 + z.uid)) * 0.07;
      } else {
        view.content.position.y = view.fly ? 0.42 + Math.sin(now * 0.004 + z.uid) * 0.05 : 0;
      }
      // 潜行时不显示（与逻辑一致：潜行中不可被塔索敌）
      mesh.visible = !z.burrowed;
    }
    for (const [uid, view] of this.zombieMeshes) {
      if (!currentUids.has(uid)) {
        this.scene.remove(view.group);
        // GLB 克隆共享模板几何/材质不 dispose；程序化模型资源实例独占
        if (!view.glb) this.disposeObject(view.group);
        this.zombieMeshes.delete(uid);
        this.zombieSegs.delete(uid);
      }
    }
  }

  /** 渲染一帧 */
  render(): void {
    this.coreLight.intensity = 1.5 + Math.sin(Date.now() * 0.003) * 0.5;

    // 推进特效生命周期
    const now = performance.now();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      const p = (now - fx.start) / fx.duration;
      if (p >= 1) {
        this.scene.remove(fx.obj);
        if (fx.obj instanceof THREE.Line || fx.obj instanceof THREE.Mesh) {
          fx.obj.geometry.dispose();
          (fx.obj.material as THREE.Material).dispose();
        }
        this.effects.splice(i, 1);
        continue;
      }
      const mat = fx.obj instanceof THREE.Line || fx.obj instanceof THREE.Mesh
        ? fx.obj.material as THREE.Material & { opacity: number } : null;
      if (fx.kind === 'tracer' && mat) {
        mat.opacity = 0.95 * (1 - p);
      } else if (fx.kind === 'ring' && mat) {
        const s = 1 + p * 2.2;
        fx.obj.scale.set(s, s, s);
        mat.opacity = 0.8 * (1 - p);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** 画布尺寸变化：同时更新渲染尺寸、CSS 尺寸、取景与按钮位置 */
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    const el = this.renderer.domElement;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    this.fitCamera(width, height);
    this.positionControls();
  }

  /**
   * 让 3D 画布精确覆盖 Phaser 游戏画布。
   * 容器是 flex + Phaser autoCenter 双重居中，游戏画布并不在容器几何中心，
   * 用 left:50%+translate 会错位（横屏下偏出半屏），必须按实际 rect 对齐。
   */
  syncToCanvas(gameCanvas: HTMLCanvasElement): void {
    const c = gameCanvas.getBoundingClientRect();
    const p = this.container.getBoundingClientRect();
    const el = this.renderer.domElement;
    el.style.transform = '';
    el.style.left = `${c.left - p.left}px`;
    el.style.top = `${c.top - p.top}px`;
    this.resize(c.width, c.height);
  }

  /** 销毁释放资源（幂等）：断事件、删钩子、释放 GLB 模板共享资源、dispose renderer、移除画布 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    eventBus.off(GameEvents.NIGHT_TOWER_FIRE, this.onTowerFire);
    eventBus.off(GameEvents.NIGHT_HERO_FIRE, this.onHeroFire);
    eventBus.off(GameEvents.NIGHT_ZOMBIE_DIE, this.onZombieDie);
    eventBus.off(GameEvents.NIGHT_ZOMBIE_ATTACK, this.onZombieAttack);

    // 相机手势监听与缩放按钮
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('pointermove', this.onPointerMove, true);
    window.removeEventListener('pointerup', this.onPointerUp, true);
    window.removeEventListener('pointercancel', this.onPointerCancel, true);
    this.container.removeEventListener('wheel', this.onWheel);
    if (this.savedTouchAction !== null) {
      const phaserCanvas = Array.from(this.container.querySelectorAll('canvas'))
        .find(c => c !== this.renderer.domElement);
      if (phaserCanvas) phaserCanvas.style.touchAction = this.savedTouchAction;
      this.savedTouchAction = null;
    }
    if (this.controlsDiv) {
      this.container.removeChild(this.controlsDiv);
      this.controlsDiv = null;
    }
    this.pointers.clear();
    this.pinch = null;
    this.camDragging = false;

    if (__DEV_FEATURES__) {
      const w = window as unknown as Record<string, { owner?: unknown } | number | undefined>;
      if ((w.__night3d as { owner?: unknown } | undefined)?.owner === this) delete w.__night3d;
      w.__night3dDestroyed = ((w.__night3dDestroyed as number | undefined) ?? 0) + 1;
    }

    // GLB 模板共享几何/材质统一释放（单个实例移除时从不 dispose 模板）
    for (const p of this.modelCache.values()) {
      void p.then(tpl => { if (tpl) this.disposeObject(tpl); }).catch(() => {});
    }
    this.modelCache.clear();
    // 建筑 GLB 实例的材质是克隆体，单独释放（几何随模板）
    for (const view of this.buildingMeshes.values()) {
      if (view.glbApplied) this.disposeInstanceMaterials(view.group);
    }

    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    this.buildingMeshes.clear();
    this.zombieMeshes.clear();
    this.zombieSegs.clear();
    this.terrainMeshes.clear();
    this.damagedKeys.clear();
    this.effects.length = 0;
  }
}
