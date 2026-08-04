"""The pharmacy catalogue, and what each branch actually holds.

Deliberately separate from `medicines`, which is the clinical formulary the AI
prescribes from. That table answers "what may a doctor prescribe"; these answer
"what is on the shelf, and where". Merging them would let a sold-out brand
disappear from the formulary, or a discontinued brand keep being suggested.

`MedicineBrand.medicine_id` is the optional bridge: a brand can be tied to the
generic it dispenses, so a prescription for "Paracetamol 650mg" can be filled
with whichever brand the counter stocks.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

# Presentation, not dosage — dosage lives on the prescription.
FORMS = (
    "tablet",
    "capsule",
    "syrup",
    "injection",
    "iv_fluid",
    "ointment",
    "drops",
    "inhaler",
    "sachet",
    "other",
)

FORM_LABELS = {
    "tablet": "Tablet",
    "capsule": "Capsule",
    "syrup": "Syrup",
    "injection": "Injection",
    "iv_fluid": "IV Fluid",
    "ointment": "Ointment / Cream",
    "drops": "Drops",
    "inhaler": "Inhaler",
    "sachet": "Sachet",
    "other": "Other",
}

DEFAULT_REORDER_LEVEL = 20


class MedicineBrand(db.Model):
    """One purchasable product: a brand name, its generic, and what it treats."""

    __tablename__ = "medicine_brands"

    id = db.Column(db.Integer, primary_key=True)
    brand_name = db.Column(db.String(150), nullable=False)
    generic_name = db.Column(db.String(150), nullable=True)
    # The whole point of the "what is it used for" field: free text a
    # pharmacist can search, e.g. "fever, mild pain, headache".
    used_for = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True)
    manufacturer = db.Column(db.String(150), nullable=True)
    form = db.Column(db.Enum(*FORMS, name="medicine_form"), nullable=False, default="tablet")
    strength = db.Column(db.String(80), nullable=True)
    # Below this total quantity in a branch, the brand shows up in Low Stock.
    # Held on the brand rather than per branch: one sensible threshold per
    # product is enough until branches genuinely need different ones.
    reorder_level = db.Column(db.Integer, nullable=False, default=DEFAULT_REORDER_LEVEL)
    # The clinical formulary row this brand dispenses, when there is one.
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    medicine = db.relationship("Medicine")
    batches = db.relationship(
        "StockBatch", back_populates="brand", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # A brand name is only unique together with its strength — the same
        # brand ships as 250mg and 500mg, and they are different products.
        db.UniqueConstraint("brand_name", "strength", name="uq_brand_strength"),
        db.Index("idx_brand_name", "brand_name"),
    )

    @property
    def form_label(self):
        return FORM_LABELS.get(self.form, self.form)

    @property
    def display_name(self):
        return f"{self.brand_name} {self.strength}".strip() if self.strength else self.brand_name

    def quantity_in(self, branch_id):
        """Total sellable units in one branch — expired batches excluded, since
        stock you cannot dispense is not stock."""
        today = datetime.utcnow().date()
        return sum(
            b.quantity
            for b in self.batches
            if b.branch_id == branch_id and (b.expiry_date is None or b.expiry_date >= today)
        )

    def to_dict(self, branch_id=None):
        data = {
            "id": self.id,
            "brand_name": self.brand_name,
            "display_name": self.display_name,
            "generic_name": self.generic_name,
            "used_for": self.used_for,
            "category": self.category,
            "manufacturer": self.manufacturer,
            "form": self.form,
            "form_label": self.form_label,
            "strength": self.strength,
            "reorder_level": self.reorder_level,
            "is_active": self.is_active,
            "medicine_id": self.medicine_id,
            "formulary_name": self.medicine.name if self.medicine else None,
            "created_at": to_utc_iso(self.created_at),
        }
        if branch_id is not None:
            quantity = self.quantity_in(branch_id)
            data["quantity"] = quantity
            data["in_stock"] = quantity > 0
            data["low_stock"] = 0 < quantity < self.reorder_level
        return data

    def __repr__(self):
        return f"<MedicineBrand {self.display_name}>"


class StockBatch(db.Model):
    """A batch of one brand held at one branch.

    Batch-level rather than a single running total, because expiry and cost
    are properties of a delivery, not of a product. A branch's quantity is the
    sum of its unexpired batches.
    """

    __tablename__ = "stock_batches"

    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=False)
    brand_id = db.Column(
        db.Integer, db.ForeignKey("medicine_brands.id", ondelete="CASCADE"), nullable=False
    )
    batch_no = db.Column(db.String(60), nullable=True)
    expiry_date = db.Column(db.Date, nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=0)
    # Numeric, not Float: money that rounds badly is money that goes missing.
    mrp = db.Column(db.Numeric(10, 2), nullable=True)
    cost_price = db.Column(db.Numeric(10, 2), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    branch = db.relationship("Branch")
    brand = db.relationship("MedicineBrand", back_populates="batches")

    __table_args__ = (
        db.Index("idx_stock_branch_brand", "branch_id", "brand_id"),
        db.Index("idx_stock_expiry", "expiry_date"),
    )

    @property
    def is_expired(self):
        return bool(self.expiry_date and self.expiry_date < datetime.utcnow().date())

    @property
    def days_to_expiry(self):
        if not self.expiry_date:
            return None
        return (self.expiry_date - datetime.utcnow().date()).days

    def to_dict(self):
        return {
            "id": self.id,
            "branch_id": self.branch_id,
            "branch": self.branch.name if self.branch else None,
            "brand_id": self.brand_id,
            "brand_name": self.brand.display_name if self.brand else None,
            "batch_no": self.batch_no,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "days_to_expiry": self.days_to_expiry,
            "is_expired": self.is_expired,
            "quantity": self.quantity,
            "mrp": float(self.mrp) if self.mrp is not None else None,
            "cost_price": float(self.cost_price) if self.cost_price is not None else None,
        }

    def __repr__(self):
        return f"<StockBatch brand={self.brand_id} branch={self.branch_id} qty={self.quantity}>"
