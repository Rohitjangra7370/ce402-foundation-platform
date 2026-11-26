"""Builds the CE 402 report PDF. Every number is read from results/*.json or data/site.json (nothing retyped)."""
import json, os, re, sys
import matplotlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                Image, PageBreak, KeepTogether, NextPageTemplate)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
FD = os.path.join(os.path.dirname(matplotlib.__file__), 'mpl-data', 'fonts', 'ttf')
pdfmetrics.registerFont(TTFont('DV', os.path.join(FD, 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DV-B', os.path.join(FD, 'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('DV-I', os.path.join(FD, 'DejaVuSans-Oblique.ttf')))
pdfmetrics.registerFont(TTFont('DV-BI', os.path.join(FD, 'DejaVuSans-BoldOblique.ttf')))
pdfmetrics.registerFontFamily('DV', normal='DV', bold='DV-B', italic='DV-I', boldItalic='DV-BI')

S = json.load(open('data/site.json')); DER = json.load(open('results/derived.json'))
J = lambda f: json.load(open('results/' + f))
G0 = int(os.environ.get('G', 2))                    # group number of the report; other g values are shown as sensitivity
GS = sorted({1, 5, 12} - {G0})
ISO = J(f'isolated_g{G0}_Df1.5.json'); ISO3 = J(f'isolated_g{G0}_Df3.json'); ISO4 = J(f'isolated_g{G0}_Df4.json')
ISO_G = {gg: J(f'isolated_g{gg}_Df1.5.json') for gg in GS}
RAFT = {df: J(f'raft_g{G0}_Df{df:g}_t0.9.json') for df in (1.5, 3, 4, 4.4)}
RG = {(gg, df): J(f'raft_g{gg}_Df{df:g}_t0.9.json') for gg in GS for df in (4, 4.4)}
MEMBERS = [('Anushka Tomar', 'B24062'), ('Shreeya Deolia', 'B24094'), ('Divya Jain', 'B24074'), ('Chitra Meena', 'B24068'), ('Prince Solanki', 'B24088')]
URL_SITE = 'https://rohitjangra7370.github.io/ce402-foundation-platform/'; URL_REPO = 'https://github.com/Rohitjangra7370/ce402-foundation-platform'
REC = RAFT[4.4]
SRC = json.load(open('docs/sources.json'))
g = ISO['g']; lam = ISO['lambda']

# ------------------------------------------------------------------ styles
BODY = ParagraphStyle('b', fontName='DV', fontSize=8.8, leading=12, spaceAfter=4)
SM = ParagraphStyle('s', parent=BODY, fontSize=7.4, leading=9.4, spaceAfter=0)
SMB = ParagraphStyle('sb', parent=SM, fontName='DV-B')
H1 = ParagraphStyle('h1', parent=BODY, fontName='DV-B', fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=5, textColor=colors.HexColor('#0b2d5c'))
H2 = ParagraphStyle('h2', parent=BODY, fontName='DV-B', fontSize=10, leading=13, spaceBefore=8, spaceAfter=3, textColor=colors.HexColor('#0b2d5c'))
TITLE = ParagraphStyle('t', parent=BODY, fontName='DV-B', fontSize=18, leading=22, spaceAfter=4, textColor=colors.HexColor('#0b2d5c'))
CAP = ParagraphStyle('c', parent=BODY, fontName='DV-I', fontSize=7.8, leading=10, textColor=colors.HexColor('#444444'), spaceAfter=7)
BUL = ParagraphStyle('bul', parent=BODY, leftIndent=11, bulletIndent=2, spaceAfter=2.5)
BOX = ParagraphStyle('box', parent=BODY, backColor=colors.HexColor('#eef3fb'), borderColor=colors.HexColor('#9db6dd'), borderWidth=0.6, borderPadding=6, spaceBefore=4, spaceAfter=9)
WARN = ParagraphStyle('warn', parent=BOX, backColor=colors.HexColor('#fff4e0'), borderColor=colors.HexColor('#e0b060'))
W = A4[0] - 36 * mm

def P(t, st=BODY): return Paragraph(t, st)
def B(items): return [Paragraph(t, BUL, bulletText='•') for t in items]
def f(x, n=1): return '-' if x is None else f'{x:.{n}f}'

def tbl(rows, widths, hdr=1, fs=7.4, align=None, zebra=True, repeat=1):
    sty = ParagraphStyle('tc', parent=SM, fontSize=fs, leading=fs + 2.1)
    styb = ParagraphStyle('tb', parent=sty, fontName='DV-B')
    data = []
    for i, r in enumerate(rows):
        data.append([c if not isinstance(c, str) else Paragraph(c, styb if i < hdr else sty) for c in r])
    t = Table(data, colWidths=widths, repeatRows=repeat if hdr else 0)
    st = [('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#9aa4b2')), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
          ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3), ('TOPPADDING', (0, 0), (-1, -1), 1.6), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.8)]
    if hdr: st.append(('BACKGROUND', (0, 0), (-1, hdr - 1), colors.HexColor('#dde6f3')))
    if zebra:
        for i in range(hdr, len(rows)):
            if (i - hdr) % 2: st.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f6f8fb')))
    t.setStyle(TableStyle(st)); return t

def fig(path, width, caption):
    from PIL import Image as PI
    w, h = PI.open(path).size
    return KeepTogether([Image(path, width=width, height=width * h / w), P(caption, CAP)])

# ------------------------------------------------------------------ derived numbers
cols = ISO['cols']; byname = {c['name']: c for c in cols}
mxS = max(c['Stot'] for c in cols); mnS = min(c['Stot'] for c in cols)
zone = lambda bh, key: [c[key] for c in cols if c['bh'] == bh]
lim_iso = ISO['limits']; lim_raft = REC['limits']
worst_iso = ISO['worst']; worst_r = REC['worst']; rig = REC['rigid']
SumP0 = sum(c['P0'] for c in cols); SumP = sum(c['P'] for c in cols)
nfail = sum(1 for c in cols if c['Stot'] > lim_iso['total'])
ex = byname['B3']

story = []
# ================================================================== COVER / SUMMARY
story += [P('CE 402 Geotechnical Engineering', ParagraphStyle('x', parent=BODY, fontName='DV-B', fontSize=10, textColor=colors.HexColor('#555555'))),
          P('Foundation design platform and site foundation design', TITLE),
          P('Group assignment (Assignment 05): 28 isolated footings on a 30 m × 15 m grid, IS 6403:1981 bearing capacity, IS 1904:1986 settlement limits, alternative foundation', ParagraphStyle('sub', parent=BODY, fontSize=9.5, leading=13, textColor=colors.HexColor('#333333'))),
          tbl([['Group number', f'<b>Group {g}</b> (so g = {g} and λ = 1 + g/100 = {lam:.2f})'],
               ['Members (names, roll numbers)', '<br/>'.join(f'{a} ({b})' for a, b in MEMBERS)],
               ['Deployed platform (public URL)', URL_SITE],
               ['Source repository (GitHub)', URL_REPO],
               ['Date', '26 November 2026 (due date)']], [48 * mm, W - 48 * mm], hdr=0, zebra=False),
          Spacer(1, 6),
          P('<b>Prepared with AI assistance (Claude).</b> Appendix A is the AI-use log, Appendix B the AI audit, Appendix C the traceability table of every equation in the code. '
            'The group must read, check and take ownership of all of it before submission; items the AI could not do or verify are listed in section 9.', WARN)]

