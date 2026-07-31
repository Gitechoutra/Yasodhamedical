"""merge nursing module and op status heads

Revision ID: 4f3779025df7
Revises: cc97ad825465, fba096ffbcc8
Create Date: 2026-07-31 11:41:39.647205

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4f3779025df7'
down_revision = ('cc97ad825465', 'fba096ffbcc8')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
