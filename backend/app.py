import os
import re
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
)
from flask_sqlalchemy import SQLAlchemy
from werkzeug.datastructures import FileStorage
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from migrate_schema import apply_migrations
from receipt_parse import is_receipt_noise_candidate, parse_receipt_file


APP_ROOT = os.path.dirname(os.path.abspath(__file__))


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def create_app() -> Flask:
    app = Flask(__name__)

    app.config["SECRET_KEY"] = _env("CARTSENSE_SECRET_KEY", secrets.token_hex(16))
    app.config["JWT_SECRET_KEY"] = _env("CARTSENSE_JWT_SECRET_KEY", app.config["SECRET_KEY"])

    db_path = _env("CARTSENSE_DB_PATH", os.path.join(APP_ROOT, "cartsense.db"))
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    app.config["UPLOAD_FOLDER"] = os.path.join(APP_ROOT, "uploads")
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # Frontend is expected to run on Vite default.
    CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}}, supports_credentials=True)

    return app


app = create_app()
db = SQLAlchemy(app)
jwt = JWTManager(app)


CATEGORIES = [
    "carbs",
    "protein",
    "vegetables",
    "fruits",
    "dairy",
    "nuts_dry_fruits",
    "snacks",
    "other",
]

# Simple store catalog for grouping.
DEFAULT_STORES = ["Walmart", "Target", "Costco", "Trader Joe's", "Whole Foods"]

# Receipt parsing is mocked (no OCR). We infer items from filename keywords.
RECEIPT_KEYWORD_MAP = {
    "chips": ("snacks", "Chips"),
    "nuts": ("nuts_dry_fruits", "Mixed Nuts"),
    "sugar": ("snacks", "Sugary Cereal"),
    "cereal": ("carbs", "Cereal"),
    "oatmeal": ("carbs", "Oatmeal"),
    "milk": ("dairy", "Milk"),
    "yogurt": ("dairy", "Yogurt"),
    "cheese": ("dairy", "Cheese"),
    "chicken": ("protein", "Chicken"),
    "beef": ("protein", "Beef"),
    "tofu": ("protein", "Tofu"),
    "spinach": ("vegetables", "Spinach"),
    "broccoli": ("vegetables", "Broccoli"),
    "carrots": ("vegetables", "Carrots"),
    "apple": ("fruits", "Apples"),
    "banana": ("fruits", "Bananas"),
    "berries": ("fruits", "Berries"),
    "salad": ("vegetables", "Salad Mix"),
}

# Category-level rebalance ideas used for insights suggestions.
CATEGORY_REBALANCE_IDEAS = {
    "carbs": ["brown rice", "oats", "whole wheat bread", "tortillas"],
    "protein": ["eggs", "beans", "tofu", "lentils"],
    "vegetables": ["spinach", "broccoli", "carrots", "bell peppers"],
    "fruits": ["bananas", "apples", "berries", "oranges"],
    "dairy": ["milk", "yogurt", "paneer", "cheese"],
    "nuts_dry_fruits": ["almonds", "cashews", "raisins", "mixed nuts"],
    "snacks": ["popcorn", "trail mix", "crackers", "granola bars"],
}

RECEIPT_BRAND_PREFIXES = {
    "laxmi",
    "great value",
    "kirkland",
    "signature",
    "marketside",
    "good & gather",
    "simple truth",
    "trader joe's",
    "trader joes",
    "whole foods",
    "365",
    "organic",
    "usda",
    "a2",
    "member's mark",
}

RECEIPT_SIZE_WORDS = {
    "oz", "ounce", "ounces", "lb", "lbs", "kg", "g", "mg", "ml", "l", "ltr", "pk", "ct", "count", "ea", "each"
}

RECEIPT_NOISE_WORDS = {
    "original", "flavor", "flavored", "ready", "to", "eat", "shelf", "stable", "steamable",
    "no", "added", "sugars", "bulk", "unavailable", "shopped", "sharing", "movie", "theater",
    "done", "right", "thin", "sliced", "organic", "pasteurized", "pulp", "resealable", "plastic",
    "bag", "box", "bottle", "cup", "jar", "can", "frozen", "raw", "jumbo", "tail", "off",
}


RECEIPT_DESCRIPTOR_WORDS = {
    "original", "crunchy", "flavored", "flavour", "snack", "snacks", "ready", "to", "eat", "ready-to-eat",
    "shelf", "stable", "shelf-stable", "resealable", "plastic", "bag", "bags", "box", "bottle", "cup", "jar", "can",
    "done", "right", "thin", "sliced", "organic", "bulk", "unavailable", "sharing", "movie", "theater", "butter",
    "flavor", "pulp", "jumbo", "tail-off", "tail", "off", "frozen", "steamable", "no", "added", "sugars",
    "pasteurized"
}



class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    memberships = db.relationship("HouseholdMember", back_populates="user", cascade="all,delete-orphan")


class Household(db.Model):
    __tablename__ = "households"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    owner = db.relationship("User")
    members = db.relationship("HouseholdMember", back_populates="household", cascade="all,delete-orphan")
    stores = db.relationship("Store", secondary="household_stores", back_populates="households")

    shopping_lists = db.relationship("ShoppingList", back_populates="household")
    purchases = db.relationship("Purchase", back_populates="household")
    inventory_items = db.relationship("InventoryItem", back_populates="household")


class HouseholdMember(db.Model):
    __tablename__ = "household_members"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    role = db.Column(db.String(50), nullable=False, default="member")
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="memberships")
    household = db.relationship("Household", back_populates="members")

    __table_args__ = (db.UniqueConstraint("household_id", "user_id", name="uq_household_member"),)


class InviteToken(db.Model):
    __tablename__ = "invite_tokens"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    invite_email = db.Column(db.String(255), nullable=True, index=True)


class Store(db.Model):
    __tablename__ = "stores"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), unique=True, nullable=False, index=True)

    households = db.relationship("Household", secondary="household_stores", back_populates="stores")


class HouseholdStore(db.Model):
    __tablename__ = "household_stores"
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), primary_key=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), primary_key=True)


class CatalogItem(db.Model):
    __tablename__ = "catalog_items"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    category = db.Column(db.String(50), nullable=False, default="other", index=True)
    preferred_store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (db.UniqueConstraint("name", "category", name="uq_item_name_category"),)


class ShoppingList(db.Model):
    __tablename__ = "shopping_lists"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    status = db.Column(db.String(30), nullable=False, default="active", index=True)  # active/checked_out
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    checked_out_at = db.Column(db.DateTime, nullable=True)
    checked_out_purchase_id = db.Column(db.Integer, db.ForeignKey("purchases.id"), nullable=True)

    household = db.relationship("Household", back_populates="shopping_lists")


class ShoppingListItem(db.Model):
    __tablename__ = "shopping_list_items"
    id = db.Column(db.Integer, primary_key=True)
    shopping_list_id = db.Column(db.Integer, db.ForeignKey("shopping_lists.id"), nullable=False, index=True)
    catalog_item_id = db.Column(db.Integer, db.ForeignKey("catalog_items.id"), nullable=False, index=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    quantity = db.Column(db.Float, nullable=False, default=1)
    quantity_unit = db.Column(db.String(20), nullable=False, default="count")  # count | weight | volume
    unit_label = db.Column(db.String(32), nullable=True)  # e.g. each, lb, lb, oz, ml
    status = db.Column(db.String(30), nullable=False, default="pending", index=True)  # pending/purchased
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    catalog_item = db.relationship("CatalogItem")
    store = db.relationship("Store")

    __table_args__ = (
        db.UniqueConstraint("shopping_list_id", "catalog_item_id", "store_id", "quantity_unit", name="uq_list_item_dedup"),
    )


class Purchase(db.Model):
    __tablename__ = "purchases"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    source = db.Column(db.String(30), nullable=False, default="checkout")  # checkout/receipt
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    receipt_id = db.Column(db.Integer, db.ForeignKey("receipts.id"), nullable=True)

    household = db.relationship("Household", back_populates="purchases")
    purchase_items = db.relationship("PurchaseItem", back_populates="purchase", cascade="all,delete-orphan")


class PurchaseItem(db.Model):
    __tablename__ = "purchase_items"
    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey("purchases.id"), nullable=False, index=True)
    catalog_item_id = db.Column(db.Integer, db.ForeignKey("catalog_items.id"), nullable=False, index=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    quantity = db.Column(db.Float, nullable=False, default=1)

    purchase = db.relationship("Purchase", back_populates="purchase_items")
    catalog_item = db.relationship("CatalogItem")
    store = db.relationship("Store")


class InventoryItem(db.Model):
    __tablename__ = "inventory_items"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    catalog_item_id = db.Column(db.Integer, db.ForeignKey("catalog_items.id"), nullable=False, index=True)
    quantity = db.Column(db.Float, nullable=False, default=0)
    last_purchase_store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=True)

    household = db.relationship("Household", back_populates="inventory_items")
    catalog_item = db.relationship("CatalogItem")
    last_purchase_store = db.relationship("Store", foreign_keys=[last_purchase_store_id])

    __table_args__ = (db.UniqueConstraint("household_id", "catalog_item_id", name="uq_inventory_item"),)


class Receipt(db.Model):
    __tablename__ = "receipts"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(100), nullable=True)
    file_path = db.Column(db.String(512), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="uploaded", index=True)  # uploaded/confirmed
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    confirmed_at = db.Column(db.DateTime, nullable=True)


