/* Convoi : tableau de marche d'un convoi (armée, pompiers, protection civile, événements).
   Tracé dessiné sur la carte ou importé (GPX, KML, GeoJSON), points de passage, haltes, groupes.
   Tout reste sur l'appareil ; seules les tuiles de carte viennent de geo.admin.ch. */
'use strict';
(() => {
const E = ConvoiEngine;
const C0 = { mode: 'dep', time: '08:00', speed: 40, n: 6, gap: 50, vlen: 8, groups: 1, ggap: 5, conso: 0 };
/* deux vocabulaires pour les mêmes calculs */
const VOC = {
  civ: { col: 'Convoi', grp: 'Groupe', grps: 'Groupes', a: 'Départ', b: 'Arrivée', pt: 'Point de passage', tab: 'Horaire', table: 'Horaire de passage', halt: 'Arrêt', haltsub: 'Pause, ravitaillement, regroupement' },
  mil: { col: 'Colonne', grp: 'Rame', grps: 'Rames', a: 'PI · départ', b: 'PF · arrivée', pt: 'Point de passage', tab: 'Tableau', table: 'Tableau de marche', halt: 'Halte', haltsub: 'Halte horaire, ravitaillement, regroupement' }
};
const store = makeStore('convoi.v1', { list: [], cur: '', tab: 'route', voc: 'civ' });
const D = store.data;
const V = () => VOC[D.voc] || VOC.civ;
const newConvoy = name => ({ id: uid(), name: name || 'Convoi', line: [], pts: [{ id: uid(), name: '', km: 0, halt: 0, v: 0, fix: 'a' }, { id: uid(), name: '', km: 0, halt: 0, v: 0, fix: 'b' }], C: Object.assign({}, C0) });
function fix(c) {
  if (!c || typeof c !== 'object') return null;
  const q = newConvoy(typeof c.name === 'string' ? c.name.slice(0, 60) : '');
  if (typeof c.id === 'string') q.id = c.id;
  q.line = (Array.isArray(c.line) ? c.line : []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, 6000).map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  const pts = (Array.isArray(c.pts) ? c.pts : []).filter(p => p && Number.isFinite(+p.km)).slice(0, 60).map(p => ({ id: typeof p.id === 'string' ? p.id : uid(), name: typeof p.name === 'string' ? p.name.slice(0, 40) : '', km: Math.max(0, +p.km), halt: clamp(Math.round(+p.halt) || 0, 0, 1440), v: clamp(Math.round(+p.v) || 0, 0, 130), fix: p.fix === 'a' || p.fix === 'b' ? p.fix : '' }));
  if (pts.filter(p => p.fix === 'a').length === 1 && pts.filter(p => p.fix === 'b').length === 1) q.pts = pts;
  const k = c.C || {};
  q.C = { mode: ['dep', 'arr', 'arrAll'].includes(k.mode) ? k.mode : 'dep', time: E.hm(k.time) != null ? k.time : '08:00', speed: clamp(Math.round(+k.speed) || 40, 5, 130), n: clamp(Math.round(+k.n) || 1, 1, 500), gap: clamp(Math.round(+k.gap) || 0, 0, 2000), vlen: clamp(+k.vlen || 0, 0, 40), groups: clamp(Math.round(+k.groups) || 1, 1, 30), ggap: clamp(Math.round(+k.ggap) || 0, 0, 120), conso: clamp(+k.conso || 0, 0, 200) };
  return q;
}
D.list = D.list.map(fix).filter(Boolean);
if (!D.list.length) D.list.push(newConvoy());
if (!D.list.some(c => c.id === D.cur)) D.cur = D.list[0].id;
const cur = () => D.list.find(c => c.id === D.cur);
const fKm = km => km.toFixed(km >= 100 ? 0 : 1).replace('.', ',');
const fDur = m => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad2(m % 60)}`; };
const fSec = m => { const s = Math.round(m * 60); return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${pad2(s % 60)}`; };
const ptName = p => p.name || (p.fix === 'a' ? V().a : p.fix === 'b' ? V().b : V().pt);
const sorted = c => c.pts.slice().sort((a, b) => (a.fix === 'a' ? -1 : b.fix === 'a' ? 1 : a.fix === 'b' ? 1 : b.fix === 'b' ? -1 : a.km - b.km));
/* le tracé commande les distances : départ au début, arrivée au bout, points intermédiaires bornés */
function sync(c) {
  const a = c.pts.find(p => p.fix === 'a'), b = c.pts.find(p => p.fix === 'b');
  a.km = 0;
  if (c.line.length >= 2) { const cum = E.cumul(c.line); b.km = cum[cum.length - 1] / 1000; }
  for (const p of c.pts) if (!p.fix) p.km = clamp(p.km, 0, b.km);
}
const result = c => { sync(c); const P = sorted(c).map(p => ({ name: ptName(p), km: p.km, halt: p.halt, v: p.v, id: p.id })); return P[P.length - 1].km > 0 ? E.compute(P, c.C) : null; };

