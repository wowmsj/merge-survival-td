/**
 * 地形配置表访问层（docs/地图地形改造方案.md）
 * 地形是格子属性（IBaseTile.terrain），不进 buildings[]：无 hp、不耗电、不可被僵尸拆。
 * 布局见 data/terrain.json；中央 7×7（已认领区）保持平地，地形只铺外圈。
 */

import { IBaseState, TerrainKind } from '../types';
import terrainJson from './data/terrain.json';

export interface ITerrainCell {
  row: number;
  col: number;
  kind: TerrainKind;
}

/** 初始地形布局表 */
export const TERRAIN_TABLE = terrainJson as ITerrainCell[];

/** 清除地形金币价格：杂草 50 / 瓦砾 100 / 破旧建筑 300 / 树林 400 / 水池 800 */
export const TERRAIN_CLEAR_COST: Record<TerrainKind, number> = {
  grass: 50,
  rubble: 100,
  shack: 300,
  woods: 400,
  pond: 800
};

/** 取某格地形（无 = null） */
export function terrainAt(base: IBaseState, row: number, col: number): TerrainKind | null {
  return base.tiles?.[row]?.[col]?.terrain ?? null;
}

/** 地面僵尸可否通行：杂草/树林可过，瓦砾/破旧建筑/水池阻挡 */
export function isTerrainWalkableForGround(kind: TerrainKind): boolean {
  return kind === 'grass' || kind === 'woods';
}

/** 钻地（潜行）僵尸可否穿过：只有水池不行 */
export function isTerrainPassableForBurrow(kind: TerrainKind): boolean {
  return kind !== 'pond';
}

/** 边缘格有该地形时是否可刷怪：杂草/树林可以（从林中爬出），其余堵住不刷 */
export function isTerrainSpawnable(kind: TerrainKind): boolean {
  return kind === 'grass' || kind === 'woods';
}
