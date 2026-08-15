import type { LocaleData } from './types';
import { getAllBuildingConfigs } from '../config/BuildingConfig';
import { getAllHeroConfigs } from '../config/HeroConfig';
import { getAllProps } from '../config/PropConfig';
import { CHARACTER_BIOS, STORY_BEATS, STORY_CHARACTERS } from '../config/StoryConfig';
import { getAllZombieConfigs } from '../config/ZombieConfig';

const namesById = <T extends { id: number; name: string }>(rows: T[]): Record<number, string> =>
  Object.fromEntries(rows.map(row => [row.id, row.name]));

export const zhCN: LocaleData = {
  ui: { 'settings.title': '设置', 'settings.chinese': '中文', 'settings.english': 'English', 'dialog.restart': '重开', 'dialog.confirmRestart': '确认重开' },
  props: namesById(getAllProps()),
  propDescriptions: Object.fromEntries(getAllProps().map(prop => [prop.id, prop.mask])),
  buildings: namesById(getAllBuildingConfigs()),
  heroes: Object.fromEntries(getAllHeroConfigs().map(hero => [hero.key, hero.name])),
  heroDescriptions: Object.fromEntries(getAllHeroConfigs().map(hero => [hero.key, hero.desc])),
  speakers: Object.fromEntries(Object.entries(STORY_CHARACTERS).map(([key, value]) => [key, value.name])),
  characterBios: CHARACTER_BIOS,
  storyRewards: Object.fromEntries(STORY_BEATS.filter(beat => beat.rewardText).map(beat => [beat.id, beat.rewardText!])),
  zombies: namesById(getAllZombieConfigs()),
  story: Object.fromEntries(STORY_BEATS.map(beat => [beat.id, beat.lines]))
};

const zhCNCommonUi: Record<string, string> = {
  'panel.backpack': '背包', 'bag.addSlotCost': '+\n{price}金币', 'story.continue': '点击继续 ▼', 'story.close': '点击关闭 ▼',
  'base.building': '建筑', 'side.north': '北侧', 'side.west': '西侧', 'side.south': '南侧', 'side.east': '东侧',
  'resource.coin': '金币', 'resource.diamond': '钻石', 'resource.power': '行动力', 'toast.cannotBuild': '无法建造',
  'hero.outOfBounds': '超出基地范围', 'hero.innerOnly': '英雄只能部署在内圈', 'hero.cellHasBuilding': '该格已有建筑', 'hero.cellHasHero': '该格已有英雄'
};