/* ---------- ossature ---------- */
const app = $('#app'); app.classList.add('tabbed');
const titleEl = h('h1'), mainEl = h('div', { class: 'main' });
const head = h('header', { class: 'head' }, titleEl,
  h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Partager et exporter', html: icon('share'), onclick: openExport }),
  h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Convois et réglages', html: icon('list'), onclick: openList }));
const tabDefs = () => [['route', 'Trajet', 'route'], ['col', V().col, 'truck'], ['table', V().tab, 'clock']];
if (!['route', 'col', 'table'].includes(D.tab)) D.tab = 'route';
let tabsEl = tabsBar(tabDefs(), D.tab, setTab);
app.append(head, mainEl, tabsEl);
function setTab(k) { D.tab = k; store.save(); for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.k === k); render(); mainEl.scrollTop = 0; }
function render() {
  titleEl.textContent = cur().name;
  const keep = mainEl.scrollTop;
  if (D.tab !== 'route') mapBox.remove();
  mainEl.replaceChildren(...({ route: viewRoute, col: viewCol, table: viewTable }[D.tab])());
  mainEl.scrollTop = keep;
  if (D.tab === 'route') { ensureMap(); setTimeout(() => { map.invalidateSize(); drawMap(false); }, 0); }
}

/* ---------- carte ---------- */
const mapBox = h('div', { class: 'mapbox' }), mapEl = h('div', { class: 'map' });
let map = null, lineL = null, ptsL = null, mode = 'pts', fitted = '';
const modeSeg = h('div', { class: 'mapctl' });
mapBox.append(mapEl, modeSeg);
function ensureMap() {
  if (map) return;
  map = L.map(mapEl, { zoomControl: false, attributionControl: true, maxZoom: 18, minZoom: 6 }).setView([46.8, 8.23], 8);
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', { maxZoom: 18, attribution: '© swisstopo', referrerPolicy: 'no-referrer' }).addTo(map);
  lineL = L.polyline([], { color: '#0A5BD8', weight: 5, opacity: .9, lineJoin: 'round' }).addTo(map);
  ptsL = L.layerGroup().addTo(map);
  map.on('click', onMapClick);
}
function drawCtl() {
  const c = cur();
  modeSeg.replaceChildren(...[
    seg([['draw', 'Tracer'], ['pts', 'Points']], mode, v => { mode = v; drawCtl(); }),
    mode === 'draw' && c.line.length ? h('button', { type: 'button', class: 'mapbtn', 'aria-label': 'Retirer le dernier point du tracé', html: icon('undo'), onclick: () => { c.line.pop(); if (c.line.length < 2) for (const p of c.pts) if (!p.fix) p.km = 0; sync(c); store.save(); drawMap(false); renderList(); } }) : null,
    h("button", { type: "button", class: "mapbtn", "aria-label": "Importer un tracé", html: icon("import"), onclick: importTrack })].filter(Boolean));
  hintEl.textContent = mode === 'draw' ? (c.line.length ? 'Toucher la carte pour prolonger le tracé le long de la route.' : 'Toucher la carte au point de départ, puis le long de la route.') : (c.line.length >= 2 ? 'Toucher le tracé pour y poser un point de passage.' : 'Tracer ou importer d’abord un trajet. Sans carte : saisir les distances à la main ci-dessous.');
}
const hintEl = h('p', { class: 'note maphint' });
function drawMap(refit) {
  if (!map) return;
  const c = cur();
  lineL.setLatLngs(c.line);
  ptsL.clearLayers();
  if (c.line.length >= 2) {
    const cum = E.cumul(c.line);
    sorted(c).forEach((p, i, arr) => {
      const ll = E.atDist(c.line, cum, p.km * 1000), lab = p.fix === 'a' ? 'D' : p.fix === 'b' ? 'A' : String(i);
      L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="pin${p.fix ? ' end' : ''}">${lab}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), keyboard: false }).on('click', () => openPoint(p)).addTo(ptsL);
    });
  } else if (c.line.length === 1) L.circleMarker(c.line[0], { radius: 6, color: '#0A5BD8', fillOpacity: 1 }).addTo(ptsL);
  if ((refit || fitted !== c.id) && c.line.length >= 2) { map.fitBounds(L.latLngBounds(c.line).pad(0.15)); fitted = c.id; }
  else if (fitted !== c.id) { map.setView([46.8, 8.23], 8); fitted = c.id; }
  drawCtl();
}
function onMapClick(ev) {
  const c = cur(), ll = [+ev.latlng.lat.toFixed(6), +ev.latlng.lng.toFixed(6)];
  if (mode === 'draw') {
    if (c.line.length >= 6000) { toast('Tracé trop long'); return; }
    c.line.push(ll); sync(c); store.save(); drawMap(false); renderList();
    return;
  }
  if (c.line.length < 2) { toast('Tracer ou importer d’abord un trajet'); return; }
  const cum = E.cumul(c.line), s = E.snap(c.line, cum, ll);
  const px = map.latLngToContainerPoint(ev.latlng).distanceTo(map.latLngToContainerPoint(E.atDist(c.line, cum, s.d)));
  if (px > 36) { toast('Toucher le tracé bleu pour y poser un point'); return; }
  if (c.pts.length >= 60) { toast('60 points au plus'); return; }
  const p = { id: uid(), name: '', km: s.d / 1000, halt: 0, v: 0, fix: '' };
  c.pts.push(p); store.save(); drawMap(false); renderList(); openPoint(p, true);
}
async function importTrack() {
  const f = await pickFile('.gpx,.kml,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/geo+json');
  if (!f) return;
  let t;
  try { t = E.parseTrack(f.text); } catch (e) { toast('Tracé illisible : GPX, KML ou GeoJSON attendu'); return; }
  const c = cur();
  let line = t.line; const step = Math.ceil(line.length / 5000);
  if (step > 1) line = line.filter((_, i) => i % step === 0 || i === t.line.length - 1);
  c.line = line.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  c.pts = c.pts.filter(p => p.fix);
  const cum = E.cumul(c.line), tot = cum[cum.length - 1];
  for (const w of t.wpts.slice(0, 40)) { const s = E.snap(c.line, cum, w.ll); if (s.off < 150 && s.d > 50 && tot - s.d > 50) c.pts.push({ id: uid(), name: (w.name || '').slice(0, 40), km: s.d / 1000, halt: 0, v: 0, fix: '' }); }
  if (c.name === 'Convoi') c.name = f.name.replace(/\.[a-z]+$/i, '').slice(0, 60) || c.name;
  sync(c); store.save(); mode = 'pts'; render(); drawMap(true);
  toast(`Tracé importé : ${fKm(tot / 1000)} km${c.pts.length > 2 ? `, ${c.pts.length - 2} point${c.pts.length > 3 ? 's' : ''} de passage` : ''}`);
}

