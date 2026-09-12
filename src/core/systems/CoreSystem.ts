import { GameEvents, eventBus } from '../events/EventBus';
import { IBuilding, IGameState, IPoint } from '../types';
import { findCoreBuilding } from '../model/Base';
import { findHostCellNear } from '../model/GameState';
import { forEachCell, setItem } from '../model/Grid';
import { createItemFromConfig } from '../model/Item';
import { applyCoreAura } from '../config/MergeCoreConfig';
import {
  CORE_GUIDE_HANDLES, CORE_MATERIAL_VALUE, CORE_LEVEL_MAX, clampCoreLevel, getCoreCdSecondsAt, getCorePropId,
  getCoreProductsAt, getCoreTimesAt, getCoreUpgradeCost, isCoreMaterial, isCoreMaxLevel
} from '../config/CoreConfig';
import { getProp } from '../config/PropConfig';
import { getConfigValue } from '../config/TableConfig';
import { getRandomByWeight, now } from '../utils/Common';
import { getText } from '../i18n';
import { EconomySystem } from './EconomySystem';

export interface ICoreSpawnResult {
  success: boolean;
  /** 产物落点 */
  newPos?: IPoint;
  /** 产物 id（已过核心光环） */
  productId?: number;
  /** 是否触发核心光环升一级 */
  upgraded?: boolean;
}

/**
 * 基地核心系统（原「合成核心」道具链的三作用统一到基地核心建筑上）
 *
 * - 发射：点击核心产出各链链首材料，库存/CD 与原核心链道具完全一致
 *   （库存 6~16 随等级、每次点击累加 CD、库存耗尽后等 CD 回满）；
 * - 升级：消耗夜战掉落的 60024 神秘零件 / 60025 核心残片（当量 1/2）提升等级；
 * - 光环与合成档次：见 MergeCoreConfig（读取核心等级）。
 *
 * 内核只做数值与状态，落点/动画由场景按事件驱动。
 */
export class CoreSystem {
  private economy: EconomySystem;

  constructor(economy: EconomySystem = new EconomySystem()) {
    this.economy = economy;
  }

  /** 取核心建筑并补全发射状态（旧存档、新增字段都走这里） */
  ensure(state: IGameState): IBuilding | null {
    const core = state.base ? findCoreBuilding(state.base) : null;
    if (!core) return null;
    const level = clampCoreLevel(core.level);
    if (core.level !== level) core.level = level;
    if (core.times === undefined || core.times === null) {
      core.times = getCoreTimesAt(level);
    }
    // 旧存档没记过核心点击次数：已过引导期（handIndex > 5）的一律视为已领过指定产出
    if (state.coreClickCount === undefined || state.coreClickCount === null) {
      state.coreClickCount = (state.handIndex ?? 1) > 5 ? CORE_GUIDE_HANDLES.length : 0;
    }
    return core;
  }

  /** 核心等级（1~6） */
  getLevel(state: IGameState): number {
    return clampCoreLevel(this.ensure(state)?.level);
  }

  /** 当前产出池 */
  products(state: IGameState): { id: number; weight: number }[] {
    return getCoreProductsAt(this.getLevel(state));
  }

  /** 是否处于冷却（库存耗尽，等 CD 回满） */
  inCd(state: IGameState): boolean {
    const core = this.ensure(state);
    return !!core && (core.cdSum ?? 0) > 0;
  }

  /** 剩余冷却毫秒（无冷却返回 0） */
  cdRemainMs(state: IGameState): number {
    const core = this.ensure(state);
    if (!core || !core.cd) return 0;
    return Math.max(0, core.cd - now());
  }

