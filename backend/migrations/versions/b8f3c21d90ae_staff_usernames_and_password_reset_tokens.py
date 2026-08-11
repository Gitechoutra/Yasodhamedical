"""staff usernames and password reset tokens

Revision ID: b8f3c21d90ae
Revises: 347ea7cf65c7
Create Date: 2026-08-11 11:40:00.000000

Two things the credentials flow needs:

  * `users.username` -- the sign-in name derived from a staff member's own
    name. Nullable, because an account that predates this still signs in by
    email, and unique, because the audit trail identifies people by it.
  * `password_reset_tokens` -- the single-use links that let somebody set
    their own password. Only the SHA-256 of each token is stored.

The upgrade backfills a username for every existing account rather than
leaving the column empty, so the staff list is consistent the moment this
runs. The derivation here is a deliberately plain SQL twin of
`helpers/credentials.username_base` -- the same shape (first.last, lowercase,
titles dropped) without the transliteration, which SQL cannot do. Any row this
leaves NULL is picked up by `helpers/bootstrap.ensure_usernames` on the next
start, using the real Python implementation.
"""
import re
import unicodedata

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'b8f3c21d90ae'
down_revision = '347ea7cf65c7'
branch_labels = None
depends_on = None


HONORIFICS = {
    "dr", "dr.", "doctor",
    "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss",
    "sr", "sr.", "sister", "prof", "prof.", "professor",
}
_ALLOWED = re.compile(r"[^a-z0-9]+")


def _base(name, email):
    """A username from a name. Mirrors helpers/credentials.username_base.

    Duplicated rather than imported on purpose: a migration has to keep
    producing the same result years from now, and importing application code
    into one couples it to whatever that code becomes.
    """
    ascii_name = (
        unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode("ascii")
    )
    words = [w for w in ascii_name.strip().split() if w]
    while len(words) > 1 and words[0].lower() in HONORIFICS:
        words.pop(0)

    slug = re.sub(r"\.{2,}", ".", _ALLOWED.sub(".", ".".join(words).lower()).strip("."))
    if not slug and email:
        local = (email or "").split("@")[0].lower()
        slug = re.sub(r"\.{2,}", ".", _ALLOWED.sub(".", local).strip("."))
    return (slug or "staff")[:60].strip(".")


def _backfill_usernames(connection):
    users = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("email", sa.String),
        sa.column("username", sa.String),
    )

    rows = connection.execute(
        sa.select(users.c.id, users.c.name, users.c.email).order_by(users.c.id)
    ).fetchall()

    # Ordered by id, so if two people share a name the account that has
    # existed longer keeps the unsuffixed username.
    taken = set()
    for row in rows:
        base = _base(row.name, row.email)
        candidate = base
        suffix = 1
        while candidate in taken:
            candidate = f"{base}{suffix}"
            suffix += 1
        taken.add(candidate)
        connection.execute(
            users.update().where(users.c.id == row.id).values(username=candidate)
        )


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=150), nullable=True))

    # Populate before the unique index exists: adding it first would make the
    # backfill's own duplicates fail one row at a time instead of being
    # numbered, which is what the loop above is for.
    _backfill_usernames(op.get_bind())

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.create_index("ix_users_username", ["username"], unique=True)

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        # SHA-256 hex. The token itself is never stored -- see the model.
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "purpose",
            sa.Enum("invite", "reset", name="reset_token_purpose"),
            nullable=False,
            server_default="reset",
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("issued_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.TIMESTAMP(), server_default=sa.text("now()"), nullable=True
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["issued_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("password_reset_tokens", schema=None) as batch_op:
        batch_op.create_index("ix_password_reset_tokens_token_hash", ["token_hash"], unique=True)
        # Every "has this account got a live link" query filters on the pair.
        batch_op.create_index("idx_reset_token_user", ["user_id", "used_at"], unique=False)


def downgrade():
    with op.batch_alter_table("password_reset_tokens", schema=None) as batch_op:
        batch_op.drop_index("idx_reset_token_user")
        batch_op.drop_index("ix_password_reset_tokens_token_hash")
    op.drop_table("password_reset_tokens")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_username")
        batch_op.drop_column("username")
