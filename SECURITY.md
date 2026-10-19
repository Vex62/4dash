# Revisión de seguridad de 4Dash (OWASP)

**Alcance:** `dist/4dash.html` (aplicación de una sola página, sin backend) y su proceso de build.
**Referencias:** OWASP Top 10 2021, OWASP ASVS 4.0 (capítulos V5, V12, V14) y las cheat sheets de XSS, CSP, XXE,
CSV Injection, Prototype Pollution y File Upload.
**Modelo de amenazas:** la entrada no confiable es todo lo que el usuario importa — Excel/CSV recibidos de terceros, proyectos
`.4dash.json`, imágenes y el contenido de `localStorage` (que en `file://` puede compartirse con otras páginas locales).
El objetivo del atacante sería ejecutar código en el navegador, exfiltrar datos o bloquear la herramienta.

## Resumen de controles

| Control | Implementación |
|---|---|
| Sin dependencias ni red | Cero librerías y cero CDN. La CSP prohíbe toda conexión (`connect-src 'none'`, `default-src 'none'`). El build falla si aparece una URL externa. |
| CSP estricta por hash | `script-src` y `style-src` solo admiten el hash SHA-256 del bloque incrustado: no se permite `unsafe-inline`, `unsafe-eval` ni scripts inyectados. Además `object-src`, `frame-src`, `worker-src`, `base-uri` y `form-action` a `'none'`. |
| Trusted Types | `require-trusted-types-for 'script'`: cualquier asignación a `innerHTML` y similares lanza un error en Chromium. La única política (`fourdash-xml`) se usa solo para `DOMParser` en un documento XML inerte. |
| DOM seguro | Todo el texto se inserta con `textContent`/nodos de texto (`h()` en `01-util.js`). Nombres de hojas, columnas y celdas nunca se interpretan como HTML. |
| Archivos | Validación por firma binaria (ZIP, OLE, PNG, JPEG, GIF, WEBP), no por extensión. Límites de tamaño, filas, columnas, celdas y hojas. |
| XML | Se rechaza cualquier `<!DOCTYPE>`/`<!ENTITY>` (XXE y «billion laughs»). |
| ZIP | Límite de entradas, tamaño descomprimido por entrada y total, y ratio de compresión. La descompresión es en streaming y se aborta al superar el límite (zip bomb). Sin ZIP64 ni entradas cifradas. |
| Imágenes | Solo PNG/JPEG/WEBP/GIF (SVG rechazado: puede contener script). Se decodifican con `createImageBitmap` y se **recodifican en canvas**, lo que elimina metadatos y cargas ocultas. Las imágenes guardadas deben cumplir `^data:image/(png|jpeg|webp|gif);base64,…$`. |
| Exportación PNG / SVG / PDF | Se realiza íntegramente en el navegador: la página se serializa con `XMLSerializer` (sin `innerHTML`) dentro de un SVG que se carga como imagen `data:` (los documentos SVG cargados como imagen no ejecutan scripts ni cargan recursos externos) y se dibuja en un canvas; el PDF se escribe byte a byte. No se inserta ningún `<style>` ni script en el documento principal y la CSP no se relaja. Los colores de estilo se validan como `#rrggbb` antes de usarse. |
| Proyectos y almacenamiento local | `JSON.parse` con *reviver* que descarta `__proto__`, `constructor` y `prototype`; después, validación por esquema campo a campo (tipos, enumerados, longitudes, rangos, ids `^[A-Za-z0-9_-]{1,40}$`). Los objetos se reconstruyen desde cero y nunca se mezclan con los originales. Las agrupaciones usan `Map`/`Set`. |
| Paletas de color | Los colores se aplican como variables CSS mediante CSSOM (compatible con la CSP, sin estilos en línea). Los colores personalizados de proyectos importados deben cumplir `^#[0-9a-f]{6}# Revisión de seguridad de 4Dash (OWASP)

**Alcance:** `dist/4dash.html` (aplicación de una sola página, sin backend) y su proceso de build.
**Referencias:** OWASP Top 10 2021, OWASP ASVS 4.0 (capítulos V5, V12, V14) y las cheat sheets de XSS, CSP, XXE,
CSV Injection, Prototype Pollution y File Upload.
**Modelo de amenazas:** la entrada no confiable es todo lo que el usuario importa — Excel/CSV recibidos de terceros, proyectos
`.4dash.json`, imágenes y el contenido de `localStorage` (que en `file://` puede compartirse con otras páginas locales).
El objetivo del atacante sería ejecutar código en el navegador, exfiltrar datos o bloquear la herramienta.

## Resumen de controles

