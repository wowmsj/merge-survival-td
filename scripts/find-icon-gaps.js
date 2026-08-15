/**
 * 图标缺口盘点：实时解析 src/phaser/config/ItemIconMap.ts 的
 * ITEM_ICON_KEYS / ICON_KEY_ALIAS / PROP_ICON_OVERRIDE，复刻其 BFS 逻辑，
 * 列出 getItemIconKey 返回 null 的道具，按合成链（type/typeson）分组。
 * 运行：node scripts/find-icon-gaps.js
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
// 第四批每级独立 key（icon_p<propId>）：以 id 清单形式定义在 ItemIconMap 中，
// 对“是否有图标”的判定无影响（未生成时走 BFS 兜底），仅用于汇总展示
const idsMatch = mapSrc.match(/const\s+PER_LEVEL_ICON_PROP_IDS[^=]*=\s*\[([\s\S]*?)\];/);
const PER_LEVEL_COUNT = idsMatch ? [...idsMatch[1].matchAll(/(\d+)/g)].length : 0;
const ALIAS = extractRecord('ICON_KEY_ALIAS');
const OVERRIDE_RAW = extractRecord('PROP_ICON_OVERRIDE');
const OVERRIDE = {};
for (const [k, v] of Object.entries(OVERRIDE_RAW)) OVERRIDE[Number(k)] = v;

// ---- 与 ItemIconMap.ts 相同的解析逻辑 ----
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

// ---- 按 type/typeson 链分组统计 ----
const chains = new Map();
for (const p of props) {
  const ck = `${p.type}/${p.typeson}`;
  if (!chains.has(ck)) chains.set(ck, []);
  chains.get(ck).push(p);
}

let covered = 0, missing = 0;
const missingChains = [];
for (const [ck, rows] of chains) {
  const miss = rows.filter(r => resolve(r.id) === null);
  const hit = rows.length - miss.length;
  covered += hit;
  if (miss.length === 0) continue;
  missing += miss.length;
  missingChains.push({ ck, rows, miss });
}

console.log(`纹理 key 总数 ${ITEM_ICON_KEYS.length}（另有每级独立 key icon_p<propId> ${PER_LEVEL_COUNT} 个，渐进生成）；总计 ${props.length} 种道具：有图标 ${covered}，无图标 ${missing}\n`);
for (const { ck, rows, miss } of missingChains) {
  const tn = rows[0].typename || rows[0].sonname || '';
  console.log(`链 ${ck}（${tn}）全链 ${rows.length} 级，缺图标 ${miss.length} 级:`);
  for (const r of rows) {
    const iconSeg = String(r.icon || '').split('|').pop();
    const tag = resolve(r.id) ? '  有' : '  缺';
    console.log(`  ${tag} id=${r.id} Lv.${r.luna} ${r.name}  icon字段=${iconSeg}`);
  }
  console.log('');
}
