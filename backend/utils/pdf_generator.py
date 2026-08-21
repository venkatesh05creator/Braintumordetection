"""PDF report generator — renders clinical scan reports as shareable PDFs.

Uses ReportLab with the bundled Bitstream Vera fonts for broad Unicode
coverage (Greek symbols, curly quotes, etc.). Emoji and control characters
that the fonts cannot render are stripped or replaced with safe equivalents.
"""

import logging
import re
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

# ── Fonts (bundled with reportlab — broad Unicode support) ───────────────────

_FONT = "Helvetica"
_FONT_BOLD = "Helvetica-Bold"
_FONT_MONO = "Courier"

try:
    from reportlab.lib.fonts import addMapping
    from pathlib import Path

    _font_dir = Path(__file__).resolve().parent.parent / ".venv" / "Lib" / "site-packages" / "reportlab" / "fonts"
    if not _font_dir.exists():
        import reportlab
        _font_dir = Path(reportlab.__file__).resolve().parent / "fonts"

    if (_font_dir / "Vera.ttf").exists():
        pdfmetrics.registerFont(TTFont("Vera", str(_font_dir / "Vera.ttf")))
        pdfmetrics.registerFont(TTFont("Vera-Bold", str(_font_dir / "VeraBd.ttf")))
        pdfmetrics.registerFont(TTFont("Vera-Italic", str(_font_dir / "VeraIt.ttf")))
        addMapping("Vera", 0, 0, "Vera")
        addMapping("Vera", 1, 0, "Vera-Bold")
        addMapping("Vera", 0, 1, "Vera-Italic")
        addMapping("Vera", 1, 1, "Vera-Bold")
        _FONT = "Vera"
        _FONT_BOLD = "Vera-Bold"
except Exception as exc:  # pragma: no cover - font registration is best-effort
    logger.warning("Vera fonts unavailable, falling back to Helvetica: %s", exc)

# ── Sanitization ──────────────────────────────────────────────────────────────

_SAFE_CHARS = re.compile(r"[^\x20-\x7E\u00A0-\u024F\u0391-\u03C9\u2010-\u2027\u2030-\u205E]")


def _sanitize(text: str) -> str:
    """Strip characters the base fonts cannot render, replacing common emoji."""
    if not text:
        return ""
    text = (
        text.replace("⚠️", "[!]")
        .replace("⚠", "[!]")
        .replace("🧠", "Brain")
        .replace("✅", "[OK]")
        .replace("❌", "[X]")
        .replace("📄", "Report")
        .replace("🔔", "Alert")
        .replace("🚨", "[ALERT]")
        .replace("→", "->")
        .replace("←", "<-")
        .replace("Δ", "delta ")
        .replace("≈", "~")
        .replace("±", "+/-")
        .replace("⁰", "0")
        .replace("¹", "1")
        .replace("²", "2")
        .replace("³", "3")
        .replace("×", "x")
        .replace("…", "...")
        .replace("\u00A0", " ")
    )
    return _SAFE_CHARS.sub("", text)


# ── Styles ────────────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName=_FONT_BOLD, fontSize=20,
            leading=24, textColor=colors.HexColor("#0B5E4F"), spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", parent=base["Normal"], fontName=_FONT, fontSize=9,
            leading=12, textColor=colors.HexColor("#5A6472"), alignment=TA_CENTER,
        ),
        "section": ParagraphStyle(
            "Section", parent=base["Heading2"], fontName=_FONT_BOLD, fontSize=12,
            leading=15, textColor=colors.HexColor("#0F1226"), spaceBefore=10, spaceAfter=4,
        ),
        "label": ParagraphStyle(
            "Label", parent=base["Normal"], fontName=_FONT_BOLD, fontSize=8,
            leading=10, textColor=colors.HexColor("#8A93A6"), uppercase=True,
        ),
        "value": ParagraphStyle(
            "Value", parent=base["Normal"], fontName=_FONT_BOLD, fontSize=9.5,
            leading=12, textColor=colors.HexColor("#0F1226"),
        ),
        "body": ParagraphStyle(
            "Body", parent=base["Normal"], fontName=_FONT, fontSize=9.5,
            leading=14, textColor=colors.HexColor("#1A2233"), alignment=TA_JUSTIFY,
            spaceAfter=6, wordWrap="CJK",
        ),
        "footer": ParagraphStyle(
            "Footer", parent=base["Normal"], fontName=_FONT, fontSize=7.5,
            leading=10, textColor=colors.HexColor("#8A93A6"), alignment=TA_CENTER,
        ),
        "disclaimer": ParagraphStyle(
            "Disclaimer", parent=base["Normal"], fontName=_FONT, fontSize=8,
            leading=11, textColor=colors.HexColor("#8A6210"), alignment=TA_JUSTIFY,
        ),
    }


