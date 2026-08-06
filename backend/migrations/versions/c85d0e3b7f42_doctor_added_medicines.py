"""medicines added automatically from a doctor's manual entry

Revision ID: c85d0e3b7f42
Revises: d3f19a7c4e60
Create Date: 2026-08-05 18:03:55.271840

A hand-entered medicine used to sit in a review queue, unusable until somebody
cleared it. That made an approved case whose treatment included one impossible
to reuse: the medicine was not in the catalogue, so the AI was forbidden to
suggest it, and the next patient with the same presentation got nothing.

Now the medicine is added to the prescribing doctor's department on sign-off.
`added_by_doctor` marks those entries, and carries two rules: they are offered
for prescribing even with no stock (the pharmacy never bought them — the
patient sources them outside, which is why the doctor typed it in), and they
are listed for the pharmacy to complete, since a prescription carries a name
and dosing but no category, manufacturer or price.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c85d0e3b7f42'
down_revision = 'd3f19a7c4e60'
branch_labels = None
depends_on = None


ROUTE_TO_FORM = {
    "oral": "tablet",
    "injection": "injection",
    "iv": "iv_fluid",
    "topical": "ointment",
    "inhalation": "inhaler",
}


def upgrade():
    with op.batch_alter_table('medicine_brands') as batch:
        batch.add_column(
            sa.Column(
                'added_by_doctor',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    _backfill_already_prescribed()


def _backfill_already_prescribed():
    """Adds the medicines doctors already entered by hand.

    These were prescribed and signed for before the catalogue was updated
    automatically, so they sit in the request queue unusable — and any
    approved case that includes one cannot be reused, because the medicine
    the AI would have to name does not exist. Under the new rule they would
    have been added at sign-off, so they are added now.

    Only requests still pending are taken. One the pharmacy dismissed was a
    decision, and this must not overturn it.
    """
    bind = op.get_bind()
    requests = bind.execute(
        sa.text(
            """
            SELECT id, medicine_name, route, instructions, department_id
            FROM custom_medicine_requests
            WHERE status = 'pending' AND created_brand_id IS NULL
            """
        )
    ).fetchall()

    for row in requests:
        name = (row.medicine_name or "").strip()
        if not name:
            continue

        existing = bind.execute(
            sa.text("SELECT id FROM medicine_brands WHERE LOWER(brand_name) = LOWER(:name)"),
            {"name": name},
        ).fetchone()

        if existing:
            brand_id = existing.id
        else:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO medicine_brands
                        (brand_name, form, usage_instructions, reorder_level,
                         is_active, for_all_departments, added_by_doctor)
                    VALUES
                        (:name, :form, :instructions, 20, 1, :for_all, 1)
                    """
                ),
                {
                    "name": name[:150],
                    "form": ROUTE_TO_FORM.get(row.route or "", "other"),
                    "instructions": row.instructions,
                    # With no department on the request there is nowhere to
                    # file it, and a medicine in no department is invisible.
                    "for_all": 0 if row.department_id else 1,
                },
            )
            brand_id = bind.execute(sa.text("SELECT MAX(id) FROM medicine_brands")).scalar()

            if row.department_id:
                bind.execute(
                    sa.text(
                        "INSERT INTO medicine_departments (brand_id, department_id) "
                        "VALUES (:brand_id, :department_id)"
                    ),
                    {"brand_id": brand_id, "department_id": row.department_id},
                )

        bind.execute(
            sa.text(
                "UPDATE custom_medicine_requests SET created_brand_id = :brand_id "
                "WHERE id = :request_id"
            ),
            {"brand_id": brand_id, "request_id": row.id},
        )
        # Existing prescription lines point at the medicine they named, so the
        # knowledge base can match them from here on.
        bind.execute(
            sa.text(
                "UPDATE generated_prescriptions SET brand_id = :brand_id "
                "WHERE brand_id IS NULL AND LOWER(medicine_name) = LOWER(:name)"
            ),
            {"brand_id": brand_id, "name": name},
        )


def downgrade():
    with op.batch_alter_table('medicine_brands') as batch:
        batch.drop_column('added_by_doctor')
