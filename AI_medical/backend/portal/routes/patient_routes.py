import os
from datetime import datetime

from flask import Blueprint, request, send_from_directory
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.response import error, success
from portal.helpers.uploads import ImageUploadError, delete_image, save_image, upload_dir
from portal.models.patient import Patient

patient_bp = Blueprint("patients", __name__)

PHOTOS_SUBDIR = "patients"


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


@patient_bp.post("/<int:patient_id>/photo")
@jwt_required()
def upload_patient_photo(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    try:
        filename = save_image(request.files.get("photo"), PHOTOS_SUBDIR)
    except ImageUploadError as exc:
        return error(exc.message, status=exc.status)

    previous = patient.photo_path
    patient.photo_path = filename
    db.session.commit()

    delete_image(previous, PHOTOS_SUBDIR)

    return success(patient.to_dict(), message="Patient photo updated")


@patient_bp.delete("/<int:patient_id>/photo")
@jwt_required()
def delete_patient_photo(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    previous = patient.photo_path
    patient.photo_path = None
    db.session.commit()

    delete_image(previous, PHOTOS_SUBDIR)

    return success(patient.to_dict(), message="Patient photo removed")


@patient_bp.get("/photo/<path:filename>")
def serve_patient_photo(filename):
    """Unauthenticated for the same reason avatars are — see serve_avatar."""
    directory = upload_dir(PHOTOS_SUBDIR)
    if not os.path.exists(os.path.join(directory, filename)):
        return error("Image not found", status=404)
    return send_from_directory(directory, filename, max_age=3600)
