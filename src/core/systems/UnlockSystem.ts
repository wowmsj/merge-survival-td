import { GameEvents, eventBus } from '../events/EventBus';
import { IGameState, IPoint } from '../types';
import { getBuildableList, getBlueprintBuilding, IBuildingConfig } from '../config/BuildingConfig';
import { getItem, setItem } from '../model/Grid';

/**
 * 建筑蓝图解锁系统（无状态纯函数集合）
 *
 * 蓝图语义：最终蓝图（Lv4，building.json 的 blueprint 字段）是「点击使用」道具——
 * 合成出来只是拿到蓝图，选中后再次点击（或 InfoBar「使用」按钮）消耗蓝图，
 * 永久解锁对应建筑。解锁后同建筑再次建造只花金币/材料，无需再合蓝图。
 */

export interface IUseBlueprintResult {
  cfg: IBuildingConfig;
  /** 是否本次新解锁（false = 建筑此前已解锁，蓝图收入 blueprintStock 作升级材料） */
  fresh: boolean;
}

/**
 * 使用最终蓝图：消耗棋盘 pos 处的蓝图道具并解锁对应建筑。
 * pos 处不是最终蓝图返回 null。
 * 建筑已解锁时（fresh=false）：蓝图不浪费，收入 blueprintStock 作为该建筑的升级材料。
 */
export function useBlueprint(state: IGameState, pos: IPoint): IUseBlueprintResult | null {
  const item = getItem(state.grid, pos.row, pos.col);
  if (!item) return null;
  const cfg = getBlueprintBuilding(item.id);
  if (!cfg) return null;
  if (!Array.isArray(state.unlockedBuildings)) state.unlockedBuildings = [];
  const fresh = !state.unlockedBuildings.includes(cfg.id);
  if (fresh) {
    state.unlockedBuildings.push(cfg.id);
  } else {
    if (!state.blueprintStock) state.blueprintStock = {};
    state.blueprintStock[cfg.id] = (state.blueprintStock[cfg.id] ?? 0) + 1;
  }
  setItem(state.grid, pos.row, pos.col, null);
  // 先写入解锁再发事件：监听器（如新手引导）需要在事件里读到最新解锁状态
  eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: null });
  return { cfg, fresh };
}

/**
 * 旧存档兜底：unlockedBuildings 字段缺失时，
 * 把已摆放在基地里、且需要蓝图的建筑 cfgId 全部视为已解锁（兼容老档）。
 * 返回是否进行了补齐。
 */
export function ensureUnlockedBuildings(state: IGameState): boolean {
  if (Array.isArray(state.unlockedBuildings)) return false;
  const placed = new Set<number>();
  if (state.base && Array.isArray(state.base.buildings)) {
    for (const b of state.base.buildings) placed.add(b.cfgId);
  }
  state.unlockedBuildings = getBuildableList()
    .filter(cfg => cfg.blueprint && placed.has(cfg.id))
    .map(cfg => cfg.id);
  return true;
}
