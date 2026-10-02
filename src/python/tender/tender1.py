"""
Generic PDF → Project JSON Extractor
Reads any set of construction PDFs and produces a unified JSON
without hardcoding drawing numbers, grid values, marks, or quantities.

Strategy:
  1. Read all PDFs in a folder.
  2. For each PDF, extract text + tables.
  3. Classify each PDF by its content signature (drawing number,
     keywords, table headers) rather than filename.
  4. Parse each classified document into a generic schema.
  5. Merge into a single Project JSON with cross-checks.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

import pdfplumber
from pydantic import BaseModel, Field


# ============================================================
# 1. GENERIC SCHEMA
# ============================================================

class DocumentMeta(BaseModel):
    filename: str
    page_count: int
    drawing_no: Optional[str] = None
    revision: Optional[str] = None
    title: Optional[str] = None
    document_type: Optional[str] = None
    raw_text: str = ""


class GridLine(BaseModel):
    axis: str          # "A", "B", "1", "2", ...
    direction: str     # "X" or "Y" or "unknown"
    coordinate_mm: Optional[int] = None


class ScheduleRow(BaseModel):
    """Generic row from any schedule table."""
    mark: Optional[str] = None
    fields: dict[str, Any] = Field(default_factory=dict)


class Schedule(BaseModel):
    name: str
    headers: list[str] = Field(default_factory=list)
    rows: list[ScheduleRow] = Field(default_factory=list)


class TableBlock(BaseModel):
    """Raw table with detected header + typed rows."""
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class ProjectJSON(BaseModel):
    project_name: str = ""
    documents: list[DocumentMeta] = Field(default_factory=list)
    grids: list[GridLine] = Field(default_factory=list)
    levels: list[dict[str, Any]] = Field(default_factory=list)
    schedules: list[Schedule] = Field(default_factory=list)
    tables: list[TableBlock] = Field(default_factory=list)
    key_values: dict[str, list[str]] = Field(default_factory=dict)
    boq: list[dict[str, Any]] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)


# ============================================================
# 2. LOW-LEVEL EXTRACTION
# ============================================================

def extract_pdf(pdf_path: Path) -> dict[str, Any]:
    """Return raw text + tables from a PDF."""
    pages_text: list[str] = []
    tables: list[list[list[str]]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            pages_text.append(txt)
            for tbl in page.extract_tables():
                # Normalize None → ""
                cleaned = [
                    [(c or "").strip() for c in row]
                    for row in tbl
                ]
                tables.append(cleaned)

    return {
        "filename": pdf_path.name,
        "page_count": len(pages_text),
        "text": "\n".join(pages_text),
        "tables": tables,
    }


# ============================================================
# 3. METADATA DETECTION (no hardcoding)
# ============================================================

DRAWING_NO_RE = re.compile(
    r"(?:Drawing\s*No\.?|Document\s*No\.?|Dwg\s*No\.?)\s*[:\-]?\s*([A-Z0-9\-]+)",
    re.IGNORECASE,
)
REVISION_RE = re.compile(
    r"Revision\s*[:\-]?\s*([A-Z0-9]+)", re.IGNORECASE
)
TITLE_RE = re.compile(
    r"^([A-Z][A-Z0-9 \-/&]+)$", re.MULTILINE
)


def detect_metadata(doc: dict[str, Any]) -> DocumentMeta:
    text = doc["text"]
    drawing_no = None
    m = DRAWING_NO_RE.search(text)
    if m:
        drawing_no = m.group(1)

    revision = None
    m = REVISION_RE.search(text)
    if m:
        revision = m.group(1)

    # Title: first prominent all-caps line (length 4-80, not a sentence)
    title = None
    for line in text.splitlines():
        line = line.strip()
        if 4 <= len(line) <= 80 and line.isupper() and not re.search(r"\d{4,}", line):
            title = line
            break

    return DocumentMeta(
        filename=doc["filename"],
        page_count=doc["page_count"],
        drawing_no=drawing_no,
        revision=revision,
        title=title,
        raw_text=text,
    )


# ============================================================
# 4. DOCUMENT CLASSIFICATION (content-based, no filename)
# ============================================================

def classify_document(doc: dict[str, Any]) -> str:
    """Classify by content signature, not by filename."""
    text = doc["text"].upper()
    tables = doc["tables"]

    # Signature keywords → type
    signatures = {
        "STRUCTURAL_DRAWING": ["STRUCTURAL DRAWING", "GENERAL ARRANGEMENT", "STRUCTURAL GRID"],
        "ARCHITECTURAL_DRAWING": ["ARCHITECTURAL DRAWING", "FLOOR PLAN", "ZONE"],
        "COLUMN_SCHEDULE": ["COLUMN", "WIDTH", "DEPTH", "HEIGHT"],
        "BEAM_SCHEDULE": ["BEAM SCHEDULE", "BEAM", "WIDTH", "DEPTH", "SPAN"],
        "LEVEL_STOREY": ["LEVEL", "STOREY", "ELEVATION", "FLOOR-TO-FLOOR"],
        "BOQ": ["BOQ", "BILL OF QUANTITIES", "ITEM", "UNIT", "QUANTITY"],
        "SPECIFICATION": ["SPECIFICATION", "CONCRETE", "MODELLING", "BIM"],
    }

    scores: dict[str, int] = {}
    for dtype, keywords in signatures.items():
        score = sum(1 for kw in keywords if kw in text)
        scores[dtype] = score

    # Tie-breaker: prefer schedule-type if a schedule table header is present
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        # Fallback: infer from table headers
        for tbl in tables:
            headers = [str(c).upper() for c in tbl[0]] if tbl else []
            joined = " ".join(headers)
            if "MARK" in joined and "WIDTH" in joined and "DEPTH" in joined:
                return "BEAM_SCHEDULE" if "SPAN" in joined else "COLUMN_SCHEDULE"
        return "UNKNOWN"
    return best


# ============================================================
# 5. GENERIC TABLE PARSING
# ============================================================

def is_header_row(row: list[str]) -> bool:
    """Heuristic: header if ≥2 cells are non-numeric short labels."""
    if not row or len(row) < 2:
        return False
    non_numeric = 0
    for cell in row:
        c = (cell or "").strip()
        if not c:
            continue
        if not re.search(r"\d", c) and len(c) < 40:
            non_numeric += 1
    return non_numeric >= 2


def parse_table_generic(table: list[list[str]]) -> TableBlock:
    """Split a raw table into headers + rows without hardcoding columns."""
    if not table:
        return TableBlock()

    headers: list[str] = []
    data_rows: list[list[str]] = []

    # Find first header-like row (usually row 0, but could be row 1)
    header_idx = 0
    for i, row in enumerate(table[:3]):
        if is_header_row(row):
            header_idx = i
            break

    headers = [c.strip() for c in table[header_idx]]
    # Drop trailing empty header cells
    while headers and not headers[-1]:
        headers.pop()

    for row in table[header_idx + 1:]:
        if any((c or "").strip() for c in row):
            data_rows.append([c.strip() for c in row[: len(headers)]])

    return TableBlock(headers=headers, rows=data_rows)


def normalize_header(h: str) -> str:
    """Convert header text to a stable snake_case key."""
    h = h.lower().strip()
    h = re.sub(r"[^a-z0-9]+", "_", h)
    return h.strip("_") or "column"


def infer_value(raw: str) -> Any:
    """Convert a cell string to int / float / str."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s == "":
        return None
    # Dimension patterns like "300x300" or "300 × 300"
    m = re.fullmatch(r"(\d+)\s*[x×]\s*(\d+)", s)
    if m:
        return {"width": int(m.group(1)), "depth": int(m.group(2))}
    # Pure integer
    if re.fullmatch(r"-?\d+", s.replace(",", "")):
        return int(s.replace(",", ""))
    # Float
    if re.fullmatch(r"-?\d+\.\d+", s.replace(",", "")):
        return float(s.replace(",", ""))
    # Number + unit
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([A-Za-z%/²]+)", s)
    if m:
        num = float(m.group(1))
        return int(num) if num.is_integer() else num
    return s


