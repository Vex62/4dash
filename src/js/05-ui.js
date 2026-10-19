/* ==========================================================================
   Componentes de interfaz: toasts, menús, modales, diálogos, tutorial,
   saneado de imágenes y de proyectos importados.
   ========================================================================== */

/* ---------- Toasts ---------- */
function toast(msg, type = 'info', ms = 3800) {
  const root = $('#toasts');
  const t = h('div', { class: 'toast ' + type, role: type === 'error' ? 'alert' : 'status' },
    type === 'ok' ? icon('check', 16) : type === 'error' ? icon('info', 16) : null,
    h('span', { text: msg }));
  root.appendChild(t);
  while (root.children.length > 4) root.firstChild.remove();
  setTimeout(() => t.remove(), ms);
  return t;
}

/* ---------- Menú contextual ---------- */
let openMenuEl = null;
function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
function openMenu(anchor, items) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it === '-') { m.appendChild(h('hr')); continue; }
    if (it.hidden) continue;
    const b = h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', disabled: !!it.disabled }, it.icon ? icon(it.icon, 16) : null, h('span', { text: it.label }));
    b.addEventListener('click', e => { e.stopPropagation(); closeMenu(); it.onClick(); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, top: anchor.y, right: anchor.x };
  const mr = m.getBoundingClientRect();
  let x = r.left, y = r.bottom + 4;
  if (x + mr.width > innerWidth - 8) x = Math.max(8, (r.right || r.left) - mr.width);
  if (y + mr.height > innerHeight - 8) y = Math.max(8, r.top - mr.height - 4);
  m.style.left = x + 'px';
  m.style.top = y + 'px';
  openMenuEl = m;
  const f = m.querySelector('button:not(:disabled)');
  if (f) f.focus();
  return m;
}
document.addEventListener('pointerdown', e => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }, true);

/* ---------- Modales ---------- */
const modalStack = [];
function openModal({ title, body, foot, cls = '', onClose, labelledIcon }) {
  const prevFocus = document.activeElement;
  const titleId = 'm' + uid();
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', title: 'Cerrar (Esc)' }, icon('close', 18));
  const modal = h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'modal-head' }, labelledIcon ? icon(labelledIcon, 20) : null, h('h2', { id: titleId, text: title }), closeBtn),
    body, foot || null);
  const back = h('div', { class: 'modal-backdrop' }, modal);
  const api = {
    el: modal,
    close() {
      const i = modalStack.indexOf(api);
      if (i >= 0) modalStack.splice(i, 1);
      back.remove();
      Tip.hide();
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch { /* ignorar */ }
    }
  };
  closeBtn.addEventListener('click', () => api.close());
  back.addEventListener('pointerdown', e => { if (e.target === back) api.close(); });
  modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = Array.from(modal.querySelectorAll('button,input,select,textarea,[tabindex="0"]')).filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  document.body.appendChild(back);
  modalStack.push(api);
  setTimeout(() => { const f = modal.querySelector('.modal-body input, .modal-body button, .modal-foot .primary') || closeBtn; f.focus(); }, 0);
  return api;
}
function confirmDialog(title, text, okLabel = 'Aceptar', danger = false) {
  return new Promise(resolve => {
    let done = false;
    const ok = h('button', { class: 'btn primary' + (danger ? ' danger-fill' : ''), type: 'button', text: okLabel });
    const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancelar' });
    const m = openModal({
      title, body: h('div', { class: 'modal-body' }, h('p', { text })),
      foot: h('div', { class: 'modal-foot' }, cancel, ok),
      onClose: () => { if (!done) resolve(false); }
    });
    ok.addEventListener('click', () => { done = true; m.close(); resolve(true); });
    cancel.addEventListener('click', () => { done = true; m.close(); resolve(false); });
  });
}
function choiceDialog(title, text, choices) {
  return new Promise(resolve => {
    let done = false;
    const foot = h('div', { class: 'modal-foot' });
    const m = openModal({ title, body: h('div', { class: 'modal-body' }, h('p', { text })), foot, onClose: () => { if (!done) resolve(null); } });
    for (const c of choices) {
      const b = h('button', { class: 'btn' + (c.primary ? ' primary' : ''), type: 'button', text: c.label });
      b.addEventListener('click', () => { done = true; m.close(); resolve(c.value); });
      foot.appendChild(b);
    }
  });
}

