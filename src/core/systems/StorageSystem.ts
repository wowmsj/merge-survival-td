import { IGameState } from '../types';
import { createDefaultResources } from '../model/GameState';
import { createDefaultBase, createDefaultTiles, initialEastRuinCells } from '../model/Base';
import { GameEvents, eventBus } from '../events/EventBus';
import { getBuildingConfig, RUIN_ID } from '../config/BuildingConfig';
import { clampCoreLevel, getCoreTimesAt } from '../config/CoreConfig';
import { CoreSystem } from './CoreSystem';
import { ensureUnlockedBuildings } from './UnlockSystem';
import { backfillJoinedHeroes } from '../config/StoryConfig';
import { backfillStorySpawnProps } from './StorySystem';
import { getHeroConfig } from '../config/HeroConfig';
import { getText } from '../i18n';
import { throttledCloudUpload } from '../../platform/common/CloudSave';

const SAVE_KEY = 'merge_survival_td_state';
export { SAVE_KEY };
// v2→v3：删除人口/食物体系，旧档作废重开，不写迁移
// v3→v4：棋盘由 9×7 改为 7×9，旧档棋盘布局不兼容，作废重开
// v4→v5：棋盘由 7×9 改为 6×9，旧档棋盘布局不兼容，作废重开
// v5→v6：废弃独立棋盘，物品层叠加到基地 13×13（基地直接合成），旧档作废重开
// v6 内不升版本：合成核心由棋盘道具改为基地核心建筑（本文件 migrateMergeCoreToBase 折算），旧档继续可玩
// v6→v7：只保留炮塔（城墙/资源/陷阱/英雄派遣砍掉）+ 内城外城划分，规则变化大，旧档作废重开
export const SAVE_VERSION = '7';

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
        if (data.version === SAVE_VERSION) {
          const state = this.normalizeState(data.state);
          if (state) return state;
        }
        console.warn('存档版本不匹配或结构异常，重置存档');
      }
    } catch (e) {
      console.warn('加载存档失败', e);
    }
    return null;
  }

  /**
   * 数据校验 + 兼容回填：本地档与云端档共用同一套逻辑。
   * 结构非法返回 null；合法则就地补全旧档缺失字段后返回。
   */
  normalizeState(state: any): IGameState | null {
    if (!this.isValidState(state)) return null;
    // 兼容旧存档：补 base 等字段；resources2/materialStorage（已废弃）直接丢弃
    delete state.resources2;
    delete state.materialStorage;
    if (!state.base) state.base = createDefaultBase();
    if (!Array.isArray(state.base.tiles)) state.base.tiles = createDefaultTiles();
    if (!state.day) state.day = 1;
    if (!state.phase) state.phase = 'day';
    if (!Array.isArray(state.storySeen)) state.storySeen = [];
    if (!Array.isArray(state.storyRewardClaims)) state.storyRewardClaims = [];
    if (!Array.isArray(state.heroes)) state.heroes = [];
    for (const hero of state.heroes) {
      const maxHp = Math.max(1, hero.maxHp ?? getHeroConfig(hero.key)?.hp ?? 100);
      hero.maxHp = maxHp;
      hero.hp = Math.min(maxHp, Math.max(0, hero.hp ?? maxHp));
      if (hero.recoveryDays && hero.hp > 0) delete hero.recoveryDays;
    }
    if (state.language !== 'zh-CN' && state.language !== 'en') state.language = 'en';
    if (!state.blueprintStock || typeof state.blueprintStock !== 'object') state.blueprintStock = {};
    if (state.playMode !== 'merge' && state.playMode !== 'build') state.playMode = 'merge';
    // joinHero 是后加的能力：旧存档按 storySeen 补发已加入的英雄
    backfillJoinedHeroes(state);
    backfillStorySpawnProps(state);
    // 旧存档缺新增资源字段时用默认值补齐，保留已有数值（fuel 等自动补 0）
    state.resources = { ...createDefaultResources(), ...state.resources };
    // 发电机改为全局燃料池：删除旧档建筑上的 fueledUntil 残留字段
    for (const b of state.base.buildings ?? []) delete b.fueledUntil;
    // 旧存档无建筑解锁字段：已摆放在基地的建筑视为已解锁
    ensureUnlockedBuildings(state);
    // 兼容旧存档：还没守过第一夜的基地补上东缘废墟（已守过夜的保持原样）
    if (state.day === 1 && state.phase === 'day') {
      const base = state.base;
      for (const cell of initialEastRuinCells()) {
        if (!base.buildings.some((b: { row: number; col: number }) => b.row === cell.row && b.col === cell.col)) {
          base.buildings.push({ cfgId: RUIN_ID, level: 1, hp: 80, maxHp: 80, row: cell.row, col: cell.col });
        }
      }
    }
    // 旧引导曾在电站箱发放前进入第 11 步，补一张且不重复发放。
    const hasPowerStationEmitter = state.grid.cells.some((row: { item: { id: number } | null }[]) =>
      row.some(cell => cell.item?.id === 70007)
    );
    if (state.handIndex === 11 && !hasPowerStationEmitter && !state.cardArr.includes(70007)) {
      state.cardArr.push(70007);
    }
    // 合成核心改为挂在基地核心建筑上：旧档棋盘/背包/卡片里的核心链道具折算成核心等级
    this.migrateMergeCoreToBase(state);
    // 补全核心发射库存（旧档核心建筑没有 times/cd 字段）
    new CoreSystem().ensure(state);
    return state;
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

  /**
   * 合成核心迁到基地核心建筑（旧档兼容，不作废存档）：
   * 棋盘 / 背包 / 卡片列表里最高级的核心链道具（60026~60031）折算成基地核心等级
   * （60026 → 1 级 … 60031 → 6 级），这些道具随即从存档中移除；
   * 6 级也一并移除，其余核心链道具原样保留（它们是升级材料）。
   */
  private migrateMergeCoreToBase(state: IGameState): void {
    const levelOf = (id: number | undefined): number =>
      id !== undefined && id >= 60026 && id <= 60031 ? id - 60025 : 0;

    let best = 0;
    // 棋盘 + 背包
    for (const row of state.grid.cells) {
      for (const cell of row) {
        const item = cell.item;
        if (!item) continue;
        if (levelOf(item.id) > 0) {
          best = Math.max(best, levelOf(item.id));
          cell.item = null;
          continue;
        }
        if (item.roomArr) {
          for (let i = 0; i < item.roomArr.length; i++) {
            const inner = item.roomArr[i];
            if (inner && levelOf(inner.id) > 0) {
              best = Math.max(best, levelOf(inner.id));
              item.roomArr[i] = null;
            }
          }
        }
      }
    }
    // 卡片列表
    if (Array.isArray(state.cardArr)) {
      state.cardArr = state.cardArr.filter(id => {
        const lv = levelOf(id);
        if (lv > 0) {
          best = Math.max(best, lv);
          return false;
        }
        return true;
      });
    }
    if (best <= 0) return;

    const base = state.base;
    const core = base?.buildings?.find(b => getBuildingConfig(b.cfgId)?.kind === 'core');
    if (!core) return;
    core.level = Math.max(clampCoreLevel(core.level), best);
    // 折算出的等级按新等级重置库存/CD
    delete core.cd;
    delete core.cdSum;
    core.times = getCoreTimesAt(core.level);
    eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.coreMigrated', { level: core.level }));
  }

  /** 保存状态：先写 localStorage（第一落点），再异步节流上传云端；未登录/失败均静默 */
  saveState(state: IGameState): void {
    try {
      state.timestamp = Date.now();
      const data = { version: SAVE_VERSION, state };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      throttledCloudUpload();
    } catch (e) {
      console.warn('保存存档失败', e);
    }
  }

  /**
   * 返回未做兼容回填的本地存档摘要（供云同步冲突对比）；
   * 无存档、版本不匹配或结构非法时返回 null。
   */
  loadRawInfo(): { timestamp: number; day: number } | null {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return null;
      const data = JSON.parse(json);
      if (data.version !== SAVE_VERSION || !this.isValidState(data.state)) return null;
      return {
        timestamp: typeof data.state.timestamp === 'number' ? data.state.timestamp : 0,
        day: typeof data.state.day === 'number' ? data.state.day : 0
      };
    } catch (e) {
      console.warn('读取存档摘要失败', e);
      return null;
    }
  }

  /** 把外部来源（云端）的状态写入 localStorage，保留其原 timestamp，不重触发上传 */
  adoptState(state: IGameState): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state }));
    } catch (e) {
      console.warn('写入云端存档失败', e);
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
