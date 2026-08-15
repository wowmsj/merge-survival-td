import { GameEvents, eventBus } from '../events/EventBus';
import { IBaseState, IBuilding, IGameState, IResource } from '../types';
import { buildingAt, claimAround, createDefaultBase, hasKillCorridor, isClaimed } from '../model/Base';
import {
  getBuildingConfig, getUpgradeCostCoin, getDemolishRefundCoin, getRepairCostCoin,
  hpAtLevel, outputIntervalAtLevel, outputAmountAtLevel, isBuildingUnlocked,
  capResourceKeys, capAmountAtLevel, providePowerAtLevel,
  MaterialCost, ProductionResult, ResourceOutput
} from '../config/BuildingConfig';
import { EconomySystem } from './EconomySystem';
import { getBuildingName, getPropName, getText } from '../i18n';

/** 离线产出累积上限（秒），超过不再累积 */
export const PRODUCE_ACCUM_CAP = 4 * 3600;

/**
 * 电力信息：所有已建发电设施都稳定提供其配置容量。
 *   used = 非发电机建筑按摆放顺序累计 needPower（总需求）
 */
export function getPowerInfo(state: IGameState, _now: number = Date.now()): { used: number; cap: number } {
  const base = state.base;
  if (!base || !Array.isArray(base.buildings)) return { used: 0, cap: 0 };
  let cap = 0;
  let used = 0;
  for (const b of base.buildings) {
    const cfg = getBuildingConfig(b.cfgId);
    if (!cfg) continue;
    if (cfg.providePower) {
      cap += providePowerAtLevel(cfg, b.level);
    } else {
      used += cfg.needPower ?? 0;
    }
  }
  return { used, cap };
}

/**
 * 供电判定（纯函数，NightSystem 复用）：
 * 按摆放顺序累计非发电机建筑的 needPower，累计值 ≤ 供电容量的建筑为「供电正常」，
 * 否则「缺电」停摆（资源建筑不产出、塔不开火）。
 * 发电机自身和 needPower = 0 的建筑（城墙/陷阱/核心）不参与累计，且永远供电正常，
 * 不会被前面缺电的建筑连带标成缺电。
 */
export function isBuildingPowered(state: IGameState, building: IBuilding, now: number = Date.now()): boolean {
  const base = state.base;
  if (!base || !Array.isArray(base.buildings)) return true;
  const cap = getPowerInfo(state, now).cap;
  let cumulative = 0;
  for (const b of base.buildings) {
    const cfg = getBuildingConfig(b.cfgId);
    if (!cfg || cfg.providePower) continue; // 发电机自身恒供电正常
    const need = cfg.needPower ?? 0;
    if (b === building) {
      if (need === 0) return true;
      return cumulative + need <= cap;
    }
    cumulative += need;
  }
  return true;
}

/**
 * 夜战供电判定：防御塔优先于资源建筑。
 * 夜晚资源建筑不产出，电力先保火力——塔只在「排在它之前的塔」之后累计 needPower。
 */
export function isTowerPoweredAtNight(state: IGameState, building: IBuilding, now: number = Date.now()): boolean {
  const base = state.base;
  if (!base || !Array.isArray(base.buildings)) return true;
  const cap = getPowerInfo(state, now).cap;
  let cumulative = 0;
  for (const b of base.buildings) {
    const cfg = getBuildingConfig(b.cfgId);
    if (cfg?.kind !== 'tower') continue;
    const need = cfg.needPower ?? 0;
    if (b === building) {
      if (need === 0) return true;
      return cumulative + need <= cap;
    }
    cumulative += need;
  }
  return true;
}

/** 行动力消耗：升级（SURVIVAL_BUILD_DESIGN.md 6.2）；建造/修复不消耗行动力（修复改收金币） */
export const AP_COST_UPGRADE = 2;

const TUTORIAL_ARROW_TOWER = 101;
const TUTORIAL_TOWER_PENDING = 14;
const TUTORIAL_POWER_EMITTER = 70007;
const TUTORIAL_POWER_EMITTER_STAGE = 15;