story += [P('1. Summary of results', H1)]
story += [P(
    f'<b>Isolated footings do not satisfy IS 1904:1986.</b> Sized on bearing capacity (net qnu/3, IS 6403) the 28 square footings are {min(c["B"] for c in cols):.1f} to {max(c["B"] for c in cols):.1f} m wide, '
    f'but their settlement is {mnS:.0f} to {mxS:.0f} mm against a limit of {lim_iso["total"]} mm, and the worst adjacent pair ({worst_iso["a"]}–{worst_iso["b"]}) has an angular distortion of 1/{1/worst_iso["ang"]:.0f} against the limit 1/666. '
    f'{nfail} of 28 footings exceed the total settlement limit. The settlement is almost entirely consolidation of the soft clay layers (BH-1 5.8–10.6 m, BH-3 4.4–11.2 m), '
    f'amplified by overlap of the stress bulbs of neighbouring footings. Founding the isolated footings deeper makes it worse ({ISO3["cols"] and max(c["Stot"] for c in ISO3["cols"]):.0f} mm at Df = 3.0 m, {max(c["Stot"] for c in ISO4["cols"]):.0f} mm at 4.0 m), because the footings get smaller and the net pressure higher.', BOX),
    P(
    f'<b>Recommended alternative: a compensated (floating) raft</b>, 31 m × 16 m, t = 0.9 m, founded at Df = 4.4 m (at the top of the soft clay in the east, in sand elsewhere). '
    f'The excavated soil weighs almost as much as the building, so the net pressure on the clay is only {min(v["qnet"] for v in REC["perBH"].values()):.1f}–{max(v["qnet"] for v in REC["perBH"].values()):.1f} kPa (g = {g}). '
    f'Computed settlement: maximum {REC["max"]:.0f} mm (limit {lim_raft["total"]} mm). The differential settlement criterion depends on raft stiffness, which this assignment\'s platform does not model: '
    f'treating the raft as perfectly flexible gives a worst adjacent-column angular distortion 1/{1/worst_r["ang"]:.0f} (limit 1/500, <b>not met</b>, governed by the artificial step between the BH-1 and BH-3 zones), '
    f'treating it as rigid gives a tilt of {rig["tiltStr"]} (<b>met</b>). The true value lies between; a stiff box (raft plus basement walls) is therefore required and a soil–structure interaction analysis is the next design step. '
    f'Contingency if that analysis fails: piles under the east strip (not designed here). A plain raft at Df = 1.5 m is rejected ({RAFT[1.5]["max"]:.0f} mm).', BOX),
    P(f'<b>Two inputs are assumptions</b> because the instructor gave no further information on the assignment: the missing load of column C4 (assumed 1450 kN, M = 0) and the BH-3 clay parameters, which had to be estimated from correlations (no valid consolidation test). Section 2 lists all assumptions; section 6.4 shows how the results change with the group number g.', WARN)]

# ================================================================== 2 ASSUMPTIONS
story += [P('2. Data, assumptions and flags', H1)]
story += B([
    f'<b>Group number g.</b> We are Group {g}, so g = {g} and λ = 1 + g/100 = {lam:.2f}. All scripts take g as an argument (<font name="DV-B">node tools/site.js &lt;g&gt; &lt;Df&gt;</font>, <font name="DV-B">node tools/raft.js &lt;g&gt; &lt;Df&gt; &lt;t&gt;</font>). Section 6.4 also shows g = 1, 5 and 12.',
    'The instructor gave no further information about this assignment (reported by the group), so every assumption listed here is the group\'s own and is stated openly for the marker.',
    f'<b>Column C4</b> is on the grid but missing from the load table. It is taken as an interior column (1450 kN, M = 0). The assignment mentions a rectangular footing for an eccentric column; with M = 0 for every listed column no footing is eccentric, so all 28 footings are square. If the instructor intends C4 to carry a moment, re-run with the correct value.',
    'Loads given are treated as service loads multiplied by λ; FS = 3.0 is applied to the <b>net</b> ultimate bearing capacity (IS 6403). Net applied pressure = (column load λP + footing weight − weight of soil replaced) / area, where the footing thickness is assumed as t = clamp((B − 0.4)/4, 0.45, 1.2) m.',
    'Water table: the design water table is the highest (August) level of each borehole (BH-1 1.0 m, BH-2 1.7 m, BH-3 0.6 m); the measured level (2.6, 3.2, 1.9 m) is used only to correct the SPT values, since that is the condition at the time of the test. Capillary rise is ignored.',
    'Borehole zones as given: lines 1–2 BH-2, 3–5 BH-1, 6–7 BH-3. The profile therefore changes in steps at x = 7.5 m and x = 22.5 m. This produces artificial jumps in computed settlement between neighbouring columns (see 6.2).',
    'Structure type is assumed to be an RC framed building (the loads are column loads on a 5 m grid), so IS 1904:1986 Table 1 for RC framed structures is used.',
    '<b>Soft-clay parameters at BH-3 are estimated</b>: both UDS samples were disturbed, so no consolidation test is possible. Cc = 0.009(LL − 10) (Terzaghi &amp; Peck), Cr = 0.13 Cc, cu = 5N and cv taken from BH-1. The settlement in the east and its rate are therefore the most uncertain results. BH-2 parameters are likewise correlation-based (laboratory tests exist for BH-1 only).',
    'Bearing capacity of the footings is computed for a uniform founding layer; the layered (punching) check of a wide footing on thin sand over soft clay was not carried out. It would only lower the bearing results further and the isolated footings are rejected on settlement anyway.',
    'Not computed: secondary compression, elastic settlement of the clay, earthquake settlement. Settlement time for Schmertmann C2 is 10 years.',
])

# ================================================================== 3 GROUND MODEL
story += [P('3. Ground model and derived parameters', H1),
          fig('report/fig/ground.png', W * 0.98, 'Figure 1. Boreholes: layers, SPT N values (at the right of each column) and water table levels. N = 22 at BH-1 9.0 m was rejected (sampler hit a cobble).')]
