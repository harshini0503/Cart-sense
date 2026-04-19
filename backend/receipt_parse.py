"""
Extract line items from receipt PDFs and images.

- PDF: text extraction via pdfplumber (preferred) or pypdf fallback.
- Images: OCR via pytesseract + Pillow (install Tesseract; set TESSERACT_CMD on Windows if needed).
"""
from __future__ import annotations

import os
import re
from typing import Any

# Strict: whole line is "something" + price at end
_PRICE_END = re.compile(
    r"^(.+?)\s+[\$]?\s*(\d{1,4}(?:,\d{3})*\.\d{2})\s*$",
    re.IGNORECASE,
)
# Loose: item-ish text then price (OCR often breaks alignment)
_PRICE_LOOSE = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9\s\-'/.&]{1,80}?)\s+[\$]?\s*(\d{1,4}(?:,\d{3})*\.\d{2})\b",
    re.IGNORECASE,
)
_SKIP = re.compile(
    r"^(subtotal|total|tax|sales\s*tax|balance|change|cash|debit|credit|visa|master|amex|discover|payment|thank|date|time|store|receipt|phone|www\.|http|amount\s*due|gratuity|tip\b|discount|coupon|member|loyalty|save\b|you\s+saved)",
    re.IGNORECASE,
)
_INVALID_ITEM_PATTERNS = [
    re.compile(r"^\$?\d+(?:\.\d{1,2})?$", re.IGNORECASE),
    re.compile(r"^\d+(?:\.\d+)?\s*(?:lb|lbs|kg|g|mg|oz|ct|ea|pk|pack|count)$", re.IGNORECASE),
    re.compile(r"^(?:wt|weight|price|unit\s*price|avg\s*price|regular\s*price|sale\s*price)$", re.IGNORECASE),
]


def _guess_category(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ("banana", "apple", "orange", "berry", "grape", "melon", "fruit")):
        return "fruits"
    if any(x in n for x in ("spinach", "lettuce", "broccoli", "carrot", "tomato", "onion", "pepper", "salad", "kale", "veg")):
        return "vegetables"
    if any(x in n for x in ("milk", "cheese", "yogurt", "butter", "cream")):
        return "dairy"
    if any(x in n for x in ("chicken", "beef", "pork", "fish", "salmon", "tofu", "turkey")):
        return "protein"
    if any(x in n for x in ("chip", "cookie", "candy", "snack", "soda", "juice drink")):
        return "snacks"
    if any(x in n for x in ("bread", "rice", "pasta", "cereal", "oat", "flour")):
        return "carbs"
    return "other"


def _guess_store_name(text: str) -> str | None:
    upper = text.upper()
    known = [
        ("WALMART", "Walmart"),
        ("TARGET", "Target"),
        ("COSTCO", "Costco"),
        ("TRADER", "Trader Joe's"),
        ("WHOLE FOODS", "Whole Foods"),
        ("KROGER", "Kroger"),
        ("SAFEWAY", "Safeway"),
        ("ALDI", "Aldi"),
        ("PUBLIX", "Publix"),
    ]
    for needle, label in known:
        if needle in upper:
            return label
    return None


def _clean_item_name(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"\s+\d+\s*[@x]\s*$", "", raw, flags=re.IGNORECASE).strip()
    raw = re.sub(r"^[#*\-]+\s*", "", raw)
    return raw[:200]


def _looks_like_invalid_item(raw: str) -> bool:
    value = (raw or "").strip()
    if not value:
        return True
    lower = value.lower()
    if any(p.search(lower) for p in _INVALID_ITEM_PATTERNS):
        return True
    if _SKIP.search(lower):
        return True
    if lower.count("@") >= 1 or "/lb" in lower or "/kg" in lower or "/oz" in lower:
        return True
    if re.search(r"\b(?:lb|lbs|kg|g|mg|oz|ct|pk|pack|ea|each)\b", lower) and sum(ch.isalpha() for ch in lower) <= 6:
        return True
    if re.fullmatch(r"[\d\s/:\-.]+", lower):
        return True
    letters = sum(1 for c in lower if c.isalpha())
    digits = sum(1 for c in lower if c.isdigit())
    if letters < 2:
        return True
    if digits and digits > letters:
        return True
    tokens = [tok for tok in re.split(r"\s+", lower) if tok]
    if tokens and all(re.fullmatch(r"\d+(?:\.\d+)?", tok) or tok in {"lb", "lbs", "kg", "g", "oz", "ct", "ea", "pk"} for tok in tokens):
        return True
    return False


