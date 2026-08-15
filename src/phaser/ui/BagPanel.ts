import * as Phaser from 'phaser';
import { getProp } from '../../core/config/PropConfig';
import { getBagGridPrice } from '../../core/config/TableConfig';
import { colorFromId } from '../objects/ItemSprite';
import { getItemIconKey } from '../config/ItemIconMap';
import { UI_FILL, UI_GREEN, UI_GREEN_FILL, UI_STROKE, drawUiBox } from './UiStyle';
import { BasePanel } from './BasePanel';
import { getLanguage, getPropName, getText } from '../../core/i18n';

/**
 * 背包弹窗：网格显示背包内容，点击取出，末位 + 格扩容
 * 底板与其他面板一致走 drawUiBox 代码绘制（panel-bg 贴图已弃用）
 */
export class BagPanel extends BasePanel {
  /** 由 GameScene 注入 */
  getBagSlots: () => ({ id: number } | null)[] = () => [];
  onTakeOut: (index: number) => void = () => {};
  onAddSlot: () => void = () => {};

  constructor(scene: Phaser.Scene) {
    super(scene, { depth: 500, persistent: true });
  }

  isVisible(): boolean {
    return this.isOpen;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    super.open();
    this.refresh();
  }

  refresh(): void {
    if (!this.isOpen || !this.container) return;
    this.container.removeAll(true);

    // 遮罩（点击关闭）
    this.addMask(() => this.close(), 0.6);

    const slots = this.getBagSlots();
    const cols = 4;
    const cellSize = 150;
    const gap = 16;
    const rows = Math.ceil((slots.length + 1) / cols);
    const panelW = cols * (cellSize + gap) + gap;
    const panelH = rows * (cellSize + gap) + gap + 70;

    const { px, py } = this.addPanelChrome(getText('panel.backpack'), panelW, panelH, {
      titleY: 34,
      titleFontSize: '30px',
      titleColor: '#ffffff',
      closeStyle: 'none' // 无 ✕，靠点遮罩关闭
    });

    const startY = py + 70;
    for (let i = 0; i <= slots.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = px + gap + c * (cellSize + gap) + cellSize / 2;
      const y = startY + r * (cellSize + gap) + cellSize / 2;

      const isAddBtn = i === slots.length;
      // Graphics 圆角槽底：普通槽深色底，+ 扩容槽带绿色调
      const slot = this.scene.add.graphics();
      if (isAddBtn) {
        drawUiBox(slot, x, y, cellSize, cellSize, {
          fill: UI_GREEN_FILL, fillAlpha: 0.6, stroke: UI_GREEN, strokeAlpha: 0.6, radius: 12
        });
      } else {
        drawUiBox(slot, x, y, cellSize, cellSize, {
          fill: UI_FILL, fillAlpha: 0.55, stroke: UI_STROKE, strokeAlpha: 0.5, radius: 12
        });
      }
      this.container.add(slot);

      if (isAddBtn) {
        const price = getBagGridPrice(slots.length);
        const label = this.scene.add.text(x, y, price > 0 ? getText('bag.addSlotCost', { price }) : '+', {
          fontSize: '24px',
          color: '#51cf66',
          align: 'center',
          fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(label);
        slot.setInteractive(new Phaser.Geom.Rectangle(x - cellSize / 2, y - cellSize / 2, cellSize, cellSize), Phaser.Geom.Rectangle.Contains);
        slot.on('pointerup', () => this.onAddSlot());
      } else {
        const item = slots[i];
        if (item) {
          const prop = getProp(item.id);
          // 有图标映射用真实图标，缺失回退色块
          const iconKey = getItemIconKey(item.id, this.scene.textures);
          if (iconKey && this.scene.textures.exists(iconKey)) {
            const img = this.scene.add.image(x, y - 10, iconKey)
              .setDisplaySize(cellSize - 40, cellSize - 40);
            this.container.add(img);
          } else {
            slot.fillStyle(colorFromId(item.id), 1);
            slot.fillRoundedRect(x - cellSize / 2 + 6, y - cellSize / 2 + 6, cellSize - 12, cellSize - 12, 10);
          }
          const isEnglish = getLanguage() === 'en';
          const label = this.scene.add.text(x, isEnglish ? y + cellSize / 2 - 38 : y + cellSize / 2 - 22,
            prop ? (isEnglish ? getPropName(prop.id) : getPropName(prop.id).substring(0, 4)) : `${item.id}`, {
            fontSize: isEnglish ? '18px' : '20px',
            color: '#ffffff',
            align: 'center',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
            wordWrap: isEnglish ? { width: cellSize - 16, useAdvancedWrap: true } : undefined,
            maxLines: isEnglish ? 2 : undefined
          }).setOrigin(0.5);
          this.container.add(label);
        }
        slot.setInteractive(new Phaser.Geom.Rectangle(x - cellSize / 2, y - cellSize / 2, cellSize, cellSize), Phaser.Geom.Rectangle.Contains);
        slot.on('pointerup', () => {
          if (slots[i]) {
            this.onTakeOut(i);
          }
        });
      }
    }
  }
}