class ReceiptAlias(db.Model):
    __tablename__ = "receipt_aliases"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    alias_name = db.Column(db.String(255), nullable=False, index=True)
    catalog_item_id = db.Column(db.Integer, db.ForeignKey("catalog_items.id"), nullable=False, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    catalog_item = db.relationship("CatalogItem")

    __table_args__ = (db.UniqueConstraint("household_id", "alias_name", name="uq_receipt_alias_household_name"),)


class EssentialItem(db.Model):
    __tablename__ = "essential_items"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    catalog_item_id = db.Column(db.Integer, db.ForeignKey("catalog_items.id"), nullable=False, index=True)
    threshold_quantity = db.Column(db.Float, nullable=False, default=1)
    email_enabled = db.Column(db.Boolean, nullable=False, default=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    catalog_item = db.relationship("CatalogItem")

    __table_args__ = (db.UniqueConstraint("household_id", "catalog_item_id", name="uq_essential_item_household_item"),)


class HouseholdNotification(db.Model):
    __tablename__ = "household_notifications"
    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False, index=True)
    catalog_item_id = db.Column(db.Integer, db.ForeignKey("catalog_items.id"), nullable=True, index=True)
    notification_type = db.Column(db.String(50), nullable=False, index=True, default="essential_threshold")
    message = db.Column(db.String(500), nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    catalog_item = db.relationship("CatalogItem")


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def get_user_or_404(user_id: int):
    return User.query.filter_by(id=user_id).first()


def current_user() -> User:
    uid = get_jwt_identity()
    user_id = int(uid)
    user = get_user_or_404(user_id)
    return user


def now_utc():
    return datetime.now(timezone.utc)


def to_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_expired(value: Optional[datetime]) -> bool:
    dt = to_utc(value)
    return dt is not None and dt < now_utc()


def iso_or_none(value: Optional[datetime]) -> Optional[str]:
    dt = to_utc(value)
    return dt.isoformat() if dt else None


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def guess_category_from_name(value: str) -> str:
    name = normalize_spaces((value or "").lower())
    if not name:
        return "other"
    if any(x in name for x in ("banana", "apple", "orange", "berry", "grape", "melon", "fruit", "avocado", "mango", "juice")):
        return "fruits"
    if any(x in name for x in ("spinach", "lettuce", "broccoli", "carrot", "tomato", "onion", "pepper", "salad", "kale", "cucumber", "potato", "veg")):
        return "vegetables"
    if any(x in name for x in ("popcorn", "chip", "cookie", "candy", "snack", "soda", "juice drink", "brownie", "ice cream", "corn nuts")):
        return "snacks"
    if any(x in name for x in ("milk", "cheese", "yogurt", "butter", "cream", "curd", "paneer", "half and half")):
        return "dairy"
    if any(x in name for x in ("almond", "almonds", "cashew", "cashews", "pistachio", "pistachios", "walnut", "walnuts", "pecan", "pecans", "hazelnut", "hazelnuts", "raisin", "raisins", "date", "dates", "fig", "figs", "dry fruit", "mixed nuts", "peanut", "peanuts")):
        return "nuts_dry_fruits"
    if any(x in name for x in ("chicken", "beef", "pork", "fish", "salmon", "tofu", "turkey", "egg", "eggs", "lentil", "beans", "shrimp")):
        return "protein"
    if any(x in name for x in ("bread", "rice", "pasta", "cereal", "oat", "flour", "tortilla", "cracker")):
        return "carbs"
    return "other"


def normalize_receipt_name(value: str) -> str:
    name = normalize_spaces(value)
    if not name:
        return ""
    lowered = name.lower()
    lowered = re.sub(r"\bqty\s*\d+(?:\.\d+)?\b", " ", lowered)
    lowered = re.sub(r"\b\d+(?:\.\d+)?\s*(?:oz|ounce|ounces|lb|lbs|kg|g|mg|ml|l|ltr|pk|ct|count|ea|each|gallon)\b(?:\s*(?:bag|box|bottle|pack|packs|cup|jar|can))?", " ", lowered)
    lowered = re.sub(r"\bshopped\b", " ", lowered)
    lowered = re.sub(r"[^a-z0-9'&\-\s]", " ", lowered)
    lowered = normalize_spaces(lowered)
    for prefix in sorted(RECEIPT_BRAND_PREFIXES, key=len, reverse=True):
        if lowered.startswith(prefix + " "):
            lowered = lowered[len(prefix) + 1 :]
            break
    tokens = [tok for tok in lowered.split() if tok not in RECEIPT_SIZE_WORDS and not re.fullmatch(r"\d+(?:\.\d+)?", tok)]
    lowered = normalize_spaces(" ".join(tokens))
    if not lowered:
        lowered = normalize_spaces(name.lower())
    pretty = " ".join(part.capitalize() if part not in {"and", "of"} else part for part in lowered.split())
    return pretty or name[:255]


def receipt_canonical_key(value: str) -> str:
    base = normalize_receipt_name(value).lower()
    base = re.sub(r"[^a-z0-9\s]", " ", base)
    tokens = []
    seen = set()
    for tok in normalize_spaces(base).split():
        if tok in RECEIPT_SIZE_WORDS or tok in RECEIPT_DESCRIPTOR_WORDS:
            continue
        if re.fullmatch(r"\d+(?:\.\d+)?", tok):
            continue
        if len(tok) <= 1:
            continue
        if tok in seen:
            continue
        seen.add(tok)
        tokens.append(tok)
    if not tokens:
        return normalize_spaces(base)
    return normalize_spaces(" ".join(tokens))


def receipt_canonical_tokens(value: str) -> list[str]:
    key = receipt_canonical_key(value)
    return [tok for tok in key.split() if tok]


def canonical_names_match(a: str, b: str) -> bool:
    ka = receipt_canonical_tokens(a)
    kb = receipt_canonical_tokens(b)
    if not ka or not kb:
        return False
    if ka == kb:
        return True
    sa, sb = set(ka), set(kb)
    if sa == sb:
        return True
    overlap = len(sa & sb)
    smaller = min(len(sa), len(sb))
    larger = max(len(sa), len(sb))
    if overlap >= max(2, smaller) and (larger - overlap) <= 1:
        return True
    if smaller >= 3 and overlap >= smaller - 1 and (larger - overlap) <= 1:
        return True
    return False


def find_catalog_item_by_canonical(name: str, category: str | None = None) -> Optional[CatalogItem]:
    key = receipt_canonical_key(name)
    if not key:
        return None
    query = CatalogItem.query
    if category:
        query = query.filter(db.func.lower(CatalogItem.category) == (category or 'other').lower())
    candidates = query.order_by(CatalogItem.id.asc()).all()
    for item in candidates:
        if canonical_names_match(item.name, key):
            return item
    return None


def find_receipt_alias(household_id: int, alias_name: str) -> Optional[ReceiptAlias]:
    alias_name = normalize_spaces(alias_name).lower()
    if not alias_name:
        return None
    return ReceiptAlias.query.filter(ReceiptAlias.household_id == household_id).filter(db.func.lower(ReceiptAlias.alias_name) == alias_name).first()


def upsert_receipt_alias(household_id: int, alias_name: str, catalog_item_id: int, created_by: int) -> None:
    alias_name = normalize_spaces(alias_name)
    if not alias_name:
        return
    existing = find_receipt_alias(household_id, alias_name)
    if existing:
        existing.catalog_item_id = catalog_item_id
        return
    db.session.add(ReceiptAlias(household_id=household_id, alias_name=alias_name, catalog_item_id=catalog_item_id, created_by=created_by))


def resolve_receipt_item(household_id: int, raw_name: str, category: str, store_id: Optional[int] = None):
    raw_name = normalize_spaces(raw_name)
    normalized_name = normalize_receipt_name(raw_name)
    inferred_category = guess_category_from_name(raw_name or normalized_name)
    category = (category or "other").strip().lower()
    if category not in CATEGORIES or category == "other":
        category = inferred_category if inferred_category in CATEGORIES else "other"

    alias = find_receipt_alias(household_id, raw_name) or (find_receipt_alias(household_id, normalized_name) if normalized_name and normalized_name.lower() != raw_name.lower() else None)
    if alias and alias.catalog_item:
        return {
            "catalog_item": alias.catalog_item,
            "item_name": alias.catalog_item.name,
            "category": alias.catalog_item.category,
            "needs_mapping": False,
            "matched_by": "alias",
            "raw_name": raw_name,
        }

    catalog_item = None
    matched_by = None
    if normalized_name and normalized_name.lower() != raw_name.lower():
        catalog_item = find_catalog_item(normalized_name, category=category) or find_catalog_item(normalized_name)
        if catalog_item:
            matched_by = "normalized"

    if not catalog_item:
        catalog_item = find_catalog_item_by_canonical(normalized_name or raw_name, category=category) or find_catalog_item_by_canonical(normalized_name or raw_name)
        if catalog_item:
            matched_by = "canonical"

    if not catalog_item:
        catalog_item = find_catalog_item(raw_name, category=category)
        if catalog_item and catalog_item.category == "other" and category != "other":
            catalog_item.category = category
            matched_by = "exact_upgraded"
        elif catalog_item:
            matched_by = matched_by or "exact"

    if not catalog_item:
        catalog_item = find_catalog_item(raw_name)
        if catalog_item:
            if catalog_item.category == "other" and category != "other":
                catalog_item.category = category
            matched_by = matched_by or "name"

    if catalog_item:
        return {
            "catalog_item": catalog_item,
            "item_name": catalog_item.name,
            "category": catalog_item.category if catalog_item.category in CATEGORIES else category,
            "needs_mapping": False,
            "matched_by": matched_by or "catalog",
            "raw_name": raw_name,
        }

    return {
        "catalog_item": None,
        "item_name": normalized_name or raw_name or "Item",
        "category": category if category in CATEGORIES else "other",
        "needs_mapping": True,
        "matched_by": "unmapped",
        "raw_name": raw_name,
    }


def send_household_notification_email(household_id: int, subject: str, body: str) -> bool:
    smtp_host = _env("CARTSENSE_SMTP_HOST", "").strip()
    smtp_port = int(_env("CARTSENSE_SMTP_PORT", "587") or "587")
    smtp_user = _env("CARTSENSE_SMTP_USER", "").strip()
    smtp_password = _env("CARTSENSE_SMTP_PASSWORD", "").strip()
    from_email = _env("CARTSENSE_FROM_EMAIL", smtp_user).strip()
    if not smtp_host or not from_email:
        return False

    memberships = HouseholdMember.query.filter_by(household_id=household_id).all()
    recipients = [m.user.email for m in memberships if getattr(m, "user", None) and m.user.email]
    if not recipients:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            if smtp_user:
                server.login(smtp_user, smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        return False


def get_single_notification(household_id: int, notification_type: str, catalog_item_id: Optional[int] = None) -> Optional[HouseholdNotification]:
    query = HouseholdNotification.query.filter_by(
        household_id=household_id,
        notification_type=notification_type,
        catalog_item_id=catalog_item_id,
    ).order_by(HouseholdNotification.updated_at.desc(), HouseholdNotification.id.desc())
    notifications = query.all()
    if not notifications:
        return None
    primary = notifications[0]
    for duplicate in notifications[1:]:
        duplicate.is_active = False
        duplicate.is_read = True
        duplicate.updated_at = now_utc()
    return primary


def resolve_purchaser_user_id(household_id: int, requested_user_id: Optional[int], fallback_user_id: int) -> int:
    try:
        candidate = int(requested_user_id) if requested_user_id is not None else fallback_user_id
    except (TypeError, ValueError):
        candidate = fallback_user_id
    if get_household_member(household_id, candidate):
        return candidate
    return fallback_user_id


def evaluate_essential_notifications(household_id: int) -> list[HouseholdNotification]:
    configs = EssentialItem.query.filter_by(household_id=household_id).all()
    for cfg in configs:
        item = cfg.catalog_item
        if not item:
            continue
        inv = InventoryItem.query.filter_by(household_id=household_id, catalog_item_id=cfg.catalog_item_id).first()
        quantity = float(inv.quantity if inv else 0)
        threshold = float(cfg.threshold_quantity or 0)
        if threshold <= 0:
            continue
        notification = get_single_notification(
            household_id=household_id,
            catalog_item_id=cfg.catalog_item_id,
            notification_type="essential_threshold",
        )
        if quantity <= threshold:
            store_name = None
            if item.preferred_store_id:
                st = Store.query.filter_by(id=item.preferred_store_id).first()
                store_name = st.name if st else None
            message = f"{item.name} is low. You have {round(quantity, 2)} left and your reminder threshold is {round(threshold, 2)}."
            if store_name:
                message += f" Preferred store: {store_name}."
            created_now = False
            if not notification:
                notification = HouseholdNotification(
                    household_id=household_id,
                    catalog_item_id=cfg.catalog_item_id,
                    notification_type="essential_threshold",
                    message=message,
                    is_read=False,
                    is_active=True,
                )
                db.session.add(notification)
                created_now = True
            else:
                created_now = not notification.is_active
                notification.message = message
                notification.is_active = True
                notification.updated_at = now_utc()
                if created_now:
                    notification.is_read = False
            if cfg.email_enabled and created_now:
                send_household_notification_email(household_id, f"CartSense reminder: {item.name} is low", message)
        elif notification and notification.is_active:
            notification.is_active = False
            notification.updated_at = now_utc()

    db.session.flush()
    return HouseholdNotification.query.filter_by(household_id=household_id, is_active=True).order_by(HouseholdNotification.updated_at.desc()).all()


def get_household_member(household_id: int, user_id: int) -> bool:
    return HouseholdMember.query.filter_by(household_id=household_id, user_id=user_id).first() is not None


def ensure_store(name: str):
    name = name.strip()
    store = Store.query.filter(db.func.lower(Store.name) == name.lower()).first()
    if store:
        return store
    store = Store(name=name)
    db.session.add(store)
    db.session.commit()
    return store


def ensure_household_store(household_id: int, store_id: int):
    exists = HouseholdStore.query.filter_by(household_id=household_id, store_id=store_id).first()
    if not exists:
        db.session.add(HouseholdStore(household_id=household_id, store_id=store_id))
        db.session.commit()


def find_catalog_item(item_name: str, category: Optional[str] = None):
    if category:
        return (
            CatalogItem.query.filter(db.func.lower(CatalogItem.name) == item_name.lower())
            .filter(db.func.lower(CatalogItem.category) == category.lower())
            .first()
        )
    return CatalogItem.query.filter(db.func.lower(CatalogItem.name) == item_name.lower()).first()


def merge_catalog_items(target: CatalogItem, source: CatalogItem) -> CatalogItem:
    if not target or not source or target.id == source.id:
        return target or source

    if target.preferred_store_id is None and source.preferred_store_id is not None:
        target.preferred_store_id = source.preferred_store_id

    for item in ShoppingListItem.query.filter_by(catalog_item_id=source.id).all():
        existing = ShoppingListItem.query.filter_by(
            shopping_list_id=item.shopping_list_id,
            catalog_item_id=target.id,
            store_id=item.store_id,
            quantity_unit=item.quantity_unit,
        ).first()
        if existing:
            existing.quantity = float(existing.quantity or 0) + float(item.quantity or 0)
            if not existing.unit_label and item.unit_label:
                existing.unit_label = item.unit_label
            if existing.status != item.status:
                existing.status = 'pending' if 'pending' in {existing.status, item.status} else existing.status
            db.session.delete(item)
        else:
            item.catalog_item_id = target.id

    for item in PurchaseItem.query.filter_by(catalog_item_id=source.id).all():
        existing = PurchaseItem.query.filter_by(
            purchase_id=item.purchase_id,
            catalog_item_id=target.id,
            store_id=item.store_id,
        ).first()
        if existing:
            existing.quantity = float(existing.quantity or 0) + float(item.quantity or 0)
            db.session.delete(item)
        else:
            item.catalog_item_id = target.id

    for inv in InventoryItem.query.filter_by(catalog_item_id=source.id).all():
        existing = InventoryItem.query.filter_by(household_id=inv.household_id, catalog_item_id=target.id).first()
        if existing:
            existing.quantity = float(existing.quantity or 0) + float(inv.quantity or 0)
            if existing.last_purchase_store_id is None and inv.last_purchase_store_id is not None:
                existing.last_purchase_store_id = inv.last_purchase_store_id
            db.session.delete(inv)
        else:
            inv.catalog_item_id = target.id

    for alias in ReceiptAlias.query.filter_by(catalog_item_id=source.id).all():
        alias.catalog_item_id = target.id

    for cfg in EssentialItem.query.filter_by(catalog_item_id=source.id).all():
        existing = EssentialItem.query.filter_by(household_id=cfg.household_id, catalog_item_id=target.id).first()
        if existing:
            existing.threshold_quantity = max(float(existing.threshold_quantity or 0), float(cfg.threshold_quantity or 0))
            existing.email_enabled = bool(existing.email_enabled or cfg.email_enabled)
            db.session.delete(cfg)
        else:
            cfg.catalog_item_id = target.id

    for note in HouseholdNotification.query.filter_by(catalog_item_id=source.id).all():
        note.catalog_item_id = target.id

    db.session.delete(source)
    return target


def ensure_catalog_item(name: str, category: str, preferred_store_id: Optional[int] = None):
    normalized_name = normalize_spaces(name)
    normalized_category = (category or "other").strip().lower() or "other"
    inferred_category = guess_category_from_name(normalized_name)
    if normalized_category == "other" and inferred_category != "other":
        normalized_category = inferred_category

    item = (
        CatalogItem.query.filter(db.func.lower(CatalogItem.name) == normalized_name.lower())
        .filter(db.func.lower(CatalogItem.category) == normalized_category.lower())
        .order_by(CatalogItem.id.asc())
        .first()
    )
    if not item:
        item = find_catalog_item_by_canonical(normalized_name, category=normalized_category) or find_catalog_item_by_canonical(normalized_name)
        if item and item.category == "other" and normalized_category != "other":
            item.category = normalized_category
    if not item:
        exact_name_item = (
            CatalogItem.query.filter(db.func.lower(CatalogItem.name) == normalized_name.lower())
            .order_by(CatalogItem.id.asc())
            .first()
        )
        if exact_name_item:
            if exact_name_item.category == "other" and normalized_category != "other":
                duplicate_target = (
                    CatalogItem.query.filter(db.func.lower(CatalogItem.name) == normalized_name.lower())
                    .filter(db.func.lower(CatalogItem.category) == normalized_category.lower())
                    .filter(CatalogItem.id != exact_name_item.id)
                    .order_by(CatalogItem.id.asc())
                    .first()
                )
                if duplicate_target:
                    exact_name_item = merge_catalog_items(duplicate_target, exact_name_item)
                else:
                    exact_name_item.category = normalized_category
            item = exact_name_item

    if item:
        if item.preferred_store_id is None and preferred_store_id:
            item.preferred_store_id = preferred_store_id
        db.session.commit()
        return item

    item = CatalogItem(name=normalized_name, category=normalized_category, preferred_store_id=preferred_store_id)
    db.session.add(item)
    db.session.commit()
    return item


def update_catalog_preferred_store(catalog_item: Optional[CatalogItem], store_id: Optional[int], force: bool = False):
    if not catalog_item or not store_id:
        return
    next_store_id = int(store_id)
    if catalog_item.preferred_store_id is None or force:
        if catalog_item.preferred_store_id != next_store_id:
            catalog_item.preferred_store_id = next_store_id


def repair_catalog_categories():
    changed = False
    items = CatalogItem.query.order_by(CatalogItem.id.asc()).all()
    for item in items:
        if not item or not item.name:
            continue
        inferred = guess_category_from_name(item.name)
        current_category = (item.category or 'other').strip().lower() or 'other'
        if current_category == 'other' and inferred != 'other':
            existing = (
                CatalogItem.query.filter(db.func.lower(CatalogItem.name) == normalize_spaces(item.name).lower())
                .filter(db.func.lower(CatalogItem.category) == inferred.lower())
                .filter(CatalogItem.id != item.id)
                .order_by(CatalogItem.id.asc())
                .first()
            )
            if existing:
                merge_catalog_items(existing, item)
            else:
                item.category = inferred
            changed = True

    dedupe_map = {}
    items = CatalogItem.query.order_by(CatalogItem.id.asc()).all()
    for item in items:
        if not item or not item.name:
            continue
        key = (receipt_canonical_key(item.name), (item.category or 'other').strip().lower() or 'other')
        existing = dedupe_map.get(key)
        if existing and existing.id != item.id:
            merge_catalog_items(existing, item)
            changed = True
        else:
            dedupe_map[key] = item

    items = CatalogItem.query.order_by(CatalogItem.id.asc()).all()
    seen_by_category = {}
    for item in items:
        if not item or not item.name:
            continue
        cat = (item.category or 'other').strip().lower() or 'other'
        bucket = seen_by_category.setdefault(cat, [])
        merged = False
        for existing in bucket:
            if existing.id != item.id and canonical_names_match(existing.name, item.name):
                merge_catalog_items(existing, item)
                changed = True
                merged = True
                break
        if not merged:
            bucket.append(item)

    if changed:
        db.session.commit()


def get_or_create_active_list(household_id: int, created_by: int) -> ShoppingList:
    sl = ShoppingList.query.filter_by(household_id=household_id, status="active").first()
    if sl:
        return sl
    sl = ShoppingList(household_id=household_id, status="active", created_by=created_by)
    db.session.add(sl)
    db.session.commit()
    return sl


def seed_data_once():
    # Seed stores.
    if Store.query.count() == 0:
        for s in DEFAULT_STORES:
            db.session.add(Store(name=s))
        db.session.commit()

    # Seed a basic catalog.
    if CatalogItem.query.count() == 0:
        # Pick a default store for preferred_store_id.
        default_store = Store.query.filter(Store.name == DEFAULT_STORES[0]).first()
        default_store_id = default_store.id if default_store else None
        seed_items = [
            ("Oatmeal", "carbs"),
            ("Cereal", "carbs"),
            ("Whole-grain crackers", "carbs"),
            ("Chicken", "protein"),
            ("Beef", "protein"),
            ("Tofu", "protein"),
            ("Spinach", "vegetables"),
            ("Broccoli", "vegetables"),
            ("Carrots", "vegetables"),
            ("Salad Mix", "vegetables"),
            ("Apples", "fruits"),
            ("Bananas", "fruits"),
            ("Berries", "fruits"),
            ("Milk", "dairy"),
            ("Yogurt", "dairy"),
            ("Cheese", "dairy"),
            ("Chips", "snacks"),
            ("Mixed Nuts", "nuts_dry_fruits"),
            ("Almonds", "nuts_dry_fruits"),
            ("Cashews", "nuts_dry_fruits"),
            ("Sugary Cereal", "snacks"),
        ]
        for item_name, category in seed_items:
            ensure_catalog_item(item_name, category, preferred_store_id=default_store_id)
        # If stores exist, attach household-store mappings for new households later.


@app.before_request
def _ensure_db():
    # Create tables and seed on first run.
    if not hasattr(app, "_db_init_done"):
        db.create_all()
        apply_migrations(db)
        seed_data_once()
        repair_catalog_categories()
        app._db_init_done = True


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "serverTime": iso_or_none(now_utc())})


@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    invite_token = (data.get("invite_token") or "").strip()
    if not email or not password or not name:
        return error("email, password, and name are required", 400)
    if len(password) < 6:
        return error("password must be at least 6 characters", 400)
    if User.query.filter(db.func.lower(User.email) == email).first():
        return error("email already registered", 409)

    if invite_token:
        inv = InviteToken.query.filter_by(token=invite_token).first()
        if not inv:
            return error("invalid invite token", 400)
        if inv.used_at is not None:
            return error("invite token already used", 409)
        if is_expired(inv.expires_at):
            return error("invite token expired", 409)
        if inv.invite_email and inv.invite_email.lower() != email:
            return error("email must match the invited address", 400)

    user = User(email=email, name=name, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()

    if invite_token:
        inv = InviteToken.query.filter_by(token=invite_token).first()
        if inv and inv.used_at is None:
            if not get_household_member(inv.household_id, user.id):
                db.session.add(HouseholdMember(household_id=inv.household_id, user_id=user.id, role="member"))
                inv.used_at = now_utc()
                db.session.commit()
                for st in Store.query.all():
                    ensure_household_store(inv.household_id, st.id)

    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token, "user": {"id": user.id, "email": user.email, "name": user.name}})


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return error("email and password are required", 400)
    user = User.query.filter(db.func.lower(User.email) == email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return error("invalid credentials", 401)
    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token, "user": {"id": user.id, "email": user.email, "name": user.name}})


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def me():
    user = current_user()
    return jsonify({"id": user.id, "email": user.email, "name": user.name})


