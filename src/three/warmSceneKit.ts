/**
 * 暖土 3D 场景共享工具（docs/KIMI-基地渲染参数.md）
 *
 * 新建的基地白天 3D 渲染器（Base3DRenderer）使用这里的公共件；
 * Night3DRenderer 保持自己的实现不动，新代码如需同款能力从这里取：
 * - applyWarmRendererSettings：§1 色彩空间/ACES/阴影参数
 * - createWarmScene：§2 背景 + 地面承接平面 + §3/§4/§5 半球光/主光/补光
 * - WarmOrbitCamera：轨道相机（方位自由、俯仰 25°~75° 不翻转、缩放 1~3、数值法取景不溢出、平移范围随缩放自适应）
 * - WarmGlbCache：GLB 模板 Promise 缓存（失败记 null）+ 统一释放
 * - makeViewControls：视角按钮组（旋转/俯仰/回正/缩放，深色底金边，按住连续步进）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** webpack DefinePlugin 注入的构建版本号（GLB URL 缓存破除用） */
declare const __ASSET_VERSION__: string;

/** 暖土资源目录与 13×13 布局清单（docs/KIMI-暖土资源交付清单.md） */
export const WARM_MODEL_DIR = 'assets/models/blender-samples';
export const WARM_LAYOUT_URL = `${WARM_MODEL_DIR}/warm-base-layout.json`;

/** 13×13 基地坐标约定（§11）：1 格 = 1 单位，格心 x=col-6, z=row-6 */
export function cellToWorld13(row: number, col: number): { x: number; z: number } {
  return { x: col - 6, z: row - 6 };
}
/** 世界坐标 → 格子（越界返回 null） */
export function worldToCell13(x: number, z: number): { row: number; col: number } | null {
  const col = Math.round(x + 6);
  const row = Math.round(z + 6);
  if (row < 0 || row > 12 || col < 0 || col > 12) return null;
  return { row, col };
}

// ---------- §1 Renderer 参数 ----------

export function applyWarmRendererSettings(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

// ---------- §2/§3/§4/§5 场景背景与灯光 ----------

export interface IWarmSceneParts {
  scene: THREE.Scene;
  backdrop: THREE.Mesh;
  keyLight: THREE.DirectionalLight;
}

export function createWarmScene(opts?: { transparent?: boolean }): IWarmSceneParts {
  const scene = new THREE.Scene();
  // transparent：画布浮在 Phaser 背景上，只渲染场景模型（基地视图用）
  scene.background = opts?.transparent ? null : new THREE.Color(0xcbb996); // §2：不纯黑、不黑遮罩

  // §2 地面承接平面（透明模式下换 ShadowMaterial：只承接接触阴影，不遮背景）
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    opts?.transparent
      ? new THREE.ShadowMaterial({ opacity: 0.35 })
      : new THREE.MeshStandardMaterial({ color: 0xc4b397, roughness: 1.0, metalness: 0.0 })
  );
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = -0.29;
  backdrop.receiveShadow = true;
  scene.add(backdrop);

  // §3 环境光
  scene.add(new THREE.HemisphereLight(0xffefd2, 0x685645, 1.8));

  // §4 主光（左前上方，投影）
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
  scene.add(keyLight);

  // §5 补光（≤主光 25%，只保留暗部细节）
  const fillLight = new THREE.DirectionalLight(0x9eabc0, 0.35);
  fillLight.position.set(6, 5, -6);
  scene.add(fillLight);

  return { scene, backdrop, keyLight };
}

// ---------- 轨道相机 ----------

/** 俯仰角带：永不触地/不翻转；缩放：1=全景恰好铺满，3=三倍放大 */
export const ORBIT_MIN_ELEVATION = THREE.MathUtils.degToRad(25);
export const ORBIT_MAX_ELEVATION = THREE.MathUtils.degToRad(75);
/** 默认视角：约 52° 俯角斜 45°，基地铺满视野的读图视角（玩家指定的默认构图） */
export const ORBIT_DEFAULT_ELEVATION = THREE.MathUtils.degToRad(52);
export const ORBIT_DEFAULT_AZIMUTH = Math.atan2(-10, -10);
export const ORBIT_MIN_ZOOM = 1;
export const ORBIT_MAX_ZOOM = 3;
/** 初始/兜底倍率；真实默认值由 fitDefaultZoom() 按「默认角度下基地不裁切」算出（见 homeZoom） */
export const ORBIT_DEFAULT_ZOOM = 1;
/** 双指平移范围下限（世界单位）；真实范围见 WarmOrbitCamera.panLimit（随缩放/地图尺寸放大） */
export const ORBIT_PAN_LIMIT = 1.0;
/** 视角按钮步进：点一下水平旋转 15°、俯仰 12°；按住则连续步进 */
export const ORBIT_ROTATE_STEP = THREE.MathUtils.degToRad(15);
export const ORBIT_TILT_STEP = THREE.MathUtils.degToRad(12);
/** 默认视角留白系数：按投影反推的最大倍率再收 2%，保证底座四角刚好在画面内 */
const HOME_ZOOM_MARGIN = 0.98;