/** 格式化材料增量为「装修手套+1」（产出/战利品飘字用） */
export function formatGains(gains: MaterialCost): string {
  return Object.entries(gains)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${getPropName(Number(id))}+${n}`)
    .join(' ') || getText('base.none');
}

/** 格式化基础资源增量为「药品+10 废料+5」 */
export function formatResourceGains(resources: ResourceOutput): string {
  return Object.entries(resources)
    .filter(([, n]) => n && n > 0)
    .map(([k, n]) => `${getText(`resource.${k}`)}+${n}`)
    .join(' ') || getText('base.none');
}

/**
 * 基地系统
 * 摆放规则（SURVIVAL_BUILD_DESIGN.md 3.3 的简化版，道路机制第三期再接）：
 *   防御塔 → 外圈两环；资源建筑 → 内圈；城墙/陷阱 → 任意空格；核心固定中央
 * 建造消耗金币（黑市交易货币）；升级消耗金币 + 行动力 + 1 张重复蓝图（blueprintStock）
 */
export class BaseSystem {
  private economy: EconomySystem;

  constructor(economy: EconomySystem) {
    this.economy = economy;
  }

  /** 确保 state.base 存在（旧存档兼容） */
  ensure(state: IGameState): IBaseState {
    if (!state.base || !Array.isArray(state.base.buildings)) state.base = createDefaultBase();
    return state.base;
  }

  /** 建筑是否供电正常（见 isBuildingPowered） */
  isPowered(state: IGameState, building: IBuilding): boolean {
    return isBuildingPowered(state, building);
  }

  /** 核心建筑 */
  getCore(state: IGameState): IBuilding {
    const base = this.ensure(state);
    return base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core')!;
  }

  /** 该格能否摆放 cfgId；不可返回原因文案 */
  canPlace(state: IGameState, cfgId: number, row: number, col: number): { ok: boolean; reason?: string } {
    const cfg = getBuildingConfig(cfgId);
    if (!cfg || cfg.kind === 'core') return { ok: false, reason: getText('toast.buildingNotBuildable') };
    if (!isBuildingUnlocked(state, cfgId)) {
      const bpName = cfg.blueprint ? getPropName(cfg.blueprint) : getText('base.blueprint');
      return { ok: false, reason: getText('toast.buildingLocked', { blueprint: bpName }) };
    }
    const base = this.ensure(state);
    if (row < 0 || row >= base.rows || col < 0 || col >= base.cols) return { ok: false, reason: getText('toast.outOfBase') };
    if (buildingAt(base, row, col)) return { ok: false, reason: getText('toast.cellOccupied') };

    if (!isClaimed(base, row, col)) return { ok: false, reason: getText('toast.expandTerritory') };
    if (cfg.kind !== 'trap' && !hasKillCorridor(base, { row, col })) {
      return { ok: false, reason: getText('toast.killCorridor') };
    }

    if (state.resources.coin < cfg.costCoin) {
      return { ok: false, reason: getText('toast.notEnoughCoinsBuild', { coins: cfg.costCoin }) };
    }
    return { ok: true };
  }

  /** 摆放建筑（只扣金币，不消耗行动力） */
  place(state: IGameState, cfgId: number, row: number, col: number): boolean {
    const check = this.canPlace(state, cfgId, row, col);
    if (!check.ok) {
      eventBus.emit(GameEvents.TOAST_SHOW, check.reason || getText('toast.cannotBuild'));
      return false;
    }
    const cfg = getBuildingConfig(cfgId)!;

    state.resources.coin -= cfg.costCoin;

    const hp = hpAtLevel(cfg, 1);
    const building: IBuilding = { cfgId, level: 1, hp, maxHp: hp, row, col };
    if (cfg.kind === 'resource') building.lastProduceAt = Date.now();
    this.ensure(state).buildings.push(building);
    if (cfg.claimRadius) claimAround(this.ensure(state), row, col, cfg.claimRadius);
    this.applyCapChange(state, cfg, 1);
    if (cfg.id === TUTORIAL_ARROW_TOWER && state.handIndex === TUTORIAL_TOWER_PENDING) {
      if (!state.cardArr.includes(TUTORIAL_POWER_EMITTER)) this.economy.addPropNum(state, TUTORIAL_POWER_EMITTER);
      state.handIndex = TUTORIAL_POWER_EMITTER_STAGE;
    }
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'coin', value: state.resources.coin, delta: -cfg.costCoin });
    eventBus.emit(GameEvents.BASE_CHANGED, { row, col });
    eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.buildComplete', { building: getBuildingName(cfg.id) }));
    return true;
  }

  /** 升级建筑 */
  upgrade(state: IGameState, row: number, col: number): boolean {
    const base = this.ensure(state);
    const building = buildingAt(base, row, col);
    const cfg = building && getBuildingConfig(building.cfgId);
    if (!building || !cfg) return false;
    if (cfg.kind === 'core') {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.coreUpgradeLocked'));
      return false;
    }
    const costCoin = getUpgradeCostCoin(building.cfgId, building.level);
    if (costCoin <= 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.maxLevel'));
      return false;
    }

    // 升级需要一张重复蓝图（已解锁建筑再次使用蓝图时入库）
    const stock = state.blueprintStock?.[cfg.id] ?? 0;
    if (stock < 1) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.needBlueprint', { building: getBuildingName(cfg.id) }));
      return false;
    }

    if (!this.economy.usePower(state, AP_COST_UPGRADE)) return false;

    if (state.resources.coin < costCoin) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.notEnoughCoinsUpgrade', { coins: costCoin }));
      return false;
    }

    state.resources.coin -= costCoin;
    state.blueprintStock[cfg.id] = stock - 1;

    building.level++;
    const newMax = hpAtLevel(cfg, building.level);
    // 升级按上限差额补血
    building.hp += newMax - building.maxHp;
    building.maxHp = newMax;
    this.applyCapChange(state, cfg, 1);
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'coin', value: state.resources.coin, delta: -costCoin });
    eventBus.emit(GameEvents.BASE_CHANGED, { row, col });
    eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.buildingUpgraded', { building: getBuildingName(cfg.id), level: building.level }));
    return true;
  }

  /** 修复受损建筑（回满血，消耗金币 = 造价一半 × 损坏比例，白天操作） */
  repair(state: IGameState, row: number, col: number): boolean {
    const base = this.ensure(state);
    const building = buildingAt(base, row, col);
    if (!building) return false;
    if (building.hp >= building.maxHp) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.buildingIntact'));
      return false;
    }
    const costCoin = getRepairCostCoin(building.cfgId, building.hp, building.maxHp);
    if (state.resources.coin < costCoin) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.notEnoughCoinsRepair', { coins: costCoin }));
      return false;
    }
    state.resources.coin -= costCoin;
    building.hp = building.maxHp;
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'coin', value: state.resources.coin, delta: -costCoin });
    eventBus.emit(GameEvents.BASE_CHANGED, { row, col });
    eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.repairComplete', { coins: costCoin }));
    return true;
  }

  /** 拆除建筑（返还 50% 金币），核心不可拆 */
  demolish(state: IGameState, row: number, col: number): boolean {
    const base = this.ensure(state);
    const building = buildingAt(base, row, col);
    const cfg = building && getBuildingConfig(building.cfgId);
    if (!building || !cfg) return false;
    if (cfg.kind === 'core') {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.cannotDemolishCore'));
      return false;
    }
    const refundCoin = getDemolishRefundCoin(building.cfgId);
    this.applyCapChange(state, cfg, -building.level);
    if (refundCoin > 0) this.economy.addResource(state, 'coin', refundCoin);
    base.buildings = base.buildings.filter(b => b !== building);
    eventBus.emit(GameEvents.BASE_CHANGED, { row, col });
    eventBus.emit(GameEvents.TOAST_SHOW,
      refundCoin > 0
        ? getText('toast.demolishedRefund', { building: getBuildingName(cfg.id), coins: refundCoin })
        : getText('toast.demolished', { building: getBuildingName(cfg.id) }));
    return true;
  }

  /**
   * 容量建筑：放置/升级/拆除时同步改变资源上限。
   * deltaLevel 为正表示增加上限，负表示扣除上限；上限下降时当前资源 clamp 到上限。
   */
  private applyCapChange(state: IGameState, cfg: ReturnType<typeof getBuildingConfig>, deltaLevel: number): void {
    if (!cfg || !cfg.capResource || !cfg.capAmount || deltaLevel === 0) return;
    const keys = capResourceKeys(cfg);
    if (keys.length === 0) return;
    const amount = capAmountAtLevel(cfg, Math.abs(deltaLevel)) * Math.sign(deltaLevel);
    for (const key of keys) {
      const cur = (state.resources[key] || 0) as number;
      const next = Math.max(0, cur + amount);
      state.resources[key] = next as any;
      // 如果上限下降，对应当前资源同步 clamp 到上限
      const resKey = key.replace('Max', '') as keyof IResource;
      if (typeof state.resources[resKey] === 'number') {
        state.resources[resKey] = Math.min(state.resources[resKey] as number, next) as any;
      }
    }
  }

  /**
   * 资源建筑产出结算：
   *   - 产出池建筑（收集站）每间隔产出 1 份低级合成材料，发到棋盘（棋盘满进卡片）
   *   - 基础资源建筑每间隔产出指定资源，受对应上限限制
   * 离线也生效（时间戳制），累积上限 PRODUCE_ACCUM_CAP
   * @returns 本次实际获得的材料 + 基础资源
   */
  tickProduction(state: IGameState, now: number = Date.now()): ProductionResult {
    const base = this.ensure(state);
    const items: MaterialCost = {};
    const resources: ResourceOutput = {};
    for (const b of base.buildings) {
      const cfg = getBuildingConfig(b.cfgId);
      if (!cfg || cfg.kind !== 'resource') continue;
      // 缺电的资源建筑不产出，且不推进 lastProduceAt（等通电了再接着产，不吞离线时间）
      if (!isBuildingPowered(state, b, now)) continue;
      const hasOutput = cfg.outputPool && cfg.outputPool.length > 0;
      const hasResource = cfg.outputResource && cfg.outputAmount;
      if (!hasOutput && !hasResource) continue;
      const interval = outputIntervalAtLevel(cfg, b.level);
      if (interval <= 0) continue;
      if (!b.lastProduceAt) b.lastProduceAt = now;
      const elapsed = Math.min(now - b.lastProduceAt, PRODUCE_ACCUM_CAP * 1000);
      const cycles = Math.floor(elapsed / (interval * 1000));
      if (cycles <= 0) continue;
      b.lastProduceAt += cycles * interval * 1000;

      // 低级合成材料产出（发到棋盘，棋盘满进卡片）
      if (hasOutput) {
        for (let i = 0; i < cycles; i++) {
          const id = cfg.outputPool![Math.floor(Math.random() * cfg.outputPool!.length)];
          items[id] = (items[id] || 0) + 1;
          this.economy.giveItemToBoardOrCard(state, id);
        }
      }

      // 基础资源产出（受上限限制，满上限后不再累积）
      if (hasResource) {
        const type = cfg.outputResource!;
        const maxKey = `${type}Max` as keyof IResource;
        const max = (state.resources[maxKey] || 0) as number;
        const current = (state.resources[type] || 0) as number;
        const perCycle = outputAmountAtLevel(cfg, b.level);
        const maxAdd = Math.max(0, max - current);
        const totalAdd = Math.min(cycles * perCycle, maxAdd);
        if (totalAdd > 0) {
          this.economy.addResource(state, type, totalAdd);
          resources[type] = (resources[type] || 0) + totalAdd;
        }
      }
    }
    return { items, resources };
  }
}
