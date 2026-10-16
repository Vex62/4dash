/* ==========================================================================
   Aplicación: estado, render del lienzo, editor, paneles y persistencia.
   ========================================================================== */

const STORAGE_KEY = '4dash.project.v1';
const PREFS_KEY = '4dash.prefs.v1';
const GRID = 8;

const App = {
  p: null, view: 'editor', sel: null, armed: null, hist: [], fut: [], zoom: 'fit', scale: 1,
  clipboard: null, propsTab: 'data', prefs: { theme: null, tutorialSeen: false, autosave: true, leftCollapsed: false, rightCollapsed: false },
  lastSave: null, saveError: null, typingSnap: null
};

/* ---------- Preferencias y almacenamiento local ---------- */
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = safeJsonParse(raw);
      App.prefs.theme = oneOf(p.theme, ['light', 'dark'], null);
      App.prefs.tutorialSeen = bool(p.tutorialSeen, false);
      App.prefs.autosave = bool(p.autosave, true);
      App.prefs.leftCollapsed = bool(p.leftCollapsed, false);
      App.prefs.rightCollapsed = bool(p.rightCollapsed, false);
    }
  } catch { /* almacenamiento no disponible */ }
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(App.prefs)); } catch { /* ignorar */ } }
function newProject() {
  const pg = { id: uid(), name: 'Página 1', size: '16:9', w: 1280, h: 720, widgets: [] };
  return { format: '4dash', v: 1, title: 'Dashboard sin título', logo: null, datasets: [], pages: [pg], filters: [], active: pg.id, snap: true, created: new Date().toISOString() };
}
const saveNow = () => {
  if (!App.prefs.autosave) { App.saveError = null; renderSaveState(); return; }
  try {
    const json = JSON.stringify(App.p, jsonReplacer);
    if (json.length > 4.5 * 1024 * 1024) throw new Error('quota');
    localStorage.setItem(STORAGE_KEY, json);
    App.lastSave = new Date();
    App.saveError = null;
  } catch {
    App.saveError = 'Datos demasiado grandes para el autoguardado: usa «Guardar» para descargar el proyecto.';
  }
  renderSaveState();
};
const scheduleSave = debounce(saveNow, 700);
function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeProject(safeJsonParse(raw));
  } catch { return null; }
}

/* ---------- Accesos ---------- */
const page = () => App.p.pages.find(p => p.id === App.p.active) || App.p.pages[0];
const dsById = id => App.p.datasets.find(d => d.id === id) || null;
const selW = () => (App.sel ? page().widgets.find(w => w.id === App.sel) || null : null);
function autoTitle(w) {
  if (w.title) return w.title;
  const ds = dsById(w.ds);
  const def = VIZ[w.type];
  if (w.type === 'text' || w.type === 'image') return def.label;
  if (!ds) return def.label;
  if (w.type === 'slicer') return w.cat || 'Segmentación';
  if (w.type === 'table') return w.cat ? `${w.cat}: resumen` : ds.name;
  if (w.type === 'scatter') return w.vals.length >= 2 ? `${w.vals[1]} frente a ${w.vals[0]}` : def.label;
  const m = w.split ? measureName(ds, w, w.vals[0]) : (w.vals.length > 1 ? w.vals.join(', ') : measureName(ds, w, w.vals[0] || null));
  if (w.type === 'kpi' || w.type === 'gauge') return w.vals[0] ? measureName(ds, w, w.vals[0]) : 'Recuento de filas';
  return w.cat ? `${m} por ${w.cat}${w.split ? ' y ' + w.split : ''}` : m;
}

/* ---------- Historial (deshacer / rehacer) ---------- */
function snapshot() { return JSON.stringify({ pages: App.p.pages, title: App.p.title, active: App.p.active }, jsonReplacer); }
function pushHistory(snap) {
  App.hist.push(snap);
  if (App.hist.length > 80) App.hist.shift();
  App.fut = [];
}
function mutate(fn, opts = {}) {
  const snap = opts.snap || snapshot();
  fn();
  pushHistory(snap);
  afterChange(opts);
}
/** Para edición continua (teclear): un único paso de historial por ráfaga. */
const endTyping = debounce(() => { App.typingSnap = null; }, 900);
function mutateTyping(fn, opts = {}) {
  if (!App.typingSnap) { App.typingSnap = snapshot(); pushHistory(App.typingSnap); }
  fn();
  endTyping();
  afterChange(Object.assign({ keepProps: true }, opts));
}
function restore(json) {
  const o = safeJsonParse(json);
  App.p.pages = o.pages.map(sanitizePage).filter(Boolean);
  App.p.title = str(o.title, 120, App.p.title);
  App.p.active = App.p.pages.some(p => p.id === o.active) ? o.active : App.p.pages[0].id;
  if (!selW()) App.sel = null;
  afterChange({});
}
function undo() { if (!App.hist.length) return; App.fut.push(snapshot()); restore(App.hist.pop()); }
function redo() { if (!App.fut.length) return; App.hist.push(snapshot()); restore(App.fut.pop()); }
function afterChange(opts) {
  scheduleSave();
  if (opts.only === 'widget' && opts.w) { rerenderWidget(opts.w); renderRibbon(); if (!opts.keepProps) renderRight(); return; }
  renderCanvas();
  renderRibbon();
  renderPages();
  renderStatus();
  renderFilterBar();
  if (!opts.keepProps) renderRight();
  renderLeft();
  $('#docTitle').value = App.p.title;
}

/* ---------- Filtros ---------- */
function getFilter(dsId, field) { return App.p.filters.find(f => f.ds === dsId && f.field === field) || null; }
function setFilter(dsId, field, grain, values) {
  App.p.filters = App.p.filters.filter(f => !(f.ds === dsId && f.field === field));
  if (values.length) App.p.filters.push({ ds: dsId, field, grain: grain || null, values: Array.from(new Set(values)) });
  scheduleSave();
  refreshData();
}
function pickFilter(dsId, field, keys, grain, add) {
  const cur = getFilter(dsId, field);
  let vals = cur ? cur.values.slice() : [];
  if (add) {
    for (const k of keys) { const i = vals.indexOf(k); if (i >= 0) vals.splice(i, 1); else vals.push(k); }
  } else {
    const same = vals.length === keys.length && keys.every(k => vals.includes(k));
    vals = same ? [] : keys.slice();
  }
  setFilter(dsId, field, grain, vals);
}
function clearFilters() { App.p.filters = []; scheduleSave(); refreshData(); }
function refreshData() { renderCanvas(); renderFilterBar(); renderStatus(); if (!App.sel) renderRight(); }

/* ---------- Render: barra superior ---------- */
function renderTopbar() {
  const brand = clear($('#brand'));
  brand.append(brandMark(22), h('span', null, h('b', { text: '4' }), 'Dash'));
  $('#docTitle').value = App.p.title;
  const vs = clear($('#viewSwitch'));
  for (const [id, label, ic] of [['editor', 'Editor', 'edit'], ['presenter', 'Presentador', 'monitor']]) {
    const b = h('button', { type: 'button', 'aria-pressed': App.view === id ? 'true' : 'false', title: id === 'editor' ? 'Vista Editor' : 'Vista Presentador (F5)' }, icon(ic, 15), label);
    b.addEventListener('click', () => setView(id));
    vs.appendChild(b);
  }
  renderLogo();
  const tb = clear($('#themeBtn'));
  tb.appendChild(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 18));
  renderPresNav();
}
function renderLogo() {
  const wrap = clear($('#logoWrap'));
  wrap.classList.toggle('hidden', App.view === 'presenter' && !App.p.logo);
  const btn = h('button', { class: 'logo-slot' + (App.p.logo ? ' has-logo' : ''), type: 'button',
    title: App.view === 'editor' ? 'Subir logo de la empresa o cliente (PNG, JPG, WEBP)' : (App.p.logo ? 'Logo' : 'Logo del cliente'),
    'aria-label': App.p.logo ? 'Cambiar logo' : 'Subir logo de la empresa o cliente' });
  if (App.p.logo) btn.appendChild(h('img', { src: App.p.logo, alt: 'Logo' }));
  else btn.append(icon('image', 16), h('span', { text: 'Logo del cliente' }));
  btn.addEventListener('click', () => { if (App.view === 'editor') pickImage(url => mutate(() => { App.p.logo = url; }), 600); });
  wrap.appendChild(btn);
  if (App.p.logo) {
    const rm = h('button', { class: 'logo-remove', type: 'button', title: 'Quitar logo', 'aria-label': 'Quitar logo' }, icon('close', 12));
    rm.addEventListener('click', e => { e.stopPropagation(); mutate(() => { App.p.logo = null; }); renderLogo(); });
    wrap.appendChild(rm);
  }
}
let imageCallback = null;
function pickImage(cb, maxDim) {
  imageCallback = { cb, maxDim };
  const inp = $('#imageInput');
  inp.value = '';
  inp.click();
}
function renderPresNav() {
  const nav = clear($('#presNav'));
  const pages = App.p.pages;
  const idx = pages.findIndex(p => p.id === App.p.active);
  const prev = h('button', { class: 'top-btn', type: 'button', title: 'Página anterior (←)', 'aria-label': 'Página anterior', disabled: idx <= 0 }, icon('chevL', 18));
  const next = h('button', { class: 'top-btn', type: 'button', title: 'Página siguiente (→)', 'aria-label': 'Página siguiente', disabled: idx >= pages.length - 1 }, icon('chevR', 18));
  prev.addEventListener('click', () => gotoPage(idx - 1));
  next.addEventListener('click', () => gotoPage(idx + 1));
  const fs = h('button', { class: 'top-btn', type: 'button', title: 'Pantalla completa (F)', 'aria-label': 'Pantalla completa' }, icon('fullscreen', 18));
  fs.addEventListener('click', toggleFullscreen);
  nav.append(prev, h('span', { class: 'save-state', text: `${idx + 1} / ${pages.length}` }), next, fs);
}
function renderSaveState() {
  const el = $('#saveState');
  if (!el) return;
  if (!App.prefs.autosave) el.textContent = 'Autoguardado desactivado';
  else if (App.saveError) el.textContent = '⚠ ' + App.saveError;
  else if (App.lastSave) el.textContent = 'Guardado en este navegador · ' + App.lastSave.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  else el.textContent = '';
  el.title = el.textContent;
}

