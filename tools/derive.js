// Derived parameters from the laboratory sheets and SPT data (feeds the report; run: node tools/derive.js)
const G = require('../src/engine.js');
const S = require('../data/site.json');
const out = {};

// ---- direct shear ----
out.ds = {};
for (const [k, v] of Object.entries(S.lab.ds)) out.ds[k] = G.dsFit(v.sigma, v.tau);
// ---- UU triaxial ----
out.uu = {};
for (const [k, v] of Object.entries(S.lab.uu)) out.uu[k] = { cu: G.cuFromUU(v), dev: v };
// ---- oedometer (pressures kg/cm2 -> kPa) ----
const pts = S.lab.oed_kgcm2.map(r => ({ p: r.p * G.KGCM2_TO_KPA, e: r.e, stage: r.stage }));
out.oed = G.oedAnalyse(pts);
out.oed.cvTable = S.lab.oed_kgcm2.filter(r => r.cv).map(r => ({ p_kPa: r.p * G.KGCM2_TO_KPA, cv_cm2s: r.cv, cv_m2yr: r.cv * G.CM2S_TO_M2YR }));
// e0 check
out.e0check = { UDS1: 0.34 * 2.70, UDS2: 0.31 * 2.70, sand_e: 2.66 * 9.81 / 16.4 - 1 };

// ---- SPT corrections for every test (measured WT = condition at the time of test) ----
const drFromN1 = N => { const x = [0, 4, 10, 30, 50, 100], y = [0, 15, 35, 65, 85, 100]; for (let i = 1; i < x.length; i++) if (N <= x[i]) return y[i - 1] + (y[i] - y[i - 1]) * (N - x[i - 1]) / (x[i] - x[i - 1]); return 100; };
out.spt = {};
for (const [bh, d] of Object.entries(S.boreholes)) {
  out.spt[bh] = [];
  for (const L of d.layers) for (const t of (L.N || [])) {
    const r = G.sptCorrect({ N: t.N, z: t.z, profile: d, wt: d.wtMeasured, fineSand: !!L.fine,
      cohesionless: (L.kind === 'sand' || L.kind === 'gravel' || L.kind === 'fill'), refusal: !!t.refusal });
    out.spt[bh].push({ z: t.z, layer: L.sym, N: t.N, invalid: !!t.invalid, sigmaV: r.sigmaV, CN: r.CN, N1: r.N1, dil: r.dilatancy, Ncorr: r.Ncorr,
      phiN: (L.kind === 'sand' && !t.invalid) ? G.phiFromN(r.Ncorr) : null, Dr: (L.kind === 'sand') ? drFromN1(r.Ncorr) : null });
  }
}
// ---- effective stresses at clay mid-depths for the OCR comparison ----
out.clayStress = {};
for (const [bh, d] of Object.entries(S.boreholes)) {
  const c = d.layers.filter(l => l.kind === 'clay');
  out.clayStress[bh] = c.map(l => { const z = (l.top + l.bot) / 2; return { z, high: G.stressAt(d, z, d.wtHigh).eff, meas: G.stressAt(d, z, d.wtMeasured).eff, low: G.stressAt(d, z, d.wtLow).eff }; });
}
require('fs').mkdirSync(__dirname + '/../results', { recursive: true });
require('fs').writeFileSync(__dirname + '/../results/derived.json', JSON.stringify(out, null, 1));
console.log('DS fits:'); for (const [k, v] of Object.entries(out.ds)) console.log('  ', k, 'c=', v.c.toFixed(2), 'kPa  phi=', v.phi.toFixed(2), 'deg  R2=', v.r2.toFixed(5));
console.log('UU:', JSON.stringify(Object.fromEntries(Object.entries(out.uu).map(([k, v]) => [k, +v.cu.toFixed(2)]))));
console.log('Oed: Cc=', out.oed.Cc.toFixed(3), ' Cr=', out.oed.Cr.toFixed(3), ' Cri=', out.oed.Cri.toFixed(3), ' sigma_c=', out.oed.sigC.toFixed(1), 'kPa');
console.log('e0 checks', out.e0check);
for (const [bh, rows] of Object.entries(out.spt)) { console.log(bh); for (const r of rows) console.log('  z=' + r.z, r.layer, 'N=' + r.N, r.invalid ? '(invalid)' : '', r.sigmaV != null ? "s'v=" + r.sigmaV.toFixed(1) + ' CN=' + (r.CN || 0).toFixed(2) + " N'=" + (r.N1 || 0).toFixed(1) + ' dil=' + r.dil + ' Nc=' + r.Ncorr.toFixed(1) + (r.phiN ? ' phi(N)=' + r.phiN.toFixed(1) + ' Dr=' + r.Dr.toFixed(0) : '') : ''); }
console.log('clay mid-depth sigma_v0 (high/meas/low):'); for (const [bh, a] of Object.entries(out.clayStress)) console.log(' ', bh, a.map(x => 'z=' + x.z.toFixed(1) + ': ' + x.high.toFixed(0) + '/' + x.meas.toFixed(0) + '/' + x.low.toFixed(0)).join('  '));
