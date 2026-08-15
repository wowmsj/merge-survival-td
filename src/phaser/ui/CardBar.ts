import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { getText } from '../../core/i18n';
import { getItemIconKey } from '../config/ItemIconMap';
import { UI_FILL, UI_GOLD, UI_SLOT_FILL, UI_STROKE, drawUiBox } from './UiStyle';

const BOTTOM_BAR_Y = 1674;
const CARD_SLOT_PITCH = 124;

/**
 * 卡片栏：显示最新 3 张；超出时可展开全部卡牌。
 */
export class CardBar {
  private scene: Phaser.Scene;
  private state: IGameState;
  private container: Phaser.GameObjects.Container;
  private allCards: Phaser.GameObjects.Container | null = null;
  private wheelHandler: ((pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[], dx: number, dy: number) => void) | null = null;

  /** 由 GameScene 注入 */
  onUseCard: (index: number) => void = () => {};
  onOpenAllCards: () => void = () => {};

  constructor(scene: Phaser.Scene, state: IGameState) {
    this.scene = scene;
    this.state = state;
    this.container = scene.add.container(24, BOTTOM_BAR_Y).setDepth(100);

    const title = scene.add.text(0, -30, getText('card.title'), {
      fontSize: '26px',
      color: '#ffffff',
      fontStyle: 'bold'
    });
    this.container.add(title);

    this.refresh();
  }

  refresh(): void {
    this.container.each((child: Phaser.GameObjects.GameObject) => {
      if ((child as any).getData && (child as any).getData('cardItem')) {
        child.destroy();
      }
    });

    const cards = this.state.cardArr;
    // 最多显示 3 张（末 3 张），数量 > 3 时最末槽显示总数
    const showCount = Math.min(3, cards.length);
    for (let i = 0; i < 3; i++) {
      const x = i * CARD_SLOT_PITCH;
      const hasCard = i < showCount;
      // Graphics 圆角槽：有卡正常底，空槽更低 alpha
      const bg = this.scene.add.graphics().setData('cardItem', true);
      if (hasCard) {
        drawUiBox(bg, x + 60, 60, 120, 120, {
          fill: UI_SLOT_FILL, fillAlpha: 0.9, stroke: UI_STROKE, strokeAlpha: 0.8, radius: 12
        });
      } else {
        drawUiBox(bg, x + 60, 60, 120, 120, {
          fill: UI_FILL, fillAlpha: 0.4, stroke: UI_STROKE, strokeAlpha: 0.5, radius: 12
        });
      }
      this.container.add(bg);

      if (hasCard) {
        const id = cards[cards.length - 1 - i];
        const iconKey = getItemIconKey(id, this.scene.textures);
        const cardIndex = cards.length - 1 - i;
        if (iconKey) {
          const icon = this.scene.add.image(x + 60, 60, iconKey)
            .setDisplaySize(92, 92)
            .setData('cardItem', true);
          this.container.add(icon);
        }

        if (i === 0) {
          bg.setInteractive(new Phaser.Geom.Rectangle(x, 0, 120, 120), Phaser.Geom.Rectangle.Contains);
          bg.on('pointerup', () => this.onUseCard(cardIndex));
        }
      }
    }

    const remaining = Math.max(0, cards.length - 3);
    if (remaining > 0) this.addMoreButton(3 * CARD_SLOT_PITCH, remaining);
    if (this.allCards) this.openAllCards();
  }

  get isOpen(): boolean {
    return this.allCards !== null;
  }

  private addMoreButton(x: number, remaining: number): void {
    const bg = this.scene.add.graphics().setData('cardItem', true);
    drawUiBox(bg, x + 60, 60, 120, 120, {
      fill: UI_FILL, fillAlpha: 0.9, stroke: UI_GOLD, strokeAlpha: 0.8, radius: 12
    });
    bg.setInteractive(new Phaser.Geom.Rectangle(x, 0, 120, 120), Phaser.Geom.Rectangle.Contains);
    bg.on('pointerup', () => this.openAllCards());
    this.container.add(bg);
    this.container.add(this.scene.add.text(x + 60, 46, `+${remaining}`, {
      fontSize: '32px', color: '#ffd75e', fontStyle: 'bold'
    }).setOrigin(0.5).setData('cardItem', true));
    this.container.add(this.scene.add.text(x + 60, 78, getText('card.more'), {
      fontSize: '20px', color: '#bfc5d8', fontStyle: 'bold'
    }).setOrigin(0.5).setData('cardItem', true));
  }

