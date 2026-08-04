"""The pharmacy counter's API.

Everything is scoped to the pharmacist's own branch, with one deliberate
exception: cross-branch lookup. A pharmacist may see *that* another branch
holds a medicine and how many, so they can arrange a transfer -- they cannot
touch that stock. Reading a neighbour's shelf is the whole point; writing to
it is not theirs to do.
"""

from datetime import date, datetime, timedelta

from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity

from portal.extensions import db
from portal.helpers.audit import audit
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import role_required
from portal.helpers.response import error, success
from portal.models.branch import Branch
from portal.models.medicine import Medicine
from portal.models.medicine_brand import (
    DEFAULT_REORDER_LEVEL,
    FORMS,
    MedicineBrand,
    StockBatch,
)
from portal.models.pharmacist import Pharmacist

pharmacy_bp = Blueprint("pharmacy", __name__)

BRAND_CREATED = "pharmacy.brand_created"
BRAND_UPDATED = "pharmacy.brand_updated"
STOCK_ADDED = "pharmacy.stock_added"

SEARCH_LIMIT = 50
# A batch inside this window is worth flagging before it becomes dead stock.
EXPIRING_SOON_DAYS = 60


def current_pharmacist():
    return Pharmacist.query.filter_by(user_id=get_jwt_identity()).first()


def _is_admin():
    return get_jwt().get("role") == "admin"


def _resolve_branch():
    """The branch this request works against.

    A pharmacist is pinned to their own. An admin has no counter of their own,
    so they must name one with ?branch_id= -- guessing would silently show
    them somebody else's shelf.
    """
    pharmacist = current_pharmacist()
    if pharmacist:
        return pharmacist.branch, None

    if _is_admin():
        branch_id = request.args.get("branch_id", type=int)
        if not branch_id:
            return None, error(
                "Pass ?branch_id= — an admin account is not tied to a branch", status=422
            )
        branch = db.session.get(Branch, branch_id)
        if not branch:
            return None, error("Branch not found", status=404)
        return branch, None

    return None, error("No pharmacy branch for this account", status=403)


# --------------------------------------------------------------------------
# branches
# --------------------------------------------------------------------------


@pharmacy_bp.get("/branches")
@role_required("pharmacist", "admin")
def list_branches():
    branches = Branch.query.filter_by(is_active=True).order_by(Branch.name).all()
    return success([b.to_dict() for b in branches])


# --------------------------------------------------------------------------
# catalogue: brands
# --------------------------------------------------------------------------


def _clean(payload, field, limit=150):
    value = payload.get(field)
    if value is None:
        return None
    return str(value).strip()[:limit] or None


@pharmacy_bp.post("/brands")
@role_required("pharmacist", "admin")
def create_brand():
    """Adds a new medicine brand to the catalogue.

    The catalogue is hospital-wide, not per branch: the same product exists
    whether or not this counter happens to stock it, and duplicating it per
    branch is what makes cross-branch search impossible later.
    """
    payload = request.get_json(silent=True) or {}

    brand_name = _clean(payload, "brand_name")
    if not brand_name:
        return error("Brand name is required", status=422)

    strength = _clean(payload, "strength", 80)
    clash = MedicineBrand.query.filter_by(brand_name=brand_name, strength=strength).first()
    if clash:
        return error(
            f"{clash.display_name} is already in the catalogue — add stock to it instead.",
            status=409,
        )

    form = payload.get("form") or "tablet"
    if form not in FORMS:
        return error(f"form must be one of: {', '.join(FORMS)}", status=422)

    reorder_level = payload.get("reorder_level")
    try:
        reorder_level = int(reorder_level) if reorder_level not in (None, "") else DEFAULT_REORDER_LEVEL
    except (TypeError, ValueError):
        return error("reorder_level must be a whole number", status=422)
    if reorder_level < 0:
        return error("reorder_level cannot be negative", status=422)

    # Optional link to the clinical formulary, so a prescription written
    # against the generic can be filled with this brand.
    medicine_id = payload.get("medicine_id") or None
    if medicine_id and not db.session.get(Medicine, medicine_id):
        return error("Formulary medicine not found", status=404)

    brand = MedicineBrand(
        brand_name=brand_name,
        generic_name=_clean(payload, "generic_name"),
        used_for=_clean(payload, "used_for", 2000),
        category=_clean(payload, "category", 100),
        manufacturer=_clean(payload, "manufacturer"),
        form=form,
        strength=strength,
        reorder_level=reorder_level,
        medicine_id=medicine_id,
    )
    db.session.add(brand)
    db.session.flush()

    audit(
        BRAND_CREATED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"Added {brand.display_name} to the catalogue",
    )
    db.session.commit()
    dashboard_changed("pharmacy_brand_created")

    branch, _ = _resolve_branch()
    return success(
        brand.to_dict(branch_id=branch.id if branch else None),
        message=f"{brand.display_name} added",
        status=201,
    )


