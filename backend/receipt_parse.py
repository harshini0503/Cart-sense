"""
Extract line items from receipt PDFs and images.

- PDF: text extraction via pdfplumber (preferred) or pypdf fallback.
- Images: OCR via pytesseract + Pillow (install Tesseract; set TESSERACT_CMD on Windows if needed).
"""
from __future__ import annotations

import os
import re
from typing import Any

_PRICE_END = re.compile(
    r"^(.+?)\s+[\$]?\s*(\d{1,4}(?:,\d{3})*\.\d{2})\s*$",
    re.IGNORECASE,
)
_PRICE_LOOSE = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9\s\-'/.&(),%]{1,220}?)\s+[\$]?\s*(\d{1,4}(?:,\d{3})*\.\d{2})\b",
    re.IGNORECASE,
)
_SKIP = re.compile(
    r"^(subtotal|total|tax|sales\s*tax|balance|change|cash|debit|credit|visa|master|amex|discover|payment|thank|date|time|store|receipt|phone|www\.|http|amount\s*due|gratuity|tip\b|discount|coupon|member|loyalty|save\b|you\s+saved|order#|order\b|savings\b|ending\s+in|payment\s+method|temporary\s+hold|free\s+delivery|delivery\s+fee|service\s+fee|bag\s+fee|estimated\s+regulatory\s+fees?|redemption\s+value|california\s+redemption\s+value|crv\b|driver\s*tip|drivertip|fees?\s*&\s*taxes)",
    re.IGNORECASE,
)
_INVALID_ITEM_PATTERNS = [
    re.compile(r"^\$?\d+(?:\.\d{1,2})?$", re.IGNORECASE),
    re.compile(r"^\d+(?:\.\d+)?\s*(?:lb|lbs|kg|g|mg|oz|ct|ea|pk|pack|count|qty|fl|ml|l)$", re.IGNORECASE),
    re.compile(r"^(?:wt|weight|price|unit\s*price|avg\s*price|regular\s*price|sale\s*price)$", re.IGNORECASE),
]
_NOISE_PHRASES = (
    "estimated regulatory fees",
    "fees & taxes",
    "california redemption value",
    "crv",
    "bag fee",
    "driver tip",
    "free delivery",
    "temporary hold",
    "payment method",
    "payment ending",
    "ending in",
    "subtotal",
    "savings",
    "tax",
    "total",
    "delivery from store",
)
_PACKAGING_ONLY_PATTERNS = (
    re.compile(r"^(?:each|qty|count|pack|bag|box|bottle|cup|jar|can|lb|lbs|oz|fl|ml|l)(?:\s+qty\s+\d+)?$", re.IGNORECASE),
    re.compile(r"^(?:\d+(?:\.\d+)?\s*)?(?:fl\s*)?(?:oz|lb|lbs|kg|g|mg|ml|l)\s+qty\s+\d+$", re.IGNORECASE),
    re.compile(r"^(?:each|qty)\s+qty\s+\d+$", re.IGNORECASE),
    re.compile(r"^(?:shelf[- ]stable|frozen|organic|pasteurized|resealable\s+plastic\s+bag)(?:\s+qty\s+\d+)?$", re.IGNORECASE),
)

_CONTAINER_LABELS = ("bag", "box", "bottle", "jar", "can", "pack", "cup", "ct", "count", "gallon", "each")
_PRODUCT_STOPWORDS = {
    "shopped", "bulk", "unavailable", "ready", "to", "eat", "shelf", "stable", "steamable",
    "no", "added", "sugars", "frozen", "pasteurized", "plastic", "resealable", "sharing",
}

_UNIT_TYPE_BY_LABEL = {
    "each": "count",
    "ct": "count",
    "count": "count",
    "pack": "count",
    "bag": "count",
    "box": "count",
    "bottle": "count",
    "cup": "count",
    "jar": "count",
    "can": "count",
    "lb": "weight",
    "lbs": "weight",
    "kg": "weight",
    "g": "weight",
    "mg": "weight",
    "oz": "weight",
    "fl oz": "volume",
    "ml": "volume",
    "l": "volume",
    "gallon": "volume",
}


