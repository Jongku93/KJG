/*
 * 로컬 시험 서버: node dev/server.js [포트]
 * - climate-expo/ 화면 파일을 그대로 보여 주고
 * - POST /api 요청을 mock-gas.js 위의 서버 코드로 처리한다.
 * 브라우저: http://localhost:8787/index.html , /admin.html (PIN 1234)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGas } = require('./mock-gas');

const port = Number(process.argv[2] || process.env.PORT || 8787);
const root = path.join(__dirname, '..');
const gas = createGas();
const delay = Number(process.env.API_DELAY || 120);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      setTimeout(() => {
        const out = gas.doPost({ postData: { contents: body } });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(out.getContent());
      }, delay);
    });
    return;
  }
  if (url.pathname === '/assets/config.js') {
    res.writeHead(200, { 'Content-Type': types['.js'] });
    res.end("window.EXPO_CONFIG = { API_URL: '/api' };");
    return;
  }
  let p = path.normalize(path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log('시험 서버: http://localhost:' + port));
