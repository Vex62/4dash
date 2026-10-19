"""Genera samples/datos_dummy.xlsx (solo biblioteca estándar) con 4 hojas de datos ficticios:

- Ventas: 600 pedidos con fecha, región, país, canal, categoría, producto, cliente,
  comercial, unidades, precio, importe, coste, margen y descuento.
- Empleados: 120 empleados con departamento, puesto, sede, fecha de alta, salario,
  antigüedad, evaluación y teletrabajo.
- Proyectos: 40 proyectos (seguimiento de proyectos) con estado, prioridad, horas, presupuesto y avance.
- Presupuesto mensual: tabla cruzada con departamentos en filas y meses en columnas.
"""
import random
import zipfile
from datetime import date, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "samples" / "datos_dummy.xlsx"
random.seed(2026)

strings: list[str] = []
sindex: dict[str, int] = {}


def sidx(s: str) -> int:
    if s not in sindex:
        sindex[s] = len(strings)
        strings.append(s)
    return sindex[s]


def col(n: int) -> str:
    out, n = "", n + 1
    while n:
        n, r = divmod(n - 1, 26)
        out = chr(65 + r) + out
    return out


# Estilos: 0 general, 1 fecha, 2 moneda, 3 porcentaje, 4 cabecera en negrita, 5 título
def cell(r: int, c: int, v, style: int = 0) -> str:
    ref = f"{col(c)}{r}"
    if v is None:
        return ""
    st = f' s="{style}"' if style else ""
    if isinstance(v, str):
        return f'<c r="{ref}" t="s"{st}><v>{sidx(v)}</v></c>'
    if isinstance(v, date):
        return f'<c r="{ref}" s="1"><v>{(v - date(1899, 12, 30)).days}</v></c>'
    if isinstance(v, bool):
        return f'<c r="{ref}" t="b"{st}><v>{int(v)}</v></c>'
    return f'<c r="{ref}"{st}><v>{v}</v></c>'


def sheet(rows: list[list], styles: dict[int, int] | None = None, header_row: int = 1, widths: int = 14) -> str:
    styles = styles or {}
    out = []
    for i, row in enumerate(rows, start=1):
        cells = []
        for j, v in enumerate(row):
            s = 4 if i == header_row else (5 if i < header_row else styles.get(j, 0))
            cells.append(cell(i, j, v, s))
        out.append(f'<row r="{i}">{"".join(cells)}</row>')
    ncols = max(len(r) for r in rows)
    cols = f'<cols><col min="1" max="{ncols}" width="{widths}" customWidth="1"/></cols>'
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'{cols}<sheetData>{"".join(out)}</sheetData></worksheet>')


def rdate(y0: date, days: int) -> date:
    return y0 + timedelta(days=random.randint(0, days))


# ---------- Hoja 1: Ventas ----------
regiones = {"Norte": ["España", "Francia"], "Sur": ["España", "Portugal"], "Este": ["Italia", "Alemania"],
            "Oeste": ["Portugal", "España"], "Centro": ["España", "Alemania"]}
catalogo = {
    "Hardware": [("Portátil Pro 14", 1150), ("Monitor 27\" 4K", 420), ("Dock USB-C", 180), ("Teclado inalámbrico", 65)],
    "Software": [("Licencia ERP", 890), ("Suite Ofimática", 120), ("Antivirus Empresa", 45), ("CRM Cloud (anual)", 600)],
    "Servicios": [("Soporte 24/7", 1500), ("Consultoría (jornada)", 750), ("Implantación", 3200)],
    "Formación": [("Curso de análisis de datos", 450), ("Taller de hojas de cálculo", 280), ("Certificación en la nube", 990)],
}
canales = ["Online", "Tienda", "Partner", "Venta directa"]
clientes = [f"{n} {s}" for n, s in [("Acme", "S.L."), ("Globex", "S.A."), ("Initech", "S.L."), ("Umbrella", "Corp."),
            ("Hooli", "S.A."), ("Stark", "Industries"), ("Wayne", "Enterprises"), ("Soylent", "S.L."),
            ("Tyrell", "Corp."), ("Cyberdyne", "S.A."), ("Wonka", "S.L."), ("Vandelay", "Imports")]]
comerciales = ["Ana García", "Luis Martín", "Marta López", "Jorge Sánchez", "Sofía Pérez", "Raúl Gómez", "Elena Ruiz", "Pablo Díaz"]
peso_region = {"Norte": 1.2, "Sur": 0.85, "Este": 1.0, "Oeste": 0.9, "Centro": 1.4}

