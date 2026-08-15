import * as Phaser from 'phaser';
import { IGameState, IPoint, ItemStatus } from '../../core/types';
import { getMergeNextId, getProp, PROP_IDS } from '../../core/config/PropConfig';
import { canChargerTarget, canLvUpTarget, canSplitTarget } from '../../core/config/PropConfig';
import { getItem } from '../../core/model/Grid';
import { itemCanDrag, itemIsBubble } from '../../core/model/Item';
import { ItemSprite, CELL_SIZE } from './ItemSprite';

import { HUD_BOTTOM } from '../ui/HUD';

const GAP = 8;
const BOARD_TOP = HUD_BOTTOM + 12 + 86 + 14; // 任务栏(168..254) 之下再留 14 间距
const DRAG_THRESHOLD = 8;
const IDLE_HINT_DELAY = 5000; // 玩家空闲 5 秒后提示可合成对

/**
 * 棋盘渲染器
 * 9×7 棋盘渲染 + 手动拖拽（场景级 pointer 事件）+ 点击上报
 *
 * 使用场景级 pointerdown/move/up 而不是 Phaser setDraggable，避免嵌套 Container 偶尔不响应 drag 的问题。
 */
export class GridRenderer {
  private scene: Phaser.Scene;
  private state: IGameState;
  private container: Phaser.GameObjects.Container;
  private itemSprites: (ItemSprite | null)[][] = [];
  private hintPool: Phaser.GameObjects.Sprite[] = [];
  private selectBox: Phaser.GameObjects.Sprite;
  private cellSize = CELL_SIZE;
  private startX = 0;
  private startY = BOARD_TOP;

  private pointerDown = false;
  private dragStartPos: IPoint | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private hasDragged = false;
  private draggingItem: ItemSprite | null = null;
  private lastActionTime = 0;
  private idleHintTween: Phaser.Tweens.Tween | null = null;

  /** 由 GameScene 注入 */
  onCellClick: (pos: IPoint) => void = () => {};
  onDropItem: (src: IPoint, target: IPoint) => void = () => {};
  isTaskNeeded: (id: number) => boolean = () => false;
  /** 弹层（剧情对话等全屏 UI）打开时返回 true，屏蔽棋盘拖拽/点击，防止点穿 */
  inputBlocked: () => boolean = () => false;

  constructor(scene: Phaser.Scene, state: IGameState) {
    this.scene = scene;
    this.state = state;
    this.container = scene.add.container(0, 0);
    this.selectBox = scene.add.sprite(0, 0, 'cell-select')
      .setDisplaySize(this.cellSize, this.cellSize)
      .setVisible(false)
      .setDepth(90);
    this.layout();

    // 场景级拖拽事件
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    this.lastActionTime = Date.now();
  }

  /** 布局/重建全部格子（仅构造时调用一次） */
  private layout(): void {
    this.container.removeAll(true);
    this.itemSprites = [];
    this.hintPool = [];

    const { width } = this.scene.scale;
    const gridWidth = this.state.grid.colNum * (this.cellSize + GAP) - GAP;
    this.startX = (width - gridWidth) / 2;

    for (let r = 0; r < this.state.grid.rowNum; r++) {
      const itemRow: (ItemSprite | null)[] = [];
      for (let c = 0; c < this.state.grid.colNum; c++) {
        const { x, y } = this.getCellPosition(r, c);

        // 背景格（仅视觉，不接收交互）
        const bgKey = 'cell-bg';
        const cell = this.scene.add.sprite(x, y, bgKey).setDisplaySize(this.cellSize, this.cellSize);
        this.container.add(cell);

        // 物品
        const itemSprite = new ItemSprite(this.scene, x, y, r, c);
        itemSprite.setDepth(1);
        this.container.add(itemSprite);
        itemRow.push(itemSprite);
      }
      this.itemSprites.push(itemRow);
    }

    this.refreshAll();
  }

  /** 格子屏幕坐标 */
  getCellPosition(row: number, col: number): { x: number; y: number } {
    const x = this.startX + col * (this.cellSize + GAP) + this.cellSize / 2;
    const y = this.startY + row * (this.cellSize + GAP) + this.cellSize / 2;
    return { x, y };
  }

  /** 指针位置 → 格子 */
  private getCellByPointer(pointer: Phaser.Input.Pointer): IPoint | null {
    const col = Math.floor((pointer.x - this.startX) / (this.cellSize + GAP));
    const row = Math.floor((pointer.y - this.startY) / (this.cellSize + GAP));
    if (row >= 0 && row < this.state.grid.rowNum && col >= 0 && col < this.state.grid.colNum) {
      return { row, col };
    }
    return null;
  }

  private pointerInGrid(pointer: Phaser.Input.Pointer): boolean {
    return this.getCellByPointer(pointer) !== null;
  }

