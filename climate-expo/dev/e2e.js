/*
 * 화면 통합 시험: node dev/server.js 를 켠 뒤 node dev/e2e.js [스크린샷폴더] [단계]
 * 단계: 2(기본, 1~2단계까지) / 3 / 4
 */
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:8787';
const out = process.argv[2] || '.';
const upto = Number(process.argv[3] || 4);

async function api(fn, ...args) {
  const r = await fetch(base + '/api', { method: 'POST', body: JSON.stringify({ fn, args }) });
  const j = await r.json();
  if (!j.ok) throw new Error(fn + ': ' + j.error);
  return j.data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const errors = [];
  const tok = (await api('adminLogin', '1234')).token;
  await api('adminResetAll', tok, '초기화', true);
  const roster = Array.from({ length: 24 }, (_, i) => `${i + 1},학생${i + 1},`).join('\n');
  let st = await api('adminSaveRoster', tok, roster, 6, 'order');
  const team = st.dashboard[0];
  const browser = await chromium.launch();
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext({ viewport: i === 1 ? { width: 390, height: 844 } : { width: 1200, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('P' + i + ': ' + e.message));
    p.on('dialog', (d) => d.accept());
    await p.goto(base + '/index.html');
    await p.fill('#teamCode', team.code.toLowerCase());
    await p.click('#codeForm button');
    await p.click(`[data-no="${team.members[i].no}"]`);
    await p.waitForSelector('#tabs');
    pages.push(p);
  }
  const [a, b, c, d] = pages;
  await a.screenshot({ path: `${out}/st-board.png`, fullPage: true });
  await a.click('[data-view=mission]');
  await a.screenshot({ path: `${out}/st-mission.png`, fullPage: true });

  // 다른 팀 하나는 API로 먼저 뽑아 둔다
  const t2 = st.dashboard[1];
  await api('drawClimate', t2.code, t2.members[0].no);

  // 1단계: 기후 뽑기
  await a.click('[data-view=s1]');
  await a.screenshot({ path: `${out}/st-s1-deck.png` });
  await a.click('[data-pick]');
  await a.click('.modal .btn.gold');
  await sleep(700);
  await a.screenshot({ path: `${out}/st-s1-flip.png` });
  await a.waitForSelector('.climate-info', { timeout: 8000 });
  // 직책
  const roles = ['housing', 'energy', 'food', 'transport'];
  for (let i = 0; i < 4; i++) {
    const p = pages[i];
    await p.click('[data-view=s1]');
    await p.waitForSelector(`[data-role="${roles[i]}"]`);
    await p.click(`[data-role="${roles[i]}"]`);
    await sleep(400);
  }
  await d.click('[data-view=s1]');
  await sleep(500);
  await d.screenshot({ path: `${out}/st-s1-roles.png`, fullPage: true });
  await b.click('[data-view=s1]');
  await b.screenshot({ path: `${out}/st-s1-mobile.png`, fullPage: true });

  // 2단계
  await api('adminSetSetting', tok, 'STAGE2_OPEN', true);
  for (const p of pages) { await p.reload(); await p.waitForSelector('#tabs'); await p.click('[data-view=s2]'); }
  await a.fill('#f-city_name', '비구름 위의 도시');
  await a.fill('#f-housing_what', '바닥을 3m 띄운 대나무 탑 주택');
  await a.fill('#f-housing_why', '일 년 내내 비가 많이 와서 땅이 자주 물에 잠기기 때문에');
  await a.click('#f-intro');
  await sleep(1800);
  // b가 남의 칸 편집 불가 확인
  const ro = await b.$eval('#f-housing_what', (el) => el.readOnly);
  // b 새로고침(폴링 흉내) 후 반영 확인
  await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(1500);
  const seen = await b.$eval('#f-housing_what', (el) => el.value);
  // 충돌: a와 c가 같은 공통 칸을 동시에 수정
  await a.fill('#f-intro', 'A가 쓴 소개');
  await c.fill('#f-intro', 'C가 쓴 소개');
  await a.click('#f-city_name');
  await sleep(600);
  await c.click('#f-city_name');
  await c.waitForSelector('.modal', { timeout: 5000 });
  await c.screenshot({ path: `${out}/st-s2-conflict.png` });
  await c.click('.modal .btn:has-text("둘 다 합치기")');
  await sleep(1200);
  await a.screenshot({ path: `${out}/st-s2.png`, fullPage: true });
  await b.screenshot({ path: `${out}/st-s2-mobile.png`, fullPage: true });
  st = await api('adminState', tok);
  const design = st.dashboard[0].design;
  console.log(JSON.stringify({
    readonlyForOthers: ro, seenByB: seen, intro: design.intro, city: design.city_name, errors
  }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
