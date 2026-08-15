const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * 素材生成脚本
 * 支持两个供应商（按 key.env 里的 key 自动选择）：
 *
 *   1. API易（推荐，支持微信充值）：key.env 写 APIYI_API_KEY=sk-xxx
 *      OpenAI 兼容图像 API（POST /v1/images/generations）
 *      可选 APIYI_MODEL=模型名 覆盖默认模型（默认 nano-banana-2）
 *
 *   2. Synthorai：key.env 写 SYNTHORAI_API_KEY=sk-syn-xxx
 *      可选 SYNTHORAI_MODEL=模型名 覆盖默认模型（默认 seedream-4-0-250828）
 *
 *   3. nananobanana（旧，需 Pro）：key.env 写 API_KEY=nb_xxx
 *
 * 运行：node scripts/generate-assets.js
 *
 * 注意：脚本串行生成，图片自动保存到 assets/generated/
 */

const API_BASE = 'https://www.nananobanana.com';
const SYN_BASE = 'https://synthorai.io';
const APIYI_BASE = 'https://api.apiyi.com';

function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', 'key.env'),
    path.join(__dirname, '..', '.env')
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
const API_KEY = process.env.API_KEY;
// API易：独立 key，最优先
const APIYI_KEY = process.env.APIYI_API_KEY;
const APIYI_MODEL = process.env.APIYI_MODEL || 'nano-banana-2';
// Synthorai：优先读 SYNTHORAI_API_KEY；API_KEY 是 sk- 开头也视为 Synthorai key
const SYNTHORAI_KEY = process.env.SYNTHORAI_API_KEY || (API_KEY && API_KEY.startsWith('sk-') ? API_KEY : null);
const SYN_MODEL = process.env.SYNTHORAI_MODEL || 'seedream-4-0-250828';

if (!APIYI_KEY && !SYNTHORAI_KEY && !API_KEY) {
  console.error('请先设置 API key：');
  console.error('  API易（推荐）：key.env 写入 APIYI_API_KEY=sk-你的key');
  console.error('  Synthorai：key.env 写入 SYNTHORAI_API_KEY=sk-syn-你的key');
  console.error('  nananobanana（旧）：key.env 写入 API_KEY=nb_你的key');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'generated');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 基础棋盘/UI 纹理（key 与代码中引用的纹理 key 一致）
const BASE_TEXTURES = [
  { key: 'cell-bg', prompt: 'Full-bleed seamless dark wood floor tile texture for a mobile merge game board, muted warm brown wooden planks, the texture fills the entire square canvas edge to edge with no border, no margin, no frame, top-down view, casual cartoon style, flat even lighting, no shadows', ext: 'png' },
  { key: 'cell-bg2', prompt: 'Full-bleed seamless wood floor tile texture for a mobile merge game board, slightly lighter muted warm brown wooden planks, the texture fills the entire square canvas edge to edge with no border, no margin, no frame, top-down view, casual cartoon style, flat even lighting, no shadows', ext: 'png' },
  { key: 'cell-select', prompt: 'A 140x140 square selection frame, yellow-gold glowing rounded border, 6px thick, transparent center, mobile game UI, clean and bright', ext: 'png' },
  { key: 'cell-hint', prompt: 'A 140x140 square highlight frame, green glowing rounded border, 6px thick, transparent center, mobile game UI, clean and bright', ext: 'png' },
  { key: 'bubble-mask', prompt: 'A 140x140 circular bubble overlay, translucent white, soft highlight, thin white border, mobile game item bubble mask, transparent center', ext: 'png' },
  { key: 'carton', prompt: 'A 140x140 closed cardboard box, top-down view, brown tape, rounded corners, mobile game cartoon style, soft shading', ext: 'png' },
  { key: 'spider', prompt: 'A 140x140 gray spider web, concentric circles with radial lines, semi-transparent, mobile game seal overlay, transparent background', ext: 'png' },
  { key: 'lock', prompt: 'A 64x64 padlock icon, gray body, golden shackle, dark circular background, mobile game UI icon, clean cartoon style', ext: 'png' },
  { key: 'card-bg', prompt: 'A 120x120 rounded square card background, dark purple-blue, subtle gradient, thin border, mobile game UI element', ext: 'png' },
  { key: 'btn-bg', prompt: 'A 200x72 rounded rectangular button background, blue gradient, glossy, mobile game UI button, 9-slice friendly', ext: 'png' },
  { key: 'panel-bg', prompt: 'A 400x300 rounded rectangular panel background, dark translucent with blue border, mobile game UI panel, 9-slice friendly', ext: 'png' },
  { key: 'task-gou', prompt: 'A 32x32 green circle with white check mark, mobile game UI icon, clean cartoon style', ext: 'png' },
];