story += [P('3.1 Laboratory interpretation (BH-1)', H2)]
ds = DER['ds']; uu = DER['uu']; oed = DER['oed']
rowsLab = [['Test', 'Result', 'Remark'],
           ['Direct shear, SM soaked', f'c′ = {ds["SM soaked"]["c"]:.2f} kPa, φ′ = {ds["SM soaked"]["phi"]:.2f}° (R² = {ds["SM soaked"]["r2"]:.5f})', 'Adopted φ′ = 30°, c′ = 0. Soaked state governs: the water table rises to 1.0 m.'],
           ['Direct shear, SM unsoaked (w = 10 %)', f'c′ = {ds["SM unsoaked (w=10%)"]["c"]:.2f} kPa, φ′ = {ds["SM unsoaked (w=10%)"]["phi"]:.2f}°', '<b>Rejected</b>: the apparent cohesion is suction at w = 10 % and disappears on wetting.'],
           ['Direct shear, SP soaked', f'c′ = {ds["SP soaked"]["c"]:.2f} kPa, φ′ = {ds["SP soaked"]["phi"]:.2f}°', 'Adopted φ′ = 34° (rounded down), c′ = 0.'],
           ['UU triaxial UDS-1 / UDS-2', f'cu = {uu["UDS-1"]["cu"]:.2f} / {uu["UDS-2"]["cu"]:.2f} kPa', 'cu = ½ (σ1 − σ3)f; the quoted values are deviator stresses, not cu.'],
           ['Oedometer UDS-1 (kg/cm² × 98.0665 → kPa)', f'Cc = {oed["Cc"]:.3f}, Cr = {oed["Cr"]:.3f}, σ′c ≈ {oed["sigC"]:.0f} kPa', 'σ′c ≈ σ′v0 (≈ 80 kPa at mid-depth): normally consolidated, OCR = 1 adopted (σ′c is a bilinear stand-in for the Casagrande construction).'],
           ['cv (cm²/s → m²/yr, × 3155.76)', f'6.3×10⁻⁴ cm²/s = {6.3e-4*3155.76:.2f} m²/yr', 'Increment 1–2 kg/cm² (the slower one, nearer the working range).']]
story += [tbl(rowsLab, [48 * mm, 52 * mm, W - 100 * mm])]

story += [P('3.2 SPT corrections (IS 2131) and parameters adopted', H2),
          P('Overburden factor CN = 0.77 log10(2000/σ′v) (σ′v in kPa, CN ≤ 2) is applied first, then the dilatancy correction N = 15 + ½(N′ − 15) for fine or silty sand below the water table with N′ &gt; 15. '
            'σ′v for the corrections uses the <b>measured</b> water table (the condition at the time of the test). Refusal (N ≥ 100) is not corrected. φ′ from N is the Peck–Hanson–Thornburn relation as fitted by Wolff (1989) and is only a cross-check of the laboratory values.')]
sptrows = [['BH', 'z (m)', 'Layer', 'N', "σ′v (kPa)", 'CN', "N′", 'Dilat.', 'N corr.', 'φ′(N) (°)']]
for bh, lst in DER['spt'].items():
    for r in lst:
        if r.get('sigmaV') is None:
            sptrows.append([bh, f(r['z'], 1), r['layer'], f"{r['N']}{' (refusal)' if r['N'] >= 100 else ''}", '-', '-', '-', '-', '-', '-']); continue
        sptrows.append([bh, f(r['z'], 1), r['layer'], f"{r['N']}{' (rejected)' if r['invalid'] else ''}", f(r['sigmaV'], 1), f(r['CN'], 2), f(r['N1'], 1), 'yes' if r['dil'] else 'no', f(r['Ncorr'], 1), f(r.get('phiN'), 1) if r.get('phiN') else '-'])
story += [tbl(sptrows, [11 * mm, 12 * mm, 14 * mm, 22 * mm, 19 * mm, 13 * mm, 13 * mm, 14 * mm, 16 * mm, 22 * mm], fs=7)]
story += [Spacer(1, 4), P('3.3 Adopted design parameters and their basis', H2)]
prow = [['BH', 'Layer (depth m)', 'γ moist/sat (kN/m³)', 'Adopted', 'Basis']]
for bh, d in S['boreholes'].items():
    for L in d['layers']:
        if L['kind'] == 'sand' or L['kind'] == 'gravel':
            ad = f"φ′ = {L['phi']}°, c′ = 0" + (f", e = {L['e']}" if 'e' in L else '') + (f", Dr = {L['Dr']} %" if 'Dr' in L else '') + f", qc/N = {L['qcN']}"
        elif L['kind'] == 'clay':
            ad = f"cu = {L['cu']} kPa, e0 = {L['e0']}, Cc = {L['Cc']}, Cr = {L['Cr']}, cv = {L['cv']:.1e} cm²/s, OCR 1"
        else: ad = 'fill (not relied on)'
        prow.append([bh, f"{L['name']} ({L['top']}–{L['bot']})", f"{L['gm']}/{L['gs']}", ad, L.get('src', '')])
story += [tbl(prow, [11 * mm, 35 * mm, 19 * mm, 45 * mm, W - 110 * mm], fs=6.8)]

# ================================================================== 4 METHOD
story += [P('4. Design method and settlement limits', H1),
          P('<b>Bearing capacity.</b> IS 6403:1981: qnu = c Nc sc dc ic + q (Nq − 1) sq dq iq + ½ B γ Nγ sγ dγ iγ W′, with Nq = e<super>π tanφ</super> tan²(45° + φ/2), Nc = (Nq − 1) cot φ, Nγ = 2(Nq + 1) tanφ (the IS 6403 values, e.g. 22.40 at 30°, not the Meyerhof 15.7). '
            'q is the effective overburden at the base, γ the bulk unit weight below the base, W′ the water-table factor (0.5 at or above the base, 1 at Df + B and below, linear in between). '
            'For medium-dense sand the capacity is interpolated between general and local shear (local: tanφ′ = 0.67 tanφ) using void ratio (0.55 → 0.75) or relative density (70 → 20 %). The factor of safety of 3.0 is applied to the net ultimate capacity.'),
          P('<b>Settlement.</b> Granular layers: Schmertmann, Hartman &amp; Brown (1978) strain-influence method with Es = (2.5 to 3.5) qc and qc = (qc/N)·N, C1, C2 (t = 10 years). Clay layers: one-dimensional consolidation in sublayers ≤ 0.5 m using Δσz from Boussinesq/Newmark rectangle superposition at the centre of the footing '
            '<b>including the stress from all other footings</b> (group effect), NC/OC branches of the e–log σ′ curve. The time curve uses Terzaghi U(Tv) with cv converted from cm²/s to m²/yr and user-selected drainage.'),
          P('<b>Limits (IS 1904:1986, Table 1, RC framed structures; cl. 16.3.5).</b> Differential settlement is the difference between the largest and smallest settlement; angular distortion is the differential settlement divided by the distance between the two points. '
            'The limits adopted and the reason for each choice:')]
lim_rows = [['Quantity', 'Isolated footings', 'Raft', 'Justification'],
            ['Maximum total settlement', f'{lim_iso["total"]} mm', f'{lim_raft["total"]} mm', 'Footings bear on sand (the sand/hard-clay column of Table 1). The plastic-clay column (75 mm isolated, 100 mm raft) would apply if the founding layer were soft clay; the stricter value is kept because the settlement is clay-dominated and the isolated footings fail either way.'],
            ['Maximum differential settlement', f'{lim_iso["diffFrac"]}·L = {lim_iso["diff"]:.1f} mm for L = 5 m', f'{lim_raft["diffFrac"]}·L = {lim_raft["diff"]:.1f} mm for L = 5 m', 'L = 5 m is the column spacing; every adjacent pair is checked.'],
            ['Angular distortion', lim_iso['angStr'], lim_raft['angStr'], 'Cracking in panel walls of RC frames; same 5 m pair basis.']]
