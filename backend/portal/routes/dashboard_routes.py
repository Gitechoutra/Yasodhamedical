from datetime import datetime, time

from flask import Blueprint
from flask_jwt_extended import jwt_required

from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.response import success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.patient import Patient
from portal.models.report import Report

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/summary")
@jwt_required()
def summary():
    today_start = datetime.combine(datetime.utcnow().date(), time.min)
    today_end = datetime.combine(datetime.utcnow().date(), time.max)

    doctor = get_current_doctor()

    # A doctor's dashboard should only reflect their own department/work —
    # not every other doctor's patients — same scoping rule as Appointments.
    # Admin/receptionist accounts (no doctor profile) still see the hospital-wide view.
    appointments_query = Appointment.query.filter(
        Appointment.created_at >= today_start, Appointment.created_at <= today_end
    )
    consultations_query = Consultation.query.filter_by(status="in_progress")
    recent_query = Consultation.query.order_by(Consultation.created_at.desc())
    reports_query = Report.query.join(Report.consultation)

    if doctor:
        appointments_query = appointments_query.filter_by(department_id=doctor.department_id)
        consultations_query = consultations_query.filter_by(doctor_id=doctor.id)
        recent_query = recent_query.filter_by(doctor_id=doctor.id)
        reports_query = reports_query.filter(Consultation.doctor_id == doctor.id)

    todays_appointments = appointments_query.count()
    active_consultations = consultations_query.count()
    total_patients = Patient.query.count()
    reports_generated = reports_query.count()
    recent_consultations = recent_query.limit(10).all()

    return success(
        {
            "todays_appointments": todays_appointments,
            "active_consultations": active_consultations,
            "total_patients": total_patients,
            "reports_generated": reports_generated,
            "recent_consultations": [c.to_dict() for c in recent_consultations],
        }
    )
