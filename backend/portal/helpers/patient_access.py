"""Who may see a patient.

One rule, defined once, applied by every route that returns patient data:

  * admin / reception (no doctor profile) — the whole hospital
  * a doctor — only the patients assigned to them

Assignment happens at registration: the front desk picks the treating doctor
based on the patient's condition. A patient with no assigned doctor is
deliberately invisible to every doctor — nobody has been made responsible for
them yet, so routing them is front-desk work via
`PATCH /patients/<id>/assignment`.
"""

from portal.models.patient import Patient


def patient_scope(doctor):
    """SQLAlchemy filter for the patients this caller may see, or None for
    unrestricted access. Apply to any query joined to Patient."""
    if not doctor:
        return None
    return Patient.assigned_doctor_id == doctor.id


def scope_patients(query, doctor):
    """Applies patient_scope to a query already selecting/joined to Patient."""
    condition = patient_scope(doctor)
    return query if condition is None else query.filter(condition)


def can_access_patient(patient, doctor):
    """Whether this caller may see one specific patient."""
    if not doctor:
        return True
    return patient.assigned_doctor_id == doctor.id
