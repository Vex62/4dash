/* ==========================================================================
   Modelo de datos: datasets, agregación, filtros y diseño automático.
   ========================================================================== */

const BLANK = '(En blanco)';
const OTHER = 'Otros';
const PAGE_W = 1280;
const PAGE_SIZES = {
  '16:9': { w: 1280, h: 720, label: 'Panorámico 16:9' },
  '4:3': { w: 1280, h: 960, label: 'Estándar 4:3' },
  'long': { w: 1280, h: 1600, label: 'Largo (desplazable)' },
  'a4p': { w: 1280, h: 1810, label: 'A4 vertical' },
  'custom': { w: 1280, h: 720, label: 'Personalizado' }
};
const AGG = {
  sum: { label: 'Suma', of: 'Suma de' },
  avg: { label: 'Promedio', of: 'Promedio de' },
  count: { label: 'Recuento', of: 'Recuento de' },
  distinct: { label: 'Recuento distinto', of: 'Recuento distinto de' },
  min: { label: 'Mínimo', of: 'Mínimo de' },
  max: { label: 'Máximo', of: 'Máximo de' },
  median: { label: 'Mediana', of: 'Mediana de' }
};
const VIZ = {
  column: { label: 'Columnas agrupadas', icon: 'column', cat: true, vals: 'num', split: true },
  stacked: { label: 'Columnas apiladas', icon: 'stacked', cat: true, vals: 'num', split: true },
  bar: { label: 'Barras', icon: 'bar', cat: true, vals: 'num', split: true },
  line: { label: 'Líneas', icon: 'line', cat: true, vals: 'num', split: true },
  area: { label: 'Área', icon: 'area', cat: true, vals: 'num', split: true },
  pie: { label: 'Circular', icon: 'pie', cat: true, vals: 'num1' },
  donut: { label: 'Anillo', icon: 'donut', cat: true, vals: 'num1' },
  treemap: { label: 'Mapa de árbol', icon: 'treemap', cat: true, vals: 'num1' },
  scatter: { label: 'Dispersión', icon: 'scatter', cat: true, vals: 'xy', split: true },
  kpi: { label: 'Tarjeta KPI', icon: 'kpi', cat: true, vals: 'num1' },
  gauge: { label: 'Medidor', icon: 'gauge', vals: 'num1' },
  table: { label: 'Tabla', icon: 'table', cat: true, vals: 'any' },
  slicer: { label: 'Selector de filtro', icon: 'slicer', cat: true },
  text: { label: 'Cuadro de texto', icon: 'text' },
  image: { label: 'Imagen', icon: 'image' },
  shape: { label: 'Forma', icon: 'shape' }
};
const DEFAULT_SIZE = {
  kpi: [288, 128], gauge: [304, 224], slicer: [240, 288], text: [400, 128], image: [240, 160], shape: [240, 160],
  table: [624, 320], pie: [400, 304], donut: [400, 304], treemap: [480, 304], scatter: [480, 320]
};

