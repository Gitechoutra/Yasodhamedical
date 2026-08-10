"""Seeds the starting clinical formulary.

The list lives in `models/medicine.DEFAULT_FORMULARY`.

Matched on name. Unlike departments, `medicines.name` carries no unique
constraint — the column is deliberately open so a hospital can hold two
strengths of the same drug — so the guard here is the only thing preventing
duplicates, and it has to compare against what is actually in the table rather
than relying on the database to refuse.

Only ever adds. A medicine already on file keeps its category, dose and
frequency exactly as they are: those are clinical defaults a doctor may have
tuned to how this hospital prescribes, and quietly resetting them on every
restart would be the worst kind of surprise.
"""

from portal.extensions import db
from portal.models.medicine import DEFAULT_FORMULARY, Medicine


def run():
    """Creates any missing formulary entry. Returns the names it created."""
    existing = {name for (name,) in db.session.query(Medicine.name).all()}
    missing = [row for row in DEFAULT_FORMULARY if row[0] not in existing]

    for name, category, dose, frequency in missing:
        db.session.add(
            Medicine(
                name=name,
                category=category,
                default_dose=dose,
                default_frequency=frequency,
            )
        )
    if missing:
        db.session.commit()

    added = [row[0] for row in missing]
    if added:
        print(f"  Medicines   -> added {len(added)}: {', '.join(added)}")
    else:
        print(f"  Medicines   -> all {len(DEFAULT_FORMULARY)} already present")

    return added
