import { IGameState, IPoint } from '../types';
import { getItem } from '../model/Grid';
import { itemBlocksGroundZombie } from '../model/Item';
import { buildingAt, distFromCenter, findCoreBuilding, findPathToCore, CellBlocker } from '../model/Base';
import { getBuildingConfig } from '../config/BuildingConfig';
import { terrainAt, isTerrainWalkableForGround } from '../config/TerrainConfig';
import { getSpawnCells } from './NightSystem';

/** 单个格子在僵尸路线上的信息 */
export interface IRouteCell {
  row: number;
  col: number;
  /** 主流向：下一格的相对偏移（-1/0/1，至少一个非 0） */
  dr: number;
  dc: number;
  /** 有多少条路线经过此格（越大越是汇聚瓶颈） */
  flow: number;
  /** 该格本身是刷怪点（僵尸从这里入场） */
  spawn: boolean;
  /**
   * 通路被完全封死时的「破门点」：僵尸会在这里停下来拆建筑 / 踩碎棋子。
   * 只在没有任何通路时才出现（此时 cells 里没有常规箭头，只有破门点）。
   */
  breach?: 'building' | 'item';
}

export interface IRoutePreview {
  /** 今晚可能出兵的边缘格 */
  spawnCells: IPoint[];
  /** 路线经过的格子（含刷怪点，不含核心格） */
  cells: IRouteCell[];
  /** 基地核心格（无核心为 null） */
  core: IPoint | null;
  /** 是否存在至少一条通路 */
  hasRoute: boolean;
}

/** 合成物品同样挡路（普通/蜘蛛网棋子拦僵尸；被僵尸踩碎过的瓦砾不再挡，与实战同一判定） */
function itemBlocker(state: IGameState): CellBlocker {
  return (r, c) => itemBlocksGroundZombie(getItem(state.grid, r, c));
}

const DIR_ORDER: { dr: number; dc: number }[] = [
  { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }
];

/**
 * 僵尸路线预览（白天布防用）：
 * 对每个可能刷怪的边缘格跑一次「四方向寻路走到核心」，把路径上的格子聚合成
 * 「每格主流向 + 经过路线条数」，供场景画箭头。
 *
 * 与实战同源：刷怪点用 NightSystem.getSpawnCells，寻路用 findPathToCore（同 itemBlocker），
 * 因此箭头显示的就是地面僵尸实际会走的格子与方向（飞行/钻地不走地面路线）。
 *
 * @param extraBlocked 假设该格将被建筑占用（摆放预览：看放这里之后僵尸改走哪）
 */
