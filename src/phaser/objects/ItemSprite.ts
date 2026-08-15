import * as Phaser from 'phaser';
import { IItemData } from '../../core/types';
import { getProp, isAutoSpawner, isClickSpawner, isMaxBadgeItem } from '../../core/config/PropConfig';
import { itemInCd } from '../../core/model/Item';
import { getItemIconKey } from '../config/ItemIconMap';
import { getPropName, getText } from '../../core/i18n';

export const CELL_SIZE = 140;

/** 按 id 生成稳定颜色 */
export function colorFromId(id: number): number {
  const hue = (id * 137) % 360;
  const color = Phaser.Display.Color.HSLToColor(hue / 360, 0.55, 0.5);
  return color.color;
}

/**
 * 物品精灵（纯视觉，不处理交互）
 * 有图标映射的道具显示 icon_* / prop_* 真实图标，无映射的用色块+名称文字；
 * 等级角标 + 封印/气泡/锁覆盖 + CD 进度弧
 */
export class ItemSprite extends Phaser.GameObjects.Container {
  row: number;
  col: number;
  private bg: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private levelText: Phaser.GameObjects.Text;
  private cdArc: Phaser.GameObjects.Graphics;
  private iconSprite: Phaser.GameObjects.Image | null = null;
  private sealSprite: Phaser.GameObjects.Sprite | null = null;
  private bubbleSprite: Phaser.GameObjects.Sprite | null = null;
  private lockSprite: Phaser.GameObjects.Sprite | null = null;
  private gouSprite: Phaser.GameObjects.Sprite | null = null;
  private glowSprite: Phaser.GameObjects.Image | null = null;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private breathTween: Phaser.Tweens.Tween | null = null;
  /** CD 弧上一帧是否还在走（用于检测 CD 刚结束，恢复呼吸+光晕） */
  private cdWasActive = false;
  private item: IItemData | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, row: number, col: number) {
    super(scene, x, y);
    this.row = row;
    this.col = col;
    this.setSize(CELL_SIZE, CELL_SIZE);

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.nameText = scene.add.text(0, 0, '', {
      fontSize: '26px',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    this.add(this.nameText);

    this.levelText = scene.add.text(CELL_SIZE / 2 - 16, CELL_SIZE / 2 - 18, '', {
      fontSize: '22px',
      color: '#ffe066',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    this.add(this.levelText);

    this.cdArc = scene.add.graphics();
    this.add(this.cdArc);

    this.setVisible(false);
  }

  /** 刷新显示（taskNeeded: 是否被任务需要） */
  updateItem(item: IItemData | null, taskNeeded: boolean = false): void {
    this.item = item;
    this.bg.clear();
    this.cdArc.clear();
    this.nameText.setText('');
    this.levelText.setText('');
    this.clearIcon();
    this.clearOverlay('seal');
    this.clearOverlay('bubble');
    this.clearOverlay('lock');
    this.clearOverlay('gou');
    this.clearGlow();
    this.stopBreath();
    this.cdWasActive = false;

    if (!item) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    const prop = getProp(item.id);
    const color = colorFromId(item.id);
    const half = CELL_SIZE / 2;
    const status = item.st ?? 0;

    // 纸箱内保持神秘不显示图标；有图标映射且纹理加载成功时用真实图标
    const iconKey = status !== 2 ? getItemIconKey(item.id, this.scene.textures) : null;
    const showIcon = !!iconKey && this.scene.textures.exists(iconKey);

    // 纸箱内保持神秘，不画背景；无图标的画色块背景，有图标的靠格子底衬托
    if (status !== 2 && !showIcon) {
      this.bg.fillStyle(color, 1);
      this.bg.fillRoundedRect(-half + 4, -half + 4, CELL_SIZE - 8, CELL_SIZE - 8, 14);
    }

    // 真实图标（格子底之上、覆盖层之下）
    if (showIcon) {
      this.iconSprite = this.scene.add.image(0, 0, iconKey!)
        .setDisplaySize(CELL_SIZE - 24, CELL_SIZE - 24);
      this.add(this.iconSprite);
      // 恢复原有层级：等级角标、CD 弧在图标之上
      this.bringToTop(this.levelText);
      this.bringToTop(this.cdArc);
    }

    // 名称（纸箱不显示，有图标的不显示）
    if (status !== 2 && !showIcon) {
      this.nameText.setText(getPropName(item.id).substring(0, 4));
    }
    if (status !== 2) {
      // MAX 角标：合成链尾（发射器链尾除外）+ 不可合成的带级孤品（金币/能量宝箱等）
      if (prop && isMaxBadgeItem(item.id)) {
        this.levelText.setText('MAX');
      } else if (prop && prop.luna > 1) {
        this.levelText.setText(getText('item.level', { level: prop.luna }));
      }
    }

    // 封印覆盖
    if (status === 2) {
      this.sealSprite = this.scene.add.sprite(0, 0, 'carton').setDisplaySize(CELL_SIZE - 8, CELL_SIZE - 8);
      this.add(this.sealSprite);
    } else if (status === 1) {
      // 蜘蛛网：轻微压暗再叠网，既能看出封印状态又不遮挡道具图标
      this.bg.fillStyle(0x000000, 0.18);
      this.bg.fillRoundedRect(-half + 4, -half + 4, CELL_SIZE - 8, CELL_SIZE - 8, 14);
      this.sealSprite = this.scene.add.sprite(0, 0, 'spider').setDisplaySize(CELL_SIZE - 8, CELL_SIZE - 8);
      this.add(this.sealSprite);
    }

    // 气泡
    if (item.cdBubble) {
      this.bubbleSprite = this.scene.add.sprite(0, 0, 'bubble-mask').setDisplaySize(CELL_SIZE - 8, CELL_SIZE - 8);
      this.add(this.bubbleSprite);
    }

    // 锁（mdt=1 解锁型，未开始解锁时显示）
    if (prop && prop.mdt === 1 && !item.unlock && !itemInCd(item)) {
      this.lockSprite = this.scene.add.sprite(half - 26, -half + 26, 'lock').setDisplaySize(44, 44);
      this.add(this.lockSprite);
    }

    // 任务需要标记
    if (taskNeeded && status !== 2) {
      this.gouSprite = this.scene.add.sprite(-half + 20, -half + 20, 'task-gou').setDisplaySize(30, 30);
      this.add(this.gouSprite);
    }

    // 可产出呼吸动画
    this.maybeStartBreath();

    this.updateCd(Date.now());
  }

  /** 每帧刷新 CD 进度弧；检测到 CD 刚结束时恢复呼吸+光晕（否则点过一次就再也不发光了） */
  updateCd(nowMs: number): void {
    this.cdArc.clear();
    if (!this.item || !this.item.cd || !this.item.cdSum || this.item.cdSum <= 0) return;
    const remain = this.item.cd - nowMs;
    if (remain <= 0) {
      if (this.cdWasActive) {
        this.cdWasActive = false;
        this.maybeStartBreath();
      }
      return;
    }
    this.cdWasActive = true;
    const ratio = Math.min(1, remain / this.item.cdSum);

    this.cdArc.fillStyle(0x000000, 0.35);
    this.cdArc.fillRoundedRect(-CELL_SIZE / 2 + 4, -CELL_SIZE / 2 + 4, CELL_SIZE - 8, CELL_SIZE - 8, 14);
    this.cdArc.fillStyle(0xff922b, 0.4);
    this.cdArc.slice(0, 0, CELL_SIZE / 2 - 14, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * ratio), false);
    this.cdArc.fillPath();
    // 弧线描边保持清晰，便于读剩余进度
    this.cdArc.lineStyle(4, 0xff922b, 0.9);
    this.cdArc.beginPath();
    this.cdArc.arc(0, 0, CELL_SIZE / 2 - 14, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * ratio), false);
    this.cdArc.strokePath();
  }

  private clearIcon(): void {
    if (this.iconSprite) {
      this.iconSprite.destroy();
      this.iconSprite = null;
    }
  }

  private clearOverlay(kind: 'seal' | 'bubble' | 'lock' | 'gou'): void {
    const key = kind === 'seal' ? 'sealSprite' : kind === 'bubble' ? 'bubbleSprite' : kind === 'lock' ? 'lockSprite' : 'gouSprite';
    const sprite = this[key] as Phaser.GameObjects.Sprite | null;
    if (sprite) {
      sprite.destroy();
      (this as any)[key] = null;
    }
  }

  /** 可产出（点击/自动）时启动缩放呼吸；可点击产出时额外加金色光晕（引导文案「点击发光的物品」） */
  private maybeStartBreath(): void {
    const item = this.item;
    if (!item) return;
    const status = item.st ?? 0;
    const canClick = isClickSpawner(item.id) && (item.times ?? 0) > 0 && !itemInCd(item) && !item.cdBubble && !status;
    const canAuto = isAutoSpawner(item.id) && (item.timesAuto ?? 0) > 0 && !item.cdAuto && !item.cdBubble && !status;
    if (canClick) this.startGlow();
    if (canClick || canAuto) {
      this.startBreath();
    }
  }

  /** 金色光晕：垫在图标之下（index 1，bg 之上），加色混合 + 透明度呼吸，一眼认出「点我」 */
  private startGlow(): void {
    if (this.glowSprite || !this.scene.textures.exists('fx-glow')) return;
    this.glowSprite = this.scene.add.image(0, 0, 'fx-glow')
      .setDisplaySize(CELL_SIZE + 40, CELL_SIZE + 40)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.5);
    this.addAt(this.glowSprite, 1);
    this.glowTween = this.scene.tweens.add({
      targets: this.glowSprite,
      alpha: { from: 0.25, to: 0.8 },
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private clearGlow(): void {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = null;
    }
    if (this.glowSprite) {
      this.glowSprite.destroy();
      this.glowSprite = null;
    }
  }

  private startBreath(): void {
    if (this.breathTween) return;
    this.breathTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private stopBreath(): void {
    if (this.breathTween) {
      this.breathTween.stop();
      this.breathTween = null;
      this.setScale(1);
    }
  }

  /** 合成成功动画 */
  playMergeTween(): void {
    this.stopBreath();
    this.scene.tweens.chain({
      targets: this,
      tweens: [
        { scaleX: 0.85, scaleY: 0.85, duration: 80 },
        { scaleX: 1.08, scaleY: 1.08, duration: 120 },
        { scaleX: 0.97, scaleY: 0.97, duration: 80 },
        { scaleX: 1, scaleY: 1, duration: 80 }
      ],
      onComplete: () => this.maybeStartBreath()
    });
  }

  /**
   * 新物品生成动画
   * 注意必须先停呼吸：呼吸 tween（1↔1.05 无限循环）和生成 tween 同时写 scale 会互相打架，
   * 视觉上就是「从无到最大」的夸张弹跳；小幅缩放 + 淡入即可
   */
  playSpawnTween(): void {
    this.stopBreath();
    this.setScale(0.85);
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => this.maybeStartBreath()
    });
  }
}