  /** 刷新所有格子 */
  refreshAll(): void {
    for (let r = 0; r < this.state.grid.rowNum; r++) {
      for (let c = 0; c < this.state.grid.colNum; c++) {
        this.refreshCell(r, c);
      }
    }
  }

  /** 刷新单个格子 */
  refreshCell(row: number, col: number): void {
    const itemSprite = this.itemSprites[row]?.[col];
    if (!itemSprite) return;
    const item = getItem(this.state.grid, row, col);
    itemSprite.updateItem(item, item ? this.isTaskNeeded(item.id) : false);
  }

  /** 选中框移动/隐藏 */
  setSelection(pos: IPoint | null): void {
    if (!pos) {
      this.selectBox.setVisible(false);
      return;
    }
    const { x, y } = this.getCellPosition(pos.row, pos.col);
    this.selectBox.setPosition(x, y).setVisible(true);
  }

  /** 每帧刷新 CD 弧 + 检测空闲提示 */
  update(): void {
    const nowMs = Date.now();
    for (const row of this.itemSprites) {
      for (const sprite of row) {
        sprite?.updateCd(nowMs);
      }
    }
    this.checkIdleHint(nowMs);
  }

  /** 播放合成动画 */
  playMergeEffect(pos: IPoint): void {
    const sprite = this.itemSprites[pos.row]?.[pos.col];
    sprite?.playMergeTween();
  }

  /** 播放生成动画 */
  playSpawnEffect(pos: IPoint): void {
    const sprite = this.itemSprites[pos.row]?.[pos.col];
    sprite?.playSpawnTween();
  }

  /** 播放消除烟雾特效（纸箱破开、箱子耗尽消失时遮挡转换瞬间） */
  playVanishEffect(pos: IPoint): void {
    const { x, y } = this.getCellPosition(pos.row, pos.col);
    for (let i = 0; i < 5; i++) {
      const smoke = this.scene.add.sprite(
        x + Phaser.Math.Between(-10, 10),
        y + Phaser.Math.Between(-10, 10),
        'fx-smoke'
      );
      const targetScale = (this.cellSize / 128) * Phaser.Math.FloatBetween(1.1, 1.6);
      smoke.setDepth(500)
        .setAlpha(0)
        .setScale(targetScale * 0.5)
        .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
      this.scene.tweens.add({
        targets: smoke,
        alpha: { from: 0.85, to: 0 },
        scaleX: targetScale,
        scaleY: targetScale,
        y: smoke.y - Phaser.Math.Between(10, 26),
        rotation: smoke.rotation + Phaser.Math.FloatBetween(-0.6, 0.6),
        duration: Phaser.Math.Between(450, 650),
        delay: i * 40,
        ease: 'Sine.easeOut',
        onComplete: () => smoke.destroy()
      });
    }
  }

  /** 场景级 pointerdown：开始拖拽判定 */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.lastActionTime = Date.now();
    this.stopIdleHint();
    if (this.inputBlocked()) return;

    const pos = this.getCellByPointer(pointer);
    if (!pos) return;

    // 先注册按下位置：空格/气泡/纸箱等不可拖的格子也要能在 pointerup 触发点击
    this.pointerDown = true;
    this.dragStartPos = pos;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.hasDragged = false;
    this.draggingItem = null;

    const item = getItem(this.state.grid, pos.row, pos.col);
    const itemSprite = this.itemSprites[pos.row]?.[pos.col];
    if (!item || !itemSprite || !itemCanDrag(item, this.state.timestamp)) return;

