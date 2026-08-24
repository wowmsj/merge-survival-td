import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { getPowerMax } from '../../core/config/TableConfig';
import { getPowerInfo } from '../../core/systems/BaseSystem';
import { UI_FILL, UI_GOLD, UI_SLOT_FILL, UI_STROKE } from './UiStyle';
import { getText } from '../../core/i18n';

/**
 * HUD 顶部资源栏：两排胶囊
 *   上排：等级 / 金币 / 钻石 / 体力 / 星星
 *   下排：电力 / 燃料 / 药品 / 废料
 *
 * 全部用 Graphics 代码绘制（深色半透明圆角底 + 微妙描边），不用 AI 底图；
 * 资源图标缺失时回退圆形色块 + 首字。
 */
const BAR_X = 8;
const BAR_Y = 16;
const ROW_H = 72;
const ROW_GAP = 6;
export const HUD_BOTTOM = BAR_Y + ROW_H * 2 + ROW_GAP;
const CAP_Y = 10;
const CAP_H = 52;
const CAP_GAP = 12;

const TIP_W = 280;

export class HUD {
  private scene: Phaser.Scene;
  private state: IGameState;
  private container: Phaser.GameObjects.Container;
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private tooltip: Phaser.GameObjects.Container | null = null;
  private tooltipTimer: Phaser.Time.TimerEvent | null = null;

  /** 无限能量剩余毫秒（由 GameScene 注入查询） */
  getPowerFreeRemain: () => number = () => 0;

