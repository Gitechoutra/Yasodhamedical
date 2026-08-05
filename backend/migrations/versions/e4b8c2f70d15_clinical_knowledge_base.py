"""clinical knowledge base of doctor-approved cases

Revision ID: e4b8c2f70d15
Revises: c1d7f4a92b83
Create Date: 2026-08-05 12:41:17.882104

`clinical_precedents` records what doctors here have actually approved — the
symptoms, the diagnosis and the exact signed-off medicines — so a later
patient presenting the same way gets a suggestion grounded in a decision a
doctor already made, rather than one invented per consultation.

Two provenance columns come with it: `consultation_summaries.matched_
precedents` snapshots which approved cases the AI was shown, and
`generated_prescriptions.source_precedent_id` records which one a particular
medicine was carried over from. Both exist so a doctor reviewing a suggestion
can see where it came from.

Nothing is backfilled. A precedent is created the moment a doctor verifies a
prescription, and existing verified consultations are deliberately left out:
they were signed off before the doctor could know their decision would be
reused as guidance for other patients, and enrolling them retroactively is not
ours to assume. Re-verifying one enrols it.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4b8c2f70d15'
down_revision = 'c1d7f4a92b83'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'clinical_precedents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source_consultation_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('symptoms', sa.Text(), nullable=True),
        sa.Column('diagnosis', sa.Text(), nullable=True),
        sa.Column('medicines', sa.Text(), nullable=False),
        sa.Column('age_band', sa.String(length=16), nullable=True),
        sa.Column('gender', sa.String(length=10), nullable=True),
        sa.Column('embedding', sa.LargeBinary(), nullable=True),
        sa.Column('embedding_model', sa.String(length=80), nullable=True),
        sa.Column('embedding_text', sa.Text(), nullable=True),
        sa.Column('times_suggested', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('times_accepted', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('retired_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['source_consultation_id'], ['consultations.id'], ),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctors.id'], ),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source_consultation_id'),
    )
    # Every retrieval scans the active rows, so that filter is the one worth
    # an index — similarity itself is computed in Python over the vectors.
    op.create_index(
        'ix_clinical_precedents_retired_at', 'clinical_precedents', ['retired_at']
    )

    with op.batch_alter_table('consultation_summaries') as batch:
        batch.add_column(sa.Column('matched_precedents', sa.Text(), nullable=True))

    with op.batch_alter_table('generated_prescriptions') as batch:
        batch.add_column(sa.Column('source_precedent_id', sa.Integer(), nullable=True))
        batch.create_foreign_key(
            'fk_generated_prescriptions_precedent',
            'clinical_precedents',
            ['source_precedent_id'],
            ['id'],
        )


def downgrade():
    with op.batch_alter_table('generated_prescriptions') as batch:
        batch.drop_constraint('fk_generated_prescriptions_precedent', type_='foreignkey')
        batch.drop_column('source_precedent_id')

    with op.batch_alter_table('consultation_summaries') as batch:
        batch.drop_column('matched_precedents')

    op.drop_index('ix_clinical_precedents_retired_at', table_name='clinical_precedents')
    op.drop_table('clinical_precedents')
