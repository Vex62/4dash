# 4Dash

**4Dash** convierte una hoja de cálculo (`.xlsx`, `.csv`) en un dashboard interactivo dentro de **un único archivo HTML autocontenido**:
sin servidor, sin instalación, sin librerías externas y sin conexiones de red. Todo se procesa en el navegador.

> Abre `dist/4dash.html` con Edge, Chrome, Firefox o Safari (versiones de 2023 en adelante). Nada más.

## Funcionalidades

| Área | Qué incluye |
|---|---|
| **Importación** | `.xlsx` / `.xlsm` (lector ZIP + XML propio) y `.csv` / `.tsv` (detecta separador y coma decimal). Arrastrar y soltar sobre el lienzo. Varias hojas → varias páginas. |
| **Detección automática** | Filas de título encima de la tabla, **títulos de columna** (cabecera), **títulos de fila** (tablas cruzadas), tipos de columna (número, fecha, texto), columnas ID/año, formatos de moneda y porcentaje. Si los títulos de columna son periodos (meses, trimestres, años) se crea también la tabla **transpuesta**. |
| **Diseño automático** | KPIs con tendencia, evolución temporal, columnas, anillo, barras, dispersión, selector de filtro y tabla, sin repetir campos y sin mezclar escalas. |
| **Vista Editor** | Lienzo con cuadrícula, mover / redimensionar con 8 tiradores, guías inteligentes de alineación, ajuste a cuadrícula (Alt para desactivarlo), **alinear respecto a la página**, deshacer/rehacer, copiar/pegar/duplicar, orden de capas, zoom (selector, botones − / + y Ctrl + rueda sobre el lienzo). |
| **Panel de propiedades** | *Datos*: origen, eje, leyenda, valores, agregación (suma, promedio, recuento, distinto, mín., máx., mediana), agrupación de fechas, orden, Top N, objetivo. *Formato*: título, formato numérico/moneda/decimales, etiquetas, leyenda, cuadrícula, posición exacta. *Estilo*: ver «Maquetación». |
| **Visuales** | Columnas agrupadas y apiladas, barras, líneas, área, circular, anillo, mapa de árbol, dispersión, tarjeta KPI (con delta y minigráfico), medidor, tabla (ordenable, barras de datos, totales), selector de filtro (lista / única / mosaicos), cuadro de texto, imagen y **formas** (rectángulo, redondeado, elipse, triángulo, rombo, hexágono, flecha, cheurón, pestaña y línea, con texto opcional). |
| **Interactividad** | Filtrado cruzado al hacer clic en barras, sectores, filas o leyendas (Ctrl+clic suma selecciones), barra de filtros activos, tooltips en todos los gráficos, vista ampliada, «Ver datos» y exportación CSV por visual. |
| **Maquetación (pestaña Estilo)** | **10 estilos rápidos** (tarjeta, plana, elevada, contorno de acento, degradados, cristal, resplandor…) y «copiar estilo a toda la página». Relleno **sólido, degradado lineal (con ángulo) o radial** y transparencia; **borde** con grosor, color y trazo (continuo, guiones, puntos, doble); esquinas redondeadas; **6 sombras**; título (tamaño, color, alineación, negrita/cursiva); fuente y color del texto; **grosor de línea**, línea suavizada y marcadores; redondeo y ancho de barras; tamaño del agujero del anillo; opacidad del área; **colores libres por serie** con el selector de color HTML. **Fondo de página** sólido o degradado. |
| **Editor de datos** | Ver y editar celdas, renombrar columnas (los visuales se actualizan), cambiar tipos, añadir/eliminar filas y columnas, buscar, transponer, exportar. |
| **Columnas condicionales** | Crea columnas a partir de reglas «SI … ENTONCES … SI NO …» (como `SI.CONJUNTO`), evaluadas en orden. Condiciones combinables con **Y / O**; operadores por tipo: números (=, ≠, >, ≥, <, ≤, entre, fuera de), **fechas** (día, anterior/posterior, entre, año, mes, últimos N días, antes/después de hoy) y texto (igual, contiene, empieza/termina, uno de una lista; sin distinguir mayúsculas ni acentos), más vacío / no vacío. Cada valor puede ser fijo u **otra columna**; el resultado puede ser texto, número o fecha, un valor fijo, el de otra columna o vacío. Vista previa con recuento por regla. Se recalculan al editar datos y al abrir el proyecto, y una condicional puede usar otra anterior. |
| **Vista Presentador** | Cabecera con logo y título, navegación por páginas (← →), pantalla completa (F), filtros interactivos. |
| **Paletas de color** | 7 paletas para la herramienta y los gráficos: 4Dash (predeterminada), **Verde esmeralda**, **Azul eléctrico**, Corporativo marino, Atardecer, Violeta y Grafito y cian, todas validadas para daltonismo y contraste en claro y oscuro. Cualquier paleta se puede **personalizar con el selector de color HTML** (barra superior, color principal, acento y 8 colores de serie) con vista previa en vivo y comprobación de accesibilidad. Se guarda con el proyecto y se puede deshacer. |
| **Barra superior** | Cambio de vista Editor/Presentador, **espacio para el logo** de la empresa o cliente, paleta de colores, tema claro/oscuro y **botón ?** con tutorial paso a paso y atajos de teclado. |
| **Proyecto** | Autoguardado local (opcional), guardar/abrir proyecto `.4dash.json`, páginas múltiples (renombrar, duplicar, reordenar), tamaños de página, imprimir todas las páginas. |
| **Exportar (Ctrl+E)** | El dashboard **tal y como se ve en el Presentador** (cabecera con logo, título, página y fecha opcional; filtros activos) a **PNG** (1×, 2× o 3×), **SVG** vectorial o **PDF** (una hoja por página, del tamaño del lienzo). Página actual o todas, tema actual / claro / oscuro y vista previa. Sin librerías ni red. |
| **Zoom y pantallas pequeñas** | La barra de herramientas es una sola fila que oculta textos de forma progresiva (queda el icono con su descripción); los grupos que no caben pasan, con su texto, al panel **«Más»**, de modo que ningún control se pierde (verificado de 100 % a 500 % de zoom). La barra superior conserva todos sus iconos. Con mucho zoom del navegador los paneles laterales se pliegan y se abren flotando sobre el lienzo, y la barra superior se compacta. |
| **Accesibilidad** | Paleta categórica validada para daltonismo en claro y oscuro, colores estables por entidad, leyenda siempre con ≥ 2 series, iconos + texto en deltas, navegación por teclado, `prefers-reduced-motion`. |

