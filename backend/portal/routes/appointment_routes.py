from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.decorators import role_required
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.patient import Patient

appointment_bp = Blueprint("appointments", __name__)


@appointment_bp.get("")
@jwt_required()
def list_appointments():
    query = Appointment.query

    doctor = get_current_doctor()
    if doctor:
        # A doctor only ever sees their own department's queue — that's the
        # whole point of dividing patients by specialty. Admin/receptionist
        # accounts (no doctor profile) see everything, optionally filtered.
        query = query.filter_by(department_id=doctor.department_id)
    else:
        department_id = request.args.get("department_id", type=int)
        if department_id:
            query = query.filter_by(department_id=department_id)

    appointments = query.order_by(Appointment.created_at.desc()).all()
    return success([a.to_dict() for a in appointments])


@appointment_bp.post("")
@role_required("admin", "receptionist")
def create_appointment():
    # Intentionally NOT open to doctors: assigning a patient to a department
    # is front-desk/admin work, not something a doctor should self-serve —
    # keeps the department queues an honest reflection of real intake.
    payload = request.get_json(silent=True) or {}
    patient_id = payload.get("patient_id")
    department_id = payload.get("department_id")

    if not patient_id or not department_id:
        return error("patient_id and department_id are required", status=422)

    if not Patient.query.get(patient_id):
        return error("Patient not found", status=404)

    appointment = Appointment(
        patient_id=patient_id,
        department_id=department_id,
        reason=payload.get("reason") or None,
        status="waiting",
    )
    db.session.add(appointment)
    db.session.commit()

    return success(appointment.to_dict(), message="Appointment created", status=201)


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

    return success(consultation.to_dict(include_detail=True), message="Appointment started")
