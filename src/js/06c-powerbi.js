/* ==========================================================================
   Exportación a Power BI como proyecto PBIP (Power BI Project).
   PBIP es el formato de proyecto abierto y documentado públicamente por
   Microsoft: modelo semántico en TMDL e informe en PBIR (JSON con esquemas
   públicos). No se usa ni se imita el formato binario .pbix: Power BI Desktop
   abre el .pbip y, desde ahí, «Guardar como» genera el .pbix si se necesita.
   - Los datos van incrustados en el modelo (consulta Power Query con el JSON
     comprimido, como «Escribir datos»); los orígenes muy grandes viajan como
     CSV dentro del zip con una carpeta configurable.
   - Agregaciones → medidas DAX; columnas condicionales → columnas calculadas DAX.
   - Todo se genera en el navegador y se empaqueta en un .zip propio, sin red.
   Las URL $schema son identificadores que exige el formato: nunca se descargan.
   ========================================================================== */

const PBI_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/';
/** Versiones de los esquemas públicos (de mediados de 2025, para abrir también en Desktop algo antiguos). */
const PBI_VER = {
  pbip: 'pbip/pbipProperties/1.0.0', platform: 'gitIntegration/platformProperties/2.0.0',
  pbir: 'item/report/definitionProperties/2.0.0', pbism: 'item/semanticModel/definitionProperties/1.0.0',
  version: 'item/report/definition/versionMetadata/1.0.0', report: 'item/report/definition/report/3.0.0',
  pages: 'item/report/definition/pagesMetadata/1.0.0', page: 'item/report/definition/page/2.0.0',
  visual: 'item/report/definition/visualContainer/2.2.0'
};
const pbiSchema = k => PBI_SCHEMA + PBI_VER[k] + '/schema.json';
/** Por encima de este tamaño (base64) un origen se exporta como CSV en lugar de incrustarse. */
const PBI_EMBED_MAX = 8 * 1024 * 1024;

/* ---------- ZIP (escritor mínimo: deflate nativo o sin compresión, nombres UTF-8) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const utf8 = s => new TextEncoder().encode(s);
/** files: [{ path, data: string | Uint8Array }] → Blob application/zip */
async function buildZip(files) {
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = utf8(f.path);
    const raw = typeof f.data === 'string' ? utf8(f.data) : f.data;
    const crc = crc32(raw);
    const packed = raw.length > 64 ? await deflateRaw(raw) : null;
    const useDeflate = packed && packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
    head.setUint16(8, useDeflate ? 8 : 0, true); head.setUint16(10, dosTime, true); head.setUint16(12, dosDate, true);
    head.setUint32(14, crc, true); head.setUint32(18, body.length, true); head.setUint32(22, raw.length, true);
    head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, useDeflate ? 8 : 0, true); cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, body.length, true); cd.setUint32(24, raw.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(head.buffer), name, body);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/* ---------- Nombres y escapes (TMDL, DAX, M y literales PBIR) ---------- */