# ============================================================
# 6. GRID EXTRACTION (generic)
# ============================================================

GRID_AXIS_RE = re.compile(r"\b([A-Z]{1,2}|\d{1,2})\b")
GRID_COORD_PAIR_RE = re.compile(r"\b([A-Z]{1,2}|\d{1,2})\s*[=:]?\s*(\d{3,7})\b")
GRID_AXIS_ROW_RE = re.compile(r"Grid\s+([A-Z0-9]+)\s+([XY])\s*=\s*(\d+)")


def extract_grids(text: str, tables: list[list[list[str]]]) -> list[GridLine]:
    """Extract grid axes and coordinates from text + tables."""
    grids: list[GridLine] = []
    seen: set[tuple[str, str]] = set()

    # Pattern: "Grid A X = 0", "Grid B X = 6000", "Grid 1 Y = 0"
    for axis, direction, coord in GRID_AXIS_ROW_RE.findall(text):
        key = (axis, direction)
        if key not in seen:
            seen.add(key)
            grids.append(GridLine(axis=axis, direction=direction, coordinate_mm=int(coord)))

    # Pattern in tables: header row contains "Grid" and axis letters, values below
    for tbl in tables:
        if not tbl:
            continue
        # Look for a row whose first cell contains "Grid"
        for i, row in enumerate(tbl):
            row_join = " ".join(str(c) for c in row if c)
            if "Grid" in row_join and re.search(r"[A-Z]", row_join):
                axis_cells = [str(c).strip() for c in row if c and str(c).strip().isalpha()]
                # Next row contains coordinate numbers
                if i + 1 < len(tbl):
                    coord_row = tbl[i + 1]
                    coords = [infer_value(c) for c in coord_row]
                    coords = [c for c in coords if isinstance(c, int)]
                    if len(axis_cells) == len(coords):
                        for axis, coord in zip(axis_cells, coords):
                            key = (axis, "unknown")
                            if key not in seen:
                                seen.add(key)
                                grids.append(GridLine(axis=axis, direction="unknown", coordinate_mm=coord))

            # Row format: "1 0", "2 6000", "3 12000"
            pairs = re.findall(r"\b(\d{1,2})\s+(\d{3,7})\b", row_join)
            for axis, coord in pairs:
                key = (axis, "Y")
                if key not in seen and int(coord) % 100 == 0:
                    seen.add(key)
                    grids.append(GridLine(axis=axis, direction="Y", coordinate_mm=int(coord)))

    return grids


