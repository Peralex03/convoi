#!/usr/bin/env python3
"""Module « Convoi » pour Calque : complète le tableau de marche existant.

Ajoute : arrivée imposée (calcul du départ à rebours), rames avec écart entre rames,
haltes aux étapes (dans le tableau, la copie et le PDF).
Sans réglage nouveau, le tableau de marche reste identique à celui d'avant.

Ce script modifie la version construite (index.html), puis refait les empreintes
(CSP, version.json, empreintes.txt). Il sert à essayer le module sur une branche :
les mêmes remplacements sont à reporter dans les sources de Calque avant le prochain build.

Usage : python3 patch_convoi.py /chemin/vers/calque
"""
import base64, hashlib, json, re, sys, pathlib

root = pathlib.Path(sys.argv[1])
p = root / 'index.html'
s = p.read_text(encoding='utf-8')
old_scripts = re.findall(r'<script>(.*?)</script>', s, flags=re.S)
b64 = lambda t: base64.b64encode(hashlib.sha256(t.encode('utf-8')).digest()).decode()

def rep(a, b):
    global s
    n = s.count(a)
    if n != 1:
        sys.exit(f'Repère introuvable ou ambigu ({n} fois) : {a[:90]}')
    s = s.replace(a, b)

# 1. réglages de colonne : mode d'horaire, rames, écart entre rames
rep("const d = { speed: 40, n: 10, gap: 50, doubt: true, dep: '08:00' };\n  for (const k in d) if (typeof p[k] !== typeof d[k]) p[k] = d[k];",
    "const d = { speed: 40, n: 10, gap: 50, doubt: true, dep: '08:00', mode: 'dep', rames: 1, rgap: 5 };\n  for (const k in d) if (typeof p[k] !== typeof d[k]) p[k] = d[k];\n"
    "  if (!['dep', 'arr', 'arrAll'].includes(p.mode)) p.mode = 'dep';\n"
    "  p.rames = Math.max(1, Math.min(30, Math.round(p.rames) || 1)); p.rgap = Math.max(0, Math.min(120, Math.round(p.rgap) || 0));")

# 2. calcul : haltes, rames, départ à rebours
rep("""function marchRows(res) {
  const P = RP(), R = res.R, dep = depMin(), tail = Math.max(0, P.n - 1) * P.gap / (P.speed * 1000 / 60), n = R.legs.length + 1;
  const pts = [{ k: 'PI · départ', d: 0, t: 0 }, ...R.legs.slice(0, -1).map((l, i) => ({ k: `Étape ${i + 1}`, d: l.d1, t: l.t1 })), { k: 'PF · arrivée', d: R.len, t: R.time }];
  return pts.slice(0, n).map(p => { const t = dep + p.t * 60; return { k: p.k, km: fmtKm(p.d), head: hhmm(t), tail: hhmm(t + tail) }; });
}""",
"""/* ---- module Convoi : haltes aux étapes, rames, arrivée imposée ----
   Haltes : minutes, par itinéraire, rattachées au point de l'étape (une étape déplacée perd sa halte).
   Rames : la colonne roule en paquets égaux, séparés de `rgap` minutes de tête à tête.
   Horaire : départ donné, ou arrivée imposée (de la tête, ou de toute la colonne) avec départ calculé à rebours.
   Sans halte, avec une seule rame et un départ donné, le tableau est celui d'avant. */
const haltKey = p => p ? p[0] + ',' + p[1] : '';
function rHalts() { const r = rCur(); if (!isObj(r.halt)) r.halt = {}; return r.halt; }
function marchPlan(res) {
  const P = RP(), R = res.R, H = rHalts(), n = R.legs.length + 1;
  const G = Math.max(1, Math.min(P.rames, P.n)), base = Math.floor(P.n / G), rest = P.n % G;
  const sizes = Array.from({ length: G }, (_, i) => base + (i < rest ? 1 : 0));
  const lag = (G - 1) * P.rgap + Math.max(0, sizes[G - 1] - 1) * P.gap / (P.speed * 1000 / 60);
  const pts = [{ k: 'PI · départ', d: 0, t: 0 }, ...R.legs.slice(0, -1).map((l, i) => ({ k: `Étape ${i + 1}`, d: l.d1, t: l.t1, i: i + 1 })), { k: 'PF · arrivée', d: R.len, t: R.time }].slice(0, n);
  let add = 0;
  for (const p of pts) { p.arr = p.t * 60 + add; p.halt = p.i ? Math.max(0, Math.min(1440, Math.round(H[haltKey(res.P[p.i])]) || 0)) : 0; add += p.halt; p.dep = p.arr + p.halt; }
  const total = pts[pts.length - 1].arr, t0 = depMin();
  const start = P.mode === 'arr' ? t0 - total : P.mode === 'arrAll' ? t0 - total - lag : t0;
  return { start, total, lag, sizes, halts: add,
    rows: pts.map(p => ({ k: p.k, i: p.i || 0, km: fmtKm(p.d), head: hhmm(start + p.arr), tail: hhmm(start + p.arr + lag), halt: p.halt, headDep: hhmm(start + p.dep), tailDep: hhmm(start + p.dep + lag) })) };
}
function marchRows(res) { return marchPlan(res).rows; }""")

