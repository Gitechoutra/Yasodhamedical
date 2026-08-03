import os
from datetime import date, datetime

from flask import Blueprint, request, send_from_directory
from flask_jwt_extended import get_jwt, jwt_required

from portal.extensions import db
from portal.helpers.audit import PATIENT_CREATED, PATIENT_REASSIGNED, PATIENT_UPDATED, audit
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import FRONT_DESK_ROLES, role_required
from portal.helpers.patient_access import can_access_patient, scope_patients
from portal.helpers.response import error, success
from portal.helpers.uploads import ImageUploadError, delete_image, save_image, upload_dir
from portal.models.doctor import Doctor
from portal.models.patient import Patient

patient_bp = Blueprint("patients", __name__)

PHOTOS_SUBDIR = "patients"

# A date of birth outside this range is a typo, not a patient. Without the
# floor, a mistyped year like "0001" silently produced an age of 2025.
MAX_AGE_YEARS = 130


def _parse_dob(raw):
    """Returns (date, error_message). Both None means no DOB was supplied."""
    if not raw:
        return None, None
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None, "dob must be in YYYY-MM-DD format"

    today = date.today()
    if parsed > today:
        return None, "Date of birth cannot be in the future"
    if parsed.year < today.year - MAX_AGE_YEARS:
        return None, f"Date of birth cannot be more than {MAX_AGE_YEARS} years ago"
    return parsed, None


def _resolve_assigned_doctor(payload, current_doctor):
    """Returns (doctor_id, error_message).

    Front desk must name the doctor; a doctor registering a patient during
    their own consultation is assigning to themselves, so it's implied.
    """
    raw = payload.get("assigned_doctor_id")
    if raw in (None, ""):
        if current_doctor:
            return current_doctor.id, None
        return None, "assigned_doctor_id is required — choose the doctor for this patient"

    doctor = Doctor.query.get(raw)
    if not doctor:
        return None, "Assigned doctor not found"
    return doctor.id, None


@patient_bp.get("")
@jwt_required()
def list_patients():
    query = scope_patients(Patient.query, get_current_doctor())
    patients = query.order_by(Patient.created_at.desc()).all()
    return success([p.to_dict() for p in patients])


@patient_bp.get("/<int:patient_id>")
@jwt_required()
def get_patient(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)
    if not can_access_patient(patient, get_current_doctor()):
        # Deliberately 404, not 403: confirming the record exists would leak
        # that another doctor has a patient by this id.
        return error("Patient not found", status=404)
    return success(patient.to_dict())


@patient_bp.post("")
@jwt_required()
def create_patient():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error("Patient name is required", status=422)

    dob, dob_error = _parse_dob(payload.get("dob"))
    if dob_error:
        return error(dob_error, status=422)

    assigned_doctor_id, doctor_error = _resolve_assigned_doctor(payload, get_current_doctor())
    if doctor_error:
        return error(doctor_error, status=422)

    patient = Patient(
        name=name,
        gender=payload.get("gender") or None,
        dob=dob,
        phone=payload.get("phone") or None,
        email=payload.get("email") or None,
        blood_group=payload.get("blood_group") or None,
        allergies=payload.get("allergies") or None,
        medical_history=payload.get("medical_history") or None,
        assigned_doctor_id=assigned_doctor_id,
    )
    db.session.add(patient)
    db.session.flush()  # assigns patient.id so the audit row can reference it
    audit(
        PATIENT_CREATED,
        entity="patient",
        entity_id=patient.id,
        detail=f"Registered {patient.name}",
    )
    db.session.commit()
    dashboard_changed("patient_created")

    return success(patient.to_dict(), message="Patient created", status=201)


# What the front desk collects at registration, and may therefore correct
# afterwards. Everything clinical -- diagnoses, prescriptions, consultation
# summaries -- lives on other tables that reception cannot reach at all.
EDITABLE_FIELDS = ("name", "gender", "phone", "email", "blood_group", "allergies", "medical_history")

GENDERS = ("male", "female", "other")


@patient_bp.patch("/<int:patient_id>")
@jwt_required()
def update_patient(patient_id):
    """Corrects a patient's registration details.

    Open to the front desk (who typed them in the first place) and to the
    treating doctor. Deliberately excludes `assigned_doctor_id`: rerouting a
    patient is a separate, front-desk-only action below, so a doctor cannot
    quietly hand their patient away -- or claim someone else's -- through the
    edit form.
    """
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    doctor = get_current_doctor()
    if doctor and not can_access_patient(patient, doctor):
        return error("Patient not found", status=404)
    # A nurse works from the record the doctor set; they don't edit demographics.
    if get_jwt().get("role") == "nurse":
        return error("Nurses cannot edit patient registration details", status=403)

    payload = request.get_json(silent=True) or {}

    if "name" in payload and not (payload.get("name") or "").strip():
        return error("Patient name cannot be empty", status=422)

    if "gender" in payload:
        gender = (payload.get("gender") or "").strip().lower()
        if gender and gender not in GENDERS:
            return error(f"gender must be one of: {', '.join(GENDERS)}", status=422)

    if "dob" in payload:
        dob, dob_error = _parse_dob(payload.get("dob"))
        if dob_error:
            return error(dob_error, status=422)
        patient.dob = dob

    changed = []
    for field in EDITABLE_FIELDS:
        if field not in payload:
            continue
        value = (payload.get(field) or "").strip() or None
        if field == "gender" and value:
            value = value.lower()
        if getattr(patient, field) != value:
            changed.append(field)
        setattr(patient, field, value)
    if "dob" in payload:
        changed.append("dob")

    if not changed:
        return success(patient.to_dict(), message="No changes")

    audit(
        PATIENT_UPDATED,
        entity="patient",
        entity_id=patient.id,
        detail=f"Updated {', '.join(changed)} for {patient.name}",
    )
    db.session.commit()
    dashboard_changed("patient_updated")

    return success(patient.to_dict(), message="Patient updated")


@patient_bp.patch("/<int:patient_id>/assignment")
@role_required(*FRONT_DESK_ROLES)
def reassign_patient(patient_id):
    """Moves a patient to a different doctor. Front-desk work: a doctor
    can't hand their own patient away, or claim someone else's."""
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    payload = request.get_json(silent=True) or {}
    raw = payload.get("assigned_doctor_id")
    if raw in (None, ""):
        return error("assigned_doctor_id is required", status=422)

    doctor = Doctor.query.get(raw)
    if not doctor:
        return error("Assigned doctor not found", status=404)

    patient.assigned_doctor_id = doctor.id
    audit(
        PATIENT_REASSIGNED,
        entity="patient",
        entity_id=patient.id,
        detail=f"{patient.name} routed to {doctor.user.name if doctor.user else 'doctor ' + str(doctor.id)}",
    )
    db.session.commit()
    dashboard_changed("patient_reassigned")

    return success(patient.to_dict(), message="Patient reassigned")


@patient_bp.post("/<int:patient_id>/photo")
@jwt_required()
def upload_patient_photo(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient or not can_access_patient(patient, get_current_doctor()):
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
    if not patient or not can_access_patient(patient, get_current_doctor()):
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
