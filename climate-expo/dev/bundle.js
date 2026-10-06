/*
 * gas/*.gs 7개를 하나로 합쳐 dist/Code.gs 를 만든다: node dev/bundle.js
 * Apps Script 편집기에 파일 하나만 붙여넣고 싶을 때 사용 (gas/ 를 고치면 다시 실행)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'gas');
const order = ['Config.gs', 'Data.gs', 'Setup.gs', 'Logic.gs', 'StudentApi.gs', 'AdminApi.gs', 'Api.gs'];
const all = fs.readdirSync(dir).filter((f) => f.endsWith('.gs'));
const missing = all.filter((f) => !order.includes(f));
if (missing.length) throw new Error('order에 없는 파일: ' + missing.join(', '));
const head = [
  '/**',
  ' * 2050 기후 도시 엑스포 — Apps Script 서버 코드 (한 파일 합본)',
  ' * 이 파일 하나를 Apps Script의 Code.gs에 통째로 붙여넣으면 됩니다.',
  ' * 원본: climate-expo/gas/*.gs  ·  만든 방법: node dev/bundle.js',
  ' */',
  ''
].join('\n');
const body = order.map((f) => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(dir, f), 'utf8').trim() + '\n').join('\n');
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'Code.gs'), head + body);
console.log('dist/Code.gs 생성 (' + Buffer.byteLength(head + body) + ' bytes)');