// 道具图标（按类型/子类挑选的代表性道具）
const PROP_ICONS = [
  { key: 'icon_a1', prompt: 'A small wooden toolbox handle, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_a2', prompt: 'A small wooden toolbox lid, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_a4', prompt: 'A simple hardware toolbox with tools inside, mobile game icon, cartoon style, 128x128, bright colors, clean background', ext: 'png' },
  { key: 'icon_b1', prompt: 'A cartoon screwdriver, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_b2', prompt: 'A cartoon hammer, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_b3', prompt: 'A cartoon hexagonal wrench, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_c1', prompt: 'A small portable cooler, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_d1', prompt: 'A small bottle of mineral water, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_e1', prompt: 'A small plastic shopping basket, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_f1', prompt: 'A cartoon resistance band, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_h1', prompt: 'A cartoon hand grip strengthener, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_i10', prompt: 'A single shopping cart wheel, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_j1', prompt: 'A small woven storage basket, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_k1', prompt: 'A pile of shredded paper scraps, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_kk1', prompt: 'A small magical cloak fragment, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_kkk1', prompt: 'A cartoon USB flash drive, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_kkkk1', prompt: 'A small U-shaped magnet, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_llll1', prompt: 'A cute chubby bird figurine, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_m1', prompt: 'A broken terracotta flower pot, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_m2', prompt: 'A cracked terracotta flower pot, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_m3', prompt: 'A whole terracotta flower pot with soil, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_mf1', prompt: 'A small coil of natural rattan rope, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_mh1', prompt: 'A small daisy flower, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_md1', prompt: 'A small seed packet, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_me1', prompt: 'A small caterpillar, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_mc1', prompt: 'A small burlap sack, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_o1', prompt: 'A small battery, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_oa1', prompt: 'A crumpled snack wrapper, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_ob1', prompt: 'A small cartoon mouse, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_oc1', prompt: 'A cute country cat, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_60001', prompt: 'A battery charger icon with a green plus sign and a power plug, mobile game icon, cartoon style, thick outline, 128x128, isolated object on transparent background, no backing panel, no rounded square background, no text', ext: 'png', transparent: true },
  { key: 'icon_60005', prompt: 'A pair of cartoon scissors cutting a small box in half, mobile game icon, cartoon style, thick outline, 128x128, isolated object on transparent background, no backing panel, no rounded square background, no text', ext: 'png', transparent: true },
  { key: 'icon_60008', prompt: 'A golden star with a green upward arrow, mobile game upgrade icon, cartoon style, thick outline, 128x128, isolated object on transparent background, no backing panel, no rounded square background, no text', ext: 'png', transparent: true },
  { key: 'icon_60011', prompt: 'An hourglass reducing cooldown time, mobile game icon, cartoon style, 128x128, clean background', ext: 'png' },
  { key: 'icon_60020', prompt: 'An infinite energy lightning orb, mobile game icon, cartoon style, 128x128, clean background', ext: 'png' },
  { key: 'icon_60024', prompt: 'A turbo accelerator device, clock with gears, mobile game icon, cartoon style, 128x128, clean background', ext: 'png' },
  { key: 'prop_coin1', prompt: 'A small pile of gold coins, mobile game currency icon, cartoon style, 128x128, clean background', ext: 'png' },
  { key: 'prop_energy1', prompt: 'A small lightning energy orb, mobile game currency icon, cartoon style, 128x128, clean background', ext: 'png' },
  { key: 'prop_bigpingbox', prompt: 'A big blue shopping bag, mobile game icon, cartoon style, 128x128, clean background', ext: 'png' },
  { key: 'prop_bigblackbox', prompt: 'A big black mystery box, mobile game icon, cartoon style, 128x128, clean background', ext: 'png' },
];

