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
  const CL = ['열대', '건조', '온대', '냉대', '한대', '고산'];
  const roster = Array.from({ length: 24 }, (_, i) => `${i + 1},학생${i + 1},${CL[Math.floor(i / 4)]}`).join('\n');
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

  // 1단계: 교사가 정한 기후 확인
  await a.click('[data-view=s1]');
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
  const extra = {};
  if (upto >= 3) {
    // 3단계: 잠김 예고 → 열림 → 뽑기 → 다른 팀원은 뒤집기
    await a.click('[data-view=s3]');
    await a.screenshot({ path: `${out}/st-s3-teaser.png` });
    await api('adminSetSetting', tok, 'STAGE3_OPEN', true);
    for (const p of pages) { await p.reload(); await p.waitForSelector('#tabs'); await p.click('[data-view=s3]'); }
    await a.click('#btnDrawDis');
    await a.click('.modal .btn.danger');
    await sleep(800);
    await a.screenshot({ path: `${out}/st-s3-flip.png` });
    await a.waitForSelector('#f-survive', { timeout: 8000 });
    await b.reload(); await b.waitForSelector('#tabs'); await b.click('[data-view=s3]');
    await b.click('#btnReveal');
    await b.waitForSelector('#f-survive', { timeout: 8000 });
    await a.fill('#f-survive', '바닥을 높인 집 덕분에 물이 들어오지 않고, 비가 많아도 빗물 저장 탱크로 모은다.');
    await b.fill('#f-fix', '교통·안전: 높은 다리 길을 하나 더 만들었다.');
    await a.click('#f-fix'); await b.click('#f-survive');
    await sleep(1500);
    await a.screenshot({ path: `${out}/st-s3.png`, fullPage: true });
    extra.s3done = (await api('state', team.code, team.members[0].no)).stages[2].done;
  }
  if (upto >= 4) {
    // 나머지 팀은 API로 빠르게 채움
    st = await api('adminState', tok);
    for (const t of st.dashboard.slice(1)) {
      const s2 = await api('state', t.code, t.members[0].no);
      await api('saveDesign', t.code, t.members[1].no, 'city_name', s2.climateInfo.name + ' 미래 도시', '');
      await api('saveDesign', t.code, t.members[1].no, 'intro', s2.climateInfo.desc + '에 맞춘 도시', '');
    }
    await api('adminSetSetting', tok, 'STAGE4_OPEN', true);
    for (const p of pages) { await p.reload(); await p.waitForSelector('#tabs'); await p.click('[data-view=s4]'); }
    await a.fill('#posterUrl', 'https://www.canva.com/design/DAF000/view');
    await a.click('#posterForm button');
    await sleep(800);
    await a.screenshot({ path: `${out}/st-s4-poster.png`, fullPage: true });
    await a.click('[data-sub=expo]');
    await a.screenshot({ path: `${out}/st-s4-expo.png`, fullPage: true });
    await a.click('[data-city=T1]');
    await a.screenshot({ path: `${out}/st-s4-detail.png` });
    await a.click('.modal .btn.ghost');
    await api('adminSetSetting', tok, 'VOTING_OPEN', true);
    for (const p of pages) { await p.reload(); await p.waitForSelector('#tabs'); await p.click('[data-view=s4]'); await p.click('[data-sub=vote]'); }
    // a: T2에 7, T3에 3
    for (let i = 0; i < 7; i++) await a.click('[data-team=T2] [data-step="1"]');
    for (let i = 0; i < 3; i++) await a.click('[data-team=T3] [data-step="1"]');
    await a.fill('[data-team=T2] .reason', '사막의 물 부족을 잘 해결했어요');
    await a.screenshot({ path: `${out}/st-s4-vote.png`, fullPage: true });
    await b.click('[data-team=T2] [data-step="1"]');
    await b.screenshot({ path: `${out}/st-s4-vote-mobile.png`, fullPage: true });
    extra.voteBtnDisabledPartial = await b.$eval('#btnVote', (el) => el.disabled);
    await a.click('#btnVote');
    await a.click('.modal .btn.gold');
    await sleep(1200);
    extra.aVoted = (await api('state', team.code, team.members[0].no)).vote.done;
    // 나머지 학생은 API로 투표
    st = await api('adminState', tok);
    for (const t of st.dashboard) for (const m of t.members) {
      if (m.voted) continue;
      const target = t.id === 'T1' ? { T2: 5, T4: 5 } : { T1: 6, [t.id === 'T5' ? 'T6' : 'T5']: 4 };
      await api('submitVote', t.code, m.no, target, { T1: '비 많은 기후에 딱 맞는 높은 집' });
    }
    await api('adminSetSetting', tok, 'RESULTS_PUBLIC', true);
    await a.reload(); await a.waitForSelector('#tabs');
    await a.click('[data-view=results]');
    await sleep(600);
    await a.screenshot({ path: `${out}/st-results.png`, fullPage: true });
    await b.reload(); await b.waitForSelector('#tabs'); await b.click('[data-view=results]');
    await b.screenshot({ path: `${out}/st-results-mobile.png`, fullPage: true });
    await b.click('[data-view=board]');
    await b.screenshot({ path: `${out}/st-board-mobile.png`, fullPage: true });
  }
  st = await api('adminState', tok);
  const design = st.dashboard[0].design;
  console.log(JSON.stringify({
    readonlyForOthers: ro, seenByB: seen, ...extra, intro: design.intro, city: design.city_name, errors
  }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
