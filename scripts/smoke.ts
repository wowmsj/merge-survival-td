/**
 * core 层冒烟测试（无头运行，不依赖 Phaser）
 * 运行方式：见 package.json scripts.smoke 或手动 tsc 编译后 node 执行
 */
import { GameInitializer } from '../src/core/init/GameInitializer';
import { createInitialGameState, canHostItem } from '../src/core/model/GameState';
import { CoreSystem } from '../src/core/systems/CoreSystem';
import { CORE_LEVEL_MAX, getCoreCdSecondsAt, getCoreProductsAt, getCorePropId, getCoreTimesAt, getCoreUpgradeCost, isCoreMaterial } from '../src/core/config/CoreConfig';
import { setItem, getItem } from '../src/core/model/Grid';
import { createItemFromConfig } from '../src/core/model/Item';
import { ItemStatus, IGameState, IItemData } from '../src/core/types';
import { BagSystem } from '../src/core/systems/BagSystem';
import { EconomySystem } from '../src/core/systems/EconomySystem';
import { SpecialItemSystem } from '../src/core/systems/SpecialItemSystem';
import { MergeSystem } from '../src/core/systems/MergeSystem';
import { SpawnSystem } from '../src/core/systems/SpawnSystem';
import { TaskSystem, calcRandomTaskStars, calcTaskDiamondCost, calcTaskGold, calcTaskMergeEffort } from '../src/core/systems/TaskSystem';
import { LevelSystem } from '../src/core/systems/LevelSystem';
import { BaseSystem, PRODUCE_ACCUM_CAP, canDefendFlyingEnemies, formatGains, formatResourceGains, getPowerInfo, isBuildingPowered, isTowerPoweredAtNight } from '../src/core/systems/BaseSystem';
import { NightSystem, IBattle, getAttackSides, getOpenEdgeCells } from '../src/core/systems/NightSystem';
import { HeroSystem } from '../src/core/systems/HeroSystem';
import { getAllHeroConfigs, getHeroConfig } from '../src/core/config/HeroConfig';
import { StorageSystem, SAVE_KEY, SAVE_VERSION } from '../src/core/systems/StorageSystem';
import { getBuildingName, getCharacterBio, getHeroDescription, getHeroName, getLocaleData, getPropDescription, getPropName, getSpeakerName, getStoryLines, getStoryUnlockCondition, getText, getZombieName, resolveLanguage, setLanguage } from '../src/core/i18n';
import { translateEnglishSpeaker } from '../src/core/i18n/en';
import { StorySystem } from '../src/core/systems/StorySystem';
import { GameEvents, eventBus } from '../src/core/events/EventBus';
import { IStoryBeat, STORY_BEATS, getMainStoryBeats, getUnlockCondition, hasTaskStoryBeat, getMetCharacters } from '../src/core/config/StoryConfig';
import { genWaveZombies, getTotalWaves, getZombieConfig, getNightPreview, getZombieLevel, rollDrops } from '../src/core/config/ZombieConfig';
import { getAllProps, getMergeChain, getMergeChainSpawner, getMergeNextId, getSpawnerProductView, isMergeChainTop, isMaxBadgeItem, isClickSpawner, getClickProducts, getProp, isToolSeriesItem, isRetiredCoreProp } from '../src/core/config/PropConfig';
import { getAllBuildingConfigs, getBuildingConfig, outputIntervalAtLevel, getBuildableList, RUIN_ID, getRepairCostCoin } from '../src/core/config/BuildingConfig';
import { getAllZombieConfigs } from '../src/core/config/ZombieConfig';
import { getPowerMax } from '../src/core/config/TableConfig';
import { BASE_CENTER, createDefaultBase, findPathToCore, getShortestEntryPathLength, isClaimed, claimAround, hasKillCorridor, RUIN_COLLAPSE_ORDER, ruinCellsOfSide } from '../src/core/model/Base';
import { computeRoutePreview } from '../src/core/systems/RoutePreview';
import { TERRAIN_CLEAR_COST, TERRAIN_TABLE, terrainAt, isTerrainSpawnable } from '../src/core/config/TerrainConfig';
import { applyCoreAura, getCoreAuraChance, getCoreTier, getItemTier } from '../src/core/config/MergeCoreConfig';
import { useBlueprint, ensureUnlockedBuildings } from '../src/core/systems/UnlockSystem';
import { BLACK_MARKET_ITEMS, buyBlackMarketBlueprint, buyNeededMaterial, exchangeDiamondForCoins, getNeededMaterials, getRecommendedMarketItem } from '../src/core/systems/BlackMarketSystem';

/** 解锁全部需蓝图的建筑（测试建造/产出逻辑时跳过蓝图前置） */
function unlockAllBuildings(state: { unlockedBuildings: number[] }) {
  state.unlockedBuildings = getBuildableList().map(b => b.id);
}

/** 注入一座风力发电站（Lv1 providePower 6）；放在西北角 (2,2)，远离东侧进攻路线。 */
function addFueledGenerator(state: IGameState) {
  state.base.buildings.push({ cfgId: 203, level: 1, hp: 150, maxHp: 150, row: 2, col: 2 });
}

let passed = 0;
let failed = 0;

/**
 * 固定随机数：core 里生成器产出/夜战抽型/掉落都走 Math.random，不固定的话同一份代码
 * 每次跑会有 1~2 条用例随机红（例如"1 级工具箱只产 10012 螺丝刀"），没法当作验收依据。
 * 这里换成固定种子的 LCG，让冒烟可复现；换种子能顺带扫出"只在某条随机路径上才暴露"的问题。
 */
{
  const seedEnv = process.env.SMOKE_SEED;
  let seed = (seedEnv ? Number(seedEnv) : 20260913) >>> 0;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function assert(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log('  PASS', name);
  } else {
    failed++;
    console.error('  FAIL', name);
  }
}

function makeSystems() {
  const economy = new EconomySystem();
  const bag = new BagSystem();
  const special = new SpecialItemSystem(economy);
  const level = new LevelSystem(economy);
  const merge = new MergeSystem(bag, special, level);
  const spawn = new SpawnSystem();
  const task = new TaskSystem(bag, economy);
  const core = new CoreSystem(economy);
  return { economy, bag, special, merge, spawn, task, level, core };
}

/** 在物品层上按 id 找第一个格位（初始布局落点由 GameInitializer 决定，测试不硬编码坐标） */
function findCell(state: IGameState, id: number): { row: number; col: number } | null {
  for (let r = 0; r < state.grid.rowNum; r++) {
    for (let c = 0; c < state.grid.colNum; c++) {
      if (state.grid.cells[r][c].item?.id === id) return { row: r, col: c };
    }
  }
  return null;
}

/** 设置基地核心等级（合成权限/光环/发射池测试用；核心不再是棋盘道具） */
function setCoreLevel(state: IGameState, level: number): void {
  const core = state.base.buildings.find(b => b.cfgId === 1);
  if (core) core.level = level;
}

// ============ 0. 领地与引流走廊（首版规则） ============
console.log('== 领地与引流走廊 ==');
{
  const baseState = createDefaultBase();
  assert(isClaimed(baseState, BASE_CENTER, BASE_CENTER), '核心区域初始已占领');
  assert(!isClaimed(baseState, 0, 0), '远端角落初始未占领');
  const claimed = claimAround(baseState, BASE_CENTER - 5, BASE_CENTER, 1);
  assert(claimed > 0 && isClaimed(baseState, BASE_CENTER - 6, BASE_CENTER), '前哨向外扩张领地');

  const corridorState = createInitialGameState();
  for (const row of corridorState.base.tiles) for (const tile of row) tile.claimed = true;
  const base = new BaseSystem(new EconomySystem());
  unlockAllBuildings(corridorState);
  corridorState.resources.coin = 10000;
  assert(hasKillCorridor(corridorState.base), '初始基地存在引流走廊');
  assert((getShortestEntryPathLength(corridorState.base) ?? 0) > 0, '预告可获得最短地面路线长度');
  assert(base.place(corridorState, 401, 4, 12), '还有其他入口时允许封一处入口');
  assert(base.place(corridorState, 401, 5, 12), '还有最后入口时允许继续布防');
  // 玩家反馈"很难留一条路线出来，基本没法摆塔" → 封死最后通路不再拦截，只警告
  // （僵尸遇到阻碍会拆建筑、也会踩碎挡路棋子，见 NightSystem.crushItemTowardCore）
  const sealedCheck = base.canPlace(corridorState, 401, 6, 12);
  assert(sealedCheck.ok && !!sealedCheck.warn, '封死最后引流走廊允许摆放，但返回警告');
  assert(base.place(corridorState, 401, 6, 12), '封死最后通路也能真的放下建筑');
  assert((getShortestEntryPathLength(corridorState.base) ?? 0) === 0, '三处入口都封上后地面路线确实为 0');
}

// ============ 1.5 僵尸路线预览 ============
console.log('== 僵尸路线预览 ==');
{
  /** 沿箭头从某格一路走到核心（最多 40 步），返回是否到达 */
  const traceToCore = (preview: ReturnType<typeof computeRoutePreview>, from: { row: number; col: number }): boolean => {
    const arrows = new Map(preview.cells.map(c => [`${c.row},${c.col}`, c]));
    let cur = { row: from.row, col: from.col };
    for (let i = 0; i < 40; i++) {
      if (preview.core && cur.row === preview.core.row && cur.col === preview.core.col) return true;
      const cell = arrows.get(`${cur.row},${cur.col}`);
      if (!cell) return false;
      cur = { row: cur.row + cell.dr, col: cur.col + cell.dc };
    }
    return false;
  };

  const state = GameInitializer.initNewGame();
  const preview = computeRoutePreview(state);
  assert(preview.hasRoute && preview.spawnCells.length > 0, `新开局存在刷怪点与路线（${preview.spawnCells.length} 个刷怪点）`);
  assert(!!preview.core && preview.core.row === BASE_CENTER && preview.core.col === BASE_CENTER, '路线终点为核心格');
  assert(preview.spawnCells.every(p => !preview.cells.some(c => c.row === p.row && c.col === p.col && !c.spawn)),
    '刷怪点在路线上都带 spawn 标记');
  assert(preview.spawnCells.every(p => preview.cells.some(c => c.row === p.row && c.col === p.col)), '每个刷怪点都出现在路线里');
  assert(preview.cells.every(c => c.flow >= 1), '每个路线格至少被 1 条路线经过');
  assert(!preview.cells.some(c => c.row === preview.core!.row && c.col === preview.core!.col), '核心格不画箭头');
  assert(preview.spawnCells.every(p => traceToCore(preview, p)), '沿箭头可从每个刷怪点走到核心（方向聚合正确）');
  const maxFlow = Math.max(...preview.cells.map(c => c.flow));
  assert(maxFlow > preview.spawnCells.length * 0.5, `路线向内汇聚（最高经过 ${maxFlow} 条）`);

  // 新开局只从东边缺口进攻：刷怪点全在最右列
  assert(preview.spawnCells.every(p => p.col === state.base.cols - 1), '新开局刷怪点只在东侧缺口');

  // 摆放预览：把最繁忙的格设为将建建筑 → 若它是唯一走廊则全体断路（布防面板据此警示）
  const choke = preview.cells.find(c => c.flow === maxFlow)!;
  const blockedPreview = computeRoutePreview(state, { row: choke.row, col: choke.col });
  assert(blockedPreview.cells.every(c => !(c.row === choke.row && c.col === choke.col)), '假设占用后路线绕开该格');
  // 开局棋盘塞满棋子且走廊唯一：堵住汇聚格即断路（这正是需要提示玩家的危险操作）
  assert(!blockedPreview.hasRoute || blockedPreview.spawnCells.length > 0, '堵住汇聚格后要么绕路要么断路');

  // 多走廊场景（空棋盘）：堵掉主干格，三条路线都应改道且不断路
  {
    const emptyBoard = createInitialGameState();
    const openPreview = computeRoutePreview(emptyBoard);
    const openMax = Math.max(...openPreview.cells.map(c => c.flow));
    const trunk = openPreview.cells.find(c => c.flow === openMax)!;
    assert(!!trunk, '空棋盘存在主干路线格');
    const rerouted = computeRoutePreview(emptyBoard, { row: trunk.row, col: trunk.col });
    assert(rerouted.hasRoute, '堵掉主干格后仍有通路（僵尸改道）');
    assert(rerouted.cells.every(c => !(c.row === trunk.row && c.col === trunk.col)), '改道后不再经过被占格');
    const start = openPreview.spawnCells[0];
    const before = findPathToCore(emptyBoard.base, start);
    const after = findPathToCore(emptyBoard.base, start, { row: trunk.row, col: trunk.col });
    assert(!!before && !!after && JSON.stringify(before) !== JSON.stringify(after), '改道后具体路线确实发生变化');
  }

  // 通路封死：不再画箭头，改为标出「僵尸会在哪一格破门」（踩碎棋子 / 拆建筑）
  {
    const ringed = createInitialGameState();
    const core = ringed.base.buildings.find(b => b.cfgId === 1)!;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if ((dr === 0 && dc === 0) || Math.abs(dr) + Math.abs(dc) > 2) continue;
        const r = core.row + dr;
        const c = core.col + dc;
        if (r < 0 || r >= 13 || c < 0 || c >= 13) continue;
        setItem(ringed.grid, r, c, createItemFromConfig(10001));
      }
    }
    const sealedPreview = computeRoutePreview(ringed);
    assert(!sealedPreview.hasRoute, '核心被棋子围死时预览标记为无通路');
    assert(sealedPreview.cells.length > 0 && sealedPreview.cells.every(c => !!c.breach), '无通路时只画破门点');
    assert(sealedPreview.cells.every(c => !c.spawn), '破门点不是刷怪点');
    assert(sealedPreview.cells.some(c => c.breach === 'item' || c.breach === 'building'),
      `破门点标注挡路的是棋子还是建筑（${sealedPreview.cells.map(c => c.breach).join('/')}）`);
  }

  // 棋子同样挡路：在通路上放一个棋子，路线应绕开该格
  const itemState = GameInitializer.initNewGame();
  const midCandidates = preview.cells.filter(c => !preview.spawnCells.some(p => p.row === c.row && p.col === c.col));
  const mid = midCandidates[0];
  setItem(itemState.grid, mid.row, mid.col, createItemFromConfig(10001));
  const itemPreview = computeRoutePreview(itemState);
  assert(itemPreview.cells.every(c => !(c.row === mid.row && c.col === mid.col)), '通路上放棋子后路线绕开该格');
}

// ============ 1. 初始化 ============
console.log('== 初始化 ==');
{
  const { task } = makeSystems();
  const state = GameInitializer.initNewGame(task);
  assert(state.grid.rowNum === 13 && state.grid.colNum === 13, '物品层 13×13（与基地对齐）');

  let total = 0, carton = 0, spider = 0, normal = 0;
  for (const row of state.grid.cells) {
    for (const cell of row) {
      if (!cell.item) continue;
      total++;
      if (cell.item.st === ItemStatus.Carton) carton++;
      else if (cell.item.st === ItemStatus.Spider) spider++;
      else normal++;
    }
  }
  assert(total === 41, `初始 41 个物品（实际 ${total}）`);
  assert(carton === 32 && spider === 6 && normal === 3, `封印分布 32纸箱/6蜘蛛网/3正常（实际 ${carton}/${spider}/${normal}）`);
  // 物品与建筑一样挡寻路：初始布局必须保留边缘到核心的走廊（核心行/列两条车道不摆初始物品）
  assert(hasKillCorridor(state.base, undefined, (r, c) => !!getItem(state.grid, r, c)), '初始物品布局保留引流走廊');
  // 箭塔蓝图发射器（开局即可产出箭塔蓝图，首夜防守不断层）
  const bpPos = findCell(state, 70001);
  assert(!!bpPos, '初始摆放箭塔蓝图发射器');
  // 蛛网内容全部来自工具箱链（螺丝刀链 10012~10015 / 手套链 10026~10028），点发射器可产出同款解锁
  const TOOL_CHAIN = [10012, 10013, 10014, 10015, 10026, 10027, 10028];
  let websAllTools = true;
  for (const row of state.grid.cells) {
    for (const cell of row) {
      if (cell.item?.st === ItemStatus.Spider && !TOOL_CHAIN.includes(cell.item.id)) websAllTools = false;
    }
  }
  assert(websAllTools, '蛛网内容全部来自工具箱链');
  assert(state.resources.coin === 0 && state.resources.diamond === 100 && state.resources.power === 100, '初始资源 basicGold/basicGem/energyMax');
  // 新开局不再散放工具箱把手：棋盘上唯一的 10001 封在纸箱里；核心前两次点击指定产出 10001
  const handles = state.grid.cells.flat().filter(c => c.item?.id === 10001);
  assert(handles.length === 1 && handles[0].item?.st === ItemStatus.Carton, '棋盘仅余一个纸箱封印的工具箱把手');
  // 核心不再是棋盘道具：开局棋盘上没有 60026~60031，基地核心建筑接管发射器职责
  assert(!findCell(state, 60026), '开局棋盘不再摆放核心基座道具');
  {
    const { core, spawn } = makeSystems();
    const coreBuilding = core.ensure(state)!;
    assert(!!coreBuilding && coreBuilding.cfgId === 1 && coreBuilding.level === 1, '基地核心建筑存在且 1 级');
    assert(coreBuilding.times === 6, `核心 1 级库存 6（实际 ${coreBuilding.times}）`);
    const r1 = core.clickSpawn(state);
    const r2 = core.clickSpawn(state);
    assert(r1.success && r1.productId === 10001, '核心第 1 次点击产出工具箱把手');
    assert(r2.success && r2.productId === 10001, '核心第 2 次点击产出工具箱把手');
    const r3 = core.clickSpawn(state);
    assert(r3.success && r3.productId !== undefined, '第三次点击走随机产出池');
    // 产出落点在可承载格（核心格/建筑/地形都不能落），且产物已写入棋盘
    assert(!!r1.newPos && getItem(state.grid, r1.newPos.row, r1.newPos.col)?.id === r1.productId, '核心产出落在可承载格');
    void spawn;
  }
  // 引导第一阶段指向核心（源码断言）
  const handGuideSrc = require('fs').readFileSync('src/phaser/ui/HandGuide.ts', 'utf8');
  assert(handGuideSrc.includes('guide.coreSpawn') && handGuideSrc.includes('corePoint'), '新手引导第一阶段指向基地核心');
  // 第一阶段只能由核心发射推进：setHandIndex(6) 只允许出现在核心产出回调里，合成不能跳步
  assert(handGuideSrc.split('setHandIndex(6)').length - 1 === 1, '引导第一阶段不被合成跳步（一直提示点核心）');
  assert(state.tasks.length === 5 && state.tasks[0].hand === 1 && state.tasks[0].propArr[0].id === 10028, '开局 5 个并发任务，首个为新手任务 prop=10028');

  // 背包初始被纸箱包住（prop_new status=2），无 roomArr
  const bagPos = findCell(state, 401);
  const bagItem = bagPos ? getItem(state.grid, bagPos.row, bagPos.col) : null;
  assert(bagItem?.id === 401 && bagItem.st === ItemStatus.Carton && !bagItem.roomArr, '背包初始被纸箱封印');

  // 在背包十字邻格合成 → 十字破纸箱 → 背包特判直接变正常并初始化免费格
  const bagSide = { row: bagPos!.row, col: bagPos!.col + 1 };
  const bagSideSrc = { row: bagPos!.row + 1, col: bagPos!.col + 1 };
  setItem(state.grid, bagSide.row, bagSide.col, createItemFromConfig(10001));
  setItem(state.grid, bagSideSrc.row, bagSideSrc.col, createItemFromConfig(10001));
  const { merge } = makeSystems();
  merge.moveOrMerge(state, bagSideSrc, bagSide);
  const bagAfter = getItem(state.grid, bagPos!.row, bagPos!.col);
  assert(bagAfter?.id === 401 && !bagAfter.st && bagAfter.roomArr?.length === 6, '破纸箱后背包解封且 6 个免费格');
}

// ============ 2. 合成 ============
console.log('== 合成 ==');
{
  assert(getMergeChainSpawner(50016) === 50005, '任务合成链可找到首级材料对应发射器');
  // 遗失物链首 30049 由储物柜链自动产出（fair），核心发射器 atom 虽也挂了 30049 但只作兜底
  assert(getMergeChainSpawner(30054) === 30013, '遗失物链来源为双层储物柜而非核心基座');
  const { merge } = makeSystems();
  const state = createInitialGameState();
  setItem(state.grid, 0, 0, createItemFromConfig(10001));
  setItem(state.grid, 0, 1, createItemFromConfig(10001));
  setItem(state.grid, 0, 2, createItemFromConfig(10002, ItemStatus.Carton)); // 十字邻居纸箱

  const result = merge.moveOrMerge(state, { row: 0, col: 0 }, { row: 0, col: 1 });
  assert(result.success && result.kind === 'merge', '同 id 合成成功');
  assert(getItem(state.grid, 0, 1)?.id === 10002, '合成产物为 blessId=10002');
  assert(getItem(state.grid, 0, 0) === null, '源格清空');
  assert(getItem(state.grid, 0, 2)?.st === ItemStatus.Spider, '十字纸箱破开变蜘蛛网');

  // 封印（3D 里长得像瓦砾堆）不是地形：不能花钱清，只能靠相邻合成打开
  {
    const sealState = GameInitializer.initNewGame();
    const sealPos = findCell(sealState, 10011) ?? findCell(sealState, 10002);
    // 取任意一个纸箱封印格
    let cartonPos: { row: number; col: number } | null = null;
    for (let r = 0; r < sealState.grid.rowNum && !cartonPos; r++) {
      for (let c = 0; c < sealState.grid.colNum && !cartonPos; c++) {
        if (sealState.grid.cells[r][c].item?.st === ItemStatus.Carton) cartonPos = { row: r, col: c };
      }
    }
    assert(!!cartonPos, '新开局存在纸箱封印格');
    const baseSys2 = new BaseSystem(new EconomySystem());
    sealState.resources.coin = 10000;
    const coinBefore = sealState.resources.coin;
    assert(terrainAt(sealState.base, cartonPos!.row, cartonPos!.col) === null, '封印格不是地形（不占 terrain）');
    assert(!baseSys2.clearTerrain(sealState, cartonPos!.row, cartonPos!.col), '封印格不能花钱清理');
    assert(sealState.resources.coin === coinBefore, '清理失败不扣金币');
    assert(!!sealPos, '初始棋盘仍有实体封印物品（非地形）');
  }

  // 满级不可合成 → 交换
  setItem(state.grid, 2, 0, createItemFromConfig(10011));
  setItem(state.grid, 2, 1, createItemFromConfig(10011));
  const r2 = merge.moveOrMerge(state, { row: 2, col: 0 }, { row: 2, col: 1 });
  assert(r2.kind !== 'merge', 'blessId=0 满级不合成');

  // MAX 角标判定：不可再合成的都该显示 MAX
  assert(isMaxBadgeItem(1001) && isMaxBadgeItem(1002), '金币/能量宝箱（不可合成孤品）显示 MAX');
  assert(isMaxBadgeItem(20025), '合成链尾（能量碗）显示 MAX');
  assert(!isMaxBadgeItem(10001), '链中间级不显示 MAX');
  assert(!isMaxBadgeItem(70001), '蓝图发射器不显示 MAX');
  assert(isMaxBadgeItem(10011) && isMaxBadgeItem(20010) && isMaxBadgeItem(1004), '满级发射器/链尾（维修工作台/双开门冰箱/大号手提包）显示 MAX');

  // 不同 id → 交换
  setItem(state.grid, 3, 0, createItemFromConfig(10001));
  setItem(state.grid, 3, 1, createItemFromConfig(20001));
  const r3 = merge.moveOrMerge(state, { row: 3, col: 0 }, { row: 3, col: 1 });
  assert(r3.kind === 'swap' && getItem(state.grid, 3, 0)?.id === 20001 && getItem(state.grid, 3, 1)?.id === 10001, '不同 id 交换');

  // 目标是纸箱 → 弹回
  setItem(state.grid, 4, 0, createItemFromConfig(10001));
  setItem(state.grid, 4, 1, createItemFromConfig(10002, ItemStatus.Carton));
  const r4 = merge.moveOrMerge(state, { row: 4, col: 0 }, { row: 4, col: 1 });
  assert(r4.kind === 'bounce' && getItem(state.grid, 4, 0)?.id === 10001, '纸箱目标弹回');

  // 目标是蜘蛛网但同 id → 可以合成（合成后解封）
  setItem(state.grid, 5, 0, createItemFromConfig(10001));
  setItem(state.grid, 5, 1, createItemFromConfig(10001, ItemStatus.Spider));
  const r5 = merge.moveOrMerge(state, { row: 5, col: 0 }, { row: 5, col: 1 });
  assert(r5.kind === 'merge' && getItem(state.grid, 5, 1)?.id === 10002 && !getItem(state.grid, 5, 1)?.st, '正常物品与蜘蛛网物品合成可解封');

  // 目标是蜘蛛网但不同 id → 弹回（不能交换）
  setItem(state.grid, 3, 0, createItemFromConfig(10002));
  setItem(state.grid, 3, 1, createItemFromConfig(10001, ItemStatus.Spider));
  const r6 = merge.moveOrMerge(state, { row: 3, col: 0 }, { row: 3, col: 1 });
  assert(r6.kind === 'bounce', '蜘蛛网目标不同 id 弹回');

  // 源是蜘蛛网、目标同 id 正常 → 也能合成（双向解封）
  setItem(state.grid, 1, 0, createItemFromConfig(10001, ItemStatus.Spider));
  setItem(state.grid, 1, 1, createItemFromConfig(10001));
  const r7 = merge.moveOrMerge(state, { row: 1, col: 0 }, { row: 1, col: 1 });
  assert(r7.kind === 'merge' && getItem(state.grid, 1, 1)?.id === 10002 && !getItem(state.grid, 1, 1)?.st, '蜘蛛网源拖向正常目标也能合成解封');

  // 源是蜘蛛网、目标空 → 弹回（蜘蛛网不能移动）
  setItem(state.grid, 2, 0, createItemFromConfig(10001, ItemStatus.Spider));
  setItem(state.grid, 2, 1, null);
  const r8 = merge.moveOrMerge(state, { row: 2, col: 0 }, { row: 2, col: 1 });
  assert(r8.kind === 'bounce', '蜘蛛网不能移入空位');

  // 两个蜘蛛网不能互相合成
  setItem(state.grid, 2, 2, createItemFromConfig(10001, ItemStatus.Spider));
  setItem(state.grid, 2, 3, createItemFromConfig(10001, ItemStatus.Spider));
  const r9 = merge.moveOrMerge(state, { row: 2, col: 2 }, { row: 2, col: 3 });
  assert(r9.kind === 'bounce' && getItem(state.grid, 2, 2)?.id === 10001 && getItem(state.grid, 2, 3)?.id === 10001, '两个蜘蛛网不能合成');
}

