// Raft / compensated-raft evaluation. Uses ONLY src/engine.js and data/site.json.
// Usage: node tools/raft.js [g] [Df] [t]     (g = group number, Df = founding depth m, t = raft thickness m)
const fs = require('fs');
const G = require('../src/engine.js'), S = require('../data/site.json');
const g = process.argv[2] != null ? +process.argv[2] : 5, Df = process.argv[3] != null ? +process.argv[3] : 1.5, t = process.argv[4] != null ? +process.argv[4] : 0.9;
const lam = 1 + g / 100, ov = 0.5;                       // raft projects 0.5 m beyond the outer columns
const gx = S.grid.dx, gy = S.grid.dy, lines = S.grid.lines, rows = S.grid.rows;
const X1 = -ov, X2 = (lines.length - 1) * gx + ov, Y1 = -ov, Y2 = (rows.length - 1) * gy + ov, Lr = X2 - X1, Br = Y2 - Y1, A = Lr * Br;
const loadOf = {}; for (const k of Object.keys(S.loads)) for (const c of S.loads[k].cols) loadOf[c] = S.loads[k].P;
let SP = 0; const cols = [];
for (let j = 0; j < rows.length; j++) for (let i = 0; i < lines.length; i++) { const n = rows[j] + lines[i]; const P = loadOf[n] * lam; SP += P; cols.push({ name: n, x: i * gx, y: j * gy, bh: S.zones[lines[i]], P }); }
const Wraft = 25 * t * A;
const qgross = (SP + Wraft) / A;
const out = { g, lambda: lam, Df, t, raft: { X1, X2, Y1, Y2, L: Lr, B: Br, A }, SumP: SP, Wraft, qgross };
// net pressure uses the TOTAL stress removed by the excavation (water table unchanged afterwards -> delta-sigma = delta-sigma')
const perBH = {};
for (const [bh, d] of Object.entries(S.boreholes)) {
  const wt = d.wtHigh, sTot = G.stressAt(d, Df, wt).total, u = G.stressAt(d, Df, wt).u;
  const qnet = qgross - sTot;
  perBH[bh] = { wt, sTot, u, qnet };
}
out.perBH = perBH;
const EsFn = (zg, L, LB) => { if (L.Es) return L.Es; const v = (L.N || []).filter(x => !x.invalid).map(x => Math.min(100, x.N)); const N = v.reduce((a, b) => a + b, 0) / v.length; return L.qcN * 1000 * N * (2.5 + Math.min(1, Math.max(0, (LB - 1) / 9))); };
for (const c of cols) {
  const d = S.boreholes[c.bh], pb = perBH[c.bh], wt = pb.wt;
  const rect = [{ x1: X1, x2: X2, y1: Y1, y2: Y2, q: Math.max(pb.qnet, 0) }];
  const dsFn = z => { const zb = z - Df; return zb <= 0 ? pb.qnet : G.dsPoint(rect, c.x, c.y, zb); };
  let Sc = 0;
  for (const L of d.layers.filter(l => l.kind === 'clay')) if (L.bot > Df) { if (pb.qnet <= 0) continue; Sc += G.consolidationLayer({ profile: d, wt, layer: L, dsFn, maxSub: 0.5, zMin: Df }).S; }
  // granular layers: Schmertmann for the whole raft (B = 16 m, L = 31 m), same value across a zone (conservative at the edges)
  c.Sc = Sc;
}
const sch = {};
for (const [bh, d] of Object.entries(S.boreholes)) { const pb = perBH[bh]; sch[bh] = pb.qnet > 0 ? G.schmertmann({ B: Br, L: Lr, Df, dp: pb.qnet, profile: d, wt: pb.wt, t: 10, Es: EsFn }).S : 0; }
out.schm = sch;
for (const c of cols) { c.Ssch = sch[c.bh]; c.Stot = c.Sc + c.Ssch; }
const idx = {}; cols.forEach(c => idx[c.name] = c);
let worst = null, maxd = 0;
for (let j = 0; j < rows.length; j++) for (let i = 0; i < lines.length; i++) {
  const a = idx[rows[j] + lines[i]];
  for (const b of [i + 1 < lines.length ? idx[rows[j] + lines[i + 1]] : null, j + 1 < rows.length ? idx[rows[j + 1] + lines[i]] : null]) if (b) { const d = Math.abs(a.Stot - b.Stot), ang = d / 5000; if (!worst || ang > worst.ang) worst = { a: a.name, b: b.name, d, ang }; }
}
const mx = Math.max(...cols.map(c => c.Stot)), mn = Math.min(...cols.map(c => c.Stot));
// Rigid-raft bound: least-squares plane S = a + b x + c y through the column settlements (equal weights).
// A stiff box (raft + basement walls) behaves between this and the flexible case; the truth needs a soil-structure interaction model.
{ const n = cols.length, mxx = cols.reduce((a, c) => a + c.x, 0) / n, myy = cols.reduce((a, c) => a + c.y, 0) / n, mS = cols.reduce((a, c) => a + c.Stot, 0) / n;
  let sxx = 0, syy = 0, sxy = 0, sxs = 0, sys = 0;
  for (const c of cols) { const dx = c.x - mxx, dy = c.y - myy, ds = c.Stot - mS; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxs += dx * ds; sys += dy * ds; }
  const det = sxx * syy - sxy * sxy, b = (sxs * syy - sys * sxy) / det, cc = (sys * sxx - sxs * sxy) / det;   // mm per m
  const tilt = Math.hypot(b, cc) / 1000;                                                                         // rad
  const corners = [[X1, Y1], [X2, Y1], [X1, Y2], [X2, Y2]].map(([x, y]) => mS + b * (x - mxx) + cc * (y - myy));
  out.rigid = { mean: mS, bx: b, by: cc, tilt, tiltStr: '1/' + (1 / tilt).toFixed(0), diff5m: tilt * 5000, maxCorner: Math.max(...corners), minCorner: Math.min(...corners) }; }