def _summary_table(rows, styles) -> Table:
    """Two-column label/value table for the summary block."""
    data = []
    for label, value in rows:
        data.append([
            Paragraph(f"<b>{_sanitize(label)}</b>", styles["label"]),
            Paragraph(_sanitize(str(value or "—")), styles["value"]),
        ])
    table = Table(data, colWidths=[45 * mm, 120 * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#E3E7EF")),
    ]))
    return table


def _footer(canvas, doc):
    """Page footer with platform name + page number."""
    canvas.saveState()
    canvas.setFont(_FONT, 7.5)
    canvas.setFillColor(colors.HexColor("#8A93A6"))
    canvas.drawString(20 * mm, 12 * mm, "NeuroScan AI — Clinical Decision Support")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _build_pdf(payload: dict) -> bytes:
    """
    Build the report PDF from a dict with keys:
      report_id, scan_id, patient_name, generated_by, created_at,
      tumor_type, confidence, agreement_level, risk_level, uncertainty_flag,
      body (the report text), version_label, is_fallback
    Returns PDF bytes.
    """
    st = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title=f"NeuroScan AI Diagnostic Report {payload.get('report_id', '')}",
        author="NeuroScan AI",
    )

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Paragraph("NeuroScan AI", st["title"]))
    story.append(Paragraph(
        f"AI-Assisted Diagnostic Report · {_sanitize(payload.get('version_label', ''))} · "
        f"Generated {datetime.fromisoformat(payload['created_at']).strftime('%d %b %Y, %H:%M')}",
        st["subtitle"],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=1.4, color=colors.HexColor("#00BFA5")))
    story.append(Spacer(1, 5 * mm))

    # ── Summary ─────────────────────────────────────────────────────────────
    confidence = payload.get("confidence")
    confidence_txt = f"{confidence:.1%}" if isinstance(confidence, (int, float)) else str(confidence or "—")
    risk = payload.get("risk_level") or "unknown"
    story.append(Paragraph("Clinical Summary", st["section"]))
    story.append(_summary_table([
        ("Report ID", f"RPT-{payload['report_id']:04d}"),
        ("Patient", payload.get("patient_name")),
        ("AI Classification", (payload.get("tumor_type") or "Not classified").replace("_", " ").title()),
        ("Ensemble Confidence", confidence_txt),
        ("Agreement Level", (payload.get("agreement_level") or "unknown").upper()),
        ("Risk Level", risk.upper()),
        ("Report Model", payload.get("generated_by") or "rule-based fallback"),
        ("Scan ID", f"SCN-{payload['scan_id']:04d}"),
    ], st))
    story.append(Spacer(1, 3 * mm))

    if payload.get("uncertainty_flag"):
        story.append(Paragraph(
            _sanitize("[!] UNCERTAINTY FLAG RAISED — mandatory human radiologist review required."),
            st["disclaimer"],
        ))
        story.append(Spacer(1, 3 * mm))

    # ── Report body ─────────────────────────────────────────────────────────
    body = payload.get("body")
    if body:
        story.append(Paragraph("Detailed Findings", st["section"]))
        for para in _split_paragraphs(body):
            if para.strip():
                story.append(Paragraph(_sanitize(para.strip()), st["body"]))

    # ── Disclaimer ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#D8DDE6")))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Medical Disclaimer: This report is generated by an AI screening system "
        "and is a clinical decision-support tool only. All findings must be reviewed "
        "and verified by a qualified medical professional before informing any "
        "patient care decisions.",
        st["disclaimer"],
    ))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def _split_paragraphs(text: str):
    """Split report text on blank lines, keeping long '=' separator lines intact."""
    blocks = re.split(r"\n\s*\n", text)
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        # Keep separator lines (e.g. "======") as their own visual break
        if re.fullmatch(r"[=\-*_#]{4,}", block):
            yield block
        else:
            yield block


def generate_report_pdf(
    *,
    report_id: int,
    scan_id: int,
    patient_name: str,
    generated_by: str,
    created_at: str,
    tumor_type: str,
    confidence: float | None,
    agreement_level: str | None,
    risk_level: str | None,
    uncertainty_flag: bool,
    body: str,
    version_label: str,
    is_fallback: bool = False,
) -> bytes:
    """Public entry point — builds and returns the PDF bytes for a report."""
    return _build_pdf({
        "report_id": report_id,
        "scan_id": scan_id,
        "patient_name": patient_name,
        "generated_by": generated_by,
        "created_at": created_at,
        "tumor_type": tumor_type,
        "confidence": confidence,
        "agreement_level": agreement_level,
        "risk_level": risk_level,
        "uncertainty_flag": uncertainty_flag,
        "body": body,
        "version_label": version_label,
        "is_fallback": is_fallback,
    })
