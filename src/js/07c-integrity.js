/* ==========================================================================
   Comprobación de integridad en ejecución.
   La CSP del archivo solo permite ejecutar el script y aplicar los estilos
   cuyo SHA-256 coincide con el publicado en la propia CSP: si alguien altera
   el código sin actualizar los hashes, el navegador no lo ejecuta. Esta
   comprobación añade un aviso visible si la CSP falta o se ha modificado, o si
   el contenido no coincide con sus hashes (p. ej. un archivo dañado).
   Para verificar el archivo completo, compara su SHA-256 con el publicado
   (dist/4dash.html.sha256 en el repositorio).
   ========================================================================== */

const SELF_SCRIPT = document.currentScript;

async function sha256b64(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let bin = '';
  for (const b of new Uint8Array(d)) bin += String.fromCharCode(b);
  return btoa(bin);
}
/** Devuelve { ok, items: [{ level: 'ok'|'warn'|'bad', text }] }. */
async function checkIntegrity() {
  const items = [];
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const csp = meta ? meta.getAttribute('content') || '' : '';
  const hashOf = dir => { const m = new RegExp(dir + " 'sha256-([A-Za-z0-9+/=]+)'").exec(csp); return m ? m[1] : null; };
  const wantScript = hashOf('script-src'), wantStyle = hashOf('style-src');
  if (!meta || !wantScript || !wantStyle || !/default-src 'none'/.test(csp)) {
    items.push({ level: 'bad', text: 'La política de seguridad (CSP) original falta o ha sido modificada: el archivo no es el publicado.' });
  } else {
    items.push({ level: 'ok', text: 'Política de seguridad (CSP) presente y restrictiva.' });
  }
  if (!(window.crypto && crypto.subtle)) {
    items.push({ level: 'warn', text: 'Este navegador no permite calcular SHA-256 aquí; no se pudo comprobar el código.' });
    return { ok: false, items };
  }
  const ownStyle = document.head.querySelector('style');
  try {
    if (wantScript && SELF_SCRIPT) {
      const got = await sha256b64(SELF_SCRIPT.textContent);
      items.push(got === wantScript
        ? { level: 'ok', text: 'El código coincide con su firma SHA-256.' }
        : { level: 'bad', text: 'El código no coincide con su firma SHA-256: el archivo está dañado o modificado.' });
    }
    if (wantStyle && ownStyle) {
      const got = await sha256b64(ownStyle.textContent);
      items.push(got === wantStyle
        ? { level: 'ok', text: 'Los estilos coinciden con su firma SHA-256.' }
        : { level: 'bad', text: 'Los estilos no coinciden con su firma SHA-256.' });
    }
  } catch {
    items.push({ level: 'warn', text: 'No se pudo calcular la firma del código en este navegador.' });
  }
  const extra = document.querySelectorAll('script').length - 1;
  if (extra > 0) items.push({ level: 'warn', text: `Hay ${extra} script(s) adicional(es) en la página (posible extensión del navegador o archivo modificado). La CSP impide que se ejecuten.` });
  return { ok: !items.some(i => i.level !== 'ok'), items };
}

function openAbout() {
  const version = (document.querySelector('meta[name="generator"]') || {}).content || '4Dash';
  const list = h('ul', { class: 'a11y-list' }, h('li', { class: 'a11y', text: 'Comprobando…' }));
  const body = h('div', { class: 'modal-body' },
    h('p', null, h('b', { text: version }), ' · © 2026 Vex62 · ', h('span', { text: 'Licencia 4Dash: uso libre; el uso comercial exige citar claramente al autor («Creado con 4Dash — © Vex62 (github.com/Vex62/4dash)»).' })),
    h('p', { class: 'hint', text: 'Funciona sin conexión: ningún dato sale de tu equipo. Iconos en parte basados en Feather Icons (MIT) y Lucide (ISC).' }),
    h('div', { class: 'section-title', text: 'Integridad del archivo' }), list,
    h('p', { class: 'hint', text: 'Para comprobar el archivo completo, calcula su SHA-256 y compáralo con el publicado junto a la versión (dist/4dash.html.sha256). En Windows: certutil -hashfile 4dash.html SHA256 · en macOS/Linux: shasum -a 256 4dash.html' }));
  const ok = h('button', { class: 'btn primary', type: 'button', text: 'Cerrar' });
  const m = openModal({ title: 'Acerca de 4Dash', labelledIcon: 'shield', body, foot: h('div', { class: 'modal-foot' }, ok) });
  ok.addEventListener('click', () => m.close());
  checkIntegrity().then(r => {
    clear(list);
    for (const it of r.items) list.appendChild(h('li', { class: 'a11y ' + it.level }, icon(it.level === 'ok' ? 'check' : 'info', 14), h('span', { text: it.text })));
  });
  return m;
}
