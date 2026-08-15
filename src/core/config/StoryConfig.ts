import storyJson from './data/story.json';
import { IGameState } from '../types';
import { getHeroConfig } from './HeroConfig';

/**
 * 剧情配置
 * beat：一段剧情（触发器 + 台词序列），每个 beat 只播一次（记录在 state.storySeen）
 */

/** 触发器类型：
 *  newGame   新开局
 *  merge     首次合成成功
 *  task      首次提交订单
 *  coin      金币持有量 >= value
 *  nightWin  第一次夜晚防守胜利
 *  nightLose 第一次夜晚防守失败（时间回溯设定）
 *  level     玩家等级 >= value
 *  building  首次建成建筑 id=value
 *  blueprint 首次使用蓝图解锁建筑 id=value
 *  item      物品 id=value 首次出现在棋盘
 *  zombie    首次出现 moveType=value 的僵尸（ground/fly/burrow）
 *  day       存活到第 value 天
 */
export interface IStoryTrigger {
  type: 'newGame' | 'merge' | 'task' | 'coin' | 'nightWin' | 'nightLose' | 'level' | 'building' | 'blueprint' | 'item' | 'zombie' | 'day';
  value?: number | string;
}

export interface IStoryLine {
  /** 角色 key（见 STORY_CHARACTERS），narrator 为旁白 */
  who: string;
  text: string;
}

export interface IStoryBeat {
  id: number;
  chapter: number;
  trigger: IStoryTrigger;
  lines: IStoryLine[];
  /** 播完该 beat 后额外打赏的金币（老鬼任务打赏），入账到 resources.coin */
  rewardCoin?: number;
  /** 打赏 toast 文案（缺省：「{首个说话角色}额外打赏了 X 金币」），用于战利品折现等非打赏场景 */
  rewardText?: string;
  /** 播完该 beat 后该英雄（hero.json key）加入堡垒，可部署到内圈协防 */
  joinHero?: string;
  /** 播完该 beat 后投放到棋盘的道具 id 列表（棋盘满则进卡片列表），如流浪猫窝事件 */
  spawnProps?: number[];
}

/** 角色表：name 显示名，texture 立绘纹理 key（narrator 无立绘，无 texture 时只显示名牌） */
export const STORY_CHARACTERS: Record<string, { name: string; texture?: string }> = {
  narrator: { name: '' },
  hero: { name: '阿合', texture: 'char-hero' },
  laogui: { name: '老鬼', texture: 'char-laogui' },
  xiaoman: { name: '小满', texture: 'char-xiaoman' },
  beian: { name: '北岸', texture: 'char-beian' },
  // 《合合堡垒》角色
  mancang: { name: '满仓', texture: 'char-mancang' },
  laoqiang: { name: '老枪', texture: 'char-laoqiang' },
  pangshen: { name: '胖婶', texture: 'char-pangshen' },
  doctor: { name: '白医生', texture: 'char-doctor' },
  xiaodian: { name: '小电', texture: 'char-xiaodian' },
  douzi: { name: '豆子', texture: 'char-douzi' },
  wensente: { name: '文森特', texture: 'char-wensente' },
  tiezhua: { name: '铁爪', texture: 'char-tiezhua' },
  officer: { name: '收编官', texture: 'char-officer' }
};

export const STORY_BEATS = storyJson as unknown as IStoryBeat[];

/**
 * 主线剧情（剧情回顾面板收录范围）：序章（newGame）+ 天数章节（day）。
 * 引导类 beat（merge/coin/building/blueprint/task/item/zombie/level/nightWin/nightLose）不收录。
 */
export function getMainStoryBeats(): IStoryBeat[] {
  return STORY_BEATS
    .filter(b => b.trigger.type === 'newGame' || b.trigger.type === 'day')
    .sort((a, b) => a.chapter - b.chapter);
}

/** 未解锁章节展示给玩家的解锁条件 */
export function getUnlockCondition(beat: IStoryBeat): string {
  const t = beat.trigger;
  if (t.type === 'newGame') return '开始新游戏解锁';
  if (t.type === 'day') return `存活到第 ${t.value} 天解锁`;
  return '继续游戏解锁';
}

