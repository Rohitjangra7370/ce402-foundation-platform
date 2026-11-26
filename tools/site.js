// Site design runner. Uses ONLY src/engine.js and data/site.json.
// Usage: node tools/site.js [g] [Df]      g = group number (lambda = 1 + g/100)
const fs = require('fs');
const G = require('../src/engine.js');
const S = require('../data/site.json');

const g = process.argv[2] != null ? +process.argv[2] : 5;
const Df = process.argv[3] != null ? +process.argv[3] : 1.5;
const lam = 1 + g / 100;
const FS = 3;
const BMAX = 4.0;            // practical maximum for a 5 m grid (1.0 m clear between footings)
const cols = [];
const rows = S.grid.rows, lines = S.grid.lines;
const loadOf = {};
for (const k of Object.keys(S.loads)) for (const c of S.loads[k].cols) loadOf[c] = { P: S.loads[k].P, type: k };
for (let j = 0; j < rows.length; j++) for (let i = 0; i < lines.length; i++) {
  const name = rows[j] + lines[i];
  cols.push({ name, x: i * S.grid.dx, y: j * S.grid.dy, line: lines[i], bh: S.zones[lines[i]], P: loadOf[name].P * lam, P0: loadOf[name].P, type: loadOf[name].type });
}

function meanN(L) { const v = (L.N || []).filter(t => !t.invalid).map(t => Math.min(100, t.N)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
const EsFn = (zg, L, LB) => {
  if (L.Es) return L.Es;
  const N = meanN(L); if (N == null) throw new Error('no N for Es in ' + L.name);
  return L.qcN * 1000 * N * (2.5 + clamp((LB - 1) / 9, 0, 1) * 1.0);   // kPa (Schmertmann 1978: 2.5 qc axisymmetric ... 3.5 qc strip)
};
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

function bearingFor(bh, B, P) {
  const d = S.boreholes[bh], wt = d.wtHigh;
  const fL = G.layerAt(d, Df + 0.01);
  const q = G.stressAt(d, Df, wt).eff;
  const gam = G.meanBulkGamma(d, Df, Df + B, wt);
  const gAbove = G.stressAt(d, Df, wt).total / Df;                 // mean total unit weight above base
  const t = clamp((B - 0.4) / 4, 0.45, 1.2);                        // assumed footing thickness (m)
  const dW = B * B * t * (25 - gAbove);                              // concrete minus replaced soil (total weights)
  const Pnet = P + dW;
  const bc = G.bearing({ shape: 'square', B, L: B, Df, c: fL.c || 0, phi: fL.phi, gamma: gam, q, zw: wt, alpha: 0,
    mode: 'auto', e: fL.e, Dr: fL.Dr, FS });
  return { bc, q, gam, t, dW, Pnet, qnet: Pnet / (B * B), fL };
}
function sizeFooting(c) {
  for (let B = 1.0; B <= 8.0001; B += 0.05) {
    const r = bearingFor(c.bh, B, c.P);
    if (r.qnet <= r.bc.qns) { return { B: Math.ceil(B * 10 - 1e-9) / 10, r }; }
  }
  return { B: NaN, r: null };
}
for (const c of cols) { const s = sizeFooting(c); c.B = s.B; c.bear = bearingFor(c.bh, c.B, c.P); c.qnet = c.bear.qnet; c.util = c.qnet / c.bear.bc.qns; }

function settleAll(colsIn, neighbours) {
  const rects = colsIn.map(c => ({ x1: c.x - c.B / 2, x2: c.x + c.B / 2, y1: c.y - c.B / 2, y2: c.y + c.B / 2, q: c.qnet }));
  for (const c of colsIn) {
    const d = S.boreholes[c.bh], wt = d.wtHigh;
    const sch = G.schmertmann({ B: c.B, L: c.B, Df, dp: c.qnet, profile: d, wt, t: 10, Es: EsFn });
    const myRects = neighbours ? rects : [rects[colsIn.indexOf(c)]];
    let Scons = 0; const clays = [];
    for (const L of d.layers.filter(l => l.kind === 'clay')) {
      const cr = G.consolidationLayer({ profile: d, wt, layer: L, maxSub: 0.5, dsFn: z => G.dsPoint(myRects, c.x, c.y, z - Df) });
      Scons += cr.S; clays.push({ S: cr.S, H: cr.H, cv: L.cv, drainage: 'double', name: L.name });
    }
    c.Ssch = sch.S; c.Scons = Scons; c.Stot = sch.S + Scons; c.clays = clays; c.sch = sch;
  }
}
settleAll(cols, true);
const colsOwn = JSON.parse(JSON.stringify(cols)); settleAll(colsOwn, false);
cols.forEach((c, i) => { c.Scons_own = colsOwn[i].Scons; c.Stot_own = colsOwn[i].Stot; });

// differential / angular distortion between adjacent columns
const idx = {}; cols.forEach(c => idx[c.name] = c);
const pairs = [];
for (let j = 0; j < rows.length; j++) for (let i = 0; i < lines.length; i++) {
  const a = idx[rows[j] + lines[i]];
  if (i + 1 < lines.length) pairs.push([a, idx[rows[j] + lines[i + 1]]]);
  if (j + 1 < rows.length) pairs.push([a, idx[rows[j + 1] + lines[i]]]);
}
let worst = null;
for (const [a, b] of pairs) { const d = Math.abs(a.Stot - b.Stot), ang = d / 5000; if (!worst || ang > worst.ang) worst = { a: a.name, b: b.name, d, ang }; }
const lim = G.is1904Limits('isolated', 'sand', 5);
const res = { g, lambda: lam, Df, FS, limits: lim, cols, worst, nOver: cols.filter(c => c.B > BMAX).length };
fs.mkdirSync(__dirname + '/../results', { recursive: true });
fs.writeFileSync(__dirname + `/../results/isolated_g${g}_Df${Df}.json`, JSON.stringify(res, null, 1));

if (require.main === module) {
  console.log(`g=${g}  lambda=${lam}  Df=${Df} m  FS=${FS}   IS1904 isolated: total<=${lim.total} mm, diff<=${lim.diff.toFixed(1)} mm (${lim.diffFrac}L), ang<=${lim.angStr}`);
  console.log('col  BH   P(kN)  B(m)  qnet  qns   util  Ssch  Scons(own)  Scons(group)  Stot');
  for (const c of cols) console.log(c.name.padEnd(4), c.bh, c.P.toFixed(0).padStart(6), c.B.toFixed(1).padStart(5), c.qnet.toFixed(0).padStart(5), c.bear.bc.qns.toFixed(0).padStart(5),
    c.util.toFixed(2), c.Ssch.toFixed(1).padStart(6), c.Scons_own.toFixed(1).padStart(8), c.Scons.toFixed(1).padStart(10), c.Stot.toFixed(1).padStart(8), c.B > BMAX ? '  B>' + BMAX : '');
  console.log('worst adjacent pair', JSON.stringify(worst), ' angular distortion = 1/' + (1 / worst.ang).toFixed(0));
  const mx = Math.max(...cols.map(c => c.Stot)); console.log('max total settlement', mx.toFixed(1), 'mm');
}
module.exports = { cols, res, bearingFor, EsFn, S, Df };