/* ---------- Render: cinta (ribbon) ---------- */
function rbtn(ic, label, onClick, opts = {}) {
  const b = h('button', { class: 'rbtn', type: 'button', title: opts.title || label, disabled: !!opts.disabled, 'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed) }, icon(ic, 22), h('span', { text: label }));
  b.addEventListener('click', onClick);
  return b;
}
function rsm(ic, label, onClick, opts = {}) {
  const b = h('button', { class: 'rbtn-sm', type: 'button', title: opts.title || label, disabled: !!opts.disabled, 'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed) }, icon(ic, 15), h('span', { text: label }));
  b.addEventListener('click', onClick);
  return b;
}
function rgroup(label, ...items) {
  return h('div', { class: 'rgroup', role: 'group', 'aria-label': label }, h('div', { class: 'rgroup-items' }, items), h('div', { class: 'rgroup-label', text: label }));
}
function renderRibbon() {
  const r = clear($('#ribbon'));
  const w = selW();
  const hasData = App.p.datasets.length > 0;
  const zoomSel = h('select', { class: 'sel zoom-select', 'aria-label': 'Zoom', title: 'Zoom del lienzo' });
  for (const [v, l] of [['fit', 'Ajustar página'], ['width', 'Ajustar ancho'], ['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %'], ['1.25', '125 %'], ['1.5', '150 %']]) {
    zoomSel.appendChild(h('option', { value: v, selected: String(App.zoom) === v, text: l }));
  }
  zoomSel.addEventListener('change', () => { App.zoom = zoomSel.value; applyZoom(); renderStatus(); });
  r.append(
    rgroup('Datos',
      rbtn('upload', 'Importar Excel', () => openFile(), { title: 'Importar un archivo .xlsx, .xlsm o .csv' }),
      rbtn('sparkles', 'Datos de ejemplo', loadSample),
      rbtn('table', 'Ver / editar datos', () => openDataEditor(), { disabled: !hasData })),
    rgroup('Insertar',
      rbtn('plus', 'Nuevo visual', e => openMenu(e.currentTarget, Object.keys(VIZ).map(t => ({ label: VIZ[t].label, icon: VIZ[t].icon, onClick: () => insertWidget(t) })))),
      h('div', { class: 'rstack' },
        rsm('text', 'Cuadro de texto', () => insertWidget('text')),
        rsm('image', 'Imagen', () => insertWidget('image')),
        rsm('slicer', 'Segmentación', () => insertWidget('slicer'), { disabled: !hasData })),
      rbtn('page', 'Nueva página', addPage)),
    rgroup('Diseño',
      rbtn('wand', 'Generar automático', () => autoLayoutCurrent(), { disabled: !hasData, title: 'Genera un dashboard automático para esta página a partir de un origen de datos' })),
    rgroup('Organizar',
      h('div', { class: 'rstack' },
        rsm('copy', 'Duplicar', duplicateSelected, { disabled: !w }),
        rsm('front', 'Traer al frente', () => reorder(1), { disabled: !w }),
        rsm('back', 'Enviar atrás', () => reorder(-1), { disabled: !w })),
      h('div', { class: 'rstack' },
        rsm('trash', 'Eliminar', deleteSelected, { disabled: !w }),
        rsm('grid', 'Ajustar a cuadrícula', () => { App.p.snap = !App.p.snap; scheduleSave(); renderRibbon(); renderCanvas(); }, { pressed: App.p.snap }),
        rsm('fit', 'Alinear a cuadrícula', alignAllToGrid, { disabled: !page().widgets.length }))),
    rgroup('Vista',
      h('div', { class: 'rstack' },
        rsm('panelL', 'Panel izquierdo', () => togglePane('left'), { pressed: !App.prefs.leftCollapsed }),
        rsm('panelR', 'Panel derecho', () => togglePane('right'), { pressed: !App.prefs.rightCollapsed }),
        zoomSel)),
    rgroup('Edición',
      rbtn('undo', 'Deshacer', undo, { disabled: !App.hist.length, title: 'Deshacer (Ctrl+Z)' }),
      rbtn('redo', 'Rehacer', redo, { disabled: !App.fut.length, title: 'Rehacer (Ctrl+Y)' })),
    rgroup('Archivo',
      h('div', { class: 'rstack' },
        rsm('file', 'Nuevo', newProjectFlow),
        rsm('open', 'Abrir proyecto', () => { $('#projectInput').value = ''; $('#projectInput').click(); }),
        rsm('save', 'Guardar proyecto', saveProjectFile)),
      rbtn('print', 'Imprimir / PDF', printDashboard, { title: 'Imprimir o guardar como PDF todas las páginas' }))
  );
}

/* ---------- Render: panel izquierdo ---------- */
function togglePane(which) {
  if (which === 'left') App.prefs.leftCollapsed = !App.prefs.leftCollapsed; else App.prefs.rightCollapsed = !App.prefs.rightCollapsed;
  savePrefs();
  renderLeft(); renderRight(); renderRibbon();
  requestAnimationFrame(applyZoom);
}
function paneHead(title, which) {
  const collapsed = which === 'left' ? App.prefs.leftCollapsed : App.prefs.rightCollapsed;
  const b = h('button', { class: 'icon-btn', type: 'button', title: collapsed ? 'Expandir panel' : 'Contraer panel', 'aria-label': collapsed ? 'Expandir panel' : 'Contraer panel', 'aria-expanded': String(!collapsed) },
    icon(which === 'left' ? (collapsed ? 'chevR' : 'chevL') : (collapsed ? 'chevL' : 'chevR'), 16));
  b.addEventListener('click', () => togglePane(which));
  return h('div', { class: 'pane-head' }, which === 'right' ? b : null, h('span', { class: 'pane-title', text: title }), which === 'left' ? b : null);
}
let fieldsDsId = null;
function renderLeft() {
  const pane = clear($('#leftPane'));
  pane.classList.toggle('collapsed', App.prefs.leftCollapsed);
  pane.appendChild(paneHead('Visualizaciones', 'left'));
  const body = h('div', { class: 'pane-body' });
  pane.appendChild(body);
  const w = selW();
  const grid = h('div', { class: 'viz-grid' });
  for (const t of Object.keys(VIZ)) {
    const b = h('button', { class: 'viz-btn', type: 'button', title: VIZ[t].label, 'aria-label': VIZ[t].label, draggable: 'true', 'aria-pressed': w && w.type === t ? 'true' : 'false' }, icon(VIZ[t].icon, 20));
    b.addEventListener('click', () => {
      const cur = selW();
      if (cur && !['text', 'image'].includes(cur.type) && !['text', 'image'].includes(t)) changeType(cur, t);
      else insertWidget(t);
    });
    b.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-4dash-viz', t); e.dataTransfer.effectAllowed = 'copy'; });
    grid.appendChild(b);
  }
  body.appendChild(grid);
  body.appendChild(h('p', { class: 'hint', text: w ? 'Haz clic en un tipo para cambiar el visual seleccionado.' : 'Haz clic o arrastra un tipo al lienzo para insertarlo.' }));

  const dss = App.p.datasets;
  body.appendChild(h('div', { class: 'section-title' }, h('span', { text: 'Datos' })));
  if (!dss.length) {
    body.appendChild(h('p', { class: 'hint', text: 'Aún no hay datos. Importa un Excel o prueba los datos de ejemplo.' }));
    const b = h('button', { class: 'btn block', type: 'button' }, icon('upload', 16), 'Importar Excel');
    b.addEventListener('click', () => openFile());
    body.appendChild(b);
    return;
  }
  if (w && w.ds && dsById(w.ds)) fieldsDsId = w.ds;
  if (!dsById(fieldsDsId)) fieldsDsId = dss[0].id;
  if (dss.length > 1) {
    const sel = h('select', { class: 'sel', 'aria-label': 'Origen de datos' });
    for (const d of dss) sel.appendChild(h('option', { value: d.id, selected: d.id === fieldsDsId, text: d.name }));
    sel.addEventListener('change', () => { fieldsDsId = sel.value; renderLeft(); });
    body.appendChild(h('div', { class: 'form-row' }, sel));
  }
  const ds = dsById(fieldsDsId);
  const used = new Set(w && w.ds === ds.id ? [w.cat, w.split, ...w.vals] : []);
  const list = h('ul', { class: 'field-list', 'aria-label': 'Campos de ' + ds.name });
  for (const c of ds.columns) {
    const li = h('li', { class: 'field' + (used.has(c.name) ? ' used' : ''), draggable: 'true', tabindex: 0, title: `${c.name} (${typeLabel(c)}) — arrastra a un visual o al lienzo` },
      icon(c.type === 'number' ? 'hash' : c.type === 'date' ? 'calendar' : 'abc', 15),
      h('span', { class: 'fname', text: c.name }), h('span', { class: 'ftype', text: typeLabel(c) }));
    li.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-4dash-field', JSON.stringify({ ds: ds.id, col: c.name })); e.dataTransfer.effectAllowed = 'copy'; });
    const act = () => { const cur = selW(); if (cur) dropFieldOnWidget(cur, ds.id, c.name); else createFromField(ds.id, c.name, null); };
    li.addEventListener('click', act);
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    list.appendChild(li);
  }
  body.appendChild(list);
  body.appendChild(h('p', { class: 'hint', text: `${fmtNum(ds.rows.length)} filas · ${ds.columns.length} columnas. Clic en un campo para añadirlo al visual seleccionado.` }));
  const b = h('button', { class: 'btn block', type: 'button' }, icon('table', 16), 'Ver / editar datos');
  b.addEventListener('click', () => openDataEditor(ds.id));
  body.appendChild(b);
}
const typeLabel = c => (c.type === 'number' ? (c.role === 'id' ? 'ID' : c.role === 'year' ? 'año' : 'número') : c.type === 'date' ? 'fecha' : 'texto');

/* ---------- Render: panel derecho (propiedades) ---------- */
function formRow(label, control, opts = {}) {
  const id = 'f' + uid();
  if (control && control.tagName && /INPUT|SELECT|TEXTAREA/.test(control.tagName)) control.id = id;
  const row = h('div', { class: 'form-row' }, label ? h('label', { htmlFor: id, text: label }) : null, control);
  if (opts.drop) makeDropTarget(row, opts.drop);
  return row;
}
function selectEl(options, value, onChange, opts = {}) {
  const sel = h('select', { class: 'sel', 'aria-label': opts.label || null });
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    sel.appendChild(h('option', { value: v == null ? '' : v, selected: (value == null ? '' : String(value)) === (v == null ? '' : String(v)), text: l }));
  }
  sel.addEventListener('change', () => onChange(sel.value === '' ? null : sel.value));
  return sel;
}
function checkEl(label, value, onChange) {
  const inp = h('input', { type: 'checkbox', checked: !!value });
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'check' }, inp, h('span', { text: label }));
}
function inputEl(value, onInput, opts = {}) {
  const inp = h(opts.multiline ? 'textarea' : 'input', { class: opts.multiline ? 'txt' : 'inp', type: opts.multiline ? null : (opts.type || 'text'), placeholder: opts.placeholder || null, maxlength: opts.max || null, step: opts.step || null, min: opts.min ?? null, 'aria-label': opts.label || null });
  inp.value = value == null ? '' : String(value);
  inp.addEventListener(opts.change ? 'change' : 'input', () => onInput(inp.value));
  return inp;
}
function makeDropTarget(el, onField) {
  el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-4dash-field')) { e.preventDefault(); el.classList.add('drop-ok'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop-ok'));
  el.addEventListener('drop', e => {
    el.classList.remove('drop-ok');
    const raw = e.dataTransfer.getData('application/x-4dash-field');
    if (!raw) return;
    e.preventDefault(); e.stopPropagation();
    try { const f = safeJsonParse(raw); onField(f.ds, String(f.col)); } catch { /* ignorar */ }
  });
}
function renderRight() {
  const pane = clear($('#rightPane'));
  pane.classList.toggle('collapsed', App.prefs.rightCollapsed);
  const w = selW();
  pane.appendChild(paneHead(w ? 'Propiedades del visual' : 'Página y filtros', 'right'));
  const body = h('div', { class: 'pane-body' });
  pane.appendChild(body);
  if (!w) return renderPageProps(body);
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const [id, label] of [['data', 'Datos'], ['format', 'Formato']]) {
    const t = h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': App.propsTab === id ? 'true' : 'false', text: label });
    t.addEventListener('click', () => { App.propsTab = id; renderRight(); });
    tabs.appendChild(t);
  }
  body.appendChild(tabs);
  if (App.propsTab === 'data') renderDataProps(body, w); else renderFormatProps(body, w);
}
function upd(w, patch, opts = {}) {
  const f = () => Object.assign(w, typeof patch === 'function' ? patch(w) : patch);
  if (opts.typing) mutateTyping(f, { only: 'widget', w });
  else mutate(f, { only: 'widget', w, keepProps: opts.keepProps });
}
function renderDataProps(body, w) {
  const def = VIZ[w.type];
  body.appendChild(formRow('Tipo de visual', selectEl(Object.keys(VIZ).map(t => [t, VIZ[t].label]), w.type, v => changeType(w, v))));
  if (w.type === 'text' || w.type === 'image') {
    body.appendChild(h('p', { class: 'hint', text: 'Este visual no usa datos. Configúralo en la pestaña Formato.' }));
    return;
  }
  const dss = App.p.datasets;
  if (!dss.length) { body.appendChild(h('p', { class: 'hint', text: 'Importa datos para configurar este visual.' })); return; }
  body.appendChild(formRow('Origen de datos', selectEl([[null, '(ninguno)']].concat(dss.map(d => [d.id, d.name])), w.ds, v => upd(w, { ds: v, cat: null, split: null, vals: [] }))));
  const ds = dsById(w.ds);
  if (!ds) return;
  const cols = ds.columns;
  const numCols = cols.filter(c => c.type === 'number').map(c => c.name);
  const allCols = cols.map(c => c.name);
  const catLabel = { kpi: 'Tendencia (eje de fechas, opcional)', table: 'Agrupar por (opcional)', slicer: 'Campo', scatter: 'Detalles (un punto por valor, opcional)' }[w.type] || 'Eje / Categoría';
  if (def.cat) {
    const opts = [[null, '(ninguno)']].concat((w.type === 'kpi' ? cols.filter(c => c.type === 'date' || c.role === 'year') : cols).map(c => [c.name, `${c.name} · ${typeLabel(c)}`]));
    body.appendChild(formRow(catLabel, selectEl(opts, w.cat, v => upd(w, { cat: v })), { drop: (dsId, col) => { if (dsId === w.ds) upd(w, { cat: col }); } }));
    const cc = colOf(ds, w.cat);
    if (cc && cc.type === 'date') {
      body.appendChild(formRow('Agrupar fechas por', selectEl([['auto', `Automático (${{ year: 'año', month: 'mes', day: 'día', quarter: 'trimestre' }[autoGrain(ds, colIdx(ds, w.cat))]})`], ['year', 'Año'], ['quarter', 'Trimestre'], ['month', 'Mes'], ['day', 'Día']], w.grain, v => upd(w, { grain: v || 'auto' }))));
    }
  }
  if (def.split) {
    body.appendChild(formRow('Leyenda (dividir en series)', selectEl([[null, '(ninguna)']].concat(cols.filter(c => c.type !== 'number' || c.role === 'year').map(c => [c.name, c.name])), w.split, v => upd(w, { split: v, vals: v ? w.vals.slice(0, 1) : w.vals })),
      { drop: (dsId, col) => { if (dsId === w.ds) upd(w, { split: col }); } }));
  }
  if (def.vals === 'xy') {
    body.appendChild(formRow('Eje X (numérico)', selectEl([[null, '(elige)']].concat(numCols), w.vals[0], v => upd(w, { vals: v ? [v, w.vals[1]].filter(Boolean) : [] }))));
    body.appendChild(formRow('Eje Y (numérico)', selectEl([[null, '(elige)']].concat(numCols), w.vals[1], v => upd(w, { vals: [w.vals[0] || numCols[0], v].filter(Boolean) }))));
  } else if (def.vals === 'num1') {
    body.appendChild(formRow('Valor', selectEl([[null, '(recuento de filas)']].concat(allCols.map(n => [n, n])), w.vals[0], v => upd(w, { vals: v ? [v] : [], agg: v && colOf(ds, v).type !== 'number' ? 'count' : (w.agg === 'count' && v && colOf(ds, v).type === 'number' ? pickAgg(v) : w.agg) })),
      { drop: (dsId, col) => { if (dsId === w.ds) upd(w, { vals: [col] }); } }));
  } else if (def.vals === 'num' || def.vals === 'any') {
    const well = h('div', { class: 'well' });
    const allowSeveral = !w.split;
    w.vals.forEach((v, k) => {
      const rm = h('button', { class: 'icon-btn', type: 'button', title: 'Quitar', 'aria-label': 'Quitar ' + v }, icon('close', 14));
      rm.addEventListener('click', () => upd(w, { vals: w.vals.filter((_, i) => i !== k) }));
      const up = h('button', { class: 'icon-btn', type: 'button', title: 'Subir', 'aria-label': 'Subir ' + v, disabled: k === 0 }, icon('chevL', 14));
      up.addEventListener('click', () => upd(w, x => { const a = x.vals.slice(); [a[k - 1], a[k]] = [a[k], a[k - 1]]; return { vals: a }; }));
      const sl = def.vals === 'num' && !w.split ? h('span', { class: 'lg-key ' + slotCls('bg', w.vals.length === 1 ? w.slot : k) }) : null;
      well.appendChild(h('div', { class: 'chip' }, sl, h('span', { class: 'cname', text: v, title: v }), up, rm));
    });
    if (!w.vals.length) well.appendChild(h('div', { class: 'well-empty', text: def.vals === 'any' ? 'Todas las columnas (arrastra campos aquí)' : 'Recuento de filas (arrastra campos aquí)' }));
    const pool = (def.vals === 'any' ? allCols : numCols).filter(n => !w.vals.includes(n));
    const add = selectEl([[null, '+ Añadir campo…']].concat(pool), null, v => { if (v) upd(w, { vals: allowSeveral ? w.vals.concat([v]) : [v] }); }, { label: 'Añadir campo' });
    if (pool.length && (allowSeveral || !w.vals.length)) well.appendChild(add);
    body.appendChild(formRow(def.vals === 'any' ? 'Columnas / valores' : 'Valores', well, { drop: (dsId, col) => { if (dsId === w.ds) dropFieldOnWidget(w, dsId, col); } }));
    if (w.split && w.vals.length > 1) body.appendChild(h('p', { class: 'hint', text: 'Con leyenda solo se usa el primer valor.' }));
  }
  if (!['slicer'].includes(w.type) && (w.type !== 'table' || w.cat)) {
    body.appendChild(formRow('Agregación', selectEl(Object.keys(AGG).map(k => [k, AGG[k].label]), w.agg, v => upd(w, { agg: v }))));
  }
  if (def.cat && !['kpi', 'slicer', 'scatter'].includes(w.type) && (w.type !== 'table' || w.cat)) {
    body.appendChild(h('div', { class: 'form-inline' },
      formRow('Ordenar', selectEl([['auto', 'Automático'], ['value-desc', 'Valor ↓'], ['value-asc', 'Valor ↑'], ['cat-asc', 'Categoría A→Z'], ['cat-desc', 'Categoría Z→A']], w.sort, v => upd(w, { sort: v || 'auto' }))),
      formRow('Top N', inputEl(w.top || '', v => upd(w, { top: clamp(parseInt(v, 10) || 0, 0, 1000) }, { typing: true }), { type: 'number', min: 0, placeholder: 'Todos' }))));
  }
  if (w.type === 'kpi' || w.type === 'gauge') {
    body.appendChild(h('div', { class: 'form-inline' },
      formRow('Objetivo', inputEl(w.target ?? '', v => upd(w, { target: v === '' ? null : parseNumberStr(v, true) }, { typing: true }), { placeholder: 'Opcional' })),
      w.type === 'gauge' ? formRow('Máximo', inputEl(w.gaugeMax ?? '', v => upd(w, { gaugeMax: v === '' ? null : parseNumberStr(v, true) }, { typing: true }), { placeholder: 'Auto' })) : null));
  }
  const vd = h('button', { class: 'btn block', type: 'button' }, icon('eye', 16), 'Ver datos de este visual');
  vd.addEventListener('click', () => showWidgetData(w));
  body.appendChild(vd);
}
function renderFormatProps(body, w) {
  const chartish = ['column', 'stacked', 'bar', 'line', 'area', 'pie', 'donut', 'treemap', 'scatter'].includes(w.type);
  body.appendChild(formRow('Título', inputEl(w.title, v => upd(w, { title: v.slice(0, 200) }, { typing: true }), { placeholder: autoTitle(Object.assign({}, w, { title: '' })), max: 200 })));
  body.appendChild(checkEl('Mostrar título', w.showTitle, v => upd(w, { showTitle: v }, { keepProps: true })));
  body.appendChild(checkEl('Fondo de tarjeta', w.bg, v => upd(w, { bg: v }, { keepProps: true })));
  if (w.type === 'text') {
    body.appendChild(h('div', { class: 'section-title', text: 'Texto' }));
    body.appendChild(formRow('Contenido', inputEl(w.text, v => upd(w, { text: v.slice(0, 20000) }, { typing: true }), { multiline: true, placeholder: '# Título\nTexto del párrafo\n- Elemento de lista' })));
    body.appendChild(h('p', { class: 'hint', text: 'Usa «# » para encabezados y «- » para listas.' }));
    body.appendChild(h('div', { class: 'form-inline' },
      formRow('Tamaño', inputEl(w.fontSize, v => upd(w, { fontSize: clamp(+v || 14, 8, 72) }, { typing: true }), { type: 'number', min: 8 })),
      formRow('Alineación', selectEl([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], w.align, v => upd(w, { align: v }, { keepProps: true })))));
    body.appendChild(checkEl('Centrar verticalmente', w.vcenter, v => upd(w, { vcenter: v }, { keepProps: true })));
  }
  if (w.type === 'image') {
    const b = h('button', { class: 'btn block', type: 'button' }, icon('upload', 16), w.img ? 'Reemplazar imagen' : 'Subir imagen');
    b.addEventListener('click', () => pickImage(url => upd(w, { img: url }), 1600));
    body.appendChild(b);
    if (w.img) {
      const rm = h('button', { class: 'btn block danger', type: 'button', text: 'Quitar imagen' });
      rm.addEventListener('click', () => upd(w, { img: null }));
      body.appendChild(h('div', { class: 'form-row' }), rm);
    }
  }
  if (!['text', 'image', 'slicer'].includes(w.type)) {
    body.appendChild(h('div', { class: 'section-title', text: 'Números' }));
    body.appendChild(formRow('Formato', selectEl([['auto', 'Automático'], ['int', 'Entero'], ['compact', 'Compacto (1,2 mil)'], ['currency', 'Moneda'], ['currencyCompact', 'Moneda compacta'], ['percent', 'Porcentaje (0,25 → 25 %)'], ['percentRaw', 'Porcentaje (25 → 25 %)']], w.fmt, v => upd(w, { fmt: v }))));
    body.appendChild(h('div', { class: 'form-inline' },
      formRow('Decimales', inputEl(w.dec ?? '', v => upd(w, { dec: v === '' ? null : clamp(parseInt(v, 10) || 0, 0, 6) }, { typing: true }), { type: 'number', min: 0, placeholder: 'Auto' })),
      formRow('Moneda', selectEl(CURRENCIES, w.currency, v => upd(w, { currency: v })))));
  }
  if (chartish) {
    body.appendChild(h('div', { class: 'section-title', text: 'Elementos' }));
    body.appendChild(checkEl('Etiquetas de datos', w.labels, v => upd(w, { labels: v }, { keepProps: true })));
    body.appendChild(checkEl('Leyenda', w.showLegend, v => upd(w, { showLegend: v }, { keepProps: true })));
    if (!['pie', 'donut', 'treemap'].includes(w.type)) body.appendChild(checkEl('Líneas de cuadrícula', w.gridlines, v => upd(w, { gridlines: v }, { keepProps: true })));
  }
  if (w.type === 'table') {
    body.appendChild(h('div', { class: 'section-title', text: 'Tabla' }));
    body.appendChild(checkEl('Barras de datos', w.dataBars, v => upd(w, { dataBars: v }, { keepProps: true })));
    body.appendChild(checkEl('Fila de totales', w.totals, v => upd(w, { totals: v }, { keepProps: true })));
  }
  if (w.type === 'slicer') {
    body.appendChild(formRow('Estilo', selectEl([['list', 'Lista (selección múltiple)'], ['single', 'Lista (selección única)'], ['tiles', 'Mosaicos']], w.slicerStyle, v => upd(w, { slicerStyle: v }))));
  }
  if (w.type === 'kpi') body.appendChild(formRow('Alineación', selectEl([['left', 'Izquierda'], ['center', 'Centro']], w.align, v => upd(w, { align: v }))));
  const multiSeries = (w.vals.length > 1 || w.split) && ['column', 'stacked', 'bar', 'line', 'area'].includes(w.type);
  if (!['text', 'image', 'slicer', 'pie', 'donut', 'treemap'].includes(w.type) && !multiSeries) {
    body.appendChild(h('div', { class: 'section-title', text: 'Color' }));
    const sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
    for (let k = 0; k < 8; k++) {
      const b = h('button', { class: 'swatch ' + slotCls('bg', k), type: 'button', role: 'radio', 'aria-label': 'Color ' + (k + 1), 'aria-pressed': w.slot === k ? 'true' : 'false', 'aria-checked': w.slot === k ? 'true' : 'false' });
      b.addEventListener('click', () => upd(w, { slot: k }));
      sw.appendChild(b);
    }
    body.appendChild(sw);
  } else if (multiSeries || ['pie', 'donut', 'treemap'].includes(w.type)) {
    body.appendChild(h('p', { class: 'hint', text: 'Los colores siguen un orden fijo y accesible: cada categoría conserva su color aunque cambien los filtros.' }));
  }
  body.appendChild(h('div', { class: 'section-title', text: 'Posición y tamaño' }));
  const geo = (k, label) => formRow(label, inputEl(Math.round(w[k]), v => {
    const n = parseInt(v, 10);
    if (!isFinite(n)) return;
    upd(w, { [k]: k === 'w' || k === 'h' ? Math.max(k === 'w' ? 80 : 60, n) : n }, { typing: true });
  }, { type: 'number' }));
  body.appendChild(h('div', { class: 'form-inline' }, geo('x', 'X'), geo('y', 'Y')));
  body.appendChild(h('div', { class: 'form-inline' }, geo('w', 'Ancho'), geo('h', 'Alto')));
  const row = h('div', { class: 'form-inline' });
  const dup = h('button', { class: 'btn', type: 'button' }, icon('copy', 15), 'Duplicar');
  dup.addEventListener('click', duplicateSelected);
  const del = h('button', { class: 'btn danger', type: 'button' }, icon('trash', 15), 'Eliminar');
  del.addEventListener('click', deleteSelected);
  row.append(dup, del);
  body.appendChild(row);
}
function renderPageProps(body) {
  const pg = page();
  body.appendChild(h('div', { class: 'section-title', text: 'Filtros activos' }));
  if (!App.p.filters.length) body.appendChild(h('p', { class: 'hint', text: 'Sin filtros. Usa segmentaciones o haz clic en los gráficos para filtrar.' }));
  for (const f of App.p.filters) {
    const ds = dsById(f.ds);
    const c = ds ? colOf(ds, f.field) : null;
    const rm = h('button', { class: 'icon-btn', type: 'button', title: 'Quitar filtro', 'aria-label': 'Quitar filtro ' + f.field }, icon('close', 14));
    rm.addEventListener('click', () => setFilter(f.ds, f.field, f.grain, []));
    body.appendChild(h('div', { class: 'filter-item' }, icon('filter', 14),
      h('div', { class: 'fi-body' }, h('div', { class: 'fi-field', text: f.field + (ds && App.p.datasets.length > 1 ? ` (${ds.name})` : '') }),
        h('div', { class: 'fi-vals', text: f.values.map(v => labelOf(v, c ? c.type : 'text', f.grain)).join(', '), title: f.values.join(', ') })), rm));
  }
  if (App.p.filters.length) {
    const b = h('button', { class: 'btn block', type: 'button', text: 'Quitar todos los filtros' });
    b.addEventListener('click', clearFilters);
    body.appendChild(b);
  }
  body.appendChild(h('div', { class: 'section-title', text: 'Página' }));
  body.appendChild(formRow('Nombre', inputEl(pg.name, v => mutateTyping(() => { pg.name = v.slice(0, 60) || 'Página'; }, { keepProps: true }), { max: 60 })));
  body.appendChild(formRow('Tamaño del lienzo', selectEl(Object.keys(PAGE_SIZES).map(k => [k, PAGE_SIZES[k].label + (k !== 'custom' ? ` (${PAGE_SIZES[k].w}×${PAGE_SIZES[k].h})` : '')]), pg.size, v => mutate(() => {
    pg.size = v;
    if (v !== 'custom') { pg.w = PAGE_SIZES[v].w; pg.h = PAGE_SIZES[v].h; }
  }))));
  if (pg.size === 'custom') {
    body.appendChild(h('div', { class: 'form-inline' },
      formRow('Ancho', inputEl(pg.w, v => { const n = parseInt(v, 10); if (n >= 320 && n <= 4000) mutateTyping(() => { pg.w = n; }); }, { type: 'number', change: true })),
      formRow('Alto', inputEl(pg.h, v => { const n = parseInt(v, 10); if (n >= 240 && n <= 12000) mutateTyping(() => { pg.h = n; }); }, { type: 'number', change: true }))));
  }
  const fit = h('button', { class: 'btn block', type: 'button', text: 'Ajustar alto al contenido' });
  fit.addEventListener('click', () => mutate(() => { const hh = Math.max(240, Math.ceil((Math.max(0, ...pg.widgets.map(w => w.y + w.h)) + 16) / 8) * 8); pg.size = 'custom'; pg.h = hh; }));
  body.appendChild(fit);

  body.appendChild(h('div', { class: 'section-title', text: 'Orígenes de datos' }));
  if (!App.p.datasets.length) body.appendChild(h('p', { class: 'hint', text: 'Ninguno. Importa un Excel para empezar.' }));
  for (const d of App.p.datasets) {
    const open = h('button', { class: 'icon-btn', type: 'button', title: 'Ver / editar datos', 'aria-label': 'Ver datos de ' + d.name }, icon('table', 15));
    open.addEventListener('click', () => openDataEditor(d.id));
    const gen = h('button', { class: 'icon-btn', type: 'button', title: 'Generar dashboard automático con este origen', 'aria-label': 'Generar dashboard de ' + d.name }, icon('wand', 15));
    gen.addEventListener('click', () => autoLayoutCurrent(d.id));
    body.appendChild(h('div', { class: 'filter-item' }, icon('database', 14),
      h('div', { class: 'fi-body' }, h('div', { class: 'fi-field', text: d.name }), h('div', { class: 'fi-vals', text: `${fmtNum(d.rows.length)} filas · ${d.columns.length} columnas` + (d.info.rowTitles ? ' · títulos en filas' : '') })), gen, open));
  }
  body.appendChild(h('div', { class: 'section-title', text: 'Privacidad y almacenamiento' }));
  body.appendChild(checkEl('Autoguardar en este navegador', App.prefs.autosave, v => {
    App.prefs.autosave = v; savePrefs();
    if (!v) { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignorar */ } }
    saveNow();
  }));
  const wipe = h('button', { class: 'btn block danger', type: 'button' }, icon('shield', 15), 'Borrar datos guardados localmente');
  wipe.addEventListener('click', async () => {
    if (!await confirmDialog('Borrar datos locales', 'Se eliminará el proyecto autoguardado y las preferencias de este navegador. El dashboard abierto no se cierra.', 'Borrar', true)) return;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(PREFS_KEY); } catch { /* ignorar */ }
    App.lastSave = null; renderSaveState();
    toast('Datos locales eliminados', 'ok');
  });
  body.appendChild(wipe);
  body.appendChild(h('p', { class: 'hint', text: '4Dash funciona sin conexión: ningún dato sale de tu equipo.' }));
}

