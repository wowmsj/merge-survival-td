import { GameEvents, eventBus } from '../events/EventBus';
import { IStoryBeat, IStoryLine, STORY_BEATS, getBeatsByTrigger } from '../config/StoryConfig';
import { getSpeakerName, getStoryRewardText, getText } from '../i18n';
import { IGameState } from '../types';
import { forEachCell } from '../model/Grid';
import { EconomySystem } from './EconomySystem';

/**
 * 剧情系统
 * 各场景在合适的时机调用 check* 方法触发剧情（升级、建造、物品出现、僵尸登场、夜晚结束）。
 * 触发过的 beat 记录进 state.storySeen（随存档持久化），每个 beat 只播一次。
 * 多个 beat 同时触发时排队，UI 播完一段调用 beatDone() 后播下一段。
 * beat.rewardCoin > 0 时（老鬼任务打赏），beatDone 时金币入账并弹 toast。
 * beat.joinHero 时（NPC 加入堡垒），beatDone 时英雄入队并发 HERO_JOINED。
 */
export class StorySystem {
  private queue: IStoryBeat[] = [];
  private playing = false;
  private economy = new EconomySystem();

  /** UI 播完一段 → 结算该段奖励（rewardCoin / joinHero）→ 播队列下一段 */
  beatDone(state?: IGameState): void {
    const beat = this.queue.shift();
    if (beat && state && beat.rewardCoin && beat.rewardCoin > 0) {
      this.economy.addResource(state, 'coin', beat.rewardCoin);
      // toast 用首个非旁白说话人的名字（老鬼打赏 → 老鬼；满仓 → 满仓），也可用 rewardText 自定义
      const speaker = beat.lines.find(l => l.who !== 'narrator')?.who;
      const name = speaker ? getSpeakerName(speaker) : getSpeakerName('laogui');
      eventBus.emit(GameEvents.TOAST_SHOW, getStoryRewardText(beat.id) ?? getText('story.reward', { name, coins: beat.rewardCoin }));
    }
    // 英雄入队：已入队的不重复（剧情回顾重播等重复结算场景安全）
    if (beat && state && beat.joinHero && !state.heroes.some(h => h.key === beat.joinHero)) {
      state.heroes.push({ key: beat.joinHero, row: -1, col: -1 });
      eventBus.emit(GameEvents.HERO_JOINED, { key: beat.joinHero });
    }
    if (beat && state) grantStorySpawnProps(state, beat, this.economy);
    this.playing = false;
    this.pump();
  }

  /** 新开局（只在新游戏时调用，读档走 onGameReady） */
  onNewGame(state: IGameState): void {
    this.fire(state, getBeatsByTrigger('newGame', undefined, this.seen(state)));
  }

  /** 首次合成成功 */
  checkMerge(state: IGameState): void {
    this.fire(state, getBeatsByTrigger('merge', undefined, this.seen(state)));
  }

  /** 提交订单（taskId 用于精确匹配带 value 的 task beat；不传则只触发通用 task beat） */
  checkTaskDone(state: IGameState, taskId?: number): void {
    this.fire(state, getBeatsByTrigger('task', taskId, this.seen(state)));
  }

  /** 金币数量变化（建造引导：攒够钱提示花出去） */
  checkCoin(state: IGameState, coin: number): void {
    this.fire(state, getBeatsByTrigger('coin', coin, this.seen(state)));
  }

  /**
   * 进入游戏/读档后调用：补播「等级已达到但还没看过」的 beat，
   * 并扫描棋盘物品触发 item 类 beat（老存档也能看到对应剧情）
   */
  onGameReady(state: IGameState): void {
    const seen = this.seen(state);
    this.fire(state, getBeatsByTrigger('level', state.roleLv, seen));
    const itemIds: number[] = [];
    forEachCell(state.grid, (item) => {
      if (item) itemIds.push(item.id);
    });
    this.checkItems(state, itemIds);
  }

