import { GameEvents, eventBus } from '../events/EventBus';
import { getIdByLvUp, getMergeNextId, getProp, getPropLevel, isAutoSpawner, isClickSpawner, PROP_IDS } from '../config/PropConfig';
import { getHandTask, SAFE_TASKS, TASK_ORDER_TYPES } from '../config/TableConfig';
import { IGameState, ITask } from '../types';
import { forEachCell, setItem } from '../model/Grid';
import { itemIsNormal } from '../model/Item';
import { BagSystem } from './BagSystem';
import { EconomySystem } from './EconomySystem';
import { getRandomByWeight } from '../utils/Common';
import { getText } from '../i18n';

/** 物品位置信息（任务扣物品用） */
interface IItemLocation {
  row?: number;
  col?: number;
  bagIndex?: number;
}

/** 同时进行中的任务上限（任务栏 3 列并排） */
export const MAX_CONCURRENT_TASKS = 5;

/**
 * 可达链前瞻级数：任务最多要求比「该链当前可产出/已拥有最高级」高 N 级的物品，
 * 避免低级发射器刷出链尾高不可攀的物品（如 1 级工具箱刷出自动感应钥匙）
 */
const MERGE_LOOKAHEAD = 2;
/** 订单候选豁免的物品 id：含这些 id 的整条链不进任务候选（同 type=7 蓝图豁免逻辑，防止剧情关键道具被订单抽走） */
const ORDER_EXEMPT_ITEM_IDS = new Set([30048]); // 30048 病毒真相（病毒线索链链尾）

/**
 * 任务金币奖励 = 星星 × 10 + 需求物品出售价值总和
 * （出售价值见 prop.levelGold，量级 1~50/件，奖励约为卖掉这些材料的两倍上下）
 */
export function calcTaskGold(propArr: { id: number; num: number }[], starNum: number): number {
  let gold = starNum * 10;
  for (const need of propArr) {
    gold += (getProp(need.id)?.levelGold ?? 0) * need.num;
  }
  return gold;
}

/**
 * 任务系统
 * 新手任务链（task_newTask）→ 随机订单（task_orderType）→ 保底任务（task_SafeTask）
 *
 * 并发规则：最多 3 个任务同时进行；开局 1 个新手任务 + 补足 3 个，
 * 每完成 1 个补 1 个（新手链优先推进，其余用随机订单/保底任务补满）。
 *
 * 与源项目偏差：原项目候选物品依赖图鉴解锁状态（res1=3/4/5/6），
 * 本项目未迁移图鉴，统一用「棋盘产出链可达 + 品质过滤」近似：
 *   res1=2 → 棋盘上已拥有的正常物品
 *   其他   → 产出链可达但未拥有的物品；为空时回退到已拥有
 */
export class TaskSystem {
  private bagSystem: BagSystem;
  private economy: EconomySystem;

  constructor(bagSystem: BagSystem, economy: EconomySystem) {
    this.bagSystem = bagSystem;
    this.economy = economy;
  }

  /** 创建新手任务（id 从 1 开始，完成链式推进） */
  createHandTask(id: number): ITask | null {
    const row = getHandTask(id);
    if (!row) return null;
    const task: ITask = {
      id: row.id,
      propArr: [{ id: row.prop, num: row.num }],
      starNum: row.taskReward,
      hand: 1
    };
    task.goldNum = calcTaskGold(task.propArr, task.starNum);
    // 早期新手任务的额外物品奖励（发射器件/宝箱，引导新发射器来源）
    if (row.rewardProp && (row.rewardProp < 70001 || row.rewardProp === 70001 || row.rewardProp === 70007 || row.rewardProp === 70015)) {
      task.rewardPropArr = [{ id: row.rewardProp, num: row.rewardNum ?? 1 }];
    }
    return task;
  }