export function computeRoutePreview(state: IGameState, extraBlocked?: IPoint | null): IRoutePreview {
  const coreBuilding = state.base ? findCoreBuilding(state.base) : null;
  const core = coreBuilding ? { row: coreBuilding.row, col: coreBuilding.col } : null;
  const blocked = itemBlocker(state);
  const spawnCells = getSpawnCells(state);

  // 聚合：格子 → 经过的路线数 + 各方向出现次数
  const acc = new Map<string, { row: number; col: number; flow: number; dirs: Map<string, number> }>();
  const spawnKeys = new Set(spawnCells.map(p => `${p.row},${p.col}`));
  let routed = 0;

  for (const start of spawnCells) {
    const path = findPathToCore(state.base, start, extraBlocked ?? undefined, blocked);
    if (!path || path.length < 2) continue;
    routed++;
    for (let i = 0; i < path.length - 1; i++) {
      const cur = path[i];
      const next = path[i + 1];
      const key = `${cur.row},${cur.col}`;
      let entry = acc.get(key);
      if (!entry) {
        entry = { row: cur.row, col: cur.col, flow: 0, dirs: new Map() };
        acc.set(key, entry);
      }
      entry.flow++;
      const dkey = `${next.row - cur.row},${next.col - cur.col}`;
      entry.dirs.set(dkey, (entry.dirs.get(dkey) ?? 0) + 1);
    }
  }

  const cells: IRouteCell[] = [];
  for (const entry of acc.values()) {
    // 核心格不画箭头（僵尸到这里就是拆核心了）
    if (core && entry.row === core.row && entry.col === core.col) continue;
    let best = DIR_ORDER[0];
    let bestCount = -1;
    for (const d of DIR_ORDER) {
      const n = entry.dirs.get(`${d.dr},${d.dc}`) ?? 0;
      if (n > bestCount) {
        bestCount = n;
        best = d;
      }
    }
    cells.push({
      row: entry.row,
      col: entry.col,
      dr: best.dr,
      dc: best.dc,
      flow: entry.flow,
      spawn: spawnKeys.has(`${entry.row},${entry.col}`)
    });
  }

  // 通路全封死 → 不再有箭头，改为标出「僵尸会在哪一格破门」（拆建筑 / 踩碎棋子）
  if (routed === 0) {
    const seen = new Set<string>();
    for (const start of spawnCells) {
      const breach = findBreachPoint(state, start, core, blocked, extraBlocked ?? null);
      if (!breach) continue;
      const key = `${breach.row},${breach.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({
        row: breach.row,
        col: breach.col,
        dr: breach.dr,
        dc: breach.dc,
        flow: 1,
        spawn: false,
        breach: breach.kind
      });
    }
  }

  return { spawnCells, cells, core, hasRoute: routed > 0 };
}

/**
 * 破门点：通路全封死时，僵尸会按「朝核心硬挤」的兜底规则往前顶，
 * 顶到第一格挡路的东西就停下拆它（建筑）/ 踩碎它（棋子）。
 * 这里按同一套规则走一遍，返回那一格 + 挡路的是什么，供场景打标。
 *
 * 只用于预览（僵尸实际会随机选一个更靠近核心的方向），所以是「最可能」的破门点。
 */
function findBreachPoint(
  state: IGameState,
  start: IPoint,
  core: IPoint | null,
  blocked: CellBlocker,
  extraBlocked: IPoint | null
): { row: number; col: number; dr: number; dc: number; kind: 'building' | 'item' } | null {
  if (!core) return null;
  const isExtra = (r: number, c: number) => !!extraBlocked && extraBlocked.row === r && extraBlocked.col === c;
  let cur: IPoint = { row: start.row, col: start.col };
  for (let i = 0; i < 40; i++) {
    if (cur.row === core.row && cur.col === core.col) return null;
    const d0 = distFromCenter(cur.row, cur.col);
    let best: IPoint | null = null;
    let bestD = d0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = cur.row + dr;
        const c = cur.col + dc;
        if (r < 0 || r >= state.base.rows || c < 0 || c >= state.base.cols) continue;
        const d = distFromCenter(r, c);
        if (d >= bestD) continue;
        // 地形不可通行 → 这个方向僵尸本来就选不了
        const terrain = terrainAt(state.base, r, c);
        if (terrain && !isTerrainWalkableForGround(terrain)) continue;
        best = { row: r, col: c };
        bestD = d;
      }
    }
    if (!best) return null;
    // 摆放预览假设占用的那一格：建造后就等于新建了一堵墙
    if (isExtra(best.row, best.col)) {
      return { row: best.row, col: best.col, dr: best.row - cur.row, dc: best.col - cur.col, kind: 'building' };
    }
    const building = buildingAt(state.base, best.row, best.col);
    const kind = building ? getBuildingConfig(building.cfgId)?.kind : null;
    if (kind === 'core') return null; // 已经顶到核心，算正常进攻
    if (building && kind !== 'trap') {
      return { row: best.row, col: best.col, dr: best.row - cur.row, dc: best.col - cur.col, kind: 'building' };
    }
    if (blocked(best.row, best.col)) {
      return { row: best.row, col: best.col, dr: best.row - cur.row, dc: best.col - cur.col, kind: 'item' };
    }
    cur = best;
  }
  return null;
}
