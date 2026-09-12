import * as Phaser from 'phaser';
import { getProp, getSpawnerProductView, getClickProducts, ISpawnerProductView } from '../../core/config/PropConfig';
import { CORE_LEVEL_MAX, getCoreProductsAt } from '../../core/config/CoreConfig';
import { getItemIconKey, colorFromId } from '../config/ItemIconMap';
import { UI_GOLD, UI_GREEN, UI_GREEN_FILL, UI_SLOT_FILL, UI_STROKE, drawUiBox } from './UiStyle';
import { BasePanel } from './BasePanel';
import { getLanguage, getPropName, getText } from '../../core/i18n';

/** 面板视图模型：道具视图（发射器链）与核心视图共用同一套绘制 */
interface IProductsView {
  title: string;
  products: ISpawnerProductView[];
  /** 当前等级产出总权重（算概率） */
  totalWeight: number;
  emptyText: string;
  hint: string;
}

/**
 * 产出一览弹窗
 * - 发射器：沿 id+1 链展示整条链的产出（当前等级可产出 + 更高等级解锁）；
 * - 基地核心：按核心等级 1~6 展示产出池（当前等级可产出 + 升级后解锁）。
 */
export class SpawnerProductsPanel extends BasePanel {
  constructor(scene: Phaser.Scene) {
    super(scene, { depth: 600, persistent: true });
  }

  isVisible(): boolean {
    return this.isOpen;
  }

  open(spawnerId: number): void {
    super.open();
    const spawnerProp = getProp(spawnerId);
    const currentList = getClickProducts(spawnerId);
    this.render({
      title: getText('spawner.title', {
        name: spawnerProp ? getPropName(spawnerId) : getText('spawner.defaultName'),
        level: spawnerProp?.luna ?? 1
      }),
      products: getSpawnerProductView(spawnerId),
      totalWeight: currentList.reduce((s, p) => s + p.weight, 0) || 1,
      emptyText: getText('spawner.empty'),
      hint: getText('spawner.hint')
    });
  }

