/* 교사 화면 스모크 시험: node dev/shot-admin.js (dev/server.js 실행 중이어야 함) */
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:8787';
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/admin.html');
  await page.fill('#pin', '1234');
  await page.click('#pinForm button');
  await page.waitForSelector('#adminShell');
  await page.click('[data-tab=roster]');
  const roster = ['번호,이름,팀'].concat(Array.from({ length: 24 }, (_, i) => `${i + 1},학생${i + 1},`)).join('\n');
  await page.fill('#rosterText', roster);
  await page.click('#btnRoster');
  await page.click('.modal .btn.primary');
  await page.waitForTimeout(800);
  for (const tab of ['dash', 'stages', 'roster', 'vote', 'points', 'cards', 'settings']) {
    await page.click(`[data-tab=${tab}]`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/admin-${tab}.png`, fullPage: false });
  }
  await page.click('[data-tab=stages]');
  await page.click('label.switch:has(input[data-flag=STAGE2_OPEN])');
  await page.waitForTimeout(600);
  const on = await page.isChecked('input[data-flag=STAGE2_OPEN]');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-tab=dash]');
  await page.screenshot({ path: `${out}/admin-mobile.png` });
  console.log(JSON.stringify({ stage2On: on, errors }, null, 1));
  await browser.close();
})();
