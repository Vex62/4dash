# 4Dash

**4Dash** convierte un Excel en un dashboard interactivo, al estilo de Power BI, dentro de **un único archivo HTML autocontenido**:
sin servidor, sin instalación, sin librerías externas y sin conexiones de red. Todo se procesa en el navegador.

> Abre `dist/4dash.html` con Edge, Chrome, Firefox o Safari (versiones de 2023 en adelante). Nada más.

## Funcionalidades

| Área | Qué incluye |
|---|---|
| **Importación** | `.xlsx` / `.xlsm` (lector ZIP + XML propio) y `.csv` / `.tsv` (detecta separador y coma decimal). Arrastrar y soltar sobre el lienzo. Varias hojas → varias páginas. |
| **Detección automática** | Filas de título encima de la tabla, **títulos de columna** (cabecera), **títulos de fila** (tablas cruzadas), tipos de columna (número, fecha, texto), columnas ID/año, formatos de moneda y porcentaje. Si los títulos de columna son periodos (meses, trimestres, años) se crea también la tabla **transpuesta**. |
| **Diseño automático** | KPIs con tendencia, evolución temporal, columnas, anillo, barras, dispersión, segmentación y tabla, sin repetir campos y sin mezclar escalas. |
| **Vista Editor** | Lienzo con cuadrícula, mover / redimensionar con 8 tiradores, guías inteligentes de alineación, ajuste a cuadrícula (Alt para desactivarlo), deshacer/rehacer, copiar/pegar/duplicar, traer al frente/enviar atrás, zoom. |
| **Panel de propiedades** | *Datos*: origen, eje, leyenda, valores, agregación (suma, promedio, recuento, distinto, mín., máx., mediana), agrupación de fechas, orden, Top N, objetivo. *Formato*: título, formato numérico/moneda/decimales, etiquetas, leyenda, cuadrícula, color, fondo, posición exacta. |
| **Visuales** | Columnas agrupadas y apiladas, barras, líneas, área, circular, anillo, mapa de árbol, dispersión, tarjeta KPI (con delta y minigráfico), medidor, tabla (ordenable, barras de datos, totales), segmentación (lista / única / mosaicos), cuadro de texto e imagen. |
| **Interactividad** | Filtrado cruzado al hacer clic en barras, sectores, filas o leyendas (Ctrl+clic suma selecciones), barra de filtros activos, tooltips en todos los gráficos, modo foco, «Ver datos» y exportación CSV por visual. |
| **Editor de datos** | Ver y editar celdas, renombrar columnas (los visuales se actualizan), cambiar tipos, añadir/eliminar filas y columnas, buscar, transponer, exportar. |
| **Vista Presentador** | Cabecera con logo y título, navegación por páginas (← →), pantalla completa (F), filtros interactivos. |
| **Paletas de color** | 7 paletas para la herramienta y los gráficos: 4Dash (predeterminada), **Verde esmeralda**, **Azul eléctrico**, Corporativo marino, Atardecer, Violeta y Grafito y cian, todas validadas para daltonismo y contraste en claro y oscuro. Paleta **personalizada** con selector de color (barra superior, color principal, acento y 8 colores de serie), comprobación de accesibilidad en vivo y vista previa antes de aplicar. Se guarda con el proyecto y se puede deshacer. |
| **Barra superior** | Cambio de vista Editor/Presentador, **espacio para el logo** de la empresa o cliente, paleta de colores, tema claro/oscuro y **botón ?** con tutorial paso a paso y atajos de teclado. |
| **Proyecto** | Autoguardado local (opcional), guardar/abrir proyecto `.4dash.json`, páginas múltiples (renombrar, duplicar, reordenar), tamaños de página, **Imprimir / PDF** de todas las páginas. |
| **Accesibilidad** | Paleta categórica validada para daltonismo en claro y oscuro, colores estables por entidad, leyenda siempre con ≥ 2 series, iconos + texto en deltas, navegación por teclado, `prefers-reduced-motion`. |

## Estructura del proyecto

```
4dash/
├── dist/4dash.html          ← la herramienta (archivo único que se distribuye)
├── src/
│   ├── index.html           ← plantilla (CSP, estructura)
│   ├── styles.css           ← tokens de diseño (claro/oscuro) y estilos Fluent
│   └── js/
│       ├── 01-util.js       ← DOM seguro (sin innerHTML), iconos, formatos
│       ├── 02-parsers.js    ← lector XLSX/CSV, límites anti zip-bomb, detección de títulos
│       ├── 03-data.js       ← modelo, agregaciones, filtros, diseño automático
│       ├── 04-charts.js     ← motor de visuales SVG
│       ├── 05-ui.js         ← modales, menús, saneado de imágenes/proyectos, tutorial
│       ├── 06-app.js        ← estado, editor, paneles, páginas, persistencia
│       ├── 07-dataeditor.js ← editor de datos
│       ├── 07b-palettes.js  ← paletas de color y editor personalizado
│       └── 08-boot.js       ← arranque y atajos de teclado
├── samples/ejemplo_ventas.xlsx
├── tools/make_sample_xlsx.py  ← regenera el Excel de ejemplo (solo stdlib)
├── build.mjs                ← build sin dependencias (Node ≥ 18)
├── SECURITY.md              ← revisión OWASP
└── package.json
```

## Desarrollo

```bash
node build.mjs        # o: npm run build
```

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
| F5 | Cambiar a Presentador |
| ← → · F · Esc | Páginas · pantalla completa · salir (Presentador) |
| F1 | Tutorial |

## Límites

30 MB por archivo, 100.000 filas y 300 columnas por hoja, 30 hojas, 3 millones de celdas. Los `.xls` antiguos (binarios)
no están soportados: guárdalos como `.xlsx` o CSV. Las fórmulas se leen por su último valor calculado.