out.cols = cols; out.worst = worst; out.max = mx; out.min = mn; out.diffTotal = mx - mn;
out.limits = G.is1904Limits('raft', 'sand', 5);
// bearing capacity of the raft as a wide footing (Be = 16 m)
const bcs = {};
for (const [bh, d] of Object.entries(S.boreholes)) {
  const wt = d.wtHigh, fL = G.layerAt(d, Df + 0.01), q = G.stressAt(d, Df, wt).eff, gam = G.meanBulkGamma(d, Df, Df + Br, wt);
  const r = G.bearing({ shape: 'rect', B: Br, L: Lr, Df, c: fL.kind === 'clay' ? fL.cu : (fL.c || 0), phi: fL.kind === 'clay' ? 0 : fL.phi, gamma: gam, q, zw: wt, mode: fL.kind === 'clay' ? 'general' : 'auto', e: fL.e, Dr: fL.Dr, FS: 3 });
  bcs[bh] = { layer: fL.name, q, qnu: r.qnu, qns: r.qns, qnet: perBH[bh].qnet, util: perBH[bh].qnet / r.qns };
}
out.bearing = bcs;
fs.mkdirSync(__dirname + '/../results', { recursive: true });
fs.writeFileSync(__dirname + `/../results/raft_g${g}_Df${Df}_t${t}.json`, JSON.stringify(out, null, 1));
if (require.main === module) {
  console.log(`RAFT g=${g} lam=${lam} Df=${Df} t=${t}: ${Lr}x${Br} m, A=${A} m2, SumP=${SP.toFixed(0)} kN, Wraft=${Wraft.toFixed(0)}, q_gross=${qgross.toFixed(1)} kPa`);
  for (const [k, v] of Object.entries(perBH)) console.log(' ', k, 'WT', v.wt, 'sigma_v(Df)=' + v.sTot.toFixed(1), 'u=' + v.u.toFixed(1), 'q_net=' + v.qnet.toFixed(1), ' Schmertmann(granular)=' + sch[k].toFixed(1), 'bearing util=' + bcs[k].util.toFixed(2) + ' (qns ' + bcs[k].qns.toFixed(0) + ')');
  for (const j of [0, 1, 2, 3]) console.log(' row ' + rows[j] + ': ' + lines.map((l, i) => idx[rows[j] + l].Stot.toFixed(0).padStart(4)).join(' '));
  console.log(` RIGID bound: mean ${out.rigid.mean.toFixed(1)} mm, corner range ${out.rigid.minCorner.toFixed(1)}..${out.rigid.maxCorner.toFixed(1)} mm, tilt ${out.rigid.tiltStr}, diff over 5 m ${out.rigid.diff5m.toFixed(1)} mm`);
  console.log(` max ${mx.toFixed(1)} mm  min ${mn.toFixed(1)} mm  total differential ${(mx - mn).toFixed(1)} mm | worst adjacent ${worst.a}-${worst.b} d=${worst.d.toFixed(1)} mm => 1/${(1 / worst.ang).toFixed(0)}  | IS1904 raft: total<=${out.limits.total} diff<=${out.limits.diff.toFixed(1)} ang<=${out.limits.angStr}`);
}