/* ---------- Render: lienzo ---------- */
function renderCanvas() {
  const pg = page();
  const el = clear($('#page'));
  el.classList.toggle('snap', !!App.p.snap);
  el.style.width = pg.w + 'px';
  el.style.height = pg.h + 'px';
  pg.widgets.forEach((w, i) => el.appendChild(widgetEl(w, i, { editable: App.view === 'editor' })));
  const empty = $('#emptyState');
  const show = !pg.widgets.length && App.view === 'editor';
  empty.classList.toggle('hidden', !show);
  if (show) renderEmpty(empty);
  if (App.view === 'presenter') renderPresHeader();
  applyZoom();
}
function renderEmpty(root) {
  clear(root);
  const imp = h('button', { class: 'btn primary', type: 'button' }, icon('upload', 16), 'Importar Excel o CSV');
  imp.addEventListener('click', () => openFile());
  const smp = h('button', { class: 'btn', type: 'button' }, icon('sparkles', 16), 'Usar datos de ejemplo');
  smp.addEventListener('click', loadSample);
  const help = h('button', { class: 'btn', type: 'button' }, icon('help', 16), 'Ver tutorial');
  help.addEventListener('click', () => openTutorial());
  const actions = [imp, smp, help];
  if (App.p.datasets.length) {
    const gen = h('button', { class: 'btn', type: 'button' }, icon('wand', 16), 'Generar automático');
    gen.addEventListener('click', () => autoLayoutCurrent());
    actions.splice(1, 0, gen);
  }
  root.appendChild(h('div', { class: 'empty-card', id: 'emptyCard' }, icon('upload', 40),
    h('h2', { text: App.p.datasets.length ? 'Esta página está vacía' : 'Empieza importando un Excel' }),
    h('p', { text: App.p.datasets.length ? 'Inserta visuales desde el panel izquierdo, arrastra campos al lienzo o genera un diseño automático.' : 'Arrastra aquí un archivo .xlsx o .csv. 4Dash detecta los títulos de filas y columnas y genera un dashboard automáticamente. Todo se procesa en tu navegador.' }),
    h('div', { class: 'empty-actions' }, actions)));
}
function renderPresHeader() {
  const hd = clear($('#presHeader'));
  if (App.p.logo) hd.appendChild(h('div', { class: 'pres-logo-bg' }, h('img', { src: App.p.logo, alt: 'Logo' })));
  const sub = [page().name, new Date().toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })].join(' · ');
  hd.appendChild(h('div', null, h('h1', { text: App.p.title }), h('div', { class: 'ph-sub', text: sub })));
}
function widgetCtx(w, W, H) {
  return {
    ds: dsById(w.ds), filters: App.p.filters, title: autoTitle(w), W: Math.max(20, W), H: Math.max(20, H),
    interactive: () => App.view === 'presenter' || App.armed === w.id || !!document.querySelector('.modal.focus'),
    onPick: (field, keys, grain, add) => pickFilter(w.ds, field, keys.map(String), grain, add),
    onToggle: (field, key, grain, multi) => {
      const cur = getFilter(w.ds, field);
      let vals = cur ? cur.values.slice() : [];
      if (multi) { const i = vals.indexOf(key); if (i >= 0) vals.splice(i, 1); else vals.push(key); }
      else vals = vals.length === 1 && vals[0] === key ? [] : [key];
      setFilter(w.ds, field, grain, vals);
    },
    onClear: field => setFilter(w.ds, field, null, []),
    rerender: () => rerenderWidget(w)
  };
}
function bodySize(w) { return { W: w.w - 20, H: w.h - (w.showTitle ? 32 : 8) - 8 }; }
function widgetEl(w, index, opts) {
  const editable = !!opts.editable;
  const title = autoTitle(w);
  const el = h('div', {
    class: 'widget' + (w.bg ? '' : ' nobg') + (w.showTitle ? '' : ' notitle') + (editable && App.sel === w.id ? ' selected' : ''),
    dataset: { id: w.id }, role: 'figure', 'aria-label': title, tabindex: editable ? 0 : null
  });
  Object.assign(el.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px', zIndex: String(index + 1) });
  const actions = h('div', { class: 'w-actions' });
  if (!opts.print) {
    if (!['text', 'image'].includes(w.type)) {
      actions.appendChild(actBtn('eye', 'Ver datos', () => showWidgetData(w)));
      actions.appendChild(actBtn('focus', 'Modo foco', () => focusWidget(w)));
    }
    if (editable) actions.appendChild(actBtn('more', 'Más opciones', e => widgetMenu(e.currentTarget, w)));
    else if (!['text', 'image'].includes(w.type)) actions.appendChild(actBtn('download', 'Exportar datos (CSV)', () => exportWidgetCsv(w)));
  }
  el.appendChild(h('div', { class: 'w-head' }, h('div', { class: 'w-title', text: title, title }), actions));
  const body = h('div', { class: 'w-body' });
  el.appendChild(body);
  if (editable) {
    for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) el.appendChild(h('div', { class: 'handle ' + d, dataset: { dir: d }, 'aria-hidden': 'true' }));
    el.addEventListener('pointerdown', e => onWidgetPointerDown(e, w, el));
    el.addEventListener('focus', () => { if (App.sel !== w.id) select(w.id); });
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-4dash-field')) { e.preventDefault(); e.stopPropagation(); el.classList.add('selected'); } });
    el.addEventListener('dragleave', () => { if (App.sel !== w.id) el.classList.remove('selected'); });
    el.addEventListener('drop', e => {
      const raw = e.dataTransfer.getData('application/x-4dash-field');
      if (!raw) return;
      e.preventDefault(); e.stopPropagation();
      try { const f = safeJsonParse(raw); select(w.id); dropFieldOnWidget(w, f.ds, String(f.col)); } catch { /* ignorar */ }
    });
  }
  const { W, H } = bodySize(w);
  renderVisual(w, body, widgetCtx(w, W, H));
  return el;
}
function actBtn(ic, label, fn) {
  const b = h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label }, icon(ic, 14));
  b.addEventListener('click', e => { e.stopPropagation(); fn(e); });
  b.addEventListener('pointerdown', e => e.stopPropagation());
  return b;
}
function rerenderWidget(w) {
  const old = $(`#page .widget[data-id="${CSS.escape(w.id)}"]`);
  const pg = page();
  const idx = pg.widgets.indexOf(w);
  if (!old || idx < 0) return renderCanvas();
  old.replaceWith(widgetEl(w, idx, { editable: App.view === 'editor' }));
}
function widgetMenu(anchor, w) {
  openMenu(anchor, [
    { label: 'Duplicar', icon: 'copy', onClick: () => { select(w.id); duplicateSelected(); } },
    { label: 'Traer al frente', icon: 'front', onClick: () => { select(w.id); reorder(1); } },
    { label: 'Enviar atrás', icon: 'back', onClick: () => { select(w.id); reorder(-1); } },
    { label: 'Exportar datos (CSV)', icon: 'download', onClick: () => exportWidgetCsv(w), hidden: ['text', 'image'].includes(w.type) },
    { label: 'Editar datos de origen', icon: 'table', onClick: () => openDataEditor(w.ds), hidden: !dsById(w.ds) },
    '-',
    { label: 'Eliminar', icon: 'trash', danger: true, onClick: () => { select(w.id); deleteSelected(); } }
  ]);
}
function select(id) {
  App.sel = id;
  document.querySelectorAll('#page .widget.selected').forEach(x => x.classList.remove('selected'));
  if (id) { const el = $(`#page .widget[data-id="${CSS.escape(id)}"]`); if (el) el.classList.add('selected'); }
  renderRight(); renderRibbon(); renderLeft();
}

