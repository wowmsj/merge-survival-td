import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { StorageSystem } from '../../core/systems/StorageSystem';
import { NightSystem, IBattle } from '../../core/systems/NightSystem';
import { StorySystem } from '../../core/systems/StorySystem';
import { StoryDialog } from '../ui/StoryDialog';
import { getBuildingName, getHeroName, getText } from '../../core/i18n';
import { getBuildingConfig } from '../../core/config/BuildingConfig';
import { getZombieConfig } from '../../core/config/ZombieConfig';
import { getHeroConfig } from '../../core/config/HeroConfig';
import { addFullscreenBg, showSceneToast, makeUiButton } from '../ui/UiWidgets';
import { KIND_COLORS, KIND_ICON_KEYS } from '../config/BuildingKindStyle';
import { isBuildingPoweredAtNight } from '../../core/systems/BaseSystem';

const GRID_TOP = 210;
const GRID_LEFT = 24;
const CELL = 74;
const GAP = 6;

/** 塔弹道样式：箭塔=黄色箭矢 / 炮塔=黑色炮弹 / 电磁塔=蓝白电光球 / 冰冻塔=冰蓝冰锥 */
interface ITowerFx {
  color: number;
  shape: 'arrow' | 'ball' | 'orb';
  size: number;
  /** 飞行毫秒数 */
  flyMs: number;
  /** 命中闪光尺寸 */
  hitSize: number;
}
const TOWER_FX: Record<number, ITowerFx> = {
  101: { color: 0xffe066, shape: 'arrow', size: 5, flyMs: 140, hitSize: 14 },
  102: { color: 0x495057, shape: 'ball', size: 7, flyMs: 240, hitSize: 26 },
  103: { color: 0x66d9ff, shape: 'orb', size: 6, flyMs: 180, hitSize: 18 },
  104: { color: 0x74c0fc, shape: 'arrow', size: 5, flyMs: 150, hitSize: 14 }
};
const DEFAULT_TOWER_FX: ITowerFx = { color: 0xff922b, shape: 'arrow', size: 5, flyMs: 160, hitSize: 14 };

/**
 * 夜晚战斗场景：波次制尸潮防守
 * 只读渲染 + 模拟推进，战斗结束结算后返回基地
 */
export class NightScene extends Phaser.Scene {
  private state!: IGameState;
  private storage!: StorageSystem;
  private nightSystem!: NightSystem;
  private storySystem!: StorySystem;
  private storyDialog!: StoryDialog;
  private battle!: IBattle;
  private testMode = false;

  private gridLayer!: Phaser.GameObjects.Container;
  private buildingLayer!: Phaser.GameObjects.Container;
  private zombieLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private waveText!: Phaser.GameObjects.Text;
  private coreText!: Phaser.GameObjects.Text;
  private ended = false;

  constructor() {
    super({ key: 'NightScene' });
  }

  init(data: { state: IGameState; testMode?: boolean }): void {
    this.state = data.state;
    this.testMode = !!data.testMode;
  }