def _guess_category(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ("banana", "apple", "orange", "berry", "grape", "melon", "fruit", "mango", "juice")):
        return "fruits"
    if any(x in n for x in ("spinach", "lettuce", "broccoli", "carrot", "tomato", "onion", "pepper", "salad", "kale", "veg", "cilantro", "chilli", "chili", "squash", "gourd", "opo", "sinqua", "singqua", "lauki", "peas", "potato")):
        return "vegetables"
    if any(x in n for x in ("popcorn", "chip", "cookie", "candy", "snack", "soda", "brownie", "ice cream", "corn nuts")):
        return "snacks"
    if any(x in n for x in ("milk", "cheese", "yogurt", "butter", "cream", "buttermilk")):
        return "dairy"
    if any(x in n for x in ("almond", "cashew", "pistachio", "walnut", "pecan", "hazelnut", "raisin", "dates", "date", "fig", "prune", "mixed nuts", "peanut", "dry fruit", "trail mix", "nuts")):
        return "nuts_dry_fruits"
    if any(x in n for x in ("chicken", "beef", "pork", "fish", "salmon", "tofu", "turkey", "shrimp", "egg", "beans", "lentil")):
        return "protein"
    if any(x in n for x in ("bread", "rice", "pasta", "cereal", "oat", "flour", "cracker", "wheat")):
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
        ("INDIA BAZAR", "New India Bazar"),
        ("NEW INDIA", "New India Bazar"),
    ]
    for needle, label in known:
        if needle in upper:
            return label
    return None


def _sanitize_ocr_line(value: str) -> str:
    line = (value or "").strip()
    if not line:
        return ""
    repl = {
        "|": "1",
        "§": "5",
        "€": "e",
        "¢": "c",
        "“": '"',
        "”": '"',
        "’": "'",
        "‘": "'",
        "—": "-",
        "–": "-",
    }
    for a, b in repl.items():
        line = line.replace(a, b)
    line = re.sub(r"\s+", " ", line)
    line = re.sub(r"\b1b\b", "lb", line, flags=re.IGNORECASE)
    line = re.sub(r"\bIb\b", "lb", line)
    line = re.sub(r"\bTb\b", "lb", line)
    line = re.sub(r"\b0([.,]\d{2})\b", r"0\1", line)
    return line.strip()