# 3. PDF : rames dans l'en-tête, ligne de halte, note
rep("""`${cur().name} · ${fmtKm(R.len)} km · ${fmtDur(R.time)} · ${RP().n} véhicules à ${RP().gap} m · ${rRes.opt.speed} km/h au plus`""",
    """`${cur().name} · ${fmtKm(R.len)} km · ${fmtDur(R.time)} · ${RP().n} véhicules à ${RP().gap} m${RP().rames > 1 ? ` · ${Math.min(RP().rames, RP().n)} rames à ${RP().rgap} min` : ''} · ${rRes.opt.speed} km/h au plus`""")
rep("""      [r.k, ll ? coordTxt(ll) : '', r.km, r.head, r.tail].forEach((t, c) => doc.text(x0 + 6 + cols[c][0], y, t, { size: 11, bold: c === 0 }));
    });""",
"""      [r.k, ll ? coordTxt(ll) : '', r.km, r.head, r.tail].forEach((t, c) => doc.text(x0 + 6 + cols[c][0], y, t, { size: 11, bold: c === 0 }));
      if (r.halt) { y += 15; [`Halte ${r.halt} min, départ`, '', '', r.headDep, r.tailDep].forEach((t, c) => { if (t) doc.text(x0 + 6 + cols[c][0], y, t, { size: 9.5, color: '#6B6F76' }); }); }
    });
    const haltSum = rows.reduce((a, r) => a + (r.halt || 0), 0);""")
rep("const notes = [`Véhicules : ${cDesc(rRes.C)}. Durée sans haltes.`,",
    "const notes = [`Véhicules : ${cDesc(rRes.C)}. ${haltSum ? `Heures de passage avec ${haltSum} min de halte ; la durée de trajet indiquée est sans haltes.` : 'Durée sans haltes.'}`,")

# 4. réglages : horaire (départ ou arrivée imposée), rames
rep("""    h('div', { class: 'label', text: 'Colonne' }), h('div', { class: 'erow' }, h('span', { class: 'flab', text: 'Départ' }), dep),
    h('div', { class: 'erow' }, numField(P.n, 1, x => { P.n = Math.round(x); persist(); dirty = true; }, 'véhicules'), numField(P.gap, 5, x => { P.gap = x; persist(); dirty = true; }, 'm d’intervalle')),""",
"""    h('div', { class: 'label', text: 'Colonne' }),
    h('div', { class: 'erow' }, segBtns([['dep', 'Départ à'], ['arr', 'Arrivée à'], ['arrAll', 'Tous arrivés à']], P.mode, v => { P.mode = v; persist(); dirty = true; })),
    h('div', { class: 'erow' }, h('span', { class: 'flab', text: 'Heure' }), dep),
    h('div', { class: 'erow' }, numField(P.n, 1, x => { P.n = Math.round(x); persist(); dirty = true; }, 'véhicules'), numField(P.gap, 5, x => { P.gap = x; persist(); dirty = true; }, 'm d’intervalle')),
    h('div', { class: 'erow' }, numField(P.rames, 1, x => { P.rames = Math.max(1, Math.min(30, Math.round(x))); persist(); dirty = true; }, 'rames'), numField(P.rgap, 1, x => { P.rgap = Math.max(0, Math.min(120, Math.round(x))); persist(); dirty = true; }, 'min entre rames')),
    h('p', { class: 'note', text: 'Arrivée imposée : le départ se calcule à rebours. Les haltes se règlent étape par étape dans le tableau de marche (Détails).' }),""")

