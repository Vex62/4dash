/* ==========================================================================
   Arranque y eventos globales.
   ========================================================================== */

function renderAll() {
  renderTopbar(); renderToolbar(); renderLeft(); renderRight(); renderPages(); renderFilterBar(); renderCanvas(); renderStatus(); renderSaveState();
}
const isTyping = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function bindEvents() {
  const title = $('#docTitle');
  title.addEventListener('input', () => mutateTyping(() => { App.p.title = title.value.slice(0, 120); }, { keepProps: true }));
  title.addEventListener('keydown', e => { if (e.key === 'Enter') title.blur(); });
  $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#helpBtn').addEventListener('click', () => openTutorial());
  $('#paletteBtn').addEventListener('click', openPaletteDialog);

  $('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) handleImport(f); });
  $('#projectInput').addEventListener('change', e => openProjectFile(e.target.files[0]));
  $('#imageInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    const cb = imageCallback;
    imageCallback = null;
    if (!f || !cb) return;
    try { cb.cb(await sanitizeImageFile(f, cb.maxDim)); renderLogo(); if (App.view === 'presenter') renderPresHeader(); }
    catch (err) { reportError(err); }
  });

  // Arrastrar y soltar: archivos, visuales y campos sobre el lienzo
  const area = $('#canvasArea');
  let overlay = null, dragDepth = 0;
  const hasFiles = e => Array.from(e.dataTransfer.types || []).includes('Files');
  area.addEventListener('dragenter', e => {
    if (App.view !== 'editor' || !hasFiles(e)) return;
    dragDepth++;
    if (!overlay) { overlay = h('div', { class: 'drop-overlay', text: 'Suelta aquí tu Excel o CSV' }); area.appendChild(overlay); }
  });
  area.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth && overlay) { overlay.remove(); overlay = null; } });
  area.addEventListener('dragover', e => {
    if (App.view !== 'editor') return;
    const t = Array.from(e.dataTransfer.types || []);
    if (t.includes('Files') || t.includes('application/x-4dash-viz') || t.includes('application/x-4dash-field')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  area.addEventListener('drop', e => {
    if (App.view !== 'editor') return;
    e.preventDefault();
    dragDepth = 0;
    if (overlay) { overlay.remove(); overlay = null; }
    const r = $('#page').getBoundingClientRect();
    const at = { x: (e.clientX - r.left) / App.scale, y: (e.clientY - r.top) / App.scale };
    const inside = at.x >= 0 && at.y >= 0 && at.x <= page().w && at.y <= page().h;
    if (hasFiles(e)) { const f = e.dataTransfer.files[0]; if (f) handleImport(f); return; }
    const viz = e.dataTransfer.getData('application/x-4dash-viz');
    if (viz === 'shape') return insertShape('round', inside ? at : null);
    if (viz && VIZ[viz]) return insertWidget(viz, inside ? at : null);
    const field = e.dataTransfer.getData('application/x-4dash-field');
    if (field) { try { const f = safeJsonParse(field); createFromField(f.ds, String(f.col), inside ? at : null); } catch { /* ignorar */ } }
  });
  // Evitar que soltar un archivo fuera del lienzo lo abra en el navegador
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => { if (hasFiles(e)) e.preventDefault(); });

  // Clic en zona vacía: deseleccionar
  $('#scroller').addEventListener('pointerdown', e => {
    if (App.view === 'editor' && (e.target.id === 'page' || e.target.id === 'scroller' || e.target.id === 'pageFrame') && App.sel) select(null);
  });

  // Ctrl + rueda sobre el lienzo: zoom del lienzo (no el del navegador)
  $('#scroller').addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  // Rueda vertical sobre la barra de herramientas: desplazamiento horizontal
  $('#toolbar').addEventListener('wheel', e => {
    const tb = e.currentTarget;
    if (tb.scrollWidth <= tb.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    tb.scrollLeft += e.deltaY;
  }, { passive: false });

  let zoomRaf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(zoomRaf); zoomRaf = requestAnimationFrame(applyZoom); }).observe($('#scroller'));
  document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement); requestAnimationFrame(applyZoom); });
  window.addEventListener('scroll', () => Tip.hide(), true);

  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', e => { if (!App.prefs.autosave && App.hist.length) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('error', e => { console.error(e.error || e.message); });
  window.addEventListener('unhandledrejection', e => { reportError(e.reason); });
}

function onKey(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  if (k === 'Escape') {
    if (openMenuEl) { closeMenu(); return; }
    if (modalStack.length) { modalStack[modalStack.length - 1].close(); return; }
    if (App.view === 'presenter' && !document.fullscreenElement) { setView('editor'); return; }
    if (App.sel) { select(null); return; }
    return;
  }
  if (modalStack.length) return;
  if (k === 'F1') { e.preventDefault(); openTutorial(); return; }
  if (k === 'F5') { e.preventDefault(); setView(App.view === 'editor' ? 'presenter' : 'editor'); return; }
  if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); saveProjectFile(); return; }
  if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); openProjectPicker(); return; }
  if (ctrl && k.toLowerCase() === 'p') { e.preventDefault(); printDashboard(); return; }
  if (ctrl && k.toLowerCase() === 'e') { e.preventDefault(); openExportDialog(); return; }
  if (isTyping(e.target)) return;
  if (App.view === 'presenter') {
    const idx = App.p.pages.findIndex(p => p.id === App.p.active);
    if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); gotoPage(idx + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); gotoPage(idx - 1); }
    else if (k.toLowerCase() === 'f') toggleFullscreen();
    return;
  }
  if (ctrl && k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (ctrl && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  const w = selW();
  if (!w) return;
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelected(); }
  else if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
  else if (ctrl && k.toLowerCase() === 'c') { App.clipboard = JSON.stringify(w, jsonReplacer); toast('Visual copiado'); }
  else if (k.startsWith('Arrow')) {
    e.preventDefault();
    const st = e.shiftKey ? 10 : 1;
    nudge(k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0);
  }
}
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl || e.key.toLowerCase() !== 'v' || isTyping(e.target) || App.view !== 'editor' || !App.clipboard || modalStack.length) return;
  e.preventDefault();
  const w = sanitizeWidget(safeJsonParse(App.clipboard));
  if (!w) return;
  const pg = page();
  w.id = uid();
  w.x = clamp(w.x + 24, 0, Math.max(0, pg.w - w.w));
  w.y = clamp(w.y + 24, 0, Math.max(0, pg.h - w.h));
  if (w.ds && !dsById(w.ds)) w.ds = null;
  mutate(() => { pg.widgets.push(w); App.sel = w.id; });
});

function boot() {
  loadPrefs();
  const dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = App.prefs.theme || (dark ? 'dark' : 'light');
  App.p = (App.prefs.autosave && loadStored()) || newProject();
  bindEvents();
  applyPalette();
  renderAll();
  if (window.top !== window.self) {
    toast('Aviso: 4Dash se está mostrando dentro de otra página. Ábrelo directamente para mayor seguridad.', 'error', 9000);
  }
  if (!App.prefs.tutorialSeen) {
    App.prefs.tutorialSeen = true;
    savePrefs();
    setTimeout(() => openTutorial(), 300);
  }
}
boot();
