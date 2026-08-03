"""microsecond precision on nursing datetimes

Written by hand because autogenerate cannot see this change: SQLAlchemy's
generic `DateTime` compares equal to MySQL's `DATETIME(6)`, so the diff comes
back empty even though the column really is second-resolution on disk.

Why it matters: the doctor's "new updates" badge compares `doctor_seen_at`
against the timestamps of what the nurse logged. At whole-second resolution an
entry written in the same second as the review is indistinguishable from one
written just before it, so the badge either sticks forever or silently drops a
genuine clinical update. Both are wrong; microseconds remove the ambiguity.

`created_at` on these tables was widened by the previous revision. This covers
the application-set datetimes it missed.

Revision ID: 0096dad0dc99
Revises: 5779cd74729c
Create Date: 2026-08-03 11:09:03.331053

"""
from alembic import op
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision = '0096dad0dc99'
down_revision = '5779cd74729c'
branch_labels = None
depends_on = None


# (table, column, nullable) -- every datetime that takes part in ordering the
# nursing record, or in deciding what the doctor has already reviewed.
TARGETS = (
    ("nursing_assignments", "doctor_seen_at", True),
    ("medication_administrations", "administered_at", True),
    ("medication_administrations", "scheduled_at", True),
    ("patient_observations", "recorded_at", False),
    ("clinical_alerts", "acknowledged_at", True),
    ("care_messages", "read_at", True),
)


def _retype(fsp):
    for table, column, nullable in TARGETS:
        op.alter_column(
            table,
            column,
            existing_type=mysql.DATETIME(),
            type_=mysql.DATETIME(fsp=fsp) if fsp else mysql.DATETIME(),
            existing_nullable=nullable,
        )


def upgrade():
    _retype(6)


def downgrade():
    # Truncates the sub-second part; MySQL rounds rather than erroring.
    _retype(0)
