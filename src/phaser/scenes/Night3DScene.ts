import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { StorageSystem } from '../../core/systems/StorageSystem';
import { NightSystem, IBattle } from '../../core/systems/NightSystem';
import { StorySystem } from '../../core/systems/StorySystem';
import { StoryDialog } from '../ui/StoryDialog';
import { getText } from '../../core/i18n';
import { getBuildingConfig } from '../../core/config/BuildingConfig';
import { showSceneToast, makeUiButton } from '../ui/UiWidgets';
import { Night3DRenderer } from '../../three/Night3DRenderer';

/**
 * 夜战 3D 场景：Three.js 低多边形渲染
 * 只读渲染 + 模拟推进，战斗结束结算后返回基地
 */
export class Night3DScene extends Phaser.Scene {
  private state!: IGameState;
  private storage!: StorageSystem;
  private nightSystem!: NightSystem;
  private storySystem!: StorySystem;
  private storyDialog!: StoryDialog;
  private battle!: IBattle;
  private testMode = false;

  private renderer3d: Night3DRenderer | null = null;
  private uiLayer!: Phaser.GameObjects.Container;
  private waveText!: Phaser.GameObjects.Text;
  private coreText!: Phaser.GameObjects.Text;
  private ended = false;

  constructor() {
    super({ key: 'Night3DScene' });
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

    // 隐藏 Phaser 背景，让 3D 场景可见
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // 创建 3D 渲染器，叠加在 Phaser canvas 上层
    const gameCanvas = this.game.canvas;
    const container = gameCanvas.parentElement || document.body;
    const rect = gameCanvas.getBoundingClientRect();
    this.renderer3d = new Night3DRenderer(container, rect.width, rect.height);

    // UI 层
    this.uiLayer = this.add.container(0, 0).setDepth(100);
    this.uiLayer.add(this.add.text(this.scale.width / 2, 40, getText('night.title', { day: this.battle.day }), {
      fontSize: '34px', color: '#ff8787', fontStyle: 'bold'
    }).setOrigin(0.5));

    this.waveText = this.add.text(this.scale.width / 2, 90, getText('night.incoming'), {
      fontSize: '26px', color: '#ccccdd', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.uiLayer.add(this.waveText);

    const core = this.state.base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core')!;
    this.coreText = this.add.text(this.scale.width / 2, 136, getText('night.coreHp', { hp: core.hp, maxHp: core.maxHp }), {
      fontSize: '24px', color: '#ffd43b', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.uiLayer.add(this.coreText);

    // 事件监听
    const onToast = (msg: string) => showSceneToast(this, msg);
    eventBus.on(GameEvents.TOAST_SHOW, onToast);
    const onZombieSpawn = (data: { moveType?: string }) => {
      if (data.moveType) this.storySystem.checkZombie(this.state, data.moveType);
    };
    eventBus.on(GameEvents.NIGHT_ZOMBIE_SPAWN, onZombieSpawn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvents.TOAST_SHOW, onToast);
      eventBus.off(GameEvents.NIGHT_ZOMBIE_SPAWN, onZombieSpawn);
      this.renderer3d?.dispose();
      this.renderer3d = null;
    });

    // 剧情对话浮层
    this.storySystem = new StorySystem();
    this.storyDialog = new StoryDialog(this);
    this.storyDialog.onBeatDone = () => {
      this.storySystem.beatDone(this.state);
      this.storage.saveState(this.state);
    };

    // 窗口大小变化
    window.addEventListener('resize', this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.onResize);
    });
  }

  private onResize = (): void => {
    const rect = this.game.canvas.getBoundingClientRect();
    this.renderer3d?.resize(rect.width, rect.height);
  };

  update(_time: number, delta: number): void {
    if (this.ended) return;
    this.nightSystem.tick(this.state, this.battle, delta);

    // 同步 3D 场景
    if (this.renderer3d) {
      this.renderer3d.syncBuildings(this.state);
      this.renderer3d.syncZombies(this.battle);
      this.renderer3d.render();
    }

    // 更新 UI
    this.renderStatus();

    if (this.battle.status === 'won' || this.battle.status === 'lost') {
      this.ended = true;
      this.showResult(this.battle.status === 'won');
    }
  }

  private renderStatus(): void {
    if (this.battle.status === 'between') {
      this.waveText.setText(this.battle.wave === 0 ? getText('night.incoming') : getText('night.nextWave', { wave: this.battle.wave, total: this.battle.totalWaves }));
    } else {
      this.waveText.setText(getText('night.waveRemaining', { wave: this.battle.wave, total: this.battle.totalWaves, count: this.battle.zombies.length + this.battle.spawnQueue.length }));
    }
    const core = this.state.base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core');
    if (core) this.coreText.setText(getText('night.coreHp', { hp: core.hp, maxHp: core.maxHp }));
  }

  private showResult(won: boolean): void {
    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0).setDepth(200);

    const mask = this.add.rectangle(0, 0, width, height, 0x000000, 0.75).setOrigin(0);
    overlay.add(mask);

    const title = this.add.text(width / 2, height / 2 - 120, won ? getText('night.victory') : getText('night.defeat'), {
      fontSize: '56px', color: won ? '#51cf66' : '#ff6b6b', fontStyle: 'bold'
    }).setOrigin(0.5);
    overlay.add(title);

    const btnLabel = won ? getText('night.continue') : getText('night.retry');
    makeUiButton(this, overlay, width / 2, height / 2 + 80, 300, 72, btnLabel, {
      box: { fill: won ? 0x2b4a2b : 0x4a2b2b, stroke: won ? 0x51cf66 : 0xff6b6b, strokeAlpha: 0.9, radius: 14 }
    }, () => {
      this.nightSystem.endBattle(this.state, this.battle);
      if (this.testMode) {
        this.scene.start('NightTestScene', { state: this.state });
        return;
      }
      this.storage.saveState(this.state);
      this.scene.start('GameScene', { state: this.state });
    });
  }
}
