#!/usr/bin/env python3
import os, re, html
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                Preformatted, HRFlowable, ListFlowable, ListItem)

import os as _os; _HERE=_os.path.dirname(_os.path.abspath(__file__)); SRC=_os.path.join(_HERE,"COLLABORATOR_GUIDE.md")
OUT=_os.path.join(_HERE,"START HERE.pdf")
FONTDIR = None
import matplotlib
FONTDIR = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data/fonts/ttf")

pdfmetrics.registerFont(TTFont("DJ", f"{FONTDIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DJ-Bold", f"{FONTDIR}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DJ-It", f"{FONTDIR}/DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("DJ-BoldIt", f"{FONTDIR}/DejaVuSans-BoldOblique.ttf"))
pdfmetrics.registerFont(TTFont("DJMono", f"{FONTDIR}/DejaVuSansMono.ttf"))
pdfmetrics.registerFont(TTFont("DJMono-Bold", f"{FONTDIR}/DejaVuSansMono-Bold.ttf"))
pdfmetrics.registerFontFamily("DJ", normal="DJ", bold="DJ-Bold", italic="DJ-It", boldItalic="DJ-BoldIt")

NAVY = colors.HexColor("#1f3a5f")
body = ParagraphStyle("body", fontName="DJ", fontSize=10.5, leading=15, spaceAfter=6)
h1 = ParagraphStyle("h1", fontName="DJ-Bold", fontSize=20, leading=24, textColor=NAVY, spaceBefore=4, spaceAfter=10)
h2 = ParagraphStyle("h2", fontName="DJ-Bold", fontSize=14.5, leading=19, textColor=NAVY, spaceBefore=14, spaceAfter=6)
h3 = ParagraphStyle("h3", fontName="DJ-Bold", fontSize=12, leading=16, textColor=colors.HexColor("#33506e"), spaceBefore=9, spaceAfter=4)
quote = ParagraphStyle("quote", fontName="DJ-It", fontSize=10, leading=14, leftIndent=12, textColor=colors.HexColor("#444444"), spaceAfter=6)
listp = ParagraphStyle("listp", parent=body, leftIndent=14, spaceAfter=3)
codest = ParagraphStyle("code", fontName="DJMono", fontSize=8.3, leading=11, textColor=colors.HexColor("#222222"))
cellst = ParagraphStyle("cell", fontName="DJ", fontSize=9.2, leading=12.5)
cellhd = ParagraphStyle("cellhd", fontName="DJ-Bold", fontSize=9.2, leading=12.5, textColor=colors.white)

EMOJI = {"✅": "✓", "\U0001F389": "", "✨": "", "⚠️": "!", "⚠": "!"}

def deemoji(s):
    for k, v in EMOJI.items():
        s = s.replace(k, v)
    return s

def inline(t):
    t = deemoji(t)
    t = re.sub(r"<(https?://[^>]+)>", r"\1", t)          # autolinks
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", t)  # [text](url)
    t = html.escape(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"\*([^*\n]+?)\*", r"<i>\1</i>", t)
    t = re.sub(r"`([^`]+?)`", r'<font face="DJMono" size=9 color="#b5005a">\1</font>', t)
    return t

lines = open(SRC, encoding="utf-8").read().split("\n")
flow = []
i = 0
n = len(lines)

def code_block(txt):
    inner = Preformatted(deemoji(txt), codest)
    tbl = Table([[inner]], colWidths=[6.7 * inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f4f5f7")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d4da")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return tbl

while i < n:
    line = lines[i]
    s = line.strip()
    # fenced code
    if s.startswith("```"):
        i += 1
        buf = []
        while i < n and not lines[i].strip().startswith("```"):
            buf.append(lines[i]); i += 1
        i += 1
        flow.append(code_block("\n".join(buf)))
        flow.append(Spacer(1, 6))
        continue
    # table
    if "|" in line and i + 1 < n and re.match(r"^\s*\|?\s*:?-{2,}", lines[i + 1].replace(" ", "")) and "|" in lines[i + 1]:
        rows = []
        while i < n and "|" in lines[i] and lines[i].strip():
            rows.append(lines[i]); i += 1
        def cells(r):
            r = r.strip().strip("|")
            return [c.strip() for c in r.split("|")]
        header = cells(rows[0])
        data_rows = [cells(r) for r in rows[2:]]
        ncol = len(header)
        avail = 6.7 * inch
        widths = [avail / ncol] * ncol if ncol != 2 else [avail * 0.33, avail * 0.67]
        tdata = [[Paragraph(inline(c), cellhd) for c in header]]
        for dr in data_rows:
            dr = (dr + [""] * ncol)[:ncol]
            tdata.append([Paragraph(inline(c), cellst) for c in dr])
        tbl = Table(tdata, colWidths=widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6f9")]),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c7ccd4")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        flow.append(tbl); flow.append(Spacer(1, 8))
        continue
    # headings
    if s.startswith("### "):
        flow.append(Paragraph(inline(s[4:]), h3)); i += 1; continue
    if s.startswith("## "):
        flow.append(Paragraph(inline(s[3:]), h2)); i += 1; continue
    if s.startswith("# "):
        flow.append(Paragraph(inline(s[2:]), h1)); i += 1; continue
    # hr
    if s == "---":
        flow.append(Spacer(1, 4))
        flow.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#d0d4da")))
        flow.append(Spacer(1, 6)); i += 1; continue
    # blockquote
    if s.startswith(">"):
        buf = []
        while i < n and lines[i].strip().startswith(">"):
            buf.append(lines[i].strip()[1:].strip()); i += 1
        flow.append(Paragraph(inline(" ".join(buf)), quote)); continue
    # list item (-, *, or numbered) — gather lazy continuation (wrapped) lines
    m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
    if m:
        txt = m.group(3)
        i += 1
        while i < n:
            nl = lines[i]
            if (not nl.strip() or re.match(r"^\s*([-*]|\d+\.)\s+", nl)
                    or re.match(r"^\s*(#|>|```)", nl) or nl.strip() == "---" or "|" in nl):
                break
            txt += " " + nl.strip(); i += 1
        txt = re.sub(r"^\[[ xX]\]\s*", "", txt)  # checklist [ ]
        bullet = "&bull; " if m.group(2) in ("-", "*") else (m.group(2) + " ")
        flow.append(Paragraph(bullet + inline(txt), listp)); continue
    # blank
    if not s:
        i += 1; continue
    # paragraph (gather consecutive plain lines)
    buf = [line]
    i += 1
    while i < n and lines[i].strip() and not re.match(r"^(#|>|```|\s*[-*]\s|\s*\d+\.\s)", lines[i]) and "|" not in lines[i] and lines[i].strip() != "---":
        buf.append(lines[i]); i += 1
    flow.append(Paragraph(inline(" ".join(x.strip() for x in buf)), body))

doc = SimpleDocTemplate(OUT, pagesize=letter, leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                        topMargin=0.8 * inch, bottomMargin=0.8 * inch, title="Collaborator Guide")
doc.build(flow)
print("wrote", OUT)