  /**
   * 点击核心发射一枚棋子。
   * 校验顺序与原发射器一致：库存 → 体力 → 落点；产出过核心光环（核心自身也吃光环）。
   */
  clickSpawn(state: IGameState): ICoreSpawnResult {
    const core = this.ensure(state);
    if (!core) return { success: false };
    const level = clampCoreLevel(core.level);
    const prop = getProp(getCorePropId(level));

    if ((core.cdSum ?? 0) > 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.cooling'));
      return { success: false };
    }
    if ((core.times ?? 0) <= 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.noUses'));
      return { success: false };
    }

    const powerFree = state.powerFreeUntil > now();
    const costPower = !prop?.noPower && !powerFree;
    if (costPower && state.resources.power <= 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.powerShort'));
      return { success: false };
    }

    const pos = findHostCellNear(state, core.row, core.col);
    if (!pos) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.boardFull'));
      return { success: false };
    }

    const pool = getCoreProductsAt(level);
    // 新手引导前两发走指定产出（不吃光环，保证引导链产物确定）
    const clickCount = state.coreClickCount ?? 0;
    const designated = clickCount < CORE_GUIDE_HANDLES.length;
    const rawId = designated
      ? CORE_GUIDE_HANDLES[clickCount]
      : (getRandomByWeight(pool)?.id ?? 0);
    if (rawId <= 0) return { success: false };
    state.coreClickCount = clickCount + 1;