// ============ 3. 发射器 ============
console.log('== 发射器 ==');
{
  const { spawn, merge } = makeSystems();
  const state = createInitialGameState();
  // 1001 金币宝箱：anc=1 times=10 wsb=1 noPower=1 atom 权重
  setItem(state.grid, 4, 3, createItemFromConfig(1001));
  const before = state.resources.power;

  const r1 = spawn.clickSpawn(state, { row: 4, col: 3 });
  assert(r1.success && r1.newPos !== undefined, '点击产出成功');
  assert(state.resources.power === before, 'noPower 不耗体力');
  const spawner = getItem(state.grid, 4, 3);
  assert(spawner?.times === 9, `次数 10→9（实际 ${spawner?.times}）`);

  // 箭塔蓝图发射器：按成功产出的碎片数销毁；碎片合成后累计数不丢失。
  // 摘掉基地核心（1 级 5% 光环会把碎片升一级），保证本用例产物确定
  const blueprintState = GameInitializer.initNewGame();
  blueprintState.base.buildings = blueprintState.base.buildings.filter(b => b.cfgId !== 1);
  const bpEmitter = findCell(blueprintState, 70001)!;
  const first = spawn.clickSpawn(blueprintState, bpEmitter);
  const second = spawn.clickSpawn(blueprintState, bpEmitter);
  assert(first.success && second.success && !!first.newPos && !!second.newPos, '箭塔图纸前两次产出成功');
  merge.moveOrMerge(blueprintState, second.newPos!, first.newPos!);
  const tracked = getItem(blueprintState.grid, bpEmitter.row, bpEmitter.col) as (IItemData & { spawnedCount?: number }) | null;
  assert(tracked?.spawnedCount === 2, '合成碎片后仍累计箭塔图纸产出数');
  for (let i = 0; i < 5; i++) spawn.clickSpawn(blueprintState, bpEmitter);
  assert(getItem(blueprintState.grid, bpEmitter.row, bpEmitter.col)?.id === 70001, '累计 7 张图纸时发射器不销毁');
  const eighth = spawn.clickSpawn(blueprintState, bpEmitter);
  assert(eighth.success && eighth.productId === 70101 && !getItem(blueprintState.grid, bpEmitter.row, bpEmitter.col), '第 8 张图纸落盘后才销毁发射器');

  // 点干 10 次 → wsb 消失
  for (let i = 0; i < 9; i++) spawn.clickSpawn(state, { row: 4, col: 3 });
  assert(getItem(state.grid, 4, 3) === null, 'wsb 耗尽消失');

  // 耗体力的发射器：20063 电视宣传 anc=1 times=1 milo=240 noPower=0
  setItem(state.grid, 5, 3, createItemFromConfig(20063));
  const powerBefore = state.resources.power;
  const r2 = spawn.clickSpawn(state, { row: 5, col: 3 });
  assert(r2.success && state.resources.power === powerBefore - 1, '普通发射器耗 1 体力');
  const sp2 = getItem(state.grid, 5, 3);
  assert(sp2 !== null && (sp2.cdSum ?? 0) > 0, '耗尽进 cd（cdSum>0）');
  const r3 = spawn.clickSpawn(state, { row: 5, col: 3 });
  assert(!r3.success, 'cd 中不可点击');

  // cd 到期恢复 times
  if (sp2) {
    sp2.cd = Date.now() - 1;
    spawn.update(state, 0);
    const sp3 = getItem(state.grid, 5, 3);
    assert(sp3?.times === 1 && !sp3.cd, 'cd 到期恢复 times');
  }

  // 体力不足
  state.resources.power = 0;
  const sp4 = getItem(state.grid, 5, 3);
  if (sp4) sp4.times = 1;
  const r4 = spawn.clickSpawn(state, { row: 5, col: 3 });
  assert(!r4.success, '体力不足不可点击');

  // 棋盘满时不能使用发射器
  const fullState = createInitialGameState();
  for (let r = 0; r < fullState.grid.rowNum; r++) {
    for (let c = 0; c < fullState.grid.colNum; c++) {
      setItem(fullState.grid, r, c, createItemFromConfig(10001));
    }
  }
  setItem(fullState.grid, 4, 3, createItemFromConfig(1001));
  const r5 = spawn.clickSpawn(fullState, { row: 4, col: 3 });
  assert(!r5.success && getItem(fullState.grid, 4, 3)?.id === 1001, '棋盘满时不能使用发射器');

  // 开局发射器从 1 级起步：10001 anc=1 times=15，atom 单条目 → 产 10012 螺丝刀。
  // 但核心光环（Lv1 = 5%）有小概率把它升一级，所以断言要放行"10012 或其合成下一级"
  const st1 = createInitialGameState();
  setItem(st1.grid, 0, 0, createItemFromConfig(10001));
  const r6 = spawn.clickSpawn(st1, { row: 0, col: 0 });
  assert(r6.success && r6.newPos !== undefined, '1 级工具箱（10001）是发射器');
  const prod1 = getItem(st1.grid, r6.newPos!.row, r6.newPos!.col)?.id;
  assert(prod1 === 10012 || prod1 === getMergeNextId(10012),
    `1 级工具箱只产 10012 螺丝刀（核心光环升级算通过，实际 ${prod1}）`);

  // 两个 10001 合成 10002，仍是发射器（升级解锁更多产物种类）
  const { merge: merge2 } = makeSystems();
  const st2 = createInitialGameState();
  setItem(st2.grid, 0, 0, createItemFromConfig(10001));
  setItem(st2.grid, 0, 1, createItemFromConfig(10001));
  const mm = merge2.moveOrMerge(st2, { row: 0, col: 0 }, { row: 0, col: 1 });
  assert(mm.kind === 'merge' && getItem(st2.grid, 0, 1)?.id === 10002, '两个 1 级工具箱合成 2 级');
  const r7 = spawn.clickSpawn(st2, { row: 0, col: 1 });
  assert(r7.success, '2 级工具箱（10002）仍是发射器');

  // 新手第一天：工具箱链不扣次数、不累积 cd；第 2 天起恢复正常
  {
    const st3 = createInitialGameState(); // day=1
    setItem(st3.grid, 2, 2, createItemFromConfig(10005)); // 实用工具箱 times=50 milo=7
    const timesBefore = getItem(st3.grid, 2, 2)!.times ?? 0;
    for (let i = 0; i < 3; i++) spawn.clickSpawn(st3, { row: 2, col: 2 });
    const tb1 = getItem(st3.grid, 2, 2)!;
    assert(tb1.times === timesBefore && !tb1.cd, '第一天工具箱点击不扣次数、不进 CD');
    st3.day = 2;
    spawn.clickSpawn(st3, { row: 2, col: 2 });
    const tb2 = getItem(st3.grid, 2, 2)!;
    assert(tb2.times === timesBefore - 1 && (tb2.cd ?? 0) > 0, '第 2 天起工具箱正常扣次数、累计 CD');
  }

  // 发射器产出一览（全链产物 + 解锁状态）
  const view1 = getSpawnerProductView(10001);
  assert(view1.length > 1, '产出一览包含全链产物（含未解锁）');
  assert(view1.filter(v => v.unlocked).length === 1 && view1[0]?.id === 10012, '1 级工具箱仅 10012 已解锁');
  assert(view1.filter(v => !v.unlocked).every(v => v.unlockLevel > 1), '未解锁产物标出更高解锁等级');
  const view7 = getSpawnerProductView(10007);
  assert(view7.length > 0 && view7.every(v => v.unlocked), '7 级工具箱全部产物已解锁');
}

// ============ 4. 自动生成器 ============
console.log('== 自动生成器 ==');
{
  const { spawn } = makeSystems();
  const state = createInitialGameState();
  // 20063: fair=20059 kishu=2 faircd=43200
  setItem(state.grid, 4, 3, createItemFromConfig(20063));
  const gen = getItem(state.grid, 4, 3);
  assert(gen?.timesAuto === 1, '首次 timesAuto=1');

  spawn.update(state, 0);
  assert(getItem(state.grid, 3, 2)?.id === 20059 || getItem(state.grid, 3, 3)?.id === 20059 || getItem(state.grid, 3, 4)?.id === 20059, '九宫格自动产出 20059');
  assert(gen?.timesAuto === 0 && (gen?.cdAuto ?? 0) > 0, '耗尽进 cdAuto');

  // cdAuto 到期恢复 kishu=2
  if (gen) gen.cdAuto = Date.now() - 1;
  spawn.update(state, 0);
  assert(gen?.timesAuto !== undefined && gen.timesAuto >= 0, 'cdAuto 恢复');
}

// ============ 5. 气泡 ============
console.log('== 气泡 ==');
{
  const { spawn, special } = makeSystems();
  const state = createInitialGameState();
  const bubbleItem = createItemFromConfig(10002);
  bubbleItem.cdBubble = Date.now() + 60000;
  setItem(state.grid, 2, 2, bubbleItem);

  // 气泡物品会被交换到 (2,1)（与源项目一致：气泡可交换但不可合成）
  const { merge } = makeSystems();
  setItem(state.grid, 2, 1, createItemFromConfig(10002));
  const r = merge.moveOrMerge(state, { row: 2, col: 1 }, { row: 2, col: 2 });
  assert(r.kind !== 'merge' && !!getItem(state.grid, 2, 1)?.cdBubble, '气泡目标不合成（被交换走）');

  // 钻石戳破（10002 戳泡价 45 钻）
  state.resources.diamond = 100;
  const ok = special.popBubble(state, { row: 2, col: 1 });
  assert(ok && !getItem(state.grid, 2, 1)?.cdBubble && state.resources.diamond === 100 - 45, '戳破气泡扣钻');

  // 气泡到期爆成 203
  const b2 = createItemFromConfig(10003);
  b2.cdBubble = Date.now() - 1;
  setItem(state.grid, 5, 5, b2);
  spawn.update(state, 0);
  assert(getItem(state.grid, 5, 5)?.id === 203, '气泡到期爆成 203');
}

// ============ 6. 背包 ============
console.log('== 背包 ==');
{
  const { bag, economy } = makeSystems();
  const state = createInitialGameState();
  setItem(state.grid, 0, 0, createItemFromConfig(401)); // 背包
  setItem(state.grid, 1, 1, createItemFromConfig(10002));

  const ok = bag.putInBag(state, { row: 1, col: 1 });
  assert(ok && getItem(state.grid, 1, 1) === null, '入包成功');
  const bagItem = getItem(state.grid, 0, 0);
  assert(bagItem?.roomArr?.[0]?.id === 10002, '包内有物品');
  assert((bagItem?.roomArr?.[0]?.putTime ?? 0) > 0, '入包记 putTime');

  const outPos = bag.takeOut(state, 0);
  assert(outPos !== null && getItem(state.grid, outPos.row, outPos.col)?.id === 10002, '取出到首个空格');

  // 扩容
  state.resources.coin = 500;
  const coinBefore = state.resources.coin;
  const added = bag.addSlot(state, (n) => economy.subResource(state, 'coin', n));
  assert(added && getItem(state.grid, 0, 0)?.roomArr?.length === 7 && state.resources.coin === coinBefore - 200, '扩容 7 格扣 200 金币');
}

// ============ 7. 特殊道具 ============
console.log('== 特殊道具 ==');
{
  const { special, merge, economy } = makeSystems();
  const state = createInitialGameState();

  // mdt=2 无限能量
  setItem(state.grid, 0, 0, createItemFromConfig(60001));
  special.clickSpecial(state, { row: 0, col: 0 });
  assert(state.powerFreeUntil > Date.now() && getItem(state.grid, 0, 0) === null, '无限能量生效');

  // mdt=1 解锁型
  setItem(state.grid, 1, 0, createItemFromConfig(1003));
  const lockedBag = getItem(state.grid, 1, 0);
  assert(lockedBag !== null && (lockedBag.times ?? 0) === 0, '解锁型发射器初始无点击次数（待解锁）');
  special.clickSpecial(state, { row: 1, col: 0 });
  const unlockItem = getItem(state.grid, 1, 0);
  assert(unlockItem?.unlock === 1 && (unlockItem.cd ?? 0) > Date.now(), '解锁倒计时开始');

  // 解锁到期 → 恢复次数变发射器，不再重复解锁
  const { spawn: spawnSys } = makeSystems();
  unlockItem!.cd = Date.now() - 1;
  spawnSys.update(state, 0);
  const unlockedBag = getItem(state.grid, 1, 0);
  assert(unlockedBag !== null && !unlockedBag.unlock && !unlockedBag.cdSum && unlockedBag.times === 12, '解锁到期恢复 12 次点击');
  assert(special.clickSpecial(state, { row: 1, col: 0 }) === false, '已解锁手提包不再走解锁流程');
  state.resources.power = 100;
  const spawnRet = spawnSys.clickSpawn(state, { row: 1, col: 0 });
  assert(spawnRet.success && unlockedBag.times === 11, '已解锁手提包点击正常产出');

  // mdt=3 充能器拖到发射器（20063 chongneng? 用配表判定，找一个可充能的）
  // 直接构造：60005 小型充能器 p1=5；目标 1003（chongneng 由配表决定）
  // 用配表里 chongneng=1 且 anc=1 的物品
  const { getAllProps } = require('../src/core/config/PropConfig');
  const chargeTarget = getAllProps().find((p: any) => p.chongneng && p.anc);
  if (chargeTarget) {
    setItem(state.grid, 2, 0, createItemFromConfig(60005));
    setItem(state.grid, 2, 1, createItemFromConfig(chargeTarget.id));
    const before = getItem(state.grid, 2, 1)?.times ?? 0;
    const r = merge.moveOrMerge(state, { row: 2, col: 0 }, { row: 2, col: 1 });
    assert(r.kind === 'charger' && (getItem(state.grid, 2, 1)?.times ?? 0) === before + 5, '充能器 +5 次');
  }

  // mdt=4 拆分器：60008 p1=4，目标需 jiandao=1 且 1<luna<=4
  const splitTarget = getAllProps().find((p: any) => p.jiandao && p.luna === 2);
  if (splitTarget) {
    setItem(state.grid, 3, 0, createItemFromConfig(60008));
    setItem(state.grid, 3, 1, createItemFromConfig(splitTarget.id));
    const r = merge.moveOrMerge(state, { row: 3, col: 0 }, { row: 3, col: 1 });
    assert(r.kind === 'split' && getItem(state.grid, 3, 1)?.id === splitTarget.id - 1, '拆分器目标降一级');
  }

  // 链式特殊道具自身 A+A 合成：同 id 可合成优先于特殊拖拽
  // （60008~60015 属科技档，核心升到 4 级解锁科技档合成权限）
  setCoreLevel(state, 4);
  setItem(state.grid, 5, 0, createItemFromConfig(60008));
  setItem(state.grid, 5, 1, createItemFromConfig(60008));
  const rSplitMerge = merge.moveOrMerge(state, { row: 5, col: 0 }, { row: 5, col: 1 });
  assert(rSplitMerge.kind === 'merge' && rSplitMerge.newItem?.id === 60009, '两个小型拆分器合成中型拆分器（不被特殊拖拽拦截）');

  setItem(state.grid, 5, 2, createItemFromConfig(60005));
  setItem(state.grid, 5, 3, createItemFromConfig(60005));
  const rChargerMerge = merge.moveOrMerge(state, { row: 5, col: 2 }, { row: 5, col: 3 });
  assert(rChargerMerge.kind === 'merge' && rChargerMerge.newItem?.id === 60006, '两个小型充能器合成中型充能器');

  // 中型拆分器互拖也走合成而不是误触发拆分
  setItem(state.grid, 5, 4, createItemFromConfig(60009));
  setItem(state.grid, 5, 5, createItemFromConfig(60009));
  const rMidMerge = merge.moveOrMerge(state, { row: 5, col: 4 }, { row: 5, col: 5 });
  assert(rMidMerge.kind === 'merge' && rMidMerge.newItem?.id === 60010, '两个中型拆分器合成大型拆分器（不误触发拆分）');

  // mdt=9 超级升级卡：60019，目标 !nochaoji 且非满级
  const lvTarget = getAllProps().find((p: any) => !p.nochaoji && p.blessId > 0 && p.luna === 1 && p.type < 100);
  if (lvTarget) {
    setItem(state.grid, 4, 0, createItemFromConfig(60019));
    setItem(state.grid, 4, 1, createItemFromConfig(lvTarget.id));
    const r = merge.moveOrMerge(state, { row: 4, col: 0 }, { row: 4, col: 1 });
    assert(r.kind === 'lvup' && getItem(state.grid, 4, 1)?.id === lvTarget.id + 1, '升级卡目标升一级');
  }

  // clickAward：找一个 clickAwardId>0 的
  const awardItem = getAllProps().find((p: any) => p.clickAwardId > 0);
  if (awardItem) {
    setItem(state.grid, 5, 0, createItemFromConfig(awardItem.id));
    const coinBefore = economy.getPropNum(state, awardItem.clickAwardId);
    special.clickSpecial(state, { row: 5, col: 0 });
    assert(getItem(state.grid, 5, 0) === null && economy.getPropNum(state, awardItem.clickAwardId) > coinBefore, '点击领奖');
  }
}

// ============ 8. 出售 ============
console.log('== 出售 ==');
{
  const { economy } = makeSystems();
  const state = createInitialGameState();
  // 10004 levelGold=6 she=1（10001~10003 开局发射器已改 she=0 防误卖）
  setItem(state.grid, 0, 0, createItemFromConfig(10004));
  const coinBefore = state.resources.coin;
  const sellData = economy.sellItem(state, { row: 0, col: 0 });
  assert(sellData !== null && state.resources.coin === coinBefore + 6 && getItem(state.grid, 0, 0) === null, '出售得金币');

  // 撤销
  const back = economy.sellBack(state, sellData!);
  assert(back !== null && getItem(state.grid, 0, 0)?.id === 10004 && state.resources.coin === coinBefore, '撤销出售');

  // 开局发射器不可出售
  setItem(state.grid, 0, 1, createItemFromConfig(10001));
  assert(economy.sellItem(state, { row: 0, col: 1 }) === null && getItem(state.grid, 0, 1)?.id === 10001, '1 级工具箱不可出售');
  const sellTestState = createInitialGameState();
  setItem(sellTestState.grid, 0, 2, createItemFromConfig(10028));
  const taskOnlySell = economy.sellItem(sellTestState, { row: 0, col: 2 });
  assert(taskOnlySell !== null && taskOnlySell.coin === 4 && getItem(sellTestState.grid, 0, 2) === null, '满级任务道具可出售');
}

// ============ 9. 卡片 ============
console.log('== 卡片 ==');
{
  const { economy } = makeSystems();
  const state = createInitialGameState();
  economy.addPropNum(state, 10001, 2); // 非货币 → 卡片
  assert(state.cardArr.length === 2, '道具进卡片列表');
  economy.addPropNum(state, 101, 50); // 货币 → 资源
  assert(state.resources.coin === 50 && state.cardArr.length === 2, '货币直接入账');

  const pos = economy.useCard(state);
  assert(pos !== null && getItem(state.grid, pos.row, pos.col)?.id === 10001 && state.cardArr.length === 1, '取卡到棋盘');
}

