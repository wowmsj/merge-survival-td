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

    const targetId = task.propArr[0]?.id;
    const targetCount = task.propArr[0]?.num ?? 0;
    const chain = targetId ? getMergeChain(targetId) : [];
    const spawnerId = targetId ? getMergeChainSpawner(targetId) : undefined;
    const path = spawnerId ? [spawnerId, ...chain] : chain;
    const { width, height } = this.scene.scale;
    const isEnglish = getLanguage() === 'en';
    const panelW = 900;
    const cols = Math.min(path.length, 5);
    const rows = Math.ceil(path.length / cols);
    const panelH = Math.min(height - 110, rows > 1 ? 600 : 430);
    const { px, py } = this.addPanelChrome(getText('task.chainTitle'), panelW, panelH, {
      box: { fill: UI_SLOT_FILL, fillAlpha: 0.98, stroke: UI_GOLD, strokeAlpha: 0.7, strokeWidth: 2, radius: 20 },
      titleY: 44,
      dividerY: 78,
      closeStyle: 'box'
    });

    container.add(this.scene.add.text(width / 2, py + 110, getText('task.chainNeed', {
      item: targetId ? getPropName(targetId) : '', count: targetCount
    }), {
      fontSize: isEnglish ? '24px' : '28px', color: '#ffffff', fontStyle: 'bold',
      wordWrap: { width: panelW - 100 }, align: 'center'
    }).setOrigin(0.5));

    if (chain.length <= 1) {
      container.add(this.scene.add.text(width / 2, py + panelH / 2, getText('task.chainDirect'), {
        fontSize: '26px', color: '#9fa4b8'
      }).setOrigin(0.5));
      return;
    }

    const cellW = 140;
    const cellH = 142;
    const gapX = 30;
    const gapY = 26;
    const contentW = cols * cellW + (cols - 1) * gapX;
    const startX = px + (panelW - contentW) / 2 + cellW / 2;
    const startY = py + 205;
    path.forEach((id, index) => {
      const row = Math.floor(index / cols);
      // 第二行反向排布，让路径从第一行末尾自然向下再向左延续。
      const col = row % 2 === 0 ? index % cols : cols - 1 - (index % cols);
      const x = startX + col * (cellW + gapX);
      const y = startY + row * (cellH + gapY);
      const box = this.scene.add.graphics();
      const isSpawner = id === spawnerId;
      drawUiBox(box, x, y, cellW, cellH, {
        fill: UI_SLOT_FILL, fillAlpha: 0.9,
        stroke: isSpawner ? UI_GOLD : UI_STROKE, strokeAlpha: 0.9, strokeWidth: isSpawner ? 2 : 1, radius: 10
      });
      container.add(box);
      const iconKey = getItemIconKey(id, this.scene.textures);
      if (iconKey && this.scene.textures.exists(iconKey)) {
        container.add(this.scene.add.image(x, y - 24, iconKey).setDisplaySize(64, 64));
      } else {
        const fallback = this.scene.add.graphics();
        fallback.fillStyle(colorFromId(id), 1);
        fallback.fillRoundedRect(x - 32, y - 56, 64, 64, 10);
        container.add(fallback);
      }
      if (isSpawner) {
        container.add(this.scene.add.text(x, y - 62, getText('task.chainSpawner'), {
          fontSize: '13px', color: '#ffd75e', fontStyle: 'bold'
        }).setOrigin(0.5));
      }
      container.add(this.scene.add.text(x, y + 29, getPropName(id), {
        fontSize: isEnglish ? '16px' : '20px', color: '#ffffff', fontStyle: 'bold', align: 'center',
        wordWrap: { width: cellW - 18 }, maxLines: 2
      }).setOrigin(0.5));
      container.add(this.scene.add.text(x, y + 59, getText('item.level', { level: getProp(id)?.luna ?? 1 }), {
        fontSize: '16px', color: '#9fa4b8'
      }).setOrigin(0.5));
      if (index < path.length - 1 && index % cols < cols - 1) {
        const movingRight = row % 2 === 0;
        const label = index === 0 ? (movingRight ? '>' : '<') : (movingRight ? 'x2 >' : '< x2');
        const arrowX = x + (movingRight ? cellW / 2 + gapX / 2 : -cellW / 2 - gapX / 2);
        container.add(this.scene.add.text(arrowX, y, label, {
          fontSize: '20px', color: '#ffd75e', fontStyle: 'bold'
        }).setOrigin(0.5));
      } else if (index < path.length - 1) {
        container.add(this.scene.add.text(x, y + cellH / 2 + gapY / 2, 'x2 v', {
          fontSize: '18px', color: '#ffd75e', fontStyle: 'bold'
        }).setOrigin(0.5));
      }
    });
    container.add(this.scene.add.text(width / 2, py + panelH - 34, getText('task.chainHint'), {
      fontSize: '20px', color: '#9fa4b8'
    }).setOrigin(0.5));
  }
}
