"""Minimal (short) version of the CE 402 report. Same data files as the full report; nothing is retyped."""
import json, os
import matplotlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
FD = os.path.join(os.path.dirname(matplotlib.__file__), 'mpl-data', 'fonts', 'ttf')
for n, f in (('DV', 'DejaVuSans'), ('DV-B', 'DejaVuSans-Bold'), ('DV-I', 'DejaVuSans-Oblique'), ('DV-BI', 'DejaVuSans-BoldOblique')):
    pdfmetrics.registerFont(TTFont(n, os.path.join(FD, f + '.ttf')))
pdfmetrics.registerFontFamily('DV', normal='DV', bold='DV-B', italic='DV-I', boldItalic='DV-BI')

G0 = int(os.environ.get('G', 2)); lam = 1 + G0 / 100
J = lambda f: json.load(open('results/' + f))
ISO = J(f'isolated_g{G0}_Df1.5.json'); ISO3 = J(f'isolated_g{G0}_Df3.json'); ISO4 = J(f'isolated_g{G0}_Df4.json')
RAFT = {df: J(f'raft_g{G0}_Df{df:g}_t0.9.json') for df in (1.5, 3, 4, 4.4)}; REC = RAFT[4.4]
GS = [g for g in (1, 5, 12) if g != G0]
RG12 = J('raft_g12_Df4.4_t0.9.json'); RG12_4 = J('raft_g12_Df4_t0.9.json')
MEMBERS = [('Anushka Tomar', 'B24062'), ('Shreeya Deolia', 'B24094'), ('Divya Jain', 'B24074'), ('Chitra Meena', 'B24068'), ('Prince Solanki', 'B24088')]
URL_SITE = 'https://rohitjangra7370.github.io/ce402-foundation-platform/'; URL_REPO = 'https://github.com/Rohitjangra7370/ce402-foundation-platform'

BODY = ParagraphStyle('b', fontName='DV', fontSize=8.6, leading=11.6, spaceAfter=3)
SM = ParagraphStyle('s', parent=BODY, fontSize=7.4, leading=9.4, spaceAfter=0)
H1 = ParagraphStyle('h1', parent=BODY, fontName='DV-B', fontSize=11, leading=14, spaceBefore=9, spaceAfter=3)
TITLE = ParagraphStyle('t', parent=BODY, fontName='DV-B', fontSize=15, leading=19, spaceAfter=2)
BUL = ParagraphStyle('bul', parent=BODY, leftIndent=10, bulletIndent=1, spaceAfter=1.5)
CAP = ParagraphStyle('c', parent=BODY, fontName='DV-I', fontSize=7.4, leading=9.4, textColor=colors.HexColor('#555555'))
W = A4[0] - 32 * mm
P = lambda t, st=BODY: Paragraph(t, st)
B = lambda items: [Paragraph(t, BUL, bulletText='•') for t in items]
f = lambda x, n=0: f'{x:.{n}f}'

