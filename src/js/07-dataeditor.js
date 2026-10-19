/* ==========================================================================
   Editor de datos: ver y modificar celdas, columnas, tipos y orígenes.
   Se trabaja sobre una copia; los cambios se aplican al pulsar «Aplicar».
   ========================================================================== */

function convertValue(v, type) {
  if (v == null || v === '') return null;
  if (type === 'number') {
    if (typeof v === 'number') return v;
    return parseNumberStr(String(v), true);
  }
  if (type === 'date') {
    if (typeof v === 'number') return v > 20000 && v < 80000 ? dateToIso(serialToDate(v, false)) : null;
    const t = String(v);
    return ISO_RE.test(t) ? t : parseDateStr(t);
  }
  return typeof v === 'number' ? String(v) : String(v).slice(0, 2000);
}
function cellDisplay(v, type) {
  if (v == null) return '';
  if (type === 'number') return String(v).replace('.', ',');
  return String(v);
}

function openDataEditor(dsId) {
  if (!App.p.datasets.length) return toast('Todavía no hay datos. Importa un Excel primero.');
  let cur = dsById(dsId) || App.p.datasets[0];
  let work = null, pageNo = 0, query = '', dirty = false;
  const PER = 100;
  const load = ds => {
    work = { id: ds.id, name: ds.name, info: ds.info, columns: ds.columns.map(c => ({ name: c.name, type: c.type, role: c.role, orig: c.name, calc: c.calc })), rows: ds.rows.map(r => r.slice()), calc: deepClone(ds.calc || []) };
    pageNo = 0; query = ''; dirty = false;
  };
  load(cur);

  const tabs = h('div', { class: 'dv-tabs', role: 'tablist' });
  const toolbar = h('div', { class: 'dv-toolbar' });
  const gridWrap = h('div', { class: 'dv-grid-wrap' });
  const body = h('div', { class: 'modal-body' });
  body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.padding = '0'; body.style.gap = '8px';
  body.append(tabs, toolbar, gridWrap);
  const pager = h('div', { class: 'pager grow' });
  const cancel = h('button', { class: 'btn', type: 'button', text: 'Cerrar' });
  const apply = h('button', { class: 'btn primary', type: 'button', text: 'Aplicar cambios', disabled: true });
  const m = openModal({ title: 'Datos', cls: 'wide', labelledIcon: 'database', body, foot: h('div', { class: 'modal-foot' }, pager, cancel, apply) });
  const markDirty = () => { dirty = true; apply.disabled = false; };

  const confirmDiscard = async () => !dirty || confirmDialog('Cambios sin aplicar', 'Hay cambios sin aplicar en este origen. ¿Descartarlos?', 'Descartar', true);
  cancel.addEventListener('click', async () => { if (await confirmDiscard()) m.close(); });
  apply.addEventListener('click', () => { applyWork(); });

  function drawTabs() {
    clear(tabs);
    for (const d of App.p.datasets) {
      const t = h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': d.id === work.id ? 'true' : 'false', text: d.name });
      t.addEventListener('click', async () => { if (d.id === work.id || !await confirmDiscard()) return; cur = d; load(d); drawAll(); });
      tabs.appendChild(t);
    }
  }
  function drawToolbar() {
    clear(toolbar);
    const name = inputEl(work.name, v => { work.name = v.slice(0, 80); markDirty(); }, { label: 'Nombre del origen', max: 80 });
    name.style.width = '220px';
    const search = inputEl(query, v => { query = v; pageNo = 0; drawGrid(); }, { type: 'search', placeholder: 'Buscar en los datos…', label: 'Buscar' });
    search.style.width = '220px';
    const btn = (ic, label, fn, cls = '') => { const b = h('button', { class: 'btn ' + cls, type: 'button' }, icon(ic, 15), label); b.addEventListener('click', fn); return b; };
    toolbar.append(name,
      btn('plus', 'Fila', () => { const r = work.columns.map(() => null); work.rows.push(r); applyCalcColumns(work, [r]); pageNo = Math.floor((work.rows.length - 1) / PER); markDirty(); drawGrid(); }),
      btn('plus', 'Columna', () => {
        let n = 'Nueva columna', k = 1;
        while (work.columns.some(c => c.name === n)) n = `Nueva columna ${++k}`;
        work.columns.push({ name: n, type: 'text', role: null, orig: null });
        work.rows.forEach(r => r.push(null));
        markDirty(); drawGrid();
      }),
      btn('branch', 'Columna condicional', () => editCalc(null)),
      btn('swap', 'Transponer', transpose),
      btn('download', 'CSV', () => downloadFile(`${work.name}.csv`, 'text/csv;charset=utf-8', toCsv(work.columns.map(c => c.name), work.rows))),
      btn('trash', 'Eliminar origen', deleteDs, 'danger'),
      h('span', { class: 'grow' }), search);
  }
  function visibleRows() {
    const q = query.trim().toLowerCase();
    const idx = [];
    for (let i = 0; i < work.rows.length; i++) {
      if (!q || work.rows[i].some(v => v != null && String(v).toLowerCase().includes(q))) idx.push(i);
    }
    return idx;
  }
  function drawGrid() {
    clear(gridWrap);
    const idx = visibleRows();
    const pages = Math.max(1, Math.ceil(idx.length / PER));
    pageNo = clamp(pageNo, 0, pages - 1);
    const table = h('table', { class: 'dv' });
    const hr = h('tr', null, h('th', { class: 'rownum', text: '#' }));
    work.columns.forEach((c, j) => {
      const nm = inputEl(c.name, v => {
        const t = v.replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!t) return;
        if (work.columns.some((o, k) => k !== j && o.name === t)) { nm.classList.add('invalid'); return; }
        nm.classList.remove('invalid');
        renameCalcRefs(work.calc, c.name, t);
        const def = c.calc && work.calc.find(d => d.id === c.calc);
        if (def) def.name = t;
        c.name = t; markDirty();
      }, { label: 'Nombre de columna', max: 80, change: true });
      let tp;
      if (c.calc) {
        // Columna condicional: su tipo y sus valores los deciden las reglas
        tp = h('button', { class: 'btn dv-calc', type: 'button', title: 'Editar las reglas de esta columna condicional' }, icon('branch', 13), 'Reglas');
        tp.addEventListener('click', () => editCalc(c.calc));
      } else {
        tp = selectEl([['text', 'Texto'], ['number', 'Número'], ['date', 'Fecha']], c.type, v => {
          c.type = v; c.role = null;
          for (const r of work.rows) r[j] = convertValue(r[j], v);
          applyCalcColumns(work);
          markDirty(); drawGrid();
        }, { label: 'Tipo de columna' });
      }
      const del = h('button', { class: 'dv-del', type: 'button', title: 'Eliminar columna', 'aria-label': 'Eliminar columna ' + c.name }, icon('trash', 13));
      del.addEventListener('click', () => {
        if (work.columns.length <= 1) return toast('El origen debe tener al menos una columna');
        const users = calcUsersOf(work.calc, c.name, c.calc);
        if (users.length) return toast(`No se puede eliminar «${c.name}»: la usa la columna condicional «${users.join('», «')}». Edita o elimina antes sus reglas.`, 'error', 6000);
        if (c.calc) work.calc = work.calc.filter(d => d.id !== c.calc);
        work.columns.splice(j, 1);
        work.rows.forEach(r => r.splice(j, 1));
        markDirty(); drawGrid();
      });
      hr.appendChild(h('th', null, h('div', { class: 'colhead' }, nm, h('div', { class: 'form-inline' }, tp, del))));
    });
    table.appendChild(h('thead', null, hr));
    const tb = h('tbody');
    for (const i of idx.slice(pageNo * PER, pageNo * PER + PER)) {
      const r = work.rows[i];
      const del = h('button', { class: 'dv-del', type: 'button', title: 'Eliminar fila', 'aria-label': 'Eliminar fila ' + (i + 1) }, icon('close', 12));
      del.addEventListener('click', () => { work.rows.splice(i, 1); markDirty(); drawGrid(); });
      const tr = h('tr', null, h('td', { class: 'rownum' }, h('span', { text: String(i + 1) }), del));
      const calcCells = [];
      work.columns.forEach((c, j) => {
        const inp = h('input', { class: 'cell' + (c.type === 'number' ? ' num' : '') + (c.calc ? ' calc' : ''), 'aria-label': `${c.name}, fila ${i + 1}` + (c.calc ? ' (calculada)' : ''), readonly: c.calc ? true : null });
        inp.value = cellDisplay(r[j], c.type);
        if (c.calc) { calcCells.push([inp, j, c.type]); tr.appendChild(h('td', null, inp)); return; }
        inp.addEventListener('change', () => {
          const raw = inp.value.trim();
          const v = raw === '' ? null : convertValue(raw, c.type);
          inp.classList.toggle('invalid', raw !== '' && v == null);
          r[j] = v;
          // Recalcula las columnas condicionales de esta fila sin redibujar la tabla
          if (calcCells.length) { applyCalcColumns(work, [r]); for (const [ci, cj, ct] of calcCells) ci.value = cellDisplay(r[cj], ct); }
          markDirty();
        });
        tr.appendChild(h('td', null, inp));
      });
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    gridWrap.appendChild(table);
    clear(pager);
    const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Página anterior', disabled: pageNo === 0 }, icon('chevL', 15));
    const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Página siguiente', disabled: pageNo >= pages - 1 }, icon('chevR', 15));
    prev.addEventListener('click', () => { pageNo--; drawGrid(); });
    next.addEventListener('click', () => { pageNo++; drawGrid(); });
    pager.append(prev, h('span', { text: `Página ${pageNo + 1} de ${pages} · ${fmtNum(idx.length)} filas${query ? ' (filtradas)' : ''}` }), next,
      h('span', { class: 'hint', text: ' · Los cambios en los datos no se pueden deshacer con Ctrl+Z.' }));
  }
  function drawAll() { drawTabs(); drawToolbar(); drawGrid(); apply.disabled = !dirty; }

  function applyWork() {
    const names = new Set();
    for (const c of work.columns) {
      if (!c.name || names.has(c.name)) return toast('Los nombres de columna deben ser únicos y no estar vacíos', 'error');
      names.add(c.name);
    }
    const ds = dsById(work.id);
    if (!ds) return;
    const rename = new Map();
    const typeChanged = new Set();
    for (const c of work.columns) {
      if (c.orig && c.orig !== c.name) rename.set(c.orig, c.name);
      const old = c.orig ? ds.columns.find(o => o.name === c.orig) : null;
      if (old && old.type !== c.type) typeChanged.add(c.name);
    }
    const map = n => (n != null && rename.has(n) ? rename.get(n) : n);
    const snap = snapshot();
    ds.name = work.name || ds.name;
    ds.columns = work.columns.map(c => ({ name: c.name, type: c.type, role: c.role, ...(c.calc ? { calc: c.calc } : null) }));
    ds.rows = work.rows;
    ds.calc = work.calc;
    markColumnRoles(ds.columns, ds.rows);
    delete ds._grainCache; delete ds._colorCache;
    for (const pg of App.p.pages) for (const w of pg.widgets) {
      if (w.ds !== ds.id) continue;
      w.cat = map(w.cat); w.split = map(w.split); w.vals = w.vals.map(map);
    }
    App.p.filters = App.p.filters.map(f => (f.ds === ds.id ? Object.assign({}, f, { field: map(f.field) }) : f)).filter(f => !(f.ds === ds.id && typeChanged.has(f.field)));
    pushHistory(snap);
    afterChange({});
    load(ds);
    drawAll();
    toast('Datos actualizados', 'ok');
  }
  /** Crea (id null) o edita una columna condicional sobre la copia de trabajo. */
  function editCalc(id) {
    openCalcBuilder(work, id, def => {
      const k = work.calc.findIndex(d => d.id === def.id);
      if (k < 0) {
        if (work.columns.length >= LIMITS.cols) return toast(`Se ha alcanzado el máximo de ${LIMITS.cols} columnas`, 'error');
        if (work.calc.length >= CALC_MAX.defs) return toast(`Máximo ${CALC_MAX.defs} columnas condicionales por origen`, 'error');
        work.calc.push(def);
        work.columns.push({ name: def.name, type: def.type, role: null, orig: null, calc: def.id });
        work.rows.forEach(r => r.push(null));
      } else {
        const col = work.columns.find(c => c.calc === def.id);
        if (col && col.name !== def.name) renameCalcRefs(work.calc, col.name, def.name);
        work.calc[k] = def;
      }
      applyCalcColumns(work);
      markDirty(); drawGrid();
      toast(k < 0 ? `Columna «${def.name}» creada. Pulsa «Aplicar cambios» para usarla en los visuales.` : 'Reglas actualizadas', 'ok', 5000);
    });
  }
  function transpose() {
    const ds = dsById(work.id);
    if (!ds) return;
    if (dirty) return toast('Aplica o descarta los cambios antes de transponer', 'error');
    if (ds.rows.length > LIMITS.cols - 1) toast(`Solo se transponen las primeras ${LIMITS.cols - 1} filas`, 'info');
    const tr = transposeDataset(ds);
    App.p.datasets.push(tr);
    scheduleSave();
    renderLeft(); renderRight(); renderToolbar(); renderStatus();
    cur = tr; load(tr); drawAll();
    toast(`Nuevo origen creado: «${tr.name}». Úsalo con «Generar automático» o en cualquier visual.`, 'ok', 6000);
  }
  async function deleteDs() {
    const ds = dsById(work.id);
    if (!ds) return;
    const used = App.p.pages.reduce((a, pg) => a + pg.widgets.filter(w => w.ds === ds.id).length, 0);
    if (!await confirmDialog('Eliminar origen de datos', `¿Eliminar «${ds.name}»?` + (used ? ` ${used} visual(es) se quedarán sin datos.` : '') + ' Esta acción no se puede deshacer.', 'Eliminar', true)) return;
    App.p.datasets = App.p.datasets.filter(d => d !== ds);
    App.p.filters = App.p.filters.filter(f => f.ds !== ds.id);
    afterChange({});
    if (!App.p.datasets.length) return m.close();
    cur = App.p.datasets[0]; load(cur); drawAll();
  }
  drawAll();
  return m;
}
