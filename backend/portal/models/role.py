from datetime import datetime

from portal.extensions import db

# The five roles the application is built around. Every login belongs to
# exactly one of them (`users.role_id` is NOT NULL), and every access rule in
# the codebase is written against these names.
#
# Guaranteed to exist by a data migration rather than by the seeder: a fresh
# `flask db upgrade` has to leave a working database behind, and several
# routes (registration approval, nurse creation) look a role up by name and
# would fail against an empty table.
#
# Adding one here is not enough on its own -- it needs a migration to insert
# it, and helpers/decorators.py decides what it can actually reach.
DEFAULT_ROLES = (
    (
        "admin",
        "Full access. Manages staff accounts, departments and branches, "
        "approves registrations, and reads the audit trail.",
    ),
    (
        "doctor",
        "Runs consultations, verifies prescriptions, assigns nursing care and "
        "reviews the patients assigned to them.",
    ),
    (
        "nurse",
        "Records medication, vitals, observations and handovers for the "
        "patients a doctor has assigned to them.",
    ),
    (
        "receptionist",
        "Registers patients, keeps their details current, routes them to a "
        "doctor and manages the OP queue. No access to clinical records.",
    ),
    (
        "pharmacist",
        "Manages the medicine catalogue and their branch's stock, and looks "
        "up availability across other branches.",
    ),
)

ROLE_NAMES = tuple(name for name, _description in DEFAULT_ROLES)


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    description = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    users = db.relationship("User", back_populates="role")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "user_count": len(self.users),
        }

    def __repr__(self):
        return f"<Role {self.name}>"
