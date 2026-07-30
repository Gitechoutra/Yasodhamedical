import os

from flask import Blueprint, request, send_file
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.response import error, success
from portal.models.consultation import Consultation
from portal.models.report import Report
from portal.pdf.report_generator import generate_consultation_pdf

report_bp = Blueprint("reports", __name__)

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "reports")


def _can_access(consultation):
    doctor = get_current_doctor()
    # A doctor may only touch their own patients' reports; admin/receptionist
    # (no doctor profile) can see and generate across the whole hospital —
    # same access pattern as the consultation room itself.
    return doctor is None or doctor.id == consultation.doctor_id


@report_bp.get("")
@jwt_required()
def list_reports():
    query = Report.query.join(Report.consultation)

    doctor = get_current_doctor()
    if doctor:
        query = query.filter(Consultation.doctor_id == doctor.id)

    reports = query.order_by(Report.generated_at.desc()).all()
    return success([r.to_dict() for r in reports])


@report_bp.post("")
@jwt_required()
def generate_report():
    payload = request.get_json(silent=True) or {}
    consultation_id = payload.get("consultation_id")

    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if consultation.status != "completed" or not consultation.summary:
        return error("Report can only be generated after the consultation is completed", status=422)
    if not _can_access(consultation):
        return error("You don't have access to this consultation", status=403)

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    filename = f"consultation_{consultation.id}.pdf"
    output_path = os.path.join(UPLOADS_DIR, filename)

    try:
        generate_consultation_pdf(consultation, output_path)
    except Exception as exc:  # noqa: BLE001 - surface PDF generation failure
        return error(f"Could not generate PDF: {exc}", status=500)

    report = Report.query.filter_by(consultation_id=consultation.id).first()
    if not report:
        report = Report(consultation_id=consultation.id, file_path=filename)
        db.session.add(report)
    else:
        report.file_path = filename
    db.session.commit()

    return success(report.to_dict(), message="Report generated", status=201)


@report_bp.get("/<int:report_id>/download")
@jwt_required()
def download_report(report_id):
    report = Report.query.get(report_id)
    if not report:
        return error("Report not found", status=404)
    if not _can_access(report.consultation):
        return error("You don't have access to this report", status=403)

    file_path = os.path.join(UPLOADS_DIR, report.file_path)
    if not os.path.exists(file_path):
        return error("Report file is missing on the server", status=404)

    patient_name = (report.consultation.patient.name if report.consultation.patient else "patient")
    download_name = f"{patient_name.replace(' ', '_')}_consultation_report.pdf"
    return send_file(file_path, as_attachment=True, download_name=download_name)