  /** 玩家升级 */
  checkLevel(state: IGameState, level: number): void {
    this.fire(state, getBeatsByTrigger('level', level, this.seen(state)));
  }

  /** 建成建筑（cfgId 为建筑配置 id） */
  checkBuilding(state: IGameState, cfgId: number): void {
    this.fire(state, getBeatsByTrigger('building', cfgId, this.seen(state)));
  }

  /** 使用蓝图解锁建筑（cfgId 为建筑配置 id） */
  checkBlueprint(state: IGameState, cfgId: number): void {
    this.fire(state, getBeatsByTrigger('blueprint', cfgId, this.seen(state)));
  }

  /** 一批物品 id 出现在棋盘（产出/取卡/奖励落子等入口统一调用） */
  checkItems(state: IGameState, itemIds: number[]): void {
    const seen = this.seen(state);
    for (const id of itemIds) {
      this.fire(state, getBeatsByTrigger('item', id, seen));
    }
  }

  /** 僵尸登场（moveType: ground/fly/burrow） */
  checkZombie(state: IGameState, moveType: string): void {
    this.fire(state, getBeatsByTrigger('zombie', moveType, this.seen(state)));
  }

  /** 夜晚结束：失败播 nightLose（时间回溯，仅首次）；胜利播 nightWin（仅首次），并按天数触发一章 day beat（每晚最多一章，漏章逐晚补播） */
  checkNightEnd(state: IGameState, won: boolean, day: number): void {
    if (!won) {
      this.fire(state, getBeatsByTrigger('nightLose', undefined, this.seen(state)));
      return;
    }
    this.fire(state, getBeatsByTrigger('nightWin', undefined, this.seen(state)));
    // slice(0,1)：老存档天数远超剧情进度时不刷屏，每守完一夜按序补一章
    this.fire(state, getBeatsByTrigger('day', day, this.seen(state)).slice(0, 1));
  }

  /**
   * 剧情回顾：重播一段已解锁的 beat。
   * 不入 storySeen（早已看过）；剥掉 rewardCoin/spawnProps 防止重复结算（主线 beat 本来也没有）。
   */
  replay(beat: IStoryBeat): void {
    this.queue.unshift({ ...beat, rewardCoin: 0, spawnProps: undefined });
    this.pump();
  }

  /**
   * 播放一段临时对话（不入配置、不写 storySeen、不结算奖励），
   * 走同一条播放队列：正在播别的剧情时自动排队。用于任务赠品发放等即兴对白。
   */
  playAdHoc(lines: IStoryLine[]): void {
    if (lines.length === 0) return;
    this.queue.push({ id: -1, chapter: 0, trigger: { type: 'task' }, lines });
    this.pump();
  }

  private seen(state: IGameState): Set<number> {
    return new Set(state.storySeen);
  }

  private fire(state: IGameState, beats: IStoryBeat[]): void {
    for (const beat of beats) {
      if (state.storySeen.includes(beat.id)) continue;
      state.storySeen.push(beat.id);
      this.queue.push(beat);
    }
    this.pump();
  }

  /** 空闲且队列非空时播下一段 */
  private pump(): void {
    if (this.playing || this.queue.length <= 0) return;
    this.playing = true;
    eventBus.emit(GameEvents.STORY_PLAY, { beat: this.queue[0] });
  }
}

/** 投放剧情道具奖励并记录领取状态，保证同一剧情只发放一次。 */
export function grantStorySpawnProps(state: IGameState, beat: IStoryBeat, economy = new EconomySystem()): void {
  if (!beat.spawnProps || state.storyRewardClaims.includes(beat.id)) return;
  for (const propId of beat.spawnProps) economy.giveItemToBoardOrCard(state, propId);
  state.storyRewardClaims.push(beat.id);
}

/** 补发本版本新增的第三天断水剧情奖励，避免影响历史其他剧情道具。 */
export function backfillStorySpawnProps(state: IGameState): void {
  for (const beat of STORY_BEATS) {
    if (state.storySeen.includes(beat.id)) grantStorySpawnProps(state, beat);
  }
}
