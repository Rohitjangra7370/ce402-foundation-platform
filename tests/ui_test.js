// Browser test: drives the real page in headless Chromium and compares what the UI shows with the engine.
const { chromium } = require('playwright');
const path = require('path');
const Geo = require('../src/engine.js');
const S = require('../data/site.json');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, process.env.PAGE || '../index.html'));
  const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const txt = sel => page.locator(sel).innerText();
  const setv = (sel, v) => page.fill(sel, String(v));
  const tab = n => page.click('.tab[data-p="p' + n + '"]');

  // P1: blank start, then example
  ok((await txt('#profileOut')).includes('Enter layers'), 'blank start has no site data');
  await page.click('#exBH1');
  ok((await page.locator('#layerTable tbody tr').count()) === 6, 'BH-1 has 6 layers loaded');
  ok(await page.locator('#profileOut svg').count() === 2, 'profile + stress plots drawn');
  const t1 = await txt('#profileOut');
  const sv = Geo.stressAt(S.boreholes['BH-1'], 5.8, 1.0).eff;
  ok(t1.includes(sv.toFixed(1)), 'sigma-v at 5.8 m shown = ' + sv.toFixed(1));

  // P2 SPT
  await tab(2); await page.click('#runSPT');
  const spt = await txt('#sptOut');
  const r = Geo.sptCorrect({ N: 16, z: 3.0, profile: S.boreholes['BH-1'], wt: 2.6, fineSand: true, cohesionless: true });
  ok(spt.includes(r.CN.toFixed(3)), 'SPT CN at 3.0 m = ' + r.CN.toFixed(3));
  ok(spt.includes('refusal'), 'refusal flagged');
  ok(spt.includes('(rejected)'), 'rejected N=22 flagged');
  // DS / UU / Oed prefilled by example
  await page.click('#runDS'); const ds = await txt('#dsOut');
  ok(/φ′ = 29\.98 °/.test(ds), 'DS soaked SM phi = 29.98 (engine: 29.985)');
  await page.click('#runUU'); ok((await txt('#uuOut')).includes('28.52'), 'UU cu = 28.52 kPa');
  await page.click('#runOed'); const oed = await txt('#oedOut'); ok(/Cc = 0\.29/.test(oed), 'oedometer Cc 0.29');

  // P3 bearing
  await tab(3); await page.click('#fillBear'); await page.click('#runBear');
  const b = await txt('#bearOut');
  const P = S.boreholes['BH-1'];
  const wt = 1.0, Df = 1.5, B = 2.5, q = Geo.stressAt(P, Df, wt).eff, gam = Geo.meanBulkGamma(P, Df, Df + B, wt), L = Geo.layerAt(P, Df + 0.01);
  const br = Geo.bearing({ shape: 'square', B, L: B, Df, c: 0, phi: L.phi, gamma: gam, q, zw: wt, mode: 'auto', e: L.e, FS: 3 });
  ok(b.includes(br.qnu.toFixed(1)), 'bearing qnu shown = ' + br.qnu.toFixed(1));
  ok(b.includes('General shear') || b.includes('General'), 'factor table present');
  await page.click('#solveB'); const bb = await page.inputValue('#bB'); ok(isFinite(+bb) && +bb > 0.5, 'solve width gives B = ' + bb);
  await page.selectOption('#bShape', 'strip'); await setv('#bP', 400); await page.click('#runBear');
  ok(!(await txt('#bearOut')).includes('NaN'), 'strip: no NaN');
  await page.selectOption('#bShape', 'circle'); await page.click('#runBear'); ok(!(await txt('#bearOut')).includes('NaN'), 'circle: no NaN');
  await page.selectOption('#bShape', 'rect'); await setv('#bL', 4); await setv('#beB', 0.2); await page.click('#runBear'); ok(!(await txt('#bearOut')).includes('NaN'), 'rect+eccentric: no NaN');

  // P4 stress
  await tab(4); await setv('#sq', 200); await setv('#sB', 2); await setv('#sL', 2); await setv('#sZ', 6); await page.click('#runStress');
  const st = await txt('#stressOut'); ok(st.includes(Geo.dsCentre(200, 2, 2, 2).toFixed(2)), 'centre stress at z=2 = ' + Geo.dsCentre(200, 2, 2, 2).toFixed(2));
  ok(await page.locator('#stressOut svg').count() === 1, 'stress plot drawn');

  // P5 settlement
  await tab(5); await setv('#tB', 2.5); await setv('#tL', 2.5); await setv('#tDf', 1.5); await setv('#tq', 170); await page.click('#runSet');
  const se = await txt('#setOut'); ok(!se.includes('NaN') && !se.includes('Infinity'), 'settlement: no NaN/Infinity');
  const sch = Geo.schmertmann({ B: 2.5, L: 2.5, Df: 1.5, dp: 170, profile: P, wt: 1.0, t: 10, Es: (z, l, lb) => { const v = l.N.filter(t => !t.invalid).map(t => Math.min(100, t.N)); return l.qcN * 1000 * v.reduce((a, c) => a + c, 0) / v.length * (2.5 + Math.min(1, Math.max(0, (lb - 1) / 9))); } });
  ok(se.includes(sch.S.toFixed(1)), 'Schmertmann S shown = ' + sch.S.toFixed(1));
  ok(se.includes('Clay stratum'), 'time table present');
  const t90a = (await txt('#setOut')).match(/t90 \(yr\)[\s\S]*?\n/); 
  await page.selectOption('#drain0', 'single'); // re-render must keep the choice
  ok((await page.inputValue('#drain0')) === 'single', 'drainage choice survives re-render');
  const se2 = await txt('#setOut'); ok(se2 !== se, 'single drainage changes the time table');

  // error handling: broken profile
  await tab(1); await page.click('#clearAll'); await tab(5); await page.click('#runSet');
  ok((await txt('#setOut')).includes('Fix the soil profile'), 'empty profile gives a message, not a crash');
  await page.screenshot({ path: process.env.SHOT || '/tmp/ui.png', fullPage: false });

  ok(errors.length === 0, 'no JS errors: ' + JSON.stringify(errors));
  await browser.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'ALL UI TESTS PASSED'); process.exit(fails.length ? 1 : 0);
})();
