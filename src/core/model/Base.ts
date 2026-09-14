import { IBaseState, IBaseTile, IBuilding, IPoint } from '../types';
import { getBuildingConfig, RUIN_ID } from '../config/BuildingConfig';
import { TERRAIN_TABLE, terrainAt, isTerrainWalkableForGround } from '../config/TerrainConfig';

/** 基地网格：13×13（奇数保证核心居中），核心固定中央 */
export const BASE_ROWS = 13;
export const BASE_COLS = 13;
export const BASE_CENTER = Math.floor(BASE_ROWS / 2); // 6
/** 开局认领范围：整块 13×13 都归玩家（外城环带要能直接布防） */
export const INITIAL_CLAIM_RADIUS = 6;

/**
 * 内城范围（含两端）：中央 9×9（行列 2..10）。
 * 内城只做合成（棋子摆在这里）；**炮塔只能建在外城环带**，见 BaseSystem.canPlace。
 */
export const INNER_CITY_MIN = 2;
export const INNER_CITY_MAX = BASE_ROWS - 3; // 10

/** 该格是否属于内城（9×9） */
export function isInnerCity(row: number, col: number): boolean {
  return row >= INNER_CITY_MIN && row <= INNER_CITY_MAX && col >= INNER_CITY_MIN && col <= INNER_CITY_MAX;
}

/** 该格是否属于外城（13×13 里内城之外的一圈环带，宽度 2） */
export function isOuterCity(row: number, col: number): boolean {
  return row >= 0 && row < BASE_ROWS && col >= 0 && col < BASE_COLS && !isInnerCity(row, col);
}

/**
 * 世界尺寸（战争迷雾）：64×64，城市 13×13 居中。
 * 目前只用于渲染（地面 + 迷雾），`state.grid` 仍是 13×13，不影响存档与寻路；
 * 城市之外不可交互、不可建、不刷怪，留给后续"城市扩张"。
 */
export const WORLD_SIZE = 64;
/** 城市在世界里的起始格（(64−13)/2 = 25，城市占 25..37） */
export const WORLD_CITY_ORIGIN = Math.floor((WORLD_SIZE - BASE_COLS) / 2);

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
  const tiles = createDefaultTiles();
  // 初始地形（外圈）：破旧建筑/树林/水池/瓦砾/杂草，中央 7×7 保持平地
  for (const cell of TERRAIN_TABLE) {
    if (tiles[cell.row]?.[cell.col]) tiles[cell.row][cell.col].terrain = cell.kind;
  }
  return { rows: BASE_ROWS, cols: BASE_COLS, tiles, buildings };
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

/** 基地核心建筑（固定中央，全局唯一；旧存档缺核心时返回 null，由 CoreSystem.ensure 补齐） */
export function findCoreBuilding(base: IBaseState): IBuilding | null {
  return base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core') ?? null;
}

/** 基地核心格坐标（无核心返回中央格） */
export function corePoint(base: IBaseState): IPoint {
  const core = findCoreBuilding(base);
  return { row: core?.row ?? BASE_CENTER, col: core?.col ?? BASE_CENTER };
}

/** 额外的格子阻挡谓词（如「该格有合成物品」）；基地合成改造后由调用方传入 */
export type CellBlocker = (row: number, col: number) => boolean;

function isWalkableForGround(base: IBaseState, row: number, col: number, extraBlocked?: IPoint, itemBlocked?: CellBlocker): boolean {
  if (extraBlocked?.row === row && extraBlocked.col === col) return false;
  if (itemBlocked && itemBlocked(row, col)) return false;
  const terrain = terrainAt(base, row, col);
  if (terrain && !isTerrainWalkableForGround(terrain)) return false;
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
export function findPathToCore(base: IBaseState, start: IPoint, extraBlocked?: IPoint, itemBlocked?: CellBlocker): IPoint[] | null {
  const core = findCoreBuilding(base);
  if (!core || !isWalkableForGround(base, start.row, start.col, extraBlocked, itemBlocked)) return null;
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
      if (parent.has(key) || !isWalkableForGround(base, next.row, next.col, extraBlocked, itemBlocked)) continue;
      parent.set(key, current);
      queue.push(next);
    }
  }
  return null;
}

export function getOpenEdgeCells(base: IBaseState, itemBlocked?: CellBlocker): IPoint[] {
  const open = (row: number, col: number) => !buildingAt(base, row, col) && !(itemBlocked && itemBlocked(row, col));
  const cells: IPoint[] = [];
  for (let col = 0; col < base.cols; col++) {
    if (open(0, col)) cells.push({ row: 0, col });
    if (base.rows > 1 && open(base.rows - 1, col)) cells.push({ row: base.rows - 1, col });
  }
  for (let row = 1; row < base.rows - 1; row++) {
    if (open(row, 0)) cells.push({ row, col: 0 });
    if (base.cols > 1 && open(row, base.cols - 1)) cells.push({ row, col: base.cols - 1 });
  }
  return cells;
}

export function hasKillCorridor(base: IBaseState, extraBlocked?: IPoint, itemBlocked?: CellBlocker): boolean {
  return getOpenEdgeCells(base, itemBlocked).some(entry => findPathToCore(base, entry, extraBlocked, itemBlocked));
}

/** Shortest current ground route from any open edge to the core, in grid cells. */
export function getShortestEntryPathLength(base: IBaseState, itemBlocked?: CellBlocker): number | null {
  const lengths = getOpenEdgeCells(base, itemBlocked)
    .map(entry => findPathToCore(base, entry, undefined, itemBlocked)?.length ?? 0)
    .filter(Boolean);
  return lengths.length > 0 ? Math.min(...lengths) : null;
}
