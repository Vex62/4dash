/* ==========================================================================
   Lectura de archivos: XLSX (ZIP + XML) y CSV, sin librerías externas.
   - Descompresión con DecompressionStream nativo del navegador.
   - Límites de tamaño para mitigar "zip bombs" y agotamiento de memoria.
   - XML sin DTD/ENTITY (mitiga XXE y "billion laughs").
   ========================================================================== */

const LIMITS = Object.freeze({
  fileBytes: 30 * 1024 * 1024,      // tamaño máximo del archivo importado
  entryBytes: 150 * 1024 * 1024,    // tamaño máximo descomprimido por entrada
  totalBytes: 300 * 1024 * 1024,    // tamaño máximo descomprimido total
  ratio: 200,                       // ratio máximo de compresión por entrada
  entries: 10000,
  sheets: 30,
  rows: 100000,
  cols: 300,
  cells: 3000000,
  projectBytes: 60 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024
});

/* Política Trusted Types usada SOLO para analizar XML en un documento inerte
   (DOMParser no ejecuta scripts ni carga recursos). */
const xmlPolicy = (window.trustedTypes && window.trustedTypes.createPolicy)
  ? window.trustedTypes.createPolicy('fourdash-xml', { createHTML: s => s })
  : null;

async function inflateRaw(bytes, limit) {
  if (typeof DecompressionStream === 'undefined') {
    throw new UserError('Este navegador no soporta descompresión nativa. Usa una versión reciente de Edge, Chrome, Firefox o Safari, o importa el archivo como CSV.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let len = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    len += value.length;
    if (len > limit) {
      try { await reader.cancel(); } catch { /* ignorar */ }
      throw new UserError('El contenido descomprimido supera el límite permitido (posible "zip bomb"). Archivo rechazado.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Extrae del ZIP solo las entradas que cumplen `wanted(nombre)`. */
async function unzip(buf, wanted) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const bad = () => new UserError('El archivo no es un Excel (.xlsx) válido o está dañado.');
  if (u8.length < 22) throw bad();
  let eocd = -1;
  for (let i = u8.length - 22, stop = Math.max(0, u8.length - 65557); i >= stop; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw bad();
  const count = dv.getUint16(eocd + 10, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) throw new UserError('Formato ZIP64 no soportado. Guarda el libro de nuevo desde Excel.');
  if (count > LIMITS.entries) throw new UserError('El archivo contiene demasiadas entradas internas.');
  const dec = new TextDecoder('utf-8');
  const out = new Map();
  let p = cdOff, total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw bad();
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!wanted(name)) continue;
    if (flags & 1) throw new UserError('El libro está protegido con contraseña (cifrado). Quita la protección y vuelve a intentarlo.');
    if (lo + 30 > u8.length || dv.getUint32(lo, true) !== 0x04034b50) throw bad();
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    if (start + csize > u8.length) throw bad();
    if (usize > LIMITS.entryBytes || (csize > 0 && usize / csize > LIMITS.ratio && usize > 10 * 1024 * 1024)) {
      throw new UserError('Una parte del archivo tiene un tamaño o ratio de compresión sospechoso. Archivo rechazado.');
    }
    const raw = u8.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw, Math.min(LIMITS.entryBytes, Math.max(usize, 1) * 1.01 + 1024));
    else throw new UserError('Método de compresión no soportado en el archivo.');
    total += data.length;
    if (total > LIMITS.totalBytes) throw new UserError('El contenido descomprimido total supera el límite permitido.');
    out.set(name, data);
  }
  return out;
}

function parseXml(u8) {
  const txt = new TextDecoder('utf-8').decode(u8);
  if (/<!DOCTYPE|<!ENTITY/i.test(txt)) throw new UserError('El archivo contiene declaraciones XML no permitidas (DTD/ENTITY). Archivo rechazado por seguridad.');
  const doc = new DOMParser().parseFromString(xmlPolicy ? xmlPolicy.createHTML(txt) : txt, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new UserError('El archivo Excel contiene XML mal formado.');
  return doc;
}
const tags = (node, name) => node.getElementsByTagNameNS('*', name);
function childEl(node, name) {
  for (const c of node.children) if (c.localName === name) return c;
  return null;
}
function textOfRich(node) {
  if (!node) return '';
  let out = '';
  for (const t of tags(node, 't')) {
    let anc = t.parentNode, skip = false;
    while (anc && anc !== node) { if (anc.localName === 'rPh') { skip = true; break; } anc = anc.parentNode; }
    if (!skip) out += t.textContent;
  }
  return out;
}
function colIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
    else break;
  }
  return n - 1;
}
const DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateFormat(code) {
  if (!code) return false;
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').toLowerCase();
  if (/^general$/.test(c)) return false;
  return /[dmyhs]/.test(c) && !/[#0?]/.test(c.replace(/[dmyhs:.\-/ ,]/g, ''));
}
function serialToDate(n, date1904) {
  const ms = Math.round((n + (date1904 ? 1462 : 0)) * 86400000);
  return new Date(Date.UTC(1899, 11, 30) + ms);
}
function dateToIso(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  const iso = d.toISOString();
  return iso.slice(11, 16) === '00:00' ? iso.slice(0, 10) : iso.slice(0, 16);
}

/** Lee un .xlsx y devuelve [{name, grid, hidden}] (grid = matriz de valores). */
async function parseXlsx(buf) {
  const files = await unzip(buf, n =>
    n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' ||
    n === 'xl/styles.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (!files.has('xl/workbook.xml')) {
    throw new UserError('No se encontró un libro de Excel válido. ¿Es un .xlsx? (Los .xls antiguos no están soportados: guárdalo como .xlsx o CSV).');
  }
  const wb = parseXml(files.get('xl/workbook.xml'));
  const date1904 = Array.from(tags(wb, 'workbookPr')).some(e => /^(1|true)$/i.test(e.getAttribute('date1904') || ''));

  const rels = new Map();
  if (files.has('xl/_rels/workbook.xml.rels')) {
    for (const r of tags(parseXml(files.get('xl/_rels/workbook.xml.rels')), 'Relationship')) {
      rels.set(r.getAttribute('Id'), r.getAttribute('Target') || '');
    }
  }
  const sst = [];
  if (files.has('xl/sharedStrings.xml')) {
    for (const si of tags(parseXml(files.get('xl/sharedStrings.xml')), 'si')) sst.push(textOfRich(si));
  }
  const xfDate = [];
  if (files.has('xl/styles.xml')) {
    const st = parseXml(files.get('xl/styles.xml'));
    const custom = new Map();
    for (const f of tags(st, 'numFmt')) custom.set(+f.getAttribute('numFmtId'), f.getAttribute('formatCode'));
    const cellXfs = tags(st, 'cellXfs')[0];
    if (cellXfs) {
      for (const xf of cellXfs.children) {
        if (xf.localName !== 'xf') continue;
        const id = +(xf.getAttribute('numFmtId') || 0);
        xfDate.push(DATE_FMT_IDS.has(id) || (custom.has(id) && isDateFormat(custom.get(id))));
      }
    }
  }
  const sheets = [];
  let cellBudget = LIMITS.cells;
  for (const sh of tags(wb, 'sheet')) {
    if (sheets.length >= LIMITS.sheets) break;
    let rid = null;
    for (const a of sh.attributes) if (a.localName === 'id') rid = a.value;
    let target = rels.get(rid) || '';
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    const parts = [];
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
    const path = parts.join('/');
    if (!files.has(path)) continue;
    const res = readSheet(parseXml(files.get(path)), sst, xfDate, date1904, cellBudget);
    cellBudget -= res.cells;
    sheets.push({ name: (sh.getAttribute('name') || 'Hoja').slice(0, 80), grid: res.grid, truncated: res.truncated, hidden: /hidden/i.test(sh.getAttribute('state') || '') });
    if (cellBudget <= 0) break;
  }
  if (!sheets.length) throw new UserError('El libro no contiene hojas con datos.');
  return sheets;
}

function readSheet(doc, sst, xfDate, date1904, budget) {
  const grid = [];
  let truncated = false, cells = 0, autoRow = 0;
  for (const r of tags(doc, 'row')) {
    const ri = (+r.getAttribute('r') || autoRow + 1) - 1;
    autoRow = ri + 1;
    if (ri >= LIMITS.rows + 50) { truncated = true; break; }
    const arr = [];
    let ci = 0;
    for (const c of r.children) {
      if (c.localName !== 'c') continue;
      const ref = c.getAttribute('r');
      if (ref) ci = colIndex(ref);
      if (ci < 0 || ci >= LIMITS.cols) { truncated = truncated || ci >= LIMITS.cols; ci++; continue; }
      const t = c.getAttribute('t');
      const vEl = childEl(c, 'v');
      let v = null;
      if (t === 's') v = vEl ? (sst[+vEl.textContent] ?? '') : null;
      else if (t === 'inlineStr') v = textOfRich(childEl(c, 'is'));
      else if (t === 'str') v = vEl ? vEl.textContent : null;
      else if (t === 'b') v = vEl ? vEl.textContent === '1' : null;
      else if (t === 'e') v = null;
      else if (t === 'd') { if (vEl) { const d = new Date(vEl.textContent); v = isNaN(d) ? vEl.textContent : d; } }
      else if (vEl) {
        const n = Number(vEl.textContent);
        if (isFinite(n)) v = xfDate[+(c.getAttribute('s') || 0)] ? serialToDate(n, date1904) : n;
      }
      if (v !== null && v !== '') { arr[ci] = v; cells++; }
      ci++;
    }
    if (arr.length) grid[ri] = arr;
    if (cells > budget) { truncated = true; break; }
  }
  return { grid, truncated, cells };
}

/* ---------- CSV ---------- */
function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch { text = new TextDecoder('windows-1252').decode(u8); }
  return text.replace(/^﻿/, '');
}
function detectDelimiter(text) {
  const sample = text.slice(0, 20000).split(/\r?\n/).slice(0, 10);
  let best = ',', bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = sample.map(l => l.split(d).length - 1).filter(n => n > 0);
    if (!counts.length) continue;
    const consistent = counts.filter(c => c === counts[0]).length / counts.length;
    const score = counts[0] * consistent + counts.length;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
function parseCsv(text) {
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [], field = '', q = false, i = 0, cells = 0;
  const n = text.length;
  const pushField = () => { row.push(field); field = ''; cells++; };
  while (i < n) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { q = true; i++; continue; }
    if (ch === delim) { pushField(); i++; continue; }
    if (ch === '\r' || ch === '\n') {
      pushField(); rows.push(row.length > LIMITS.cols ? row.slice(0, LIMITS.cols) : row); row = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      if (rows.length > LIMITS.rows + 50 || cells > LIMITS.cells) break;
      continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length) { pushField(); rows.push(row); }
  return { grid: rows, decimalComma: delim === ';' || delim === '\t' };
}

/* ---------- Interpretación de valores ---------- */
function parseNumberStr(str, decimalComma) {
  let s = String(str).trim();
  if (!s || s.length > 40) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const pct = /%\s*$/.test(s);
  s = s.replace(/[\s  €$£¥%]|EUR|USD/gi, '');
  if (/^[+-]/.test(s)) { if (s[0] === '-') neg = !neg; s = s.slice(1); }
  if (!/^\d[\d.,]*(e[+-]?\d+)?$/i.test(s) && !/^[.,]\d+$/.test(s)) return null;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s) && !decimalComma) s = s.replace(/,/g, '');
    else if ((s.match(/,/g) || []).length > 1) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    if ((s.match(/\./g) || []).length > 1 || (decimalComma && /^\d{1,3}(\.\d{3})+$/.test(s))) s = s.replace(/\./g, '');
  }
  let v = Number(s);
  if (!isFinite(v)) return null;
  if (neg) v = -v;
  if (pct) v = v / 100;
  return v;
}
function parseDateStr(str) {
  const s = String(str).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
  let y, mo, d, hh = 0, mi = 0;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; hh = +(m[4] || 0); mi = +(m[5] || 0); }
  else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
    if (!m) return null;
    let a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += y < 50 ? 2000 : 1900;
    if (b > 12 && a <= 12) { mo = a; d = b; } else { d = a; mo = b; }
    hh = +(m[4] || 0); mi = +(m[5] || 0);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1800 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mi));
  if (dt.getUTCDate() !== d) return null;
  return dateToIso(dt);
}
const PERIOD_RE = /^(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|jan|apr|aug|dec)[a-z.]*(\s*'?\d{2,4})?$|^(q|t)[1-4](\s*\d{2,4})?$|^(19|20)\d{2}$|^(s|h)[12]$/i;
function looksLikePeriod(v) {
  if (v instanceof Date) return true;
  const t = String(v).trim();
  return PERIOD_RE.test(t) || !!parseDateStr(t);
}

/**
 * Convierte una matriz de celdas en una tabla tipada.
 * Detecta: filas de título, fila de cabecera (títulos de columnas),
 * primera columna de títulos de fila, tipo de cada columna.
 */
function buildTable(grid, opts = {}) {
  const decimalComma = !!opts.decimalComma;
  const norm = v => {
    if (v == null) return null;
    if (typeof v === 'string') { const t = v.replace(/\u0000/g, '').trim(); return t === '' ? null : t.slice(0, 2000); }
    return v;
  };
  // Matriz densa sin filas/columnas vacías
  let rows = [];
  let width = 0;
  for (let i = 0; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const nr = [];
    let any = false;
    for (let j = 0; j < r.length; j++) { const v = norm(r[j]); nr[j] = v; if (v !== null) any = true; }
    if (any) { rows.push(nr); width = Math.max(width, nr.length); }
  }
  if (!rows.length) return null;
  const usedCols = [];
  for (let j = 0; j < width; j++) if (rows.some(r => r[j] != null)) usedCols.push(j);
  rows = rows.map(r => usedCols.map(j => (r[j] === undefined ? null : r[j])));
  width = usedCols.length;

  const isTextual = v => typeof v === 'string' && parseNumberStr(v, decimalComma) === null && !parseDateStr(v);
  // Filas de título (una sola celda con texto encima de la tabla)
  let title = null;
  while (rows.length > 2 && width > 1) {
    const filled = rows[0].filter(v => v != null);
    if (filled.length === 1 && typeof filled[0] === 'string' && rows[1].filter(v => v != null).length > 1) {
      title = title ? title + ' · ' + filled[0] : filled[0];
      rows.shift();
    } else break;
  }
  // Cabecera
  const first = rows[0];
  const filled0 = first.filter(v => v != null);
  const textCount = filled0.filter(isTextual).length;
  const uniq = new Set(filled0.map(v => String(v).toLowerCase())).size === filled0.length;
  let hasHeader = false;
  if (rows.length > 1 && filled0.length >= Math.max(1, Math.ceil(width * 0.5)) && uniq) {
    if (textCount === filled0.length) hasHeader = true;
    else if (textCount >= filled0.length * 0.6) {
      // p. ej. ["Región", 2022, 2023, 2024]: cabecera con años
      hasHeader = filled0.every(v => isTextual(v) || looksLikePeriod(v));
    }
  }
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length > LIMITS.rows) body.length = LIMITS.rows;

  const names = [];
  const seen = new Map();
  for (let j = 0; j < width; j++) {
    let n = hasHeader && first[j] != null ? (first[j] instanceof Date ? dateToIso(first[j]) : String(first[j])) : `Columna ${j + 1}`;
    n = n.replace(/\s+/g, ' ').trim().slice(0, 80) || `Columna ${j + 1}`;
    const k = n.toLowerCase();
    if (seen.has(k)) { const c = seen.get(k) + 1; seen.set(k, c); n = `${n} (${c})`; } else seen.set(k, 1);
    names.push(n);
  }

  // Tipos de columna
  const columns = [];
  const typed = body.map(() => new Array(width).fill(null));
  for (let j = 0; j < width; j++) {
    let nNum = 0, nDate = 0, nBool = 0, nonNull = 0;
    for (const r of body) {
      const v = r[j];
      if (v == null) continue;
      nonNull++;
      if (v instanceof Date) nDate++;
      else if (typeof v === 'number') nNum++;
      else if (typeof v === 'boolean') nBool++;
      else if (parseNumberStr(v, decimalComma) !== null) nNum++;
      else if (parseDateStr(v)) nDate++;
    }
    let type = 'text';
    if (nonNull && nDate / nonNull >= 0.8) type = 'date';
    else if (nonNull && nNum / nonNull >= 0.8) type = 'number';
    for (let i = 0; i < body.length; i++) {
      const v = body[i][j];
      let out = null;
      if (v != null) {
        if (type === 'number') out = typeof v === 'number' ? v : (typeof v === 'string' ? parseNumberStr(v, decimalComma) : null);
        else if (type === 'date') out = v instanceof Date ? dateToIso(v) : (typeof v === 'string' ? parseDateStr(v) : null);
        else out = v instanceof Date ? fmtDateKey(dateToIso(v)) : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v);
      }
      typed[i][j] = out;
    }
    columns.push({ name: names[j], type });
  }
  markColumnRoles(columns, typed);

  // ¿Títulos de fila? Primera columna textual, valores casi únicos y resto numérico
  const numericOthers = columns.slice(1).filter(c => c.type === 'number').length;
  let rowTitles = false;
  if (columns.length >= 3 && columns[0].type === 'text' && numericOthers >= 2 && numericOthers >= (columns.length - 1) * 0.8) {
    const vals = typed.map(r => r[0]).filter(v => v != null);
    rowTitles = vals.length > 0 && new Set(vals).size >= vals.length * 0.9;
  }
  const periodHeaders = hasHeader && columns.slice(1).filter(c => c.type === 'number' && looksLikePeriod(c.name)).length >= 3;
  return { columns, rows: typed, info: { hasHeader, rowTitles, periodHeaders, title, truncated: rows.length - (hasHeader ? 1 : 0) > LIMITS.rows } };
}

