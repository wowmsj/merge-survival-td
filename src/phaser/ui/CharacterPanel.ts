import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { STORY_CHARACTERS, CHARACTER_GALLERY_ORDER, getMetCharacters } from '../../core/config/StoryConfig';
import { UI_CARD_FILL, UI_GOLD, UI_GREEN, UI_GREEN_FILL, UI_STROKE, drawUiBox } from './UiStyle';
import { makeUiButton } from './UiWidgets';
import { BasePanel } from './BasePanel';
import { getCharacterBio, getSpeakerName, getText } from '../../core/i18n';

const COLS = 2;
const ROWS = 3;
const PAGE_SIZE = COLS * ROWS;

/** 面板宽高（竖屏固定坐标布局，居中） */
const PANEL_W = 780;
const PANEL_H = 1240;

/**
 * 角色图鉴面板：收录所有 NPC（含玩家自己）。
 * 已遇到（在已播剧情里说过话）→ 立绘 + 名字 + 称号，点开看背景故事；
 * 未遇到 → 黑色剪影 + ???。由 GameScene 的「角色」按钮打开。
 */
export class CharacterPanel extends BasePanel {
  private state: IGameState;
  private page = 0;
  /** 非 null 表示正在看该角色的详情页 */
  private detailKey: string | null = null;

  constructor(scene: Phaser.Scene, state: IGameState) {
    super(scene); // 一次性模式：open 新建容器、close 销毁，depth 850
    this.state = state;
  }

  open(): void {
    this.page = 0;
    this.detailKey = null;
    super.open();
    this.render();
  }

  private render(): void {
    if (this.detailKey) this.renderDetail(this.detailKey);
    else this.renderGallery();
  }

  // ---------------- 图鉴网格 ----------------

  private renderGallery(): void {
    if (!this.container) return;
    this.container.removeAll(true);

    const { width } = this.scene.scale;
    const met = getMetCharacters(this.state);
    const keys = CHARACTER_GALLERY_ORDER;
    const pageCount = Math.max(1, Math.ceil(keys.length / PAGE_SIZE));
    this.page = Phaser.Math.Clamp(this.page, 0, pageCount - 1);

    // 遮罩：仅背景压暗（拦截穿透点击），关闭走右上角 ✕
    this.addMask();

    const { py } = this.addPanelChrome(getText('character.title'), PANEL_W, PANEL_H, { titleY: 46 });

    const metCount = keys.filter(k => met.has(k)).length;
    this.container.add(this.scene.add.text(width / 2, py + 92, getText('character.met', { count: metCount, total: keys.length }), {
      fontSize: '22px', color: '#8f94a8'
    }).setOrigin(0.5));

    // 卡片网格
    const cardW = 340;
    const cardH = 330;
    const gapX = 30;
    const gapY = 24;
    const gridW = COLS * cardW + (COLS - 1) * gapX;
    const startX = width / 2 - gridW / 2 + cardW / 2;
    const startY = py + 130 + cardH / 2;
    const pageKeys = keys.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE);
    pageKeys.forEach((key, i) => {
      const cx = startX + (i % COLS) * (cardW + gapX);
      const cy = startY + Math.floor(i / COLS) * (cardH + gapY);
      this.renderCard(key, met.has(key), cx, cy, cardW, cardH);
    });