  private openAllCards(): void {
    this.closeAllCards();
    this.onOpenAllCards();
    const { width, height } = this.scene.scale;
    const panelW = Math.min(width - 80, 900);
    const panelH = Math.min(height - 180, 1120);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    const panel = this.scene.add.container(0, 0).setDepth(650);
    this.allCards = panel;

    const mask = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.68).setOrigin(0).setInteractive();
    mask.on('pointerup', () => this.closeAllCards());
    panel.add(mask);
    const chrome = this.scene.add.graphics();
    drawUiBox(chrome, width / 2, height / 2, panelW, panelH, {
      fill: UI_SLOT_FILL, fillAlpha: 0.98, stroke: UI_GOLD, strokeAlpha: 0.8, strokeWidth: 2, radius: 20
    });
    panel.add(chrome);
    panel.add(this.scene.add.text(width / 2, py + 45, getText('card.allTitle'), {
      fontSize: '34px', color: '#ffd75e', fontStyle: 'bold'
    }).setOrigin(0.5));
    const close = this.scene.add.text(px + panelW - 42, py + 42, '×', {
      fontSize: '42px', color: '#c7ccdc', fontStyle: 'bold'
    }).setOrigin(0.5).setInteractive();
    close.on('pointerup', () => this.closeAllCards());
    panel.add(close);

    const listTop = py + 100;
    const listBottom = py + panelH - 58;
    const listHeight = listBottom - listTop;
    const list = this.scene.add.container(0, 0);
    const clipShape = this.scene.make.graphics();
    clipShape.fillRect(px + 30, listTop, panelW - 60, listHeight);
    list.setMask(clipShape.createGeometryMask());
    panel.add(list);

    const cols = 5;
    const cellW = 142;
    const cellH = 146;
    const gap = 20;
    const contentW = cols * cellW + (cols - 1) * gap;
    const startX = width / 2 - contentW / 2 + cellW / 2;
    const cards = this.state.cardArr;
    cards.slice().reverse().forEach((id, displayIndex) => {
      const row = Math.floor(displayIndex / cols);
      const col = displayIndex % cols;
      const x = startX + col * (cellW + gap);
      const y = listTop + cellH / 2 + row * (cellH + gap);
      const cardIndex = cards.length - 1 - displayIndex;
      const bg = this.scene.add.graphics();
      drawUiBox(bg, x, y, cellW, cellH, { fill: UI_SLOT_FILL, fillAlpha: 0.94, stroke: UI_STROKE, strokeAlpha: 0.9, radius: 12 });
      bg.setInteractive(new Phaser.Geom.Rectangle(x - cellW / 2, y - cellH / 2, cellW, cellH), Phaser.Geom.Rectangle.Contains);
      bg.on('pointerup', () => this.onUseCard(cardIndex));
      list.add(bg);
      const iconKey = getItemIconKey(id, this.scene.textures);
      if (iconKey) list.add(this.scene.add.image(x, y, iconKey).setDisplaySize(104, 104));
    });

    const rows = Math.ceil(cards.length / cols);
    const contentHeight = rows * cellH + Math.max(0, rows - 1) * gap;
    const maxScroll = Math.max(0, contentHeight - listHeight);
    let scrollY = 0;
    if (maxScroll > 0) {
      this.wheelHandler = (_pointer, _objects, _dx, dy) => {
        scrollY = Phaser.Math.Clamp(scrollY + dy * 0.6, 0, maxScroll);
        list.y = -scrollY;
      };
      this.scene.input.on('wheel', this.wheelHandler);
    }
    panel.add(this.scene.add.text(width / 2, py + panelH - 27, getText('card.hint'), {
      fontSize: '20px', color: '#a9afc0'
    }).setOrigin(0.5));
  }

  private closeAllCards(): void {
    if (this.wheelHandler) {
      this.scene.input.off('wheel', this.wheelHandler);
      this.wheelHandler = null;
    }
    this.allCards?.destroy();
    this.allCards = null;
  }
}
