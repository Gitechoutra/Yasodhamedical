"""staff shift schedule

Creates `staff_shifts`: the hospital's rota, one row per person per shift.
Separate from the single `shift` column on `staff_profiles` and `nurses`,
which record the slot somebody normally works and cannot express a date.
Those columns are left alone here — no data is moved or dropped.

Autogenerate also proposed dropping four indexes on clinical_precedents,
custom_medicine_requests, medicine_departments and patient_cases. Those are
pre-existing drift between the models and this database, nothing to do with
the rota, and dropping them here would quietly deoptimise four unrelated
queries. Removed deliberately; if that drift is real it wants its own
migration.

Revision ID: 4c7ce7a093f0
Revises: e91c37b5a204
Create Date: 2026-08-07 12:26:39.330592

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4c7ce7a093f0'
down_revision = 'e91c37b5a204'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'staff_shifts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('shift_date', sa.Date(), nullable=False),
        sa.Column(
            'slot',
            sa.Enum('morning', 'evening', 'night', 'custom', name='staff_shift_slot'),
            nullable=False,
        ),
        sa.Column('starts_at', sa.Time(), nullable=False),
        sa.Column('ends_at', sa.Time(), nullable=False),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('branch_id', sa.Integer(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('scheduled', 'cancelled', name='staff_shift_status'),
            server_default='scheduled',
            nullable=False,
        ),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
        # SET NULL, not CASCADE: deleting a staff account should not erase the
        # record that somebody was rostered that night.
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('staff_shifts', schema=None) as batch_op:
        batch_op.create_index('idx_staff_shift_date_status', ['shift_date', 'status'], unique=False)
        batch_op.create_index('idx_staff_shift_user_date', ['user_id', 'shift_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_staff_shifts_shift_date'), ['shift_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_staff_shifts_user_id'), ['user_id'], unique=False)


def downgrade():
    with op.batch_alter_table('staff_shifts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_staff_shifts_user_id'))
        batch_op.drop_index(batch_op.f('ix_staff_shifts_shift_date'))
        batch_op.drop_index('idx_staff_shift_user_date')
        batch_op.drop_index('idx_staff_shift_date_status')

    op.drop_table('staff_shifts')