# ============================================================
# 7. LEVEL EXTRACTION (generic)
# ============================================================

LEVEL_KEYWORDS = ("GROUND", "LEVEL", "L1", "L2", "L3", "ROOF", "FLOOR")


def extract_levels(text: str, tables: list[list[list[str]]]) -> list[dict[str, Any]]:
    """Extract levels with elevations from any table or text block."""
    levels: list[dict[str, Any]] = []

    for tbl in tables:
        for row in tbl:
            cells = [str(c).strip() if c else "" for c in row]
            if len(cells) < 2:
                continue
            name = cells[0].upper()
            if any(kw in name for kw in LEVEL_KEYWORDS) and len(name) < 20:
                # Look for elevation (number) in following cells
                elevation = None
                floor_to_floor = None
                description_parts: list[str] = []
                for cell in cells[1:]:
                    v = infer_value(cell)
                    if isinstance(v, int) and elevation is None:
                        elevation = v
                    elif isinstance(v, int) and floor_to_floor is None:
                        floor_to_floor = v
                    elif cell and not isinstance(v, int):
                        description_parts.append(cell)
                if elevation is not None:
                    levels.append({
                        "name": cells[0],
                        "elevation_mm": elevation,
                        "floor_to_floor_mm": floor_to_floor,
                        "description": " ".join(description_parts) or None,
                    })

    # Text fallback: "Ground 0", "L1 3200"
    if not levels:
        for m in re.finditer(r"\b(Ground|L\d|Roof)\s+(\d+)\b", text, re.IGNORECASE):
            levels.append({
                "name": m.group(1),
                "elevation_mm": int(m.group(2)),
                "floor_to_floor_mm": None,
                "description": None,
            })

    # De-duplicate by (name, elevation)
    seen = set()
    unique = []
    for lvl in levels:
        key = (lvl["name"], lvl["elevation_mm"])
        if key not in seen:
            seen.add(key)
            unique.append(lvl)
    return unique


# ============================================================
# 8. SCHEDULE EXTRACTION (generic, any mark-based schedule)
# ============================================================

