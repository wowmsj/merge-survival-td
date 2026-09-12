/**
 * 基地核心配置（原「合成核心」三作用统一挂到基地核心建筑上）
 *
 * 基地核心 = 合成核心 = 发射器：
 *   1. 核心光环：全场发射器产出概率升一级（5% → 30%）；
 *   2. 合成权限：物品链分三档，钢铁/科技档合成需要核心等级；
 *   3. 核心发射器：点击核心产出各链链首材料（夜战不掉链首）。
 *
 * 等级 1~6 与旧核心链道具 60026~60031 一一对应：库存/CD/产出池/光环/档次
 * 全部仍从 prop_prop.json 原表读取（数值不动），玩家用夜战掉落的
 * 60024 神秘零件 / 60025 核心残片点核心升级，不再需要把核心道具摆到棋盘上。
 */

import { getClickProducts, getProp } from './PropConfig';

/** 核心最高等级（原 60026 基座 ~ 60031 完整核心 共 6 级） */
export const CORE_LEVEL_MAX = 6;

/** 等级 → 旧核心链道具 id（库存/CD/产出池/名称/图标的唯一来源） */
export const CORE_LEVEL_PROP: Record<number, number> = {
  1: 60026,
  2: 60027,
  3: 60028,
  4: 60029,
  5: 60030,
  6: 60031
};

/** 等级 → 核心光环（全场发射器产出升一级的概率） */
export const CORE_AURA_BY_LEVEL: Record<number, number> = {
  1: 0.05,
  2: 0.10,
  3: 0.15,
  4: 0.20,
  5: 0.25,
  6: 0.30
};

/** 等级 → 合成权限档次（0 普通档 / 1 钢铁档 / 2 科技档） */
export const CORE_TIER_BY_LEVEL: Record<number, number> = {
  1: 0,
  2: 1,
  3: 1,
  4: 2,
  5: 2,
  6: 2
};

/**
 * 升级到该等级需要的「核心材料当量」。
 * 沿用旧链条的工作量：核心残片 60025 = 2 个神秘零件 60024，
 * 旧规则下每升一级要多合一次（2 合 1），故 8/16/32/64/128。
 */
export const CORE_UPGRADE_COST: Record<number, number> = {
  2: 8,
  3: 16,
  4: 32,
  5: 64,
  6: 128
};

/** 核心升级材料 id → 当量 */
export const CORE_MATERIAL_VALUE: Record<number, number> = {
  60024: 1,
  60025: 2
};

/** 是否核心升级材料（夜战掉落 + 两两合成，永不落地的养成材料） */
export function isCoreMaterial(id: number): boolean {
  return CORE_MATERIAL_VALUE[id] !== undefined;
}

/**
 * 新手引导的前两发指定产出（原核心基座道具的 clickPropId=[10001,10001]）：
 * 新开局点核心必定先出两个工具箱把手，让「合成 → 任务 → 第一座塔」的引导链可确定推进。
 */
export const CORE_GUIDE_HANDLES: number[] = [10001, 10001];

/** 核心等级钳制到 1~6（旧存档/异常数据兜底） */
export function clampCoreLevel(level: number | undefined): number {
  const n = Math.floor(level ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(CORE_LEVEL_MAX, n);
}

/** 该等级对应的旧核心道具 id（图标/名称/数值来源） */
export function getCorePropId(level: number): number {
  return CORE_LEVEL_PROP[clampCoreLevel(level)];
}

/** 该等级的点击库存（原 prop times） */
export function getCoreTimesAt(level: number): number {
  return getProp(getCorePropId(level))?.times ?? 0;
}

/** 该等级每次点击累加的 CD（秒，原 prop milo） */
export function getCoreCdSecondsAt(level: number): number {
  return getProp(getCorePropId(level))?.milo ?? 0;
}

/** 该等级的光环概率 */
export function getCoreAuraAt(level: number): number {
  return CORE_AURA_BY_LEVEL[clampCoreLevel(level)] ?? 0;
}

/** 该等级的合成权限档次 */
export function getCoreTierAt(level: number): number {
  return CORE_TIER_BY_LEVEL[clampCoreLevel(level)] ?? 0;
}

/** 该等级的点击产出池（原 prop atom/matic 权重表） */
export function getCoreProductsAt(level: number): { id: number; weight: number }[] {
  return getClickProducts(getCorePropId(level));
}

/** 该等级是否已满级 */
export function isCoreMaxLevel(level: number): boolean {
  return clampCoreLevel(level) >= CORE_LEVEL_MAX;
}

/** 从 level 升到 level+1 需要的核心材料当量（满级返回 0） */
export function getCoreUpgradeCost(level: number): number {
  return CORE_UPGRADE_COST[clampCoreLevel(level) + 1] ?? 0;
}