// 道具图标第三批：补齐整条链都没有图标的道具（货币/宝箱/补给箱/手套/食物/宣传/课程等）
// key 命名沿用配置表 icon 字段第二段（可直接命中），差异大的链生成 2~3 个等级，其余靠 BFS 同链共用
const PROP_ICONS_2 = [
  // 货币/资源类
  { key: 'prop_exp', prompt: 'A glowing green experience point orb with a small star inside, mobile game currency icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_dress', prompt: 'A pink fashion dress on a hanger, mobile game currency icon, cartoon style, 128x128, simple, no coin, no text, no symbols, isolated object on transparent background, no backing panel, no rounded square background', ext: 'png', transparent: true },
  { key: 'prop_diamonds1', prompt: 'A small pile of three sparkling blue diamonds, mobile game currency icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_diamonds3', prompt: 'A big heap of sparkling blue diamonds, mobile game currency icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_exp1', prompt: 'A single small green glossy star, mobile game experience icon, cartoon style, 128x128, simple, smooth clean surface, no face, no holes, no dark spots', ext: 'png', transparent: true },
  { key: 'prop_exp3', prompt: 'A cluster of three bright green glossy stars with sparkles, mobile game experience icon, cartoon style, 128x128, simple, smooth clean surface, no face, no holes, no dark spots', ext: 'png', transparent: true },
  // 宝箱/福袋/背包/存钱罐
  { key: 'prop_fudai', prompt: 'A red Chinese lucky bag with golden ribbon tie, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_bag', prompt: 'A cute cartoon backpack, mobile game inventory icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_ccbox', prompt: 'A glass bottle filled with glowing blue diamonds, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_coinbox', prompt: 'A wooden treasure chest overflowing with gold coins, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_powerbox', prompt: 'A wooden treasure chest with a glowing yellow lightning orb inside, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_goose1', prompt: 'A small cute white goose piggy bank, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_goose3', prompt: 'A big fat cute white goose piggy bank with gold coins around, white body, mobile game icon, cartoon style, 128x128, simple', ext: 'png' },
  { key: 'prop_giftbox', prompt: 'A colorful gift box with red ribbon bow, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 发射器箱子（简易工具箱/种子箱/健身器材箱/冷藏箱）
  { key: 'prop_toolchest', prompt: 'A simple wooden tool chest box, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_seedbox', prompt: 'A wooden crate box full of seed packets and small sprouts, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_gymbox', prompt: 'A crate box with dumbbells and gym equipment inside, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  { key: 'prop_coolerbox', prompt: 'A blue insulated cooler chest with ice cubes, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 补给箱（绿植/器械/饮品/课程/回收）
  { key: 'prop_supply_plant', prompt: 'A wooden supply crate with green potted plants, mobile game icon, cartoon style, 128x128, simple, no text, no letters', ext: 'png' },
  { key: 'prop_supply_gym', prompt: 'A supply crate with a kettlebell and jump rope, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_supply_drink', prompt: 'A supply crate with juice bottles and drinks, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_supply_course', prompt: 'A supply crate with books and a graduation cap, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'prop_supply_recycle', prompt: 'A green recycling bin with recycle arrows symbol, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 手套链（1/3）
  { key: 'icon_b15', prompt: 'A single cartoon work glove, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_b17', prompt: 'A pair of yellow renovation work gloves, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  // 面包链（2/3）
  { key: 'icon_d11', prompt: 'A slice of toast bread, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  { key: 'icon_d13', prompt: 'A golden croissant, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_d15', prompt: 'A healthy energy bowl with fruits and nuts, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 医疗链（2/4）
  { key: 'icon_d16', prompt: 'A small alcohol spray bottle, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  { key: 'icon_d17', prompt: 'A cute bandage band-aid, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  { key: 'icon_d19', prompt: 'A red first aid kit box, white cross symbol on the lid, the cross is pure white color, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  // 宣传链（2/8）
  { key: 'icon_h8', prompt: 'A stack of paper advertising flyers leaflets, mobile game icon, cartoon style, 128x128, simple, no people, no characters', ext: 'png', transparent: true },
  { key: 'icon_h10', prompt: 'A retro cassette recorder with a megaphone, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_h12', prompt: 'A retro television set, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 体测链（2/9）
  { key: 'icon_h14', prompt: 'A body fat scale, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_h16', prompt: 'A clipboard with a fitness analysis chart, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 课程链（2/10，配置表 icon 字段为 iion_ 前缀拼写）
  { key: 'iion_i1', prompt: 'An open beginner course book, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'iion_i5', prompt: 'A rolled yoga mat, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'iion_i9', prompt: 'A golden champion trophy cup, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  // 钥匙链（3/3）
  { key: 'icon_j12', prompt: 'A small brass key, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_j16', prompt: 'A smart fitness wristband bracelet, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 游戏机链（3/8）
  { key: 'icon_l1', prompt: 'A small retro handheld game console, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_l4', prompt: 'A modern handheld game console with red and blue detachable controllers, mobile game icon, cartoon style, 128x128, simple, blank dark screen, no people', ext: 'png', transparent: true },
  // 野餐链（3/9）
  { key: 'icon_ll1', prompt: 'A wicker picnic basket, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_ll3', prompt: 'A picnic basket full of bread and food, mobile game icon, cartoon style, 128x128, simple', ext: 'png', transparent: true },
  // 勇者游戏链（3/10）
  { key: 'icon_lll1', prompt: 'A retro fantasy adventure game cartridge, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_lll3', prompt: 'A golden royal crown, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_lll5', prompt: 'A cute cartoon black dragon, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 种子链（4/2）
  { key: 'icon_ma1', prompt: 'A small paper seed packet with a flower picture, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_ma4', prompt: 'A pile of mixed flower seeds, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  // 神奇道具（升级卡/怀表/清洁剂）
  { key: 'icon_60016', prompt: 'An upgrade card with a wrench symbol and an upward arrow, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_60017', prompt: 'An upgrade card with two stars and an upward arrow, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_60018', prompt: 'An upgrade card with a dumbbell symbol and an upward arrow, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_60019', prompt: 'A rainbow glowing super upgrade card with a big star, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_60022', prompt: 'A golden pocket watch, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
  { key: 'icon_60023', prompt: 'A citrus scented cleaning spray bottle with an orange slice, mobile game icon, cartoon style, 128x128, simple, clean background', ext: 'png' },
];

// UI 元素（背景/资源条/任务条/建筑卡片等，第二批）
// 风格统一：休闲卡通手游风、深色调、圆角；bar/按钮类要求 9-slice 友好（边缘简洁、中间可拉伸）
// size 缺省 1024x1024，竖版背景用 1024x1536
const UI_ELEMENTS = [
  { key: 'bg-main', prompt: 'Full-bleed vertical mobile game background, dark cozy night scene, deep indigo and dark teal tones, subtle stars and fireflies, soft vignette, calm empty center area, casual cartoon style, no text, no characters, no UI elements, portrait orientation, fully opaque, no transparency', ext: 'png', size: '1024x1536' },
  { key: 'res-item-bg', prompt: 'A solid rounded capsule pill button for a mobile game resource counter, completely filled with dark slate blue, soft inner glow, thin golden rim, fully opaque filled interior, casual cartoon style, no text, the capsule fills almost the entire canvas edge to edge', ext: 'png', transparent: true },
  { key: 'res-icon-lv', prompt: 'A golden medal badge icon, mobile game player level icon, cartoon style, glossy, no text, no numbers', ext: 'png', transparent: true },
  { key: 'res-icon-coin', prompt: 'A single shiny gold coin icon, mobile game currency icon, cartoon style, glossy, no text', ext: 'png', transparent: true },
  { key: 'res-icon-diamond', prompt: 'A sparkling blue diamond gem icon, mobile game currency icon, cartoon style, glossy, no text', ext: 'png', transparent: true },
  { key: 'res-icon-power', prompt: 'A glowing yellow lightning bolt icon, mobile game energy icon, cartoon style, no text', ext: 'png', transparent: true },
  { key: 'res-icon-star', prompt: 'A glossy yellow five-pointed star icon, mobile game currency icon, cartoon style, no text', ext: 'png', transparent: true },
  { key: 'task-item-bg', prompt: 'A solid rounded rectangle quest banner for a mobile game, completely filled with dark blue-gray leather texture, thin metal border all around, fully opaque filled interior, casual cartoon style, no text, the banner fills almost the entire canvas edge to edge', ext: 'png', transparent: true },
  { key: 'task-item-done-bg', prompt: 'A solid rounded rectangle quest banner for a mobile game, completely filled with bright fresh green, soft glow, thin golden border all around, fully opaque filled interior, casual cartoon style, no text, no checkmark, the banner fills almost the entire canvas edge to edge', ext: 'png', transparent: true },
  { key: 'build-card-bg', prompt: 'A solid vertical rounded rectangle card for a mobile game building shop, completely filled with dark slate blue, subtle metal frame border, fully opaque filled interior, casual cartoon style, no text, the card fills almost the entire canvas edge to edge', ext: 'png', transparent: true },
  { key: 'build-icon-core', prompt: 'A fortified base core building icon, small tower with glowing blue energy crystal on top, mobile game icon, cartoon style, no text', ext: 'png', transparent: true },
  { key: 'build-icon-tower', prompt: 'A wooden arrow defense tower icon, mobile game icon, cartoon style, no text', ext: 'png', transparent: true },
  { key: 'build-icon-resource', prompt: 'A small sawmill lumber camp building icon with logs, mobile game icon, cartoon style, no text', ext: 'png', transparent: true },
  { key: 'build-icon-trap', prompt: 'A round spiked landmine trap icon, mobile game icon, cartoon style, no text', ext: 'png', transparent: true },
  { key: 'build-icon-wall', prompt: 'A sturdy gray stone wall segment icon, mobile game icon, cartoon style, no text', ext: 'png', transparent: true },
  { key: 'banner-bg', prompt: 'A solid wide rounded horizontal banner for a mobile game tutorial hint, completely filled with dark navy blue, golden trim along the top and bottom edges, fully opaque filled interior, casual cartoon style, no text, the banner fills almost the entire canvas edge to edge', ext: 'png', transparent: true },
];

// 道具图标第四批：链内等级差异化（每级独立，key = icon_p<propId>）
// 等级清单来自 scripts/icon-chain-stats.js 生成的 scripts/icon-chain-plan.json；
// prompt 沿用该等级当前共用图标（baseKey）的英文描述保持风格一致，
// 按等级在链中的位置注入进阶修饰：低级 worn/basic → 中级 improved/standard →
// 高级 advanced/golden/ornate with glow（等级越高越华丽）。
// size/transparent 与 baseKey 的既有任务保持一致。
const PER_LEVEL_PLAN = (() => {
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'icon-chain-plan.json'), 'utf8'));
    return plan.levels || [];
  } catch (e) {
    console.warn('未读到 icon-chain-plan.json（先跑 node scripts/icon-chain-stats.js），PROP_ICONS_3 为空');
    return [];
  }
})();

const BASE_TASK_BY_KEY = new Map();
for (const t of [...PROP_ICONS, ...PROP_ICONS_2, ...UI_ELEMENTS]) BASE_TASK_BY_KEY.set(t.key, t);

function levelTierModifier(idx, len) {
  if (len <= 1) return 'basic';
  const f = idx / (len - 1);
  if (f <= 0.34) return 'worn and basic';
  if (f <= 0.67) return 'improved standard version';
  return 'advanced golden ornate version with a magical glow';
}

const PROP_ICONS_3 = PER_LEVEL_PLAN.map((lv) => {
  const base = BASE_TASK_BY_KEY.get(lv.baseKey);
  if (!base) {
    console.warn(`icon_p${lv.id} 的 baseKey ${lv.baseKey} 没有既有任务，跳过`);
    return null;
  }
  const tier = levelTierModifier(lv.idx, lv.len);
  const prompt = base.prompt.includes(', mobile game')
    ? base.prompt.replace(', mobile game', `, ${tier}, mobile game`)
    : `${base.prompt}, ${tier}`;
  const task = { key: `icon_p${lv.id}`, prompt, ext: 'png' };
  if (base.transparent) task.transparent = true;
  if (base.size) task.size = base.size;
  return task;
}).filter(Boolean);

// 剧情角色立绘（半身像，对话框左侧显示）
const CHARACTERS = [
  { key: 'char-hero', prompt: 'Bust portrait of a Chinese man in his 30s, a former supermarket floor manager in a post-apocalyptic world, wearing a faded staff apron over a hoodie with an old name badge, short hair, determined and reliable expression, cartoon mobile game style, warm flat lighting, simple dark background, centered composition', ext: 'png' },
  { key: 'char-laogui', prompt: 'Bust portrait of a shrewd middle-aged black market trader in a post-apocalyptic world, scruffy beard, aviator goggles pushed up on forehead, worn leather jacket with many pockets, sly friendly grin, cartoon mobile game style, warm flat lighting, simple dark background, centered composition', ext: 'png' },
  { key: 'char-xiaoman', prompt: 'Bust portrait of a cute 8-year-old Chinese girl survivor in a post-apocalyptic world, wearing an oversized patched coat, holding a small black cat in her arms, big hopeful eyes, cartoon mobile game style, warm flat lighting, simple dark background, centered composition', ext: 'png' },
  { key: 'char-beian', prompt: 'Bust portrait of a mysterious radio operator in a post-apocalyptic world, face half hidden in shadow, wearing a military headset and a bulky radio backpack, holding a walkie-talkie, silhouette rim light, cartoon mobile game style, simple dark background, centered composition', ext: 'png' }
];

const ALL_TASKS = [...BASE_TEXTURES, ...PROP_ICONS, ...PROP_ICONS_2, ...UI_ELEMENTS, ...PROP_ICONS_3, ...CHARACTERS, ...require('./blueprint-icon-tasks').BLUEPRINT_ICON_TASKS];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function request(url, options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error(`请求超时（${options.timeout}ms）`));
      });
    }
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
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function getAvailableModel() {
  const res = await request(`${API_BASE}/api/v1/models`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    }
  });
  if (res.statusCode !== 200) {
    throw new Error(`查询模型失败 ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }
  const models = res.body.data || [];
  const model = models.find((m) => !m.requiresPro) || models[0];
  if (!model) throw new Error('没有可用的图像生成模型');
  console.log('可用模型列表:', models.map((m) => m.name).join(', '));
  console.log('将使用模型:', model.name, `(积分:${model.creditsCost})`);
  return model.name;
}

async function generateOne(item, modelName) {
  const payload = JSON.stringify({
    prompt: item.prompt,
    selectedModel: modelName,
    quantity: 1,
    mode: 'sync'
  });

  const res = await request(`${API_BASE}/api/v1/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);

  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`API error ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }

  const urls = res.body.data?.outputImageUrls || res.body.data?.imageUrls || [];
  if (!urls.length) {
    throw new Error(`No image URLs in response: ${JSON.stringify(res.body)}`);
  }

  const dest = path.join(OUTPUT_DIR, `${item.key}.${item.ext}`);
  await downloadImage(urls[0], dest);
  console.log(`✓ ${item.key} -> ${dest}`);
}

/** Synthorai：OpenAI 兼容图像 API，b64 返回直接落盘 */
async function generateOneSynthorai(item) {
  const payload = JSON.stringify({
    model: SYN_MODEL,
    prompt: item.prompt,
    n: 1,
    size: item.size || '1024x1024',
    response_format: 'b64_json'
  });

  const res = await request(`${SYN_BASE}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SYNTHORAI_KEY}`,
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 180000
  }, payload);

  if (res.statusCode !== 200) {
    throw new Error(`Synthorai error ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }

  const b64 = res.body.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error(`响应中没有图像数据: ${JSON.stringify(res.body).slice(0, 300)}`);
  }

  const dest = path.join(OUTPUT_DIR, `${item.key}.${item.ext}`);
  fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
  console.log(`✓ ${item.key} -> ${dest}`);
}

/** API易：OpenAI 兼容图像 API，b64 或 url 返回均可处理 */
async function generateOneApiyi(item) {
  const body = {
    model: APIYI_MODEL,
    prompt: item.prompt,
    n: 1,
    size: item.size || '1024x1024'
  };
  // gpt-image-1 系列支持透明背景（item.transparent = true 时启用）
  if (item.transparent) body.background = 'transparent';
  const payload = JSON.stringify(body);

  const res = await request(`${APIYI_BASE}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIYI_KEY}`,
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 180000
  }, payload);

  if (res.statusCode !== 200) {
    throw new Error(`API易 error ${res.statusCode}: ${JSON.stringify(res.body).slice(0, 500)}`);
  }

  const dest = path.join(OUTPUT_DIR, `${item.key}.${item.ext}`);
  const first = res.body.data?.[0] || {};
  if (first.b64_json) {
    fs.writeFileSync(dest, Buffer.from(first.b64_json, 'base64'));
  } else if (first.url) {
    await downloadImage(first.url, dest);
  } else {
    throw new Error(`响应中没有图像数据: ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  console.log(`✓ ${item.key} -> ${dest}`);
}

async function main() {
  // CLI：node scripts/generate-assets.js [key ...] [--force]
  // 指定 key 时只生成这些（强制重跑，用于翻车时个别重跑）；
  // 未指定时跑全量但跳过已存在的文件（--force 关闭跳过）。
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyKeys = args.filter(a => !a.startsWith('--'));
  const tasks = onlyKeys.length > 0
    ? ALL_TASKS.filter(t => onlyKeys.includes(t.key))
    : ALL_TASKS;
  if (onlyKeys.length > 0 && tasks.length === 0) {
    console.error(`没有匹配的 key: ${onlyKeys.join(', ')}`);
    process.exit(1);
  }

  // --list：只列出任务清单（不生成），用于核对 PROP_ICONS_3 等任务构建结果
  if (args.includes('--list')) {
    console.log(`任务总数 ${tasks.length}`);
    for (const t of tasks) console.log(`  ${t.key}\t${t.prompt}`);
    return;
  }

  const useApiyi = !!APIYI_KEY;
  const useSynthorai = !useApiyi && !!SYNTHORAI_KEY;
  let modelName = null;
  if (useApiyi) {
    console.log(`使用 API易，模型: ${APIYI_MODEL}`);
  } else if (useSynthorai) {
    console.log(`使用 Synthorai，模型: ${SYN_MODEL}`);
  } else {
    modelName = await getAvailableModel();
  }
  console.log(`开始生成 ${tasks.length} 张素材，输出目录：${OUTPUT_DIR}`);
  let skipped = 0;
  for (let i = 0; i < tasks.length; i++) {
    const item = tasks[i];
    const dest = path.join(OUTPUT_DIR, `${item.key}.${item.ext}`);
    if (!force && onlyKeys.length === 0 && fs.existsSync(dest)) {
      skipped++;
      continue;
    }
    console.log(`[${i + 1}/${tasks.length}] 生成 ${item.key}...`);
    let ok = false;
    let retries = 0;
    while (!ok && retries < 3) {
      try {
        if (useApiyi) {
          await generateOneApiyi(item);
        } else if (useSynthorai) {
          await generateOneSynthorai(item);
        } else {
          await generateOne(item, modelName);
        }
        ok = true;
      } catch (e) {
        console.error(`✗ ${item.key} 失败 (重试 ${retries + 1}/3):`, e.message);
        retries++;
        if (retries < 3) await sleep(5000 * retries);
      }
    }
    // 避免并发限制，串行 + 间隔
    if (i < tasks.length - 1) await sleep(2000);
  }
  if (skipped > 0) console.log(`跳过已存在 ${skipped} 张（--force 可强制重跑）`);
  console.log('全部完成。');
}

main().catch(console.error);