def extract_schedules(
    tables: list[list[list[str]]],
) -> list[Schedule]:
    """Detect any table that looks like a schedule (has a 'mark' column)."""
    schedules: list[Schedule] = []

    for tbl in tables:
        parsed = parse_table_generic(tbl)
        if not parsed.headers or not parsed.rows:
            continue
        header_keys = [normalize_header(h) for h in parsed.headers]

        # Schedule detection: header contains "mark" or "type" or "item"
        if not any(k in header_keys for k in ("mark", "type", "item", "code")):
            continue

        rows: list[ScheduleRow] = []
        for raw in parsed.rows:
            fields: dict[str, Any] = {}
            for key, cell in zip(header_keys, raw):
                fields[key] = infer_value(cell)
            mark = None
            for k in ("mark", "type", "item", "code"):
                if k in fields and fields[k]:
                    mark = str(fields[k])
                    break
            rows.append(ScheduleRow(mark=mark, fields=fields))

        schedules.append(Schedule(
            name=parsed.headers[0] if parsed.headers else "Schedule",
            headers=parsed.headers,
            rows=rows,
        ))

    return schedules


# ============================================================
# 9. BOQ EXTRACTION (generic)
# ============================================================

BOQ_LINE_RE = re.compile(
    r"^\s*(\d+(?:\.\d+)+)\s+(.+?)\s+(No\.?|m2|m²|m3|m³|kg|t|Nr|pcs)\s+([\d.,]+)",
    re.MULTILINE,
)


def extract_boq(text: str) -> list[dict[str, Any]]:
    """Extract BOQ lines of form: code description unit quantity."""
    items: list[dict[str, Any]] = []
    for m in BOQ_LINE_RE.finditer(text):
        items.append({
            "code": m.group(1),
            "description": m.group(2).strip(),
            "unit": m.group(3).replace("m²", "m2").replace("m³", "m3"),
            "quantity": float(m.group(4).replace(",", "")),
        })
    return items


# ============================================================
# 10. KEY-VALUE NOTE EXTRACTION (generic)
# ============================================================

KV_PATTERNS = [
    # "floor-to-floor height: 3200 mm"
    re.compile(r"([A-Za-z][A-Za-z0-9 \-/]{2,40}?)\s*[:\-]\s*([\d.,]+)\s*(mm|m|kN|MPa|No\.?)", re.IGNORECASE),
    # "Concrete: C40/50"
    re.compile(r"([A-Za-z][A-Za-z0-9 \-/]{2,40}?)\s*[:\-]\s*([A-Z][A-Z0-9/]{1,15})", re.IGNORECASE),
    # "Grid spacing: 6000 mm"
    re.compile(r"([A-Za-z][A-Za-z0-9 \-/]{2,40}?)\s*[:\-]\s*(\d+(?:\.\d+)?)\s*(mm|m)", re.IGNORECASE),
]


def extract_key_values(text: str) -> dict[str, list[str]]:
    """Collect all 'key: value' style facts from free text."""
    kvs: dict[str, list[str]] = {}
    for pat in KV_PATTERNS:
        for m in pat.finditer(text):
            key = m.group(1).strip().lower().replace(" ", "_")
            val = " ".join(g for g in m.groups()[1:] if g)
            kvs.setdefault(key, [])
            if val not in kvs[key]:
                kvs[key].append(val)
    return kvs


# ============================================================
# 11. MAIN PIPELINE
# ============================================================

def build_project_json(pdf_dir: str | Path) -> ProjectJSON:
    pdf_dir = Path(pdf_dir)
    pdf_files = sorted(pdf_dir.glob("*.pdf"))
    if not pdf_files:
        raise FileNotFoundError(f"No PDFs found in {pdf_dir}")

    raw_documents = [extract_pdf(pdf_path) for pdf_path in pdf_files]
    return _build_project_json(pdf_dir.name, raw_documents)


def build_project_json_from_documents(
    documents: Any,
    project_name: str = "Tender project",
) -> ProjectJSON:
    """Build a project from text already extracted from tender documents."""
    if not isinstance(documents, list) or not documents:
        raise ValueError("Provide at least one text document.")
    if len(documents) > 10:
        raise ValueError("A maximum of 10 text documents can be extracted at once.")

    raw_documents: list[dict[str, Any]] = []
    for index, document in enumerate(documents):
        if not isinstance(document, dict):
            raise ValueError(f"Text document {index + 1} must be an object.")

        text = document.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"Text document {index + 1} must include non-empty text.")

        filename = Path(str(document.get("filename") or f"document-{index + 1}.pdf")).name
        tables = document.get("tables", [])
        if not isinstance(tables, list):
            raise ValueError(f"Tables for text document {index + 1} must be an array.")
        for table in tables:
            if not isinstance(table, list) or any(not isinstance(row, list) for row in table):
                raise ValueError(f"Each table in text document {index + 1} must be an array of rows.")

        raw_documents.append({
            "filename": filename,
            "page_count": document.get("page_count", 1),
            "text": text,
            "tables": [
                [[str(cell) if cell is not None else "" for cell in row] for row in table]
                for table in tables
            ],
        })

    return _build_project_json(project_name or "Tender project", raw_documents)


