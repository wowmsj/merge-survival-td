import { GameEvents, eventBus } from '../events/EventBus';
import { DESIGN_CONFIG, getClickProducts, getProp, isToolboxSpawner } from '../config/PropConfig';
import { IGameState, IItemData, IPoint } from '../types';
import { findEmptyCell, forEachCell, getItem, getNineEmptyCells, getNineNeighbors, setItem } from '../model/Grid';
import { createItemFromConfig, itemInCd, itemIsBubble, itemIsNormal } from '../model/Item';
import { propCanSpeedUp } from '../config/PropConfig';
import { getRandomByWeight, now } from '../utils/Common';
import { getText } from '../i18n';

/**
 * 生成系统
 * 点击发射器产出、自动生成器、气泡到期、cd 恢复、体力恢复、加速装置 tick
 * （对应源项目 onClickRoomNew / refreshRoomAutoNew / update）
 */
export class SpawnSystem {

  /** 每帧/每 tick 更新（源项目 500ms 一次，这里由 World.update 驱动） */
  update(state: IGameState, _dt: number): void {
    state.timestamp = now();
    this.tickBoard(state);
  }

  /**
   * 点击发射器产出物品
   * 校验：可点击、非气泡、不在 cd、有剩余次数、体力足够、有空位
   * 失败时 emit TOAST_SHOW 具体原因，方便 UI 直接调用
   */
  clickSpawn(state: IGameState, pos: IPoint): { success: boolean; newPos?: IPoint; productId?: number } {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item) return { success: false };
    const prop = getProp(item.id);
    if (!prop || !prop.anc) return { success: false };

