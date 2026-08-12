"""The appointment queue: putting a patient into it, and keeping it in step
with consultation state.

`raise_op` is the one definition of "put this patient in their doctor's
queue". Two callers need it — the front desk registering a patient, and the
front desk raising a follow-up OP for a patient already on file — and the
rules it carries (which department, the duplicate window, the billing rule,
who gets notified) have to be identical for both. Written out twice they would
not stay identical, and the half that drifted would be the one nobody tested.

The other rule this module exists to enforce: a patient whose consultation is
finished must not still be sitting in the Appointments queue. Two things can
break that, so both are handled here rather than in one route:

  * a consultation started from the queue      -> claim_appointment_for
  * a consultation started from the Patients   -> claim_appointment_for
    page while the patient is also queued

and `complete_appointment_for` closes whichever appointment ended up linked.

Callers add to the open session; the caller commits, so the appointment move
and the consultation change land together or not at all.
"""

from datetime import datetime, timedelta

from portal.extensions import db
from portal.helpers.audit import APPOINTMENT_CREATED, audit
from portal.helpers.notify import department_doctor_user_ids, notify
from portal.helpers.response import error
from portal.models.appointment import Appointment

OPEN_STATUSES = ("waiting", "in_progress")

# How close together two OPs for the same patient have to be before the second
# one is treated as a double-registration rather than a second visit.
#
# Nobody walks in, is seen, walks out and walks back in inside ten minutes. What
# does happen is the desk pressing "ADD OP" twice, or two receptionists
# registering the same arrival — and every one of those becomes its own card in
# the doctor's queue, with the same patient, the same name, the same ID and only
# the clock to tell them apart. The doctor then has to guess which one to call.
DUPLICATE_WINDOW_MINUTES = 10

# Inside this many days of their last OP, a returning patient's visit is a
# follow-up and is not billed again.
FOLLOW_UP_DAYS = 15


def recent_duplicate_for(patient_id, within_minutes=DUPLICATE_WINDOW_MINUTES, now=None):
    """The patient's own OP raised in the last few minutes, if there is one.

    Cancelled rows are deliberately not counted. Cancelling is how the desk
    undoes a registration it got wrong, and treating the row it just withdrew as
    a duplicate would leave it unable to raise the corrected one for ten
    minutes. A completed row *is* counted: the patient has already been seen, so
    a second OP that soon is a double-registration of the same visit.
    """
    cutoff = (now or datetime.utcnow()) - timedelta(minutes=within_minutes)
    return (
        Appointment.query.filter(
            Appointment.patient_id == patient_id,
            Appointment.status != "cancelled",
            Appointment.created_at >= cutoff,
        )
        .order_by(Appointment.created_at.desc())
        .first()
    )


def op_department_for(patient):
    """The department a patient's OP belongs in. Returns (department, failure).

    Always the assigned doctor's own. `start_appointment` requires both a
    department match *and* `can_access_patient`, so an OP raised against any
    other department is one nobody could ever start — it would sit in a queue
    its patient's doctor cannot see.
    """
    doctor = patient.assigned_doctor
    if not doctor:
        return None, error(
            "Assign a doctor to this patient before creating an OP", status=422
        )
    if not doctor.department:
        return None, error(
            f"Dr. {doctor.user.name if doctor.user else 'this doctor'} has no "
            "department set, so there is no queue to put this patient in. Set "
            "their department in Staff Management first.",
            status=422,
        )
    return doctor.department, None


def raise_op(patient, *, reason=None, actor_user_id=None, now=None, payment_type=None):
    """Puts `patient` in their assigned doctor's queue.

    Returns (appointment, failure). `failure` is a ready-made error response
    when the OP cannot be raised, and the caller returns it unchanged.

    Adds to the open session and does not commit, so the appointment lands in
    the same transaction as whatever raised it — a patient registered with an
    OP is both or neither, never a patient nobody queued.

    The billing rule lives here rather than at either call site: the first OP a
    patient ever has is paid, and a later one is free if it falls within
    FOLLOW_UP_DAYS of their last, otherwise it is a fresh paid registration.
    """
    department, failure = op_department_for(patient)
    if failure:
        return None, failure

    now = now or datetime.utcnow()

    # Refused before anything is written, and in particular before the billing
    # block below — that one moves `last_registered_at` forward, which would
    # make the duplicate look like a genuine follow-up and bill the patient's
    # *next* real visit as free.
    duplicate = recent_duplicate_for(patient.id, now=now)
    if duplicate:
        minutes = max(1, int((now - duplicate.created_at).total_seconds() // 60))
        return None, error(
            f"{patient.name} was already queued {minutes} minute"
            f"{'' if minutes == 1 else 's'} ago and is still on today's list. Use "
            "that OP rather than raising a second one — cancel it first if it was "
            "raised in error.",
            status=409,
            # The row to look at, so the desk can be sent straight to it
            # instead of being told to go and find it.
            errors={"appointment_id": duplicate.id, "status": duplicate.status},
        )

    if patient.last_registered_at is None:
        patient.op_status = "paid"
    else:
        days_since_last_visit = (now - patient.last_registered_at).days
        patient.op_status = "free" if days_since_last_visit <= FOLLOW_UP_DAYS else "paid"
    patient.last_registered_at = now

    appointment = Appointment(
        patient_id=patient.id,
        department_id=department.id,
        reason=reason or None,
        payment_type=payment_type,
        status="waiting",
    )
    db.session.add(appointment)

    # Every doctor in the department gets pinged — the appointment is queued
    # to the department, not to one of them, so whoever is free picks it up.
    notify(
        department_doctor_user_ids(department.id),
        title="New patient in your queue",
        body=f"{patient.name} is waiting in {department.name}.",
        category="appointment",
        link="/dashboard/appointments",
        exclude_user_id=actor_user_id,
    )

    db.session.flush()  # assigns appointment.id for the audit row
    audit(
        APPOINTMENT_CREATED,
        entity="appointment",
        entity_id=appointment.id,
        detail=f"{patient.name} queued for {department.name} ({patient.op_status or 'unbilled'})",
    )
    return appointment, None


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
    """Marks the consultation's appointments completed, which is what drops
    the patient out of the Appointments queue. Returns the first, or None.

    Every appointment linked to the consultation is moved, not just one: a
    patient queued a second time for a visit already under way has two rows
    pointing at the same session, and leaving either behind is what strands a
    finished patient in the queue.
    """
    appointments = Appointment.query.filter_by(consultation_id=consultation.id).all()
    for appointment in appointments:
        appointment.status = "completed"
    return appointments[0] if appointments else None


def reopen_appointment_for(consultation):
    """Puts the patient back in the queue as in-consultation.

    The mirror of `complete_appointment_for`, for when a doctor continues a
    consultation they had just ended because the patient is still in the room.
    Without it the queue would show the patient as finished while a recording
    is running, and the active-consultation count would disagree with the
    consultations actually in progress. Returns the first, or None.
    """
    appointments = Appointment.query.filter_by(consultation_id=consultation.id).all()
    for appointment in appointments:
        appointment.status = "in_progress"
    return appointments[0] if appointments else None