def parse_receipt_lines(text: str) -> list[dict[str, Any]]:
    """Turn raw receipt text into candidate line items (strict per-line, then loose scan)."""
    lines = [ln.strip() for ln in text.replace("\r", "\n").split("\n")]
    lines = [ln for ln in lines if ln and len(ln) > 2]

    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for ln in lines:
        if _SKIP.search(ln):
            continue
        if len(ln) > 140:
            continue
        m = _PRICE_END.match(ln)
        if not m:
            continue
        raw_name = _clean_item_name(m.group(1))
        if len(raw_name) < 2 or _looks_like_invalid_item(raw_name):
            continue
        key = raw_name.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "item_name": raw_name,
                "category": _guess_category(raw_name),
                "quantity_guess": 1,
                "price_text": m.group(2),
            }
        )
        if len(items) >= 80:
            return items

    # Loose: find item + price anywhere in line (OCR noise)
    for ln in lines:
        if _SKIP.search(ln) or len(ln) > 160:
            continue
        for m in _PRICE_LOOSE.finditer(ln):
            raw_name = _clean_item_name(m.group(1))
            if len(raw_name) < 3 or _looks_like_invalid_item(raw_name):
                continue
            key = raw_name.lower()
            if key in seen:
                continue
            seen.add(key)
            items.append(
                {
                    "item_name": raw_name,
                    "category": _guess_category(raw_name),
                    "quantity_guess": 1,
                    "price_text": m.group(2),
                }
            )
            if len(items) >= 80:
                return items

    # Full-text scan (multiline OCR blobs)
    blob = " ".join(lines)
    for m in _PRICE_LOOSE.finditer(blob):
        raw_name = _clean_item_name(m.group(1))
        if len(raw_name) < 3 or _looks_like_invalid_item(raw_name):
            continue
        key = raw_name.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "item_name": raw_name,
                "category": _guess_category(raw_name),
                "quantity_guess": 1,
                "price_text": m.group(2),
            }
        )
        if len(items) >= 40:
            break

    return items


def extract_text_pdf(file_path: str) -> str:
    try:
        import pdfplumber

        parts: list[str] = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ""
                if t:
                    parts.append(t)
        return "\n".join(parts)
    except Exception:
        pass
    try:
        from pypdf import PdfReader

        reader = PdfReader(file_path)
        parts = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t:
                parts.append(t)
        return "\n".join(parts)
    except Exception:
        return ""


def _configure_tesseract() -> None:
    import pytesseract

    if os.name == "nt":
        tess = os.environ.get("TESSERACT_CMD")
        if tess:
            pytesseract.pytesseract.tesseract_cmd = tess
        elif os.path.exists(r"C:\Program Files\Tesseract-OCR\tesseract.exe"):
            pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def _preprocess_image(img):
    """Prepare phone / WhatsApp photos for OCR."""
    from PIL import Image, ImageOps, ImageEnhance

    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    if w > 2400:
        ratio = 2400 / w
        img = img.resize((2400, int(h * ratio)), Image.Resampling.LANCZOS)
    elif w < 600:
        ratio = 900 / w
        img = img.resize((900, int(img.size[1] * ratio)), Image.Resampling.LANCZOS)

    gray = img.convert("L")
    gray = ImageEnhance.Contrast(gray).enhance(1.35)
    return gray


