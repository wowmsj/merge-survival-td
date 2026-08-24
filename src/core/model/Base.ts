import { IBaseState, IBaseTile, IBuilding, IPoint } from '../types';
import { getBuildingConfig, RUIN_ID } from '../config/BuildingConfig';

/** 基地网格：13×13（奇数保证核心居中），核心固定中央 */
export const BASE_ROWS = 13;
export const BASE_COLS = 13;
export const BASE_CENTER = Math.floor(BASE_ROWS / 2); // 6
export const INITIAL_CLAIM_RADIUS = 3;

/** 建筑摆放区域 */
export enum BaseZone {
  /** 核心格 */
  Core = 'core',
  /** 内圈（资源建筑），距核心切比雪夫距离 1~4 */
  Inner = 'inner',
  /** 外圈两环（防御塔），距离 5~6 */
  Outer = 'outer'
}

/** 距核心的切比雪夫距离 */
export function distFromCenter(row: number, col: number): number {
  return Math.max(Math.abs(row - BASE_CENTER), Math.abs(col - BASE_CENTER));
}

/** 格子所属区域 */
export function zoneOf(row: number, col: number): BaseZone {
  const d = distFromCenter(row, col);
  if (d === 0) return BaseZone.Core;
  if (d <= 4) return BaseZone.Inner;
  return BaseZone.Outer;
}

export function createDefaultTiles(): IBaseTile[][] {
  return Array.from({ length: BASE_ROWS }, (_, row) =>
    Array.from({ length: BASE_COLS }, (_, col) => ({
      claimed: distFromCenter(row, col) <= INITIAL_CLAIM_RADIUS
    }))
  );
}

export function isClaimed(base: IBaseState, row: number, col: number): boolean {
  return !!base.tiles?.[row]?.[col]?.claimed;
}

export function claimAround(base: IBaseState, row: number, col: number, radius: number): number {
  if (!base.tiles) base.tiles = createDefaultTiles();
  let claimed = 0;
  for (let r = Math.max(0, row - radius); r <= Math.min(base.rows - 1, row + radius); r++) {
    for (let c = Math.max(0, col - radius); c <= Math.min(base.cols - 1, col + radius); c++) {
      if (!base.tiles[r][c].claimed) {
        base.tiles[r][c].claimed = true;
        claimed++;
      }
    }
  }
  return claimed;
}

/** 创建默认基地：中央核心 + 北/西/南三边外缘废墟 + 东边部分废墟（只留中段 3 格缺口） */
export function createDefaultBase(): IBaseState {
  const core: IBuilding = {
    cfgId: 1,
    level: 1,
    hp: 1000,
    maxHp: 1000,
    row: BASE_CENTER,
    col: BASE_CENTER
  };
  const buildings: IBuilding[] = [core];
  for (const side of RUIN_SIDES) {
    for (const cell of ruinCellsOfSide(side)) {
      buildings.push({ cfgId: RUIN_ID, level: 1, hp: 80, maxHp: 80, row: cell.row, col: cell.col });
    }
  }
  for (const cell of initialEastRuinCells()) {
    buildings.push({ cfgId: RUIN_ID, level: 1, hp: 80, maxHp: 80, row: cell.row, col: cell.col });
  }
  return { rows: BASE_ROWS, cols: BASE_COLS, tiles: createDefaultTiles(), buildings };
}

/** 废墟方位：north=顶边 row0，west=左边 col0，south=底边 row(rows-1)，east=东边 */
export type RuinSide = 'north' | 'west' | 'south' | 'east';

/** 新开局整边有废墟的三边 */
export const RUIN_SIDES: RuinSide[] = ['north', 'west', 'south'];

/** 东边缺口保留的行（正对核心的中段 3 格），其余东缘格开局即废墟 */
export const EAST_GAP_ROWS = [BASE_CENTER - 2, BASE_CENTER - 1, BASE_CENTER]; // [4,5,6]

/** 新开局东边的部分废墟格（两个角归属北/南边，不重复） */
export function initialEastRuinCells(): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let row = 1; row < BASE_ROWS - 1; row++) {
    if (!EAST_GAP_ROWS.includes(row)) cells.push({ row, col: BASE_COLS - 1 });
  }
  return cells;
}

