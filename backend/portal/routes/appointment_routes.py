from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.audit import APPOINTMENT_CREATED, audit
from portal.helpers.case_helper import (
    attach_to_case,
    case_for_new_session,
    open_case_for,
    todays_session,
)
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import role_required
from portal.helpers.notify import department_doctor_user_ids, notify
from portal.helpers.patient_access import can_access_patient, patient_scope
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.department import Department
from portal.models.patient import Patient

appointment_bp = Blueprint("appointments", __name__)

# In the queue, and so what the dashboard's queue card counts: still on the
# board, i.e. not yet completed or cancelled.
OPEN_STATUSES = ("waiting", "in_progress")

# Off the board for good — nothing can be started from one of these.
CLOSED_STATUSES = ("completed", "cancelled")


def open_appointments_query():
    """Appointments still on the board — the one definition of "the queue",
    shared by the Appointments page and by the dashboard's queue card, so the
    number on the card always matches the rows behind it.

    The status check is the primary rule; the consultation check is a safety
    net. A row whose consultation is already completed must never appear in
    the queue even if its own status was somehow left open — that's the
    "completed patients never remain in Appointments" guarantee, enforced on
    read so no stale row can slip through.

    Deliberately *not* narrowed to appointments raised today. The queue is a
    work list, not a diary: a patient queued yesterday evening and never
    called in is still waiting this morning, and a consultation left running
    overnight is still running. Counting only rows with today's `created_at`
    hid exactly those patients from the dashboard card while the page it
    links to still listed them — the card read "0" over a queue that had
    people in it. An appointment can only ever be raised now or earlier, so
    "still open" already implies "still today's work"; there is no date
    window that could include a waiting patient without also including the
    ones who have been waiting longest.
    """
    return (
        Appointment.query.outerjoin(
            Consultation, Appointment.consultation_id == Consultation.id
        )
        .filter(
            Appointment.status.in_(OPEN_STATUSES),
            db.or_(Consultation.id.is_(None), Consultation.status != "completed"),
        )
    )


@appointment_bp.get("")
@jwt_required()
def list_appointments():
    """The live queue: who is being seen, who is next, who is still waiting.

    Completed and cancelled appointments are left out by default — this is a
    work list, not a history. Pass ?status=completed (or cancelled) to look
    one of those up explicitly.
    """
    status = request.args.get("status")
    # ?filter=today was the dashboard card's link and is still accepted so
    # old links and bookmarks keep working. It no longer narrows anything:
    # the queue is every open appointment whatever day it was raised on (see
    # open_appointments_query), so this resolves to the same live queue.
    queue_requested = request.args.get("filter") == "today"

    if status and not queue_requested:
        # An explicit status on its own is a lookup, not the queue — it may
        # return completed/cancelled rows, which the queue never does.
        query = Appointment.query.filter(Appointment.status == status)
    else:
        query = open_appointments_query()
        if status:
            query = query.filter(Appointment.status == status)

    doctor = get_current_doctor()
    # Explicit column, not filter_by: the query may already be joined to
    # Consultation, and filter_by would bind to that entity instead.
    if doctor:
        # A doctor's queue is strictly the patients assigned to them, within
        # their own department. Same rule as every other patient-facing route.
        query = query.join(Patient, Appointment.patient_id == Patient.id).filter(
            Appointment.department_id == doctor.department_id,
            patient_scope(doctor),
        )
    else:
        department_id = request.args.get("department_id", type=int)
        if department_id:
            query = query.filter(Appointment.department_id == department_id)

    appointments = query.order_by(
        # Whoever is in the room comes first, then the queue in the order
        # people actually joined it — oldest first, so the row under the
        # ongoing one is genuinely the next patient.
        db.case((Appointment.status == "in_progress", 0), else_=1),
        Appointment.created_at.asc(),
    ).all()

    # Queue numbers count the waiting only, so "Queue #1" always means next up.
    queue_position = 0
    payload = []
    for appointment in appointments:
        queue_number = None
        if appointment.status == "waiting":
            queue_position += 1
            queue_number = queue_position
        payload.append(appointment.to_dict(queue_number=queue_number))

    return success(payload)


