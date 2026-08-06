"""manual medicine entry on prescriptions, and the pharmacy's review queue

Revision ID: b62e8f04a1d9
Revises: a9c41d6e5837
Create Date: 2026-08-05 16:24:38.402611

A doctor must never be blocked by the catalogue. Prescription lines gain
`is_custom` for a medicine typed in by hand, and `route` for how it is given —
a catalogue item carries its own dosage form, but a hand-entered one has
nowhere else to record that.

`is_custom` is a stored flag rather than "has no brand link", because the two
mean different things: a line loses its link when a medicine is archived, and
that is not a doctor choosing to go off-catalogue.

`custom_medicine_requests` is the other half of the bargain. Left alone, manual
entry would let the catalogue drift out of step with what is actually being
prescribed; instead each hand-entered medicine becomes one row the pharmacy can
review and add permanently. Keyed on the normalised name so the same missing
medicine from five doctors is one decision, with a count that argues its own
case.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b62e8f04a1d9'
down_revision = 'a9c41d6e5837'
branch_labels = None
depends_on = None


def upgrade():
    for table in ("generated_prescriptions", "case_prescriptions"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('route', sa.String(length=20), nullable=True))
            batch.add_column(
                sa.Column(
                    'is_custom',
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                )
            )

    op.create_table(
        'custom_medicine_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('normalized_name', sa.String(length=150), nullable=False),
        sa.Column('medicine_name', sa.String(length=150), nullable=False),
        sa.Column('strength', sa.String(length=80), nullable=True),
        sa.Column('route', sa.String(length=20), nullable=True),
        sa.Column('dose', sa.String(length=255), nullable=True),
        sa.Column('frequency', sa.String(length=255), nullable=True),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('times_prescribed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('first_requested_at', sa.DateTime(), nullable=True),
        sa.Column('last_requested_at', sa.DateTime(), nullable=True),
        sa.Column('requested_by_doctor_id', sa.Integer(), nullable=True),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('pending', 'added', 'dismissed', name='custom_medicine_request_status'),
            nullable=False,
            server_default='pending',
        ),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('review_note', sa.String(length=255), nullable=True),
        sa.Column('created_brand_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['requested_by_doctor_id'], ['doctors.id'], ),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['created_brand_id'], ['medicine_brands.id'], ),
        sa.PrimaryKeyConstraint('id'),
        # One request per medicine name: the same gap reported by several
        # doctors has to land on the same row for the count to mean anything.
        sa.UniqueConstraint('normalized_name'),
    )
    # The pharmacy's queue is "what is still pending", so that is the filter
    # worth indexing.
    op.create_index(
        'ix_custom_medicine_requests_status', 'custom_medicine_requests', ['status']
    )


def downgrade():
    op.drop_index(
        'ix_custom_medicine_requests_status', table_name='custom_medicine_requests'
    )
    op.drop_table('custom_medicine_requests')

    for table in ("case_prescriptions", "generated_prescriptions"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column('is_custom')
            batch.drop_column('route')
