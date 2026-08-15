/**
 * 剧情角色立绘批量生成（透明背景版）
 * 走 API易 gpt-image 系列（background=transparent），统一风格生成 13 个角色半身立绘，
 * 输出 assets/generated/char-*.png；已有同名原图先备份到 assets/generated/_backup_char/（只备份一次）。
 *
 * 运行：node scripts/gen-char-portraits.js [key ...]
 *   不带参数跑全部角色；带 key 只跑指定角色（补跑失败用）。
 * 完成后需要 npm run resize-assets 重新生成 assets/images/*.webp。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const APIYI_BASE = 'https://api.apiyi.com';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'generated');
const BACKUP_DIR = path.join(OUT_DIR, '_backup_char');

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

// 统一风格后缀：半身立绘 + 废土卡通 + 纯透明背景，禁止场景/边框/文字
const STYLE = ', mobile game character portrait, bust shot head and shoulders, casual cartoon style, thick dark outline, soft cel shading, post-apocalyptic wasteland theme, single character centered on a fully transparent background, no background scenery, no ground, no frame, no border, no text';

const TASKS = [
  { key: 'char-hero', prompt: 'A resourceful young Chinese man in his twenties, survivor apprentice, short messy black hair, determined eyes, patched hooded jacket, holding a small glowing merge-core gadget' },
  { key: 'char-laogui', prompt: 'A shrewd middle-aged black-market merchant with a sly grin, long worn coat full of hidden pockets, goggles pushed up on forehead, counting gold coins' },
  { key: 'char-xiaoman', prompt: 'A cute little girl around 8 years old with twin pigtails and big innocent eyes, oversized worn sweater, hugging a small black dog' },
  { key: 'char-beian', prompt: 'A rugged northern camp leader, middle-aged bearded man, fur-lined winter coat, radio headset on one ear' },
  { key: 'char-mancang', prompt: 'A cute round AI robot parrot with metallic green and brass feathers, glowing blue eyes, tiny antenna, retro speaker grill on chest' },
  { key: 'char-laoqiang', prompt: 'A grizzled old veteran gatekeeper with gray stubble, worn military cap, old rifle slung on shoulder, holding a tin wine cup, quiet dependable look' },
  { key: 'char-pangshen', prompt: 'A cheerful chubby middle-aged cook woman, curly hair under a kerchief, stained apron, big iron wok strapped on her back, waving a ladle' },
  { key: 'char-doctor', prompt: 'A cold elegant female doctor around 35, white lab coat over wasteland clothes, stethoscope, hair in a bun, tired but sharp eyes' },
  { key: 'char-xiaodian', prompt: 'An energetic 15-year-old girl engineer, short hair with a blue streak, oversized work gloves, tool belt, holding a wrench with tiny electric sparks' },
  { key: 'char-douzi', prompt: 'A scrappy 10-year-old scavenger boy, messy hair, dirt smudge on cheek, oversized backpack stuffed with cans and junk, slingshot at his waist' },
  { key: 'char-wensente', prompt: 'A gentle refined council liaison officer, silver-rimmed glasses, warm smile hiding schemes, neat dark uniform with a small insignia' },
  { key: 'char-tiezhua', prompt: 'A burly wasteland fortress lord, scarred face, spiked shoulder armor made of scrap metal, heavy mechanical claw glove' },
  { key: 'char-officer', prompt: 'An arrogant council acquisition officer, slicked-back hair, dark green uniform coat, holding a clipboard and a food can' }
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
  const dest = path.join(OUT_DIR, `${task.key}.png`);
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
  const tasks = only.size > 0 ? TASKS.filter((t) => only.has(t.key)) : TASKS;
  if (tasks.length === 0) {
    console.error('没有匹配的 key');
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`使用 API易，模型: ${APIYI_MODEL}，共 ${tasks.length} 张`);
  const failed = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const dest = path.join(OUT_DIR, `${t.key}.png`);
    const backup = path.join(BACKUP_DIR, `${t.key}.png`);
    if (fs.existsSync(dest) && !fs.existsSync(backup)) fs.copyFileSync(dest, backup);
    let ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        console.log(`[${i + 1}/${tasks.length}] ${t.key} ...`);
        await generateOne(t);
        ok = true;
        console.log(`  ✓ ${t.key}`);
      } catch (e) {
        console.error(`  ✗ ${t.key} 失败(${retry + 1}/3): ${e.message}`);
        if (retry < 2) await sleep(5000 * (retry + 1));
      }
    }
    if (!ok) failed.push(t.key);
    if (i < tasks.length - 1) await sleep(2000);
  }
  console.log(failed.length ? `完成，失败 ${failed.length} 张：${failed.join(' ')}` : '全部完成，无失败。');
}

main().catch((e) => { console.error(e); process.exit(1); });