/* ---------- Zoom ---------- */
function applyZoom() {
  const pg = page();
  const sc = $('#scroller');
  const aw = sc.clientWidth - 48, ah = sc.clientHeight - 48;
  let s = 1;
  if (App.zoom === 'fit') s = Math.min(aw / pg.w, ah / pg.h);
  else if (App.zoom === 'width') s = aw / pg.w;
  else s = +App.zoom || 1;
  if (App.view === 'presenter' && App.zoom === 'fit' && pg.h > pg.w * 0.8) s = aw / pg.w;
  s = clamp(s || 1, 0.15, 3);
  App.scale = s;
  const pageEl = $('#page');
  pageEl.style.transform = `scale(${s})`;
  const fr = $('#pageFrame');
  fr.style.width = Math.round(pg.w * s) + 'px';
  fr.style.height = Math.round(pg.h * s) + 'px';
  renderStatus();
}

/* ---------- Interacción: mover y redimensionar ---------- */
function onWidgetPointerDown(e, w, el) {
  if (App.view !== 'editor' || e.button !== 0) return;
  if (e.target.closest('.w-actions, input, textarea, select, button, .tbl-wrap, .slicer-list, .slicer-tiles')) {
    if (App.sel !== w.id) select(w.id);
    if (e.target.closest('.tbl-wrap, .slicer-list, .slicer-tiles')) App.armed = w.id;
    return;
  }
  const handle = e.target.closest('.handle');
  const wasSelected = App.sel === w.id;
  if (!wasSelected) select(w.id);
  App.armed = wasSelected && !handle ? w.id : null;
  const mode = handle ? handle.dataset.dir : 'move';
  const start = { x: e.clientX, y: e.clientY, gx: w.x, gy: w.y, gw: w.w, gh: w.h };
  const pg = page();
  const others = pg.widgets.filter(o => o.id !== w.id);
  const snap0 = snapshot();
  let moving = false, badge = null, raf = 0;
  const guidesRoot = $('#page');
  const clearGuides = () => guidesRoot.querySelectorAll('.guide').forEach(g => g.remove());
  const onMove = ev => {
    const dx = (ev.clientX - start.x) / App.scale, dy = (ev.clientY - start.y) / App.scale;
    if (!moving) {
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 4) return;
      moving = true; App.armed = null; Tip.hide();
      el.classList.add('dragging');
      badge = h('div', { class: 'size-badge' });
      el.appendChild(badge);
    }
    ev.preventDefault();
    const doSnap = App.p.snap && !ev.altKey;
    const sn = v => (doSnap ? Math.round(v / GRID) * GRID : Math.round(v));
    let { gx: x, gy: y, gw: ww, gh: hh } = start;
    if (mode === 'move') { x = sn(start.gx + dx); y = sn(start.gy + dy); }
    else {
      if (mode.includes('e')) ww = sn(start.gx + start.gw + dx) - x;
      if (mode.includes('s')) hh = sn(start.gy + start.gh + dy) - y;
      if (mode.includes('w')) { const nx = sn(start.gx + dx); ww = start.gx + start.gw - nx; x = nx; }
      if (mode.includes('n')) { const ny = sn(start.gy + dy); hh = start.gy + start.gh - ny; y = ny; }
      if (ww < 80) { if (mode.includes('w')) x -= 80 - ww; ww = 80; }
      if (hh < 60) { if (mode.includes('n')) y -= 60 - hh; hh = 60; }
    }
    // Guías inteligentes de alineación
    clearGuides();
    if (mode === 'move' && !ev.altKey) {
      const tol = 6 / App.scale;
      const xs = [0, pg.w / 2, pg.w], ys = [0, pg.h / 2, pg.h];
      for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
      let bestX = null, bestY = null;
      for (const [off] of [[0], [ww / 2], [ww]]) for (const gxv of xs) { const d = gxv - (x + off); if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: gxv }; }
      for (const [off] of [[0], [hh / 2], [hh]]) for (const gyv of ys) { const d = gyv - (y + off); if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: gyv }; }
      if (bestX) { x += bestX.d; const g = h('div', { class: 'guide v' }); g.style.left = bestX.at + 'px'; guidesRoot.appendChild(g); }
      if (bestY) { y += bestY.d; const g = h('div', { class: 'guide h' }); g.style.top = bestY.at + 'px'; guidesRoot.appendChild(g); }
    }
    x = clamp(x, 0, Math.max(0, pg.w - ww));
    y = clamp(y, 0, Math.max(0, pg.h - Math.min(hh, pg.h)));
    ww = Math.min(ww, pg.w);
    Object.assign(w, { x: Math.round(x), y: Math.round(y), w: Math.round(ww), h: Math.round(hh) });
    Object.assign(el.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' });
    badge.textContent = mode === 'move' ? `X ${w.x} · Y ${w.y}` : `${w.w} × ${w.h}`;
    if (mode !== 'move' && !raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        const body = el.querySelector('.w-body');
        const { W, H } = bodySize(w);
        renderVisual(w, body, widgetCtx(w, W, H));
      });
    }
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (raf) cancelAnimationFrame(raf);
    clearGuides();
    if (moving) {
      el.classList.remove('dragging');
      if (badge) badge.remove();
      if (w.y + w.h > pg.h && pg.size !== 'custom' && mode !== 'move') { /* se permite sobresalir: el usuario puede ajustar la página */ }
      pushHistory(snap0);
      afterChange({ only: 'widget', w });
    }
    setTimeout(() => { if (App.armed === w.id && !moving) { /* el clic ya se procesó */ } App.armed = null; }, 0);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/* ---------- Acciones sobre widgets ---------- */
