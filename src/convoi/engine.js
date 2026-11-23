/* Convoi : calcul du tableau de marche. Fonctions pures, sans interface (testées à part).
   Entrées : points de passage (distance cumulée, halte, vitesse du tronçon), colonne (véhicules, intervalle, groupes),
   heure de départ ou d'arrivée imposée. Sorties : heures de passage de la tête et de la queue, par point et par groupe. */
'use strict';
const ConvoiEngine = (() => {
  const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const fmt = mins => { const r = Math.round(mins), d = Math.floor(r / 1440), m = ((r % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${d > 0 ? ` (+${d} j)` : d === -1 ? ' (veille)' : d < 0 ? ` (${d} j)` : ''}`; };
  const R = 6371008.8, rad = Math.PI / 180;
  const dist = (a, b) => { const dl = (b[0] - a[0]) * rad, dn = (b[1] - a[1]) * rad, s = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(s))); };
  const cumul = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i])); return c; };
  /* point du tracé à la distance d (m) */
  function atDist(pts, cum, d) {
    d = Math.max(0, Math.min(cum[cum.length - 1], d));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const sl = cum[hi] - cum[lo] || 1, t = (d - cum[lo]) / sl;
    return [pts[lo][0] + t * (pts[hi][0] - pts[lo][0]), pts[lo][1] + t * (pts[hi][1] - pts[lo][1])];
  }
  /* distance le long du tracé du point le plus proche de p, et son écart au tracé (m) */
  function snap(pts, cum, p) {
    let best = { d: 0, off: Infinity };
    const k = Math.cos(p[0] * rad);
    for (let i = 1; i < pts.length; i++) {
      const ax = (pts[i - 1][1] - p[1]) * k, ay = pts[i - 1][0] - p[0], bx = (pts[i][1] - p[1]) * k, by = pts[i][0] - p[0];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      const q = [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])], off = dist(p, q);
      if (off < best.off) best = { d: cum[i - 1] + t * (cum[i] - cum[i - 1]), off };
    }
    return best;
  }
  /* véhicules par groupe : répartis au plus égal, les premiers groupes prennent le reste */
  function split(n, g) { g = Math.max(1, Math.min(g, n)); const base = Math.floor(n / g), rest = n % g; return Array.from({ length: g }, (_, i) => base + (i < rest ? 1 : 0)); }

  /* C : { mode:'dep'|'arr'|'arrAll', time:'HH:MM', speed, n, gap, vlen, groups, ggap, conso }
     P : [{ name, km, halt (min), v (km/h pour rejoindre ce point, 0 = vitesse du convoi) }], triés par km */
  function compute(P, C) {
    const pts = P.slice().sort((a, b) => a.km - b.km);
    if (pts.length < 2) return null;
    const v0 = Math.max(1, C.speed || 40), n = Math.max(1, Math.round(C.n || 1));
    const sizes = split(n, Math.max(1, Math.round(C.groups || 1))), G = sizes.length;
    const lens = sizes.map(k => (k - 1) * Math.max(0, C.gap || 0) + k * Math.max(0, C.vlen || 0));       /* longueur de chaque groupe (m) */
    const ggap = G > 1 ? Math.max(0, C.ggap || 0) : 0;                                                      /* minutes entre les têtes de deux groupes */
    /* temps relatifs de la tête du premier groupe (minutes depuis le départ) */
    const rows = []; let t = 0;
    pts.forEach((p, i) => {
      let leg = 0, v = v0;
      if (i) { v = Math.max(1, p.v || v0); leg = (p.km - pts[i - 1].km) / v * 60; t += leg; }
      const halt = i && i < pts.length - 1 ? Math.max(0, p.halt || 0) : 0;
      rows.push({ name: p.name, km: p.km, legKm: i ? p.km - pts[i - 1].km : 0, leg, v: i ? v : 0, arr: t, halt, dep: t + halt });
      t += halt;
    });
    const total = rows[rows.length - 1].arr;
    /* la queue passe un point après la tête : décalage des groupes + temps d'écoulement du dernier groupe à la vitesse du tronçon */
    const tailLag = r => (G - 1) * ggap + lens[G - 1] / 1000 / (r.v || rows[1].v) * 60;
    for (const r of rows) r.lag = tailLag(r);
    const last = rows[rows.length - 1];
    let t0 = hm(C.time); if (t0 == null) t0 = 480;
    const start = C.mode === 'arr' ? t0 - total : C.mode === 'arrAll' ? t0 - total - last.lag : t0;
    for (const r of rows) {
      r.head = start + r.arr; r.headDep = start + r.dep; r.tail = start + r.arr + r.lag; r.tailDep = start + r.dep + r.lag;
      r.groups = sizes.map((k, g) => { const lag = lens[g] / 1000 / (r.v || rows[1].v) * 60; return { head: start + r.arr + g * ggap, tail: start + r.arr + g * ggap + lag, headDep: start + r.dep + g * ggap }; });
    }
    const km = last.km - rows[0].km, halts = rows.reduce((a, r) => a + r.halt, 0), move = total - halts;
    const colLen = lens.reduce((a, b) => a + b, 0);
    return {
      rows, sizes, lens, start, total, move, halts, km,
      avg: move > 0 ? km / (move / 60) : 0,
      colLen,                                         /* mètres de route occupés par les véhicules (hors espace entre groupes) */
      flow: last.lag,                                 /* minutes entre le passage de la tête et celui de la queue */
      end: start + total + last.lag,                  /* tout le convoi arrivé */
      fuel: C.conso > 0 ? n * km * C.conso / 100 : 0
    };
  }

  /* ---------- lecture de tracés : GPX, KML, GeoJSON ---------- */
  function parseTrack(text) {
    const out = { line: [], wpts: [] };
    const t = text.trim();
    if (t[0] === '{') {
      const j = JSON.parse(t), feats = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : [{ geometry: j, properties: {} }];
      for (const f of feats) {
        const g = f && f.geometry; if (!g) continue;
        const nm = (f.properties && (f.properties.name || f.properties.n || f.properties.title)) || '';
        if (g.type === 'LineString') { if (g.coordinates.length > out.line.length) out.line = g.coordinates.map(c => [c[1], c[0]]); }
        else if (g.type === 'MultiLineString') { const all = [].concat(...g.coordinates).map(c => [c[1], c[0]]); if (all.length > out.line.length) out.line = all; }
        else if (g.type === 'Point') out.wpts.push({ ll: [g.coordinates[1], g.coordinates[0]], name: String(nm) });
      }
    } else {
      const doc = new DOMParser().parseFromString(t, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('xml');
      const num = (e, a) => parseFloat(e.getAttribute(a));
      let pts = [...doc.querySelectorAll('trkpt')]; if (!pts.length) pts = [...doc.querySelectorAll('rtept')];
      out.line = pts.map(e => [num(e, 'lat'), num(e, 'lon')]);
      for (const w of doc.querySelectorAll('wpt')) { const nm = w.querySelector('name'); out.wpts.push({ ll: [num(w, 'lat'), num(w, 'lon')], name: nm ? nm.textContent.trim() : '' }); }
      if (!out.line.length) {   /* KML */
        for (const ls of doc.querySelectorAll('LineString coordinates')) { const l = ls.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number)).filter(c => c.length >= 2).map(c => [c[1], c[0]]); if (l.length > out.line.length) out.line = l; }
        for (const pm of doc.querySelectorAll('Placemark')) { const c = pm.querySelector('Point coordinates'); if (!c) continue; const v = c.textContent.trim().split(',').map(Number), nm = pm.querySelector('name'); out.wpts.push({ ll: [v[1], v[0]], name: nm ? nm.textContent.trim() : '' }); }
      }
    }
    out.line = out.line.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
    out.wpts = out.wpts.filter(w => Number.isFinite(w.ll[0]) && Number.isFinite(w.ll[1]));
    if (out.line.length < 2) throw new Error('vide');
    return out;
  }
  function toGpx(name, line, pts) {
    const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Convoi" xmlns="http://www.topografix.com/GPX/1/1">\n${pts.filter(p => p.ll).map(p => `<wpt lat="${p.ll[0].toFixed(6)}" lon="${p.ll[1].toFixed(6)}"><name>${x(p.name)}</name></wpt>`).join('\n')}\n<trk><name>${x(name)}</name><trkseg>\n${line.map(p => `<trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"/>`).join('\n')}\n</trkseg></trk>\n</gpx>\n`;
  }
  return { compute, split, hm, fmt, dist, cumul, atDist, snap, parseTrack, toGpx };
})();
if (typeof module !== 'undefined') module.exports = ConvoiEngine;