    // 翻页
    const footerY = py + PANEL_H - 54;
    this.container.add(this.scene.add.text(width / 2, footerY, `${this.page + 1} / ${pageCount}`, {
      fontSize: '24px', color: '#ccccdd'
    }).setOrigin(0.5));
    this.addPageButton(width / 2 - 140, footerY, getText('page.previous'), this.page > 0, () => { this.page--; this.render(); });
    this.addPageButton(width / 2 + 140, footerY, getText('page.next'), this.page < pageCount - 1, () => { this.page++; this.render(); });
  }

  /** 单个角色卡：已遇到显示立绘+名字+称号，可点开详情；未遇到黑色剪影 + ??? */
  private renderCard(key: string, isMet: boolean, cx: number, cy: number, w: number, h: number): void {
    if (!this.container) return;
    const char = STORY_CHARACTERS[key];
    const bio = getCharacterBio(key);
    if (!char || !bio) return;

    const box = this.scene.add.graphics();
    drawUiBox(box, cx, cy, w, h, isMet
      ? { fill: UI_CARD_FILL, fillAlpha: 1, stroke: UI_GOLD, strokeAlpha: 0.5, radius: 14 }
      : { fill: 0x1f2330, fillAlpha: 0.7, stroke: UI_STROKE, strokeAlpha: 0.6, radius: 14 });
    this.container.add(box);

    // 立绘（未遇到涂黑成剪影）
    const hasTex = !!char.texture && this.scene.textures.exists(char.texture);
    if (hasTex) {
      const img = this.scene.add.image(cx, cy - 26, char.texture!).setDisplaySize(220, 220);
      if (!isMet) img.setTint(0x0a0c12);
      this.container.add(img);
    }

    this.container.add(this.scene.add.text(cx, cy + h / 2 - 62, isMet ? getSpeakerName(key) : '???', {
      fontSize: '28px', color: isMet ? '#ffd75e' : '#6a7086', fontStyle: 'bold'
    }).setOrigin(0.5));
    this.container.add(this.scene.add.text(cx, cy + h / 2 - 24, isMet ? bio.title : getText('character.unknown'), {
      fontSize: '20px', color: isMet ? '#9fa4b8' : '#555a6e'
    }).setOrigin(0.5));

    if (isMet) {
      box.setInteractive(new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h), Phaser.Geom.Rectangle.Contains);
      box.on('pointerdown', () => box.setAlpha(0.7));
      box.on('pointerup', () => {
        box.setAlpha(1);
        this.detailKey = key;
        this.render();
      });
      box.on('pointerout', () => box.setAlpha(1));
    }
  }

  // ---------------- 角色详情 ----------------

  private renderDetail(key: string): void {
    if (!this.container) return;
    this.container.removeAll(true);

    const { width } = this.scene.scale;
    const char = STORY_CHARACTERS[key];
    const bio = getCharacterBio(key);
    if (!char || !bio) { this.detailKey = null; this.render(); return; }

    this.addMask();
    const { px, py } = this.addPanelChrome(null, PANEL_W, PANEL_H);

    // 大立绘
    if (char.texture && this.scene.textures.exists(char.texture)) {
      this.container.add(this.scene.add.image(width / 2, py + 330, char.texture).setDisplaySize(420, 420));
    }

    this.container.add(this.scene.add.text(width / 2, py + 600, getSpeakerName(key), {
      fontSize: '44px', color: '#ffd75e', fontStyle: 'bold'
    }).setOrigin(0.5));
    this.container.add(this.scene.add.text(width / 2, py + 656, bio.title, {
      fontSize: '26px', color: '#9fa4b8'
    }).setOrigin(0.5));

    // 已加入堡垒的英雄（state.heroes 里有该 key）：绿色徽章标记，可部署协防
    const joined = this.state.heroes.some(h => h.key === key);
    if (joined) {
      const badge = this.scene.add.graphics();
      drawUiBox(badge, width / 2, py + 706, 320, 44, {
        fill: UI_GREEN_FILL, fillAlpha: 1, stroke: UI_GREEN, strokeAlpha: 0.8, radius: 10
      });
      this.container.add(badge);
      this.container.add(this.scene.add.text(width / 2, py + 706, getText('character.joined'), {
        fontSize: '24px', color: '#8bce6a', fontStyle: 'bold'
      }).setOrigin(0.5));
    }

    // 分隔线
    const divider = this.scene.add.graphics();
    divider.lineStyle(2, UI_STROKE, 0.8);
    divider.lineBetween(px + 60, py + (joined ? 748 : 700), px + PANEL_W - 60, py + (joined ? 748 : 700));
    this.container.add(divider);

    this.container.add(this.scene.add.text(px + 70, py + (joined ? 778 : 730), bio.bio, {
      fontSize: '26px', color: '#ccccdd', lineSpacing: 12,
      wordWrap: { width: PANEL_W - 140, useAdvancedWrap: true } // 中文无空格，必须按字符断行
    }));

    // 返回图鉴
    makeUiButton(this.scene, this.container, width / 2, py + PANEL_H - 70, 220, 64, getText('character.back'),
      { box: { radius: 12 } },
      () => {
        this.detailKey = null;
        this.render();
      });
  }
}
