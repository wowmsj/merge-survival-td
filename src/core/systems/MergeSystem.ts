import { GameEvents, eventBus } from '../events/EventBus';
import { DESIGN_CONFIG, getMergeNextId, getProp, PROP_IDS } from '../config/PropConfig';
import { COMPOSE_AWARDS } from '../config/TableConfig';
import { IGameState, IMergeResult, IPoint, IItemData, ItemStatus } from '../types';
import { findEmptyCell, getCrossNeighbors, getItem, setItem, swapItems } from '../model/Grid';
import { createItemFromConfig, itemIsBubble } from '../model/Item';
import { BagSystem } from './BagSystem';
import { SpecialItemSystem } from './SpecialItemSystem';
import { LevelSystem } from './LevelSystem';
import { getRandomByWeight, now } from '../utils/Common';
import { getText } from '../i18n';

/**
 * 二合系统
 * 拖拽落点完整分类：
 *   自己 → 弹回
 *   目标空 → 移动
 *   目标是背包 → 入包
 *   目标是纸箱 → 弹回
 *   源是蜘蛛网 + 目标不同 id/纸箱 → 弹回（蜘蛛网不能交换）
 *   源是充能器/拆分器/升级卡 → 特殊道具逻辑
 *   同 id 且 blessId>0（气泡除外） → 合成（蜘蛛网参与合成即解封）
 *   其他 → 交换
 */
export class MergeSystem {
  private bagSystem: BagSystem;
  private specialSystem: SpecialItemSystem;
  private levelSystem: LevelSystem | null = null;

  /**
   * @param levelSystem 可选：注入后每次成功合成 +1 玩家经验
   */
  constructor(bagSystem: BagSystem, specialSystem: SpecialItemSystem, levelSystem?: LevelSystem) {
    this.bagSystem = bagSystem;
    this.specialSystem = specialSystem;
    this.levelSystem = levelSystem ?? null;
  }

  moveOrMerge(state: IGameState, src: IPoint, target: IPoint): IMergeResult {
    const result: IMergeResult = {
      success: false,
      kind: 'none',
      src,
      target,
      newItem: null,
      cartonBreaks: []
    };

    const srcItem = getItem(state.grid, src.row, src.col);
    const targetItem = getItem(state.grid, target.row, target.col);
    if (!srcItem) return result;

    // 目标是自己 → 弹回
    if (src.row === target.row && src.col === target.col) {
      result.kind = 'bounce';
      return result;
    }

    // 目标是背包 → 放入背包
    if (targetItem && targetItem.id === PROP_IDS.bag) {
      if (this.bagSystem.putInBag(state, src, target)) {
        result.success = true;
        result.kind = 'bag';
      } else {
        result.kind = 'bounce';
      }
      return result;
    }

    // 源是特殊拖拽道具（充能器/拆分器/升级卡）；
    // 但目标是同 id 且可合成时优先走合成（链式充能器/拆分器自身也要能 A+A 升级，
    // 否则 60005/60008 这类链会被特殊拖拽拦截：合成被弹回，甚至中型拆分器互拖会误触发拆分）
    const srcProp = getProp(srcItem.id);
    const sameIdMergeable = !!targetItem && targetItem.id === srcItem.id && getMergeNextId(srcItem.id) > 0;
    if (srcProp && !sameIdMergeable && (srcProp.mdt === 3 || srcProp.mdt === 4 || (srcProp.mdt >= 6 && srcProp.mdt <= 10))) {
      if (targetItem && this.specialSystem.applyDragSpecial(state, src, target)) {
        result.success = true;
        result.kind = srcProp.mdt === 3 ? 'charger' : srcProp.mdt === 4 ? 'split' : 'lvup';
        return result;
      }
      result.kind = 'bounce';
      return result;
    }

    // 目标为空 → 直接移动（蜘蛛网/气泡中不能作为落点空位，但可以移动）
    if (!targetItem) {
      // 蜘蛛网物品不能放入空位（不能交换位置），弹回
      if (srcItem.st === ItemStatus.Spider) {
        eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.spiderCannotMove'));
        result.kind = 'bounce';
        return result;
      }
      swapItems(state.grid, src, target);
      result.success = true;
      result.kind = 'move';
      eventBus.emit(GameEvents.GRID_ITEM_MOVED, { src, target, item: srcItem });
      return result;
    }

    // 目标是纸箱 → 不能作为任何目标，弹回
    if (targetItem.st === ItemStatus.Carton) {
      result.kind = 'bounce';
      return result;
    }

    // 同 id 且 blessId > 0 → 合成（蜘蛛网参与合成即解封；气泡不可合成；两个蜘蛛网不能互相合成）
    const nextId = getMergeNextId(srcItem.id);
    const srcSpider = srcItem.st === ItemStatus.Spider;
    const targetSpider = targetItem.st === ItemStatus.Spider;

    // 两个蜘蛛网同 id：明确告知为什么不能合成
    if (srcItem.id === targetItem.id && nextId > 0 && srcSpider && targetSpider) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.spiderBoth'));
      result.kind = 'bounce';
      return result;
    }

