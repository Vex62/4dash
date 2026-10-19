/* ==========================================================================
   Columnas condicionales: reglas «Si … entonces …» que crean una columna
   nueva a partir de los datos cargados (similar a SI.CONJUNTO / CASE WHEN).
   Las definiciones se guardan en ds.calc y los valores se materializan en
   ds.rows, de modo que filtros, agregaciones y visuales los usan sin cambios.
   Sin eval ni new Function: las reglas se interpretan, nunca se ejecutan.
   ========================================================================== */

/* Definición:
   { id, name, type: 'text'|'number'|'date',
     rules: [{ all: true|false, conds: [{ col, op, a, b }], res }],
     other }
   Operando (a, b, res, other): { k: 'v', v: literal } | { k: 'c', v: nombreColumna } | { k: 'n' } (vacío) */
const CALC_MAX = { defs: 40, rules: 30, conds: 10 };
const CALC_OPS = {
  number: [
    ['eq', 'es igual a'], ['ne', 'no es igual a'], ['gt', 'es mayor que'], ['ge', 'es mayor o igual que'],
    ['lt', 'es menor que'], ['le', 'es menor o igual que'], ['between', 'está entre (incluidos)'], ['notBetween', 'no está entre'],
    ['empty', 'está vacío'], ['notEmpty', 'no está vacío']
  ],
  date: [
    ['eq', 'es el día'], ['ne', 'no es el día'], ['gt', 'es posterior a'], ['ge', 'es igual o posterior a'],
    ['lt', 'es anterior a'], ['le', 'es igual o anterior a'], ['between', 'está entre (incluidas)'], ['notBetween', 'no está entre'],
    ['year', 'es del año'], ['month', 'es del mes (1-12)'], ['lastDays', 'está en los últimos N días'],
    ['beforeToday', 'es anterior a hoy'], ['afterToday', 'es posterior a hoy'],
    ['empty', 'está vacío'], ['notEmpty', 'no está vacío']
  ],
  text: [
    ['eq', 'es igual a'], ['ne', 'no es igual a'], ['contains', 'contiene'], ['notContains', 'no contiene'],
    ['starts', 'empieza por'], ['ends', 'termina en'], ['in', 'es uno de (separados por ;)'],
    ['empty', 'está vacío'], ['notEmpty', 'no está vacío']
  ]
};
const CALC_ALL_OPS = new Set(Object.values(CALC_OPS).flat().map(o => o[0]));
/** Número de operandos de cada operador (por defecto, 1). */
const opArity = op => (['empty', 'notEmpty', 'beforeToday', 'afterToday'].includes(op) ? 0 : ['between', 'notBetween'].includes(op) ? 2 : 1);
/** Operadores cuyo operando es un número entero aunque la columna sea fecha, o una lista: solo admiten valor fijo. */
const opLiteralOnly = op => ['year', 'month', 'lastDays', 'in'].includes(op);
const opOperandType = (op, type) => (['year', 'month', 'lastDays'].includes(op) ? 'number' : type);
const NEGATED = { ne: 'eq', notBetween: 'between', notContains: 'contains' };