# 5. tableau de marche à l'écran : résumé, haltes modifiables sur place, copie
rep("""    const rows = marchRows(rRes);
    res.append(h('div', { class: 'label', text: `Tableau de marche · ${RP().n} véhicules à ${RP().gap} m` }));
    const tbl = h('div', { class: 'list mt' }, h('div', { class: 'mtr head' }, h('span', { text: 'Point' }), h('span', { text: 'km' }), h('span', { text: 'Tête' }), h('span', { text: 'Queue' })));
    for (const x of rows) tbl.append(h('div', { class: 'mtr' }, h('b', { text: x.k }), h('span', { text: x.km }), h('span', { text: x.head }), h('span', { text: x.tail })));
    const cp = h('button', { type: 'button', class: 'act', html: icon('dup') + '<span>Copier</span>' });
    cp.addEventListener('click', () => copyText(['Point\\tkm\\tTête\\tQueue', ...rows.map(x => `${x.k}\\t${x.km}\\t${x.head}\\t${x.tail}`)].join('\\n'), 'Tableau copié'));
    const pf = h('button', { type: 'button', class: 'act', html: icon('file') + '<span>PDF</span>' });
    pf.addEventListener('click', () => marchPdf(rows));
    res.append(tbl, h('div', { class: 'acts' }, cp, pf), h('p', { class: 'note', text: 'Les points de passage et les lignes de phase se posent à la main (Signes, Tracer). Les étapes servent de points horaires dans le tableau.' }));""",
"""    let rows = [];
    const mtLab = h('div', { class: 'label' }), mtSum = h('p', { class: 'note mtsum' }), tbl = h('div', { class: 'list mt' });
    const drawMarch = () => {
      const mp = marchPlan(rRes), H = rHalts();
      rows = mp.rows;
      mtLab.textContent = `Tableau de marche · ${RP().n} véhicules à ${RP().gap} m${mp.sizes.length > 1 ? ` · ${mp.sizes.length} rames` : ''}`;
      mtSum.textContent = `Départ ${hhmm(mp.start)} · tête à l’arrivée ${hhmm(mp.start + mp.total)} · queue ${hhmm(mp.start + mp.total + mp.lag)}${mp.halts ? ` · dont ${mp.halts} min de halte` : ''}`;
      tbl.replaceChildren(h('div', { class: 'mtr head' }, h('span', { text: 'Point' }), h('span', { text: 'km' }), h('span', { text: 'Tête' }), h('span', { text: 'Queue' })));
      for (const x of rows) {
        tbl.append(h('div', { class: 'mtr' }, h('b', { text: x.k }), h('span', { text: x.km }), h('span', { text: x.head }), h('span', { text: x.tail })));
        if (!x.i) continue;
        const f = h('input', { class: 'field num', type: 'number', inputmode: 'numeric', min: '0', max: '1440', step: '5', 'aria-label': `Halte à l’étape ${x.i}, en minutes` });
        f.value = String(x.halt);
        f.addEventListener('change', () => { const v = Math.max(0, Math.min(1440, Math.round(parseFloat(f.value) || 0))), k = haltKey(rRes.P[x.i]); if (v) H[k] = v; else delete H[k]; persist(); drawMarch(); });
        f.addEventListener('keydown', e => { if (e.key === 'Enter') f.blur(); });
        tbl.append(h('div', { class: 'mtr halt' }, h('label', { class: 'numf' }, h('span', { text: 'Halte' }), f, h('span', { text: 'min' })), h('span', { text: x.halt ? 'départ' : '' }), h('span', { text: x.halt ? x.headDep : '' }), h('span', { text: x.halt ? x.tailDep : '' })));
      }
    };
    drawMarch(); redrawMarch = drawMarch;
    const cp = h('button', { type: 'button', class: 'act', html: icon('dup') + '<span>Copier</span>' });
    cp.addEventListener('click', () => copyText(['Point\\tkm\\tTête\\tQueue', ...rows.flatMap(x => [`${x.k}\\t${x.km}\\t${x.head}\\t${x.tail}`, ...(x.halt ? [`Halte ${x.halt} min, départ\\t\\t${x.headDep}\\t${x.tailDep}`] : [])])].join('\\n'), 'Tableau copié'));
    const pf = h('button', { type: 'button', class: 'act', html: icon('file') + '<span>PDF</span>' });
    pf.addEventListener('click', () => marchPdf(rows));
    res.append(mtLab, mtSum, tbl, h('div', { class: 'acts' }, cp, pf), h('p', { class: 'note', text: 'Les points de passage et les lignes de phase se posent à la main (Signes, Tracer). Les étapes servent de points horaires dans le tableau ; une halte s’y règle en minutes.' }));""")