@app.route("/api/households/me", methods=["GET"])
@jwt_required()
def households_me():
    user = current_user()
    memberships = HouseholdMember.query.filter_by(user_id=user.id).all()
    households = []
    for m in memberships:
        households.append({"id": m.household.id, "name": m.household.name, "role": m.role})
    active_id = households[0]["id"] if households else None
    return jsonify({"households": households, "activeHouseholdId": active_id})


@app.route("/api/households", methods=["POST"])
@jwt_required()
def create_household():
    user = current_user()
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return error("household name is required", 400)
    household = Household(name=name, owner_id=user.id)
    db.session.add(household)
    db.session.commit()

    # Owner membership.
    db.session.add(HouseholdMember(household_id=household.id, user_id=user.id, role="owner"))
    db.session.commit()

    # Default store mapping for convenience.
    all_stores = Store.query.all()
    for st in all_stores:
        ensure_household_store(household.id, st.id)

    return jsonify({"id": household.id, "name": household.name})


@app.route("/api/households/invite", methods=["POST"])
@jwt_required()
def invite_to_household():
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    invite_email = (data.get("email") or "").strip().lower()
    if not household_id or not invite_email:
        return error("household_id and email are required", 400)

    if not get_household_member(int(household_id), user.id):
        return error("not a member of that household", 403)

    token = secrets.token_urlsafe(32)
    expires_at = now_utc() + timedelta(days=7)
    inv = InviteToken(
        household_id=int(household_id),
        token=token,
        created_by=user.id,
        expires_at=expires_at,
        used_at=None,
        invite_email=invite_email,
    )
    db.session.add(inv)
    db.session.commit()
    invite_path = f"/join?token={token}"
    return jsonify(
        {
            "invite_token": token,
            "expiresAt": iso_or_none(expires_at),
            "invitePath": invite_path,
            "inviteEmail": invite_email,
        }
    )