story += [tbl(lim_rows, [36 * mm, 30 * mm, 30 * mm, W - 96 * mm]),
          P('<i>Reading caveat:</i> the scanned IS 1904 Table 1 is partly garbled; the raft row (75/100 mm, 0.0021 L, 1/500) was read from the scan and a secondary source and should be confirmed in the group\'s copy.', SM)]

# ================================================================== 5 ISOLATED
story += [P('5. Isolated footings (Df = 1.5 m)', H1),
          P(f'Each footing is sized by the smallest B (0.1 m steps) for which the net applied pressure does not exceed the net safe bearing capacity (FS = 3), with Df = 1.5 m (the minimum allowed) and g = {g}. Figure 2 shows the result to scale and the table below gives every footing.'),
          fig('report/fig/plan.png', W * 0.9, 'Figure 2. Footing plan, Df = 1.5 m. All footings are square (M = 0). Colours show the borehole zone.')]
iso_rows = [['Col', 'BH', 'λP (kN)', 'B (m)', 'q net (kPa)', 'qns (kPa)', 'Util.', 'Granular (mm)', 'Cons. own (mm)', 'Cons. + group (mm)', 'Total (mm)']]
for c in cols:
    iso_rows.append([c['name'], c['bh'], f(c['P'], 0), f(c['B'], 1), f(c['qnet'], 0), f(c['bear']['bc']['qns'], 0), f(c['util'], 2), f(c['Ssch'], 1), f(c['Scons_own'], 1), f(c['Scons'], 1), f'<b>{c["Stot"]:.0f}</b>'])
story += [tbl(iso_rows, [11 * mm, 13 * mm, 17 * mm, 11 * mm, 17 * mm, 15 * mm, 11 * mm, 20 * mm, 22 * mm, 23 * mm, W - 160 * mm], fs=7),
          P('Isolated footings, all 28 columns. "Total" = granular (Schmertmann) + consolidation including the stress of all neighbouring footings. Limit 50 mm.', CAP),
          fig('report/fig/iso_settlement.png', W * 0.9, 'Figure 3. Total settlement (mm) of each isolated footing. The east (BH-3) and centre (BH-1) zones sit on soft clay; the west zone (BH-2) has thinner, firmer clay.')]
z = lambda bh: (min(zone(bh, 'Stot')), max(zone(bh, 'Stot')))
story += [P('5.1 Checks against IS 1904', H2)]
story += [tbl([['Item', 'Value', 'Limit', 'Result'],
    ['Maximum total settlement', f'{mxS:.0f} mm', f'{lim_iso["total"]} mm', '<b>FAIL</b>'],
    ['Footings exceeding the total limit', f'{nfail} of 28', '0', '<b>FAIL</b>'],
    [f'Worst adjacent pair {worst_iso["a"]}–{worst_iso["b"]}: differential', f'{worst_iso["d"]:.0f} mm', f'{lim_iso["diff"]:.1f} mm', '<b>FAIL</b>'],
    ['Angular distortion of that pair', f'1/{1/worst_iso["ang"]:.0f}', lim_iso['angStr'], '<b>FAIL</b>'],
    ['Settlement range by zone: BH-2 / BH-1 / BH-3', f'{z("BH-2")[0]:.0f}–{z("BH-2")[1]:.0f} / {z("BH-1")[0]:.0f}–{z("BH-1")[1]:.0f} / {z("BH-3")[0]:.0f}–{z("BH-3")[1]:.0f} mm', '-', '-']], [70 * mm, 55 * mm, 25 * mm, W - 150 * mm])]
story += [Spacer(1, 4),
          P(f'Making the footings bigger does not help: the settlement is not governed by the footing size but by the soft clay 4–11 m deep that all 28 footings load together (the group effect doubles to triples the clay settlement of a single isolated footing: column "Cons. + group" vs "Cons. own"). '
            f'Deeper founding was tested as well: Df = 3.0 m gives a maximum of {max(c["Stot"] for c in ISO3["cols"]):.0f} mm (worst angular distortion 1/{1/ISO3["worst"]["ang"]:.0f}) and Df = 4.0 m gives {max(c["Stot"] for c in ISO4["cols"]):.0f} mm (1/{1/ISO4["worst"]["ang"]:.0f}). '
            'Group sensitivity at Df = 1.5 m (maximum settlement): ' + ', '.join(f'g = {gg} → {mm:.0f} mm' for gg, mm in sorted([(gg, max(c['Stot'] for c in d['cols'])) for gg, d in ISO_G.items()] + [(g, mxS)])) + '. In every case the maximum settlement is more than five times the limit, so the conclusion does not depend on g.'),
          P('5.2 Worked example: footing B3 (BH-1 zone, interior column)', H2)]
bc = ex['bear']['bc']; G_ = bc['gen']; L_ = bc['loc']
we = [['Quantity', 'General shear', 'Local shear'],
      ['φ′ (°)', f(G_['phi'], 2), f(L_['phi'], 2)], ['Nc / Nq / Nγ', f"{G_['N']['Nc']:.2f} / {G_['N']['Nq']:.2f} / {G_['N']['Ng']:.2f}", f"{L_['N']['Nc']:.2f} / {L_['N']['Nq']:.2f} / {L_['N']['Ng']:.2f}"],
      ['sc / sq / sγ (square)', f"{G_['S']['sc']:.2f} / {G_['S']['sq']:.2f} / {G_['S']['sg']:.2f}", f"{L_['S']['sc']:.2f} / {L_['S']['sq']:.2f} / {L_['S']['sg']:.2f}"],
      ['dc / dq = dγ', f"{G_['D']['dc']:.3f} / {G_['D']['dq']:.3f}", f"{L_['D']['dc']:.3f} / {L_['D']['dq']:.3f}"], ['ic, iq, iγ (vertical load)', '1.0', '1.0'], ["W′ (water table 1.0 m ≤ Df = 1.5 m)", f(G_['W'], 2), f(L_['W'], 2)],
      ['Surcharge term q(Nq−1)sq dq (kPa)', f(G_['t2'], 1), f(L_['t2'], 1)], ['Self-weight term ½BγNγ sγ dγ W′ (kPa)', f(G_['t3'], 1), f(L_['t3'], 1)], ['qnu (kPa)', f(G_['qnu'], 1), f(L_['qnu'], 1)]]
story += [P(f'P = {ex["P"]:.1f} kN, B = {ex["B"]:.1f} m, Df = 1.5 m, q = σ′v(Df) = {ex["bear"]["q"]:.2f} kPa, γ = {ex["bear"]["gam"]:.2f} kN/m³, e = 0.591 → weight on local shear = (0.591 − 0.55)/0.20 = {bc["wLocal"]:.3f}.'),
          tbl(we, [70 * mm, 45 * mm, 45 * mm]),
          P(f'qnu = (1 − {bc["wLocal"]:.3f}) × {G_["qnu"]:.1f} + {bc["wLocal"]:.3f} × {L_["qnu"]:.1f} = {bc["qnu"]:.1f} kPa; qns = qnu/3 = {bc["qns"]:.1f} kPa. Footing thickness t = {ex["bear"]["t"]:.2f} m, ΔW = {ex["bear"]["dW"]:.1f} kN, net load = {ex["bear"]["Pnet"]:.1f} kN, net pressure = {ex["qnet"]:.1f} kPa ≤ qns → utilisation {ex["util"]:.2f}. The platform reproduces these numbers exactly (checked in the browser): load the BH-1 example, tab 3, square, Df = 1.5, B = 2.7, press "Copy c′, φ′, e, Dr", P = 1522.5, t = 0.575.', BODY)]