// ============ 10. 任务 ============
console.log('== 任务 ==');
{
  const { task, economy } = makeSystems();
  const state = createInitialGameState();

  // 新手任务
  const hand = task.createHandTask(1);
  assert(hand !== null && hand.propArr[0].id === 10028, '新手任务创建');

  // 随机任务生成
  state.roleLv = 10;
  setItem(state.grid, 0, 0, createItemFromConfig(10001));
  setItem(state.grid, 0, 1, createItemFromConfig(10002));
  const randomTasks = task.createRandomTasks(3, state);
  assert(randomTasks.length >= 1, `随机任务生成（${randomTasks.length} 个）`);

  // 工具系列单独成单：含工具箱产出（螺丝刀/手套等）的任务不得混入其他发射器的产出，反之亦然
  const mixState = createInitialGameState();
  mixState.roleLv = 20;
  setItem(mixState.grid, 0, 0, createItemFromConfig(10006)); // 拾荒工具箱
  setItem(mixState.grid, 0, 1, createItemFromConfig(30008)); // 储物篮
  setItem(mixState.grid, 1, 0, createItemFromConfig(10012)); // 螺丝刀（工具系列）
  setItem(mixState.grid, 1, 1, createItemFromConfig(10026)); // 单只手套（工具系列）
  setItem(mixState.grid, 1, 2, createItemFromConfig(30019)); // 钥匙（非工具系列）
  let mixChecked = 0;
  for (let round = 0; round < 40; round++) {
    mixState.tasks = [];
    for (const gen of task.createRandomTasks(2, mixState)) {
      mixChecked++;
      const toolFlags = gen.propArr.map(p => isToolSeriesItem(p.id));
      assert(toolFlags.every(f => f === toolFlags[0]), `任务不混工具系列与其他发射器产出（${gen.propArr.map(p => p.id).join(',')}）`);
      assert(toolFlags[0] ? gen.starNum === 0 : gen.starNum > 0, `工具链任务不给星星，其他任务照常（${gen.propArr.map(p => p.id).join(',')} → ${gen.starNum} 星）`);
      assert(gen.goldNum !== undefined && gen.goldNum > 0, '任务必有金币奖励');
    }
  }
  assert(mixChecked > 0, '混合候选下成功生成任务');

  const spawnerTargetState = createInitialGameState();
  setItem(spawnerTargetState.grid, 0, 0, createItemFromConfig(50022)); // 猫窝：可点击发射器
  setItem(spawnerTargetState.grid, 0, 1, createItemFromConfig(10012)); // 螺丝刀（工具链）
  setItem(spawnerTargetState.grid, 0, 2, createItemFromConfig(10006)); // 拾荒工具箱（工具链发射器）
  const taskCandidates = (task as unknown as { collectCandidateIds(res1: number, quality: number, state: typeof spawnerTargetState): number[] })
    .collectCandidateIds(2, Number.MAX_SAFE_INTEGER, spawnerTargetState);
  assert(!taskCandidates.includes(50022) && taskCandidates.includes(10012), '任务候选排除发射器，保留普通材料');
  // 夜战掉落的食物/水（链上无发射器在棋盘）不进订单候选：保温箱 4 级才产出，Lv.2 还不能产水
  const dropOnlyState = createInitialGameState();
  setItem(dropOnlyState.grid, 0, 0, createItemFromConfig(20002)); // 手提保温箱 Lv.2（尚不能产出）
  setItem(dropOnlyState.grid, 0, 1, createItemFromConfig(20021)); // 夜战掉落的食物
  setItem(dropOnlyState.grid, 0, 2, createItemFromConfig(20011)); // 夜战掉落的水
  const dropOnlyCandidates = (task as unknown as { collectCandidateIds(res1: number, quality: number, state: typeof dropOnlyState): number[] })
    .collectCandidateIds(2, Number.MAX_SAFE_INTEGER, dropOnlyState);
  assert(!dropOnlyCandidates.includes(20021) && !dropOnlyCandidates.includes(20011), '无发射器链的掉落物品不进订单候选');
  setItem(dropOnlyState.grid, 1, 0, createItemFromConfig(20004)); // 翻修冷藏箱 Lv.4 开始产出水/食物
  const withSpawnerCandidates = (task as unknown as { collectCandidateIds(res1: number, quality: number, state: typeof dropOnlyState): number[] })
    .collectCandidateIds(2, Number.MAX_SAFE_INTEGER, dropOnlyState);
  assert(withSpawnerCandidates.includes(20011) && withSpawnerCandidates.includes(20021), '冷藏箱可产出后食物/水链进订单候选');

  // 任务按棋盘发射器链分流：有空闲链时优先使用，只有一条链时允许复用。
  const routeState = createInitialGameState();
  setItem(routeState.grid, 0, 0, createItemFromConfig(10001));
  setItem(routeState.grid, 0, 1, createItemFromConfig(30008));
  const routeTask = task as unknown as { preferUnusedSpawnerCandidates(ids: number[], state: typeof routeState, used: Set<number>): number[]; getTaskSpawnerKeys(state: typeof routeState, ids: number[]): Set<number> };
  const toolSpawnerKeys = routeTask.getTaskSpawnerKeys(routeState, [10012]);
  const routed = routeTask.preferUnusedSpawnerCandidates([10012, 30019], routeState, toolSpawnerKeys);
  assert(routed.length === 1 && routed[0] === 30019, '空闲发射器链优先承接新任务');
  const singleSpawner = createInitialGameState();
  setItem(singleSpawner.grid, 0, 0, createItemFromConfig(10001));
  assert(routeTask.preferUnusedSpawnerCandidates([10012], singleSpawner, routeTask.getTaskSpawnerKeys(singleSpawner, [10012]))[0] === 10012, '仅一条发射器链时允许任务复用');

  // 完成任务（最多 3 并发，完成 1 个补 1 个）
  const t1 = { id: 999, propArr: [{ id: 10001, num: 1 }], starNum: 5 };
  state.tasks = [t1];
  assert(task.canCompleteTask(state, t1), '任务可完成判定');
  const starBefore = state.resources.star;
  const coinBefore = state.resources.coin;
  const done = task.completeTask(state, t1);
  assert(done && state.resources.star === starBefore + 5, '任务完成得星星');
  // 旧存档任务（无 goldNum）也按 calcTaskGold 兜底发金币
  const expectGold = calcTaskGold(t1.propArr, t1.starNum);
  assert(expectGold > 0 && state.resources.coin === coinBefore + expectGold, '任务完成得金币');
  // 新任务生成时即带 goldNum；工具链任务（如新手任务 1 的手套）星星清零、金币按原星星折算
  const handTaskGold = task.createHandTask(1);
  assert(handTaskGold !== null && handTaskGold.starNum === 0 && handTaskGold.goldNum > 0, '工具链新手任务只奖金币不给星星');
  const handTaskNonTool = task.createHandTask(10); // 目标 40012，非工具系列
  assert(handTaskNonTool !== null && handTaskNonTool.starNum > 0
    && handTaskNonTool.goldNum === calcTaskGold(handTaskNonTool.propArr, handTaskNonTool.starNum), '非工具链新手任务照常奖星星');
  assert(randomTasks.every(t => t.goldNum !== undefined && t.goldNum > 0), '随机任务带金币奖励');
  const shallowProps = [{ id: 30001, num: 1 }];
  const deepProps = [{ id: 30015, num: 1 }];
  const twoDeepProps = [{ id: 30015, num: 1 }, { id: 20049, num: 1 }];
  const shallowGold = calcTaskGold(shallowProps, calcRandomTaskStars(shallowProps));
  const deepGold = calcTaskGold(deepProps, calcRandomTaskStars(deepProps));
  const twoDeepGold = calcTaskGold(twoDeepProps, calcRandomTaskStars(twoDeepProps));
  assert(calcTaskMergeEffort(twoDeepProps) > 300 && deepGold > shallowGold && twoDeepGold > deepGold, '任务金币随真实合成工作量和材料数量递增');
  const oldRewardTask = { id: 999999, propArr: [{ id: 30015, num: 1 }], starNum: 7, goldNum: 80 };
  const previousTasks = state.tasks;
  state.tasks = [oldRewardTask];
  task.refreshTaskRewards(state);
  assert(oldRewardTask.starNum === calcRandomTaskStars(oldRewardTask.propArr) && oldRewardTask.goldNum === calcTaskGold(oldRewardTask.propArr, oldRewardTask.starNum), '读档任务按新奖励算法重算星星和金币');
  // 读档的工具链旧任务：星星清零，金币按重算星星折算
  const oldToolTask = { id: 999998, propArr: [{ id: 10012, num: 1 }], starNum: 3, goldNum: 5 };
  state.tasks = [oldToolTask];
  task.refreshTaskRewards(state);
  const toolBaseStar = calcRandomTaskStars(oldToolTask.propArr);
  assert(oldToolTask.starNum === 0 && oldToolTask.goldNum === calcTaskGold(oldToolTask.propArr, toolBaseStar), '读档工具链任务星星清零、金币保留');
  state.tasks = previousTasks;
  assert(getItem(state.grid, 0, 0) === null || getItem(state.grid, 0, 1) === null, '任务扣物品');
  assert(!state.tasks.includes(t1), '任务移除');
  assert(state.tasks.length === 5, '完成 1 个后补满 5 个并发任务');

  // 钻石直接完成任务：按金币奖励折算（1 钻 = 100 金币），向上取整，保底 1 钻
  const dState = createInitialGameState();
  setItem(dState.grid, 0, 0, createItemFromConfig(10001));
  const dTask = { id: 888, propArr: [{ id: 10001, num: 1 }], starNum: 5, goldNum: 250 };
  dState.tasks = [dTask];
  dState.resources.diamond = 3;
  assert(calcTaskDiamondCost(dTask) === 3, '钻石消耗按金币向上取整（250 金币 → 3 钻）');
  assert(calcTaskDiamondCost({ id: 1, propArr: [{ id: 10001, num: 1 }], starNum: 1, goldNum: 28 }) === 1, '钻石消耗保底 1（28 金币 → 1 钻）');
  assert(calcTaskDiamondCost({ id: 1, propArr: [{ id: 10001, num: 1 }], starNum: 1, goldNum: 200 }) === 2, '钻石消耗整除不加一（200 金币 → 2 钻）');
  assert(calcTaskDiamondCost({ id: 1, propArr: [{ id: 10001, num: 1 }], starNum: 1, goldNum: 201 }) === 3, '钻石消耗向上取整（201 金币 → 3 钻）');
  const dStarBefore = dState.resources.star;
  const dCoinBefore = dState.resources.coin;
  const dDone = task.completeTaskWithDiamond(dState, dTask);
  assert(dDone && dState.resources.diamond === 0, '钻石完成扣钻石');
  assert(getItem(dState.grid, 0, 0)?.id === 10001, '钻石完成不扣物品');
  assert(dState.resources.star === dStarBefore + 5 && dState.resources.coin === dCoinBefore + 250, '钻石完成发星星金币');
  assert(!dState.tasks.includes(dTask) && dState.tasks.length === 5, '钻石完成移除任务并补满并发');

  // 钻石不足：失败且不扣钻、任务保留
  const dTask2 = { id: 889, propArr: [{ id: 10001, num: 1 }], starNum: 1, goldNum: 300 };
  dState.tasks = [dTask2];
  dState.resources.diamond = 1;
  assert(!task.completeTaskWithDiamond(dState, dTask2) && dState.resources.diamond === 1 && dState.tasks.includes(dTask2), '钻石不足完成失败');

  // 新手任务链式（链式推进后同样补满 5 个）
  const t2 = { id: 1, propArr: [{ id: 10002, num: 1 }], starNum: 1, hand: 1 };
  state.tasks = [t2];
  setItem(state.grid, 1, 0, createItemFromConfig(10002));
  task.completeTask(state, t2);
  assert(state.tasks.some(t => t.hand === 1 && t.id === 2), '新手任务链式推进到 id=2');
  assert(state.tasks.length === 5, '新手链推进后补满 5 个并发任务');

  // 勾标记：被任一进行中任务需要即算 taskNeeded
  state.tasks = [
    { id: 1001, propArr: [{ id: 10012, num: 1 }], starNum: 1 },
    { id: 1002, propArr: [{ id: 10026, num: 1 }], starNum: 1 },
    { id: 1003, propArr: [{ id: 20031, num: 1 }], starNum: 1 }
  ];
  assert(task.isTaskNeedWithId(state, 10012) && task.isTaskNeedWithId(state, 10026) && task.isTaskNeedWithId(state, 20031), '任一进行中任务需要即标记');
  assert(!task.isTaskNeedWithId(state, 10015), '不被任何任务需要则不标记');

  // 卡单救济：连续 2 个游戏天没完成订单 + 死单（目标链一件都没有）→ 救济低 2 级材料 ×2
  const reliefState = createInitialGameState();
  reliefState.day = 5;
  reliefState.lastTaskCompleteDay = 3;
  reliefState.tasks = [{ id: 777, propArr: [{ id: 30052, num: 1 }], starNum: 1 }];
  const relief = task.rollStuckOrderRelief(reliefState);
  assert(relief !== undefined && relief.id === 30050 && relief.num === 2, '死单救济掉低 2 级材料 ×2');
  assert(reliefState.lastTaskCompleteDay === 5, '救济后重置卡单计时');

  // 未跨 2 天 → 无救济
  const recentState = createInitialGameState();
  recentState.day = 5;
  recentState.lastTaskCompleteDay = 4;
  recentState.tasks = [{ id: 778, propArr: [{ id: 30052, num: 1 }], starNum: 1 }];
  assert(task.rollStuckOrderRelief(recentState) === undefined, '未连续 2 天卡单不救济');

  // 目标链在棋盘上有物品（可推进）→ 无救济
  const ownedState = createInitialGameState();
  ownedState.day = 5;
  ownedState.lastTaskCompleteDay = 1;
  setItem(ownedState.grid, 0, 0, createItemFromConfig(30049));
  ownedState.tasks = [{ id: 779, propArr: [{ id: 30052, num: 1 }], starNum: 1 }];
  assert(task.rollStuckOrderRelief(ownedState) === undefined, '链上有物品可推进不救济');

  // 旧存档无计数字段 → 初始化为当前天且不触发
  const legacyState = createInitialGameState();
  legacyState.day = 9;
  legacyState.tasks = [{ id: 780, propArr: [{ id: 30052, num: 1 }], starNum: 1 }];
  assert(task.rollStuckOrderRelief(legacyState) === undefined && legacyState.lastTaskCompleteDay === 9, '旧存档卡单计时从当前天起算');

  // 完成订单重置卡单计时
  const resetState = createInitialGameState();
  resetState.day = 4;
  setItem(resetState.grid, 0, 0, createItemFromConfig(10001));
  const resetTask = { id: 781, propArr: [{ id: 10001, num: 1 }], starNum: 1 };
  resetState.tasks = [resetTask];
  task.completeTask(resetState, resetTask);
  assert(resetState.lastTaskCompleteDay === 4, '完成订单重置卡单计时');

  // 可达链限高：低级发射器够不到链尾高等级物品（自动感应钥匙）
  const state3 = createInitialGameState();
  setItem(state3.grid, 0, 0, createItemFromConfig(30008)); // 储物篮 → 产钥匙(1级)
  const reach = (task as unknown as { collectReachableIds(s: typeof state3): number[] }).collectReachableIds(state3);
  assert(reach.includes(30019) && reach.includes(30021), '可达链含低等级钥匙');
  assert(!reach.includes(30022), '可达链限高：储物篮够不到自动感应钥匙');
  // 拥有高等级链成员可抬高上限
  setItem(state3.grid, 0, 1, createItemFromConfig(30021)); // 感应钥匙(3级)
  const reach2 = (task as unknown as { collectReachableIds(s: typeof state3): number[] }).collectReachableIds(state3);
  assert(reach2.includes(30022), '拥有 3 级钥匙后自动感应钥匙可达');
  // 随机任务不会要求够不到的物品（仅储物篮时不会要自动感应钥匙）
  const state4 = createInitialGameState();
  setItem(state4.grid, 0, 0, createItemFromConfig(30008));
  state4.roleLv = 20;
  let farTask = false;
  for (let i = 0; i < 30 && !farTask; i++) {
    for (const t of task.createRandomTasks(3, state4)) {
      if (t.propArr.some(p => p.id === 30022)) farTask = true;
    }
  }
  assert(!farTask, '随机任务不要求自动感应钥匙（够不到）');

  // 封印（纸箱/蜘蛛网）里的发射器不算可产出：储物篮封在纸箱里 → 钥匙不可达
  const sealed = createInitialGameState();
  setItem(sealed.grid, 0, 0, createItemFromConfig(30008, ItemStatus.Carton));
  const reachSealed = task.collectReachableIds(sealed);
  assert(!reachSealed.includes(30019), '纸箱封住的储物篮不产钥匙（任务不会要）');
  setItem(sealed.grid, 0, 1, createItemFromConfig(30008, ItemStatus.Spider));
  const reachSealed2 = task.collectReachableIds(sealed);
  assert(!reachSealed2.includes(30019), '蜘蛛网封住的储物篮也不产钥匙');

  // 并发任务去重：进行中任务已要的物品不再被新任务要求
  const dup = createInitialGameState();
  setItem(dup.grid, 0, 0, createItemFromConfig(10001)); // 工具箱把手
  setItem(dup.grid, 0, 1, createItemFromConfig(10012)); // 螺丝刀
  dup.roleLv = 10;
  dup.tasks = [{ id: 1, propArr: [{ id: 10012, num: 1 }], starNum: 1 }];
  let dupFound = false;
  for (let i = 0; i < 30 && !dupFound; i++) {
    for (const t of task.createRandomTasks(3, dup)) {
      if (t.propArr.some(p => p.id === 10012)) dupFound = true;
    }
  }
  assert(!dupFound, '新任务不要求进行中任务已要的物品（螺丝刀）');

  // 满级角标 MAX：合成链顶端才算（宝箱等非链物品不算）
  assert(isMergeChainTop(10028) && isMergeChainTop(211) && isMergeChainTop(30007), '链顶物品判定为满级');
  assert(!isMergeChainTop(1001) && !isMergeChainTop(101) && !isMergeChainTop(10012), '非链/可合成物品不算满级');

  // 清理旧存档里不可能完成的任务（保留可行任务和新手任务，补满并发）
  const state5 = createInitialGameState();
  setItem(state5.grid, 0, 0, createItemFromConfig(2001)); // 1 级工具箱
  state5.tasks = [
    { id: 1, propArr: [{ id: 30022, num: 1 }], starNum: 1 },
    { id: 2, propArr: [{ id: 10013, num: 1 }], starNum: 1 },
    { id: 3, propArr: [{ id: 10001, num: 1 }], starNum: 1, hand: 1 }
  ];
  const removed = task.pruneImpossibleTasks(state5);
  assert(removed === 1, '不可能任务被清理（自动感应钥匙）');
  assert(state5.tasks.some(t => t.propArr.some(p => p.id === 10013)), '可行任务保留（锤子）');
  assert(state5.tasks.some(t => t.hand === 1), '新手任务保留');
  assert(!state5.tasks.some(t => t.propArr.some(p => p.id === 30022)), '清理后不再要自动感应钥匙');
  assert(state5.tasks.length === 5, '清理后补满 5 个并发任务');

  // 旧档迁移：多条发射器链已存在时，重复链任务会被替换为其他可用链任务。
  const diversifiedOld = createInitialGameState();
  setItem(diversifiedOld.grid, 0, 0, createItemFromConfig(10001));
  setItem(diversifiedOld.grid, 0, 1, createItemFromConfig(30008));
  diversifiedOld.tasks = [
    { id: 1, propArr: [{ id: 10012, num: 1 }], starNum: 1 },
    { id: 2, propArr: [{ id: 10013, num: 1 }], starNum: 1 }
  ];
  task.pruneImpossibleTasks(diversifiedOld);
  const diverseKeys = routeTask.getTaskSpawnerKeys(diversifiedOld, diversifiedOld.tasks.flatMap(t => t.propArr.map(p => p.id)));
  assert(diverseKeys.size >= 2, '旧档任务迁移优先覆盖不同发射器链');

  // 旧档任务均可行时，读取迁移也必须补齐新版并发上限。
  const oldTaskState = createInitialGameState();
  setItem(oldTaskState.grid, 0, 0, createItemFromConfig(10001));
  oldTaskState.tasks = [
    { id: 1, propArr: [{ id: 10012, num: 1 }], starNum: 1 },
    { id: 2, propArr: [{ id: 10013, num: 1 }], starNum: 1 },
    { id: 3, propArr: [{ id: 10014, num: 1 }], starNum: 1 }
  ];
  task.pruneImpossibleTasks(oldTaskState);
  assert(oldTaskState.tasks.length === 5, '旧档保留任务也补满 5 个并发任务');

  // 新手任务额外物品奖励（发射器件进卡片列表）
  const state2 = createInitialGameState();
  setItem(state2.grid, 0, 0, createItemFromConfig(10028));
  const hand1 = task.createHandTask(1);
  assert(hand1 !== null && hand1.rewardPropArr?.[0]?.id === 70001, '新手任务 1 先发箭塔蓝图箱');
  state2.tasks = [hand1!];
  const cardsBefore = state2.cardArr.length;
  task.completeTask(state2, hand1!);
  assert(state2.cardArr.length === cardsBefore + 1 && state2.cardArr.includes(70001), '完成新手任务得箭塔蓝图箱（进卡片）');

  // 电站蓝图只能在成功建成箭塔、发现缺电后发放，任务 2 不可提前送出。
  const hand2 = task.createHandTask(2);
  assert(hand2 !== null && !hand2.rewardPropArr, '新手任务 2 不提前奖励电站蓝图发射器');
  const hand3 = task.createHandTask(3);
  assert(hand3 !== null && !hand3.rewardPropArr, '新手任务 3 不重复奖励电站蓝图箱');
  setItem(state2.grid, 0, 1, createItemFromConfig(10015));
  state2.tasks = [hand2!];
  task.completeTask(state2, hand2!);
  assert(!state2.cardArr.includes(70007), '完成新手任务 2 不会提前获得电站蓝图发射器');

  // 任务链扩展：22-35 步存在，发射器/宝箱奖励正确
  const hand22 = task.createHandTask(22);
  assert(hand22 !== null, '新手任务链第 22 步存在');
  const hand23 = task.createHandTask(23);
  assert(hand23 !== null && hand23.rewardPropArr?.[0]?.id === 70015, '新手任务 23 奖励木墙发射器');
  const hand27 = task.createHandTask(27);
  assert(hand27 !== null && !hand27.rewardPropArr, '新手任务不再赠送炮塔发射器');
  const hand32 = task.createHandTask(32);
  assert(hand32 !== null && !hand32.rewardPropArr, '新手任务不再赠送地刺发射器');
  const hand35 = task.createHandTask(35);
  assert(hand35 !== null && hand35.rewardPropArr?.[0]?.id === 1002, '新手任务 35 奖励能量宝箱');
  assert(task.createHandTask(36) === null, '新手任务链到 35 步为止');

  // 奖励对白去重：有专属剧情的任务（2~5 老鬼打赏）不再补满仓奖励对话；无剧情的奖励任务（23/27/32/35）才补
  assert(hasTaskStoryBeat(2) && hasTaskStoryBeat(3), '任务 2/3 有专属剧情（老鬼打赏）');
  assert(!hasTaskStoryBeat(23) && !hasTaskStoryBeat(27) && !hasTaskStoryBeat(32) && !hasTaskStoryBeat(35),
    '任务 23/27/32/35 无专属剧情，走满仓奖励对话');
}

// ============ 10.5 玩家等级 ============
console.log('== 玩家等级 ==');
{
  const { level, merge } = makeSystems();
  const state = createInitialGameState();

  // 合成 +1 exp（Lv1 升 Lv2 需 5 exp）
  setItem(state.grid, 0, 0, createItemFromConfig(10012));
  setItem(state.grid, 0, 1, createItemFromConfig(10012));
  merge.moveOrMerge(state, { row: 0, col: 0 }, { row: 0, col: 1 });
  assert(state.resources.exp === 1 && state.roleLv === 1, '每次合成 +1 玩家经验');

  // 升级发奖：Lv1→Lv2 给 1002 能量宝箱，投放到棋盘空格
  const ups = level.addExp(state, 4); // 已有 1 exp，共 5
  assert(ups === 1 && state.roleLv === 2 && state.resources.exp === 0, '经验满升级（exp=5×lv+15 曲线）');
  let has1002 = false;
  for (const row of state.grid.cells) for (const cell of row) if (cell.item?.id === 1002) has1002 = true;
  assert(has1002, '升级奖励宝箱投放到棋盘空格');

  // 连升两级：Lv2→Lv3 给 1003，Lv3→Lv4 给 1001+802+1005
  level.addExp(state, 20 + 25);
  assert(state.roleLv === 4, '经验足够可连升');
  const ids = new Set<number>();
  for (const row of state.grid.cells) for (const cell of row) if (cell.item) ids.add(cell.item.id);
  assert(!ids.has(1003) && !ids.has(1005), '升级奖励不再产出蓝色或黑色手提包');
  assert(ids.has(1001) && ids.has(802) && !ids.has(1003) && !ids.has(1005), '连升奖励只保留金币宝箱和能量球');

  // 棋盘满时升级奖励进卡片列表
  const fullState = createInitialGameState();
  for (let r = 0; r < fullState.grid.rowNum; r++) {
    for (let c = 0; c < fullState.grid.colNum; c++) {
      setItem(fullState.grid, r, c, createItemFromConfig(10001));
    }
  }
  level.addExp(fullState, 5);
  assert(fullState.roleLv === 2 && fullState.cardArr.includes(1002), '棋盘满时升级奖励进卡片');
}

// ============ 10.6 黑市蓝图 ============
console.log('== 黑市蓝图 ==');
{
  const state = createInitialGameState();
  state.resources.star = 50;
  assert(!BLACK_MARKET_ITEMS.some(item => [101, 203, 401].includes(item.cfgId)), '箭塔、风电站、木墙不在黑市出售');
  assert(BLACK_MARKET_ITEMS.slice(0, 2).map(item => item.cfgId).join(',') === '209,208'
    && BLACK_MARKET_ITEMS.find(item => item.cfgId === 209)?.star === 24
    && BLACK_MARKET_ITEMS.find(item => item.cfgId === 208)?.star === 24,
  '雷达站与弹药库完整蓝图各 24 星（1 星 = 1 枚碎片）');
  const item = BLACK_MARKET_ITEMS.find(entry => entry.cfgId === 102)!;
  const bought = buyBlackMarketBlueprint(state, item.cfgId);
  assert(item.blueprintId === (getBuildingConfig(102)?.blueprint ?? 0) && bought.ok
    && state.resources.star === 50 - item.star && !!findCell(state, item.blueprintId),
  '黑市扣星星并直接发放完整蓝图');
  assert(BLACK_MARKET_ITEMS.find(entry => entry.cfgId === 301)?.star === 16
    && BLACK_MARKET_ITEMS.find(entry => entry.cfgId === 403)?.star === 32
    && BLACK_MARKET_ITEMS.every(entry => entry.blueprintId === (getBuildingConfig(entry.cfgId)?.blueprint ?? 0)),
  '黑市完整蓝图按 1 星 = 1 枚碎片定价（原 2 星 → 16 星，原 4 星 → 32 星）');
  assert(getRecommendedMarketItem(4)?.cfgId === 303 && getRecommendedMarketItem(8)?.cfgId === 209, '快速和飞行僵尸分别推荐减速沼泽与雷达站');
  assert(BLACK_MARKET_ITEMS.find(entry => entry.cfgId === 303)?.star === 5, '减速沼泽特价 5 星（一次性陷阱例外定价）');
  assert(getMergeChain(getBuildingConfig(208)?.blueprint ?? 0).join(',') === '70201,70202,70203,70169', '弹药库碎片可正常合成为完整蓝图');
  assert(getMergeChain(getBuildingConfig(209)?.blueprint ?? 0).join(',') === '70205,70206,70207,70170', '雷达站碎片可正常合成为完整蓝图');
  assert(getMergeChain(getBuildingConfig(210)?.blueprint ?? 0).join(',') === '70209,70210,70211,70171', '维修站碎片可正常合成为完整蓝图');
  state.resources.diamond = 1;
  state.resources.coin = 0;
  assert(exchangeDiamondForCoins(state) && state.resources.diamond === 0 && state.resources.coin === 100, '黑市 1 钻石兑换 100 金币');

  // 急缺材料星星直购：进行中订单的目标按「1 星 = 1 个一级材料的合成工作量」定价
  const matState = createInitialGameState();
  matState.tasks = [
    { id: 601, propArr: [{ id: 30052, num: 1 }], starNum: 1 },  // 失物篮（链位 3 → 8 星）
    { id: 602, propArr: [{ id: 10001, num: 2 }], starNum: 1 }   // 一级材料 ×2（1 星/件）
  ];
  const needed = getNeededMaterials(matState);
  assert(needed.length === 2 && needed[0].id === 30052 && needed[0].star === 8 && needed[0].need === 1
    && needed[1].id === 10001 && needed[1].star === 1 && needed[1].need === 2, '急缺材料按订单汇总并定价（贵在前）');
  matState.resources.star = 10;
  assert(buyNeededMaterial(matState, 30052) && matState.resources.star === 2
    && (!!findCell(matState, 30052) || matState.cardArr.includes(30052)), '星星直购扣星并发放材料');
  assert(!buyNeededMaterial(matState, 30052) && matState.resources.star === 2, '星星不足购买失败不扣星');
  assert(!buyNeededMaterial(matState, 10002), '非订单目标不可直购');
}