  create(): void {
    this.ended = false;
    this.storage = new StorageSystem();
    this.nightSystem = new NightSystem();
    this.battle = this.nightSystem.startBattle(this.state);

    // 夜晚底色 + 主背景（压暗）
    this.cameras.main.setBackgroundColor('#0d0d1a');
    addFullscreenBg(this, 0x555577);

    this.add.text(this.scale.width / 2, 40, getText('night.title', { day: this.battle.day }), {
      fontSize: '34px', color: '#ff8787', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.waveText = this.add.text(this.scale.width / 2, 90, getText('night.incoming'), {
      fontSize: '26px', color: '#ccccdd', fontStyle: 'bold'
    }).setOrigin(0.5);

    const core = this.state.base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core')!;
    this.coreText = this.add.text(this.scale.width / 2, 136, getText('night.coreHp', { hp: core.hp, maxHp: core.maxHp }), {
      fontSize: '24px', color: '#ffd43b', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.gridLayer = this.add.container(0, 0);
    this.buildingLayer = this.add.container(0, 0);
    this.zombieLayer = this.add.container(0, 0);
    // 特效层：弹道/命中/爪痕/死亡烟雾，压在所有战场元素之上
    this.fxLayer = this.add.container(0, 0).setDepth(50);

    this.renderGrid();
    this.renderBuildings();

    // 供电状态随燃料到期变化：每秒重绘建筑层，刷新缺电角标（baseDirty 只覆盖血量/增减）
    this.time.addEvent({ delay: 1000, loop: true, callback: () => { if (!this.ended) this.renderBuildings(); } });

    const onToast = (msg: string) => this.showToast(msg);
    eventBus.on(GameEvents.TOAST_SHOW, onToast);
    const onZombieSpawn = (data: { moveType?: string }) => {
      if (data.moveType) this.storySystem.checkZombie(this.state, data.moveType);
    };
    eventBus.on(GameEvents.NIGHT_ZOMBIE_SPAWN, onZombieSpawn);
    // 战斗特效：塔弹道 / 僵尸爪击 / 僵尸死亡烟雾
    const onTowerFire = (d: { fromRow: number; fromCol: number; toRow: number; toCol: number; cfgId: number; damage?: number }) =>
      this.playTowerFire(d.fromRow, d.fromCol, d.toRow, d.toCol, d.cfgId, d.damage);
    const onHeroFire = (d: { fromRow: number; fromCol: number; toRow: number; toCol: number; heroKey: string; damage?: number }) =>
      this.playHeroFire(d.fromRow, d.fromCol, d.toRow, d.toCol, d.heroKey, d.damage);
    const onZombieAttack = (d: { toRow: number; toCol: number }) =>
      this.playZombieAttack(d.toRow, d.toCol);
    const onZombieDie = (d: { row: number; col: number }) =>
      this.playZombieDie(d.row, d.col);
    eventBus.on(GameEvents.NIGHT_TOWER_FIRE, onTowerFire);
    eventBus.on(GameEvents.NIGHT_HERO_FIRE, onHeroFire);
    eventBus.on(GameEvents.NIGHT_ZOMBIE_ATTACK, onZombieAttack);
    eventBus.on(GameEvents.NIGHT_ZOMBIE_DIE, onZombieDie);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvents.TOAST_SHOW, onToast);
      eventBus.off(GameEvents.NIGHT_ZOMBIE_SPAWN, onZombieSpawn);
      eventBus.off(GameEvents.NIGHT_TOWER_FIRE, onTowerFire);
      eventBus.off(GameEvents.NIGHT_HERO_FIRE, onHeroFire);
      eventBus.off(GameEvents.NIGHT_ZOMBIE_ATTACK, onZombieAttack);
      eventBus.off(GameEvents.NIGHT_ZOMBIE_DIE, onZombieDie);
    });

    // 剧情对话浮层（僵尸登场/夜晚结算剧情）
    this.storySystem = new StorySystem();
    this.storyDialog = new StoryDialog(this);
    this.storyDialog.onBeatDone = () => {
      this.storySystem.beatDone(this.state);
      this.storage.saveState(this.state);
    };
  }

  update(_time: number, delta: number): void {
    if (this.ended) return;
    this.nightSystem.tick(this.state, this.battle, delta);

    if (this.battle.baseDirty) {
      this.battle.baseDirty = false;
      this.renderBuildings();
    }
    this.renderZombies();
    this.renderStatus();

    if (this.battle.status === 'won' || this.battle.status === 'lost') {
      this.ended = true;
      this.showResult(this.battle.status === 'won');
    }
  }

  private cellXY(row: number, col: number): { x: number; y: number } {
    return {
      x: GRID_LEFT + col * (CELL + GAP) + CELL / 2,
      y: GRID_TOP + row * (CELL + GAP) + CELL / 2
    };
  }

  private renderGrid(): void {
    this.gridLayer.removeAll(true);
    for (let row = 0; row < this.state.base.rows; row++) {
      for (let col = 0; col < this.state.base.cols; col++) {
        const { x, y } = this.cellXY(row, col);
        const cell = this.add.image(x, y, 'cell-bg')
          .setDisplaySize(CELL, CELL)
          .setTint(0x8888bb);
        this.gridLayer.add(cell);
      }
    }
  }

  private renderBuildings(): void {
    this.buildingLayer.removeAll(true);
    for (const b of this.state.base.buildings) {
      const cfg = getBuildingConfig(b.cfgId);
      if (!cfg) continue;
      const { x, y } = this.cellXY(b.row, b.col);
      // 夜战供电判定（塔优先）：缺电建筑压暗 + 红名 + 缺电角标，与基地页口径一致
      const powered = isBuildingPoweredAtNight(this.state, b);

      // 有图标纹理用建筑图标，缺失回退色块；缺电建筑灰色压暗
      const iconKey = KIND_ICON_KEYS[cfg.kind];
      const hasIcon = this.textures.exists(iconKey);
      if (hasIcon) {
        const img = this.add.image(x, y, iconKey).setDisplaySize(CELL - 12, CELL - 12);
        if (!powered) img.setTint(0x9aa0a6).setAlpha(0.55);
        this.buildingLayer.add(img);
      } else {
        const g = this.add.graphics();
        g.fillStyle(powered ? KIND_COLORS[cfg.kind] : 0x555560, 1);
        g.fillRoundedRect(x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 10);
        this.buildingLayer.add(g);
      }

      // 缺电时名字变红并移到中央（给角标让位）
      const name = this.add.text(x, hasIcon ? (powered ? y - CELL / 2 + 12 : y) : y - 4, getBuildingName(cfg.id).substring(0, 3), {
        fontSize: '18px', color: powered ? '#ffffff' : '#ff6b6b', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5);
      this.buildingLayer.add(name);

      // 缺电角标：右上角红底「缺电」
      if (!powered) {
        const badge = this.add.graphics();
        badge.fillStyle(0xc92a2a, 0.95);
        badge.fillRoundedRect(x + CELL / 2 - 46, y - CELL / 2 + 2, 44, 22, 6);
        this.buildingLayer.add(badge);
        const badgeText = this.add.text(x + CELL / 2 - 24, y - CELL / 2 + 13, getText('base.noPower'), {
          fontSize: '15px', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.buildingLayer.add(badgeText);
      }

      const barW = CELL - 16;
      const ratio = Math.max(0, b.hp / b.maxHp);
      const bar = this.add.graphics();
      bar.fillStyle(0x000000, 0.6);
      bar.fillRect(x - barW / 2, y + CELL / 2 - 12, barW, 6);
      bar.fillStyle(ratio > 0.5 ? 0x51cf66 : 0xff6b6b, 1);
      bar.fillRect(x - barW / 2, y + CELL / 2 - 12, barW * ratio, 6);
      this.buildingLayer.add(bar);
    }

    // 已部署英雄立绘（不占 buildings[]，与建筑同层渲染；夜里不会变动，随 baseDirty 一起重绘即可）
    for (const hero of this.state.heroes) {
      if (hero.row < 0) continue;
      const cfg = getHeroConfig(hero.key);
      const { x, y } = this.cellXY(hero.row, hero.col);
      const texKey = `char-${hero.key}`;
      if (this.textures.exists(texKey)) {
        const img = this.add.image(x, y, texKey).setDisplaySize(CELL - 10, CELL - 10);
        this.buildingLayer.add(img);
      } else {
        const g = this.add.graphics();
        g.fillStyle(cfg?.fxColor ?? 0x4caf50, 1);
        g.fillRoundedRect(x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 10);
        this.buildingLayer.add(g);
      }
      const name = this.add.text(x, y + CELL / 2 - 12, (cfg ? getHeroName(cfg.key) : hero.key).substring(0, 3), {
        fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5);
      this.buildingLayer.add(name);
    }

    const core = this.state.base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core');
    if (core) this.coreText.setText(getText('night.coreHp', { hp: core.hp, maxHp: core.maxHp }));
  }

  private renderZombies(): void {
    this.zombieLayer.removeAll(true);
    for (const z of this.battle.zombies) {
      const cfg = getZombieConfig(z.cfgId);
      if (!cfg) continue;
      const { x, y } = this.cellXY(z.row, z.col);

      const g = this.add.graphics();
      if (z.burrowed) {
        // 钻地潜行：土堆 + 裂纹，无实体
        g.fillStyle(0x5d4037, 1);
        g.fillEllipse(x, y + CELL * 0.1, CELL * 0.55, CELL * 0.3);
        g.fillStyle(0x8d6e63, 1);
        g.fillEllipse(x, y + CELL * 0.02, CELL * 0.4, CELL * 0.2);
        g.lineStyle(2, 0x3e2723, 0.8);
        g.lineBetween(x - CELL * 0.2, y + CELL * 0.05, x + CELL * 0.2, y + CELL * 0.08);
      } else {
        if (cfg.moveType === 'fly') {
          // 飞行：地面投影 → 本体 → 两侧翅膀
          g.fillStyle(0x000000, 0.25);
          g.fillEllipse(x, y + CELL * 0.34, CELL * 0.4, CELL * 0.12);
        }
        g.fillStyle(cfg.color, 1);
        g.fillCircle(x, y, CELL * 0.32);
        if (cfg.moveType === 'fly') {
          g.fillStyle(0xe3f2fd, 0.9);
          g.fillEllipse(x - CELL * 0.34, y - CELL * 0.08, CELL * 0.26, CELL * 0.14);
          g.fillEllipse(x + CELL * 0.34, y - CELL * 0.08, CELL * 0.26, CELL * 0.14);
        }
        if (z.slowUntil > this.battle.time) {
          g.lineStyle(3, 0x74c0fc, 1);
          g.strokeCircle(x, y, CELL * 0.36);
        }
      }
      this.zombieLayer.add(g);

      const barW = CELL * 0.6;
      const ratio = Math.max(0, z.hp / z.maxHp);
      const bar = this.add.graphics();
      bar.fillStyle(0x000000, 0.6);
      bar.fillRect(x - barW / 2, y - CELL * 0.44, barW, 5);
      bar.fillStyle(0xff6b6b, 1);
      bar.fillRect(x - barW / 2, y - CELL * 0.44, barW * ratio, 5);
      this.zombieLayer.add(bar);

      // 等级标识（潜行中的钻地僵尸不显示）
      if (!z.burrowed) {
        const lv = this.add.text(x, y + CELL * 0.3, `Lv${z.level ?? 1}`, {
          fontSize: '15px', color: '#ffd43b', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5, 0);
        this.zombieLayer.add(lv);
      }
    }
  }

  private renderStatus(): void {
    if (this.battle.status === 'between') {
      this.waveText.setText(this.battle.wave === 0 ? getText('night.incoming') : getText('night.nextWave', { wave: this.battle.wave, total: this.battle.totalWaves }));
    } else {
      this.waveText.setText(getText('night.waveRemaining', { wave: this.battle.wave, total: this.battle.totalWaves, count: this.battle.zombies.length + this.battle.spawnQueue.length }));
    }
  }

  /** 塔开火：弹道从塔格飞向目标格，命中处放闪光 + 伤害飘字 */
  private playTowerFire(fromRow: number, fromCol: number, toRow: number, toCol: number, cfgId: number, damage?: number): void {
    const from = this.cellXY(fromRow, fromCol);
    const to = this.cellXY(toRow, toCol);
    const style = TOWER_FX[cfgId] ?? DEFAULT_TOWER_FX;

    const g = this.add.graphics();
    if (style.shape === 'arrow') {
      // 箭矢/冰锥：朝 +x 的三角，按目标方向旋转
      g.fillStyle(style.color, 1);
      g.fillTriangle(10, 0, -6, -5, -6, 5);
    } else {
      g.fillStyle(style.color, 1);
      g.fillCircle(0, 0, style.size);
      if (style.shape === 'orb') {
        g.lineStyle(2, 0xffffff, 0.7);
        g.strokeCircle(0, 0, style.size + 3);
      }
    }
    g.setPosition(from.x, from.y);
    g.setRotation(Math.atan2(to.y - from.y, to.x - from.x));
    this.fxLayer.add(g);

    this.tweens.add({
      targets: g,
      x: to.x,
      y: to.y,
      duration: style.flyMs,
      ease: 'Linear',
      onComplete: () => {
        g.destroy();
        this.playHitFlash(to.x, to.y, style.color, style.hitSize);
        if (damage) this.playDamageText(to.x, to.y, damage, style.color);
      }
    });
  }

  /** 英雄开火：按英雄 fxColor 着色的小弹丸从英雄格飞向目标格，命中闪光 + 伤害飘字（复用塔弹道写法） */
  private playHeroFire(fromRow: number, fromCol: number, toRow: number, toCol: number, heroKey: string, damage?: number): void {
    const from = this.cellXY(fromRow, fromCol);
    const to = this.cellXY(toRow, toCol);
    const color = getHeroConfig(heroKey)?.fxColor ?? 0xffe066;

    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillTriangle(10, 0, -6, -5, -6, 5);
    g.setPosition(from.x, from.y);
    g.setRotation(Math.atan2(to.y - from.y, to.x - from.x));
    this.fxLayer.add(g);

    this.tweens.add({
      targets: g,
      x: to.x,
      y: to.y,
      duration: 150,
      ease: 'Linear',
      onComplete: () => {
        g.destroy();
        this.playHitFlash(to.x, to.y, color, 14);
        if (damage) this.playDamageText(to.x, to.y, damage, color);
      }
    });
  }

  /** 伤害飘字：命中点上方跳出一个 -N，上飘淡出 */
  private playDamageText(x: number, y: number, damage: number, color: number): void {
    const t = this.add.text(x, y - CELL * 0.3, `-${damage}`, {
      fontSize: '20px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5);
    this.fxLayer.add(t);
    this.tweens.add({
      targets: t,
      y: y - CELL * 0.75,
      alpha: 0,
      duration: 500,
      ease: 'Sine.easeOut',
      onComplete: () => t.destroy()
    });
  }

  /** 命中闪光：白点 + 彩色圆环扩散淡出 */
  private playHitFlash(x: number, y: number, color: number, size: number): void {
    const g = this.add.graphics();
    g.lineStyle(3, color, 0.9);
    g.strokeCircle(0, 0, size * 0.4);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(0, 0, size * 0.2);
    g.setPosition(x, y);
    this.fxLayer.add(g);
    this.tweens.add({
      targets: g,
      scaleX: 1.6,
      scaleY: 1.6,
      alpha: 0,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => g.destroy()
    });
  }

  /** 僵尸攻击：建筑格上三道红色爪痕，放大淡出 */
  private playZombieAttack(row: number, col: number): void {
    const { x, y } = this.cellXY(row, col);
    const g = this.add.graphics();
    g.lineStyle(4, 0xff6b6b, 0.95);
    for (let i = -1; i <= 1; i++) {
      g.lineBetween(-14 + i * 10, -12, -2 + i * 10, 12);
    }
    g.setPosition(x, y).setScale(0.7);
    this.fxLayer.add(g);
    this.tweens.add({
      targets: g,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0,
      duration: 240,
      ease: 'Sine.easeOut',
      onComplete: () => g.destroy()
    });
  }

  /** 僵尸死亡：灰绿色小烟团升起消散 */
  private playZombieDie(row: number, col: number): void {
    const { x, y } = this.cellXY(row, col);
    for (let i = 0; i < 3; i++) {
      const smoke = this.add.image(
        x + Phaser.Math.Between(-8, 8),
        y + Phaser.Math.Between(-6, 6),
        'fx-smoke'
      ).setTint(0x8fbc8f).setAlpha(0.7).setScale(0.25);
      this.fxLayer.add(smoke);
      this.tweens.add({
        targets: smoke,
        alpha: 0,
        scaleX: 0.55,
        scaleY: 0.55,
        y: smoke.y - Phaser.Math.Between(8, 18),
        duration: Phaser.Math.Between(300, 450),
        delay: i * 50,
        ease: 'Sine.easeOut',
        onComplete: () => smoke.destroy()
      });
    }
  }

  private showResult(won: boolean): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setInteractive().setDepth(800);

    this.add.text(width / 2, height / 2 - 160, won ? getText('night.win') : getText('night.loss'), {
      fontSize: '36px', color: won ? '#51cf66' : '#74c0fc', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(801);

    this.add.text(width / 2, height / 2 - 90, won ? getText('night.winSub') : getText('night.lossSub'), {
      fontSize: '24px', color: '#ccccdd'
    }).setOrigin(0.5).setDepth(801);

    makeUiButton(this, null, width / 2, height / 2 + 60, 260, 80, won ? getText('night.returnBase') : getText('night.rewind'), {
      box: { radius: 14 },
      fontSize: '28px',
      depth: 801
    }, () => {
      this.nightSystem.endBattle(this.state, this.battle);
      if (this.testMode) {
        this.scene.start('NightTestScene', { state: this.state });
        return;
      }
      this.storage.saveState(this.state);
      this.scene.start('BaseScene', { state: this.state, nightEndStory: { won, day: this.state.day } });
    });
  }

  private showToast(msg: string): void {
    showSceneToast(this, msg, { fontSize: '26px' });
  }
}
