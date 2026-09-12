import { IGameState } from '../types';
import { findCoreBuilding } from '../model/Base';
import { getMergeNextId } from './PropConfig';
import { clampCoreLevel, getCoreAuraAt, getCorePropId, getCoreTierAt } from './CoreConfig';

/**
 * 合成核心（= 基地核心建筑）的三个作用：
 *   1. 光环：全场发射器/收集站产出概率升一级；
 *   2. 合成权限：物品链分三档，钢铁/科技档需要核心等级；
 *   3. 发射器：点击核心发射各链链首材料（见 systems/CoreSystem）。
 *
 * 核心等级存在基地核心建筑上（IBuilding.level，1~6），数值表见 CoreConfig。
 */

/** 基地核心等级（旧存档/异常数据兜底为 1） */
export function getCoreLevel(state: IGameState): number {
  const core = state.base ? findCoreBuilding(state.base) : null;
  return clampCoreLevel(core?.level);
}

/** 当前核心光环概率（产出升一级） */
export function getCoreAuraChance(state: IGameState): number {
  return getCoreAuraAt(getCoreLevel(state));
}

/**
 * 物资档次：0 普通 / 1 钢铁 / 2 科技。
 * 合成高档物品需要基地核心达到对应等级（核心决定你能造什么）。
 * 未列出的 id 一律视为普通档：工具/净水/口粮/药品/拾荒/种植/猫鼠/孤品/核心材料/蓝图链。
 */
const TIER_RANGES: { min: number; max: number; tier: number }[] = [
  // 钢铁档：物资推车/废铁/防御材料/手册技能/远征/武器/手办/机器人/废料/电源
  { min: 20030, max: 20040, tier: 1 },
  { min: 20041, max: 20058, tier: 1 },
  { min: 20065, max: 20077, tier: 1 },
  { min: 30067, max: 30082, tier: 1 },
  { min: 50001, max: 50016, tier: 1 },
  { min: 60001, max: 60007, tier: 1 },
  // 科技档：无线电/遗物/拆解器/超频器/芯片（U盘终端链 30055~30066 已放开为普通档）
  { min: 20059, max: 20064, tier: 2 },
  { min: 60008, max: 60020, tier: 2 }
];

/** 各档次解锁所需的核心等级（toast/简介展示用） */
export const TIER_CORE_LEVEL: Record<number, number> = { 1: 2, 2: 4 };

/** 该档次需要的核心名称（toast 用，如「合成核心原型」） */
export function getTierCoreName(tier: number): number {
  return getCorePropId(TIER_CORE_LEVEL[tier] ?? 1);
}

/** 物品的物资档次（0 普通 / 1 钢铁 / 2 科技） */
export function getItemTier(id: number): number {
  for (const r of TIER_RANGES) {
    if (id >= r.min && id <= r.max) return r.tier;
  }
  return 0;
}

/** 当前核心提供的合成权限档次 */
export function getCoreTier(state: IGameState): number {
  return getCoreTierAt(getCoreLevel(state));
}

/**
 * 发射器/收集站产出过一遍核心光环：命中且该道具还能再合成（非链顶）则升一级。
 * 返回升级后的 id 与是否命中（命中时调用方弹「核心共鸣」提示）。
 */
export function applyCoreAura(
  state: IGameState,
  id: number,
  rng: () => number = Math.random
): { id: number; upgraded: boolean } {
  if (id <= 0) return { id, upgraded: false };
  const chance = getCoreAuraChance(state);
  if (chance <= 0 || rng() >= chance) return { id, upgraded: false };
  const next = getMergeNextId(id);
  if (!next) return { id, upgraded: false };
  return { id: next, upgraded: true };
}
