import { GameEvents, eventBus } from '../events/EventBus';
import { IBaseState, IBuilding, IGameState } from '../types';
import { buildingAt, distFromCenter, findPathToCore, RUIN_COLLAPSE_ORDER, ruinCellsOfSide, RuinSide } from '../model/Base';
import { getBuildingConfig, attackAtLevel, MaterialCost, RUIN_ID } from '../config/BuildingConfig';
import { getZombieConfig, genWaveZombies, getTotalWaves, getZombieLevel, getLevelHpScale, getLevelAttackScale, rollDrops } from '../config/ZombieConfig';
import { getHeroConfig } from '../config/HeroConfig';
import { getPowerMax } from '../config/TableConfig';
import { EconomySystem } from './EconomySystem';
import { HeroSystem } from './HeroSystem';
import { BaseSystem, formatGains, hasSupportCoverage, isBuildingPowered, isTowerPoweredAtNight } from './BaseSystem';
import { getBuildingName, getText, getZombieName } from '../i18n';

/** 夜晚战斗中的僵尸实例 */
export interface IZombie {
  uid: number;
  cfgId: number;
  hp: number;
  maxHp: number;
  row: number;
  col: number;
  /** 距下次行动（毫秒） */
  moveCd: number;
  /** 距下次攻击（毫秒） */
  attackCd: number;
  /** 减速截止（战斗时钟毫秒） */
  slowUntil: number;
  /** 僵尸等级（由天数决定；缺省按 Lv1 处理，仅用于展示） */
  level?: number;
  /** 按等级缩放后的每次攻击伤害（缺省用配置值） */
  attack?: number;
  /** 钻地僵尸潜行中：不可被塔索敌、无视建筑与陷阱，距核心 ≤2 格钻出 */
  burrowed?: boolean;
  /** 被拆不动的建筑挡住的累计毫秒数，超过 ENRAGE_MS 进入狂暴 */
  stuckMs?: number;
  /** 狂暴中：无视建筑坚固等级（防夜战死锁的兜底） */
  enraged?: boolean;
}

export type BattleStatus = 'fighting' | 'between' | 'won' | 'lost';

/** 夜晚战斗状态（瞬态，不入存档；中途退出视为失败回白天） */
export interface IBattle {
  day: number;
  /** 当前波次（1 开始） */
  wave: number;
  totalWaves: number;
  /** 战斗时钟（毫秒） */
  time: number;
  spawnQueue: number[];
  spawnCd: number;
  betweenCd: number;
  zombies: IZombie[];
  /** 塔攻击冷却：'row,col' -> 剩余毫秒 */
  towerCds: Record<string, number>;
  /** 英雄攻击冷却：'row,col' -> 剩余毫秒 */
  heroCds: Record<string, number>;
  /** 战利品（低级材料 id -> 数量），胜利结算时发到棋盘，棋盘满进卡片 */
  pendingDrops: MaterialCost;
  status: BattleStatus;
  /** 建筑有增删/血量变化，UI 需要重绘 */
  baseDirty: boolean;
  /** 本场夜战是否已提示过缺电 */
  powerWarningShown?: boolean;
}

const SPAWN_INTERVAL = 700;
const BETWEEN_WAVES = 3000;
const SLOW_DURATION = 2000;
/** 僵尸被拆不动的建筑卡住多久后狂暴（无视坚固等级，防夜战死锁） */
const ENRAGE_MS = 15000;

let zombieUid = 1;

/**
 * 夜晚系统：波次制尸潮防守
 * 僵尸从边缘刷出直线逼近核心；被建筑挡住就拆建筑；
 * 防御塔自动索敌攻击；陷阱在僵尸踏入时触发。
 */
export class NightSystem {
  private economy = new EconomySystem();
  private baseSystem = new BaseSystem(this.economy);
  private heroes = new HeroSystem();

