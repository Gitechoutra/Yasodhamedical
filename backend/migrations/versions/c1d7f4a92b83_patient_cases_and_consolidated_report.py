"""patient cases: multiple consultation sessions and a consolidated report

Revision ID: c1d7f4a92b83
Revises: 7a664f872e54
Create Date: 2026-08-05 11:20:04.118392

A consultation used to be the whole visit. It is now one *session* inside a
`patient_cases` row — the course of treatment — so a doctor can start a second
consultation for the same problem without touching the first one's transcript,
summary or prescription. Closing a case merges every session into one
consolidated prescription (`case_prescriptions`) and one report.

Existing consultations are backfilled into one single-session case each, so
history keeps working: every consultation still belongs to a case, completed
ones sit in a closed case and an in-progress one keeps its case open for the
doctor to add sessions to.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1d7f4a92b83'
down_revision = '7a664f872e54'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'patient_cases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('open', 'closed', name='patient_case_status'), nullable=False),
        sa.Column('reason', sa.String(length=255), nullable=True),
        sa.Column('opened_at', sa.DateTime(), nullable=True),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('closed_by', sa.Integer(), nullable=True),
        sa.Column('final_summary', sa.Text(), nullable=True),
        sa.Column('final_diagnosis', sa.Text(), nullable=True),
        sa.Column('progression', sa.Text(), nullable=True),
        sa.Column('final_follow_up_advice', sa.Text(), nullable=True),
        sa.Column('final_lifestyle_advice', sa.Text(), nullable=True),
        sa.Column('consolidated_at', sa.DateTime(), nullable=True),
        sa.Column('final_verified_at', sa.DateTime(), nullable=True),
        sa.Column('final_verified_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctors.id'], ),
        sa.ForeignKeyConstraint(['closed_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['final_verified_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    # The lookup every start-consultation does: does this patient already have
    # an open case with this doctor to join?
    op.create_index(
        'ix_patient_cases_patient_status', 'patient_cases', ['patient_id', 'status']
    )

    op.create_table(
        'case_prescriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('medicine_id', sa.Integer(), nullable=True),
        sa.Column('medicine_name', sa.String(length=150), nullable=False),
        sa.Column('dose', sa.String(length=255), nullable=True),
        sa.Column('frequency', sa.String(length=255), nullable=True),
        sa.Column('duration', sa.String(length=255), nullable=True),
        sa.Column('source_session_number', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['case_id'], ['patient_cases.id'], ),
        sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )

    with op.batch_alter_table('consultations') as batch:
        batch.add_column(sa.Column('case_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('session_number', sa.Integer(), nullable=True))
        batch.create_foreign_key(
            'fk_consultations_case_id', 'patient_cases', ['case_id'], ['id']
        )

    # A report now covers either one session or a whole case, so
    # consultation_id becomes optional and case_id joins it.
    with op.batch_alter_table('reports') as batch:
        batch.alter_column('consultation_id', existing_type=sa.Integer(), nullable=True)
        batch.add_column(sa.Column('case_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_reports_case_id', 'patient_cases', ['case_id'], ['id'])
        batch.create_unique_constraint('uq_reports_case_id', ['case_id'])

    _backfill_cases()


def _backfill_cases():
    """Gives every pre-existing consultation a case of its own.

    One case per consultation rather than grouping by patient: this feature is
    what introduces the idea that two consultations can belong together, so
    there is no record of which historical pairs actually did. Guessing would
    invent clinical links that were never made — a single-session case per
    visit is the only honest reading of the old data.
    """
    bind = op.get_bind()
    consultations = bind.execute(
        sa.text(
            """
            SELECT id, patient_id, doctor_id, status, started_at, ended_at, created_at
            FROM consultations
            WHERE case_id IS NULL
            ORDER BY id
            """
        )
    ).fetchall()

    for row in consultations:
        opened_at = row.started_at or row.created_at
        closed = row.status == 'completed'
        bind.execute(
            sa.text(
                """
                INSERT INTO patient_cases
                    (patient_id, doctor_id, status, opened_at, closed_at, created_at)
                VALUES
                    (:patient_id, :doctor_id, :status, :opened_at, :closed_at, :created_at)
                """
            ),
            {
                "patient_id": row.patient_id,
                "doctor_id": row.doctor_id,
                # A finished consultation is a finished course of treatment as
                # far as the old model was concerned; an open one keeps its
                # case open so the doctor can still add a session to it.
                "status": 'closed' if closed else 'open',
                "opened_at": opened_at,
                "closed_at": row.ended_at if closed else None,
                "created_at": row.created_at,
            },
        )
        case_id = bind.execute(sa.text("SELECT MAX(id) FROM patient_cases")).scalar()
        bind.execute(
            sa.text(
                "UPDATE consultations SET case_id = :case_id, session_number = 1 "
                "WHERE id = :consultation_id"
            ),
            {"case_id": case_id, "consultation_id": row.id},
        )


def downgrade():
    with op.batch_alter_table('reports') as batch:
        batch.drop_constraint('uq_reports_case_id', type_='unique')
        batch.drop_constraint('fk_reports_case_id', type_='foreignkey')
        batch.drop_column('case_id')
        # Any row that was a case report has no consultation to fall back on,
        # so it is removed below before the column goes back to NOT NULL.

    op.execute(sa.text("DELETE FROM reports WHERE consultation_id IS NULL"))

    with op.batch_alter_table('reports') as batch:
        batch.alter_column('consultation_id', existing_type=sa.Integer(), nullable=False)

    with op.batch_alter_table('consultations') as batch:
        batch.drop_constraint('fk_consultations_case_id', type_='foreignkey')
        batch.drop_column('session_number')
        batch.drop_column('case_id')

    op.drop_table('case_prescriptions')
    op.drop_index('ix_patient_cases_patient_status', table_name='patient_cases')
    op.drop_table('patient_cases')