ventas = [["Informe comercial · Datos ficticios 2024-2025"], [],
          ["Nº pedido", "Fecha", "Región", "País", "Canal", "Categoría", "Producto", "Cliente", "Comercial",
           "Unidades", "Precio unitario (€)", "Importe (€)", "Coste (€)", "Margen (€)", "Descuento %", "Pagado"]]
for n in range(600):
    f = rdate(date(2024, 1, 1), 729)
    reg = random.choices(list(regiones), weights=[peso_region[r] for r in regiones])[0]
    cat = random.choices(list(catalogo), weights=[4, 3, 2, 1.5])[0]
    prod, precio = random.choice(catalogo[cat])
    uds = max(1, int(random.expovariate(1 / (12 if cat in ("Hardware", "Software") else 3))))
    estacional = 1 + 0.2 * (f.month in (3, 6, 11, 12)) + 0.1 * (f.year == 2025)
    p = round(precio * random.uniform(0.92, 1.08), 2)
    dto = random.choice([0, 0, 0, 0.05, 0.1, 0.15])
    imp = round(uds * p * (1 - dto) * estacional * peso_region[reg] / 1.1, 2)
    coste = round(imp * random.uniform(0.45, 0.75), 2)
    ventas.append([10000 + n, f, reg, random.choice(regiones[reg]), random.choice(canales), cat, prod,
                   random.choice(clientes), random.choice(comerciales), uds, p, imp, coste, round(imp - coste, 2),
                   dto, random.random() > 0.12])
ventas_xml = sheet(ventas, {10: 2, 11: 2, 12: 2, 13: 2, 14: 3}, header_row=3)

# ---------- Hoja 2: Empleados ----------
deps = {"Ventas": ["Comercial", "Key Account", "Director comercial"], "Tecnología": ["Desarrollador", "DevOps", "Arquitecto", "QA"],
        "Marketing": ["Analista", "Diseñador", "Community manager"], "Finanzas": ["Contable", "Controller", "Analista financiero"],
        "RR. HH.": ["Técnico de selección", "HR Business Partner"], "Operaciones": ["Técnico", "Jefe de equipo", "Logística"]}
sedes = ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao", "Remoto"]
nombres = ["Lucía", "Hugo", "Martina", "Mateo", "Paula", "Daniel", "Carla", "Álvaro", "Noa", "Adrián", "Vega", "Leo",
           "Irene", "Marcos", "Julia", "Iván", "Alba", "Diego", "Nerea", "Sergio"]
apellidos = ["García", "Fernández", "González", "Rodríguez", "López", "Martínez", "Sánchez", "Pérez", "Romero", "Navarro",
             "Torres", "Domínguez", "Vázquez", "Ramos", "Gil", "Serrano"]
emp = [["ID empleado", "Nombre", "Departamento", "Puesto", "Sede", "Género", "Fecha de alta", "Salario anual (€)",
        "Antigüedad (años)", "Evaluación (1-5)", "Horas formación", "Teletrabajo"]]
for i in range(120):
    d = random.choice(list(deps))
    alta = rdate(date(2012, 1, 1), 4900)
    ant = round((date(2025, 12, 31) - alta).days / 365.25, 1)
    base = {"Tecnología": 42000, "Finanzas": 38000, "Ventas": 34000, "Marketing": 32000, "RR. HH.": 31000, "Operaciones": 28000}[d]
    emp.append([f"E{1000 + i}", f"{random.choice(nombres)} {random.choice(apellidos)}", d, random.choice(deps[d]),
                random.choice(sedes), random.choice(["Mujer", "Hombre"]), alta,
                round(base * random.uniform(0.85, 1.6) + ant * 600, -2), ant, round(random.triangular(2.5, 5, 3.8), 1),
                random.randint(0, 80), random.choice(["Sí", "No", "Híbrido"])])
emp_xml = sheet(emp, {7: 2})

# ---------- Hoja 3: Proyectos (seguimiento de proyectos) ----------
estados = ["Nuevo", "Activo", "En revisión", "Bloqueado", "Cerrado"]
proy = [["Proyecto", "Área", "Responsable", "Estado", "Prioridad", "Fecha inicio", "Fecha fin prevista",
         "Horas estimadas", "Horas reales", "Presupuesto (€)", "Gasto (€)", "Avance %", "Bugs abiertos"]]