export const zhCNRuntimeUi: Record<string, string> = { ...zhCNCommonUi,
  'toast.bagBubble': '气泡中的物品不能放入背包', 'toast.bagFull': '背包已满', 'toast.boardFull': '棋盘已满',
  'toast.taskItemsShort': '任务物品不足', 'toast.resourceShort': '{resource}不足', 'toast.powerShort': '行动力不足',
  'toast.cannotSell': '该物品不能出售', 'toast.cooling': '冷却中，请稍后', 'toast.noUses': '次数已用完，等待冷却',
  'toast.spiderCannotMove': '被蜘蛛网缠住的物品不能移动，用相同的无网物品合成可解开',
  'toast.spiderBoth': '两个都被蜘蛛网缠住了，需要一个无网的相同物品来解开', 'toast.maxLevel': '已满级，不可合成',
  'toast.spiderTarget': '目标被蜘蛛网缠住，无法交换', 'toast.spiderSource': '被蜘蛛网缠住的物品只能与相同的无网物品合成解开',
  'toast.heroNotJoined': '该英雄还未加入堡垒', 'toast.heroDeployed': '该英雄已部署，先撤回再调整位置', 'toast.cannotDeploy': '无法部署',
  'toast.unlimitedEnergy': '无限能量 {seconds} 秒！', 'toast.acceleratorStarted': '加速装置已启动', 'toast.oneUnlockOnly': '同时只能解锁一个',
  'toast.nightStarts': '夜幕降临，行动力已回满', 'toast.waveIncoming': '第 {wave}/{total} 波僵尸来袭！', 'toast.daybreakLoot': '天亮了！战利品：{loot}',
  'toast.timeRewind': '时间回溯：回到当天清晨，核心修复至 50%，整顿后再战', 'toast.ruinsCollapse': '尸潮踩塌了{side}的废墟，下一夜它们会从新的方向进攻',
  'toast.zombieEmerged': '{zombie}钻出了地面！', 'toast.zombieEnraged': '{zombie}久攻不下，狂暴了！开始强拆建筑', 'toast.zombieExploded': '{zombie}爆炸！',
  'toast.towerNoFuel': '箭塔缺电：电站没有燃料，请先将电池转化为燃料', 'toast.towerNoPower': '箭塔缺电：当前电力不足，请增加发电机或减少用电建筑', 'toast.buildingDestroyed': '{building}被摧毁！',
  'toast.buildComplete': '建造完成：{building}', 'toast.coreUpgradeLocked': '核心升级将在科技线开放', 'toast.needBlueprint': '升级需要 1 张重复的“{building}”蓝图：再合成一张该建筑的蓝图并使用即可获得',
  'toast.notEnoughCoinsUpgrade': '金币不足：需要 {coins} 金币，可在黑市出售材料换取', 'toast.buildingUpgraded': '{building}升到 {level} 级', 'toast.buildingIntact': '建筑完好无需修复',
  'toast.notEnoughCoinsRepair': '金币不足：修复需要 {coins} 金币，可在黑市出售材料换取', 'toast.repairComplete': '修复完成（-{coins} 金币）', 'toast.cannotDemolishCore': '核心不可拆除',
  'toast.demolished': '已拆除：{building}', 'toast.demolishedRefund': '已拆除：{building}（返还 {coins} 金币）', 'toast.batteryFuel': '电池转化为燃料 +{amount}',
  'toast.buildingNotBuildable': '该建筑不可建造', 'toast.buildingLocked': '未解锁：合成 {blueprint} 后解锁', 'toast.outOfBase': '超出基地范围', 'toast.cellOccupied': '该格已有建筑', 'toast.expandTerritory': '请先扩张到该格子', 'toast.killCorridor': '必须保留一条敌人引流走廊', 'toast.notEnoughCoinsBuild': '金币不足：需要 {coins} 金币',
  'zombie.tag.1': '', 'zombie.tag.2': '', 'zombie.tag.3': '拆木墙', 'zombie.tag.4': '自爆·拆木墙', 'zombie.tag.5': '拆石墙', 'zombie.tag.6': '拆铁墙·高防', 'zombie.tag.7': '飞行', 'zombie.tag.8': '钻地·拆木墙'
};

