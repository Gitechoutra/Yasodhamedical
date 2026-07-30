"""Keeps the appointment queue in step with consultation state.

The rule the whole module exists to enforce: a patient whose consultation is
finished must not still be sitting in the Appointments queue. Two things can
break that, so both are handled here rather than in one route:

  * a consultation started from the queue      -> claim_appointment_for
  * a consultation started from the Patients   -> claim_appointment_for
    page while the patient is also queued

and `complete_appointment_for` closes whichever appointment ended up linked.

Callers add to the open session; the caller commits, so the appointment move
and the consultation change land together or not at all.
"""

from portal.extensions import db
from portal.models.appointment import Appointment

OPEN_STATUSES = ("waiting", "in_progress")


def claim_appointment_for(consultation, doctor, create_if_missing=True):
    """Gives a starting consultation an appointment row to move through.

    Without this, a doctor who starts a consultation straight from the
    Patients page leaves the patient's queue entry stranded on "waiting"
    forever — it never gets completed because nothing links it back. And a
    patient who was never queued at all would have an in-progress
    consultation that appears nowhere in Appointments, so the "in
    consultation" list and the active-consultation count would disagree.

    Every in-progress consultation therefore has exactly one appointment.
    Returns it (or None if there was none to claim and creation was off).
    """
    already_linked = Appointment.query.filter_by(consultation_id=consultation.id).first()
    if already_linked:
        return already_linked

    query = Appointment.query.filter(
        Appointment.patient_id == consultation.patient_id,
        Appointment.consultation_id.is_(None),
        Appointment.status.in_(OPEN_STATUSES),
    )
    if doctor and doctor.department_id:
        query = query.filter(Appointment.department_id == doctor.department_id)

    # Oldest first: if somehow queued twice, the one they've waited on longest.
    appointment = query.order_by(Appointment.created_at.asc()).first()

    if not appointment:
        if not create_if_missing or not doctor or not doctor.department_id:
            return None
        # Walk-in: seen without ever joining the queue. Record it so the visit
        # still shows up as in-consultation and completes like any other.
        appointment = Appointment(
            patient_id=consultation.patient_id,
            department_id=doctor.department_id,
            reason="Walk-in consultation",
        )
        db.session.add(appointment)

    appointment.consultation_id = consultation.id
    appointment.status = "in_progress"
    if doctor:
        appointment.doctor_id = doctor.id
    return appointment


def complete_appointment_for(consultation):
    """Marks the consultation's appointment completed, which is what drops
    the patient out of the Appointments queue. Returns it, or None."""
    appointment = Appointment.query.filter_by(consultation_id=consultation.id).first()
    if not appointment:
        return None
    appointment.status = "completed"
    return appointment
