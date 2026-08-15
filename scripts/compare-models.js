/** 临时脚本：同一提示词对比多个 API易 模型的出图效果与速度 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const key = fs.readFileSync(path.join(__dirname, '..', 'key.env'), 'utf8')
  .split(/\r?\n/).find(l => l.startsWith('APIYI_API_KEY=')).split('=')[1].trim();

const MODELS = ['nano-banana-2', 'gemini-2.5-flash-image', 'seedream-4-0-250828', 'gpt-image-1-mini'];
const PROMPT = 'A cartoon hexagonal wrench, mobile game icon, cartoon style, 128x128, simple, clean background';
const OUT = path.join(__dirname, '..', 'assets', 'generated');

function gen(model) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ model, prompt: PROMPT, n: 1, size: '1024x1024' });
    const started = Date.now();
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
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        try {
          const j = JSON.parse(d);
          const first = j.data && j.data[0] || {};
          if (res.statusCode === 200 && (first.b64_json || first.url)) {
            const file = path.join(OUT, `test_${model.replace(/[^a-z0-9]/g, '_')}.png`);
            if (first.b64_json) {
              fs.writeFileSync(file, Buffer.from(first.b64_json, 'base64'));
              console.log(`✓ ${model}: ${secs}s, b64 -> ${file}`);
            } else {
              https.get(first.url, r => {
                const f = fs.createWriteStream(file);
                r.pipe(f);
                f.on('finish', () => { f.close(); console.log(`✓ ${model}: ${secs}s, url -> ${file}`); resolve(); });
              }).on('error', e => { console.log(`✗ ${model}: 下载失败 ${e.message}`); resolve(); });
              return;
            }
          } else {
            console.log(`✗ ${model}: ${res.statusCode} ${d.slice(0, 200)}`);
          }
        } catch (e) {
          console.log(`✗ ${model}: 解析失败 ${d.slice(0, 200)}`);
        }
        resolve();
      });
    });
    req.on('error', e => { console.log(`✗ ${model}: ${e.message}`); resolve(); });
    req.write(payload);
    req.end();
  });
}

(async () => {
  for (const m of MODELS) await gen(m);
  console.log('对比测试完成');
})();