@pharmacy_bp.get("/brands")
@role_required("pharmacist", "admin")
def list_brands():
    """The catalogue, with this branch's quantity against each row."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    query = MedicineBrand.query
    if request.args.get("active", "true") == "true":
        query = query.filter(MedicineBrand.is_active.is_(True))

    category = (request.args.get("category") or "").strip()
    if category:
        query = query.filter(MedicineBrand.category == category)

    brands = query.order_by(MedicineBrand.brand_name).all()
    return success([b.to_dict(branch_id=branch.id) for b in brands])


@pharmacy_bp.patch("/brands/<int:brand_id>")
@role_required("pharmacist", "admin")
def update_brand(brand_id):
    brand = db.session.get(MedicineBrand, brand_id)
    if not brand:
        return error("Medicine not found", status=404)

    payload = request.get_json(silent=True) or {}
    for field, limit in (
        ("generic_name", 150),
        ("used_for", 2000),
        ("category", 100),
        ("manufacturer", 150),
    ):
        if field in payload:
            setattr(brand, field, _clean(payload, field, limit))

    if "form" in payload:
        if payload.get("form") not in FORMS:
            return error(f"form must be one of: {', '.join(FORMS)}", status=422)
        brand.form = payload["form"]

    if "reorder_level" in payload:
        try:
            level = int(payload["reorder_level"])
        except (TypeError, ValueError):
            return error("reorder_level must be a whole number", status=422)
        if level < 0:
            return error("reorder_level cannot be negative", status=422)
        brand.reorder_level = level

    if "is_active" in payload:
        brand.is_active = bool(payload["is_active"])

    audit(
        BRAND_UPDATED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"Updated {brand.display_name}",
    )
    db.session.commit()

    branch, _ = _resolve_branch()
    return success(
        brand.to_dict(branch_id=branch.id if branch else None), message="Medicine updated"
    )


@pharmacy_bp.get("/categories")
@role_required("pharmacist", "admin")
def list_categories():
    """Distinct categories with how many brands and how much stock sit under
    each — a category with no stock is worth seeing as much as a full one."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    rows = (
        db.session.query(MedicineBrand.category, db.func.count(MedicineBrand.id))
        .filter(MedicineBrand.is_active.is_(True))
        .group_by(MedicineBrand.category)
        .order_by(MedicineBrand.category)
        .all()
    )

    out = []
    for category, brand_count in rows:
        brands = MedicineBrand.query.filter(
            MedicineBrand.category.is_(None) if category is None else MedicineBrand.category == category,
            MedicineBrand.is_active.is_(True),
        ).all()
        out.append(
            {
                "category": category or "Uncategorised",
                "brand_count": brand_count,
                "units_in_stock": sum(b.quantity_in(branch.id) for b in brands),
                "out_of_stock": sum(1 for b in brands if b.quantity_in(branch.id) == 0),
            }
        )
    return success(out)


# --------------------------------------------------------------------------
# search — the reason this module exists
# --------------------------------------------------------------------------


