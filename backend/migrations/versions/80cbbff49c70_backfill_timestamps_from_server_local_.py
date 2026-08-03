"""backfill timestamps from server local to utc

Every `created_at`/`updated_at` in the schema was defined with
`server_default=db.func.now()`. MySQL's NOW() returns the *server's local*
time, while every application-set datetime in this codebase (`starts_at`,
`administered_at`, `recorded_at`, `last_login_at`, ...) is naive UTC from
`datetime.utcnow()`. Both were then serialised by `to_utc_iso()` with a "Z"
suffix, so half the API's timestamps claimed UTC while holding local time --
here, 5:30 ahead.

That is a correctness problem well beyond cosmetics: it broke the "today's
queue" filter, reception's "registered today" count, the ordering of any
timeline mixing the two kinds, and the nursing review marker, which compares
a UTC marker against `created_at`.

The models now set these columns from Python (`default=datetime.utcnow`), so
new rows are correct. This migration corrects the rows written before that.

Rows are only shifted when they are provably wrong:

  * `> UTC_TIMESTAMP()` -- a creation time in the future is impossible
  * `< UTC_TIMESTAMP() - INTERVAL 1 HOUR` -- written before the model fix

Anything between those is a row created since the fix and already correct, so
it is left alone. The offset is read from the database itself rather than
assumed, and `downgrade()` shifts back by the same amount.

Revision ID: 80cbbff49c70
Revises: a5752d1b80ce
Create Date: 2026-08-03 10:56:36.342619

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '80cbbff49c70'
down_revision = 'a5752d1b80ce'
branch_labels = None
depends_on = None


# (table, column) for every timestamp that was written by MySQL's NOW().
# `reports.generated_at` and the nursing/consultation datetimes are absent on
# purpose -- those were always set from Python and are already UTC.
TARGETS = (
    ("appointments", "created_at"),
    ("audit_logs", "created_at"),
    ("care_messages", "created_at"),
    ("clinical_alerts", "created_at"),
    ("consultation_summaries", "created_at"),
    ("consultations", "created_at"),
    ("conversation_messages", "created_at"),
    ("departments", "created_at"),
    ("doctors", "created_at"),
    ("generated_prescriptions", "created_at"),
    ("medication_administrations", "created_at"),
    ("medication_orders", "created_at"),
    ("medicines", "created_at"),
    ("notifications", "created_at"),
    ("nurses", "created_at"),
    ("nursing_assignments", "created_at"),
    ("nursing_assignments", "updated_at"),
    ("nursing_notes", "created_at"),
    ("patient_observations", "created_at"),
    ("patients", "created_at"),
    ("patients", "updated_at"),
    ("reports", "created_at"),
    ("roles", "created_at"),
    ("users", "created_at"),
    ("users", "updated_at"),
)

# Only touch rows that cannot be correct: dated in the future, or written
# before the application started supplying UTC itself.
STALE = (
    "{col} IS NOT NULL AND ("
    "{col} > UTC_TIMESTAMP() OR {col} < UTC_TIMESTAMP() - INTERVAL 1 HOUR)"
)


def _exists(connection, table, column):
    """Skips a target missing from this database -- the schema grew over
    several migrations, and a partially-upgraded copy shouldn't crash here."""
    return bool(
        connection.execute(
            sa.text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() "
                "AND TABLE_NAME = :t AND COLUMN_NAME = :c"
            ),
            {"t": table, "c": column},
        ).scalar()
    )


def _shift(sign):
    connection = op.get_bind()

    # Read the offset from the server rather than assuming a timezone.
    offset = (
        connection.execute(
            sa.text("SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())")
        ).scalar()
        or 0
    )
    if not offset:
        return  # server already runs on UTC; nothing to correct

    for table, column in TARGETS:
        if not _exists(connection, table, column):
            continue
        quoted = f"`{column}`"
        connection.execute(
            sa.text(
                f"UPDATE `{table}` "
                f"SET {quoted} = {quoted} {sign} INTERVAL :offset SECOND "
                f"WHERE {STALE.format(col=quoted)}"
            ),
            {"offset": abs(offset)},
        )


def upgrade():
    _shift("-")


def downgrade():
    _shift("+")
