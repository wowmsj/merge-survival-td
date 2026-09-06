/**
 * 地形瓦片绘制：同种地形相邻格连成一片地面（瓦片地图式），
 * 与不同地形/平地接壤的边画收边条（水池=沙滩岸，草地/树林=深色土边）。
 * 细节点缀用 (row,col) 确定性伪随机，同一格每次渲染一致。
 * BaseScene（白天）与 NightScene（夜晚压暗）共用。
 */

import * as Phaser from 'phaser';
import { IBaseState, TerrainKind } from '../../core/types';
import { terrainAt } from '../../core/config/TerrainConfig';

interface TerrainStyle {
  /** 地面主色 */
  ground: number;
  /** 收边条颜色（与非本类地形接壤的边） */
  edge: number;
  /** 点缀色（草叶/波光/石子） */
  detail: number;
}

const STYLES: Record<TerrainKind, TerrainStyle> = {
  grass: { ground: 0x4d7c3f, edge: 0x38592e, detail: 0x74a858 },
  rubble: { ground: 0x6b625a, edge: 0x4a443e, detail: 0x8a8078 },
  shack: { ground: 0x6e5a44, edge: 0x4c3e2f, detail: 0x8a7458 },
  woods: { ground: 0x42563a, edge: 0x2e3f28, detail: 0x54704a },
  pond: { ground: 0x2f6f8f, edge: 0xc7a15a, detail: 0x7fd4e8 }
};

/** 夜晚整体压暗系数（近似乘 0.62 亮度） */
const NIGHT_STYLES: Record<TerrainKind, TerrainStyle> = {
  grass: { ground: 0x304d28, edge: 0x23381b, detail: 0x486935 },
  rubble: { ground: 0x443e39, edge: 0x2f2b27, detail: 0x57504a },
  shack: { ground: 0x463a2c, edge: 0x302820, detail: 0x584a39 },
  woods: { ground: 0x2b3725, edge: 0x1e291b, detail: 0x36472f },
  pond: { ground: 0x1e475b, edge: 0x7d6640, detail: 0x50879a }
};

/** 确定性伪随机 [0,1)：同一格同一序号恒定 */
function rand(row: number, col: number, seed: number): number {
  let h = (row * 73856093) ^ (col * 19349663) ^ (seed * 83492791);
  h = Math.abs(h * 2654435761 % 2147483647);
  return h / 2147483647;
}

/**
 * 画一格地形地面：cell 中心 (x,y)，边长 cell，同种地形的相邻方向出血 gap 像素填缝。
 * 返回该格使用的样式（供调用方决定是否叠加主体图标）。
 */
export function drawTerrainTile(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  base: IBaseState,
  row: number,
  col: number,
  x: number,
  y: number,
  cell: number,
  gap: number,
  night: boolean = false
): void {
  const terrain = terrainAt(base, row, col);
  if (!terrain) return;
  const style = (night ? NIGHT_STYLES : STYLES)[terrain];
  const same = (r: number, c: number) => terrainAt(base, r, c) === terrain;

  const left = same(row, col - 1);
  const right = same(row, col + 1);
  const up = same(row - 1, col);
  const down = same(row + 1, col);

  const g = scene.add.graphics();
  // 地面：同种相邻方向向外出血，连成一片
  const fx = x - cell / 2 - (left ? gap : 0);
  const fy = y - cell / 2 - (up ? gap : 0);
  const fw = cell + (left ? gap : 0) + (right ? gap : 0);
  const fh = cell + (up ? gap : 0) + (down ? gap : 0);
  g.fillStyle(style.ground, 1);
  g.fillRect(fx, fy, fw, fh);

  // 收边条：只在与非本类地形接壤的边上画（相邻同类格之间无缝）
  const ET = 5;
  g.fillStyle(style.edge, 1);
  if (!left) g.fillRect(x - cell / 2, y - cell / 2, ET, cell);
  if (!right) g.fillRect(x + cell / 2 - ET, y - cell / 2, ET, cell);
  if (!up) g.fillRect(x - cell / 2, y - cell / 2, cell, ET);
  if (!down) g.fillRect(x - cell / 2, y + cell / 2 - ET, cell, ET);

  // 细节点缀（每格 2~3 个，位置/大小按格坐标恒定）
  g.fillStyle(style.detail, 0.85);
  const dots = terrain === 'pond' ? 2 : 3;
  for (let i = 0; i < dots; i++) {
    const dx = (rand(row, col, i * 2) - 0.5) * (cell - 26);
    const dy = (rand(row, col, i * 2 + 1) - 0.5) * (cell - 26);
    if (terrain === 'pond') {
      // 水面波光：扁椭圆
      g.fillEllipse(x + dx, y + dy, 8 + rand(row, col, i + 9) * 8, 3.5);
    } else if (terrain === 'grass' || terrain === 'woods') {
      // 草叶：小三角
      const h = 5 + rand(row, col, i + 9) * 5;
      g.fillTriangle(x + dx - 3, y + dy + 2, x + dx + 3, y + dy + 2, x + dx, y + dy - h);
    } else {
      // 瓦砾/破楼：碎石块
      g.fillRect(x + dx - 3, y + dy - 2, 6 + rand(row, col, i + 9) * 4, 4);
    }
  }
  layer.add(g);
}

/** 该地形是否在地面之上再叠一个主体图标（树林/破楼/瓦砾保留辨识度，草地/水池纯地块） */
export function terrainHasOverlayIcon(terrain: TerrainKind): boolean {
  return terrain === 'woods' || terrain === 'shack' || terrain === 'rubble';
}
