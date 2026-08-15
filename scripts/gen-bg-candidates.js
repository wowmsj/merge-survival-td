/** 临时脚本：生成 3 张候选主背景，人工挑一张 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const key = fs.readFileSync(path.join(__dirname, '..', 'key.env'), 'utf8')
  .split(/\r?\n/).find(l => l.startsWith('APIYI_API_KEY=')).split('=')[1].trim();

const CANDIDATES = [
  'Mobile survival game main background, portrait orientation, cozy campsite clearing at golden-hour dusk, warm campfire glow on one side, wooden crates and pine trees at the edges, large empty open area in the center for game board, casual cartoon style, soft muted colors, edges slightly darker vignette, full-bleed opaque, no text, no characters',
  'Mobile survival game main background, portrait orientation, abandoned backyard workshop at warm sunset, wooden fence and tool shelves along the edges, string lights glowing, large empty open area in the center for game board, casual cartoon style, soft muted warm colors, edges slightly darker vignette, full-bleed opaque, no text, no characters',
  'Mobile survival game main background, portrait orientation, forest clearing base camp in early morning, soft teal and warm beige palette, tents and wooden barricades along the edges, large empty open area in the center for game board, casual cartoon style, gentle flat lighting, edges slightly darker vignette, full-bleed opaque, no text, no characters'
];
const OUT = path.join(__dirname, '..', 'assets', 'generated');

function gen(i, prompt) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ model: 'gpt-image-1-mini', prompt, n: 1, size: '1024x1536' });
    const req = https.request('https://api.apiyi.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 180000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const first = j.data && j.data[0] || {};
          const file = path.join(OUT, `bg-cand-${i + 1}.png`);
          if (res.statusCode === 200 && first.b64_json) {
            fs.writeFileSync(file, Buffer.from(first.b64_json, 'base64'));
            console.log(`✓ bg-cand-${i + 1} -> ${file}`);
          } else if (res.statusCode === 200 && first.url) {
            https.get(first.url, r => {
              const f = fs.createWriteStream(file);
              r.pipe(f);
              f.on('finish', () => { f.close(); console.log(`✓ bg-cand-${i + 1} (url) -> ${file}`); resolve(); });
            }).on('error', e => { console.log(`✗ bg-cand-${i + 1} 下载失败 ${e.message}`); resolve(); });
            return;
          } else {
            console.log(`✗ bg-cand-${i + 1}: ${res.statusCode} ${d.slice(0, 200)}`);
          }
        } catch (e) {
          console.log(`✗ bg-cand-${i + 1}: 解析失败 ${d.slice(0, 200)}`);
        }
        resolve();
      });
    });
    req.on('error', e => { console.log(`✗ bg-cand-${i + 1}: ${e.message}`); resolve(); });
    req.write(payload);
    req.end();
  });
}

(async () => {
  for (let i = 0; i < CANDIDATES.length; i++) await gen(i, CANDIDATES[i]);
  console.log('候选背景生成完成');
})();
