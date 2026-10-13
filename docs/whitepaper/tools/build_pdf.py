#!/usr/bin/env python3
"""Render the local, review-only whitepaper with ReportLab. No network calls."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "WHITEPAPER.md"
OUTPUT = ROOT / "output" / "pdf" / "Solana_Classic_Whitepaper.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

FONT_ROOT = Path("/System/Library/Fonts/Supplemental")
for name, filename in (
    ("SCArial", "Arial.ttf"),
    ("SCArialBold", "Arial Bold.ttf"),
    ("SCArialItalic", "Arial Italic.ttf"),
    ("SCArialBoldItalic", "Arial Bold Italic.ttf"),
):
    pdfmetrics.registerFont(TTFont(name, str(FONT_ROOT / filename)))
pdfmetrics.registerFontFamily(
    "SCArial", normal="SCArial", bold="SCArialBold",
    italic="SCArialItalic", boldItalic="SCArialBoldItalic",
)
pdfmetrics.registerFont(TTFont("SCMono", "/System/Library/Fonts/Menlo.ttc", subfontIndex=0))

INK = colors.HexColor("#24271F")
PURPLE = colors.HexColor("#6842ED")
MUTED = colors.HexColor("#606457")
PAPER = colors.HexColor("#F7F5EE")
LIGHT_PURPLE = colors.HexColor("#ECE7FE")
LINE = colors.HexColor("#D9D9CD")
PAGE_W, PAGE_H = A4
MARGIN = 55
CONTENT_W = PAGE_W - 2 * MARGIN

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="BodySC", fontName="SCArial", fontSize=10.5, leading=15.4,
    textColor=INK, spaceAfter=9, allowWidows=0, allowOrphans=0,
))
styles.add(ParagraphStyle(
    name="SectionSC", fontName="SCArialBold", fontSize=18.5, leading=23,
    textColor=INK, spaceBefore=22, spaceAfter=12, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name="SubsectionSC", fontName="SCArialBold", fontSize=12.4, leading=17,
    textColor=PURPLE, spaceBefore=13, spaceAfter=8, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name="CellSC", fontName="SCArial", fontSize=9.2, leading=13.1,
    textColor=INK, alignment=TA_LEFT, spaceAfter=0,
))
styles.add(ParagraphStyle(
    name="HeadSC", fontName="SCArialBold", fontSize=9.2, leading=13.1,
    textColor=INK, alignment=TA_LEFT, spaceAfter=0,
))
styles.add(ParagraphStyle(
    name="RefSC", fontName="SCArial", fontSize=8.8, leading=13,
    textColor=MUTED, spaceAfter=8, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="ContentsSC", fontName="SCArial", fontSize=10.5, leading=17,
    textColor=INK, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="QuoteSC", fontName="SCArialItalic", fontSize=12.2, leading=18.2,
    textColor=INK, leftIndent=13, rightIndent=13, spaceBefore=4,
    spaceAfter=13, borderPadding=10, backColor=PAPER,
    allowWidows=0, allowOrphans=0,
))


def inline(text: str) -> str:
    text = html.escape(text.strip())
    text = re.sub(
        r"\[([^\]]+)\]\((https?://[^)]+)\)",
        lambda m: f'<link href="{m.group(2)}" color="#6842ED">{m.group(1)}</link>',
        text,
    )
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+)`", r'<font name="SCMono" size="8.6">\1</font>', text)
    return text


class Cover(Flowable):
    def __init__(self):
        super().__init__()
        self.width = CONTENT_W
        self.height = PAGE_H - 125

    def draw(self):
        c = self.canv
        top = self.height
        c.setFillColor(PURPLE)
        c.setFont("SCArialBold", 10)
        c.drawString(0, top - 22, "SOLANA CLASSIC / SOC")
        c.setFillColor(INK)
        c.setFont("SCArialBold", 39)
        c.drawString(0, top - 94, "Solana Classic")
        c.drawString(0, top - 140, "Whitepaper")
        c.setFont("SCArial", 18)
        c.drawString(0, top - 181, "A focused SVM home")
        c.drawString(0, top - 206, "for memes and NFTs")

        # Original geometric artwork reflects the app's Circle Face preset.
        cx, cy, radius = CONTENT_W - 103, top - 365, 86
        c.setFillColor(PURPLE)
        c.circle(cx, cy, radius, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.circle(cx - 29, cy + 10, 10, fill=1, stroke=0)
        c.circle(cx + 29, cy + 10, 10, fill=1, stroke=0)
        c.setStrokeColor(PAPER)
        c.setLineWidth(7)
        c.line(cx - 31, cy - 32, cx + 31, cy - 32)

        c.setFillColor(INK)
        c.setFont("SCArialBold", 20)
        c.drawString(0, top - 304, "Open to everyone.")
        c.drawString(0, top - 333, "Built for memes")
        c.drawString(0, top - 362, "and NFTs.")
        p = Paragraph(
            "Fresh independent genesis.<br/>One founder-operated validator.<br/>"
            "Valueless TEST and demo assets.<br/>Planned Pump-origin SOC on Solana.<br/>Future native SOC with 1:1 redemption.<br/>Bridge and mainnet unimplemented.",
            styles["BodySC"],
        )
        _, ph = p.wrap(260, 160)
        p.drawOn(c, 0, top - 470 - ph)

        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.line(0, 100, CONTENT_W, 100)
        c.setFillColor(PURPLE)
        c.setFont("SCArialBold", 10)
        c.drawString(0, 78, "DRAFT FOR FOUNDER REVIEW")
        c.setFillColor(MUTED)
        c.setFont("SCArial", 9.5)
        c.drawString(0, 58, "Version 0.4 | 13 October 2026")
        c.drawString(0, 40, "Frontend preview live. Original SOC, mainnet and bridge not launched.")
        c.drawString(0, 22, "Independent project. No Solana, Solana Labs or Anza affiliation implied.")


def decorate(canvas, doc):
    canvas.saveState()
    if doc.page == 1:
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    else:
        canvas.setFillColor(PAPER)
        canvas.rect(0, PAGE_H - 42, PAGE_W, 42, fill=1, stroke=0)
        canvas.setFont("SCArialBold", 8.2)
        canvas.setFillColor(PURPLE)
        canvas.drawString(MARGIN, PAGE_H - 26, "SOLANA CLASSIC / SOC")
        canvas.setFont("SCArial", 8.2)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 26, "WHITEPAPER 0.4")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 43, PAGE_W - MARGIN, 43)
        canvas.setFont("SCArial", 7.8)
        canvas.drawString(MARGIN, 29, "Draft for founder review | 13 October 2026")
        canvas.drawRightString(PAGE_W - MARGIN, 29, str(doc.page - 1))
    canvas.restoreState()


class Document(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=62, bottomMargin=59,
            title="Solana Classic Whitepaper",
            author="Solana Classic",
            subject="TEST devnet and Pump-origin SOC with proposed 1:1 native Classic redemption",
        )
        frame = Frame(
            self.leftMargin, self.bottomMargin, self.width, self.height,
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id="normal", frames=frame, onPage=decorate))

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "SectionSC":
            title = flowable.getPlainText()
            key = re.sub(r"\W+", "-", title).strip("-")
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title, key, level=0, closed=False)


def table(rows):
    count = len(rows[0])
    header = rows[0][0]
    if count == 4:
        widths = [122, 91, 99, CONTENT_W - 312]
    elif count == 3:
        widths = [103, 174, CONTENT_W - 277]
    elif header == "Gate":
        widths = [47, CONTENT_W - 47]
    elif header == "Question":
        widths = [136, CONTENT_W - 136]
    elif header == "Service":
        widths = [116, CONTENT_W - 116]
    else:
        widths = [123, CONTENT_W - 123]
    values = [
        [Paragraph(inline(cell), styles["HeadSC" if row_index == 0 else "CellSC"])
         for cell in row]
        for row_index, row in enumerate(rows)
    ]
    item = Table(values, colWidths=widths, repeatRows=1, hAlign="LEFT")
    item.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT_PURPLE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, PURPLE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    parts = [Spacer(1, 3), item, Spacer(1, 12)]
    return [KeepTogether(parts)] if len(rows) <= 5 else parts


def parse(text):
    lines = text.splitlines()
    result = []
    i = 0
    references = False
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("# "):
            i += 1
            continue
        if line == "## A focused SVM home for memes and NFTs":
            i += 1
            continue
        if line.startswith("**Solana Classic / SOC") or line.startswith("**Draft for founder") or line.startswith("**Open to everyone."):
            i += 1
            continue
        if line.startswith("## "):
            title = line[3:]
            references = title == "References"
            if references:
                result.append(PageBreak())
            result.append(Paragraph(inline(title), styles["SectionSC"]))
            i += 1
            continue
        if line.startswith("### "):
            result.append(Paragraph(inline(line[4:]), styles["SubsectionSC"]))
            i += 1
            continue
        if line.startswith("> "):
            quote = []
            while i < len(lines) and lines[i].strip().startswith("> "):
                quote.append(lines[i].strip()[2:])
                i += 1
            result.append(Paragraph(inline(" ".join(quote)), styles["QuoteSC"]))
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"[-: ]+", cell) for cell in cells):
                    rows.append(cells)
                i += 1
            result.extend(table(rows))
            continue
        group = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].strip().startswith(("#", "|")):
            # References remain separate paragraphs.
            if references and re.match(r"^\d+\. ", lines[i].strip()):
                break
            group.append(lines[i].strip())
            i += 1
        body = " ".join(group)
        if references:
            body = re.sub(
                r"(https?://\S+)",
                lambda m: f'<link href="{m.group(1)}" color="#6842ED">{m.group(1)}</link>',
                inline(body),
            )
            result.append(Paragraph(body, styles["RefSC"]))
        else:
            result.append(Paragraph(inline(body), styles["BodySC"]))
    return result


def main():
    raw = SOURCE.read_text(encoding="utf-8")
    assert "\u2011" not in raw and "\u2013" not in raw and "\u2014" not in raw
    headings = re.findall(r"^## (\d+ .+)$", raw, flags=re.MULTILINE)
    story = [Cover(), PageBreak(), Paragraph("Overview", styles["SectionSC"])]
    story.extend(parse(raw))
    doc = Document(str(OUTPUT))
    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    main()
