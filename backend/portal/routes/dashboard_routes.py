from datetime import datetime, time

from flask import Blueprint
from flask_jwt_extended import jwt_required

from portal.helpers.auth_helper import get_current_doctor, get_current_nurse
from portal.helpers.decorators import current_role
from portal.helpers.patient_access import patient_scope, scope_patients
from portal.helpers.response import success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.nursing_assignment import NursingAssignment
from portal.models.patient import Patient
from portal.models.report import Report
from portal.routes.appointment_routes import todays_open_appointments_query

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/summary")
@jwt_required()
def summary():
    today_start = datetime.combine(datetime.utcnow().date(), time.min)
    today_end = datetime.combine(datetime.utcnow().date(), time.max)

    role = current_role()
    doctor = get_current_doctor()

    # Reception's dashboard is the front desk's own work: who is registered and
    # who is in today's queue. It deliberately carries no consultation, report
    # or nursing figures — those are clinical, and the routes behind them
    # return 403 for this role, so a card linking to one would be a dead end.
    if role == "receptionist":
        return success(
            {
                "scope": "front_desk",
                "total_patients": Patient.query.count(),
                "unassigned_patients": Patient.query.filter(
                    Patient.assigned_doctor_id.is_(None)
                ).count(),
                "todays_appointments": todays_open_appointments_query().count(),
                "todays_registrations": Patient.query.filter(
                    Patient.created_at >= today_start, Patient.created_at <= today_end
                ).count(),
            }
        )

    # A nurse's numbers live on /api/nursing/summary, which is scoped to their
    # own assignments. Returning hospital-wide counts here would contradict it.
    if role == "nurse":
        nurse = get_current_nurse()
        active = NursingAssignment.query.filter_by(status="active")
        if nurse:
            active = active.filter(NursingAssignment.nurse_id == nurse.id)
        return success({"scope": "nursing", "active_assignments": active.count()})

    # A doctor's dashboard should only reflect their own department/work —
    # not every other doctor's patients — same scoping rule as Appointments.
    # Admin accounts (no doctor profile) still see the hospital-wide view.
    # Each card's query mirrors the filter its link applies on the target
    # page, so the number and the rows behind it can't disagree.
    appointments_query = todays_open_appointments_query()
    consultations_query = Consultation.query.filter_by(status="in_progress")
    recent_query = Consultation.query.order_by(Consultation.created_at.desc())
    reports_query = Report.query.join(Report.consultation)
    nursing_query = NursingAssignment.query.filter_by(status="active")

    if doctor:
        # Explicit columns: the appointments query is joined to Consultation,
        # so filter_by would bind department_id to the wrong entity. The
        # patient join + scope has to match list_appointments exactly, or this
        # count would include patients assigned to another doctor and disagree
        # with the rows the card links to.
        appointments_query = appointments_query.join(
            Patient, Appointment.patient_id == Patient.id
        ).filter(
            Appointment.department_id == doctor.department_id,
            patient_scope(doctor),
        )
        consultations_query = consultations_query.filter(Consultation.doctor_id == doctor.id)
        recent_query = recent_query.filter(Consultation.doctor_id == doctor.id)
        reports_query = reports_query.filter(Consultation.doctor_id == doctor.id)
        nursing_query = nursing_query.filter(NursingAssignment.doctor_id == doctor.id)

    todays_reports_query = reports_query.filter(
        Report.generated_at >= today_start, Report.generated_at <= today_end
    )

    # A doctor's patient count is their own list, matching what the Patients
    # page shows them — a hospital-wide number they can't click through to
    # would be worse than useless.
    patients_query = scope_patients(Patient.query, doctor)

    return success(
        {
            "scope": "clinical",
            "todays_appointments": appointments_query.count(),
            "active_consultations": consultations_query.count(),
            "total_patients": patients_query.count(),
            "reports_generated": reports_query.count(),
            "todays_reports": todays_reports_query.count(),
            "nursing_assignments": nursing_query.count(),
            "recent_consultations": [c.to_dict() for c in recent_query.limit(10).all()],
        }
    )