function findFreeSpot(pg, ww, hh) {
  const fits = (x, y) => x + ww <= pg.w && y + hh <= pg.h && !pg.widgets.some(o => x < o.x + o.w + 8 && x + ww + 8 > o.x && y < o.y + o.h + 8 && y + hh + 8 > o.y);
  for (let y = 16; y + hh <= pg.h; y += 16) for (let x = 16; x + ww <= pg.w; x += 16) if (fits(x, y)) return { x, y };
  const n = pg.widgets.length % 10;
  return { x: 32 + n * 24, y: 32 + n * 24 };
}
function insertWidget(type, at, extra) {
  const pg = page();
  const ds = dsById(fieldsDsId) || App.p.datasets[0] || null;
  const w = newWidget(type, ['text', 'image'].includes(type) ? null : ds, extra);
  if (ds && !extra) defaultFields(w, ds);
  if (type === 'text' && !w.text) w.text = '# Título\nEscribe aquí tu texto.';
  w.w = Math.min(w.w, pg.w - 32);
  const spot = at ? { x: clamp(Math.round((at.x - w.w / 2) / GRID) * GRID, 0, pg.w - w.w), y: clamp(Math.round((at.y - 16) / GRID) * GRID, 0, Math.max(0, pg.h - w.h)) } : findFreeSpot(pg, w.w, w.h);
  Object.assign(w, spot);
  mutate(() => { pg.widgets.push(w); App.sel = w.id; });
  if (type === 'image' && !w.img) pickImage(url => upd(w, { img: url }), 1600);
  return w;
}
/** Elige campos razonables para un visual nuevo. */
function defaultFields(w, ds) {
  const cols = ds.columns;
  const num = cols.find(c => c.type === 'number' && !c.role);
  const date = cols.find(c => c.type === 'date');
  const text = cols.map((c, i) => ({ c, d: c.type === 'text' ? distinctCount(ds, i, 200) : 0 })).filter(x => x.d >= 2 && x.d <= 50).sort((a, b) => Math.abs(a.d - 6) - Math.abs(b.d - 6))[0];
  const t = w.type;
  if (['column', 'stacked', 'bar', 'pie', 'donut', 'treemap'].includes(t)) { w.cat = (text && text.c.name) || (date && date.name) || null; w.vals = num ? [num.name] : []; }
  else if (['line', 'area'].includes(t)) { w.cat = (date && date.name) || (text && text.c.name) || null; w.vals = num ? [num.name] : []; }
  else if (t === 'kpi' || t === 'gauge') { w.vals = num ? [num.name] : []; }
  else if (t === 'slicer') { w.cat = (text && text.c.name) || (date && date.name) || (cols[0] && cols[0].name); }
  else if (t === 'scatter') { const ns = cols.filter(c => c.type === 'number' && !c.role); w.vals = ns.slice(0, 2).map(c => c.name); }
  if (w.vals[0]) w.agg = pickAgg(w.vals[0]);
  if (t === 'stacked' && text) { const other = cols.find(c => c.type === 'text' && c.name !== w.cat && distinctCount(ds, colIdx(ds, c.name), 20) <= 8); if (other) w.split = other.name; }
}
function changeType(w, t) {
  if (!VIZ[t] || w.type === t) return;
  mutate(() => {
    const ds = dsById(w.ds);
    w.type = t;
    if (!VIZ[t].split) w.split = null;
    if (VIZ[t].vals === 'num1' || VIZ[t].vals === 'xy') {
      const nums = ds ? ds.columns.filter(c => c.type === 'number').map(c => c.name) : [];
      w.vals = VIZ[t].vals === 'xy' ? Array.from(new Set(w.vals.concat(nums))).filter(v => nums.includes(v)).slice(0, 2) : w.vals.slice(0, 1);
    }
    if (ds && !w.cat && VIZ[t].cat && t !== 'kpi' && t !== 'table' && t !== 'scatter') {
      const tmp = newWidget(t, ds); defaultFields(tmp, ds); w.cat = tmp.cat;
    }
    if (t === 'kpi' && w.cat && colOf(ds, w.cat) && colOf(ds, w.cat).type !== 'date') w.cat = null;
    const [dw, dh] = DEFAULT_SIZE[t] || [w.w, w.h];
    if ((t === 'kpi') !== (w.h < 160)) { w.w = Math.max(w.w, dw); w.h = dh; }
  });
}
function dropFieldOnWidget(w, dsId, col) {
  const ds = dsById(dsId);
  const c = ds && colOf(ds, col);
  if (!c) return;
  if (w.type === 'text' || w.type === 'image') return toast('Este visual no usa datos', 'info');
  if (w.ds !== dsId) {
    mutate(() => { w.ds = dsId; w.cat = null; w.split = null; w.vals = []; });
  }
  const def = VIZ[w.type];
  upd(w, x => {
    const isNum = c.type === 'number' && !c.role;
    if (w.type === 'slicer') return { cat: col };
    if (def.vals === 'any' && !(c.type !== 'number' && !x.cat && false)) return { vals: x.vals.includes(col) ? x.vals : x.vals.concat([col]) };
    if (def.vals === 'xy') { if (!isNum) return { cat: col }; const v = x.vals.slice(0, 2); if (v.length < 2) v.push(col); else v[1] = col; return { vals: v }; }
    if (isNum && def.vals === 'num1') return { vals: [col], agg: x.agg === 'count' ? pickAgg(col) : x.agg };
    if (isNum && def.vals === 'num') return { vals: x.split ? [col] : (x.vals.includes(col) ? x.vals : x.vals.concat([col]).slice(0, 8)), agg: x.vals.length ? x.agg : pickAgg(col) };
    if (w.type === 'kpi' || w.type === 'gauge') return c.type === 'date' && w.type === 'kpi' ? { cat: col } : { vals: [col], agg: 'distinct' };
    if (def.cat && !x.cat) return { cat: col };
    if (def.split && x.cat && x.cat !== col && c.type !== 'number') return { split: col, vals: x.vals.slice(0, 1) };
    return { cat: col };
  });
  renderLeft();
}
function createFromField(dsId, col, at) {
  const ds = dsById(dsId);
  const c = ds && colOf(ds, col);
  if (!c) return;
  fieldsDsId = dsId;
  const num = ds.columns.find(x => x.type === 'number' && !x.role);
  let type, extra;
  if (c.type === 'number' && !c.role) { type = 'kpi'; extra = { vals: [col], agg: pickAgg(col) }; }
  else if (c.type === 'date' || c.role === 'year') { type = num ? 'line' : 'column'; extra = { cat: col, vals: num ? [num.name] : [], agg: num ? pickAgg(num.name) : 'count' }; }
  else { type = 'column'; extra = { cat: col, vals: num ? [num.name] : [], agg: num ? pickAgg(num.name) : 'count', top: distinctCount(ds, colIdx(ds, col)) > 15 ? 12 : 0 }; }
  insertWidget(type, at, Object.assign({ ds: dsId }, extra));
}
function duplicateSelected() {
  const w = selW();
  if (!w) return;
  const pg = page();
  const c = sanitizeWidget(deepClone(w));
  c.id = uid(); c.x = clamp(w.x + 24, 0, pg.w - w.w); c.y = clamp(w.y + 24, 0, Math.max(0, pg.h - w.h));
  mutate(() => { pg.widgets.push(c); App.sel = c.id; });
}
function deleteSelected() {
  const w = selW();
  if (!w) return;
  const pg = page();
  mutate(() => { pg.widgets = pg.widgets.filter(x => x.id !== w.id); App.sel = null; });
  toast('Visual eliminado · Ctrl+Z para deshacer');
}
function reorder(dir) {
  const w = selW();
  if (!w) return;
  const pg = page();
  mutate(() => { pg.widgets = pg.widgets.filter(x => x !== w); if (dir > 0) pg.widgets.push(w); else pg.widgets.unshift(w); });
}
function alignAllToGrid() {
  const pg = page();
  mutate(() => { for (const w of pg.widgets) { w.x = Math.round(w.x / GRID) * GRID; w.y = Math.round(w.y / GRID) * GRID; w.w = Math.round(w.w / GRID) * GRID; w.h = Math.round(w.h / GRID) * GRID; } });
}
function nudge(dx, dy) {
  const w = selW();
  if (!w) return;
  const pg = page();
  const snap = App.typingSnap ? null : snapshot();
  if (snap) { App.typingSnap = snap; pushHistory(snap); }
  w.x = clamp(w.x + dx, 0, pg.w - w.w);
  w.y = clamp(w.y + dy, 0, Math.max(0, pg.h - w.h));
  const el = $(`#page .widget[data-id="${CSS.escape(w.id)}"]`);
  if (el) Object.assign(el.style, { left: w.x + 'px', top: w.y + 'px' });
  endTyping();
  scheduleSave();
  renderRight();
}

