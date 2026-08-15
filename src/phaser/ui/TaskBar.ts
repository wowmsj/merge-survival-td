import * as Phaser from 'phaser';
import { IGameState, ITask } from '../../core/types';
import { MAX_CONCURRENT_TASKS, calcTaskGold } from '../../core/systems/TaskSystem';
import { HUD_BOTTOM } from './HUD';
import { getItemIconKey } from '../config/ItemIconMap';
import { UI_GREEN, UI_GREEN_FILL, UI_SLOT_FILL, UI_STROKE, drawUiBox } from './UiStyle';

/** 任务栏顶部 y：HUD 两排底之下留 12 间距 */
const TASK_BAR_Y = HUD_BOTTOM + 12;
/** 单任务卡片尺寸：3 列等宽，左右留边距 18，列间距 12（18+340+12+340+12+340+18=1080） */
const TASK_SLOT_W = 204;
const TASK_SLOT_H = 98;
const SLOT_GAP = 6;
const MARGIN_X = 18;

/**
 * 任务栏：最多 3 个任务并排，每条显示 材料 icon + 名称 + 进度 x/y + 奖励（星星+金币）
 * 可提交的任务绿色高亮，点击提交
 */
export class TaskBar {
  private scene: Phaser.Scene;
  private state: IGameState;
  private container: Phaser.GameObjects.Container;

  /** 由 GameScene 注入 */
  countItem: (id: number) => number = () => 0;
  canComplete: (task: ITask) => boolean = () => false;
  onSubmit: (task: ITask) => void = () => {};
  onViewChain: (task: ITask) => void = () => {};

  constructor(scene: Phaser.Scene, state: IGameState) {
    this.scene = scene;
    this.state = state;
    this.container = scene.add.container(0, TASK_BAR_Y).setDepth(100);
    this.refresh();
  }

  refresh(): void {
    this.container.removeAll(true);

    const tasks = this.state.tasks.slice(0, MAX_CONCURRENT_TASKS);
    for (let i = 0; i < tasks.length; i++) {
      this.renderTask(tasks[i], MARGIN_X + i * (TASK_SLOT_W + SLOT_GAP));
    }
  }

  /** 渲染单个任务卡片，x 为卡片左缘（容器内坐标） */
  private renderTask(task: ITask, x: number): void {
    const canDone = this.canComplete(task);

    // 底：普通态深色 + 蓝灰描边；可提交态深绿底 + 绿描边
    const bg = this.scene.add.graphics();
    if (canDone) {
      drawUiBox(bg, x + TASK_SLOT_W / 2, TASK_SLOT_H / 2, TASK_SLOT_W, TASK_SLOT_H, {
        fill: UI_GREEN_FILL, fillAlpha: 0.92, stroke: UI_GREEN, strokeAlpha: 0.9, strokeWidth: 2, radius: 10
      });
    } else {
      drawUiBox(bg, x + TASK_SLOT_W / 2, TASK_SLOT_H / 2, TASK_SLOT_W, TASK_SLOT_H, {
        fill: UI_SLOT_FILL, fillAlpha: 0.9, stroke: UI_STROKE, strokeAlpha: 0.8, strokeWidth: 2, radius: 10
      });
    }
    this.container.add(bg);

    // 所需材料：icon + 名称 + 进度 x/y（最多 2 种，各占一行）
    const needs = task.propArr.slice(0, 2);
    for (let n = 0; n < needs.length; n++) {
      const need = needs[n];
      const itemX = x + (needs.length === 1 ? 48 : 30 + n * 58);
      const itemY = 44;
      const iconKey = getItemIconKey(need.id, this.scene.textures);
      if (iconKey) {
        const icon = this.scene.add.image(itemX, itemY, iconKey).setDisplaySize(52, 52);
        this.container.add(icon);
      }
      const has = Math.min(this.countItem(need.id), need.num);
      const enough = has >= need.num;
      this.container.add(this.scene.add.text(itemX, 82, `${has}/${need.num}`, {
        fontSize: '17px',
        color: enough ? '#8ce99a' : '#dce6ef',
        stroke: '#000000',
        strokeThickness: 2,
        fontStyle: 'bold'
      }).setOrigin(0.5));
    }

    // 奖励：右上星星 + 其左金币（旧存档无 goldNum 时现场算）
    const reward = this.scene.add.text(x + TASK_SLOT_W - 10, 10, `★${task.starNum}`, {
      fontSize: '18px',
      color: '#ffe066',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
      padding: { top: 4, bottom: 2 }
    }).setOrigin(1, 0);
    this.container.add(reward);

    const goldNum = task.goldNum ?? calcTaskGold(task.propArr, task.starNum);
    if (goldNum > 0) {
      const goldText = this.scene.add.text(reward.x - reward.width - 8, 10, `${goldNum}`, {
        fontSize: '18px',
        color: '#ffd700',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
        padding: { top: 4, bottom: 2 }
      }).setOrigin(1, 0);
      this.container.add(goldText);
      if (this.scene.textures.exists('res-icon-coin')) {
        const coinIcon = this.scene.add.image(
          goldText.x - goldText.width - 7, 10 + goldText.height / 2, 'res-icon-coin'
        ).setDisplaySize(19, 19).setOrigin(1, 0.5);
        this.container.add(coinIcon);
      }
    }

    // 额外物品奖励（蓝图发射器等）不在卡片上展示：提交后由 NPC 对话隆重发放

    if (canDone) {
      // 可提交：右下勾图标 + 整卡可点
      if (this.scene.textures.exists('task-gou')) {
        const gou = this.scene.add.image(x + TASK_SLOT_W - 18, TASK_SLOT_H - 18, 'task-gou')
          .setDisplaySize(28, 28);
        this.container.add(gou);
      }
      bg.setInteractive(
        new Phaser.Geom.Rectangle(x, 0, TASK_SLOT_W, TASK_SLOT_H), Phaser.Geom.Rectangle.Contains);
      bg.on('pointerup', () => this.onSubmit(task));
    } else {
      bg.setInteractive(
        new Phaser.Geom.Rectangle(x, 0, TASK_SLOT_W, TASK_SLOT_H), Phaser.Geom.Rectangle.Contains);
      bg.on('pointerup', () => this.onViewChain(task));
    }
  }
}