// ============ 11. 掉落/产出进棋盘（材料库已移除） ============
console.log('== 掉落进棋盘 ==');
{
  const { economy, merge } = makeSystems();
  const state = createInitialGameState();

  const eliteDrops = rollDrops(getZombieConfig(5)!);
  const bossDrops = rollDrops(getZombieConfig(6)!);
  assert(eliteDrops[1003] === 1 && bossDrops[1005] === 1, '精英与 Boss 战斗掉落蓝色和黑色手提包');
  assert(eliteDrops[60024] === 1 && bossDrops[60024] === 2, '精英与 Boss 保底掉核心材料神秘零件');

  // 合成出满级物品留在棋盘上（10027 + 10027 = 10028）
  setItem(state.grid, 0, 0, createItemFromConfig(10027));
  setItem(state.grid, 0, 1, createItemFromConfig(10027));
  const r = merge.moveOrMerge(state, { row: 0, col: 0 }, { row: 0, col: 1 });
  assert(r.kind === 'merge' && r.newItem?.id === 10028, '合成出满级物品成功');
  assert(getItem(state.grid, 0, 1)?.id === 10028, '满级物品留在棋盘');

  // 棋盘有可承载空格 → 掉落落到可承载空格（基地规则：未开垦/建筑/地形格不可落）
  const count10028 = () => state.grid.cells.flat().filter(c => c.item?.id === 10028).length;
  const before28 = count10028();
  economy.giveItemToBoardOrCard(state, 10028);
  assert(count10028() === before28 + 1 && state.cardArr.length === 0, '棋盘有空格时掉落落到空格');

  // 棋盘全满 → 掉落进卡片列表
  for (let row = 0; row < state.grid.rowNum; row++) {
    for (let col = 0; col < state.grid.colNum; col++) {
      if (!getItem(state.grid, row, col)) setItem(state.grid, row, col, createItemFromConfig(10001));
    }
  }
  economy.giveItemToBoardOrCard(state, 10028);
  assert(state.cardArr.length === 1 && state.cardArr[0] === 10028, '棋盘全满时掉落进卡片');
}

// ============ 13. 基地建造 ============
console.log('== 基地建造 ==');
{
  const { economy } = makeSystems();
  const base = new BaseSystem(economy);
  const state = createInitialGameState();
  unlockAllBuildings(state); // 本段测建造/产出逻辑，蓝图解锁判定见「蓝图解锁」段
  state.resources.coin = 10000; // 黑市卖材料换来的金币，用于测试建筑建造
  addFueledGenerator(state); // 电力充足：本段测建造/产出逻辑，供电判定见「电力系统」段
  state.base.tiles.forEach(row => row.forEach(tile => { tile.claimed = true; }));

  // 初始基地只有核心，居中
  const core = base.getCore(state);
  assert(state.base.rows === 13 && state.base.cols === 13, '基地 13×13');
  assert(core.cfgId === 1 && core.row === BASE_CENTER && core.col === BASE_CENTER && core.hp === 1000, '核心居中且满血');

  // 新手链：箭塔先落地并发现缺电，才给电站蓝图发射器；重复造塔不可重复发放。
  const guidedState = createInitialGameState();
  guidedState.handIndex = 14;
  guidedState.resources.coin = 1000;
  guidedState.unlockedBuildings = [101];
  guidedState.base.tiles.forEach(row => row.forEach(tile => { tile.claimed = true; }));
  assert(base.place(guidedState, 101, 5, 12), '引导期箭塔摆放成功');
  assert(guidedState.handIndex === 15 && guidedState.cardArr.includes(70007), '箭塔缺电后发放电站蓝图发射器');
  const powerEmitterCount = guidedState.cardArr.filter(id => id === 70007).length;
  assert(base.place(guidedState, 101, 6, 12), '引导期可继续摆放箭塔');
  assert(guidedState.cardArr.filter(id => id === 70007).length === powerEmitterCount, '重复摆放箭塔不重复发放电站蓝图发射器');
  const legacyGuidedState = createInitialGameState();
  legacyGuidedState.handIndex = 14;
  legacyGuidedState.resources.coin = 1000;
  legacyGuidedState.unlockedBuildings = [101];
  legacyGuidedState.cardArr.push(70007);
  legacyGuidedState.base.tiles.forEach(row => row.forEach(tile => { tile.claimed = true; }));
  assert(base.place(legacyGuidedState, 101, 5, 12), '旧引导存档箭塔摆放成功');
  assert(legacyGuidedState.handIndex === 15 && legacyGuidedState.cardArr.filter(id => id === 70007).length === 1, '旧存档已有电站发射器时不重复发放');

  // 金币不足不能建（木墙 401 需要 100 金币）
  const coinBefore = state.resources.coin;
  state.resources.coin = 0;
  assert(!base.place(state, 401, 6, 5), '金币不足摆放失败');
  state.resources.coin = coinBefore;

  // 按区域规则摆放
  assert(!base.place(state, 101, BASE_CENTER, BASE_CENTER), '核心格不可摆放');
  assert(base.canPlace(state, 101, 6, 5).ok, '防御塔可建在内圈');
  assert(base.canPlace(state, 202, 5, 12).ok, '资源建筑可建在外圈');

  // 建造扣金币：木墙 = 100 金币
  const wallCoinBefore = state.resources.coin;
  assert(base.place(state, 401, 6, 5), '木墙摆放在内圈空格');
  assert(state.resources.coin === wallCoinBefore - 100, '建造木墙扣 100 金币');
  assert(!base.place(state, 401, 6, 5), '重复格不可摆放');

  // 箭塔 = 200 金币（(5,12)：东边缺口的外圈格）
  const arrowCoinBefore = state.resources.coin;
  assert(base.place(state, 101, 5, 12), '箭塔摆放在外圈');
  assert(state.resources.coin === arrowCoinBefore - 200, '建造箭塔扣 200 金币');

  // 医疗站 = 250 金币
  const farmCoinBefore = state.resources.coin;
  assert(base.place(state, 202, 6, 4), '医疗站摆放在内圈');
  assert(state.resources.coin === farmCoinBefore - 250, '建造医疗站扣 250 金币');

  // 升级：1→2 消耗 250 金币 + 1 张重复蓝图，血量 ×1.5
  state.blueprintStock[202] = 1;
  assert(base.upgrade(state, 6, 4), '医疗站升级成功');
  const green = state.base.buildings.find(b => b.row === 6 && b.col === 4)!;
  assert(green.level === 2 && green.maxHp === Math.round(150 * 1.5), '升级后等级/血量提升');
  assert(state.resources.coin === farmCoinBefore - 250 - 250, '升级扣 250 金币');
  assert(state.blueprintStock[202] === 0, '升级消耗 1 张重复蓝图');

  // 无重复蓝图不可升级
  assert(!base.upgrade(state, 6, 4), '无重复蓝图升级失败');

  // 金币不足升级失败（2→3 需要 400 金币；蓝图充足）
  state.blueprintStock[202] = 1;
  const savedCoin = state.resources.coin;
  state.resources.coin = 0;
  assert(!base.upgrade(state, 6, 4), '金币不足升级失败');
  assert(state.blueprintStock[202] === 1, '升级失败不消耗蓝图');
  state.resources.coin = savedCoin;

  // 拆除：炮塔 102 返还 50% 金币（600×0.5 = 300）
  assert(base.place(state, 102, 6, 12), '炮塔摆放在外圈');
  const cannonCoinBefore = state.resources.coin;
  assert(base.demolish(state, 6, 12), '拆除炮塔');
  assert(state.resources.coin === cannonCoinBefore + 300, '拆除炮塔返还 300 金币');
  assert(!base.demolish(state, BASE_CENTER, BASE_CENTER), '核心不可拆除');

  // 资源建筑产出：医疗站 202 产出药品，2 级间隔 = 300/1.5 = 200 秒，产量 8*1.5 = 12
  const farm = state.base.buildings.find(b => b.row === 6 && b.col === 4);
  assert(!!farm && !!farm.lastProduceAt, '医疗站记录产出时间戳');
  const farmCfg = getBuildingConfig(202)!;
  assert(farmCfg.outputResource === 'medicine' && farmCfg.outputAmount === 8 && farmCfg.outputInterval === 300, '医疗站配置为药品产出');
  const interval2 = outputIntervalAtLevel(farmCfg, 2);
  assert(interval2 === 200, '2 级产出间隔加速为 200 秒');
  const perCycle2 = Math.round(farmCfg.outputAmount! * 1.5);
  assert(perCycle2 === 12, '2 级产量提升为 12');

  // 先提升上限，验证无 cap 时产量完全累积
  state.resources.medicineMax = 1000;
  state.resources.medicine = 0;
  const t0 = farm!.lastProduceAt!;
  const gains = base.tickProduction(state, t0 + 2 * 3600 * 1000);
  const cycles = Math.floor((2 * 3600) / interval2);
  assert(gains.resources.medicine === cycles * perCycle2, '医疗站 2 级产出按时间累积');
  assert(state.resources.medicine === cycles * perCycle2, '药品资源实际入账');

  // 再 cap 到默认上限，验证资源不溢出
  state.resources.medicineMax = 10;
  state.resources.medicine = 0;
  farm!.lastProduceAt = t0;
  base.tickProduction(state, t0 + 2 * 3600 * 1000);
  assert(state.resources.medicine === 10, '药品产出受上限 10 限制');

  // 仓库（205）增加药品储量上限
  assert(state.resources.medicineMax === 10, '默认药品上限 10');
  assert(base.place(state, 205, 6, 3), '仓库摆放成功');
  assert(state.resources.medicineMax === 40, '仓库增加药品上限');

  // 收集站 207 产出低级合成材料，发到棋盘（满则进卡片）
  addFueledGenerator(state); // 本段验证产出，补一座发电站避免前序建筑占满新的 6 点容量。
  assert(base.place(state, 207, 5, 5), '收集站摆放成功');
  const collector = state.base.buildings.find(b => b.row === 5 && b.col === 5)!;
  const boardCountBefore = state.grid.cells.flat().filter(c => c.item).length + state.cardArr.length;
  const tCollect = collector.lastProduceAt!;
  // 关掉核心光环（1 级 5% 会把产物升一级），保证本用例只验证产出池
  const savedRandom = Math.random;
  Math.random = () => 0.999;
  const itemGains = base.tickProduction(state, tCollect + 10 * 300 * 1000).items;
  Math.random = savedRandom;
  const gainTotal = Object.values(itemGains).reduce((s, n) => s + n, 0);
  assert(gainTotal === 10, '收集站每 300 秒产出 1 份低级材料');
  const pool = getBuildingConfig(207)!.outputPool!;
  assert(Object.keys(itemGains).every(id => pool.includes(Number(id))), '收集站产出均在产出池内');
  const boardCountAfter = state.grid.cells.flat().filter(c => c.item).length + state.cardArr.length;
  assert(boardCountAfter === boardCountBefore + gainTotal, '产出材料发到棋盘（满则进卡片）');

  // 离线累积上限：lastProduceAt 最多回溯 PRODUCE_ACCUM_CAP
  const t1 = collector.lastProduceAt!;
  base.tickProduction(state, t1 + 100 * 3600 * 1000);
  assert(collector.lastProduceAt! - t1 <= PRODUCE_ACCUM_CAP * 1000 + 300 * 1000, '离线产出累积有上限');

  // 建造不消耗行动力（只扣金币）。先清掉收集站产出落到基地格上的材料——物品占格会阻挡摆放（基地合成新规则）
  state.grid.cells.forEach(row => row.forEach(cell => { cell.item = null; }));
  const powerBefore = state.resources.power;
  assert(base.place(state, 402, 6, 8), '石墙摆放成功');
  assert(state.resources.power === powerBefore, '建造不消耗行动力');

  // 修复：受损建筑回满血，收金币（造价一半 × 损坏比例），不耗行动力
  const wall = state.base.buildings.find(b => b.row === 6 && b.col === 8)!;
  wall.hp = 50; // 石墙 costCoin 250 / maxHp 300 → 修 250/300 → ceil(250*0.5*250/300) = 105
  const repairCost = getRepairCostCoin(402, 50, wall.maxHp);
  assert(repairCost === 105, '修复费用 = 造价一半 × 损坏比例');
  const powerBefore2 = state.resources.power;
  const coinBeforeRepair = state.resources.coin;
  assert(base.repair(state, 6, 8) && wall.hp === wall.maxHp, '修复受损建筑');
  assert(state.resources.coin === coinBeforeRepair - 105, '修复消耗 105 金币');
  assert(state.resources.power === powerBefore2, '修复不消耗行动力');

  const damagedCore = state.base.buildings.find(b => b.cfgId === 1)!;
  damagedCore.hp = 500;
  const coreRepairCost = getRepairCostCoin(1, damagedCore.hp, damagedCore.maxHp);
  assert(coreRepairCost === 500, '核心修复按每点损失血量 1 金币计价');
  state.resources.coin = 500;
  assert(base.repair(state, damagedCore.row, damagedCore.col) && damagedCore.hp === damagedCore.maxHp, '核心基地可花金币修复至满血');
  assert(state.resources.coin === 0, '核心修复扣除 500 金币');

  // 金币不足时修复失败
  wall.hp = 50;
  state.resources.coin = 10;
  assert(!base.repair(state, 6, 8) && wall.hp === 50, '金币不足修复失败');
}

// ============ 13.5 电力系统 ============
console.log('== 电力系统 ==');
{
  const { economy } = makeSystems();
  const base = new BaseSystem(economy);
  const night = new NightSystem();

  // 开局：核心不耗电、无发电机 → 电力 0/0
  const fresh = createInitialGameState();
  assert(fresh.resources.coin === 0, '开局 coin=0');
  const pi0 = getPowerInfo(fresh);
  assert(pi0.used === 0 && pi0.cap === 0, '开局电力 0/0（核心不耗电）');

  // 城墙/陷阱不需要电力
  for (const id of [301, 302, 303, 401, 402, 403]) {
    assert((getBuildingConfig(id)?.needPower ?? 1) === 0, `${getBuildingConfig(id)?.name ?? id} 不需要电力`);
  }

  // 风力发电站（203）：providePower=6、无自然产出。
  const genCfg = getBuildingConfig(203)!;
  assert(genCfg.name === '风力发电站' && genCfg.providePower === 6 && !genCfg.outputResource, '风力发电站 providePower=6 且不产出资源');

  // getPowerInfo：1 台风力发电站 cap=6；6 座箭塔 used=12
  const state = createInitialGameState();
  addFueledGenerator(state);
  for (let i = 0; i < 6; i++) {
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 0, col: i * 2 });
  }
  const towers = state.base.buildings.filter(b => b.cfgId === 101);
  const pi1 = getPowerInfo(state);
  assert(pi1.cap === 6 && pi1.used === 12, '电力容量实时计算：cap=6 / used=12');
  // 按摆放顺序累计 needPower：前 3 座（累计 ≤6）通电，第 4 座开始缺电。
  assert(towers.slice(0, 3).every(b => isBuildingPowered(state, b)), '电力按摆放顺序累计，前 3 座塔通电');
  assert(!isBuildingPowered(state, towers[3]), '第 4 座塔缺电');
  // 0 耗电建筑不被前面缺电建筑连带
  state.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row: 6, col: 4 });
  const wall0 = state.base.buildings.find(b => b.cfgId === 401)!;
  assert(isBuildingPowered(state, wall0), '城墙（0 耗电）不被缺电塔连带');

  // 基础风电不消耗燃料：即使未来柴油库存为零，仍提供稳定容量。
  const gen = state.base.buildings.find(b => b.cfgId === 203)!;
  state.resources.fuel = 0;
  assert(getPowerInfo(state).cap === 6 && isBuildingPowered(state, towers[0]), '基础风电不因燃料不足停机');
  state.resources.fuel = 24;

  // 发电机升级缩放：Lv2 providePower = round(6×1.5) = 9
  gen.level = 2;
  assert(getPowerInfo(state).cap === 9, '发电机升级电力 ×1.5 取整（6→9）');
  gen.level = 1;

  // 缺电塔夜晚不攻击（僵尸只在第 6 座缺电塔射程内）；夜战口径塔优先：只算塔时全部通电
  const state2 = createInitialGameState();
  addFueledGenerator(state2);
  state2.base.buildings.push({ cfgId: 202, level: 1, hp: 150, maxHp: 150, row: 6, col: 4 }); // 医疗站先盖
  for (let i = 0; i < 5; i++) {
    state2.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 0, col: i * 2 });
  }
  const towers2 = state2.base.buildings.filter(b => b.cfgId === 101);
  const farmNp = state2.base.buildings.find(b => b.cfgId === 202)!;
  // 白天口径：医疗站(2)+塔(10) 累计超出 6 → 第 3 座塔缺电；夜战只给塔供电 → 前 3 座通电。
  assert(isBuildingPowered(state2, farmNp) && !isBuildingPowered(state2, towers2[2]), '白天按摆放顺序：医疗站通电、第 3 座塔缺电');
  assert(towers2.slice(0, 3).every(b => isTowerPoweredAtNight(state2, b)) && !isTowerPoweredAtNight(state2, towers2[3]), '夜战塔优先：前 3 座塔通电');

  // 缺电塔夜晚不攻击 → 通电后恢复
  const battle = night.startBattle(state2);
  battle.status = 'fighting';
  battle.wave = 1;
  state2.base.buildings = state2.base.buildings.filter(b => b.cfgId !== 203); // 无发电设施
  const powerToasts: string[] = [];
  const offPowerToast = eventBus.on(GameEvents.TOAST_SHOW, (message: string) => powerToasts.push(message));
  battle.zombies.push({ uid: 997, cfgId: 1, hp: 60, maxHp: 60, row: 0, col: 5, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
  night.tick(state2, battle, 100);
  assert(battle.zombies[0]?.hp === 60, '缺电塔夜晚不攻击');
  assert(powerToasts.some(message => message === getText('toast.towerNoPower')), '缺电箭塔提示原因');
  addFueledGenerator(state2);
  night.tick(state2, battle, 100);
  assert(battle.zombies[0] !== undefined && battle.zombies[0].hp < 60, '通电后塔恢复攻击');
  offPowerToast();

  // 缺电资源建筑不产出且不推进 lastProduceAt；通电后补产（不吞离线时间）
  const farmState = createInitialGameState();
  farmState.base.buildings.push({ cfgId: 202, level: 1, hp: 150, maxHp: 150, row: 6, col: 4, lastProduceAt: 1000000 });
  const farmGains = base.tickProduction(farmState, 1000000 + 3600 * 1000);
  const farmB = farmState.base.buildings.find(b => b.cfgId === 202)!;
  assert((farmGains.resources.medicine ?? 0) === 0 && farmState.resources.medicine === 0, '缺电资源建筑不产出');
  assert(farmB.lastProduceAt === 1000000, '缺电不推进 lastProduceAt');
  addFueledGenerator(farmState);
  const farmGains2 = base.tickProduction(farmState, 1000000 + 3600 * 1000);
  assert((farmGains2.resources.medicine ?? 0) > 0, '通电后资源建筑补产（不吞离线时间）');

}

// ============ 13.5 阵地组合（第二期） ============
console.log('== 阵地组合 ==');
{
  const night = new NightSystem();

  assert(getBuildingConfig(208)?.name === '弹药库' && getBuildingConfig(209)?.name === '雷达站' && getBuildingConfig(210)?.name === '维修站', '三座支撑建筑已配置');

  // 夜间支撑建筑先供电，剩余电力才给防御塔和资源建筑。
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 208, level: 1, hp: 180, maxHp: 180, row: 2, col: 2 });
    for (let i = 0; i < 5; i++) state.base.buildings.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 0, col: i * 2 });
    const towers = state.base.buildings.filter(b => b.cfgId === 101);
    assert(towers.slice(0, 2).every(tower => isTowerPoweredAtNight(state, tower)) && !isTowerPoweredAtNight(state, towers[2]), '夜间弹药库优先于防御塔供电');
  }

  // 弹药库覆盖内的箭塔攻速 +50%。
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 208, level: 1, hp: 180, maxHp: 180, row: 2, col: 2 });
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 2, col: 4 });
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 9977, cfgId: 1, hp: 100, maxHp: 100, row: 2, col: 6, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
    night.tick(state, battle, 100);
    assert(Math.abs((battle.towerCds['2,4'] ?? 0) - 1000 / (1.2 * 1.5)) < 0.01, '弹药库令覆盖内箭塔攻速提升 50%');
  }

  // 箭塔必须在雷达覆盖内才能对空；雷达也让钻地敌提前显形。
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 2, col: 4 });
    assert(!canDefendFlyingEnemies(state), '无雷达覆盖的箭塔无法防御飞行敌人');
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 9976, cfgId: 7, hp: 100, maxHp: 100, row: 2, col: 6, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
    night.tick(state, battle, 100);
    assert(battle.zombies[0]?.hp === 100, '无雷达覆盖的箭塔不能攻击飞行敌人');
  }

  // 雷达覆盖内的箭塔优先射击飞行敌，钻地敌直接显形。
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 209, level: 1, hp: 160, maxHp: 160, row: 2, col: 2 });
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 2, col: 4 });
    assert(canDefendFlyingEnemies(state), '雷达覆盖的箭塔可以防御飞行敌人');
    const fires: { toRow: number; toCol: number }[] = [];
    const offFire = eventBus.on(GameEvents.NIGHT_TOWER_FIRE, (event: { toRow: number; toCol: number }) => fires.push(event));
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push(
      { uid: 9978, cfgId: 1, hp: 100, maxHp: 100, row: 2, col: 5, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 },
      { uid: 9979, cfgId: 7, hp: 100, maxHp: 100, row: 2, col: 6, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 },
      { uid: 9980, cfgId: 8, hp: 90, maxHp: 90, row: 2, col: 5, moveCd: 0, attackCd: 1e9, slowUntil: 0, burrowed: true }
    );
    night.tick(state, battle, 100);
    offFire();
    assert(fires[0]?.toCol === 6, '雷达覆盖的箭塔优先攻击飞行敌人');
    assert(battle.zombies.find(z => z.uid === 9980)?.burrowed === false, '雷达覆盖内的钻地敌提前显形');
  }

  // 自爆僵尸在墙边主动引爆；维修站在胜利天亮时消耗废料修复墙和塔。
  {
    const state = createInitialGameState();
    state.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row: 6, col: 7 });
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 9981, cfgId: 4, hp: 50, maxHp: 50, row: 6, col: 8, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state, battle, 100);
    assert(state.base.buildings.find(b => b.cfgId === 401)?.hp === 120, '自爆僵尸贴近墙体时主动爆破');

    const repairState = createInitialGameState();
    repairState.resources.scrap = 2;
    addFueledGenerator(repairState);
    repairState.base.buildings.push({ cfgId: 210, level: 1, hp: 180, maxHp: 180, row: 6, col: 5 });
    repairState.base.buildings.push({ cfgId: 401, level: 1, hp: 100, maxHp: 150, row: 6, col: 4 });
    const repairBattle = night.startBattle(repairState);
    repairBattle.status = 'won';
    night.endBattle(repairState, repairBattle);
    assert(repairState.base.buildings.find(b => b.cfgId === 401)?.hp === 140 && repairState.resources.scrap === 0, '维修站天亮消耗废料修复邻近墙体');
  }
}

