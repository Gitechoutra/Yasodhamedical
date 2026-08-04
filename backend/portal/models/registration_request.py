"""A request for a staff account, awaiting admin approval.

Deliberately *not* a `User` row with `is_active=False`.

A user carries a role, and several scoping rules read "role X with no X profile"
as unrestricted access -- `patient_scope` returns None (meaning *every*
patient) when `get_current_doctor()` finds nothing. A half-formed doctor
account is therefore not merely useless, it is dangerous: activate it by
accident and it can read the whole hospital.

Keeping requests in their own table means no `User` exists until an admin
approves one, and approval creates the account and its role profile together
in a single transaction. There is no window in which a broken account exists.

The password is hashed the moment it is submitted -- a pending request is not
a reason to hold a plaintext password.
"""

from datetime import datetime

from werkzeug.security import generate_password_hash

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

# Roles a stranger may ask for. `admin` is absent on purpose: an administrator
# grants every other role, so it can only ever be issued by another admin.
REQUESTABLE_ROLES = ("doctor", "nurse", "receptionist", "pharmacist")

STATUSES = ("pending", "approved", "rejected")


class RegistrationRequest(db.Model):
    __tablename__ = "registration_requests"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(20), nullable=True)

    requested_role = db.Column(
        db.Enum(*REQUESTABLE_ROLES, name="requested_role"), nullable=False
    )
    # What the applicant says about themselves. Preferences, not grants -- the
    # admin picks the real department/branch when approving.
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=True)
    # Medical council / pharmacy council number, so the admin has something to
    # verify against before granting access to patient data.
    license_no = db.Column(db.String(60), nullable=True)
    specialization = db.Column(db.String(150), nullable=True)
    note = db.Column(db.Text, nullable=True)

    status = db.Column(
        db.Enum(*STATUSES, name="registration_status"), nullable=False, default="pending"
    )
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    review_note = db.Column(db.String(255), nullable=True)
    # The account this request became, once approved.
    created_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    department = db.relationship("Department")
    branch = db.relationship("Branch")
    reviewer = db.relationship("User", foreign_keys=[reviewed_by])
    created_user = db.relationship("User", foreign_keys=[created_user_id])

    __table_args__ = (
        db.Index("idx_registration_status_created", "status", "created_at"),
        db.Index("idx_registration_email", "email"),
    )

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def to_dict(self, include_contact=True):
        data = {
            "id": self.id,
            "name": self.name,
            "requested_role": self.requested_role,
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
            "branch_id": self.branch_id,
            "branch": self.branch.name if self.branch else None,
            "license_no": self.license_no,
            "specialization": self.specialization,
            "note": self.note,
            "status": self.status,
            "review_note": self.review_note,
            "reviewed_by": self.reviewer.name if self.reviewer else None,
            "reviewed_at": to_utc_iso(self.reviewed_at),
            "created_at": to_utc_iso(self.created_at),
        }
        # Only the reviewing admin needs the applicant's contact details; the
        # public submit response echoes nothing back.
        if include_contact:
            data["email"] = self.email
            data["phone"] = self.phone
        return data

    def __repr__(self):
        return f"<RegistrationRequest {self.email} {self.status}>"
