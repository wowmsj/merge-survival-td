import { getAllZombieConfigs, IZombieConfig } from '../../core/config/ZombieConfig';
import { getText, getZombieName } from '../../core/i18n';
import { BasePanel } from './BasePanel';
import { UI_CARD_FILL, UI_GOLD, UI_STROKE, drawUiBox } from './UiStyle';

const PANEL_W = 780;
const PANEL_H = 1240;
const CARD_W = 350;
const CARD_H = 240;

export class MonsterPanel extends BasePanel {
  open(): void {
    super.open();
    this.render();
  }

  private render(): void {
    if (!this.container) return;
    this.container.removeAll(true);
    const { width } = this.scene.scale;
    this.addMask();
    const { py } = this.addPanelChrome(getText('monster.title'), PANEL_W, PANEL_H, { titleY: 44 });
    this.container.add(this.scene.add.text(width / 2, py + 88, getText('monster.subtitle'), {
      fontSize: '20px', color: '#8f94a8'
    }).setOrigin(0.5));

    const monsters = getAllZombieConfigs();
    const gridW = CARD_W * 2 + 18;
    const startX = width / 2 - gridW / 2 + CARD_W / 2;
    const startY = py + 132 + CARD_H / 2;
    monsters.forEach((monster, index) => {
      const x = startX + (index % 2) * (CARD_W + 18);
      const y = startY + Math.floor(index / 2) * (CARD_H + 12);
      this.renderCard(monster, x, y);
    });
  }

  private renderCard(monster: IZombieConfig, cx: number, cy: number): void {
    if (!this.container) return;
    const box = this.scene.add.graphics();
    drawUiBox(box, cx, cy, CARD_W, CARD_H, { fill: UI_CARD_FILL, fillAlpha: 1, stroke: UI_STROKE, strokeAlpha: 0.85, radius: 12 });
    this.container.add(box);

    const badge = this.scene.add.graphics();
    badge.fillStyle(monster.color, 1);
    badge.fillCircle(cx - CARD_W / 2 + 42, cy - CARD_H / 2 + 42, 25);
    badge.lineStyle(2, UI_GOLD, 0.65);
    badge.strokeCircle(cx - CARD_W / 2 + 42, cy - CARD_H / 2 + 42, 25);
    this.container.add(badge);

    this.container.add(this.scene.add.text(cx - CARD_W / 2 + 78, cy - CARD_H / 2 + 30, getZombieName(monster.id), {
      fontSize: '25px', color: '#ffd75e', fontStyle: 'bold', wordWrap: { width: 240 }
    }).setOrigin(0, 0));
    this.container.add(this.scene.add.text(cx + CARD_W / 2 - 16, cy - CARD_H / 2 + 32, getText('monster.day', { day: monster.minDay }), {
      fontSize: '18px', color: '#8f94a8'
    }).setOrigin(1, 0));

    const stats = [
      getText('monster.hp', { value: monster.hp }),
      getText('monster.attack', { value: monster.attack }),
      getText('monster.defense', { value: monster.defense })
    ].join('   ');
    this.container.add(this.scene.add.text(cx - CARD_W / 2 + 20, cy - 52, stats, {
      fontSize: '19px', color: '#d8dbea'
    }).setOrigin(0, 0.5));

    const ability = monster.explode ? 'monster.ability.explode'
      : monster.moveType === 'fly' ? 'monster.ability.fly'
      : monster.moveType === 'burrow' ? 'monster.ability.burrow'
      : monster.defense >= 5 ? 'monster.ability.armor'
      : (monster.demolish ?? 0) >= 2 ? 'monster.ability.elite'
      : (monster.demolish ?? 0) > 0 ? 'monster.ability.breakWall'
      : monster.speed >= 1 ? 'monster.ability.fast' : 'monster.ability.normal';
    this.container.add(this.scene.add.text(cx - CARD_W / 2 + 20, cy - 12, getText('monster.abilityLabel'), {
      fontSize: '18px', color: '#8f94a8', fontStyle: 'bold'
    }).setOrigin(0, 0.5));
    this.container.add(this.scene.add.text(cx - CARD_W / 2 + 20, cy + 18, getText(ability), {
      fontSize: '19px', color: '#ccccdd', wordWrap: { width: CARD_W - 40, useAdvancedWrap: true }, lineSpacing: 4
    }).setOrigin(0, 0));
  }
}
