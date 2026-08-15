type EventHandler = (data: any) => void;

/**
 * 简单的事件总线
 * 核心逻辑与表现层解耦的关键
 */
class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit(event: string, data?: any): void {
    const list = this.handlers.get(event);
    if (!list) return;
    for (const handler of list) {
      handler(data);
    }
  }
}

export const eventBus = new EventBus();

/** 游戏事件枚举 */
export const GameEvents = {
  // 棋盘变化
  GRID_ITEM_CHANGED: 'grid.item.changed',
  GRID_ITEM_MERGED: 'grid.item.merged',
  GRID_ITEM_MOVED: 'grid.item.moved',
  GRID_ITEM_SPAWNED: 'grid.item.spawned',
  GRID_BUBBLE_BOMB: 'grid.bubble.bomb',

  // 资源变化
  RESOURCE_CHANGED: 'resource.changed',

  // 玩家升级（data: { level, rewards: [道具id, 数量][] }）
  ROLE_LEVEL_UP: 'role.level.up',

  // 任务
  TASK_UPDATED: 'task.updated',
  TASK_DONE: 'task.done',

  // 背包
  BAG_UPDATED: 'bag.updated',

  // 卡片
  CARD_UPDATED: 'card.updated',

  // 基地建筑变化
  BASE_CHANGED: 'base.changed',

  // 加速装置结束
  SPEED_UP_END: 'speed.up.end',

  // 系统
  TOAST_SHOW: 'toast.show',

  // 夜晚战斗（剧情系统等用）
  NIGHT_ZOMBIE_SPAWN: 'night.zombie.spawn',
  NIGHT_END: 'night.end',
  // 夜晚战斗特效（纯表现层用；data 均为格子坐标）
  // 塔开火 { fromRow, fromCol, toRow, toCol, cfgId }
  NIGHT_TOWER_FIRE: 'night.tower.fire',
  // 英雄开火 { fromRow, fromCol, toRow, toCol, heroKey, damage }
  NIGHT_HERO_FIRE: 'night.hero.fire',
  // 僵尸攻击建筑 { fromRow, fromCol, toRow, toCol }
  NIGHT_ZOMBIE_ATTACK: 'night.zombie.attack',
  // 僵尸死亡 { row, col, cfgId }
  NIGHT_ZOMBIE_DIE: 'night.zombie.die',

  // 剧情：有一段剧情待播放（data: { beat }）
  STORY_PLAY: 'story.play',

  // 英雄加入堡垒（data: { key }，英雄配置 hero.json 的 key）
  HERO_JOINED: 'hero.joined',

  // 后期网络预留
  NET_SYNC_STATE: 'net.sync.state'
} as const;