/** 废墟坍塌顺序：第 1 夜后塌北边，再西、再南，最后东边收窄的废墟也塌掉（第 5 天起四边全开） */
export const RUIN_COLLAPSE_ORDER: RuinSide[] = ['north', 'west', 'south', 'east'];

/** 某条边外缘的全部格子 */
export function ruinCellsOfSide(side: RuinSide): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let i = 0; i < BASE_ROWS; i++) {
    if (side === 'north') cells.push({ row: 0, col: i });
    else if (side === 'south') cells.push({ row: BASE_ROWS - 1, col: i });
    else if (side === 'west') cells.push({ row: i, col: 0 });
    else cells.push({ row: i, col: BASE_COLS - 1 });
  }
  return cells;
}

/** 取某格建筑 */
export function buildingAt(base: IBaseState, row: number, col: number): IBuilding | null {
  return base.buildings.find(b => b.row === row && b.col === col) ?? null;
}

function isWalkableForGround(base: IBaseState, row: number, col: number, extraBlocked?: IPoint): boolean {
  if (extraBlocked?.row === row && extraBlocked.col === col) return false;
  const building = buildingAt(base, row, col);
  if (!building) return true;
  const kind = getBuildingConfig(building.cfgId)?.kind;
  return kind === 'core' || kind === 'trap';
}

function cardinalNeighbors(base: IBaseState, point: IPoint): IPoint[] {
  return ([
    { row: point.row - 1, col: point.col },
    { row: point.row + 1, col: point.col },
    { row: point.row, col: point.col - 1 },
    { row: point.row, col: point.col + 1 }
  ] as IPoint[]).filter(p => p.row >= 0 && p.row < base.rows && p.col >= 0 && p.col < base.cols);
}

/** Uniform-cost cardinal search; weighted terrain can replace this with A* without changing callers. */
export function findPathToCore(base: IBaseState, start: IPoint, extraBlocked?: IPoint): IPoint[] | null {
  const core = base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core');
  if (!core || !isWalkableForGround(base, start.row, start.col, extraBlocked)) return null;
  const queue: IPoint[] = [start];
  const parent = new Map<string, IPoint | null>([[`${start.row},${start.col}`, null]]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.row === core.row && current.col === core.col) {
      const path: IPoint[] = [];
      let cursor: IPoint | null = current;
      while (cursor) {
        path.unshift(cursor);
        cursor = parent.get(`${cursor.row},${cursor.col}`) ?? null;
      }
      return path;
    }
    for (const next of cardinalNeighbors(base, current)) {
      const key = `${next.row},${next.col}`;
      if (parent.has(key) || !isWalkableForGround(base, next.row, next.col, extraBlocked)) continue;
      parent.set(key, current);
      queue.push(next);
    }
  }
  return null;
}

export function getOpenEdgeCells(base: IBaseState): IPoint[] {
  const cells: IPoint[] = [];
  for (let col = 0; col < base.cols; col++) {
    if (!buildingAt(base, 0, col)) cells.push({ row: 0, col });
    if (base.rows > 1 && !buildingAt(base, base.rows - 1, col)) cells.push({ row: base.rows - 1, col });
  }
  for (let row = 1; row < base.rows - 1; row++) {
    if (!buildingAt(base, row, 0)) cells.push({ row, col: 0 });
    if (base.cols > 1 && !buildingAt(base, row, base.cols - 1)) cells.push({ row, col: base.cols - 1 });
  }
  return cells;
}

export function hasKillCorridor(base: IBaseState, extraBlocked?: IPoint): boolean {
  return getOpenEdgeCells(base).some(entry => findPathToCore(base, entry, extraBlocked));
}

/** Shortest current ground route from any open edge to the core, in grid cells. */
export function getShortestEntryPathLength(base: IBaseState): number | null {
  const lengths = getOpenEdgeCells(base)
    .map(entry => findPathToCore(base, entry)?.length ?? 0)
    .filter(Boolean);
  return lengths.length > 0 ? Math.min(...lengths) : null;
}