// ============ 14. 夜晚战斗 ============
console.log('== 夜晚战斗 ==');
{
  assert(getZombieLevel(4) === 1 && getZombieLevel(5) === 2, '僵尸等级每四夜提升一次');
  assert(getNightPreview(3).types.every(type => type.id === 1), '第 3 夜前只有普通僵尸');
  assert(getNightPreview(4).types.some(type => type.id === 2), '第 4 夜首次出现快速僵尸');
  assert(getNightPreview(8).types.some(type => type.id === 7), '第 8 夜首次出现飞行僵尸');
  assert(getNightPreview(5).bossLast && getNightPreview(10).bossLast && !getNightPreview(8).bossLast && getNightPreview(35).bossLast, 'Boss 夜：第 5 天起每 5 天一次');
  const night = new NightSystem();

  // 波次配置
  assert(getTotalWaves(1) === 3 && getTotalWaves(6) === 4, '波次随天数递增');
  assert(genWaveZombies(10, getTotalWaves(10), getTotalWaves(10)).includes(6), '第 10 天最后一波出 Boss');
  assert(genWaveZombies(6, getTotalWaves(6), getTotalWaves(6)).includes(5), '第 6 天起最后一波保底精英');

  // --- 夜战预告：波次/总数/类型/方向 ---
  {
    const p1 = getNightPreview(1);
    assert(p1.waves === 3 && p1.total === 8 + 10 + 12, '第 1 天预告：3 波共 30 只（数量×2 割草手感）');
    assert(p1.level === 1, '第 1 天预告：僵尸 Lv1');
    assert(p1.types.length === 1 && p1.types[0].id === 1 && !p1.eliteLast && !p1.bossLast, '第 1 天预告：只有普通僵尸');
    const p4 = getNightPreview(4);
    assert(!p4.eliteLast && !p4.bossLast && p4.types.some(t => t.id === 2), '第 4 天预告：快速僵尸首次出现');
    const p28 = getNightPreview(28);
    const p10 = getNightPreview(10);
    assert(p10.bossLast && p10.types.some(t => t.id === 6 && t.guaranteed), '第 10 天预告：Boss 夜');
    const p8 = getNightPreview(8);
    assert(p8.types.some(t => t.id === 7) && !p8.types.some(t => t.id === 3), '第 8 天起出现飞行敌，高甲敌延后出现');
    assert(p8.eliteLast && p8.types.some(t => t.id === 5 && t.guaranteed), '第 8 天预告：末波保底精英');
    assert(p28.total === 1729, '第 28 天预告：总数含保底精英（数量×2）');
    // 血量统一降 1/3（数量翻倍的手感平衡）
    assert(getZombieConfig(1)!.hp === 20 && getZombieConfig(6)!.hp === 800 && getZombieConfig(3)!.hp === 147, '僵尸血量降 1/3');

    // 僵尸等级：每 4 天 +1 级，封顶 Lv8
    assert(getZombieLevel(1) === 1 && getZombieLevel(4) === 1 && getZombieLevel(5) === 2 && getZombieLevel(29) === 8, '僵尸等级：每 4 天 +1，封顶 Lv8');

    // 进攻方向：新开局只从东边 3 格缺口；北/西/南被废墟封死
    const fresh = createInitialGameState();
    const sides = getAttackSides(fresh.base);
    assert(sides.length === 1 && sides[0].side === 'east' && sides[0].count === 3, '预告方向：第一夜仅东侧 3 格');
    // 全部边缘堵死 → 无开放方向（弹窗提示原地强拆）
    fresh.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row: 4, col: 12 });
    fresh.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row: 5, col: 12 });
    fresh.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row: 6, col: 12 });
    assert(getAttackSides(fresh.base).length === 0, '堵死缺口后无开放进攻方向');
  }

  // --- 地形系统（P1）：初始铺设 / 寻路 / 刷怪 / 金币清理 ---
  {
    const baseSys = new BaseSystem(new EconomySystem());
    const tbase = createDefaultBase();
    // 数量与表一致；核心周围 2 格（d≤2）保持平地，保住新手建造区
    let terrainCount = 0;
    for (let r = 0; r < tbase.rows; r++) {
      for (let c = 0; c < tbase.cols; c++) {
        if (tbase.tiles[r][c].terrain) {
          terrainCount++;
          assert(r < 4 || r > 8 || c < 4 || c > 8, '核心周围 2 格保持平地');
        }
      }
    }
    assert(terrainCount === TERRAIN_TABLE.length, '初始地形数量与 terrain.json 一致');
    // 边缘格无地形：不影响现有进攻方向收口
    assert(TERRAIN_TABLE.every(t => t.row > 0 && t.row < 12 && t.col > 0 && t.col < 12), '地形不铺在边缘格');
    // 默认地图 + 地形下杀怪走廊仍在（东边缺口可达核心）
    assert(hasKillCorridor(tbase), '初始地形下仍存在杀怪走廊');
    // 废墟全塌后：每个边缘格都有到核心的路（否则僵尸刷出即卡死）
    const collapsed = createDefaultBase();
    collapsed.buildings = collapsed.buildings.filter(b => b.cfgId !== RUIN_ID);
    const edgeCells: { row: number; col: number }[] = [];
    for (let c = 0; c < 13; c++) edgeCells.push({ row: 0, col: c }, { row: 12, col: c });
    for (let r = 1; r < 12; r++) edgeCells.push({ row: r, col: 0 }, { row: r, col: 12 });
    assert(edgeCells.every(p => !!findPathToCore(collapsed, p)), '全开后所有边缘格可达核心（无死胡同）');
    // 逐天模拟废墟塌陷：每天夜里，可刷怪的边缘格（无建筑+地形可刷）中至少有一个能走到核心。
    // 刷怪按此过滤——被瓦砾/破楼围死的口袋格（如第 2 天西北角）刷出来会永远卡住
    for (let wonDay = 0; wonDay <= 4; wonDay++) {
      const dayBase = createDefaultBase();
      for (let d = 0; d < wonDay; d++) {
        const cells = new Set(ruinCellsOfSide(RUIN_COLLAPSE_ORDER[d]).map(p => `${p.row},${p.col}`));
        dayBase.buildings = dayBase.buildings.filter(b => !(b.cfgId === RUIN_ID && cells.has(`${b.row},${b.col}`)));
      }
      const spawnable = edgeCells.filter(p => {
        if (dayBase.buildings.some(b => b.row === p.row && b.col === p.col)) return false;
        const t = terrainAt(dayBase, p.row, p.col);
        return !t || isTerrainSpawnable(t);
      });
      assert(spawnable.length > 0, `第 ${wonDay + 1} 夜有可刷怪的边缘格`);
      assert(spawnable.every(p => !!findPathToCore(dayBase, p)), `第 ${wonDay + 1} 夜所有可刷怪边缘格可达核心`);
    }

    // 地形格不可摆放建筑（破旧建筑已从地图移除：原 12 格改为瓦砾堆，阻挡/寻路形状不变）
    const ts = createInitialGameState();
    unlockAllBuildings(ts);
    ts.resources.coin = 100000;
    assert(TERRAIN_TABLE.every(c => (c.kind as string) !== 'shack'), '初始地形不再包含破旧建筑');
    assert(terrainAt(ts.base, 1, 2) === 'rubble', '原破旧建筑格现在是瓦砾堆');
    assert(!baseSys.canPlace(ts, 401, 2, 3).ok, '瓦砾地形格不可摆放');
    // 金币清理：扣款、地形移除；之后即可摆放
    assert(baseSys.clearTerrain(ts, 2, 3), '金币清理瓦砾堆成功');
    assert(ts.resources.coin === 100000 - TERRAIN_CLEAR_COST.rubble, '清理瓦砾堆扣 100 金币');
    assert(!terrainAt(ts.base, 2, 3), '清理后地形移除');
    assert(baseSys.canPlace(ts, 401, 2, 3).ok, '清理后可摆放');
    // 金币不足清理失败，地形保留
    ts.resources.coin = 10;
    assert(!baseSys.clearTerrain(ts, 1, 1) && terrainAt(ts.base, 1, 1) === 'rubble', '金币不足清理失败且地形保留');
    // 平地格清理返回 false
    assert(!baseSys.clearTerrain(ts, 6, 6), '平地格无地形可清理');

    // 水池阻挡地面寻路：从 (12,6) 出发的路径不经过任何水池格（先移除边缘废墟，模拟坍塌后）
    ts.base.buildings = ts.base.buildings.filter(b => b.cfgId !== RUIN_ID);
    const path = findPathToCore(ts.base, { row: 12, col: 6 });
    assert(!!path && path.every(p => terrainAt(ts.base, p.row, p.col) !== 'pond'), '地面寻路绕开水池');
    // 水池封死东侧缺口 → 无杀怪走廊
    const pondBase = createDefaultBase();
    pondBase.tiles[4][12].terrain = 'pond';
    pondBase.tiles[5][12].terrain = 'pond';
    pondBase.tiles[6][12].terrain = 'pond';
    assert(!hasKillCorridor(pondBase), '地形封死缺口后无杀怪走廊');

    // 夜战移动：地面僵尸在水池南侧横移绕行，不踏进水池（先移除边缘废墟，模拟坍塌后）
    const night = new NightSystem();
    const mv = createInitialGameState();
    mv.base.buildings = mv.base.buildings.filter(b => b.cfgId !== RUIN_ID);
    const mb = night.startBattle(mv);
    mb.status = 'fighting';
    mb.wave = 1;
    mb.zombies.push({ uid: 9981, cfgId: 1, hp: 60, maxHp: 60, level: 1, attack: 3, row: 12, col: 6, moveCd: 0, attackCd: 1e9, slowUntil: 0 });
    night.tick(mv, mb, 100);
    const mz = mb.zombies[0];
    assert(mz.row === 12 && (mz.col === 5 || mz.col === 7), '地面僵尸绕开水池横移');
    // 钻地僵尸不能穿水池：在 (12,6) 潜行时三个近核心方向全是水池 → 原地不动
    const bstate = createInitialGameState();
    const bbattle = night.startBattle(bstate);
    bbattle.status = 'fighting';
    bbattle.wave = 1;
    bbattle.zombies.push({ uid: 9983, cfgId: 8, hp: 90, maxHp: 90, level: 1, attack: 12, row: 12, col: 6, moveCd: 0, attackCd: 1e9, slowUntil: 0, burrowed: true });
    night.tick(bstate, bbattle, 100);
    assert(bbattle.zombies[0].row === 12 && bbattle.zombies[0].col === 6, '钻地僵尸不能穿水池，原地待命');

    // 旧存档兼容：tiles 无 terrain 字段时按平地处理，走廊正常
    const legacy = createDefaultBase();
    legacy.tiles.forEach(rowArr => rowArr.forEach(t => delete t.terrain));
    assert(hasKillCorridor(legacy) && terrainAt(legacy, 1, 2) === null, '旧存档无地形字段按平地处理');
  }

  // --- 地面路线：绕开建筑时使用四方向最短路 ---
  {
    const state = createInitialGameState();
    state.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row: 4, col: 11 });
    const path = findPathToCore(state.base, { row: 4, col: 12 });
    assert(path?.[1].row === 5 && path[1].col === 12, 'BFS 绕开墙体选择四方向下一格');
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 9971, cfgId: 1, hp: 60, maxHp: 60, row: 4, col: 12, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state, battle, 100);
    assert(battle.zombies[0]?.row === 5 && battle.zombies[0]?.col === 12, '地面僵尸按路线移动而非斜向直冲');
  }

  // --- 塔职能：炮塔范围伤害 / 电磁塔递减跳链 ---
  {
    const cannonState = createInitialGameState();
    addFueledGenerator(cannonState);
    cannonState.base.buildings.push({ cfgId: 102, level: 1, hp: 300, maxHp: 300, row: 5, col: 6 });
    const cannonBattle = night.startBattle(cannonState);
    cannonBattle.status = 'fighting';
    cannonBattle.wave = 1;
    cannonBattle.zombies.push(
      { uid: 9972, cfgId: 1, hp: 100, maxHp: 100, row: 6, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 },
      { uid: 9973, cfgId: 1, hp: 100, maxHp: 100, row: 7, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 }
    );
    night.tick(cannonState, cannonBattle, 100);
    assert(cannonBattle.zombies.every(z => z.hp === 50), '炮塔命中点 1 格范围同时受伤（攻 50 溅射）');

    const arcState = createInitialGameState();
    addFueledGenerator(arcState);
    arcState.base.buildings.push({ cfgId: 103, level: 1, hp: 200, maxHp: 200, row: 6, col: 5 });
    const arcBattle = night.startBattle(arcState);
    arcBattle.status = 'fighting';
    arcBattle.wave = 1;
    arcBattle.zombies.push(
      { uid: 9974, cfgId: 1, hp: 100, maxHp: 100, row: 6, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 },
      { uid: 9975, cfgId: 1, hp: 100, maxHp: 100, row: 7, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 },
      { uid: 9976, cfgId: 1, hp: 100, maxHp: 100, row: 8, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 }
    );
    night.tick(arcState, arcBattle, 100);
    assert(arcBattle.zombies[0].hp === 60 && arcBattle.zombies[1].hp === 70 && arcBattle.zombies[2].hp === 78, '电磁塔跳链最多 5 个目标且伤害递减');
  }

  // --- 地雷触发 ---
  {
    const state = createInitialGameState();
    // 僵尸从 (6,8) 向核心走一步，落点必是 (5,7)/(6,7)/(7,7) 之一，全埋地雷
    for (const r of [5, 6, 7]) {
      state.base.buildings.push({ cfgId: 302, level: 1, hp: 10, maxHp: 10, row: r, col: 7 });
    }
    const battle: IBattle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 999, cfgId: 1, hp: 60, maxHp: 60, row: 6, col: 8, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state, battle, 100);
    assert(battle.zombies.length === 0, '僵尸踩地雷死亡');
    assert(state.base.buildings.filter(b => b.cfgId === 302).length === 2, '地雷触发后只消耗被踩那颗');
    // 普通僵尸 50% 掉落（0~1 份），坦克必掉 1 份低级材料
    assert(Object.keys(rollDrops(getZombieConfig(3)!)).length === 1, '坦克僵尸必掉 1 份低级材料');
  }

  // --- 减速沼泽磨损：每减速一只僵尸扣 1 耐久，耗尽即损毁 ---
  {
    const state = createInitialGameState();
    // 僵尸从 (6,8) 向核心走一步，落点必是 (5,7)/(6,7)/(7,7) 之一，全铺沼泽
    for (const r of [5, 6, 7]) {
      state.base.buildings.push({ cfgId: 303, level: 1, hp: 50, maxHp: 50, row: r, col: 7 });
    }
    const battle: IBattle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 998, cfgId: 1, hp: 60, maxHp: 60, row: 6, col: 8, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state, battle, 100);
    const hpTotal = state.base.buildings.filter(b => b.cfgId === 303).reduce((sum, b) => sum + b.hp, 0);
    assert(battle.zombies[0]?.slowUntil > 0 && hpTotal === 149, '沼泽减速僵尸并磨损 1 点耐久');
    assert(state.base.buildings.filter(b => b.cfgId === 303).length === 3, '沼泽磨损不殃及未踩的格子');

    // 耐久耗尽可能被踩毁
    const state2 = createInitialGameState();
    for (const r of [5, 6, 7]) {
      state2.base.buildings.push({ cfgId: 303, level: 1, hp: 1, maxHp: 50, row: r, col: 7 });
    }
    const battle2: IBattle = night.startBattle(state2);
    battle2.status = 'fighting';
    battle2.wave = 1;
    battle2.zombies.push({ uid: 997, cfgId: 1, hp: 60, maxHp: 60, row: 6, col: 8, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state2, battle2, 100);
    assert(state2.base.buildings.filter(b => b.cfgId === 303).length === 2 && battle2.zombies[0]?.slowUntil > 0, '沼泽耐久耗尽即损毁，最后一只仍被减速');

    // 损毁前可用金币修复（造价 250，损坏 49/50 → 修复费 123）
    const repairState = createInitialGameState();
    repairState.base.buildings.push({ cfgId: 303, level: 1, hp: 1, maxHp: 50, row: 6, col: 7 });
    repairState.resources.coin = 200;
    const baseSys = new BaseSystem(new EconomySystem());
    const repaired = baseSys.repair(repairState, 6, 7);
    assert(repaired && repairState.base.buildings.find(b => b.cfgId === 303)?.hp === 50 && repairState.resources.coin === 200 - 123, '沼泽可用金币修复回满耐久');
  }

  // --- 夜战掉落池上限：一晚普通掉落最多 10 件，精英/Boss 保底不占额度 ---
  {
    const state = createInitialGameState();
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    // 15 只坦克（每只必掉 1 份）+ 1 只精英（保底 1003 + 池子 1~2 份）同夜死亡
    for (let i = 0; i < 15; i++) {
      battle.zombies.push({ uid: 2000 + i, cfgId: 3, hp: 0, maxHp: 100, row: 0, col: 6, moveCd: 0, attackCd: 0, slowUntil: 0 });
    }
    battle.zombies.push({ uid: 2999, cfgId: 5, hp: 0, maxHp: 100, row: 0, col: 6, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state, battle, 100);
    const poolTotal = Object.entries(battle.pendingDrops)
      .filter(([id]) => Number(id) !== 1003 && Number(id) !== 1005 && Number(id) !== 60024)
      .reduce((s, [, n]) => s + (n || 0), 0);
    assert(poolTotal <= 10, '一晚普通掉落池出货不超过 10 件');
    assert(battle.pendingDrops[1003] === 1, '精英保底掉落不受上限影响');
    assert(battle.pendingDrops[60024] === 1, '精英核心材料保底不受上限影响');
  }

  // --- 合成核心光环：核心等级让发射器产出概率升一级 ---
  {
    const { economy, core } = makeSystems();
    const state = createInitialGameState();
    // 1 级核心：光环 5%
    assert(getCoreAuraChance(state) === 0.05, '1 级核心光环 5%');
    assert(applyCoreAura(state, 20001, () => 0.999).upgraded === false, '光环未命中不升级');
    // 升到 6 级：光环 30%
    core.ensure(state)!.level = 6;
    assert(getCoreAuraChance(state) === 0.30, '6 级核心光环 30%');
    // 命中且可再合成：20001 旧保温箱升一级；链顶 60031 不越级
    const hit = applyCoreAura(state, 20001, () => 0);
    assert(hit.upgraded && hit.id === 20002, '光环命中产出升一级');
    assert(applyCoreAura(state, 60031, () => 0).upgraded === false, '链顶命中也不越级');
    // 核心道具已退休：棋盘上的 60026~60031 只是废弃 id，不再可出售/可发射
    setItem(state.grid, 0, 0, createItemFromConfig(60026));
    assert(economy.sellItem(state, { row: 0, col: 0 }) === null, '退休核心道具不可出售');
    assert(getMergeNextId(60025) === 0, '核心残片已是链尾（不会再合出核心基座道具）');
  }

  // --- 合成权限门槛：钢铁/科技档物品需要核心等级 ---
  {
    const { merge, core } = makeSystems();
    // 分档映射：钢铁档/科技档/豁免
    assert(getItemTier(20041) === 1 && getItemTier(20030) === 1 && getItemTier(50001) === 1 && getItemTier(60007) === 1, '钢铁档分档');
    assert(getItemTier(20059) === 2 && getItemTier(20061) === 2 && getItemTier(60016) === 2, '科技档分档');
    assert(getItemTier(10001) === 0 && getItemTier(20011) === 0 && getItemTier(30048) === 0 && getItemTier(40011) === 0
      && getItemTier(50023) === 0 && getItemTier(60021) === 0 && getItemTier(60031) === 0 && getItemTier(70104) === 0
      && getItemTier(30055) === 0 && getItemTier(30066) === 0, '普通档与豁免分档（U盘终端链放开为普通档）');
    // 核心权限等级：Lv1=0 / Lv2=1 / Lv4=2
    const gstate = createInitialGameState();
    assert(getCoreTier(gstate) === 0, '1 级核心权限档 0');
    core.ensure(gstate)!.level = 2;
    assert(getCoreTier(gstate) === 1, '2 级核心权限档 1');
    // 门槛：钢铁档可合、科技档不可合；核心材料链自身不受限
    setItem(gstate.grid, 0, 0, createItemFromConfig(20041));
    setItem(gstate.grid, 0, 1, createItemFromConfig(20041));
    setItem(gstate.grid, 1, 0, createItemFromConfig(20059));
    setItem(gstate.grid, 1, 1, createItemFromConfig(20059));
    setItem(gstate.grid, 2, 0, createItemFromConfig(60024));
    setItem(gstate.grid, 2, 1, createItemFromConfig(60024));
    assert(merge.moveOrMerge(gstate, { row: 0, col: 0 }, { row: 0, col: 1 }).kind === 'merge', '2 级核心解锁钢铁档合成');
    assert(merge.moveOrMerge(gstate, { row: 1, col: 0 }, { row: 1, col: 1 }).kind === 'bounce', '科技档需要 4 级核心才能合成');
    assert(merge.moveOrMerge(gstate, { row: 2, col: 0 }, { row: 2, col: 1 }).kind === 'merge', '核心材料自身合成不受门槛限制');
    // 升到 4 级后科技档解锁
    core.ensure(gstate)!.level = 4;
    assert(getCoreTier(gstate) === 2, '4 级核心权限档 2');
    assert(merge.moveOrMerge(gstate, { row: 1, col: 0 }, { row: 1, col: 1 }).kind === 'merge', '4 级核心解锁科技档合成');
    // 1 级核心：钢铁档弹回
    const g0 = createInitialGameState();
    setItem(g0.grid, 0, 0, createItemFromConfig(20041));
    setItem(g0.grid, 0, 1, createItemFromConfig(20041));
    assert(merge.moveOrMerge(g0, { row: 0, col: 0 }, { row: 0, col: 1 }).kind === 'bounce', '1 级核心合成废铁被门槛弹回');
    // 订单候选过滤源码断言 + 核心面板接线断言
    const taskSystemSource = require('fs').readFileSync('src/core/systems/TaskSystem.ts', 'utf8');
    assert(taskSystemSource.includes('getItemTier(id) <= coreTier'), '订单候选按核心权限档过滤');
    const baseSceneSrc2 = require('fs').readFileSync('src/phaser/scenes/BaseScene.ts', 'utf8');
    assert(baseSceneSrc2.includes('CoreIntroPanel') && baseSceneSrc2.includes('openCorePanel') && baseSceneSrc2.includes('onCellLongPress'),
      '核心面板（长按开）已接入 BaseScene');
    // 新开局棋盘不再有钢铁/科技档物品（防开局卡手）
    const fresh2 = GameInitializer.initNewGame();
    assert(fresh2.grid.cells.flat().every(cell => !cell.item || getItemTier(cell.item.id) === 0), '初始棋盘全为普通档');
  }

  // --- 核心发射器：基地核心 = 发射器（库存/CD/产出池按等级） ---
  {
    const { core } = makeSystems();
    const CORE_EMIT: Record<number, { times: number; milo: number }> = {
      1: { times: 6, milo: 600 }, 2: { times: 8, milo: 540 }, 3: { times: 10, milo: 480 },
      4: { times: 12, milo: 420 }, 5: { times: 14, milo: 360 }, 6: { times: 16, milo: 300 },
    };
    for (const [lvStr, cfg] of Object.entries(CORE_EMIT)) {
      const lv = Number(lvStr);
      assert(getCoreTimesAt(lv) === cfg.times && getCoreCdSecondsAt(lv) === cfg.milo, `核心 Lv${lv} 库存/CD 符合设计`);
      assert(getCoreProductsAt(lv).length > 0, `核心 Lv${lv} 产出池非空`);
      assert(getProp(getCorePropId(lv))?.noPower === 0, `核心 Lv${lv} 发射耗体力`);
    }
    // 产出池逐级解锁：1 级 4 种（第一排链首），逐级 +2，5 级解锁钢铁档链首，6 级解锁科技档链首 + L2 材料
    const L1_STEEL = [20030, 20065, 50001, 50011, 50017];
    const L2_IDS = [10002, 20002, 30002, 40002, 40012, 40028];
    const poolIds = (lv: number) => getCoreProductsAt(lv).map(p => p.id);
    assert(poolIds(1).join(',') === '10001,20001,40011,40027', 'Lv1 池=4 种普通档链首（第一排）');
    assert(poolIds(1).every(i => getItemTier(i) === 0), 'Lv1 池全为普通档');
    assert(poolIds(2).join(',') === '10001,20001,40011,40027,40001,30001', 'Lv2 池 +2（破花盆/旧车轮）');
    assert(poolIds(3).join(',') === '10001,20001,40011,40027,40001,30001,30008,40039', 'Lv3 池 +2（储物篮/藤蔓绳）');
    assert(poolIds(4).join(',') === '10001,20001,40011,40027,40001,30001,30008,40039,30019,30049', 'Lv4 池 +2（钥匙/遗失的眼镜）');
    assert(poolIds(5).length === 15 && L1_STEEL.every(i => poolIds(5).includes(i)) && !poolIds(5).includes(20059), 'Lv5 池解锁钢铁档链首，不含科技档');
    assert(poolIds(6).length === 22 && poolIds(6).includes(20059) && L2_IDS.every(i => poolIds(6).includes(i)), 'Lv6 池含科技档链首与 L2 材料');
    assert(!L2_IDS.some(i => poolIds(5).includes(i)), 'Lv5 及以前不出 L2 材料');

    // 功能：点击核心耗 1 体力、库存 -1、产出池内物品（核心自身光环可能把产物升一级，属正常行为）
    const st = createInitialGameState();
    st.resources.power = 10;
    st.coreClickCount = 2; // 跳过新手引导指定产出
    const c = core.ensure(st)!;
    const r = core.clickSpawn(st);
    const basePool = poolIds(1);
    const poolOrUpgraded = new Set([...basePool, ...basePool.map(i => getProp(i)!.blessId)]);
    assert(r.success && r.productId !== undefined && poolOrUpgraded.has(r.productId), '核心点击发射成功且产物在池内');
    assert(st.resources.power === 9, '核心发射耗 1 体力');
    assert(c.times === 5, '核心发射库存 -1');
    assert(c.cd !== undefined && c.cd > Date.now(), '核心发射累加 cd');
    // 点干库存 → 进入冷却（cdSum>0），冷却中不可发射
    while ((c.times ?? 0) > 0) core.clickSpawn(st);
    assert((c.cdSum ?? 0) > 0, '库存耗尽进入冷却');
    const cdBlocked = core.clickSpawn(st);
    assert(!cdBlocked.success, '冷却中核心不可发射');
    // 冷却到期 → 库存回满（tick）
    c.cd = Date.now() - 1;
    core.tick(st);
    assert((c.times ?? 0) === getCoreTimesAt(1) && (c.cdSum ?? 0) === 0, '冷却到期库存回满');
    // 体力不足 → 不发射
    st.resources.power = 0;
    c.cd = undefined;
    assert(!core.clickSpawn(st).success, '体力不足核心不发射');
    // 棋盘无空位 → 不发射
    st.resources.power = 10;
    const full = createInitialGameState();
    for (let rr = 0; rr < 13; rr++) for (let cc = 0; cc < 13; cc++) {
      if (canHostItem(full, rr, cc)) setItem(full.grid, rr, cc, createItemFromConfig(10001));
    }
    const fullCore = core.ensure(full)!;
    const fullBefore = fullCore.times!;
    assert(!core.clickSpawn(full).success && fullCore.times === fullBefore, '棋盘无空位时核心不发射且不扣库存');
    // 夜战掉落池不再含链首材料（发射器材料统一由核心产出）
    const HEADS = new Set([20001, 30001, 40011, 40027, 30019]);
    for (const z of getAllZombieConfigs()) {
      assert(!z.dropPool.some(i => HEADS.has(i)), `僵尸 ${z.name} 掉落池不含链首材料`);
    }
    // 订单候选：核心产出不作种子——只有棋盘上真有对应发射器，该链物品才进订单
    {
      const { task } = makeSystems();
      const onlyCore = createInitialGameState();
      const reachableCore = task.collectReachableIds(onlyCore);
      assert(!reachableCore.includes(20011) && !reachableCore.includes(10012) && !reachableCore.includes(40012),
        '仅核心在场时订单候选不含任何链产物');
      // 放上真正的冷藏箱发射器后，其产出链才可达
      setItem(onlyCore.grid, 2, 2, createItemFromConfig(20004));
      const reachableWithSpawner = task.collectReachableIds(onlyCore);
      assert(reachableWithSpawner.includes(20011), '冷藏箱发射器在场后净水链进订单候选');
      assert(!reachableWithSpawner.includes(10012), '无工具箱发射器时维修工具链仍不可达');
    }
  }

  // --- 核心升级：消耗夜战掉落的 60024/60025（当量 1/2），材料来自棋盘与背包 ---
  {
    const { core } = makeSystems();
    const st = createInitialGameState();
    const c = core.ensure(st)!;
    assert(c.level === 1, '新开局核心 1 级');
    assert(getCoreUpgradeCost(1) === 8 && getCoreUpgradeCost(6) === 0, '升级消耗 8 当量起、满级为 0');
    assert(isCoreMaterial(60024) && isCoreMaterial(60025) && !isCoreMaterial(60026), '核心材料判定（60024/60025）');
    // 材料不足 → 失败
    setItem(st.grid, 0, 0, createItemFromConfig(60024));
    assert(core.materialValue(st) === 1, '材料当量统计 60024=1');
    assert(!core.upgrade(st), '材料不足不能升级');
    assert(c.level === 1, '失败不涨等级');
    // 补足 8 当量（1 张残片=2、其余零件）→ 成功并清空材料
    setItem(st.grid, 0, 1, createItemFromConfig(60025));
    for (let i = 0; i < 5; i++) setItem(st.grid, 1, i, createItemFromConfig(60024));
    assert(core.materialValue(st) === 8, '材料当量统计 8');
    assert(core.upgrade(st), '材料足够升级成功');
    assert(c.level === 2, '升级后 2 级');
    assert(core.materialValue(st) === 0, '升级扣除全部材料');
    assert(c.times === getCoreTimesAt(2), '升级顺带回满库存');
    assert(getCoreTier(st) === 1 && getCoreAuraChance(st) === 0.10, '升级立刻生效（档次/光环）');
    // 背包里的材料也能扣
    const bagState = createInitialGameState();
    const bagCore = core.ensure(bagState)!;
    for (let i = 0; i < 4; i++) setItem(bagState.grid, 3, i, createItemFromConfig(60025)); // 4×2=8
    const bagItem = createItemFromConfig(401);
    bagItem.roomArr = new Array(6).fill(null);
    setItem(bagState.grid, 5, 5, bagItem);
    // 把材料塞进背包
    for (let i = 0; i < 4; i++) {
      setItem(bagState.grid, 3, i, null);
      bagItem.roomArr![i] = createItemFromConfig(60025);
    }
    assert(core.materialValue(bagState) === 8, '背包内材料计入当量');
    assert(core.upgrade(bagState), '背包材料也能升级');
    assert(bagCore.level === 2 && (bagItem.roomArr ?? []).every(it => !it), '升级后背包材料被扣光');
    // 满级不可升
    bagCore.level = CORE_LEVEL_MAX;
    assert(core.isMaxLevel(bagState) && !core.upgrade(bagState), '满级不可再升级');
    // 核心 CD 钻石跳过（有 cd 才能跳）
    const skipState = createInitialGameState();
    const skipCore = core.ensure(skipState)!;
    skipCore.times = 0;
    skipCore.cd = Date.now() + 600000;
    skipCore.cdSum = 600000;
    skipState.resources.diamond = 1000;
    assert(core.skipCd(skipState), '钻石跳过核心冷却');
    assert(skipState.resources.diamond < 1000, '跳过冷却扣钻石');
  }

  // --- 城墙阻挡：僵尸停下拆墙（坦克 demolish 1 可拆木墙 sturdy 1） ---
  {
    const state = createInitialGameState();
    for (let row = 0; row < 13; row++) state.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row, col: 7 });
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 998, cfgId: 3, hp: 220, maxHp: 220, row: 6, col: 8, moveCd: 0, attackCd: 0, slowUntil: 0 }); // 坦克僵尸
    night.tick(state, battle, 100);
    assert(state.base.buildings.some(b => b.cfgId === 401 && b.hp < 150), '僵尸攻击挡路城墙');
    assert(battle.zombies[0]?.row === 6 && battle.zombies[0]?.col === 8, '僵尸被墙挡在原地');
  }

  // --- 核心材料每晚封顶 2 个：多只精英 + Boss 同夜死亡也只掉 2 个 60024 ---
  {
    const state = createInitialGameState();
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    for (let i = 0; i < 3; i++) {
      battle.zombies.push({ uid: 960 + i, cfgId: 5, hp: 0, maxHp: 1, row: 0, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 }); // 精英×3
    }
    battle.zombies.push({ uid: 970, cfgId: 6, hp: 0, maxHp: 1, row: 1, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 }); // Boss（保底 ×2）
    night.tick(state, battle, 100);
    assert((battle.pendingDrops[60024] ?? 0) === 2, `核心材料每晚最多掉 2 个（实际 ${battle.pendingDrops[60024]}）`);
    assert((battle.pendingDrops[1003] ?? 0) === 3 && (battle.pendingDrops[1005] ?? 0) === 1, '手提包保底不受核心材料上限影响');
  }

  // --- 出兵按批：第 1~4 天每批 5 只（700ms），第 5 天起每批 10 只（250ms） ---
  {
    // 清掉废墟张开全部边缘格，排除开口数对批次的影响
    const state = createInitialGameState();
    state.day = 1;
    state.base.buildings = state.base.buildings.filter(b => b.cfgId !== RUIN_ID);
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.spawnQueue = genWaveZombies(1, 1, 3);
    night.tick(state, battle, 800);
    assert(battle.zombies.length === 5, `第 1 天每批出兵 5 只（实际 ${battle.zombies.length}）`);
    const state5 = createInitialGameState();
    state5.day = 5;
    state5.base.buildings = state5.base.buildings.filter(b => b.cfgId !== RUIN_ID);
    const battle5 = night.startBattle(state5);
    battle5.status = 'fighting';
    battle5.spawnQueue = genWaveZombies(5, 1, 3);
    night.tick(state5, battle5, 300);
    assert(battle5.zombies.length === 10, `第 5 天起每批出兵 10 只（实际 ${battle5.zombies.length}）`);
  }

  // --- 飞行僵尸：无视城墙（只被核心阻挡），可被塔攻击 ---
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    for (let row = 0; row < 13; row++) state.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row, col: 7 });
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 0, col: 0 }); // 箭塔
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 996, cfgId: 7, hp: 45, maxHp: 45, row: 6, col: 8, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state, battle, 100);
    const wall = state.base.buildings.find(b => b.cfgId === 401);
    assert(wall !== undefined && wall.hp === 150, '飞行僵尸无视城墙');
    const fly = battle.zombies[0];
    assert(fly !== undefined && (fly.row !== 6 || fly.col !== 8), '飞行僵尸飞过城墙继续逼近');

    // 雷达覆盖后，箭塔才能攻击飞行僵尸（14 攻 - 0 防 = 14 伤）。
    const state2 = createInitialGameState();
    addFueledGenerator(state2);
    state2.base.buildings.push({ cfgId: 209, level: 1, hp: 160, maxHp: 160, row: 0, col: 2 });
    state2.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 0, col: 0 });
    const battle2 = night.startBattle(state2);
    battle2.status = 'fighting';
    battle2.wave = 1;
    battle2.zombies.push({ uid: 993, cfgId: 7, hp: 45, maxHp: 45, row: 0, col: 3, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
    night.tick(state2, battle2, 100);
    assert(battle2.zombies[0]?.hp === 45 - 14, '雷达覆盖后箭塔可攻击飞行僵尸');
  }

  // --- 战斗特效事件：塔开火弹道 / 僵尸爪击 / 僵尸死亡爆灭 ---
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 0, col: 0 }); // 箭塔
    for (let row = 0; row < 13; row++) state.base.buildings.push({ cfgId: 401, level: 1, hp: 150, maxHp: 150, row, col: 7 });
    const fires: { cfgId: number; fromRow: number; fromCol: number; damage?: number }[] = [];
    const attacks: { toRow: number; toCol: number }[] = [];
    const dies: { row: number; col: number }[] = [];
    const offFire = eventBus.on(GameEvents.NIGHT_TOWER_FIRE, (d: { cfgId: number; fromRow: number; fromCol: number; damage?: number }) => fires.push(d));
    const offAttack = eventBus.on(GameEvents.NIGHT_ZOMBIE_ATTACK, (d: { toRow: number; toCol: number }) => attacks.push(d));
    const offDie = eventBus.on(GameEvents.NIGHT_ZOMBIE_DIE, (d: { row: number; col: number }) => dies.push(d));
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    // 箭塔射程内的残血僵尸（一发打死 → 弹道 + 爆灭事件）+ 木墙前的坦克僵尸（拆墙 → 爪击事件）
    battle.zombies.push({ uid: 990, cfgId: 1, hp: 5, maxHp: 60, row: 0, col: 3, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
    battle.zombies.push({ uid: 991, cfgId: 3, hp: 220, maxHp: 220, row: 6, col: 8, moveCd: 0, attackCd: 0, slowUntil: 0 });
    night.tick(state, battle, 100);
    offFire();
    offAttack();
    offDie();
    assert(fires.length === 1 && fires[0].fromRow === 0 && fires[0].fromCol === 0 && fires[0].cfgId === 101, '塔开火发出弹道事件');
    assert(fires[0].damage === 14, '弹道事件带伤害值（箭塔 14 攻 - 0 防）');
    assert(attacks.length === 1 && attacks[0].toCol === 7 && attacks[0].toRow >= 5 && attacks[0].toRow <= 7, '僵尸攻击建筑发出爪击事件');
    assert(dies.length === 1 && dies[0].row === 0 && dies[0].col === 3, '僵尸死亡发出爆灭事件');
  }

  // --- 真实第 1 晚验收：仅 1 座箭塔（合法外圈位）可守住 15 只 Lv1 僵尸，核心不掉血 ---
  {
    const state = createInitialGameState();
    addFueledGenerator(state); // 发电机供电，箭塔通电
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 6, col: 9 });
    const battle = night.startBattle(state);
    let steps = 0;
    while (battle.status !== 'won' && battle.status !== 'lost' && steps < 6000) {
      night.tick(state, battle, 100);
      steps++;
    }
    assert(battle.status === 'won', `第 1 晚仅 1 座箭塔可守住（${steps} 步）`);
    const core = state.base.buildings.find(b => b.cfgId === 1)!;
    assert(core.hp === core.maxHp, '第 1 晚核心不掉血');
    assert(battle.zombies.length === 0, '第 1 晚全歼僵尸');
  }

  // --- 回归：用棋子把核心围死，夜战也必须能打完（改前会永远卡在 fighting：僵尸既走不动也拆不了东西） ---
  {
    const state = createInitialGameState();
    const core = state.base.buildings.find(b => b.cfgId === 1)!;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if ((dr === 0 && dc === 0) || Math.abs(dr) + Math.abs(dc) > 2) continue;
        const r = core.row + dr;
        const c = core.col + dc;
        if (r < 0 || r >= 13 || c < 0 || c >= 13) continue;
        setItem(state.grid, r, c, createItemFromConfig(10001));
      }
    }
    const battle = night.startBattle(state);
    let steps = 0;
    while (battle.status !== 'won' && battle.status !== 'lost' && steps < 6000) {
      night.tick(state, battle, 100);
      steps++;
    }
    assert(battle.status === 'won' || battle.status === 'lost',
      `核心被棋子围死也能打完夜战（${battle.status}, ${steps} 步）`);
    let crushed = 0;
    for (const row of state.grid.cells) for (const cell of row) if (cell.item?.crushed) crushed++;
    assert(crushed > 0, `被围死时僵尸会踩碎挡路棋子（踩碎 ${crushed} 个，之后不再挡路）`);
  }

  {
    const state = createInitialGameState();
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    // 占满所有开放边缘格（新开局仅东侧 3 格缺口）
    const open = getOpenEdgeCells(state.base);
    open.forEach((c, i) => battle.zombies.push({ uid: 800 + i, cfgId: 1, hp: 30, maxHp: 30, row: c.row, col: c.col, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 }));
    battle.spawnQueue = [1, 1];
    battle.spawnCd = 0;
    night.tick(state, battle, 100);
    assert(battle.zombies.length === open.length && battle.spawnQueue.length === 2, '出生格占满时不生成新僵尸（队列保留）');
    assert(battle.spawnCd > 0, '占满时设置重试冷却');
    // 杀掉一只腾出空格 → 下一 tick 恢复生成
    battle.zombies.splice(0, 1);
    battle.spawnCd = 0;
    night.tick(state, battle, 100);
    assert(battle.zombies.length === open.length && battle.spawnQueue.length === 1, '腾出空格后恢复生成');

    // 无体积碰撞：路线的下一格有僵尸也可进入（同格堆叠，不排队）
    const state2 = createInitialGameState();
    const battle2 = night.startBattle(state2);
    battle2.status = 'fighting';
    battle2.wave = 1;
    battle2.spawnQueue = [];
    const start = { row: 4, col: 12 };
    const next = findPathToCore(state2.base, start)![1];
    battle2.zombies.push({ uid: 810, cfgId: 1, hp: 30, maxHp: 30, row: next.row, col: next.col, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
    battle2.zombies.push({ uid: 811, cfgId: 1, hp: 30, maxHp: 30, row: start.row, col: start.col, moveCd: 0, attackCd: 1e9, slowUntil: 0 });
    night.tick(state2, battle2, 100);
    const back = battle2.zombies.find(z => z.uid === 811)!;
    assert(back.row === next.row && back.col === next.col, '前方占位时僵尸仍可前进，同格堆叠');

    const fastState = createInitialGameState();
    const fastBattle = night.startBattle(fastState);
    fastBattle.status = 'fighting';
    fastBattle.wave = 1;
    fastBattle.spawnQueue = [];
    const fastStart = { row: 4, col: 12 };
    const fastNext = findPathToCore(fastState.base, fastStart)![1];
    fastBattle.zombies.push(
      { uid: 812, cfgId: 1, hp: 30, maxHp: 30, row: fastNext.row, col: fastNext.col, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 },
      { uid: 813, cfgId: 2, hp: 40, maxHp: 40, row: fastStart.row, col: fastStart.col, moveCd: 0, attackCd: 1e9, slowUntil: 0 }
    );
    night.tick(fastState, fastBattle, 100);
    const fast = fastBattle.zombies.find(z => z.uid === 813)!;
    assert(getZombieConfig(2)?.speed === 2.5 && fast.row === fastNext.row && fast.col === fastNext.col, '快速僵尸以 2.5 格/秒越过更慢的地面僵尸');
  }

  // --- 钻地僵尸：潜行不被塔索敌，距核心 ≤2 格钻出 ---
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 3, col: 6 });
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 995, cfgId: 8, hp: 90, maxHp: 90, row: 3, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0, burrowed: true });
    night.tick(state, battle, 100);
    assert(battle.zombies[0]?.hp === 90, '钻地潜行不被防御塔索敌');

    const z = battle.zombies[0]!;
    z.row = 4;
    z.col = 6;
    z.moveCd = 0;
    night.tick(state, battle, 100);
    assert(battle.zombies[0]?.burrowed === false, '钻地僵尸距核心≤2格钻出地面');
  }

  // --- 防御减免：坦克僵尸 3 防，箭塔 14 攻 → 每次掉 11 血 ---
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 0, col: 0 });
    const battle = night.startBattle(state);
    battle.status = 'fighting';
    battle.wave = 1;
    battle.zombies.push({ uid: 994, cfgId: 3, hp: 220, maxHp: 220, row: 0, col: 3, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
    night.tick(state, battle, 100);
    assert(battle.zombies[0]?.hp === 220 - 11, '防御减免（14攻-3防=11伤）');
  }

  // --- 有防御塔 → 胜利天亮 ---
  {
    const state = createInitialGameState();
    addFueledGenerator(state); // 电力充足，4 座塔全部通电
    // 核心周围 4 座满级电磁塔（直接注入，绕过摆放规则）
    for (const [r, c] of [[5, 5], [5, 7], [7, 5], [7, 7]] as const) {
      state.base.buildings.push({ cfgId: 103, level: 3, hp: 450, maxHp: 450, row: r, col: c });
    }
    state.resources.power = 30;
    const battle = night.startBattle(state);
    assert(state.phase === 'night' && battle.totalWaves === 3, '入夜后 phase=night');
    assert(state.resources.power === 30, '入夜保留白天剩余行动力');
    let steps = 0;
    while (battle.status !== 'won' && battle.status !== 'lost' && steps < 5000) {
      night.tick(state, battle, 100);
      steps++;
    }
    assert(battle.status === 'won', `防御塔守住第 1 天（${steps} 步）`);
    const core = state.base.buildings.find(b => b.cfgId === 1)!;
    assert(core.hp > 0, '核心未被摧毁');
    const totalDrops = Object.values(battle.pendingDrops).reduce((s, n) => s + (n || 0), 0);
    assert(totalDrops > 0, '夜晚战斗有掉落收益');
    const lootBefore = state.grid.cells.flat().filter(c => c.item).length + state.cardArr.length;
    night.endBattle(state, battle);
    assert(state.phase === 'day' && state.day === 2, '胜利进入第 2 天');
    assert(state.resources.power === 130, '胜利天亮后保留余量并固定奖励 100 行动力');
    const lootAfter = state.grid.cells.flat().filter(c => c.item).length + state.cardArr.length;
    assert(lootAfter === lootBefore + totalDrops, '战利品发到棋盘（满则进卡片）');
  }

  // --- 卡单救济接入天亮结算：死单 + 连续 2 天未完成 → 天亮额外掉低 2 级材料 ×2 ---
  {
    const state = createInitialGameState();
    addFueledGenerator(state);
    state.base.buildings.push({ cfgId: 103, level: 3, hp: 450, maxHp: 450, row: 5, col: 5 });
    state.day = 5;
    state.lastTaskCompleteDay = 3;
    state.tasks = [{ id: 776, propArr: [{ id: 30052, num: 1 }], starNum: 1 }];
    const battle = night.startBattle(state);
    battle.status = 'won';
    const before = state.grid.cells.flat().filter(c => c.item).length + state.cardArr.length;
    night.endBattle(state, battle);
    const gained = state.grid.cells.flat().filter(c => c.item).length + state.cardArr.length - before;
    assert(gained === 2 && state.lastTaskCompleteDay === 6, '卡单救济天亮额外掉 2 件材料并重置计时');
    const hasReliefItem = state.grid.cells.flat().some(c => c.item?.id === 30050) || state.cardArr.includes(30050);
    assert(hasReliefItem, '卡单救济物品为死单目标的低 2 级材料（30050 遮阳帽）');
  }

  // --- 拆迁等级：低级僵尸拆不动废墟/墙，高级逐级可拆；卡死 15 秒狂暴强拆 ---
  {
    // 僵尸放在 (6,12)，用一整列墙切断其到核心的所有四方向路线。
    const mkBlocked = (zombieCfgId: number, wallId: number) => {
      const st = createInitialGameState();
      const wcfg = getBuildingConfig(wallId)!;
      for (let row = 0; row < 13; row++) {
        st.base.buildings.push({ cfgId: wallId, level: 1, hp: wcfg.hp, maxHp: wcfg.hp, row, col: 11 });
      }
      const bt = night.startBattle(st);
      bt.status = 'fighting';
      bt.wave = 1;
      const zcfg = getZombieConfig(zombieCfgId)!;
      bt.zombies.push({ uid: 990, cfgId: zombieCfgId, hp: zcfg.hp, maxHp: zcfg.hp, row: 6, col: 12, moveCd: 0, attackCd: 0, slowUntil: 0 });
      const wallsTotal = () => st.base.buildings
        .filter(b => b.col === 11 && b.cfgId === wallId)
        .reduce((s, b) => s + b.hp, 0);
      return { st, bt, wallsTotal };
    };

    // 普通僵尸(demolish 0) 拆不动木墙(sturdy 1)；卡死 15 秒后狂暴强拆
    {
      const { st, bt, wallsTotal } = mkBlocked(1, 401);
      const before = wallsTotal();
      for (let i = 0; i < 30; i++) night.tick(st, bt, 100); // 3 秒
      assert(wallsTotal() === before && !bt.zombies[0]?.enraged, '普通僵尸拆不动木墙（3 秒内未狂暴）');
      for (let i = 0; i < 220; i++) night.tick(st, bt, 100); // 再 22 秒
      assert(bt.zombies[0]?.enraged === true, '普通僵尸卡死 15 秒后狂暴');
      assert(wallsTotal() < before, '狂暴后开始强拆木墙');
    }
    // 坦克僵尸(demolish 1) 能拆废墟/木墙，拆不动石墙(sturdy 2)
    {
      const { st, bt, wallsTotal } = mkBlocked(3, 901);
      const before = wallsTotal();
      for (let i = 0; i < 30; i++) night.tick(st, bt, 100);
      assert(wallsTotal() < before, '坦克僵尸能拆废墟');
      const s2 = mkBlocked(3, 402);
      for (let i = 0; i < 30; i++) night.tick(s2.st, s2.bt, 100);
      assert(s2.wallsTotal() === 300 * 13 && !s2.bt.zombies[0]?.enraged, '坦克僵尸拆不动石墙');
    }
    // 精英(demolish 2) 拆石墙、拆不动铁墙；Boss(demolish 3) 拆铁墙
    {
      const { st, bt, wallsTotal } = mkBlocked(5, 402);
      const before = wallsTotal();
      for (let i = 0; i < 30; i++) night.tick(st, bt, 100);
      assert(wallsTotal() < before, '精英僵尸能拆石墙');
      const s2 = mkBlocked(5, 403);
      for (let i = 0; i < 30; i++) night.tick(s2.st, s2.bt, 100);
      assert(s2.wallsTotal() === 500 * 13, '精英僵尸拆不动铁墙');
      const s3 = mkBlocked(6, 403);
      const bossBefore = s3.wallsTotal();
      for (let i = 0; i < 30; i++) night.tick(s3.st, s3.bt, 100);
      assert(s3.wallsTotal() < bossBefore, 'Boss 僵尸能拆铁墙');
    }
  }

  // --- 行动力：守夜胜利固定奖励 100；每 5 分钟自然恢复 1 点 ---
  {
    const economy = new EconomySystem();
    const state = createInitialGameState();
    state.roleLv = 6;
    assert(getPowerMax(state) === 105, 'Lv6 行动力上限 = 100 + 5');
    state.resources.power = 10;
    const b = night.startBattle(state);
    assert(state.resources.power === 10, '入夜保留白天剩余行动力');
    b.status = 'won';
    night.endBattle(state, b);
    assert(state.resources.power === 110, '守夜胜利后保留白天余量，并固定奖励 100 行动力');

    const lossBattle = night.startBattle(state);
    lossBattle.status = 'lost';
    night.endBattle(state, lossBattle);
    assert(state.resources.power === 105, '守夜失败后仍按上限回满行动力');

    state.resources.power = 50;
    state.powerRecoverAt = 1_000;
    economy.recoverPower(state, 1_000 + 5 * 60 * 1000);
    assert(state.resources.power === 51, '每 5 分钟自然恢复 1 点行动力');
    economy.recoverPower(state, 1_000 + 15 * 60 * 1000);
    assert(state.resources.power === 53, '自然恢复按完整的 5 分钟累计结算');

    state.resources.power = 104;
    state.powerRecoverAt = 1_000;
    economy.recoverPower(state, 1_000 + 10 * 60 * 1000);
    assert(state.resources.power === 105, '自然恢复不超过行动力上限');

    const oldSave = createInitialGameState();
    oldSave.resources.power = 50;
    oldSave.timestamp = 1_000;
    delete oldSave.powerRecoverAt;
    economy.recoverPower(oldSave, 1_000 + 10 * 60 * 1000);
    assert(oldSave.resources.power === 52, '旧存档缺恢复时间时按保存时间补算离线行动力');
  }

  // --- 无防御 → 失败核心半血 ---
  {
    const state = createInitialGameState();
    const battle = night.startBattle(state);
    let steps = 0;
    while (battle.status !== 'lost' && steps < 5000) {
      night.tick(state, battle, 100);
      steps++;
    }
    assert(battle.status === 'lost', `无防御核心被摧毁（${steps} 步）`);
    night.endBattle(state, battle);
    const core = state.base.buildings.find(b => b.cfgId === 1)!;
    assert(state.phase === 'day' && state.day === 1, '失败天数不变');
    assert(core.hp === 500, '失败后核心修复至 50%');
  }

  // --- 废墟：新开局三边整排 + 东边部分围住，第一夜只从东边 3 格缺口刷怪 ---
  {
    const state = createInitialGameState();
    const ruins = state.base.buildings.filter(b => b.cfgId === RUIN_ID);
    assert(ruins.length === 13 * 3 + 8, '新开局北/西/南三边整排废墟 + 东边 8 格部分废墟（47 格）');
    // 东边缺口：只留正对核心的中段 3 格（rows 4-6）无废墟
    const eastRuinRows = ruins.filter(b => b.col === state.base.cols - 1 && b.row > 0 && b.row < state.base.rows - 1).map(b => b.row);
    assert(eastRuinRows.length === 8 && !eastRuinRows.some(r => r >= 4 && r <= 6), '东边只留中段 3 格缺口');
    assert(!getBuildableList().some(b => b.kind === 'ruin'), '废墟不出现在建造列表');

    // 第一夜：记录每只僵尸首次出现的位置，全部应在东边缺口附近
    const battle = night.startBattle(state);
    const firstSeen = new Map<number, { row: number; col: number }>();
    let steps = 0;
    while (battle.wave < 1 && steps++ < 200) night.tick(state, battle, 100); // 等到第 1 波开始
    assert(battle.wave === 1, '第 1 波开始');
    let guard = 0;
    while (battle.spawnQueue.length > 0 && guard++ < 500) {
      night.tick(state, battle, 100);
      for (const z of battle.zombies) {
        if (!firstSeen.has(z.uid)) firstSeen.set(z.uid, { row: z.row, col: z.col });
      }
    }
    assert(firstSeen.size > 0, '第 1 波刷出僵尸');
    const allEast = [...firstSeen.values()].every(p => p.col >= state.base.cols - 2);
    assert(allEast, '第一夜僵尸只从东边缺口进攻');
  }

  // --- 废墟坍塌：每守完一夜塌一边（北→西→南→东），第 5 天起四边全开 ---
  {
    const state = createInitialGameState();
    const winOnce = () => {
      const b = night.startBattle(state);
      b.status = 'won';
      night.endBattle(state, b);
    };
    winOnce(); // 守完第 1 天 → 塌北边
    assert(state.day === 2, '守完第 1 天进入第 2 天');
    assert(!state.base.buildings.some(b => b.cfgId === RUIN_ID && b.row === 0), '第 1 夜后北侧废墟塌光');
    assert(state.base.buildings.some(b => b.cfgId === RUIN_ID && b.col === 0), '西侧废墟仍在');
    winOnce(); // 守完第 2 天 → 塌西边
    assert(!state.base.buildings.some(b => b.cfgId === RUIN_ID && b.col === 0), '第 2 夜后西侧废墟塌光');
    winOnce(); // 守完第 3 天 → 塌南边
    assert(!state.base.buildings.some(b => b.cfgId === RUIN_ID && b.row === state.base.rows - 1), '第 3 夜后南侧废墟塌光');
    assert(state.base.buildings.some(b => b.cfgId === RUIN_ID && b.col === state.base.cols - 1), '第 3 夜后东侧废墟仍在');
    winOnce(); // 守完第 4 天 → 塌东边
    assert(!state.base.buildings.some(b => b.cfgId === RUIN_ID), '第 4 夜后废墟全部塌光（四边全开）');
    winOnce(); // 第 5 天起无废墟可塌，不报错
    assert(state.day === 6, '第 5 夜后正常推进天数');
  }
}

