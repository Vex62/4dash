"""Genera samples/ejemplo_ventas.xlsx usando solo la biblioteca estándar.

Hoja 1 "Ventas": fila de título, cabecera, fechas con formato de fecha,
cadenas compartidas y números.
Hoja 2 "Resumen mensual": tabla cruzada con títulos de fila (regiones)
y meses como títulos de columna.
"""
import random
import zipfile
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "samples" / "ejemplo_ventas.xlsx"
random.seed(7)

strings: list[str] = []
index: dict[str, int] = {}


def sidx(s: str) -> int:
    if s not in index:
        index[s] = len(strings)
        strings.append(s)
    return index[s]


def col(n: int) -> str:
    out = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        out = chr(65 + r) + out
    return out


def cell(r: int, c: int, v, style: int = 0) -> str:
    ref = f"{col(c)}{r}"
    if v is None:
        return ""
    if isinstance(v, str):
        return f'<c r="{ref}" t="s"><v>{sidx(v)}</v></c>'
    if isinstance(v, date):
        serial = (v - date(1899, 12, 30)).days
        return f'<c r="{ref}" s="1"><v>{serial}</v></c>'
    return f'<c r="{ref}"{f" s=\"{style}\"" if style else ""}><v>{v}</v></c>'


def sheet_xml(rows: list[list]) -> str:
    body = []
    for i, row in enumerate(rows, start=1):
        cells = "".join(cell(i, j, v) for j, v in enumerate(row))
        body.append(f'<row r="{i}">{cells}</row>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(body)}</sheetData></worksheet>')


regions = ["Norte", "Sur", "Este", "Oeste", "Centro"]
products = {"Hardware": 380, "Software": 120, "Servicios": 640}
rows1 = [["Informe comercial 2025"], [], ["Fecha", "Región", "Línea", "Comercial", "Unidades", "Importe", "Descuento %"]]
sellers = ["Ana", "Luis", "Marta", "Jorge", "Sofía", "Raúl"]
for _ in range(300):
    d = date(2025, random.randint(1, 12), random.randint(1, 28))
    line = random.choice(list(products))
    units = random.randint(1, 20)
    rows1.append([d, random.choice(regions), line, random.choice(sellers), units,
                  round(units * products[line] * random.uniform(0.8, 1.3), 2), round(random.uniform(0, 0.2), 3)])

months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
rows2 = [["Región", *months]]
for r in regions:
    base = random.randint(20, 60) * 1000
    rows2.append([r, *[round(base * (1 + 0.04 * i) * random.uniform(0.9, 1.1)) for i in range(12)]])

s1, s2 = sheet_xml(rows1), sheet_xml(rows2)
sst = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
       f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}" uniqueCount="{len(strings)}">'
       + "".join(f"<si><t>{escape(s)}</t></si>" for s in strings) + "</sst>")
styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
          '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
          '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
          '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
          '<borders count="1"><border/></borders>'
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
          '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
          '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
          '</styleSheet>')
workbook = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Ventas" sheetId="1" r:id="rId1"/><sheet name="Resumen mensual" sheetId="2" r:id="rId2"/></sheets></workbook>')
wb_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
           '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
           '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
           '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
           '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
           '</Relationships>')
content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="xml" ContentType="application/xml"/>'
                 '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                 '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                 '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                 '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
                 '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                 '</Types>')
root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
             '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
             '</Relationships>')

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", root_rels)
    z.writestr("xl/workbook.xml", workbook)
    z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
    z.writestr("xl/worksheets/sheet1.xml", s1)
    z.writestr("xl/worksheets/sheet2.xml", s2)
    z.writestr("xl/sharedStrings.xml", sst)
    z.writestr("xl/styles.xml", styles)
print(f"OK {OUT}")
