"""department-wise pharmacy inventory

Revision ID: f7a3c58e91b2
Revises: e4b8c2f70d15
Create Date: 2026-08-05 14:08:52.610337

Medicines are now organised by department, so each department manages and sees
its own inventory. `medicine_departments` is a link table rather than a column
because the relationship is genuinely many-to-many — Paracetamol is used by
every department while Oxytocin is used by one — and `for_all_departments`
covers general stock without tagging it to a dozen departments by hand.

Prescriptions gain `brand_id`: doctors now prescribe from their department's
stocked pharmacy inventory, so a prescription line links to the catalogue item
the hospital can actually dispense. `medicine_id` stays for the older clinical
formulary link, which nursing medication orders still resolve against.

Also seeds the standard hospital departments, so the department-wise inventory
has real sections to fill. Seeding is skipped for any name already present, so
this cannot duplicate a department someone has already created.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7a3c58e91b2'
down_revision = 'e4b8c2f70d15'
branch_labels = None
depends_on = None


# The departments a general hospital runs, so a pharmacist has somewhere to
# file each medicine from day one.
SEED_DEPARTMENTS = [
    "Cardiology",
    "Oncology",
    "Neurology",
    "Pediatrics",
    "Dermatology",
    "ENT",
    "Ophthalmology",
    "Pulmonology",
    "Nephrology",
    "Endocrinology",
    "Psychiatry",
    "Urology",
]


def upgrade():
    op.create_table(
        'medicine_departments',
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('department_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['medicine_brands.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('brand_id', 'department_id'),
    )
    # The lookup every department page and every prescription does.
    op.create_index(
        'ix_medicine_departments_department', 'medicine_departments', ['department_id']
    )

    with op.batch_alter_table('medicine_brands') as batch:
        batch.add_column(sa.Column('usage_instructions', sa.Text(), nullable=True))
        batch.add_column(sa.Column('unit_price', sa.Numeric(10, 2), nullable=True))
        batch.add_column(
            sa.Column(
                'for_all_departments',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(
            sa.Column(
                'updated_at',
                sa.TIMESTAMP(),
                server_default=sa.text('now()'),
                nullable=True,
            )
        )

    for table, constraint in (
        ('generated_prescriptions', 'fk_generated_prescriptions_brand'),
        ('case_prescriptions', 'fk_case_prescriptions_brand'),
    ):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('brand_id', sa.Integer(), nullable=True))
            batch.create_foreign_key(constraint, 'medicine_brands', ['brand_id'], ['id'])

    _seed_departments()


def _seed_departments():
    bind = op.get_bind()
    existing = {
        (name or "").strip().lower()
        for (name,) in bind.execute(sa.text("SELECT name FROM departments")).fetchall()
    }
    for name in SEED_DEPARTMENTS:
        if name.lower() in existing:
            continue
        bind.execute(
            sa.text("INSERT INTO departments (name) VALUES (:name)"), {"name": name}
        )


def downgrade():
    for table, constraint in (
        ('case_prescriptions', 'fk_case_prescriptions_brand'),
        ('generated_prescriptions', 'fk_generated_prescriptions_brand'),
    ):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(constraint, type_='foreignkey')
            batch.drop_column('brand_id')

    with op.batch_alter_table('medicine_brands') as batch:
        batch.drop_column('updated_at')
        batch.drop_column('for_all_departments')
        batch.drop_column('unit_price')
        batch.drop_column('usage_instructions')

    op.drop_index('ix_medicine_departments_department', table_name='medicine_departments')
    op.drop_table('medicine_departments')

    # Seeded departments are deliberately left in place. Doctors, appointments
    # and medicines may have been filed against them since, and dropping a
    # department would take that with it.
