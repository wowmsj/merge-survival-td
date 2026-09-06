import { eventBus, GameEvents } from '../../core/events/EventBus';

/**
 * GA4 埋点（自建上报，不依赖 gtag.js）
 *
 * 为什么不用官方 gtag.js：游戏跑在 itch.io 的跨域 iframe 里，浏览器禁用第三方
 * cookie 时 gtag 即使配了 client_storage:'none' 也静默不发数据（已实测验证）。
 * 因此直接按 GA4 Measurement Protocol v2 的格式 POST 到 /g/collect：
 * - client_id 自行生成并持久化到 localStorage，保证同一玩家多次访问是同一用户（留存的前提）
 * - session id / session count / hit 序号按 gtag 的约定自行维护
 * - localStorage 不可用时退化为每次随机 cid（数据仍能发出，只是该玩家无法跨会话识别）
 */
const TID = 'G-N4P6VYLS6H';
const ENDPOINT = 'https://www.google-analytics.com/g/collect';
const CID_KEY = 'mf_ga_cid';
const SCT_KEY = 'mf_ga_sct';

function randomCid(): string {
  return `${Math.floor(Math.random() * 2147483647)}.${Math.floor(Date.now() / 1000)}`;
}

// 是否是首次创建 cid 的新用户（用于 first_visit 事件）
let isNewUser = false;
const cid = (() => {
  try {
    let v = localStorage.getItem(CID_KEY);
    if (!v) {
      v = randomCid();
      localStorage.setItem(CID_KEY, v);
      isNewUser = true;
    }
    return v;
  } catch {
    isNewUser = true;
    return randomCid();
  }
})();

const sid = Math.floor(Date.now() / 1000);
const sct = (() => {
  try {
    const n = parseInt(localStorage.getItem(SCT_KEY) || '0', 10) + 1;
    localStorage.setItem(SCT_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
})();

let seq = 0;

/** 发送一条 GA4 事件；params 中数字走 epn.*（数值参数），其余走 ep.*（文本参数） */
export function track(eventName: string, params: Record<string, unknown> = {}, extra: Record<string, string> = {}): void {
  seq += 1;
  const p = new URLSearchParams({
    v: '2',
    tid: TID,
    cid,
    sid: String(sid),
    sct: String(sct),
    seg: '1',
    _s: String(seq),
    dl: location.href,
    dt: document.title,
    ul: (navigator.language || '').toLowerCase(),
    sr: `${window.screen.width}x${window.screen.height}`,
    en: eventName,
    ...extra
  });
  for (const [k, val] of Object.entries(params)) {
    p.set(typeof val === 'number' ? `epn.${k}` : `ep.${k}`, String(val));
  }
  const url = `${ENDPOINT}?${p.toString()}`;
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url, '')) return;
  } catch { /* fall through to fetch */ }
  fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, body: '' }).catch(() => {});
}

/**
 * 初始化埋点：
 * - first_visit / session_start / page_view：按 GA4 约定补齐，保证用户、会话、留存报表正常
 * - game_start：每次游戏启动，带语言和屏幕尺寸
 * - night_end：每晚战斗结束，带 won/day，用于看玩家活到第几天、在哪天流失
 */
export function initAnalytics(): void {
  if (isNewUser) track('first_visit', {}, { _fv: '1' });
  track('session_start', {}, { _ss: '1' });
  track('page_view');
  track('game_start', {
    lang: navigator.language,
    screen: `${window.innerWidth}x${window.innerHeight}`
  });

  eventBus.on(GameEvents.NIGHT_END, (data: { won: boolean; day: number }) => {
    track('night_end', { won: data.won, day: data.day });
  });
}
