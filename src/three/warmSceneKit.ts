/**
 * 暖土 3D 场景共享工具（docs/KIMI-基地渲染参数.md）
 *
 * 新建的基地白天 3D 渲染器（Base3DRenderer）使用这里的公共件；
 * Night3DRenderer 保持自己的实现不动，新代码如需同款能力从这里取：
 * - applyWarmRendererSettings：§1 色彩空间/ACES/阴影参数
 * - createWarmScene：§2 背景 + 地面承接平面 + §3/§4/§5 半球光/主光/补光
 * - WarmOrbitCamera：轨道相机（方位自由、俯仰 25°~75° 不翻转、缩放 1~3、数值法取景不溢出、双指平移）
 * - WarmGlbCache：GLB 模板 Promise 缓存（失败记 null）+ 统一释放
 * - makeZoomControls：＋/－ 缩放按钮（深色底金边，同棋盘/夜战样式）
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
/** 默认放大倍率：zoom=1 是「全景恰好铺满」，默认再放大一档 */
export const ORBIT_DEFAULT_ZOOM = 1.6;
/** 双指平移范围（世界单位，围绕基地中心） */
export const ORBIT_PAN_LIMIT = 1.0;

export class WarmOrbitCamera {
  readonly camera: THREE.PerspectiveCamera;
  azimuth = ORBIT_DEFAULT_AZIMUTH;
  elevation = ORBIT_DEFAULT_ELEVATION;
  zoom = ORBIT_DEFAULT_ZOOM;
  /** fit() 计算的全景距离（zoom=1 时相机到目标点的距离） */
  baseDist = 20;
  readonly target = new THREE.Vector3(0, 0, 0.3);
  private readonly homeTarget = new THREE.Vector3(0, 0, 0.3);

  constructor(fov = 50, aspect = 1) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
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
    this.apply();
  }

  /** 单指拖动：水平 → 方位角（自由 360°），垂直 → 俯仰（钳位带内） */
  rotateBy(dxPx: number, dyPx: number): void {
    this.azimuth += dxPx * 0.008;
    this.elevation = THREE.MathUtils.clamp(
      this.elevation - dyPx * 0.006, ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION);
    this.apply();
  }

  /** 双指拖动平移（内容跟随手指，钳制在基地中心附近） */
  panBy(dxPx: number, dyPx: number, viewportH: number): void {
    const dist = this.baseDist / this.zoom;
    const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / Math.max(1, viewportH);
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const back = new THREE.Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
    this.target.addScaledVector(right, -dxPx * wpp).addScaledVector(back, dyPx * wpp);
    const dx = this.target.x - this.homeTarget.x;
    const dz = this.target.z - this.homeTarget.z;
    const len = Math.hypot(dx, dz);
    if (len > ORBIT_PAN_LIMIT) {
      this.target.x = this.homeTarget.x + dx / len * ORBIT_PAN_LIMIT;
      this.target.z = this.homeTarget.z + dz / len * ORBIT_PAN_LIMIT;
    }
    this.target.y = this.homeTarget.y;
    this.apply();
  }

  /**
   * 数值法取景：把基地角点（含建筑顶高、平移余量）投到最不利视角
   * （方位 45° 水平投影最长；俯仰取下限/默认/上限），保证任意角度 zoom=1 不溢出
   */
  fit(width: number, height: number, halfW: number, halfH: number, topY = 1.8): void {
    this.camera.aspect = width / height;
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

// ---------- 缩放按钮（样式同棋盘/夜战：深色底 + 金边，字符图标不走 i18n） ----------

export function makeZoomControls(
  container: HTMLElement,
  datasetKey: string,
  onZoomIn: () => void,
  onZoomOut: () => void
): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;right:8px;bottom:8px;z-index:7;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
  container.appendChild(div);
  const mkBtn = (label: string, ctl: string, onTap: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset[datasetKey] = ctl;
    b.style.cssText = 'width:36px;height:36px;pointer-events:auto;border:2px solid #d4a94e;border-radius:8px;' +
      'background:rgba(20,16,10,0.78);color:#ffe066;font-size:20px;line-height:1;padding:0;cursor:pointer;';
    b.addEventListener('click', ev => { ev.stopPropagation(); onTap(); });
    div.appendChild(b);
  };
  mkBtn('＋', 'zoom-in', onZoomIn);
  mkBtn('－', 'zoom-out', onZoomOut);
  return div;
}