def _clean_item_name(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"\bshopped\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\bbulk\s+unavailable\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\bqty\s*\d+\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\bqty\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\b(?:ready-to-eat|shelf-stable|steamable|no\s+added\s+sugars?)\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\b(?:frozen)\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\(\s*frozen\s*\)", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\b(?:each|ct|count|pack|bag|box|bottle|cup|jar|can|gallon)\b\s*$", "", raw, flags=re.IGNORECASE).strip()
    raw = re.sub(r"\b\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|lb|lbs|kg|g|mg|ml|l|ltr|ct|count|each)\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s+\$?\d+(?:\.\d{1,2})?$", "", raw).strip()
    raw = re.sub(r"^[#*\-]+\s*", "", raw)
    raw = re.sub(r"\b(?:original|promo|sale|weekend)\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\borig(?:inal)?\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\b(?:@\s*\d+(?:\.\d+)?\s*/\s*(?:lb|kg|oz|each))\b", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s+", " ", raw).strip(" ,;:-")
    raw = re.sub(r"\bBUTTE\s+RMILK\b", "BUTTERMILK", raw, flags=re.IGNORECASE)
    raw = raw.replace("..", ".")
    return raw[:220]


def is_receipt_noise_candidate(raw: str) -> bool:
    value = (raw or "").strip()
    if not value:
        return True
    lower = re.sub(r"\s+", " ", value.lower())
    lower = lower.replace("(", " ").replace(")", " ")
    lower = re.sub(r"\s+", " ", lower).strip()
    if lower in {"inal", "original", "orig", "qty", "product", "payment details"}:
        return True
    if any(p.search(lower) for p in _INVALID_ITEM_PATTERNS):
        return True
    if _SKIP.search(lower):
        return True
    if any(phrase in lower for phrase in _NOISE_PHRASES):
        return True
    if any(pattern.fullmatch(lower) for pattern in _PACKAGING_ONLY_PATTERNS):
        return True
    if lower.count("@") >= 1 or "/lb" in lower or "/kg" in lower or "/oz" in lower:
        return True
    if re.search(r"\bqty\b", lower):
        words = [tok for tok in re.split(r"\s+", lower) if tok and tok != "qty"]
        allowed = {"each", "shelf-stable", "frozen", "organic", "pasteurized", "resealable", "plastic", "bag", "oz", "fl", "lb", "lbs", "kg", "g", "mg", "ml", "l", "count", "ct", "pack", "box", "bottle", "cup", "jar", "can", "gallon"}
        if words and all(tok.isdigit() or tok in allowed or re.fullmatch(r"\d+(?:\.\d+)?", tok) for tok in words):
            return True
        if len(words) <= 3 and not any(tok in {"milk", "bread", "orange", "mango", "grapes", "shrimp", "juice", "nuts", "popcorn"} for tok in words):
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
    if tokens and all(re.fullmatch(r"\d+(?:\.\d+)?", tok) or tok in {"lb", "lbs", "kg", "g", "oz", "ct", "ea", "pk", "qty", "fl", "ml", "l"} for tok in tokens):
        return True
    return False


def _looks_like_invalid_item(raw: str) -> bool:
    return is_receipt_noise_candidate(raw)


def _unit_type(label: str) -> str:
    return _UNIT_TYPE_BY_LABEL.get(label.lower(), "count")


def _extract_quantity_and_measure(raw_text: str) -> tuple[str, float, str, str]:
    text = re.sub(r"\s+", " ", raw_text or "").strip()
    lower = text.lower()

    qty_match = re.search(r"\bqty\s*(\d+(?:\.\d+)?)\b", lower, re.IGNORECASE)
    qty_count = float(qty_match.group(1)) if qty_match else None
    if qty_match:
        text = re.sub(r"\bqty\s*\d+(?:\.\d+)?\b", " ", text, flags=re.IGNORECASE).strip()
        lower = text.lower()

    text = re.sub(r"\bshopped\b", " ", text, flags=re.IGNORECASE).strip()
    lower = text.lower()

    size_match = re.search(r"\b(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|lb|lbs|kg|g|mg|ml|l|ltr|ct|count|each)\b", lower, re.IGNORECASE)
    bag_match = re.search(r"\b\d+(?:\.\d+)?\s*lb\s+bag\b", lower, re.IGNORECASE)
    container_label = None
    for label in _CONTAINER_LABELS:
        if re.search(rf"\b{re.escape(label)}\b", lower, re.IGNORECASE):
            container_label = label
            break

    unit_label = "each"
    quantity = 1.0

    if qty_count is not None:
        quantity = qty_count
        if bag_match:
            unit_label = "bag"
        elif re.search(r"\bgallon\b", lower, re.IGNORECASE):
            unit_label = "gallon"
        elif re.search(r"\beach\b", lower, re.IGNORECASE):
            unit_label = "each"
        elif re.search(r"\bct\b|\bcount\b", lower, re.IGNORECASE):
            unit_label = "ct"
        elif container_label and container_label in {"bag", "box", "bottle", "jar", "can", "pack", "cup"}:
            unit_label = container_label
        else:
            unit_label = "each"
    else:
        if re.search(r"\bfl\s*oz\b", lower, re.IGNORECASE):
            unit_label = "fl oz"
        elif re.search(r"\bgallon\b", lower, re.IGNORECASE):
            unit_label = "gallon"
        elif re.search(r"\bct\b|\bcount\b", lower, re.IGNORECASE):
            unit_label = "ct"
        elif re.search(r"\beach\b", lower, re.IGNORECASE):
            unit_label = "each"
        elif re.search(r"\blbs?\b", lower, re.IGNORECASE):
            unit_label = "lb"
        elif re.search(r"\bkg\b", lower, re.IGNORECASE):
            unit_label = "kg"
        elif re.search(r"\boz\b", lower, re.IGNORECASE):
            unit_label = "oz"
        elif re.search(r"\bml\b", lower, re.IGNORECASE):
            unit_label = "ml"
        elif re.search(r"\b(?:ltr|\bl\b)\b", lower, re.IGNORECASE):
            unit_label = "l"
        elif re.search(r"\bpack\b", lower, re.IGNORECASE):
            unit_label = "pack"
        elif re.search(r"\bbag\b", lower, re.IGNORECASE):
            unit_label = "bag"
        elif re.search(r"\bbox\b", lower, re.IGNORECASE):
            unit_label = "box"
        elif re.search(r"\bbottle\b", lower, re.IGNORECASE):
            unit_label = "bottle"
        elif re.search(r"\bcup\b", lower, re.IGNORECASE):
            unit_label = "cup"
        elif re.search(r"\bjar\b", lower, re.IGNORECASE):
            unit_label = "jar"
        elif re.search(r"\bcan\b", lower, re.IGNORECASE):
            unit_label = "can"

        if size_match:
            try:
                quantity = float(size_match.group(1))
            except ValueError:
                quantity = 1.0
            raw_unit = size_match.group(2).lower().replace("  ", " ").strip()
            if raw_unit in {"count", "ct"}:
                unit_label = "ct"
            elif raw_unit in {"lb", "lbs"}:
                unit_label = "lb"
            elif raw_unit == "ltr":
                unit_label = "l"
            elif raw_unit == "fl oz":
                unit_label = "fl oz"
            else:
                unit_label = raw_unit

    quantity_unit = _unit_type(unit_label)
    cleaned_text = _clean_item_name(text)
    return cleaned_text, quantity, quantity_unit, unit_label


def parse_receipt_lines(text: str) -> list[dict[str, Any]]:
    """Turn raw receipt text into candidate line items."""
    lines = [ln.strip() for ln in text.replace("\r", "\n").split("\n")]
    lines = [ln for ln in lines if ln and len(ln) > 2]

    strict_items: list[dict[str, Any]] = []
    loose_items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for ln in lines:
        if _SKIP.search(ln) or len(ln) > 260:
            continue
        m = _PRICE_END.match(ln)
        if not m:
            continue
        raw_text = m.group(1)
        raw_text, quantity_guess, quantity_unit, unit_label = _extract_quantity_and_measure(raw_text)
        raw_name = _clean_item_name(raw_text)
        if len(raw_name) < 2 or _looks_like_invalid_item(raw_name):
            continue
        key = f"{raw_name.lower()}::{quantity_guess}:{unit_label}"
        if key in seen:
            continue
        seen.add(key)
        strict_items.append(
            {
                "item_name": raw_name,
                "category": _guess_category(raw_name),
                "quantity_guess": quantity_guess,
                "quantity_unit": quantity_unit,
                "unit_label": unit_label,
                "price_text": m.group(2),
            }
        )
        if len(strict_items) >= 80:
            return strict_items

    if len(strict_items) >= 3:
        return strict_items

    for ln in lines:
        if _SKIP.search(ln) or len(ln) > 280:
            continue
        for m in _PRICE_LOOSE.finditer(ln):
            raw_text = m.group(1)
            raw_text, quantity_guess, quantity_unit, unit_label = _extract_quantity_and_measure(raw_text)
            raw_name = _clean_item_name(raw_text)
            if len(raw_name) < 3 or _looks_like_invalid_item(raw_name):
                continue
            key = f"{raw_name.lower()}::{quantity_guess}:{unit_label}"
            if key in seen:
                continue
            seen.add(key)
            loose_items.append(
                {
                    "item_name": raw_name,
                    "category": _guess_category(raw_name),
                    "quantity_guess": quantity_guess,
                    "quantity_unit": quantity_unit,
                    "unit_label": unit_label,
                    "price_text": m.group(2),
                }
            )
            if len(loose_items) >= 80:
                return strict_items + loose_items

    blob = " ".join(lines)
    if len(strict_items) + len(loose_items) < 3:
        for m in _PRICE_LOOSE.finditer(blob):
            raw_text = m.group(1)
            raw_text, quantity_guess, quantity_unit, unit_label = _extract_quantity_and_measure(raw_text)
            raw_name = _clean_item_name(raw_text)
            if len(raw_name) < 3 or _looks_like_invalid_item(raw_name):
                continue
            key = f"{raw_name.lower()}::{quantity_guess}:{unit_label}"
            if key in seen:
                continue
            seen.add(key)
            loose_items.append(
                {
                    "item_name": raw_name,
                    "category": _guess_category(raw_name),
                    "quantity_guess": quantity_guess,
                    "quantity_unit": quantity_unit,
                    "unit_label": unit_label,
                    "price_text": m.group(2),
                }
            )
            if len(loose_items) >= 40:
                break

    return strict_items + loose_items


def _looks_like_ocr_item_start(line: str) -> bool:
    lower = line.lower().strip()
    if not lower or _SKIP.search(lower):
        return False
    if any(x in lower for x in ("promo", "payment", "final total", "tax:", "date", "employee", "order number")):
        return False
    if lower in {"product", "qty", "total"}:
        return False
    if re.match(r"^\d+(?:\.\d+)?\s*(?:lb|1b|ib|tb)\s+[a-z]", lower, re.IGNORECASE):
        return True
    if re.match(r"^\d+\s+[a-z]", lower, re.IGNORECASE):
        return True
    letters = sum(1 for c in line if c.isalpha())
    if letters >= 8 and (re.search(r"\d+\.\d{2}$", line) or "@" in line or re.search(r"(?:lb|1b|ib|tb|ltr)", lower)):
        return True
    return False


def _parse_ocr_item_blocks(text: str) -> list[dict[str, Any]]:
    lines = [_sanitize_ocr_line(ln) for ln in text.replace("\r", "\n").splitlines()]
    lines = [ln for ln in lines if ln and len(ln) > 1]
    items: list[dict[str, Any]] = []
    current: list[str] = []
    seen: set[str] = set()

    def flush_block(block: list[str]) -> None:
        if not block:
            return
        head = block[0]
        lower = head.lower()
        quantity = 1.0
        unit_label = "each"
        quantity_unit = "count"
        name_part = head

        m_weight = re.match(r"^(\d+(?:\.\d+)?)\s*(?:lb|1b|ib|tb)\s+(.+)$", head, re.IGNORECASE)
        m_count = re.match(r"^(\d+)\s+(.+)$", head)
        if m_weight:
            quantity = float(m_weight.group(1))
            unit_label = "lb"
            quantity_unit = "weight"
            name_part = m_weight.group(2)
        elif m_count:
            quantity = float(m_count.group(1))
            unit_label = "each"
            quantity_unit = "count"
            name_part = m_count.group(2)

        parts = [name_part]
        for extra in block[1:]:
            extra_lower = extra.lower()
            if _SKIP.search(extra_lower):
                continue
            if any(x in extra_lower for x in ("promo", "weekend sale", "payment", "final total", "tax:")):
                continue
            if re.search(r"original\s*:\s*\$?\d", extra_lower):
                continue
            if re.match(r"^[\$]?\d+(?:\.\d+)?$", extra_lower):
                continue
            if "@" in extra_lower and any(x in extra_lower for x in ("/lb", "/kg", "/oz", "each")):
                continue
            parts.append(extra)

        raw = " ".join(parts)
        raw = re.sub(r"\$\d+(?:\.\d+)?", " ", raw)
        raw = re.sub(r"@\s*\d+(?:[.,]\d+)?\s*/\s*(?:lb|kg|oz|each)", " ", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\borig(?:inal)?\b.*$", " ", raw, flags=re.IGNORECASE)
        raw = _clean_item_name(raw)
        raw = re.sub(r"\b(?:inal|promo|sale)\b", " ", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s+", " ", raw).strip(" ,;:-")
        if len(raw) < 2 or _looks_like_invalid_item(raw):
            return
        if sum(1 for c in raw if c.isalpha()) < 4:
            return
        if re.search(r"[»~|]", raw):
            return
        key = f"{raw.lower()}::{quantity}:{unit_label}"
        if key in seen:
            return
        seen.add(key)
        items.append({
            "item_name": raw,
            "category": _guess_category(raw),
            "quantity_guess": quantity,
            "quantity_unit": quantity_unit,
            "unit_label": unit_label,
            "price_text": None,
        })

    for ln in lines:
        lower = ln.lower()
        if _looks_like_ocr_item_start(ln):
            flush_block(current)
            current = [ln]
            continue
        if not current:
            continue
        if _SKIP.search(lower):
            flush_block(current)
            current = []
            continue
        current.append(ln)
    flush_block(current)
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
    from PIL import Image, ImageEnhance, ImageOps

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

        configs = (
            "--oem 3 --psm 4",
            "--oem 3 --psm 6",
            "--oem 3 --psm 3",
            "--oem 3 --psm 11",
        )
        chunks: list[str] = []
        for cfg in configs:
            try:
                t = pytesseract.image_to_string(proc, config=cfg)
                if t and len(t.strip()) > 20:
                    chunks.append(t)
            except Exception:
                continue
        if not chunks:
            return ""
        chunks.sort(key=len, reverse=True)
        lines_seen: set[str] = set()
        out_lines: list[str] = []
        for blob in chunks[:2]:
            for ln in blob.splitlines():
                ln = _sanitize_ocr_line(ln)
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

        filename_keywords = {
            "chips": ("snacks", "Chips"),
            "oatmeal": ("carbs", "Oatmeal"),
            "milk": ("dairy", "Milk"),
            "banana": ("fruits", "Bananas"),
            "spinach": ("vegetables", "Spinach"),
            "almond": ("nuts_dry_fruits", "Almonds"),
            "cashew": ("nuts_dry_fruits", "Cashews"),
            "walmart": ("other", "Groceries (Walmart trip)"),
            "target": ("other", "Groceries (Target trip)"),
            "costco": ("other", "Groceries (Costco trip)"),
        }

        name = Path(original_filename).stem.lower()
        tokens = re.split(r"[\s_\-.]+", name)
        hits: list[dict[str, Any]] = []
        for t in tokens:
            if t in filename_keywords:
                cat, pretty = filename_keywords[t]
                hits.append({"item_name": pretty, "category": cat, "quantity_guess": 1, "quantity_unit": "count", "unit_label": "each"})
        if hits:
            return hits[:20], "filename_fallback"
        return ([{"item_name": "Could not read receipt — edit name and qty, or install Tesseract OCR for photos", "category": "other", "quantity_guess": 1, "quantity_unit": "count", "unit_label": "each"}], "filename_fallback")

    if method == "image_ocr":
        items = _parse_ocr_item_blocks(text)
        if len(items) < 4:
            items.extend(parse_receipt_lines(text))
    else:
        items = parse_receipt_lines(text)
    store_guess = _guess_store_name(text[:4000])
    filtered_items = []
    seen_keys: set[str] = set()
    for it in items:
        if is_receipt_noise_candidate(it.get("item_name") or ""):
            continue
        key = f"{(it.get('item_name') or '').lower()}::{it.get('quantity_guess')}::{it.get('unit_label')}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        it["store_name_guess"] = store_guess
        filtered_items.append(it)
    items = filtered_items

    if not items:
        for ln in text.splitlines():
            ln = _sanitize_ocr_line(ln).strip()
            if not (4 <= len(ln) <= 100):
                continue
            if _SKIP.search(ln) or _looks_like_invalid_item(ln):
                continue
            if re.fullmatch(r"[\d\s/:\-.]+", ln):
                continue
            if re.fullmatch(r"\$?\d+\.\d{2}", ln):
                continue
            letters = sum(1 for c in ln if c.isalpha())
            if letters < 3:
                continue
            items.append({"item_name": ln[:200], "category": _guess_category(ln), "quantity_guess": 1, "quantity_unit": "count", "unit_label": "each", "store_name_guess": store_guess})
            if len(items) >= 25:
                break

    for it in items:
        it.setdefault("store_name_guess", store_guess)
        it.setdefault("quantity_unit", "count")
        it.setdefault("unit_label", "each")

    if not items:
        return ([{"item_name": "No line items detected — add details manually below", "category": "other", "quantity_guess": 1, "quantity_unit": "count", "unit_label": "each", "store_name_guess": store_guess}], method)

    return items, method
