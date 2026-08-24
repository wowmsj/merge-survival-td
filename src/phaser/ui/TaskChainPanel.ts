import * as Phaser from 'phaser';
import { ITask } from '../../core/types';
import { getMergeChain, getMergeChainSpawner, getProp } from '../../core/config/PropConfig';
import { getItemIconKey } from '../config/ItemIconMap';
import { colorFromId } from '../objects/ItemSprite';
import { getLanguage, getPropName, getText } from '../../core/i18n';
import { UI_GOLD, UI_SLOT_FILL, UI_STROKE, drawUiBox } from './UiStyle';
import { BasePanel } from './BasePanel';

/** 任务目标的合成路径。 */
export class TaskChainPanel extends BasePanel {
  constructor(scene: Phaser.Scene) {
    super(scene, { depth: 700 });
  }

  open(task: ITask): void {
    super.open();
    if (!this.container) return;
    const container = this.container;
    this.addMask(() => this.close(), 0.65);

    const targets = task.propArr
      .filter(target => target.id > 0 && target.num > 0)
      .map(target => {
        const chain = getMergeChain(target.id);
        const spawnerId = getMergeChainSpawner(target.id);
        return { ...target, chain, spawnerId, path: spawnerId ? [spawnerId, ...chain] : chain };
      });
    const { width, height } = this.scene.scale;
    const isEnglish = getLanguage() === 'en';
    const panelW = 900;
    const cellH = 142;
    const gapY = 26;
    const contentH = targets.reduce((total, target) => {
      const cols = Math.max(1, Math.min(target.path.length, 5));
      const rows = Math.max(1, Math.ceil(target.path.length / cols));
      return total + 52 + rows * cellH + (rows - 1) * gapY + 34;
    }, 0);
    const panelH = Math.min(height - 110, Math.max(430, contentH + 135));
    const { px, py } = this.addPanelChrome(getText('task.chainTitle'), panelW, panelH, {
      box: { fill: UI_SLOT_FILL, fillAlpha: 0.98, stroke: UI_GOLD, strokeAlpha: 0.7, strokeWidth: 2, radius: 20 },
      titleY: 44,
      dividerY: 78,
      closeStyle: 'box'
    });

    const cellW = 140;
    const gapX = 30;
    let y = py + 110;
    targets.forEach(target => {
      container.add(this.scene.add.text(width / 2, y, getText('task.chainNeed', {
        item: getPropName(target.id), count: target.num
      }), {
        fontSize: isEnglish ? '24px' : '28px', color: '#ffffff', fontStyle: 'bold',
        wordWrap: { width: panelW - 100 }, align: 'center'
      }).setOrigin(0.5));
      y += 52;

      if (target.chain.length <= 1) {
        container.add(this.scene.add.text(width / 2, y + 30, getText('task.chainDirect'), {
          fontSize: '24px', color: '#9fa4b8'
        }).setOrigin(0.5));
        y += cellH + 34;
        return;
      }

      const cols = Math.max(1, Math.min(target.path.length, 5));
      const rows = Math.ceil(target.path.length / cols);
      const contentW = cols * cellW + (cols - 1) * gapX;
      const startX = px + (panelW - contentW) / 2 + cellW / 2;
      const startY = y + cellH / 2;
      target.path.forEach((id, index) => {
        const row = Math.floor(index / cols);
        const col = row % 2 === 0 ? index % cols : cols - 1 - (index % cols);
        const x = startX + col * (cellW + gapX);
        const cardY = startY + row * (cellH + gapY);
        const box = this.scene.add.graphics();
        const isSpawner = id === target.spawnerId;
        drawUiBox(box, x, cardY, cellW, cellH, {
          fill: UI_SLOT_FILL, fillAlpha: 0.9,
          stroke: isSpawner ? UI_GOLD : UI_STROKE, strokeAlpha: 0.9, strokeWidth: isSpawner ? 2 : 1, radius: 10
        });
        container.add(box);
        const iconKey = getItemIconKey(id, this.scene.textures);
        if (iconKey && this.scene.textures.exists(iconKey)) {
          container.add(this.scene.add.image(x, cardY - 24, iconKey).setDisplaySize(64, 64));
        } else {
          const fallback = this.scene.add.graphics();
          fallback.fillStyle(colorFromId(id), 1);
          fallback.fillRoundedRect(x - 32, cardY - 56, 64, 64, 10);
          container.add(fallback);
        }
        if (isSpawner) {
          container.add(this.scene.add.text(x, cardY - 62, getText('task.chainSpawner'), {
            fontSize: '13px', color: '#ffd75e', fontStyle: 'bold'
          }).setOrigin(0.5));
        }
        container.add(this.scene.add.text(x, cardY + 29, getPropName(id), {
          fontSize: isEnglish ? '16px' : '20px', color: '#ffffff', fontStyle: 'bold', align: 'center',
          wordWrap: { width: cellW - 18 }, maxLines: 2
        }).setOrigin(0.5));
        container.add(this.scene.add.text(x, cardY + 59, getText('item.level', { level: getProp(id)?.luna ?? 1 }), {
          fontSize: '16px', color: '#9fa4b8'
        }).setOrigin(0.5));
        if (index < target.path.length - 1 && index % cols < cols - 1) {
          const movingRight = row % 2 === 0;
          const label = index === 0 ? (movingRight ? '>' : '<') : (movingRight ? 'x2 >' : '< x2');
          const arrowX = x + (movingRight ? cellW / 2 + gapX / 2 : -cellW / 2 - gapX / 2);
          container.add(this.scene.add.text(arrowX, cardY, label, {
            fontSize: '20px', color: '#ffd75e', fontStyle: 'bold'
          }).setOrigin(0.5));
        } else if (index < target.path.length - 1) {
          container.add(this.scene.add.text(x, cardY + cellH / 2 + gapY / 2, 'x2 v', {
            fontSize: '18px', color: '#ffd75e', fontStyle: 'bold'
          }).setOrigin(0.5));
        }
      });
      y += rows * cellH + (rows - 1) * gapY + 34;
    });
    container.add(this.scene.add.text(width / 2, py + panelH - 34, getText('task.chainHint'), {
      fontSize: '20px', color: '#9fa4b8'
    }).setOrigin(0.5));
  }
}