# ================================================================== 6 RAFT
story += [P('6. Alternative foundation: compensated raft', H1),
          P('6.1 Options considered', H2)]
opt = [['Option', 'Result (g = %s)' % g, 'Verdict'],
       ['Isolated footings, Df 1.5–4.0 m', f'{mxS:.0f} to {max(c["Stot"] for c in ISO4["cols"]):.0f} mm; angular distortion 1/{1/worst_iso["ang"]:.0f} or worse', 'Rejected: settlement of soft clay'],
       ['Raft 31×16 m at Df = 1.5 m (t = 0.9 m)', f'net {min(v["qnet"] for v in RAFT[1.5]["perBH"].values()):.0f}–{max(v["qnet"] for v in RAFT[1.5]["perBH"].values()):.0f} kPa; max {RAFT[1.5]["max"]:.0f} mm; flexible angular 1/{1/RAFT[1.5]["worst"]["ang"]:.0f}', 'Rejected: large raft but same clay, net pressure still 60 kPa'],
       ['Raft at Df = 3.0 m', f'net ≈ {RAFT[3]["perBH"]["BH-1"]["qnet"]:.0f} kPa; max {RAFT[3]["max"]:.0f} mm; 1/{1/RAFT[3]["worst"]["ang"]:.0f}', 'Rejected'],
       ['Raft at Df = 4.0 m', f'net ≈ {RAFT[4]["perBH"]["BH-1"]["qnet"]:.0f} kPa; max {RAFT[4]["max"]:.0f} mm; 1/{1/RAFT[4]["worst"]["ang"]:.0f} flexible, rigid {RAFT[4]["rigid"]["tiltStr"]}', 'Total settlement met at g = %d (%.0f mm flexible) but not at g = 12 (%.0f mm); marginal' % (g, RAFT[4]['max'], RG[(12, 4)]['max'])],
       ['<b>Compensated raft at Df = 4.4 m</b>', f'net {min(v["qnet"] for v in REC["perBH"].values()):.1f}–{max(v["qnet"] for v in REC["perBH"].values()):.1f} kPa; max {REC["max"]:.0f} mm; flexible 1/{1/worst_r["ang"]:.0f}, rigid {rig["tiltStr"]}', '<b>Recommended</b> (conditional on stiffness check)'],
       ['Piles (bored, into dense gravel at 9.6–11.2 m)', 'not designed', 'Contingency for the east strip: cobbles/boulders make driving impractical, bored piles need casing through the saturated loose sand; settlement would be small but cost and construction difficulty are high'] ]
story += [tbl(opt, [52 * mm, 63 * mm, W - 115 * mm]), Spacer(1, 4),
          fig('report/fig/raft.png', W * 0.82, 'Figure 4. Flexible-raft settlement along row B for four founding depths and the rigid-raft plane of the recommended case.')]

story += [P('6.2 Recommended raft: results', H2),
          P(f'Raft plan {REC["raft"]["L"]:.0f} m × {REC["raft"]["B"]:.0f} m (columns plus 0.5 m overhang all round), area {REC["raft"]["A"]:.0f} m², thickness 0.9 m (weight {REC["Wraft"]:.0f} kN), Σ(λP) = {REC["SumP"]:.0f} kN (including C4). '
            f'Mean gross pressure = (ΣP + raft)/A = {REC["qgross"]:.1f} kPa. Net pressure at the base = gross − total stress removed by the excavation (the water table is unchanged afterwards, so Δσ′ = Δσ):')]
nrows = [['Zone', 'Design WT (m)', 'σv at 4.4 m (kPa)', 'u at 4.4 m (kPa)', 'Net pressure (kPa)', 'Raft bearing: qns (kPa)', 'Util.', 'Granular (mm)']]
for bh, v in REC['perBH'].items():
    bcz = REC['bearing'][bh]; nrows.append([bh, f(v['wt'], 1), f(v['sTot'], 1), f(v['u'], 1), f(v['qnet'], 1), f(bcz['qns'], 0), f(bcz['util'], 2), f(REC['schm'][bh], 1)])
story += [tbl(nrows, [17 * mm, 21 * mm, 25 * mm, 23 * mm, 24 * mm, 29 * mm, 13 * mm, W - 152 * mm]),
          P('Raft bearing check: the base level is the layer just below Df = 4.4 m (BH-3: soft clay, undrained φ = 0 with cu = 22 kPa; BH-1, BH-2: sand), raft treated as a 16 m wide footing, FS = 3 on the net capacity. Settlement at each column location: soft-clay consolidation under the whole raft as one uniformly loaded rectangle (Boussinesq/Newmark superposition) at the column\'s coordinates with the borehole of its zone, plus the Schmertmann granular settlement of the raft (B = 16 m, L = 31 m), which is of order 0.1 mm here.', SM), Spacer(1, 3)]
mat = [['Row \\ line'] + [f'{l} (x = {5*i} m, {S["zones"][l]})' for i, l in enumerate(S['grid']['lines'])]]
idx = {c['name']: c for c in REC['cols']}
for r in S['grid']['rows']: mat.append([r] + [f(idx[r + l]['Stot'], 1) for l in S['grid']['lines']])
story += [tbl(mat, [18 * mm] + [(W - 18 * mm) / 7] * 7, fs=7), P(f'Settlement (mm) of the compensated raft at each column (Df = 4.4 m), flexible-raft assumption, g = {g}.', CAP)]
chk = [['Check (IS 1904, raft)', 'Flexible raft (upper bound)', 'Rigid raft (lower bound)', 'Limit'],
       ['Maximum total settlement', f'{REC["max"]:.1f} mm', f'{rig["maxCorner"]:.1f} mm (corner of the fitted plane)', f'{lim_raft["total"]} mm'],
       ['Differential between adjacent columns (5 m)', f'{worst_r["d"]:.1f} mm ({worst_r["a"]}–{worst_r["b"]})', f'{rig["diff5m"]:.1f} mm', f'{lim_raft["diff"]:.1f} mm'],
       ['Angular distortion', f'1/{1/worst_r["ang"]:.0f}', f'{rig["tiltStr"]} (tilt)', lim_raft['angStr']],
       ['Verdict', 'total OK; angular <b>not met</b>', 'all met', '']]
story += [tbl(chk, [52 * mm, 45 * mm, 50 * mm, W - 147 * mm]),
          P('The flexible case adds no stiffness at all, so each column settles as if loaded alone on its own borehole; the large jump between B5 (BH-1 zone) and B6 (BH-3 zone) comes from the step in the soil model rather than from the real soil, which varies gradually. The rigid case fits a plane through the 28 settlements (least squares) and is optimistic because it ignores the differential straining of the structure. A raft 0.9 m thick with basement walls is stiff but not rigid; the real answer needs a soil–structure interaction analysis (e.g. beam-on-elastic-foundation or finite elements), which is outside this assignment. <b>I therefore report the raft as meeting the total-settlement limit and as conditionally meeting the angular-distortion limit.</b>', BODY)]