# 5 bis. le tableau se recalcule quand on revient sur « Détails » après avoir changé la colonne
rep("""  const seg = segBtns([['res', 'Détails'], ['moy', 'Véhicules'], ['lay', 'Calques']], routeTab, v => { routeTab = v; for (const k in panes) panes[k].hidden = k !== v; sBody.scrollTop = 0; });""",
    """  let redrawMarch = null;
  const seg = segBtns([['res', 'Détails'], ['moy', 'Véhicules'], ['lay', 'Calques']], routeTab, v => { routeTab = v; for (const k in panes) panes[k].hidden = k !== v; sBody.scrollTop = 0; if (v === 'res' && redrawMarch) redrawMarch(); });""")

# 6. styles de la ligne de halte
rep(".mt .mtr b{font-weight:600}",
    ".mt .mtr b{font-weight:600}\n.mt .mtr.halt{padding-top:0;padding-bottom:10px;align-items:center;font-size:13px;color:var(--muted)}\n.mt .mtr.halt::before{display:none}\n"
    ".mt .mtr.halt .numf{flex:none;gap:6px;font-size:13px}\n.mt .mtr.halt .numf span{text-align:left}\n.mt .mtr.halt .field.num{flex:none;width:58px;height:32px;min-height:32px;padding:0 6px;text-align:center;font-size:15px}\n.mtsum{margin-top:0}")

# ---- empreintes : scripts en ligne (CSP), identifiant de version, version.json, empreintes.txt ----
ver = json.loads((root / 'version.json').read_text())
old_build = ver['build']
new_build = hashlib.sha256((s.replace(old_build, '') + 'convoi').encode('utf-8')).hexdigest()[:16]
s = s.replace(f'window.__BUILD="{old_build}";', f'window.__BUILD="{new_build}";')
new_scripts = re.findall(r'<script>(.*?)</script>', s, flags=re.S)
assert len(new_scripts) == len(old_scripts)
changed = 0
for a, b in zip(old_scripts, new_scripts):
    if a != b:
        ha, hb = f"'sha256-{b64(a)}'", f"'sha256-{b64(b)}'"
        assert s.count(ha) == 1, 'empreinte CSP introuvable'
        s = s.replace(ha, hb); changed += 1
p.write_text(s, encoding='utf-8')
raw = p.read_bytes()
ver['build'] = new_build
ver['index'] = base64.b64encode(hashlib.sha256(raw).digest()).decode()
(root / 'version.json').write_text(json.dumps(ver, separators=(',', ':')), encoding='utf-8')
e = (root / 'empreintes.txt').read_text()
hx = lambda f: hashlib.sha256((root / f).read_bytes()).hexdigest()
e = re.sub(r'^[0-9a-f]{64}  index\.html$', f'{hx("index.html")}  index.html', e, flags=re.M)
e = re.sub(r'^[0-9a-f]{64}  version\.json$', f'{hx("version.json")}  version.json', e, flags=re.M)
e = e.replace(f'# version {old_build}', f'# version {new_build}')
(root / 'empreintes.txt').write_text(e)
print(f'Module Convoi appliqué : version {old_build} -> {new_build}, {changed} scripts resignés')
