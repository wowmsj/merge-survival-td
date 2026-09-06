/**
 * 建筑专属贴图批量生成（透明背景版）
 * 走 API易 gpt-image 系列（background=transparent），每个建筑一张（id 对应 building.json），
 * 输出 assets/generated/bldg-<id>.png。旧的大类图标 build-icon-* 保留作回退。
 *
 * 运行：node scripts/gen-building-icons.js [id ...]
 *   不带参数跑全部 20 个；带 id 只跑指定建筑（补跑失败用）。
 * 完成后需要 npm run resize-assets 重新生成 assets/images/*.webp。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const APIYI_BASE = 'https://api.apiyi.com';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'generated');
const BACKUP_DIR = path.join(OUT_DIR, '_backup_bldg');

function loadEnv() {
  const envPath = path.join(__dirname, '..', 'key.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const APIYI_KEY = process.env.APIYI_API_KEY;
const APIYI_MODEL = process.env.APIYI_MODEL || 'gpt-image-1.5';
if (!APIYI_KEY) {
  console.error('key.env 缺少 APIYI_API_KEY');
  process.exit(1);
}

// 统一风格后缀：废土卡通 + 粗描边 + 微俯视 3/4 视角 + 纯透明背景，无底图/边框/文字
const STYLE = ', mobile game building icon, cartoon style, thick dark outline, soft cel shading, post-apocalyptic wasteland theme, warm colors, slight three-quarter top-down view, single object centered on a fully transparent background, no background scenery, no ground, no shadow, no frame, no border, no text';

const TASKS = [
  { id: 1, prompt: 'A small fortified survival base core: compact command bunker with a glowing yellow energy core on top, antenna, scrap metal plating' },
  { id: 101, prompt: 'A wooden watchtower with a crossbow mounted on top, rope bindings, scrap metal reinforcements' },
  { id: 102, prompt: 'A heavy cannon turret on a round rotating metal base, short thick barrel, sandbags around it' },
  { id: 103, prompt: 'A tesla coil tower, copper coils stacked on a metal pylon, glowing blue electric arcs' },
  { id: 104, prompt: 'A frost tower, metal frame holding a big glowing ice-blue crystal, icicles hanging' },
  { id: 202, prompt: 'A small field medical station: white tent with a red cross sign, medicine crates at the entrance' },
  { id: 203, prompt: 'A small wind turbine generator, three blades on a slim metal tower, battery box at the base' },
  { id: 204, prompt: 'A small wooden watch outpost with a lookout platform, telescope and a little flag' },
  { id: 205, prompt: 'A small storage warehouse, corrugated metal roof, wooden crates and barrels stacked outside' },
  { id: 206, prompt: 'A small workshop shed with a workbench, hanging tools, gears and a little chimney' },
  { id: 207, prompt: 'A scavenger collection station: tent stall with nets, hooks and sorted piles of junk and cans' },
  { id: 208, prompt: 'A small ammo depot bunker, stacked green crates of bullets and artillery shells, warning stripes' },
  { id: 209, prompt: 'A small radar station with a rotating satellite dish on a short tower, blinking red light' },
  { id: 210, prompt: 'A small repair station with a robotic arm over a workbench, tool cabinets, a wrench emblem' },
  { id: 301, prompt: 'A ground spike trap: sharp wooden stakes and metal spikes pointing up from a small square base plate' },
  { id: 302, prompt: 'A round cartoon landmine with a red pressure button on top, half buried, a few loose wires' },
  { id: 303, prompt: 'A small patch of sticky green toxic swamp slime with bubbles and fumes, in a shallow muddy pit' },
  { id: 401, prompt: 'A sturdy wooden barricade wall segment, vertical logs and planks tied with rope' },
  { id: 402, prompt: 'A stone wall segment, stacked gray stone bricks with a little moss' },
  { id: 403, prompt: 'A heavy iron wall segment, riveted steel plates with small spikes on top, rusted edges' }
];

function request(url, options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.setTimeout(180000, () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOne(task) {
  const payload = JSON.stringify({
    model: APIYI_MODEL,
    prompt: task.prompt + STYLE,
    n: 1,
    size: '1024x1024',
    background: 'transparent'
  });
  const res = await request(`${APIYI_BASE}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIYI_KEY}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  if (res.statusCode !== 200) {
    throw new Error(`API ${res.statusCode}: ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  const dest = path.join(OUT_DIR, `bldg-${task.id}.png`);
  const first = res.body.data?.[0] || {};
  if (first.b64_json) {
    fs.writeFileSync(dest, Buffer.from(first.b64_json, 'base64'));
  } else if (first.url) {
    await downloadImage(first.url, dest);
  } else {
    throw new Error(`响应无图像: ${JSON.stringify(res.body).slice(0, 200)}`);
  }
}

async function main() {
  const only = new Set(process.argv.slice(2).map(Number));
  const tasks = only.size > 0 ? TASKS.filter((t) => only.has(t.id)) : TASKS;
  if (tasks.length === 0) {
    console.error('没有匹配的 id');
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`使用 API易，模型: ${APIYI_MODEL}，共 ${tasks.length} 张`);
  const failed = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const dest = path.join(OUT_DIR, `bldg-${t.id}.png`);
    const backup = path.join(BACKUP_DIR, `bldg-${t.id}.png`);
    if (fs.existsSync(dest) && !fs.existsSync(backup)) fs.copyFileSync(dest, backup);
    let ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        console.log(`[${i + 1}/${tasks.length}] bldg-${t.id} ...`);
        await generateOne(t);
        ok = true;
        console.log(`  ✓ bldg-${t.id}`);
      } catch (e) {
        console.error(`  ✗ bldg-${t.id} 失败(${retry + 1}/3): ${e.message}`);
        if (retry < 2) await sleep(5000 * (retry + 1));
      }
    }
    if (!ok) failed.push(t.id);
    if (i < tasks.length - 1) await sleep(2000);
  }
  console.log(failed.length ? `完成，失败 ${failed.length} 张：${failed.join(' ')}` : '全部完成，无失败。');
}

main().catch((e) => { console.error(e); process.exit(1); });