def _build_project_json(
    project_name: str,
    raw_documents: list[dict[str, Any]],
) -> ProjectJSON:
    project = ProjectJSON(project_name=project_name)

    all_text_parts: list[str] = []
    all_tables: list[list[list[str]]] = []

    for raw in raw_documents:
        meta = detect_metadata(raw)
        meta.document_type = classify_document(raw)
        project.documents.append(meta)

        all_text_parts.append(raw["text"])
        all_tables.extend(raw["tables"])

        # Per-document key-value notes
        kvs = extract_key_values(raw["text"])
        for k, v in kvs.items():
            project.key_values.setdefault(k, [])
            for item in v:
                if item not in project.key_values[k]:
                    project.key_values[k].append(item)

    full_text = "\n".join(all_text_parts)

    # Cross-document extraction (uses all docs together)
    project.grids = extract_grids(full_text, all_tables)
    project.levels = extract_levels(full_text, all_tables)
    project.schedules = extract_schedules(all_tables)
    project.boq = extract_boq(full_text)
    project.tables = [parse_table_generic(t) for t in all_tables if t]

    # Cross-checks
    _run_cross_checks(project)

    return project


def _run_cross_checks(project: ProjectJSON) -> None:
    """Flag discrepancies between BOQ and schedules without guessing."""

    # Build a map mark → total quantity from schedules
    schedule_totals: dict[str, float] = {}
    for sched in project.schedules:
        for row in sched.rows:
            if not row.mark:
                continue
            # Try to find a "qty" / "quantity" / "count" field
            for k, v in row.fields.items():
                if any(tok in k for tok in ("qty", "quantity", "count", "no")):
                    if isinstance(v, (int, float)):
                        schedule_totals[row.mark] = schedule_totals.get(row.mark, 0) + v
                        break

    # BOQ marks are usually embedded in description e.g. "C01 concrete columns"
    for item in project.boq:
        desc = item["description"]
        for mark, total in schedule_totals.items():
            if mark in desc:
                boq_qty = item["quantity"]
                if abs(boq_qty - total) > 0.01:
                    project.flags.append(
                        f"Quantity mismatch for '{mark}': BOQ={boq_qty}, "
                        f"schedule total={total} (source: {item['code']})"
                    )

    # Missing drawings
    required_types = {
        "STRUCTURAL_DRAWING", "ARCHITECTURAL_DRAWING", "COLUMN_SCHEDULE",
        "BEAM_SCHEDULE", "LEVEL_STOREY", "BOQ",
    }
    found_types = {d.document_type for d in project.documents}
    for missing in required_types - found_types:
        project.flags.append(f"Missing document type: {missing}")

    # Grids without coordinates
    for g in project.grids:
        if g.coordinate_mm is None:
            project.flags.append(f"Grid '{g.axis}' has no coordinate")


# ============================================================
# 12. CLI
# ============================================================

if __name__ == "__main__":
    import sys

    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--text-json":
            input_file = sys.argv[2]
            out_file = sys.argv[3]
            with open(input_file, encoding="utf-8") as f:
                input_data = json.load(f)
            project = build_project_json_from_documents(
                input_data.get("documents"),
                input_data.get("project_name", "Tender project"),
            )
        else:
            pdf_dir = sys.argv[1] if len(sys.argv) > 1 else "."
            out_file = sys.argv[2] if len(sys.argv) > 2 else "project.json"
            project = build_project_json(pdf_dir)
    except (FileNotFoundError, ValueError, IndexError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(project.model_dump(), f, indent=2, ensure_ascii=False)

    print(f"Extracted → {out_file}")
    print(f"  Documents : {len(project.documents)}")
    print(f"  Grids     : {len(project.grids)}")
    print(f"  Levels    : {len(project.levels)}")
    print(f"  Schedules : {len(project.schedules)}")
    print(f"  BOQ items : {len(project.boq)}")
    print(f"  KV facts  : {sum(len(v) for v in project.key_values.values())}")
    print(f"  Flags     : {len(project.flags)}")