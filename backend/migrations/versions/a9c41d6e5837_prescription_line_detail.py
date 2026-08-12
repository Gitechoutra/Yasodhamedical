"""quantity, instructions and notes on prescription lines

Revision ID: a9c41d6e5837
Revises: f7a3c58e91b2
Create Date: 2026-08-05 15:02:44.719308

A prescription line carried dose, frequency and duration. Three more are
needed for it to be dispensable and printable as written:

  quantity      what the pharmacy hands over ("20 tablets"). Not derivable
                from the dose — dose is how much the patient takes at a time.
  instructions  how to take it, printed on the label. Defaults from the
                catalogue item and is editable per prescription, because the
                same drug is given differently to different patients.
  notes         the doctor's own note on the line, kept apart from
                `instructions`, which is written for the patient to read.

Nothing is backfilled. Existing lines simply have none of the three, and
`instructions` falls back to the catalogue item's standing usage instructions
when read, so no label ends up blank for a medicine the pharmacy documented.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9c41d6e5837'
down_revision = 'f7a3c58e91b2'
branch_labels = None
depends_on = None


TABLES = ("generated_prescriptions", "case_prescriptions")


def upgrade():
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('quantity', sa.String(length=80), nullable=True))
            batch.add_column(sa.Column('instructions', sa.Text(), nullable=True))
            batch.add_column(sa.Column('notes', sa.Text(), nullable=True))


def downgrade():
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_column('notes')
            batch.drop_column('instructions')
            batch.drop_column('quantity')