@pharmacy_bp.get("/search")
@role_required("pharmacist", "admin")
def search_medicines():
    """Find a medicine here, and if it isn't here, find who has it.

    Returns two lists deliberately rather than one merged list:

      * `in_branch`   — what this counter can dispense right now
      * `other_branches` — where to source anything it cannot

    A brand stocked here but at zero appears in `in_branch` with quantity 0 AND
    in `other_branches` if somebody else has it, because "we carry it but we're
    out, and Kakinada has 40" is the answer the pharmacist actually needs.
    """
    branch, failure = _resolve_branch()
    if failure:
        return failure

    term = (request.args.get("q") or "").strip()
    if len(term) < 2:
        return error("Type at least two characters to search", status=422)

    like = f"%{term}%"
    matches = (
        MedicineBrand.query.filter(
            MedicineBrand.is_active.is_(True),
            db.or_(
                MedicineBrand.brand_name.ilike(like),
                MedicineBrand.generic_name.ilike(like),
                # Searching by indication is why `used_for` is free text:
                # "fever" should find paracetamol without knowing the brand.
                MedicineBrand.used_for.ilike(like),
                MedicineBrand.category.ilike(like),
            ),
        )
        .order_by(MedicineBrand.brand_name)
        .limit(SEARCH_LIMIT)
        .all()
    )

    today = date.today()
    in_branch, elsewhere = [], []

    for brand in matches:
        row = brand.to_dict(branch_id=branch.id)
        row["batches"] = [
            b.to_dict()
            for b in sorted(
                (
                    x
                    for x in brand.batches
                    if x.branch_id == branch.id and x.quantity > 0
                ),
                # Nearest expiry first: that is the batch to dispense next.
                key=lambda x: (x.expiry_date or date.max),
            )
        ]
        in_branch.append(row)

        # Only look outward when this counter cannot serve the request.
        if row["quantity"] > 0:
            continue

        for other in brand.batches:
            if other.branch_id == branch.id or other.quantity <= 0:
                continue
            if other.expiry_date and other.expiry_date < today:
                continue
            elsewhere.append(
                {
                    "brand_id": brand.id,
                    "brand_name": brand.display_name,
                    "generic_name": brand.generic_name,
                    "used_for": brand.used_for,
                    "form_label": brand.form_label,
                    "branch": other.branch.to_dict() if other.branch else None,
                    "quantity": other.quantity,
                    "batch_no": other.batch_no,
                    "expiry_date": other.expiry_date.isoformat() if other.expiry_date else None,
                }
            )

    # Collapse to one row per (brand, branch): a branch holding three batches
    # is one place to call, not three.
    merged = {}
    for row in elsewhere:
        key = (row["brand_id"], row["branch"]["id"] if row["branch"] else None)
        if key in merged:
            merged[key]["quantity"] += row["quantity"]
        else:
            merged[key] = row
    other_branches = sorted(merged.values(), key=lambda r: -r["quantity"])

    return success(
        {
            "query": term,
            "branch": branch.to_dict(),
            "in_branch": in_branch,
            "available_here": sum(1 for r in in_branch if r["quantity"] > 0),
            "other_branches": other_branches,
        }
    )


# --------------------------------------------------------------------------
# stock
# --------------------------------------------------------------------------


@pharmacy_bp.get("/inventory")
@role_required("pharmacist", "admin")
def inventory():
    """Every batch on this branch's shelf."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    query = StockBatch.query.filter(StockBatch.branch_id == branch.id)
    if request.args.get("in_stock") == "true":
        query = query.filter(StockBatch.quantity > 0)

    batches = query.join(MedicineBrand).order_by(MedicineBrand.brand_name).all()
    return success({"branch": branch.to_dict(), "batches": [b.to_dict() for b in batches]})


@pharmacy_bp.post("/stock")
@role_required("pharmacist", "admin")
def add_stock():
    """Receives stock into this branch.

    Always writes to the caller's own branch -- a pharmacist cannot post stock
    into somebody else's counter, which is why `branch_id` is not read from the
    body here.
    """
    branch, failure = _resolve_branch()
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}

    brand = db.session.get(MedicineBrand, payload.get("brand_id"))
    if not brand:
        return error("Medicine not found — add it to the catalogue first", status=404)

    try:
        quantity = int(payload.get("quantity"))
    except (TypeError, ValueError):
        return error("quantity must be a whole number", status=422)
    if quantity <= 0:
        return error("quantity must be greater than zero", status=422)

    expiry_date = None
    raw_expiry = payload.get("expiry_date")
    if raw_expiry:
        try:
            expiry_date = datetime.strptime(raw_expiry, "%Y-%m-%d").date()
        except ValueError:
            return error("expiry_date must be YYYY-MM-DD", status=422)
        if expiry_date < date.today():
            return error("That batch is already expired — it cannot be received", status=422)

    def _money(field):
        raw = payload.get(field)
        if raw in (None, ""):
            return None, None
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return None, f"{field} must be a number"
        if value < 0:
            return None, f"{field} cannot be negative"
        return value, None

    mrp, err = _money("mrp")
    if err:
        return error(err, status=422)
    cost_price, err = _money("cost_price")
    if err:
        return error(err, status=422)

    batch_no = _clean(payload, "batch_no", 60)

    # Same brand, same batch, same expiry in the same branch is a top-up of an
    # existing row, not a second row -- otherwise the shelf fragments into
    # duplicates that have to be summed everywhere.
    existing = StockBatch.query.filter_by(
        branch_id=branch.id, brand_id=brand.id, batch_no=batch_no, expiry_date=expiry_date
    ).first()

    if existing:
        existing.quantity += quantity
        if mrp is not None:
            existing.mrp = mrp
        if cost_price is not None:
            existing.cost_price = cost_price
        batch = existing
    else:
        batch = StockBatch(
            branch_id=branch.id,
            brand_id=brand.id,
            batch_no=batch_no,
            expiry_date=expiry_date,
            quantity=quantity,
            mrp=mrp,
            cost_price=cost_price,
        )
        db.session.add(batch)

    audit(
        STOCK_ADDED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"+{quantity} {brand.display_name} into {branch.name}",
    )
    db.session.commit()
    dashboard_changed("pharmacy_stock_changed")

    return success(
        {"batch": batch.to_dict(), "brand": brand.to_dict(branch_id=branch.id)},
        message=f"{quantity} units of {brand.display_name} received",
        status=201,
    )


@pharmacy_bp.get("/low-stock")
@role_required("pharmacist", "admin")
def low_stock():
    """Brands at or under their reorder level in this branch, out-of-stock
    first — those are the ones costing a sale right now."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    rows = []
    for brand in MedicineBrand.query.filter(MedicineBrand.is_active.is_(True)).all():
        quantity = brand.quantity_in(branch.id)
        if quantity < brand.reorder_level:
            rows.append({**brand.to_dict(branch_id=branch.id), "shortfall": brand.reorder_level - quantity})

    rows.sort(key=lambda r: (r["quantity"], r["brand_name"]))
    return success({"branch": branch.to_dict(), "items": rows})


