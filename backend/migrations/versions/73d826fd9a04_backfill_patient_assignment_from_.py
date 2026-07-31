"""backfill patient assignment from consultation history

Revision ID: 73d826fd9a04
Revises: 214f1dfc5a67
Create Date: 2026-07-30 17:43:44.457025

`assigned_doctor_id` was added by 214f1dfc5a67, so every patient registered
before that landed with NULL — invisible to every doctor once access became
strictly assignment-based. But for anyone who has actually been seen, the
relationship is already on record: the doctor who ran their consultation.

This gives those patients back to the doctor who treated them, using the most
recent consultation when there are several. A patient who has never been
consulted has nothing to infer from and is deliberately left NULL for the
front desk to route.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '73d826fd9a04'
down_revision = '214f1dfc5a67'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    # Ordered by consultation id so the most recent one wins as we build the
    # map. Row-by-row rather than one UPDATE..JOIN to keep this portable
    # across backends; the affected set is small by nature (only patients
    # predating the column).
    rows = bind.execute(
        sa.text(
            """
            SELECT c.patient_id, c.doctor_id
            FROM consultations c
            JOIN patients p ON p.id = c.patient_id
            WHERE p.assigned_doctor_id IS NULL
              AND c.doctor_id IS NOT NULL
            ORDER BY c.patient_id, c.id
            """
        )
    ).fetchall()

    treating_doctor = {patient_id: doctor_id for patient_id, doctor_id in rows}

    for patient_id, doctor_id in treating_doctor.items():
        bind.execute(
            sa.text(
                "UPDATE patients SET assigned_doctor_id = :doctor_id "
                "WHERE id = :patient_id AND assigned_doctor_id IS NULL"
            ),
            {"doctor_id": doctor_id, "patient_id": patient_id},
        )


def downgrade():
    # Intentionally not reversed. Which rows this filled is not recorded, and a
    # blanket clear would also wipe assignments made by the front desk since.
    pass
