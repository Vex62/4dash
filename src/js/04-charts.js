/* ==========================================================================
   Motor de visualizaciones (SVG / HTML). Sin dependencias.
   Reglas: colores categóricos en orden fijo, marcas finas, extremos
   redondeados de 4px, separación de 2px, rejilla discreta, leyenda con >= 2
   series, tooltip en todos los gráficos, textos siempre vía textContent.
   ========================================================================== */

const slotCls = (prefix, slot) => `${prefix}-${slot === 'o' || slot == null ? 'so' : 's' + ((+slot % 8) + 1)}`;

/* ---------- Tooltip global ---------- */
const Tip = {
  el: null,
  show(evt, title, rows) {
    const el = this.el || (this.el = $('#tooltip'));
    clear(el);
    if (title) el.appendChild(h('div', { class: 'tt-title', text: title }));
    for (const r of rows) {
      el.appendChild(h('div', { class: 'tt-row' },
        r.slot !== undefined ? h('span', { class: 'tt-key ' + slotCls('bg', r.slot) }) : null,
        h('span', { class: 'tt-val', text: r.value }),
        r.name ? h('span', { class: 'tt-name', text: r.name }) : null));
    }
    el.classList.remove('hidden');
    this.move(evt);
  },
  move(evt) {
    const el = this.el;
    if (!el || el.classList.contains('hidden')) return;
    const pad = 14, r = el.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > innerWidth - 4) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 4) y = evt.clientY - r.height - pad;
    el.style.left = Math.max(4, x) + 'px';
    el.style.top = Math.max(4, y) + 'px';
  },
  hide() { if (this.el) this.el.classList.add('hidden'); }
};

