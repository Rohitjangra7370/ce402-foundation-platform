/* app.js - user interface for the foundation platform (modules P1-P5).
   All numbers come from engine.js (window.Geo). No site values are hard-coded here;
   example data are loaded from examples.js ONLY when the user presses the button. */
(function () {
  'use strict';
  const Geo = window.Geo;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const num = (v, d) => { const x = parseFloat(v); return isFinite(x) ? x : (d === undefined ? NaN : d); };
  const f = (x, n) => (x == null || !isFinite(x)) ? '-' : x.toFixed(n === undefined ? 2 : n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KINDS = ['fill', 'sand', 'gravel', 'silt', 'clay'];
  const COLORS = { fill: '#d9d4c7', sand: '#f1e2a6', gravel: '#c9c3b8', silt: '#e8d9b9', clay: '#a9c4e6' };

  // ------------------------------------------------------------------ state
  const state = { gl: '', wtMeasured: '', wtDesign: '', layers: [], Df: '' };
  const drainSel = {};   // remembered drainage choice per clay stratum (survives re-render)
  const LAYER_FIELDS = [
    ['name', 'Name', 'text', ''], ['kind', 'Type', 'sel', ''], ['top', 'Top', 'number', 'm'], ['bot', 'Bottom', 'number', 'm'],
    ['gm', 'γ moist', 'number', 'kN/m³'], ['gs', 'γ sat', 'number', 'kN/m³'], ['Ntxt', 'SPT N (z:N, …)', 'text', 'm:blows'],
    ['fine', 'Fine/silty sand?', 'check', ''], ['c', "c′", 'number', 'kPa'], ['phi', "φ′", 'number', '°'], ['cu', 'cu', 'number', 'kPa'],
    ['e', 'e (void ratio, sand)', 'number', '-'], ['Dr', 'Dr (sand)', 'number', '%'], ['Es', 'Es', 'number', 'kPa'], ['qcN', 'qc/N', 'number', 'MPa/blow'],
    ['e0', 'e0 (clay)', 'number', '-'], ['Cc', 'Cc', 'number', '-'], ['Cr', 'Cr', 'number', '-'], ['ocr', 'OCR', 'number', '-'], ['cv', 'cv', 'number', 'cm²/s']
  ];
  function blankLayer() { return { name: '', kind: 'sand', top: '', bot: '', gm: '', gs: '', Ntxt: '', fine: false, c: '', phi: '', cu: '', e: '', Dr: '', Es: '', qcN: '', e0: '', Cc: '', Cr: '', ocr: '', cv: '' }; }
  function parseN(txt) {
    const out = [];
    String(txt || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).forEach(tok => {
      const invalid = tok[0] === '!'; if (invalid) tok = tok.slice(1);
      const m = tok.split(':'); if (m.length < 2) return;
      const z = num(m[0]), N = num(m[1]); if (isFinite(z) && isFinite(N)) out.push({ z, N, invalid, refusal: N >= 100 });
    });
    return out;
  }
  function Ntxt(arr) { return (arr || []).map(t => (t.invalid ? '!' : '') + t.z + ':' + t.N).join(', '); }

  // ------------------------------------------------------------------ profile access
  function getProfile() {
    const errors = [], layers = [];
    state.layers.forEach((L, i) => {
      // blank unit weights must be undefined (not NaN) so the engine falls back to the other one
      const gmv = num(L.gm), gsv = num(L.gs);
      const o = { name: L.name || ('Layer ' + (i + 1)), kind: L.kind, top: num(L.top), bot: num(L.bot),
        gm: isFinite(gmv) ? gmv : undefined, gs: isFinite(gsv) ? gsv : undefined,
        N: parseN(L.Ntxt), fine: !!L.fine };
      ['c', 'phi', 'cu', 'e', 'Dr', 'Es', 'qcN', 'e0', 'Cc', 'Cr', 'ocr', 'cv'].forEach(k => { const v = num(L[k]); o[k] = isFinite(v) ? v : undefined; });
      if (!isFinite(o.top) || !isFinite(o.bot)) errors.push(o.name + ': top and bottom depths are required.');
      else if (o.bot <= o.top) errors.push(o.name + ': bottom must be deeper than top.');
      if (o.gm === undefined && o.gs === undefined) errors.push(o.name + ': enter at least one unit weight.');
      layers.push(o);
    });
    layers.sort((a, b) => a.top - b.top);
    if (layers.length && Math.abs(layers[0].top) > 1e-6) errors.push('The first layer must start at 0 m (ground surface).');
    for (let i = 1; i < layers.length; i++) if (Math.abs(layers[i].top - layers[i - 1].bot) > 1e-6) errors.push('Gap or overlap between ' + layers[i - 1].name + ' and ' + layers[i].name + '.');
    return { layers, errors, wtMeasured: num(state.wtMeasured, Infinity), wtDesign: num(state.wtDesign, Infinity), gl: num(state.gl) };
  }
  function needProfile(outEl) {
    const P = getProfile();
    if (!P.layers.length || P.errors.length) {
      outEl.innerHTML = '<p class="err">Fix the soil profile first (tab 1): ' + (P.errors.length ? esc(P.errors.join(' ')) : 'no layers entered.') + '</p>';
      return null;
    }
    return P;
  }
  function meanN(L) { const v = (L.N || []).filter(t => !t.invalid).map(t => Math.min(100, t.N)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
  // Es for Schmertmann: user value, else Es = k*qc, qc = (qc/N)*N, k = 2.5 (square) ... 3.5 (strip). SRC: Schmertmann 1970/1978.
  function esFn(zg, L, LB) {
    if (L.Es) return L.Es;
    const N = meanN(L);
    if (L.qcN && N != null) return L.qcN * 1000 * N * (2.5 + Math.min(1, Math.max(0, (LB - 1) / 9)));
    throw new Error('Layer "' + L.name + '" needs Es (kPa) or qc/N together with SPT N values for the strain-influence method.');
  }

  // ------------------------------------------------------------------ tiny SVG plotting
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, raw = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
    const t = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) t.push(+v.toFixed(10)); return t;
  }
  function plot(o) {
    const W = o.w || 460, H = o.h || 320, m = { l: 58, r: 14, t: 16, b: 46 };
    const pts = []; o.series.forEach(s => s.pts.forEach(p => pts.push(p)));
    let xmin = o.xmin, xmax = o.xmax, ymin = o.ymin, ymax = o.ymax;
    const X = pts.map(p => p[0]).filter(isFinite), Y = pts.map(p => p[1]).filter(isFinite);
    if (xmin == null) xmin = Math.min(...X, 0); if (xmax == null) xmax = Math.max(...X);
    if (ymin == null) ymin = Math.min(...Y, 0); if (ymax == null) ymax = Math.max(...Y);
    if (xmax === xmin) xmax = xmin + 1; if (ymax === ymin) ymax = ymin + 1;
    const lx = o.xlog, sx = v => lx ? Math.log10(v) : v;
    const x0 = sx(xmin), x1 = sx(xmax);
    const px = v => m.l + (sx(v) - x0) / (x1 - x0) * (W - m.l - m.r);
    const py = v => o.invertY ? m.t + (v - ymin) / (ymax - ymin) * (H - m.t - m.b) : H - m.b - (v - ymin) / (ymax - ymin) * (H - m.t - m.b);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="plot" role="img" aria-label="' + esc(o.title || 'plot') + '">';
    s += '<rect x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '" fill="#fff" stroke="#999"/>';
    const xt = lx ? [0.01, 0.1, 1, 10, 100, 1000].filter(v => v >= xmin && v <= xmax) : niceTicks(xmin, xmax, 6);
    xt.forEach(v => { s += '<line x1="' + px(v) + '" x2="' + px(v) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="#e5e5e5"/><text x="' + px(v) + '" y="' + (H - m.b + 14) + '" text-anchor="middle" font-size="10">' + v + '</text>'; });
    niceTicks(ymin, ymax, 6).forEach(v => { s += '<line y1="' + py(v) + '" y2="' + py(v) + '" x1="' + m.l + '" x2="' + (W - m.r) + '" stroke="#e5e5e5"/><text x="' + (m.l - 5) + '" y="' + (py(v) + 3) + '" text-anchor="end" font-size="10">' + v + '</text>'; });
    s += '<text x="' + (m.l + (W - m.l - m.r) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11">' + esc(o.xlabel || '') + '</text>';
    s += '<text transform="translate(12 ' + (m.t + (H - m.t - m.b) / 2) + ') rotate(-90)" text-anchor="middle" font-size="11">' + esc(o.ylabel || '') + '</text>';
    o.series.forEach((se, i) => {
      const col = se.color || ['#1f5fbf', '#c0392b', '#2e8b57', '#8e44ad'][i % 4];
      if (se.type === 'scatter') se.pts.forEach(p => { s += '<circle cx="' + px(p[0]) + '" cy="' + py(p[1]) + '" r="4" fill="' + col + '"/>'; });
      else { s += '<polyline fill="none" stroke="' + col + '" stroke-width="1.8"' + (se.dash ? ' stroke-dasharray="5 4"' : '') + ' points="' + se.pts.filter(p => isFinite(p[0]) && isFinite(p[1])).map(p => px(p[0]).toFixed(1) + ',' + py(p[1]).toFixed(1)).join(' ') + '"/>'; }
      if (se.label) s += '<text x="' + (W - m.r - 4) + '" y="' + (m.t + 14 + i * 13) + '" text-anchor="end" font-size="10" fill="' + col + '">' + esc(se.label) + '</text>';
    });
    (o.hlines || []).forEach(h => { s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + py(h.y) + '" y2="' + py(h.y) + '" stroke="' + (h.color || '#c0392b') + '" stroke-dasharray="4 3"/><text x="' + (m.l + 4) + '" y="' + (py(h.y) - 3) + '" font-size="10" fill="' + (h.color || '#c0392b') + '">' + esc(h.label || '') + '</text>'; });
    return s + '</svg>';
  }
  function table(head, rows, cls) {
    return '<table class="' + (cls || 'res') + '"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }

  // ------------------------------------------------------------------ P1 profile tab
  function renderLayerTable() {
    const el = $('#layerTable');
    let h = '<table class="grid"><thead><tr><th></th>' + LAYER_FIELDS.map(c => '<th>' + c[1] + (c[3] ? '<br><span class="u">' + c[3] + '</span>' : '') + '</th>').join('') + '</tr></thead><tbody>';
    state.layers.forEach((L, i) => {
      h += '<tr data-i="' + i + '"><td><button type="button" class="x" data-del="' + i + '" title="Delete layer">×</button></td>';
      LAYER_FIELDS.forEach(c => {
        const k = c[0], v = L[k] == null ? '' : L[k];
        if (c[2] === 'sel') h += '<td><select data-k="' + k + '">' + KINDS.map(x => '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td>';
        else if (c[2] === 'check') h += '<td><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '></td>';
        else h += '<td><input data-k="' + k + '" value="' + esc(v) + '" ' + (c[2] === 'number' ? 'inputmode="decimal" size="6"' : 'size="' + (k === 'Ntxt' ? 16 : 14) + '"') + '></td>';
      });
      h += '</tr>';
    });
    el.innerHTML = h + '</tbody></table>';
  }
  function readLayerTable() {
    $$('#layerTable tbody tr').forEach(tr => {
      const L = state.layers[+tr.dataset.i];
      $$('[data-k]', tr).forEach(inp => { L[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; });
    });
    state.gl = $('#gl').value; state.wtMeasured = $('#wtM').value; state.wtDesign = $('#wtD').value;
  }
  function refreshProfile() {
    readLayerTable();
    const P = getProfile(), out = $('#profileOut');
    if (!P.layers.length) { out.innerHTML = '<p class="note">Enter layers (or load the example) to draw the profile.</p>'; return; }
    if (P.errors.length) { out.innerHTML = '<p class="err">' + esc(P.errors.join(' ')) + '</p>'; return; }
    const zmax = P.layers[P.layers.length - 1].bot;
    const W = 330, H = 430, m = { t: 20, b: 20, l: 46 }, sc = (H - m.t - m.b) / zmax, Y = z => m.t + z * sc;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="plot" role="img" aria-label="Soil profile">';
    niceTicks(0, zmax, 8).forEach(v => { s += '<text x="' + (m.l - 6) + '" y="' + (Y(v) + 3) + '" text-anchor="end" font-size="10">' + v + '</text><line x1="' + (m.l - 3) + '" x2="' + m.l + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#555"/>'; });
    s += '<text transform="translate(10 ' + (H / 2) + ') rotate(-90)" font-size="11" text-anchor="middle">Depth below ground (m)</text>';
    P.layers.forEach(L => {
      s += '<rect x="' + m.l + '" y="' + Y(L.top) + '" width="110" height="' + ((L.bot - L.top) * sc) + '" fill="' + COLORS[L.kind] + '" stroke="#444"/>';
      s += '<text x="' + (m.l + 55) + '" y="' + (Y((L.top + L.bot) / 2) + 3) + '" text-anchor="middle" font-size="10">' + esc(L.name).slice(0, 22) + '</text>';
      L.N.forEach(t => { s += '<circle cx="' + (m.l + 118) + '" cy="' + Y(t.z) + '" r="2.5" fill="' + (t.invalid ? '#999' : '#000') + '"/><text x="' + (m.l + 124) + '" y="' + (Y(t.z) + 3) + '" font-size="10"' + (t.invalid ? ' fill="#999"' : '') + '>N=' + (t.N >= 100 ? '>100' : t.N) + (t.invalid ? ' (rejected)' : '') + '</text>'; });
    });
    const wl = (z, label, dash, col) => { if (!isFinite(z) || z > zmax) return ''; return '<line x1="' + (m.l - 3) + '" x2="' + (W - 4) + '" y1="' + Y(z) + '" y2="' + Y(z) + '" stroke="' + col + '" stroke-width="2"' + (dash ? ' stroke-dasharray="6 4"' : '') + '/><text x="' + (W - 6) + '" y="' + (Y(z) - 3) + '" text-anchor="end" font-size="10" font-weight="bold" fill="' + col + '">' + label + ' ' + z + ' m</text>'; };
    s += wl(P.wtMeasured, 'WT measured', true, '#1f5fbf') + wl(P.wtDesign, 'WT design', false, '#0b3d91');
    const Df = num(state.Df); if (isFinite(Df)) s += '<line x1="' + (m.l - 3) + '" x2="' + (W - 4) + '" y1="' + Y(Df) + '" y2="' + Y(Df) + '" stroke="#c0392b" stroke-dasharray="2 3"/><text x="' + (W - 6) + '" y="' + (Y(Df) + 11) + '" text-anchor="end" font-size="10" fill="#c0392b">Df ' + Df + ' m</text>';
    s += '</svg>';
    // stress profile
    const zs = []; for (let i = 0; i <= 60; i++) zs.push(zmax * i / 60);
    const wt = P.wtDesign;
    const tot = zs.map(z => [Geo.stressAt(P, z, wt).total, z]), uu = zs.map(z => [Geo.stressAt(P, z, wt).u, z]), ef = zs.map(z => [Geo.stressAt(P, z, wt).eff, z]);
    const sp = plot({ w: 330, h: 430, invertY: true, xlabel: 'Stress (kPa)', ylabel: 'Depth (m)', ymin: 0, ymax: zmax, xmin: 0,
      series: [{ pts: tot, label: 'σv total', color: '#555' }, { pts: uu, label: 'u', color: '#1f5fbf' }, { pts: ef, label: "σ′v", color: '#c0392b' }], title: 'Stress profile (design water table)' });
    // boundary table
    const bz = [0]; P.layers.forEach(L => bz.push(L.bot));
    const rows = bz.map(z => { const a = Geo.stressAt(P, z, P.wtDesign), b = Geo.stressAt(P, z, P.wtMeasured); return [f(z, 2), f(a.total, 1), f(a.u, 1), f(a.eff, 1), f(b.eff, 1)]; });
    out.innerHTML = '<div class="row2">' + s + sp + '</div><h4>Stresses at layer boundaries</h4>' +
      table(['Depth (m)', 'σv total (kPa) [design WT]', 'u (kPa) [design WT]', "σ′v (kPa) [design WT]", "σ′v (kPa) [measured WT]"], rows) +
      '<p class="note">σ′v = σv − u. Unit weight above the water table = moist γ, below = saturated γ. Capillary rise is ignored.</p>';
  }

  // ------------------------------------------------------------------ P2 parameter tools
  function runSPT() {
    const out = $('#sptOut'), P = needProfile(out); if (!P) return;
    const useDesign = $('#sptWT').value === 'design', wt = useDesign ? P.wtDesign : P.wtMeasured;
    let rows = [], det = '';
    P.layers.forEach(L => L.N.forEach(t => {
      const coh = L.kind !== 'clay';
      const r = Geo.sptCorrect({ N: t.N, z: t.z, profile: P, wt, fineSand: L.fine, cohesionless: coh, refusal: t.refusal });
      const phi = (coh && !t.refusal && !t.invalid && L.kind !== 'fill') ? Geo.phiFromN(r.Ncorr) : null;
      rows.push([f(t.z, 2), esc(L.name), t.N + (t.invalid ? ' (rejected)' : ''), r.sigmaV != null ? f(r.sigmaV, 1) : '-', r.CN != null ? f(r.CN, 3) : '-',
        r.N1 != null ? f(r.N1, 1) : '-', r.refusal ? 'refusal' : (r.dilatancy ? 'applied' : (coh ? 'no' : 'n/a')), f(r.Ncorr, 1), phi != null ? f(phi, 1) : '-']);
      det += '<details><summary>z = ' + t.z + ' m, N = ' + t.N + (t.invalid ? ' (rejected by you - shown for information)' : '') + '</summary><ol>' +
        r.steps.map(st => '<li>' + esc(st.label) + ': <b>' + (typeof st.value === 'number' ? f(st.value, 3) : st.value) + '</b> ' + (st.unit || '') + (st.note ? ' <span class="note">- ' + esc(st.note) + '</span>' : '') + '</li>').join('') + '</ol></details>';
    }));
    if (!rows.length) { out.innerHTML = '<p class="note">No SPT values entered in the profile.</p>'; return; }
    out.innerHTML = '<p class="note">Water table used for σ′v and for the "below water table" test: <b>' + (isFinite(wt) ? wt + ' m (' + (useDesign ? 'design' : 'measured, i.e. at the time of testing') + ')' : 'none') + '</b>. Steps: overburden correction, then dilatancy on N′ (IS 2131).</p>' +
      table(['z (m)', 'Layer', 'N (field)', "σ′v (kPa)", 'CN', "N′ = CN·N", 'Dilatancy', 'N corrected', 'φ′ from N (°)'], rows) + '<h4>Step by step</h4>' + det +
      '<p class="note">φ′ from N is a correlation (Peck, Hanson &amp; Thornburn 1974, fitted by Wolff 1989). Laboratory values override it when available.</p>';
  }
  function runDS() {
    const out = $('#dsOut');
    const pts = $('#dsData').value.split(/\n/).map(l => l.trim().split(/[\s,;\t]+/).map(Number)).filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]));
    if (pts.length < 2) { out.innerHTML = '<p class="err">Enter at least two lines "σn  τf" (kPa).</p>'; return; }
    const s = pts.map(p => p[0]), t = pts.map(p => p[1]);
    const r = Geo.dsFit(s, t, { origin: $('#dsOrigin').checked });
    const xmax = Math.max(...s) * 1.1;
    const pl = plot({ xlabel: 'Normal stress σn (kPa)', ylabel: 'Shear stress τf (kPa)', xmin: 0, xmax, ymin: 0, ymax: Math.max(...t, r.c + r.slope * xmax) * 1.05,
      series: [{ pts: pts, type: 'scatter', color: '#000' }, { pts: [[0, r.c], [xmax, r.c + r.slope * xmax]], label: 'least-squares fit' }] });
    const mx = s.reduce((a, b) => a + b, 0) / s.length, my = t.reduce((a, b) => a + b, 0) / t.length;
    out.innerHTML = '<div class="row2"><div>' + table(['σn (kPa)', 'τf measured (kPa)', 'τf fitted (kPa)', 'residual (kPa)'], pts.map(p => [f(p[0], 1), f(p[1], 1), f(r.c + r.slope * p[0], 2), f(p[1] - (r.c + r.slope * p[0]), 2)])) +
      '<p><b>Fit:</b> τ = c′ + σn·tan φ′ by ordinary least squares' + ($('#dsOrigin').checked ? ' (forced through the origin)' : '') + '</p>' +
      '<p>mean σn = ' + f(mx, 2) + ' kPa, mean τ = ' + f(my, 2) + ' kPa, slope = tan φ′ = <b>' + f(r.slope, 4) + '</b></p><p class="big">c′ = ' + f(r.c, 2) + ' kPa &nbsp; φ′ = ' + f(r.phi, 2) + ' ° &nbsp; R² = ' + f(r.r2, 5) + '</p>' +
      (r.c < 0 ? '<p class="warn">Negative intercept: not physical. Consider forcing the fit through the origin (c′ = 0).</p>' : '') + '</div>' + pl + '</div>';
  }
  function runUU() {
    const out = $('#uuOut'); const v = $('#uuData').value.split(/[\s,;]+/).map(Number).filter(isFinite);
    if (!v.length) { out.innerHTML = '<p class="err">Enter the deviator stresses at failure (kPa).</p>'; return; }
    out.innerHTML = '<p>cu = (σ1 − σ3)f / 2 = mean(' + v.join(', ') + ') / 2 = <b>' + f(Geo.cuFromUU(v), 2) + ' kPa</b> (φu = 0). Note: the deviator stress itself is not cu.</p>';
  }
  function runOed() {
    const out = $('#oedOut'), unit = $('#oedUnit').value;
    const pts = $('#oedData').value.split(/\n/).map(l => l.trim().split(/[\s,;\t]+/)).filter(a => a.length >= 2).map(a => ({ p: num(a[0]) * (unit === 'kgcm2' ? Geo.KGCM2_TO_KPA : 1), e: num(a[1]), stage: /^u/i.test(a[2] || '') ? 'U' : 'L' })).filter(p => isFinite(p.p) && isFinite(p.e));
    if (pts.length < 5) { out.innerHTML = '<p class="err">Enter at least 5 lines "pressure  void-ratio  [L|U]".</p>'; return; }
    const r = Geo.oedAnalyse(pts), L = pts.filter(p => p.stage !== 'U'), U = pts.filter(p => p.stage === 'U');
    const pl = plot({ xlog: true, xlabel: 'Pressure σ′ (kPa, log scale)', ylabel: 'Void ratio e', xmin: Math.pow(10, Math.floor(Math.log10(Math.min(...pts.map(p => p.p))))), xmax: Math.pow(10, Math.ceil(Math.log10(Math.max(...pts.map(p => p.p))))),
      ymin: Math.min(...pts.map(p => p.e)) - 0.02, ymax: Math.max(...pts.map(p => p.e)) + 0.02,
      series: [{ pts: L.map(p => [p.p, p.e]), color: '#1f5fbf', label: 'loading' }, { pts: [L[L.length - 1]].concat(U).map(p => [p.p, p.e]), color: '#c0392b', label: 'unloading' }] });
    out.innerHTML = '<div class="row2"><div><p>Pressures converted to kPa (1 kg/cm² = ' + Geo.KGCM2_TO_KPA + ' kPa).</p><p class="big">Cc = ' + f(r.Cc, 3) + ' (last 3 loading points) &nbsp; Cr = ' + (r.Cr != null ? f(r.Cr, 3) : '-') + ' (unloading) &nbsp; initial slope = ' + f(r.Cri, 3) + '</p>' +
      '<p>σ′c ≈ <b>' + (r.sigC ? f(r.sigC, 0) + ' kPa' : '-') + '</b> (intersection of initial and virgin lines - a bilinear stand-in for the graphical Casagrande construction; judge it on the plot).</p></div>' + pl + '</div>';
  }

  // ------------------------------------------------------------------ P3 bearing
  function readBearingInputs(P) {
    const g = id => num($(id).value);
    const shp = $('#bShape').value;
    return { shape: shp, B: g('#bB'), L: shp === 'square' || shp === 'circle' ? g('#bB') : g('#bL'), Df: g('#bDf'), c: num($('#bc').value, 0), phi: g('#bphi'), alpha: num($('#bAlpha').value, 0),
      eB: num($('#beB').value, 0), eL: num($('#beL').value, 0), mode: $('#bMode').value, e: $('#bE').value === '' ? undefined : g('#bE'), Dr: $('#bDr').value === '' ? undefined : g('#bDr'), FS: num($('#bFS').value, 3) };
  }
  function fillFromProfile() {
    const out = $('#bearOut'), P = needProfile(out); if (!P) return;
    const Df = num($('#bDf').value); const L = Geo.layerAt(P, Df + 0.01);
    const undrained = L.kind === 'clay' && L.cu != null;
    $('#bc').value = undrained ? L.cu : (L.c != null ? L.c : 0); $('#bphi').value = undrained ? 0 : (L.phi != null ? L.phi : '');
    $('#bE').value = L.e != null ? L.e : ''; $('#bDr').value = L.Dr != null ? L.Dr : '';
    if (undrained) $('#bMode').value = 'general';
    out.innerHTML = '<p class="note">Strength parameters copied from layer "' + esc(L.name) + '" (the layer just below the base)' + (undrained ? ': clay, so UNDRAINED analysis with c = cu and φ = 0 (short-term case)' : '') + '. Edit them if you want different values.</p>';
  }
  function bearingNet(inp, P, B) {   // net applied pressure for a given width
    const Q = num($('#bP').value), t = num($('#bt').value, 0);
    if (!isFinite(Q)) return null;
    const wt = P.wtDesign, gAbove = inp.Df > 0 ? Geo.stressAt(P, inp.Df, wt).total / inp.Df : 0;
    const area = inp.shape === 'strip' ? B : (inp.shape === 'circle' ? Math.PI * B * B / 4 : B * (inp.shape === 'square' ? B : inp.L));
    const dW = area * t * (25 - gAbove);
    const Pn = Q + dW;
    return { Pn, dW, gAbove };
  }
  function runBearing() {
    const out = $('#bearOut'), P = needProfile(out); if (!P) return;
    const inp = readBearingInputs(P);
    if (!isFinite(inp.B) || !isFinite(inp.Df) || !isFinite(inp.phi)) { out.innerHTML = '<p class="err">B, Df and φ′ are required.</p>'; return; }
    if (inp.shape === 'rect' && !isFinite(inp.L)) { out.innerHTML = '<p class="err">Enter L for a rectangular footing.</p>'; return; }
    const wt = P.wtDesign;
    const Be = inp.shape === 'strip' || inp.shape === 'circle' ? inp.B : inp.B - 2 * inp.eB;
    const q = Geo.stressAt(P, inp.Df, wt).eff;
    const gam = Geo.meanBulkGamma(P, inp.Df, inp.Df + Math.max(Be, 0.5), wt);
    let r;
    try { r = Geo.bearing(Object.assign({}, inp, { gamma: gam, q, zw: wt })); } catch (e) { out.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    const G = r.gen, Lc = r.loc;
    const fr = (a, b) => [a, f(b.gen, 3), f(b.loc, 3)];
    const rowsF = [
      ['Nc', f(G.N.Nc, 3), f(Lc.N.Nc, 3)], ['Nq', f(G.N.Nq, 3), f(Lc.N.Nq, 3)], ['Nγ', f(G.N.Ng, 3), f(Lc.N.Ng, 3)],
      ['sc', f(G.S.sc, 3), f(Lc.S.sc, 3)], ['sq', f(G.S.sq, 3), f(Lc.S.sq, 3)], ['sγ', f(G.S.sg, 3), f(Lc.S.sg, 3)],
      ['dc', f(G.D.dc, 3), f(Lc.D.dc, 3)], ['dq', f(G.D.dq, 3), f(Lc.D.dq, 3)], ['dγ', f(G.D.dg, 3), f(Lc.D.dg, 3)],
      ['ic', f(G.I.ic, 3), f(Lc.I.ic, 3)], ['iq', f(G.I.iq, 3), f(Lc.I.iq, 3)], ['iγ', f(G.I.ig, 3), f(Lc.I.ig, 3)], ["W′", f(G.W, 3), f(Lc.W, 3)]
    ];
    let net = '';
    const nn = bearingNet(inp, P, inp.B);
    if (nn) {
      const qn = nn.Pn / r.area, ok = qn <= r.qns;
      net = '<h4>Check against the load</h4><p>Net load = column load + (γconcrete − γsoil above base) × footing volume = ' + f(num($('#bP').value), 1) + ' + ' + f(nn.dW, 1) + ' = <b>' + f(nn.Pn, 1) + ' kN</b> on the effective area ' + f(r.area, 3) + ' m² → net applied pressure <b>' + f(qn, 1) + ' kPa</b> ' + (ok ? '≤' : '>') + ' net safe bearing capacity ' + f(r.qns, 1) + ' kPa: <b class="' + (ok ? 'ok' : 'err') + '">' + (ok ? 'OK' : 'NOT OK') + '</b> (utilisation ' + f(qn / r.qns * 100, 0) + ' %).</p>';
    }
    out.innerHTML = '<h4>Inputs derived from the profile</h4><p>Effective overburden at base, q = σ′v(Df) = <b>' + f(q, 2) + ' kPa</b> (design water table ' + (isFinite(wt) ? wt + ' m' : 'none') + '). γ (bulk, mean over B′ below base) = <b>' + f(gam, 2) + ' kN/m³</b> (IS 6403 defines γ as the bulk unit weight; the water table enters only through W′, not also through γ′). Effective width B′ = ' + f(r.Be, 3) + ' m' + (isFinite(r.Le) ? ', L′ = ' + f(r.Le, 3) + ' m' : '') + '.</p>' +
      '<h4>Factors (IS 6403:1981)</h4>' + table(['Factor', 'General shear (φ′ = ' + f(G.phi, 2) + '°)', 'Local shear (φ′ = ' + f(Lc.phi, 2) + '°)'], rowsF) +
      '<h4>Terms of qnu = c Nc sc dc ic + q(Nq−1) sq dq iq + ½ B γ Nγ sγ dγ iγ W′ (kPa)</h4>' +
      table(['Term', 'General', 'Local'], [['cohesion', f(G.t1, 2), f(Lc.t1, 2)], ['surcharge', f(G.t2, 2), f(Lc.t2, 2)], ['self-weight', f(G.t3, 2), f(Lc.t3, 2)], ['<b>qnu</b>', '<b>' + f(G.qnu, 2) + '</b>', '<b>' + f(Lc.qnu, 2) + '</b>']]) +
      '<p>Mode: <b>' + r.mode + '</b>; weight on local shear = <b>' + f(r.wLocal, 3) + '</b> (IS 6403:1981 shear-mode criterion: void ratio 0.55 → 0.75, or Dr 70 → 20 %, interpolates linearly from general to local shear).</p>' +
      '<p class="big">qnu = ' + f(r.qnu, 1) + ' kPa &nbsp; net safe qns = qnu / ' + r.FS + ' = ' + f(r.qns, 1) + ' kPa &nbsp; safe (gross) bearing pressure = qns + q = ' + f(r.qsafeGross, 1) + ' kPa</p>' + net +
      '<p class="note">The allowable bearing pressure is the LESSER of qns and the pressure that keeps settlement within IS 1904 limits (IS 6403 cl. 6.1): run the settlement tab as well.</p>';
  }
  function solveWidth() {
    const out = $('#bearOut'), P = needProfile(out); if (!P) return;
    const inp = readBearingInputs(P);
    if (!isFinite(num($('#bP').value))) { out.innerHTML = '<p class="err">Enter the column load P (kN, or kN/m for a strip).</p>'; return; }
    const wt = P.wtDesign, q = Geo.stressAt(P, inp.Df, wt).eff;
    for (let B = 0.5; B <= 15; B += 0.05) {
      const gam = Geo.meanBulkGamma(P, inp.Df, inp.Df + B, wt);
      const i2 = Object.assign({}, inp, { B, L: inp.shape === 'rect' ? B * (inp.L / inp.B || 1) : B, gamma: gam, q, zw: wt });
      let r; try { r = Geo.bearing(i2); } catch (e) { continue; }
      const nn = bearingNet(i2, P, B), qn = nn.Pn / r.area;
      if (qn <= r.qns) { $('#bB').value = (Math.ceil(B * 10 - 1e-9) / 10).toFixed(1); if (inp.shape === 'rect') $('#bL').value = (Math.ceil(B * (inp.L / inp.B) * 10 - 1e-9) / 10).toFixed(1); if (inp.shape === 'square') $('#bL').value = $('#bB').value; runBearing(); return; }
    }
    out.innerHTML = '<p class="err">No width up to 15 m satisfies the bearing criterion.</p>';
  }

  // ------------------------------------------------------------------ P4 stress increase
  function parseRects() {
    return $('#sRects').value.split(/\n/).map(l => l.trim().split(/[\s,;\t]+/).map(Number)).filter(a => a.length >= 5 && a.every(isFinite)).map(a => ({ x1: Math.min(a[0], a[1]), x2: Math.max(a[0], a[1]), y1: Math.min(a[2], a[3]), y2: Math.max(a[2], a[3]), q: a[4] }));
  }
  function runStress() {
    const out = $('#stressOut');
    const q = num($('#sq').value), B = num($('#sB').value), L = num($('#sL').value, B), zmax = num($('#sZ').value), dz = num($('#sDz').value, 0.5);
    if (![q, B, L, zmax].every(isFinite)) { out.innerHTML = '<p class="err">q, B, L and the maximum depth are required.</p>'; return; }
    const zs = []; for (let z = dz; z <= zmax + 1e-9; z += dz) zs.push(z);
    const cen = zs.map(z => Geo.dsCentre(q, B, L, z)), cor = zs.map(z => Geo.dsCorner(q, B, L, z)), tt = zs.map(z => Geo.dsTwoToOne(q, B, L, z));
    const rects = parseRects(); let extra = '', ex = null;
    const px = num($('#sPx').value), py = num($('#sPy').value);
    if (rects.length && isFinite(px) && isFinite(py)) ex = zs.map(z => Geo.dsPoint(rects, px, py, z));
    const ser = [{ pts: cen.map((v, i) => [v, zs[i]]), label: 'Boussinesq - centre', color: '#1f5fbf' }, { pts: cor.map((v, i) => [v, zs[i]]), label: 'Boussinesq - corner', color: '#2e8b57' }, { pts: tt.map((v, i) => [v, zs[i]]), label: '2:1 method', color: '#c0392b', dash: true }];
    if (ex) ser.push({ pts: ex.map((v, i) => [v, zs[i]]), label: 'superposition at (' + px + ', ' + py + ')', color: '#8e44ad' });
    const pl = plot({ invertY: true, xlabel: 'Δσz (kPa)', ylabel: 'Depth below base z (m)', xmin: 0, ymin: 0, ymax: zmax, series: ser });
    const head = ['z (m)', 'm = B/2z', 'n = L/2z', 'I (corner, B/2×L/2)', 'Δσz centre (kPa)', 'Δσz corner (kPa)', 'Δσz 2:1 (kPa)'].concat(ex ? ['Δσz superposition (kPa)'] : []);
    const rows = zs.map((z, i) => [f(z, 2), f(B / 2 / z, 3), f(L / 2 / z, 3), f(Geo.Icorner(B / 2 / z, L / 2 / z), 4), f(cen[i], 2), f(cor[i], 2), f(tt[i], 2)].concat(ex ? [f(ex[i], 2)] : []));
    out.innerHTML = '<div class="row2"><div class="scroll">' + table(head, rows) + '</div>' + pl + '</div><p class="note">Centre = 4 × corner of a (B/2 × L/2) rectangle; corner = 1 × corner of (B × L) (superposition of rectangles, Boussinesq/Newmark). For several loaded areas, list them below (x1 x2 y1 y2 q) and give the evaluation point: contributions are added by inclusion-exclusion over corners.</p>';
  }

  // ------------------------------------------------------------------ P5 settlement
  function runSettlement() {
    const out = $('#setOut'), P = needProfile(out); if (!P) return;
    const B = num($('#tB').value), L = num($('#tL').value, B), Df = num($('#tDf').value), q = num($('#tq').value), t = num($('#tt').value, 10);
    if (![B, L, Df, q].every(isFinite)) { out.innerHTML = '<p class="err">B, L, Df and the net pressure are required.</p>'; return; }
    const wt = P.wtDesign;
    let html = '';
    // --- granular layers: Schmertmann
    let sch = null, esErr = '';
    try { sch = Geo.schmertmann({ B, L, Df, dp: q, profile: P, wt, t, Es: esFn }); } catch (e) { esErr = e.message; }
    if (esErr) html += '<p class="err">' + esc(esErr) + '</p>';
    let Simm = 0;
    if (sch) {
      Simm = sch.S;
      const zs = []; for (let i = 0; i <= 80; i++) zs.push(sch.zmax * i / 80);
      const pl = plot({ invertY: true, xlabel: 'Strain influence factor Iz', ylabel: 'Depth below base (m)', xmin: 0, xmax: Math.max(0.7, sch.Izp * 1.1), ymin: 0, ymax: sch.zmax, series: [{ pts: zs.map(z => [sch.Iz(z), z]), label: 'Iz' }] });
      html += '<h4>Granular layers - strain influence factor method (Schmertmann et al. 1978)</h4><div class="row2"><div>' +
        table(['Quantity', 'Value'], [['L/B used', f(sch.LB, 2)], ['Iz at base', f(sch.Iz0, 3)], ['depth of peak (m)', f(sch.zp, 2)], ["σ′vp at peak (kPa)", f(sch.svp, 1)], ['Izp = 0.5 + 0.1 √(Δp/σ′vp)', f(sch.Izp, 3)], ['depth of zero influence (m)', f(sch.zmax, 2)],
          ["σ′v0 at base (kPa)", f(sch.svBase, 1)], ['C1 = 1 − 0.5 σ′v0/Δp (≥ 0.5)', f(sch.C1, 3)], ['C2 = 1 + 0.2 log10(t/0.1), t = ' + t + ' yr', f(sch.C2, 3)], ['Σ Iz Δz / Es (m/kPa)', sch.sumIzEsDz.toExponential(3)], ['<b>Immediate/granular settlement (mm)</b>', '<b>' + f(sch.S, 1) + '</b>']]) +
        (sch.clayExcluded > 0 ? '<p class="note">' + f(sch.clayExcluded, 2) + ' m of the influence zone lies in clay; it is excluded here and handled by consolidation below.</p>' : '') + '</div>' + pl + '</div>';
    }
    // --- consolidation
    const rects = [{ x1: -B / 2, x2: B / 2, y1: -L / 2, y2: L / 2, q }];
    parseRectsFrom('#tRects').forEach(r => rects.push(r));
    const method = $('#tMethod').value;
    const dsFn = z => { const zb = z - Df; if (zb <= 0) return q; return method === '2:1' ? Geo.dsTwoToOne(q, B, L, zb) : Geo.dsPoint(rects, 0, 0, zb); };
    const clays = P.layers.filter(l => l.kind === 'clay');
    // contiguous clay layers share one drainage path, so they form ONE stratum in the time analysis
    const strata = [];
    clays.forEach(l => { const last = strata[strata.length - 1]; if (last && Math.abs(last[last.length - 1].bot - l.top) < 1e-6) last.push(l); else strata.push([l]); });
    strata.forEach((st, si) => { const el = $('#drain' + si); if (el) drainSel[si] = el.value; });   // keep choices across re-render
    const results = []; let Scons = 0;
    html += '<h4>Clay layers - one-dimensional consolidation (sublayers ≤ 0.5 m)</h4>';
    if (!clays.length) html += '<p class="note">No clay layer in the profile.</p>';
    strata.forEach((st, si) => {
      const parts = [];
      let bad = false;
      st.forEach(Lc => {
        const miss = ['e0', 'Cc', 'Cr', 'cv'].filter(k => !isFinite(Lc[k]) || Lc[k] <= 0);
        if (miss.length) { html += '<p class="err">Layer "' + esc(Lc.name) + '": enter ' + miss.join(', ') + ' (OCR is optional, default 1).</p>'; bad = true; return; }
        const cr = Geo.consolidationLayer({ profile: P, wt, layer: Lc, dsFn, maxSub: 0.5, zMin: Df });
        parts.push({ S: cr.S, H: cr.H, cv: Lc.cv, name: Lc.name });
        html += '<details open><summary><b>' + esc(Lc.name) + '</b> (' + f(cr.top, 2) + '-' + f(cr.bot, 2) + ' m): Sc = <b>' + f(cr.S, 1) + ' mm</b>, OCR = ' + (Lc.ocr || 1) + ', e0 = ' + Lc.e0 + ', Cc = ' + Lc.Cc + ', Cr = ' + Lc.Cr + '</summary><div class="scroll">' +
          table(['z mid (m)', 'h (m)', "σ′0 (kPa)", 'Δσ (kPa)', "σ′c (kPa)", 'branch', 'S (mm)'], cr.rows.map(r => [f(r.z, 2), f(r.h, 3), f(r.s0, 1), f(r.ds, 1), f(r.sc, 1), r.branch, f(r.S, 2)])) + '</div></details>';
      });
      if (bad || !parts.length) return;
      const H = parts.reduce((a, p) => a + p.H, 0), S = parts.reduce((a, p) => a + p.S, 0);
      const cv = parts.length > 1 ? Geo.cvEquivalent(parts) : parts[0].cv;
      Scons += S;
      results.push({ S, H, cv, drainage: drainSel[si] || 'double', name: parts.map(p => p.name).join(' + '), si, n: parts.length });
    });
    // drainage selectors (one per stratum)
    if (results.length) html += '<p>Drainage of each clay stratum (for the time curve): ' + results.map(r => esc(r.name) + ' <select id="drain' + r.si + '"><option value="double">double (free-draining sand/gravel above AND below)</option><option value="single">single (one drained face only)</option></select>').join(' &nbsp; ') + '</p>';
    html += '<p class="big">Total settlement (primary) = granular ' + f(Simm, 1) + ' + consolidation ' + f(Scons, 1) + ' = <b>' + f(Simm + Scons, 1) + ' mm</b></p>';
    // time curve
    if (results.length) {
      const times = []; for (let e = -2; e <= 2.0001; e += 0.1) times.push(Math.pow(10, e));
      const ts = Geo.timeSettlement(results, Simm, times);
      const pl = plot({ xlog: true, invertY: true, xlabel: 'Time since loading (years, log scale)', ylabel: 'Settlement (mm)', xmin: 0.01, xmax: 100, ymin: 0, ymax: (Simm + Scons) * 1.05,
        series: [{ pts: ts.map(r => [r.t, r.S]), label: 'total (granular taken as immediate)' }].concat(results.map((r, i) => ({ pts: times.map(t => [t, Geo.degreeU(Geo.timeFactor(r.cv, t, r.H, r.drainage)) * r.S]), label: 'clay stratum ' + (r.si + 1) + (r.n > 1 ? ' (' + r.n + ' layers)' : ''), dash: true, color: ['#2e8b57', '#8e44ad', '#c0392b'][i % 3] }))) });
      const rows = results.map(r => [esc(r.name), f(r.H, 2), r.cv.toExponential(2) + ' cm²/s = ' + f(r.cv * Geo.CM2S_TO_M2YR, 2) + ' m²/yr' + (r.n > 1 ? ' (equivalent)' : ''), r.drainage === 'double' ? f(r.H / 2, 2) : f(r.H, 2), f(Geo.timeForU(0.5, r.cv, r.H, r.drainage), 2), f(Geo.timeForU(0.9, r.cv, r.H, r.drainage), 2)]);
      html += '<h4>Time-settlement</h4><div class="row2"><div class="scroll">' + table(['Clay stratum', 'H (m)', 'cv', 'Hdr (m)', 't50 (yr)', 't90 (yr)'], rows) + '<p class="note">Tv = cv t / Hdr², U from the Terzaghi series; settlement(t) = granular (immediate) + Σ U·Sc. cv converted from cm²/s with 1 cm²/s = ' + f(Geo.CM2S_TO_M2YR, 2) + ' m²/yr. Contiguous clay layers are one stratum with cv(eq) = (ΣH)² / (Σ H/√cv)².</p></div>' + pl + '</div>';
    }
    out.innerHTML = html;
    results.forEach(r => { const el = $('#drain' + r.si); if (el) { el.value = r.drainage; el.onchange = () => runSettlement(); } });
  }
  function parseRectsFrom(sel) {
    return $(sel).value.split(/\n/).map(l => l.trim().split(/[\s,;\t]+/).map(Number)).filter(a => a.length >= 5 && a.every(isFinite)).map(a => ({ x1: Math.min(a[0], a[1]), x2: Math.max(a[0], a[1]), y1: Math.min(a[2], a[3]), y2: Math.max(a[2], a[3]), q: a[4] }));
  }

  // ------------------------------------------------------------------ wiring
  function loadExample(name) {
    const ex = window.EXAMPLES && window.EXAMPLES[name]; if (!ex) return;
    state.gl = ex.gl; state.wtMeasured = ex.wtMeasured; state.wtDesign = ex.wtHigh;
    state.layers = ex.layers.map(L => Object.assign(blankLayer(), L, { Ntxt: Ntxt(L.N), fine: !!L.fine }));
    $('#gl').value = state.gl; $('#wtM').value = state.wtMeasured; $('#wtD').value = state.wtDesign;
    renderLayerTable(); refreshProfile();
    if (window.EXAMPLES.lab) {
      const lab = window.EXAMPLES.lab;
      $('#dsData').value = lab.ds['SM soaked'].sigma.map((s, i) => s + '  ' + lab.ds['SM soaked'].tau[i]).join('\n');
      $('#uuData').value = lab.uu['UDS-1'].join(', ');
      $('#oedData').value = lab.oed_kgcm2.map(r => r.p + '  ' + r.e + '  ' + r.stage).join('\n'); $('#oedUnit').value = 'kgcm2';
    }
    $('#bDf').value = 1.5; $('#bShape').value = 'square'; $('#bB').value = 2.5; $('#bL').value = 2.5; $('#bP').value = 1050; $('#bt').value = 0.6;
    $('#tB').value = 2.5; $('#tL').value = 2.5; $('#tDf').value = 1.5; $('#tq').value = 170; $('#tt').value = 10;
  }
  function exportJSON() {
    readLayerTable();
    const blob = new Blob([JSON.stringify({ gl: state.gl, wtMeasured: state.wtMeasured, wtDesign: state.wtDesign, Df: state.Df, layers: state.layers }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'soil_profile.json'; a.click();
  }
  function importJSON(file) {
    const r = new FileReader();
    r.onload = () => { try { const o = JSON.parse(r.result); state.gl = o.gl || ''; state.wtMeasured = o.wtMeasured; state.wtDesign = o.wtDesign; state.layers = (o.layers || []).map(L => Object.assign(blankLayer(), L)); $('#gl').value = state.gl; $('#wtM').value = state.wtMeasured; $('#wtD').value = state.wtDesign; renderLayerTable(); refreshProfile(); } catch (e) { alert('Could not read the file: ' + e.message); } };
    r.readAsText(file);
  }
  function init() {
    $$('.tab').forEach(b => b.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.toggle('on', x === b)); $$('.panel').forEach(p => p.hidden = p.id !== b.dataset.p);
    }));
    $('#layerTable').addEventListener('input', refreshProfile); $('#layerTable').addEventListener('change', refreshProfile);
    $('#layerTable').addEventListener('click', e => { const d = e.target.dataset.del; if (d != null) { readLayerTable(); state.layers.splice(+d, 1); renderLayerTable(); refreshProfile(); } });
    ['#gl', '#wtM', '#wtD'].forEach(s => $(s).addEventListener('input', refreshProfile));
    $('#addLayer').onclick = () => { readLayerTable(); const last = state.layers[state.layers.length - 1]; const nl = blankLayer(); if (last) nl.top = last.bot; else nl.top = 0; state.layers.push(nl); renderLayerTable(); refreshProfile(); };
    $('#clearAll').onclick = () => { state.layers = []; state.gl = state.wtMeasured = state.wtDesign = ''; $('#gl').value = $('#wtM').value = $('#wtD').value = ''; renderLayerTable(); refreshProfile(); };
    $('#exBH1').onclick = () => loadExample('BH-1'); $('#exBH2').onclick = () => loadExample('BH-2'); $('#exBH3').onclick = () => loadExample('BH-3');
    $('#exportBtn').onclick = exportJSON; $('#importFile').addEventListener('change', e => e.target.files[0] && importJSON(e.target.files[0]));
    $('#bDf').addEventListener('input', () => { state.Df = $('#bDf').value; refreshProfile(); });
    $('#runSPT').onclick = runSPT; $('#runDS').onclick = runDS; $('#runUU').onclick = runUU; $('#runOed').onclick = runOed;
    $('#runBear').onclick = runBearing; $('#fillBear').onclick = fillFromProfile; $('#solveB').onclick = solveWidth;
    $('#runStress').onclick = runStress; $('#runSet').onclick = runSettlement;
    $('#bShape').addEventListener('change', () => { const s = $('#bShape').value; $('#bL').disabled = s !== 'rect'; if (s === 'square') $('#bL').value = $('#bB').value; });
    state.layers = []; renderLayerTable(); refreshProfile();
    $('#exBH1').hidden = !window.EXAMPLES; $('#exBH2').hidden = !window.EXAMPLES; $('#exBH3').hidden = !window.EXAMPLES;
  }
  window.GeoApp = { state, getProfile, loadExample, runSPT, runDS, runBearing, runStress, runSettlement, refreshProfile, runOed, runUU, solveWidth };
  document.addEventListener('DOMContentLoaded', init);
})();