/** Normaliza texto para comparar: sin mayúsculas, acentos ni espacios sobrantes. */
function normText(v) {
  return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase(LOCALE).replace(/\s+/g, ' ').trim();
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDaysIso(iso, n) {
  const d = new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Índice de columna usable por la definición k (no puede leer columnas condicionales posteriores ni a sí misma). */
function calcRefIdx(tbl, k, name) {
  const j = tbl.columns.findIndex(c => c.name === name);
  if (j < 0) return -1;
  const ref = tbl.columns[j].calc;
  if (ref) { const pos = tbl.calc.findIndex(d => d.id === ref); if (pos < 0 || pos >= k) return -1; }
  return j;
}

/** Devuelve una función (fila) -> valor. Las referencias inválidas hacen que la condición no se cumpla. */
function compileCalc(tbl, k) {
  const def = tbl.calc[k];
  const today = todayIso();
  const operand = (o, type) => {
    if (!o || o.k === 'n') return () => null;
    if (o.k === 'c') {
      const j = calcRefIdx(tbl, k, o.v);
      if (j < 0) return null;
      const src = tbl.columns[j].type;
      return src === type ? r => r[j] : r => convertValue(r[j], type);
    }
    const v = convertValue(o.v, type);
    return () => v;
  };
  const condFn = c => {
    const i = calcRefIdx(tbl, k, c.col);
    if (i < 0 || !CALC_ALL_OPS.has(c.op)) return () => false;
    const type = tbl.columns[i].type;
    const op = c.op;
    if (op === 'empty') return r => r[i] == null || r[i] === '';
    if (op === 'notEmpty') return r => !(r[i] == null || r[i] === '');
    if (NEGATED[op]) { const pos = condFn(Object.assign({}, c, { op: NEGATED[op] })); return r => !pos(r); }
    const ot = opOperandType(op, type);
    const fa = operand(c.a, ot), fb = opArity(op) === 2 ? operand(c.b, ot) : () => null;
    if (!fa || !fb) return () => false;
    if (type === 'number') {
      const cmp = { eq: (x, a) => x === a, gt: (x, a) => x > a, ge: (x, a) => x >= a, lt: (x, a) => x < a, le: (x, a) => x <= a }[op];
      if (op === 'between') return r => { const x = r[i], a = fa(r), b = fb(r); return x != null && a != null && b != null && x >= Math.min(a, b) && x <= Math.max(a, b); };
      if (!cmp) return () => false;
      return r => { const x = r[i], a = fa(r); return x != null && a != null && cmp(x, a); };
    }
    if (type === 'date') {
      const day = v => (typeof v === 'string' ? v.slice(0, 10) : null);
      if (op === 'beforeToday') return r => { const x = day(r[i]); return x != null && x < today; };
      if (op === 'afterToday') return r => { const x = day(r[i]); return x != null && x > today; };
      if (op === 'year') return r => { const x = day(r[i]), a = fa(r); return x != null && a != null && +x.slice(0, 4) === a; };
      if (op === 'month') return r => { const x = day(r[i]), a = fa(r); return x != null && a != null && +x.slice(5, 7) === a; };
      if (op === 'lastDays') return r => { const x = day(r[i]), a = fa(r); return x != null && a != null && x <= today && x >= addDaysIso(today, -Math.abs(Math.round(a))); };
      const cmp = { eq: (x, a) => x === a, gt: (x, a) => x > a, ge: (x, a) => x >= a, lt: (x, a) => x < a, le: (x, a) => x <= a }[op];
      if (op === 'between') return r => { const x = day(r[i]), a = day(fa(r)), b = day(fb(r)); return x != null && a != null && b != null && x >= (a < b ? a : b) && x <= (a < b ? b : a); };
      if (!cmp) return () => false;
      return r => { const x = day(r[i]), a = day(fa(r)); return x != null && a != null && cmp(x, a); };
    }
    // Texto: sin distinguir mayúsculas ni acentos
    if (op === 'in') {
      const set = new Set(String(c.a && c.a.v != null ? c.a.v : '').split(';').map(normText).filter(Boolean));
      return r => r[i] != null && set.has(normText(r[i]));
    }
    const test = { eq: (x, a) => x === a, contains: (x, a) => x.includes(a), starts: (x, a) => x.startsWith(a), ends: (x, a) => x.endsWith(a) }[op];
    if (!test) return () => false;
    return r => { const a = fa(r); return r[i] != null && a != null && test(normText(r[i]), normText(a)); };
  };
  const rules = def.rules.map(rule => {
    const conds = rule.conds.map(condFn);
    const res = operand(rule.res, def.type) || (() => null);
    const when = !conds.length ? () => false : rule.all ? r => conds.every(f => f(r)) : r => conds.some(f => f(r));
    return { when, res };
  });
  const other = operand(def.other, def.type) || (() => null);
  const fn = r => { for (const rl of rules) if (rl.when(r)) return rl.res(r); return other(r); };
  /** Variante que también indica qué regla se aplicó (-1 = «en otro caso»), para la vista previa. */
  fn.which = r => { for (let n = 0; n < rules.length; n++) if (rules[n].when(r)) return n; return -1; };
  return fn;
}

/**
 * Recalcula todas las columnas condicionales de una tabla ({columns, rows, calc}).
 * Crea las que falten y convierte en normales las columnas cuya definición ya no existe.
 */
function applyCalcColumns(tbl, onlyRows) {
  if (!Array.isArray(tbl.calc)) tbl.calc = [];
  const ids = new Set(tbl.calc.map(d => d.id));
  for (const c of tbl.columns) if (c.calc && !ids.has(c.calc)) delete c.calc;
  tbl.calc.forEach((def, k) => {
    let j = tbl.columns.findIndex(c => c.calc === def.id);
    if (j < 0) {
      if (tbl.columns.length >= LIMITS.cols) return;
      j = tbl.columns.length;
      tbl.columns.push({ name: def.name, type: def.type, role: null, calc: def.id });
      for (const r of tbl.rows) r.push(null);
    }
    Object.assign(tbl.columns[j], { name: def.name, type: def.type });
    const fn = compileCalc(tbl, k);
    for (const r of onlyRows || tbl.rows) r[j] = fn(r);
  });
}
/** Actualiza las referencias a una columna renombrada dentro de las definiciones. */
function renameCalcRefs(calc, from, to) {
  const fix = o => { if (o && o.k === 'c' && o.v === from) o.v = to; };
  for (const d of calc || []) {
    for (const rl of d.rules) { fix(rl.res); for (const c of rl.conds) { if (c.col === from) c.col = to; fix(c.a); fix(c.b); } }
    fix(d.other);
  }
}
/** Nombres de las definiciones que usan una columna. */
function calcUsersOf(calc, name, exceptId) {
  const uses = o => o && o.k === 'c' && o.v === name;
  return (calc || []).filter(d => d.id !== exceptId && (uses(d.other) || d.rules.some(rl => uses(rl.res) || rl.conds.some(c => c.col === name || uses(c.a) || uses(c.b))))).map(d => d.name);
}

/* ---------- Saneado (proyectos abiertos desde archivo o autoguardado) ---------- */
function sanitizeCalc(list) {
  if (!Array.isArray(list)) return [];
  const field = v => (typeof v === 'string' && v.length <= 80 ? v : null);
  const operandOf = o => {
    if (!o || typeof o !== 'object') return { k: 'n' };
    if (o.k === 'c') return field(o.v) ? { k: 'c', v: o.v } : { k: 'n' };
    if (o.k === 'v') return typeof o.v === 'number' && isFinite(o.v) ? { k: 'v', v: o.v } : typeof o.v === 'string' ? { k: 'v', v: o.v.slice(0, 2000) } : { k: 'n' };
    return { k: 'n' };
  };
  const ids = new Set();
  return list.slice(0, CALC_MAX.defs).map(d => {
    if (!d || typeof d !== 'object' || !field(d.name) || !Array.isArray(d.rules)) return null;
    const id = ID_RE.test(d.id) && !ids.has(d.id) ? d.id : uid();
    ids.add(id);
    return {
      id, name: d.name.trim().slice(0, 80) || 'Columna condicional', type: oneOf(d.type, ['text', 'number', 'date'], 'text'),
      rules: d.rules.slice(0, CALC_MAX.rules).filter(rl => rl && Array.isArray(rl.conds)).map(rl => ({
        all: bool(rl.all, true),
        conds: rl.conds.slice(0, CALC_MAX.conds).filter(c => c && field(c.col) && CALC_ALL_OPS.has(c.op)).map(c => ({ col: c.col, op: c.op, a: operandOf(c.a), b: operandOf(c.b) })),
        res: operandOf(rl.res)
      })),
      other: operandOf(d.other)
    };
  }).filter(Boolean);
}

/* ---------- Constructor visual de reglas ---------- */
const CALC_TYPES = [['text', 'Texto'], ['number', 'Número'], ['date', 'Fecha']];
function blankCond(col) { return { col: col ? col.name : null, op: col ? CALC_OPS[col.type][0][0] : 'eq', a: { k: 'v', v: null }, b: { k: 'v', v: null } }; }

/**
 * Abre el editor de una columna condicional sobre una tabla de trabajo ({columns, rows, calc}).
 * onSave(def) recibe la definición validada; no modifica la tabla.
 */
function openCalcBuilder(tbl, calcId, onSave) {
  const k0 = calcId ? tbl.calc.findIndex(d => d.id === calcId) : tbl.calc.length;
  const def = calcId ? deepClone(tbl.calc[k0]) : null;
  // Columnas que la regla puede leer: las normales y las condicionales definidas antes que esta
  const usable = tbl.columns.filter(c => !c.calc || tbl.calc.findIndex(d => d.id === c.calc) < k0);
  const colByName = n => usable.find(c => c.name === n) || null;
  if (!usable.length) { toast('El origen no tiene columnas que se puedan usar en una condición', 'error'); return null; }
  let draft = def || {
    id: uid(), name: '', type: 'text',
    rules: [{ all: true, conds: [blankCond(usable.find(c => c.type === 'date') || usable[0])], res: { k: 'v', v: null } }],
    other: { k: 'n' }
  };
  if (!draft.name) { let n = 'Condicional', i = 1; while (tbl.columns.some(c => c.name === n)) n = `Condicional ${++i}`; draft.name = n; }

  const body = h('div', { class: 'modal-body calc-body' });
  const preview = h('div', { class: 'calc-preview' });
  const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancelar' });
  const save = h('button', { class: 'btn primary', type: 'button', text: calcId ? 'Guardar cambios' : 'Crear columna' });
  const m = openModal({ title: calcId ? 'Editar columna condicional' : 'Nueva columna condicional', cls: 'calc-modal', labelledIcon: 'branch', body, foot: h('div', { class: 'modal-foot' }, cancel, save) });
  cancel.addEventListener('click', () => m.close());
  save.addEventListener('click', () => {
    const err = validate();
    if (err) { toast(err, 'error'); draw(); return; }
    m.close();
    onSave(clean(draft));
  });

  const refreshPreview = debounce(drawPreview, 150);
  /** Redibuja conservando el foco (los controles llevan una clave estable en data-k). */
  function draw() {
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
    clear(body);
    body.append(...drawHead(), ...drawRules(), drawOther(), preview);
    drawPreview();
    if (fk) { const el = body.querySelector(`[data-k="${fk}"]`); if (el) el.focus(); }
  }
  const keyed = (el, key) => { el.dataset.k = key; return el; };
  const btn = (ic, label, fn, key, cls = 'icon-btn') => {
    const b = keyed(h('button', { class: cls, type: 'button', title: label, 'aria-label': label }, icon(ic, 15), cls === 'icon-btn' ? null : label), key);
    b.addEventListener('click', fn);
    return b;
  };

  function drawHead() {
    const name = keyed(inputEl(draft.name, v => { draft.name = v.replace(/\s+/g, ' ').slice(0, 80); }, { label: 'Nombre de la columna', max: 80 }), 'name');
    const type = keyed(selectEl(CALC_TYPES, draft.type, v => {
      draft.type = v;
      // Los valores fijos de resultado se reinterpretan con el nuevo tipo
      for (const o of [...draft.rules.map(r => r.res), draft.other]) if (o.k === 'v') o.v = o.v == null ? null : convertValue(o.v, v);
      draw();
    }, { label: 'Tipo de resultado' }), 'type');
    return [
      h('div', { class: 'form-inline calc-head' }, formRow('Nombre de la nueva columna', name), formRow('Tipo de resultado', type)),
      h('p', { class: 'hint', text: 'Las reglas se comprueban en orden, de arriba abajo: cada fila toma el resultado de la primera regla que cumple. Si no cumple ninguna, se usa «En otro caso». Los textos se comparan sin distinguir mayúsculas ni acentos; las fechas, por día.' })
    ];
  }

  function drawRules() {
    const out = [];
    draft.rules.forEach((rule, ri) => {
      const head = h('div', { class: 'calc-rule-head' },
        h('span', { class: 'calc-badge', text: ri === 0 ? 'SI' : 'SI NO, SI' }),
        h('span', { class: 'lbl', text: 'se cumplen' }),
        keyed(selectEl([['all', 'todas las condiciones (Y)'], ['any', 'alguna condición (O)']], rule.all ? 'all' : 'any', v => { rule.all = v === 'all'; refreshPreview(); }, { label: `Regla ${ri + 1}: tipo de combinación` }), `r${ri}all`),
        h('span', { class: 'grow' }),
        btn('chevU', 'Subir regla', () => { draft.rules.splice(ri - 1, 0, draft.rules.splice(ri, 1)[0]); draw(); }, `r${ri}up`),
        btn('chevD', 'Bajar regla', () => { draft.rules.splice(ri + 1, 0, draft.rules.splice(ri, 1)[0]); draw(); }, `r${ri}down`),
        btn('trash', 'Eliminar regla', () => { draft.rules.splice(ri, 1); draw(); }, `r${ri}del`));
      head.querySelector(`[data-k="r${ri}up"]`).disabled = ri === 0;
      head.querySelector(`[data-k="r${ri}down"]`).disabled = ri === draft.rules.length - 1;
      const conds = h('div', { class: 'calc-conds' });
      rule.conds.forEach((c, ci) => conds.appendChild(drawCond(rule, c, ri, ci)));
      const addCond = btn('plus', 'Añadir condición', () => { rule.conds.push(blankCond(colByName(rule.conds.length ? rule.conds[rule.conds.length - 1].col : null) || usable[0])); draw(); }, `r${ri}addc`, 'btn subtle');
      addCond.disabled = rule.conds.length >= CALC_MAX.conds;
      const then = h('div', { class: 'calc-then' }, h('span', { class: 'calc-badge then', text: 'ENTONCES' }), ...operandEditor(rule.res, draft.type, `r${ri}res`, { label: `Resultado de la regla ${ri + 1}`, empty: true }));
      out.push(h('section', { class: 'calc-rule', 'aria-label': `Regla ${ri + 1}` }, head, conds, addCond, then));
    });
    const add = btn('plus', 'Añadir regla', () => { draft.rules.push({ all: true, conds: [blankCond(usable[0])], res: { k: 'v', v: null } }); draw(); }, 'addrule', 'btn');
    add.disabled = draft.rules.length >= CALC_MAX.rules;
    out.push(add);
    return out;
  }

  function drawCond(rule, c, ri, ci) {
    const key = `r${ri}c${ci}`;
    const col = colByName(c.col);
    const colSel = keyed(selectEl([[null, 'Elige una columna…'], ...usable.map(u => [u.name, `${u.name} (${typeLabel(u)})`])], c.col, v => {
      const nc = colByName(v);
      const prevType = col ? col.type : null;
      c.col = v;
      if (nc && nc.type !== prevType) Object.assign(c, blankCond(nc));
      draw();
    }, { label: 'Columna' }), key + 'col');
    if (c.col && !col) colSel.classList.add('invalid');
    const parts = [colSel];
    if (col) {
      const ops = CALC_OPS[col.type];
      if (!ops.some(o => o[0] === c.op)) c.op = ops[0][0];
      parts.push(keyed(selectEl(ops, c.op, v => { const ot = opOperandType(c.op, col.type); c.op = v; if (opOperandType(v, col.type) !== ot || opLiteralOnly(v)) { c.a = { k: 'v', v: null }; c.b = { k: 'v', v: null }; } draw(); }, { label: 'Operador' }), key + 'op'));
      const ar = opArity(c.op), ot = opOperandType(c.op, col.type);
      const lit = opLiteralOnly(c.op);
      if (ar >= 1) parts.push(...operandEditor(c.a, ot, key + 'a', { label: ar === 2 ? 'Desde' : 'Valor', literalOnly: lit, placeholder: c.op === 'in' ? 'Norte; Sur; Este' : null, int: ['year', 'month', 'lastDays'].includes(c.op) }));
      if (ar === 2) parts.push(h('span', { class: 'lbl', text: 'y' }), ...operandEditor(c.b, ot, key + 'b', { label: 'Hasta' }));
    }
    const del = btn('close', 'Quitar condición', () => { rule.conds.splice(ci, 1); draw(); }, key + 'del');
    return h('div', { class: 'calc-cond' }, h('span', { class: 'calc-join', text: ci === 0 ? '' : rule.all ? 'Y' : 'O' }), h('div', { class: 'calc-cond-fields' }, ...parts), del);
  }

  /** Editor de un operando: [Valor fijo | Columna X | (vacío)] + control del valor. */
  function operandEditor(o, type, key, opts = {}) {
    const choices = [['v', opts.empty ? 'Valor fijo' : 'Valor']];
    if (opts.empty) choices.push(['n', '(Vacío)']);
    if (!opts.literalOnly) for (const u of usable) choices.push(['c:' + u.name, 'Columna: ' + u.name]);
    const cur = o.k === 'c' ? 'c:' + o.v : o.k;
    const src = keyed(selectEl(choices, cur, v => {
      if (v === 'v') Object.assign(o, { k: 'v', v: null });
      else if (v === 'n') { o.k = 'n'; delete o.v; }
      else Object.assign(o, { k: 'c', v: v.slice(2) });
      draw();
    }, { label: (opts.label || 'Valor') + ': origen' }), key + 'src');
    src.classList.add('calc-src');
    if (o.k === 'c' && !colByName(o.v)) src.classList.add('invalid');
    if (o.k !== 'v') return [src];
    return [src, literalInput(o, type, key, opts)];
  }
  function literalInput(o, type, key, opts) {
    const label = opts.label || 'Valor';
    if (type === 'date') {
      const inp = keyed(h('input', { class: 'inp', type: 'date', 'aria-label': label }), key + 'v');
      inp.value = typeof o.v === 'string' ? o.v.slice(0, 10) : '';
      inp.addEventListener('input', () => { o.v = ISO_RE.test(inp.value) ? inp.value : null; refreshPreview(); });
      return inp;
    }
    if (type === 'number') {
      const inp = keyed(inputEl(o.v == null ? '' : String(o.v).replace('.', ','), v => {
        const n = v.trim() === '' ? null : opts.int ? (/^-?\d+$/.test(v.trim()) ? +v.trim() : null) : parseNumberStr(v, true);
        inp.classList.toggle('invalid', v.trim() !== '' && n == null);
        o.v = n; refreshPreview();
      }, { label, placeholder: opts.int ? 'p. ej. 2025' : '0', max: 40 }), key + 'v');
      inp.setAttribute('inputmode', opts.int ? 'numeric' : 'decimal');
      return inp;
    }
    return keyed(inputEl(o.v == null ? '' : String(o.v), v => { o.v = v === '' ? null : v.slice(0, 2000); refreshPreview(); }, { label, placeholder: opts.placeholder || 'Texto', max: 2000 }), key + 'v');
  }

  function drawOther() {
    return h('div', { class: 'calc-then calc-other' }, h('span', { class: 'calc-badge then', text: 'EN OTRO CASO' }),
      ...operandEditor(draft.other, draft.type, 'other', { label: 'Resultado en otro caso', empty: true }));
  }

  /** Vista previa: recuento por regla y primeras filas con las columnas implicadas. */
  function drawPreview() {
    clear(preview);
    if (validate(true)) { preview.appendChild(h('p', { class: 'hint', text: 'Completa las condiciones para ver la vista previa.' })); return; }
    const d = clean(draft);
    const tmp = { columns: tbl.columns, rows: tbl.rows, calc: tbl.calc.slice(0, k0).concat([d]) };
    const fn = compileCalc(tmp, k0);
    const counts = new Array(d.rules.length).fill(0);
    let other = 0;
    // Muestra: hasta 5 filas que cumplen alguna regla y el resto, hasta 8, que no
    const hit = [], miss = [];
    for (const r of tbl.rows) {
      const n = fn.which(r);
      if (n < 0) { other++; if (miss.length < 8) miss.push(r); } else { counts[n]++; if (hit.length < 8) hit.push(r); }
    }
    const sample = hit.slice(0, Math.max(5, 8 - miss.length)).concat(miss).slice(0, 8);
    preview.appendChild(h('div', { class: 'section-title', text: 'Vista previa' }));
    const total = tbl.rows.length || 1;
    preview.appendChild(h('ul', { class: 'calc-counts' },
      ...counts.map((c, n) => h('li', null, h('b', { text: `Regla ${n + 1}: ` }), `${fmtNum(c)} filas (${fmtNum(c / total, 'percent')})`)),
      h('li', null, h('b', { text: 'En otro caso: ' }), `${fmtNum(other)} filas (${fmtNum(other / total, 'percent')})`)));
    const refs = [];
    for (const rl of d.rules) for (const c of rl.conds) { refs.push(c.col); for (const o of [c.a, c.b]) if (o && o.k === 'c') refs.push(o.v); }
    const cols = Array.from(new Set(refs)).map(n => tbl.columns.findIndex(c => c.name === n)).filter(j => j >= 0).slice(0, 5);
    const table = h('table', { class: 'calc-sample' });
    table.appendChild(h('thead', null, h('tr', null, ...cols.map(j => h('th', { text: tbl.columns[j].name })), h('th', { class: 'res', text: d.name || 'Resultado' }))));
    const tb = h('tbody');
    const show = (v, t) => (v == null ? '' : t === 'number' ? fmtNum(v) : t === 'date' ? fmtDateKey(v) : String(v));
    for (const r of sample) tb.appendChild(h('tr', null, ...cols.map(j => h('td', { text: show(r[j], tbl.columns[j].type) })), h('td', { class: 'res', text: show(fn(r), d.type) })));
    table.appendChild(tb);
    preview.appendChild(h('div', { class: 'calc-sample-wrap' }, table));
  }

  /** Copia limpia de la definición (sin valores de operandos que el operador no usa). */
  function clean(d) {
    const o = deepClone(d);
    o.name = o.name.trim();
    for (const rl of o.rules) for (const c of rl.conds) {
      const ar = opArity(c.op);
      if (ar < 1) c.a = { k: 'n' };
      if (ar < 2) c.b = { k: 'n' };
    }
    return o;
  }
  function validate(quiet) {
    const name = draft.name.trim();
    if (!name) return 'Escribe un nombre para la columna.';
    if (tbl.columns.some(c => c.name === name && c.calc !== draft.id)) return `Ya existe una columna llamada «${name}».`;
    if (!draft.rules.length) return 'Añade al menos una regla.';
    for (let ri = 0; ri < draft.rules.length; ri++) {
      const rl = draft.rules[ri];
      if (!rl.conds.length) return `La regla ${ri + 1} no tiene condiciones.`;
      for (const c of rl.conds) {
        const col = colByName(c.col);
        if (!col) return `Elige una columna en todas las condiciones de la regla ${ri + 1}.`;
        const ar = opArity(c.op);
        for (const o of [c.a, c.b].slice(0, ar)) {
          if (o.k === 'c' && !colByName(o.v)) return `La regla ${ri + 1} usa una columna que no existe.`;
          if (o.k !== 'c' && (o.v == null || o.v === '')) return `Falta un valor en la regla ${ri + 1} (${c.col}).`;
        }
        if (c.op === 'month' && !(c.a.v >= 1 && c.a.v <= 12)) return `El mes de la regla ${ri + 1} debe estar entre 1 y 12.`;
      }
      if (rl.res.k === 'c' && !colByName(rl.res.v)) return `El resultado de la regla ${ri + 1} usa una columna que no existe.`;
      if (rl.res.k === 'v' && (rl.res.v == null || rl.res.v === '') && !quiet) return `Indica el resultado de la regla ${ri + 1} (o elige «(Vacío)»).`;
    }
    if (draft.other.k === 'c' && !colByName(draft.other.v)) return 'El resultado «En otro caso» usa una columna que no existe.';
    if (draft.other.k === 'v' && (draft.other.v == null || draft.other.v === '') && !quiet) return 'Indica el resultado «En otro caso» (o elige «(Vacío)»).';
    return null;
  }
  draw();
  return m;
}