for i in range(40):
    ini = rdate(date(2024, 6, 1), 500)
    est = random.choices(estados, weights=[1, 4, 2, 1, 3])[0]
    hest = random.randint(80, 1200)
    avance = 1.0 if est == "Cerrado" else round(random.uniform(0, 0.15) if est == "Nuevo" else random.uniform(0.2, 0.95), 2)
    pres = round(hest * random.uniform(45, 70), -2)
    proy.append([f"PRJ-{100 + i} {random.choice(['Portal', 'App móvil', 'Migración', 'Data Lake', 'CRM', 'Intranet', 'API', 'BI'])}",
                 random.choice(list(deps)), random.choice(comerciales), est, random.choice(["1 - Crítica", "2 - Alta", "3 - Media", "4 - Baja"]),
                 ini, ini + timedelta(days=random.randint(30, 270)), hest, round(hest * avance * random.uniform(0.8, 1.3)),
                 pres, round(pres * avance * random.uniform(0.85, 1.25), 2), avance, 0 if est == "Cerrado" else random.randint(0, 25)])
proy_xml = sheet(proy, {9: 2, 10: 2, 11: 3})

# ---------- Hoja 4: Presupuesto mensual (tabla cruzada) ----------
meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
pres_m = [["Departamento", *meses]]
for d in deps:
    base = random.randint(30, 90) * 1000
    pres_m.append([d, *[round(base * (1 + 0.03 * k) * random.uniform(0.9, 1.12) * (0.7 if k == 7 else 1)) for k in range(12)]])
pres_xml = sheet(pres_m, {j: 2 for j in range(1, 13)})

# ---------- Ensamblado del .xlsx ----------
sheets = [("Ventas", ventas_xml), ("Empleados", emp_xml), ("Proyectos", proy_xml), ("Presupuesto mensual", pres_xml)]
NS = "http://schemas.openxmlformats.org"
sst = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="{NS}/spreadsheetml/2006/main" '
       f'count="{len(strings)}" uniqueCount="{len(strings)}">' + "".join(f"<si><t>{escape(s)}</t></si>" for s in strings) + "</sst>")
styles = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="{NS}/spreadsheetml/2006/main">'
          '<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>'
          '<numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>'
          '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>'
          '<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>'
          '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
          '<fill><patternFill patternType="solid"><fgColor rgb="FFDEECF9"/></patternFill></fill></fills>'
          '<borders count="1"><border/></borders>'
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
          '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
          '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
          '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
          '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
          '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
          '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>')
workbook = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="{NS}/spreadsheetml/2006/main" '
            f'xmlns:r="{NS}/officeDocument/2006/relationships"><sheets>'
            + "".join(f'<sheet name="{escape(n)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, (n, _) in enumerate(sheets))
            + "</sheets></workbook>")
rel = f"{NS}/officeDocument/2006/relationships"
wb_rels = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{NS}/package/2006/relationships">'
           + "".join(f'<Relationship Id="rId{i + 1}" Type="{rel}/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(sheets)))
           + f'<Relationship Id="rId90" Type="{rel}/sharedStrings" Target="sharedStrings.xml"/>'
           + f'<Relationship Id="rId91" Type="{rel}/styles" Target="styles.xml"/></Relationships>')
ct_main = "application/vnd.openxmlformats-officedocument.spreadsheetml"
content_types = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="{NS}/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="xml" ContentType="application/xml"/>'
                 f'<Override PartName="/xl/workbook.xml" ContentType="{ct_main}.sheet.main+xml"/>'
                 + "".join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="{ct_main}.worksheet+xml"/>' for i in range(len(sheets)))
                 + f'<Override PartName="/xl/sharedStrings.xml" ContentType="{ct_main}.sharedStrings+xml"/>'
                 + f'<Override PartName="/xl/styles.xml" ContentType="{ct_main}.styles+xml"/></Types>')
root_rels = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{NS}/package/2006/relationships">'
             f'<Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>')

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", root_rels)
    z.writestr("xl/workbook.xml", workbook)
    z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
    for i, (_, xml) in enumerate(sheets):
        z.writestr(f"xl/worksheets/sheet{i + 1}.xml", xml)
    z.writestr("xl/sharedStrings.xml", sst)
    z.writestr("xl/styles.xml", styles)
print(f"OK {OUT} · {len(ventas) - 3} ventas, {len(emp) - 1} empleados, {len(proy) - 1} proyectos, {len(pres_m) - 1} departamentos")