@appointment_bp.post("")
@role_required("receptionist")
def create_appointment():
    # The front desk, and only the front desk.
    #
    # Not doctors: registering a patient for an OP visit is intake work, not
    # something a doctor should self-serve — that keeps the department queues
    # an honest reflection of who actually walked in.
    #
    # Not admins either, which is narrower than the FRONT_DESK_ROLES used by
    # the patient-routing endpoints. Admin is a monitoring and administration
    # role: it reads the queue and the appointment book, but calling a patient
    # in is an operational act belonging to the desk. Raising an OP from an
    # admin account would put a visit into a department queue that no
    # receptionist knows about.
    #
    # FRONT_DESK_ROLES deliberately still includes admin for reassigning and
    # removing a registration (patient_routes) — those are corrections to bad
    # data, which is administration.
    payload = request.get_json(silent=True) or {}
    patient_id = payload.get("patient_id")
    department_id = payload.get("department_id")

    if not patient_id or not department_id:
        return error("patient_id and department_id are required", status=422)

    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    department = Department.query.get(department_id)
    if not department:
        return error("Department not found", status=404)

    # An OP can only ever be queued to the patient's assigned doctor's own
    # department — start_appointment later requires both a department match
    # AND can_access_patient (assigned_doctor_id == doctor.id), so an OP
    # created against any other department could never be started by anyone.
    if not patient.assigned_doctor_id:
        return error("Assign a doctor to this patient before creating an OP", status=422)
    assigned_department_id = patient.assigned_doctor.department_id
    if not assigned_department_id:
        return error("This patient's assigned doctor has no department set", status=422)
    if assigned_department_id != department.id:
        return error(
            f"This patient is assigned to Dr. {patient.assigned_doctor.user.name if patient.assigned_doctor.user else 'their doctor'} "
            f"in {patient.assigned_doctor.department.name} — the OP must be created in that department",
            status=422,
        )

    # OP billing rule: first-ever OP for this patient is always paid. A
    # returning patient's new OP is free if it's within 15 days of their
    # last one (follow-up), otherwise it's a fresh paid registration.
    now = datetime.utcnow()
    if patient.last_registered_at is None:
        patient.op_status = "paid"
    else:
        days_since_last_visit = (now - patient.last_registered_at).days
        patient.op_status = "free" if days_since_last_visit <= 15 else "paid"
    patient.last_registered_at = now

    appointment = Appointment(
        patient_id=patient_id,
        department_id=department_id,
        reason=payload.get("reason") or None,
        status="waiting",
    )
    db.session.add(appointment)

    # Every doctor in the department gets pinged — the appointment is queued
    # to the department, not to one of them, so whoever is free picks it up.
    notify(
        department_doctor_user_ids(department_id),
        title="New patient in your queue",
        body=f"{patient.name} is waiting in {department.name}.",
        category="appointment",
        link="/dashboard/appointments",
        exclude_user_id=get_jwt_identity(),
    )

    db.session.flush()  # assigns appointment.id for the audit row
    audit(
        APPOINTMENT_CREATED,
        entity="appointment",
        entity_id=appointment.id,
        detail=f"{patient.name} queued for {department.name} ({patient.op_status or 'unbilled'})",
    )
    db.session.commit()
    dashboard_changed("appointment_created")

    return success(appointment.to_dict(), message="OP created", status=201)


def _link_to_consultation(appointment, consultation, doctor, status):
    """Points an appointment at the session it belongs to and moves it on.

    Every path out of `start_appointment` other than an outright refusal ends
    here, so an appointment the doctor has acted on never stays behind in the
    queue on its original status.
    """
    appointment.doctor_id = doctor.id
    appointment.consultation_id = consultation.id
    appointment.status = status
    return appointment


@appointment_bp.post("/<int:appointment_id>/start")
@jwt_required()
def start_appointment(appointment_id):
    """Calls the patient in: opens their consultation room and moves the
    appointment to `in_progress`.

    Deliberately idempotent. Every reason a session might already exist —
    the doctor picked this patient up on another tab, the front desk raised a
    second OP for a visit already under way, the patient was seen earlier the
    same day — resolves to *that* session rather than to an error, because a
    refusal here used to leave the appointment sitting in the queue on
    "waiting" with no action left that could ever clear it.
    """
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)
    if appointment.status in CLOSED_STATUSES:
        return error("This appointment is already closed", status=409)

    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can start appointments", status=403)
    if doctor.department_id != appointment.department_id:
        return error("This appointment belongs to a different department", status=403)
    if not can_access_patient(appointment.patient, doctor):
        return error("This patient is assigned to another doctor", status=403)

    # Already picked up, by this doctor, with a room to go back to: pressing
    # start again is the same action as resuming, so it opens that room.
    if appointment.consultation_id and appointment.consultation:
        return success(
            appointment.consultation.to_dict(include_detail=True),
            message="Consultation resumed",
        )

    # A patient coming back for more of the same treatment continues their
    # open case, so this becomes session 2 (3, …) rather than a fresh visit
    # that loses sight of the earlier ones. Nothing already recorded is
    # touched — the previous session keeps its own transcript, summary and
    # prescription.
    #
    # Checked before anything is created: a patient queued twice while already
    # in the room would otherwise leave the case with two open sessions, and
    # nothing could then say which one a recording belongs to.
    existing = open_case_for(appointment.patient_id, doctor.id)
    running = existing.open_session if existing else None
    if running:
        # The session already open with this patient *is* this visit, so the
        # appointment joins it and the doctor lands in the room that is
        # recording. Both rows complete together when the session ends.
        _link_to_consultation(appointment, running, doctor, "in_progress")
        db.session.commit()
        dashboard_changed("consultation_started")
        return success(
            running.to_dict(include_detail=True),
            message=f"Resumed session {running.session_number} with this patient",
        )

    # A session is one visit, so a patient seen earlier today continues that
    # session rather than getting a second one. Same rule as starting a
    # session directly — enforced here too, or the front desk raising another
    # OP would quietly split one visit into two half-records.
    todays = todays_session(existing)
    if todays:
        # The visit already happened today, so this OP is closed off against
        # that session rather than left waiting for a consultation that must
        # never be created. The doctor is taken to it, where "Continue
        # consultation" reopens recording on the same record.
        _link_to_consultation(appointment, todays, doctor, "completed")
        db.session.commit()
        dashboard_changed("consultation_started")
        return success(
            todays.to_dict(include_detail=True),
            message=(
                f"This patient was already seen today in session {todays.session_number} — "
                "continue that consultation rather than starting another."
            ),
        )

    case = case_for_new_session(appointment.patient_id, doctor.id, appointment.reason)

    consultation = Consultation(
        doctor_id=doctor.id,
        patient_id=appointment.patient_id,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    attach_to_case(consultation, case)
    db.session.add(consultation)
    db.session.flush()  # assigns consultation.id before we reference it below

    # The appointment moves to "in consultation" in the same commit as the
    # session it belongs to, so the queue can never show a patient as waiting
    # while their consultation is already recording.
    _link_to_consultation(appointment, consultation, doctor, "in_progress")
    db.session.commit()
    dashboard_changed("consultation_started")

    return success(consultation.to_dict(include_detail=True), message="Appointment started")
