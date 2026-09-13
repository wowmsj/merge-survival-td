import { IGameState, IPoint } from '../types';
import { getItem } from '../model/Grid';
import { findCoreBuilding, findPathToCore, CellBlocker } from '../model/Base';
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

/** 合成物品同样挡路（棋子与建筑一样拦僵尸） */
function itemBlocker(state: IGameState): CellBlocker {
  return (r, c) => !!getItem(state.grid, r, c);
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

  return { spawnCells, cells, core, hasRoute: routed > 0 };
}
