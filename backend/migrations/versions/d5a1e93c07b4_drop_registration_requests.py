"""drop registration_requests

Revision ID: d5a1e93c07b4
Revises: c9d4e1f8a3b7
Create Date: 2026-08-12 13:20:00.000000

Self-service staff registration is gone, and this was the last of it.

The table outlived its feature: no route, no helper and no frontend call
referenced it any more, so `RegistrationRequest` could neither be written to
nor read through the application -- the model was reachable only from the
barrel export in `models/__init__.py`. A table nothing can reach is not a
smaller version of a feature, it is schema that every future `flask db
migrate` has to be told to leave alone.

The 8 rows it held are archived at
`database/archive/registration_requests_2026-08-12.sql` (DDL and data), so
this drops structure rather than losing what was in it. The 24
`registration_request` rows in `audit_logs` stay where they are: the audit
trail records what happened, and is not rewritten when a feature is removed.

`downgrade` rebuilds the table exactly as it stood, so a restore of the
archived dump lands on the same shape. It does not bring the rows back --
replay the archived INSERT for that.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd5a1e93c07b4'
down_revision = 'c9d4e1f8a3b7'
branch_labels = None
depends_on = None


REQUESTABLE_ROLES = ("doctor", "nurse", "receptionist", "pharmacist")
STATUSES = ("pending", "approved", "rejected")


def upgrade():
    op.drop_table("registration_requests")


def downgrade():
    op.create_table(
        "registration_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=150), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column(
            "requested_role",
            sa.Enum(*REQUESTABLE_ROLES, name="requested_role"),
            nullable=False,
        ),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("branch_id", sa.Integer(), nullable=True),
        sa.Column("license_no", sa.String(length=60), nullable=True),
        sa.Column("specialization", sa.String(length=150), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(*STATUSES, name="registration_status"),
            nullable=False,
        ),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_note", sa.String(length=255), nullable=True),
        sa.Column("created_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.ForeignKeyConstraint(["created_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_registration_email", "registration_requests", ["email"])
    op.create_index(
        "idx_registration_status_created",
        "registration_requests",
        ["status", "created_at"],
    )
