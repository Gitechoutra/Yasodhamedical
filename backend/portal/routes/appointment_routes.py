from datetime import datetime, time

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.audit import APPOINTMENT_CREATED, audit
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import FRONT_DESK_ROLES, role_required
from portal.helpers.notify import department_doctor_user_ids, notify
from portal.helpers.patient_access import can_access_patient, patient_scope
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.department import Department
from portal.models.patient import Patient

appointment_bp = Blueprint("appointments", __name__)

# What the dashboard's "Today's Appointments" card counts: still on the board,
# i.e. not yet completed or cancelled.
OPEN_STATUSES = ("waiting", "in_progress")


def open_appointments_query():
    """Appointments still on the board.

    The status check is the primary rule; the consultation check is a safety
    net. A row whose consultation is already completed must never appear in
    the queue even if its own status was somehow left open — that's the
    "completed patients never remain in Appointments" guarantee, enforced on
    read so no stale row can slip through.
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


def todays_open_appointments_query():
    """Today's appointments that still need someone — the single definition
    shared by the dashboard count and the Appointments page filter, so the
    number on the card always matches the rows behind it."""
    today = datetime.utcnow().date()
    return open_appointments_query().filter(
        Appointment.created_at >= datetime.combine(today, time.min),
        Appointment.created_at <= datetime.combine(today, time.max),
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

    if request.args.get("filter") == "today":
        # ?filter=today is the dashboard card's link.
        query = todays_open_appointments_query()
    elif status:
        # An explicit status is a lookup, not the queue — it may return
        # completed/cancelled rows, which the default view never does.
        query = Appointment.query.filter(Appointment.status == status)
    else:
        query = open_appointments_query()

    if status and request.args.get("filter") == "today":
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
@role_required(*FRONT_DESK_ROLES)
def create_appointment():
    # Intentionally NOT open to doctors: registering a patient for an OP visit
    # is front-desk work, not something a doctor should self-serve — keeps the
    # department queues an honest reflection of real intake.
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


@appointment_bp.post("/<int:appointment_id>/start")
@jwt_required()
def start_appointment(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)
    if appointment.status != "waiting":
        return error("This appointment has already been picked up", status=409)

    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can start appointments", status=403)
    if doctor.department_id != appointment.department_id:
        return error("This appointment belongs to a different department", status=403)
    if not can_access_patient(appointment.patient, doctor):
        return error("This patient is assigned to another doctor", status=403)

    consultation = Consultation(
        doctor_id=doctor.id,
        patient_id=appointment.patient_id,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    db.session.add(consultation)
    db.session.flush()  # assigns consultation.id before we reference it below

    appointment.doctor_id = doctor.id
    appointment.consultation_id = consultation.id
    appointment.status = "in_progress"
    db.session.commit()
    dashboard_changed("consultation_started")

    return success(consultation.to_dict(include_detail=True), message="Appointment started")
