import * as Phaser from 'phaser';
import { IUiBoxOpts, UI_CARD_FILL, UI_FILL, UI_STROKE, drawUiBox } from './UiStyle';
import { makeUiButton } from './UiWidgets';

export interface IBasePanelOpts {
  /** 容器 depth，默认 850（图鉴/剧情回顾档）；Bag=500、Spawner=600 */
  depth?: number;
  /**
   * true = 持久模式：构造即建容器，open/close 只切可见性（BagPanel/SpawnerProductsPanel 风格）；
   * false/缺省 = 一次性模式：open 新建容器、close 销毁（CharacterPanel/StoryArchivePanel 风格）
   */
  persistent?: boolean;
}

export interface IPanelChromeOpts {
  /** 面板底样式，缺省 { fill: UI_FILL, fillAlpha: 0.98, radius: 20 } */
  box?: IUiBoxOpts;
  /** 标题中心 y（相对面板顶），默认 46 */
  titleY?: number;
  /** 标题字号，默认 34px */
  titleFontSize?: string;
  /** 标题字色，默认 #ffd75e */
  titleColor?: string;
  /** 标题 padding（SpawnerProductsPanel 用） */
  titlePadding?: Phaser.Types.GameObjects.Text.TextPadding;
  /**
   * 关闭按钮样式：
   * 'x'（默认）= 右上 ✕ 文本（图鉴/剧情回顾风格）；
   * 'box' = 右上 48×48 圆角块 + ×（SpawnerProductsPanel 风格）；
   * 'none' = 不要关闭按钮（BagPanel，靠点遮罩关闭）
   */
  closeStyle?: 'x' | 'box' | 'none';
  /** 'x' 关闭按钮中心 y（相对面板顶），默认 38 */
  closeY?: number;
  /** 标题下分隔线 y（相对面板顶）；缺省不画 */
  dividerY?: number;
  /** 分隔线左右内边距，默认 40 */
  dividerPad?: number;
}

/**
 * 弹窗骨架基类：容器 + depth 管理、open/close/isOpen 生命周期，
 * 以及三件共享零件——全屏遮罩（addMask）、居中面板底板+标题+✕+分隔线（addPanelChrome）、
 * 翻页按钮（addPageButton，170×60，以 CharacterPanel/StoryArchivePanel 两份逐字节相同的拷贝为准）。
 * 子类负责在 open/render 里填充自己的内容。
 */
export class BasePanel {
  protected scene: Phaser.Scene;
  protected container: Phaser.GameObjects.Container | null = null;
  private readonly depth: number;
  private readonly persistent: boolean;
  /** 持久模式的可见标记（非持久模式看 container 是否为 null） */
  private shown = false;

  constructor(scene: Phaser.Scene, opts: IBasePanelOpts = {}) {
    this.scene = scene;
    this.depth = opts.depth ?? 850;
    this.persistent = opts.persistent ?? false;
    if (this.persistent) {
      this.container = scene.add.container(0, 0).setDepth(this.depth).setVisible(false);
    }
  }

  get isOpen(): boolean {
    return this.persistent ? this.shown : this.container !== null;
  }

  // 子类可用带参签名覆盖（如 SpawnerProductsPanel.open(spawnerId)）
  open(..._args: any[]): void {
    if (this.persistent) {
      this.shown = true;
      this.container!.setVisible(true);
    } else {
      this.close();
      this.container = this.scene.add.container(0, 0).setDepth(this.depth);
    }
  }

  close(): void {
    if (this.persistent) {
      this.shown = false;
      this.container?.setVisible(false);
    } else if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }

  /**
   * 全屏半透明遮罩：setInteractive 阻断穿透点击到棋盘（所有面板都依赖这一点）。
   * 传 onClose 时点击遮罩关闭（Bag/Spawner 风格，alpha 0.6）；不传仅压暗（图鉴/剧情回顾风格，alpha 0.7）。
   */
  protected addMask(onClose?: () => void, alpha = 0.7): void {
    if (!this.container) return;
    const { width, height } = this.scene.scale;
    const mask = this.scene.add.rectangle(0, 0, width, height, 0x000000, alpha).setOrigin(0).setInteractive();
    if (onClose) mask.on('pointerup', onClose);
    this.container.add(mask);
  }

  /**
   * 居中面板骨架：圆角底板 + 标题（可空）+ 右上关闭按钮（可选样式）+ 标题下分隔线（可选）。
   * 返回面板左上角坐标 { px, py }，供子类继续排版内容。
   */
  protected addPanelChrome(title: string | null, w: number, h: number, opts: IPanelChromeOpts = {}): { px: number; py: number } {
    const { width, height } = this.scene.scale;
    const px = (width - w) / 2;
    const py = (height - h) / 2;

    const panel = this.scene.add.graphics();
    drawUiBox(panel, width / 2, height / 2, w, h, opts.box ?? { fill: UI_FILL, fillAlpha: 0.98, radius: 20 });
    this.container!.add(panel);

    if (title !== null) {
      this.container!.add(this.scene.add.text(width / 2, py + (opts.titleY ?? 46), title, {
        fontSize: opts.titleFontSize ?? '34px',
        color: opts.titleColor ?? '#ffd75e',
        fontStyle: 'bold',
        padding: opts.titlePadding
      }).setOrigin(0.5));
    }

    const closeStyle = opts.closeStyle ?? 'x';
    if (closeStyle === 'x') {
      const closeBtn = this.scene.add.text(px + w - 36, py + (opts.closeY ?? 38), '✕', {
        fontSize: '36px', color: '#8f94a8', fontStyle: 'bold'
      }).setOrigin(0.5).setInteractive();
      closeBtn.on('pointerup', () => this.close());
      this.container!.add(closeBtn);
    } else if (closeStyle === 'box') {
      // 48×48 圆角块 + ×（块无按压反馈，与 SpawnerProductsPanel 原实现一致）
      const closeG = this.scene.add.graphics();
      drawUiBox(closeG, px + w - 44, py + 38, 48, 48, { fillAlpha: 0.9, radius: 12 });
      closeG.setInteractive(new Phaser.Geom.Rectangle(px + w - 68, py + 14, 48, 48), Phaser.Geom.Rectangle.Contains);
      closeG.on('pointerup', () => this.close());
      this.container!.add(closeG);
      this.container!.add(this.scene.add.text(px + w - 44, py + 37, '×', {
        fontSize: '36px', color: '#ccccdd', fontStyle: 'bold'
      }).setOrigin(0.5));
    }

    if (opts.dividerY !== undefined) {
      const pad = opts.dividerPad ?? 40;
      const divider = this.scene.add.graphics();
      divider.lineStyle(2, UI_STROKE, 0.5);
      divider.lineBetween(px + pad, py + opts.dividerY, px + w - pad, py + opts.dividerY);
      this.container!.add(divider);
    }

    return { px, py };
  }

  /** 翻页按钮（170×60）：可用态走统一按钮；禁用态压暗不可点 */
  protected addPageButton(x: number, y: number, label: string, enabled: boolean, onTap: () => void): void {
    if (!this.container) return;
    const w = 170;
    const h = 60;
    if (enabled) {
      makeUiButton(this.scene, this.container, x, y, w, h, label, { box: { radius: 12 }, fontSize: '24px' }, onTap);
      return;
    }
    const g = this.scene.add.graphics();
    drawUiBox(g, x, y, w, h, { fill: UI_CARD_FILL, fillAlpha: 0.5, stroke: UI_STROKE, strokeAlpha: 0.3, radius: 12 });
    this.container.add(g);
    this.container.add(this.scene.add.text(x, y, label, {
      fontSize: '24px', color: '#555a6e', fontStyle: 'bold'
    }).setOrigin(0.5));
  }
}
