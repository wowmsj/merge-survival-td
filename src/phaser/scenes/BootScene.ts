import * as Phaser from 'phaser';
import { ITEM_ICON_KEYS } from '../config/ItemIconMap';
import { UI_GOLD, UI_SLOT_FILL, UI_STROKE, drawUiBox } from '../ui/UiStyle';
import { getText } from '../../core/i18n';

/** webpack DefinePlugin 注入的构建版本号（素材 URL 缓存破除用） */
declare const __ASSET_VERSION__: string;

/**
 * assets/images/ 下由 scripts/resize-assets.js 生成的真实素材（key 与文件名一致）。
 * preload 阶段加载，加载失败的 key 在 create 阶段回退到程序化生成。
 */
const UI_TEXTURE_KEYS = [
  'cell-bg', 'cell-select', 'cell-hint', 'bubble-mask',
  'carton', 'spider', 'lock', 'panel-bg', 'task-gou',
  // 第二批 UI 元素（无程序化回退，缺失时各 UI 组件自行回退纯色绘制）
  // res-icon-diamond / res-icon-star 已并入 ITEM_ICON_KEYS（道具图标复用），不在此重复加载
  'bg-main',
  'res-icon-lv', 'res-icon-coin', 'res-icon-power',
  'build-icon-core', 'build-icon-tower', 'build-icon-resource', 'build-icon-trap', 'build-icon-wall',
  // 剧情角色立绘
  'char-hero', 'char-laogui', 'char-xiaoman', 'char-beian',
  'char-mancang', 'char-laoqiang', 'char-pangshen', 'char-doctor', 'char-xiaodian',
  'char-douzi', 'char-wensente', 'char-tiezhua', 'char-officer'
];

