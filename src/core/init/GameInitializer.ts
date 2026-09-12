import { IGameState, IPoint, ItemStatus, PlayMode } from '../types';
import { canHostItem, createInitialGameState } from '../model/GameState';
import { findEmptyCell, setItem } from '../model/Grid';
import { BASE_CENTER } from '../model/Base';
import { createItemFromConfig } from '../model/Item';
import { BOARD_INIT } from '../config/TableConfig';
import { TaskSystem } from '../systems/TaskSystem';
import { isItemAllowedInBuildMode } from '../config/BuildingMergeConfig';

/**
 * 游戏初始化器
 * 初始物品（prop_new 配置表）直接摆到基地地图上（基地即合成场）：
 * 优先填中央 7×7 的四个象限（跳过核心所在行/列——纵横两条走廊留给僵尸通行与建设），
 * 装不下的溢出到全盘首个可承载空格。物品与建筑一样挡寻路，走廊必须初始就存在。
 */
export class GameInitializer {
  /** 用初始棋盘配置创建新游戏状态 */
  static initNewGame(taskSystem?: TaskSystem, playMode: PlayMode = 'merge'): IGameState {
    const state = createInitialGameState(playMode);

    // 中央 7×7 象限候选格（排除核心行/列两条走廊），行优先扫描保证确定性
    const quadrant: IPoint[] = [];
    for (let r = BASE_CENTER - 3; r <= BASE_CENTER + 3; r++) {
      for (let c = BASE_CENTER - 3; c <= BASE_CENTER + 3; c++) {
        if (r === BASE_CENTER || c === BASE_CENTER) continue;
        quadrant.push({ row: r, col: c });
      }
    }

    // 初始物品
    for (const row of BOARD_INIT) {
      // 建筑模式下过滤掉非建筑链物品
      if (playMode === 'build' && !isItemAllowedInBuildMode(row.propId)) {
        continue;
      }
      const st = row.status > 0 ? (row.status as ItemStatus) : undefined;
      const clickPropId = row.clickPropId ? (row.clickPropId as number[]) : undefined;
      const item = createItemFromConfig(row.propId, st, clickPropId, state);
      let pos = quadrant.find(p => canHostItem(state, p.row, p.col)) ?? null;
      if (!pos) pos = findEmptyCell(state.grid, (r, c) => canHostItem(state, r, c));
      if (pos) setItem(state.grid, pos.row, pos.col, item);
    }

    // 首个新手任务 + 补足 3 个并发任务
    if (taskSystem) {
      const handTask = taskSystem.createHandTask(1);
      if (handTask) {
        state.tasks = [handTask];
      }
      taskSystem.topUpTasks(state);
    }

    return state;
  }

}
