"""Self-registration, and the admin review that turns it into an account.

`POST /register` is the only unauthenticated write in the whole API, so it is
written defensively:

  * it never creates a `User` -- see models/registration_request for why a
    half-formed account is worse than no account
  * it cannot grant `admin`
  * it answers identically whether or not the email is already known, so the
    form cannot be used to enumerate who works here
  * it returns nothing about the request beyond "received"

Approval is where an account actually comes into being, and it creates the
user and its role profile in one transaction.
"""

import re
from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity

from portal.extensions import db
from portal.helpers.audit import audit
from portal.helpers.decorators import role_required
from portal.helpers.notify import notify, role_user_ids
from portal.helpers.response import error, success
from portal.models.branch import Branch
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.nurse import Nurse
from portal.models.pharmacist import Pharmacist
from portal.models.registration_request import REQUESTABLE_ROLES, RegistrationRequest
from portal.models.role import Role
from portal.models.user import User

registration_bp = Blueprint("registration", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8

REGISTRATION_SUBMITTED = "registration.submitted"
REGISTRATION_APPROVED = "registration.approved"
REGISTRATION_REJECTED = "registration.rejected"

# Same wording whether the email is free, already registered, or already
# pending. Anything else turns this form into a staff directory.
SUBMITTED_MESSAGE = (
    "Registration received. An administrator will review it and email you once "
    "your account is approved."
)


def _clean(payload, field, limit=150):
    value = payload.get(field)
    if value is None:
        return None
    return str(value).strip()[:limit] or None


@registration_bp.post("/register")
def register():
    """Public. Records a request; grants nothing."""
    payload = request.get_json(silent=True) or {}

    name = _clean(payload, "name")
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    requested_role = payload.get("requested_role")

    if not name:
        return error("Your full name is required", status=422)
    if not EMAIL_RE.match(email):
        return error("Enter a valid email address", status=422)
    if len(password) < MIN_PASSWORD:
        return error(
            f"Password must be at least {MIN_PASSWORD} characters", status=422
        )
    if requested_role not in REQUESTABLE_ROLES:
        return error(
            f"Choose one of: {', '.join(REQUESTABLE_ROLES)}", status=422
        )

    department_id = payload.get("department_id") or None
    if department_id and not db.session.get(Department, department_id):
        return error("Department not found", status=404)

    branch_id = payload.get("branch_id") or None
    if branch_id and not db.session.get(Branch, branch_id):
        return error("Branch not found", status=404)

    # Taken or already pending? Record nothing and answer exactly as if it had
    # worked. The applicant learns nothing; a real duplicate is caught by the
    # admin, who can already see both.
    taken = User.query.filter_by(email=email).first()
    pending = RegistrationRequest.query.filter_by(email=email, status="pending").first()
    if taken or pending:
        return success(message=SUBMITTED_MESSAGE, status=202)

    entry = RegistrationRequest(
        name=name,
        email=email,
        phone=_clean(payload, "phone", 20),
        requested_role=requested_role,
        department_id=department_id,
        branch_id=branch_id,
        license_no=_clean(payload, "license_no", 60),
        specialization=_clean(payload, "specialization"),
        note=_clean(payload, "note", 2000),
    )
    entry.set_password(password)
    db.session.add(entry)
    db.session.flush()

    notify(
        role_user_ids("admin"),
        title="New staff registration",
        body=f"{name} has applied for a {requested_role} account.",
        category="system",
        link="/dashboard/registrations",
    )
    # No actor: this is the one unauthenticated write, so the audit row records
    # the request itself rather than a user id.
    audit(
        REGISTRATION_SUBMITTED,
        entity="registration_request",
        entity_id=entry.id,
        detail=f"{name} applied for {requested_role}",
        user_id=None,
    )
    db.session.commit()

    return success(message=SUBMITTED_MESSAGE, status=202)


@registration_bp.get("/registrations")
@role_required("admin")
def list_registrations():
    status = request.args.get("status", "pending")
    query = RegistrationRequest.query
    if status != "all":
        query = query.filter(RegistrationRequest.status == status)

    rows = query.order_by(RegistrationRequest.created_at.desc()).limit(200).all()
    return success(
        {
            "items": [r.to_dict() for r in rows],
            "pending_count": RegistrationRequest.query.filter_by(status="pending").count(),
        }
    )


@registration_bp.post("/registrations/<int:request_id>/approve")
@role_required("admin")
def approve_registration(request_id):
    """Creates the account and its role profile together.

    The admin confirms the role rather than inheriting whatever was asked for,
    and supplies the department or branch the profile needs. Both happen in one
    transaction, so an account never exists without the profile its access
    rules depend on.
    """
    entry = db.session.get(RegistrationRequest, request_id)
    if not entry:
        return error("Registration not found", status=404)
    if entry.status != "pending":
        return error(f"This registration was already {entry.status}", status=409)

    payload = request.get_json(silent=True) or {}
    granted_role = payload.get("role") or entry.requested_role
    if granted_role not in REQUESTABLE_ROLES:
        return error(f"role must be one of: {', '.join(REQUESTABLE_ROLES)}", status=422)

    # Guard against the applicant having been added manually in the meantime.
    if User.query.filter_by(email=entry.email).first():
        return error("An account with that email already exists", status=409)

    role = Role.query.filter_by(name=granted_role).first()
    if not role:
        return error(f"The {granted_role} role is missing — run the seeder", status=500)

    department_id = payload.get("department_id") or entry.department_id
    branch_id = payload.get("branch_id") or entry.branch_id

    # A doctor or nurse without a department, or a pharmacist without a branch,
    # is exactly the half-formed account this whole flow exists to prevent.
    if granted_role in ("doctor", "nurse"):
        if not department_id or not db.session.get(Department, department_id):
            return error("Choose a department for this account", status=422)
    if granted_role == "pharmacist":
        if not branch_id or not db.session.get(Branch, branch_id):
            return error("Choose a branch for this account", status=422)

    user = User(name=entry.name, email=entry.email, role_id=role.id, is_active=True)
    # Carried across as-is: the applicant chose it, and it was hashed on the
    # way in, so it was never stored or transmitted in the clear.
    user.password_hash = entry.password_hash
    db.session.add(user)
    db.session.flush()

    if granted_role == "doctor":
        db.session.add(
            Doctor(
                user_id=user.id,
                department_id=department_id,
                specialization=entry.specialization,
                registration_no=entry.license_no,
            )
        )
    elif granted_role == "nurse":
        db.session.add(
            Nurse(user_id=user.id, department_id=department_id, employee_no=entry.license_no)
        )
    elif granted_role == "pharmacist":
        db.session.add(
            Pharmacist(user_id=user.id, branch_id=branch_id, license_no=entry.license_no)
        )
    # A receptionist has no profile table — the role alone is the whole grant.

    entry.status = "approved"
    entry.reviewed_by = int(get_jwt_identity())
    entry.reviewed_at = datetime.utcnow()
    entry.review_note = _clean(payload, "review_note", 255)
    entry.created_user_id = user.id

    notify(
        [user.id],
        title="Your account has been approved",
        body=f"You can now sign in as a {granted_role}.",
        category="system",
        link="/login",
    )
    audit(
        REGISTRATION_APPROVED,
        entity="registration_request",
        entity_id=entry.id,
        detail=f"Approved {entry.email} as {granted_role}",
    )
    db.session.commit()

    return success(
        {"registration": entry.to_dict(), "user": user.to_dict()},
        message=f"{user.name} can now sign in as a {granted_role}",
        status=201,
    )


@registration_bp.post("/registrations/<int:request_id>/reject")
@role_required("admin")
def reject_registration(request_id):
    entry = db.session.get(RegistrationRequest, request_id)
    if not entry:
        return error("Registration not found", status=404)
    if entry.status != "pending":
        return error(f"This registration was already {entry.status}", status=409)

    payload = request.get_json(silent=True) or {}
    entry.status = "rejected"
    entry.reviewed_by = int(get_jwt_identity())
    entry.reviewed_at = datetime.utcnow()
    entry.review_note = _clean(payload, "review_note", 255)

    audit(
        REGISTRATION_REJECTED,
        entity="registration_request",
        entity_id=entry.id,
        detail=f"Rejected {entry.email} ({entry.review_note or 'no reason given'})",
    )
    db.session.commit()

    return success(entry.to_dict(), message="Registration rejected")


@registration_bp.get("/registration-options")
def registration_options():
    """Departments and branches for the signup form.

    Public because the form needs it before anyone has a token. Returns names
    and ids only — the same information printed on the hospital's own signage,
    and nothing about staff.
    """
    return success(
        {
            "roles": list(REQUESTABLE_ROLES),
            "departments": [
                {"id": d.id, "name": d.name}
                for d in Department.query.order_by(Department.name).all()
            ],
            "branches": [
                {"id": b.id, "name": b.name, "city": b.city}
                for b in Branch.query.filter_by(is_active=True).order_by(Branch.name).all()
            ],
        }
    )