/* ---------- Imágenes (logo e imágenes de widget) ---------- */
const IMG_DATAURL_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
function isSafeImageDataUrl(v, max = 12 * 1024 * 1024) {
  return typeof v === 'string' && v.length <= max && IMG_DATAURL_RE.test(v);
}
/**
 * Valida la firma binaria del archivo (no se fía de la extensión ni del MIME),
 * rechaza SVG (puede contener scripts) y re-codifica la imagen en un canvas,
 * eliminando metadatos y cualquier contenido incrustado.
 */
async function sanitizeImageFile(file, maxDim = 1200) {
  if (!file) throw new UserError('No se seleccionó ninguna imagen.');
  if (file.size > LIMITS.imageBytes) throw new UserError('La imagen supera el tamaño máximo de 8 MB.');
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isGif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
  const isWebp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  if (!(isPng || isJpg || isGif || isWebp)) throw new UserError('Formato de imagen no permitido. Usa PNG, JPG, WEBP o GIF (SVG no se admite por seguridad).');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new UserError('No se pudo leer la imagen; puede estar dañada.'); }
  const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), hgt = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = hgt;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, hgt);
  if (bmp.close) bmp.close();
  let url = cv.toDataURL('image/png');
  if (url.length > 1.5 * 1024 * 1024) {
    const webp = cv.toDataURL('image/webp', 0.9);
    url = webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/jpeg', 0.9);
  }
  if (!isSafeImageDataUrl(url)) throw new UserError('No se pudo procesar la imagen.');
  return url;
}

