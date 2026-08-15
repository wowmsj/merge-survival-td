/**
 * 道具棋子图标纹理映射
 *
 * 配置表（prop_prop.json）每条道具的 icon 字段格式为 "prop1|icon_b1"，
 * 第二段是原游戏的纹理名；assets/images/ 下已加载的图标 key 与之对应。
 *
 * 解析规则：
 * 0. 每级独立：icon_p<propId> 已生成（在 ITEM_ICON_KEYS 内）时优先使用
 *    （链内等级差异化，渐进生成——生成多少生效多少，未生成的等级继续走下述兜底）；
 * 1. 单 id 覆盖：PROP_ICON_OVERRIDE 直接指定（用于 icon 字段撞名的道具）；
 * 2. 直接命中：icon 字段第二段（含拼写错误修正/别名）是已加载纹理 key；
 * 3. 同链共用：该等级没有对应图标时，沿合成链（blessId 双向）取最近一个有图标的等级共用；
 * 4. 整条链都没有图标 → 返回 null，调用方保持色块+文字渲染。
 *
 * 以后新增图标：把 PNG 加入 scripts/resize-assets.js 和下方 ITEM_ICON_KEYS 即可。
 */

import { getProp, getAllProps } from '../../core/config/PropConfig';

/**
 * 链内与其他等级共用图标、需要每级独立图标的道具 id
 * （由 scripts/icon-chain-stats.js 统计，对应 icon-chain-plan.json；
 * 对应纹理 key 为 icon_p<propId>，生成多少生效多少）
 */
const PER_LEVEL_ICON_PROP_IDS: readonly number[] = [
  10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010, 10011, 10012, 10013, 10014, 10015, 10016,
  10017, 10018, 10019, 10020, 10021, 10022, 10023, 10024, 10025, 10026, 10027, 10028, 20001,
  20002, 20003, 20004, 20005, 20006, 20007, 20008, 20009, 20010, 20011, 20012, 20013,
  20014, 20015, 20016, 20017, 20018, 20019, 20020, 20021, 20022, 20023, 20024, 20025, 20026, 20027, 20028,
  20029, 20030, 20031, 20032, 20033, 20034, 20035, 20036, 20037, 20038, 20039, 20040,
  20041, 20042, 20043, 20044, 20045, 20046, 20047, 20048, 20049, 20050, 20051, 20052,
  20053, 20054, 20055, 20056, 20057, 20058, 20059, 20060, 20061, 20062, 20063, 20064, 20065, 20066,
  20067, 20068, 20069, 20070, 20071, 20072, 20073, 20074, 20075, 20076, 20077, 30001,
  30002, 30003, 30004, 30005, 30006, 30007, 30008, 30009, 30010, 30011, 30012, 30013,
  30014, 30015, 30016, 30017, 30018, 30019, 30020, 30021, 30022, 30023, 30024, 30025,
  30026, 30027, 30028, 30029, 30030, 30031, 30032, 30033, 30034, 30035, 30036, 30037,
  30038, 30039, 30040, 30041, 30042, 30043, 30044, 30045, 30046, 30047, 30048, 30049,
  30050, 30051, 30052, 30053, 30054, 30055, 30056, 30057, 30058, 30059, 30060, 30061,
  30062, 30063, 30064, 30065, 30066, 30067, 30068, 30069, 30070, 30071, 30072, 30073, 30074, 30075,
  30076, 30077, 30078, 30079, 30080, 30081, 30082, 40001, 40002, 40003, 40004, 40005, 40006, 40007,
  40008, 40009, 40010, 40011, 40012, 40013, 40014, 40015, 40016, 40017, 40018, 40019,
  40020, 40021, 40022, 40023, 40024, 40025, 40026, 40027, 40028, 40029, 40030, 40031,
  40032, 40033, 40034, 40035, 40036, 40037, 40038, 40039, 40040, 40041, 40042, 40043,
  40044, 40045, 40046, 40047, 40048, 40049, 40050, 40051, 40052, 40053, 40054, 40055,
  40056, 50001, 50002, 50003, 50004, 50005, 50006, 50007, 50008, 50009, 50010, 50011,
  50012, 50013, 50014, 50015, 50016, 50017, 50018, 50019, 50020, 50021, 50022, 50024,
  50025, 50026, 50027, 50028, 50029, 50030, 50031, 50032, 50033, 50034, 50035, 60001,
  60002, 60003, 60004, 60005, 60006, 60007, 60008, 60009, 60010, 60011, 60012, 60013,
  60014, 60015, 60024, 60025, 60026, 60027, 60028, 60029, 60030, 60031, 201, 202,
  203, 204, 205, 211, 206, 207, 208, 209, 301, 302, 303, 304,
  801, 802, 803, 804, 805, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 2006,
  2007,
  // 建筑蓝图类：发射器 70001~70017 + 蓝图链 70101~70168（scripts/blueprint-icon-tasks.js）
  70001, 70002, 70003, 70004, 70005, 70006, 70007, 70008, 70009, 70010, 70011,
  70012, 70013, 70014, 70015, 70016, 70017,
  70101, 70102, 70103, 70104, 70105, 70106, 70107, 70108, 70109, 70110, 70111,
  70112, 70113, 70114, 70115, 70116, 70117, 70118, 70119, 70120, 70121, 70122,
  70123, 70124, 70125, 70126, 70127, 70128, 70129, 70130, 70131, 70132, 70133,
  70134, 70135, 70136, 70137, 70138, 70139, 70140, 70141, 70142, 70143, 70144,
  70145, 70146, 70147, 70148, 70149, 70150, 70151, 70152, 70153, 70154, 70155,
  70156, 70157, 70158, 70159, 70160, 70161, 70162, 70163, 70164, 70165, 70166,
  70167, 70168
];

