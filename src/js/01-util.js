/* ==========================================================================
   Utilidades: construcción segura del DOM (sin innerHTML), iconos, formato.
   ========================================================================== */

/** Error con mensaje apto para mostrarse al usuario. */
class UserError extends Error {}

const $ = (sel, root = document) => root.querySelector(sel);

const SAFE_PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'htmlFor', 'tabIndex', 'multiple', 'indeterminate']);

/**
 * Crea un elemento HTML. Todo el texto se inserta con textContent / nodos de
 * texto, nunca como HTML, de modo que los datos del Excel no pueden inyectar
 * marcado (OWASP A03 - XSS).
 */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'style') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (SAFE_PROPS.has(k)) el[k] = v;
      else if (k === 'innerHTML' || k === 'outerHTML' || k === 'srcdoc' || /^on/i.test(k)) throw new Error('Propiedad no permitida: ' + k);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendKids(el, kids);
  return el;
}
function appendKids(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) appendKids(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
function clear(el) { el.replaceChildren(); return el; }

const SVGNS = 'http://www.w3.org/2000/svg';
/** Crea un elemento SVG con atributos (nunca 'style', bloqueado por la CSP). */
function s(tag, attrs, parent) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

/* ---------- Iconos (trazos 24x24 dibujados a mano, sin fuentes externas) ---------- */
const ICONS = {
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  table: 'M3 4h18v16H3z|M3 9h18|M3 14.5h18|M9 4v16',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z|M19 16v5|M16.5 18.5h5',
  undo: 'M9 14L4 9l5-5|M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5|M20 9H9a5 5 0 0 0 0 10h3',
  copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
  trash: 'M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6|M10 11v6|M14 11v6',
  front: 'M9 9h11v11H9z|M15 5V4H4v11h1',
  back: 'M4 4h11v11H4z|M19 9h1v11H9v-1',
  grid: 'M4 4h6v6H4z|M14 4h6v6h-6z|M14 14h6v6h-6z|M4 14h6v6H4z',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z|M17 21v-8H7v8|M7 3v5h8',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  print: 'M6 9V2h12v7|M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2|M6 14h12v8H6z',
  plus: 'M12 5v14|M5 12h14',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6',
  wand: 'M15 4V2|M15 16v-2|M8 9h2|M20 9h2|M17.8 11.8L19 13|M17.8 6.2L19 5|M3 21l9-9|M12.2 6.2L11 5',
  column: 'M5 20V12|M10 20V5|M15 20v-9|M20 20V8',
  bar: 'M4 5h10|M4 10h16|M4 15h7|M4 20h13',
  stacked: 'M4 20h4v-8H4z|M4 12h4V8H4z|M10 20h4V10h-4z|M10 10h4V4h-4z|M16 20h4v-5h-4z|M16 15h4v-4h-4z',
  line: 'M3 3v18h18|M7 15l4-4 3 3 6-6',
  area: 'M3 3v18h18|M3 17l5-6 4 3 8-7v11H3z',
  pie: 'M21.2 15.9A10 10 0 1 1 8 2.8|M22 12A10 10 0 0 0 12 2v10z',
  donut: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z|M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
  scatter: 'M3 3v18h18|M8 16h.01|M11 11h.01|M15 14h.01|M17 7h.01|M19 11h.01',
  kpi: 'M3 5h18v14H3z|M7 14l3-3 2 2 4-4',
  gauge: 'M12 15l4-5|M3.3 19a10 10 0 1 1 17.4 0',
  treemap: 'M3 3h18v18H3z|M12 3v18|M12 12h9|M3 14h9',
  text: 'M4 7V4h16v3|M9 20h6|M12 4v16',
  slicer: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  image: 'M3 3h18v18H3z|M8.5 10a1.5 1.5 0 1 0 0-3a1.5 1.5 0 1 0 0 3z|M21 15l-5-5L5 21',
  help: 'M12 22a10 10 0 1 0 0-20a10 10 0 1 0 0 20z|M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3|M12 17h.01',
  sun: 'M12 16a4 4 0 1 0 0-8a4 4 0 1 0 0 8z|M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  fullscreen: 'M8 3H5a2 2 0 0 0-2 2v3|M21 8V5a2 2 0 0 0-2-2h-3|M3 16v3a2 2 0 0 0 2 2h3|M16 21h3a2 2 0 0 0 2-2v-3',
  chevL: 'M15 18l-6-6 6-6',
  chevR: 'M9 18l6-6-6-6',
  chevD: 'M6 9l6 6 6-6',
  close: 'M18 6L6 18|M6 6l12 12',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6z',
  edit: 'M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  more: 'M5 12h.01|M12 12h.01|M19 12h.01',
  monitor: 'M2 4h20v13H2z|M8 21h8|M12 17v4',
  calendar: 'M3 5h18v16H3z|M3 10h18|M8 3v4|M16 3v4',
  hash: 'M4 9h16|M4 15h16|M10 3L8 21|M16 3l-2 18',
  abc: 'M4 18l3.5-10L11 18|M5.2 14.5h4.6|M14 8v10h3.5a2.5 2.5 0 0 0 0-5H14|M14 13h3a2.5 2.5 0 0 0 0-5h-3',
  check: 'M20 6L9 17l-5-5',
  expand: 'M15 3h6v6|M9 21H3v-6|M21 3l-7 7|M3 21l7-7',
  fit: 'M3 9V3h6|M21 9V3h-6|M3 15v6h6|M21 15v6h-6|M8 8h8v8H8z',
  panelL: 'M3 3h18v18H3z|M9 3v18',
  panelR: 'M3 3h18v18H3z|M15 3v18',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z|M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5|M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  rename: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4|M13.5 6.5l4 4',
  swap: 'M16 3l4 4-4 4|M20 7H4|M8 21l-4-4 4-4|M4 17h16',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|M9 12l2 2 4-4',
  keyboard: 'M2 6h20v12H2z|M6 10h.01|M10 10h.01|M14 10h.01|M18 10h.01|M7 14h10',
  page: 'M4 3h16v18H4z|M8 7h8|M8 11h8|M8 15h5',
  info: 'M12 22a10 10 0 1 0 0-20a10 10 0 1 0 0 20z|M12 16v-4|M12 8h.01',
  focus: 'M3 7V3h4|M17 3h4v4|M21 17v4h-4|M7 21H3v-4',
  lock: 'M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4'
};
const BOLD_ICONS = new Set(['more', 'scatter']);
function icon(name, size = 16, extraClass = '') {
  const svg = s('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': BOLD_ICONS.has(name) ? 3 : 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    class: 'ico ' + extraClass, 'aria-hidden': 'true', focusable: 'false'
  });
  for (const d of (ICONS[name] || ICONS.info).split('|')) s('path', { d }, svg);
  return svg;
}
function brandMark(size = 22) {
  const svg = s('svg', { viewBox: '0 0 32 32', width: size, height: size, class: 'brand-mark', 'aria-hidden': 'true' });
  s('rect', { x: 4, y: 17, width: 6, height: 11, rx: 1.5, fill: '#f2c811' }, svg);
  s('rect', { x: 13, y: 10, width: 6, height: 18, rx: 1.5, fill: '#f2c811', opacity: .85 }, svg);
  s('rect', { x: 22, y: 4, width: 6, height: 24, rx: 1.5, fill: '#f2c811', opacity: .7 }, svg);
  return svg;
}

