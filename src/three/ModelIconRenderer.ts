/**
 * 物品 3D 模型快照图标渲染器（离屏单例）
 *
 * 用一个 160×160 离屏 WebGLRenderer 把 voxel_32_<id>.glb 渲染成 PNG dataURL，
 * 供 Phaser UI（任务栏 / 物品详情）把 2D 图标升级为 3D 快照：
 * - 照明/色彩同 docs/KIMI-基地渲染参数.md（半球光 + 主光 + 补光、ACES、SRGB、exposure 1.15），
 *   图标不投影（shadowMap 关闭）；
 * - 取景与棋盘一致：包围盒最大边归一化到 0.8、底部 Y=0，45° 俯角（方位 30° 展示立体感），
 *   数值法拟合让模型占画面约 85%；
 * - Promise 缓存防重复请求，失败记 null（记住失败，调用方保持 2D 图标）；
 * - 每个模板快照后即 dispose 几何/材质（独立加载，不与棋盘共享缓存），单例渲染器本身随应用存活。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type * as Phaser from 'phaser';

declare const __ASSET_VERSION__: string;
declare const __DEV_FEATURES__: boolean;

const MODEL_DIR = 'assets/models/blender-samples';
const ICON_PX = 256; // 高分屏清晰度（原 160 在 DPR≥2 屏上发虚）
/** 归一化后模型最大边（与棋盘视觉一致） */
const TARGET_SIZE = 0.8;
/** 模型占画面比例 */
const FILL = 0.85;

/** 开发调试计数（e2e 验收用）：rendered/failed 为渲染层结果，applied 为 UI 实际换图 */
const devStats = { rendered: [] as number[], failed: [] as number[], applied: [] as number[] };
if (__DEV_FEATURES__) {
  (window as unknown as Record<string, unknown>).__icon3d = devStats;
}

class ModelIconRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private loader = new GLTFLoader();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(ICON_PX, ICON_PX);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = false;

    this.scene.add(new THREE.HemisphereLight(0xffefd2, 0x685645, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffd6a6, 2.4);
    keyLight.position.set(-7, 11, 6);
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9eabc0, 0.35);
    fillLight.position.set(6, 5, -6);
    this.scene.add(fillLight);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  }

  /** 渲染 voxel_32_<id>.glb → PNG dataURL；缺 voxel 时回退 props 包；再失败返回 null（调用方保持 2D 图标） */
  async render(id: number): Promise<string | null> {
    let model: THREE.Object3D;
    try {
      model = (await this.loader.loadAsync(`${MODEL_DIR}/voxel_32_${id}.glb?v=${__ASSET_VERSION__}`)).scene;
    } catch {
      try {
        model = (await this.loader.loadAsync(`assets/models/props/prop_${id}.glb?v=${__ASSET_VERSION__}`)).scene;
      } catch {
        return null;
      }
    }
    try {
      // 包围盒归一化：最大边 → TARGET_SIZE，底部 Y=0，水平居中
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxEdge = Math.max(size.x, size.y, size.z);
      if (!maxEdge || !isFinite(maxEdge)) return null;
      model.scale.setScalar(TARGET_SIZE / maxEdge);
      model.updateMatrixWorld(true);
      const nb = new THREE.Box3().setFromObject(model);
      const nc = nb.getCenter(new THREE.Vector3());
      model.position.set(-nc.x, -nb.min.y, -nc.z);
      model.updateMatrixWorld(true);
      this.scene.add(model);

      // 相机：45° 俯角 + 30° 方位（棋盘视角方向）；目标点为归一化后的包围盒中心
      const fb = new THREE.Box3().setFromObject(model);
      const target = fb.getCenter(new THREE.Vector3());
      const az = THREE.MathUtils.degToRad(30);
      const el = THREE.MathUtils.degToRad(45);
      const dir = new THREE.Vector3(
        Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.camera.position.copy(target).addScaledVector(dir, 10);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld(true);

      // 数值法取景：包围盒 8 角投到相机空间，半幅 = 最大投影 / FILL
      const inv = this.camera.matrixWorldInverse;
      const v = new THREE.Vector3();
      let half = 0;
      for (const x of [fb.min.x, fb.max.x]) {
        for (const y of [fb.min.y, fb.max.y]) {
          for (const z of [fb.min.z, fb.max.z]) {
            v.set(x, y, z).applyMatrix4(inv);
            half = Math.max(half, Math.abs(v.x), Math.abs(v.y));
          }
        }
      }
      if (half <= 0) return null;
      half /= FILL;
      this.camera.left = -half;
      this.camera.right = half;
      this.camera.top = half;
      this.camera.bottom = -half;
      this.camera.updateProjectionMatrix();

      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    } finally {
      this.scene.remove(model);
      this.disposeObject(model);
    }
  }

  /** 快照后释放模板（独立加载，几何/材质均独占） */
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
}

let singleton: ModelIconRenderer | null = null;
let unavailable = false;
/** dataURL 缓存：Promise 缓存防重复请求，失败记 null */
const iconCache = new Map<number, Promise<string | null>>();

/** 取物品 3D 快照图标 dataURL；无 GLB/加载失败/WebGL 不可用 → null（保持 2D 图标） */
export function getModelIcon(id: number): Promise<string | null> {
  let p = iconCache.get(id);
  if (!p) {
    p = (async () => {
      if (unavailable) return null;
      if (!singleton) {
        try {
          singleton = new ModelIconRenderer();
        } catch {
          unavailable = true;
          return null;
        }
      }
      const url = await singleton.render(id);
      if (__DEV_FEATURES__) (url ? devStats.rendered : devStats.failed).push(id);
      return url;
    })();
    iconCache.set(id, p);
  }
  return p;
}

/**
 * 把 Phaser 图片升级为 3D 快照图标（先保持 2D 图标，快照就绪后原位换纹理）。
 * - icon3d_<id> 纹理已存在时直接换，不重复渲染（任务栏刷新/详情重开都走这里）；
 * - 过期防护：图片被销毁（面板关闭/卡片回收）或数据 id 已变（复用为其他物品）则丢弃；
 * - 失败/404 静默保持 2D 图标。
 */
export function applyModelIcon(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  id: number,
  displaySize: number
): void {
  const key = `icon3d_${id}`;
  image.setData('icon3dId', id);
  const swap = (): void => {
    if (!image.active || image.getData('icon3dId') !== id) return;
    if (!scene.textures.exists(key)) return;
    image.setTexture(key).setDisplaySize(displaySize, displaySize);
    if (__DEV_FEATURES__) devStats.applied.push(id);
  };
  if (scene.textures.exists(key)) {
    swap();
    return;
  }
  void getModelIcon(id).then(url => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      swap();
    };
    img.src = url;
  }).catch(() => { /* getModelIcon 内部已兜底，防未处理拒绝 */ });
}
