"""Independent cross-check of the JS engine. Uses DIFFERENT numerical routes wherever possible:
 - Boussinesq: numerical double integration of the point-load solution (scipy dblquad), not the closed form
 - Terzaghi U(Tv): finite-difference solution of the consolidation PDE, not the series
 - direct shear / oedometer: numpy.polyfit
 - bearing factors: written independently from the IS 6403 formulae
 - Schmertmann & consolidation: re-implemented with numpy trapezoid integration
Run: node tests/dump_engine.js && python3 tests/check.py
"""
import json, math, sys
import numpy as np
from scipy import integrate

D = json.load(open('results/engine_dump.json'))
bad = []
def chk(name, got, want, rtol=1e-3, atol=1e-6):
    ok = abs(got - want) <= max(atol, rtol * abs(want))
    print(('PASS ' if ok else 'FAIL ') + f'{name}: engine={got:.6g} python={want:.6g}')
    if not ok: bad.append(name)

# ---- Boussinesq by numerical integration of the point-load solution  dsz = 3 P z^3 / (2 pi R^5)
def rect_corner_num(q, b, l, z):
    f = lambda y, x: 3 * q * z**3 / (2 * math.pi * (x*x + y*y + z*z) ** 2.5)
    return integrate.dblquad(f, 0, b, 0, l, epsabs=1e-10, epsrel=1e-10)[0]
for r in D['icorner']:
    chk(f"Icorner m={r['m']} n={r['n']}", r['I'], rect_corner_num(1.0, r['m'], r['n'], 1.0), rtol=2e-4, atol=1e-7)
for r in D['centre']:
    num = 4 * rect_corner_num(r['q'], r['B']/2, r['L']/2, r['z'])
    chk(f"centre q={r['q']} B={r['B']} L={r['L']} z={r['z']}", r['v'], num, rtol=2e-4)
def point_num(rects, px, py, z):
    tot = 0
    for rc in rects:
        f = lambda y, x: 3 * rc['q'] * z**3 / (2 * math.pi * ((x-px)**2 + (y-py)**2 + z*z) ** 2.5)
        tot += integrate.dblquad(f, rc['x1'], rc['x2'], rc['y1'], rc['y2'], epsabs=1e-9, epsrel=1e-9)[0]
    return tot
for p in D['superpos']['pts']:
    chk(f"superposition point ({p['x']},{p['y']}) z={p['z']}", p['v'], point_num(D['superpos']['rects'], p['x'], p['y'], p['z']), rtol=2e-4)

# ---- consolidation U(Tv) by finite differences (Crank-Nicolson not needed; implicit Euler, fine mesh)
def U_fd(Tv, n=200):
    dz = 1.0 / n; z = np.linspace(0, 1, n + 1)
    # one drainage path of length 1: top drained (u=0), bottom impermeable (du/dz=0); Tv = cv t / Hdr^2
    u = np.ones(n + 1); u[0] = 0
    dt = Tv / 4000; t = 0.0
    A = np.zeros((n + 1, n + 1)); r = dt / dz**2
    for i in range(1, n): A[i, i-1] = -r; A[i, i] = 1 + 2*r; A[i, i+1] = -r
    A[0, 0] = 1; A[n, n] = 1 + 2*r; A[n, n-1] = -2*r
    Ainv = np.linalg.inv(A)
    for _ in range(4000):
        b = u.copy(); b[0] = 0; u = Ainv @ b
    return 1 - np.trapezoid(u, z)
for r in D['U']:
    chk(f"U(Tv={r['Tv']})", r['U'], U_fd(r['Tv']), rtol=3e-3, atol=2e-3)

# ---- bearing capacity factors written independently (Vesic Ngamma as in IS 6403 Table 1)
def factors(phi):
    p = math.radians(phi)
    if phi == 0: return 5.14, 1.0, 0.0
    Nq = math.exp(math.pi * math.tan(p)) * math.tan(math.radians(45 + phi/2))**2
    return (Nq - 1) / math.tan(p), Nq, 2 * (Nq + 1) * math.tan(p)
chk('Table 1: Nq(30)=18.40', factors(30)[1], 18.40, rtol=2e-3); chk('Table 1: Nc(30)=30.14', factors(30)[0], 30.14, rtol=2e-3); chk('Table 1: Ngamma(30)=22.40', factors(30)[2], 22.40, rtol=2e-3)
for r in D['bearing']:
    Nc, Nq, Ng = factors(r['phi']); B, L, Df, phi, q, g, c = r['B'], r['L'], r['Df'], r['phi'], r['q'], r['g'], r['c']
    shape = r['shape']
    if shape == 'strip': sc = sq = sg = 1.0
    elif shape == 'square': sc, sq, sg = 1.3, 1.2, 0.8
    elif shape == 'circle': sc, sq, sg = 1.3, 1.2, 0.6
    else: sc = sq = 1 + 0.2*B/L; sg = 1 - 0.4*B/L
    Nphi = math.tan(math.radians(45 + phi/2))**2
    if phi > 10: dc = 1 + 0.2*Df/B*math.sqrt(Nphi); dq = dg = 1 + 0.1*Df/B*math.sqrt(Nphi)
    else: dc = 1 + 0.2*Df/B*math.sqrt(Nphi); dq = dg = 1.0
    qnu = c*Nc*sc*dc + q*(Nq-1)*sq*dq + 0.5*B*g*Ng*sg*dg*1.0
    chk(f"qnu {shape} phi={phi} c={c} B={B}", r['qnu'], qnu, rtol=1e-4)

