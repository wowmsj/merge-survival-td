import * as THREE from 'three';
import { IGameState } from '../core/types';
import { IBattle } from '../core/systems/NightSystem';
import { getBuildingConfig } from '../core/config/BuildingConfig';
import { getZombieConfig } from '../core/config/ZombieConfig';
import { BASE_COLS, BASE_ROWS } from '../core/model/Base';

/** 3D 世界坐标：1 格 = 1 单位，基地中心在世界原点 */
const CELL_SIZE = 1;
const GRID_OFFSET_X = -((BASE_COLS - 1) * CELL_SIZE) / 2;
const GRID_OFFSET_Z = -((BASE_ROWS - 1) * CELL_SIZE) / 2;

function cellToWorld(row: number, col: number): { x: number; z: number } {
  return {
    x: GRID_OFFSET_X + col * CELL_SIZE,
    z: GRID_OFFSET_Z + row * CELL_SIZE
  };
}

/** 低多边形材质缓存 */
const materialCache = new Map<string, THREE.Material>();
function getMaterial(color: number, emissive = 0x000000): THREE.MeshStandardMaterial {
  const key = `${color}-${emissive}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({
      color,
      emissive,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true
    }));
  }
  return materialCache.get(key) as THREE.MeshStandardMaterial;
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
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), getMaterial(0x8a8a99));
      base.position.y = 0.15;
      group.add(base);
      if (cfgId === 101) { // 箭塔
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 6), getMaterial(0xa5a5b5));
        pillar.position.y = 0.65;
        group.add(pillar);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), getMaterial(0xffe066));
        arrow.position.y = 1.15;
        arrow.rotation.x = Math.PI / 2;
        group.add(arrow);
      } else if (cfgId === 102) { // 炮塔
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
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), getMaterial(cfgId === 401 ? 0x8b5a2b : cfgId === 402 ? 0x808080 : 0x505050));
      wall.position.y = 0.25;
      group.add(wall);
      break;
    }
    case 'trap': {
      const trap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), getMaterial(cfgId === 301 ? 0x94d82d : cfgId === 302 ? 0xff6b6b : 0x4dabf7));
      trap.position.y = 0.075;
      group.add(trap);
      break;
    }
    case 'resource': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), getMaterial(0x8a8a99));
      base.position.y = 0.2;
      group.add(base);
      if (cfgId === 203) { // 风力发电站
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.8, 6), getMaterial(0xdee2e6));
        pole.position.y = 0.8;
        group.add(pole);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), getMaterial(0xffffff));
        blade.position.y = 1.2;
        group.add(blade);
      } else if (cfgId === 209) { // 雷达站
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4, 0, Math.PI), getMaterial(0xced4da));
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

  return group;
}

/**
 * 夜战 3D 渲染器
 * 负责把 NightSystem 的战斗状态渲染成低多边形 3D 场景
 */
export class Night3DRenderer {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private ground!: THREE.Mesh;
  private gridHelper!: THREE.GridHelper;

  private buildingMeshes = new Map<string, THREE.Group>();
  private zombieMeshes = new Map<number, THREE.Group>();
  private coreLight!: THREE.PointLight;

  constructor(container: HTMLElement, width: number, height: number) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0d1a);
    this.scene.fog = new THREE.Fog(0x0d0d1a, 15, 35);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 14, 14);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 光照
    const ambient = new THREE.AmbientLight(0x404060, 1.2);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    this.scene.add(dirLight);

    // 核心发光
    this.coreLight = new THREE.PointLight(0x4dabf7, 2, 8);
    this.coreLight.position.set(0, 1.5, 0);
    this.scene.add(this.coreLight);

    // 地面
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.9, flatShading: true });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // 基地网格
    const gridSize = Math.max(BASE_COLS, BASE_ROWS) * CELL_SIZE;
    this.gridHelper = new THREE.GridHelper(gridSize, Math.max(BASE_COLS, BASE_ROWS), 0xffd43b, 0x8a6d1a);
    this.gridHelper.position.y = 0.01;
    this.scene.add(this.gridHelper);

    // 基地边界框
    const borderGeo = new THREE.BoxGeometry(BASE_COLS * CELL_SIZE + 0.5, 0.1, BASE_ROWS * CELL_SIZE + 0.5);
    const border = new THREE.Mesh(borderGeo, getMaterial(0x8a6d1a));
    border.position.y = 0.05;
    this.scene.add(border);
  }

  /** 同步建筑状态到 3D 场景 */
  syncBuildings(state: IGameState): void {
    const currentIds = new Set<string>();
    for (const b of state.base.buildings) {
      const key = `${b.row},${b.col}`;
      currentIds.add(key);
      if (!this.buildingMeshes.has(key)) {
        const model = createBuildingModel(b.cfgId);
        const { x, z } = cellToWorld(b.row, b.col);
        model.position.set(x, 0, z);
        model.traverse(obj => { obj.castShadow = true; });
        this.scene.add(model);
        this.buildingMeshes.set(key, model);
      }
      // 血量低时压暗
      const mesh = this.buildingMeshes.get(key)!;
      const cfg = getBuildingConfig(b.cfgId);
      if (cfg && b.hp < b.maxHp * 0.3) {
        mesh.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            (obj.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.7);
          }
        });
      }
    }
    // 移除已不存在的建筑
    for (const [key, mesh] of this.buildingMeshes) {
      if (!currentIds.has(key)) {
        this.scene.remove(mesh);
        this.buildingMeshes.delete(key);
      }
    }
  }

  /** 同步僵尸状态到 3D 场景 */
  syncZombies(battle: IBattle): void {
    const currentUids = new Set<number>();
    for (const z of battle.zombies) {
      currentUids.add(z.uid);
      if (!this.zombieMeshes.has(z.uid)) {
        const model = createZombieModel(z.cfgId);
        model.traverse(obj => { obj.castShadow = true; });
        this.scene.add(model);
        this.zombieMeshes.set(z.uid, model);
      }
      const mesh = this.zombieMeshes.get(z.uid)!;
      const { x, z: wz } = cellToWorld(z.row, z.col);
      // 平滑插值移动
      mesh.position.x += (x - mesh.position.x) * 0.2;
      mesh.position.z += (wz - mesh.position.z) * 0.2;
      // 潜行时只显示土堆
      mesh.visible = !z.burrowed;
    }
    for (const [uid, mesh] of this.zombieMeshes) {
      if (!currentUids.has(uid)) {
        this.scene.remove(mesh);
        this.zombieMeshes.delete(uid);
      }
    }
  }

  /** 渲染一帧 */
  render(): void {
    this.coreLight.intensity = 1.5 + Math.sin(Date.now() * 0.003) * 0.5;
    this.renderer.render(this.scene, this.camera);
  }

  /** 窗口尺寸变化 */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** 销毁释放资源 */
  dispose(): void {
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    this.buildingMeshes.clear();
    this.zombieMeshes.clear();
  }
}