export class WarmOrbitCamera {
  readonly camera: THREE.PerspectiveCamera;
  azimuth = ORBIT_DEFAULT_AZIMUTH;
  elevation = ORBIT_DEFAULT_ELEVATION;
  zoom = ORBIT_DEFAULT_ZOOM;
  /** fit() 计算的全景距离（zoom=1 时相机到目标点的距离） */
  baseDist = 20;
  readonly target = new THREE.Vector3(0, 0, 0.3);
  private readonly homeTarget = new THREE.Vector3(0, 0, 0.3);
  /** 地图半边长（fit 写入）：平移范围要跟着地图尺寸走，地图扩大后仍能平移到边缘 */
  private halfExtent = 6.5;
  /** 回正/开局的默认倍率：默认角度下基地刚好铺满且四角不越界（fitDefaultZoom 写入） */
  private defaultZoom = ORBIT_DEFAULT_ZOOM;

  constructor(fov = 50, aspect = 1) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
  }

  /** 默认倍率（回正按钮/开局用）：由 fitDefaultZoom 按实际投影算出，地图扩大后自动跟着变 */
  get homeZoom(): number {
    return this.defaultZoom;
  }

  /**
   * 当前允许的平移半径（世界单位）：取景余量 + 放大后多出来的部分。
   * zoom=1 时等于取景余量（全景仍然铺满，不会把基地推出画面）；
   * 放大后可见范围变小，允许平移的范围随之变大——正好够把任意角落推到屏幕中心。
   */
  get panLimit(): number {
    const visible = (this.halfExtent + ORBIT_PAN_LIMIT) / this.zoom;
    return Math.max(ORBIT_PAN_LIMIT, this.halfExtent - visible);
  }

  apply(): void {
    const dist = this.baseDist / this.zoom;
    const r = dist * Math.cos(this.elevation);
    this.camera.position.set(
      this.target.x + r * Math.sin(this.azimuth),
      dist * Math.sin(this.elevation),
      this.target.z + r * Math.cos(this.azimuth)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }

  setZoom(z: number): void {
    this.zoom = THREE.MathUtils.clamp(z, ORBIT_MIN_ZOOM, ORBIT_MAX_ZOOM);
    this.clampTarget();
    this.apply();
  }

  /**
   * 单指/鼠标拖动：水平 → 方位角（自由 360°），垂直 → 俯仰（钳位带内）。
   * 方向沿用 three.js OrbitControls 的「抓住场景」手感（与 Google Maps / Sketchfab 一致）：
   *   向右拖 → 场景跟着向右转（相机反向环绕）；向下拖 → 相机抬高、更俯视。
   * （反过来写就是"相机跟随拖拽"，玩家反馈那种手感是反的，别再改回去。）
   */
  rotateBy(dxPx: number, dyPx: number): void {
    this.azimuth -= dxPx * 0.008;
    this.elevation = THREE.MathUtils.clamp(
      this.elevation + dyPx * 0.006, ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION);
    this.apply();
  }

  /** 视角按钮：水平旋转（正 = 场景逆时针转，符号与拖拽同源） */
  nudgeAzimuth(delta: number): void {
    this.azimuth += delta;
    this.apply();
  }

  /** 视角按钮：俯仰增减（正 = 相机抬高、更俯视），钳位在 25°~75° 带内 */
  nudgeElevation(delta: number): void {
    this.elevation = THREE.MathUtils.clamp(
      this.elevation + delta, ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION);
    this.apply();
  }

  /** 回正：方位角/俯仰/缩放/平移全部回到默认读图视角（地图怎么转都能一键找回基地） */
  resetView(): void {
    this.azimuth = ORBIT_DEFAULT_AZIMUTH;
    this.elevation = ORBIT_DEFAULT_ELEVATION;
    this.zoom = this.defaultZoom;
    this.target.copy(this.homeTarget);
    this.apply();
  }

  /**
   * 定默认倍率：在**默认角度**下把基地（含底座与建筑顶高）投影一遍，取最大 |NDC| 反推倍率。
   *
   * 为什么不能直接用固定值：fit() 的 baseDist 是按最不利角度（俯仰下限/上限）留的余量，
   * 默认角度还有富余——固定放大到 1.6 会让基地左右两侧被画布 `overflow:hidden` 裁掉一块。
   * 这里按真实投影顶到「刚好不裁切」，所以默认永远是完整基地；想更大再用 ＋/滚轮（那时裁切是玩家主动的），
   * 地图扩大或画布尺寸变化后也会自动重算。
   */
  fitDefaultZoom(halfW: number, halfH: number, topY = 1.8): number {
    const keep = this.zoom;
    // 透视投影下 NDC 与倍率不成正比（相机距离变了，近远点缩放不同），迭代三次收敛到刚好留白
    let z = ORBIT_MIN_ZOOM;
    for (let i = 0; i < 3; i++) {
      this.zoom = z;
      this.apply();
      const probe = this.fitProbe(halfW, halfH, topY);
      const maxNdc = Math.max(probe.maxNdcX, probe.maxNdcY, 1e-3);
      z = THREE.MathUtils.clamp(z * HOME_ZOOM_MARGIN / maxNdc, ORBIT_MIN_ZOOM, ORBIT_MAX_ZOOM);
    }
    this.defaultZoom = z;
    this.zoom = keep;
    this.apply();
    return this.defaultZoom;
  }

  /** 单指/鼠标左键拖动：平移（内容跟随手指，范围随缩放与地图尺寸自适应） */
  panBy(dxPx: number, dyPx: number, viewportH: number): void {
    const dist = this.baseDist / this.zoom;
    const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / Math.max(1, viewportH);
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const back = new THREE.Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
    this.target.addScaledVector(right, -dxPx * wpp).addScaledVector(back, dyPx * wpp);
    this.clampTarget();
    this.apply();
  }

  /** 把平移目标钳回允许半径内（缩放变化会让允许半径变小，须重新钳一次） */
  private clampTarget(): void {
    const dx = this.target.x - this.homeTarget.x;
    const dz = this.target.z - this.homeTarget.z;
    const len = Math.hypot(dx, dz);
    const limit = this.panLimit;
    if (len > limit) {
      this.target.x = this.homeTarget.x + dx / len * limit;
      this.target.z = this.homeTarget.z + dz / len * limit;
    }
    this.target.y = this.homeTarget.y;
  }

  /**
   * 数值法取景：把基地角点（含建筑顶高、平移余量）投到最不利视角
   * （方位 45° 水平投影最长；俯仰取下限/默认/上限），保证任意角度 zoom=1 不溢出
   */
  fit(width: number, height: number, halfW: number, halfH: number, topY = 1.8): void {
    this.camera.aspect = width / height;
    this.halfExtent = Math.max(halfW, halfH); // 平移范围随地图尺寸放大
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanW = tanH * this.camera.aspect;
    const gx = halfW + ORBIT_PAN_LIMIT;
    const gz = halfH + ORBIT_PAN_LIMIT;
    let need = 0;
    const u = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (const az of [Math.PI / 4, -Math.PI * 3 / 4]) {
      for (const el of [ORBIT_MIN_ELEVATION, ORBIT_DEFAULT_ELEVATION, ORBIT_MAX_ELEVATION]) {
        u.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        fwd.copy(u).negate();
        right.set(Math.cos(az), 0, -Math.sin(az));
        up.crossVectors(right, fwd);
        for (const sy of [0, topY]) {
          for (const sx of [-gx, gx]) {
            for (const sz of [-gz, gz]) {
              v.set(sx, sy, sz).sub(this.homeTarget);
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
    this.apply();
  }

  /** 取景探针：基地四角（含建筑顶高）投影的最大 |NDC|，≤1 即无溢出（e2e 验收用） */
  fitProbe(halfW: number, halfH: number, topY = 1.8): { maxNdcX: number; maxNdcY: number } {
    const v = new THREE.Vector3();
    let mx = 0;
    let my = 0;
    for (const y of [0, topY]) {
      for (const x of [-halfW, halfW]) {
        for (const z of [-halfH, halfH]) {
          v.set(x, y, z).project(this.camera);
          mx = Math.max(mx, Math.abs(v.x));
          my = Math.max(my, Math.abs(v.y));
        }
      }
    }
    return { maxNdcX: mx, maxNdcY: my };
  }
}

// ---------- GLB 模板缓存 ----------

/** 释放整棵子树的独占资源（程序化模型/独立加载的模板用；共享实例不可走这里） */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach(x => x.dispose());
      else m?.dispose();
    }
  });
}

/** GLB 模板 Promise 缓存：防重复请求，失败记 null（调用方回退程序化，绝不抛出） */
export class WarmGlbCache {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<THREE.Object3D | null>>();

  load(file: string): Promise<THREE.Object3D | null> {
    let p = this.cache.get(file);
    if (!p) {
      p = this.loader.loadAsync(`${WARM_MODEL_DIR}/${file}?v=${__ASSET_VERSION__}`)
        .then(gltf => gltf.scene as THREE.Object3D)
        .catch(() => null);
      this.cache.set(file, p);
    }
    return p;
  }

  /** 统一释放模板共享几何/材质（实例侧从不 dispose 模板） */
  disposeAll(): void {
    for (const p of this.cache.values()) {
      void p.then(tpl => { if (tpl) disposeObjectTree(tpl); }).catch(() => {});
    }
    this.cache.clear();
  }
}

// ---------- 视角按钮组（样式同棋盘/夜战：深色底 + 金边，字符图标不走 i18n） ----------

export interface ViewControlHandlers {
  rotateLeft: () => void;
  rotateRight: () => void;
  tiltUp: () => void;
  tiltDown: () => void;
  reset: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const VIEW_BTN_CSS = 'box-sizing:border-box;width:36px;height:36px;pointer-events:auto;border:2px solid #d4a94e;border-radius:8px;' +
  'background:rgba(20,16,10,0.78);color:#ffe066;font-size:18px;line-height:1;padding:0;cursor:pointer;';
/** 两列网格：4 行共 162px 高，竖排 7 键要 288px，小屏（横屏/矮窗）会被容器 overflow:hidden 裁掉上半截 */
const VIEW_WRAPPER_CSS = 'position:absolute;right:8px;bottom:8px;z-index:7;display:grid;' +
  'grid-template-columns:repeat(2,36px);gap:6px;pointer-events:none;';
/** 按住连续步进：首次延迟 320ms，之后每 70ms 一步（点一下 = 一步，按住 = 连续转） */
const VIEW_HOLD_DELAY_MS = 320;
const VIEW_HOLD_REPEAT_MS = 70;

/**
 * 视角按钮组（两列）：⟲ 左转 / ⟳ 右转、⌃ 抬高俯视 / ⌄ 压低平视、＋ 放大 / － 缩小、
 * 底部通栏 ⌂ 回正。
 *
 * 为什么要有按钮：一指拖动已经用来平移地图（地图扩大后必需），旋转交给按钮更精准也不会误触；
 * 桌面端仍可右键拖动旋转，滚轮缩放。按钮用 pointerdown 直接触发（不用 click），这样按住能连续转，
 * 抬手也不会多补一步。
 */
export function makeViewControls(
  container: HTMLElement,
  datasetKey: string,
  handlers: ViewControlHandlers,
  wrapperCss = VIEW_WRAPPER_CSS
): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = wrapperCss;
  container.appendChild(div);
  const mkBtn = (label: string, ctl: string, onStep: () => void, span = false): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset[datasetKey] = ctl;
    b.style.cssText = span ? `${VIEW_BTN_CSS}grid-column:span 2;width:78px;` : VIEW_BTN_CSS;
    let holdTimer: number | null = null;
    const stopHold = (): void => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    b.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      onStep();
      holdTimer = window.setTimeout(function repeat(): void {
        onStep();
        holdTimer = window.setTimeout(repeat, VIEW_HOLD_REPEAT_MS);
      }, VIEW_HOLD_DELAY_MS);
    });
    b.addEventListener('pointerup', stopHold);
    b.addEventListener('pointercancel', stopHold);
    b.addEventListener('pointerleave', stopHold);
    div.appendChild(b);
  };
  mkBtn('⟲', 'rotate-left', handlers.rotateLeft);
  mkBtn('⟳', 'rotate-right', handlers.rotateRight);
  mkBtn('⌃', 'tilt-up', handlers.tiltUp);
  mkBtn('⌄', 'tilt-down', handlers.tiltDown);
  mkBtn('＋', 'zoom-in', handlers.zoomIn);
  mkBtn('－', 'zoom-out', handlers.zoomOut);
  mkBtn('⌂', 'reset', handlers.reset, true); // 通栏：回正是「一键找回基地」，占整行更好按
  return div;
}