/* ---------- Trajet ---------- */
const listBox = h('div');
function viewRoute() { renderList(); return [mapBox, hintEl, listBox]; }
function renderList() {
  const c = cur(); sync(c);
  const hasLine = c.line.length >= 2, b = c.pts.find(p => p.fix === 'b'), out = [];
  out.push(h('div', { class: 'label' }, hasLine ? `Trajet · ${fKm(b.km)} km` : 'Trajet', h('button', { type: 'button', class: 'r', text: 'Ajouter un point', onclick: () => { if (c.pts.length >= 60) return; const p = { id: uid(), name: '', km: +(b.km / 2).toFixed(1), halt: 0, v: 0, fix: '' }; c.pts.push(p); store.save(); renderList(); drawMap(false); openPoint(p, true); } })));
  out.push(h('div', { class: 'list' }, ...sorted(c).map(p => h('button', { type: 'button', class: 'row', onclick: () => openPoint(p) },
    h('div', { class: 't' }, h('b', { text: ptName(p) }), h('small', { text: [`km ${fKm(p.km)}`, p.halt ? `${V().halt.toLowerCase()} ${p.halt} min` : '', p.v ? `${p.v} km/h pour y arriver` : ''].filter(Boolean).join(' · ') })), h('span', { class: 'chev', html: icon('chev') })))));
  if (!hasLine) out.push(h('p', { class: 'note', text: 'Sans tracé, la distance de l’arrivée et des points se saisit à la main (toucher un point). Un itinéraire calculé dans Calque ou une autre app s’importe en GPX, KML ou GeoJSON.' }));
  else out.push(h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn danger', text: 'Effacer le tracé', onclick: () => confirmSheet('Effacer le tracé ?', 'Le tracé et les points de passage sont retirés. Les réglages du convoi sont gardés.', 'Effacer', () => { c.line = []; c.pts = c.pts.filter(p => p.fix); c.pts.find(p => p.fix === 'b').km = 0; store.save(); render(); }, true) })));
  listBox.replaceChildren(...out);
}
function openPoint(p, fresh) {
  const c = cur(), hasLine = c.line.length >= 2, b = c.pts.find(x => x.fix === 'b'), body = [];
  const name = textField(p.name, v => { p.name = v.trim().slice(0, 40); store.save(); }, { ph: p.fix === 'a' ? 'Lieu de départ' : p.fix === 'b' ? 'Lieu d’arrivée' : 'Nom du point (carrefour, localité, pont…)', max: 40 });
  body.push(name);
  const kmEditable = p.fix === 'b' ? !hasLine : !p.fix;
  if (kmEditable) body.push(frow('Distance depuis le départ', hasLine && !p.fix ? `Le long du tracé, ${fKm(b.km)} km au plus` : null, numField(+p.km.toFixed(1), v => { p.km = hasLine ? clamp(v, 0, b.km) : v; if (p.fix === 'b') for (const x of c.pts) if (!x.fix) x.km = Math.min(x.km, v); store.save(); }, { dec: true, step: 0.1, max: 5000, label: 'Kilomètres depuis le départ' }), h('span', { class: 'unit', text: 'km' })));
  else body.push(frow('Distance depuis le départ', null, h('span', { class: 'unit', style: 'font-size:15px;color:var(--text)', text: `${fKm(p.km)} km` })));
  if (p.fix !== 'a') body.push(frow('Vitesse pour y arriver', '0 : vitesse du convoi', numField(p.v, v => { p.v = v; store.save(); }, { max: 130, label: 'Vitesse du tronçon' }), h('span', { class: 'unit', text: 'km/h' })));
  if (!p.fix) body.push(frow(V().halt, V().haltsub, numField(p.halt, v => { p.halt = v; store.save(); }, { max: 1440, label: 'Durée de l’arrêt en minutes' }), h('span', { class: 'unit', text: 'min' })),
    h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn danger wide', text: 'Retirer ce point', onclick: () => { const i = c.pts.indexOf(p); if (i >= 0) c.pts.splice(i, 1); closeSheet(); } })));
  openSheet(ptName(p), body, () => { store.save(); renderList(); drawMap(false); });
  if (fresh) setTimeout(() => name.focus(), 350);
}

/* ---------- Colonne ---------- */
function viewCol() {
  const c = cur(), K = c.C, v = V(), out = [];
  const sum = h('div', { class: 'card sum' });
  const upd = () => { store.save(); const sizes = E.split(K.n, K.groups), lens = sizes.map(k => (k - 1) * K.gap + k * K.vlen), tot = lens.reduce((a, x) => a + x, 0);
    sum.replaceChildren(h('div', { class: 'big', text: `${Math.round(tot)} m de route occupés` }),
      h('p', { class: 'note', style: 'margin:4px 0 0', text: `${K.n} véhicule${K.n > 1 ? 's' : ''}${sizes.length > 1 ? ` en ${sizes.length} ${v.grps.toLowerCase()} (${sizes.join(', ')})` : ''}. À ${K.speed} km/h, ${sizes.length > 1 ? `un ${v.grp.toLowerCase()}` : 'le convoi'} met ${fSec(lens[0] / 1000 / K.speed * 60)} à passer un point${sizes.length > 1 ? ` ; la queue passe ${fSec((sizes.length - 1) * K.ggap + lens[lens.length - 1] / 1000 / K.speed * 60)} après la tête` : ''}.` })); };
  out.push(h('div', { class: 'label', text: 'Horaire' }), h('div', { class: 'card' },
    seg([['dep', 'Départ à'], ['arr', 'Arrivée à'], ['arrAll', 'Tous arrivés à']], K.mode, x => { K.mode = x; upd(); }),
    frow('Heure', K.mode === 'dep' ? null : 'Le départ se calcule à rebours', h('input', { class: 'field time', type: 'time', value: K.time, 'aria-label': 'Heure', onchange: e => { if (E.hm(e.target.value) != null) { K.time = e.target.value; upd(); } } }))));
  const spd = numField(K.speed, x => { K.speed = clamp(x, 5, 130); upd(); render(); }, { min: 5, max: 130, label: 'Vitesse de marche' });
  out.push(h('div', { class: 'label', text: 'Vitesse de marche' }), h('div', { class: 'card' },
    h('div', { class: 'chips' }, ...[30, 40, 50, 60, 80].map(s => h('button', { type: 'button', class: 'chip' + (K.speed === s ? ' on' : ''), text: `${s} km/h`, onclick: () => { K.speed = s; upd(); render(); } }))),
    frow('Autre vitesse', 'Vitesse du véhicule le plus lent, tenue sur tout le trajet', spd, h('span', { class: 'unit', text: 'km/h' }))));
  out.push(h('div', { class: 'label', text: v.col }), h('div', { class: 'card' },
    h('div', { class: 'frow', style: 'margin-top:0' }, h('div', { class: 'flab' }, 'Véhicules'), numField(K.n, x => { K.n = clamp(x, 1, 500); upd(); }, { min: 1, max: 500, label: 'Nombre de véhicules' })),
    frow('Intervalle entre véhicules', null, numField(K.gap, x => { K.gap = x; upd(); }, { max: 2000, label: 'Intervalle en mètres' }), h('span', { class: 'unit', text: 'm' })),
    h('div', { class: 'chips', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'chip', text: `2 secondes : ${Math.round(K.speed / 1.8)} m`, onclick: () => { K.gap = Math.round(K.speed / 1.8); upd(); render(); } }), h('button', { type: 'button', class: 'chip', text: '50 m', onclick: () => { K.gap = 50; upd(); render(); } }), h('button', { type: 'button', class: 'chip', text: '100 m', onclick: () => { K.gap = 100; upd(); render(); } })),
    frow('Longueur d’un véhicule', 'Moyenne, remorque comprise', numField(K.vlen, x => { K.vlen = x; upd(); }, { dec: true, step: 0.5, max: 40, label: 'Longueur d’un véhicule' }), h('span', { class: 'unit', text: 'm' })),
    frow(v.grps, 'Le convoi roule en plusieurs paquets', numField(K.groups, x => { K.groups = clamp(x, 1, 30); upd(); render(); }, { min: 1, max: 30, label: 'Nombre de groupes' })),
    K.groups > 1 ? frow(`Écart entre ${v.grps.toLowerCase()}`, 'De tête à tête', numField(K.ggap, x => { K.ggap = x; upd(); }, { max: 120, label: 'Écart entre groupes en minutes' }), h('span', { class: 'unit', text: 'min' })) : null));
  out.push(sum);
  out.push(h('div', { class: 'label', text: 'Carburant' }), h('div', { class: 'card' },
    h('div', { class: 'frow', style: 'margin-top:0' }, h('div', { class: 'flab' }, 'Consommation moyenne', h('small', { text: 'Par véhicule ; 0 : pas de calcul' })), numField(K.conso, x => { K.conso = x; upd(); }, { dec: true, step: 0.5, max: 200, label: 'Litres aux 100 km' }), h('span', { class: 'unit', text: 'l/100' }))));
  out.push(h('p', { class: 'note', text: 'Repères du règlement 61.009 (conducteur de véhicules à moteur) : au moins deux secondes d’écart en colonne, et au moins 50 m entre véhicules militaires hors des localités. Les prescriptions de l’organisation et la législation routière font foi.' }));
  upd();
  return out;
}

/* ---------- Tableau ---------- */
function viewTable() {
  const c = cur(), r = result(c), v = V(), out = [];
  if (!r) { out.push(h('div', { class: 'empty' }, h('b', { text: 'Pas encore de trajet' }), 'Tracer ou importer un trajet, ou saisir la distance de l’arrivée à la main.', h('div', { class: 'acts', style: 'justify-content:center' }, h('button', { type: 'button', class: 'btn', text: 'Ouvrir le trajet', onclick: () => setTab('route') })))); return out; }
  const last = r.rows[r.rows.length - 1];
  out.push(h('div', { class: 'card' }, h('div', { class: 'big', text: `${fKm(r.km)} km · ${fDur(r.total)}` }),
    h('p', { class: 'note', style: 'margin:4px 0 0', text: `Départ ${E.fmt(r.start)}, arrivée de la tête ${E.fmt(last.head)}, tous arrivés ${E.fmt(r.end)}.${r.halts ? ` Dont ${fDur(r.halts)} d’arrêt.` : ''} Moyenne en mouvement ${Math.round(r.avg)} km/h.${r.fuel ? ` Carburant : environ ${Math.round(r.fuel)} l pour ${c.C.n} véhicule${c.C.n > 1 ? 's' : ''}.` : ''}` })));
  out.push(h('div', { class: 'label', text: `${v.table} · ${c.C.n} véhicule${c.C.n > 1 ? 's' : ''} à ${c.C.gap} m` }));
  const tbl = h('div', { class: 'list mt' }, h('div', { class: 'mtr head' }, h('span', { text: 'Point' }), h('span', { text: 'km' }), h('span', { text: 'Tête' }), h('span', { text: 'Queue' })));
  for (const x of r.rows) {
    tbl.append(h('div', { class: 'mtr' }, h('b', { text: x.name }), h('span', { text: fKm(x.km) }), h('span', { text: E.fmt(x.head) }), h('span', { text: E.fmt(x.tail) })));
    if (x.halt) tbl.append(h('div', { class: 'mtr sub' }, h('span', { text: `${v.halt} ${x.halt} min, départ` }), h('span'), h('span', { text: E.fmt(x.headDep) }), h('span', { text: E.fmt(x.tailDep) })));
  }
  out.push(tbl);
  if (r.sizes.length > 1) {
    out.push(h('div', { class: 'label', text: `Par ${v.grp.toLowerCase()} · passage de la tête` }));
    const g = h('div', { class: 'list mt gt', style: `--g:${r.sizes.length}` }, h('div', { class: 'mtr head' }, h('span', { text: 'Point' }), ...r.sizes.map((k, i) => h('span', { text: `${v.grp[0]}${i + 1} (${k})` }))));
    for (const x of r.rows) g.append(h('div', { class: 'mtr' }, h('b', { text: x.name }), ...x.groups.map(y => h('span', { text: E.fmt(x.halt ? y.headDep : y.head).slice(0, 5) }))));
    out.push(h('div', { class: 'xscroll' }, g));
    if (r.rows.some(x => x.halt)) out.push(h('p', { class: 'note', text: `Aux points d’arrêt, l’heure indiquée est celle du départ.` }));
  }
  out.push(h('div', { class: 'acts' },
    h('button', { type: 'button', class: 'btn sec', html: icon('copy') + '<span>Copier</span>', onclick: () => copyText(asText(c, r), 'Tableau copié') }),
    h('button', { type: 'button', class: 'btn sec', html: icon('print') + '<span>PDF</span>', onclick: () => doPrint(c, r) }),
    h('button', { type: 'button', class: 'btn sec', html: icon('share') + '<span>QR</span>', onclick: () => shareSheet('Partager le convoi', 'convoi', pack(c, false), slug(c) + '.json', pack(c, true)) })));
  out.push(h('p', { class: 'note', text: 'Heures calculées à vitesse constante. Elles ne tiennent compte ni du trafic, ni du relief, ni des traversées de localités : à confirmer par une reconnaissance.' }));
  return out;
}
const slug = c => c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'convoi';
/* dans un QR : le tableau sans le tracé (trop lourd) ; dans un fichier : tout */
const pack = (c, full) => ({ name: c.name, pts: sorted(c).map(p => ({ name: p.name, km: +p.km.toFixed(2), halt: p.halt, v: p.v, fix: p.fix })), C: c.C, line: full ? c.line : [] });
function asText(c, r) {
  const v = V(), L = [`${v.table} : ${c.name}`, `${fKm(r.km)} km, ${fDur(r.total)}, ${c.C.n} véhicules à ${c.C.gap} m, ${c.C.speed} km/h`, '', 'Point\tkm\tTête\tQueue'];
  for (const x of r.rows) { L.push(`${x.name}\t${fKm(x.km)}\t${E.fmt(x.head)}\t${E.fmt(x.tail)}`); if (x.halt) L.push(`  ${v.halt} ${x.halt} min, départ\t\t${E.fmt(x.headDep)}\t${E.fmt(x.tailDep)}`); }
  return L.join('\n');
}
function doPrint(c, r) {
  const v = V(), K = c.C, last = r.rows[r.rows.length - 1];
  const nodes = [h('h1', { text: `${v.table} · ${c.name}` }), h('div', { class: 'meta', text: `${fKm(r.km)} km · ${fDur(r.total)} · ${K.n} véhicule${K.n > 1 ? 's' : ''} à ${K.gap} m · ${K.speed} km/h · départ ${E.fmt(r.start)} · tous arrivés ${E.fmt(r.end)}` })];
  const tb = h('tbody');
  for (const x of r.rows) { tb.append(h('tr', null, h('td', { text: x.name }), h('td', { text: fKm(x.km) }), h('td', { text: x.v ? `${x.v} km/h` : '' }), h('td', { text: E.fmt(x.head) }), h('td', { text: E.fmt(x.tail) }), h('td', { text: x.halt ? `${v.halt} ${x.halt} min, départ ${E.fmt(x.headDep)}` : '' }))); }
  nodes.push(h('table', null, h('thead', null, h('tr', null, ...['Point', 'km', 'Vitesse', 'Tête', 'Queue', 'Remarques'].map(t => h('th', { text: t })))), tb));
  if (r.sizes.length > 1) nodes.push(h('h2', { text: `Par ${v.grp.toLowerCase()}` }), h('table', null, h('thead', null, h('tr', null, h('th', { text: 'Point' }), ...r.sizes.map((k, i) => h('th', { text: `${v.grp} ${i + 1} (${k} véh.)` })))),
    h('tbody', null, ...r.rows.map(x => h('tr', null, h('td', { text: x.name }), ...x.groups.map(y => h('td', { text: `${E.fmt(y.head)} à ${E.fmt(y.tail)}` })))))));
  nodes.push(h('p', { style: 'margin-top:8pt', text: `Longueur du convoi : ${Math.round(r.colLen)} m. Durée d’écoulement : ${fSec(r.flow)}.${r.fuel ? ` Carburant : environ ${Math.round(r.fuel)} l.` : ''}` }),
    h('div', { class: 'foot', text: 'Établi avec Convoi. Heures à vitesse constante, sans trafic ni relief : à confirmer par une reconnaissance.' }));
  printDoc(nodes);
}
function openExport() {
  const c = cur(), r = result(c);
  if (!r) { toast('Pas encore de trajet'); return; }
  const rows = [actRow('print', 'Imprimer ou enregistrer en PDF', V().table, () => { closeSheet(true); doPrint(c, r); }),
    actRow('copy', 'Copier en texte', 'Pour une messagerie ou un tableur', () => { closeSheet(); copyText(asText(c, r), 'Tableau copié'); }),
    actRow('share', 'QR ou lien', 'Pour ouvrir ce convoi dans Convoi sur un autre téléphone', () => shareSheet('Partager le convoi', 'convoi', pack(c, false), slug(c) + '.json', pack(c, true)))];
  if (c.line.length >= 2) { const cum = E.cumul(c.line); rows.push(actRow('route', 'Tracé en GPX', 'Pour un GPS ou une autre app de navigation', () => { closeSheet(); saveFile(slug(c) + '.gpx', E.toGpx(c.name, c.line, sorted(c).map(p => ({ name: ptName(p), ll: E.atDist(c.line, cum, p.km * 1000) }))), 'application/gpx+xml'); })); }
  openSheet('Partager et exporter', [h('div', { class: 'list' }, ...rows), h('p', { class: 'note', text: 'Le QR contient les points et les réglages, sans le tracé. Le fichier contient tout.' })]);
}
const actRow = (i, t, s, fn) => h('button', { type: 'button', class: 'row', onclick: fn }, h('span', { class: 'ic', html: icon(i) }), h('div', { class: 't' }, h('b', { text: t }), h('small', { text: s })), h('span', { class: 'chev', html: icon('chev') }));
function importConvoy(d) {
  const q = fix(Object.assign({}, d, { id: uid() }));
  if (!q) { toast('Convoi illisible'); return; }
  confirmSheet('Convoi reçu', `« ${q.name} » : ${q.pts.length} points, ${q.C.n} véhicule${q.C.n > 1 ? 's' : ''}. L’ajouter aux convois de cet appareil ?`, 'Ajouter', () => { D.list.unshift(q); D.cur = q.id; store.save(); setTab(q.line.length >= 2 ? 'route' : 'table'); });
}
function openList() {
  const c = cur(), body = [];
  body.push(textField(c.name, v => { c.name = v.trim().slice(0, 60) || 'Convoi'; titleEl.textContent = c.name; store.save(); }, { ph: 'Nom du convoi', max: 60 }));
  body.push(h('div', { class: 'label', text: 'Convois sur cet appareil' }), h('div', { class: 'list' }, ...D.list.map(q => { const b = q.pts.find(p => p.fix === 'b'); return h('button', { type: 'button', class: 'row', onclick: () => { D.cur = q.id; store.save(); closeSheet(); render(); } },
    h('div', { class: 't' }, h('b', { text: q.name }), h('small', { text: `${fKm(b.km)} km · ${q.C.n} véhicule${q.C.n > 1 ? 's' : ''}` })), q.id === D.cur ? h('span', { class: 'chev', style: 'color:var(--blue);opacity:1', html: icon('check') }) : null); })));
  body.push(h('div', { class: 'acts' },
    h('button', { type: 'button', class: 'btn sec', html: icon('plus') + '<span>Nouveau</span>', onclick: () => { const q = newConvoy(); q.C = Object.assign({}, c.C); D.list.unshift(q); D.cur = q.id; store.save(); closeSheet(); setTab('route'); } }),
    h('button', { type: 'button', class: 'btn sec', html: icon('import') + '<span>Ouvrir un fichier</span>', onclick: async () => { const f = await pickFile('.json,application/json'); if (!f) return; const d = readFileData('convoi', f.text); closeSheet(); if (d) importConvoy(d); else toast('Ce fichier n’est pas un convoi'); } })));
  body.push(h('div', { class: 'label', text: 'Vocabulaire' }), seg([['civ', 'Courant'], ['mil', 'Militaire']], D.voc, v => { D.voc = v; store.save(); const n = tabsBar(tabDefs(), D.tab, setTab); tabsEl.replaceWith(n); tabsEl = n; render(); }),
    h('p', { class: 'note', text: 'Les calculs sont les mêmes ; seuls les mots changent (groupe ou rame, arrêt ou halte).' }));
  body.push(h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn danger wide', text: 'Supprimer ce convoi', onclick: () => confirmSheet('Supprimer ce convoi ?', `« ${c.name} » sera effacé de cet appareil.`, 'Supprimer', () => { D.list.splice(D.list.indexOf(c), 1); if (!D.list.length) D.list.push(newConvoy()); D.cur = D.list[0].id; store.save(); render(); }, true) })));
  body.push(h('p', { class: 'note', text: 'Les convois restent sur cet appareil. Seules les tuiles de la carte sont chargées depuis geo.admin.ch (swisstopo).' }));
  openSheet('Convois et réglages', body);
}

render(); bootSW();
readIncoming('convoi', importConvoy);
})();
