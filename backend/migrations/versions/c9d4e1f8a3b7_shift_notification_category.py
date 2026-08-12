"""shift notification category

Revision ID: c9d4e1f8a3b7
Revises: b8f3c21d90ae
Create Date: 2026-08-11 18:05:00.000000

Scheduling somebody now notifies them. `category` drives the icon and accent
the bell menu renders, and a shift is the one notification that tells a person
where to physically be -- filing it under "system" would bury it among the
password and account notices it least resembles.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9d4e1f8a3b7'
down_revision = 'b8f3c21d90ae'
branch_labels = None
depends_on = None


OLD = ("appointment", "consultation", "report", "nursing", "pharmacy", "system")
NEW = ("appointment", "consultation", "report", "nursing", "pharmacy", "shift", "system")


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
    # Anything already filed as a shift would not fit the narrower set, so it
    # is relabelled rather than left to be truncated to an empty string.
    op.execute(
        sa.text("UPDATE notifications SET category = 'system' WHERE category = 'shift'")
    )
    _set(OLD)
