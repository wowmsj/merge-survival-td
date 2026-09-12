import { IGameState, IGrid, IPoint, IResource, ITask } from '../types';
import { createGrid, findEmptyCell, getItem, getNineEmptyCells, inGrid } from './Grid';
import { createDefaultBase, isClaimed, buildingAt, BASE_ROWS, BASE_COLS } from './Base';
import { terrainAt } from '../config/TerrainConfig';
import { getConfigValue } from '../config/TableConfig';

/** 物品层网格：与基地 13×13 一一对应（基地地图直接合成，独立棋盘已废弃） */
export const DEFAULT_GRID_ROWS = BASE_ROWS;
export const DEFAULT_GRID_COLS = BASE_COLS;

export function createDefaultResources(): IResource {
  return {
    coin: getConfigValue('basicGold', 0),
    diamond: getConfigValue('basicGem', 100),
    power: getConfigValue('energyMax', 100),
    exp: 0,
    star: 0,
    medicine: 0,
    scrap: 0,
    fuel: 0,
    medicineMax: 10
  };
}

export function createInitialGameState(playMode: 'merge' | 'build' = 'merge'): IGameState {
  return {
    language: 'en',
    grid: createGrid(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS) as IGrid,
    resources: createDefaultResources(),
    tasks: [] as ITask[],
    cardArr: [],
    roleLv: 1,
    handIndex: 1,
    powerFreeUntil: 0,
    propCounts: {},
    base: createDefaultBase(),
    day: 1,
    phase: 'day',
    storySeen: [],
    storyRewardClaims: [],
    unlockedBuildings: [],
    blueprintStock: {},
    heroes: [],
    playMode,
    powerRecoverAt: Date.now(),
    timestamp: Date.now()
  };
}

/**
 * 格子能否承载合成物品（发射落点/合成奖励/背包取出/拖拽落点统一走这里）。
 * 规则：在网格内、无物品、基地格已认领、无建筑（含废墟）、无地形。
 */
export function canHostItem(state: IGameState, row: number, col: number): boolean {
  if (!inGrid(state.grid, row, col) || getItem(state.grid, row, col)) return false;
  const base = state.base;
  if (!base) return true;
  if (!isClaimed(base, row, col)) return false;
  if (buildingAt(base, row, col)) return false;
  if (terrainAt(base, row, col)) return false;
  return true;
}

/**
 * 产出落点（发射器 / 基地核心共用）：
 * 优先 (row,col) 周围九宫的可承载空格，否则全盘首个可承载空格；都没有返回 null。
 */
export function findHostCellNear(state: IGameState, row: number, col: number): IPoint | null {
  const canHost = (r: number, c: number) => canHostItem(state, r, c);
  const nine = getNineEmptyCells(state.grid, row, col, canHost);
  if (nine.length > 0) return nine[0];
  return findEmptyCell(state.grid, canHost);
}