# ---- profile stresses (independent loop)
P = {'layers': None}
site = json.load(open('data/site.json'))
bh = site['boreholes']['BH-1']
def stress(layers, z, zw):
    tot = 0
    for i, L in enumerate(layers):
        a = L['top']; b = z if i == len(layers) - 1 else min(z, L['bot'])
        if z <= a: break
        dry = max(0, min(b, zw) - a)
        tot += L['gm'] * dry + L['gs'] * ((b - a) - dry)
    u = max(0, 9.81 * (z - zw)); return tot, u, tot - u
for r in D['profile_stress']:
    t, u, e = stress(bh['layers'], r['z'], r['wt']); chk(f"sigma'v z={r['z']}", r['eff'], e, rtol=1e-9)

# ---- direct shear with numpy polyfit
for k, r in D['ds'].items():
    m, c = np.polyfit(r['sigma'], r['tau'], 1)
    chk(f"DS {k} phi", r['phi'], math.degrees(math.atan(m)), rtol=1e-9); chk(f"DS {k} c", r['c'], c, rtol=1e-9, atol=1e-9)

# ---- oedometer Cc, Cr with polyfit
pts = D['oed']['pts']; L = [p for p in pts if p['stage'] != 'U']; U = [p for p in pts if p['stage'] == 'U']
m, _ = np.polyfit([math.log10(p['p']) for p in L[-3:]], [p['e'] for p in L[-3:]], 1); chk('oed Cc', D['oed']['Cc'], -m, rtol=1e-9)
un = [L[-1]] + U; m, _ = np.polyfit([math.log10(p['p']) for p in un], [p['e'] for p in un], 1); chk('oed Cr', D['oed']['Cr'], -m, rtol=1e-9)

# ---- consolidation settlement (re-implemented)
c = D['consol']; lay = c['layers']; Ly = c['layer']
def sv_eff(z): return stress(lay, z, c['wt'])[2]
def ds_centre(z):
    zz = z - c['Df']
    f = lambda y, x: 3 * c['q'] * zz**3 / (2 * math.pi * (x*x + y*y + zz*zz) ** 2.5)
    return 4 * integrate.dblquad(f, 0, c['B']/2, 0, c['B']/2, epsabs=1e-9, epsrel=1e-9)[0]
H = Ly['bot'] - Ly['top']; ns = math.ceil(H/0.5 - 1e-9); h = H/ns; S = 0
for i in range(ns):
    zm = Ly['top'] + (i + 0.5)*h; s0 = sv_eff(zm); s1 = s0 + ds_centre(zm)
    S += Ly['Cc'] * h / (1 + Ly['e0']) * math.log10(s1 / s0) * 1000
chk('consolidation S (NC, 7 sublayers, numerical Boussinesq)', c['S'], S, rtol=3e-4)

# ---- equivalent cv: compare against a numerical travel-time definition
H1, H2 = D['cvEq']['H']; c1, c2 = D['cvEq']['cv']
chk('cv equivalent', D['cvEq']['v'], (H1+H2)**2 / (H1/math.sqrt(c1) + H2/math.sqrt(c2))**2, rtol=1e-12)

# ---- Schmertmann re-implementation
s = D['schm']; layers = s['layers']; B = s['B']; Df = s['Df']; dp = s['dp']; wt = s['wt']
svb = stress(layers, Df, wt)[2]; svp = stress(layers, Df + B/2, wt)[2]
Izp = 0.5 + 0.1*math.sqrt(dp/svp); C1 = max(0.5, 1 - 0.5*svb/dp); C2 = 1 + 0.2*math.log10(10/0.1)
zs = np.linspace(0, 2*B, 20001)
Iz = np.where(zs < B/2, 0.1 + (Izp-0.1)*zs/(B/2), Izp*(2*B - zs)/(1.5*B))
def Es_at(zg):
    for L in layers:
        if L['top'] <= zg <= L['bot']:
            if L['kind'] == 'clay': return None
            n = [min(100, t['N']) for t in L['N'] if not t.get('invalid')]
            return L['qcN']*1000*np.mean(n)*2.5
    return None
integrand = np.array([0.0 if Es_at(Df+z) is None else Iz[i]/Es_at(Df+z) for i, z in enumerate(zs)])
Ssch = C1*C2*dp*np.trapezoid(integrand, zs)*1000
chk('Schmertmann Izp', s['Izp'], Izp, rtol=1e-9); chk('Schmertmann C1', s['C1'], C1, rtol=1e-9); chk('Schmertmann C2', s['C2'], C2, rtol=1e-9)
chk('Schmertmann S (mm)', s['S'], Ssch, rtol=2e-3)

print('\nFAILED: ' + ', '.join(bad) if bad else '\nALL CROSS-CHECKS PASSED'); sys.exit(1 if bad else 0)