/** 已生成并加载的道具图标纹理 key（与 scripts/resize-assets.js 输出一致） */
export const ITEM_ICON_KEYS: readonly string[] = [
  'icon_a1', 'icon_a2', 'icon_a3', 'icon_a4', 'icon_b1', 'icon_b2', 'icon_b3',
  'icon_c1', 'icon_d1', 'icon_e1', 'icon_f1', 'icon_h1', 'icon_i10',
  'icon_j1', 'icon_k1', 'icon_kk1', 'icon_kkk1', 'icon_kkkk1', 'icon_llll1',
  'icon_m1', 'icon_m2', 'icon_m3', 'icon_mf1', 'icon_mh1', 'icon_md1',
  'icon_me1', 'icon_mc1', 'icon_o1', 'icon_oa1', 'icon_ob1', 'icon_oc1',
  'icon_60001', 'icon_60005', 'icon_60008', 'icon_60011', 'icon_60020', 'icon_60024',
  'prop_coin1', 'prop_energy1', 'prop_bigpingbox', 'prop_bigblackbox', 'prop_blackbox',
  // 第三批：补全无图标链（货币/宝箱/补给/手套/食物/宣传/课程等）
  'res-icon-diamond', 'res-icon-star', // 复用 HUD 资源图标（钻石/星星）
  'prop_exp', 'prop_dress', 'prop_diamonds1', 'prop_diamonds3', 'prop_exp1', 'prop_exp3',
  'prop_fudai', 'prop_bag', 'prop_ccbox', 'prop_coinbox', 'prop_powerbox',
  'prop_goose1', 'prop_goose3', 'prop_giftbox',
  'prop_toolchest', 'prop_seedbox', 'prop_gymbox', 'prop_coolerbox',
  'prop_supply_plant', 'prop_supply_gym', 'prop_supply_drink', 'prop_supply_course', 'prop_supply_recycle',
  'icon_b15', 'icon_b17',
  'icon_d11', 'icon_d13', 'icon_d15', 'icon_d16', 'icon_d17', 'icon_d19',
  'icon_h8', 'icon_h10', 'icon_h12', 'icon_h14', 'icon_h16',
  'iion_i1', 'iion_i5', 'iion_i9',
  'icon_j12', 'icon_j16', 'icon_l1', 'icon_l4',
  'icon_ll1', 'icon_ll3', 'icon_lll1', 'icon_lll3', 'icon_lll5',
  'icon_ma1', 'icon_ma4',
  'icon_60016', 'icon_60017', 'icon_60018', 'icon_60019', 'icon_60022', 'icon_60023',
  // 第四批：链内等级差异化，icon_p<propId> 每级独立（scripts/icon-chain-stats.js 统计，
  // scripts/generate-assets.js 的 PROP_ICONS_3 组生成；渐进生效，未生成的走兜底）
  ...PER_LEVEL_ICON_PROP_IDS.map(id => `icon_p${id}`)
];

const ITEM_ICON_KEY_SET = new Set<string>(ITEM_ICON_KEYS);