/* ---------- Escalas y utilidades ---------- */
function niceTicks(lo, hi, count) {
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  if (lo === hi) { if (lo === 0) hi = 1; else if (lo > 0) lo = 0; else hi = 0; }
  const span = hi - lo;
  const step0 = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = a, n = 0; v <= b + step * 1e-6 && n < 50; v += step, n++) ticks.push(+v.toPrecision(12));
  if (ticks.length < 2) ticks.push(a + step);
  return ticks;
}
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}
/** Barra con extremo de datos redondeado (4px) y base recta. */
function barPath(x, y, w, h, dir) {
  if (w <= 0 || h <= 0) return '';
  const r = dir === 'right' || dir === 'left' ? Math.min(4, h / 2, w) : Math.min(4, w / 2, h);
  switch (dir) {
    case 'up': return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    case 'down': return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    case 'right': return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    default: return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }
}
function arcPath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  if (r0 <= 0) return `M${cx},${cy}L${p(r1, a0)}A${r1},${r1} 0 ${large} 1 ${p(r1, a1)}Z`;
  return `M${p(r1, a0)}A${r1},${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}
function emptyMsg(body, iconName, msg, sub) {
  body.appendChild(h('div', { class: 'w-empty' }, icon(iconName, 30), h('div', { text: msg }), sub ? h('div', { text: sub }) : null));
}
function legendItems(items, kind, onClick) {
  const lg = h('div', { class: 'legend', role: 'list' });
  for (const it of items) {
    const el = h('div', { class: 'lg-item' + (onClick && it.key != null ? ' clickable' : '') + (it.dim ? ' dim' : ''), role: 'listitem', title: it.name },
      h('span', { class: 'lg-key ' + (kind === 'line' ? 'line ' : '') + slotCls('bg', it.slot) }),
      h('span', { class: 'lg-name', text: it.name }),
      it.value != null ? h('span', { class: 'lg-val', text: it.value }) : null);
    if (onClick && it.key != null) el.addEventListener('click', e => { e.stopPropagation(); onClick(it, e); });
    lg.appendChild(el);
  }
  return lg;
}
function legendHeight(items, W) {
  let lines = 1, x = 0;
  for (const it of items) {
    const iw = 16 + Math.min(160, textWidth(it.name, 11.5)) + 14;
    if (x + iw > W && x > 0) { lines++; x = 0; }
    x += iw;
  }
  return Math.min(2, lines) * 18 + 6;
}
const additive = e => !!(e && (e.ctrlKey || e.metaKey || e.shiftKey));

/* ---------- Gráficos cartesianos ---------- */
function renderCartesian(w, body, ctx, data) {
  const kind = w.type;
  const horiz = kind === 'bar';
  const { cats, series } = data;
  const n = cats.length;
  const multi = series.length > 1;
  const W = ctx.W;
  let H = ctx.H;
  const fmtV = v => fmtNum(v, w.fmt, w.dec, w.currency);
  const fmtT = v => fmtAxis(v, w.fmt, w.currency);
  let lgItems = null;
  if (multi && w.showLegend) {
    lgItems = series.map(sr => ({ name: sr.name, slot: sr.slot, key: w.split ? sr.key : null }));
    H -= legendHeight(lgItems, W);
  }
  const svg = s('svg', { class: 'chart', width: W, height: Math.max(40, H), viewBox: `0 0 ${W} ${Math.max(40, H)}`, role: 'img', 'aria-label': ctx.title });
  body.appendChild(svg);
  if (lgItems) {
    body.appendChild(legendItems(lgItems, kind === 'line' ? 'line' : 'rect', w.split ? (it, e) => {
      const sr = series.find(x => x.key === it.key);
      if (sr && sr.key !== OTHER) ctx.onPick(w.split, [String(sr.key)], effectiveGrain(ctx.ds, w, w.split), additive(e));
    } : null));
  }
  if (H < 40) return;

  // Extensión de valores
  let lo = 0, hi = 0, hasNeg = false;
  if (kind === 'stacked') {
    for (let i = 0; i < n; i++) {
      let p = 0, q = 0;
      for (const sr of series) { const v = sr.values[i] || 0; if (v >= 0) p += v; else q += v; }
      hi = Math.max(hi, p); lo = Math.min(lo, q);
    }
  } else {
    let mn = Infinity, mx = -Infinity;
    for (const sr of series) for (const v of sr.values) if (v != null) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    if (!isFinite(mn)) { mn = 0; mx = 1; }
    if (kind === 'line' && mn > 0 && mn > mx * 0.6) { lo = mn; hi = mx; }
    else { lo = Math.min(0, mn); hi = Math.max(0, mx); }
  }
  hasNeg = lo < 0;
  const ticks = niceTicks(lo, hi, horiz ? Math.max(2, Math.floor(W / 110)) : Math.max(2, Math.floor(H / 56)));
  const tlo = ticks[0], thi = ticks[ticks.length - 1];
  const showLabels = w.labels && (kind === 'stacked' || !multi || kind === 'line' || kind === 'area');
  const labelOfCat = c => c.label;
  const dimmed = i => data.highlight && !data.highlight.has(cats[i].key) && !(cats[i].rest && cats[i].rest.some(k => data.highlight.has(k)));
  const pickCat = (i, e) => {
    const c = cats[i];
    if (!c || !w.cat) return;
    ctx.onPick(w.cat, c.rest ? c.rest : [c.key], data.grain, additive(e));
  };
  const tipFor = (i, e) => {
    const rows = series.map(sr => ({ name: multi ? sr.name : (series[0].name), value: fmtV(sr.values[i]), slot: sr.slot }));
    if (kind === 'stacked' && multi) rows.push({ name: 'Total', value: fmtV(series.reduce((a, sr) => a + (sr.values[i] || 0), 0)) });
    Tip.show(e, labelOfCat(cats[i]), rows);
  };

  if (horiz) {
    const maxLab = Math.min(W * 0.36, Math.max(...cats.map(c => textWidth(c.label, 11))) + 4);
    const valLabW = showLabels ? Math.max(...series[0].values.map(v => textWidth(fmtV(v), 11, 600))) + 8 : 0;
    const x0 = Math.ceil(maxLab) + 8, x1 = W - Math.max(12, valLabW), y0 = 4, y1 = H - 20;
    const sx = v => x0 + (v - tlo) / (thi - tlo) * (x1 - x0);
    const band = (y1 - y0) / Math.max(1, n);
    const gAxis = s('g', null, svg);
    if (w.gridlines) for (const t of ticks) s('line', { class: 'grid-line', x1: Math.round(sx(t)) + .5, x2: Math.round(sx(t)) + .5, y1: y0, y2: y1 }, gAxis);
    for (const t of ticks) s('text', { class: 'ax-label', x: sx(t), y: H - 5, 'text-anchor': 'middle' }, gAxis).textContent = fmtT(t);
    s('line', { class: 'base-line', x1: Math.round(sx(Math.max(tlo, Math.min(0, thi)))) + .5, x2: Math.round(sx(Math.max(tlo, Math.min(0, thi)))) + .5, y1: y0, y2: y1 }, gAxis);
    const gHit = s('g', null, svg), gMarks = s('g', null, svg);
    const gN = series.length;
    const barH = Math.max(2, Math.min(24, (band * 0.72 - (gN - 1) * 2) / gN));
    const groupH = gN * barH + (gN - 1) * 2;
    const step = Math.max(1, Math.ceil(13 / band));
    for (let i = 0; i < n; i++) {
      const cy = y0 + band * i + band / 2;
      if (i % step === 0) s('text', { class: 'ax-label', x: x0 - 6, y: cy + 4, 'text-anchor': 'end' }, gAxis).textContent = truncateText(cats[i].label, x0 - 10);
      const hit = s('rect', { class: 'hit', x: 0, y: y0 + band * i, width: W, height: band }, gHit);
      hit.addEventListener('pointermove', e => tipFor(i, e));
      hit.addEventListener('pointerleave', () => Tip.hide());
      hit.addEventListener('click', e => { if (ctx.interactive()) pickCat(i, e); });
      series.forEach((sr, k) => {
        const v = sr.values[i];
        if (v == null) return;
        const by = cy - groupH / 2 + k * (barH + 2);
        const a = sx(0 < tlo ? tlo : 0), b = sx(v);
        const d = barPath(Math.min(a, b), by, Math.abs(b - a), barH, v >= 0 ? 'right' : 'left');
        if (d) s('path', { d, class: 'mark ' + slotCls('f', sr.slot) + (dimmed(i) ? ' dim' : ''), 'pointer-events': 'none' }, gMarks);
        if (showLabels && !multi) {
          const t = s('text', { class: 'val-label', x: v >= 0 ? b + 5 : b - 5, y: by + barH / 2 + 4, 'text-anchor': v >= 0 ? 'start' : 'end', 'pointer-events': 'none' }, gMarks);
          t.textContent = fmtV(v);
        }
      });
    }
    return;
  }

  // Vertical (columnas, apiladas, líneas, áreas)
  const tickW = Math.max(...ticks.map(t => textWidth(fmtT(t), 11)));
  let endLabW = 0;
  if ((kind === 'line' || kind === 'area') && showLabels && series.length <= 4) {
    endLabW = Math.max(...series.map(sr => { const v = lastVal(sr.values); return v == null ? 0 : textWidth(fmtV(v), 11, 600); })) + 10;
  }
  const x0 = Math.ceil(tickW) + 10, x1 = W - Math.max(8, endLabW);
  const y0 = showLabels && (kind === 'column' || kind === 'stacked') ? 16 : 8, y1 = H - 22;
  const sy = v => y1 - (v - tlo) / (thi - tlo) * (y1 - y0);
  const band = (x1 - x0) / Math.max(1, n);
  const gAxis = s('g', null, svg);
  for (const t of ticks) {
    const yy = Math.round(sy(t)) + .5;
    if (w.gridlines && t !== 0) s('line', { class: 'grid-line', x1: x0, x2: x1, y1: yy, y2: yy }, gAxis);
    s('text', { class: 'ax-label', x: x0 - 6, y: sy(t) + 4, 'text-anchor': 'end' }, gAxis).textContent = fmtT(t);
  }
  const baseY = Math.round(sy(Math.max(tlo, Math.min(0, thi)))) + .5;
  s('line', { class: 'base-line', x1: x0, x2: x1, y1: baseY, y2: baseY }, gAxis);
  // Etiquetas de categoría
  const widest = Math.min(110, Math.max(...cats.map(c => textWidth(c.label, 11))));
  const step = Math.max(1, Math.ceil((widest + 10) / band));
  for (let i = 0; i < n; i += step) {
    const cx = x0 + band * (i + 0.5);
    s('text', { class: 'ax-label', x: cx, y: H - 6, 'text-anchor': 'middle' }, gAxis).textContent = truncateText(cats[i].label, band * step - 6);
  }

  if (kind === 'column' || kind === 'stacked') {
    const gHit = s('g', null, svg), gMarks = s('g', null, svg);
    const gN = kind === 'stacked' ? 1 : series.length;
    const barW = Math.max(2, Math.min(24, (band * 0.72 - (gN - 1) * 2) / gN));
    const groupW = gN * barW + (gN - 1) * 2;
    for (let i = 0; i < n; i++) {
      const cx = x0 + band * (i + 0.5);
      const hit = s('rect', { class: 'hit', x: x0 + band * i, y: y0, width: band, height: y1 - y0 }, gHit);
      hit.addEventListener('pointermove', e => tipFor(i, e));
      hit.addEventListener('pointerleave', () => Tip.hide());
      hit.addEventListener('click', e => { if (ctx.interactive()) pickCat(i, e); });
      const dim = dimmed(i) ? ' dim' : '';
      if (kind === 'stacked') {
        let pos = 0, neg = 0;
        const segs = [];
        series.forEach(sr => { const v = sr.values[i]; if (v) segs.push({ v, sr }); });
        const lastPos = segs.map(x => x.v > 0).lastIndexOf(true);
        const lastNeg = segs.map(x => x.v < 0).lastIndexOf(true);
        segs.forEach((sg, k) => {
          const from = sg.v >= 0 ? pos : neg;
          const to = from + sg.v;
          if (sg.v >= 0) pos = to; else neg = to;
          const ya = sy(from), yb = sy(to);
          let top = Math.min(ya, yb), hgt = Math.abs(yb - ya);
          const isEnd = sg.v >= 0 ? k === lastPos : k === lastNeg;
          // separación de 2px entre segmentos
          if (from !== 0 && hgt > 2) { if (sg.v >= 0) hgt -= 2; else { top += 2; hgt -= 2; } }
          const d = isEnd ? barPath(cx - barW / 2, top, barW, hgt, sg.v >= 0 ? 'up' : 'down')
            : `M${cx - barW / 2},${top}h${barW}v${hgt}h${-barW}Z`;
          if (d && hgt > 0) s('path', { d, class: 'mark ' + slotCls('f', sg.sr.slot) + dim, 'pointer-events': 'none' }, gMarks);
        });
        if (showLabels && pos > 0) {
          const t = s('text', { class: 'val-label strong', x: cx, y: sy(pos) - 5, 'text-anchor': 'middle', 'pointer-events': 'none' }, gMarks);
          t.textContent = textWidth(fmtV(pos), 11, 600) < band * 1.6 ? fmtV(pos) : '';
        }
      } else {
        series.forEach((sr, k) => {
          const v = sr.values[i];
          if (v == null) return;
          const bx = cx - groupW / 2 + k * (barW + 2);
          const zero = sy(Math.max(tlo, Math.min(0, thi))), yv = sy(v);
          const d = barPath(bx, Math.min(zero, yv), barW, Math.abs(zero - yv), v >= 0 ? 'up' : 'down');
          if (d) s('path', { d, class: 'mark ' + slotCls('f', sr.slot) + dim, 'pointer-events': 'none' }, gMarks);
          if (showLabels && !multi) {
            const lbl = fmtV(v);
            if (textWidth(lbl, 11, 600) <= band - 2) {
              s('text', { class: 'val-label', x: cx, y: v >= 0 ? yv - 5 : yv + 13, 'text-anchor': 'middle', 'pointer-events': 'none' }, gMarks).textContent = lbl;
            }
          }
        });
      }
    }
    return;
  }

  // Líneas / áreas
  const gMarks = s('g', null, svg);
  const px = i => x0 + band * (i + 0.5);
  const zeroY = sy(Math.max(tlo, Math.min(0, thi)));
  const endLabels = [];
  series.forEach(sr => {
    let d = '', ad = '', run = [];
    const flush = () => {
      if (!run.length) return;
      d += run.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
      if (kind === 'area') ad += `M${run[0][0].toFixed(1)},${zeroY}` + run.map(p => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('') + `L${run[run.length - 1][0].toFixed(1)},${zeroY}Z`;
      run = [];
    };
    sr.values.forEach((v, i) => { if (v == null) flush(); else run.push([px(i), sy(v)]); });
    flush();
    if (kind === 'area' && ad) s('path', { d: ad, class: 'area ' + slotCls('f', sr.slot), 'pointer-events': 'none' }, gMarks);
    if (d) s('path', { d, class: 'line ' + slotCls('st', sr.slot), 'pointer-events': 'none' }, gMarks);
    if (n === 1 || n <= 2) sr.values.forEach((v, i) => { if (v != null) s('circle', { cx: px(i), cy: sy(v), r: 4, class: 'dot ' + slotCls('f', sr.slot) }, gMarks); });
    const li = lastIdx(sr.values);
    if (li >= 0) {
      s('circle', { cx: px(li), cy: sy(sr.values[li]), r: 4, class: 'dot ' + slotCls('f', sr.slot), 'pointer-events': 'none' }, gMarks);
      if (endLabW) endLabels.push({ y: sy(sr.values[li]) + 4, x: px(li) + 8, text: fmtV(sr.values[li]) });
    }
  });
  // Evitar solapes de etiquetas finales
  endLabels.sort((a, b) => a.y - b.y);
  for (let k = 1; k < endLabels.length; k++) if (endLabels[k].y - endLabels[k - 1].y < 13) endLabels[k].y = endLabels[k - 1].y + 13;
  for (const l of endLabels) s('text', { class: 'val-label strong', x: l.x, y: l.y, 'pointer-events': 'none' }, gMarks).textContent = l.text;
  // Marcas de selección (filtro cruzado)
  if (data.highlight) cats.forEach((c, i) => { if (data.highlight.has(c.key)) s('line', { class: 'crosshair', x1: px(i), x2: px(i), y1: y0, y2: y1, 'stroke-dasharray': '0' }, gMarks); });
  // Capa de cruceta
  const cross = s('g', { class: 'hidden', 'pointer-events': 'none' }, svg);
  const cl = s('line', { class: 'crosshair', y1: y0, y2: y1 }, cross);
  const dots = series.map(sr => s('circle', { r: 4, class: 'dot ' + slotCls('f', sr.slot) }, cross));
  const overlay = s('rect', { class: 'hit', x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }, svg);
  const idxAt = e => {
    const pt = svg.getBoundingClientRect();
    const scale = pt.width / W || 1;
    const x = (e.clientX - pt.left) / scale;
    return clamp(Math.floor((x - x0) / band), 0, n - 1);
  };
  overlay.addEventListener('pointermove', e => {
    const i = idxAt(e);
    cross.classList.remove('hidden');
    cl.setAttribute('x1', px(i)); cl.setAttribute('x2', px(i));
    series.forEach((sr, k) => {
      const v = sr.values[i];
      dots[k].setAttribute('cx', px(i));
      dots[k].setAttribute('cy', v == null ? -100 : sy(v));
    });
    tipFor(i, e);
  });
  overlay.addEventListener('pointerleave', () => { cross.classList.add('hidden'); Tip.hide(); });
  overlay.addEventListener('click', e => { if (ctx.interactive()) pickCat(idxAt(e), e); });
}
function lastIdx(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; }
function lastVal(arr) { const i = lastIdx(arr); return i < 0 ? null : arr[i]; }

/* ---------- Circular / anillo ---------- */
function renderPie(w, body, ctx, data, donut) {
  const { cats } = data;
  const sr = data.series[0];
  const vals = sr.values.map(v => Math.max(0, v || 0));
  const total = vals.reduce((a, b) => a + b, 0);
  if (!total) return emptyMsg(body, 'pie', 'Sin valores positivos que mostrar');
  const fmtV = v => fmtNum(v, w.fmt, w.dec, w.currency);
  const pct = v => nf({ style: 'percent', maximumFractionDigits: 1 }).format(v / total);
  const W = ctx.W, H = ctx.H;
  const side = w.showLegend && W >= H * 1.25 + 120;
  const row = h('div', { class: 'chart-row' });
  if (!side) row.style.flexDirection = 'column';
  body.appendChild(row);
  const items = cats.map((c, i) => ({ name: c.label, slot: data.catSlots.get(c.key), value: pct(vals[i]), key: c.key, dim: data.highlight && !data.highlight.has(c.key) }));
  let cw = W, ch = H;
  if (w.showLegend) { if (side) cw = Math.max(120, Math.min(H + 20, W * 0.55)); else ch = H - legendHeight(items, W); }
  const svg = s('svg', { class: 'chart', width: cw, height: Math.max(40, ch), viewBox: `0 0 ${cw} ${Math.max(40, ch)}`, role: 'img', 'aria-label': ctx.title });
  row.appendChild(svg);
  if (w.showLegend) {
    const lg = legendItems(items, 'rect', (it, e) => {
      const c = cats.find(x => x.key === it.key);
      if (c && w.cat) ctx.onPick(w.cat, c.rest ? c.rest : [c.key], data.grain, additive(e));
    });
    if (side) lg.classList.add('side');
    row.appendChild(lg);
  }
  const r1 = Math.max(10, Math.min(cw, ch) / 2 - 6), r0 = donut ? r1 * 0.62 : 0;
  const cx = cw / 2, cy = Math.max(40, ch) / 2;
  let a = -Math.PI / 2;
  cats.forEach((c, i) => {
    const v = vals[i];
    if (!v) return;
    let a1 = a + v / total * Math.PI * 2;
    if (v === total) a1 = a + Math.PI * 2 - 0.0001;
    const d = arcPath(cx, cy, r0, r1, a, a1);
    const dim = data.highlight && !data.highlight.has(c.key) && !(c.rest && c.rest.some(k => data.highlight.has(k)));
    const p = s('path', { d, class: 'slice mark hit-slice ' + slotCls('f', data.catSlots.get(c.key)) + (dim ? ' dim' : '') }, svg);
    p.addEventListener('pointermove', e => Tip.show(e, c.label, [{ value: fmtV(sr.values[i]), name: pct(v), slot: data.catSlots.get(c.key) }]));
    p.addEventListener('pointerleave', () => Tip.hide());
    p.addEventListener('click', e => { if (ctx.interactive() && w.cat) ctx.onPick(w.cat, c.rest ? c.rest : [c.key], data.grain, additive(e)); });
    // Etiqueta selectiva: solo porcentajes grandes en el gráfico circular
    if (!donut && w.labels && v / total >= 0.08 && r1 > 60) {
      const am = (a + a1) / 2;
      const t = s('text', { x: cx + r1 * 0.62 * Math.cos(am), y: cy + r1 * 0.62 * Math.sin(am) + 4, 'text-anchor': 'middle', class: 'tm-label' }, svg);
      t.textContent = pct(v);
    }
    a = a1;
  });
  if (donut && r0 > 24) {
    const big = clamp(r0 * 0.36, 12, 26);
    const t1 = s('text', { x: cx, y: cy + big * 0.25, 'text-anchor': 'middle', class: 'center-big', 'font-size': big }, svg);
    t1.textContent = truncateText(fmtNum(total, w.fmt === 'auto' ? 'compact' : w.fmt, w.dec, w.currency), r0 * 1.7, big, 600);
    s('text', { x: cx, y: cy + big * 0.25 + 16, 'text-anchor': 'middle', class: 'center-small' }, svg).textContent = 'Total';
  }
}

/* ---------- Mapa de árbol ---------- */
function squarify(values, x, y, w, h) {
  const total = values.reduce((a, b) => a + b.v, 0);
  const out = [];
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let items = values.map(it => ({ ...it, a: it.v * scale }));
  const worst = (row, side) => {
    const sum = row.reduce((a, b) => a + b.a, 0);
    let mx = -Infinity, mn = Infinity;
    for (const r of row) { mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); }
    return Math.max(side * side * mx / (sum * sum), (sum * sum) / (side * side * mn));
  };
  let row = [];
  const layout = r => {
    const sum = r.reduce((a, b) => a + b.a, 0);
    if (w >= h) {
      const cw = sum / h; let yy = y;
      for (const it of r) { const hh = it.a / cw; out.push({ ...it, x, y: yy, w: cw, h: hh }); yy += hh; }
      x += cw; w -= cw;
    } else {
      const rh = sum / w; let xx = x;
      for (const it of r) { const ww = it.a / rh; out.push({ ...it, x: xx, y, w: ww, h: rh }); xx += ww; }
      y += rh; h -= rh;
    }
  };
  while (items.length) {
    const side = Math.min(w, h);
    const nr = row.concat([items[0]]);
    if (!row.length || worst(nr, side) <= worst(row, side)) { row = nr; items.shift(); }
    else { layout(row); row = []; }
  }
  if (row.length) layout(row);
  return out;
}
function renderTreemap(w, body, ctx, data) {
  const sr = data.series[0];
  const items = data.cats.map((c, i) => ({ c, i, v: Math.max(0, sr.values[i] || 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  if (!items.length) return emptyMsg(body, 'treemap', 'Sin valores positivos que mostrar');
  const total = items.reduce((a, b) => a + b.v, 0);
  const fmtV = v => fmtNum(v, w.fmt, w.dec, w.currency);
  const W = ctx.W, H = ctx.H;
  const svg = s('svg', { class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ctx.title });
  body.appendChild(svg);
  for (const r of squarify(items, 0, 0, W, H)) {
    const slot = data.catSlots.get(r.c.key);
    const dim = data.highlight && !data.highlight.has(r.c.key);
    const rect = s('rect', { x: r.x + 1, y: r.y + 1, width: Math.max(0, r.w - 2), height: Math.max(0, r.h - 2), rx: 3, class: 'tm-cell mark ' + slotCls('f', slot) + (dim ? ' dim' : '') }, svg);
    rect.addEventListener('pointermove', e => Tip.show(e, r.c.label, [{ value: fmtV(sr.values[r.i]), name: nf({ style: 'percent', maximumFractionDigits: 1 }).format(r.v / total), slot }]));
    rect.addEventListener('pointerleave', () => Tip.hide());
    rect.addEventListener('click', e => { if (ctx.interactive() && w.cat) ctx.onPick(w.cat, r.c.rest ? r.c.rest : [r.c.key], data.grain, additive(e)); });
    if (r.w > 44 && r.h > 22) {
      const lab = truncateText(r.c.label, r.w - 14, 11.5, 600);
      if (lab) s('text', { x: r.x + 8, y: r.y + 18, class: 'tm-label' }, svg).textContent = lab;
      if (w.labels && r.h > 38) {
        const vl = truncateText(fmtV(sr.values[r.i]), r.w - 14, 11);
        if (vl) s('text', { x: r.x + 8, y: r.y + 33, class: 'tm-value' }, svg).textContent = vl;
      }
    }
  }
}

/* ---------- Dispersión ---------- */
function renderScatter(w, body, ctx) {
  const ds = ctx.ds;
  const xi = colIdx(ds, w.vals[0]), yi = colIdx(ds, w.vals[1]);
  if (xi < 0 || yi < 0 || ds.columns[xi].type !== 'number' || ds.columns[yi].type !== 'number') {
    return emptyMsg(body, 'scatter', 'Elige dos campos numéricos', 'Eje X y eje Y en el panel Datos');
  }
  const fmtV = v => fmtNum(v, w.fmt, w.dec, w.currency);
  let pts = [];
  const rows = filteredRows(ds, ctx.filters);
  const ci = colIdx(ds, w.cat);
  let seriesItems = null;
  if (ci >= 0) {
    // Un punto por categoría (valores agregados), como en Power BI
    const t = ds.columns[ci].type, g = effectiveGrain(ds, w);
    const groups = new Map();
    for (const r of rows) {
      const k = keyOf(r[ci], t, g);
      let a = groups.get(k);
      if (!a) { a = [makeAcc(), makeAcc()]; groups.set(k, a); }
      accAdd(a[0], r[xi], w.agg === 'count' ? 'sum' : w.agg); accAdd(a[1], r[yi], w.agg === 'count' ? 'sum' : w.agg);
    }
    const agg = w.agg === 'count' ? 'sum' : w.agg;
    for (const [k, a] of groups) {
      const x = accValue(a[0], agg), y = accValue(a[1], agg);
      if (x != null && y != null) pts.push({ x, y, label: labelOf(k, t, g), key: k, slot: w.slot || 0 });
    }
  } else {
    const si = w.split ? colIdx(ds, w.split) : -1;
    let slots = null;
    if (si >= 0) {
      const t = ds.columns[si].type;
      const counts = new Map();
      for (const r of rows) { const k = keyOf(r[si], t); counts.set(k, (counts.get(k) || 0) + 1); }
      const keys = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      // dispersión: máx. 3 colores + "Otros" (todas las parejas deben distinguirse)
      const keep = keys.slice(0, keys.length > 4 ? 3 : 4);
      slots = assignSlots(keep, colorOrder(ds, w.split));
      if (keep.length > 3) slots.set(keep[3], slots.get(keep[3]));
      seriesItems = keep.map(k => ({ name: labelOf(k, t), slot: slots.get(k), key: k }));
      if (keys.length > keep.length) seriesItems.push({ name: OTHER, slot: 'o', key: null });
    }
    for (const r of rows) {
      const x = r[xi], y = r[yi];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      let slot = w.slot || 0, label = null;
      if (slots) { const k = keyOf(r[si], ds.columns[si].type); slot = slots.has(k) ? slots.get(k) : 'o'; label = labelOf(k, ds.columns[si].type); }
      pts.push({ x, y, slot, label });
      if (pts.length >= 5000) break;
    }
  }
  if (!pts.length) return emptyMsg(body, 'scatter', 'Sin puntos que mostrar');
  const W = ctx.W;
  let H = ctx.H;
  if (seriesItems && w.showLegend) H -= legendHeight(seriesItems, W);
  const svg = s('svg', { class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ctx.title });
  body.appendChild(svg);
  if (seriesItems && w.showLegend) body.appendChild(legendItems(seriesItems, 'rect'));
  let xmn = Infinity, xmx = -Infinity, ymn = Infinity, ymx = -Infinity;
  for (const p of pts) { xmn = Math.min(xmn, p.x); xmx = Math.max(xmx, p.x); ymn = Math.min(ymn, p.y); ymx = Math.max(ymx, p.y); }
  const xt = niceTicks(Math.min(0, xmn), xmx, Math.max(2, Math.floor(W / 100)));
  const yt = niceTicks(Math.min(0, ymn), ymx, Math.max(2, Math.floor(H / 56)));
  const fx = v => fmtAxis(v, w.fmt, w.currency);
  const x0 = Math.ceil(Math.max(...yt.map(t => textWidth(fx(t))))) + 10, x1 = W - 12, y0 = 8, y1 = H - 34;
  const sx = v => x0 + (v - xt[0]) / (xt[xt.length - 1] - xt[0]) * (x1 - x0);
  const sy = v => y1 - (v - yt[0]) / (yt[yt.length - 1] - yt[0]) * (y1 - y0);
  for (const t of yt) {
    if (w.gridlines) s('line', { class: 'grid-line', x1: x0, x2: x1, y1: Math.round(sy(t)) + .5, y2: Math.round(sy(t)) + .5 }, svg);
    s('text', { class: 'ax-label', x: x0 - 6, y: sy(t) + 4, 'text-anchor': 'end' }, svg).textContent = fx(t);
  }
  for (const t of xt) {
    if (w.gridlines) s('line', { class: 'grid-line', y1: y0, y2: y1, x1: Math.round(sx(t)) + .5, x2: Math.round(sx(t)) + .5 }, svg);
    s('text', { class: 'ax-label', x: sx(t), y: y1 + 16, 'text-anchor': 'middle' }, svg).textContent = fx(t);
  }
  s('line', { class: 'base-line', x1: x0, x2: x1, y1: y1 + .5, y2: y1 + .5 }, svg);
  s('text', { class: 'ax-label', x: (x0 + x1) / 2, y: H - 2, 'text-anchor': 'middle' }, svg).textContent = truncateText(w.vals[0], x1 - x0);
  const g = s('g', null, svg);
  for (const p of pts) {
    p.sx = sx(p.x); p.sy = sy(p.y);
    const dim = ctx.highlight && p.key != null && !ctx.highlight.has(p.key);
    s('circle', { cx: p.sx.toFixed(1), cy: p.sy.toFixed(1), r: 4, class: 'dot mark ' + slotCls('f', p.slot) + (dim ? ' dim' : ''), 'fill-opacity': pts.length > 400 ? 0.7 : 1 }, g);
  }
  const ring = s('circle', { r: 7, class: 'hidden', fill: 'none', 'stroke-width': 2, 'pointer-events': 'none' }, svg);
  const overlay = s('rect', { class: 'hit', x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }, svg);
  const nearest = e => {
    const b = svg.getBoundingClientRect(), k = b.width / W || 1;
    const mx = (e.clientX - b.left) / k, my = (e.clientY - b.top) / k;
    let best = null, bd = 30 * 30;
    for (const p of pts) { const d = (p.sx - mx) ** 2 + (p.sy - my) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  };
  overlay.addEventListener('pointermove', e => {
    const p = nearest(e);
    if (!p) { ring.classList.add('hidden'); Tip.hide(); return; }
    ring.setAttribute('cx', p.sx); ring.setAttribute('cy', p.sy);
    ring.setAttribute('class', slotCls('st', p.slot));
    Tip.show(e, p.label, [{ value: fmtV(p.x), name: w.vals[0] }, { value: fmtV(p.y), name: w.vals[1] }]);
  });
  overlay.addEventListener('pointerleave', () => { ring.classList.add('hidden'); Tip.hide(); });
  overlay.addEventListener('click', e => {
    const p = nearest(e);
    if (p && p.key != null && ctx.interactive() && w.cat) ctx.onPick(w.cat, [p.key], effectiveGrain(ds, w), additive(e));
  });
}

/* ---------- KPI ---------- */
function renderKpi(w, body, ctx) {
  const ds = ctx.ds;
  const rows = filteredRows(ds, ctx.filters);
  const m = w.vals[0] || null;
  const value = m ? totalOf(ds, rows, w, m) : rows.length;
  const box = h('div', { class: 'kpi' + (w.align === 'center' ? ' center' : '') });
  body.appendChild(box);
  const txt = fmtNum(value, w.fmt === 'auto' && Math.abs(value) >= 1e6 ? 'compact' : w.fmt, w.dec, w.currency);
  const fs = clamp(Math.min(ctx.H * 0.42, (ctx.W - 8) / Math.max(4, txt.length * 0.58)), 16, 46);
  const v = h('div', { class: 'kpi-value', text: txt, title: fmtNum(value, w.fmt === 'compact' ? 'auto' : w.fmt, w.dec, w.currency) });
  v.style.fontSize = fs + 'px';
  box.appendChild(v);
  const label = m ? measureName(ds, w, m) : 'Recuento de filas';
  if (!w.showTitle || (w.title && w.title !== label)) box.appendChild(h('div', { class: 'kpi-label', text: label }));
  // Comparación: objetivo o periodo anterior
  let delta = null, sub = '';
  let spark = null;
  const ci = colIdx(ds, w.cat);
  if (w.target != null && w.target !== '' && isFinite(+w.target) && +w.target !== 0) {
    delta = (value - +w.target) / Math.abs(+w.target);
    sub = 'vs objetivo ' + fmtNum(+w.target, w.fmt === 'auto' ? 'compact' : w.fmt, w.dec, w.currency);
  }
  if (ci >= 0 && m) {
    const agg = aggregate(ds, Object.assign({}, w, { type: 'line', sort: 'cat-asc', top: 0, split: null }), ctx.filters, { keepOwnField: true });
    const vals = agg.series[0].values;
    if (vals.length >= 2) {
      spark = vals;
      const a = vals[vals.length - 2], b = vals[vals.length - 1];
      if (delta == null && a) { delta = (b - a) / Math.abs(a); sub = 'último periodo (' + agg.cats[vals.length - 1].label + ') vs anterior'; }
    }
  }
  if (delta != null && isFinite(delta)) {
    const up = delta >= 0;
    box.appendChild(h('div', { class: 'kpi-delta ' + (up ? 'up' : 'down') },
      h('span', { text: up ? '▲' : '▼', 'aria-hidden': 'true' }),
      h('span', { text: (up ? '+' : '') + nf({ style: 'percent', maximumFractionDigits: 1 }).format(delta) }),
      h('span', { class: 'sub', text: sub })));
  }
  if (spark && ctx.H >= 100) {
    const SW = ctx.W, SH = 34;
    const svg = s('svg', { class: 'kpi-spark', width: SW, height: SH, viewBox: `0 0 ${SW} ${SH}`, 'aria-hidden': 'true' });
    let mn = Infinity, mx = -Infinity;
    for (const x of spark) if (x != null) { mn = Math.min(mn, x); mx = Math.max(mx, x); }
    if (mx === mn) { mx += 1; mn -= 1; }
    const px = i => 4 + i * (SW - 8) / Math.max(1, spark.length - 1);
    const py = x => SH - 5 - (x - mn) / (mx - mn) * (SH - 10);
    const pts = spark.map((x, i) => (x == null ? null : [px(i), py(x)])).filter(Boolean);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    s('path', { d: d + `L${pts[pts.length - 1][0]},${SH}L${pts[0][0]},${SH}Z`, class: 'area ' + slotCls('f', w.slot) }, svg);
    s('path', { d, class: 'line ' + slotCls('st', w.slot) }, svg);
    const lp = pts[pts.length - 1];
    s('circle', { cx: lp[0], cy: lp[1], r: 3.5, class: 'dot ' + slotCls('f', w.slot) }, svg);
    box.appendChild(svg);
  }
}

/* ---------- Medidor ---------- */
function renderGauge(w, body, ctx) {
  const ds = ctx.ds;
  const rows = filteredRows(ds, ctx.filters);
  const m = w.vals[0] || null;
  const value = (m ? totalOf(ds, rows, w, m) : rows.length) || 0;
  const target = w.target != null && w.target !== '' && isFinite(+w.target) ? +w.target : null;
  const max = w.gaugeMax != null && w.gaugeMax !== '' && +w.gaugeMax > 0 ? +w.gaugeMax : niceCeil(Math.max(value, target || 0) * (target ? 1.15 : 1.5));
  const fmtV = v => fmtNum(v, w.fmt === 'auto' ? 'compact' : w.fmt, w.dec, w.currency);
  const W = ctx.W, H = ctx.H;
  const svg = s('svg', { class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ctx.title });
  body.appendChild(svg);
  const r1 = Math.max(20, Math.min(W / 2 - 16, H - 40)), r0 = r1 * 0.72;
  const cx = W / 2, cy = Math.min(H - 26, r1 + 10 + (H - 36 - r1) / 2);
  s('path', { d: arcPath(cx, cy, r0, r1, Math.PI, 2 * Math.PI - 0.0001), class: 'gauge-track' }, svg);
  const frac = clamp(value / max, 0, 1);
  if (frac > 0) {
    const p = s('path', { d: arcPath(cx, cy, r0, r1, Math.PI, Math.PI + Math.PI * frac - 0.0001), class: 'mark ' + slotCls('f', w.slot) }, svg);
    p.addEventListener('pointermove', e => Tip.show(e, measureName(ds, w, m), [{ value: fmtNum(value, w.fmt, w.dec, w.currency), name: 'Valor' }].concat(target != null ? [{ value: fmtNum(target, w.fmt, w.dec, w.currency), name: 'Objetivo' }] : [])));
    p.addEventListener('pointerleave', () => Tip.hide());
  }
  if (target != null && target <= max) {
    const a = Math.PI + Math.PI * clamp(target / max, 0, 1);
    s('line', { x1: cx + (r0 - 6) * Math.cos(a), y1: cy + (r0 - 6) * Math.sin(a), x2: cx + (r1 + 6) * Math.cos(a), y2: cy + (r1 + 6) * Math.sin(a), class: 'gauge-target' }, svg);
  }
  const big = clamp(r0 * 0.42, 14, 34);
  s('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'center-big', 'font-size': big }, svg).textContent = truncateText(fmtV(value), r0 * 1.8, big, 600);
  if (target != null) s('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'center-small' }, svg).textContent = nf({ style: 'percent', maximumFractionDigits: 0 }).format(value / target) + ' del objetivo';
  s('text', { x: cx - (r0 + r1) / 2, y: cy + 16, 'text-anchor': 'middle', class: 'ax-label' }, svg).textContent = '0';
  s('text', { x: cx + (r0 + r1) / 2, y: cy + 16, 'text-anchor': 'middle', class: 'ax-label' }, svg).textContent = fmtAxis(max, w.fmt, w.currency);
}

/* ---------- Tabla ---------- */
function renderTable(w, body, ctx) {
  const ds = ctx.ds;
  const fmtV = v => fmtNum(v, w.fmt, w.dec, w.currency);
  let head = [], rows = [], numeric = [], totals = null, keys = null;
  const sortCol = w._sortCol, sortDir = w._sortDir || 'desc';
  const ci = colIdx(ds, w.cat);
  if (ci >= 0) {
    const data = aggregate(ds, Object.assign({}, w, { type: 'table', split: null, vals: w.vals.filter(v => { const c = colOf(ds, v); return c && (c.type === 'number' || ['count', 'distinct'].includes(w.agg)); }) }), ctx.filters);
    head = [w.cat].concat(data.series.map(sr => sr.name));
    numeric = head.map((_, j) => j > 0);
    rows = data.cats.map((c, i) => [c.label].concat(data.series.map(sr => sr.values[i])));
    keys = data.cats.map(c => c);
    const fr = filteredRows(ds, ctx.filters, w.cat);
    const measures = w.vals.filter(v => { const c = colOf(ds, v); return c && (c.type === 'number' || ['count', 'distinct'].includes(w.agg)); });
    totals = ['Total'].concat(measures.length ? measures.map(m => totalOf(ds, fr, w, m)) : [fr.length]);
    ctx.highlight = data.highlight;
  } else {
    const cols = (w.vals.length ? w.vals : ds.columns.map(c => c.name)).map(n => colIdx(ds, n)).filter(i => i >= 0);
    head = cols.map(i => ds.columns[i].name);
    numeric = cols.map(i => ds.columns[i].type === 'number');
    const fr = filteredRows(ds, ctx.filters);
    rows = fr.map(r => cols.map(i => (ds.columns[i].type === 'date' && r[i] ? fmtDateKey(r[i]) : r[i])));
    rows._raw = fr.map(r => cols.map(i => r[i]));
    totals = w.totals ? cols.map((i, j) => (j === 0 ? 'Total' : ds.columns[i].type === 'number' && ds.columns[i].role !== 'id' && ds.columns[i].role !== 'year' ? fr.reduce((a, r) => a + (typeof r[i] === 'number' ? r[i] : 0), 0) : '')) : null;
  }
  if (!head.length) return emptyMsg(body, 'table', 'Añade columnas a la tabla');
  // Orden
  let order = rows.map((_, i) => i);
  if (sortCol != null && sortCol < head.length) {
    const src = rows._raw || rows;
    order.sort((a, b) => {
      const x = src[a][sortCol], y = src[b][sortCol];
      if (x == null) return 1; if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), LOCALE, { numeric: true });
      return sortDir === 'asc' ? c : -c;
    });
  }
  const MAX = 500;
  const shown = order.slice(0, MAX);
  const maxAbs = numeric.map((isNum, j) => isNum ? Math.max(0, ...shown.map(i => Math.abs(rows[i][j] || 0))) : 0);
  const wrap = h('div', { class: 'tbl-wrap' });
  const table = h('table', { class: 'tbl' });
  const thead = h('thead'), trh = h('tr');
  head.forEach((name, j) => {
    const th = h('th', { class: numeric[j] ? 'num' : '', scope: 'col', title: 'Ordenar por ' + name, text: name + (sortCol === j ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '') });
    th.addEventListener('click', e => {
      e.stopPropagation();
      if (w._sortCol === j) w._sortDir = w._sortDir === 'asc' ? 'desc' : 'asc'; else { w._sortCol = j; w._sortDir = numeric[j] ? 'desc' : 'asc'; }
      ctx.rerender();
    });
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tb = h('tbody');
  for (const i of shown) {
    const r = rows[i];
    const tr = h('tr');
    if (keys && ctx.highlight && ctx.highlight.has(keys[i].key)) tr.classList.add('sel');
    r.forEach((v, j) => {
      const td = h('td', { class: numeric[j] ? 'num' : '' });
      if (numeric[j] && typeof v === 'number') {
        if (w.dataBars && maxAbs[j] > 0 && (keys || ctx.ds.columns[colIdx(ds, head[j])]?.role == null)) {
          const bar = h('div', { class: 'bar-cell ' + slotCls('bg', w.slot) });
          bar.style.width = `calc(${(Math.abs(v) / maxAbs[j] * 100).toFixed(1)}% - 8px)`;
          td.appendChild(bar);
        }
        td.appendChild(h('span', { class: 'cell-txt', text: fmtV(v) }));
      } else td.textContent = v == null ? '' : String(v);
      if (!numeric[j] && v != null) td.title = String(v);
      tr.appendChild(td);
    });
    if (keys) {
      tr.addEventListener('click', e => {
        if (!ctx.interactive()) return;
        const c = keys[i];
        ctx.onPick(w.cat, c.rest ? c.rest : [c.key], effectiveGrain(ds, w), additive(e));
      });
      tr.style.cursor = 'pointer';
    }
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  if (w.totals && totals) {
    const tf = h('tfoot'), tr = h('tr');
    totals.forEach((v, j) => tr.appendChild(h('td', { class: numeric[j] ? 'num' : '', text: typeof v === 'number' ? fmtV(v) : (v || '') })));
    tf.appendChild(tr);
    table.appendChild(tf);
  }
  wrap.appendChild(table);
  wrap.addEventListener('pointerdown', e => e.stopPropagation(), { passive: true });
  body.appendChild(wrap);
  if (rows.length > MAX) body.appendChild(h('div', { class: 'tbl-note', text: `Mostrando ${fmtNum(MAX)} de ${fmtNum(rows.length)} filas. Exporta los datos para verlas todas.` }));
}

/* ---------- Segmentación (filtro) ---------- */
function renderSlicer(w, body, ctx) {
  const ds = ctx.ds;
  const ci = colIdx(ds, w.cat);
  if (ci < 0) return emptyMsg(body, 'slicer', 'Elige un campo para filtrar');
  const col = ds.columns[ci];
  const grain = effectiveGrain(ds, w);
  const counts = new Map();
  for (const r of filteredRows(ds, ctx.filters, w.cat)) { const k = keyOf(r[ci], col.type, grain); counts.set(k, (counts.get(k) || 0) + 1); }
  const own = ctx.filters.find(f => f.ds === ds.id && f.field === w.cat);
  const sel = new Set(own ? own.values : []);
  for (const k of sel) if (!counts.has(k)) counts.set(k, 0);
  let keys = Array.from(counts.keys());
  if (col.type === 'number') keys.sort((a, b) => Number(a) - Number(b));
  else keys.sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, LOCALE, { numeric: true })));
  const box = h('div', { class: 'slicer' });
  body.appendChild(box);
  const toggle = (k, e) => { if (ctx.interactive()) ctx.onToggle(w.cat, k, grain, !!(e && (e.ctrlKey || e.metaKey)) || w.slicerStyle !== 'single'); };
  let search = null;
  if (keys.length > 8 && w.slicerStyle !== 'tiles') {
    search = h('input', { class: 'slicer-search', type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar valores' });
    box.appendChild(search);
    search.addEventListener('pointerdown', e => e.stopPropagation());
  }
  const list = h('div', { class: w.slicerStyle === 'tiles' ? 'slicer-tiles' : 'slicer-list', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': w.cat });
  box.appendChild(list);
  const draw = () => {
    clear(list);
    const q = search ? search.value.trim().toLowerCase() : '';
    let n = 0;
    for (const k of keys) {
      const label = labelOf(k, col.type, grain);
      if (q && !label.toLowerCase().includes(q)) continue;
      if (++n > 400) break;
      if (w.slicerStyle === 'tiles') {
        const b = h('button', { class: 'slicer-tile', type: 'button', 'aria-pressed': sel.has(k) ? 'true' : 'false', text: label });
        b.addEventListener('click', e => { e.stopPropagation(); toggle(k, e); });
        list.appendChild(b);
      } else {
        const it = h('div', { class: 'slicer-item', role: 'option', 'aria-selected': sel.has(k) ? 'true' : 'false', tabindex: 0 },
          h('input', { type: 'checkbox', checked: sel.has(k), tabindex: -1, 'aria-hidden': 'true' }),
          h('span', { class: 'sname', text: label, title: label }),
          h('span', { class: 'scount', text: fmtNum(counts.get(k)) }));
        it.addEventListener('click', e => { e.stopPropagation(); toggle(k, e); });
        it.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(k, e); } });
        list.appendChild(it);
      }
    }
  };
  draw();
  if (search) search.addEventListener('input', draw);
  list.addEventListener('pointerdown', e => { if (ctx.interactive()) e.stopPropagation(); }, { passive: true });
  const foot = h('div', { class: 'slicer-foot' },
    h('span', { text: sel.size ? `${sel.size} seleccionado(s)` : `${keys.length} valores` }));
  if (sel.size) {
    const b = h('button', { class: 'linklike', type: 'button', text: 'Borrar selección' });
    b.addEventListener('click', e => { e.stopPropagation(); ctx.onClear(w.cat); });
    foot.appendChild(b);
  }
  box.appendChild(foot);
}

/* ---------- Texto e imagen ---------- */
function renderText(w, body) {
  const box = h('div', { class: 'textbox' + (w.align === 'center' ? ' center' : w.align === 'right' ? ' right' : '') + (w.vcenter ? ' vcenter' : '') });
  box.style.fontSize = clamp(+w.fontSize || 14, 8, 72) + 'px';
  const lines = String(w.text || '').split(/\r?\n/);
  let ul = null, para = [];
  const flushP = () => { if (para.length) { box.appendChild(h('p', { text: para.join(' ') })); para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,3}\s+/.test(line)) { flushP(); ul = null; box.appendChild(h('div', { class: 'tb-h', text: line.replace(/^#{1,3}\s+/, '') })); }
    else if (/^\s*[-*•]\s+/.test(line)) { flushP(); if (!ul) { ul = h('ul'); box.appendChild(ul); } ul.appendChild(h('li', { text: line.replace(/^\s*[-*•]\s+/, '') })); }
    else if (!line.trim()) { flushP(); ul = null; }
    else { ul = null; para.push(line); }
  }
  flushP();
  if (!w.text) box.appendChild(h('p', { class: 'hint', text: 'Escribe el texto en el panel Formato.' }));
  body.appendChild(box);
}
function renderImage(w, body) {
  if (!w.img) return emptyMsg(body, 'image', 'Sube una imagen desde el panel Formato');
  const box = h('div', { class: 'imgbox' });
  box.appendChild(h('img', { src: w.img, alt: w.title || 'Imagen', draggable: 'false' }));
  body.appendChild(box);
}

/** Punto de entrada: dibuja el contenido de un widget. */
function renderVisual(w, body, ctx) {
  clear(body);
  const def = VIZ[w.type];
  if (!def) return emptyMsg(body, 'info', 'Tipo de visual desconocido');
  if (w.type === 'text') return renderText(w, body);
  if (w.type === 'image') return renderImage(w, body);
  const ds = ctx.ds;
  if (!ds) return emptyMsg(body, def.icon, 'Sin origen de datos', 'Importa un Excel o elige un origen en el panel Datos');
  try {
    if (w.type === 'kpi') return renderKpi(w, body, ctx);
    if (w.type === 'gauge') return renderGauge(w, body, ctx);
    if (w.type === 'table') return renderTable(w, body, ctx);
    if (w.type === 'slicer') return renderSlicer(w, body, ctx);
    if (w.type === 'scatter') {
      const own = w.cat && ctx.filters.find(f => f.ds === ds.id && f.field === w.cat && f.values.length);
      ctx.highlight = own ? new Set(own.values) : null;
      if (w.cat) ctx = Object.assign({}, ctx, { filters: ctx.filters.filter(f => !(f.ds === ds.id && f.field === w.cat)) });
      return renderScatter(w, body, ctx);
    }
    if (colIdx(ds, w.cat) < 0) return emptyMsg(body, def.icon, 'Arrastra un campo al Eje', 'o elígelo en el panel Datos');
    const data = aggregate(ds, w, ctx.filters);
    if (!data.cats.length) return emptyMsg(body, def.icon, 'No hay datos para los filtros actuales');
    ctx.data = data;
    if (w.type === 'pie' || w.type === 'donut') return renderPie(w, body, ctx, data, w.type === 'donut');
    if (w.type === 'treemap') return renderTreemap(w, body, ctx, data);
    return renderCartesian(w, body, ctx, data);
  } catch (err) {
    console.error(err);
    clear(body);
    emptyMsg(body, 'info', 'No se pudo dibujar este visual', 'Revisa la configuración de datos');
  }
}

/** Datos tabulares que respaldan un widget (para "Ver datos" / exportar CSV). */
function widgetDataTable(w, ds, filters) {
  if (!ds) return { head: [], rows: [] };
  if (['column', 'stacked', 'bar', 'line', 'area', 'pie', 'donut', 'treemap'].includes(w.type) && colIdx(ds, w.cat) >= 0) {
    const d = aggregate(ds, w, filters, { keepOwnField: true });
    return { head: [w.cat].concat(d.series.map(s => s.name)), rows: d.cats.map((c, i) => [c.label].concat(d.series.map(s => s.values[i]))) };
  }
  if (w.type === 'table' && colIdx(ds, w.cat) >= 0) return widgetDataTable(Object.assign({}, w, { type: 'column', split: null }), ds, filters);
  if (w.type === 'kpi' || w.type === 'gauge') {
    const rows = filteredRows(ds, filters);
    const m = w.vals[0];
    return { head: ['Medida', 'Valor'], rows: [[measureName(ds, w, m), m ? totalOf(ds, rows, w, m) : rows.length]] };
  }
  const cols = (w.type === 'table' && w.vals.length ? w.vals : w.type === 'scatter' ? [w.cat, w.split, ...w.vals].filter(Boolean) : w.type === 'slicer' ? [w.cat] : ds.columns.map(c => c.name)).map(n => colIdx(ds, n)).filter(i => i >= 0);
  const rows = filteredRows(ds, filters);
  return { head: cols.map(i => ds.columns[i].name), rows: rows.map(r => cols.map(i => r[i])) };
}