def extract_text_image(file_path: str) -> str:
    try:
        import pytesseract
        from PIL import Image

        _configure_tesseract()
        img = Image.open(file_path)
        proc = _preprocess_image(img)

        # Multiple PSM modes — receipts vary (block, sparse, single column)
        configs = (
            "--oem 3 --psm 6",  # uniform block
            "--oem 3 --psm 4",  # single column
            "--oem 3 --psm 11",  # sparse text
            "--oem 3 --psm 3",  # fully automatic
        )
        chunks: list[str] = []
        for cfg in configs:
            try:
                t = pytesseract.image_to_string(proc, config=cfg)
                if t and len(t.strip()) > 20:
                    chunks.append(t)
            except Exception:
                continue
        # Prefer longest extraction
        if not chunks:
            return ""
        chunks.sort(key=len, reverse=True)
        # Merge unique lines from best + second best for recall
        lines_seen: set[str] = set()
        out_lines: list[str] = []
        for blob in chunks[:2]:
            for ln in blob.splitlines():
                ln = ln.strip()
                if len(ln) < 2:
                    continue
                key = ln.lower()
                if key in lines_seen:
                    continue
                lines_seen.add(key)
                out_lines.append(ln)
        return "\n".join(out_lines)
    except Exception:
        return ""


def parse_receipt_file(file_path: str, mime_type: str | None, original_filename: str) -> tuple[list[dict[str, Any]], str]:
    """
    Returns (parsed_items, parse_method) where parse_method is one of:
    pdf_text, image_ocr, filename_fallback, manual_suggested
    """
    ext = os.path.splitext(original_filename)[1].lower()
    mime = (mime_type or "").lower()

    text = ""
    method = "filename_fallback"

    is_pdf = ext == ".pdf" or "pdf" in mime
    is_image = ext in (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp") or "image" in mime

    if is_pdf:
        text = extract_text_pdf(file_path)
        if text.strip():
            method = "pdf_text"

    if not text.strip() and is_image:
        text = extract_text_image(file_path)
        if text.strip():
            method = "image_ocr"

    if not text.strip():
        from pathlib import Path

        FILENAME_KEYWORDS = {
            "chips": ("snacks", "Chips"),
            "oatmeal": ("carbs", "Oatmeal"),
            "milk": ("dairy", "Milk"),
            "banana": ("fruits", "Bananas"),
            "spinach": ("vegetables", "Spinach"),
            "costco": ("other", "Groceries (Costco trip)"),
            "walmart": ("other", "Groceries (Walmart trip)"),
            "target": ("other", "Groceries (Target trip)"),
        }

        name = Path(original_filename).stem.lower()
        tokens = re.split(r"[\s_\-\.]+", name)
        hits: list[dict[str, Any]] = []
        for t in tokens:
            if t in FILENAME_KEYWORDS:
                cat, pretty = FILENAME_KEYWORDS[t]
                hits.append({"item_name": pretty, "category": cat, "quantity_guess": 1})
        if hits:
            return hits[:20], "filename_fallback"
        return (
            [
                {
                    "item_name": "Could not read receipt — edit name & qty, or install Tesseract OCR for photos",
                    "category": "other",
                    "quantity_guess": 1,
                },
            ],
            "filename_fallback",
        )

    items = parse_receipt_lines(text)
    store_guess = _guess_store_name(text[:4000])
    for it in items:
        it["store_name_guess"] = store_guess

    if not items:
        # Lines that look like product text without a parsed price (OCR dropped $)
        for ln in text.splitlines():
            ln = ln.strip()
            if not (4 <= len(ln) <= 100):
                continue
            if _SKIP.search(ln) or _looks_like_invalid_item(ln):
                continue
            # Skip pure numbers / dates
            if re.fullmatch(r"[\d\s/:\-.]+", ln):
                continue
            if re.fullmatch(r"\$?\d+\.\d{2}", ln):
                continue
            # Skip if mostly non-letters
            letters = sum(1 for c in ln if c.isalpha())
            if letters < 3:
                continue
            items.append(
                {
                    "item_name": ln[:200],
                    "category": _guess_category(ln),
                    "quantity_guess": 1,
                    "store_name_guess": store_guess,
                }
            )
            if len(items) >= 25:
                break

    for it in items:
        it.setdefault("store_name_guess", store_guess)

    if not items:
        return (
            [
                {
                    "item_name": "No line items detected — add details manually below",
                    "category": "other",
                    "quantity_guess": 1,
                    "store_name_guess": store_guess,
                },
            ],
            method,
        )

    return items, method