## Estructura del proyecto

```
4dash/
├── dist/4dash.html          ← la herramienta (archivo único que se distribuye)
├── dist/4dash.html.sha256   ← su hash SHA-256 publicado
├── src/
│   ├── index.html           ← plantilla (CSP, estructura)
│   ├── styles.css           ← tokens de diseño propios (claro/oscuro)
│   └── js/
│       ├── 01-util.js       ← DOM seguro (sin innerHTML), iconos, formatos
│       ├── 02-parsers.js    ← lector XLSX/CSV, límites anti zip-bomb, detección de títulos
│       ├── 03-data.js       ← modelo, agregaciones, filtros, diseño automático
│       ├── 04-charts.js     ← motor de visuales SVG
│       ├── 05-ui.js         ← modales, menús, saneado de imágenes/proyectos, tutorial
│       ├── 06-app.js        ← estado, editor, paneles, estilos, páginas, persistencia
│       ├── 06b-export.js    ← exportación PNG / SVG / PDF
│       ├── 07-dataeditor.js ← editor de datos
│       ├── 07b-palettes.js  ← paletas de color y editor personalizado
│       ├── 07c-integrity.js ← comprobación de integridad y «Acerca de»
│       ├── 07d-calc.js      ← columnas condicionales (motor de reglas y editor)
│       └── 08-boot.js       ← arranque y atajos de teclado
├── samples/ejemplo_ventas.xlsx
├── tools/make_sample_xlsx.py  ← regenera el Excel de ejemplo (solo stdlib)
├── build.mjs                ← build sin dependencias (Node ≥ 18)
├── SECURITY.md              ← revisión OWASP
├── LICENSE                  ← licencia 4Dash (uso comercial con atribución)
├── THIRD_PARTY_NOTICES.md   ← avisos de terceros (iconos)
└── package.json
```

## Desarrollo

```bash
node build.mjs        # o: npm run build
```

Para comprobar que el archivo publicado no se ha alterado:

```bash
node build.mjs --check   # o: npm run check — dist/ coincide con src/, con sus hashes CSP y con dist/4dash.html.sha256
```

Quien reciba `4dash.html` puede comparar su SHA-256 con el de `dist/4dash.html.sha256`
(`certutil -hashfile 4dash.html SHA256` en Windows, `shasum -a 256 4dash.html` en macOS/Linux). La aplicación también
comprueba al arrancar que su código y estilos coinciden con las firmas SHA-256 de su CSP (*Ayuda → Acerca de e integridad*).

El build concatena `src/js/*.js` en orden, incrusta CSS y JS en `src/index.html`, calcula los **hashes SHA-256** para la
Content-Security-Policy y aborta si detecta APIs peligrosas (`innerHTML`, `eval`, `new Function`, `document.write`),
URLs externas o errores de sintaxis. **No edites `dist/4dash.html` a mano**: cualquier cambio invalida el hash y el
navegador bloqueará el script. Edita `src/` y vuelve a compilar.

## Atajos de teclado

| Atajo | Acción |
|---|---|
| Ctrl+Z / Ctrl+Y | Deshacer / rehacer |
| Supr | Eliminar visual |
| Ctrl+D, Ctrl+C / Ctrl+V | Duplicar, copiar / pegar visual |
| Flechas (Mayús = 10 px) | Mover visual |
| Ctrl+S / Ctrl+O / Ctrl+P | Guardar / abrir proyecto / imprimir |
| Ctrl+E | Exportar como PNG, SVG o PDF |
| Ctrl + rueda (sobre el lienzo) | Zoom del lienzo |
| F5 | Cambiar a Presentador |
| ← → · F · Esc | Páginas · pantalla completa · salir (Presentador) |
| F1 | Tutorial |

## Límites

30 MB por archivo, 100.000 filas y 300 columnas por hoja, 30 hojas, 3 millones de celdas. Los `.xls` antiguos (binarios)
no están soportados: guárdalos como `.xlsx` o CSV. Las fórmulas se leen por su último valor calculado.

## Licencia

© 2026 [Vex62](https://github.com/Vex62). 4Dash se distribuye bajo la **[Licencia 4Dash](LICENSE)**:

- **Uso no comercial**: libre (usar, copiar, modificar y distribuir) conservando el aviso de autoría.
- **Uso comercial**: permitido **solo citando clara y visiblemente al autor**, por ejemplo
  «Creado con 4Dash — © Vex62 (github.com/Vex62/4dash)», en el producto, su documentación o los entregables,
  sin eliminar los avisos de autoría y licencia.

Parte de los trazos de los iconos se basan en Feather Icons (MIT) y Lucide (ISC); ver
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Excel es una marca de Microsoft Corporation; 4Dash es un proyecto
independiente sin afiliación con Microsoft ni con otros fabricantes.