/* ---------- Ver datos / foco / exportar ---------- */
function showWidgetData(w) {
  const ds = dsById(w.ds);
  const { head, rows } = widgetDataTable(w, ds, App.p.filters);
  const table = h('table', { class: 'tbl' });
  const colTypes = head.map((_, j) => rows.some(r => typeof r[j] === 'number'));
  table.appendChild(h('thead', null, h('tr', null, head.map((n, j) => h('th', { class: colTypes[j] ? 'num' : '', text: n })))));
  const tb = h('tbody');
  for (const r of rows.slice(0, 1000)) tb.appendChild(h('tr', null, r.map((v, j) => h('td', { class: colTypes[j] ? 'num' : '', text: typeof v === 'number' ? fmtNum(v, w.fmt, w.dec, w.currency) : (v == null ? '' : (ds && colOf(ds, head[j]) && colOf(ds, head[j]).type === 'date' ? fmtDateKey(v) : String(v))) }))));
  table.appendChild(tb);
  const exp = h('button', { class: 'btn', type: 'button' }, icon('download', 15), 'Exportar CSV');
  exp.addEventListener('click', () => exportWidgetCsv(w));
  const note = h('span', { class: 'grow hint', text: `${fmtNum(rows.length)} filas` + (rows.length > 1000 ? ' (se muestran 1.000; exporta para verlas todas)' : '') + (App.p.filters.length ? ' · con filtros aplicados' : '') });
  openModal({ title: autoTitle(w), cls: 'wide', labelledIcon: 'table', body: h('div', { class: 'modal-body' }, h('div', { class: 'tbl-wrap' }, table)), foot: h('div', { class: 'modal-foot' }, note, exp) });
}
function exportWidgetCsv(w) {
  const { head, rows } = widgetDataTable(w, dsById(w.ds), App.p.filters);
  downloadFile(`${autoTitle(w)}.csv`, 'text/csv;charset=utf-8', toCsv(head, rows));
  toast('CSV exportado', 'ok');
}
function focusWidget(w) {
  const body = h('div', { class: 'modal-body' });
  const m = openModal({ title: autoTitle(w), cls: 'focus', body, labelledIcon: VIZ[w.type].icon, onClose: () => { window.removeEventListener('resize', draw); } });
  const draw = () => {
    clear(body);
    const r = body.getBoundingClientRect();
    const inner = h('div', { class: 'w-body' });
    inner.style.height = '100%';
    body.appendChild(inner);
    const ctx = widgetCtx(w, r.width - 68, r.height - 40);
    ctx.interactive = () => true;
    ctx.rerender = draw;
    const pickBase = ctx.onPick, toggleBase = ctx.onToggle, clearBase = ctx.onClear;
    ctx.onPick = (...a) => { pickBase(...a); draw(); };
    ctx.onToggle = (...a) => { toggleBase(...a); draw(); };
    ctx.onClear = (...a) => { clearBase(...a); draw(); };
    renderVisual(w, inner, ctx);
  };
  requestAnimationFrame(draw);
  window.addEventListener('resize', draw);
  return m;
}