/** Marca columnas tipo "ID" o "año" para que el diseño automático no las sume. */
function markColumnRoles(columns, rows) {
  columns.forEach((c, j) => {
    c.role = null;
    if (c.type !== 'number') return;
    const name = c.name.toLowerCase();
    // Límites de palabra compatibles con Unicode (\b no reconoce "º", "ó"…)
    if (/(?:^|[^\p{L}\p{N}])(id|código|codigo|cod|code|n\.?º|nº|no\.|num\.?|número|numero|ref\.?|referencia|cp|zip|dni|nif|cif)(?=$|[^\p{L}\p{N}])/u.test(name)) { c.role = 'id'; return; }
    let ints = 0, years = 0, n = 0, mn = Infinity, mx = -Infinity;
    const seen = new Set();
    for (const r of rows) {
      const v = r[j];
      if (v == null) continue;
      n++;
      if (Number.isInteger(v)) { ints++; if (v >= 1900 && v <= 2100) years++; }
      seen.add(v); mn = Math.min(mn, v); mx = Math.max(mx, v);
      if (n > 5000) break;
    }
    if (n && years === n && /(año|ano|year|ejercicio|periodo|período)/.test(name)) { c.role = 'year'; return; }
    // Enteros únicos y casi consecutivos (1001, 1002, …): es un identificador, no una medida
    if (n >= 20 && ints === n && seen.size === n && mx - mn + 1 <= n * 1.5) c.role = 'id';
  });
}

