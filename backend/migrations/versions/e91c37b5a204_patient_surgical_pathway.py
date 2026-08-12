"""patient surgical pathway

Revision ID: e91c37b5a204
Revises: c85d0e3b7f42
Create Date: 2026-08-06 11:40:00.000000

Nursing care is a post-operative watch, not something every patient gets. These
columns are what says whether a given patient is on the surgical pathway at
all: `surgery_stage` is NULL for everybody who needs no surgery, and only a
non-NULL stage lets a nurse be assigned.

Every column is nullable with no server default, so existing patients land on
NULL — off the pathway — which is the correct reading of "nobody has said this
patient needs surgery".

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e91c37b5a204'
down_revision = 'c85d0e3b7f42'
branch_labels = None
depends_on = None


STAGES = ("required", "post_op", "ready_for_discharge")


def upgrade():
    with op.batch_alter_table("patients") as batch:
        batch.add_column(
            sa.Column(
                "surgery_stage",
                sa.Enum(*STAGES, name="patient_surgery_stage"),
                nullable=True,
            )
        )
        batch.add_column(sa.Column("surgery_marked_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("surgery_completed_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("observation_days", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("observation_ends_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("surgery_notes", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("patients") as batch:
        batch.drop_column("surgery_notes")
        batch.drop_column("observation_ends_at")
        batch.drop_column("observation_days")
        batch.drop_column("surgery_completed_at")
        batch.drop_column("surgery_marked_at")
        batch.drop_column("surgery_stage")