@app.route("/api/public/invite/<token>", methods=["GET"])
def public_invite(token: str):
    inv = InviteToken.query.filter_by(token=token).first()
    if not inv:
        return error("invalid invite token", 404)
    if inv.used_at is not None:
        return error("invite token already used", 410)
    if is_expired(inv.expires_at):
        return error("invite token expired", 410)
    hh = Household.query.filter_by(id=inv.household_id).first()
    if not hh:
        return error("household not found", 404)
    return jsonify(
        {
            "householdId": hh.id,
            "householdName": hh.name,
            "inviteEmail": inv.invite_email,
            "expiresAt": iso_or_none(inv.expires_at),
        }
    )


@app.route("/api/households/accept-invite", methods=["POST"])
@jwt_required()
def accept_invite_authed():
    user = current_user()
    data = request.get_json(force=True)
    token = (data.get("invite_token") or "").strip()
    if not token:
        return error("invite_token is required", 400)

    inv = InviteToken.query.filter_by(token=token).first()
    if not inv:
        return error("invalid invite token", 404)
    if inv.used_at is not None:
        return error("invite token already used", 409)
    if is_expired(inv.expires_at):
        return error("invite token expired", 409)

    if inv.invite_email and inv.invite_email.lower() != user.email.lower():
        return error("this invite was sent to a different email address", 403)

    if get_household_member(inv.household_id, user.id):
        return jsonify({"joined": True})

    db.session.add(HouseholdMember(household_id=inv.household_id, user_id=user.id, role="member"))
    inv.used_at = now_utc()
    db.session.commit()

    # Make sure the household has the default store mappings.
    stores = Store.query.all()
    for st in stores:
        ensure_household_store(inv.household_id, st.id)

    return jsonify({"joined": True, "household_id": inv.household_id})


@app.route("/api/households/<int:household_id>/members", methods=["GET"])
@jwt_required()
def household_members(household_id: int):
    user = current_user()
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    members = (
        HouseholdMember.query.filter_by(household_id=household_id)
        .join(User, HouseholdMember.user_id == User.id)
        .order_by(User.name.asc())
        .all()
    )
    return jsonify(
        {
            "members": [
                {
                    "id": member.user.id,
                    "name": member.user.name,
                    "email": member.user.email,
                    "role": member.role,
                }
                for member in members
                if member.user
            ]
        }
    )


@app.route("/api/households/<int:household_id>/members/<int:member_user_id>", methods=["DELETE"])
@jwt_required()
def household_member_remove(household_id: int, member_user_id: int):
    user = current_user()
    membership = get_household_member(household_id, user.id)
    if not membership:
        return error("not a member of that household", 403)
    if membership.role != "owner":
        return error("only the household owner can remove members", 403)

    target_membership = HouseholdMember.query.filter_by(household_id=household_id, user_id=member_user_id).first()
    if not target_membership:
        return error("member not found", 404)
    if target_membership.role == "owner":
        return error("cannot remove the household owner", 409)

    InviteToken.query.filter_by(household_id=household_id, invite_email=target_membership.user.email.lower()).delete()
    db.session.delete(target_membership)
    db.session.commit()
    return jsonify({"removed": True, "userId": member_user_id})


@app.route("/api/catalog/stores", methods=["GET"])
@jwt_required()
def catalog_stores():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    if not household_id:
        return error("household_id is required", 400)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)
    store_ids = [hs.store_id for hs in HouseholdStore.query.filter_by(household_id=household_id).all()]
    stores = Store.query.filter(Store.id.in_(store_ids)).order_by(Store.name.asc()).all() if store_ids else []
    return jsonify({"stores": [{"id": s.id, "name": s.name} for s in stores]})


@app.route("/api/catalog/items", methods=["GET"])
@jwt_required()
def catalog_items():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    query_text = (request.args.get("query") or "").strip()
    category = request.args.get("category")
    limit = request.args.get("limit", type=int) or (25 if query_text else 250)
    limit = max(1, min(limit, 500))
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    q = CatalogItem.query
    if query_text:
        q = q.filter(db.func.lower(CatalogItem.name).like(f"%{query_text.lower()}%"))
    if category:
        q = q.filter(db.func.lower(CatalogItem.category) == category.lower())

    items = q.order_by(CatalogItem.name.asc()).limit(limit).all()
    return jsonify(
        {
            "items": [
                {
                    "id": i.id,
                    "name": i.name,
                    "category": i.category,
                    "preferredStoreId": i.preferred_store_id,
                    "preferredStoreName": Store.query.filter_by(id=i.preferred_store_id).first().name if i.preferred_store_id else None,
                }
                for i in items
            ]
        }
    )