/**
 * 启动场景
 * 优先加载 assets/images/ 真实素材；缺失的 UI 纹理回退程序化生成
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createLoadingUI();

    // 单个文件 404 不阻塞整体加载，create 阶段会对缺失 key 走程序化回退
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[BootScene] Asset load failed, using fallback: ${file.key}`);
    });
    for (const key of [...UI_TEXTURE_KEYS, ...ITEM_ICON_KEYS]) {
      // 带构建版本号查询串：素材更新后新 bundle 会请求新 URL，绕开浏览器缓存的旧图标
      this.load.image(key, `assets/images/${key}.webp?v=${__ASSET_VERSION__}`);
    }
  }

  /** Loading 页：标题 + 进度条 + 百分比（程序化绘制，自身不依赖任何素材） */
  private createLoadingUI(): void {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.add.text(cx, height * 0.38, getText('boot.title'), {
      fontSize: '96px', color: '#ffd166', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 8,
      padding: { top: 12, bottom: 6 }
    }).setOrigin(0.5);
    this.add.text(cx, height * 0.38 + 90, getText('boot.subtitle'), {
      fontSize: '30px', color: '#8899aa',
      padding: { top: 6, bottom: 4 }
    }).setOrigin(0.5);

    const barW = 720;
    const barH = 44;
    const barY = height * 0.56;
    const barBg = this.add.graphics();
    drawUiBox(barBg, cx, barY + barH / 2, barW, barH, {
      fill: UI_SLOT_FILL, fillAlpha: 0.9, stroke: UI_STROKE, strokeAlpha: 0.8, radius: 22
    });

    const barFill = this.add.graphics();
    const pctText = this.add.text(cx, barY + barH / 2, '0%', {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      padding: { top: 4, bottom: 2 }
    }).setOrigin(0.5);
    const tipText = this.add.text(cx, barY + barH + 40, getText('boot.loading'), {
      fontSize: '26px', color: '#8899aa',
      padding: { top: 4, bottom: 2 }
    }).setOrigin(0.5);
    this.tweens.add({ targets: tipText, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.load.on('progress', (value: number) => {
      barFill.clear();
      if (value > 0) {
        barFill.fillStyle(UI_GOLD, 1);
        barFill.fillRoundedRect(
          cx - barW / 2 + 6, barY + 6, Math.max(32, (barW - 12) * value), barH - 12, 16
        );
      }
      pctText.setText(`${Math.round(value * 100)}%`);
    });
    this.load.once('complete', () => {
      tipText.setText(getText('boot.ready'));
      this.tweens.killTweensOf(tipText);
      tipText.setAlpha(1);
    });
  }

  create(): void {
    this.generateTextures();
    this.scene.start('GameScene');
  }

  /** PNG 已加载成功的 key 跳过，只为缺失的 key 程序化生成纹理 */
  private generateTextures(): void {
    const size = 140;
    const radius = 16;

    // 格子背景
    if (!this.textures.exists('cell-bg')) {
      const g1 = this.make.graphics({ x: 0, y: 0 });
      g1.fillStyle(0x2a2a40, 1);
      g1.fillRoundedRect(0, 0, size, size, radius);
      g1.generateTexture('cell-bg', size, size);
      g1.destroy();
    }

    // 选中框（黄）
    if (!this.textures.exists('cell-select')) {
      const gs = this.make.graphics({ x: 0, y: 0 });
      gs.lineStyle(6, 0xffe066, 1);
      gs.strokeRoundedRect(3, 3, size - 6, size - 6, radius);
      gs.generateTexture('cell-select', size, size);
      gs.destroy();
    }

    // 合成提示框（绿）
    if (!this.textures.exists('cell-hint')) {
      const gh = this.make.graphics({ x: 0, y: 0 });
      gh.lineStyle(6, 0x51cf66, 1);
      gh.strokeRoundedRect(3, 3, size - 6, size - 6, radius);
      gh.generateTexture('cell-hint', size, size);
      gh.destroy();
    }

    // 气泡遮罩
    if (!this.textures.exists('bubble-mask')) {
      const gb = this.make.graphics({ x: 0, y: 0 });
      gb.fillStyle(0xffffff, 0.45);
      gb.fillCircle(size / 2, size / 2, size * 0.44);
      gb.lineStyle(3, 0xffffff, 0.8);
      gb.strokeCircle(size / 2, size / 2, size * 0.42);
      gb.generateTexture('bubble-mask', size, size);
      gb.destroy();
    }

    // 纸箱
    if (!this.textures.exists('carton')) {
      const gc = this.make.graphics({ x: 0, y: 0 });
      gc.fillStyle(0x8b5a2b, 1);
      gc.fillRoundedRect(0, 0, size, size, radius);
      gc.lineStyle(4, 0x6d4520, 1);
      gc.lineBetween(0, size / 2, size, size / 2);
      gc.lineBetween(size / 2, 0, size / 2, size / 2);
      gc.generateTexture('carton', size, size);
      gc.destroy();
    }

    // 蜘蛛网
    if (!this.textures.exists('spider')) {
      const gw = this.make.graphics({ x: 0, y: 0 });
      gw.lineStyle(5, 0xffffff, 1);
      const cx = size / 2;
      const cy = size / 2;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        gw.lineBetween(cx, cy, cx + Math.cos(a) * size * 0.48, cy + Math.sin(a) * size * 0.48);
      }
      for (let ring = 1; ring <= 3; ring++) {
        gw.strokeCircle(cx, cy, size * 0.14 * ring);
      }
      gw.generateTexture('spider', size, size);
      gw.destroy();
    }

    // 锁
    if (!this.textures.exists('lock')) {
      const gl = this.make.graphics({ x: 0, y: 0 });
      gl.fillStyle(0x555566, 1);
      gl.fillCircle(32, 32, 30);
      gl.fillStyle(0xffd43b, 1);
      gl.fillRoundedRect(16, 28, 32, 24, 4);
      gl.lineStyle(5, 0xffd43b, 1);
      gl.strokeCircle(32, 24, 10);
      gl.fillStyle(0x333344, 1);
      gl.fillCircle(32, 38, 4);
      gl.fillRect(30, 38, 4, 8);
      gl.generateTexture('lock', 64, 64);
      gl.destroy();
    }

    // 面板底
    if (!this.textures.exists('panel-bg')) {
      const gp = this.make.graphics({ x: 0, y: 0 });
      gp.fillStyle(0x22223a, 0.97);
      gp.fillRoundedRect(0, 0, 400, 300, 20);
      gp.lineStyle(3, 0x5555aa, 1);
      gp.strokeRoundedRect(2, 2, 396, 296, 20);
      gp.generateTexture('panel-bg', 400, 300);
      gp.destroy();
    }

    // 任务勾
    if (!this.textures.exists('task-gou')) {
      const gt = this.make.graphics({ x: 0, y: 0 });
      gt.fillStyle(0x51cf66, 1);
      gt.fillCircle(16, 16, 16);
      gt.lineStyle(4, 0xffffff, 1);
      gt.lineBetween(8, 16, 14, 22);
      gt.lineBetween(14, 22, 25, 10);
      gt.generateTexture('task-gou', 32, 32);
      gt.destroy();
    }

    // 烟雾（箱子消除特效用，多层半透明圆叠出柔软烟团）
    if (!this.textures.exists('fx-smoke')) {
      const gf = this.make.graphics({ x: 0, y: 0 });
      const s = 128;
      gf.fillStyle(0xc9c9d4, 0.55);
      gf.fillCircle(s / 2, s / 2, s * 0.4);
      gf.fillStyle(0xdedee8, 0.5);
      gf.fillCircle(s * 0.38, s * 0.4, s * 0.26);
      gf.fillCircle(s * 0.62, s * 0.38, s * 0.24);
      gf.fillCircle(s * 0.44, s * 0.64, s * 0.25);
      gf.fillCircle(s * 0.64, s * 0.62, s * 0.22);
      gf.fillStyle(0xffffff, 0.6);
      gf.fillCircle(s / 2, s / 2, s * 0.18);
      gf.generateTexture('fx-smoke', s, s);
      gf.destroy();
    }

    // 金色光晕（可点击产出的发射器「发光」提示，由外向内叠出柔和径向渐变）
    if (!this.textures.exists('fx-glow')) {
      const gg = this.make.graphics({ x: 0, y: 0 });
      const s = 128;
      const c = s / 2;
      gg.fillStyle(0xffd43b, 0.10);
      gg.fillCircle(c, c, s * 0.5);
      gg.fillStyle(0xffd43b, 0.16);
      gg.fillCircle(c, c, s * 0.4);
      gg.fillStyle(0xffe066, 0.22);
      gg.fillCircle(c, c, s * 0.3);
      gg.fillStyle(0xfff3bf, 0.30);
      gg.fillCircle(c, c, s * 0.2);
      gg.generateTexture('fx-glow', s, s);
      gg.destroy();
    }
  }
}
