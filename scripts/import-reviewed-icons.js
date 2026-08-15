const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_ROOT = process.env.REVIEWED_ICON_ROOT || 'D:\\下载\\icon\\切图预览_全量复核';
const TARGET_ROOT = path.join(ROOT, 'assets', 'generated');
const BACKUP_ROOT = path.join(ROOT, 'assets', 'backup_originals', 'reviewed-import-20260808');
const PROPS = require(path.join(ROOT, 'src', 'core', 'config', 'data', 'prop_prop.json'));

// Source atlas number and its zero-based offset for each configured chain.
const CHAIN_SOURCES = {
  '1/1': [1, 0], '1/2': [2, 0], '1/3': [3, 0],
  '2/1': [4, 0], '2/2': [5, 0], '2/3': [6, 0], '2/4': [7, 0], '2/5': [8, 0],
  '2/6': [9, 0], '2/7': [10, 0], '2/8': [11, 0], '2/9': [12, 0], '2/10': [13, 0],
  '3/1': [14, 0], '3/2': [15, 0], '3/3': [16, 0], '3/4': [17, 0], '3/5': [18, 0],
  '3/6': [19, 0], '3/7': [20, 0], '3/8': [21, 0], '3/9': [22, 0], '3/10': [23, 0],
  '3/11': [24, 0], '4/1': [25, 0], '4/2': [26, 0], '4/3': [27, 0], '4/4': [27, 4],
  '4/5': [28, 0], '4/6': [29, 0], '4/7': [30, 0], '4/8': [31, 0], '5/1': [32, 0],
  '5/2': [33, 0], '5/3': [34, 0], '5/5': [35, 0], '6/1': [36, 0], '6/2': [37, 0],
  '6/3': [38, 0], '6/4': [39, 0], '6/11': [40, 0], '11/0': [58, 0], '12/0': [59, 0],
  '15/0': [60, 0], '21/0': [61, 0], '23/0': [62, 0], '25/0': [63, 0]
};
const NO_SOURCE_IDS = new Set([50036]);

function atlasFiles(number) {
  const prefix = `#${number} `;
  const pages = fs.readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
    .map(entry => ({ name: entry.name, ...pageRange(entry.name) }))
    .sort((a, b) => a.start - b.start || pageOrder(a.name) - pageOrder(b.name));
  return pages.flatMap(page => fs.readdirSync(path.join(SOURCE_ROOT, page.name))
    .filter(name => /^L\d+\.png$/i.test(name))
    .sort((a, b) => Number(a.slice(1, -4)) - Number(b.slice(1, -4)))
    .slice(0, page.count)
    .map(name => path.join(SOURCE_ROOT, page.name, name)));
}

function pageRange(name) {
  const match = name.match(/L(\d+)[\u2013-](\d+)/u);
  if (!match) return { start: 0, count: Infinity };
  return { start: Number(match[1]), count: Number(match[2]) - Number(match[1]) + 1 };
}

function pageOrder(name) {
  if (name.includes('第一张')) return 1;
  if (name.includes('第二张')) return 2;
  return 0;
}

function orderChain(rows) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const children = new Set(rows.filter(row => byId.has(row.blessId)).map(row => row.blessId));
  const ordered = [];
  const seen = new Set();
  for (const head of rows.filter(row => !children.has(row.id))) {
    for (let row = head; row && !seen.has(row.id); row = byId.get(row.blessId)) {
      ordered.push(row);
      seen.add(row.id);
    }
  }
  return ordered.concat(rows.filter(row => !seen.has(row.id)).sort((a, b) => a.luna - b.luna || a.id - b.id));
}

function buildMapping() {
  const filesByAtlas = new Map();
  const missingSources = [];
  const mapping = [];
  for (const [chain, source] of Object.entries(CHAIN_SOURCES)) {
    const [atlas, offset] = source;
    const files = filesByAtlas.get(atlas) || atlasFiles(atlas);
    filesByAtlas.set(atlas, files);
    const [type, typeson] = chain.split('/').map(Number);
    const levels = orderChain(PROPS.filter(row => row.type === type && row.typeson === typeson && !NO_SOURCE_IDS.has(row.id)));
    for (const [index, level] of levels.entries()) {
      const file = files[index + offset];
      if (!file) missingSources.push(`icon_p${level.id} <- #${atlas} L${index + offset + 1}`);
      else mapping.push({ id: level.id, source: file, target: path.join(TARGET_ROOT, `icon_p${level.id}.png`) });
    }
  }
  return { mapped: mapping.length, missingSources, mapping };
}

function main() {
  const check = process.argv.includes('--check');
  const json = process.argv.includes('--json');
  const result = buildMapping();
  if (result.missingSources.length) throw new Error(`Missing sources:\n${result.missingSources.join('\n')}`);
  if (!check) {
    fs.mkdirSync(BACKUP_ROOT, { recursive: true });
    for (const item of result.mapping) {
      const backup = path.join(BACKUP_ROOT, path.basename(item.target));
      if (fs.existsSync(item.target) && !fs.existsSync(backup)) fs.copyFileSync(item.target, backup);
      fs.copyFileSync(item.source, item.target);
    }
  }
  if (json) console.log(JSON.stringify(result));
  else console.log(`${check ? 'Validated' : 'Imported'} ${result.mapped} reviewed icons.`);
}

main();
