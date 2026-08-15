import { IGameState, IGrid, IResource, ITask } from '../types';
import { createGrid } from './Grid';
import { createDefaultBase } from './Base';
import { getConfigValue } from '../config/TableConfig';

/** 棋盘尺寸：9 行 × 7 列（与源项目一致，竖屏） */
export const DEFAULT_GRID_ROWS = 9;
export const DEFAULT_GRID_COLS = 7;

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

export function createInitialGameState(): IGameState {
  return {
    language: 'zh-CN',
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
    timestamp: Date.now()
  };
}