/* ---------- Saneado de proyectos (.4dash.json / almacenamiento local) ---------- */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
function safeJsonParse(text) {
  return JSON.parse(text, (k, v) => (FORBIDDEN_KEYS.has(k) ? undefined : v));
}
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const str = (v, max = 200, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);
const num = (v, min, max, def) => (typeof v === 'number' && isFinite(v) ? clamp(v, min, max) : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const optNum = v => (v === null || v === '' || v === undefined ? null : (typeof v === 'number' && isFinite(v) ? v : null));

function sanitizeDataset(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.columns) || !Array.isArray(d.rows)) return null;
  const columns = d.columns.slice(0, LIMITS.cols).map((c, j) => ({
    name: str(c && c.name, 80, `Columna ${j + 1}`) || `Columna ${j + 1}`,
    type: oneOf(c && c.type, ['text', 'number', 'date'], 'text'),
    role: oneOf(c && c.role, ['id', 'year', null], null)
  }));
  const names = new Set();
  columns.forEach((c, j) => { while (names.has(c.name)) c.name = `${c.name} (${j + 1})`; names.add(c.name); });
  const rows = [];
  for (const r of d.rows.slice(0, LIMITS.rows)) {
    if (!Array.isArray(r)) continue;
    rows.push(columns.map((c, j) => {
      const v = r[j];
      if (v == null) return null;
      if (c.type === 'number') return typeof v === 'number' && isFinite(v) ? v : null;
      if (c.type === 'date') return typeof v === 'string' && ISO_RE.test(v) ? v : null;
      return typeof v === 'string' ? v.slice(0, 2000) : (typeof v === 'number' && isFinite(v) ? String(v) : null);
    }));
  }
  const info = d.info && typeof d.info === 'object' ? d.info : {};
  return {
    id: ID_RE.test(d.id) ? d.id : uid(), name: str(d.name, 80, 'Datos') || 'Datos', columns, rows,
    info: { hasHeader: bool(info.hasHeader, true), rowTitles: bool(info.rowTitles, false), periodHeaders: bool(info.periodHeaders, false), title: info.title ? str(info.title, 200) : null },
    v: 1
  };
}
function sanitizeWidget(w) {
  if (!w || typeof w !== 'object' || !VIZ[w.type]) return null;
  const base = newWidget(w.type, null);
  const field = v => (typeof v === 'string' && v.length <= 80 ? v : null);
  return Object.assign(base, {
    id: ID_RE.test(w.id) ? w.id : uid(),
    x: num(w.x, -2000, 20000, 16), y: num(w.y, -2000, 20000, 16), w: num(w.w, 40, 20000, base.w), h: num(w.h, 30, 20000, base.h),
    title: str(w.title, 200), showTitle: bool(w.showTitle, base.showTitle), bg: bool(w.bg, true),
    ds: ID_RE.test(w.ds) ? w.ds : null, cat: field(w.cat), split: field(w.split),
    vals: Array.isArray(w.vals) ? w.vals.map(field).filter(Boolean).slice(0, 40) : [],
    agg: oneOf(w.agg, Object.keys(AGG), 'sum'), grain: oneOf(w.grain, ['auto', 'year', 'quarter', 'month', 'day'], 'auto'),
    sort: oneOf(w.sort, ['auto', 'value-desc', 'value-asc', 'cat-asc', 'cat-desc'], 'auto'), top: num(w.top, 0, 1000, 0),
    fmt: oneOf(w.fmt, ['auto', 'int', 'compact', 'currency', 'currencyCompact', 'percent', 'percentRaw'], 'auto'),
    dec: w.dec == null ? null : num(w.dec, 0, 6, null), currency: oneOf(w.currency, CURRENCIES, 'EUR'),
    labels: bool(w.labels, true), showLegend: bool(w.showLegend, true), gridlines: bool(w.gridlines, true),
    slot: num(w.slot, 0, 7, 0), target: optNum(w.target), gaugeMax: optNum(w.gaugeMax),
    text: str(w.text, 20000), fontSize: num(w.fontSize, 8, 72, 14), align: oneOf(w.align, ['left', 'center', 'right'], 'left'),
    vcenter: bool(w.vcenter, false), img: isSafeImageDataUrl(w.img) ? w.img : null,
    dataBars: bool(w.dataBars, true), totals: bool(w.totals, true), slicerStyle: oneOf(w.slicerStyle, ['list', 'tiles', 'single'], 'list'),
    fillType: oneOf(w.fillType, ['theme', 'solid', 'linear', 'radial'], base.fillType), fill1: hexOr(w.fill1, base.fill1), fill2: hexOr(w.fill2, base.fill2),
    fillAngle: num(w.fillAngle, 0, 360, base.fillAngle), fillAlpha: num(w.fillAlpha, 0, 100, base.fillAlpha),
    borderW: num(w.borderW, 0, 16, base.borderW), borderColor: hexOr(w.borderColor, null), borderStyle: oneOf(w.borderStyle, ['solid', 'dashed', 'dotted', 'double'], 'solid'),
    radius: num(w.radius, 0, 60, base.radius), shadow: oneOf(w.shadow, Object.keys(SHADOWS), base.shadow),
    titleSize: num(w.titleSize, 9, 40, 14), titleColor: hexOr(w.titleColor, null), titleAlign: oneOf(w.titleAlign, ['left', 'center', 'right'], 'left'),
    titleBold: bool(w.titleBold, true), titleItalic: bool(w.titleItalic, false),
    textColor: 'textColor' in w ? hexOr(w.textColor, null) : base.textColor, fontFamily: oneOf(w.fontFamily, Object.keys(FONTS), 'sans'), bold: bool(w.bold, false), italic: bool(w.italic, false),
    lineW: num(w.lineW, 0.5, 10, 2), smooth: bool(w.smooth, false), markers: bool(w.markers, false), barRadius: num(w.barRadius, 0, 30, 4),
    barGap: w.barGap == null ? null : num(w.barGap, 0, 95, null), holeSize: num(w.holeSize, 20, 90, 62), areaAlpha: num(w.areaAlpha, 0, 100, 12),
    shape: oneOf(w.shape, Object.keys(SHAPES), base.shape),
    colors: Array.from({ length: 8 }, (_, i) => hexOr(Array.isArray(w.colors) ? w.colors[i] : null, null))
  });
}
function hexOr(v, def) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : def; }
function sanitizePageBg(b) {
  if (!b || typeof b !== 'object') return null;
  const type = oneOf(b.type, ['solid', 'linear', 'radial'], null);
  if (!type) return null;
  return { type, c1: hexOr(b.c1, '#ffffff'), c2: hexOr(b.c2, '#e4e8ee'), angle: num(b.angle, 0, 360, 180) };
}
function sanitizePage(pg) {
  if (!pg || typeof pg !== 'object') return null;
  const size = oneOf(pg.size, Object.keys(PAGE_SIZES), '16:9');
  const out = {
    id: ID_RE.test(pg.id) ? pg.id : uid(), name: str(pg.name, 60, 'Página') || 'Página', size,
    w: num(pg.w, 320, 4000, PAGE_SIZES[size].w), h: num(pg.h, 240, 12000, PAGE_SIZES[size].h),
    widgets: Array.isArray(pg.widgets) ? pg.widgets.slice(0, 300).map(sanitizeWidget).filter(Boolean) : [],
    bg: sanitizePageBg(pg.bg)
  };
  // Mantener cada visual dentro del lienzo y con ids únicos
  const ids = new Set();
  for (const w of out.widgets) {
    w.w = Math.min(w.w, out.w);
    w.h = Math.min(w.h, out.h);
    w.x = clamp(w.x, 0, out.w - w.w);
    w.y = clamp(w.y, 0, out.h - w.h);
    if (ids.has(w.id)) w.id = uid();
    ids.add(w.id);
  }
  return out;
}
function sanitizeProject(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== '4dash') throw new UserError('El archivo no es un proyecto de 4Dash válido.');
  const datasets = Array.isArray(raw.datasets) ? raw.datasets.slice(0, 60).map(sanitizeDataset).filter(Boolean) : [];
  const pages = Array.isArray(raw.pages) ? raw.pages.slice(0, 60).map(sanitizePage).filter(Boolean) : [];
  if (!pages.length) pages.push(sanitizePage({ name: 'Página 1' }));
  const filters = Array.isArray(raw.filters) ? raw.filters.slice(0, 100).map(f => (f && ID_RE.test(f.ds) && typeof f.field === 'string' && Array.isArray(f.values)) ? {
    ds: f.ds, field: f.field.slice(0, 80), grain: oneOf(f.grain, ['year', 'quarter', 'month', 'day', null, undefined], null) || null,
    values: f.values.filter(v => typeof v === 'string').slice(0, 2000).map(v => v.slice(0, 2000))
  } : null).filter(Boolean) : [];
  return {
    format: '4dash', v: 1,
    title: str(raw.title, 120, 'Dashboard sin título') || 'Dashboard sin título',
    logo: isSafeImageDataUrl(raw.logo, 4 * 1024 * 1024) ? raw.logo : null,
    palette: sanitizePalette(raw.palette),
    datasets, pages, filters,
    active: pages.some(p => p.id === raw.active) ? raw.active : pages[0].id,
    snap: bool(raw.snap, true),
    created: str(raw.created, 40, new Date().toISOString())
  };
}
const jsonReplacer = (k, v) => (typeof k === 'string' && k.startsWith('_') ? undefined : v);

