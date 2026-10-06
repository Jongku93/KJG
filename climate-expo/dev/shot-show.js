const { chromium } = require('playwright');
const base = 'http://localhost:8787'; const out = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/admin.html'); await p.fill('#pin', '1234'); await p.click('#pinForm button');
  await p.waitForSelector('#adminShell');
  await p.screenshot({ path: out + '/admin-dash2.png', fullPage: true });
  await p.click('[data-tab=vote]'); await p.screenshot({ path: out + '/admin-vote.png', fullPage: true });
  await p.click('#btnShow'); for (let i = 0; i < 6; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150); }
  await p.waitForTimeout(800); await p.screenshot({ path: out + '/admin-show.png' });
  await p.keyboard.press('Escape');
  await p.click('[data-tab=points]'); await p.click('#btnExport'); await p.waitForTimeout(800);
  await p.click('#btnWorld'); await p.waitForTimeout(800);
  await p.screenshot({ path: out + '/admin-points.png', fullPage: true });
  console.log(JSON.stringify({ errors }));
  await b.close();
})();