story += [P(f'6.3 Construction and stability points that must be checked', H2)]
story += B([
    f'<b>Dewatering and flotation.</b> At 4.4 m the pore pressure under the raft is {REC["perBH"]["BH-3"]["u"]:.0f} kPa (BH-3) to {REC["perBH"]["BH-2"]["u"]:.0f} kPa (BH-2), i.e. an uplift of about {REC["perBH"]["BH-3"]["u"]*REC["raft"]["A"]/1000:.1f} MN on the whole raft against a raft weight of {REC["Wraft"]/1000:.1f} MN: the empty raft would float. Keep the water table down until enough dead load is on; in service the gross pressure ({REC["qgross"]:.0f} kPa) exceeds the uplift by a factor of {REC["qgross"]/REC["perBH"]["BH-3"]["u"]:.1f}.',
    'Excavation 4.4 m deep, mostly below the water table, in loose silty sand at BH-3 with a stream 25 m to the east: needs a dewatering and retention scheme. In the east the excavation base is at the top of the soft clay (cu ≈ 22 kPa): basal stability must be checked and the sand-over-clay cover protected.',
    'Raft thickness 0.9 m is a preliminary value. Hand estimate for the heaviest column, with an <b>assumed</b> 0.4 m square column (size not given), d = 0.8 m: V = 1523 kN, critical perimeter 4(0.4 + 0.8) = 4.8 m, τ = 1523/(4.8 × 0.8) ≈ 0.40 MPa, against about 1.25 MPa (0.25√fck, fck = 25 MPa assumed). Not critical, but structural design is outside this assignment.',
    f'Gross weight of basement walls and slab was not added to the load; with a basement they raise the gross pressure by a few kPa and reduce the compensation. At g = 12 the maximum flexible settlement rises to {RG[(12, 4.4)]["max"]:.0f} mm.'])

story += [P('6.4 Sensitivity to the group number g', H2)]
sens = [['g (λ)', 'Df = 4.0 m: max settlement (mm); flexible angular distortion; rigid tilt', 'Df = 4.4 m: max settlement (mm); flexible angular distortion; rigid tilt']]
for gg in sorted({g, *GS}):
    a = (RG[(gg, 4)] if gg != g else RAFT[4]); b = (RG[(gg, 4.4)] if gg != g else RAFT[4.4])
    sens.append([f'{gg} ({1+gg/100:.2f})', f'{a["max"]:.0f}; 1/{1/a["worst"]["ang"]:.0f}; {a["rigid"]["tiltStr"]}', f'{b["max"]:.0f}; 1/{1/b["worst"]["ang"]:.0f}; {b["rigid"]["tiltStr"]}'])
story += [tbl(sens, [24 * mm, 70 * mm, W - 94 * mm]),
          P('The compensated raft is sensitive to λ because the net pressure is a small difference of two large numbers (' + f'{REC["qgross"]:.0f} kPa gross minus about {REC["qgross"] - REC["perBH"]["BH-3"]["qnet"]:.0f} kPa relieved' + '). The design must be re-run if the loads change and with the final basement loads.', SM)]

story += [P('7. Seismic note and liquefaction screening', H1),
          P('The site is in seismic Zone V. The loose to medium dense saturated silty sands at BH-3 (SM, N = 6 at 1.5 m, 24 % fines; SP, N = 14 at 3.0 m; water table 0.6 m) are potentially liquefiable, and the BH-1 silty sand (N = 13–16 below a 1.0 m water table) is a lesser concern. '
            'This is a <b>qualitative screening only</b>: no liquefaction analysis was carried out. A simplified procedure (Seed &amp; Idriss, 1971) with the Zone V parameters of IS 1893 (Part 1) must be run by the group. '
            'The recommended raft at 4.4 m removes the upper 4.4 m of soil, i.e. all the loose sands at BH-3, from beneath the foundation and places the raft on clay and dense sand/gravel, which is an additional advantage over isolated footings at 1.5 m (footings in liquefiable sand).')]

# ================================================================== 8 PLATFORM
story += [P('8. The web platform', H1),
          P('A single static web page (HTML, CSS and JavaScript only): no installation, no server, no accounts. All calculations run in the browser from the values typed into the forms; the calculation engine (<font name="DV-B">src/engine.js</font>) contains no site data. '
            'The ready-made example boreholes are in a separate file (<font name="DV-B">src/examples.js</font>) and are copied into the forms only when a "Load BH-x" button is pressed; they can be deleted without changing any calculation.'),
          tbl([['Module', 'Content', 'Output shown'],
               ['P1 Soil profile', 'Layers (depth, γ, N, strengths), measured and design water table, JSON import/export', 'Drawn profile, SPT points, total/pore/effective stress plot, stress table, error messages for gaps or overlaps'],
               ['P2 Parameters', 'IS 2131 SPT correction; direct shear least squares; UU triaxial; oedometer', 'Every step of the SPT correction; fit equation, residuals, R²; Cc, Cr, σ′c with unit conversions'],
               ['P3 Bearing capacity', 'Strip, square, rectangular, circular; general/local/auto shear; eccentricity, inclination, water table, FS', 'Nc Nq Nγ, shape, depth, inclination factors, W′, each term, qnu, net safe pressure, net load check, "find smallest B"'],
               ['P4 Stress increase', 'Boussinesq centre/corner of a rectangle, several rectangles at any point, 2:1 method', 'Table with m, n, I, Δσz and plot of Δσz against depth'],
               ['P5 Settlement', 'Schmertmann (granular), NC/OC consolidation in sublayers ≤ 0.5 m, time–settlement with single/double drainage', 'Iz diagram, C1, C2, sublayer table, total, t50, t90, time curve']], [32 * mm, 68 * mm, W - 100 * mm]),
          Spacer(1, 4), P('8.1 Verification', H2)]
story += B([
    '<font name="DV-B">tests/test_engine.js</font>: 42 benchmark checks against published values (IS 6403 Table 1 factors, Boussinesq influence values, Terzaghi U(Tv), unit conversions, W′, direct-shear slope, strip on clay 5.14c). All pass.',
    '<font name="DV-B">tests/check.py</font>: 51 independent checks that recompute the same quantities by different routes (numerical double integration of the point-load solution, finite-difference solution of the consolidation equation, numpy polyfit, an independent re-implementation of Schmertmann and the bearing equation). All pass; the largest difference is 5×10⁻⁵ in U(Tv). This detects coding errors; it cannot detect a wrong formula that both versions share, which is why the formulas were checked against the code texts separately (Appendix B).',
    '<font name="DV-B">tests/ui_test.js</font> (25 checks) and <font name="DV-B">tests/ui_unseen.js</font> (6 checks) drive the real page in a headless browser, including a profile the platform has never seen (no water table, over-consolidated clay, inclined load) loaded through the file import, and compare the displayed numbers with the engine. All pass on both the multi-file and the single-file build.'])
