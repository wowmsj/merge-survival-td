/**
 * 带卡背板图标的批量重生（透明背景版）
 * 普查发现一批道具图标带米色/白色圆角卡背板（拼版人工复核确认，清单见 TASKS）。
 * 本脚本按道具名/现状定制英文提示词，走 API易 gpt-image 系列（background=transparent）
 * 重新生成，覆盖 assets/generated/<key>.png；原图备份到 assets/generated/_backup_card/（只备份一次）。
 *
 * 运行：node scripts/regen-card-icons.js [key ...]
 *   不带参数跑全部 TASKS；带 key 只跑指定项（补跑失败用）。
 * 完成后需要 npm run resize-assets 重新生成 assets/images/*.webp。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const APIYI_BASE = 'https://api.apiyi.com';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'generated');
const BACKUP_DIR = path.join(OUT_DIR, '_backup_card');

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

// 统一风格后缀：保持与其他已去底图标一致，并显式禁止卡背板/边框/文字
const STYLE = ', mobile game icon, casual cartoon style, thick dark outline, soft shading, single isolated object centered on a fully transparent background, no backing panel, no rounded square card, no frame, no border, no shadow on ground, no text';

const TASKS = [
  // ---- 基础 key（非 icon_p）----
  { key: 'icon_b3', prompt: 'A cartoon hexagonal wrench' },
  { key: 'icon_b17', prompt: 'A pair of yellow renovation work gloves' },
  { key: 'icon_d16', prompt: 'A small alcohol spray bottle' },
  { key: 'icon_d17', prompt: 'A cute cartoon bandage band-aid' },
  { key: 'icon_f1', prompt: 'A red cartoon resistance band with two handles' },
  { key: 'icon_h1', prompt: 'A cartoon hand grip strengthener' },
  { key: 'icon_k1', prompt: 'A pile of shredded paper scraps' },
  { key: 'icon_mh1', prompt: 'A small white daisy flower with stem and leaves' },
  { key: 'icon_ob1', prompt: 'A small cute gray cartoon mouse' },
  { key: 'iion_i9', prompt: 'A golden champion trophy cup with a star' },
  { key: 'prop_gymbox', prompt: 'A wooden crate box with dumbbells and gym equipment inside' },
  // ---- 每级独立图标 icon_p<propId>（提示词按道具名/现状定制）----
  { key: 'icon_p1009', prompt: 'A big fat cute white goose piggy bank with gold coins around it' },
  { key: 'icon_p10018', prompt: 'A pair of electrician pliers with orange insulated handles' },
  { key: 'icon_p20001', prompt: 'A small portable cooler box with a carry handle' },
  { key: 'icon_p20008', prompt: 'A professional stainless double-door mini fridge with a subtle golden glow' },
  { key: 'icon_p20025', prompt: 'A healthy energy bowl full of fruits and nuts' },
  { key: 'icon_p20043', prompt: 'A colorful cartoon hula hoop' },
  { key: 'icon_p20047', prompt: 'A large pink exercise gym ball' },
  { key: 'icon_p20053', prompt: 'A cartoon dumbbell' },
  { key: 'icon_p20066', prompt: 'A clipboard with a sprint test chart and a small stopwatch' },
  { key: 'icon_p20067', prompt: 'A clipboard with a fitness analysis chart and graphs' },
  { key: 'icon_p20068', prompt: 'A golden ornate clipboard with a glowing fitness chart' },
  { key: 'icon_p20069', prompt: 'An open beginner course book with big ABC letters' },
  { key: 'icon_p20070', prompt: 'A strength training course book with a dumbbell on the cover' },
  { key: 'icon_p20075', prompt: 'A tall stack of golden course books with a diploma scroll' },
  { key: 'icon_p20077', prompt: 'A golden champion trophy cup with a star and laurel wreath' },
  { key: 'icon_p30004', prompt: 'An empty cartoon shopping cart' },
  { key: 'icon_p30011', prompt: 'A broken old wooden drawer' },
  { key: 'icon_p30022', prompt: 'A golden smart key fob with a glowing sensor light' },
  { key: 'icon_p30027', prompt: 'Two cartoon puzzle pieces being joined together' },
  { key: 'icon_p30030', prompt: 'A small corner section of connected cartoon puzzle pieces' },
  { key: 'icon_p30033', prompt: 'A glowing magical photo outline made of golden light' },
  { key: 'icon_p30034', prompt: 'An old ornate photo with a missing corner, golden frame style' },
  { key: 'icon_p30049', prompt: 'A pair of cartoon round eyeglasses' },
  { key: 'icon_p30068', prompt: 'A picnic basket full of bread and fruits' },
  { key: 'icon_p30075', prompt: 'A legendary sword stuck in a gray rock' },
  { key: 'icon_p30077', prompt: 'A cute chubby yellow chick spirit with tiny sparkles' },
  { key: 'icon_p30078', prompt: 'A cute chubby yellow chick ranger wearing a tiny green hood' },
  { key: 'icon_p30079', prompt: 'A cute chubby yellow chick mage wearing a tiny wizard hat' },
  { key: 'icon_p30080', prompt: 'A cute chubby yellow chick hero with a tiny sword and shield' },
  { key: 'icon_p40014', prompt: 'A glowing magical pile of flower seeds' },
  { key: 'icon_p40018', prompt: 'A pile of burlap seed sacks' },
  { key: 'icon_p40033', prompt: 'A cute green cartoon caterpillar larva' },
  { key: 'icon_p40034', prompt: 'A green chrysalis pupa hanging from a small twig' },
  { key: 'icon_p40035', prompt: 'A cute cartoon butterfly with spread wings' },
  { key: 'icon_p40048', prompt: 'A small roadside daisy with stem and leaves' },
  { key: 'icon_p40049', prompt: 'A fresh daisy in a small glass bottle' },
  { key: 'icon_p40051', prompt: 'White lilies in a porcelain vase' },
  { key: 'icon_p40052', prompt: 'A bundle of loose lavender sprigs' },
  { key: 'icon_p40055', prompt: 'A bouquet of colorful tulips tied with a ribbon' },
  { key: 'icon_p40056', prompt: 'A grand feast flower arrangement in an ornate golden vase' },
  { key: 'icon_p50019', prompt: 'A cute fat gray cartoon mouse' },
  { key: 'icon_p50021', prompt: 'A cute cartoon mouse family with baby mice' },
  { key: 'icon_p50025', prompt: 'A small cute gray kitten' },
  { key: 'icon_p50026', prompt: 'A fashionable cartoon cat with a hat and scarf' },
  { key: 'icon_p50027', prompt: 'A cute yellow tabby kitten' },
  { key: 'icon_p50030', prompt: 'A big fluffy gray cartoon cat' },
  { key: 'icon_p50033', prompt: 'A tiger-striped cartoon cat, ornate golden style' },
  { key: 'icon_p50035', prompt: 'A golden ornate cute kitten with a magical glow' },
  { key: 'icon_p60001', prompt: 'A small battery with a glowing energy plus symbol' },
  { key: 'icon_p60002', prompt: 'A battery charger with a power plug and an energy plus symbol' },
  { key: 'icon_p60003', prompt: 'A large battery charger with green cells and a plus symbol' },
  { key: 'icon_p60004', prompt: 'An ornate golden infinite energy battery with a magical glow' },
  { key: 'icon_p60005', prompt: 'A small energy charger device with a lightning bolt symbol' },
  { key: 'icon_p60008', prompt: 'A small pair of scissors splitting a tiny box in half' },
  { key: 'icon_p60010', prompt: 'Large ornate golden scissors splitting a box in half' },
  { key: 'icon_p60015', prompt: 'An ornate golden hourglass accelerator with gears and a magical glow' }
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
