"""pharmacy notification category

Revision ID: d3f19a7c4e60
Revises: b62e8f04a1d9
Create Date: 2026-08-05 17:11:29.845072

The pharmacy now gets notified — a doctor prescribing a medicine the catalogue
lacks needs somebody at the counter to see it. `category` drives the icon and
accent the bell menu renders, so filing those under "system" would bury them
among password and account notices.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3f19a7c4e60'
down_revision = 'b62e8f04a1d9'
branch_labels = None
depends_on = None


OLD = ("appointment", "consultation", "report", "nursing", "system")
NEW = (*OLD, "pharmacy")


def _set(values):
    op.alter_column(
        "notifications",
        "category",
        existing_type=sa.Enum(*OLD, name="notification_category"),
        type_=sa.Enum(*values, name="notification_category"),
        existing_nullable=False,
        existing_server_default="system",
    )


def upgrade():
    _set(NEW)


def downgrade():
    # Anything already filed as pharmacy would not fit the narrower set, so it
    # is relabelled rather than left to be truncated to an empty string.
    op.execute(
        sa.text("UPDATE notifications SET category = 'system' WHERE category = 'pharmacy'")
    )
    _set(OLD)
