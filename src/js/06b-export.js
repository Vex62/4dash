/* ==========================================================================
   Exportación del dashboard tal y como se ve en el Presentador:
   PNG (imagen), SVG (vectorial) y PDF (una página por página del dashboard).
   Sin librerías: el DOM se serializa dentro de un SVG (foreignObject), el
   navegador lo dibuja en un canvas y el PDF se escribe a mano con las
   imágenes JPEG incrustadas (DCTDecode).
   ========================================================================== */

const EXPORT_PAD = 24;

/** Valores actuales de todas las variables CSS (tema + paleta). */
function exportVars() {
  const css = $('style').textContent;
  const names = new Set(css.match(/--[a-z0-9-]+(?=\s*:)/gi) || []);
  for (let i = 1; i <= 8; i++) names.add('--series-' + i);
  for (const n of ['--brand-top', '--seg-on-bg', '--seg-on-fg']) names.add(n);
  const cs = getComputedStyle(document.documentElement);
  const out = [];
  for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) out.push([n, v]); }
  return out;
}

/** Construye (fuera de pantalla) la página tal y como se ve en el Presentador. */
function buildExportNode(pg, header) {
  const root = h('div', { class: 'export-root' });
  for (const [n, v] of exportVars()) root.style.setProperty(n, v);
  Object.assign(root.style, {
    position: 'fixed', left: '-100000px', top: '0', width: (pg.w + EXPORT_PAD * 2) + 'px', padding: EXPORT_PAD + 'px',
    background: 'var(--canvas-bg)', fontFamily: 'var(--font)', fontSize: '13px', color: 'var(--text)', boxSizing: 'border-box'
  });
  if (header) {
    const hd = h('div', { class: 'pres-header' }, presHeaderNodes(pg));
    Object.assign(hd.style, { padding: '0 0 16px', background: 'transparent' });
    root.appendChild(hd);
  }
  const frame = h('div');
  Object.assign(frame.style, { position: 'relative', width: pg.w + 'px', height: pg.h + 'px' });
  const pe = h('div', { class: 'page' });
  Object.assign(pe.style, { width: pg.w + 'px', height: pg.h + 'px' });
  applyPageBg(pg, pe);
  pg.widgets.forEach((w, i) => pe.appendChild(widgetEl(w, i, { editable: false, print: true })));
  frame.appendChild(pe);
  root.appendChild(frame);
  return root;
}

/** Serializa la página a un documento SVG autónomo (estilos incluidos). */
function pageToSvg(pg, header, scale) {
  const node = buildExportNode(pg, header);
  document.body.appendChild(node);
  const W = pg.w + EXPORT_PAD * 2;
  const H = Math.ceil(node.getBoundingClientRect().height);
  // El estado de casillas y campos es una propiedad: se copia a atributos para que se serialice
  node.querySelectorAll('input').forEach(i => { if (i.checked) i.setAttribute('checked', ''); if (i.value) i.setAttribute('value', i.value); });
  // Caracteres de control que XML no admite (pueden venir de los datos importados)
  const bad = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
  const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (bad.test(n.data)) { bad.lastIndex = 0; n.data = n.data.replace(bad, ''); }
  node.querySelectorAll('[title],[aria-label],[value]').forEach(el => { for (const a of ['title', 'aria-label', 'value']) { const v = el.getAttribute(a); if (v && bad.test(v)) { bad.lastIndex = 0; el.setAttribute(a, v.replace(bad, '')); } } });
  node.remove();
  Object.assign(node.style, { position: 'static', left: '', top: '' });
  node.insertBefore(h('style', { text: $('style').textContent }), node.firstChild);
  const xml = new XMLSerializer().serializeToString(node);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}">`
    + `<foreignObject x="0" y="0" width="${W}" height="${H}">${xml}</foreignObject></svg>`;
  return { svg, W, H };
}

/** Escala máxima segura para el canvas (límite de píxeles del navegador). */
function safeScale(W, H, want) {
  return Math.max(0.1, Math.min(want, 16000 / W, 16000 / H, Math.sqrt(40e6 / (W * H))));
}