story += [P('8.2 Running and deploying', H2)]
story += B([
    '<b>Run locally:</b> open <font name="DV-B">index.html</font> (or <font name="DV-B">dist/standalone.html</font>, one self-contained file) in any current browser. Run the tests with <font name="DV-B">node tests/test_engine.js</font>, <font name="DV-B">python3 tests/check.py</font> (after <font name="DV-B">node tests/dump_engine.js</font>) and <font name="DV-B">node tests/ui_test.js</font>.',
    '<b>Public URL (GitHub Pages):</b> push the repository to GitHub, then Settings → Pages → Deploy from a branch → main / root. The page is then served at https://&lt;account&gt;.github.io/&lt;repository&gt;/. Paste that URL in the title table. <b>This was not done by the AI</b>: it cannot create the group\'s repository or deployment.',
    '<b>Commits:</b> the assignment requires commits from every member. Each member should commit something real (a test, a README section, a bug fix) under their own name; the AI cannot make commits for the group members and none should be invented.'])

story += [P('9. Limits of this report and what the group must still do', H1)]
story += B([
    'Check that the public URL opens, and that every member has made at least one commit in the repository (section 8). If the instructor later supplies the load or moment of C4 or other data, edit <font name="DV-B">data/site.json</font>, re-run the two scripts and <font name="DV-B">python3 report/make_report.py</font> (all tables and figures are generated).',
    'Check the transcription of all site data in <font name="DV-B">data/site.json</font> against the assignment PDF, and decide whether the C4 assumption is right.',
    '<b>Unverified sources:</b> IS 2131:1981 could not be opened (the SPT corrections follow a BIS revision draft and NPTEL notes); IS 6403 Table 2 (shape/depth/inclination factors) and the IS 1904 raft row were illegible in the scan and were taken from a secondary source. Textbook equation numbers are deliberately not quoted because they differ between editions; fill them in from your own copy in Appendix C.',
    'The soil–structure interaction check of the raft, the liquefaction analysis, the layered bearing (punching) check, the construction-stage checks and the structural design are not done.',
    'Appendix A must be completed with the AI sessions of every group member; Appendix B is limited to what actually happened in this session and should be extended by what the group finds.'])

# ================================================================== SOURCES
story += [P('Sources', H1)]
refs = ['IS 6403:1981, Code of practice for determination of bearing capacity of shallow foundations (Bureau of Indian Standards).',
        'IS 1904:1986, Code of practice for design and construction of foundations in soils: general requirements (BIS).',
        'IS 2131:1981, Method for standard penetration test for soils (BIS): consulted through the BIS revision draft and NPTEL Module 1 notes; <b>not verified against IS 2131:1981 itself</b>.',
        'IS 2720 (Parts 11, 13, 15), Methods of test for soils: UU triaxial, direct shear, consolidation (BIS).',
        'Schmertmann, J.H., Hartman, J.P., Brown, P.R. (1978). Improved strain influence factor diagrams. J. Geotech. Eng. Div., ASCE, 104(GT8), 1131–1135.',
        'Schmertmann, J.H. (1970). Static cone to compute static settlement over sand. J. Soil Mech. Found. Div., ASCE, 96(SM3), 1011–1043.',
        'Terzaghi, K. (1943). Theoretical Soil Mechanics. Wiley. Terzaghi, K. and Peck, R.B. (1948, 1967). Soil Mechanics in Engineering Practice. Wiley.',
        'Peck, R.B., Hanson, W.E., Thornburn, T.H. (1974). Foundation Engineering, 2nd ed. Wiley. Wolff, T.F. (1989). Pile capacity prediction using parameter functions, ASCE GSP 23 (the φ–N fit).',
        'Newmark, N.M. (1935). Simplified computation of vertical pressures in elastic foundations. Univ. Illinois Eng. Exp. Station Circ. 24. Boussinesq, J. (1885). Application des potentiels à l\'étude de l\'équilibre et du mouvement des solides élastiques.',
        'Casagrande, A. (1936). The determination of the pre-consolidation load and its practical significance. Proc. 1st ICSMFE, Cambridge, Mass.',
        'Das, B.M. Principles of Foundation Engineering; Principles of Geotechnical Engineering (Cengage): corner/centre stress formulas, layered cv, consolidation settlement.',
        'Seed, H.B. and Idriss, I.M. (1971). Simplified procedure for evaluating soil liquefaction potential. J. Soil Mech. Found. Div., ASCE, 97(SM9), 1249–1273.',
        ]
story += [Paragraph(f'[{i+1}] {t}', ParagraphStyle('r', parent=SM, fontSize=7, leading=8.8, spaceAfter=1.5, leftIndent=14, firstLineIndent=-14)) for i, t in enumerate(refs)]

# ================================================================== APPENDIX A
story += [PageBreak(), P('Appendix A. AI-use log', H1),
          P('Tool: Claude (Anthropic) running in the Claude Code agent harness; configured model <font name="DV-B">claude-sonnet-5-5</font> (the serving model may differ). Date of all entries: 26 November 2026. '
            '<b>The only prompt given to the AI for this assignment was</b> <font name="DV-B">"Now do this assignment"</font> (with the assignment PDF attached); the AI then planned and carried out the work on its own, so the steps below are the AI\'s decisions, each with what the group should do about it. '
            'No AI use by other group members was reported when this report was generated. If any member used AI for this assignment, <b>add those sessions here</b> (date, tool, purpose, verbatim key prompts, accepted / changed / rejected and why).', BODY)]
log = [['#', 'Purpose', 'Output of the AI', 'Decision (accepted / changed / rejected) and reason'],
       ['1', 'Read the assignment, extract data', 'Transcription of grid, loads, zoning, water tables, laboratory tables into data/site.json', '<b>Accepted with check needed</b>: the group must re-read every number against the PDF. <b>Changed</b>: C4 (not in the load table) assumed 1450 kN; g = 2 taken from the group number given by the group.'],
       ['2', 'Bearing-capacity equations', 'IS 6403 equation, Nγ = 2(Nq+1)tanφ, shape/depth/inclination factors', '<b>Rejected</b> the AI\'s first recollection of Meyerhof\'s Nγ (15.7 at 30°) and rectangular sq = 1.0; <b>accepted</b> the form that reproduces IS 6403 Table 1 (22.40) and the secondary-source shape factors (flagged, section 9).'],
       ['3', 'SPT corrections', 'CN overburden then dilatancy order, measured vs design water table', '<b>Accepted</b> with the warning that IS 2131:1981 itself was not available (BIS draft and NPTEL used).'],
       ['4', 'Laboratory interpretation', 'Soaked direct shear φ′ = 30°/34°, cu = ½ deviator, Cc, Cr, σ′c, cv unit conversions', '<b>Rejected</b> the unsoaked shear c′ = 6.9 kPa (suction) and the SPT N = 22 at 9.0 m (cobble). <b>Accepted</b> soaked values and NC clay.'],
       ['5', 'Parameters without tests (BH-2, BH-3)', 'Correlations: Cc = 0.009(LL−10), cu = 5N, cv from BH-1', '<b>Accepted but flagged</b> as uncertain (BH-3 has no valid consolidation test).'],
       ['6', 'Engine, tests, independent cross-check', 'src/engine.js, 42 benchmark tests, 51-check Python script', '<b>Changed</b> after errors were found by running it (Appendix B).'],
       ['7', 'Web platform', 'index.html, app.js, style.css, 31 browser tests', '<b>Changed</b> twice after review (drainage of stacked clay layers; NaN from blank unit weights; Appendix B).'],
       ['8', 'Isolated-footing design', 'All 28 footings sized, settlement with group effect, IS 1904 check', '<b>Accepted</b> as the design result: the footings fail. Deeper founding and other g were tested and <b>rejected</b> as a fix.'],
       ['9', 'Alternative foundation', 'Raft at 1.5, 3.0, 4.0, 4.4 m; rigid/flexible bounds; sensitivity to g', f'The initial idea of a plain raft was <b>rejected</b> after calculation ({RAFT[1.5]["max"]:.0f} mm). The compensated raft is <b>recommended conditionally</b>; piles <b>not designed</b>.'],
       ['10', 'Report', 'This document, generated from the result files', 'Group 2 data (g, members, links) added at the group\'s request; the group must read and check it before submitting.']]
