/**
 * 链内等级图标共用统计 + 差异化生成计划
 *
 * 对每条合成链（type/typeson 分组，blessId 串级）列出等级序列和
 * 当前各等级实际命中的图标 key（复刻 ItemIconMap 的解析逻辑，
 * 含 icon_p<propId> 每级独立 key 优先规则），标记链内共用。
 *
 * 输出：
 *  - 控制台：逐链明细 + 汇总（多少条链、多少个等级需要新增独立图标）
 *  - scripts/icon-chain-plan.json：需新增图标的等级清单
 *    （id/name/链/等级位置/当前共用 key），供 generate-assets.js 的
 *    PROP_ICONS_3 组建任务用。
 *
 * 运行：node scripts/icon-chain-stats.js
 */
const fs = require('fs');
const path = require('path');
const props = require(path.join(__dirname, '..', 'src', 'core', 'config', 'data', 'prop_prop.json'));

// ---- 从 ItemIconMap.ts 提取配置（正则解析，避免引入 TS 编译） ----
const mapSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'phaser', 'config', 'ItemIconMap.ts'), 'utf8');

function extractArray(name) {
  const m = mapSrc.match(new RegExp('const\\s+' + name + '[^=]*=\\s*\\[([\\s\\S]*?)\\];'));
  if (!m) throw new Error(`未找到 ${name}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

function extractRecord(name) {
  const m = mapSrc.match(new RegExp('const\\s+' + name + '[^=]*=\\s*\\{([\\s\\S]*?)\\};'));
  if (!m) throw new Error(`未找到 ${name}`);
  const rec = {};
  for (const x of m[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*'([^']+)'/g)) {
    rec[x[1]] = x[2];
  }
  return rec;
}

const ITEM_ICON_KEYS = extractArray('ITEM_ICON_KEYS');
const KEY_SET = new Set(ITEM_ICON_KEYS);
const ALIAS = extractRecord('ICON_KEY_ALIAS');
const OVERRIDE_RAW = extractRecord('PROP_ICON_OVERRIDE');
const OVERRIDE = {};
for (const [k, v] of Object.entries(OVERRIDE_RAW)) OVERRIDE[Number(k)] = v;

// 每级独立 key icon_p<propId>：仅当 PNG 已生成（assets/images/ 下存在）才算生效，
// 模拟运行时 getItemIconKey(propId, textures) 的 textures.exists 检查
const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images');
const idsMatch = mapSrc.match(/const\s+PER_LEVEL_ICON_PROP_IDS[^=]*=\s*\[([\s\S]*?)\];/);
const PER_LEVEL_IDS = idsMatch ? [...idsMatch[1].matchAll(/(\d+)/g)].map(x => Number(x[1])) : [];
const PER_LEVEL_SET = new Set(
  PER_LEVEL_IDS.filter(id => fs.existsSync(path.join(IMAGES_DIR, `icon_p${id}.png`))).map(id => `icon_p${id}`)
);

// ---- 与 ItemIconMap.ts 相同的解析逻辑（icon_p<propId> 仅在图已生成时优先） ----
const byId = new Map(props.map(r => [r.id, r]));
const PREV = new Map();
for (const r of props) {
  if (r.blessId > 0 && !PREV.has(r.blessId)) PREV.set(r.blessId, r.id);
}

function direct(iconField) {
  if (!iconField) return null;
  const seg = String(iconField).split('|').pop().trim();
  const key = ALIAS[seg] ?? seg;
  return KEY_SET.has(key) ? key : null;
}

function resolve(propId) {
  const own = `icon_p${propId}`;
  if (PER_LEVEL_SET.has(own)) return own;
  const seen = new Set([propId]);
  let frontier = [propId];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      const p = byId.get(id);
      if (!p) continue;
      const o = OVERRIDE[id];
      if (o && KEY_SET.has(o)) return o;
      const d = direct(p.icon);
      if (d) return d;
      if (p.blessId > 0 && !seen.has(p.blessId)) { seen.add(p.blessId); next.push(p.blessId); }
      const prev = PREV.get(id);
      if (prev !== undefined && !seen.has(prev)) { seen.add(prev); next.push(prev); }
    }
    frontier = next;
  }
  return null;
}

// ---- 按 type/typeson 链分组，链内按 blessId 顺序排等级 ----
const chains = new Map();
for (const p of props) {
  const ck = `${p.type}/${p.typeson}`;
  if (!chains.has(ck)) chains.set(ck, []);
  chains.get(ck).push(p);
}

function orderChain(rows) {
  const ids = new Set(rows.map(r => r.id));
  const hasPrev = new Set(rows.filter(r => ids.has(r.blessId)).map(r => r.blessId));
  const heads = rows.filter(r => !hasPrev.has(r.id));
  const nextOf = new Map(rows.filter(r => ids.has(r.blessId)).map(r => [r.id, r.blessId]));
  const ordered = [];
  const seen = new Set();
  for (const h of heads) {
    let cur = h.id;
    while (cur && ids.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      ordered.push(byId.get(cur));
      cur = nextOf.get(cur);
    }
  }
  // 兜底：环或断链时按 luna 补上
  const rest = rows.filter(r => !seen.has(r.id)).sort((a, b) => a.luna - b.luna || a.id - b.id);
  return [...ordered, ...rest];
}

let multiChains = 0;
let sharingChains = 0;
let needLevels = 0;
const plan = [];

console.log(`纹理 key 总数 ${ITEM_ICON_KEYS.length}；道具 ${props.length} 种，链 ${chains.size} 条\n`);

for (const [ck, rows0] of [...chains.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
  const rows = orderChain(rows0);
  if (rows.length < 2) continue;
  multiChains++;
  const resolved = rows.map(r => resolve(r.id));
  const keyCount = new Map();
  for (const k of resolved) keyCount.set(k, (keyCount.get(k) || 0) + 1);
  const shared = resolved.map(k => (keyCount.get(k) || 0) > 1);
  if (!shared.some(Boolean)) continue;
  sharingChains++;
  const tn = rows[0].typename || rows[0].sonname || rows[0].name || '';
  console.log(`链 ${ck}（${tn}）${rows.length} 级:`);
  rows.forEach((r, i) => {
    const k = resolved[i];
    const tag = shared[i] ? '共用' : '独有';
    const need = shared[i] && k !== null;
    if (need) {
      needLevels++;
      plan.push({ id: r.id, name: r.name, chain: ck, idx: i, len: rows.length, luna: r.luna, baseKey: k });
    }
    console.log(`  [${tag}] Lv.${i + 1} id=${r.id} ${r.name}  ->  ${k}${need ? '   ← 需新增 icon_p' + r.id : ''}`);
  });
  console.log('');
}

console.log(`===== 汇总 =====`);
console.log(`多级链 ${multiChains} 条，其中存在等级共用的 ${sharingChains} 条`);
console.log(`每级独立图标计划内 ${PER_LEVEL_IDS.length} 个，已生成生效 ${PER_LEVEL_SET.size} 个`);
console.log(`需要新增独立图标的等级数：${needLevels}`);

fs.writeFileSync(
  path.join(__dirname, 'icon-chain-plan.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), total: needLevels, levels: plan }, null, 1)
);
console.log(`计划已写入 scripts/icon-chain-plan.json（${needLevels} 条）`);
