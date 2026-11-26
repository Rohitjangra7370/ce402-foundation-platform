// Unseen-data test: loads a profile the platform has never seen (imported through the file input), no water table.
const { chromium } = require('playwright'); const path = require('path'); const G = require('../src/engine.js');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, process.env.PAGE || '../index.html'));
  const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
  await p.setInputFiles('#importFile', path.resolve(__dirname, 'data/unseen_profile.json'));
  await p.waitForTimeout(200);
  const prof = JSON.parse(require('fs').readFileSync(path.resolve(__dirname, 'data/unseen_profile.json')));
  const P = { layers: prof.layers.map(L => ({ ...L, top: +L.top, bot: +L.bot, gm: L.gm === '' ? undefined : +L.gm, gs: L.gs === '' ? undefined : +L.gs, cu: L.cu ? +L.cu : undefined, e0: +L.e0, Cc: +L.Cc, Cr: +L.Cr, ocr: L.ocr ? +L.ocr : undefined, cv: +L.cv, Es: L.Es ? +L.Es : undefined })) };
  ok((await p.locator('#layerTable tbody tr').count()) === 3, 'imported 3 layers');
  const t1 = await p.locator('#profileOut').innerText();
  ok(t1.includes(G.stressAt(P, 6.5, Infinity).eff.toFixed(1)), "sigma'v at 6.5 m (no WT, gs-only clay) = " + G.stressAt(P, 6.5, Infinity).eff.toFixed(1));
  // bearing: 2 x 3 m rectangular footing on the dense sand, Df = 1.0 m, phi 36, no WT
  await p.click('.tab[data-p="p3"]');
  await p.selectOption('#bShape', 'rect'); for (const [k, v] of Object.entries({ '#bB': 2, '#bL': 3, '#bDf': 1, '#bc': 0, '#bphi': 36, '#bAlpha': 10, '#bE': 0.5, '#bP': 900, '#bt': 0.5 })) await p.fill(k, String(v));
  await p.selectOption('#bMode', 'general'); await p.click('#runBear');
  const q = G.stressAt(P, 1, Infinity).eff, gam = G.meanBulkGamma(P, 1, 3, Infinity);
  const r = G.bearing({ shape: 'rect', B: 2, L: 3, Df: 1, c: 0, phi: 36, gamma: gam, q, zw: Infinity, alpha: 10, mode: 'general', FS: 3 });
  const bt = await p.locator('#bearOut').innerText(); ok(bt.includes(r.qnu.toFixed(1)), 'inclined rectangular bearing qnu = ' + r.qnu.toFixed(1) + '; W\' shown 1.000: ' + /W′\s+1\.000/.test(bt));
  // settlement: 2x3 footing, q = 150, OC clay with OCR 2.5, single drainage chosen
  await p.click('.tab[data-p="p5"]'); for (const [k, v] of Object.entries({ '#tB': 2, '#tL': 3, '#tDf': 1, '#tq': 150 })) await p.fill(k, String(v));
  await p.click('#runSet'); await p.selectOption('#drain0', 'single');
  const st = await p.locator('#setOut').innerText();
  const cr = G.consolidationLayer({ profile: P, wt: Infinity, layer: P.layers[1], maxSub: 0.5, dsFn: z => G.dsPoint([{ x1: -1, x2: 1, y1: -1.5, y2: 1.5, q: 150 }], 0, 0, z - 1) });
  ok(st.includes(cr.S.toFixed(1)) && /both|recompression/.test(st), 'OC-clay consolidation S = ' + cr.S.toFixed(1) + ' mm (recompression branch used)');
  ok(!/NaN|Infinity/.test(st), 'no NaN/Infinity'); ok(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
  await b.close(); console.log(fails.length ? 'FAILED' : 'UNSEEN-DATA TEST PASSED'); process.exit(fails.length ? 1 : 0);
})();