// ============ 15. 英雄系统 ============
console.log('== 英雄系统 ==');
{
  const heroSys = new HeroSystem();
  const night = new NightSystem();

  // --- 英雄配置表 ---
  assert(getHeroConfig('laoqiang')?.attack === 12 && getHeroConfig('laoqiang')?.range === 4, '老枪配置：12 攻 4 程');
  assert(getHeroConfig('xiaoman')?.speed === 1.0 && getHeroConfig('nobody') === undefined, '英雄配置查询/未知 key 返回 undefined');

  // --- 剧情入队：joinHero beat 播完入队，重复结算不重复入队 ---
  {
    const story = new StorySystem();
    const state = createInitialGameState();
    const joined: string[] = [];
    const offJoin = eventBus.on(GameEvents.HERO_JOINED, (d: { key: string }) => joined.push(d.key));
    story.checkBuilding(state, 203); // 建成发电机 → beat 4（小满加入）+ beat 19（迎战引导）
    story.beatDone(state); // 播完 beat 4 → 小满入队
    assert(state.heroes.length === 1 && state.heroes[0].key === 'xiaoman' && state.heroes[0].row === -1, 'joinHero beat 播完入队（未部署）');
    assert(joined.length === 1 && joined[0] === 'xiaoman', '入队发出 HERO_JOINED 事件');
    story.beatDone(state); // 播完 beat 19
    // 重复结算（剧情回顾重播同一 beat）：不重复入队、不重发事件
    const beat4 = STORY_BEATS.find(b => b.id === 4)!;
    story.replay(beat4);
    story.beatDone(state);
    assert(state.heroes.length === 1 && joined.length === 1, '重复结算不重复入队');
    offJoin();
  }

  // --- 部署规则：内圈空格可，外圈/有建筑/有英雄/未加入/重复部署均不可；撤回后可重新部署 ---
  {
    const state = createInitialGameState();
    state.heroes.push({ key: 'laoqiang', row: -1, col: -1 }, { key: 'douzi', row: -1, col: -1 });
    assert(heroSys.canDeployAt(state, 5, 5).ok, '内圈空格可部署');
    assert(!heroSys.canDeployAt(state, 6, 11).ok, '外圈不可部署');
    assert(!heroSys.canDeployAt(state, 6, 6).ok, '核心格不可部署');
    state.base.buildings.push({ cfgId: 202, level: 1, hp: 150, maxHp: 150, row: 5, col: 6 }); // 医疗站
    assert(!heroSys.canDeployAt(state, 5, 6).ok, '有建筑格不可部署');
    assert(heroSys.deploy(state, 'laoqiang', 5, 5), '部署老枪成功');
    assert(state.heroes[0].row === 5 && state.heroes[0].col === 5, '部署写入坐标');
    assert(!heroSys.canDeployAt(state, 5, 5).ok, '有英雄格不可再部署');
    assert(!heroSys.deploy(state, 'laoqiang', 5, 4), '同一英雄不可重复部署');
    assert(!heroSys.deploy(state, 'doctor', 5, 4), '未加入的英雄不可部署');
    assert(heroSys.deploy(state, 'douzi', 5, 4), '另一英雄可部署邻格');
    assert(heroSys.getJoined(state).length === 2 && heroSys.getDeployed(state).length === 2, 'getJoined/getDeployed 查询');
    assert(heroSys.getHeroAt(state, 5, 5)?.key === 'laoqiang' && heroSys.getHeroAt(state, 5, 6) === undefined, 'getHeroAt 查询');
    assert(heroSys.undeploy(state, 'laoqiang'), '撤回老枪');
    assert(state.heroes[0].row === -1 && state.heroes[0].col === -1, '撤回后回到未部署');
    assert(heroSys.deploy(state, 'laoqiang', 6, 5), '撤回后可重新部署');
  }

  // --- tickHeroes：开火事件带伤害（攻-防）、冷却期内不连发、潜行钻地不索敌 ---
  // --- Hero injury: daytime recovery and critical deployment lock ---
  {
    const state = createInitialGameState();
    state.heroes.push({ key: 'laoqiang', row: -1, col: -1 });
    const hero = state.heroes[0] as typeof state.heroes[number] & { hp?: number; maxHp?: number; recoveryDays?: number };
    hero.hp = 50;
    hero.maxHp = 100;
    heroSys.recoverForNewDay(state);
    assert(hero.hp === 70, 'injured hero recovers 20% max HP each day');
    hero.hp = 0;
    hero.recoveryDays = 7;
    assert(!heroSys.deploy(state, hero.key, 5, 5), 'critical hero cannot deploy');
  }

  {
    const state = createInitialGameState();
    state.heroes.push({ key: 'laoqiang', row: 6, col: 5 });
    state.heroes.push({ key: 'xiaoman', row: -1, col: -1 }); // 未部署不上场
    const fires: { heroKey: string; fromRow: number; fromCol: number; toRow: number; toCol: number; damage: number }[] = [];
    const offFire = eventBus.on(GameEvents.NIGHT_HERO_FIRE, (d: { heroKey: string; fromRow: number; fromCol: number; toRow: number; toCol: number; damage: number }) => fires.push(d));
    const battle = night.startBattle(state);
    assert(battle.heroCds !== undefined, 'startBattle 初始化英雄冷却表');
    battle.status = 'fighting';
    battle.wave = 1;
    // 坦克僵尸（3 防）在老枪（12 攻 4 程）射程内
    battle.zombies.push({ uid: 700, cfgId: 3, hp: 220, maxHp: 220, row: 6, col: 8, moveCd: 1e9, attackCd: 1e9, slowUntil: 0 });
    night.tick(state, battle, 100);
    assert(fires.length === 1 && fires[0].heroKey === 'laoqiang' && fires[0].fromRow === 6 && fires[0].fromCol === 5, '英雄开火发出弹道事件');
    assert(fires[0].toRow === 6 && fires[0].toCol === 8 && fires[0].damage === 12 - 3, '英雄伤害=攻-防（12攻-3防=9）');
    assert(battle.zombies[0].hp === 220 - 9, '英雄攻击扣僵尸血');
    night.tick(state, battle, 100); // 老枪冷却 1250ms，100ms 内不再开火
    assert(fires.length === 1, '冷却期内不连发');
    // 潜行钻地不索敌：坦克挪出射程，换一只潜行钻地在射程内
    battle.zombies[0].row = 0;
    battle.zombies[0].col = 0;
    battle.zombies.push({ uid: 701, cfgId: 8, hp: 90, maxHp: 90, row: 6, col: 7, moveCd: 1e9, attackCd: 1e9, slowUntil: 0, burrowed: true });
    battle.heroCds['6,5'] = 0; // 清掉冷却，专门验证索敌跳过
    night.tick(state, battle, 100);
    assert(fires.length === 1, '钻地潜行不被英雄索敌');
    offFire();
  }

  // --- 旧存档兜底：无 heroes 字段经 loadState 补空数组 ---
  {
    const enUI = getLocaleData('en').ui;
    const zhCNUI = getLocaleData('zh-CN').ui;
    try {
      setLanguage('en');
      assert(getText('settings.title') === 'Settings', 'English settings title');
      setLanguage('zh-CN');
      assert(getText('settings.title') === '设置', 'Chinese settings title');
      enUI['test.en-only'] = 'English only';
      zhCNUI['test.zh-only'] = '仅中文';
      enUI['test.greeting'] = 'Hello, {name}';
      assert(getText('test.en-only') === 'test.en-only', 'Chinese missing UI text falls back to key');
      setLanguage('en');
      assert(getText('test.zh-only') === '仅中文', 'English missing UI text falls back to Chinese');
      assert(getText('test.greeting', { name: 'Ada' }) === 'Hello, Ada', 'Text interpolation replaces defined placeholder');
    } finally {
      delete enUI['test.en-only'];
      delete zhCNUI['test.zh-only'];
      delete enUI['test.greeting'];
      setLanguage('zh-CN');
    }

    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); }
    };
    const storage = new StorageSystem();
    assert(resolveLanguage(undefined) === 'zh-CN', 'language resolver is safe without navigator');
    const gameSceneSource = require('fs').readFileSync('src/phaser/scenes/BaseScene.ts', 'utf8');
    assert(gameSceneSource.includes("if (isNewGame) this.state.language = 'en';"), 'itch 发布版新开局默认英文，不看浏览器语言');
    assert(gameSceneSource.includes('(this.bagPanel?.isVisible() ?? false)') && gameSceneSource.includes('(this.spawnerPanel?.isVisible() ?? false)'), 'open panels block grid input');
    const nightSceneSource = require('fs').readFileSync('src/phaser/scenes/NightScene.ts', 'utf8');
    assert(nightSceneSource.includes('create(): void {\n    this.ended = false;'), 'NightScene restarts reset the prior battle end flag');
    assert(gameSceneSource.includes('this.storage.clearState();'), 'restart clears saves through StorageSystem');
    const state = createInitialGameState();
    assert(state.language === 'en', '新开局默认英文');
    delete (state as Partial<typeof state>).heroes; // 模拟旧存档
    storage.saveState(state);
    const loaded = storage.loadState();
    assert(loaded !== null && Array.isArray(loaded.heroes) && loaded.heroes.length === 0, '旧档无 heroes 字段经 loadState 兜底为空数组');

    const oldLanguageState = createInitialGameState();
    delete (oldLanguageState as Partial<typeof oldLanguageState>).language;
    store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state: oldLanguageState }));
    assert(storage.loadState()?.language === 'en', '旧档缺 language 时默认英文');
    (oldLanguageState as { language?: string }).language = 'fr';
    store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state: oldLanguageState }));
    assert(storage.loadState()?.language === 'en', '旧档 language 无效时默认英文');
    oldLanguageState.language = 'en';
    storage.saveState(oldLanguageState);
    assert(storage.loadState()?.language === 'en', '保存后恢复语言设置');

    // 旧档已播过入队剧情（storySeen 含 joinHero beat）：loadState 时补发英雄
    const state2 = createInitialGameState();
    state2.storySeen = [4, 102, 104]; // 小满/老枪/胖婶的入队 beat
    delete (state2 as Partial<typeof state2>).heroes;
    storage.saveState(state2);
    const loaded2 = storage.loadState();
    const keys = (loaded2?.heroes ?? []).map(h => h.key).sort();
    assert(keys.length === 3 && keys.includes('xiaoman') && keys.includes('laoqiang') && keys.includes('pangshen'), '旧档按 storySeen 补发已加入英雄');
    assert(loaded2!.heroes.every(h => h.row === -1 && h.col === -1), '补发英雄初始为未部署');

    // version '2' 旧档作废（人口/食物体系删除，不写迁移）：loadState 返回 null
    store.set(SAVE_KEY, JSON.stringify({ version: '2', state: createInitialGameState() }));
    assert(storage.loadState() === null, 'version 2 旧档作废返回 null（重开新局）');

    // v3 旧档（建筑带 fueledUntil、resources 无 fuel）加载不崩：fueledUntil 删除、fuel 补 0
    const state3 = createInitialGameState();
    delete (state3.resources as Partial<typeof state3.resources>).fuel; // 模拟旧档
    state3.base.buildings.push({ cfgId: 203, level: 1, hp: 150, maxHp: 150, row: 2, col: 2, fueledUntil: Date.now() + 3600000 } as never);
    storage.saveState(state3);
    const loaded3 = storage.loadState();
    assert(loaded3 !== null && loaded3.resources.fuel === 0, 'v3 旧档 resources 无 fuel 兜底补 0');
    assert(loaded3!.base.buildings.every(b => (b as { fueledUntil?: number }).fueledUntil === undefined), 'v3 旧档建筑 fueledUntil 残留字段删除');
    assert(getPowerInfo(loaded3!).cap === 6, 'v3 旧档风力发电站不受旧燃料字段影响');

    // 已进入电站蓝图引导但历史奖励遗漏的旧档：加载时补发电站蓝图箱。
    const state4 = createInitialGameState();
    state4.handIndex = 11;
    storage.saveState(state4);
    const loaded4 = storage.loadState();
    assert(loaded4?.cardArr.includes(70007), '旧档卡在电站蓝图引导时补发电站蓝图箱');

    // 已播第三天断水剧情的旧档：加载时补发一次废弃冷藏箱发射器，后续读档不重复。
    const waterOldState = createInitialGameState();
    waterOldState.storySeen = [103];
    delete (waterOldState as Partial<typeof waterOldState>).storyRewardClaims;
    storage.saveState(waterOldState);
    const loadedWaterOldState = storage.loadState()!;
    const oldWaterRewardCount = loadedWaterOldState.grid.cells.flat().filter(cell => cell.item?.id === 20001).length
      + loadedWaterOldState.cardArr.filter(id => id === 20001).length;
    assert(oldWaterRewardCount === 1, '旧档已播断水剧情补发废弃冷藏箱发射器');
    storage.saveState(loadedWaterOldState);
    const loadedWaterOldStateAgain = storage.loadState()!;
    const oldWaterRewardCountAgain = loadedWaterOldStateAgain.grid.cells.flat().filter(cell => cell.item?.id === 20001).length
      + loadedWaterOldStateAgain.cardArr.filter(id => id === 20001).length;
    assert(oldWaterRewardCountAgain === 1, '断水剧情旧档奖励只补发一次');

    const catOldState = createInitialGameState();
    catOldState.storySeen = [131];
    delete (catOldState as Partial<typeof catOldState>).storyRewardClaims;
    storage.saveState(catOldState);
    const loadedCatOldState = storage.loadState()!;
    assert(loadedCatOldState.grid.cells.flat().some(cell => cell.item?.id === 50022) || loadedCatOldState.cardArr.includes(50022), '旧档补发所有已看剧情的配置道具奖励');

    // 合成核心并入基地核心：新开局棋盘不再有核心道具；旧档棋盘/背包/卡片里的核心道具折算成核心等级并移除
    const freshGame = GameInitializer.initNewGame();
    assert(freshGame.grid.cells.flat().every(cell => !cell.item || !isRetiredCoreProp(cell.item.id)), '新开局棋盘无核心道具');
    assert(freshGame.base.buildings.some(b => b.cfgId === 1 && b.level === 1), '新开局基地核心 1 级');
    const coreOldState = createInitialGameState();
    setItem(coreOldState.grid, 0, 0, createItemFromConfig(60026)); // 旧档：1 级核心
    setItem(coreOldState.grid, 0, 1, createItemFromConfig(60029)); // 旧档：4 级核心（取最高）
    setItem(coreOldState.grid, 0, 2, createItemFromConfig(60024)); // 材料保留
    const bagOld = createItemFromConfig(401);
    bagOld.roomArr = new Array(6).fill(null);
    bagOld.roomArr[0] = createItemFromConfig(60031); // 背包里的 6 级核心
    setItem(coreOldState.grid, 1, 0, bagOld);
    coreOldState.cardArr.push(60027);
    storage.saveState(coreOldState);
    const loadedCoreOld = storage.loadState()!;
    const coreBuilding = loadedCoreOld.base.buildings.find(b => b.cfgId === 1)!;
    assert(coreBuilding.level === 6, `旧档核心道具折算成最高等级（实际 ${coreBuilding.level}）`);
    const leftover = loadedCoreOld.grid.cells.flat().filter(cell => cell.item && isRetiredCoreProp(cell.item.id)).length
      + loadedCoreOld.cardArr.filter(isRetiredCoreProp).length
      + loadedCoreOld.grid.cells.flat().reduce((n, cell) => n + (cell.item?.roomArr?.filter(it => it && isRetiredCoreProp(it.id)).length ?? 0), 0);
    assert(leftover === 0, '旧档核心道具全部移除');
    assert(loadedCoreOld.grid.cells.flat().some(cell => cell.item?.id === 60024), '旧档核心材料保留');
    assert(coreBuilding.times === getCoreTimesAt(6), '折算后按新等级补满库存');
    // 再存再读不重复折算、不重复加等级
    storage.saveState(loadedCoreOld);
    const loadedCoreOldAgain = storage.loadState()!;
    assert(loadedCoreOldAgain.base.buildings.find(b => b.cfgId === 1)!.level === 6, '重复读档等级稳定');
  }

  // --- 整局回归：第 2 晚 1 箭塔 + 老枪部署核心旁内圈格，核心掉血少于无英雄对照组 ---
  {
    const runNight2 = (withHero: boolean): number => {
      const state = createInitialGameState();
      state.day = 2;
      addFueledGenerator(state); // 发电机供电，箭塔通电
      state.base.buildings.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 5, col: 11 }); // 箭塔守东侧缺口
      if (withHero) state.heroes.push({ key: 'laoqiang', row: 6, col: 5 }); // 核心旁内圈格
      const battle = night.startBattle(state);
      let steps = 0;
      while (battle.status !== 'won' && battle.status !== 'lost' && steps < 8000) {
        night.tick(state, battle, 100);
        steps++;
      }
      const core = state.base.buildings.find(b => b.cfgId === 1)!;
      return core.maxHp - core.hp;
    };
    const dmgWith = runNight2(true);
    const dmgWithout = runNight2(false);
    assert(dmgWith < dmgWithout, `第 2 晚有英雄协防核心掉血更少（有英雄 ${dmgWith} / 无英雄 ${dmgWithout}）`);
  }
}