/* ---------- Formato ---------- */
const LOCALE = 'es-ES';
const nfCache = new Map();
function nf(opts) {
  const k = JSON.stringify(opts);
  let f = nfCache.get(k);
  if (!f) { f = new Intl.NumberFormat(LOCALE, opts); nfCache.set(k, f); }
  return f;
}
const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'COP', 'ARS', 'CLP', 'PEN', 'BRL', 'CHF', 'JPY'];
/** Formatea un número según el formato elegido en el widget. */
function fmtNum(v, fmt = 'auto', dec = null, currency = 'EUR') {
  if (v == null || typeof v !== 'number' || !isFinite(v)) return '—';
  const d = dec == null || dec === '' ? null : Math.max(0, Math.min(6, +dec));
  try {
    switch (fmt) {
      case 'int': return nf({ maximumFractionDigits: 0, useGrouping: true }).format(v);
      case 'compact': return nf({ notation: 'compact', maximumFractionDigits: d ?? 1 }).format(v);
      case 'currency': return nf({ style: 'currency', currency: CURRENCIES.includes(currency) ? currency : 'EUR', maximumFractionDigits: d ?? 2, minimumFractionDigits: d ?? 0 }).format(v);
      case 'currencyCompact': return nf({ style: 'currency', currency: CURRENCIES.includes(currency) ? currency : 'EUR', notation: 'compact', maximumFractionDigits: d ?? 1 }).format(v);
      case 'percent': return nf({ style: 'percent', maximumFractionDigits: d ?? 1 }).format(v);
      case 'percentRaw': return nf({ maximumFractionDigits: d ?? 1 }).format(v) + ' %';
      default: return nf({ maximumFractionDigits: d ?? (Math.abs(v) >= 1000 ? 0 : 2), useGrouping: true }).format(v);
    }
  } catch { return String(v); }
}
function fmtAxis(v, fmt, currency) {
  if (fmt === 'percent') return nf({ style: 'percent', maximumFractionDigits: 1 }).format(v);
  if (fmt === 'currency' || fmt === 'currencyCompact') return nf({ style: 'currency', currency: CURRENCIES.includes(currency) ? currency : 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(v);
  if (Math.abs(v) < 1000) return nf({ maximumFractionDigits: 2 }).format(v);
  return nf({ notation: 'compact', maximumFractionDigits: 1 }).format(v);
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Etiqueta legible para una clave de fecha ISO agrupada. */
function fmtDateKey(key, grain) {
  if (typeof key !== 'string') return String(key);
  if (grain === 'year') return key.slice(0, 4);
  if (grain === 'quarter') return key.replace(/^(\d{4})-Q(\d)$/, 'T$2 $1');
  if (grain === 'month') { const m = +key.slice(5, 7); return (MONTHS[m - 1] || '') + ' ' + key.slice(0, 4); }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(key);
  if (m) return `${m[3]}/${m[2]}/${m[1]}` + (m[4] && m[4] !== '00:00' ? ' ' + m[4] : '');
  return key;
}

/* ---------- Varios ---------- */
function uid() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function deepClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

/** Descarga un contenido como archivo (Blob local, sin red). */
function downloadFile(name, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: safeFileName(name) });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function safeFileName(name) {
  return String(name || 'archivo').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'archivo';
}

/**
 * Escapa una celda para CSV evitando "CSV/Formula Injection" (OWASP):
 * los textos que empiezan por = + - @ tab o CR se prefijan con un apóstrofo.
 */
function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v).replace('.', ',') : '';
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  if (/[";\r\n]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
  return t;
}
function toCsv(header, rows) {
  const lines = [header.map(csvCell).join(';')];
  for (const r of rows) lines.push(r.map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n');
}

/* Medición de texto con canvas (sin tocar el DOM) */
const measureCtx = document.createElement('canvas').getContext('2d');
function textWidth(text, px = 11, weight = 400) {
  measureCtx.font = `${weight} ${px}px "Segoe UI", system-ui, sans-serif`;
  return measureCtx.measureText(String(text)).width;
}
function truncateText(text, maxPx, px = 11, weight = 400) {
  text = String(text);
  if (maxPx <= 8) return '';
  if (textWidth(text, px, weight) <= maxPx) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(text.slice(0, mid) + '…', px, weight) <= maxPx) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + '…' : '';
}