/** Visuales que no usan datos. */
const NO_DATA_VIZ = ['text', 'image', 'shape'];
/** Formato visual (relleno, borde, sombra, título, tipografía y gráficos). */
const WIDGET_STYLE_DEFAULTS = {
  fillType: 'theme', fill1: '#ffffff', fill2: '#dfe6fb', fillAngle: 135, fillAlpha: 100,
  borderW: 0, borderColor: null, borderStyle: 'solid', radius: 6, shadow: 'soft',
  titleSize: 14, titleColor: null, titleAlign: 'left', titleBold: true, titleItalic: false,
  textColor: null, fontFamily: 'sans', bold: false, italic: false,
  lineW: 2, smooth: false, markers: false, barRadius: 4, barGap: null, holeSize: 62, areaAlpha: 12,
  shape: 'round'
};
const SHAPES = { rect: 'Rectángulo', round: 'Rectángulo redondeado', ellipse: 'Elipse', triangle: 'Triángulo', diamond: 'Rombo', hexagon: 'Hexágono', arrow: 'Flecha', chevron: 'Cheurón', line: 'Línea', banner: 'Pestaña' };
const FONTS = {
  sans: { label: 'Sans (sistema)', css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  serif: { label: 'Serif', css: 'Georgia, Cambria, "Times New Roman", serif' },
  mono: { label: 'Monoespaciada', css: 'ui-monospace, Consolas, "Cascadia Mono", Menlo, monospace' },
  rounded: { label: 'Redondeada', css: 'ui-rounded, "Trebuchet MS", "Segoe UI", system-ui, sans-serif' },
  condensed: { label: 'Estrecha', css: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif' }
};
const SHADOWS = { none: 'Sin sombra', soft: 'Suave', medium: 'Media', strong: 'Intensa', float: 'Flotante', glow: 'Resplandor' };
function newWidget(type, ds, extra) {
  const [w, h] = DEFAULT_SIZE[type] || [480, 304];
  return Object.assign({
    id: uid(), type, x: 16, y: 16, w, h,
    title: '', showTitle: !NO_DATA_VIZ.includes(type), bg: true,
    ds: ds ? ds.id : null, cat: null, split: null, vals: [], agg: 'sum', grain: 'auto',
    sort: 'auto', top: 0, fmt: 'auto', dec: null, currency: 'EUR',
    labels: true, showLegend: true, gridlines: true, slot: 0, target: null,
    text: '', fontSize: 14, align: 'left', vcenter: false, img: null,
    dataBars: true, totals: true, slicerStyle: 'list', z: 0,
    ...WIDGET_STYLE_DEFAULTS,
    ...(type === 'shape' ? { fillType: 'solid', fill1: '#3a5ccc', fill2: '#7c96e8', shadow: 'none', textColor: '#ffffff', align: 'center', fontSize: 16 } : null),
    colors: Array(8).fill(null)
  }, extra || {});
}

/* ---------- Acceso a columnas ---------- */
function colIdx(ds, name) { return name == null ? -1 : ds.columns.findIndex(c => c.name === name); }
function colOf(ds, name) { const i = colIdx(ds, name); return i < 0 ? null : ds.columns[i]; }
function effectiveGrain(ds, w, field = w.cat) {
  const i = colIdx(ds, field);
  if (i < 0 || ds.columns[i].type !== 'date') return null;
  if (w.grain && w.grain !== 'auto') return w.grain;
  return autoGrain(ds, i);
}
function autoGrain(ds, i) {
  ds._grainCache = ds._grainCache || {};
  if (ds._grainCache[i]) return ds._grainCache[i];
  let lo = null, hi = null;
  for (const r of ds.rows) { const v = r[i]; if (v == null) continue; if (lo == null || v < lo) lo = v; if (hi == null || v > hi) hi = v; }
  let g = 'day';
  if (lo && hi) {
    const days = (Date.parse(hi.slice(0, 10)) - Date.parse(lo.slice(0, 10))) / 86400000;
    g = days > 365 * 4 ? 'year' : days > 62 ? 'month' : 'day';
  }
  return (ds._grainCache[i] = g);
}
function keyOf(v, type, grain) {
  if (v == null || v === '') return BLANK;
  if (type === 'date' && typeof v === 'string') {
    if (grain === 'year') return v.slice(0, 4);
    if (grain === 'quarter') return v.slice(0, 4) + '-Q' + (Math.floor((+v.slice(5, 7) - 1) / 3) + 1);
    if (grain === 'month') return v.slice(0, 7);
    return v.slice(0, 10);
  }
  return typeof v === 'number' ? String(v) : String(v);
}
function labelOf(key, type, grain) {
  if (key === BLANK || key === OTHER) return key;
  if (type === 'date') return fmtDateKey(key, grain);
  if (type === 'number') { const n = Number(key); return isFinite(n) ? fmtNum(n) : key; }
  return key;
}

/* ---------- Filtros ---------- */
/** filtros: [{ds, field, grain, values:[claves]}] */
function rowPasses(ds, row, filters, exclude) {
  for (const f of filters) {
    if (f.ds !== ds.id || f.field === exclude || !f.values.length) continue;
    const i = colIdx(ds, f.field);
    if (i < 0) continue;
    if (!f._set) Object.defineProperty(f, '_set', { value: new Set(f.values), enumerable: false, writable: true });
    if (!f._set.has(keyOf(row[i], ds.columns[i].type, f.grain))) return false;
  }
  return true;
}
function filteredRows(ds, filters, exclude) {
  if (!filters.some(f => f.ds === ds.id && f.field !== exclude && f.values.length)) return ds.rows;
  return ds.rows.filter(r => rowPasses(ds, r, filters, exclude));
}

/* ---------- Agregación ---------- */
function makeAcc() { return { sum: 0, n: 0, min: Infinity, max: -Infinity, set: null, list: null, rows: 0 }; }
function accAdd(a, v, agg) {
  a.rows++;
  if (agg === 'count') { if (v != null) a.n++; return; }
  if (agg === 'distinct') { if (v != null) { (a.set || (a.set = new Set())).add(v); } return; }
  if (typeof v !== 'number' || !isFinite(v)) return;
  a.n++; a.sum += v;
  if (v < a.min) a.min = v;
  if (v > a.max) a.max = v;
  if (agg === 'median') (a.list || (a.list = [])).push(v);
}
function accValue(a, agg) {
  switch (agg) {
    case 'count': return a.n;
    case 'distinct': return a.set ? a.set.size : 0;
    case 'avg': return a.n ? a.sum / a.n : null;
    case 'min': return a.n ? a.min : null;
    case 'max': return a.n ? a.max : null;
    case 'median': {
      if (!a.list || !a.list.length) return null;
      const l = a.list.sort((x, y) => x - y), m = l.length >> 1;
      return l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2;
    }
    default: return a.n ? a.sum : (a.rows ? 0 : null);
  }
}
function measureAgg(ds, w, name) {
  const c = colOf(ds, name);
  if (!c) return 'count';
  if (c.type !== 'number' && !['count', 'distinct'].includes(w.agg)) return 'count';
  return w.agg || 'sum';
}
function measureName(ds, w, name) {
  if (!name) return 'Recuento de filas';
  return `${AGG[measureAgg(ds, w, name)].of} ${name}`;
}
function totalOf(ds, rows, w, name) {
  const i = colIdx(ds, name);
  const agg = measureAgg(ds, w, name);
  const a = makeAcc();
  if (i < 0) { a.n = rows.length; return rows.length; }
  for (const r of rows) accAdd(a, r[i], agg);
  return accValue(a, agg);
}

/** Orden estable de colores por entidad (no por rango): frecuencia en los datos completos. */
function colorOrder(ds, field, grain) {
  const i = colIdx(ds, field);
  if (i < 0) return new Map();
  ds._colorCache = ds._colorCache || {};
  const ck = field + '|' + (grain || '');
  if (ds._colorCache[ck]) return ds._colorCache[ck];
  const counts = new Map();
  const t = ds.columns[i].type;
  for (const r of ds.rows) { const k = keyOf(r[i], t, grain); counts.set(k, (counts.get(k) || 0) + 1); }
  const order = new Map();
  Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).forEach(([k], idx) => order.set(k, idx));
  return (ds._colorCache[ck] = order);
}
/** Asigna ranuras de color 0..7 únicas dentro de un gráfico a partir del orden estable. */
function assignSlots(keys, order) {
  const slots = new Map(), used = new Set();
  for (const k of keys) {
    if (k === OTHER) { slots.set(k, 'o'); continue; }
    const r = order.get(k);
    if (r != null && r < 8 && !used.has(r)) { slots.set(k, r); used.add(r); }
  }
  let free = 0;
  for (const k of keys) {
    if (slots.has(k)) continue;
    while (used.has(free) && free < 8) free++;
    if (free < 8) { slots.set(k, free); used.add(free); } else slots.set(k, 'o');
  }
  return slots;
}

/**
 * Agrega un dataset para un widget de categoría.
 * Devuelve { cats:[{key,label}], series:[{name,key,values,slot}], catType, grain, highlight }.
 */
function aggregate(ds, w, filters, opts = {}) {
  const ci = colIdx(ds, w.cat);
  const catType = ci >= 0 ? ds.columns[ci].type : null;
  const grain = effectiveGrain(ds, w);
  const rows = filteredRows(ds, filters, opts.keepOwnField ? undefined : w.cat);
  const vals = (w.vals || []).filter(v => colIdx(ds, v) >= 0).slice(0, 8);
  const measures = vals.length ? vals : [null];
  const si = (w.split && VIZ[w.type] && VIZ[w.type].split) ? colIdx(ds, w.split) : -1;
  const splitType = si >= 0 ? ds.columns[si].type : null;
  const splitGrain = si >= 0 ? effectiveGrain(ds, w, w.split) : null;

  const groups = new Map(); // catKey -> Map(seriesKey -> acc)
  const seriesTotals = new Map();
  const mIdx = measures.map(m => (m == null ? -1 : colIdx(ds, m)));
  const mAgg = measures.map(m => (m == null ? 'count' : measureAgg(ds, w, m)));
  for (const r of rows) {
    const ck = ci >= 0 ? keyOf(r[ci], catType, grain) : '(Total)';
    let g = groups.get(ck);
    if (!g) { g = new Map(); groups.set(ck, g); }
    if (si >= 0) {
      const sk = keyOf(r[si], splitType, splitGrain);
      let a = g.get(sk);
      if (!a) { a = makeAcc(); g.set(sk, a); }
      const v = mIdx[0] < 0 ? 1 : r[mIdx[0]];
      accAdd(a, v, mAgg[0]);
      const t = typeof v === 'number' ? Math.abs(v) : 1;
      seriesTotals.set(sk, (seriesTotals.get(sk) || 0) + t);
    } else {
      for (let m = 0; m < measures.length; m++) {
        let a = g.get(m);
        if (!a) { a = makeAcc(); g.set(m, a); }
        accAdd(a, mIdx[m] < 0 ? 1 : r[mIdx[m]], mAgg[m]);
      }
    }
  }

  // Series
  let seriesDefs;
  if (si >= 0) {
    const allKeys = Array.from(seriesTotals.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const keep = allKeys.slice(0, allKeys.length > 8 ? 7 : 8);
    const slots = assignSlots(keep.concat(allKeys.length > 8 ? [OTHER] : []), colorOrder(ds, w.split, splitGrain));
    seriesDefs = keep.map(k => ({ key: k, name: labelOf(k, splitType, splitGrain), slot: slots.get(k) }));
    if (allKeys.length > 8) seriesDefs.push({ key: OTHER, name: OTHER, slot: 'o', rest: new Set(allKeys.slice(7)) });
    if (splitType === 'date') seriesDefs.sort((a, b) => (a.key < b.key ? -1 : 1));
  } else {
    seriesDefs = measures.map((m, idx) => ({ key: idx, name: measures.length > 1 ? m : measureName(ds, w, m), slot: measures.length === 1 ? (w.slot || 0) : idx }));
  }

  let cats = Array.from(groups.keys()).map(key => ({ key, label: ci >= 0 ? labelOf(key, catType, grain) : 'Total' }));
  const valueOf = (ck, sd) => {
    const g = groups.get(ck);
    if (!g) return null;
    if (sd.rest) {
      let acc = null;
      for (const k of sd.rest) { const a = g.get(k); if (a) { const v = accValue(a, mAgg[0]); if (v != null) acc = (acc || 0) + v; } }
      return acc;
    }
    const a = g.get(sd.key);
    return a ? accValue(a, si >= 0 ? mAgg[0] : mAgg[sd.key]) : null;
  };
  const catTotal = new Map(cats.map(c => [c.key, seriesDefs.reduce((s, sd) => s + (valueOf(c.key, sd) || 0), 0)]));

  // Orden
  let sort = w.sort || 'auto';
  if (sort === 'auto') {
    // Las categorías que parecen periodos (meses, trimestres…) conservan el orden original
    const periodic = catType === 'text' && cats.length > 1 && cats.slice(0, 12).every(c => c.key === BLANK || looksLikePeriod(c.key));
    if (catType === 'date' || catType === 'number') sort = 'cat-asc';
    else if (periodic || ['line', 'area'].includes(w.type)) sort = 'none';
    else sort = 'value-desc';
  }
  const cmpKey = (a, b) => {
    if (catType === 'number') return Number(a.key) - Number(b.key);
    return a.key === BLANK ? 1 : b.key === BLANK ? -1 : a.key.localeCompare(b.key, LOCALE, { numeric: true });
  };
  if (sort === 'value-desc') cats.sort((a, b) => catTotal.get(b.key) - catTotal.get(a.key));
  else if (sort === 'value-asc') cats.sort((a, b) => catTotal.get(a.key) - catTotal.get(b.key));
  else if (sort === 'cat-desc') cats.sort((a, b) => -cmpKey(a, b));
  else if (sort === 'cat-asc') cats.sort(cmpKey);

  // Top N
  const top = +w.top || 0;
  let otherCat = null;
  if (top > 0 && cats.length > top) {
    const rest = cats.slice(top);
    cats = cats.slice(0, top);
    if (['pie', 'donut', 'treemap'].includes(w.type)) otherCat = rest;
  }
  if (['pie', 'donut', 'treemap'].includes(w.type) && !otherCat && cats.length > 8) {
    const sorted = cats.slice().sort((a, b) => catTotal.get(b.key) - catTotal.get(a.key));
    const keepSet = new Set(sorted.slice(0, 7).map(c => c.key));
    otherCat = cats.filter(c => !keepSet.has(c.key));
    cats = cats.filter(c => keepSet.has(c.key));
  }
  const series = seriesDefs.map(sd => ({ name: sd.name, key: sd.key, slot: sd.slot, values: cats.map(c => valueOf(c.key, sd)) }));
  if (otherCat) {
    cats.push({ key: OTHER, label: OTHER, rest: otherCat.map(c => c.key) });
    for (const sr of series) {
      const sd = seriesDefs.find(d => d.key === sr.key);
      sr.values.push(otherCat.reduce((s, c) => s + (valueOf(c.key, sd) || 0), 0));
    }
  }
  // Colores por categoría (circular / árbol)
  let catSlots = null;
  if (['pie', 'donut', 'treemap'].includes(w.type)) catSlots = assignSlots(cats.map(c => c.key), colorOrder(ds, w.cat, grain));

  const own = filters.find(f => f.ds === ds.id && f.field === w.cat && f.values.length);
  return { cats, series, catType, grain, catSlots, highlight: own ? new Set(own.values) : null, rowCount: rows.length };
}

/* ---------- Diseño automático ---------- */
function distinctCount(ds, i, cap = 1000) {
  const s = new Set();
  for (const r of ds.rows) { if (r[i] != null) s.add(r[i]); if (s.size > cap) break; }
  return s.size;
}
function pickAgg(name) {
  return /(precio|price|tasa|rate|ratio|%|porcentaje|media|promedio|avg|average|margen %|nota|score|puntuaci|satisfacci|valoraci|evaluaci|calificaci|antigüedad|(1-5)|(1-10)|rating|nps|índice|indice|temperatura|edad|age)/i.test(name) ? 'avg' : 'sum';
}

/** Genera widgets para un dataset siguiendo heurísticas tipo "Quick Insights". */
function autoDashboard(ds, opts = {}) {
  const cols = ds.columns.map((c, i) => ({ ...c, i, distinct: distinctCount(ds, i) }));
  const nums = cols.filter(c => c.type === 'number' && c.role !== 'id' && c.role !== 'year');
  const dates = cols.filter(c => c.type === 'date');
  const years = cols.filter(c => c.role === 'year');
  const cats = cols.filter(c => c.type === 'text' && c.distinct >= 2 && c.distinct <= Math.max(60, ds.rows.length * 0.5) && c.distinct < ds.rows.length)
    .sort((a, b) => scoreCat(a) - scoreCat(b));
  function scoreCat(c) { return Math.abs(c.distinct - 6) + (c.distinct > 30 ? 40 : 0); }
  const widgets = [];
  const M = 16, G = 16, W = PAGE_W - M * 2;
  let y = M;

  if (ds.info && ds.info.title && opts.titleBox !== false) {
    widgets.push(newWidget('text', ds, { x: M, y, w: W, h: 56, text: '# ' + ds.info.title, bg: false, vcenter: true, fontSize: 14 }));
    y += 56 + 8;
  }

  const sumAbs = c => { let t = 0; for (const r of ds.rows) if (typeof r[c.i] === 'number') t += Math.abs(r[c.i]); return t; };
  const maxAbs = c => { let t = 0; for (const r of ds.rows) if (typeof r[c.i] === 'number') t = Math.max(t, Math.abs(r[c.i])); return t; };
  const fmtFor = c => {
    if (!c) return {};
    if (/%|porcentaje|tasa|ratio/i.test(c.name)) return maxAbs(c) <= 1.5 ? { fmt: 'percent' } : { fmt: 'percentRaw' };
    if (/\$|usd/i.test(c.name)) return { fmt: 'currency', currency: 'USD' };
    if (/€|\beur|importe|ventas|coste|costo|precio|ingreso|facturaci|gasto|beneficio|presupuesto/i.test(c.name)) return { fmt: 'currency', currency: 'EUR', dec: 0 };
    return {};
  };
  const measure = c => (c ? Object.assign({ vals: [c.name], agg: pickAgg(c.name) }, fmtFor(c)) : { vals: [], agg: 'count' });
  // Medida principal: la de mayor magnitud entre las que se suman
  const summable = nums.filter(c => pickAgg(c.name) === 'sum');
  const main = (summable.length ? summable : nums).slice().sort((a, b) => sumAbs(b) - sumAbs(a))[0] || null;
  const half = Math.floor((W - G) / 2);

  // Tabla cruzada (títulos en filas)
  if (ds.info && ds.info.rowTitles && cols[0]) {
    const label = cols[0].name;
    const tr = opts.transposed;
    if (tr) {
      const tc = tr.columns[0].name;
      const series = tr.columns.slice(1).filter(c => c.type === 'number').slice(0, 8).map(c => c.name);
      const last = nums[nums.length - 1];
      widgets.push(newWidget('line', tr, { x: M, y, w: W, h: 320, cat: tc, vals: series, title: `Evolución por ${tc.toLowerCase()}` }));
      y += 320 + G;
      widgets.push(newWidget('stacked', tr, { x: M, y, w: half, h: 320, cat: tc, vals: series, title: `Total por ${tc.toLowerCase()}` }));
      if (last) widgets.push(newWidget('donut', ds, { x: M + half + G, y, w: W - half - G, h: 320, cat: label, ...measure(last), agg: 'sum' }));
      y += 320 + G;
    } else {
      const kpis = nums.slice(0, 4);
      const kw = Math.floor((W - G * (kpis.length - 1)) / Math.max(1, kpis.length));
      kpis.forEach((c, k) => widgets.push(newWidget('kpi', ds, { x: M + k * (kw + G), y, w: kw, h: 112, slot: k, ...measure(c) })));
      if (kpis.length) y += 112 + G;
      const second = nums.find(c => c !== main) || main;
      widgets.push(newWidget('column', ds, { x: M, y, w: half, h: 320, cat: label, ...measure(main) }));
      widgets.push(newWidget('donut', ds, { x: M + half + G, y, w: W - half - G, h: 320, cat: label, ...measure(second) }));
      y += 320 + G;
    }
    const th = Math.min(360, 96 + ds.rows.length * 28);
    widgets.push(newWidget('table', ds, { x: M, y, w: W, h: th, vals: ds.columns.map(c => c.name).slice(0, 14), dataBars: false }));
    y += th + G;
    return { widgets, height: y };
  }

  // KPIs
  const kpis = nums.slice(0, 4).map((c, k) => ({ slot: k, ...measure(c) }));
  if (kpis.length < 4) kpis.push({ vals: [], agg: 'count', title: 'Registros', slot: kpis.length });
  const kw = Math.floor((W - G * (kpis.length - 1)) / kpis.length);
  const trendCat = dates[0] ? dates[0].name : null;
  kpis.forEach((k, idx) => widgets.push(newWidget('kpi', ds, { x: M + idx * (kw + G), y, w: kw, h: 120, cat: trendCat && k.vals.length ? trendCat : null, ...k })));
  y += 120 + G;

  // Cada visual usa una categoría distinta y una sola escala (sin ejes dobles)
  const used = new Set();
  const take = pred => { const c = cats.find(x => !used.has(x.name) && pred(x)); if (c) used.add(c.name); return c; };
  const rowItems = [];
  const tc = dates[0] || years[0];
  if (tc) rowItems.push(newWidget('area', ds, { cat: tc.name, ...measure(main) }));
  const c1 = take(() => true);
  if (c1) rowItems.push(newWidget('column', ds, { cat: c1.name, ...measure(main), top: c1.distinct > 15 ? 12 : 0 }));
  const c2 = take(c => c.distinct <= 8);
  if (c2) rowItems.push(newWidget('donut', ds, { cat: c2.name, ...measure(main) }));
  const c3 = rowItems.length < 4 ? take(() => true) : null;
  if (c3) rowItems.push(newWidget('bar', ds, { cat: c3.name, ...measure(main), top: 10 }));
  if (nums.length >= 2 && rowItems.length < 4) {
    const other = nums.find(c => c !== main);
    rowItems.push(newWidget('scatter', ds, { vals: [main.name, other.name], cat: c1 ? c1.name : null, agg: 'sum' }));
  }

  // Selector de filtro a la izquierda, preferiblemente con un campo no usado
  const slicerCat = cats.find(c => c.distinct <= 25 && !used.has(c.name)) || cats.find(c => c.distinct <= 25);
  let x0 = M, avail = W;
  const rowsNeeded = Math.ceil(rowItems.length / 2);
  if (slicerCat && rowItems.length) {
    const sh = rowsNeeded * 320 + (rowsNeeded - 1) * G;
    widgets.push(newWidget('slicer', ds, { x: M, y, w: 224, h: sh, cat: slicerCat.name }));
    x0 = M + 224 + G; avail = W - 224 - G;
  }
  for (let k = 0; k < rowItems.length; k++) {
    const col = k % 2, row = Math.floor(k / 2);
    const alone = k === rowItems.length - 1 && col === 0;
    const hw = Math.floor((avail - G) / 2);
    Object.assign(rowItems[k], { x: x0 + col * (hw + G), y: y + row * (320 + G), w: alone ? avail : hw, h: 320 });
    widgets.push(rowItems[k]);
  }
  if (rowItems.length) y += rowsNeeded * (320 + G);

  widgets.push(newWidget('table', ds, { x: M, y, w: W, h: 320, vals: ds.columns.map(c => c.name).slice(0, 14) }));
  y += 320 + G;
  return { widgets, height: y };
}

/** Transpone una tabla con títulos de fila (crea filas a partir de columnas). */
function transposeDataset(ds, headerName) {
  const labels = ds.rows.map(r => (r[0] == null ? BLANK : String(r[0])));
  const seen = new Map();
  const newNames = labels.map(l => { const c = (seen.get(l) || 0) + 1; seen.set(l, c); return c > 1 ? `${l} (${c})` : l; }).slice(0, LIMITS.cols - 1);
  headerName = headerName || (ds.info && ds.info.periodHeaders ? 'Periodo' : 'Atributo');
  const grid = [[headerName, ...newNames]];
  for (let j = 1; j < ds.columns.length; j++) {
    grid.push([ds.columns[j].name, ...ds.rows.slice(0, newNames.length).map(r => r[j])]);
  }
  const t = buildTable(grid);
  return { id: uid(), name: (ds.name + ' (transpuesta)').slice(0, 80), columns: t.columns, rows: t.rows, info: t.info, v: 1 };
}

/* ---------- Datos de ejemplo ---------- */
function sampleGrid() {
  let seed = 42;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const regions = ['Norte', 'Sur', 'Este', 'Oeste', 'Centro'];
  const cats = { Hardware: ['Portátil Pro', 'Monitor 27"', 'Dock USB-C'], Software: ['Licencia ERP', 'Suite Ofimática', 'Antivirus'], Servicios: ['Soporte 24/7', 'Consultoría', 'Implantación'], Formación: ['Curso de análisis de datos', 'Taller de hojas de cálculo'] };
  const canales = ['Online', 'Tienda', 'Partner'];
  const grid = [['Informe de ventas 2025'], [], ['Fecha', 'Región', 'Categoría', 'Producto', 'Canal', 'Unidades', 'Ventas (€)', 'Coste (€)', 'Satisfacción']];
  const regionW = [1.3, 0.8, 1, 0.9, 1.5];
  for (let i = 0; i < 480; i++) {
    const month = Math.floor(rnd() * 12);
    const day = 1 + Math.floor(rnd() * 28);
    const ri = Math.floor(rnd() * regions.length);
    const cat = Object.keys(cats)[Math.floor(rnd() * 4)];
    const prods = cats[cat];
    const prod = prods[Math.floor(rnd() * prods.length)];
    const canal = canales[Math.floor(rnd() * (rnd() < 0.2 ? 3 : 2.4))] || 'Online';
    const units = 1 + Math.floor(rnd() * (cat === 'Software' ? 40 : 15));
    const price = { Hardware: 420, Software: 95, Servicios: 680, Formación: 250 }[cat] * (0.8 + rnd() * 0.4);
    const season = 1 + 0.25 * Math.sin((month - 2) / 12 * Math.PI * 2) + month * 0.03;
    const sales = Math.round(units * price * season * regionW[ri]);
    const cost = Math.round(sales * (0.45 + rnd() * 0.25));
    grid.push([new Date(Date.UTC(2025, month, day)), regions[ri], cat, prod, canal, units, sales, cost, Math.round((3.2 + rnd() * 1.8) * 10) / 10]);
  }
  return grid;
}