def tbl(rows, widths, fs=7.4, hdr=1):
    sty = ParagraphStyle('tc', parent=SM, fontSize=fs, leading=fs + 2); styb = ParagraphStyle('tb', parent=sty, fontName='DV-B')
    data = [[Paragraph(c, styb if i < hdr else sty) if isinstance(c, str) else c for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=hdr)
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#888888')), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                           ('BACKGROUND', (0, 0), (-1, hdr - 1), colors.HexColor('#ececec')), ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                           ('TOPPADDING', (0, 0), (-1, -1), 1.4), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.6)]))
    return t

cols = ISO['cols']; lim_i = ISO['limits']; lim_r = REC['limits']; wi = ISO['worst']; wr = REC['worst']; rig = REC['rigid']
mx = max(c['Stot'] for c in cols); mn = min(c['Stot'] for c in cols); nfail = sum(c['Stot'] > lim_i['total'] for c in cols)
story = []

# ------------------------------------------------------------------ page 1
story += [P('CE 402 Geotechnical Engineering · Group assignment 05', ParagraphStyle('x', parent=BODY, fontName='DV-B', fontSize=8.5, textColor=colors.HexColor('#555555'))),
          P('Foundation design platform and site foundation design (short version)', TITLE),
          tbl([['Group', f'<b>Group {G0}</b> (g = {G0}, λ = 1 + g/100 = {lam:.2f})  ·  26 November 2026'],
               ['Members', ' · '.join(f'{a} ({b})' for a, b in MEMBERS)],
               ['Platform', URL_SITE], ['Source code', URL_REPO]], [22 * mm, W - 22 * mm], hdr=0),
          P('<i>Short version. Prepared with AI assistance (Claude); AI log and audit are in section 6. The full report (calculation tables, worked example, 13 pages) contains everything shown here in more detail.</i>', ParagraphStyle('n', parent=SM, spaceBefore=4, spaceAfter=2))]

story += [P('1. Result', H1)]
story += B([
    f'<b>Isolated footings fail IS 1904:1986.</b> Sized on bearing capacity (net qnu / 3, IS 6403:1981), the 28 square footings are {min(c["B"] for c in cols):.1f}–{max(c["B"] for c in cols):.1f} m wide at Df = 1.5 m. Their settlement is {mn:.0f}–{mx:.0f} mm (limit {lim_i["total"]} mm; {nfail} of 28 exceed it) and the worst adjacent pair ({wi["a"]}–{wi["b"]}) has angular distortion 1/{1/wi["ang"]:.0f} (limit {lim_i["angStr"]}). The cause is consolidation of the soft clay (BH-1 5.8–10.6 m, BH-3 4.4–11.2 m), loaded by all footings together. Founding deeper is worse ({max(c["Stot"] for c in ISO3["cols"]):.0f} mm at 3.0 m, {max(c["Stot"] for c in ISO4["cols"]):.0f} mm at 4.0 m).',
    f'<b>Alternative: compensated raft</b> 31 × 16 m, t = 0.9 m, at Df = 4.4 m. Excavation removes almost the whole building load, so the net pressure is only {min(v["qnet"] for v in REC["perBH"].values()):.1f}–{max(v["qnet"] for v in REC["perBH"].values()):.1f} kPa. Maximum settlement {REC["max"]:.0f} mm (limit {lim_r["total"]} mm). Angular distortion: {rig["tiltStr"]} if the raft is rigid (limit {lim_r["angStr"]}, met) but 1/{1/wr["ang"]:.0f} if perfectly flexible (not met; governed by the step between the BH-1 and BH-3 zones). The truth is in between, so this is a <b>conditional pass</b>: a stiff box (raft + basement walls) and a soil–structure check are required. Fallback: piles under the east strip (not designed).'])
story += [Spacer(1, 3)]
res = [['', 'Isolated footings, Df = 1.5 m', 'Compensated raft, Df = 4.4 m', 'IS 1904 limit (isolated / raft)'],
       ['Maximum settlement', f'{mx:.0f} mm  ✗', f'{REC["max"]:.0f} mm  ✓', f'{lim_i["total"]} mm / {lim_r["total"]} mm'],
       ['Differential, adjacent columns (5 m)', f'{wi["d"]:.0f} mm  ✗', f'{wr["d"]:.0f} mm flexible ✗, {rig["diff5m"]:.0f} mm rigid ✓', f'{lim_i["diff"]:.1f} mm / {lim_r["diff"]:.1f} mm'],
       ['Angular distortion', f'1/{1/wi["ang"]:.0f}  ✗', f'1/{1/wr["ang"]:.0f} flexible ✗, {rig["tiltStr"]} rigid ✓', f'{lim_i["angStr"]} / {lim_r["angStr"]}']]
story += [tbl(res, [47 * mm, 40 * mm, 54 * mm, W - 141 * mm])]

story += [P('2. Assumptions (the instructor gave no further information)', H1)]
story += B([
    f'Group {G0} → g = {G0}, λ = {lam:.2f} applied to all column loads. FS = 3 on the <b>net</b> ultimate capacity. Design water table = highest level (BH-1 1.0 m, BH-2 1.7 m, BH-3 0.6 m); measured level used only for SPT corrections.',
    '<b>Column C4</b> is missing from the load table: taken as an interior column, 1450 kN, M = 0 (so all footings are square). Borehole zones as given (lines 1–2 BH-2, 3–5 BH-1, 6–7 BH-3). RC framed building assumed for IS 1904 Table 1.',
    'Soaked direct-shear values adopted (φ′ 30° SM, 34° SP, c′ = 0); unsoaked c′ = 6.9 kPa rejected (suction). cu = ½ deviator stress. SPT N = 22 at BH-1 9.0 m rejected (cobble). BH-1 clay normally consolidated (Cc 0.29, Cr 0.038).',
    '<b>BH-2 and BH-3 clay parameters are estimated</b> from correlations (no valid consolidation test at BH-3): the east settlement is the least certain result.',
    'Limits (IS 1904:1986 Table 1, RC framed): isolated 50 mm, 0.0015 L (7.5 mm over 5 m), 1/666; raft 75 mm, 0.0021 L (10.5 mm), 1/500. The raft row was read from a poor scan: confirm in your copy.'])

# ------------------------------------------------------------------ page 2: footing table + figure
story += [P('3. Isolated footings (Df = 1.5 m), all 28 columns', H1)]
hd = ['Col', 'BH', 'λP (kN)', 'B (m)', 'S (mm)']
half = 14; rows = [hd + hd]
for i in range(half):
    a, b = cols[i], cols[i + half]
    rows.append([a['name'], a['bh'], f(a['P']), f(a['B'], 1), f'<b>{a["Stot"]:.0f}</b>', b['name'], b['bh'], f(b['P']), f(b['B'], 1), f'<b>{b["Stot"]:.0f}</b>'])
story += [tbl(rows, [13 * mm, 15 * mm, 18 * mm, 14 * mm, 14 * mm] * 2 + [], fs=7.2),
          P('S = Schmertmann settlement of the sand + consolidation of the clay including the stress of the neighbouring footings. B = side of the square footing.', CAP)]

story += [P('4. Raft options and result', H1)]
ro = [['Founding depth Df', 'Net pressure (kPa)', 'Max settlement (mm)', 'Flexible angular', 'Rigid tilt', 'Verdict']]
for df in (1.5, 3, 4, 4.4):
    r = RAFT[df]; q = r['perBH']
    ro.append([f'{df:g} m', f'{min(v["qnet"] for v in q.values()):.0f}–{max(v["qnet"] for v in q.values()):.0f}', f'{r["max"]:.0f}', f'1/{1/r["worst"]["ang"]:.0f}', r['rigid']['tiltStr'],
               {1.5: 'rejected', 3: 'rejected', 4: f'marginal ({RG12_4["max"]:.0f} mm at g = 12)', 4.4: '<b>recommended, conditional</b>'}[df]])
story += [tbl(ro, [28 * mm, 28 * mm, 31 * mm, 27 * mm, 22 * mm, W - 136 * mm]),
          P(f'Raft 31 × 16 m (columns + 0.5 m), t = 0.9 m, Σ(λP) = {REC["SumP"]:.0f} kN, gross pressure {REC["qgross"]:.1f} kPa; net = gross − total stress removed by the excavation. Settlement = clay consolidation under the whole raft (Boussinesq superposition at each column, borehole of its zone) + Schmertmann. Flotation: the empty raft would float (uplift ≈ {REC["perBH"]["BH-3"]["u"] * REC["raft"]["A"] / 1000:.1f} MN vs raft {REC["Wraft"] / 1000:.1f} MN): dewater until enough dead load is on. At g = 12 the flexible maximum rises to {RG12["max"]:.0f} mm. Zone V: loose saturated sands at BH-3 are potentially liquefiable (screening only).', ParagraphStyle('rr', parent=SM, spaceBefore=3, spaceAfter=3)),
          Image('report/fig/raft.png', width=W * 0.6, height=W * 0.6 * 0.49)]

# ------------------------------------------------------------------ page 3: platform, AI log, audit, sources
story += [P('5. Web platform', H1),
          P(f'One static page ({URL_SITE}): no installation, runs in the browser, no site values inside the engine. Tabs: 1 soil profile, 2 parameters (IS 2131 SPT correction, direct-shear least squares, UU, oedometer), 3 IS 6403 bearing capacity, 4 Boussinesq (centre/corner/superposition, 2:1), 5 settlement (Schmertmann, NC/OC consolidation, time curve). SI units beside every input and output. Every equation in <font name="DV-B">src/engine.js</font> has a "SRC:" comment (list: <font name="DV-B">docs/sources.md</font>). Tests: 42 benchmarks, 51 independent Python cross-checks, 31 browser tests (incl. unseen data): all pass.')]

story += [P('6. AI use', H1),
          P('<b>Log.</b> Claude (Anthropic), 26 Nov 2026. Only prompt for this task: “Now do this assignment” (PDF attached); the AI planned and did the work. No AI use by other members reported; add it here if any.', BODY),
          tbl([['Step', 'Decision'],
               ['Data transcribed from the PDF', 'Accepted, to be re-checked by the group; C4 assumed; g = 2 from the group number'],
               ['Bearing equations', 'Rejected the AI’s first recalled Meyerhof Nγ and sq = 1.0; accepted IS 6403 form (22.40 at 30°)'],
               ['Lab data', 'Rejected unsoaked c′ and N = 22 (cobble); accepted soaked φ′, NC clay'],
               ['Engine, tests, platform, design scripts', 'Accepted after the corrections listed in the audit'],
               ['Raft idea', 'Plain raft rejected after calculation; compensated raft recommended (conditional)']], [58 * mm, W - 58 * mm]),
          P('<b>Audit</b> — errors and weaknesses in the AI output that really occurred:', ParagraphStyle('a', parent=BODY, spaceBefore=5)),
          tbl([['#', 'Problem', 'Found by', 'Fix'],
               ['1', 'Wrong Nγ (Meyerhof 15.7 at 30°, not IS 6403’s 22.40) and rectangle sq = 1.0 recalled from memory', 'Checked against the code text and Table 1', 'Vesic form; rectangle factor from a secondary source, flagged unverified'],
               ['2', 'Stacked clay layers treated as separately double-drained → consolidation time too short (drainage path wrongly halved)', 'Reading code against the physical profile', 'Contiguous clays = one stratum, cv(eq) = (ΣH)²/(ΣH/√cv)²'],
               ['3', 'Blank unit weight passed as NaN: silent NaN stresses', 'Code review of form–engine interface', 'Blank → undefined; fallback to the other unit weight; test added'],
               ['4', 'log10 used but undefined in four functions; first tests did not call them', 'First run of the derivation script', 'Defined; tests now cover every function'],
               ['5', 'IS 2131 / IS 6403 Table 2 / IS 1904 raft row not read from primary text; zoning step dominates flexible-raft result', 'Fetch failure, illegible scan, result table', 'Marked unverified; flexible and rigid bounds both reported']], [6 * mm, 62 * mm, 45 * mm, W - 113 * mm], fs=7)]

story += [P('7. Sources', H1),
          P('IS 6403:1981 (bearing capacity); IS 1904:1986 (foundations, settlement limits); IS 2131:1981 (SPT; read via the BIS revision draft and NPTEL, not verified against the 1981 text); IS 2720 Parts 11, 13, 15. Schmertmann, Hartman &amp; Brown (1978), J. Geotech. Eng. Div. ASCE 104(GT8); Schmertmann (1970) JSMFD ASCE 96(SM3). Terzaghi (1943) <i>Theoretical Soil Mechanics</i>; Terzaghi &amp; Peck (1967) <i>Soil Mechanics in Engineering Practice</i>. Peck, Hanson &amp; Thornburn (1974) <i>Foundation Engineering</i>; Wolff (1989) ASCE GSP 23. Newmark (1935) Univ. Illinois Circ. 24; Boussinesq (1885). Casagrande (1936) Proc. 1st ICSMFE. Das, <i>Principles of Foundation Engineering</i> and <i>Principles of Geotechnical Engineering</i>. Seed &amp; Idriss (1971) JSMFD ASCE 97(SM9).', ParagraphStyle('src', parent=SM, fontSize=7, leading=8.6))]

def footer(c, d):
    c.saveState(); c.setFont('DV', 7); c.setFillColor(colors.HexColor('#666666'))
    c.drawString(16 * mm, 9 * mm, f'CE 402 · Group {G0} · short version · prepared with AI assistance'); c.drawRightString(A4[0] - 16 * mm, 9 * mm, f'Page {d.page}'); c.restoreState()
doc = BaseDocTemplate('report/CE402_Report_minimal.pdf', pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=15 * mm, title='CE 402 foundation design (short version)', author=f'CE 402 Group {G0}')
doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(16 * mm, 15 * mm, W, A4[1] - 29 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=footer)])
doc.build(story); print('built report/CE402_Report_minimal.pdf')