    if (srcItem.id === targetItem.id && nextId > 0
      && !itemIsBubble(srcItem, state.timestamp) && !itemIsBubble(targetItem, state.timestamp)
      && !(srcSpider && targetSpider)) {
      const mergedItem = this.mergeItems(state, srcItem, targetItem, nextId);
      setItem(state.grid, src.row, src.col, null);
      setItem(state.grid, target.row, target.col, mergedItem);
      result.success = true;
      result.kind = 'merge';
      result.newItem = mergedItem;

      // 十字戳破周围纸箱（纸箱 → 蜘蛛网）
      result.cartonBreaks = this.breakCartonsAround(state, target);

      eventBus.emit(GameEvents.GRID_ITEM_MERGED, {
        src,
        target,
        newItem: mergedItem,
        srcItem,
        targetItem,
        cartonBreaks: result.cartonBreaks
      });

      // 合成后额外奖励（权重抽取：-1 同级气泡 / >0 指定物品 / 0 无）
      this.composeAfter(state, target);
      // 每次合成 +1 玩家经验（升级发宝箱/手提包，发射器来源之一）
      if (this.levelSystem) {
        this.levelSystem.addExp(state, 1);
      }
      return result;
    }

    // 同 id 但满级 → 提示并交换（不能合成）
    if (srcItem.id === targetItem.id && nextId <= 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.maxLevel'));
    }

    // 目标是蜘蛛网但无法合成 → 弹回（蜘蛛网不能交换）
    if (targetItem.st === ItemStatus.Spider) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.spiderTarget'));
      result.kind = 'bounce';
      return result;
    }

    // 源是蜘蛛网且无法与目标合成 → 弹回（蜘蛛网不能交换）
    if (srcItem.st === ItemStatus.Spider) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.spiderSource'));
      result.kind = 'bounce';
      return result;
    }

    // 其他 → 交换位置
    swapItems(state.grid, src, target);
    result.success = true;
    result.kind = 'swap';
    eventBus.emit(GameEvents.GRID_ITEM_MOVED, { src, target, item: srcItem });
    return result;
  }

  /**
   * 合成两个物品：产物由配表 blessId 指定，clickPropId 队列合并继承
   */
  private mergeItems(state: IGameState, a: IItemData, b: IItemData, nextId: number): IItemData {
    const clickPropId: number[] = [];
    if (a.clickPropId) clickPropId.push(...a.clickPropId);
    if (b.clickPropId) clickPropId.push(...b.clickPropId);

    return createItemFromConfig(nextId, undefined, clickPropId.length > 0 ? clickPropId : undefined, state);
  }

  /**
   * 十字戳破周围纸箱（纸箱破开变蜘蛛网，物品露出）
   */
  private breakCartonsAround(state: IGameState, center: IPoint): IPoint[] {
    const breaks: IPoint[] = [];
    const neighbors = getCrossNeighbors(state.grid, center.row, center.col);
    for (const pos of neighbors) {
      const item = getItem(state.grid, pos.row, pos.col);
      if (item && item.st === ItemStatus.Carton) {
        const revealed = createItemFromConfig(item.id, ItemStatus.Spider, item.clickPropId, state);
        setItem(state.grid, pos.row, pos.col, revealed);
        breaks.push(pos);
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: revealed });
      }
    }
    return breaks;
  }

  /**
   * 合成后额外奖励：按 composeAward 表权重抽取
   * 新手引导期不出（源项目行为）
   */
  private composeAfter(state: IGameState, target: IPoint): void {
    if (state.handIndex <= HAND_DONE_INDEX) return;

    const retRow = getRandomByWeight(COMPOSE_AWARDS);
    if (!retRow || retRow.propId === 0) return;

    const emptyPos = findEmptyCell(state.grid);
    if (!emptyPos) return;

    let newItem: IItemData | null = null;
    if (retRow.propId === -1) {
      // 同级气泡物品
      const targetItem = getItem(state.grid, target.row, target.col);
      if (!targetItem) return;
      newItem = createItemFromConfig(targetItem.id, undefined, undefined, state);
      newItem.cdBubble = now() + DESIGN_CONFIG.bubbleTime;
    } else if (retRow.propId > 0) {
      newItem = createItemFromConfig(retRow.propId, undefined, undefined, state);
    }

    if (newItem) {
      setItem(state.grid, emptyPos.row, emptyPos.col, newItem);
      eventBus.emit(GameEvents.GRID_ITEM_SPAWNED, { source: target, newPositions: [emptyPos], isAuto: false });
    }
  }
}

/** 新手引导步数上限（handData 数组长度），超过即引导完成 */
export const HAND_DONE_INDEX = 24;
