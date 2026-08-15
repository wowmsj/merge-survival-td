import { GameEvents, eventBus } from '../events/EventBus';
import { getHeroLevel } from '../config/TableConfig';
import { IGameState } from '../types';
import { EconomySystem } from './EconomySystem';

/**
 * 玩家等级系统（对应源项目 herolevel_table.json 升级发奖）
 * - 经验来源：每次合成 +1 exp（MergeSystem 注入调用）
 * - lv 级累积 exp 满（约 5×lv+15 线性）即升到 lv+1，可连升
 * - 升级奖励 = 新等级那行的 reward（宝箱/手提包组合 [道具id, 数量][]）：
 *   投放到棋盘首个空格，棋盘满时进卡片列表（giveItemToBoardOrCard）
 * - Lv1 的 reward（2001 简易工具箱）不补发：初始棋盘已按定制布局给了工具箱发射器
 */
export class LevelSystem {
  private economy: EconomySystem;

  constructor(economy: EconomySystem) {
    this.economy = economy;
  }

  /** 加经验并结算升级（返回升了几级） */
  addExp(state: IGameState, num: number): number {
    if (num <= 0) return 0;
    state.resources.exp += num;
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'exp', value: state.resources.exp, delta: num });

    let ups = 0;
    let row = getHeroLevel(state.roleLv);
    while (row && state.resources.exp >= row.exp) {
      state.resources.exp -= row.exp;
      state.roleLv++;
      ups++;
      const newLevel = state.roleLv;
      const rewardRow = getHeroLevel(newLevel);
      const rewards = rewardRow ? rewardRow.reward : [];
      this.grantRewards(state, rewards);
      eventBus.emit(GameEvents.ROLE_LEVEL_UP, { level: newLevel, rewards });
      row = getHeroLevel(state.roleLv);
    }
    return ups;
  }

  /** 发放升级奖励：优先棋盘空格，满则进卡片列表（GRID_ITEM_SPAWNED 由 giveItemToBoardOrCard 内部发出） */
  private grantRewards(state: IGameState, rewards: [number, number][]): void {
    for (const [propId, num] of rewards) {
      if ((propId >= 1003 && propId <= 1006) || (propId >= 70001 && propId <= 70168)) continue;
      for (let i = 0; i < num; i++) {
        this.economy.giveItemToBoardOrCard(state, propId);
      }
    }
  }
}