@app.route("/api/mappings/overview", methods=["GET"])
@jwt_required()
def mappings_overview():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    alias_counts = {}
    household_catalog_ids = set()
    for alias in ReceiptAlias.query.filter_by(household_id=household_id).all():
        alias_counts[alias.catalog_item_id] = alias_counts.get(alias.catalog_item_id, 0) + 1
        household_catalog_ids.add(alias.catalog_item_id)

    household_catalog_ids.update([row.catalog_item_id for row in InventoryItem.query.filter_by(household_id=household_id).all()])
    household_catalog_ids.update([row.catalog_item_id for row in EssentialItem.query.filter_by(household_id=household_id).all()])

    for sl in ShoppingList.query.filter_by(household_id=household_id).all():
        household_catalog_ids.update([row.catalog_item_id for row in ShoppingListItem.query.filter_by(shopping_list_id=sl.id).all()])
    for purchase in Purchase.query.filter_by(household_id=household_id).all():
        household_catalog_ids.update([row.catalog_item_id for row in PurchaseItem.query.filter_by(purchase_id=purchase.id).all()])

    items_query = CatalogItem.query
    if household_catalog_ids:
        items_query = items_query.filter(CatalogItem.id.in_(list(household_catalog_ids)))
    items = items_query.order_by(CatalogItem.name.asc()).all()
    aliases = (
        ReceiptAlias.query.filter_by(household_id=household_id)
        .join(CatalogItem, ReceiptAlias.catalog_item_id == CatalogItem.id)
        .order_by(ReceiptAlias.alias_name.asc())
        .all()
    )
    return jsonify({
        "items": [
            {
                "id": item.id,
                "name": item.name,
                "category": item.category,
                "preferredStoreId": item.preferred_store_id,
                "preferredStoreName": Store.query.filter_by(id=item.preferred_store_id).first().name if item.preferred_store_id else None,
                "aliasCount": alias_counts.get(item.id, 0),
            }
            for item in items
        ],
        "aliases": [
            {
                "id": alias.id,
                "aliasName": alias.alias_name,
                "catalogItemId": alias.catalog_item_id,
                "itemName": alias.catalog_item.name if alias.catalog_item else None,
                "category": alias.catalog_item.category if alias.catalog_item else "other",
                "preferredStoreId": alias.catalog_item.preferred_store_id if alias.catalog_item else None,
                "preferredStoreName": Store.query.filter_by(id=alias.catalog_item.preferred_store_id).first().name if alias.catalog_item and alias.catalog_item.preferred_store_id else None,
            }
            for alias in aliases
        ],
    })


@app.route("/api/catalog/items/<int:item_id>", methods=["PATCH"])
@jwt_required()
def catalog_item_update(item_id: int):
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(int(household_id), user.id):
        return error("not a member of that household", 403)

    item = CatalogItem.query.filter_by(id=item_id).first()
    if not item:
        return error("catalog item not found", 404)

    next_name = normalize_spaces(data.get("name") or item.name)
    next_category = (data.get("category") or item.category or "other").strip().lower()
    if next_category not in CATEGORIES:
        next_category = guess_category_from_name(next_name)
    if next_category not in CATEGORIES:
        next_category = "other"

    preferred_store_present = "preferred_store_id" in data
    preferred_store_id = data.get("preferred_store_id") if preferred_store_present else item.preferred_store_id
    if preferred_store_present:
        if preferred_store_id in (None, "", 0, "0"):
            preferred_store_id = None
        else:
            store = Store.query.filter_by(id=int(preferred_store_id)).first()
            if not store:
                return error("invalid preferred_store_id", 400)
            preferred_store_id = store.id

    duplicate = (
        CatalogItem.query.filter(db.func.lower(CatalogItem.name) == next_name.lower())
        .filter(db.func.lower(CatalogItem.category) == next_category.lower())
        .filter(CatalogItem.id != item.id)
        .order_by(CatalogItem.id.asc())
        .first()
    )
    target = item
    if duplicate:
        target = merge_catalog_items(duplicate, item)
    target.name = next_name
    target.category = next_category
    if preferred_store_present:
        target.preferred_store_id = preferred_store_id
    db.session.commit()
    return jsonify({
        "item": {
            "id": target.id,
            "name": target.name,
            "category": target.category,
            "preferredStoreId": target.preferred_store_id,
            "preferredStoreName": Store.query.filter_by(id=target.preferred_store_id).first().name if target.preferred_store_id else None,
        }
    })


@app.route("/api/receipt-aliases/<int:alias_id>", methods=["PATCH"])
@jwt_required()
def receipt_alias_update(alias_id: int):
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    if household_id is None:
        return error("household_id is required", 400)
    household_id = int(household_id)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    alias = ReceiptAlias.query.filter_by(id=alias_id, household_id=household_id).first()
    if not alias:
        return error("receipt alias not found", 404)

    alias_name = normalize_spaces(data.get("alias_name") or alias.alias_name)
    if not alias_name:
        return error("alias_name is required", 400)

    item_name = normalize_spaces(data.get("item_name") or (alias.catalog_item.name if alias.catalog_item else ""))
    if not item_name:
        return error("item_name is required", 400)
    category = (data.get("category") or (alias.catalog_item.category if alias.catalog_item else "other") or "other").strip().lower()
    if category not in CATEGORIES:
        category = guess_category_from_name(item_name)
    if category not in CATEGORIES:
        category = "other"

    mapped_item = ensure_catalog_item(item_name, category=category)
    if "preferred_store_id" in data:
        preferred_store_id = data.get("preferred_store_id")
        if preferred_store_id in (None, "", 0, "0"):
            mapped_item.preferred_store_id = None
        else:
            store = Store.query.filter_by(id=int(preferred_store_id)).first()
            if not store:
                return error("invalid preferred_store_id", 400)
            mapped_item.preferred_store_id = store.id

    existing_alias = ReceiptAlias.query.filter_by(household_id=household_id, alias_name=alias_name).first()
    if existing_alias and existing_alias.id != alias.id:
        existing_alias.catalog_item_id = mapped_item.id
        db.session.delete(alias)
        target_alias = existing_alias
    else:
        alias.alias_name = alias_name
        alias.catalog_item_id = mapped_item.id
        target_alias = alias

    db.session.commit()
    return jsonify({
        "alias": {
            "id": target_alias.id,
            "aliasName": target_alias.alias_name,
            "catalogItemId": target_alias.catalog_item_id,
            "itemName": mapped_item.name,
            "category": mapped_item.category,
            "preferredStoreId": mapped_item.preferred_store_id,
            "preferredStoreName": Store.query.filter_by(id=mapped_item.preferred_store_id).first().name if mapped_item.preferred_store_id else None,
        }
    })


@app.route("/api/shopping-list/active", methods=["GET"])
@jwt_required()
def shopping_list_active():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    sl = ShoppingList.query.filter_by(household_id=household_id, status="active").first()
    if not sl:
        sl = ShoppingList(household_id=household_id, status="active", created_by=user.id)
        db.session.add(sl)
        db.session.commit()

    items = (
        ShoppingListItem.query.join(Store, ShoppingListItem.store_id == Store.id)
        .join(CatalogItem, ShoppingListItem.catalog_item_id == CatalogItem.id)
        .filter(ShoppingListItem.shopping_list_id == sl.id)
        .filter(ShoppingListItem.status == "pending")
        .order_by(Store.name.asc(), CatalogItem.name.asc())
        .all()
    )
    out_items = []
    for it in items:
        store_name = it.store.name if it.store else None
        out_items.append(
            {
                "id": it.id,
                "catalogItemId": it.catalog_item_id,
                "itemName": it.catalog_item.name,
                "category": it.catalog_item.category,
                "storeId": it.store_id,
                "storeName": store_name,
                "quantity": it.quantity,
                "quantityUnit": it.quantity_unit,
                "unitLabel": it.unit_label
                or ({"count": "each", "weight": "lb", "volume": "ml"}.get(it.quantity_unit, "each")),
                "status": it.status,
            }
        )
    return jsonify({"shoppingList": {"id": sl.id, "status": sl.status}, "items": out_items})


@app.route("/api/shopping-list/items", methods=["POST"])
@jwt_required()
def shopping_list_add_item():
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    try:
        quantity = float(data.get("quantity") or 1)
    except (TypeError, ValueError):
        return error("quantity must be a number", 400)
    quantity_unit = (data.get("quantity_unit") or "count").strip().lower()
    unit_label = (data.get("unit_label") or "").strip() or None
    store_id = data.get("store_id")
    catalog_item_id = data.get("catalog_item_id")
    item_name = (data.get("item_name") or "").strip()
    category = (data.get("category") or "other").strip().lower()

    if household_id is None:
        return error("household_id is required", 400)
    if quantity <= 0:
        return error("quantity must be > 0", 400)
    if quantity_unit not in ("count", "weight", "volume"):
        return error("quantity_unit must be count, weight, or volume", 400)
    if not unit_label:
        unit_label = {"count": "each", "weight": "lb", "volume": "ml"}.get(quantity_unit, "each")
    if store_id is None:
        return error("store_id is required", 400)
    if not get_household_member(int(household_id), user.id):
        return error("not a member of that household", 403)

    sl = get_or_create_active_list(int(household_id), user.id)

    store = Store.query.filter_by(id=int(store_id)).first()
    if not store:
        return error("invalid store_id", 400)
    ensure_household_store(int(household_id), store.id)

    catalog_item = None
    if catalog_item_id:
        catalog_item = CatalogItem.query.filter_by(id=int(catalog_item_id)).first()
        if not catalog_item:
            return error("invalid catalog_item_id", 400)
    else:
        if not item_name:
            return error("item_name is required when catalog_item_id is missing", 400)
        # Create new catalog item on demand.
        catalog_item = ensure_catalog_item(item_name, category=category)
        # Best-effort: keep the household-store mapping.
        ensure_household_store(int(household_id), store.id)


    # Deduplicate pending items by (catalog_item_id, store_id, quantity_unit).
    existing = (
        ShoppingListItem.query.filter_by(
            shopping_list_id=sl.id,
            catalog_item_id=catalog_item.id,
            store_id=store.id,
            quantity_unit=quantity_unit,
        )
        .first()
    )
    if existing:
        existing.quantity += quantity
        db.session.commit()
        return jsonify({"id": existing.id, "quantity": existing.quantity})

    item = ShoppingListItem(
        shopping_list_id=sl.id,
        catalog_item_id=catalog_item.id,
        store_id=store.id,
        quantity=quantity,
        quantity_unit=quantity_unit,
        unit_label=unit_label,
        status="pending",
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"id": item.id, "quantity": item.quantity})


@app.route("/api/shopping-list/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
def shopping_list_delete_item(item_id: int):
    user = current_user()
    # Resolve membership from list ownership.
    item = ShoppingListItem.query.filter_by(id=item_id).first()
    if not item:
        return error("item not found", 404)
    sl = ShoppingList.query.filter_by(id=item.shopping_list_id).first()
    if not sl or not get_household_member(sl.household_id, user.id):
        return error("not allowed", 403)
    if item.status != "pending":
        return error("cannot delete purchased items", 409)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"deleted": True})


