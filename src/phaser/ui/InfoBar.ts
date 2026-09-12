import * as Phaser from 'phaser';
import { IGameState, IItemData, IPoint } from '../../core/types';
import { getProp, isClickSpecialProp, isClickSpawner, isMergeChainTop } from '../../core/config/PropConfig';
import { itemIsBubble, itemInCd } from '../../core/model/Item';
import { getBlueprintBuilding } from '../../core/config/BuildingConfig';
import { UI_FILL, UI_SLOT_FILL, UI_STROKE, drawUiBox } from './UiStyle';
import { getItemIconKey } from '../config/ItemIconMap';
import { applyModelIcon } from '../../three/ModelIconRenderer';
import { getLanguage, getPropDescription, getPropName, getText } from '../../core/i18n';

export interface IInfoAction {
  label: string;
  onClick: () => void;
}

/** 基地核心（= 合成核心 = 发射器）的信息卡内容 */
export interface ICoreCardInfo {
  /** 核心等级 1~6 */
  level: number;
  /** 展示用道具 id（图标随等级，取 CoreConfig.getCorePropId） */
  iconPropId: number;
  /** 卡片标题（核心名 + 等级） */
  title: string;
  /** 状态行：库存 / 光环 / 冷却 */
  status: string;
  actions: IInfoAction[];
}

const INFO_X = 536;
const INFO_Y = 1292;
const INFO_W = 506;
const INFO_H = 144;
const DESC_W = 224;

/** 选中物品的信息卡：固定边界，描述不会挤压卡牌栏和底部菜单。 */
export class InfoBar {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private panel: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
  private titleText: Phaser.GameObjects.Text;
  private descText: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, state: IGameState) {
    this.scene = scene;
    void state;
    this.container = scene.add.container(INFO_X, INFO_Y).setDepth(100).setVisible(false);
    this.panel = scene.add.graphics();
    drawUiBox(this.panel, INFO_W / 2, INFO_H / 2, INFO_W, INFO_H, {
      fill: UI_FILL, fillAlpha: 0.93, stroke: UI_STROKE, strokeAlpha: 0.85, radius: 14
    });
    this.icon = scene.add.image(70, INFO_H / 2, '__DEFAULT').setDisplaySize(92, 92).setVisible(false);
    this.titleText = scene.add.text(130, 23, '', {
      fontSize: '24px', color: '#ffe066', fontStyle: 'bold',
      wordWrap: { width: DESC_W, useAdvancedWrap: true }, maxLines: 2
    });
    this.descText = scene.add.text(130, 76, '', {
      fontSize: '18px', color: '#d5d9e5',
      wordWrap: { width: DESC_W, useAdvancedWrap: true }, maxLines: 2,
      lineSpacing: 2
    });
    this.container.add([this.panel, this.icon, this.titleText, this.descText]);
  }

  showSelection(pos: IPoint | null, item: IItemData | null, actions: IInfoAction[]): void {
    if (!pos || !item) {
      this.clearButtons();
      this.container.setVisible(false);
      return;
    }
    const prop = getProp(item.id);
    const title = `${getPropName(item.id)}  Lv.${prop?.luna ?? 1}`;
    this.renderCard(item.id, title, getPropDescription(item.id), actions);
  }

  /** 基地核心信息卡：核心不是棋盘物品，单独一条入口（图标随等级、状态行动态刷新） */
  showCore(info: ICoreCardInfo): void {
    this.renderCard(info.iconPropId, info.title, info.status, info.actions);
  }

  private renderCard(iconId: number, title: string, desc: string, actions: IInfoAction[]): void {
    this.clearButtons();
    this.container.setVisible(true);
    const isEnglish = getLanguage() === 'en';

    this.titleText.setStyle({ fontSize: isEnglish ? '21px' : '24px' });
    this.titleText.setText(title);
    this.descText.setStyle({ fontSize: isEnglish ? '17px' : '18px' });
    this.descText.setText(desc);

    const iconKey = getItemIconKey(iconId, this.scene.textures);
    if (iconKey && this.scene.textures.exists(iconKey)) {
      this.icon.setTexture(iconKey).setDisplaySize(92, 92).setVisible(true);
      applyModelIcon(this.scene, this.icon, iconId, 92); // 3D 快照就绪后原位升级，失败保持 2D
    } else {
      this.icon.setVisible(false);
    }

    actions.slice(0, 2).forEach((action, index) => this.addButton(action, index));
  }

  private addButton(action: IInfoAction, index: number): void {
    const x = 426;
    const y = index === 0 ? 42 : 102;
    const btn = this.scene.add.graphics();
    drawUiBox(btn, x, y, 140, 52, { fill: UI_SLOT_FILL, fillAlpha: 0.96, radius: 12 });
    btn.setInteractive(new Phaser.Geom.Rectangle(x - 70, y - 26, 140, 52), Phaser.Geom.Rectangle.Contains);
    btn.on('pointerdown', () => btn.setAlpha(0.7));
    btn.on('pointerup', () => {
      btn.setAlpha(1);
      action.onClick();
    });
    btn.on('pointerout', () => btn.setAlpha(1));
    const label = this.scene.add.text(x, y, action.label, {
      fontSize: '21px', color: '#ffffff', fontStyle: 'bold',
      wordWrap: { width: 124, useAdvancedWrap: true }, maxLines: 2, align: 'center'
    }).setOrigin(0.5);
    this.container.add([btn, label]);
    this.buttons.push(btn, label);
  }

  private clearButtons(): void {
    for (const button of this.buttons) button.destroy();
    this.buttons = [];
  }
}

export function buildInfoActions(
  state: IGameState,
  pos: IPoint,
  item: IItemData,
  handlers: {
    onSell: (pos: IPoint) => void;
    onPopBubble: (pos: IPoint) => void;
    onSkipCd: (pos: IPoint, cdType: 1 | 2) => void;
    onUse: (pos: IPoint) => void;
    onViewSpawner: (pos: IPoint) => void;
  }
): IInfoAction[] {
  const actions: IInfoAction[] = [];
  const prop = getProp(item.id);
  if (!prop) return actions;
  if (itemIsBubble(item, state.timestamp)) {
    actions.push({ label: getText('action.popBubble', { cost: prop.bubble }), onClick: () => handlers.onPopBubble(pos) });
    return actions;
  }
  if (itemInCd(item)) {
    actions.push({ label: getText('action.skipCooldown'), onClick: () => handlers.onSkipCd(pos, 1) });
    return actions;
  }
  if (isClickSpawner(item.id)) actions.push({ label: getText('action.view'), onClick: () => handlers.onViewSpawner(pos) });
  if (getBlueprintBuilding(item.id)) actions.push({ label: getText('action.use'), onClick: () => handlers.onUse(pos) });
  const unlockedSpawner = prop.mdt === 1 && !item.unlock && (item.times ?? 0) > 0;
  if (isClickSpecialProp(item.id) && !unlockedSpawner) actions.push({ label: getText('action.use'), onClick: () => handlers.onUse(pos) });
  if ((prop.she || isMergeChainTop(item.id)) && prop.levelGold > 0) actions.push({ label: getText('action.sell', { price: prop.levelGold }), onClick: () => handlers.onSell(pos) });
  return actions;
}
