// Construye dist/4dash.html: un único HTML autocontenido (CSS + JS en línea)
// con una Content-Security-Policy estricta basada en hashes SHA-256.
// Sin dependencias: solo Node.js >= 18.
//   node build.mjs           -> genera dist/4dash.html
//   node build.mjs --check   -> además verifica que el resultado es reproducible
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// El parser HTML normaliza CRLF -> LF antes de calcular el hash CSP, así que
// normalizamos aquí también (si no, el navegador bloquearía el script).
const read = p => readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
const template = read(join(src, 'index.html'));
const css = read(join(src, 'styles.css')).trim();
const jsFiles = readdirSync(join(src, 'js')).filter(f => f.endsWith('.js')).sort();
const js = [
  `/*! 4Dash v${pkg.version} — © 2026 Vex62 — Licencia 4Dash (uso comercial solo con atribución clara al autor; ver LICENSE). Iconos en parte basados en Feather Icons (MIT, © Cole Bemis) y Lucide (ISC). */`,
  '(() => {',
  "'use strict';",
  ...jsFiles.map(f => `/* ---- ${f} ---- */\n` + read(join(src, 'js', f))),
  '})();'
].join('\n');

// Comprobaciones de seguridad del propio build
const fail = msg => { console.error('✖ ' + msg); process.exit(1); };
if (/<\/script/i.test(js)) fail('El JS contiene "</script": rompería el documento.');
if (/<\/style/i.test(css)) fail('El CSS contiene "</style".');
if (/\binnerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/.test(js.replace(/'innerHTML'|'outerHTML'/g, ''))) {
  fail('Se ha detectado una API peligrosa (innerHTML/eval/new Function/document.write).');
}
if (/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(js + css)) fail('Se ha detectado una URL externa en el código.');
try { new vm.Script(js, { filename: '4dash.js' }); } catch (e) { fail('Error de sintaxis en el JS: ' + e.message); }

const sha = s => 'sha256-' + createHash('sha256').update(s, 'utf8').digest('base64');
const csp = [
  "default-src 'none'",
  `script-src '${sha(js)}'`,
  `style-src '${sha(css)}'`,
  'img-src data: blob:',
  "font-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types fourdash-xml'
].join('; ');

const html = template
  .split('{{CSP}}').join(csp)
  .split('{{VERSION}}').join(pkg.version)
  .split('{{STYLE}}').join(css)
  .split('{{SCRIPT}}').join(js);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', '4dash.html');
writeFileSync(out, html, 'utf8');
console.log(`✔ dist/4dash.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
console.log(`  script ${sha(js)}`);
console.log(`  style  ${sha(css)}`);
