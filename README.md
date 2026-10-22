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
| **Exportar (Ctrl+E)** | El dashboard **tal y como se ve en el Presentador** (cabecera con logo, título, página y fecha opcional; filtros activos) a **PNG** (1×, 2× o 3×), **SVG** vectorial o **PDF** (una hoja por página, del tamaño del lienzo). Página actual o todas, tema actual / claro / oscuro y vista previa. Y a **Power BI**: un proyecto `.pbip` con modelo, medidas, columnas condicionales, páginas, visuales y tema (ver «Novedades de la v1.4»). Sin librerías ni red. |
| **Zoom y pantallas pequeñas** | La barra de herramientas es una sola fila que oculta textos de forma progresiva (queda el icono con su descripción); los grupos que no caben pasan, con su texto, al panel **«Más»**, de modo que ningún control se pierde (verificado de 100 % a 500 % de zoom). La barra superior conserva todos sus iconos. Con mucho zoom del navegador los paneles laterales se pliegan y se abren flotando sobre el lienzo, y la barra superior se compacta. |
| **Accesibilidad** | Paleta categórica validada para daltonismo en claro y oscuro, colores estables por entidad, leyenda siempre con ≥ 2 series, iconos + texto en deltas, navegación por teclado, `prefers-reduced-motion`. |

## Novedades de la v1.4: exportación a Power BI

**Exportar → Power BI** descarga un `.zip` con el dashboard convertido en un **proyecto de Power BI (PBIP)**: el formato
de proyecto abierto que Microsoft documenta públicamente, con el modelo semántico en **TMDL** y el informe en **PBIR**
(JSON con esquemas públicos). Se genera entero en el navegador, sin conexión, así que 4Dash sigue siendo un único HTML
autocontenido.

1. Descomprime el `.zip` y abre `<proyecto>.pbip` con **Power BI Desktop** de agosto de 2025 o posterior. Si tu versión es
   anterior a la disponibilidad general de PBIR, activa en *Opciones → Características en versión preliminar* el guardado
   como proyecto de Power BI (.pbip) y el formato de informe mejorado (PBIR).
2. Pulsa **Actualizar** para cargar los datos en el modelo.
3. Si necesitas un único archivo, **Archivo → Guardar como → .pbix**.

| 4Dash | Power BI |
|---|---|
| Origen de datos | Tabla del modelo con los datos **incrustados** (consulta Power Query con el JSON comprimido, como «Escribir datos»). Los orígenes muy grandes viajan como CSV en la carpeta `datos/` y se leen desde el parámetro `CarpetaDatos`. |
| Agregaciones (suma, promedio, recuento, distinto, mín., máx., mediana) | **Medidas DAX** con su formato (moneda, porcentaje, decimales). |
| Columnas condicionales | **Columnas calculadas DAX** (`SWITCH(TRUE(), …)`); «hoy» y «últimos N días» usan `TODAY()`. |
| Agrupación de fechas (año, trimestre, mes, día) | Columnas calculadas de periodo, ordenadas cronológicamente. |
| Columnas, apiladas, barras, líneas, área, circular, anillo, árbol, dispersión | Los visuales nativos equivalentes, con orden, Top N, etiquetas, leyenda, colores y grosor/suavizado de línea. |
| KPI · medidor · tabla · selector | KPI con tendencia y objetivo (tarjeta si no hay eje temporal) · medidor con máximo y objetivo · matriz o tabla · segmentación. |
| Texto · imagen · formas | Cuadro de texto (títulos y viñetas) · imagen incrustada · forma con relleno, contorno y texto. |
| Páginas, posiciones, tamaño de lienzo, títulos, fondos, bordes, esquinas y sombras | Igual. |
| Paleta | Tema personalizado del informe. |
| Filtros activos | Filtros del informe. |

Lo que no tiene equivalente exacto se aproxima y se explica en el `LEEME.txt` del paquete: degradados (primer color),
barras de datos de las tablas, objetivo de las tarjetas sin eje temporal, colores personalizados por valor de leyenda y
la agrupación «Otros» de los gráficos circulares. Las comparaciones de texto de las reglas en Power BI no distinguen
mayúsculas, pero sí acentos. El formato `.pbix` binario no se genera: su modelo de datos es un formato cerrado sin
documentación pública.

## Novedades de la v1.3: columnas condicionales

