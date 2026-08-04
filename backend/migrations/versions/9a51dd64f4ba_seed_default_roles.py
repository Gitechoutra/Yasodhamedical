"""seed default roles

Puts the five roles the application is built around into the database, so a
fresh `flask db upgrade` leaves a working system behind. Before this, roles
existed only if somebody remembered to run `python -m portal.seeds`, and
several routes -- registration approval, nurse creation -- look a role up by
name and would have failed against an empty table.

Idempotent: inserts only what is missing and refreshes the description of what
is already there, so it is safe on a database that has been seeded already.

The role list is duplicated here rather than imported from
`portal.models.role`. That is deliberate, and standard for a data migration: a
migration has to keep doing what it did on the day it was written, even after
the model changes underneath it. `test_roles_seeded` guards the two against
drifting apart.

Revision ID: 9a51dd64f4ba
Revises: 2a6b30d5fb14
Create Date: 2026-08-04 10:56:42.725750

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9a51dd64f4ba'
down_revision = '2a6b30d5fb14'
branch_labels = None
depends_on = None


ROLES = (
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


def upgrade():
    connection = op.get_bind()
    for name, description in ROLES:
        existing = connection.execute(
            sa.text("SELECT id FROM roles WHERE name = :name"), {"name": name}
        ).first()
        if existing:
            # Refresh the wording without disturbing the id — users point at it.
            connection.execute(
                sa.text("UPDATE roles SET description = :d WHERE id = :id"),
                {"d": description, "id": existing[0]},
            )
        else:
            connection.execute(
                sa.text(
                    "INSERT INTO roles (name, description, created_at) "
                    "VALUES (:name, :d, UTC_TIMESTAMP())"
                ),
                {"name": name, "d": description},
            )


def downgrade():
    """Removes only the roles nobody is using.

    A role with accounts attached is left alone: `users.role_id` is NOT NULL,
    so deleting it would either fail on the foreign key or orphan real logins.
    Rolling this back should never cost anyone their account.
    """
    connection = op.get_bind()
    for name, _description in ROLES:
        connection.execute(
            sa.text(
                "DELETE FROM roles WHERE name = :name "
                "AND id NOT IN (SELECT DISTINCT role_id FROM users)"
            ),
            {"name": name},
        )
