const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const roots = { '/models/': 'assets/models', '/merge/': 'public/merge-demo', '/icons/': 'assets/generated', '/data/': 'src/core/config/data', '/vendor/addons/': 'node_modules/three/examples/jsm', '/vendor/': 'node_modules/three/build', '/': 'public/three-demo' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const prefix = Object.keys(roots).find(p => url.pathname.startsWith(p));
  const base = path.join(root, roots[prefix]);
  const file = path.resolve(base, '.' + '/' + decodeURIComponent(url.pathname.slice(prefix.length) || 'index.html'));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.glb') ? 'model/gltf-binary' : file.endsWith('.png') ? 'image/png' : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store'); res.end(data);
  });
});
const port = Number(process.argv[2] || 58920);
server.listen(port, '127.0.0.1', () => console.log(`Three demo: http://127.0.0.1:${port}`));
