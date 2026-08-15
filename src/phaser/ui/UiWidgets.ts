import * as Phaser from 'phaser';
import { IUiBoxOpts, drawUiBox } from './UiStyle';

/**
 * 场景级共享 UI 小组件：toast 提示 + 全屏背景 + 统一按钮
 */

export interface IToastOpts {
  /** 垂直位置（屏高比例），默认 0.75 */
  yRatio?: number;
  /** 字号，默认 28px */
  fontSize?: string;
  /** true = 上飘淡出（GameScene 风格）；false/缺省 = 原地停留后淡出（BaseScene/NightScene 风格） */
  rise?: boolean;
}

/** 每个场景复用同一个 toast 文本对象（场景 shutdown 销毁后自动重建） */
const toastByScene = new WeakMap<Phaser.Scene, Phaser.GameObjects.Text>();

/** 屏幕中下部弹一条 toast，停留片刻后淡出 */
export function showSceneToast(scene: Phaser.Scene, msg: string, opts: IToastOpts = {}): void {
  const yRatio = opts.yRatio ?? 0.75;
  const y = scene.scale.height * yRatio;
  let t = toastByScene.get(scene);
  // 场景 shutdown 会销毁旧文本（destroy 后 scene 置空）；继续持有销毁对象渲染会 drawImage null 崩溃
  if (t && !t.scene) {
    toastByScene.delete(scene);
    t = undefined;
  }
  if (!t) {
    t = scene.add.text(scene.scale.width / 2, y, '', {
      fontSize: opts.fontSize ?? '28px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setVisible(false).setDepth(1000);
    toastByScene.set(scene, t);
  }

  t.setText(msg).setVisible(true).setAlpha(1);
  scene.tweens.killTweensOf(t);
  if (opts.rise) {
    scene.tweens.add({
      targets: t,
      alpha: 0,
      y: y - 40,
      duration: 1500,
      onComplete: () => {
        t.setVisible(false).setY(y);
      }
    });
  } else {
    scene.tweens.add({
      targets: t,
      alpha: 0,
      delay: 1500,
      duration: 400,
      onComplete: () => t.setVisible(false)
    });
  }
}

/** 全屏铺 bg-main 主背景（纹理缺失时保持纯色底；tint 用于夜晚压暗） */
export function addFullscreenBg(scene: Phaser.Scene, tint?: number): void {
  if (!scene.textures.exists('bg-main')) return;
  const img = scene.add.image(scene.scale.width / 2, scene.scale.height / 2, 'bg-main')
    .setDisplaySize(scene.scale.width, scene.scale.height)
    .setDepth(-100);
  if (tint !== undefined) img.setTint(tint);
}

export interface IUiButtonOpts {
  /** 按钮底样式（drawUiBox 参数），缺省 = 深色底 + 淡金描边 */
  box?: IUiBoxOpts;
  /** 字号，默认 26px */
  fontSize?: string;
  /** 字色，默认 #ffffff */
  color?: string;
  /** 同时设置到底与文本（同一 depth，创建顺序保证文字在底之上） */
  depth?: number;
}

export interface IUiButton {
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
}

/**
 * 统一按钮：drawUiBox 圆角底 + 居中加粗文本 + 按下 0.7 / 抬起触发 / 移出还原。
 * parent 非空时加入该容器（面板内按钮），否则挂在场景根。
 */
export function makeUiButton(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container | null,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: IUiButtonOpts = {},
  onTap: () => void
): IUiButton {
  const bg = scene.add.graphics();
  drawUiBox(bg, x, y, w, h, opts.box);
  bg.setInteractive(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  bg.on('pointerdown', () => bg.setAlpha(0.7));
  bg.on('pointerup', () => {
    bg.setAlpha(1);
    onTap();
  });
  bg.on('pointerout', () => bg.setAlpha(1));
  const text = scene.add.text(x, y, label, {
    fontSize: opts.fontSize ?? '26px',
    color: opts.color ?? '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(0.5);
  if (opts.depth !== undefined) {
    bg.setDepth(opts.depth);
    text.setDepth(opts.depth);
  }
  if (parent) parent.add([bg, text]);
  return { bg, text };
}