    this.draggingItem = itemSprite;
    // 拖拽对象提到场景顶层，避免被棋盘格子/纸箱等高深度对象遮挡
    this.container.remove(this.draggingItem, false);
    this.scene.add.existing(this.draggingItem);
    this.draggingItem.setDepth(1000).setAlpha(0.85);
    this.showHints(item.id);
  }

  /** 场景级 pointermove：拖拽跟随 */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.inputBlocked()) return;
    if (!this.pointerDown || !this.draggingItem) return;

    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;
    if (!this.hasDragged && dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;

    this.hasDragged = true;
    this.draggingItem.setPosition(pointer.x, pointer.y);
  }

  /** 场景级 pointerup：落点或点击 */
  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.inputBlocked()) {
      // 弹层打开时（或拖拽途中弹层弹出）不触发落点/点击，只复位拖拽状态
      this.endDrag();
      return;
    }
    if (!this.pointerDown) return;
    this.lastActionTime = Date.now();

    this.clearHints();

    if (this.hasDragged && this.draggingItem && this.dragStartPos) {
      const target = this.getCellByPointer(pointer);
      if (target && (target.row !== this.dragStartPos.row || target.col !== this.dragStartPos.col)) {
        this.onDropItem(this.dragStartPos, target);
      }
    } else if (this.dragStartPos && this.pointerInGrid(pointer)) {
      // 未移动 → 点击
      this.onCellClick(this.dragStartPos);
    }

    this.endDrag();
  }

  private endDrag(): void {
    if (this.draggingItem) {
      this.draggingItem.setDepth(1).setAlpha(1);
      this.scene.children.remove(this.draggingItem);
      this.container.add(this.draggingItem);
      this.resetSpritePos(this.draggingItem);
    }
    this.pointerDown = false;
    this.dragStartPos = null;
    this.hasDragged = false;
    this.draggingItem = null;
  }

  private resetSpritePos(itemSprite: ItemSprite): void {
    const { x, y } = this.getCellPosition(itemSprite.row, itemSprite.col);
    itemSprite.setPosition(x, y);
  }

  /** 玩家空闲一段时间后，用缩放动画提示一对可合成材料 */
  private checkIdleHint(nowMs: number): void {
    if (this.pointerDown || this.draggingItem || this.idleHintTween) return;
    if (nowMs - this.lastActionTime < IDLE_HINT_DELAY) return;

    const pair = this.findMergeablePair();
    if (!pair) {
      // 当前没有可合成对，延后再次检测
      this.lastActionTime = nowMs;
      return;
    }
    this.playIdleHint(pair[0], pair[1]);
  }

  /** 找一对可合成（同 id、非纸箱/气泡、可合成升级）的材料 */
  private findMergeablePair(): [IPoint, IPoint] | null {
    const candidates: IPoint[] = [];
    for (let r = 0; r < this.state.grid.rowNum; r++) {
      for (let c = 0; c < this.state.grid.colNum; c++) {
        const item = getItem(this.state.grid, r, c);
        if (!item) continue;
        if (item.st === ItemStatus.Carton) continue;
        if (itemIsBubble(item, this.state.timestamp)) continue;
        if (getMergeNextId(item.id) <= 0) continue;
        candidates.push({ row: r, col: c });
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const a = getItem(this.state.grid, candidates[i].row, candidates[i].col);
      if (!a) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        const b = getItem(this.state.grid, candidates[j].row, candidates[j].col);
        if (b && a.id === b.id) {
          // 两个蜘蛛网不能互相合成，跳过
          if (a.st === ItemStatus.Spider && b.st === ItemStatus.Spider) continue;
          return [candidates[i], candidates[j]];
        }
      }
    }
    return null;
  }

  /** 播放缩放提示动画 */
  private playIdleHint(posA: IPoint, posB: IPoint): void {
    const spriteA = this.itemSprites[posA.row]?.[posA.col];
    const spriteB = this.itemSprites[posB.row]?.[posB.col];
    if (!spriteA || !spriteB) return;

    this.stopIdleHint();
    spriteA.setScale(1);
    spriteB.setScale(1);

    this.idleHintTween = this.scene.tweens.add({
      targets: [spriteA, spriteB],
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 350,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.idleHintTween = null;
        this.lastActionTime = Date.now();
      }
    });
  }

  /** 停止并清空空闲提示动画 */
  private stopIdleHint(): void {
    if (this.idleHintTween) {
      this.idleHintTween.stop();
      this.idleHintTween = null;
    }
    for (const row of this.itemSprites) {
      for (const sprite of row) {
        if (sprite) sprite.setScale(1);
      }
    }
  }

  /** 显示可落点高亮 */
  private showHints(srcId: number): void {
    const srcProp = getProp(srcId);
    if (!srcProp) return;
    const isSpecial = srcProp.mdt === 3 || srcProp.mdt === 4 || (srcProp.mdt >= 6 && srcProp.mdt <= 10);
    const mergeNext = getMergeNextId(srcId);

    for (let r = 0; r < this.state.grid.rowNum; r++) {
      for (let c = 0; c < this.state.grid.colNum; c++) {
        const item = getItem(this.state.grid, r, c);
        if (!item) continue;
        let ok = false;
        if (isSpecial) {
          switch (srcProp.mdt) {
            case 3: ok = canChargerTarget(item.id); break;
            case 4: ok = canSplitTarget(srcId, item.id); break;
            default: ok = canLvUpTarget(srcId, item.id); break;
          }
          // 链式特殊道具（充能器/拆分器链）自身可 A+A 合成升级，同 id 格也亮
          if (item.id === srcId && mergeNext > 0) ok = true;
        } else {
          // 普通物品：同 id 可合成目标 + 背包格；纸箱不能作为合成目标
          if (item.st === ItemStatus.Carton) {
            ok = false;
          } else {
            ok = (item.id === srcId && mergeNext > 0 && item.id !== PROP_IDS.bag)
              || item.id === PROP_IDS.bag;
          }
        }
        if (ok) {
          const { x, y } = this.getCellPosition(r, c);
          const hint = this.scene.add.sprite(x, y, 'cell-hint')
            .setDisplaySize(this.cellSize, this.cellSize)
            .setDepth(80);
          this.hintPool.push(hint);
          this.container.add(hint);
        }
      }
    }
  }

  private clearHints(): void {
    for (const hint of this.hintPool) {
      hint.destroy();
    }
    this.hintPool = [];
  }
}