| Control | Implementación |
|---|---|
| Sin dependencias ni red | Cero librerías y cero CDN. La CSP prohíbe toda conexión (`connect-src 'none'`, `default-src 'none'`). El build falla si aparece una URL externa. |
| CSP estricta por hash | `script-src` y `style-src` solo admiten el hash SHA-256 del bloque incrustado: no se permite `unsafe-inline`, `unsafe-eval` ni scripts inyectados. Además `object-src`, `frame-src`, `worker-src`, `base-uri` y `form-action` a `'none'`. |
| Trusted Types | `require-trusted-types-for 'script'`: cualquier asignación a `innerHTML` y similares lanza un error en Chromium. La única política (`fourdash-xml`) se usa solo para `DOMParser` en un documento XML inerte. |
| DOM seguro | Todo el texto se inserta con `textContent`/nodos de texto (`h()` en `01-util.js`). Nombres de hojas, columnas y celdas nunca se interpretan como HTML. |
| Archivos | Validación por firma binaria (ZIP, OLE, PNG, JPEG, GIF, WEBP), no por extensión. Límites de tamaño, filas, columnas, celdas y hojas. |
| XML | Se rechaza cualquier `<!DOCTYPE>`/`<!ENTITY>` (XXE y «billion laughs»). |
| ZIP | Límite de entradas, tamaño descomprimido por entrada y total, y ratio de compresión. La descompresión es en streaming y se aborta al superar el límite (zip bomb). Sin ZIP64 ni entradas cifradas. |
| Imágenes | Solo PNG/JPEG/WEBP/GIF (SVG rechazado: puede contener script). Se decodifican con `createImageBitmap` y se **recodifican en canvas**, lo que elimina metadatos y cargas ocultas. Las imágenes guardadas deben cumplir `^data:image/(png|jpeg|webp|gif);base64,…$`. |
| Proyectos y almacenamiento local | `JSON.parse` con *reviver* que descarta `__proto__`, `constructor` y `prototype`; después, validación por esquema campo a campo (tipos, enumerados, longitudes, rangos, ids `^[A-Za-z0-9_-]{1,40}$`). Los objetos se reconstruyen desde cero y nunca se mezclan con los originales. Las agrupaciones usan `Map`/`Set`. |
; cualquier otro valor se sustituye por el predeterminado. |
| Exportación CSV | Neutraliza *CSV/Formula Injection*: los textos que empiezan por `= + - @ tab CR` se prefijan con `'`. |
| Privacidad | Autoguardado opcional y desactivable; botón para borrar los datos locales. `referrer` = `no-referrer`. |

## OWASP Top 10 2021

### A01 · Control de acceso roto — *No aplica / mitigado*
No hay servidor, cuentas ni recursos remotos. El único almacenamiento es `localStorage` del propio navegador. Riesgo
residual: en `file://` algunos navegadores comparten `localStorage` entre archivos locales; por eso **todo lo que se lee de
allí se valida igual que un archivo externo** y el autoguardado puede desactivarse.

### A02 · Fallos criptográficos — *No aplica*
La herramienta no gestiona secretos ni transmite datos. Los ids se generan con `crypto.getRandomValues`. Los datos
autoguardados no están cifrados en reposo: no deben usarse equipos compartidos para datos sensibles (o se desactiva el
autoguardado). Se documenta como riesgo aceptado.

### A03 · Inyección — *Mitigado*
- **XSS:** sin `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` ni `new Function` (el build lo
  verifica); `textContent` en todo el renderizado; sin manejadores `on*` en línea; CSP por hash + Trusted Types como segunda
  barrera. Probado con celdas, cabeceras y nombres de hoja que contienen `<img onerror>`, `<script>` y `<svg onload>`:
  se muestran como texto literal y no se ejecuta nada.
- **XXE:** DTD y entidades rechazadas antes de analizar; `DOMParser` del navegador no resuelve entidades externas.
- **CSV Injection:** prefijo `'` en exportaciones (probado con `=HYPERLINK(...)`, `@SUM`, `=1+1`).
- **Inyección CSS / selectores:** los valores dinámicos en selectores pasan por `CSS.escape` y los ids están validados.
- **ReDoS:** las expresiones regulares sobre datos son lineales y se aplican a cadenas acotadas (p. ej. ≤ 40 caracteres para
  números).

### A04 · Diseño inseguro — *Mitigado*
Límites explícitos en `LIMITS` (`02-parsers.js`): 30 MB por archivo, 150 MB por entrada descomprimida, 300 MB en total,
ratio 200:1, 10.000 entradas ZIP, 30 hojas, 100.000 filas, 300 columnas, 3 M de celdas, 60 MB por proyecto y 8 MB por
imagen. Probado con una zip bomb de 200 MB → rechazada. Proyectos limitados a 60 páginas × 300 visuales; cada visual se
acota al lienzo.

### A05 · Configuración de seguridad incorrecta — *Mitigado*
CSP restrictiva en `<meta>`, `no-referrer`, sin directivas permisivas. **Limitación:** `frame-ancestors` no puede
declararse en `<meta>`. Si se **publica** el HTML en un servidor web, añade estas cabeceras:

```
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
```

Como defensa en profundidad, la aplicación avisa si detecta que se está mostrando dentro de un marco ajeno (clickjacking).

### A06 · Componentes vulnerables y desactualizados — *Eliminado*
Cero dependencias en tiempo de ejecución y de build: lector XLSX/CSV, gráficos e iconos son código propio. No hay cadena
de suministro que auditar ni extensiones que puedan levantar alertas de antivirus o de políticas corporativas.