/* ---------- Páginas ---------- */
function renderPages() {
  const tabs = clear($('#pageTabs'));
  App.p.pages.forEach((pg, i) => {
    const t = h('button', { class: 'ptab', type: 'button', role: 'tab', 'aria-selected': pg.id === App.p.active ? 'true' : 'false', text: pg.name, title: App.view === 'editor' ? 'Doble clic para renombrar · clic derecho para más opciones' : pg.name });
    t.addEventListener('click', () => gotoPage(i));
    if (App.view === 'editor') {
      t.addEventListener('dblclick', () => renamePageInline(t, pg));
      t.addEventListener('contextmenu', e => { e.preventDefault(); pageMenu({ x: e.clientX, y: e.clientY }, pg, i); });
    }
    tabs.appendChild(t);
  });
  if (App.view === 'editor') {
    const add = h('button', { class: 'ptab', type: 'button', title: 'Nueva página', 'aria-label': 'Nueva página' }, icon('plus', 15));
    add.addEventListener('click', addPage);
    tabs.appendChild(add);
    const more = h('button', { class: 'ptab', type: 'button', title: 'Opciones de página', 'aria-label': 'Opciones de página' }, icon('more', 15));
    more.addEventListener('click', e => pageMenu(e.currentTarget, page(), App.p.pages.indexOf(page())));
    tabs.appendChild(more);
  }
  renderPresNav();
}
function pageMenu(anchor, pg, i) {
  openMenu(anchor, [
    { label: 'Renombrar', icon: 'rename', onClick: () => { const t = $('#pageTabs').children[i]; if (t) renamePageInline(t, pg); } },
    { label: 'Duplicar página', icon: 'copy', onClick: () => duplicatePage(pg) },
    { label: 'Mover a la izquierda', icon: 'chevL', disabled: i === 0, onClick: () => movePage(i, -1) },
    { label: 'Mover a la derecha', icon: 'chevR', disabled: i === App.p.pages.length - 1, onClick: () => movePage(i, 1) },
    '-',
    { label: 'Eliminar página', icon: 'trash', danger: true, disabled: App.p.pages.length <= 1, onClick: () => deletePage(pg) }
  ]);
}
function renamePageInline(tab, pg) {
  const inp = h('input', { class: 'ptab-input', maxlength: 60, 'aria-label': 'Nombre de la página' });
  inp.value = pg.name;
  tab.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = inp.value.trim().slice(0, 60);
    if (ok && v && v !== pg.name) mutate(() => { pg.name = v; }); else renderPages();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
  inp.addEventListener('blur', () => finish(true));
}
function addPage() {
  const pg = { id: uid(), name: 'Página ' + (App.p.pages.length + 1), size: '16:9', w: 1280, h: 720, widgets: [] };
  mutate(() => { App.p.pages.push(pg); App.p.active = pg.id; App.sel = null; });
}
function duplicatePage(pg) {
  const c = sanitizePage(deepClone(pg));
  c.id = uid(); c.name = (pg.name + ' (copia)').slice(0, 60);
  c.widgets.forEach(w => { w.id = uid(); });
  mutate(() => { App.p.pages.splice(App.p.pages.indexOf(pg) + 1, 0, c); App.p.active = c.id; App.sel = null; });
}
function movePage(i, d) {
  mutate(() => { const a = App.p.pages; const [pg] = a.splice(i, 1); a.splice(i + d, 0, pg); });
}
async function deletePage(pg) {
  if (App.p.pages.length <= 1) return;
  if (pg.widgets.length && !await confirmDialog('Eliminar página', `¿Eliminar «${pg.name}» y sus ${pg.widgets.length} visuales? Podrás deshacerlo con Ctrl+Z.`, 'Eliminar', true)) return;
  mutate(() => { const i = App.p.pages.indexOf(pg); App.p.pages.splice(i, 1); App.p.active = App.p.pages[Math.max(0, i - 1)].id; App.sel = null; });
}
function gotoPage(i) {
  const pg = App.p.pages[i];
  if (!pg || pg.id === App.p.active) return;
  App.p.active = pg.id;
  App.sel = null;
  scheduleSave();
  renderCanvas(); renderPages(); renderRight(); renderRibbon(); renderStatus();
  $('#scroller').scrollTop = 0;
}