/* ---------- Tutorial ---------- */
const TUTORIAL = [
  { icon: 'sparkles', title: 'Bienvenido a 4Dash', text: [
    '4Dash convierte tus hojas de cálculo (.xlsx, .csv) en un dashboard interactivo en segundos.',
    'Todo se procesa en tu navegador: no se envía ningún dato a Internet y el archivo HTML no carga recursos externos.'],
    list: ['Vista Editor: diseña y configura el dashboard.', 'Vista Presentador: muéstralo a tu cliente a pantalla completa.', 'Pulsa el botón ? cuando quieras volver a ver esta guía.', '4Dash © Vex62 — licencia 4Dash: el uso comercial exige citar claramente al autor.'] },
  { icon: 'upload', title: '1. Importa tus datos', text: ['Pulsa «Importar» en la barra de herramientas o arrastra un archivo .xlsx / .csv sobre el lienzo.'],
    list: ['Si la primera fila tiene títulos, se usan como nombres de columna.', 'Si la primera columna tiene títulos de fila (p. ej. una tabla por meses), se detecta y se crea también la versión transpuesta.', 'Cada hoja del libro se convierte en un origen de datos y en una página.', 'Se genera automáticamente un dashboard con KPIs, gráficos, selector de filtro y tabla.'] },
  { icon: 'grid', title: '2. Diseña en la vista Editor', text: ['Organiza el lienzo libremente:'],
    list: ['Arrastra un visual para moverlo; usa los tiradores azules para cambiar su tamaño.', 'Aparecen guías de color para alinear con otros visuales; mantén Alt para mover sin ajustar a la cuadrícula.', 'Inserta visuales, formas y textos desde el panel «Visualizaciones» o la barra de herramientas.', 'Usa «Alinear» para colocar el visual respecto a la página.', 'Arrastra campos del panel «Datos» a un visual o al lienzo vacío.'] },
  { icon: 'edit', title: '3. Configura cada visual', text: ['Selecciona un visual y usa el panel «Propiedades» de la derecha:'],
    list: ['Datos: origen, eje, leyenda, valores, agregación (suma, promedio…), agrupación de fechas, orden y Top N.', 'Formato: título, formato numérico y moneda, etiquetas, leyenda, color, objetivo del KPI…',
      'Estilo: relleno sólido o degradado, borde (grosor, color, trazo), esquinas, sombras, tipografía, grosor de líneas y colores libres con el selector de color.',
      'Paleta de colores (icono de paleta): elige una paleta incluida o crea la tuya con el selector de color.', 'Con un visual seleccionado, haz clic en otro tipo de la galería para cambiarlo.', '«Ver datos» (menú ⋯ del editor) permite editar celdas, renombrar columnas y cambiar tipos.'] },
  { icon: 'filter', title: '4. Filtra e interactúa', text: ['Los visuales están conectados entre sí (filtrado cruzado):'],
    list: ['Haz clic en una barra, sector o fila para filtrar el resto de la página. Ctrl+clic suma selecciones.', 'En el Editor, el primer clic selecciona el visual y el segundo filtra.', 'Los selectores de filtro filtran todos los visuales del mismo origen.', 'Los filtros activos aparecen sobre el lienzo; pulsa × para quitarlos.'] },
  { icon: 'monitor', title: '5. Presenta', text: ['Cambia a «Presentador» en la barra superior.'],
    list: ['Sube el logo de la empresa o cliente en el recuadro «Logo»: aparecerá en la cabecera.', 'Usa ← → para cambiar de página y F para pantalla completa.', 'Pasa el ratón por los visuales para ver los valores; usa «Ampliar» para verlos a pantalla completa.'] },
  { icon: 'save', title: '6. Guarda y comparte', text: ['Tu trabajo se autoguarda en este navegador.'],
    list: ['«Guardar» descarga un archivo .4dash.json con datos y diseño que puedes abrir más tarde o enviar.', '«Exportar» guarda el dashboard como imagen PNG, SVG o PDF tal y como se ve en el Presentador.', '«Imprimir» genera una página por cada página del dashboard.', 'Exporta a CSV los datos de cualquier visual desde su menú.'], shortcuts: true }
];
const SHORTCUTS = [
  ['Ctrl + Z / Ctrl + Y', 'Deshacer / rehacer'], ['Supr', 'Eliminar el visual seleccionado'], ['Ctrl + D', 'Duplicar visual'],
  ['Ctrl + C / Ctrl + V', 'Copiar / pegar visual'], ['Flechas (Mayús = 10 px)', 'Mover el visual seleccionado'], ['Ctrl + S / Ctrl + O', 'Guardar / abrir proyecto'], ['Ctrl + E', 'Exportar como imagen o PDF'], ['Ctrl + rueda (sobre el lienzo)', 'Zoom del lienzo'],
  ['F5', 'Ir a la vista Presentador'], ['← → / F', 'Páginas y pantalla completa (Presentador)'], ['Esc', 'Deseleccionar / cerrar / salir'], ['F1', 'Abrir este tutorial']
];
function openTutorial(start = 0) {
  let i = start;
  const body = h('div', { class: 'modal-body' });
  const dots = h('div', { class: 'tut-dots grow' });
  const prev = h('button', { class: 'btn', type: 'button', text: 'Anterior' });
  const next = h('button', { class: 'btn primary', type: 'button', text: 'Siguiente' });
  const m = openModal({ title: 'Cómo funciona 4Dash', body, foot: h('div', { class: 'modal-foot' }, dots, prev, next), labelledIcon: 'help' });
  const draw = () => {
    const st = TUTORIAL[i];
    clear(body);
    const content = h('div', null, h('h3', { text: st.title }), st.text.map(t => h('p', { text: t })), st.list ? h('ul', null, st.list.map(t => h('li', { text: t }))) : null);
    body.appendChild(h('div', { class: 'tut-step' }, h('div', { class: 'tut-icon' }, icon(st.icon, 32)), content));
    if (st.shortcuts) {
      const tb = h('table', { class: 'kbd-table' });
      for (const [k, d] of SHORTCUTS) tb.appendChild(h('tr', null, h('td', null, h('kbd', { text: k })), h('td', { text: d })));
      body.appendChild(h('div', { class: 'section-title', text: 'Atajos de teclado' }));
      body.appendChild(tb);
    }
    clear(dots);
    TUTORIAL.forEach((_, k) => {
      const d = h('button', { class: 'tut-dot', type: 'button', 'aria-label': 'Paso ' + (k + 1), 'aria-current': k === i ? 'true' : 'false' });
      d.addEventListener('click', () => { i = k; draw(); });
      dots.appendChild(d);
    });
    prev.disabled = i === 0;
    next.textContent = i === TUTORIAL.length - 1 ? 'Empezar' : 'Siguiente';
  };
  prev.addEventListener('click', () => { if (i > 0) { i--; draw(); } });
  next.addEventListener('click', () => { if (i < TUTORIAL.length - 1) { i++; draw(); } else m.close(); });
  m.el.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && i < TUTORIAL.length - 1) { i++; draw(); }
    if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
  });
  draw();
  return m;
}