Object.assign(zhCNRuntimeUi, {
  'item.level': 'Lv.{level}', 'card.title': '卡片', 'card.count': '{count}张', 'card.allTitle': '全部道具', 'card.more': '更多', 'card.hint': '点击道具放入棋盘',
  'action.popBubble': '戳破气泡 {cost}钻', 'action.skipCooldown': '跳过CD', 'action.view': '查看', 'action.use': '使用', 'action.convertFuel': '转化燃料', 'action.sell': '出售 {price}金币',
  'guide.tag': '引导', 'guide.merge': '拖动两个相同物品合成', 'guide.spawn': '点击发光物品产出新物品', 'guide.collect': '继续合成，收集任务物品', 'guide.submit': '点击任务条提交任务获得星星',
  'guide.emitter': '点两下左下箭塔蓝图箱，免费产出碎片', 'guide.blueprintMerge': '合成两个蓝图碎片，逐级得到箭塔蓝图', 'guide.unlockTower': '选中完整箭塔蓝图，再点「使用」解锁箭塔',
  'guide.buildTower': '金币够了！点下方「基地」盖箭塔，守住东边缺口', 'guide.towerCost': '盖箭塔要 {cost} 金币，先完成任务赚钱', 'guide.powerEmitter': '箭塔缺电了！点两下电站蓝图箱，免费产出碎片', 'guide.powerBlueprintMerge': '合成两个蓝图碎片，逐级得到电站蓝图', 'guide.unlockGenerator': '选中完整电站蓝图，再点「使用」解锁发电机',
  'guide.buildGenerator': '金币够了！点下方「基地」盖风力发电站，为阵地接通稳定电力', 'guide.generatorCost': '盖风力发电站要 {cost} 金币，先完成任务赚钱',
  'character.title': '角色图鉴', 'character.met': '已遇到 {count}/{total} 人', 'character.unknown': '尚未遇到', 'character.joined': '已加入堡垒 · 可部署协防', 'character.back': '‹ 返回图鉴',
  'page.previous': '‹ 上一页', 'page.next': '下一页 ›',
  'spawner.defaultName': '发射器', 'spawner.title': '{name} Lv.{level} · 产出一览', 'spawner.empty': '该发射器没有可产出材料', 'spawner.chance': '概率 {chance}%', 'spawner.unlockAt': 'Lv.{level} 解锁', 'spawner.hint': '升级发射器可解锁更多产出 · 点击空白处关闭',
  'task.chainTitle': '合成路径', 'task.chainNeed': '需要：{item} x{count}', 'task.chainSpawner': '发射器', 'task.chainDirect': '该任务物品可由发射器或奖励直接获得', 'task.chainHint': '两个相同道具合成，可升级到下一阶',
  'archive.title': '剧情回顾', 'archive.progress': '已解锁 {unlocked}/{total} 章', 'archive.chapter': '第 {chapter} 章', 'archive.replay': '回顾'
  ,'hud.roleLv.name': '玩家等级', 'hud.roleLv.desc': '当前等级，完成订单与合成可升级。', 'hud.roleLv.source': '订单、合成物品',
  'hud.coin.name': '金币', 'hud.coin.desc': '可购买建筑并升级基地。', 'hud.coin.source': '出售材料、宝箱、任务',
  'hud.diamond.name': '钻石', 'hud.diamond.desc': '可加速或购买特殊道具。', 'hud.diamond.source': '任务、宝箱、商店',
  'hud.power.name': '行动力', 'hud.power.desc': '点击发射器和建造时消耗。', 'hud.power.source': '夜战回满、能量道具',
  'hud.star.name': '星星', 'hud.star.desc': '完成任务获得，解锁建造与剧情。', 'hud.star.source': '订单任务',
  'hud.electric.name': '电力', 'hud.electric.desc': '风力发电站为阵地稳定供电。', 'hud.electric.source': '风力发电站',
  'hud.fuel.name': '燃料', 'hud.fuel.desc': '电池可转化为燃料。', 'hud.fuel.source': '电池转化',
  'hud.medicine.name': '药品', 'hud.medicine.desc': '修复建筑与核心时消耗。', 'hud.medicine.source': '医疗站产出',
  'hud.scrap.name': '废料', 'hud.scrap.desc': '用于工坊修复和低级合成。', 'hud.scrap.source': '回收、拆除', 'hud.source': '来源：{source}'
  ,'boot.title': '合合堡垒', 'boot.subtitle': '合成物资，守住最后的堡垒', 'boot.loading': '物资装载中…', 'boot.ready': '装载完成！',
  'night.title': '第 {day} 天 · 夜晚', 'night.incoming': '僵尸即将来袭…', 'night.coreHp': '核心血量:{hp}/{maxHp}', 'night.nextWave': '下一波准备中… ({wave}/{total})', 'night.waveRemaining': '波次 {wave}/{total} 剩余僵尸:{count}',
  'night.win': '天亮了，基地守住了！', 'night.loss': '核心过载……时间回溯启动', 'night.winSub': '战利品已入库，行动力回满', 'night.lossSub': '合成核心将时间倒回清晨，防御布局保留，整顿后再战', 'night.returnBase': '返回基地', 'night.rewind': '回到清晨'
  ,'menu.story': '剧情', 'menu.characters': '角色', 'menu.base': '基地', 'menu.shop': '商店', 'menu.settings': '设置', 'menu.restart': '重开', 'menu.confirm': '确认？'
});

Object.assign(zhCNRuntimeUi, {
  'archive.unlock.newGame': '开始新游戏解锁', 'archive.unlock.day': '存活到第 {day} 天解锁', 'archive.unlock.continue': '继续游戏解锁',
  'story.reward': '{name}额外打赏了 {coins} 金币'
});

Object.assign(zhCNRuntimeUi, {
  'game.loadFailed': '加载失败，请刷新\n{error}', 'game.cartonHint': '在相邻格合成两个相同物品，可打开纸箱',
  'game.bubbleHint': '气泡中的物品不能合成，约 {seconds} 秒后自动破开（变成金币），也可花 {diamonds} 钻立即戳破',
  'game.blueprintUnlocked': '使用蓝图！建筑「{building}」已解锁', 'game.duplicateBlueprint': '重复蓝图已收纳：「{building}」升级材料 +1（基地内升级建筑消耗）',
  'game.rewardItem': '「{item}」{count}', 'game.listSeparator': '、', 'game.taskRewardIntro': '干得漂亮！这是给你的额外奖励。',
  'game.taskRewardStored': '{names}，已经放进卡片栏了。', 'game.bubblePopped': '气泡破灭了', 'game.levelUp': '升到 Lv.{level}！获得升级奖励',
  'game.acceleratorStopped': '加速装置已停止'
});