async function rasterize(svg, wPx, hPx, bg) {
  // URL data: (no blob:): en file:// un SVG blob con foreignObject «contamina» el canvas
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  {
    const img = new Image();
    await new Promise((res, rej) => {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', () => rej(new UserError('El navegador no pudo dibujar el dashboard como imagen. Prueba a exportar en SVG.')), { once: true });
      img.src = url;
    });
    await new Promise(r => setTimeout(r, 40));
    const cv = document.createElement('canvas');
    cv.width = wPx; cv.height = hPx;
    const cx = cv.getContext('2d');
    cx.fillStyle = bg;
    cx.fillRect(0, 0, wPx, hPx);
    cx.drawImage(img, 0, 0, wPx, hPx);
    return cv;
  }
}
function canvasBlob(cv, type, q) {
  return new Promise((res, rej) => {
    try { cv.toBlob(b => (b ? res(b) : rej(new UserError('No se pudo generar la imagen.'))), type, q); }
    catch { rej(new UserError('El navegador bloqueó la conversión a imagen. Exporta en SVG o usa Imprimir → Guardar como PDF.')); }
  });
}

/* ---------- PDF mínimo (PDF 1.4, una imagen JPEG por página) ---------- */
function pdfText(t) {
  let hex = 'FEFF';
  for (const ch of String(t)) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) { const v = c - 0x10000; hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); }
    else hex += c.toString(16).padStart(4, '0');
  }
  return '<' + hex.toUpperCase() + '>';
}
function buildPdf(pages, title) {
  const enc = new TextEncoder();
  const chunks = [], offs = [];
  let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const d = new Date(), p2 = v => String(v).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const n = pages.length;
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${4 + 3 * i} 0 R`).join(' ')}] >>`));
  obj(3, () => push(`<< /Title ${pdfText(title)} /Creator (4Dash) /Producer (4Dash) /CreationDate (D:${stamp}) >>`));
  pages.forEach((p, i) => {
    const P = 4 + 3 * i;
    obj(P, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pw} ${p.ph}] /Resources << /XObject << /Im${i} ${P + 1} 0 R >> >> /Contents ${P + 2} 0 R >>`));
    obj(P + 1, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
    const c = `q ${p.pw} 0 0 ${p.ph} 0 0 cm /Im${i} Do Q`;
    obj(P + 2, () => push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`));
  });
  const size = 4 + 3 * n;
  const xref = len;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let k = 1; k < size; k++) push(String(offs[k]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

/* ---------- Proceso de exportación ---------- */
async function exportDashboard(opts) {
  const pages = opts.pages === 'all' ? App.p.pages : [page()];
  const prevTheme = document.documentElement.dataset.theme;
  const theme = opts.theme === 'current' ? prevTheme : opts.theme;
  const base = safeFileName(App.p.title || 'dashboard');
  const busy = toast('Exportando…', 'info', 120000);
  const pdfPages = [];
  try {
    if (theme !== prevTheme) { document.documentElement.dataset.theme = theme; applyPalette(); }
    const docs = pages.map(pg => ({ pg, ...pageToSvg(pg, opts.header, 1) }));
    if (theme !== prevTheme) { document.documentElement.dataset.theme = prevTheme; applyPalette(); }
    const bg = theme === 'dark' ? '#0e1117' : '#ffffff';
    for (const d of docs) {
      const name = pages.length > 1 ? `${base} - ${d.pg.name}` : base;
      if (opts.fmt === 'svg') { downloadFile(name + '.svg', 'image/svg+xml', d.svg); continue; }
      const sc = safeScale(d.W, d.H, opts.scale);
      const wPx = Math.round(d.W * sc), hPx = Math.round(d.H * sc);
      const svg = d.svg.replace(/^<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${wPx}" height="${hPx}"`);
      const cv = await rasterize(svg, wPx, hPx, bg);
      if (opts.fmt === 'png') { downloadFile(name + '.png', 'image/png', await canvasBlob(cv, 'image/png')); await new Promise(r => setTimeout(r, 250)); }
      else {
        const jpeg = new Uint8Array(await (await canvasBlob(cv, 'image/jpeg', 0.92)).arrayBuffer());
        pdfPages.push({ jpeg, w: wPx, h: hPx, pw: +(d.W * 0.75).toFixed(2), ph: +(d.H * 0.75).toFixed(2) });
      }
    }
    if (opts.fmt === 'pdf') downloadFile(base + '.pdf', 'application/pdf', buildPdf(pdfPages, App.p.title || 'Dashboard'));
    busy.remove();
    toast(`Exportado: ${pages.length} página(s) en ${opts.fmt.toUpperCase()}`, 'ok');
  } catch (err) {
    if (document.documentElement.dataset.theme !== prevTheme) { document.documentElement.dataset.theme = prevTheme; applyPalette(); }
    busy.remove();
    reportError(err);
  }
}

const exportPrefs = { fmt: 'png', pages: 'current', scale: 2, header: true, theme: 'current' };
function openExportDialog() {
  const o = exportPrefs;
  const body = h('div', { class: 'modal-body export-opts' });
  const go = h('button', { class: 'btn primary', type: 'button' }, icon('export', 16), 'Exportar');
  const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancelar' });
  const m = openModal({ title: 'Exportar dashboard', labelledIcon: 'export', body, foot: h('div', { class: 'modal-foot' }, h('span', { class: 'grow hint', text: 'Se exporta tal y como se ve en la vista Presentador, con los filtros activos.' }), cancel, go) });
  cancel.addEventListener('click', () => m.close());
  go.addEventListener('click', () => { m.close(); exportDashboard(Object.assign({}, o)); });
  let previewUrl = null;
  const draw = () => {
    clear(body);
    body.appendChild(formRow('Formato', segEl([['png', 'PNG · imagen'], ['pdf', 'PDF'], ['svg', 'SVG · vectorial']], o.fmt, v => { o.fmt = v; draw(); }, 'Formato')));
    body.appendChild(h('div', { class: 'form-inline' },
      formRow('Páginas', selectEl([['current', 'Página actual'], ['all', `Todas (${App.p.pages.length})`]], o.pages, v => { o.pages = v; })),
      formRow('Resolución', selectEl([['1', 'Normal (1×)'], ['2', 'Alta (2×)'], ['3', 'Muy alta (3×)']], String(o.scale), v => { o.scale = +v || 2; })),
      formRow('Tema', selectEl([['current', 'El actual'], ['light', 'Claro'], ['dark', 'Oscuro']], o.theme, v => { o.theme = v; draw(); }))));
    body.appendChild(checkEl('Incluir cabecera (logo, título, página y fecha)', o.header, v => { o.header = v; draw(); }));
    if (o.fmt === 'svg') body.appendChild(h('p', { class: 'hint', text: 'El SVG conserva textos y gráficos nítidos a cualquier tamaño; se abre en cualquier navegador.' }));
    if (o.fmt === 'pdf') body.appendChild(h('p', { class: 'hint', text: 'Un PDF con una hoja por página del dashboard, del mismo tamaño y proporción que el lienzo.' }));
    const img = h('img', { class: 'export-preview', alt: 'Vista previa de la página actual' });
    body.appendChild(h('div', { class: 'section-title', text: 'Vista previa' }), img);
    // Miniatura de la página actual (también comprueba que el navegador admite la exportación)
    requestAnimationFrame(async () => {
      try {
        const prevTheme = document.documentElement.dataset.theme;
        const theme = o.theme === 'current' ? prevTheme : o.theme;
        if (theme !== prevTheme) { document.documentElement.dataset.theme = theme; applyPalette(); }
        const d = pageToSvg(page(), o.header, 1);
        if (theme !== prevTheme) { document.documentElement.dataset.theme = prevTheme; applyPalette(); }
        const sc = Math.min(1, 640 / d.W);
        const cv = await rasterize(d.svg.replace(/^<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${Math.round(d.W * sc)}" height="${Math.round(d.H * sc)}"`), Math.round(d.W * sc), Math.round(d.H * sc), theme === 'dark' ? '#0e1117' : '#ffffff');
        const blob = await canvasBlob(cv, 'image/png');
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        img.src = previewUrl;
      } catch { img.replaceWith(h('p', { class: 'hint', text: 'No se pudo generar la vista previa en este navegador; la exportación SVG sigue disponible.' })); }
    });
  };
  draw();
  return m;
}
