/**
 * 建筑合成模式映射配置
 * 定义哪些物资合成链在建筑模式下产出建筑，以及产物对应关系
 */

import { getMergeChain } from './PropConfig';

/** 建筑合成映射：链尾物品 id → 建筑 cfgId */
export const BUILDING_MERGE_MAP: Record<number, number> = {
  30076: 101, // 军用步枪 → 箭塔
  30023: 401, // 感应手环 → 木墙
  50036: 303, // 大废料袋 → 减速沼泽
  30007: 207, // 满载推车 → 收集站
  20010: 104, // 双门冷藏库 → 冰冻塔
  50010: 103, // 哨卫机器人 → 电磁塔
  10011: 210, // 维修工作台 → 维修站
  10025: 102, // 气动枪 → 炮塔
};

/** 建筑模式下可用的合成链首物品 id（从这些物品开始合成的链会产出建筑） */
export const BUILDING_CHAIN_HEADS: number[] = Object.keys(BUILDING_MERGE_MAP).map(id => {
  const chain = getMergeChain(Number(id));
  return chain[0];
});

/** 建筑模式下禁用的物品 id 集合（不在任何建筑链上的物资） */
const BUILDING_ALLOWED_ITEMS = new Set<number>();
for (const tailId of Object.keys(BUILDING_MERGE_MAP).map(Number)) {
  for (const id of getMergeChain(tailId)) {
    BUILDING_ALLOWED_ITEMS.add(id);
  }
}

/** 物品在建筑模式下是否允许出现（在任一建筑链上） */
export function isItemAllowedInBuildMode(id: number): boolean {
  return BUILDING_ALLOWED_ITEMS.has(id);
}

/** 物品是否是建筑合成链的链尾（可产出建筑） */
export function isBuildingChainTail(id: number): boolean {
  return id in BUILDING_MERGE_MAP;
}

/** 建筑合成链尾 id → 建筑 cfgId */
export function getBuildingByMergeTail(tailId: number): number | undefined {
  return BUILDING_MERGE_MAP[tailId];
}