/* ---------- Barra de filtros y estado ---------- */
function renderFilterBar() {
  const bar = clear($('#filterBar'));
  if (!App.p.filters.length) return;
  for (const f of App.p.filters) {
    const ds = dsById(f.ds);
    const c = ds ? colOf(ds, f.field) : null;
    const vals = f.values.map(v => labelOf(v, c ? c.type : 'text', f.grain));
    const txt = vals.length > 3 ? `${vals.slice(0, 3).join(', ')} +${vals.length - 3}` : vals.join(', ');
    const x = h('button', { type: 'button', title: 'Quitar filtro', 'aria-label': 'Quitar filtro ' + f.field }, icon('close', 12));
    x.addEventListener('click', () => setFilter(f.ds, f.field, f.grain, []));
    bar.appendChild(h('span', { class: 'fchip', title: vals.join(', ') }, icon('filter', 12), h('b', { text: f.field + ':' }), h('span', { text: txt }), x));
  }
  const all = h('button', { class: 'fchip-clear', type: 'button', text: 'Quitar todos' });
  all.addEventListener('click', clearFilters);
  bar.appendChild(all);
}
function renderStatus() {
  const st = clear($('#statusBar'));
  const pg = page();
  const n = App.p.datasets.reduce((a, d) => a + d.rows.length, 0);
  if (App.p.datasets.length) st.appendChild(h('span', { text: `${App.p.datasets.length} origen(es) · ${fmtNum(n)} filas` }));
  if (App.p.filters.length) st.appendChild(h('span', { text: `${App.p.filters.length} filtro(s)` }));
  st.appendChild(h('span', { text: `${pg.widgets.length} visual(es)` }));
  st.appendChild(h('span', { text: `Zoom ${Math.round(App.scale * 100)} %` }));
  st.appendChild(h('span', { title: 'Sin conexiones de red' }, icon('lock', 13)));
}

/* ---------- Vistas ---------- */
function setView(v) {
  if (v === App.view) return;
  App.view = v;
  App.sel = null;
  document.body.classList.toggle('mode-editor', v === 'editor');
  document.body.classList.toggle('mode-presenter', v === 'presenter');
  if (v === 'editor' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  Tip.hide(); closeMenu();
  renderTopbar(); renderRibbon(); renderLeft(); renderRight(); renderPages();
  requestAnimationFrame(() => renderCanvas());
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => toast('El navegador no permitió la pantalla completa', 'error'));
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  App.prefs.theme = t;
  savePrefs();
  renderTopbar();
}

/* ---------- Importación ---------- */
function openFile() { const i = $('#fileInput'); i.value = ''; i.click(); }
async function handleImport(file) {
  const busy = toast('Leyendo «' + String(file.name).slice(0, 60) + '»…', 'info', 60000);
  let tables;
  try { tables = await importFile(file); }
  catch (err) { busy.remove(); return reportError(err); }
  busy.remove();
  const visible = tables.filter(t => !t.hidden);
  const use = visible.length ? visible : tables;
  let mode = 'replace';
  const hasContent = App.p.datasets.length || App.p.pages.some(p => p.widgets.length);
  if (hasContent) {
    mode = await choiceDialog('Importar datos', `Se han encontrado ${use.length} hoja(s) con datos. ¿Quieres reemplazar el dashboard actual o añadirlas como nuevas páginas?`,
      [{ label: 'Añadir', value: 'add' }, { label: 'Reemplazar todo', value: 'replace', primary: true }]);
    if (!mode) return;
  }
  const baseName = String(file.name).replace(/\.[^.]+$/, '').slice(0, 100);
  mutate(() => {
    if (mode === 'replace') {
      const keepLogo = App.p.logo;
      App.p = newProject();
      App.p.logo = keepLogo;
      App.p.title = baseName || 'Dashboard';
      App.p.pages = [];
      App.hist = [];
    }
    const newPages = buildPagesFor(use);
    App.p.pages.push(...newPages);
    if (!App.p.pages.length) App.p.pages.push({ id: uid(), name: 'Página 1', size: '16:9', w: 1280, h: 720, widgets: [] });
    App.p.active = newPages[0] ? newPages[0].id : App.p.pages[0].id;
    App.sel = null;
  });
  if (mode === 'replace') { App.hist = []; renderRibbon(); }
  const t0 = use[0];
  const notes = [];
  notes.push(t0.info.hasHeader ? 'títulos de columna detectados' : 'sin títulos de columna (se han nombrado automáticamente)');
  if (use.some(t => t.info.rowTitles)) notes.push('títulos de fila detectados');
  if (use.some(t => t.truncated)) notes.push(`datos recortados al máximo de ${fmtNum(LIMITS.rows)} filas`);
  toast(`Importado: ${use.length} hoja(s), ${fmtNum(use.reduce((a, t) => a + t.rows.length, 0))} filas · ${notes.join(' · ')}`, 'ok', 6000);
}
function buildPagesFor(tables) {
  const pages = [];
  for (const t of tables.slice(0, 20)) {
    const ds = { id: uid(), name: t.name, columns: t.columns, rows: t.rows, info: t.info, v: 1 };
    App.p.datasets.push(ds);
    if (pages.length >= 12) continue;
    // Tabla cruzada con periodos como columnas: se crea también la versión transpuesta
    let transposed = null;
    if (ds.info.rowTitles && ds.info.periodHeaders) {
      transposed = transposeDataset(ds);
      App.p.datasets.push(transposed);
    }
    const { widgets, height } = autoDashboard(ds, { transposed });
    const pg = { id: uid(), name: t.name.slice(0, 60), size: '16:9', w: 1280, h: 720, widgets };
    fitPage(pg, height);
    pages.push(pg);
  }
  return pages;
}
function fitPage(pg, height) {
  if (height <= 720) { pg.size = '16:9'; pg.h = 720; }
  else if (height <= 960) { pg.size = '4:3'; pg.h = 960; }
  else { pg.size = 'custom'; pg.h = Math.ceil(height / 8) * 8; }
}
function loadSample() {
  const t = buildTable(sampleGrid());
  const run = () => mutate(() => {
    const keepLogo = App.p.logo;
    App.p = newProject();
    App.p.logo = keepLogo;
    App.p.title = 'Ventas 2025 — Demo';
    App.p.pages = [];
    const pages = buildPagesFor([{ name: 'Ventas', ...t }]);
    App.p.pages = pages;
    App.p.active = pages[0].id;
    App.sel = null;
  });
  const hasContent = App.p.datasets.length || App.p.pages.some(p => p.widgets.length);
  if (!hasContent) { run(); App.hist = []; renderRibbon(); return; }
  confirmDialog('Cargar datos de ejemplo', 'Se reemplazará el dashboard actual por uno de ejemplo. Podrás deshacerlo con Ctrl+Z.', 'Cargar ejemplo').then(ok => { if (ok) run(); });
}
async function autoLayoutCurrent(dsId) {
  const dss = App.p.datasets;
  if (!dss.length) return;
  let ds = dsById(dsId);
  if (!ds) {
    if (dss.length === 1) ds = dss[0];
    else {
      const id = await choiceDialog('Generar dashboard automático', 'Elige el origen de datos para esta página:', dss.slice(0, 6).map((d, i) => ({ label: d.name, value: d.id, primary: i === 0 })));
      ds = dsById(id);
      if (!ds) return;
    }
  }
  const pg = page();
  if (pg.widgets.length && !await confirmDialog('Generar dashboard automático', `Se reemplazarán los ${pg.widgets.length} visuales de «${pg.name}». Podrás deshacerlo con Ctrl+Z.`, 'Generar')) return;
  mutate(() => {
    const { widgets, height } = autoDashboard(ds);
    pg.widgets = widgets;
    fitPage(pg, height);
    App.sel = null;
  });
}
async function newProjectFlow() {
  if (!await confirmDialog('Nuevo dashboard', 'Se cerrará el dashboard actual. Guarda antes el proyecto si quieres conservarlo. (Podrás deshacer con Ctrl+Z)', 'Crear nuevo')) return;
  mutate(() => { App.p = newProject(); App.sel = null; });
  renderTopbar();
}

/* ---------- Proyecto: guardar / abrir ---------- */
function saveProjectFile() {
  const json = JSON.stringify(App.p, jsonReplacer);
  downloadFile(`${App.p.title || 'dashboard'}.4dash.json`, 'application/json', json);
  toast('Proyecto descargado', 'ok');
}
async function openProjectFile(file) {
  try {
    if (!file) return;
    if (file.size > LIMITS.projectBytes) throw new UserError('El proyecto supera el tamaño máximo permitido.');
    const text = await file.text();
    let raw;
    try { raw = safeJsonParse(text); } catch { throw new UserError('El archivo no contiene JSON válido.'); }
    const proj = sanitizeProject(raw);
    mutate(() => { App.p = proj; App.sel = null; });
    renderTopbar();
    toast('Proyecto abierto: ' + proj.title, 'ok');
  } catch (err) { reportError(err); }
}

/* ---------- Impresión / PDF ---------- */
function printDashboard() {
  const root = clear($('#printRoot'));
  const prevView = App.view;
  for (const pg of App.p.pages) {
    const scale = Math.min(1050 / pg.w, 690 / pg.h, 1);
    const wrap = h('div', { class: 'print-page' });
    const head = h('div', { class: 'print-head' }, App.p.logo ? h('img', { src: App.p.logo, alt: '' }) : null, h('span', { text: `${App.p.title} — ${pg.name}` }));
    const frame = h('div');
    frame.style.position = 'relative';
    frame.style.width = Math.round(pg.w * scale) + 'px';
    frame.style.height = Math.round(pg.h * scale) + 'px';
    const pe = h('div', { class: 'page' });
    Object.assign(pe.style, { width: pg.w + 'px', height: pg.h + 'px', transform: `scale(${scale})` });
    pg.widgets.forEach((w, i) => pe.appendChild(widgetEl(w, i, { editable: false, print: true })));
    frame.appendChild(pe);
    wrap.append(head, frame);
    root.appendChild(wrap);
  }
  App.view = prevView;
  setTimeout(() => window.print(), 50);
}
window.addEventListener('afterprint', () => clear($('#printRoot')));

/* ---------- Errores ---------- */
function reportError(err) {
  if (err instanceof UserError) toast(err.message, 'error', 7000);
  else { console.error(err); toast('Se produjo un error inesperado. Revisa el archivo e inténtalo de nuevo.', 'error', 7000); }
}