/** 配置表 icon 字段中的已知拼写错误/撞名别名 → 正确纹理 key */
const ICON_KEY_ALIAS: Record<string, string> = {
  ieon_e1: 'icon_e1', // 20030 塑料板
  ihon_h1: 'icon_h1', // 20052 握力器
  // 货币类：复用已有纹理
  prop_coin0: 'prop_coin1', // 101 金币
  prop_diamond0: 'res-icon-diamond', // 102 钻石
  prop_power1: 'prop_energy1', // 103 体力
  prop_power2: 'prop_energy1', // 210 体力（大）
  prop_star: 'res-icon-star', // 105 星星
  ui_jy: 'prop_exp', // 104 经验
  icon_dress: 'prop_dress', // 305 装扮券
  // 小型功能道具：复用大号图标
  prop_coin22: 'icon_60020', // 806 小型无限能量
  prop_coin23: 'icon_60001', // 807 小型充能器
  prop_coin24: 'icon_60005', // 808 小型拆分器
  prop_coin25: 'icon_60024', // 809 小型加速器
  // 背包类
  prop_coin16: 'prop_bag', // 401 背包
  icon_60021: 'prop_bag', // 60021 扩容背包
  // 经验链（301~304）
  prop_coin12: 'prop_exp1',
  prop_coin13: 'prop_exp1',
  prop_coin14: 'prop_exp3',
  prop_coin15: 'prop_exp3',
  // 鹅厂系列发射器箱子（1010 礼物盒 / 2001~2004 工具箱 / 2005~2010 补给箱）
  prop_goose4: 'prop_giftbox',
  prop_goose5: 'prop_toolchest',
  prop_goose6: 'prop_seedbox',
  prop_goose7: 'prop_gymbox',
  prop_goose8: 'prop_coolerbox',
  prop_goose9: 'prop_supply_plant',
  prop_goose10: 'prop_supply_gym',
  prop_goose11: 'prop_supply_gym',
  prop_goose12: 'prop_supply_drink',
  prop_goose13: 'prop_supply_course',
  prop_goose14: 'prop_supply_recycle'
};

/**
 * 单 id 图标覆盖（icon 字段与其他道具撞名、别名无法区分时用）
 * 206~209 钻石链与 306 福袋的 icon 字段同为 prop_diamond1~4，按 id 区分
 */
const PROP_ICON_OVERRIDE: Record<number, string> = {
  206: 'prop_diamonds1', // 一点钻石
  207: 'prop_diamonds1', // 少量钻石
  208: 'prop_diamonds3', // 大量钻石
  209: 'prop_diamonds3', // 超多钻石
  306: 'prop_fudai' // 福袋
};

/** 反向合成链：blessId → 前一级 id（同链共用图标时往低级找） */
const PREV_ID_MAP = new Map<number, number>();
for (const row of getAllProps()) {
  if (row.blessId > 0 && !PREV_ID_MAP.has(row.blessId)) {
    PREV_ID_MAP.set(row.blessId, row.id);
  }
}

const keyCache = new Map<number, string | null>();

/** icon 字段直接解析出已加载纹理 key，未命中返回 null */
function directIconKey(iconField: string | undefined): string | null {
  if (!iconField) return null;
  const seg = iconField.split('|').pop()!.trim();
  const key = ICON_KEY_ALIAS[seg] ?? seg;
  return ITEM_ICON_KEY_SET.has(key) ? key : null;
}

/** 纹理存在性检查（传 Phaser 场景的 textures 即可） */
export interface TextureChecker {
  exists(key: string): boolean;
}

/**
 * 取道具棋子的图标纹理 key（带同链最近等级共用），无可用图标返回 null。
 * 传入 textures 时启用每级独立图标 icon_p<propId> 优先（纹理确实存在才生效，
 * 未生成的等级继续走兜底链共用）；不传则保持旧兜底行为。
 * 注意：兜底结果只保证 key 在已生成清单内，调用方仍需 textures.exists 兜底加载失败的情况。
 */
export function getItemIconKey(propId: number, textures?: TextureChecker): string | null {
  // 每级独立图标不参与缓存：纹理集合同一会话内不变，但缓存键不含 textures，
  // 统一在缓存前处理，避免有/无 textures 两种调用互相污染
  if (textures) {
    const ownKey = `icon_p${propId}`;
    if (ITEM_ICON_KEY_SET.has(ownKey) && textures.exists(ownKey)) return ownKey;
  }
  if (keyCache.has(propId)) return keyCache.get(propId) ?? null;
  const key = resolveIconKey(propId);
  keyCache.set(propId, key);
  return key;
}

/** BFS 沿合成链双向找最近有图标的等级 */
function resolveIconKey(propId: number): string | null {
  const seen = new Set<number>([propId]);
  let frontier = [propId];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const id of frontier) {
      const prop = getProp(id);
      if (!prop) continue;
      const override = PROP_ICON_OVERRIDE[id];
      if (override && ITEM_ICON_KEY_SET.has(override)) return override;
      const direct = directIconKey(prop.icon);
      if (direct) return direct;
      if (prop.blessId > 0 && !seen.has(prop.blessId)) {
        seen.add(prop.blessId);
        next.push(prop.blessId);
      }
      const prev = PREV_ID_MAP.get(id);
      if (prev !== undefined && !seen.has(prev)) {
        seen.add(prev);
        next.push(prev);
      }
    }
    frontier = next;
  }
  return null;
}