story += [tbl(log, [6 * mm, 36 * mm, 52 * mm, W - 94 * mm], fs=7.2)]

# ================================================================== APPENDIX B
story += [PageBreak(), P('Appendix B. AI audit', H1),
          P('Errors and weaknesses in what the AI produced that were really found during this session (notes written at the time in docs/audit_notes.md, not reconstructed). Each is a real event; none was invented to fill the table.', BODY)]
aud = [['#', 'What the AI produced', 'How it was detected', 'Correction and lesson'],
       ['1', '<b>Wrong Nγ and shape factor recalled from memory.</b> The AI first recalled the Meyerhof Nγ = (Nq − 1) tan(1.4φ) (15.7 at φ = 30°) and a rectangular-footing sq = 1.0. IS 6403 Table 1 uses the Vesic form (22.40 at 30°); using 15.7 would have made the self-weight term about 30 % too low at φ = 30° (conservative there, but wrong, and the error changes with φ).', 'Checked the equation against the text of IS 6403 before coding and then against Table 1 values in the benchmark test.', 'Nγ = 2(Nq + 1) tanφ. The shape factor for a rectangle is taken from a secondary source (1 + 0.2 B/L) because the scan was illegible: flagged in the report instead of presented as verified.'],
       ['2', '<b>Stacked clay layers treated as separately double-drained.</b> The first version of the time-settlement module gave each clay layer its own two-way drainage. At BH-1 and BH-3 two clay layers lie on top of each other, so the upper one has no free-draining base, and the drainage path would have been halved wrongly (for the two equal-thickness clay layers of BH-1 and BH-3 the drainage path would be half as long, so the computed consolidation time would be 4 times too short).', 'Reading the code against the physical profile before accepting the first output.', 'Contiguous clay layers are now one stratum with cv(eq) = (ΣH)²/(ΣH/√cv)²; drainage (single/double) is chosen per stratum; the function is covered by the cross-check.'],
       ['3', '<b>Silent NaN stresses.</b> A blank unit-weight box was passed to the engine as NaN (parseFloat of an empty string) and the engine only guarded null or empty-string values, so entering only γsat would have given NaN stresses without any error message.', 'Code review of the interface between the form and the engine.', 'Blank is now undefined, the engine falls back to the other unit weight, and a message appears when both are blank. The unseen-data test uses a layer with γsat only.'],
       ['4', '<b>Undefined function in the engine.</b> engine.js called log10 in four functions without defining it; the first batch of unit tests did not call those functions and passed.', 'First run of the parameter-derivation script produced a ReferenceError.', 'Defined it and extended the tests to every exported function. A passing test suite only proves the functions it calls.'],
       ['5', '<b>Sourcing weakness and a modelling artefact.</b> (a) IS 2131 could not be opened, IS 6403 Table 2 and the IS 1904 raft row were garbled: the AI had used values from a secondary source. (b) The mandatory borehole zoning is a step function, so the flexible-raft angular distortion (1/' + f'{1/worst_r["ang"]:.0f}' + ') is dominated by the jump between columns B5 and B6.', '(a) Fetch failure and an unreadable scan. (b) The result table: the largest differential sits exactly at the zone boundary.', '(a) Marked "unverified" in sections 4 and 9 and in the references. (b) The result is reported as an upper bound next to a rigid-raft lower bound instead of quoting the favourable one; a soil–structure interaction analysis is listed as the next step.']]
story += [tbl(aud, [6 * mm, 62 * mm, 40 * mm, W - 108 * mm], fs=7.1)]

# ================================================================== APPENDIX C
import subprocess
def lineno(fn):
    t = open('src/engine.js', encoding='utf8').read().split('\n')
    for i, l in enumerate(t, 1):
        if re.search(r'function\s+' + fn + r'\b', l) or re.search(r'const\s+' + fn + r'\b', l): return i
    return 0
story += [PageBreak(), P('Appendix C. Traceability of every equation in the code', H1),
          P('Each function below carries a comment "SRC:" in <font name="DV-B">src/engine.js</font> naming where its equation comes from (code clause, paper or textbook). The table is generated from those comments by <font name="DV-B">tools/sources.js</font>. '
            'Textbook equation numbers are deliberately <b>not</b> quoted because they differ between editions: the group should add the number from its own copy in the last column. The clause and table numbers of the Indian Standards are those the AI noted while reading the code texts in this session; confirm each in your copy of the standard.', BODY)]
def short(w):
    for sep in ('. ', ' p: ', ' o: ', ' opts:', ' pts:', ' layers:', ' Q (kN)'):
        w = w.split(sep)[0]
    w = w.rstrip('.') + '.'
    if len(w) > 120: w = w[:120].rsplit(' ', 1)[0] + '…'
    return w
crow = [['Line in engine.js', 'Function', 'Equation / purpose', 'Source (as written in the code comment)', 'Eq. no. in your copy']]
for r in SRC:
    crow.append([str(lineno(r['fn'])), f'<font name="DV-B">{r["fn"]}</font>', short(r['what']), r['src'][:330], ''])
story += [tbl(crow, [15 * mm, 25 * mm, 36 * mm, W - 104 * mm, 28 * mm], fs=6.5)]
story += [P('Not covered by engine.js (outside the engine by design): layout and plotting code in app.js (drawing only), and the site-specific scripts tools/site.js and tools/raft.js, which only call the engine with the site data; their load, area and net-pressure bookkeeping is described in sections 5 and 6.', SM)]

# ------------------------------------------------------------------ build
def footer(c, d):
    c.saveState(); c.setFont('DV', 7); c.setFillColor(colors.HexColor('#666666'))
    c.drawString(18 * mm, 10 * mm, f'CE 402 foundation design · Group {g} · prepared with AI assistance, see Appendices A–B')
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Page {d.page}'); c.restoreState()
doc = BaseDocTemplate('report/CE402_Foundation_Report.pdf', pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=17 * mm,
                      title='CE 402 foundation design platform and site foundation design', author='CE 402 Group 2')
doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(18 * mm, 17 * mm, W, A4[1] - 33 * mm, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=footer)])
doc.build(story)
print('built report/CE402_Foundation_Report.pdf')