@app.route("/api/shopping-list/items/<int:item_id>", methods=["PATCH"])
@jwt_required()
def shopping_list_update_item(item_id: int):
    user = current_user()
    item = ShoppingListItem.query.filter_by(id=item_id).first()
    if not item:
        return error("item not found", 404)

    sl = ShoppingList.query.filter_by(id=item.shopping_list_id).first()
    if not sl or not get_household_member(sl.household_id, user.id):
        return error("not allowed", 403)
    if item.status != "pending":
        return error("cannot edit purchased items", 409)

    data = request.get_json(force=True)
    try:
        quantity = float(data.get("quantity") if data.get("quantity") is not None else item.quantity)
    except (TypeError, ValueError):
        return error("quantity must be a number", 400)
    if quantity <= 0:
        return error("quantity must be > 0", 400)

    quantity_unit = (data.get("quantity_unit") or item.quantity_unit or "count").strip().lower()
    if quantity_unit not in ("count", "weight", "volume"):
        return error("quantity_unit must be count, weight, or volume", 400)
    unit_label = (data.get("unit_label") or item.unit_label or "").strip() or {"count": "each", "weight": "lb", "volume": "ml"}.get(quantity_unit, "each")

    store_id = int(data.get("store_id") or item.store_id)
    store = Store.query.filter_by(id=store_id).first()
    if not store:
        return error("invalid store_id", 400)
    ensure_household_store(sl.household_id, store.id)

    item_name = (data.get("item_name") or item.catalog_item.name).strip()
    category = (data.get("category") or item.catalog_item.category or "other").strip().lower()
    catalog_item_id = data.get("catalog_item_id")
    if catalog_item_id:
        catalog_item = CatalogItem.query.filter_by(id=int(catalog_item_id)).first()
        if not catalog_item:
            return error("invalid catalog_item_id", 400)
    else:
        catalog_item = ensure_catalog_item(item_name, category=category)

    duplicate = (
        ShoppingListItem.query.filter_by(
            shopping_list_id=item.shopping_list_id,
            catalog_item_id=catalog_item.id,
            store_id=store.id,
            quantity_unit=quantity_unit,
            status="pending",
        )
        .filter(ShoppingListItem.id != item.id)
        .first()
    )
    if duplicate:
        duplicate.quantity += quantity
        duplicate.unit_label = unit_label
        db.session.delete(item)
        db.session.commit()
        return jsonify({"id": duplicate.id, "quantity": duplicate.quantity, "merged": True})

    item.catalog_item_id = catalog_item.id
    item.store_id = store.id
    item.quantity = quantity
    item.quantity_unit = quantity_unit
    item.unit_label = unit_label
    db.session.commit()
    return jsonify({"id": item.id, "quantity": item.quantity, "updated": True})


@app.route("/api/shopping-list/checkout", methods=["POST"])
@jwt_required()
def shopping_list_checkout():
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(int(household_id), user.id):
        return error("not a member of that household", 403)

    sl = ShoppingList.query.filter_by(household_id=int(household_id), status="active").first()
    if not sl:
        return error("no active shopping list", 404)

    if sl.checked_out_purchase_id is not None:
        return jsonify({"alreadyCheckedOut": True, "purchaseId": sl.checked_out_purchase_id})

    pending_items = (
        ShoppingListItem.query.filter_by(shopping_list_id=sl.id)
        .filter(ShoppingListItem.status == "pending")
        .all()
    )
    if not pending_items:
        return error("shopping list is empty", 400)

    purchaser_user_id = resolve_purchaser_user_id(int(household_id), data.get("purchaser_user_id"), user.id)
    purchase = Purchase(household_id=int(household_id), created_by=purchaser_user_id, source="checkout", receipt_id=None)
    db.session.add(purchase)
    db.session.flush()  # get purchase.id

    # Update inventory and record purchase items.
    for it in pending_items:
        # Inventory increases by purchased quantity.
        inv = InventoryItem.query.filter_by(household_id=int(household_id), catalog_item_id=it.catalog_item_id).first()
        if not inv:
            inv = InventoryItem(household_id=int(household_id), catalog_item_id=it.catalog_item_id, quantity=0)
            db.session.add(inv)
            db.session.flush()
        inv.quantity += float(it.quantity)
        inv.last_purchase_store_id = it.store_id

        pi = PurchaseItem(
            purchase_id=purchase.id,
            catalog_item_id=it.catalog_item_id,
            store_id=it.store_id,
            quantity=float(it.quantity),
        )
        db.session.add(pi)

        it.status = "purchased"

    sl.status = "checked_out"
    sl.checked_out_at = now_utc()
    sl.checked_out_purchase_id = purchase.id

    evaluate_essential_notifications(int(household_id))
    db.session.commit()
    return jsonify(
        {
            "purchaseId": purchase.id,
            "purchasedCount": len(pending_items),
        }
    )


@app.route("/api/inventory", methods=["GET"])
@jwt_required()
def inventory_get():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    purchaser_user_id = request.args.get("purchaser_user_id", type=int)
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(int(household_id), user.id):
        return error("not a member of that household", 403)

    essential_map = {cfg.catalog_item_id: cfg for cfg in EssentialItem.query.filter_by(household_id=int(household_id)).all()}
    inv_items = InventoryItem.query.filter_by(household_id=int(household_id)).all()
    inv_map = {inv.catalog_item_id: inv for inv in inv_items}
    catalog_ids = set(inv_map.keys()) | set(essential_map.keys())

    latest_purchase_rows = (
        PurchaseItem.query.join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(Purchase.household_id == int(household_id))
        .order_by(Purchase.created_at.desc(), PurchaseItem.id.desc())
        .all()
    )
    latest_purchase_by_item = {}
    for row in latest_purchase_rows:
        if row.catalog_item_id not in latest_purchase_by_item:
            latest_purchase_by_item[row.catalog_item_id] = row

    out = []
    for catalog_item_id in catalog_ids:
        item = CatalogItem.query.filter_by(id=catalog_item_id).first()
        if not item:
            continue
        inv = inv_map.get(catalog_item_id)
        quantity = float(inv.quantity if inv else 0)
        if quantity <= 0 and catalog_item_id not in essential_map:
            continue
        preferred_store_name = None
        if item.preferred_store_id:
            st = Store.query.filter_by(id=item.preferred_store_id).first()
            preferred_store_name = st.name if st else None
        last_store_name = None
        if inv and inv.last_purchase_store_id:
            ls = Store.query.filter_by(id=inv.last_purchase_store_id).first()
            last_store_name = ls.name if ls else None
        essential_cfg = essential_map.get(catalog_item_id)
        latest_purchase = latest_purchase_by_item.get(catalog_item_id)
        last_purchased_by_user_id = None
        last_purchased_by_name = None
        last_purchase_at = None
        if latest_purchase and latest_purchase.purchase:
            last_purchased_by_user_id = latest_purchase.purchase.created_by
            purchaser = User.query.filter_by(id=latest_purchase.purchase.created_by).first()
            last_purchased_by_name = purchaser.name if purchaser else None
            last_purchase_at = iso_or_none(latest_purchase.purchase.created_at)
        if purchaser_user_id and last_purchased_by_user_id != purchaser_user_id:
            continue
        out.append(
            {
                "catalogItemId": item.id,
                "itemName": item.name,
                "category": item.category,
                "quantity": quantity,
                "preferredStoreId": item.preferred_store_id,
                "preferredStoreName": preferred_store_name,
                "lastPurchaseStoreName": last_store_name,
                "lastPurchasedByUserId": last_purchased_by_user_id,
                "lastPurchasedByName": last_purchased_by_name,
                "lastPurchaseAt": last_purchase_at,
                "essentialThreshold": float(essential_cfg.threshold_quantity) if essential_cfg else None,
                "essentialEmailEnabled": bool(essential_cfg.email_enabled) if essential_cfg else False,
            }
        )
    out.sort(key=lambda x: x["itemName"].lower())
    return jsonify({"inventory": out})


@app.route("/api/inventory/<int:catalog_item_id>", methods=["PATCH"])
@jwt_required()
def inventory_update_item(catalog_item_id: int):
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    if household_id is None:
        return error("household_id is required", 400)
    household_id = int(household_id)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    catalog_item = CatalogItem.query.filter_by(id=catalog_item_id).first()
    if not catalog_item:
        return error("catalog item not found", 404)

    try:
        quantity = float(data.get("quantity"))
    except (TypeError, ValueError):
        return error("quantity must be a number", 400)
    if quantity < 0:
        return error("quantity must be >= 0", 400)

    inv = InventoryItem.query.filter_by(household_id=household_id, catalog_item_id=catalog_item_id).first()
    if not inv:
        inv = InventoryItem(household_id=household_id, catalog_item_id=catalog_item_id, quantity=0)
        db.session.add(inv)

    if "preferred_store_id" in data:
        preferred_store_id = data.get("preferred_store_id")
        if preferred_store_id in (None, "", 0, "0"):
            update_catalog_preferred_store(catalog_item, None, force=True)
        else:
            store = Store.query.filter_by(id=int(preferred_store_id)).first()
            if not store:
                return error("invalid preferred_store_id", 400)
            ensure_household_store(household_id, store.id)
            update_catalog_preferred_store(catalog_item, store.id, force=True)

    inv.quantity = quantity
    evaluate_essential_notifications(household_id)
    db.session.commit()

    preferred_store_name = None
    if catalog_item.preferred_store_id:
        st = Store.query.filter_by(id=catalog_item.preferred_store_id).first()
        preferred_store_name = st.name if st else None
    last_store_name = None
    if inv.last_purchase_store_id:
        ls = Store.query.filter_by(id=inv.last_purchase_store_id).first()
        last_store_name = ls.name if ls else None
    essential_cfg = EssentialItem.query.filter_by(household_id=household_id, catalog_item_id=catalog_item.id).first()

    return jsonify(
        {
            "catalogItemId": catalog_item.id,
            "itemName": catalog_item.name,
            "category": catalog_item.category,
            "quantity": inv.quantity,
            "preferredStoreId": catalog_item.preferred_store_id,
            "preferredStoreName": preferred_store_name,
            "lastPurchaseStoreName": last_store_name,
            "essentialThreshold": float(essential_cfg.threshold_quantity) if essential_cfg else None,
            "essentialEmailEnabled": bool(essential_cfg.email_enabled) if essential_cfg else False,
        }
    )


