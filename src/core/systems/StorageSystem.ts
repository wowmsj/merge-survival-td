import { IGameState } from '../types';
import { createDefaultResources } from '../model/GameState';
import { createDefaultBase, createDefaultTiles, initialEastRuinCells } from '../model/Base';
import { RUIN_ID } from '../config/BuildingConfig';
import { ensureUnlockedBuildings } from './UnlockSystem';
import { backfillJoinedHeroes } from '../config/StoryConfig';
import { backfillStorySpawnProps } from './StorySystem';
import { getHeroConfig } from '../config/HeroConfig';

const SAVE_KEY = 'merge_survival_td_state';
export { SAVE_KEY };
// v2→v3：删除人口/食物体系，旧档作废重开，不写迁移
const SAVE_VERSION = '3';

/**
 * 存储系统
 * 整局 JSON 存档（localStorage），后期可替换为服务器存储
 */
export class StorageSystem {

  /** 加载状态；无存档或版本不匹配返回 null（由调用方决定初始化） */
  loadState(): IGameState | null {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (json) {
        const data = JSON.parse(json);
        if (data.version === SAVE_VERSION && this.isValidState(data.state)) {
          // 兼容旧存档：补 base 等字段；resources2/materialStorage（已废弃）直接丢弃
          delete data.state.resources2;
          delete data.state.materialStorage;
          if (!data.state.base) data.state.base = createDefaultBase();
          if (!Array.isArray(data.state.base.tiles)) data.state.base.tiles = createDefaultTiles();
          if (!data.state.day) data.state.day = 1;
          if (!data.state.phase) data.state.phase = 'day';
          if (!Array.isArray(data.state.storySeen)) data.state.storySeen = [];
          if (!Array.isArray(data.state.storyRewardClaims)) data.state.storyRewardClaims = [];
          if (!Array.isArray(data.state.heroes)) data.state.heroes = [];
          for (const hero of data.state.heroes) {
            const maxHp = Math.max(1, hero.maxHp ?? getHeroConfig(hero.key)?.hp ?? 100);
            hero.maxHp = maxHp;
            hero.hp = Math.min(maxHp, Math.max(0, hero.hp ?? maxHp));
            if (hero.recoveryDays && hero.hp > 0) delete hero.recoveryDays;
          }
          if (data.state.language !== 'zh-CN' && data.state.language !== 'en') data.state.language = 'zh-CN';
          if (!data.state.blueprintStock || typeof data.state.blueprintStock !== 'object') data.state.blueprintStock = {};
          // joinHero 是后加的能力：旧存档按 storySeen 补发已加入的英雄
          backfillJoinedHeroes(data.state);
          backfillStorySpawnProps(data.state);
          // 旧存档缺新增资源字段时用默认值补齐，保留已有数值（fuel 等自动补 0）
          data.state.resources = { ...createDefaultResources(), ...data.state.resources };
          // 发电机改为全局燃料池：删除旧档建筑上的 fueledUntil 残留字段
          for (const b of data.state.base.buildings ?? []) delete b.fueledUntil;
          // 旧存档无建筑解锁字段：已摆放在基地的建筑视为已解锁
          ensureUnlockedBuildings(data.state);
          // 兼容旧存档：还没守过第一夜的基地补上东缘废墟（已守过夜的保持原样）
          if (data.state.day === 1 && data.state.phase === 'day') {
            const base = data.state.base;
            for (const cell of initialEastRuinCells()) {
              if (!base.buildings.some((b: { row: number; col: number }) => b.row === cell.row && b.col === cell.col)) {
                base.buildings.push({ cfgId: RUIN_ID, level: 1, hp: 80, maxHp: 80, row: cell.row, col: cell.col });
              }
            }
          }
          // 旧引导曾在电站箱发放前进入第 11 步，补一张且不重复发放。
          const hasPowerStationEmitter = data.state.grid.cells.some((row: { item: { id: number } | null }[]) =>
            row.some(cell => cell.item?.id === 70007)
          );
          if (data.state.handIndex === 11 && !hasPowerStationEmitter && !data.state.cardArr.includes(70007)) {
            data.state.cardArr.push(70007);
          }
          return data.state;
        }
        console.warn('存档版本不匹配或结构异常，重置存档');
      }
    } catch (e) {
      console.warn('加载存档失败', e);
    }
    return null;
  }

  /** 校验状态结构 */
  private isValidState(state: any): boolean {
    if (!state || typeof state !== 'object') return false;
    if (!state.grid || !Array.isArray(state.grid.cells)) return false;
    if (!state.resources || typeof state.resources !== 'object') return false;
    if (!Array.isArray(state.tasks)) return false;
    if (!Array.isArray(state.cardArr)) return false;
    return true;
  }

  /** 保存状态 */
  saveState(state: IGameState): void {
    try {
      state.timestamp = Date.now();
      const data = { version: SAVE_VERSION, state };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('保存存档失败', e);
    }
  }

  /** 清除存档 */
  clearState(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      console.warn('清除存档失败', e);
    }
  }
}
