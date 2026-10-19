/* ==========================================================================
   Paletas de color de la herramienta y del dashboard.
   Cada paleta define el cromo (barra superior, color principal, acento) y
   la serie categórica de 8 colores para claro y oscuro. Las paletas
   incluidas se han validado (contraste, separación para daltonismo y
   visión normal entre colores adyacentes). La personalizada se valida en vivo.
   ========================================================================== */

// Pasos validados de la paleta de referencia (azul, naranja, aqua, amarillo, magenta, verde, violeta, rojo)
const HUES_L = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const HUES_D = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
function seriesFrom(lead, order) {
  return { light: [lead[0], ...order.map(i => HUES_L[i])], dark: [lead[1], ...order.map(i => HUES_D[i])] };
}
const PALETTES = {
  default: { name: '4Dash (predeterminada)', topbar: '#1b2130', primary: '#3a5ccc', brand: '#ff8a5b', ...seriesFrom(['#2a78d6', '#3987e5'], [1, 2, 3, 4, 5, 6, 7]) },
  emerald: { name: 'Verde esmeralda', topbar: '#047857', primary: '#047857', brand: '#ffffff', ...seriesFrom(['#059669', '#10a37a'], [1, 0, 3, 4, 6, 7, 5]) },
  electric: { name: 'Azul eléctrico', topbar: '#0047ff', primary: '#0050e6', brand: '#ffffff', ...seriesFrom(['#0062ff', '#3b82ff'], [1, 2, 3, 4, 5, 6, 7]) },
  navy: { name: 'Corporativo marino', topbar: '#1f2a44', primary: '#2f5597', brand: '#d4a72c', ...seriesFrom(['#2f5597', '#4a74c9'], [1, 2, 3, 4, 6, 5, 7]) },
  sunset: { name: 'Atardecer', topbar: '#7c2d12', primary: '#c2410c', brand: '#fdba74', ...seriesFrom(['#d9480f', '#e8590c'], [0, 2, 3, 4, 6, 5, 7]) },
  violet: { name: 'Violeta', topbar: '#3b0764', primary: '#6d28d9', brand: '#e9d5ff', ...seriesFrom(['#7c3aed', '#9b6cf2'], [2, 1, 0, 3, 4, 5, 7]) },
  graphite: { name: 'Grafito y cian', topbar: '#111827', primary: '#0e7490', brand: '#22d3ee', ...seriesFrom(['#0b7fa0', '#1597b5'], [1, 6, 3, 4, 5, 0, 7]) }
};
const HEX_RE = /^#[0-9a-f]{6}$/i;