/** Lee un archivo (File) y devuelve tablas [{name, columns, rows, info}]. */
async function importFile(file) {
  if (!file) throw new UserError('No se seleccionó ningún archivo.');
  if (file.size > LIMITS.fileBytes) throw new UserError(`El archivo supera el tamaño máximo (${Math.round(LIMITS.fileBytes / 1048576)} MB).`);
  const name = String(file.name || 'datos');
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  const tables = [];
  if (isOle) throw new UserError('Formato .xls antiguo (o archivo cifrado) no soportado. Ábrelo en Excel y guárdalo como .xlsx o CSV.');
  if (isZip) {
    if (!['xlsx', 'xlsm', 'xltx', 'xltm', ''].includes(ext)) throw new UserError('Tipo de archivo no soportado. Usa .xlsx, .xlsm o .csv.');
    const sheets = await parseXlsx(buf);
    for (const sh of sheets) {
      const t = buildTable(sh.grid);
      if (t) tables.push({ name: sh.name, ...t, hidden: sh.hidden, truncated: sh.truncated || t.info.truncated });
    }
  } else {
    if (!['csv', 'tsv', 'txt'].includes(ext)) throw new UserError('Tipo de archivo no soportado. Usa .xlsx, .xlsm o .csv.');
    const text = decodeText(buf);
    if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 4096))) throw new UserError('El archivo no parece texto CSV válido.');
    const { grid, decimalComma } = parseCsv(text);
    const t = buildTable(grid, { decimalComma });
    if (t) tables.push({ name: name.replace(/\.[^.]+$/, '').slice(0, 80), ...t, truncated: t.info.truncated });
  }
  if (!tables.length) throw new UserError('No se encontraron datos en el archivo.');
  return tables;
}