@app.route("/api/essentials", methods=["GET"])
@jwt_required()
def essentials_get():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    configs = EssentialItem.query.filter_by(household_id=household_id).all()
    out = []
    for cfg in configs:
        item = cfg.catalog_item
        inv = InventoryItem.query.filter_by(household_id=household_id, catalog_item_id=cfg.catalog_item_id).first()
        out.append(
            {
                "catalogItemId": cfg.catalog_item_id,
                "itemName": item.name if item else f"Item {cfg.catalog_item_id}",
                "category": item.category if item else "other",
                "thresholdQuantity": float(cfg.threshold_quantity),
                "emailEnabled": bool(cfg.email_enabled),
                "currentQuantity": float(inv.quantity if inv else 0),
            }
        )
    out.sort(key=lambda x: x["itemName"].lower())
    return jsonify({"essentials": out})


@app.route("/api/essentials/<int:catalog_item_id>", methods=["PUT"])
@jwt_required()
def essential_upsert(catalog_item_id: int):
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    if household_id is None:
        return error("household_id is required", 400)
    household_id = int(household_id)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    catalog_item = CatalogItem.query.filter_by(id=catalog_item_id).first()
    if not catalog_item:
        return error("catalog item not found", 404)

    try:
        threshold = float(data.get("threshold_quantity") or 0)
    except (TypeError, ValueError):
        return error("threshold_quantity must be a number", 400)
    email_enabled = bool(data.get("email_enabled", False))

    existing = EssentialItem.query.filter_by(household_id=household_id, catalog_item_id=catalog_item_id).first()
    if threshold <= 0:
        if existing:
            db.session.delete(existing)
            for notif in HouseholdNotification.query.filter_by(household_id=household_id, catalog_item_id=catalog_item_id, notification_type="essential_threshold").all():
                notif.is_active = False
                notif.updated_at = now_utc()
            db.session.commit()
        return jsonify({"removed": True})

    if not existing:
        existing = EssentialItem(
            household_id=household_id,
            catalog_item_id=catalog_item_id,
            threshold_quantity=threshold,
            email_enabled=email_enabled,
            created_by=user.id,
        )
        db.session.add(existing)
    else:
        existing.threshold_quantity = threshold
        existing.email_enabled = email_enabled
        existing.updated_at = now_utc()

    evaluate_essential_notifications(household_id)
    db.session.commit()
    inv = InventoryItem.query.filter_by(household_id=household_id, catalog_item_id=catalog_item_id).first()
    return jsonify(
        {
            "catalogItemId": catalog_item_id,
            "itemName": catalog_item.name,
            "thresholdQuantity": float(existing.threshold_quantity),
            "emailEnabled": bool(existing.email_enabled),
            "currentQuantity": float(inv.quantity if inv else 0),
        }
    )


@app.route("/api/notifications", methods=["GET"])
@jwt_required()
def notifications_get():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)

    evaluate_essential_notifications(household_id)
    db.session.commit()
    notifications = HouseholdNotification.query.filter_by(household_id=household_id, is_active=True).order_by(HouseholdNotification.is_read.asc(), HouseholdNotification.updated_at.desc()).all()
    seen_keys = set()
    deduped_notifications = []
    for note in notifications:
        key = (note.notification_type, note.catalog_item_id)
        if key in seen_keys:
            note.is_active = False
            note.is_read = True
            note.updated_at = now_utc()
            continue
        seen_keys.add(key)
        deduped_notifications.append(note)
    notifications = deduped_notifications[:20]
    db.session.commit()
    return jsonify({
        "notifications": [
            {
                "id": n.id,
                "catalogItemId": n.catalog_item_id,
                "message": n.message,
                "type": n.notification_type,
                "isRead": bool(n.is_read),
                "createdAt": iso_or_none(n.created_at),
                "updatedAt": iso_or_none(n.updated_at),
            }
            for n in notifications
        ]
    })


@app.route("/api/notifications/<int:notification_id>", methods=["PATCH"])
@jwt_required()
def notification_patch(notification_id: int):
    user = current_user()
    data = request.get_json(force=True)
    household_id = data.get("household_id")
    if household_id is None:
        return error("household_id is required", 400)
    household_id = int(household_id)
    if not get_household_member(household_id, user.id):
        return error("not a member of that household", 403)
    notification = HouseholdNotification.query.filter_by(id=notification_id, household_id=household_id).first()
    if not notification:
        return error("notification not found", 404)
    if "is_read" in data:
        notification.is_read = bool(data.get("is_read"))
    db.session.commit()
    return jsonify({"id": notification.id, "isRead": bool(notification.is_read)})


def _save_uploaded_file(file: FileStorage) -> tuple[str, str]:
    uploads = app.config["UPLOAD_FOLDER"]
    filename = secure_filename(file.filename or "upload")
    unique = f"{datetime.utcnow().timestamp()}_{secrets.token_hex(8)}_{filename}"
    file_path = os.path.join(uploads, unique)
    file.save(file_path)
    return unique, file_path


@app.route("/api/receipts/upload", methods=["POST"])
@jwt_required()
def receipts_upload():
    user = current_user()
    household_id = request.form.get("household_id", type=int)
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(int(household_id), user.id):
        return error("not a member of that household", 403)

    receipt_file = request.files.get("file")
    if not receipt_file:
        return error("file is required", 400)

    filename, file_path = _save_uploaded_file(receipt_file)

    receipt = Receipt(
        household_id=int(household_id),
        uploaded_by=user.id,
        filename=filename,
        mime_type=receipt_file.mimetype,
        file_path=file_path,
        status="uploaded",
    )
    db.session.add(receipt)
    db.session.commit()

    parsed, parse_method = parse_receipt_file(file_path, receipt_file.mimetype, receipt_file.filename or filename)
    store_name_guess = None
    for p in parsed:
        if p.get("store_name_guess"):
            store_name_guess = p.get("store_name_guess")
            break
    if not store_name_guess:
        store_name_guess = DEFAULT_STORES[0]
    store = ensure_store(store_name_guess)
    ensure_household_store(int(household_id), store.id)

    parsed_items = []
    for p in parsed:
        category = (p.get("category") or "other").lower()
        raw_name = normalize_spaces(p.get("item_name") or "Item")
        if is_receipt_noise_candidate(raw_name):
            continue
        resolved = resolve_receipt_item(int(household_id), raw_name, category, store.id)
        qg = p.get("quantity_guess") or 1
        try:
            qg = float(qg)
        except (TypeError, ValueError):
            qg = 1.0
        parsed_items.append(
            {
                "catalogItemId": resolved["catalog_item"].id if resolved["catalog_item"] else None,
                "rawName": resolved["raw_name"],
                "itemName": resolved["item_name"],
                "category": resolved["category"],
                "quantityGuess": qg,
                "quantityUnit": p.get("quantity_unit") or "count",
                "unitLabel": p.get("unit_label") or "each",
                "needsMapping": bool(resolved["needs_mapping"]),
                "matchedBy": resolved["matched_by"],
            }
        )

    return jsonify({
        "receiptId": receipt.id,
        "parsedItems": parsed_items,
        "parseMethod": parse_method,
        "receiptStoreId": store.id,
        "receiptStoreName": store.name,
    })


@app.route("/api/receipts/<int:receipt_id>/confirm", methods=["POST"])
@jwt_required()
def receipts_confirm(receipt_id: int):
    user = current_user()
    receipt = Receipt.query.filter_by(id=receipt_id).first()
    if not receipt:
        return error("receipt not found", 404)
    if receipt.status != "uploaded":
        return error("receipt already confirmed", 409)
    if not get_household_member(receipt.household_id, user.id):
        return error("not allowed", 403)

    data = request.get_json(force=True)
    items = data.get("items") or []
    if not isinstance(items, list) or not items:
        return error("items must be a non-empty list", 400)

    default_store_id = data.get("store_id")
    if not default_store_id:
        return error("store_id is required", 400)
    default_store_id = int(default_store_id)
    default_store = Store.query.filter_by(id=default_store_id).first()
    if not default_store:
        return error("invalid store_id", 400)

    purchaser_user_id = resolve_purchaser_user_id(receipt.household_id, data.get("purchaser_user_id"), user.id)
    purchase = Purchase(
        household_id=receipt.household_id,
        created_by=purchaser_user_id,
        source="receipt",
        receipt_id=receipt.id,
    )
    db.session.add(purchase)
    db.session.flush()

    for entry in items:
        try:
            quantity = float(entry.get("quantity") or 1)
        except (TypeError, ValueError):
            return error("each item needs a numeric quantity", 400)
        if quantity <= 0:
            continue

        store_id = int(entry.get("store_id") or default_store_id)
        store = Store.query.filter_by(id=store_id).first()
        if not store:
            return error("invalid store_id", 400)

        category = (entry.get("category") or "other").strip().lower()
        raw_name = normalize_spaces(entry.get("raw_name") or entry.get("item_name") or "")
        item_name = normalize_spaces(entry.get("item_name") or "")
        candidate_name = item_name or raw_name
        if not candidate_name and not entry.get("catalog_item_id"):
            return error("item_name or catalog_item_id is required", 400)
        if candidate_name and is_receipt_noise_candidate(candidate_name):
            continue

        catalog_item_id = entry.get("catalog_item_id")
        if catalog_item_id:
            catalog_item = CatalogItem.query.filter_by(id=int(catalog_item_id)).first()
        else:
            catalog_item = None

        if not catalog_item:
            resolved = resolve_receipt_item(receipt.household_id, raw_name or item_name, category, store_id)
            catalog_item = resolved["catalog_item"]
            item_name = item_name or resolved["item_name"]
            category = resolved["category"]

        if not catalog_item:
            catalog_item = ensure_catalog_item(item_name, category=category)

        ensure_household_store(receipt.household_id, store_id)

        inv = InventoryItem.query.filter_by(household_id=receipt.household_id, catalog_item_id=catalog_item.id).first()
        if not inv:
            inv = InventoryItem(household_id=receipt.household_id, catalog_item_id=catalog_item.id, quantity=0)
            db.session.add(inv)
            db.session.flush()
        inv.quantity += quantity
        inv.last_purchase_store_id = store_id

        db.session.add(
            PurchaseItem(
                purchase_id=purchase.id,
                catalog_item_id=catalog_item.id,
                store_id=store_id,
                quantity=quantity,
            )
        )

        if raw_name:
            upsert_receipt_alias(receipt.household_id, raw_name, catalog_item.id, user.id)
            normalized_alias = normalize_receipt_name(raw_name)
            if normalized_alias and normalized_alias.lower() != raw_name.lower():
                upsert_receipt_alias(receipt.household_id, normalized_alias, catalog_item.id, user.id)

    receipt.status = "confirmed"
    receipt.confirmed_at = now_utc()
    evaluate_essential_notifications(receipt.household_id)
    db.session.commit()

    return jsonify({"receiptId": receipt.id, "purchaseId": purchase.id, "confirmedAt": iso_or_none(receipt.confirmed_at)})


