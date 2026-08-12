"""consultation draft analysis

Caches the background Gemini analysis of a consultation's recording (draft_status /
draft_result / draft_error) so end_consultation can finalize from the cached result
instead of making a fresh, blocking AI call.

Revision ID: 5b63d5d17064
Revises: 0096dad0dc99
Create Date: 2026-08-03 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5b63d5d17064'
down_revision = '0096dad0dc99'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('consultations') as batch_op:
        batch_op.add_column(
            sa.Column(
                'draft_status',
                sa.Enum('pending', 'ready', 'failed', name='consultation_draft_status'),
                nullable=True,
            )
        )
        batch_op.add_column(sa.Column('draft_result', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('draft_error', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('consultations') as batch_op:
        batch_op.drop_column('draft_error')
        batch_op.drop_column('draft_result')
        batch_op.drop_column('draft_status')