    const aura = designated ? { id: rawId, upgraded: false } : applyCoreAura(state, rawId);
    if (aura.upgraded) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.coreResonance'));
    }

    if (costPower) {
      state.resources.power -= 1;
      eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'power', value: state.resources.power, delta: -1 });
    }

    core.times = (core.times ?? 0) - 1;
    const cdSeconds = getCoreCdSecondsAt(level);
    if (cdSeconds > 0) {
      core.cd = (core.cd || now()) + cdSeconds * 1000;
    }
    if ((core.times ?? 0) <= 0) {
      core.cdSum = Math.max(0, (core.cd ?? now()) - now());
    }

    const newItem = createItemFromConfig(aura.id, undefined, undefined, state);
    setItem(state.grid, pos.row, pos.col, newItem);
    eventBus.emit(GameEvents.BASE_CHANGED, { row: core.row, col: core.col });
    eventBus.emit(GameEvents.GRID_ITEM_SPAWNED, { source: { row: core.row, col: core.col }, newPositions: [pos], isAuto: false });

    return { success: true, newPos: pos, productId: aura.id, upgraded: aura.upgraded };
  }

  /** 500ms 心跳：核心 CD 到期 → 库存回满（与 SpawnSystem.tickBoard 的道具规则一致） */
  tick(state: IGameState): void {
    const core = this.ensure(state);
    if (!core) return;
    if (core.cd && now() >= core.cd) {
      delete core.cd;
      delete core.cdSum;
      core.times = getCoreTimesAt(clampCoreLevel(core.level));
      eventBus.emit(GameEvents.BASE_CHANGED, { row: core.row, col: core.col });
    }
  }

  /** 钻石跳过核心冷却（与道具跳过 CD 同价：每分钟 minuteCost 钻） */
  skipCd(state: IGameState): boolean {
    const core = this.ensure(state);
    if (!core || !core.cd) return false;
    const dt = core.cd - now();
    if (dt <= 0) return false;
    const minuteCost = getConfigValue('minuteCost', 24);
    const cost = Math.ceil(dt / 1000 / 60 / minuteCost);
    if (!this.economy.subResource(state, 'diamond', cost)) return false;
    core.cd = now();
    return true;
  }

  // ============ 升级 ============

  /** 棋盘 + 背包里的核心材料当量（60024=1、60025=2） */
  materialValue(state: IGameState): number {
    let total = 0;
    forEachCell(state.grid, item => {
      if (!item) return;
      if (isCoreMaterial(item.id)) total += CORE_MATERIAL_VALUE[item.id];
      if (item.roomArr) {
        for (const inner of item.roomArr) {
          if (inner && isCoreMaterial(inner.id)) total += CORE_MATERIAL_VALUE[inner.id];
        }
      }
    });
    return total;
  }

  /** 升到下一级所需当量（满级 0） */
  upgradeCost(state: IGameState): number {
    return getCoreUpgradeCost(this.getLevel(state));
  }

  isMaxLevel(state: IGameState): boolean {
    return isCoreMaxLevel(this.getLevel(state));
  }

  canUpgrade(state: IGameState): { ok: boolean; reason?: string } {
    const level = this.getLevel(state);
    if (isCoreMaxLevel(level)) return { ok: false, reason: getText('core.upgradeMaxed') };
    const cost = getCoreUpgradeCost(level);
    if (this.materialValue(state) < cost) {
      return { ok: false, reason: getText('core.upgradeNeedMaterial', { cost }) };
    }
    return { ok: true };
  }

  /** 消耗核心材料升级（材料从棋盘/背包扣除，低当量优先） */
  upgrade(state: IGameState): boolean {
    const core = this.ensure(state);
    if (!core) return false;
    const check = this.canUpgrade(state);
    if (!check.ok) {
      if (check.reason) eventBus.emit(GameEvents.TOAST_SHOW, check.reason);
      return false;
    }
    const level = clampCoreLevel(core.level);
    let remain = getCoreUpgradeCost(level);
    remain -= this.consumeMaterials(state, remain);
    if (remain > 0) return false; // 理论不可达，防御性处理

    core.level = Math.min(CORE_LEVEL_MAX, level + 1);
    // 升级顺带回满库存并清掉冷却，让玩家立刻能试新池
    delete core.cd;
    delete core.cdSum;
    core.times = getCoreTimesAt(core.level);
    eventBus.emit(GameEvents.BASE_CHANGED, { row: core.row, col: core.col });
    eventBus.emit(GameEvents.TOAST_SHOW, getText('core.upgraded', {
      level: core.level, name: getText('core.baseName')
    }));
    return true;
  }

  /** 按当量从棋盘 + 背包扣除材料，返回实际扣除的当量 */
  private consumeMaterials(state: IGameState, need: number): number {
    let consumed = 0;
    // 低当量优先：神秘零件(1) 先花，核心残片(2) 留作储备
    const order = Object.keys(CORE_MATERIAL_VALUE)
      .map(Number)
      .sort((a, b) => CORE_MATERIAL_VALUE[a] - CORE_MATERIAL_VALUE[b]);

    for (const matId of order) {
      const value = CORE_MATERIAL_VALUE[matId];
      forEachCell(state.grid, (item, row, col) => {
        if (consumed >= need || !item || item.id !== matId) return;
        setItem(state.grid, row, col, null);
        consumed += value;
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: { row, col }, item: null });
      });
      if (consumed >= need) return consumed;

      // 背包内材料（背包自身是棋盘上的 id=401 物品）
      forEachCell(state.grid, (bagItem, row, col) => {
        if (consumed >= need || !bagItem?.roomArr) return;
        let changed = false;
        for (let i = 0; i < bagItem.roomArr.length; i++) {
          if (consumed >= need) break;
          const inner = bagItem.roomArr[i];
          if (!inner || inner.id !== matId) continue;
          bagItem.roomArr[i] = null;
          consumed += value;
          changed = true;
        }
        if (changed) {
          eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: { row, col }, item: bagItem });
          eventBus.emit(GameEvents.BAG_UPDATED, {});
        }
      });
      if (consumed >= need) return consumed;
    }
    return consumed;
  }

  /** 背包/棋盘的单个材料数量（UI 展示用） */
  materialCounts(state: IGameState): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const id of Object.keys(CORE_MATERIAL_VALUE).map(Number)) counts[id] = 0;
    forEachCell(state.grid, item => {
      if (!item) return;
      if (counts[item.id] !== undefined) counts[item.id] += 1;
      if (item.roomArr) {
        for (const inner of item.roomArr) {
          if (inner && counts[inner.id] !== undefined) counts[inner.id] += 1;
        }
      }
    });
    return counts;
  }
}
