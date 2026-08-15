import { IGameState, ItemStatus } from '../types';
import { createInitialGameState, DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS } from '../model/GameState';
import { createGrid, setItem } from '../model/Grid';
import { createItemFromConfig } from '../model/Item';
import { BOARD_INIT } from '../config/TableConfig';
import { TaskSystem } from '../systems/TaskSystem';

/**
 * 游戏初始化器
 * 从 prop_new 配置表创建初始棋盘（row/col 从 1 开始，转为 0 开始）
 */
export class GameInitializer {
  /** 用初始棋盘配置创建新游戏状态 */
  static initNewGame(taskSystem?: TaskSystem): IGameState {
    const state = createInitialGameState();
    state.grid = createGrid(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);

    // 初始物品
    for (const row of BOARD_INIT) {
      const st = row.status > 0 ? (row.status as ItemStatus) : undefined;
      const clickPropId = row.clickPropId ? (row.clickPropId as number[]) : undefined;
      const item = createItemFromConfig(row.propId, st, clickPropId, state);
      setItem(state.grid, row.row - 1, row.col - 1, item);
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
