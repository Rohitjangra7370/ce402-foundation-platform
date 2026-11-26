/* ==========================================================================
   engine.js - calculation engine for the CE 402 foundation platform
   Pure functions, no DOM, no site data. Works in the browser (window.Geo)
   and in Node (require). Units: kN, kPa, m, mm unless stated otherwise.

   Every equation carries a "SRC:" comment (code clause, or textbook/paper).
   Equation NUMBERS of textbooks are deliberately not quoted: they differ
   between editions. Check them in your own copy before submitting.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geo = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GAMMA_W = 9.81;                 // kN/m3, unit weight of water
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const log10 = Math.log10;
  const SEC_PER_YEAR = 365.25 * 24 * 3600;
  // 1 cm2/s -> m2/year (1 cm2 = 1e-4 m2).  Unit-conversion helper used by P5.
  const CM2S_TO_M2YR = 1e-4 * SEC_PER_YEAR;     // = 3155.76
  const KGCM2_TO_KPA = 98.0665;                  // 1 kg/cm2 in kPa (oedometer pressures)

  // =====================================================================
  // P1  Soil profile and stresses
  // =====================================================================
  /* layer: {name, sym, kind:'fill'|'sand'|'gravel'|'silt'|'clay', top, bot, gm, gs,
             N:[{z,N}], c, phi, cu, Es, qcN, e0, Cc, Cr, ocr, cv, fines}  (depths m bgl)  */
  function unitWeights(L) {
    const gs = (L.gs != null && L.gs !== '') ? +L.gs : +L.gm;
    const gm = (L.gm != null && L.gm !== '') ? +L.gm : gs;
    return { gm, gs };
  }
  function layerAt(profile, z) {
    const Ls = profile.layers;
    for (const L of Ls) if (z >= L.top - 1e-9 && z <= L.bot + 1e-9) return L;
    return z > Ls[Ls.length - 1].bot ? Ls[Ls.length - 1] : Ls[0];
  }
  /* Total stress, pore pressure and effective stress at depth z (m bgl) for a water
     table at depth zw (m bgl; Infinity = none).
     SRC: Terzaghi effective-stress principle; IS 6403:1981 cl. 2.2.2 (total unit weight
     above, submerged below the water table).  No capillary rise assumed. */
  function stressAt(profile, z, zw) {
    if (zw == null || zw === '') zw = Infinity;
    let tot = 0;
    const Ls = profile.layers;
    for (let i = 0; i < Ls.length; i++) {
      const L = Ls[i];
      if (z <= L.top) break;
      const a = L.top;
      const b = (i === Ls.length - 1) ? z : Math.min(z, L.bot);   // last layer extends downward
      if (b <= a) continue;
      const { gm, gs } = unitWeights(L);
      const dry = Math.max(0, Math.min(b, zw) - a);
      tot += gm * dry + gs * ((b - a) - dry);
    }
    const u = z > zw ? GAMMA_W * (z - zw) : 0;
    return { total: tot, u, eff: tot - u };
  }
  /* Mean TOTAL unit weight between two depths (used for gamma in the 3rd bearing term,
     because IS 6403 defines gamma as the bulk unit weight and handles the water table
     through W').
     SRC: IS 6403:1981 cl. 5.1.2 (definition of gamma in the third term); depth-average of total stress. */
  function meanBulkGamma(profile, z0, z1, zw) {
    if (z1 <= z0) return unitWeights(layerAt(profile, z0)).gm;
    return (stressAt(profile, z1, zw).total - stressAt(profile, z0, zw).total) / (z1 - z0);
  }

  // =====================================================================
  // P2  Parameter tools
  // =====================================================================
  /* SPT corrections. Returns every step so the user can see it.
     SRC: IS 2131:1981 - overburden correction N' = CN.N (CN from the chart of Peck,
          Hanson & Thornburn 1974, closed form CN = 0.77 log10(2000/sigma'v), sigma'v in
          kPa, capped at 2.0); then the dilatancy correction (Terzaghi & Peck 1948),
          Ncorr = 15 + 0.5 (N' - 15), only for FINE or SILTY sand BELOW the water table
          and only when N' > 15.  Order: overburden first, then dilatancy on N'
          (BIS revision draft of IS 2131, cl. 5.7.1-5.7.4; NPTEL Module 1 Lec. 4).
     opts: {N, z, profile, wt, fineSand:boolean, cohesionless:boolean, refusal:boolean} */
  function sptCorrect(o) {
    const steps = [];
    const N = +o.N;
    steps.push({ label: 'Observed N', value: N, note: 'blows / 300 mm' });
    if (o.refusal || N >= 100) {
      steps.push({ label: 'Result', value: N, note: 'Refusal (N >= 100 or 50 blows < 300 mm): no correction; treat as very dense, not a numerical N.' });
      return { steps, N: N, Ncorr: N, CN: null, refusal: true };
    }
    if (o.cohesionless === false) {
      steps.push({ label: 'Result', value: N, note: 'Cohesive soil: IS 2131 overburden/dilatancy corrections are for cohesionless soils only.' });
      return { steps, N: N, Ncorr: N, CN: null };
    }
    const sv = stressAt(o.profile, o.z, o.wt);
    steps.push({ label: "Effective stress at test depth, sigma'v", value: sv.eff, unit: 'kPa',
      note: 'z = ' + o.z + ' m; water table at ' + (isFinite(o.wt) ? o.wt + ' m (at the time of the test)' : 'none') });
    let CN = 0.77 * log10(2000 / sv.eff);
    const capped = CN > 2.0;
    CN = Math.min(2.0, CN);
    steps.push({ label: 'Overburden factor CN = 0.77 log10(2000/sigma\'v)', value: CN, note: capped ? 'capped at 2.0' : (sv.eff < 25 ? 'sigma\'v < 25 kPa: below the range of the chart, interpret with care' : '') });
    const N1 = CN * N;
    steps.push({ label: "N' = CN x N", value: N1 });
    const below = o.z > o.wt;
    let Nc = N1, dil = false;
    if (o.fineSand && below && N1 > 15) { Nc = 15 + 0.5 * (N1 - 15); dil = true; }
    steps.push({ label: 'Dilatancy correction', value: Nc,
      note: dil ? "applied: Ncorr = 15 + 0.5 (N' - 15)" :
        ('not applied: ' + (!o.fineSand ? 'not fine/silty sand' : (!below ? 'test depth above the water table' : "N' <= 15"))) });
    return { steps, N, Ncorr: Nc, CN, N1, dilatancy: dil, sigmaV: sv.eff };
  }
  /* Friction angle from corrected N.
     SRC: Peck, Hanson & Thornburn (1974) chart, fitted by Wolff (1989):
          phi = 27.1 + 0.3 N - 0.00054 N^2   (degrees). Correlation only; prefer lab data. */
  function phiFromN(N) { return 27.1 + 0.3 * N - 0.00054 * N * N; }

  /* Ordinary least squares tau = c + sigma tan(phi).
     SRC: Mohr-Coulomb strength envelope fitted by ordinary least squares (any statistics
          text); direct shear: IS 2720 (Part 13).
     o.origin = true forces c = 0. */
  function dsFit(sigma, tau, o) {
    o = o || {};
    const n = sigma.length;
    let slope, c;
    if (o.origin) {
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += sigma[i] * tau[i]; sxx += sigma[i] * sigma[i]; }
      slope = sxy / sxx; c = 0;
    } else {
      const mx = sigma.reduce((a, b) => a + b, 0) / n, my = tau.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (sigma[i] - mx) * (tau[i] - my); sxx += (sigma[i] - mx) ** 2; }
      slope = sxy / sxx; c = my - slope * mx;
    }
    let ssRes = 0, ssTot = 0;
    const my2 = tau.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) { ssRes += (tau[i] - (c + slope * sigma[i])) ** 2; ssTot += (tau[i] - my2) ** 2; }
    return { c, slope, phi: deg(Math.atan(slope)), r2: ssTot > 0 ? 1 - ssRes / ssTot : 1, n };
  }
  /* UU triaxial: cu = (sigma1 - sigma3)f / 2.  SRC: IS 2720 (Part 11); phi_u = 0 analysis. */
  function cuFromUU(devStresses) {
    const m = devStresses.reduce((a, b) => a + b, 0) / devStresses.length;
    return m / 2;
  }
  /* Oedometer analysis. pts: [{p (kPa), e, stage:'L'|'U'}] in the order tested.
     Cc = slope of the last loading increments (virgin line), Cr = slope of the unloading branch;
     sigma'c = intersection of the initial (recompression) line and the virgin line
     (bilinear approximation of Casagrande's construction - a graphical judgement).
     SRC: Terzaghi & Peck 1967; Casagrande 1936 (preconsolidation); IS 2720 (Part 15). */
  function oedAnalyse(pts, opt) {
    opt = opt || {};
    const L = pts.filter(p => p.stage !== 'U');
    const U = pts.filter(p => p.stage === 'U');
    const nv = opt.nVirgin || 3, ni = opt.nInitial || 3;
    const reg = arr => {          // regression e vs log10 p
      const x = arr.map(p => log10(p.p)), y = arr.map(p => p.e), n = arr.length;
      const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
      const s = sxy / sxx; return { slope: s, icpt: my - s * mx };
    };
    const virgin = reg(L.slice(-nv)), init = reg(L.slice(0, ni));
    const Cc = -virgin.slope;
    let Cr = null;
    if (U.length >= 1) {
      const un = [L[L.length - 1]].concat(U);
      Cr = -reg(un).slope;
    }
    // intersection: e = icpt + slope log p
    let sigC = null;
    if (Math.abs(virgin.slope - init.slope) > 1e-9) {
      const lp = (init.icpt - virgin.icpt) / (virgin.slope - init.slope);
      sigC = Math.pow(10, lp);
    }
    return { Cc, Cr, Cri: -init.slope, sigC, virgin, init };
  }

  // =====================================================================
  // P3  Bearing capacity - IS 6403:1981
  // =====================================================================
  /* Bearing capacity factors.
     SRC: IS 6403:1981 Table 1.  Closed forms that reproduce Table 1:
       Nq = e^(pi tan phi) tan^2(45+phi/2)   (Reissner/Prandtl)
       Nc = (Nq - 1) cot phi ;  Nc(0) = 5.14
       Ngamma = 2 (Nq + 1) tan phi  (Vesic form - reproduces Table 1: 22.40 at 30 deg).
     NOTE: Meyerhof's (Nq-1)tan(1.4 phi) and Hansen's 1.5(Nq-1)tan phi give different
     values (15.7 and 15.1 at 30 deg) and must NOT be mixed with IS 6403 shape/depth factors. */
  function bcFactors(phi) {
    if (phi < 1e-9) return { Nc: 5.14, Nq: 1.0, Ng: 0.0 };
    const t = Math.tan(rad(phi));
    const Nq = Math.exp(Math.PI * t) * Math.tan(rad(45 + phi / 2)) ** 2;
    return { Nc: (Nq - 1) / t, Nq, Ng: 2 * (Nq + 1) * t };
  }
  /* SRC: IS 6403:1981 Table 2.  Rectangle row as printed in secondary copies
     (sq = 1 + 0.2 B/L); the primary scan is not legible - verify in your copy. */
  function shapeFactors(shape, B, L) {
    switch (shape) {
      case 'strip': return { sc: 1, sq: 1, sg: 1 };
      case 'square': return { sc: 1.3, sq: 1.2, sg: 0.8 };
      case 'circle': return { sc: 1.3, sq: 1.2, sg: 0.6 };
      default: { const r = B / L; return { sc: 1 + 0.2 * r, sq: 1 + 0.2 * r, sg: 1 - 0.4 * r }; }
    }
  }
  /* SRC: IS 6403:1981 cl. 5.1.2.2 depth factors (backfill must be compacted). */
  function depthFactors(phi, Df, B) {
    const Nphi = Math.tan(rad(45 + phi / 2)) ** 2, r = Df / B;
    const dc = 1 + 0.2 * r * Math.sqrt(Nphi);
    const dq = phi > 10 ? 1 + 0.1 * r * Math.sqrt(Nphi) : 1;
    return { dc, dq, dg: dq, Nphi };
  }
  /* SRC: IS 6403:1981 cl. 5.1.2.3 inclination factors (alpha = load inclination from vertical). */
  function inclFactors(phi, alpha) {
    const ic = (1 - alpha / 90) ** 2;
    const ig = phi > 1e-9 ? Math.max(0, 1 - alpha / phi) ** 2 : (alpha > 0 ? 0 : 1);
    return { ic, iq: ic, ig };
  }
  /* SRC: IS 6403:1981 cl. 5.1.2.4: W' = 1 if the water table is at or below Df + B;
          W' = 0.5 if it is at or above the base; linear in between. */
  function waterFactor(zw, Df, B) {
    if (zw == null || !isFinite(zw)) return 1;
    if (zw <= Df) return 0.5;
    if (zw >= Df + B) return 1;
    return 0.5 + 0.5 * (zw - Df) / B;
  }
  /* Net ultimate bearing capacity, one shear mode.
     SRC: IS 6403:1981 cl. 5.1.2(a):
       qnu = c Nc sc dc ic + q (Nq-1) sq dq iq + 0.5 B gamma Ngamma sg dg ig W'
     q = effective overburden at base level; gamma = BULK unit weight of foundation soil. */
  function bcCore(p, phi, c) {
    const N = bcFactors(phi);
    const S = shapeFactors(p.shape, p.Be, p.Le);
    const D = depthFactors(phi, p.Df, p.Be);
    const I = inclFactors(phi, p.alpha || 0);
    const W = waterFactor(p.zw, p.Df, p.Be);
    const t1 = c * N.Nc * S.sc * D.dc * I.ic;
    const t2 = p.q * (N.Nq - 1) * S.sq * D.dq * I.iq;
    const t3 = 0.5 * p.Be * p.gamma * N.Ng * S.sg * D.dg * I.ig * W;
    return { phi, c, N, S, D, I, W, t1, t2, t3, qnu: t1 + t2 + t3 };
  }
  /* Full IS 6403 evaluation including shear mode, eccentricity and factor of safety.
     p: {shape, B, L, Df, c, phi, gamma, q, zw, alpha, eB, eL, mode:'general'|'local'|'auto',
         e (void ratio) | Dr (%), FS}
     Local shear: tan(phi') = 0.67 tan(phi)  (IS 6403 Table 3 note), c' = 2c/3 (Terzaghi 1943).
     Medium soils (e 0.55..0.75 or Dr 70..20 %): interpolate between general and local shear
     (IS 6403:1981 cl. 5.2.1.1 and Table 3).
     Eccentricity: B' = B - 2eB, L' = L - 2eL, A' = B'L' (IS 6403:1981 cl. 5.0.1 / Meyerhof).
     SRC: IS 6403:1981 (shear modes, effective area); Terzaghi (1943) for the local-shear reduction;
          FS applied to the NET ultimate capacity: qns = qnu / FS (IS 6403:1981; clause number to be confirmed in the group's copy). */
  function bearing(p) {
    const FS = p.FS || 3;
    let Be = p.B, Le = (p.shape === 'strip') ? Infinity : (p.shape === 'circle' ? p.B : (p.L || p.B));
    const eB = p.eB || 0, eL = p.eL || 0;
    if (p.shape === 'circle' && (eB || eL)) throw new Error('Eccentric circular footings are not supported');
    if (p.shape !== 'circle') { Be = p.B - 2 * eB; if (isFinite(Le)) Le = Le - 2 * eL; }
    if (Be <= 0 || Le <= 0) throw new Error('Eccentricity too large (B\' <= 0)');
    let shape = p.shape;
    if (shape === 'square' && (eB || eL)) shape = 'rect';
    if (shape === 'rect' && isFinite(Le) && Be > Le) { const t = Be; Be = Le; Le = t; }
    const area = (shape === 'strip') ? Be : (p.shape === 'circle' ? Math.PI * p.B * p.B / 4 : Be * Le);
    const base = { shape, Be, Le, Df: p.Df, q: p.q, gamma: p.gamma, zw: p.zw, alpha: p.alpha };
    const gen = bcCore(base, p.phi, p.c || 0);
    const phiL = deg(Math.atan(0.67 * Math.tan(rad(p.phi))));
    const loc = bcCore(base, phiL, (2 / 3) * (p.c || 0));
    let w = 0, mode = p.mode || 'general';
    if (mode === 'local') w = 1;
    else if (mode === 'auto') {
      if (p.e != null && p.e !== '') w = clamp((p.e - 0.55) / 0.20, 0, 1);
      else if (p.Dr != null && p.Dr !== '') w = clamp((70 - p.Dr) / 50, 0, 1);
    }
    const qnu = (1 - w) * gen.qnu + w * loc.qnu;
    const main = w >= 0.5 ? loc : gen;
    return { Be, Le, area, shape, gen, loc, wLocal: w, mode, qnu, qns: qnu / FS, FS,
             qsafeGross: qnu / FS + p.q, W: gen.W };
  }
  /* Effective-area pressure helper: net applied pressure on the effective area.
     Q (kN) is the net load (column load + footing/backfill minus replaced soil).
     SRC: IS 6403:1981 cl. 5.0.1 (effective area); net pressure = gross - overburden removed (Terzaghi & Peck 1967). */
  function netPressure(Q, area) { return Q / area; }

  // =====================================================================
  // P4  Stress increase
  // =====================================================================
  /* Influence factor at the CORNER of a uniformly loaded rectangle, m = b/z, n = l/z.
     SRC: Boussinesq (1885) integrated by Newmark (1935); closed form as in Das, Principles
          of Foundation Engineering, "stress below the corner of a rectangular area".
     atan2 form is valid for m^2 n^2 > m^2 + n^2 + 1 as well (the plain arctan is not). */
  function Icorner(m, n) {
    if (m <= 0 || n <= 0) return 0;
    const m2 = m * m, n2 = n * n, r = Math.sqrt(m2 + n2 + 1);
    const a = 2 * m * n * r / (m2 + n2 + m2 * n2 + 1) * (m2 + n2 + 2) / (m2 + n2 + 1);
    const b = Math.atan2(2 * m * n * r, m2 + n2 - m2 * n2 + 1);
    return (a + b) / (4 * Math.PI);
  }
  /* Vertical stress increase below the corner of a rectangle B x L loaded with q.
     SRC: Boussinesq (1885) / Newmark (1935): delta-sigma_z = q I(m = B/z, n = L/z). */
  function dsCorner(q, B, L, z) {
    if (z <= 0) return q;
    return q * Icorner(B / z, L / z);
  }
  /* Below the CENTRE: four sub-rectangles of B/2 x L/2 (superposition).
     SRC: Newmark (1935) superposition of corner stresses; Das, Principles of Foundation Engineering. */
  function dsCentre(q, B, L, z) {
    if (z <= 0) return q;
    return 4 * q * Icorner(B / 2 / z, L / 2 / z);
  }
  /* General point (px,py) and several rectangles {x1,x2,y1,y2,q}: inclusion-exclusion over
     the four corners measured from the point (superposition).  z > 0.
     SRC: Newmark (1935) superposition: sign-weighted sum of corner influence factors. */
  function dsPoint(rects, px, py, z) {
    let tot = 0;
    const I = (a, b) => Math.sign(a) * Math.sign(b) * Icorner(Math.abs(a) / z, Math.abs(b) / z);
    for (const r of rects) {
      const x1 = r.x1 - px, x2 = r.x2 - px, y1 = r.y1 - py, y2 = r.y2 - py;
      tot += r.q * (I(x2, y2) - I(x1, y2) - I(x2, y1) + I(x1, y1));
    }
    return tot;
  }
  /* 2:1 method.  SRC: Terzaghi & Peck (1948) approximate load spread, 2 vertical : 1 horizontal.
     Delta-sigma = q B L / ((B+z)(L+z)) ; strip: q B/(B+z). */
  function dsTwoToOne(q, B, L, z) {
    if (!isFinite(L)) return q * B / (B + z);
    return q * B * L / ((B + z) * (L + z));
  }

  // =====================================================================
  // P5  Settlement
  // =====================================================================
  /* Strain-influence-factor method.
     SRC: Schmertmann, Hartman & Brown (1978), J. Geotech. Eng. Div. ASCE 104(GT8):
       S = C1 C2 dp  SUM( Iz/Es dz )
       C1 = 1 - 0.5 sigma'v0/dp  (>= 0.5);   C2 = 1 + 0.2 log10(t/0.1)  (t in years)
       Izp = 0.5 + 0.1 sqrt(dp/sigma'vp)  at z = 0.5B (square) ... B (strip, L/B >= 10)
       Iz(0) = 0.1 (square) ... 0.2 (strip); Iz = 0 at 2B (square) ... 4B (strip);
       linear interpolation with L/B (1..10).
     o: {B, L, Df, dp (net pressure kPa), profile, wt, t (years), Es:function(zBgl, layer)->kPa}
     Layers of kind 'clay' are skipped (their settlement is done by consolidation, spec P5). */
  function schmertmann(o) {
    const LB = clamp((o.L || o.B) / o.B, 1, 10);
    const f = (LB - 1) / 9;
    const Iz0 = 0.1 + 0.1 * f;
    const zp = o.B * (0.5 + 0.5 * f);
    const zmax = o.B * (2 + 2 * f);
    const svBase = stressAt(o.profile, o.Df, o.wt).eff;
    const svp = stressAt(o.profile, o.Df + zp, o.wt).eff;
    const Izp = 0.5 + 0.1 * Math.sqrt(Math.max(0, o.dp) / svp);
    const Iz = z => z <= 0 ? Iz0 : (z < zp ? Iz0 + (Izp - Iz0) * z / zp : (z < zmax ? Izp * (zmax - z) / (zmax - zp) : 0));
    const C1 = Math.max(0.5, 1 - 0.5 * svBase / o.dp);
    const t = o.t || 10;
    const C2 = 1 + 0.2 * log10(t / 0.1);
    const n = 400, dz = zmax / n;
    let sum = 0; const rows = []; let clayCut = 0;
    for (let i = 0; i < n; i++) {
      const zm = (i + 0.5) * dz, zg = o.Df + zm;
      const L = layerAt(o.profile, zg);
      if (L.kind === 'clay') { clayCut += dz; continue; }
      const Es = o.Es(zg, L, LB);
      sum += Iz(zm) / Es * dz;
      if (i % 4 === 0) rows.push({ z: zm, Iz: Iz(zm), Es });
    }
    const S = C1 * C2 * o.dp * sum * 1000;   // mm
    return { S, C1, C2, Izp, Iz0, zp, zmax, svBase, svp, LB, clayExcluded: clayCut, Iz, sumIzEsDz: sum };
  }
  /* Stage-by-stage one-dimensional consolidation of ONE clay layer in sublayers <= maxSub.
     SRC: Terzaghi (1943); Das, Principles of Geotechnical Engineering (primary consolidation
          settlement of NC and OC clay):
       NC (sigma'0 >= sigma'c):         S = Cc H/(1+e0) log10((s0+ds)/s0)
       OC, s0+ds <= sigma'c:            S = Cr H/(1+e0) log10((s0+ds)/s0)
       OC, s0 < sigma'c < s0+ds:        S = Cr H/(1+e0) log10(sc/s0) + Cc H/(1+e0) log10((s0+ds)/sc)
     o: {profile, wt, layer, dsFn(zBgl)->kPa, maxSub}   returns sublayer table and total (mm). */
  function consolidationLayer(o) {
    const L = o.layer, maxSub = o.maxSub || 0.5;
    const top = Math.max(L.top, o.zMin != null ? o.zMin : L.top), bot = L.bot;
    const H = bot - top;
    const ns = Math.max(1, Math.ceil(H / maxSub - 1e-9));
    const h = H / ns;
    const rows = []; let tot = 0;
    const OCR = (L.ocr != null && L.ocr !== '' && +L.ocr > 0) ? +L.ocr : 1;
    for (let i = 0; i < ns; i++) {
      const zm = top + (i + 0.5) * h;
      const s0 = stressAt(o.profile, zm, o.wt).eff;
      const ds = o.dsFn(zm);
      const sc = OCR * s0;
      const k = h / (1 + L.e0);
      const s1 = s0 + ds;
      let S, branch;
      if (s1 <= sc) { S = L.Cr * k * log10(s1 / s0); branch = 'recompression'; }
      else if (s0 >= sc) { S = L.Cc * k * log10(s1 / s0); branch = 'virgin'; }
      else { S = L.Cr * k * log10(sc / s0) + L.Cc * k * log10(s1 / sc); branch = 'both'; }
      S *= 1000; tot += S;
      rows.push({ z: zm, h, s0, ds, sc, S, branch });
    }
    return { rows, S: tot, H, top, bot, ns };
  }
  /* Terzaghi average degree of consolidation.
     SRC: Terzaghi (1943) 1-D consolidation, series solution
          U = 1 - SUM 2/M^2 exp(-M^2 Tv),  M = pi(2m+1)/2. */
  function degreeU(Tv) {
    if (Tv <= 0) return 0;
    let s = 0;
    for (let m = 0; m < 200; m++) { const M = Math.PI * (2 * m + 1) / 2; s += 2 / (M * M) * Math.exp(-M * M * Tv); }
    return 1 - s;
  }
  /* Time factor Tv = cv t / Hdr^2 with cv in cm2/s converted to m2/year (see CM2S_TO_M2YR).
     drainage: 'double' -> Hdr = H/2 ; 'single' -> Hdr = H.
     SRC: Terzaghi (1943): Tv = cv t / Hdr^2; IS 2720 (Part 15) for cv from the oedometer test. */
  function timeFactor(cv_cm2s, tYears, H, drainage) {
    const Hdr = drainage === 'double' ? H / 2 : H;
    return cv_cm2s * CM2S_TO_M2YR * tYears / (Hdr * Hdr);
  }
  /* Time-settlement curve for several clay results [{S (mm), H (m), cv (cm2/s), drainage}] + immediate.
     SRC: Terzaghi (1943): S(t) = S_immediate + sum U(Tv) Sc (settlement of each stratum scaled by its degree of consolidation). */
  function timeSettlement(clays, immediate, times) {
    return times.map(t => {
      let s = immediate || 0, parts = [];
      for (const c of clays) {
        const Tv = timeFactor(c.cv, t, c.H, c.drainage);
        const U = degreeU(Tv); parts.push({ Tv, U }); s += U * c.S;
      }
      return { t, S: s, parts };
    });
  }
  /* Equivalent cv of contiguous clay layers that drain through the SAME path (they are
     treated as one stratum for the time-rate calculation):
        cv_eq = (H1 + H2 + ...)^2 / (H1/sqrt(cv1) + H2/sqrt(cv2) + ...)^2
     SRC: Das, Principles of Geotechnical Engineering, "layered soil, equivalent cv" (derived
          from equal travel time of the pore-pressure front: t = H^2 / cv per layer).
     layers: [{H (m), cv (any consistent unit)}] */
  function cvEquivalent(layers) {
    const H = layers.reduce((a, l) => a + l.H, 0);
    const s = layers.reduce((a, l) => a + l.H / Math.sqrt(l.cv), 0);
    return H * H / (s * s);
  }
  /* Time for a given degree of consolidation (bisection on the series).
     SRC: inverse of Terzaghi's U(Tv): t = Tv Hdr^2 / cv. */
  function timeForU(Utarget, cv_cm2s, H, drainage) {
    let lo = 0, hi = 50;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (degreeU(mid) < Utarget) lo = mid; else hi = mid; }
    const Tv = (lo + hi) / 2, Hdr = drainage === 'double' ? H / 2 : H;
    return Tv * Hdr * Hdr / (cv_cm2s * CM2S_TO_M2YR);
  }

  // =====================================================================
  // Settlement limits - IS 1904:1986
  // =====================================================================
  /* SRC: IS 1904:1986 Table 1 (RC framed structures) and cl. 16.3.5 (differential settlement =
          max - min; angular distortion = differential / distance between the two points).
     The scanned table is partly garbled: raft rows are read as 0.0021 L and 1/500. */
  function is1904Limits(found, soil, L) {
    const iso = found === 'isolated';
    const plastic = soil === 'plastic clay';
    const total = iso ? (plastic ? 75 : 50) : (plastic ? 100 : 75);
    const diffFrac = iso ? 0.0015 : 0.0021;
    const ang = iso ? 1 / 666 : 1 / 500;
    return { total, diffFrac, diff: diffFrac * L * 1000, ang, angStr: iso ? '1/666' : '1/500' };
  }

  return {
    GAMMA_W, CM2S_TO_M2YR, KGCM2_TO_KPA, rad, deg,
    unitWeights, layerAt, stressAt, meanBulkGamma,
    sptCorrect, phiFromN, dsFit, cuFromUU, oedAnalyse,
    bcFactors, shapeFactors, depthFactors, inclFactors, waterFactor, bearing, bcCore, netPressure,
    Icorner, dsCorner, dsCentre, dsPoint, dsTwoToOne,
    schmertmann, consolidationLayer, degreeU, timeFactor, timeSettlement, cvEquivalent, timeForU,
    is1904Limits
  };
}));