Crea columnas nuevas interpretando los datos cargados, sin fórmulas: por ejemplo, clasificar cada fila según si su fecha
supera un valor o cae entre dos fechas.

1. Abre **Ver / editar datos** y pulsa **Columna condicional**.
2. Escribe el nombre de la columna y elige el tipo de resultado (texto, número o fecha).
3. Define las reglas. Cada una tiene una o varias condiciones, unidas con **Y** (todas) u **O** (alguna), y un resultado.
   Las reglas se comprueban en orden: cada fila toma el resultado de la **primera** que cumple y, si no cumple ninguna,
   el de **«En otro caso»**.
4. Revisa la **vista previa** (filas que cumple cada regla y una muestra) y pulsa **Crear columna** y después
   **Aplicar cambios**. La columna aparece en el panel de campos y se usa como cualquier otra en visuales y filtros.

| Tipo de columna | Operadores |
|---|---|
| Fecha | es el día, no es el día, posterior a, igual o posterior a, anterior a, igual o anterior a, entre (incluidas), no entre, del año, del mes, en los últimos N días, anterior a hoy, posterior a hoy |
| Número | =, ≠, >, ≥, <, ≤, entre (incluidos), no entre |
| Texto | es igual a, no es igual a, contiene, no contiene, empieza por, termina en, es uno de (`Norte; Sur`); sin distinguir mayúsculas ni acentos |
| Todas | está vacío, no está vacío |

Cada valor de comparación puede ser fijo u **otra columna**, y el resultado puede ser un valor fijo, el valor de otra
columna o vacío. Ejemplos:

| Nueva columna | Regla | Resultado | En otro caso |
|---|---|---|---|
| Temporada | `Fecha` está entre 01/03/2025 y 31/05/2025 **Y** `Ventas (€)` es mayor que 3.000 | `Primavera` | `Resto` |
| Estado de entrega | `Fecha entrega` es posterior a la columna `Fecha prevista` | `Con retraso` | `A tiempo` |
| Reciente | `Fecha` está en los últimos 30 días | `Sí` | `No` |
| Zona | `Región` es uno de `Norte; Sur` | columna `Canal` | (vacío) |

Las celdas calculadas son de solo lectura y se recalculan al editar los datos y al abrir el proyecto, así que
«últimos N días» y «hoy» usan siempre la fecha actual. Al renombrar una columna, las reglas que la usan se actualizan
solas, y no se puede eliminar una columna mientras alguna regla la use. Una columna condicional puede usar otra creada
antes que ella. Las reglas se interpretan, nunca se ejecutan como código: ver la sección «Revisión de la versión 1.3»
de [SECURITY.md](SECURITY.md).

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
│       ├── 06c-powerbi.js   ← exportación a Power BI (PBIP: TMDL + PBIR) y escritor ZIP
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
| Ctrl+E | Exportar como PNG, SVG, PDF o proyecto de Power BI |
| Ctrl + rueda (sobre el lienzo) | Zoom del lienzo |
| F5 | Cambiar a Presentador |
| ← → · F · Esc | Páginas · pantalla completa · salir (Presentador) |
| F1 | Tutorial |

## Límites

30 MB por archivo, 100.000 filas y 300 columnas por hoja, 30 hojas, 3 millones de celdas. Los `.xls` antiguos (binarios)
no están soportados: guárdalos como `.xlsx` o CSV. Las fórmulas se leen por su último valor calculado.
Columnas condicionales: hasta 40 por origen de datos, 30 reglas por columna y 10 condiciones por regla.

## Licencia

© 2026 [Vex62](https://github.com/Vex62). 4Dash se distribuye bajo la **[Licencia 4Dash](LICENSE)**:

- **Uso no comercial**: libre (usar, copiar, modificar y distribuir) conservando el aviso de autoría.
- **Uso comercial**: permitido **solo citando clara y visiblemente al autor**, por ejemplo
  «Creado con 4Dash — © Vex62 (github.com/Vex62/4dash)», en el producto, su documentación o los entregables,
  sin eliminar los avisos de autoría y licencia.

Parte de los trazos de los iconos se basan en Feather Icons (MIT) y Lucide (ISC); ver
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Excel y Power BI son marcas de Microsoft Corporation; 4Dash es un proyecto
independiente sin afiliación con Microsoft ni con otros fabricantes.
