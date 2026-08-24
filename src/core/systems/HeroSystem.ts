import { GameEvents, eventBus } from '../events/EventBus';
import { IGameState, IHeroState } from '../types';
import { buildingAt, zoneOf, BaseZone } from '../model/Base';
import { getHeroConfig } from '../config/HeroConfig';
import { getText } from '../i18n';

/**
 * 英雄系统
 * 剧情中加入堡垒的 NPC 可部署到基地内圈空格，夜战时自动攻击靠近的僵尸，
 * 作为核心前的最后一道防线（见 NightSystem.tickHeroes）。
 * 英雄不占 buildings[]（不挡僵尸路、僵尸不攻击英雄）、不耗电、不会死亡。
 */
export class HeroSystem {

  /** 新的一天结算英雄恢复；重伤满 7 天后以满血归队。 */
  recoverForNewDay(state: IGameState): void {
    for (const hero of state.heroes) {
      const maxHp = this.ensureHealth(hero);
      if (hero.recoveryDays) {
        hero.recoveryDays--;
        if (hero.recoveryDays === 0) hero.hp = maxHp;
      } else if ((hero.hp ?? maxHp) > 0) {
        hero.hp = Math.min(maxHp, (hero.hp ?? maxHp) + Math.ceil(maxHp * 0.2));
      }
    }
  }

  /** 已加入的英雄 */
  getJoined(state: IGameState): IHeroState[] {
    return state.heroes;
  }

  /** 已部署的英雄 */
  getDeployed(state: IGameState): IHeroState[] {
    return state.heroes.filter(h => h.row >= 0);
  }

  /** 某格上已部署的英雄 */
  getHeroAt(state: IGameState, row: number, col: number): IHeroState | undefined {
    return state.heroes.find(h => h.row === row && h.col === col);
  }

  /** 该格能否部署英雄：内圈 + 无建筑 + 无其他已部署英雄 */
  canDeployAt(state: IGameState, row: number, col: number): { ok: boolean; reason?: string } {
    const base = state.base;
    if (row < 0 || row >= base.rows || col < 0 || col >= base.cols) return { ok: false, reason: getText('hero.outOfBounds') };
    if (zoneOf(row, col) !== BaseZone.Inner) return { ok: false, reason: getText('hero.innerOnly') };
    if (buildingAt(base, row, col)) return { ok: false, reason: getText('hero.cellHasBuilding') };
    if (this.getHeroAt(state, row, col)) return { ok: false, reason: getText('hero.cellHasHero') };
    return { ok: true };
  }

  /** 部署英雄到内圈空格（每个英雄全图唯一，只能部署一次） */
  deploy(state: IGameState, key: string, row: number, col: number): boolean {
    const hero = state.heroes.find(h => h.key === key);
    if (!hero || !getHeroConfig(key)) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.heroNotJoined'));
      return false;
    }
    if ((hero.hp ?? this.ensureHealth(hero)) <= 0 || hero.recoveryDays) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.heroCritical', { days: hero.recoveryDays ?? 0 }));
      return false;
    }
    if (hero.row >= 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.heroDeployed'));
      return false;
    }
    const check = this.canDeployAt(state, row, col);
    if (!check.ok) {
      eventBus.emit(GameEvents.TOAST_SHOW, check.reason || getText('toast.cannotDeploy'));
      return false;
    }
    hero.row = row;
    hero.col = col;
    eventBus.emit(GameEvents.BASE_CHANGED, { row, col });
    return true;
  }

  /** 撤回英雄（回到未部署状态，可重新部署） */
  undeploy(state: IGameState, key: string): boolean {
    const hero = state.heroes.find(h => h.key === key);
    if (!hero || hero.row < 0) return false;
    const row = hero.row;
    const col = hero.col;
    hero.row = -1;
    hero.col = -1;
    eventBus.emit(GameEvents.BASE_CHANGED, { row, col });
    return true;
  }

  private ensureHealth(hero: IHeroState): number {
    const maxHp = Math.max(1, hero.maxHp ?? getHeroConfig(hero.key)?.hp ?? 100);
    hero.maxHp = maxHp;
    hero.hp = Math.min(maxHp, Math.max(0, hero.hp ?? maxHp));
    return maxHp;
  }
}
