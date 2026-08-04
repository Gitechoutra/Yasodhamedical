"""add lab technician, accountant and other staff roles

Staff Management can create these, so they have to exist in every database —
not only in one where somebody remembered to run the seeder. Same reasoning
and same idempotent shape as migration 9a51dd64f4ba, which seeded the
original five.

The list is duplicated here rather than imported from portal.models.role for
the usual data-migration reason: this has to keep doing what it did the day it
was written. test_default_roles guards the two against drifting.

Revision ID: 7a664f872e54
Revises: a60fe0859833

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7a664f872e54'
down_revision = 'a60fe0859833'
branch_labels = None
depends_on = None


NEW_ROLES = (
    (
        "lab_technician",
        "Runs diagnostic tests for a lab department. No access to "
        "consultations, prescriptions or the nursing record.",
    ),
    (
        "accountant",
        "Handles billing and financial records. No access to clinical data.",
    ),
    (
        "other_staff",
        "General hospital staff with an account but no clinical or financial "
        "access — a placeholder for roles the hospital adds later.",
    ),
)


def upgrade():
    connection = op.get_bind()
    for name, description in NEW_ROLES:
        existing = connection.execute(
            sa.text("SELECT id FROM roles WHERE name = :name"), {"name": name}
        ).first()
        if existing:
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
    """Drops only the roles nobody holds — never orphans a real login."""
    connection = op.get_bind()
    for name, _description in NEW_ROLES:
        connection.execute(
            sa.text(
                "DELETE FROM roles WHERE name = :name "
                "AND id NOT IN (SELECT DISTINCT role_id FROM users)"
            ),
            {"name": name},
        )