  /** 开夜：生成战斗状态，phase 置为 night；保留白天剩余行动力至夜晚结算。 */
  startBattle(state: IGameState): IBattle {
    state.phase = 'night';
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'power', value: state.resources.power });
    eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.nightStarts'));
    const totalWaves = getTotalWaves(state.day);
    return {
      day: state.day,
      wave: 0,
      totalWaves,
      time: 0,
      spawnQueue: [],
      spawnCd: 0,
      betweenCd: 1500,
      zombies: [],
      towerCds: {},
      heroCds: {},
      pendingDrops: {},
      status: 'between',
      baseDirty: false,
      powerWarningShown: false
    };
  }

  /** 战斗推进 dt 毫秒 */
  tick(state: IGameState, battle: IBattle, dt: number): void {
    if (battle.status === 'won' || battle.status === 'lost') return;
    battle.time += dt;

    if (battle.status === 'between') {
      battle.betweenCd -= dt;
      if (battle.betweenCd <= 0) {
        battle.wave++;
        battle.spawnQueue = genWaveZombies(battle.day, battle.wave, battle.totalWaves);
        battle.status = 'fighting';
        battle.spawnCd = 0;
        eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.waveIncoming', { wave: battle.wave, total: battle.totalWaves }));
      }
      return;
    }

    // 出兵（出生格全被僵尸占住时不生成，稍候重试，队列不消耗）
    if (battle.spawnQueue.length > 0) {
      battle.spawnCd -= dt;
      if (battle.spawnCd <= 0) {
        if (this.spawnZombie(state, battle, battle.spawnQueue[0])) {
          battle.spawnQueue.shift();
          battle.spawnCd = SPAWN_INTERVAL;
        } else {
          battle.spawnCd = 200;
        }
      }
    }

    // 僵尸行动
    for (const z of battle.zombies) {
      this.tickZombie(state, battle, z, dt);
      if ((battle.status as BattleStatus) === 'lost') return;
    }

    // 防御塔攻击
    this.tickTowers(state, battle, dt);

    // 已部署英雄攻击（内圈协防，最后一道防线）
    this.tickHeroes(state, battle, dt);

    // 清理死亡僵尸
    this.collectDead(state, battle);
    if ((battle.status as BattleStatus) === 'lost') return;

    // 波次结束判定
    if (battle.spawnQueue.length === 0 && battle.zombies.length === 0) {
      if (battle.wave >= battle.totalWaves) {
        battle.status = 'won';
      } else {
        battle.status = 'between';
        battle.betweenCd = BETWEEN_WAVES;
      }
    }
  }

  /** 结束夜晚结算：胜利天亮进下一天并发放掉落；失败核心半血、天数不变 */
  endBattle(state: IGameState, battle: IBattle): void {
    state.phase = 'day';

    if (battle.status === 'won') {
      // 守夜胜利保留白天余量，并固定奖励 100 行动力。
      this.economy.addResource(state, 'power', 100);
      state.day++;
      this.heroes.recoverForNewDay(state);
      this.baseSystem.repairSupportBuildingsAtDay(state);
      // 战利品发到棋盘，棋盘满则进卡片列表
      for (const [idStr, count] of Object.entries(battle.pendingDrops)) {
        const id = Number(idStr);
        for (let i = 0; i < (count || 0); i++) {
          this.economy.giveItemToBoardOrCard(state, id);
        }
      }
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.daybreakLoot', { loot: formatGains(battle.pendingDrops) }));
      this.collapseRuins(state, battle.day);
    } else {
      // 失败时间回溯，行动力按当前上限重整。
      this.refillPower(state);
      const core = state.base.buildings.find(b => getBuildingConfig(b.cfgId)?.kind === 'core');
      if (core) core.hp = Math.floor(core.maxHp / 2);
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.timeRewind'));
    }
    eventBus.emit(GameEvents.NIGHT_END, { won: battle.status === 'won', day: state.day });
  }

  // ============ 内部 ============

  /** 行动力回满（上限随等级提升），用于守夜失败后的重整。 */
  private refillPower(state: IGameState): void {
    state.resources.power = getPowerMax(state);
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'power', value: state.resources.power, delta: 0 });
  }

  /**
   * 尸潮过后塌掉一条边的废墟（按守夜天数顺序：北→西→南→东），
   * 僵尸进攻方向随之逐步开放；第 5 天起四边全开。
   */
  private collapseRuins(state: IGameState, wonDay: number): void {
    const side = RUIN_COLLAPSE_ORDER[wonDay - 1];
    if (!side) return;
    const cells = new Set(ruinCellsOfSide(side).map(c => `${c.row},${c.col}`));
    const before = state.base.buildings.length;
    state.base.buildings = state.base.buildings.filter(
      b => !(b.cfgId === RUIN_ID && cells.has(`${b.row},${b.col}`))
    );
    if (state.base.buildings.length < before) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.ruinsCollapse', { side: getText(`side.${side}`) }));
      eventBus.emit(GameEvents.BASE_CHANGED, {});
    }
  }

  private spawnZombie(state: IGameState, battle: IBattle, cfgId: number): boolean {
    const cfg = getZombieConfig(cfgId);
    if (!cfg) return false;
    // 只在没有建筑的边缘格刷出：被废墟/建筑封死的方向不会来怪
    // （新开局北/西/南三边整排废墟 + 东边部分废墟 → 第一夜只从东边 3 格缺口进攻）
    // 同格不重叠：已被僵尸占住的格子不刷；全被占住时返回 false（调用方稍候重试）
    const open = getOpenEdgeCells(state.base);
    const pool = (open.length > 0 ? open : allEdgeCells(state.base))
      .filter(c => !this.zombieAt(battle, c.row, c.col));
    if (pool.length === 0) return false;
    const cell = pool[Math.floor(Math.random() * pool.length)];

    const level = getZombieLevel(battle.day);
    const hp = Math.round(cfg.hp * getLevelHpScale(level));
    battle.zombies.push({
      uid: zombieUid++,
      cfgId,
      hp,
      maxHp: hp,
      level,
      attack: Math.max(1, Math.round(cfg.attack * getLevelAttackScale(level))),
      row: cell.row,
      col: cell.col,
      moveCd: 0,
      attackCd: 0,
      slowUntil: 0,
      ...(cfg.moveType === 'burrow' ? { burrowed: true } : {})
    });
    eventBus.emit(GameEvents.NIGHT_ZOMBIE_SPAWN, { cfgId, moveType: cfg.moveType });
    return true;
  }

  /** 某格上的僵尸（同格不重叠：生成与移动都要避开） */
  private zombieAt(battle: IBattle, row: number, col: number): IZombie | undefined {
    return battle.zombies.find(zz => zz.row === row && zz.col === col);
  }

  private tickZombie(state: IGameState, battle: IBattle, z: IZombie, dt: number): void {
    const cfg = getZombieConfig(z.cfgId);
    if (!cfg) return;
    z.moveCd -= dt;
    z.attackCd -= dt;
    if (z.moveCd > 0) return;

    const d0 = distFromCenter(z.row, z.col);
    // 雷达覆盖内的钻地僵尸提前显形；无雷达时仍在核心附近钻出。
    if (z.burrowed && (d0 <= 2 || hasSupportCoverage(state, 'radar', z.row, z.col, true))) {
      z.burrowed = false;
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.zombieEmerged', { zombie: getZombieName(cfg.id) }));
    }
    const burrowed = !!z.burrowed;
    const flying = cfg.moveType === 'fly';

    // Ground enemies follow the editable four-direction corridor. Flying and
    // burrowed enemies retain their direct movement rules.
    const candidates: { row: number; col: number }[] = [];
    if (!flying && !burrowed) {
      const path = findPathToCore(state.base, z);
      if (path && path.length > 1) candidates.push(path[1]);
    }
    if (candidates.length === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = z.row + dr;
          const c = z.col + dc;
          if (r < 0 || r >= state.base.rows || c < 0 || c >= state.base.cols) continue;
          if (distFromCenter(r, c) < d0) candidates.push({ row: r, col: c });
        }
      }
    }

    // 同格不重叠：已被其他僵尸占住的格子不可进入；更近的格全被占住时原地等待（排队）
    const free = candidates.filter(p => !this.zombieAt(battle, p.row, p.col));
    const overtaken = cfg.id === 2
      ? candidates.map(p => ({ p, zombie: this.zombieAt(battle, p.row, p.col) }))
        .find(({ zombie }) => {
          const blocker = zombie && getZombieConfig(zombie.cfgId);
          return !!blocker && blocker.moveType === 'ground' && blocker.speed < cfg.speed;
        })
      : undefined;
    if (overtaken?.zombie) {
      overtaken.zombie.row = z.row;
      overtaken.zombie.col = z.col;
      z.row = overtaken.p.row;
      z.col = overtaken.p.col;
      z.moveCd = 1000 / cfg.speed;
      return;
    }
    if (candidates.length > 0 && free.length === 0) {
      z.moveCd = 250;
      return;
    }

    // 被建筑挡住 → 拆建筑
    //   走路：被一切非陷阱建筑阻挡
    //   飞行：只被核心阻挡（直接飞过其他建筑）
    //   钻地（潜行）：不被任何建筑阻挡
    const blockers = free
      .map(p => ({ p, b: buildingAt(state.base, p.row, p.col) }))
      .filter(x => {
        if (!x.b) return false;
        if (burrowed) return false;
        const kind = getBuildingConfig(x.b.cfgId)?.kind;
        if (kind === 'trap') return false;
        if (flying) return kind === 'core';
        return true;
      });

    if (cfg.explode && z.attackCd <= 0) {
      const wall = state.base.buildings.find(building =>
        getBuildingConfig(building.cfgId)?.kind === 'wall'
        && Math.max(Math.abs(building.row - z.row), Math.abs(building.col - z.col)) <= 1);
      if (wall) {
        z.hp = 0;
        eventBus.emit(GameEvents.NIGHT_ZOMBIE_ATTACK, {
          fromRow: z.row, fromCol: z.col, toRow: wall.row, toCol: wall.col
        });
        return;
      }
    }

    const hero = state.heroes.find(h => h.row >= 0 && Math.max(Math.abs(h.row - z.row), Math.abs(h.col - z.col)) <= 1);
    if (hero && z.attackCd <= 0) {
      const heroRow = hero.row;
      const heroCol = hero.col;
      const maxHp = hero.maxHp ?? getHeroConfig(hero.key)?.hp ?? 100;
      hero.maxHp = maxHp;
      hero.hp = Math.max(0, (hero.hp ?? maxHp) - (z.attack ?? cfg.attack));
      if (hero.hp === 0) {
        hero.row = -1;
        hero.col = -1;
        hero.recoveryDays = 7;
      }
      eventBus.emit(GameEvents.NIGHT_ZOMBIE_ATTACK, { fromRow: z.row, fromCol: z.col, toRow: heroRow, toCol: heroCol });
      z.attackCd = cfg.attackInterval ?? 1000;
      return;
    }

    if (blockers.length > 0) {
      // 拆迁等级判定：只能拆 sturdy ≤ demolish 的建筑；全拆不动时累计卡死计时，超时狂暴强拆
      const demolish = cfg.demolish ?? 0;
      const breakable = blockers.filter(x => demolish >= (getBuildingConfig(x.b!.cfgId)?.sturdy ?? 0));
      if (breakable.length === 0 && !z.enraged) {
        // 到达此分支时 moveCd≤0：距上次被阻挡约过了 250−moveCd 毫秒
        z.stuckMs = (z.stuckMs ?? 0) + 250 - z.moveCd;
        if (z.stuckMs >= ENRAGE_MS) {
          z.enraged = true;
          eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.zombieEnraged', { zombie: getZombieName(cfg.id) }));
        }
      } else {
        z.stuckMs = 0;
      }
      const targets = breakable.length > 0 ? breakable : z.enraged ? blockers : [];
      if (targets.length > 0 && z.attackCd <= 0) {
        const target = targets[Math.floor(Math.random() * targets.length)].b!;
        this.damageBuilding(state, battle, target, z.attack ?? cfg.attack);
        eventBus.emit(GameEvents.NIGHT_ZOMBIE_ATTACK, {
          fromRow: z.row, fromCol: z.col, toRow: target.row, toCol: target.col
        });
        z.attackCd = cfg.attackInterval ?? 1000;
        if (battle.status === 'lost') return;
      }
      z.moveCd = 250;
      return;
    }

    // 前进一步
    if (free.length > 0) {
      const next = free[Math.floor(Math.random() * free.length)];
      z.row = next.row;
      z.col = next.col;
      // 飞行/钻地不触发陷阱
      if (!flying && !burrowed) {
        this.triggerTrap(state, battle, z);
        if (z.hp <= 0) return;
      }
    }

    const slowed = z.slowUntil > battle.time;
    z.moveCd = (1000 / cfg.speed) * (slowed ? 2 : 1);
  }

  /** 僵尸踏入陷阱格触发 */
  private triggerTrap(state: IGameState, battle: IBattle, z: IZombie): void {
    const trap = buildingAt(state.base, z.row, z.col);
    if (!trap) return;
    const cfg = getBuildingConfig(trap.cfgId);
    if (!cfg || cfg.kind !== 'trap') return;
    // 缺电的陷阱不触发
    if (!isBuildingPowered(state, trap)) return;

    if (cfg.attack) {
      z.hp -= Math.max(1, attackAtLevel(cfg, trap.level) - (getZombieConfig(z.cfgId)?.defense ?? 0));
    }
    if (cfg.slow) {
      z.slowUntil = Math.max(z.slowUntil, battle.time + SLOW_DURATION);
    }
    // 地雷（低血量一次性陷阱）触发后消耗
    if (trap.maxHp <= 10) {
      state.base.buildings = state.base.buildings.filter(b => b !== trap);
      battle.baseDirty = true;
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.zombieExploded', { zombie: getZombieName(cfg.id) }));
    }
  }

  /** 防御塔索敌攻击 */
  private tickTowers(state: IGameState, battle: IBattle, dt: number): void {
    for (const b of state.base.buildings) {
      const cfg = getBuildingConfig(b.cfgId);
      if (!cfg || cfg.kind !== 'tower' || !cfg.range) continue;
      // 缺电的防御塔不攻击（夜战塔优先分配电力，见 isTowerPoweredAtNight）
      if (!isTowerPoweredAtNight(state, b)) {
        if (!battle.powerWarningShown) {
          const reason = getText('toast.towerNoPower');
          eventBus.emit(GameEvents.TOAST_SHOW, reason);
          battle.powerWarningShown = true;
        }
        continue;
      }

      const key = `${b.row},${b.col}`;
      battle.towerCds[key] = (battle.towerCds[key] ?? 0) - dt;
      if (battle.towerCds[key] > 0) continue;

      // 雷达覆盖的箭塔优先处理飞行目标；其他塔按最近距离索敌。
      let target: IZombie | null = null;
      let best = Infinity;
      let bestPriority = Infinity;
      const radarArrow = b.cfgId === 101 && hasSupportCoverage(state, 'radar', b.row, b.col, true);
      for (const z of battle.zombies) {
        const zCfg = getZombieConfig(z.cfgId);
        if (z.burrowed && !(b.cfgId === 103 && hasSupportCoverage(state, 'radar', z.row, z.col, true))) continue;
        if (b.cfgId === 101 && (zCfg?.moveType === 'burrow' || (zCfg?.moveType === 'fly' && !radarArrow))) continue;
        const d = Math.max(Math.abs(z.row - b.row), Math.abs(z.col - b.col));
        const priority = radarArrow && zCfg?.moveType === 'fly' ? 0 : 1;
        if (d <= cfg.range && (priority < bestPriority || (priority === bestPriority && d < best))) {
          bestPriority = priority;
          best = d;
          target = z;
        }
      }
      if (!target) {
        battle.towerCds[key] = 100;
        continue;
      }

      const zCfg = getZombieConfig(target.cfgId);
      const dmg = Math.max(1, attackAtLevel(cfg, b.level) - (cfg.ignoreDefense ? 0 : zCfg?.defense ?? 0));
      target.hp -= dmg;
      if (b.cfgId === 102) {
        for (const z of battle.zombies) {
          if (z === target || z.burrowed) continue;
          if (Math.max(Math.abs(z.row - target.row), Math.abs(z.col - target.col)) <= 1) {
            z.hp -= Math.max(1, attackAtLevel(cfg, b.level) - (cfg.ignoreDefense ? 0 : getZombieConfig(z.cfgId)?.defense ?? 0));
          }
        }
      } else if (b.cfgId === 103) {
        const hit = new Set<IZombie>([target]);
        let from = target;
        for (let hop = 1; hop <= 4; hop++) {
          const next = battle.zombies
            .filter(z => !hit.has(z) && !z.burrowed && Math.max(Math.abs(z.row - from.row), Math.abs(z.col - from.col)) <= 2)
            .sort((a, b) => Math.max(Math.abs(a.row - from.row), Math.abs(a.col - from.col)) - Math.max(Math.abs(b.row - from.row), Math.abs(b.col - from.col)))[0];
          if (!next) break;
          hit.add(next);
          next.hp -= Math.max(1, Math.floor(dmg * Math.pow(0.75, hop)) - (cfg.ignoreDefense ? 0 : getZombieConfig(next.cfgId)?.defense ?? 0));
          from = next;
        }
      }
      if (cfg.slow) {
        target.slowUntil = Math.max(target.slowUntil, battle.time + SLOW_DURATION);
      }
      eventBus.emit(GameEvents.NIGHT_TOWER_FIRE, {
        fromRow: b.row, fromCol: b.col, toRow: target.row, toCol: target.col, cfgId: b.cfgId, damage: dmg
      });
      const speedMultiplier = hasSupportCoverage(state, 'ammo', b.row, b.col, true) ? 1.5 : 1;
      battle.towerCds[key] = 1000 / ((cfg.speed ?? 1) * speedMultiplier);
    }
  }

  /** 已部署英雄索敌攻击（复用塔的模式：切比雪夫射程取最近，跳过潜行钻地，dmg=max(1,攻-防)） */
  private tickHeroes(state: IGameState, battle: IBattle, dt: number): void {
    for (const hero of state.heroes) {
      if (hero.row < 0) continue; // 未部署的不上场
      const cfg = getHeroConfig(hero.key);
      if (!cfg) continue;

      const key = `${hero.row},${hero.col}`;
      battle.heroCds[key] = (battle.heroCds[key] ?? 0) - dt;
      if (battle.heroCds[key] > 0) continue;

      // 最近的射程内僵尸（钻地潜行中的僵尸不可被索敌）
      let target: IZombie | null = null;
      let best = Infinity;
      for (const z of battle.zombies) {
        if (z.burrowed) continue;
        const d = Math.max(Math.abs(z.row - hero.row), Math.abs(z.col - hero.col));
        if (d <= cfg.range && d < best) {
          best = d;
          target = z;
        }
      }
      if (!target) {
        battle.heroCds[key] = 100;
        continue;
      }

      const zCfg = getZombieConfig(target.cfgId);
      const dmg = Math.max(1, cfg.attack - (zCfg?.defense ?? 0));
      target.hp -= dmg;
      eventBus.emit(GameEvents.NIGHT_HERO_FIRE, {
        fromRow: hero.row, fromCol: hero.col, toRow: target.row, toCol: target.col, heroKey: hero.key, damage: dmg
      });
      battle.heroCds[key] = 1000 / cfg.speed;
    }
  }

  /** 建筑承伤；血尽拆除，核心被毁判负 */
  private damageBuilding(state: IGameState, battle: IBattle, building: IBuilding, damage: number): void {
    building.hp -= damage;
    battle.baseDirty = true;
    if (building.hp > 0) return;

    const cfg = getBuildingConfig(building.cfgId);
    if (cfg?.kind === 'core') {
      building.hp = 0;
      battle.status = 'lost';
      return;
    }
    state.base.buildings = state.base.buildings.filter(b => b !== building);
    eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.buildingDestroyed', { building: cfg ? getBuildingName(cfg.id) : getText('base.building') }));
  }

  /** 清理死亡僵尸：掉落 + 自爆 */
  private collectDead(state: IGameState, battle: IBattle): void {
    const dead = battle.zombies.filter(z => z.hp <= 0);
    if (dead.length === 0) return;
    battle.zombies = battle.zombies.filter(z => z.hp > 0);

    for (const z of dead) {
      const cfg = getZombieConfig(z.cfgId);
      if (!cfg) continue;
      eventBus.emit(GameEvents.NIGHT_ZOMBIE_DIE, { row: z.row, col: z.col, cfgId: z.cfgId });
      const drops = rollDrops(cfg);
      for (const [id, n] of Object.entries(drops)) {
        const k = Number(id);
        battle.pendingDrops[k] = (battle.pendingDrops[k] || 0) + (n || 0);
      }
      // 自爆僵尸：波及 1 格范围建筑
      if (cfg.explode) {
        const victims = state.base.buildings.filter(b =>
          Math.max(Math.abs(b.row - z.row), Math.abs(b.col - z.col)) <= 1);
        for (const v of victims) {
          this.damageBuilding(state, battle, v, cfg.explode);
          if (battle.status === 'lost') return;
        }
      }
    }
  }
}

