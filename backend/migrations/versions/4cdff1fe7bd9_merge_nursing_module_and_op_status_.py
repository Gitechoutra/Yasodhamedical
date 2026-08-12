"""merge nursing module and OP status branches

Revision ID: 4cdff1fe7bd9
Revises: cc97ad825465, fba096ffbcc8
Create Date: 2026-07-31 11:44:03.577317

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4cdff1fe7bd9'
down_revision = ('cc97ad825465', 'fba096ffbcc8')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