@pharmacy_bp.get("/expired")
@role_required("pharmacist", "admin")
def expired_stock():
    """Batches already expired, plus those close enough to matter."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    today = date.today()
    horizon = today + timedelta(days=EXPIRING_SOON_DAYS)

    batches = (
        StockBatch.query.filter(
            StockBatch.branch_id == branch.id,
            StockBatch.quantity > 0,
            StockBatch.expiry_date.isnot(None),
            StockBatch.expiry_date <= horizon,
        )
        .order_by(StockBatch.expiry_date)
        .all()
    )

    return success(
        {
            "branch": branch.to_dict(),
            "expired": [b.to_dict() for b in batches if b.expiry_date < today],
            "expiring_soon": [b.to_dict() for b in batches if b.expiry_date >= today],
            "horizon_days": EXPIRING_SOON_DAYS,
        }
    )


@pharmacy_bp.get("/summary")
@role_required("pharmacist", "admin")
def summary():
    """The counter's dashboard figures."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    today = date.today()
    brands = MedicineBrand.query.filter(MedicineBrand.is_active.is_(True)).all()

    quantities = {b.id: b.quantity_in(branch.id) for b in brands}
    stocked = [b for b in brands if quantities[b.id] > 0]

    expired_units = (
        db.session.query(db.func.coalesce(db.func.sum(StockBatch.quantity), 0))
        .filter(
            StockBatch.branch_id == branch.id,
            StockBatch.quantity > 0,
            StockBatch.expiry_date.isnot(None),
            StockBatch.expiry_date < today,
        )
        .scalar()
    )

    expiring_soon = (
        db.session.query(db.func.count(StockBatch.id))
        .filter(
            StockBatch.branch_id == branch.id,
            StockBatch.quantity > 0,
            StockBatch.expiry_date.isnot(None),
            StockBatch.expiry_date >= today,
            StockBatch.expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS),
        )
        .scalar()
    )

    # Retail value of what is on the shelf, at MRP, excluding expired stock.
    stock_value = sum(
        (float(b.mrp) if b.mrp is not None else 0) * b.quantity
        for b in StockBatch.query.filter(
            StockBatch.branch_id == branch.id, StockBatch.quantity > 0
        ).all()
        if not b.is_expired
    )

    return success(
        {
            "branch": branch.to_dict(),
            "catalogue_size": len(brands),
            "in_stock": len(stocked),
            "out_of_stock": len(brands) - len(stocked),
            "low_stock": sum(
                1 for b in brands if 0 < quantities[b.id] < b.reorder_level
            ),
            "total_units": sum(quantities.values()),
            "stock_value": round(stock_value, 2),
            "expired_units": int(expired_units or 0),
            "expiring_soon_batches": int(expiring_soon or 0),
        }
    )