/* ---------- Utilidades de color ---------- */
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = rgb => '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); };
const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function luminance(hex) { const [r, g, b] = hexToRgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const readableOn = bg => (contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111');
function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// Simulación de daltonismo (Machado et al. 2009, severidad 1.0) en RGB lineal
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]
};
function deltaE(a, b, sim) {
  const lin = hex => {
    const v = hexToRgb(hex).map(toLin);
    if (!sim) return v;
    return CVD[sim].map(row => clamp(row[0] * v[0] + row[1] * v[1] + row[2] * v[2], 0, 1));
  };
  const p = oklab(lin(a)), q = oklab(lin(b));
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
}
/** Comprobaciones de accesibilidad de una serie categórica y del color principal. */
function checkPalette(pal, surface = '#ffffff') {
  const out = [];
  const s = pal.series || pal.light;
  let worstN = Infinity, worstC = Infinity, pairN = null, pairC = null;
  for (let i = 0; i + 1 < s.length; i++) {
    const n = deltaE(s[i], s[i + 1]);
    const c = Math.min(deltaE(s[i], s[i + 1], 'protan'), deltaE(s[i], s[i + 1], 'deutan'));
    if (n < worstN) { worstN = n; pairN = [i, i + 1]; }
    if (c < worstC) { worstC = c; pairC = [i, i + 1]; }
  }
  out.push(worstN >= 15
    ? { level: 'ok', text: `Colores contiguos distinguibles (ΔE mínimo ${worstN.toFixed(1)}).` }
    : { level: 'bad', text: `Los colores ${pairN[0] + 1} y ${pairN[1] + 1} se parecen demasiado (ΔE ${worstN.toFixed(1)} < 15).` });
  out.push(worstC >= 8
    ? { level: 'ok', text: `Apta para daltonismo protan/deutan (ΔE mínimo ${worstC.toFixed(1)}).` }
    : worstC >= 6
      ? { level: 'warn', text: `Daltonismo: los colores ${pairC[0] + 1} y ${pairC[1] + 1} quedan justos (ΔE ${worstC.toFixed(1)}). Mantén etiquetas de datos activadas.` }
      : { level: 'bad', text: `Daltonismo: los colores ${pairC[0] + 1} y ${pairC[1] + 1} son casi iguales (ΔE ${worstC.toFixed(1)} < 6).` });
  const low = s.map((c, i) => [i + 1, contrast(c, surface)]).filter(x => x[1] < 3);
  out.push(!low.length
    ? { level: 'ok', text: 'Todos los colores tienen contraste ≥ 3:1 sobre el fondo.' }
    : { level: 'warn', text: `Contraste bajo sobre el fondo en los colores ${low.map(x => x[0]).join(', ')}: usa etiquetas de datos o la vista de tabla.` });
  const pc = contrast(pal.primary, '#ffffff');
  out.push(pc >= 4.5
    ? { level: 'ok', text: `Color principal legible en botones (contraste ${pc.toFixed(1)}:1).` }
    : { level: 'warn', text: `El color principal tiene poco contraste con texto blanco (${pc.toFixed(1)}:1 < 4,5:1).` });
  return out;
}

/* ---------- Aplicación ---------- */
function currentPalette() {
  const p = App.p && App.p.palette;
  if (p && p.id === 'custom' && p.custom) return Object.assign({ name: 'Personalizada' }, p.custom, { light: p.custom.series, dark: p.custom.series });
  return PALETTES[(p && PALETTES[p.id]) ? p.id : 'default'];
}
/** Aplica la paleta como variables CSS (CSSOM: compatible con la CSP). */
function applyPalette() {
  const pal = currentPalette();
  const dark = document.documentElement.dataset.theme === 'dark';
  const root = document.documentElement.style;
  const set = (k, v) => root.setProperty(k, v);
  const topFg = readableOn(pal.topbar);
  set('--topbar-bg', dark ? mixHex(pal.topbar, '#000000', 0.35) : pal.topbar);
  set('--topbar-fg', topFg);
  set('--topbar-fg-2', mixHex(topFg, pal.topbar, 0.3));
  set('--topbar-hover', mixHex(pal.topbar, topFg, 0.16));
  set('--brand', pal.brand);
  const top = dark ? mixHex(pal.topbar, '#000000', 0.35) : pal.topbar;
  set('--brand-top', contrast(pal.brand, top) >= 1.8 ? pal.brand : topFg);
  const pane = dark ? '#1f2430' : '#ffffff';
  const primary = dark ? mixHex(pal.primary, '#ffffff', luminance(pal.primary) < 0.2 ? 0.3 : 0.1) : pal.primary;
  set('--primary', primary);
  set('--primary-hover', mixHex(primary, dark ? '#ffffff' : '#000000', 0.12));
  set('--primary-fg', readableOn(primary));
  set('--primary-soft', mixHex(pane, primary, dark ? 0.28 : 0.13));
  set('--focus', primary);
  const segOn = contrast(primary, top) >= 1.8;
  set('--seg-on-bg', segOn ? primary : topFg);
  set('--seg-on-fg', segOn ? readableOn(primary) : top);
  set('--tab-accent', contrast(pal.brand, pane) >= 1.6 ? pal.brand : primary);
  const series = dark ? pal.dark : pal.light;
  series.forEach((c, i) => set(`--series-${i + 1}`, c));
}
function sanitizePalette(p) {
  if (!p || typeof p !== 'object') return { id: 'default' };
  if (p.id === 'custom' && p.custom && typeof p.custom === 'object') {
    const c = p.custom;
    const hx = (v, d) => (typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : d);
    const base = PALETTES.default;
    return {
      id: 'custom', custom: {
        topbar: hx(c.topbar, base.topbar), primary: hx(c.primary, base.primary), brand: hx(c.brand, base.brand),
        series: Array.from({ length: 8 }, (_, i) => hx(Array.isArray(c.series) ? c.series[i] : null, base.light[i]))
      }
    };
  }
  return { id: PALETTES[p.id] ? p.id : 'default' };
}