// ============ 16. 剧情系统 ============
console.log('== 剧情 ==');
{
  const story = new StorySystem();
  const state = createInitialGameState();

  // 捕获 STORY_PLAY 事件
  const played: IStoryBeat[] = [];
  const off = eventBus.on(GameEvents.STORY_PLAY, (data: { beat: IStoryBeat }) => played.push(data.beat));

  // 新开局 → 只播第一章（beat 1）；任务/建造引导等玩家动手后才触发
  story.onNewGame(state);
  assert(played.length === 1 && played[0].id === 1 && state.storySeen.includes(1), '新开局播放第一章');
  assert(!state.storySeen.includes(16) && !state.storySeen.includes(17), '开局不直接播任务/建造引导');
  story.onNewGame(state);
  assert(played.length === 1, '同一 beat 不重复播放');

  // 首次合成 → 黑市任务引导（beat 16）
  story.beatDone(); // 播完第一章
  story.checkMerge(state);
  assert(state.storySeen.includes(16) && played.length === 2 && played[1].id === 16, '首次合成触发黑市任务引导');

  // 金币攒到 200 → 箭塔建造引导（beat 17）
  story.beatDone(); // 播完 beat 16
  story.checkCoin(state, 200);
  assert(state.storySeen.includes(17) && played.length === 3 && played[2].id === 17, '攒够 200 金币触发箭塔建造引导');

  // 排队：连升两级触发 beat 3/131/5（level 3/5/6），一次只播一段
  story.beatDone(); // 播完 beat 17
  story.checkLevel(state, 6);
  assert(state.storySeen.includes(3) && state.storySeen.includes(5) && state.storySeen.includes(131), '等级触发记录多个 beat');
  assert(played.length === 4 && played[3].id === 3, '排队时一次只播一段');
  story.beatDone();
  assert(played.length === 5 && played[4].id === 5, '播完一段接播下一段（按 id 顺序）');
  story.beatDone();
  assert(played.length === 6 && played[5].id === 131, '流浪猫窝事件（level 5）按序接播');
  story.beatDone();
  assert(played.length === 6, '队列播完');

  // 读档补播：roleLv=6 的老存档 onGameReady 只补未看过的
  const old = createInitialGameState();
  old.roleLv = 6;
  old.storySeen = [1, 3, 5, 131];
  const story2 = new StorySystem();
  const played2: IStoryBeat[] = [];
  const off2 = eventBus.on(GameEvents.STORY_PLAY, (data: { beat: IStoryBeat }) => played2.push(data.beat));
  story2.onGameReady(old);
  assert(played2.length === 0, '已看过的等级剧情不补播');
  off2();

  // 第三天断水剧情：发放废弃冷藏箱发射器，剧情回顾不重复发放。
  {
    const waterState = createInitialGameState();
    waterState.storySeen = [2, 102]; // 第二晚剧情已播完，守住第二晚后进入第三天
    const waterStory = new StorySystem();
    waterStory.checkNightEnd(waterState, true, 3);
    waterStory.beatDone(waterState);
    const waterRewardCount = waterState.grid.cells.flat().filter(cell => cell.item?.id === 20001).length
      + waterState.cardArr.filter(id => id === 20001).length;
    assert(waterRewardCount === 1, '第三天断水剧情发放废弃冷藏箱发射器');
    assert(((waterState as Partial<typeof waterState>).storyRewardClaims ?? []).includes(103), '断水剧情奖励写入领取记录');
    const waterBeat = STORY_BEATS.find(beat => beat.id === 103)!;
    waterStory.replay(waterBeat);
    waterStory.beatDone(waterState);
    const replayWaterRewardCount = waterState.grid.cells.flat().filter(cell => cell.item?.id === 20001).length
      + waterState.cardArr.filter(id => id === 20001).length;
    assert(replayWaterRewardCount === 1, '回顾断水剧情不重复发放冰箱链发射器');
  }

  // 物品/僵尸/夜晚触发
  story.checkItems(state, [30019, 30023]);
  assert(state.storySeen.includes(7) && state.storySeen.includes(9), '物品首现触发剧情');
  story.checkZombie(state, 'fly');
  story.checkZombie(state, 'burrow');
  assert(state.storySeen.includes(10) && state.storySeen.includes(12), '飞行/钻地僵尸首现触发剧情');
  story.checkNightEnd(state, true, 2);
  assert(state.storySeen.includes(2), '首夜胜利触发剧情');
  assert(state.storySeen.includes(102), '进入第 2 天播放第 2 章');
  story.checkNightEnd(state, true, 5);
  assert(state.storySeen.includes(103), '每晚最多补播一章（按序）');
  assert(!state.storySeen.includes(104), '跳天数不刷屏，漏章逐晚补');
  // 时间回溯：首次失败播 nightLose，只播一次；胜利不播
  story.checkNightEnd(state, false, 5);
  assert(state.storySeen.includes(28), '首次防守失败触发时间回溯剧情');
  story.checkNightEnd(state, false, 5);
  assert(state.storySeen.filter(id => id === 28).length === 1, '时间回溯剧情只播一次');

  // 角色图鉴：玩家恒在；已播剧情里说过话的角色算已遇到（本 state 已播 1/2/3/5/16/28 等）
  const metChars = getMetCharacters(state);
  assert(metChars.has('hero') && metChars.has('laogui') && metChars.has('mancang') && metChars.has('officer'), '已遇到的角色进图鉴（含玩家自己）');
  assert(!metChars.has('wensente'), '未登场的角色不在图鉴');
  story.checkBuilding(state, 203);
  assert(state.storySeen.includes(4) && state.storySeen.includes(19), '建成发电机触发小满剧情 + 迎战引导');
  story.checkBuilding(state, 101);
  assert(state.storySeen.includes(18), '建成箭塔触发剧情');
  const seenCount = state.storySeen.length;
  story.checkBuilding(state, 203);
  assert(state.storySeen.length === seenCount, '建筑剧情不重复触发');
  off();

  // --- 剧情回顾：主线收录/解锁条件/重播 ---
  {
    const main = getMainStoryBeats();
    assert(main.length === 30 && main[0].id === 1 && main[0].chapter === 1, '主线收录 30 章（序章 + 29 个天数章节）');
    assert(main.every(b => b.trigger.type === 'newGame' || b.trigger.type === 'day'), '引导类 beat 不收录');
    assert(getUnlockCondition(main[0]) === '开始新游戏解锁', '序章解锁条件');
    const ch2 = main.find(b => b.chapter === 2)!;
    assert(getUnlockCondition(ch2) === '存活到第 2 天解锁', '天数章节解锁条件');

    // 重播：不入 storySeen、不重复打赏（rewardCoin 被剥掉）、走队列正常结算
    const st3 = createInitialGameState();
    st3.storySeen = [1, 102];
    const story3 = new StorySystem();
    const played3: IStoryBeat[] = [];
    const off3 = eventBus.on(GameEvents.STORY_PLAY, (data: { beat: IStoryBeat }) => played3.push(data.beat));
    const coinBefore = st3.resources.coin;
    const seenBefore = st3.storySeen.length;
    story3.replay(ch2);
    assert(played3.length === 1 && played3[0].id === ch2.id, '回顾重播指定章节');
    story3.beatDone(st3);
    assert(st3.storySeen.length === seenBefore && st3.resources.coin === coinBefore, '重播不改 storySeen/金币');
    off3();
  }

  // --- 临时对话（任务赠品发放）：立即播/排队播，不写 storySeen ---
  {
    const st4 = createInitialGameState();
    const story4 = new StorySystem();
    const played4: IStoryBeat[] = [];
    const off4 = eventBus.on(GameEvents.STORY_PLAY, (data: { beat: IStoryBeat }) => played4.push(data.beat));
    story4.playAdHoc([{ who: 'mancang', text: '干得漂亮！' }]);
    assert(played4.length === 1 && played4[0].lines[0].who === 'mancang', '临时对话立即播放');
    assert(st4.storySeen.length === 0, '临时对话不写 storySeen');
    story4.playAdHoc([{ who: 'mancang', text: '第二段' }]);
    assert(played4.length === 1, '播放中再发临时对话会排队');
    story4.beatDone(st4);
    assert(played4.length === 2 && played4[1].lines[0].text === '第二段', '播完后接播排队的临时对话');
    off4();
  }
}

