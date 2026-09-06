import { IGameState } from '../types';
import { forEachCell } from '../model/Grid';
import { getMergeNextId } from './PropConfig';

/**
 * 合成核心光环：棋盘上的核心装置（60026 核心基座起）让全场发射器产出概率升一级。
 * 外婆的核心越完整，共鸣越强——夜战掉落核心材料，合成升级核心，核心反哺合成。
 */
export const CORE_AURA: Record<number, number> = {
  60026: 0.05,
  60027: 0.10,
  60028: 0.15,
  60029: 0.20,
  60030: 0.25,
  60031: 0.30
};

/** 棋盘上最高级核心装置对应的光环概率（无核心为 0） */
export function getCoreAuraChance(state: IGameState): number {
  let chance = 0;
  forEachCell(state.grid, item => {
    if (!item) return;
    const c = CORE_AURA[item.id];
    if (c && c > chance) chance = c;
  });
  return chance;
}

/**
 * 物资档次：0 普通 / 1 钢铁 / 2 科技。
 * 合成高档物品需要棋盘上的核心装置达到对应等级（外婆的核心决定你能造什么）。
 * 未列出的 id 一律视为普通档：工具/净水/口粮/药品/拾荒/种植/猫鼠/孤品/核心/蓝图链。
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

/** 各档次解锁所需的最低核心装置 id（toast/简介展示用） */
export const TIER_CORE_REQUIREMENT: Record<number, number> = { 1: 60027, 2: 60029 };

/** 合成核心链道具（60024 神秘零件 ~ 60031 完整核心） */
export function isCoreChainItem(id: number): boolean {
  return id >= 60024 && id <= 60031;
}

/** 物品的物资档次（0 普通 / 1 钢铁 / 2 科技） */
export function getItemTier(id: number): number {
  for (const r of TIER_RANGES) {
    if (id >= r.min && id <= r.max) return r.tier;
  }
  return 0;
}

/** 棋盘上最高核心装置对应的合成权限档次（无核心/基座=0，原型/TG-I=1，二型及以上=2） */
export function getCoreTier(state: IGameState): number {
  let best = 0;
  forEachCell(state.grid, item => {
    if (!item) return;
    const id = item.id;
    if (id >= 60029 && id <= 60031) best = Math.max(best, 2);
    else if (id === 60027 || id === 60028) best = Math.max(best, 1);
  });
  return best;
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