  constructor(scene: Phaser.Scene, state: IGameState) {
    this.scene = scene;
    this.state = state;
    this.container = scene.add.container(0, 0).setDepth(200);

    const { width } = scene.scale;
    const barW = width - BAR_X * 2;

    const rows: { key: string; name: string; desc: string; source: string; color: string; icon: string; showMax?: boolean }[][] = [
      [
        { key: 'roleLv', name: getText('hud.roleLv.name'), desc: getText('hud.roleLv.desc'), source: getText('hud.roleLv.source'), color: '#ffffff', icon: 'res-icon-lv' },
        { key: 'coin', name: getText('hud.coin.name'), desc: getText('hud.coin.desc'), source: getText('hud.coin.source'), color: '#ffd700', icon: 'res-icon-coin' },
        { key: 'diamond', name: getText('hud.diamond.name'), desc: getText('hud.diamond.desc'), source: getText('hud.diamond.source'), color: '#00bfff', icon: 'res-icon-diamond' },
        { key: 'power', name: getText('hud.power.name'), desc: getText('hud.power.desc'), source: getText('hud.power.source'), color: '#ff69b4', icon: 'res-icon-power' },
        { key: 'star', name: getText('hud.star.name'), desc: getText('hud.star.desc'), source: getText('hud.star.source'), color: '#ffe066', icon: 'res-icon-star' }
      ],
      [
        { key: 'electric', name: getText('hud.electric.name'), desc: getText('hud.electric.desc'), source: getText('hud.electric.source'), color: '#ffff88', icon: 'res-icon-electric', showMax: true },
        { key: 'medicine', name: getText('hud.medicine.name'), desc: getText('hud.medicine.desc'), source: getText('hud.medicine.source'), color: '#aaddff', icon: 'res-icon-medicine' },
        { key: 'scrap', name: getText('hud.scrap.name'), desc: getText('hud.scrap.desc'), source: getText('hud.scrap.source'), color: '#cccccc', icon: 'res-icon-scrap' }
      ]
    ];

    // 顶 bar 底 + 两排胶囊底（每排按胶囊数均分整行宽度）
    const rowLayout = (n: number): { capW: number; capX0: number } => {
      const capW = Math.floor((barW - 32 - CAP_GAP * (n - 1)) / n);
      const capX0 = BAR_X + 16 + (barW - 32 - (capW * n + CAP_GAP * (n - 1))) / 2;
      return { capW, capX0 };
    };
    const g = scene.add.graphics();
    g.fillStyle(UI_FILL, 0.82);
    g.fillRoundedRect(BAR_X, BAR_Y, barW, HUD_BOTTOM - BAR_Y, 16);
    g.lineStyle(2, UI_STROKE, 0.6);
    g.strokeRoundedRect(BAR_X, BAR_Y, barW, HUD_BOTTOM - BAR_Y, 16);
    for (let r = 0; r < rows.length; r++) {
      const { capW, capX0 } = rowLayout(rows[r].length);
      const rowTop = BAR_Y + r * (ROW_H + ROW_GAP);
      for (let i = 0; i < rows[r].length; i++) {
        const cx = capX0 + i * (capW + CAP_GAP) + capW / 2;
        g.fillStyle(UI_SLOT_FILL, 0.9);
        g.fillRoundedRect(cx - capW / 2, rowTop + CAP_Y, capW, CAP_H, CAP_H / 2);
        g.lineStyle(1, UI_GOLD, 0.35);
        g.strokeRoundedRect(cx - capW / 2, rowTop + CAP_Y, capW, CAP_H, CAP_H / 2);
      }
    }
    this.container.add(g);

    // 胶囊内容：左图标（缺失回退色块+首字），右对齐数值
    for (let r = 0; r < rows.length; r++) {
      const { capW, capX0 } = rowLayout(rows[r].length);
      const rowTop = BAR_Y + r * (ROW_H + ROW_GAP);
      const capCenterY = rowTop + CAP_Y + CAP_H / 2;
      for (let i = 0; i < rows[r].length; i++) {
        const it = rows[r][i];
        const cx = capX0 + i * (capW + CAP_GAP) + capW / 2;
        const iconX = cx - capW / 2 + 28;

        let iconOrFallback: Phaser.GameObjects.GameObject | null = null;
        if (scene.textures.exists(it.icon)) {
          iconOrFallback = scene.add.image(iconX, capCenterY, it.icon).setDisplaySize(36, 36);
          iconOrFallback.setInteractive({ useHandCursor: true });
          iconOrFallback.on('pointerdown', () => this.showTip(it, cx));
          this.container.add(iconOrFallback);
        } else {
          const colorNum = Phaser.Display.Color.HexStringToColor(it.color).color;
          const fallback = scene.add.graphics();
          fallback.fillStyle(colorNum, 0.9);
          fallback.fillCircle(iconX, capCenterY, 16);
          this.container.add(fallback);
          iconOrFallback = fallback;
          // Graphics 无纹理尺寸，config 形式 setInteractive 会回退失败并崩溃，必须显式给 hitArea
          fallback.setInteractive({
            hitArea: new Phaser.Geom.Circle(iconX, capCenterY, 16),
            hitAreaCallback: Phaser.Geom.Circle.Contains,
            useHandCursor: true
          });
          fallback.on('pointerdown', () => this.showTip(it, cx));
          const ch = scene.add.text(iconX, capCenterY, it.name.charAt(0), {
            fontSize: '18px',
            color: '#1a1f2e',
            fontStyle: 'bold'
          }).setOrigin(0.5);
          this.container.add(ch);
        }

        const text = scene.add.text(cx + capW / 2 - 14, capCenterY, '', {
          fontSize: '24px',
          color: it.color,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3
        }).setOrigin(1, 0.5);
        text.setInteractive({ useHandCursor: true });
        text.on('pointerdown', () => this.showTip(it, cx));
        this.container.add(text);
        this.texts[it.key] = text;

        // 整枚胶囊都可点，弹出该资源说明 tips
        const hit = scene.add.rectangle(cx, capCenterY, capW, CAP_H, 0x000000, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.showTip(it, cx));
        this.container.add(hit);
      }
    }

    this.refresh();

    // 自订阅资源/基地变化：金币等数值在任何页面（棋盘/基地）都即时刷新；
    // BASE_CHANGED 覆盖拆除建筑（0 返还时不发 RESOURCE_CHANGED）导致的电力胶囊变化
    const onRefresh = () => this.refresh();
    eventBus.on(GameEvents.RESOURCE_CHANGED, onRefresh);
    eventBus.on(GameEvents.BASE_CHANGED, onRefresh);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvents.RESOURCE_CHANGED, onRefresh);
      eventBus.off(GameEvents.BASE_CHANGED, onRefresh);
    });
  }

  refresh(): void {
    const res = this.state.resources;
    this.texts['roleLv'].setText(`${this.state.roleLv}`);
    this.texts['coin'].setText(`${res.coin}`);
    this.texts['diamond'].setText(`${res.diamond}`);
    this.texts['power'].setText(`${res.power}/${getPowerMax(this.state)}`);
    this.texts['star'].setText(`${res.star}`);
    const powerInfo = getPowerInfo(this.state);
    this.texts['electric'].setText(`${powerInfo.used}/${powerInfo.cap}`);
    // 电力超载（占用 > 容量）时数字变红
    this.texts['electric'].setColor(powerInfo.used > powerInfo.cap ? '#ff6b6b' : '#ffff88');
    this.texts['medicine'].setText(`${res.medicine}`);
    this.texts['scrap'].setText(`${res.scrap}`);
  }

  private wasPowerFree = false;

  /** 每帧刷新：无限能量期间体力胶囊显示倒计时，结束后恢复数值 */
  update(): void {
    const remain = this.getPowerFreeRemain();
    if (remain > 0) {
      this.wasPowerFree = true;
      this.texts['power'].setText(`∞${Math.ceil(remain / 1000)}s`);
    } else if (this.wasPowerFree) {
      this.wasPowerFree = false;
      this.texts['power'].setText(`${this.state.resources.power}/${getPowerMax(this.state)}`);
    }
  }

  /** 弹出资源说明 tips（名称 + 介绍 + 来源），3.5 秒后自动消失 */
  private showTip(it: { key: string; name: string; desc: string; source: string; color: string }, cx: number): void {
    this.hideTip();

    const paddingX = 16;
    const paddingY = 14;
    const lineGap = 8;

    // 1) 先建 3 行文本，量出实际高度
    //    useAdvancedWrap: 中文无空格，基础换行只在空格处断，必须开高级换行
    //    updateText 是同步执行的，创建后 t.height 即包含换行后的真实高度
    const lines = [
      { text: it.name, color: it.color, size: '30px', bold: true },
      { text: it.desc, color: '#dddddd', size: '22px', bold: false },
      { text: getText('hud.source', { source: it.source }), color: '#aaccff', size: '20px', bold: false }
    ];
    const texts: Phaser.GameObjects.Text[] = [];
    let y = paddingY;
    for (const line of lines) {
      const t = this.scene.add.text(TIP_W / 2, y, line.text, {
        fontSize: line.size,
        color: line.color,
        fontStyle: line.bold ? 'bold' : 'normal',
        align: 'center',
        wordWrap: { width: TIP_W - paddingX * 2, useAdvancedWrap: true }
      }).setOrigin(0.5, 0);
      texts.push(t);
      y += t.height + lineGap;
    }
    const tipH = y + paddingY - lineGap;

    // 2) 位置：面板在 HUD 下方，水平方向夹紧到屏幕内
    const { width } = this.scene.scale;
    const px = Phaser.Math.Clamp(cx - TIP_W / 2, 8, width - TIP_W - 8);
    const py = HUD_BOTTOM + 8;
    const tip = this.scene.add.container(px, py).setDepth(300);

    // 3) 背景（左上坐标系绘制）放最底层
    const bg = this.scene.add.graphics();
    bg.fillStyle(UI_FILL, 0.95);
    bg.fillRoundedRect(0, 0, TIP_W, tipH, 12);
    bg.lineStyle(2, UI_GOLD, 0.6);
    bg.strokeRoundedRect(0, 0, TIP_W, tipH, 12);
    tip.add(bg);
    for (const t of texts) tip.add(t);

    // 4) 小三角箭头在面板顶部，朝上指向原胶囊
    const arrowX = Phaser.Math.Clamp(cx - px, 16, TIP_W - 16);
    const arrow = this.scene.add.graphics();
    arrow.fillStyle(UI_FILL, 0.95);
    arrow.beginPath();
    arrow.moveTo(arrowX, -8);
    arrow.lineTo(arrowX - 8, 0);
    arrow.lineTo(arrowX + 8, 0);
    arrow.closePath();
    arrow.fillPath();
    tip.add(arrow);

    this.tooltip = tip;
    this.tooltipTimer = this.scene.time.delayedCall(3500, () => this.hideTip());
  }

  private hideTip(): void {
    if (this.tooltipTimer) {
      this.tooltipTimer.remove();
      this.tooltipTimer = null;
    }
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }
}
