from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.response import error, success
from portal.models.patient import Patient

patient_bp = Blueprint("patients", __name__)


@patient_bp.get("")
@jwt_required()
def list_patients():
    patients = Patient.query.order_by(Patient.created_at.desc()).all()
    return success([p.to_dict() for p in patients])


@patient_bp.post("")
@jwt_required()
def create_patient():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error("Patient name is required", status=422)

    dob = None
    if payload.get("dob"):
        try:
            dob = datetime.strptime(payload["dob"], "%Y-%m-%d").date()
        except ValueError:
            return error("dob must be in YYYY-MM-DD format", status=422)

    patient = Patient(
        name=name,
        gender=payload.get("gender") or None,
        dob=dob,
        phone=payload.get("phone") or None,
        email=payload.get("email") or None,
        blood_group=payload.get("blood_group") or None,
        allergies=payload.get("allergies") or None,
        medical_history=payload.get("medical_history") or None,
    )
    db.session.add(patient)
    db.session.commit()

    return success(patient.to_dict(), message="Patient created", status=201)