  /** 基地核心产出一览：解锁等级按核心等级（1~6）计算，等级名与核心同级 */
  openCore(level: number): void {
    super.open();
    const currentList = getCoreProductsAt(level);
    const weights = new Map(currentList.map(p => [p.id, p.weight]));
    const map = new Map<number, ISpawnerProductView>();
    for (let lv = 1; lv <= CORE_LEVEL_MAX; lv++) {
      for (const p of getCoreProductsAt(lv)) {
        const exist = map.get(p.id);
        if (!exist) {
          map.set(p.id, { id: p.id, weight: 0, unlockLevel: lv, unlocked: false });
        } else if (lv < exist.unlockLevel) {
          exist.unlockLevel = lv;
        }
      }
    }
    for (const view of map.values()) {
      const w = weights.get(view.id);
      if (w !== undefined) {
        view.weight = w;
        view.unlocked = true;
      }
    }
    const products = [...map.values()].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (a.unlocked) return b.weight - a.weight;
      return a.unlockLevel - b.unlockLevel;
    });
    this.render({
      title: getText('core.productsTitle', { level }),
      products,
      totalWeight: currentList.reduce((s, p) => s + p.weight, 0) || 1,
      emptyText: getText('spawner.empty'),
      hint: getText('core.productsHint')
    });
  }

  private render(view: IProductsView): void {
    if (!this.container) return;
    this.container.removeAll(true);

    const { width, height } = this.scene.scale;
    const { products, totalWeight } = view;
    const isEnglish = getLanguage() === 'en';

    // 遮罩（点击关闭）
    this.addMask(() => this.close(), 0.6);

    // 面板尺寸按内容精确计算（代码绘制底板，边距可控）
    const cols = 4;
    const cellW = 150;
    const cellH = 190;
    const gap = 16;
    const padX = 30;
    const titleH = 74;
    const hintH = 46;
    const rows = Math.max(1, Math.ceil(products.length / cols));
    const panelW = cols * cellW + (cols - 1) * gap + padX * 2;
    const panelH = Math.min(titleH + rows * cellH + (rows - 1) * gap + 24 + hintH, height * 0.85);

    // 底板（深色 + 金描边）+ 标题 + 标题下分隔线 + 右上角 48×48 关闭块
    const { px, py } = this.addPanelChrome(view.title, panelW, panelH, {
      box: { fillAlpha: 0.97, stroke: UI_GOLD, strokeAlpha: 0.5, strokeWidth: 2, radius: 20 },
      titleY: 38,
      titleFontSize: '30px',
      titleColor: '#ffffff',
      titlePadding: { top: 6, bottom: 4 },
      closeStyle: 'box',
      dividerY: titleH,
      dividerPad: padX
    });

    if (products.length <= 0) {
      const empty = this.scene.add.text(width / 2, py + panelH / 2, view.emptyText, {
        fontSize: '24px',
        color: '#888888'
      }).setOrigin(0.5);
      this.container.add(empty);
      return;
    }

    const startY = py + titleH + 12;
    for (let i = 0; i < products.length; i++) {
      const item = products[i];
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = px + padX + c * (cellW + gap) + cellW / 2;
      const y = startY + r * (cellH + gap) + cellH / 2;

      // 槽底：已解锁绿描边，未解锁灰暗
      const slot = this.scene.add.graphics();
      if (item.unlocked) {
        drawUiBox(slot, x, y, cellW, cellH, {
          fill: UI_GREEN_FILL, fillAlpha: 0.92, stroke: UI_GREEN, strokeAlpha: 0.9, strokeWidth: 2, radius: 12
        });
      } else {
        drawUiBox(slot, x, y, cellW, cellH, {
          fill: UI_SLOT_FILL, fillAlpha: 0.6, stroke: UI_STROKE, strokeAlpha: 0.4, strokeWidth: 2, radius: 12
        });
      }
      this.container.add(slot);

      const iconKey = getItemIconKey(item.id, this.scene.textures);
      const iconY = y - cellH / 2 + 56;
      if (iconKey && this.scene.textures.exists(iconKey)) {
        const img = this.scene.add.image(x, iconY, iconKey).setDisplaySize(88, 88);
        if (!item.unlocked) img.setTint(0x555555).setAlpha(0.6);
        this.container.add(img);
      } else {
        const iconG = this.scene.add.graphics();
        iconG.fillStyle(item.unlocked ? colorFromId(item.id) : 0x555555, 1);
        iconG.fillRoundedRect(x - 44, iconY - 44, 88, 88, 10);
        this.container.add(iconG);
      }

      const name = this.scene.add.text(x, isEnglish ? y - cellH / 2 + 124 : y - cellH / 2 + 112,
        isEnglish ? getPropName(item.id) : getPropName(item.id).substring(0, 5), {
        fontSize: isEnglish ? '18px' : '22px',
        color: item.unlocked ? '#ffffff' : '#777777',
        align: 'center',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
        padding: { top: 4, bottom: 2 },
        wordWrap: isEnglish ? { width: cellW - 14, useAdvancedWrap: true } : undefined,
        maxLines: isEnglish ? 2 : undefined
      }).setOrigin(0.5);
      this.container.add(name);

      // 状态行：已解锁显示概率，未解锁显示解锁等级
      const statusText = item.unlocked
        ? getText('spawner.chance', { chance: Math.round((item.weight / totalWeight) * 100) })
        : getText('spawner.unlockAt', { level: item.unlockLevel });
      const status = this.scene.add.text(x, isEnglish ? y - cellH / 2 + 168 : y - cellH / 2 + 142, statusText, {
        fontSize: isEnglish ? '16px' : '22px',
        color: item.unlocked ? '#8ce99a' : '#ff8787',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
        padding: { top: 4, bottom: 2 },
        wordWrap: isEnglish ? { width: cellW - 10, useAdvancedWrap: true } : undefined,
        maxLines: isEnglish ? 1 : undefined
      }).setOrigin(0.5);
      this.container.add(status);
    }

    // 底部提示
    const hint = this.scene.add.text(width / 2, py + panelH - hintH / 2 - 6, view.hint, {
      fontSize: '20px', color: '#777788',
      padding: { top: 4, bottom: 2 },
      wordWrap: { width: panelW - 60, useAdvancedWrap: true },
      align: 'center'
    }).setOrigin(0.5);
    this.container.add(hint);
  }
}