Object.assign(zhCNRuntimeUi, {
  'base.tab.tower': '防御塔', 'base.tab.resource': '资源', 'base.tab.trap': '陷阱', 'base.tab.wall': '城墙', 'base.tab.hero': '英雄',
  'base.back': '返回', 'base.day': '第 {day} 天', 'base.coreHp': '核心:{hp}/{maxHp}', 'base.night': '迎接夜晚', 'base.blackMarket': '黑市', 'base.marketStars': '星星：{star}', 'base.marketWallet': '星星：{star}  钻石：{diamond}', 'base.marketExchange': '1钻石 = 100金币', 'base.marketExchanged': '已兑换 100 金币', 'base.marketPrice': '{star} 星星', 'base.marketBought': '已购入 {building} 蓝图', 'base.none': '无', 'base.resourceGain': '资源建筑产出：{gain}',
  'base.heroJoined': '{hero} 加入了堡垒！可在基地『英雄』页部署，协助防守内圈。', 'base.noPower': '缺电', 'base.buildCancel': '再点一次建筑按钮取消摆放',
  'base.buildHint': '点建筑查看详情/升级/拆除；资源建筑随时间自动产出', 'base.heroGuide': '剧情中加入堡垒的伙伴会出现在这里',
  'base.heroDeployCancel': '点击内圈空格部署，再点一次英雄卡片取消', 'base.heroDeployHint': '点英雄卡片进入部署；点格子上的英雄可撤回/移动',
  'base.heroStats': '攻{attack}  程{range}  速{speed}', 'base.deployed': '已部署', 'base.attackRange': '攻击/射程', 'base.heroRangeValue': '{attack} / {range} 格',
  'base.attackSpeed': '攻速', 'base.heroSpeedValue': '{speed} 次/秒', 'base.description': '简介', 'base.recall': '撤回', 'base.move': '移动', 'base.close': '关闭',
  'base.blueprint': '蓝图', 'base.needBlueprint': '需要 {blueprint}', 'base.towerDesc': '攻击{attack} 射程{range}{slow}', 'base.slow': '减速',
  'base.resourceOutput': '每{interval}秒产出 {resource}+{amount}', 'base.capIncrease': '增加 {resources} 上限', 'base.lowResourceOutput': '每{interval}秒产出低级原料',
  'base.resourceBuilding': '资源建筑', 'base.attack': '攻击{attack}', 'base.slowPercent': '减速{percent}%', 'base.durability': '耐久{hp}', 'base.placeHint': '点击格子放置',
  'base.buildingLocked': '「{building}」未解锁：合成 {blueprint}碎片可获得{blueprint}', 'base.notEnoughCoins': '金币不足：需要 {coins} 金币，可在黑市出售材料换取',
  'base.health': '血量', 'base.buildingRangeValue': '{attack} / {range} 格', 'base.output': '产出', 'base.resourceOutputSpaced': '每 {interval} 秒 {resource}+{amount}',
  'base.lowResourceOutputSpaced': '每 {interval} 秒低级原料×1', 'base.capBonus': '上限加成', 'base.powerNeeded': '所需电力', 'base.powerUse': '{need}（占用 {used}/{cap}）',
  'base.fuel': '燃料', 'base.fuelEmpty': '燃料耗尽：把电池转化为燃料', 'base.fuelRemaining': '燃料 {fuel}（每台发电机 1/小时，续航约 {hours} 小时）',
  'base.noPowerAtNight': '缺电（夜里无法开火！建造更多风力发电站）', 'base.noPowerHint': '缺电（电力不足，建造更多风力发电站或减少用电建筑）', 'base.status': '状态',
  'base.upgradeCost': '升级消耗', 'base.maxLevel': '已满级', 'base.upgradeCostValue': '{cost} + 蓝图×1（库存 {stock}）', 'base.demolishRefund': '拆除返还',
  'base.repair': '修复（{coins} 金币）', 'base.upgrade': '升级', 'base.demolish': '拆除', 'base.hordePreview': '第 {day} 天 · 尸潮预告',
  'base.coreDamaged': '⚠ 核心血量 {hp}/{maxHp}，建议先修复！', 'base.coreHealth': '核心血量 {hp}/{maxHp}', 'base.attackSide': '{side}（{count} 格）',
  'base.listSeparator': '、', 'base.allSidesBlocked': '四边全被堵死——僵尸将原地强拆', 'base.attackDirection': '进攻方向',
  'base.waveScale': '{waves} 波 · 共约 {total} 只 · 僵尸 Lv.{level}', 'base.bossLast': ' · 末波有 Boss！', 'base.eliteLast': ' · 末波保底精英',
  'base.waveScaleLabel': '波次规模', 'base.enemyType': '敌人类型', 'base.guaranteedLast': '（末波保底）', 'base.fight': '迎战', 'base.prepareMore': '再准备下'
});
