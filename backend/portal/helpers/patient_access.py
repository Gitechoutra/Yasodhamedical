"""Who may see a patient.

One rule, defined once, applied by every route that returns patient data:

  * admin / reception (no doctor profile) — the whole hospital
  * a doctor — patients assigned to them, plus any patient not yet assigned
    to anyone

The unassigned fallback exists so a patient registered before assignment was
introduced (or one whose assignment was cleared) is still reachable and can be
worked on. New registrations always carry an assigned doctor, so in practice a
doctor only ever sees their own list.
"""

from portal.extensions import db
from portal.models.patient import Patient


def patient_scope(doctor):
    """SQLAlchemy filter for the patients this caller may see, or None for
    unrestricted access. Apply to any query joined to Patient."""
    if not doctor:
        return None
    return db.or_(
        Patient.assigned_doctor_id == doctor.id,
        Patient.assigned_doctor_id.is_(None),
    )


def scope_patients(query, doctor):
    """Applies patient_scope to a query already selecting/joined to Patient."""
    condition = patient_scope(doctor)
    return query if condition is None else query.filter(condition)


def can_access_patient(patient, doctor):
    """Whether this caller may see one specific patient."""
    if not doctor:
        return True
    return patient.assigned_doctor_id in (None, doctor.id)