/* ---------- Diálogo de paletas ---------- */
function paletteSwatchRow(colors, cls = '') {
  return h('div', { class: 'pal-strip ' + cls }, colors.map(c => { const sw = h('span'); sw.style.background = c; return sw; }));
}
function openPaletteDialog() {
  const original = JSON.stringify(App.p.palette || { id: 'default' });
  const snap = snapshot();
  const cur = sanitizePalette(App.p.palette);
  let draft = cur.id === 'custom' ? deepClone(cur.custom) : null;
  const body = h('div', { class: 'modal-body' });
  const apply = h('button', { class: 'btn primary', type: 'button', text: 'Aplicar' });
  const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancelar' });
  let applied = false;
  const m = openModal({
    title: 'Paleta de colores', labelledIcon: 'palette', body, cls: 'palette-modal',
    foot: h('div', { class: 'modal-foot' }, h('span', { class: 'grow hint', text: 'Se aplica a la herramienta y a todos los gráficos del dashboard. Se guarda con el proyecto.' }), cancel, apply),
    onClose: () => { if (!applied) { App.p.palette = safeJsonParse(original); applyPalette(); renderTopbar(); } }
  });
  const preview = sel => { App.p.palette = sel; applyPalette(); renderTopbar(); draw(); };
  cancel.addEventListener('click', () => m.close());
  apply.addEventListener('click', () => {
    applied = true;
    const sel = App.p.palette;
    App.p.palette = safeJsonParse(original);
    mutate(() => { App.p.palette = sel; }, { snap });
    applyPalette(); renderTopbar();
    m.close();
    toast('Paleta aplicada: ' + currentPalette().name, 'ok');
  });
  function draw() {
    clear(body);
    const sel = sanitizePalette(App.p.palette);
    const grid = h('div', { class: 'pal-grid', role: 'radiogroup', 'aria-label': 'Paletas' });
    for (const [id, p] of Object.entries(PALETTES)) {
      const card = h('button', { class: 'pal-card', type: 'button', role: 'radio', 'aria-checked': sel.id === id ? 'true' : 'false' },
        h('div', { class: 'pal-top' }, h('span', { class: 'pal-dot' }), h('span', { text: '4Dash' })),
        paletteSwatchRow(p.light),
        h('div', { class: 'pal-name' }, sel.id === id ? icon('check', 14) : null, h('span', { text: p.name })));
      const top = card.querySelector('.pal-top');
      top.style.background = p.topbar; top.style.color = readableOn(p.topbar);
      card.querySelector('.pal-dot').style.background = p.brand;
      card.addEventListener('click', () => preview({ id }));
      grid.appendChild(card);
    }
    const customCard = h('button', { class: 'pal-card', type: 'button', role: 'radio', 'aria-checked': sel.id === 'custom' ? 'true' : 'false' },
      h('div', { class: 'pal-top custom' }, icon('palette', 14), h('span', { text: 'Tu marca' })),
      paletteSwatchRow((draft && draft.series) || PALETTES.default.light),
      h('div', { class: 'pal-name' }, sel.id === 'custom' ? icon('check', 14) : null, h('span', { text: 'Personalizada' })));
    customCard.addEventListener('click', () => {
      if (!draft) { const base = currentPalette(); draft = { topbar: base.topbar, primary: base.primary, brand: base.brand, series: (base.light || base.series).slice() }; }
      preview({ id: 'custom', custom: deepClone(draft) });
    });
    grid.appendChild(customCard);
    body.appendChild(grid);

    if (sel.id !== 'custom') {
      const p = PALETTES[sel.id] || PALETTES.default;
      const edit = h('button', { class: 'btn', type: 'button' }, icon('palette', 15), `Personalizar los colores de «${p.name}»`);
      edit.addEventListener('click', () => {
        draft = { topbar: p.topbar, primary: p.primary, brand: p.brand, series: p.light.slice() };
        preview({ id: 'custom', custom: deepClone(draft) });
      });
      body.appendChild(h('div', { class: 'form-row' }, edit));
      body.appendChild(h('p', { class: 'hint', text: 'Las paletas incluidas están validadas para daltonismo y contraste en modo claro y oscuro. Personalízala para elegir cualquier color con el selector (barra superior, color principal, acento y los 8 colores de los gráficos). Cada visual puede además tener sus propios colores en la pestaña Estilo.' }));
      return;
    }
    // Editor personalizado
    const c = sel.custom;
    draft = deepClone(c);
    const update = () => preview({ id: 'custom', custom: deepClone(draft) });
    const colorField = (label, get, setv) => {
      const inp = h('input', { type: 'color', class: 'color-inp', 'aria-label': label, title: 'Elegir cualquier color' });
      inp.value = get();
      const hex = h('input', { class: 'inp hex-inp', maxlength: 7, 'aria-label': label + ' (hex)', spellcheck: 'false' });
      hex.value = get();
      // Vista previa en vivo mientras se arrastra en el selector (limitada a un fotograma)
      let raf = 0;
      inp.addEventListener('input', () => {
        hex.value = inp.value; setv(inp.value);
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; App.p.palette = { id: 'custom', custom: deepClone(draft) }; applyPalette(); });
      });
      inp.addEventListener('change', update);
      hex.addEventListener('change', () => {
        const v = hex.value.trim().startsWith('#') ? hex.value.trim() : '#' + hex.value.trim();
        if (HEX_RE.test(v)) { setv(v.toLowerCase()); update(); } else { hex.value = get(); toast('Color no válido: usa el formato #RRGGBB', 'error'); }
      });
      return h('label', { class: 'color-field' }, inp, h('span', { class: 'cf-text' }, h('span', { class: 'cf-label', text: label }), hex));
    };
    body.appendChild(h('div', { class: 'section-title', text: 'Herramienta' }));
    body.appendChild(h('div', { class: 'color-grid' },
      colorField('Barra superior', () => draft.topbar, v => { draft.topbar = v; }),
      colorField('Color principal', () => draft.primary, v => { draft.primary = v; }),
      colorField('Acento / logo', () => draft.brand, v => { draft.brand = v; })));
    body.appendChild(h('div', { class: 'section-title', text: 'Colores de los gráficos (orden fijo)' }));
    body.appendChild(h('div', { class: 'color-grid series' }, draft.series.map((_, i) => colorField('Serie ' + (i + 1), () => draft.series[i], v => { draft.series[i] = v; }))));
    const from = h('select', { class: 'sel', 'aria-label': 'Partir de una paleta' });
    from.appendChild(h('option', { value: '', text: 'Partir de una paleta…' }));
    for (const [id, p] of Object.entries(PALETTES)) from.appendChild(h('option', { value: id, text: p.name }));
    from.addEventListener('change', () => {
      const p = PALETTES[from.value];
      if (!p) return;
      draft = { topbar: p.topbar, primary: p.primary, brand: p.brand, series: p.light.slice() };
      update();
    });
    body.appendChild(h('div', { class: 'form-row pal-from' }, from));
    body.appendChild(h('div', { class: 'section-title', text: 'Accesibilidad' }));
    const list = h('ul', { class: 'a11y-list' });
    for (const r of checkPalette(Object.assign({}, draft))) {
      list.appendChild(h('li', { class: 'a11y ' + r.level }, icon(r.level === 'ok' ? 'check' : 'info', 14), h('span', { text: (r.level === 'ok' ? 'Correcto: ' : r.level === 'warn' ? 'Aviso: ' : 'Problema: ') + r.text })));
    }
    body.appendChild(list);
  }
  draw();
  return m;
}