// ============ 17. 蓝图解锁 ============
console.log('== 蓝图解锁 ==');
{
  const { merge, task, economy } = makeSystems();
  const base = new BaseSystem(economy);

  // --- 用例 1：电站蓝图链 Lv1×8 逐级合成到顶 → 解锁发电机；重复合出不重复解锁 ---
  {
    const state = createInitialGameState();
    // 8 个电站蓝图碎片（70125）放满 (0,0)~(1,0)
    const spots: [number, number][] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 0]];
    for (const [r, c] of spots) setItem(state.grid, r, c, createItemFromConfig(70125));
    // 8→4（图纸 70126）
    const round1: [[number, number], [number, number]][] = [
      [[0, 0], [0, 1]], [[0, 2], [0, 3]], [[0, 4], [0, 5]], [[0, 6], [1, 0]]
    ];
    for (const [src, tgt] of round1) {
      const r = merge.moveOrMerge(state, { row: src[0], col: src[1] }, { row: tgt[0], col: tgt[1] });
      assert(r.kind === 'merge' && r.newItem?.id === 70126, `碎片合成图纸（${src}→${tgt}）`);
    }
    // 4→2（设计图 70127）
    let r = merge.moveOrMerge(state, { row: 0, col: 1 }, { row: 0, col: 3 });
    assert(r.kind === 'merge' && r.newItem?.id === 70127, '图纸合成设计图（1）');
    r = merge.moveOrMerge(state, { row: 0, col: 5 }, { row: 1, col: 0 });
    assert(r.kind === 'merge' && r.newItem?.id === 70127, '图纸合成设计图（2）');
    // 2→1（电站蓝图 70128，链尾 blessId=0）
    r = merge.moveOrMerge(state, { row: 0, col: 3 }, { row: 1, col: 0 });
    assert(r.kind === 'merge' && r.newItem?.id === 70128, '设计图合成电站蓝图');

    // 合成出最终蓝图不自动解锁，蓝图留在棋盘
    assert(!state.unlockedBuildings.includes(203), '合成出电站蓝图后建筑仍未解锁');
    assert(getItem(state.grid, 1, 0)?.id === 70128, '蓝图留在棋盘');

    // 碎片格使用 → null
    setItem(state.grid, 0, 0, createItemFromConfig(70125));
    assert(useBlueprint(state, { row: 0, col: 0 }) === null, '碎片不是最终蓝图，使用返回 null');

    // 使用蓝图 → 解锁发电机 + 消耗蓝图（事件发出时解锁状态必须已写入，新手引导依赖此时序）
    let unlockedInEvent = false;
    const offChanged = eventBus.on(GameEvents.GRID_ITEM_CHANGED, () => {
      if (state.unlockedBuildings.includes(203)) unlockedInEvent = true;
    });
    const used = useBlueprint(state, { row: 1, col: 0 });
    offChanged();
    assert(used !== null && used.cfg.id === 203 && used.fresh === true, '使用蓝图 → 解锁建筑 203');
    assert(unlockedInEvent, 'GRID_ITEM_CHANGED 事件发出时已写入解锁状态');
    assert(state.unlockedBuildings.includes(203) && state.unlockedBuildings.length === 1, '解锁写入 unlockedBuildings');
    assert(getItem(state.grid, 1, 0) === null, '蓝图使用后从棋盘消耗');

    // 已解锁建筑再次使用蓝图：仍消耗，fresh=false，不重复解锁，蓝图入 blueprintStock 作升级材料
    setItem(state.grid, 1, 0, createItemFromConfig(70128));
    const used2 = useBlueprint(state, { row: 1, col: 0 });
    assert(used2 !== null && used2.fresh === false && state.unlockedBuildings.length === 1, '重复使用不重复解锁');
    assert(getItem(state.grid, 1, 0) === null, '重复使用的蓝图同样被消耗');
    assert(state.blueprintStock[203] === 1, '重复蓝图入 blueprintStock（升级材料）');

    // 空格使用 → null
    assert(useBlueprint(state, { row: 1, col: 0 }) === null, '空格使用返回 null');

    // 使用蓝图后的剧情引导（beat 27：NPC 引导去基地盖发电机）
    const bpStory = new StorySystem();
    const bpPlayed: IStoryBeat[] = [];
    const offBp = eventBus.on(GameEvents.STORY_PLAY, (data: { beat: IStoryBeat }) => bpPlayed.push(data.beat));
    bpStory.checkBlueprint(state, 203);
    assert(bpPlayed.length === 1 && bpPlayed[0].id === 27 && state.storySeen.includes(27), '使用电站蓝图触发盖发电机引导剧情');
    bpStory.checkBlueprint(state, 203);
    assert(bpPlayed.length === 1, '蓝图引导剧情不重复播放');
    offBp();
  }

  // --- 用例 2：未解锁建筑 canPlace=false；解锁后 true ---
  {
    const state = createInitialGameState();
    state.resources.coin = 10000;
    const locked = base.canPlace(state, 401, 6, 5);
    assert(!locked.ok && (locked.reason ?? '').includes('未解锁'), '未解锁建筑 canPlace=false');
    state.unlockedBuildings.push(401);
    assert(base.canPlace(state, 401, 6, 5).ok, '解锁后 canPlace=true');
    assert(base.place(state, 401, 6, 5), '解锁后摆放成功');
    // 无 blueprint 字段的核心/废墟恒解锁（核心不可建造规则不受影响）
    assert(!base.canPlace(state, 1, 6, 4).ok, '核心仍不可建造');
  }

  // --- 用例 3：collectReachableIds 不含 type=7 蓝图道具 ---
  {
    const state = createInitialGameState();
    setItem(state.grid, 0, 0, createItemFromConfig(70007)); // 电站蓝图发射器
    setItem(state.grid, 0, 1, createItemFromConfig(10001)); // 工具箱（对照组）
    const reach = task.collectReachableIds(state);
    assert(!reach.some(id => id >= 70001 && id <= 70168), '可达集合不含任何蓝图道具（type=7）');
    assert(reach.includes(10012), '普通链不受影响（工具箱链仍可达）');
  }

  // --- 用例 4：task=2 完成触发老鬼 beat 且 rewardCoin 入账 ---
  {
    const story = new StorySystem();
    const state = createInitialGameState();
    const played: IStoryBeat[] = [];
    const off = eventBus.on(GameEvents.STORY_PLAY, (data: { beat: IStoryBeat }) => played.push(data.beat));
    story.checkTaskDone(state, 2);
    assert(played.length === 1 && played[0].id === 20, '完成任务 2 触发老鬼打赏 beat（id=20）');
    const coinBefore = state.resources.coin;
    story.beatDone(state);
    assert(state.resources.coin === coinBefore + 40, 'rewardCoin=40 金币入账');
    // 其他任务 id 不触发该 beat；同一 beat 不重复触发
    story.checkTaskDone(state, 3);
    assert(played.length === 2 && played[1].id === 21, '完成任务 3 触发对应 beat（id=21）');
    story.checkTaskDone(state, 2);
    assert(played.length === 2, '同一 task beat 不重复触发');
    off();
  }

  // --- 用例 5：早期 NPC 送金币节点（缓解攒金币盖发电机的压力），toast 用说话人名字 ---
  {
    const gift = (id: number) => STORY_BEATS.find(b => b.id === id);
    assert(gift(16)?.rewardCoin === 30, '首次合成老鬼见面礼 30 金币');
    assert(gift(3)?.rewardCoin === 20, 'Lv3 满仓送 20 金币');
    assert(gift(5)?.rewardCoin === 40, 'Lv6 老鬼送 40 金币');
    assert(gift(2)?.rewardCoin === 50 && gift(2)?.rewardText === '夜晚战利品换得 50 金币', '首夜胜利战利品折现 50 金币');

    // toast 按说话人命名：满仓的 beat 不能说成老鬼；rewardText 优先
    const story = new StorySystem();
    const state = createInitialGameState();
    const toasts: string[] = [];
    const offToast = eventBus.on(GameEvents.TOAST_SHOW, (msg: string) => toasts.push(msg));
    story.checkLevel(state, 3);
    story.beatDone(state);
    assert(toasts.some(m => m.includes('满仓') && m.includes('20 金币')), 'Lv3 打赏 toast 署名满仓');
    story.checkNightEnd(state, true, 1);
    story.beatDone(state);
    assert(toasts.includes('夜晚战利品换得 50 金币'), '首夜胜利用 rewardText 自定义文案');
    offToast();
  }

  // --- 用例 5：旧存档（无 unlockedBuildings 字段）兜底：已摆放建筑自动解锁 ---
  {
    const state = createInitialGameState();
    state.base.buildings.push({ cfgId: 101, level: 1, hp: 200, maxHp: 200, row: 0, col: 0 });
    state.base.buildings.push({ cfgId: 202, level: 1, hp: 150, maxHp: 150, row: 6, col: 4 });
    delete (state as Partial<typeof state>).unlockedBuildings; // 模拟旧存档
    const filled = ensureUnlockedBuildings(state);
    assert(filled && state.unlockedBuildings.includes(101) && state.unlockedBuildings.includes(202), '旧档已摆放建筑自动解锁');
    assert(!state.unlockedBuildings.includes(102), '未摆放建筑不自动解锁');
    assert(!ensureUnlockedBuildings(state), '字段已存在不重复兜底');
    // 兜底后旧档建筑可正常升级/摆放同类
    state.resources.coin = 10000;
    assert(base.canPlace(state, 101, 6, 5).ok, '旧档已解锁建筑可再建');
  }
}

// ============ i18n 覆盖 ============
console.log('== i18n 覆盖 ==');
setLanguage('zh-CN');
const chineseProp = getPropName(101);
const chineseBuilding = getBuildingName(101);
const chineseHero = getHeroName('xiaoman');
const chineseZombie = getZombieName(1);
const chineseStory = getStoryLines(1);
setLanguage('en');
assert(getPropName(101) !== chineseProp, 'English prop name is localized');
assert(getBuildingName(101) !== chineseBuilding, 'English building name is localized');
assert(getHeroName('xiaoman') !== chineseHero, 'English hero name is localized');
assert(getZombieName(1) !== chineseZombie, 'English zombie name is localized');
assert(getStoryLines(1)[0].text !== chineseStory[0].text, 'English story lines are localized');
assert(STORY_BEATS.every(beat => getStoryLines(beat.id).every((line, index) => line.who === beat.lines[index]?.who)), 'Localized story who values retain canonical portrait keys');
const adHocLines = [{ who: 'mancang', text: 'First line' }, { who: 'laogui', text: 'Second line' }];
assert((getStoryLines as unknown as (id: number, lines?: typeof adHocLines) => typeof adHocLines)(-1, adHocLines).length === 2, 'Ad-hoc story preserves all provided lines');
assert(getText('toast.nightStarts') !== 'toast.nightStarts', 'Localized runtime template is available');
assert(formatGains({ 10012: 1 }) === 'Screwdriver+1', 'English loot toast localizes prop names');
assert(formatResourceGains({ medicine: 1 }) === 'Medicine+1', 'English resource toast localizes resource names');
assert(getText('zombie.tag.7') === 'Flying', 'English night preview tag is localized');
const baseSceneSource = require('fs').readFileSync('src/phaser/scenes/BaseScene.ts', 'utf8');
const nightSceneSource = require('fs').readFileSync('src/phaser/scenes/NightScene.ts', 'utf8');
const monsterPanelSource = require('fs').readFileSync('src/phaser/ui/MonsterPanel.ts', 'utf8');
assert(nightSceneSource.includes("this.scene.start('BaseScene', { state: this.state, nightEndStory: { won, day: this.state.day } });"), '夜战结算把剧情交给基地场景');
assert(!nightSceneSource.includes('const onNightEnd ='), '夜战场景不在切场景前直接播放结算剧情');
assert(baseSceneSource.includes('private nightEndStory: { won: boolean; day: number } | null = null;'), '基地场景保存夜战剧情交接数据');
assert(baseSceneSource.includes('this.storySystem.checkNightEnd(this.state, this.nightEndStory.won, this.nightEndStory.day);'), '基地场景在剧情弹窗就绪后触发夜战剧情');
assert(baseSceneSource.includes('getZombieName(t.id)') && baseSceneSource.includes("getText(`zombie.tag.${t.id}`)"), 'Night preview uses localized zombie accessors');
assert(baseSceneSource.includes('canDefendFlyingEnemies(this.state)') && baseSceneSource.includes("getText('base.noAntiAirWarning')"), 'Night preview warns when flying enemies exceed the current air defense');
assert(baseSceneSource.includes("building.cfgId === 101 && staffed && hasSupportCoverage(this.state, 'radar'"), '基地页雷达覆盖内箭塔显示对空角标');
assert(nightSceneSource.includes("b.cfgId === 101 && powered && hasSupportCoverage(this.state, 'radar'"), '夜战页雷达覆盖内箭塔显示对空角标');
assert(getText('base.antiAir') !== 'base.antiAir', '对空角标文案已本地化');
assert(baseSceneSource.includes('getRecommendedMarketItem(this.state.day)') && baseSceneSource.includes("getText('base.marketComplete'"), 'Night preview and market expose the recommended complete blueprint');
assert(getText('base.marketComplete') !== 'base.marketComplete' && getText('base.recommendedCounter') !== 'base.recommendedCounter', 'Complete blueprint UI text is localized');
assert(baseSceneSource.includes('wordWrap: { width: panelW - 150, useAdvancedWrap: true }'), 'Night preview wraps Chinese warning text without spaces');
assert(baseSceneSource.includes('const name = this.add.text(x - 104, y - 58, getBuildingName(cfg.id)') && baseSceneSource.includes('const rowY = y + 48 + j * 44;'), 'Build cards use separated name, description, and cost rows');
assert(baseSceneSource.includes("y - 58, getBuildingName(cfg.id)") && baseSceneSource.includes("getLanguage() === 'en' ? '18px' : '20px'"), 'Build card titles leave room for wrapped Chinese descriptions');
assert(getAllZombieConfigs().length === 8, 'Monster codex source has all eight zombie configs');
assert(getText('monster.ability.fly').length > 0 && getText('monster.ability.burrow').length > 0 && getText('monster.ability.explode').length > 0, 'Monster codex ability text is localized');
assert(baseSceneSource.includes("getText('menu.monsters')") && baseSceneSource.includes('new MonsterPanel(this)'), 'Monster codex is wired into the side navigation');
assert(monsterPanelSource.includes('getAllZombieConfigs()') && monsterPanelSource.includes('CARD_H = 240'), 'Monster codex renders the config list in a fixed viewport');
const buildToastState = createInitialGameState();
unlockAllBuildings(buildToastState);
buildToastState.base.tiles.forEach(row => row.forEach(tile => { tile.claimed = true; }));
const buildToastReason = new BaseSystem(new EconomySystem()).canPlace(buildToastState, 401, 6, 5).reason;
// 只断言"英文 + 带需求金币数"，措辞调整（例如补上当前金币）不该弄红用例
assert(!!buildToastReason && buildToastReason.includes('Not enough Coins') && buildToastReason.includes('100'),
  'English build failure toast is localized');
assert(getPropDescription(10001) !== getAllProps().find(prop => prop.id === 10001)?.mask, 'English prop description is localized');
assert(getHeroDescription('laoqiang') !== getHeroConfig('laoqiang')?.desc, 'English hero description is localized');
assert(getSpeakerName('laogui') === 'Old Ghost', 'English story speaker is localized');
assert(getCharacterBio('laogui')?.title === 'Black Market Trader', 'English character bio is localized');
assert(getStoryUnlockCondition(getMainStoryBeats()[1]!) === 'Survive until Day 2 to unlock', 'English story unlock condition is localized');
setLanguage('zh-CN');
for (const language of ['zh-CN', 'en'] as const) {
  setLanguage(language);
  const locale = getLocaleData(language);
  for (const prop of getAllProps()) assert(!!locale.props[prop.id], `${language} 物品 ${prop.id}`);
  for (const building of getAllBuildingConfigs()) assert(!!locale.buildings[building.id], `${language} 建筑 ${building.id}`);
  for (const building of getBuildableList()) assert(getText(`base.buildingDesc.${building.id}`) !== `base.buildingDesc.${building.id}`, `${language} 建筑 ${building.id} 功能说明`);
  for (const hero of getAllHeroConfigs()) assert(!!locale.heroes[hero.key], `${language} 英雄 ${hero.key}`);
  for (const zombie of getAllZombieConfigs()) assert(!!locale.zombies[zombie.id], `${language} 僵尸 ${zombie.id}`);
  for (const beat of STORY_BEATS) {
    const lines = locale.story[beat.id];
    assert(!!lines, `${language} 剧情 ${beat.id}`);
    assert(lines?.length === beat.lines.length, `${language} 剧情 ${beat.id} 台词数`);
    for (const [index, line] of (lines ?? []).entries()) {
      assert(!!line.who && !!line.text, `${language} 剧情 ${beat.id}:${index + 1}`);
      if (language === 'en') {
        const expectedSpeaker = line.who === 'narrator' ? '' : translateEnglishSpeaker(beat.lines[index].who);
        assert(getSpeakerName(line.who) === expectedSpeaker, `en 剧情 ${beat.id}:${index + 1} 发言人已翻译`);
      }
    }
  }
}
setLanguage('zh-CN');

for (const speaker of ['__missing_speaker__', '']) {
  let missingEnglishSpeakerThrows = false;
  try {
    translateEnglishSpeaker(speaker);
  } catch {
    missingEnglishSpeakerThrows = true;
  }
  assert(missingEnglishSpeakerThrows, `无效英文剧情发言人失败: ${speaker || '(empty)'}`);
}

// Runtime messages are emitted by core systems; inspect source because Phaser UI cannot be constructed in smoke.
const fs = require('fs');
const runtimeMessageFiles = [
  'BagSystem.ts', 'BaseSystem.ts', 'EconomySystem.ts', 'HeroSystem.ts', 'LevelSystem.ts', 'MergeSystem.ts',
  'NightSystem.ts', 'SpecialItemSystem.ts', 'SpawnSystem.ts', 'TaskSystem.ts', 'UnlockSystem.ts'
];
for (const file of runtimeMessageFiles) {
  const source = fs.readFileSync(`src/core/systems/${file}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const messages = source.match(/eventBus\.emit\(GameEvents\.TOAST_SHOW,[\s\S]*?\);/g) ?? [];
  assert(messages.every((message: string) => !/[\u3400-\u9fff]/.test(message)), `${file} runtime messages use locale keys`);
}

// ============ 结果 ============
console.log(`\n===== 冒烟测试：${passed} 通过，${failed} 失败 =====`);
if (failed > 0) {
  process.exit(1);
}
