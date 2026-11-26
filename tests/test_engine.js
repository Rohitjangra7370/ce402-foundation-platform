// Run: node tests/test_engine.js
// Benchmarks are published values (code tables / textbook tables), not outputs of this engine.
const G = require('../src/engine.js');
let fail = 0;
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got ' + got.toFixed(4) + '  want ' + want + '  (+-' + tol + ')');
}
// IS 6403:1981 Table 1 (as read from the code; Nc(45) printed 138.88 in the OCR, formula gives 133.87)
const T1 = { 5: [6.49, 1.57, 0.45], 10: [8.35, 2.47, 1.22], 15: [10.98, 3.94, 2.65], 20: [14.83, 6.40, 5.39],
  25: [20.72, 10.66, 10.88], 30: [30.14, 18.40, 22.40], 35: [46.12, 33.30, 48.03], 40: [75.31, 64.20, 109.41], 45: [133.87, 134.88, 271.76] };
for (const p of Object.keys(T1)) {
  const f = G.bcFactors(+p);
  near('Nc phi=' + p, f.Nc, T1[p][0], 0.02 * Math.max(1, T1[p][0] / 30));
  near('Nq phi=' + p, f.Nq, T1[p][1], 0.02 * Math.max(1, T1[p][1] / 30));
  near('Ng phi=' + p, f.Ng, T1[p][2], 0.02 * Math.max(1, T1[p][2] / 30));
}
// Boussinesq influence factors (Das, standard table)
near('I(1,1)', G.Icorner(1, 1), 0.1752, 5e-4);
near('I(0.5,0.5)', G.Icorner(0.5, 0.5), 0.0840, 5e-4);
near('I(2,2)', G.Icorner(2, 2), 0.2325, 5e-4);
near('I(10,10)', G.Icorner(10, 10), 0.2490, 1e-3);
near('centre square z=B', G.dsCentre(100, 2, 2, 2) / 100, 0.336, 1e-3);
// point superposition equals closed-form centre / corner
near('dsPoint centre', G.dsPoint([{ x1: -1, x2: 1, y1: -1, y2: 1, q: 100 }], 0, 0, 3), G.dsCentre(100, 2, 2, 3), 1e-9);
near('dsPoint corner', G.dsPoint([{ x1: 0, x2: 2, y1: 0, y2: 2, q: 100 }], 0, 0, 3), G.dsCorner(100, 2, 2, 3), 1e-9);
// Terzaghi consolidation
near('U(Tv=0.197)', G.degreeU(0.197), 0.5, 0.005);
near('U(Tv=0.848)', G.degreeU(0.848), 0.9, 0.003);
// units: 8.9e-4 cm2/s = 2.81 m2/yr
near('cv conversion', 8.9e-4 * G.CM2S_TO_M2YR, 2.808, 0.005);
// W'
near("W' WT at base", G.waterFactor(1.5, 1.5, 2), 0.5, 1e-12);
near("W' WT at Df+B", G.waterFactor(3.5, 1.5, 2), 1.0, 1e-12);
near("W' WT mid", G.waterFactor(2.5, 1.5, 2), 0.75, 1e-12);
// DS fit exact line
const f = G.dsFit([50, 100, 150], [29.8, 58.9, 87.5]);
near('DS soaked SM slope', f.slope, 0.577, 1e-3);
// Strip footing, clay phi=0, c=50, Df=0 -> qnu = 5.14 c = 257
const b = G.bearing({ shape: 'strip', B: 2, Df: 0, c: 50, phi: 0, gamma: 18, q: 0, zw: Infinity, FS: 3 });
near('strip clay qnu', b.qnu, 257, 1e-6);
console.log(fail ? ('\n' + fail + ' FAILED') : '\nall passed');
process.exit(fail ? 1 : 0);