    // 气泡中不可点击
    if (itemIsBubble(item, state.timestamp)) return { success: false };
    // 冷却中不可点击
    if (itemInCd(item)) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.cooling'));
      return { success: false };
    }
    // 次数用完（等待 cd 恢复中）
    if ((item.times ?? 0) <= 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.noUses'));
      return { success: false };
    }

    // 体力：noPower 或无限能量期间不耗
    const powerFree = state.powerFreeUntil > now();
    if (!prop.noPower && !powerFree) {
      if (state.resources.power <= 0) {
        eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.powerShort'));
        return { success: false };
      }
    }

    // 找空位（先九宫，再全盘首个空格，对应源项目 UI 传入的空格）
    const emptyPos = this.findSpawnCell(state, pos);
    if (!emptyPos) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.boardFull'));
      return { success: false };
    }

    const productId = this.getClickProduct(item, prop.id);
    if (productId <= 0) return { success: false };
    const trackBlueprintOutput = prop.type === 7 && prop.wsb === 1;
    // 兼容旧存档：首次数从剩余次数推算，之后只按真实落盘数累计。
    const priorBlueprintSpawned = trackBlueprintOutput
      ? item.spawnedCount ?? Math.max(0, prop.times - (item.times ?? prop.times))
      : 0;

    // 扣体力
    if (!prop.noPower && !powerFree) {
      state.resources.power -= 1;
      eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'power', value: state.resources.power, delta: -1 });
    }

    // 新手第一天：工具箱链不扣次数、不累积 cd（开局要攒 300 金币盖发电机，让玩家放心刷材料起步）
    const dayOneFree = state.day <= 1 && isToolboxSpawner(prop.id);

    // 扣次数
    if (!dayOneFree) {
      item.times = (item.times ?? 0) - 1;

      // cd 累加（每次点击累加 milo 秒）
      if (prop.milo > 0) {
        item.cd = (item.cd || now()) + prop.milo * 1000;
      }

      // 次数耗尽处理
      if (item.times <= 0) {
        if (prop.wsb && !trackBlueprintOutput) {
          // 点击完消失
          setItem(state.grid, pos.row, pos.col, null);
        } else if (prop.doge > 0) {
          // 点击完变身
          setItem(state.grid, pos.row, pos.col, createItemFromConfig(prop.doge, undefined, undefined, state));
        } else {
          // 进入冷却，等待恢复次数（cdSum 为进度条分母）
          item.cdSum = (item.cd ?? now()) - now();
        }
      }
    }
    if (!trackBlueprintOutput) {
      eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: getItem(state.grid, pos.row, pos.col) });
    }

    const newItem = createItemFromConfig(productId, undefined, undefined, state);
    setItem(state.grid, emptyPos.row, emptyPos.col, newItem);
    if (trackBlueprintOutput) {
      item.spawnedCount = priorBlueprintSpawned + 1;
      if (item.spawnedCount >= prop.times) setItem(state.grid, pos.row, pos.col, null);
      eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: getItem(state.grid, pos.row, pos.col) });
    }
    eventBus.emit(GameEvents.GRID_ITEM_SPAWNED, { source: pos, newPositions: [emptyPos], isAuto: false });

    return { success: true, newPos: emptyPos, productId };
  }

  /** 发射器产出落点：优先周围九宫空格，否则全盘首个空格 */
  private findSpawnCell(state: IGameState, source: IPoint): IPoint | null {
    const nine = getNineEmptyCells(state.grid, source.row, source.col);
    if (nine.length > 0) return nine[0];
    return findEmptyCell(state.grid);
  }

  /** 决定点击产出 id：优先 clickPropId 队列，否则 atom/matic 权重 */
  private getClickProduct(item: IItemData, propId: number): number {
    if (item.clickPropId && item.clickPropId.length > 0) {
      const id = item.clickPropId.shift()!;
      if (item.clickPropId.length <= 0) {
        delete item.clickPropId;
      }
      return id;
    }
    const products = getClickProducts(propId);
    const ret = getRandomByWeight(products);
    return ret ? ret.id : 0;
  }

  /**
   * 棋盘 tick（对应源项目 update，500ms 一次）：
   * cd 到期恢复、自动生成、气泡到期、加速装置
   */
  private tickBoard(state: IGameState): void {
    const timestamp = state.timestamp;
    // 加速装置影响到的格子（同 tick 内多加速器取最大 dt）
    const speedMap: Map<string, { pos: IPoint; dt: number }> = new Map();

    forEachCell(state.grid, (item, r, c) => {
      if (!item) return;
      const prop = getProp(item.id);
      if (!prop) return;
      const pos = { row: r, col: c };

      // 点击 cd 到期
      if (item.cd && timestamp >= item.cd) {
        if (prop.mdt === 11) {
          // 加速装置时间到，自动消失
          setItem(state.grid, r, c, null);
          eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: null });
          eventBus.emit(GameEvents.SPEED_UP_END, { pos });
          return;
        } else {
          delete item.cd;
          delete item.cdSum;
          delete item.unlock;
          // cd 到了，补充点击次数（解锁型道具 mdt=1 也在此恢复为可用发射器）
          if (prop.times > 0) {
            item.times = prop.times;
          }
          eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item });
        }
      }

      // 自动吐东西（气泡中暂停）
      if (prop.fair && (item.timesAuto ?? 0) > 0 && !itemIsBubble(item, timestamp)) {
        this.refreshAutoNew(state, pos);
      }

      // 自动 cd 到期，补充自动次数
      if (item.cdAuto && timestamp >= item.cdAuto && !itemIsBubble(item, timestamp)) {
        delete item.cdAuto;
        item.timesAuto = prop.kishu;
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item });
        this.refreshAutoNew(state, pos);
      }

      // 气泡到期，爆成固定物品
      if (item.cdBubble && item.cdBubble > 0 && timestamp >= item.cdBubble) {
        const bombItem = createItemFromConfig(DESIGN_CONFIG.bubbleBombPropId, undefined, undefined, state);
        setItem(state.grid, r, c, bombItem);
        eventBus.emit(GameEvents.GRID_BUBBLE_BOMB, { pos, item: bombItem });
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: bombItem });
        return;
      }

      // 加速装置：收集九宫邻居
      if (prop.mdt === 11 && item.startTime) {
        const dt = timestamp - item.startTime;
        item.startTime = timestamp;
        const neighbors = getNineNeighbors(state.grid, r, c);
        for (const nPos of neighbors) {
          const nItem = getItem(state.grid, nPos.row, nPos.col);
          if (!nItem || !itemIsNormal(nItem, timestamp)) continue;
          if (!propCanSpeedUp(nItem.id)) continue;
          const key = `${nPos.row}_${nPos.col}`;
          const exist = speedMap.get(key);
          if (!exist || exist.dt < dt) {
            speedMap.set(key, { pos: nPos, dt });
          }
        }
      }
    });

    // 应用加速
    for (const { pos, dt } of speedMap.values()) {
      const item = getItem(state.grid, pos.row, pos.col);
      if (!item) continue;
      if (item.cd) item.cd -= dt;
      if (item.cdAuto) item.cdAuto -= dt;
      eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item });
    }
  }

  /**
   * 自动生成器：向九宫空格产出（对应源项目 refreshRoomAutoNew）
   */
  refreshAutoNew(state: IGameState, pos: IPoint): void {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item || (item.timesAuto ?? 0) <= 0) return;
    if (itemIsBubble(item, state.timestamp)) return;

    const prop = getProp(item.id);
    if (!prop || prop.fair <= 0) return;

    const empties = getNineEmptyCells(state.grid, pos.row, pos.col);
    if (empties.length <= 0) return;

    const newPositions: IPoint[] = [];
    while ((item.timesAuto ?? 0) > 0 && empties.length > 0) {
      const emptyPos = empties.shift()!;
      const newItem = createItemFromConfig(prop.fair, undefined, undefined, state);
      setItem(state.grid, emptyPos.row, emptyPos.col, newItem);
      newPositions.push(emptyPos);
      item.timesAuto = (item.timesAuto ?? 0) - 1;
      if (item.timesAuto <= 0) {
        item.cdAuto = now() + prop.faircd * 1000;
      }
    }

    if (newPositions.length > 0) {
      eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item });
      eventBus.emit(GameEvents.GRID_ITEM_SPAWNED, { source: pos, newPositions, isAuto: true });
    }
  }
}