### A07 · Fallos de identificación y autenticación — *No aplica*
No hay autenticación.

### A08 · Fallos de integridad de software y datos — *Mitigado*
- La CSP por hash garantiza que solo se ejecuta exactamente el script publicado: si alguien modifica el HTML a mano, el
  navegador bloquea el script.
- Deserialización segura de proyectos (reviver anti-*prototype pollution* + validación por esquema). Probado con un
  proyecto que incluye `__proto__`, `constructor.prototype`, un logo `javascript:`, una imagen SVG, un tipo de visual
  inexistente, ids con comillas y coordenadas `1e99`: todo se descarta o se acota.
- **Integridad (v1.2).** `node build.mjs` publica el SHA-256 del archivo en `dist/4dash.html.sha256`, y
  `node build.mjs --check` (o `npm run check`) verifica sin escribir nada que `dist/4dash.html` coincide byte a byte con
  `src/`, que el script y los estilos incrustados coinciden con sus hashes CSP y con el hash publicado. Al arrancar, la
  propia aplicación recalcula el SHA-256 de su script y estilos con `crypto.subtle` y lo compara con la CSP; si la CSP
  falta, se ha relajado o algo no coincide, muestra un aviso, y el resultado se puede consultar en
  *Ayuda → Acerca de e integridad*. **Límite:** una comprobación dentro del propio archivo no puede impedir que quien
  reescriba el archivo entero también la elimine; la garantía real es comparar el SHA-256 del archivo recibido con el
  publicado: `certutil -hashfile 4dash.html SHA256` (Windows) o `shasum -a 256 4dash.html`.

### A09 · Fallos de registro y monitorización — *Aceptado (aplicación local)*
No hay telemetría (por diseño de privacidad). Los errores se muestran al usuario con mensajes genéricos sin trazas
internas y se registran solo en la consola local del navegador.

### A10 · SSRF — *No aplica*
No existe ninguna petición de red (`connect-src 'none'`); los datos nunca salen del equipo.

## Revisión de la versión 1.2 (UX y OWASP)

| Área | Hallazgo | Corrección |
|---|---|---|
| UX · zoom | Con zoom del navegador ≥ 125 % la barra de herramientas ocultaba controles (al 300 %, 12) y al 500 % la barra superior perdía «tema» y «ayuda». | Los grupos que no caben pasan a un panel **«Más»** con su texto; la barra superior se compacta. Verificado de 100 % a 500 % en Editor y Presentador: 0 controles perdidos. |
| UX · contraste (WCAG 1.4.3) | Texto terciario 3,4–3,8:1, etiquetas de ejes 3,4:1 y rojo de bajada en oscuro 3,4:1. | Nuevos tonos: ≥ 4,5:1 sobre sus fondos. |
| UX · tamaño de objetivo (WCAG 2.5.8) | Botones de zoom de 22 px. | 24 px. |
| UX · paneles en pantallas estrechas | Con los paneles plegados no había un acceso directo a las propiedades desde el visual. | Opción «Propiedades» en el menú ⋯ del visual. |
| UX · teclado | El panel «Más» debía poder cerrarse sin ratón. | Esc lo cierra y devuelve el foco al botón; `aria-expanded` refleja el estado. |
| A03 · Inyección (CSS) | Los colores, ángulos y estilos nuevos se aplican vía CSSOM. | Solo se aceptan `#rrggbb`, números acotados y valores de listas cerradas (validado también al cargar proyectos). |
| A04 · Diseño (exportación) | Caracteres de control de los datos importados podían producir un SVG inválido y romper la exportación. | Se eliminan antes de serializar. |
| A08 · Integridad | No había forma de verificar que el archivo distribuido es el publicado. | Hash publicado, `--check` en el build y comprobación en ejecución (ver A08). |

## Riesgos residuales y recomendaciones
1. **Datos en `localStorage` sin cifrar.** Recomendación: desactivar el autoguardado en equipos compartidos y usar
   «Borrar datos guardados localmente».
2. **Trusted Types** solo se aplica en navegadores Chromium; en Firefox/Safari la protección recae en la CSP y en el uso
   exclusivo de `textContent`.
3. **`frame-ancestors`** requiere cabecera HTTP si el archivo se aloja en un servidor (ver A05).
4. Los archivos `.4dash.json` contienen los datos importados: trátalos con la misma clasificación que el Excel original.

## Cómo reproducir la revisión
- `node build.mjs` falla ante APIs peligrosas, URLs externas o errores de sintaxis.
- `node build.mjs --check` verifica la integridad del archivo publicado (ver A08).
- Pruebas manuales realizadas: importación de `.xlsx` con XSS en celdas/cabeceras/nombre de hoja, `.xlsx` con DTD/ENTITY,
  zip bomb de 200 MB, CSV con fórmulas y saltos de línea, proyecto con *prototype pollution*, logo SVG con extensión `.png`.
  Resultado: ningún script ejecutado, ninguna violación de CSP, todas las entradas maliciosas rechazadas o neutralizadas.