@app.route("/api/purchases/history", methods=["GET"])
@jwt_required()
def purchases_history():
    user = current_user()
    household_id = request.args.get("household_id", type=int)
    limit = request.args.get("limit", type=int) or 20
    limit = max(1, min(limit, 50))
    if household_id is None:
        return error("household_id is required", 400)
    if not get_household_member(int(household_id), user.id):
        return error("not a member of that household", 403)

    purchases = (
        Purchase.query.filter_by(household_id=int(household_id))
        .order_by(Purchase.created_at.desc())
        .limit(limit)
        .all()
    )

    out = []
    for purchase in purchases:
        purchaser = User.query.filter_by(id=purchase.created_by).first()
        items = []
        for pi in purchase.purchase_items:
            store_name = pi.store.name if pi.store else None
            items.append(
                {
                    "itemName": pi.catalog_item.name if pi.catalog_item else f"Item {pi.catalog_item_id}",
                    "category": pi.catalog_item.category if pi.catalog_item else "other",
                    "quantity": pi.quantity,
                    "storeName": store_name,
                }
            )
        items.sort(key=lambda x: (x["storeName"] or "", x["itemName"].lower()))
        out.append(
            {
                "id": purchase.id,
                "source": purchase.source,
                "createdAt": iso_or_none(purchase.created_at),
                "createdByName": purchaser.name if purchaser else "Unknown",
                "items": items,
            }
        )

    return jsonify({"purchases": out})


def _get_purchase_window(past_days: int, household_id: int):
    since = now_utc() - timedelta(days=past_days)
    q = (
        PurchaseItem.query.join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .join(CatalogItem, PurchaseItem.catalog_item_id == CatalogItem.id)
        .filter(Purchase.household_id == household_id)
        .filter(Purchase.created_at >= since)
    )
    return q, since


@app.route("/api/households/<int:household_id>/insights", methods=["GET"])
@jwt_required()
def insights(household_id: int):
    user = current_user()
    if not get_household_member(household_id, user.id):
        return error("not allowed", 403)

    days = request.args.get("rangeDays", type=int) or 7
    days = max(1, min(days, 30))

    q, since = _get_purchase_window(days, household_id)

    totals = {c: 0 for c in CATEGORIES}
    for row in q.with_entities(CatalogItem.category, db.func.sum(PurchaseItem.quantity)).group_by(CatalogItem.category).all():
        cat = (row[0] or "other").lower()
        qty = float(row[1] or 0)
        totals[cat if cat in totals else "other"] += qty

    total_qty = sum(totals.values())
    breakdown = [{"category": c, "quantity": round(totals[c], 2)} for c in CATEGORIES]
    heavy_category = max(totals.keys(), key=lambda c: totals[c]) if total_qty > 0 else None
    heavy_share = (totals[heavy_category] / total_qty) if heavy_category and total_qty else 0

    category_analysis = []
    target_mix = {
        "vegetables": 0.2,
        "fruits": 0.15,
        "protein": 0.2,
        "carbs": 0.2,
        "dairy": 0.1,
        "nuts_dry_fruits": 0.1,
        "snacks": 0.1,
        "other": 0.05,
    }
    low_categories = []
    over_categories = []
    for category in CATEGORIES:
        qty = totals[category]
        share = (qty / total_qty) if total_qty else 0
        if total_qty <= 0:
            status = "neutral"
            message = "No recent purchases in this category yet."
        elif share >= max(target_mix.get(category, 0.1) + 0.12, 0.35):
            status = "heavy"
            over_categories.append(category)
            message = f"{category.capitalize()} is taking a larger share of the basket right now."
        elif share <= max(target_mix.get(category, 0.1) - 0.08, 0.05):
            status = "low"
            low_categories.append(category)
            message = f"You could add a bit more {category} on the next trip."
        else:
            status = "balanced"
            message = f"{category.capitalize()} looks reasonably covered."
        category_analysis.append({
            "category": category,
            "quantity": round(qty, 2),
            "share": round(share, 3),
            "status": status,
            "message": message,
        })

    if total_qty <= 0:
        balance_summary = {
            "tone": "neutral",
            "message": "No confirmed purchases yet. Checkout a list or confirm a receipt to unlock nutrition insights.",
        }
    elif over_categories and low_categories:
        balance_summary = {
            "tone": "watch",
            "message": f"Recent purchases are heavier on {', '.join(over_categories[:2])}. Add more {', '.join(low_categories[:2])} to balance the basket.",
        }
    elif heavy_share >= 0.35:
        balance_summary = {
            "tone": "nudge",
            "message": f"Your basket leans toward {heavy_category}. A couple of swaps can make it feel more balanced.",
        }
    else:
        balance_summary = {
            "tone": "good",
            "message": "Your recent basket looks fairly balanced across categories. Nice job keeping variety in the house.",
        }

    def _pretty_category(cat: str | None) -> str:
        if not cat:
            return "groceries"
        return cat.replace("_", " ")

    low_targets = [c for c in (low_categories or ["vegetables", "fruits", "protein", "carbs"]) if c != "other"]
    swaps = []
    if total_qty > 0:
        heavy_categories_for_swaps = [c for c in (over_categories or ([heavy_category] if heavy_category else [])) if c and c != "other"]
        used_targets = set()
        for category in heavy_categories_for_swaps[:2]:
            for target_category in low_targets:
                if target_category != category and target_category not in used_targets:
                    example_items = CATEGORY_REBALANCE_IDEAS.get(target_category, ["balanced staples"])
                    swaps.append(
                        {
                            "fromCategory": category,
                            "toCategory": target_category,
                            "title": f"Add more {_pretty_category(target_category)} next trip",
                            "reason": f"Recent purchases are heavier on {_pretty_category(category)}. Instead of replacing specific items, round out the basket by adding a few {_pretty_category(target_category)} staples on the next trip.",
                            "exampleItems": example_items,
                        }
                    )
                    used_targets.add(target_category)
                    break
            if len(swaps) >= 3:
                break

    top_items_rows = (
        PurchaseItem.query.join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .join(CatalogItem, PurchaseItem.catalog_item_id == CatalogItem.id)
        .filter(Purchase.household_id == household_id)
        .filter(Purchase.created_at >= now_utc() - timedelta(days=30))
        .with_entities(CatalogItem.name, db.func.sum(PurchaseItem.quantity))
        .group_by(CatalogItem.name)
        .order_by(db.func.sum(PurchaseItem.quantity).desc())
        .limit(5)
        .all()
    )
    top_items = [{"itemName": r[0], "quantity": round(float(r[1] or 0), 2)} for r in top_items_rows]

    store_rows = (
        PurchaseItem.query.join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(Purchase.household_id == household_id)
        .filter(Purchase.created_at >= now_utc() - timedelta(days=30))
        .with_entities(PurchaseItem.store_id, db.func.sum(PurchaseItem.quantity))
        .group_by(PurchaseItem.store_id)
        .order_by(db.func.sum(PurchaseItem.quantity).desc())
        .limit(5)
        .all()
    )
    most_visited = []
    for store_id, qty in store_rows:
        st = Store.query.filter_by(id=int(store_id)).first()
        most_visited.append({"storeName": st.name if st else f"Store {store_id}", "quantity": round(float(qty or 0), 2)})

    active_notifications = evaluate_essential_notifications(household_id)
    refill_reminders = []
    essentials = EssentialItem.query.filter_by(household_id=household_id).all()
    for cfg in essentials:
        item = cfg.catalog_item
        if not item:
            continue
        inv = InventoryItem.query.filter_by(household_id=household_id, catalog_item_id=cfg.catalog_item_id).first()
        inventory_qty = float(inv.quantity if inv else 0)
        preferred_store_name = None
        if item.preferred_store_id:
            st = Store.query.filter_by(id=int(item.preferred_store_id)).first()
            preferred_store_name = st.name if st else None
        if inventory_qty > float(cfg.threshold_quantity):
            continue
        purchased_qty = (
            PurchaseItem.query.join(Purchase, PurchaseItem.purchase_id == Purchase.id)
            .filter(Purchase.household_id == household_id)
            .filter(Purchase.created_at >= now_utc() - timedelta(days=45))
            .filter(PurchaseItem.catalog_item_id == cfg.catalog_item_id)
            .with_entities(db.func.sum(PurchaseItem.quantity))
            .scalar()
        ) or 0
        refill_reminders.append(
            {
                "catalogItemId": cfg.catalog_item_id,
                "itemName": item.name,
                "category": item.category,
                "currentQuantity": round(inventory_qty, 2),
                "recentPurchasedQuantity": round(float(purchased_qty or 0), 2),
                "preferredStoreId": item.preferred_store_id,
                "preferredStoreName": preferred_store_name,
                "thresholdQuantity": round(float(cfg.threshold_quantity), 2),
                "reason": f"This is on your essential list and is at or below the reminder threshold of {round(float(cfg.threshold_quantity), 2)}.",
            }
        )
    refill_reminders.sort(key=lambda x: (x["currentQuantity"], x["itemName"].lower()))

    db.session.commit()
    return jsonify(
        {
            "rangeDays": days,
            "since": iso_or_none(since),
            "categoryBreakdown": breakdown,
            "categoryAnalysis": category_analysis,
            "dominantCategory": heavy_category,
            "balanceSummary": balance_summary,
            "swaps": swaps,
            "refillReminders": refill_reminders[:8],
            "notifications": [
                {
                    "id": n.id,
                    "message": n.message,
                    "isRead": bool(n.is_read),
                    "updatedAt": iso_or_none(n.updated_at),
                }
                for n in active_notifications[:8]
            ],
            "analytics": {
                "topItems": top_items,
                "frequentlyPurchasedItems": top_items,
                "mostVisitedStores": most_visited,
            },
        }
    )


if __name__ == "__main__":
    port = int(_env("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)