/** 基地全部边缘格 */
function allEdgeCells(base: IBaseState): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let i = 0; i < base.cols; i++) {
    cells.push({ row: 0, col: i }, { row: base.rows - 1, col: i });
  }
  for (let i = 1; i < base.rows - 1; i++) {
    cells.push({ row: i, col: 0 }, { row: i, col: base.cols - 1 });
  }
  return cells;
}

/** 没有建筑的边缘格：僵尸今晚只会从这些格子刷出 */
export function getOpenEdgeCells(base: IBaseState): { row: number; col: number }[] {
  return allEdgeCells(base).filter(p => !buildingAt(base, p.row, p.col));
}

/**
 * 今晚僵尸的进攻方向（夜战预告弹窗用）：
 * 按边聚合开放边缘格——角格归北/南边（与废墟归属一致），返回有缺口的边及格数。
 */
export function getAttackSides(base: IBaseState): { side: RuinSide; count: number }[] {
  const map = new Map<RuinSide, number>();
  for (const c of getOpenEdgeCells(base)) {
    let side: RuinSide;
    if (c.row === 0) side = 'north';
    else if (c.row === base.rows - 1) side = 'south';
    else if (c.col === 0) side = 'west';
    else side = 'east';
    map.set(side, (map.get(side) ?? 0) + 1);
  }
  const order: RuinSide[] = ['east', 'north', 'west', 'south'];
  return order.filter(s => map.has(s)).map(s => ({ side: s, count: map.get(s)! }));
}

/** 方位中文名 */
export const SIDE_NAMES: Record<RuinSide, string> = {
  north: '北侧',
  west: '西侧',
  south: '南侧',
  east: '东侧'
};