  /**
   * 生成随机订单（对应源项目 createTaskMain）
   */
  createRandomTasks(num: number, state: IGameState): ITask[] {
    const tasks: ITask[] = [];
    let seqId = Date.now() % 100000;

    // 进行中任务已要求的物品不再重复要求（避免 3 个任务要同一件东西）
    const busyIds = new Set<number>();
    const usedSpawnerKeys = this.getTaskSpawnerKeys(state, state.tasks.flatMap(task => task.propArr.map(prop => prop.id)));
    for (const t of state.tasks) {
      for (const p of t.propArr) busyIds.add(p.id);
    }

    for (let i = 0; i < num; i++) {
      // 按玩家等级过滤任务类型，权重抽取
      const candidates = TASK_ORDER_TYPES.filter(
        row => state.roleLv >= row.levelMin && state.roleLv <= row.levelMax
      );
      const retRow = getRandomByWeight(candidates);
      if (!retRow) continue;

      // 候选物品
      let idArr = this.collectCandidateIds(retRow.res1, retRow.quality, state)
        .filter(id => !busyIds.has(id));
      if (idArr.length <= 0 && retRow.res1 !== 2) {
        // 回退到已拥有
        idArr = this.collectCandidateIds(2, retRow.quality, state)
          .filter(id => !busyIds.has(id));
      }
      if (idArr.length <= 0) continue;
      idArr = this.preferUnusedSpawnerCandidates(idArr, state, usedSpawnerKeys);
      const validSet = new Set(idArr);

      // 物品种类数
      let needTypeNum = retRow.djzl;
      if (idArr.length <= 1) needTypeNum = 1;

      const propArr: { id: number; num: number }[] = [];
      const numWeights = this.parseNumWeights(retRow.num);
      // 库存消耗类订单：按棋盘堆叠数量加权，囤积越多的物品越容易被订单消化
      const ownedCount = retRow.res1 === 2 ? this.countOwnedById(state) : null;
      const pool = [...idArr];
      for (let t = 0; t < needTypeNum && pool.length > 0; t++) {
        // 随机取一个不重复的
        const idx = ownedCount
          ? this.weightedPickIndex(pool, ownedCount)
          : Math.floor(Math.random() * pool.length);
        let retId = pool.splice(idx, 1)[0];

        // 等级提升（res1=2 按棋盘最高等级，3/6 按链条）
        if (retRow.djsj > 0) {
          const upId = getIdByLvUp(retId, retRow.djsj);
          // 提升后超出可达范围则放弃提升（已拥有的可向上合成，不受限）
          if (retRow.res1 === 2 || validSet.has(upId)) {
            retId = upId;
          }
        }
        if (propArr.some(p => p.id === retId)) continue;

        const needNum = getRandomByWeight(numWeights)?.num ?? 1;
        propArr.push({ id: retId, num: needNum });
      }

      if (propArr.length > 0) {
        const starNum = retRow.taskReward[Math.floor(Math.random() * retRow.taskReward.length)] || 1;
        tasks.push({ id: ++seqId, propArr, starNum, goldNum: calcTaskGold(propArr, starNum) });
        // 本批已用掉的物品也不再重复
        for (const p of propArr) {
          busyIds.add(p.id);
          const spawnerKey = this.getTaskSpawnerKey(state, p.id);
          if (spawnerKey) usedSpawnerKeys.add(spawnerKey);
        }
      }
    }

    // 保底任务（同样避开进行中任务已要的物品）
    if (tasks.length <= 0) {
      const pool = SAFE_TASKS.filter(s => !busyIds.has(s.prop));
      const pickFrom = pool.length > 0 ? pool : SAFE_TASKS;
      const safe = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      if (safe) {
        const propArr = [{ id: safe.prop, num: safe.num }];
        tasks.push({
          id: ++seqId,
          propArr,
          starNum: safe.taskReward,
          goldNum: calcTaskGold(propArr, safe.taskReward)
        });
      }
    }

    return tasks;
  }

  /**
   * 返回任务目标在棋盘上对应的发射器链；点击和自动产出都参与。
   * 任务选择优先避开已被当前任务占用的 key，来源不足时自然允许复用。
   */
  getTaskSpawnerKeys(state: IGameState, ids: number[]): Set<number> {
    const keys = new Set<number>();
    for (const id of ids) {
      const key = this.getTaskSpawnerKey(state, id);
      if (key !== undefined) keys.add(key);
    }
    return keys;
  }

  /** 优先选取当前任务尚未占用的发射器链；空闲链不存在时保留原候选以免任务生成卡住。 */
  preferUnusedSpawnerCandidates(ids: number[], state: IGameState, usedSpawnerKeys: Set<number>): number[] {
    const unused = ids.filter(id => {
      const key = this.getTaskSpawnerKey(state, id);
      return key !== undefined && !usedSpawnerKeys.has(key);
    });
    return unused.length > 0 ? unused : ids;
  }