/** 按触发器取未看过的 beat（按 id 升序） */
export function getBeatsByTrigger(
  type: IStoryTrigger['type'],
  value: number | string | undefined,
  seen: Set<number>
): IStoryBeat[] {
  return STORY_BEATS.filter(b => {
    if (b.trigger.type !== type || seen.has(b.id)) return false;
    if (value === undefined) return true;
    if (type === 'level' || type === 'day' || type === 'coin') return Number(b.trigger.value) <= Number(value);
    // task：带 value 的 beat 精确匹配任务 id；无 value 的通用 task beat 任意任务完成都触发
    if (type === 'task') return b.trigger.value === undefined || Number(b.trigger.value) === Number(value);
    return b.trigger.value === value;
  }).sort((a, b) => a.id - b.id);
}

/**
 * 该任务是否有专属剧情（trigger task + value=任务 id）。
 * 有专属剧情的任务，奖励由剧情对白代为发放（老鬼打赏），
 * 场景层不要再补临时奖励对话，否则同一件事老鬼说一遍、满仓又说一遍。
 */
export function hasTaskStoryBeat(taskId: number): boolean {
  return STORY_BEATS.some(b => b.trigger.type === 'task' && Number(b.trigger.value) === taskId);
}

/** 角色图鉴资料：称号 + 背景故事（无剧透版，反转梗不写进来） */
export const CHARACTER_BIOS: Record<string, { title: string; bio: string }> = {
  hero: { title: '堡垒 7 号继承人', bio: '外婆带大的合成师学徒。穷、破、被所有人看不起，但手里握着半块合成核心——「这座堡垒，只收尸潮，不收叛徒。」' },
  mancang: { title: 'AI 鹦鹉', bio: '外婆留下的旧 AI，嘴碎，全堡垒的吐槽担当。体内存着外婆的加密日志，随堡垒壮大逐段解锁。' },
  laogui: { title: '黑市商人', bio: '跑黑市的订单贩子，消息灵通、出手大方。凑齐他要的货，星星和金币少不了你。' },
  laoqiang: { title: '看门老兵', bio: '话少酒多的门卫，枪法奇准。没人知道他从哪来，他自己也绝口不提。' },
  pangshen: { title: '颠勺厨神', bio: '背着铁锅来投奔的胖大婶，一勺烩面救活全堡垒。' },
  doctor: { title: '冷面医生', bio: '诊所被烧后流浪的医生，毒舌但心软。医药箱最底层锁着一叠不愿示人的旧病历。' },
  xiaodian: { title: '少女工程师', bio: '15 岁的天才电工，话痨，拆什么都能装回去。' },
  douzi: { title: '拾荒小孩', bio: '10 岁，全城最熟的拾荒者，堡垒里的情报贩子。' },
  xiaoman: { title: '投奔者', bio: '带着小黑投奔堡垒的孩子，会干活，吃得也不多。' },
  beian: { title: '北岸营地', bio: '无线电另一头的幸存者营地。「守住它，撑过冬天，北上找我们。」' },
  tiezhua: { title: '邻居堡垒领主', bio: '断水断粮逼迁的恶邻，放话七天收房。' },
  officer: { title: '钢铁议会收编官', bio: '带着 30 罐罐头上门，想买下这座「垃圾堡垒」。离开时打了个神秘的电话。' },
  wensente: { title: '议会联络官', bio: '温文尔雅的议会特派员，一直暗中照顾堡垒 7 号。' }
};

/** 角色图鉴展示顺序（玩家恒在第一位） */
export const CHARACTER_GALLERY_ORDER = [
  'hero', 'mancang', 'laogui', 'laoqiang', 'pangshen', 'doctor',
  'xiaodian', 'douzi', 'xiaoman', 'beian', 'tiezhua', 'officer', 'wensente'
];

/** 已遇到的角色：玩家恒在；其余为「已播剧情里开口说过话」的角色（按 storySeen 里的 beat 台词统计） */
export function getMetCharacters(state: IGameState): Set<string> {
  const met = new Set<string>(['hero']);
  const seen = new Set(state.storySeen);
  for (const b of STORY_BEATS) {
    if (!seen.has(b.id)) continue;
    for (const l of b.lines) {
      if (l.who !== 'narrator') met.add(l.who);
    }
  }
  return met;
}

/**
 * 按 storySeen 补发英雄（joinHero 是后加的能力，旧存档播过入队剧情却没入队）。
 * 幂等：已在 state.heroes 里的不会重复添加。
 */
export function backfillJoinedHeroes(state: IGameState): void {
  const seen = new Set(state.storySeen);
  for (const b of STORY_BEATS) {
    if (!b.joinHero || !seen.has(b.id)) continue;
    if (!getHeroConfig(b.joinHero)) continue;
    if (!state.heroes.some(h => h.key === b.joinHero)) {
      state.heroes.push({ key: b.joinHero, row: -1, col: -1 });
    }
  }
}
