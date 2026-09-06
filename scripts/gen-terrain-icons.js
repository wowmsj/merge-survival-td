/**
 * 地形贴图批量生成（透明背景版）
 * 走 API易 gpt-image 系列（background=transparent），每种地形一张，
 * 输出 assets/generated/terrain-<kind>.png，kind 对应 src/core/config/data/terrain.json。
 *
 * 运行：node scripts/gen-terrain-icons.js [kind ...]
 *   不带参数跑全部 5 种；带 kind 只跑指定地形（补跑失败用）。
 * 完成后需要 npm run resize-assets 重新生成 assets/images/*.webp。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const APIYI_BASE = 'https://api.apiyi.com';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'generated');
const BACKUP_DIR = path.join(OUT_DIR, '_backup_terrain');

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

// 统一风格后缀：与建筑贴图同套（废土卡通 + 粗描边 + 微俯视 3/4 视角 + 纯透明背景）
const STYLE = ', mobile game terrain tile icon, cartoon style, thick dark outline, soft cel shading, post-apocalyptic wasteland theme, warm colors, slight three-quarter top-down view, single object centered on a fully transparent background, no background scenery, no ground plane, no shadow, no frame, no border, no text';

const TASKS = [
  { kind: 'grass', prompt: 'A small patch of overgrown wasteland weeds and dry wild grass tufts, a few tiny stones mixed in' },
  { kind: 'rubble', prompt: 'A pile of collapsed building rubble: broken concrete chunks, twisted rebar, dust and small debris' },
  { kind: 'shack', prompt: 'A ruined small house: half-collapsed wooden walls, broken roof tiles, cracked window holes, weathered and abandoned' },
  { kind: 'woods', prompt: 'A small cluster of two or three dead leafless trees with gnarled branches, dry bushes at the base' },
  { kind: 'pond', prompt: 'A small stagnant pond of murky green-blue water, puddle with muddy banks, a few cattail reeds at the edge' }
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
  const dest = path.join(OUT_DIR, `terrain-${task.kind}.png`);
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
  const only = new Set(process.argv.slice(2));
  const tasks = only.size > 0 ? TASKS.filter((t) => only.has(t.kind)) : TASKS;
  if (tasks.length === 0) {
    console.error('没有匹配的 kind');
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`使用 API易，模型: ${APIYI_MODEL}，共 ${tasks.length} 张`);
  const failed = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const dest = path.join(OUT_DIR, `terrain-${t.kind}.png`);
    const backup = path.join(BACKUP_DIR, `terrain-${t.kind}.png`);
    if (fs.existsSync(dest) && !fs.existsSync(backup)) fs.copyFileSync(dest, backup);
    let ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        console.log(`[${i + 1}/${tasks.length}] terrain-${t.kind} ...`);
        await generateOne(t);
        ok = true;
        console.log(`  ✓ terrain-${t.kind}`);
      } catch (e) {
        console.error(`  ✗ terrain-${t.kind} 失败(${retry + 1}/3): ${e.message}`);
        if (retry < 2) await sleep(5000 * (retry + 1));
      }
    }
    if (!ok) failed.push(t.kind);
    if (i < tasks.length - 1) await sleep(2000);
  }
  console.log(failed.length ? `完成，失败 ${failed.length} 张：${failed.join(' ')}` : '全部完成，无失败。');
}

main().catch((e) => { console.error(e); process.exit(1); });