  private getTaskSpawnerKey(state: IGameState, targetId: number): number | undefined {
    let found: number | undefined;
    forEachCell(state.grid, (item) => {
      if (found !== undefined || !item || !itemIsNormal(item, state.timestamp)) return;
      const prop = getProp(item.id);
      if (!prop || (!isClickSpawner(item.id) && !isAutoSpawner(item.id))) return;
      const seeds: number[] = [];
      if (prop.atom) seeds.push(...String(prop.atom).split(',').map(Number));
      if (prop.fair > 0) seeds.push(prop.fair);
      if (item.clickPropId) seeds.push(...item.clickPropId);
      if (prop.clickPropId) seeds.push(...prop.clickPropId as number[]);
      for (const seed of seeds) {
        let id = seed;
        while (id > 0) {
          if (id === targetId) {
            found = this.getSpawnerFamilyKey(item.id);
            return;
          }
          id = getMergeNextId(id);
        }
      }
    });
    return found;
  }

  private getSpawnerFamilyKey(spawnerId: number): number {
    const prop = getProp(spawnerId);
    if (!prop) return spawnerId;
    let first = spawnerId;
    while (true) {
      const prev = getProp(first - 1);
      if (!prev || prev.type !== prop.type || prev.typeson !== prop.typeson) break;
      first--;
    }
    return first;
  }

  /** 解析 "100,10,5" 为 [{num:1,weight:100}...] */
  private parseNumWeights(numStr: string): { num: number; weight: number }[] {
    const parts = String(numStr).split(',');
    const res: { num: number; weight: number }[] = [];
    for (let i = 0; i < parts.length; i++) {
      const w = parseInt(parts[i]);
      if (!isNaN(w) && w > 0) {
        res.push({ num: i + 1, weight: w });
      }
    }
    return res.length > 0 ? res : [{ num: 1, weight: 1 }];
  }

  /**
   * 收集候选物品 id
   * @param res1 2=棋盘已拥有 / 其他=产出链可达未拥有
   */
  private collectCandidateIds(res1: number, quality: number, state: IGameState): number[] {
    if (res1 === 2) {
      return this.collectOwnedIds(quality, state);
    }
    const reachable = this.collectReachableIds(state);
    const owned = new Set(this.collectOwnedIds(quality, state));
    return reachable.filter(id => {
      const prop = getProp(id);
      if (!prop || prop.lunc > quality) return false;
      if (owned.has(id)) return false;
      return true;
    });
  }

  /** 棋盘上已拥有物品的数量表（不含背包/封印/气泡） */
  private countOwnedById(state: IGameState): Map<number, number> {
    const count = new Map<number, number>();
    forEachCell(state.grid, (item) => {
      if (!item || item.id === PROP_IDS.bag) return;
      if (!itemIsNormal(item, state.timestamp)) return;
      count.set(item.id, (count.get(item.id) ?? 0) + 1);
    });
    return count;
  }