const hexId = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
const guid = () => (crypto.randomUUID ? crypto.randomUUID() : [hexId(4), hexId(2), '4' + hexId(2).slice(1), '8' + hexId(2).slice(1), hexId(6)].join('-'));
/** Nombre válido para el modelo: sin caracteres de control ni comillas al principio, y sin ``` (delimitador de TMDL). */
function pbiName(s, fallback) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/`{3,}/g, '``').replace(/^['"`\s]+|\s+$/g, '').slice(0, 100);
  return t || fallback;
}
/** Asigna nombres únicos sin distinguir mayúsculas (el modelo tabular no las distingue). */
function uniqueNamer(taken) {
  const used = new Set(Array.from(taken || [], x => x.toLocaleLowerCase('en-US')));
  return (base) => {
    let n = base, k = 2;
    while (used.has(n.toLocaleLowerCase('en-US'))) n = `${base} (${k++})`;
    used.add(n.toLocaleLowerCase('en-US'));
    return n;
  };
}
const tmdlName = n => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'");
const daxTable = t => "'" + t.replace(/'/g, "''") + "'";
const daxCol = (t, c) => daxTable(t) + '[' + c.replace(/]/g, ']]') + ']';
const daxStr = s => '"' + String(s).replace(/"/g, '""') + '"';
const daxNum = n => (isFinite(n) ? String(+n) : 'BLANK()');
/** Literal de texto M: escapa comillas y la secuencia de escape #( de Power Query. */
const mStr = s => '"' + String(s).replace(/"/g, '""').replace(/#\(/g, '#(#)(') + '"';
const mId = s => '#' + mStr(s);
/** Literales de expresiones PBIR. */
const L = v => ({ expr: { Literal: { Value: v } } });
const lStr = s => L("'" + String(s).replace(/'/g, "''") + "'");
const lNum = n => L(String(+n) + 'D');
const lBool = b => L(b ? 'true' : 'false');
const lColor = c => ({ solid: { color: lStr(c) } });
const prop = (properties, selector) => (selector ? { properties, selector } : { properties });

/* ---------- Formatos numéricos ---------- */
const PBI_CURRENCY = { EUR: ['', ' €'], USD: ['$', ''], GBP: ['£', ''], MXN: ['$', ''], COP: ['$', ''], ARS: ['$', ''], CLP: ['$', ''], PEN: ['S/ ', ''], BRL: ['R$ ', ''], CHF: ['', ' CHF'], JPY: ['¥', ''] };
/** Texto literal dentro de una cadena de formato: cada carácter escapado con \ (sin comillas, que TMDL interpretaría). */
const fmtLiteral = t => Array.from(t || '', ch => '\\' + ch).join('');
function pbiFormat(w, agg) {
  if (agg === 'count' || agg === 'distinct') return '#,##0';
  const dec = w.dec == null ? null : clamp(+w.dec, 0, 6);
  const digits = (d, def) => { const n = d == null ? def : d; return n ? '.' + '0'.repeat(n) : ''; };
  switch (w.fmt) {
    case 'int': return '#,##0';
    case 'percent': return '0' + digits(dec, 1) + '%';
    case 'percentRaw': return '#,##0' + digits(dec, 1) + fmtLiteral(' %');
    case 'currency': case 'currencyCompact': {
      const [pre, post] = PBI_CURRENCY[w.currency] || PBI_CURRENCY.EUR;
      return fmtLiteral(pre) + '#,##0' + digits(dec, w.fmt === 'currencyCompact' ? 0 : 2) + fmtLiteral(post);
    }
    default: return dec == null ? '#,##0.##' : '#,##0' + digits(dec, 0);
  }
}

const pbiFormatLabel = w => ({ int: 'entero', compact: 'número', currency: w.currency, currencyCompact: w.currency, percent: '%', percentRaw: '%' }[w.fmt] || 'número');

/* ---------- Modelo semántico ---------- */
/**
 * Prepara una tabla del modelo para un origen de datos: nombres únicos, columnas
 * de origen (Power Query) y columnas calculadas (DAX), y registro de medidas.
 */
function pbiTable(ds, tableName, globalNamer) {
  const colNamer = uniqueNamer();
  const cols = ds.columns.map(c => ({ src: c, name: colNamer(pbiName(c.name, 'Columna')) }));
  const byName = new Map(cols.map(c => [c.src.name, c]));
  return {
    ds, name: tableName, cols, byName, globalNamer,
    helpers: new Map(),   // columnas auxiliares (periodos de fecha, índice de fila)
    measures: new Map(),  // clave → { name, dax, fmt }
    needIndex: false
  };
}
/** Tipo M / TMDL de una columna de origen. */
function pbiColType(t, c) {
  if (c.type === 'number') return { m: 'type number', tm: 'double' };
  if (c.type === 'date') {
    const i = t.ds.columns.indexOf(c);
    const withTime = t.ds.rows.some(r => typeof r[i] === 'string' && r[i].length > 10);
    return withTime ? { m: 'type datetime', tm: 'dateTime', fmt: 'dd/mm/yyyy hh:nn', time: true } : { m: 'type date', tm: 'dateTime', fmt: 'dd/mm/yyyy' };
  }
  return { m: 'type text', tm: 'string' };
}
/** Referencia de campo para una columna con agrupación de fechas opcional (crea columnas auxiliares). */
function pbiField(t, colName, grain) {
  const c = t.byName.get(colName);
  if (!c) return null;
  if (c.src.type !== 'date' || !grain) return { column: c.name };
  const time = !c.src.calc && pbiColType(t, c.src).time;
  if (grain === 'day' && !time) return { column: c.name };
  const key = c.name + '|' + grain;
  if (!t.helpers.has(key)) {
    const x = daxCol(t.name, c.name);
    const guard = e => `IF(ISBLANK(${x}), BLANK(), ${e})`;
    const label = { day: 'día', month: 'mes', quarter: 'trimestre', year: 'año' }[grain];
    const name = t.globalNamer(pbiName(`${c.name} (${label})`, 'Periodo'));
    let def;
    if (grain === 'year') def = { name, dax: guard(`YEAR(${x})`), type: 'int64', fmt: '0', sum: false };
    else if (grain === 'quarter') {
      const ord = t.globalNamer(pbiName(`${c.name} (trimestre, orden)`, 'Orden'));
      t.helpers.set(key + '|ord', { name: ord, dax: guard(`YEAR(${x}) * 10 + QUARTER(${x})`), type: 'int64', fmt: '0', hidden: true });
      def = { name, dax: guard(`"T" & QUARTER(${x}) & " " & YEAR(${x})`), type: 'string', sortBy: ord };
    } else if (grain === 'month') def = { name, dax: guard(`DATE(YEAR(${x}), MONTH(${x}), 1)`), type: 'dateTime', fmt: 'mmm yyyy' };
    else def = { name, dax: guard(`DATE(YEAR(${x}), MONTH(${x}), DAY(${x}))`), type: 'dateTime', fmt: 'dd/mm/yyyy' };
    t.helpers.set(key, def);
  }
  return { column: t.helpers.get(key).name };
}
/** Medida DAX para (columna, agregación, formato). Devuelve su nombre. */
function pbiMeasure(t, w, colName) {
  const c = colName ? t.byName.get(colName) : null;
  const agg = c ? measureAgg(t.ds, w, colName) : 'count';
  const fmt = pbiFormat(w, agg);
  const key = (c ? c.name : '') + '|' + agg + '|' + fmt;
  if (!t.measures.has(key)) {
    const x = c ? daxCol(t.name, c.name) : null;
    const dax = !c ? `COUNTROWS(${daxTable(t.name)})` : {
      sum: `SUM(${x})`, avg: `AVERAGE(${x})`, min: `MIN(${x})`, max: `MAX(${x})`, median: `MEDIAN(${x})`,
      count: `COUNTA(${x})`, distinct: `DISTINCTCOUNTNOBLANK(${x})`
    }[agg];
    // Misma columna y agregación con otro formato: el nombre indica el formato
    const label = (c ? `${AGG[agg].of} ${c.name}` : 'Recuento de filas') +
      (Array.from(t.measures.values()).some(m => m.dax === dax) ? ` (${pbiFormatLabel(w)})` : '');
    t.measures.set(key, { name: t.globalNamer(pbiName(label, 'Medida')), dax, fmt });
  }
  return t.measures.get(key).name;
}
function pbiConstMeasure(t, label, value, w) {
  const key = 'const|' + label + '|' + value;
  if (!t.measures.has(key)) t.measures.set(key, { name: t.globalNamer(pbiName(label, 'Objetivo')), dax: daxNum(value), fmt: pbiFormat(w, 'sum') });
  return t.measures.get(key).name;
}

/** Traduce una columna condicional de 4Dash a una expresión DAX SWITCH(TRUE(), …). */
function calcToDax(t, k) {
  const tbl = t.ds, def = tbl.calc[k];
  const ref = name => { const j = calcRefIdx(tbl, k, name); return j < 0 ? null : { x: daxCol(t.name, t.cols[j].name), type: tbl.columns[j].type, time: tbl.columns[j].type === 'date' && !tbl.columns[j].calc && pbiColType(t, tbl.columns[j]).time }; };
  const day = r => (r.time ? `DATE(YEAR(${r.x}), MONTH(${r.x}), DAY(${r.x}))` : r.x);
  const lit = (v, type) => {
    const cv = convertValue(v, type);
    if (cv == null) return 'BLANK()';
    if (type === 'number') return daxNum(cv);
    if (type === 'date') { const [y, m, d] = String(cv).slice(0, 10).split('-').map(Number); return `DATE(${y}, ${m}, ${d})`; }
    return daxStr(cv);
  };
  const operand = (o, type) => {
    if (!o || o.k === 'n') return 'BLANK()';
    if (o.k === 'c') {
      const r = ref(o.v);
      if (!r) return null;
      if (r.type === type) return type === 'date' ? day(r) : r.x;
      if (type === 'number') return `IFERROR(VALUE(${r.x}), BLANK())`;
      if (type === 'date') return r.type === 'text' ? `IFERROR(DATEVALUE(${r.x}), BLANK())` : 'BLANK()';
      return r.type === 'date' ? `FORMAT(${r.x}, "yyyy-mm-dd")` : `${r.x} & ""`;
    }
    return lit(o.v, type);
  };
  const notBlank = e => `NOT(ISBLANK(${e}))`;
  const cond = c => {
    const r = ref(c.col);
    if (!r || !CALC_ALL_OPS.has(c.op)) return 'FALSE()';
    const op = c.op, x = r.type === 'date' ? day(r) : r.x;
    const empty = r.type === 'text' ? `(ISBLANK(${r.x}) || ${r.x} = "")` : `ISBLANK(${r.x})`;
    if (op === 'empty') return empty;
    if (op === 'notEmpty') return `NOT(${empty})`;
    if (NEGATED[op]) return `NOT(${cond(Object.assign({}, c, { op: NEGATED[op] }))})`;
    if (r.type === 'date') {
      if (op === 'beforeToday') return `(${notBlank(x)} && ${x} < TODAY())`;
      if (op === 'afterToday') return `(${notBlank(x)} && ${x} > TODAY())`;
    }
    const ot = opOperandType(op, r.type);
    if (op === 'in') {
      const items = String(c.a && c.a.v != null ? c.a.v : '').split(';').map(v => v.trim()).filter(Boolean);
      return items.length ? `(${notBlank(x)} && TRIM(${x}) IN {${items.map(daxStr).join(', ')}})` : 'FALSE()';
    }
    const two = opArity(op) === 2;
    const a = operand(c.a, ot), b = two ? operand(c.b, ot) : null;
    // Operando inexistente o vacío: en 4Dash la condición no se cumple
    if (a == null || a === 'BLANK()' || (two && (b == null || b === 'BLANK()'))) return 'FALSE()';
    const both = [notBlank(x)].concat(c.a.k === 'c' ? [notBlank(a)] : [], two && c.b.k === 'c' ? [notBlank(b)] : []).join(' && ');
    if (r.type === 'date') {
      if (op === 'year') return `(${both} && YEAR(${x}) = ${a})`;
      if (op === 'month') return `(${both} && MONTH(${x}) = ${a})`;
      if (op === 'lastDays') return `(${both} && ${x} <= TODAY() && ${x} >= TODAY() - ABS(ROUND(${a}, 0)))`;
    }
    if (op === 'between') return `(${both} && ${x} >= MIN(${a}, ${b}) && ${x} <= MAX(${a}, ${b}))`;
    if (r.type === 'text') {
      const xs = `TRIM(${x})`, as = c.a.k === 'c' ? `TRIM(${a})` : daxStr(String(convertValue(c.a.v, 'text')).replace(/\s+/g, ' ').trim());
      if (op === 'eq') return `(${both} && ${xs} = ${as})`;
      if (op === 'contains') return `(${both} && CONTAINSSTRING(${xs}, SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${as}, "~", "~~"), "?", "~?"), "*", "~*")))`;
      if (op === 'starts') return `(${both} && LEFT(${xs}, LEN(${as})) = ${as})`;
      if (op === 'ends') return `(${both} && RIGHT(${xs}, LEN(${as})) = ${as})`;
      return 'FALSE()';
    }
    const cmp = { eq: '=', gt: '>', ge: '>=', lt: '<', le: '<=' }[op];
    return cmp ? `(${both} && ${x} ${cmp} ${a})` : 'FALSE()';
  };
  const parts = [];
  for (const rule of def.rules) {
    if (!rule.conds.length) continue;
    const res = operand(rule.res, def.type);
    parts.push(rule.conds.map(cond).join(rule.all ? ' && ' : ' || '), res == null ? 'BLANK()' : res);
  }
  const other = operand(def.other, def.type);
  const fallback = other == null ? 'BLANK()' : other;
  return parts.length ? `SWITCH(TRUE(), ${parts.join(', ')}, ${fallback})` : fallback;
}

/** Consulta Power Query (M) con los datos incrustados o leídos de un CSV del paquete. */
async function pbiPartition(t, notes) {
  const srcCols = t.cols.filter(c => !c.src.calc);
  const idx = srcCols.map(c => t.ds.columns.indexOf(c.src));
  // Números siempre en notación decimal (sin exponente) para que Power Query los lea con la cultura en-US
  const plain = n => { const s = String(n); return !/e/i.test(s) ? s : Math.abs(n) < 1 ? n.toFixed(20).replace(/\.?0+$/, '') : BigInt(Math.round(n)).toString(); };
  const cell = (v, c) => (v == null || v === '' ? null : c.src.type === 'number' ? plain(v) : String(v));
  const rows = t.ds.rows.map(r => idx.map((i, j) => cell(r[i], srcCols[j])));
  const types = srcCols.map(c => `{${mStr(c.name)}, ${pbiColType(t, c.src).m}}`).join(', ');
  const typed = srcCols.length ? `Table.TransformColumnTypes(Origen, {${types}}, "en-US")` : 'Origen';
  const index = t.needIndex ? `,\n    ConIndice = Table.AddIndexColumn(Tipos, ${mStr(t.indexName)}, 1, 1, Int64.Type)` : '';
  const last = t.needIndex ? 'ConIndice' : 'Tipos';
  const json = utf8(JSON.stringify(rows));
  const packed = await deflateRaw(json);
  const b64 = toBase64(packed || json);
  if (b64.length <= PBI_EMBED_MAX) {
    const chunks = [];
    for (let i = 0; i < b64.length; i += 4000) chunks.push(mStr(b64.slice(i, i + 4000)));
    const bin = `Binary.FromText(Text.Combine({\n        ${chunks.join(',\n        ') || '""'}\n    }), BinaryEncoding.Base64)`;
    const body = packed ? `Binary.Decompress(${bin}, Compression.Deflate)` : bin;
    const schema = `type table [${srcCols.map(c => `${mId(c.name)} = nullable text`).join(', ')}]`;
    return { m: `let\n    Origen = Table.FromRows(Json.Document(${body}), ${schema}),\n    Tipos = ${typed}${index}\nin\n    ${last}` };
  }
  // Origen grande: CSV (coma, comillas, UTF-8) junto al proyecto y una carpeta configurable
  const file = safeFileName(t.name) + '.csv';
  const esc = v => (v == null ? '' : /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const csv = [srcCols.map(c => esc(c.name)).join(',')].concat(rows.map(r => r.map(esc).join(','))).join('\r\n');
  notes.push(`«${t.name}» es demasiado grande para incrustarse: se incluye como datos/${file}. Al abrir el proyecto, indica la carpeta en Transformar datos → Parámetros → CarpetaDatos.`);
  return {
    csv: { file, data: csv },
    m: `let\n    Archivo = Csv.Document(File.Contents(CarpetaDatos & ${mStr('\\' + file)}), [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),\n    Cabecera = Table.PromoteHeaders(Archivo, [PromoteAllScalars = true]),\n` +
      `    Origen = Table.ReplaceValue(Cabecera, "", null, Replacer.ReplaceValue, Table.ColumnNames(Cabecera)),\n    Tipos = ${typed}${index}\nin\n    ${last}`
  };
}
const indent = (text, tabs) => text.split('\n').map(l => '\t'.repeat(tabs) + l).join('\n');
/** Archivo TMDL de una tabla. */
function pbiTableTmdl(t, part) {
  const out = [`table ${tmdlName(t.name)}`, ''];
  for (const m of t.measures.values()) out.push(`\tmeasure ${tmdlName(m.name)} = ${m.dax}`, `\t\tformatString: ${m.fmt}`, '');
  t.cols.forEach(c => {
    const ty = pbiColType(t, c.src);
    const numeric = c.src.type === 'number';
    if (c.src.calc) {
      const k = t.ds.calc.findIndex(d => d.id === c.src.calc);
      out.push(`\tcolumn ${tmdlName(c.name)} = ${k < 0 ? 'BLANK()' : calcToDax(t, k)}`);
      out.push(`\t\tdataType: ${ty.tm}`);
    } else out.push(`\tcolumn ${tmdlName(c.name)}`, `\t\tdataType: ${ty.tm}`);
    if (ty.fmt) out.push(`\t\tformatString: ${ty.fmt}`);
    out.push(`\t\tsummarizeBy: ${numeric && !c.src.role ? 'sum' : 'none'}`);
    if (!c.src.calc) out.push(`\t\tsourceColumn: ${c.name}`);
    out.push('');
  });
  for (const hc of t.helpers.values()) {
    out.push(`\tcolumn ${tmdlName(hc.name)} = ${hc.dax}`, `\t\tdataType: ${hc.type}`);
    if (hc.fmt) out.push(`\t\tformatString: ${hc.fmt}`);
    if (hc.hidden) out.push('\t\tisHidden');
    out.push('\t\tsummarizeBy: none');
    if (hc.sortBy) out.push(`\t\tsortByColumn: ${tmdlName(hc.sortBy)}`);
    out.push('');
  }
  if (t.needIndex) out.push(`\tcolumn ${tmdlName(t.indexName)}`, '\t\tdataType: int64', '\t\tisHidden', '\t\tformatString: 0', '\t\tsummarizeBy: none', `\t\tsourceColumn: ${t.indexName}`, '');
  out.push(`\tpartition ${tmdlName(t.name)} = m`, '\t\tmode: import', '\t\tsource =', indent(part.m, 3), '');
  return out.join('\n');
}

/* ---------- Informe: visuales ---------- */
const PBI_VISUAL = { column: 'clusteredColumnChart', stacked: 'columnChart', bar: 'clusteredBarChart', line: 'lineChart', area: 'areaChart', pie: 'pieChart', donut: 'donutChart', treemap: 'treemap' };
const PBI_SHAPE = { rect: 'rectangle', round: 'rectangleRounded', ellipse: 'oval', triangle: 'triangleIsoc', diamond: 'hexagon', hexagon: 'hexagon', arrow: 'arrow', chevron: 'arrowChevron', line: 'line', banner: 'pentagon' };
const PBI_FONT = { sans: 'Segoe UI', serif: 'Georgia', mono: 'Consolas', rounded: 'Segoe UI', condensed: 'Arial Narrow' };
const colExpr = (t, c) => ({ Column: { Expression: { SourceRef: { Entity: t.name } }, Property: c } });
const measExpr = (t, m) => ({ Measure: { Expression: { SourceRef: { Entity: t.name } }, Property: m } });
const proj = (t, field, name) => ({ field, queryRef: `${t.name}.${name}`, nativeQueryRef: name });

/** Contenedor común: título, fondo, borde, sombra y márgenes interiores. */
function pbiContainer(w, env, title) {
  const vco = {};
  const fill = w.fillType === 'solid' || w.fillType === 'linear' || w.fillType === 'radial';
  if (!w.bg) vco.background = [prop({ show: lBool(false) })];
  else if (fill) vco.background = [prop({ show: lBool(true), color: lColor(w.fill1), transparency: lNum(100 - clamp(+w.fillAlpha, 0, 100)) })];
  const bw = clamp(+w.borderW || 0, 0, 16);
  vco.border = [prop(Object.assign({ show: lBool(bw > 0), radius: lNum(clamp(+w.radius || 0, 0, 60)) }, bw > 0 ? { width: lNum(bw), color: lColor(w.borderColor || env.palette.primary) } : null))];
  vco.dropShadow = [prop(w.shadow && w.shadow !== 'none' && w.bg
    ? { show: lBool(true), preset: lStr(w.shadow === 'glow' ? 'Center' : 'BottomRight'), color: lColor(w.shadow === 'glow' ? env.palette.primary : '#000000'), transparency: lNum(w.shadow === 'strong' || w.shadow === 'float' ? 60 : 78) }
    : { show: lBool(false) })];
  if (title != null) {
    vco.title = [prop(Object.assign({ show: lBool(!!title), text: lStr(title || ''), fontSize: lNum(clamp(+w.titleSize || 14, 8, 40) * 0.75), bold: lBool(w.titleBold !== false), italic: lBool(!!w.titleItalic), alignment: lStr(w.titleAlign || 'left'), fontFamily: lStr(PBI_FONT[w.fontFamily] || 'Segoe UI') }, w.titleColor ? { fontColor: lColor(w.titleColor) } : null))];
  }
  vco.padding = [prop({ top: lNum(8), bottom: lNum(8), left: lNum(8), right: lNum(8) })];
  return vco;
}
/** Párrafos de un cuadro de texto (mismas reglas que renderText: # títulos, - viñetas). */
function pbiParagraphs(w, color) {
  const px = clamp(+w.fontSize || 14, 8, 72);
  const style = (big, bold) => Object.assign({ fontFamily: PBI_FONT[w.fontFamily] || 'Segoe UI', fontSize: Math.round((big ? px * 1.3 : px) * 0.75) + 'pt' }, bold || w.bold ? { fontWeight: 'bold' } : null, w.italic ? { fontStyle: 'italic' } : null, color ? { color } : null);
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push({ textRuns: [{ value: para.join(' '), textStyle: style(false, false) }], horizontalTextAlignment: w.align || 'left' }); para = []; } };
  for (const raw of String(w.text || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^#{1,3}\s+/.test(line)) { flush(); out.push({ textRuns: [{ value: line.replace(/^#{1,3}\s+/, ''), textStyle: style(true, true) }], horizontalTextAlignment: w.align || 'left' }); }
    else if (/^\s*[-*•]\s+/.test(line)) { flush(); out.push({ textRuns: [{ value: line.replace(/^\s*[-*•]\s+/, ''), textStyle: style(false, false) }], horizontalTextAlignment: w.align || 'left', listType: 'bullet' }); }
    else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return out.length ? out : [{ textRuns: [{ value: '' }] }];
}
/** Orden de un visual de categorías (misma lógica «auto» que aggregate). */
function pbiSort(t, w, catField, firstMeasure) {
  let sort = w.sort || 'auto';
  const c = t.byName.get(w.cat);
  if (sort === 'auto') {
    if (!c) return null;
    if (c.src.type === 'date' || c.src.type === 'number') sort = 'cat-asc';
    else if (['line', 'area'].includes(w.type)) return null;
    else {
      const i = t.ds.columns.indexOf(c.src);
      const keys = Array.from(new Set(t.ds.rows.slice(0, 500).map(r => r[i]).filter(v => v != null))).slice(0, 12);
      if (keys.length > 1 && keys.every(k => looksLikePeriod(String(k)))) return null;
      sort = 'value-desc';
    }
  }
  const byValue = sort.startsWith('value');
  const field = byValue ? firstMeasure : catField;
  if (!field) return null;
  return { sort: [{ field, direction: sort.endsWith('desc') ? 'Descending' : 'Ascending' }], isDefaultSort: false };
}
/** Filtro Top N de un visual: las N categorías con mayor valor de la primera medida (o menor, si se ordena ascendente). */
function pbiTopN(t, w, catCol, measure) {
  const src = { Name: 't', Entity: t.name, Type: 0 };
  const col = { Column: { Expression: { SourceRef: { Source: 't' } }, Property: catCol } };
  return {
    name: 'Filter' + hexId(12), field: colExpr(t, catCol), type: 'TopN',
    filter: {
      Version: 2,
      From: [
        { Name: 'subquery', Expression: { Subquery: { Query: { Version: 2, From: [src], Select: [Object.assign({}, col, { Name: 'field' })], OrderBy: [{ Direction: w.sort === 'value-asc' ? 1 : 2, Expression: { Measure: { Expression: { SourceRef: { Source: 't' } }, Property: measure } } }], Top: w.top } } }, Type: 2 },
        src
      ],
      Where: [{ Condition: { In: { Expressions: [col], Table: { SourceRef: { Source: 'subquery' } } } } }]
    },
    howCreated: 'User'
  };
}
const pbiSeriesColor = (w, env, k) => w.colors[k] || env.palette.series[k % env.palette.series.length];

/** Convierte un widget de 4Dash en el contenido «visual» de un visual.json. Devuelve null si no se puede. */
function pbiVisual(w, t, env, notes) {
  const objects = {};
  const query = { queryState: {} };
  const role = (name, list) => { if (list.length) query.queryState[name] = { projections: list }; };
  const grainOf = field => (t ? effectiveGrain(t.ds, w, field) : null);
  const field = name => (t && name ? pbiField(t, name, grainOf(name)) : null);
  const measures = names => (names.length ? names : [null]).map(n => pbiMeasure(t, w, n));
  const mProj = m => proj(t, measExpr(t, m), m);
  const cProj = f => proj(t, colExpr(t, f.column), f.column);
  const labelOf = (w.title || '').trim();
  let visualType, filters = null;

  if (w.type === 'text') {
    return { visualType: 'textbox', objects: { general: [prop({ paragraphs: pbiParagraphs(w, w.textColor) })] }, title: null };
  }
  if (w.type === 'image') {
    if (!env.images.has(w.id)) return null;
    return { visualType: 'image', objects: { general: [prop({ imageUrl: { expr: { ResourcePackageItem: { PackageName: 'RegisteredResources', PackageType: 1, ItemName: env.images.get(w.id).name } } } })], imageScaling: [prop({ imageScalingType: lStr('Fit') })] }, title: w.showTitle ? labelOf : null };
  }
  if (w.type === 'shape') {
    const isLine = w.shape === 'line';
    const color = w.fill1 || env.palette.primary;
    const o = {
      shape: [prop(Object.assign({ tileShape: lStr(PBI_SHAPE[w.shape] || 'rectangle') }, w.shape === 'round' ? { rectangleRoundedCurve: L(Math.round(clamp(+w.radius || 14, 0, 60)) + 'L') } : null))],
      fill: [prop({ show: lBool(!isLine && w.bg), fillColor: lColor(color), transparency: lNum(100 - clamp(+w.fillAlpha, 0, 100)) }, { id: 'default' })],
      outline: [prop(isLine || w.borderW > 0 ? { show: lBool(true), lineColor: lColor(w.borderColor || color), weight: lNum(Math.max(1, +w.borderW || 3)) } : { show: lBool(false) }, { id: 'default' })]
    };
    if (['linear', 'radial'].includes(w.fillType)) notes.push('Las formas con degradado se exportan con su primer color.');
    if (w.text && !isLine) {
      o.text = [prop({ show: lBool(true) }), prop({ text: lStr(String(w.text).replace(/^#{1,3}\s+/gm, '')), fontColor: lColor(w.textColor || '#ffffff'), fontSize: lNum(Math.round(clamp(+w.fontSize || 16, 8, 72) * 0.75)), bold: lBool(!!w.bold), italic: lBool(!!w.italic), horizontalAlignment: lStr(w.align || 'center'), verticalAlignment: lStr('middle'), fontFamily: lStr(PBI_FONT[w.fontFamily] || 'Segoe UI') }, { id: 'default' })];
    }
    return { visualType: 'shape', objects: o, title: null, bare: true };
  }
  if (!t) return null;

  const cat = field(w.cat);
  const vals = w.vals.filter(v => t.byName.has(v));
  switch (w.type) {
    case 'column': case 'stacked': case 'bar': case 'line': case 'area': {
      const split = VIZ[w.type].split ? field(w.split) : null;
      const ms = split ? measures(vals.slice(0, 1)) : measures(vals.slice(0, 8));
      if (!cat) { visualType = 'cardVisual'; role('Data', ms.map(mProj)); break; }
      visualType = PBI_VISUAL[w.type];
      role('Category', [cProj(cat)]);
      role('Y', ms.map(mProj));
      if (split) role('Series', [cProj(split)]);
      const srt = pbiSort(t, w, colExpr(t, cat.column), measExpr(t, ms[0]));
      if (srt) query.sortDefinition = srt;
      if (+w.top > 0) filters = [pbiTopN(t, w, cat.column, ms[0])];
      objects.labels = [prop({ show: lBool(!!w.labels) })];
      objects.legend = [prop({ show: lBool(!!w.showLegend && (ms.length > 1 || !!split)) })];
      objects.valueAxis = [prop({ gridlineShow: lBool(!!w.gridlines) })];
      if (!split && ms.length === 1) objects.dataPoint = [prop({ defaultColor: lColor(w.colors[0] || env.palette.series[(w.slot || 0) % 8]) })];
      else if (!split) objects.dataPoint = ms.map((m, k) => prop({ fill: lColor(pbiSeriesColor(w, env, k)) }, { metadata: `${t.name}.${m}` }));
      if (w.type === 'line' || w.type === 'area') objects.lineStyles = [prop({ strokeWidth: lNum(clamp(+w.lineW || 2, 0.5, 10)), lineChartType: lStr(w.smooth ? 'smooth' : 'linear'), showMarker: lBool(!!w.markers) })];
      if (split && w.colors.some(Boolean)) notes.push('Los colores personalizados por serie de leyenda se sustituyen por los colores del tema.');
      break;
    }
    case 'pie': case 'donut': case 'treemap': {
      const m = measures(vals.slice(0, 1))[0];
      if (!cat) { visualType = 'cardVisual'; role('Data', [mProj(m)]); break; }
      visualType = PBI_VISUAL[w.type];
      role(w.type === 'treemap' ? 'Group' : 'Category', [cProj(cat)]);
      role(w.type === 'treemap' ? 'Values' : 'Y', [mProj(m)]);
      if (+w.top > 0) filters = [pbiTopN(t, w, cat.column, m)];
      objects.labels = [prop({ show: lBool(!!w.labels) })];
      objects.legend = [prop({ show: lBool(!!w.showLegend) })];
      if (w.type === 'donut') objects.slices = [prop({ innerRadiusRatio: L(Math.round(clamp(+w.holeSize || 62, 20, 90)) + 'L') })];
      break;
    }
    case 'scatter': {
      if (vals.length < 2 || vals.slice(0, 2).some(v => t.byName.get(v).src.type !== 'number')) return null;
      const agg = w.agg === 'count' ? 'sum' : w.agg;
      const [mx, my] = vals.slice(0, 2).map(v => pbiMeasure(t, Object.assign({}, w, { agg }), v));
      visualType = 'scatterChart';
      if (cat) role('Category', [cProj(cat)]);
      else { t.needIndex = true; t.indexName = t.indexName || t.globalNamer('Fila'); role('Category', [cProj({ column: t.indexName })]); }
      role('X', [mProj(mx)]);
      role('Y', [mProj(my)]);
      const split = !cat ? field(w.split) : null;
      if (split) role('Series', [cProj(split)]);
      objects.legend = [prop({ show: lBool(!!w.showLegend && !!split) })];
      break;
    }
    case 'kpi': {
      const m = measures(vals.slice(0, 1))[0];
      const trend = cat && ['date', 'number'].includes(t.byName.get(w.cat).src.type) ? cat : null;
      const hasTarget = w.target != null && w.target !== '' && isFinite(+w.target);
      if (trend) {
        visualType = 'kpi';
        role('Indicator', [mProj(m)]);
        role('TrendLine', [cProj(trend)]);
        if (hasTarget) { const g = pbiConstMeasure(t, `Objetivo de ${m}`, +w.target, w); role('Goal', [mProj(g)]); }
      } else {
        visualType = 'cardVisual';
        role('Data', [mProj(m)]);
        if (hasTarget) notes.push('El objetivo de las tarjetas KPI sin eje temporal no tiene equivalente directo y no se exporta.');
      }
      break;
    }
    case 'gauge': {
      const m = measures(vals.slice(0, 1))[0];
      visualType = 'gauge';
      role('Y', [mProj(m)]);
      const ax = {};
      if (w.gaugeMax != null && w.gaugeMax !== '' && +w.gaugeMax > 0) { ax.min = lNum(0); ax.max = lNum(+w.gaugeMax); }
      if (w.target != null && w.target !== '' && isFinite(+w.target)) ax.target = lNum(+w.target);
      if (Object.keys(ax).length) objects.axis = [prop(ax)];
      objects.dataPoint = [prop({ fill: lColor(w.colors[0] || env.palette.series[(w.slot || 0) % 8]) })];
      break;
    }
    case 'table': {
      if (cat) {
        const nums = vals.filter(v => t.byName.get(v).src.type === 'number' || ['count', 'distinct'].includes(w.agg));
        visualType = 'pivotTable';
        role('Rows', [cProj(cat)]);
        role('Values', measures(nums).map(mProj));
        objects.subTotals = [prop({ rowSubtotals: lBool(w.totals !== false), columnSubtotals: lBool(w.totals !== false) })];
      } else {
        const names = (vals.length ? vals : t.ds.columns.map(c => c.name)).filter(v => t.byName.has(v));
        visualType = 'tableEx';
        role('Values', names.map(n => cProj({ column: t.byName.get(n).name })));
        objects.total = [prop({ totals: lBool(w.totals !== false) })];
      }
      objects.columnHeaders = [prop({ columnAdjustment: lStr('growToFit'), autoSizeColumnWidth: lBool(true) })];
      if (w.dataBars) notes.push('Las barras de datos de las tablas no se exportan (en Power BI: formato condicional → Barras de datos).');
      break;
    }
    case 'slicer': {
      if (!cat) return null;
      visualType = 'slicer';
      role('Values', [cProj(cat)]);
      objects.data = [prop({ mode: lStr(w.slicerStyle === 'single' ? 'Dropdown' : 'Basic') })];
      if (w.slicerStyle === 'single') objects.selection = [prop({ strictSingleSelect: lBool(true) })];
      if (w.slicerStyle === 'tiles') objects.general = [prop({ orientation: L("'1'") })];
      objects.header = [prop({ show: lBool(true), text: lStr(labelOf || w.cat) })];
      return { visualType, query, objects, title: null, slicer: true };
    }
    default: return null;
  }
  if (!Object.keys(query.queryState).length) return null;
  return { visualType, query, objects, filters, title: w.showTitle ? (labelOf || env.titleOf(w)) : '' };
}

/* ---------- Tema y filtros ---------- */
function pbiTheme(env, name) {
  const p = env.palette;
  return {
    name,
    dataColors: p.series.concat(p.series.map(c => c)).slice(0, 16),
    foreground: '#1f2430', background: '#ffffff', backgroundLight: '#f4f6fa', foregroundNeutralSecondary: '#5b6475',
    tableAccent: p.primary, good: '#1a9e5c', neutral: '#d9a300', bad: '#d6455d',
    maximum: p.series[0], center: '#d9a300', minimum: '#eef2fb', null: '#c8ccd4',
    visualStyles: { '*': { '*': { border: [{ radius: 6 }], dropShadow: [{ show: true }] } } }
  };
}
/** Valor literal PBIR para una clave de filtro de 4Dash. */
function pbiFilterLiteral(key, type, grain) {
  if (key === BLANK) return 'null';
  if (type === 'number') return isFinite(+key) ? String(+key) + 'D' : null;
  if (type === 'date') {
    if (grain === 'year') return /^\d{4}$/.test(key) ? key + 'L' : null;
    if (grain === 'quarter') { const m = /^(\d{4})-Q([1-4])$/.exec(key); return m ? `'T${m[2]} ${m[1]}'` : null; }
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(key);
    return m ? `datetime'${m[1]}-${m[2]}-${m[3] || '01'}T00:00:00'` : null;
  }
  return "'" + String(key).replace(/'/g, "''") + "'";
}
function pbiReportFilters(project, tables, notes) {
  const out = [];
  for (const f of project.filters || []) {
    const t = tables.get(f.ds);
    if (!t || !f.values.length) continue;
    const c = t.byName.get(f.field);
    if (!c) continue;
    const grain = c.src.type === 'date' ? (f.grain || autoGrain(t.ds, t.ds.columns.indexOf(c.src))) : null;
    const fr = pbiField(t, f.field, grain);
    const lits = f.values.map(v => pbiFilterLiteral(v, c.src.type, grain));
    if (lits.some(v => v == null)) { notes.push(`El filtro activo sobre «${f.field}» no se pudo traducir y no se exporta.`); continue; }
    out.push({
      name: 'Filter' + hexId(12), field: colExpr(t, fr.column), type: 'Categorical',
      filter: { Version: 2, From: [{ Name: 't', Entity: t.name, Type: 0 }], Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: 't' } }, Property: fr.column } }], Values: lits.map(v => [{ Literal: { Value: v } }]) } } }] },
      howCreated: 'User'
    });
  }
  return out;
}

/* ---------- Proyecto completo ---------- */
/**
 * Genera los archivos del proyecto PBIP.
 * env: { palette: {primary, series[]}, titleOf(w), images: Map(widgetId → {name, bytes}) }
 * Devuelve { root, files: [{path, data}], notes: [] }.
 */
async function buildPbip(project, env) {
  const notes = [];
  const base = safeFileName(pbiName(project.title, 'Dashboard')).replace(/[.\s]+$/, '') || 'Dashboard';
  const files = [];
  const add = (path, data) => files.push({ path: `${base}/${path}`, data: typeof data === 'string' ? data : data instanceof Uint8Array ? data : JSON.stringify(data, null, 2) });

  // Modelo: una tabla por origen de datos (nombres únicos en todo el modelo)
  const tableNamer = uniqueNamer();
  const tables = new Map();
  for (const ds of project.datasets) {
    const name = tableNamer(pbiName(ds.name, 'Datos').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Datos');
    tables.set(ds.id, pbiTable(ds, name, null));
  }
  const globalNamer = uniqueNamer([...Array.from(tables.values(), t => t.name), ...Array.from(tables.values()).flatMap(t => t.cols.map(c => c.name))]);
  for (const t of tables.values()) t.globalNamer = globalNamer;

  // Informe (se construye antes que el modelo: los visuales registran medidas y columnas auxiliares)
  const R = `${base}.Report`, S = `${base}.SemanticModel`;
  const pageNames = [];
  let skipped = 0, active = null;
  project.pages.forEach(pg => {
    const pid = hexId(10);
    pageNames.push(pid);
    if (pg.id === project.active) active = pid;
    const pageJson = { $schema: pbiSchema('page'), name: pid, displayName: pbiName(pg.name, 'Página'), displayOption: 'FitToPage', height: Math.round(pg.h), width: Math.round(pg.w) };
    if (pg.bg) {
      pageJson.objects = { background: [prop({ color: lColor(pg.bg.c1), transparency: lNum(0) })] };
      if (pg.bg.type !== 'solid') notes.push(`El fondo degradado de «${pg.name}» se exporta con su primer color.`);
    }
    add(`${R}/definition/pages/${pid}/page.json`, pageJson);
    const order = pg.widgets.map((w, i) => ({ w, i })).sort((a, b) => (a.w.z || 0) - (b.w.z || 0) || a.i - b.i);
    order.forEach(({ w }, k) => {
      const t = w.ds ? tables.get(w.ds) || null : null;
      const v = pbiVisual(w, t, env, notes);
      if (!v) { skipped++; return; }
      const vid = hexId(10);
      const visual = { visualType: v.visualType };
      if (v.query) visual.query = v.query;
      if (Object.keys(v.objects || {}).length) visual.objects = v.objects;
      visual.visualContainerObjects = v.bare ? { background: [prop({ show: lBool(false) })], border: [prop({ show: lBool(false) })], padding: [prop({ top: lNum(0), bottom: lNum(0), left: lNum(0), right: lNum(0) })] } : pbiContainer(w, env, v.title);
      if (['linear', 'radial'].includes(w.fillType) && !v.bare) notes.push('Los fondos degradados de los visuales se exportan con su primer color.');
      visual.drillFilterOtherVisuals = true;
      const vj = {
        $schema: pbiSchema('visual'), name: vid,
        position: { x: Math.round(w.x), y: Math.round(w.y), z: (k + 1) * 1000, height: Math.round(w.h), width: Math.round(w.w), tabOrder: (k + 1) * 1000 },
        visual
      };
      if (v.filters) vj.filterConfig = { filters: v.filters };
      add(`${R}/definition/pages/${pid}/visuals/${vid}/visual.json`, vj);
    });
  });
  if (skipped) notes.push(`${skipped} visual(es) sin datos suficientes no se exportaron.`);

  // Recursos: tema e imágenes
  const themeName = `4Dash-${hexId(4)}.json`;
  const items = [{ name: themeName, path: themeName, type: 'CustomTheme' }];
  add(`${R}/StaticResources/RegisteredResources/${themeName}`, pbiTheme(env, themeName));
  for (const img of env.images.values()) {
    items.push({ name: img.name, path: img.name, type: 'Image' });
    add(`${R}/StaticResources/RegisteredResources/${img.name}`, img.bytes);
  }
  const ver = { visual: PBI_VER.visual.split('/').pop(), report: PBI_VER.report.split('/').pop(), page: PBI_VER.page.split('/').pop() };
  const reportJson = {
    $schema: pbiSchema('report'),
    themeCollection: { customTheme: { name: themeName, reportVersionAtImport: ver, type: 'RegisteredResources' } },
    resourcePackages: [{ name: 'RegisteredResources', type: 'RegisteredResources', items }],
    settings: { useStylableVisualContainerHeader: true, exportDataMode: 'AllowSummarized', defaultDrillFilterOtherVisuals: true, allowChangeFilterTypes: true, useEnhancedTooltips: true, useDefaultAggregateDisplayName: true }
  };
  const rf = pbiReportFilters(project, tables, notes);
  if (rf.length) reportJson.filterConfig = { filters: rf };
  add(`${R}/definition/report.json`, reportJson);
  add(`${R}/definition/version.json`, { $schema: pbiSchema('version'), version: '2.0.0' });
  add(`${R}/definition/pages/pages.json`, { $schema: pbiSchema('pages'), pageOrder: pageNames, activePageName: active || pageNames[0] });
  add(`${R}/definition.pbir`, { $schema: pbiSchema('pbir'), version: '4.0', datasetReference: { byPath: { path: `../${S}` } } });
  add(`${R}/.platform`, { $schema: PBI_SCHEMA + PBI_VER.platform + '/schema.json', metadata: { type: 'Report', displayName: base }, config: { version: '2.0', logicalId: guid() } });

  // Modelo semántico (TMDL)
  let needFolder = false;
  const refs = [];
  for (const t of tables.values()) {
    const part = await pbiPartition(t, notes);
    if (part.csv) { needFolder = true; add(`datos/${part.csv.file}`, part.csv.data); }
    add(`${S}/definition/tables/${safeFileName(t.name)}.tmdl`, pbiTableTmdl(t, part));
    refs.push(`ref table ${tmdlName(t.name)}`);
  }
  if (!tables.size) notes.push('El proyecto no tiene orígenes de datos: el modelo semántico se exporta vacío.');
  add(`${S}/definition/database.tmdl`, `database ${guid()}\n\tcompatibilityLevel: 1567\n\tcompatibilityMode: powerBI\n`);
  add(`${S}/definition/model.tmdl`, ['model Model', '\tculture: es-ES', '\tdefaultPowerBIDataSourceVersion: powerBI_V3', '\tsourceQueryCulture: es-ES', '', ...refs, ''].join('\n'));
  if (needFolder) add(`${S}/definition/expressions.tmdl`, `expression CarpetaDatos = ${mStr('C:\\4Dash\\datos')} meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n`);
  add(`${S}/definition.pbism`, { $schema: pbiSchema('pbism'), version: '4.2', settings: { qnaEnabled: false } });
  add(`${S}/.platform`, { $schema: PBI_SCHEMA + PBI_VER.platform + '/schema.json', metadata: { type: 'SemanticModel', displayName: base }, config: { version: '2.0', logicalId: guid() } });
  add(`${base}.pbip`, { $schema: pbiSchema('pbip'), version: '1.0', artifacts: [{ report: { path: R } }], settings: { enableAutoRecovery: true } });
  add('LEEME.txt', [
    `${project.title} — proyecto de Power BI generado por 4Dash`,
    '',
    '1. Descomprime el .zip completo (no abras los archivos desde dentro del zip).',
    `2. Abre «${base}.pbip» con Power BI Desktop.`,
    '3. Pulsa «Actualizar» en la cinta Inicio para cargar los datos en el modelo.',
    ...(needFolder ? ['   Antes, en Transformar datos → Administrar parámetros, indica en «CarpetaDatos» la ruta de la carpeta «datos» de este proyecto.'] : []),
    '4. Si necesitas un único archivo, usa Archivo → Guardar como → .pbix.',
    '',
    'Formato: Power BI Project (PBIP) con modelo TMDL e informe PBIR, los formatos de proyecto abiertos y documentados por Microsoft.',
    'Las URL «$schema» de los archivos son referencias a los esquemas públicos; 4Dash no se conecta a ninguna.',
    'Power BI es una marca de Microsoft. 4Dash es un proyecto independiente sin afiliación con Microsoft.',
    ...(notes.length ? ['', 'Notas de la conversión:', ...Array.from(new Set(notes), n => '- ' + n)] : [])
  ].join('\r\n'));
  return { root: base, files, notes: Array.from(new Set(notes)) };
}

/* ---------- Integración con la interfaz ---------- */
/** Imágenes de los visuales como archivos PNG/JPEG/GIF (las WebP se convierten a PNG: Power BI no las admite). */
async function pbiImages(project) {
  const out = new Map();
  let n = 0;
  for (const pg of project.pages) for (const w of pg.widgets) {
    if (w.type !== 'image' || !w.img) continue;
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(w.img);
    if (!m) continue;
    let bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    let ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    if (ext === 'webp') {
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
      const cv = document.createElement('canvas');
      cv.width = bmp.width; cv.height = bmp.height;
      cv.getContext('2d').drawImage(bmp, 0, 0);
      bytes = new Uint8Array(await (await canvasBlob(cv, 'image/png')).arrayBuffer());
      ext = 'png';
    }
    out.set(w.id, { name: `imagen${++n}${Date.now()}.${ext}`, bytes });
  }
  return out;
}
async function exportPowerBI() {
  const busy = toast('Generando el proyecto de Power BI…', 'info', 120000);
  try {
    const pal = currentPalette();
    const env = { palette: { primary: pal.primary, series: (pal.light || pal.series).slice(0, 8) }, titleOf: autoTitle, images: await pbiImages(App.p) };
    const { root, files, notes } = await buildPbip(App.p, env);
    const zip = await buildZip(files);
    downloadFile(`${root} (Power BI).zip`, 'application/zip', zip);
    busy.remove();
    toast(notes.length ? `Proyecto de Power BI exportado con ${notes.length} nota(s): revisa LEEME.txt` : 'Proyecto de Power BI exportado. Descomprímelo y abre el .pbip', 'ok', 6000);
  } catch (err) {
    busy.remove();
    reportError(err);
  }
}