  /** 按数量加权从 pool 中选一个下标（数量越多越容易被选中） */
  private weightedPickIndex(pool: number[], count: Map<number, number>): number {
    let total = 0;
    for (const id of pool) total += count.get(id) ?? 1;
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= count.get(pool[i]) ?? 1;
      if (roll < 0) return i;
    }
    return pool.length - 1;
  }

  /** 棋盘上已拥有的正常物品（不含背包/封印/气泡） */
  private collectOwnedIds(quality: number, state: IGameState): number[] {
    const idSet = new Set<number>();
    forEachCell(state.grid, (item) => {
      if (!item || item.id === PROP_IDS.bag) return;
      if (!itemIsNormal(item, state.timestamp)) return;
      const prop = getProp(item.id);
      if (!prop || prop.lunc > quality) return;
      idSet.add(item.id);
    });
    return [...idSet];
  }

  /**
   * 棋盘产出链可达的物品集合：
   * 从棋盘上发射器(atom)/自动器(fair)的产出出发，沿 blessId 合成链闭包。
   * 闭包高度受限：不超过「种子产物等级、该链在棋盘上已拥有最高等级」+ MERGE_LOOKAHEAD，
   * 保证任务要求的物品是玩家短期内真能合出来的。
   * 被封印（纸箱/蜘蛛网）或气泡中的物品不参与：它们当前无法产出，否则任务会遥不可及。
   */
  collectReachableIds(state: IGameState): number[] {
    const reachable = new Set<number>();
    const seeds: number[] = [];

    // 棋盘上已拥有物品的等级表（含发射器本身，用于抬高链上限）
    const ownedLevel = new Map<number, number>();

    forEachCell(state.grid, (item) => {
      if (!item) return;
      const prop = getProp(item.id);
      if (!prop) return;
      if (!itemIsNormal(item, state.timestamp)) return; // 封印/气泡中的不算可产出
      ownedLevel.set(item.id, prop.luna ?? 1);
      // 发射器产出
      if (prop.atom) {
        for (const idStr of String(prop.atom).split(',')) {
          const pid = parseInt(idStr);
          if (pid > 0) seeds.push(pid);
        }
      }
      // 自动器产出
      if (prop.fair > 0) seeds.push(prop.fair);
      // 指定产出队列
      if (item.clickPropId) {
        for (const pid of item.clickPropId) seeds.push(pid);
      }
      if (prop.clickPropId) {
        for (const pid of prop.clickPropId as number[]) seeds.push(pid);
      }
    });

    for (const seedId of seeds) {
      // 蓝图类道具（type=7）不进任务候选：数量稀少且是建筑解锁关键，不能被订单抽走
      if (getProp(seedId)?.type === 7) continue;
      // 沿链收集成员
      const chain: number[] = [];
      let cur = seedId;
      while (cur > 0 && !chain.includes(cur)) {
        chain.push(cur);
        cur = getMergeNextId(cur);
      }
      // 剧情关键链豁免（病毒线索链等，链尾是剧情道具，不能被订单抽走）
      if (chain.some(id => ORDER_EXEMPT_ITEM_IDS.has(id))) continue;
      // 链上限 = max(种子等级, 该链已拥有最高等级) + 前瞻
      let baseLv = getPropLevel(seedId);
      for (const id of chain) {
        const lv = ownedLevel.get(id);
        if (lv !== undefined && lv > baseLv) baseLv = lv;
      }
      const cap = baseLv + MERGE_LOOKAHEAD;
      for (const id of chain) {
        if (getPropLevel(id) <= cap) reachable.add(id);
      }
    }
    return [...reachable];
  }

  /**
   * 统计某 id 物品（棋盘正常格 + 背包内）的位置列表
   */
  getItemLocations(state: IGameState, id: number): IItemLocation[] {
    const locations: IItemLocation[] = [];
    forEachCell(state.grid, (item, row, col) => {
      if (!item || item.id !== id) return;
      if (!itemIsNormal(item, state.timestamp)) return;
      locations.push({ row, col });
    });
    // 背包里的也算
    const bagItem = this.bagSystem.getBagItem(state);
    if (bagItem && bagItem.roomArr) {
      for (let i = 0; i < bagItem.roomArr.length; i++) {
        const it = bagItem.roomArr[i];
        if (it && it.id === id) {
          locations.push({ bagIndex: i });
        }
      }
    }
    return locations;
  }

  /** 某 id 物品持有数量（棋盘正常格 + 背包） */
  countItem(state: IGameState, id: number): number {
    return this.getItemLocations(state, id).length;
  }

  /** 任务是否可完成 */
  canCompleteTask(state: IGameState, task: ITask): boolean {
    for (const need of task.propArr) {
      if (this.countItem(state, need.id) < need.num) return false;
    }
    return true;
  }

  /**
   * 完成任务：扣物品（棋盘+背包）、发星星、生成后续任务
   */
  completeTask(state: IGameState, task: ITask): boolean {
    if (!this.canCompleteTask(state, task)) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.taskItemsShort'));
      return false;
    }

    const bagItem = this.bagSystem.getBagItem(state);
    let bagChanged = false;

    // 扣除物品
    for (const need of task.propArr) {
      const locations = this.getItemLocations(state, need.id);
      for (let i = 0; i < need.num && i < locations.length; i++) {
        const loc = locations[i];
        if (loc.bagIndex !== undefined && bagItem && bagItem.roomArr) {
          bagItem.roomArr[loc.bagIndex] = null;
          bagChanged = true;
        } else if (loc.row !== undefined && loc.col !== undefined) {
          setItem(state.grid, loc.row, loc.col, null);
          eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: { row: loc.row, col: loc.col }, item: null });
        }
      }
    }
    if (bagChanged && bagItem) {
      this.bagSystem.sortBag(bagItem);
      eventBus.emit(GameEvents.BAG_UPDATED, {});
    }

    // 奖励星星 + 金币（旧存档任务没有 goldNum，现场算）
    this.economy.addPropNum(state, PROP_IDS.star, task.starNum);
    const goldNum = task.goldNum ?? calcTaskGold(task.propArr, task.starNum);
    if (goldNum > 0) {
      this.economy.addPropNum(state, PROP_IDS.coin, goldNum);
    }

    // 额外物品奖励（货币直接入账，道具进卡片列表）；发放提示由场景层用 NPC 对话呈现
    if (task.rewardPropArr) {
      for (const reward of task.rewardPropArr) {
        this.economy.addPropNum(state, reward.id, reward.num);
      }
    }

    // 移除任务
    const idx = state.tasks.indexOf(task);
    if (idx >= 0) state.tasks.splice(idx, 1);

    eventBus.emit(GameEvents.TASK_DONE, { task });

    // 生成后续任务：新手链优先推进，然后补满并发上限（完成 1 个补 1 个）
    if (task.hand) {
      const nextHandTask = this.createHandTask(task.id + 1);
      if (nextHandTask) state.tasks.push(nextHandTask);
    }
    this.topUpTasks(state);

    eventBus.emit(GameEvents.TASK_UPDATED, { tasks: state.tasks });
    return true;
  }

  /**
   * 补充任务到并发上限（3 个）：随机订单优先，生成不出时用保底任务
   */
  topUpTasks(state: IGameState): void {
    let guard = 0;
    while (state.tasks.length < MAX_CONCURRENT_TASKS && guard++ < MAX_CONCURRENT_TASKS * 3) {
      const before = state.tasks.length;
      const newTasks = this.createRandomTasks(MAX_CONCURRENT_TASKS - state.tasks.length, state);
      state.tasks.push(...newTasks);
      if (state.tasks.length === before) {
        // 随机订单一个都生成不出 → 直接塞保底任务（避开进行中任务已要的物品）
        const busy = new Set<number>();
        for (const t of state.tasks) for (const p of t.propArr) busy.add(p.id);
        const pool = SAFE_TASKS.filter(s => !busy.has(s.prop));
        const pickFrom = pool.length > 0 ? pool : SAFE_TASKS;
        const safe = pickFrom[Math.floor(Math.random() * pickFrom.length)];
        if (!safe) break;
        const propArr = [{ id: safe.prop, num: safe.num }];
        state.tasks.push({
          id: Date.now() % 100000 + state.tasks.length + 1,
          propArr,
          starNum: safe.taskReward,
          goldNum: calcTaskGold(propArr, safe.taskReward)
        });
      }
    }
  }

  /** 某物品是否被任务需要 */
  isTaskNeedWithId(state: IGameState, id: number): boolean {
    for (const task of state.tasks) {
      for (const prop of task.propArr) {
        if (prop.id === id) return true;
      }
    }
    return false;
  }

  /**
   * 任务可行性集合：可达链（限高）∪ 已拥有物品沿合成链向上的全部等级
   * （拥有链上任意一件，更高等级总能靠合成达到）
   */
  private collectFeasibleIds(state: IGameState): Set<number> {
    const feasible = new Set(this.collectReachableIds(state));
    for (const id of this.collectOwnedIds(Number.MAX_SAFE_INTEGER, state)) {
      let cur = id;
      while (cur > 0 && !feasible.has(cur)) {
        feasible.add(cur);
        cur = getMergeNextId(cur);
      }
    }
    return feasible;
  }

  /**
   * 清理存档里按旧规则生成、当前不可能完成的任务（新手任务保留），
   * 清理后按新规则补满并发上限。读档时调用一次。
   */
  pruneImpossibleTasks(state: IGameState): number {
    const feasible = this.collectFeasibleIds(state);
    const before = state.tasks.length;
    const retainedSpawnerKeys = new Set<number>();
    state.tasks = state.tasks.filter(t => {
      if (t.hand === 1) return true;
      if (!t.propArr.every(p => feasible.has(p.id))) return false;
      const key = t.propArr.map(p => this.getTaskSpawnerKey(state, p.id)).find((value): value is number => value !== undefined);
      if (key === undefined || !retainedSpawnerKeys.has(key)) {
        if (key !== undefined) retainedSpawnerKeys.add(key);
        return true;
      }
      return false;
    });
    const removed = before - state.tasks.length;
    this.topUpTasks(state);
    if (removed > 0 || state.tasks.length !== before) {
      eventBus.emit(GameEvents.TASK_UPDATED, { tasks: state.tasks });
    }
    return removed;
  }
}
