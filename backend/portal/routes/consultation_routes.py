import json
from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from portal.ai import gemini_client, whisper_client
from portal.extensions import db, socketio
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.consultation_summary import ConsultationSummary
from portal.models.conversation_message import ConversationMessage
from portal.models.generated_prescription import GeneratedPrescription
from portal.models.medicine import Medicine
from portal.models.patient import Patient
from portal.websocket.consultation_socket import consultation_room

consultation_bp = Blueprint("consultations", __name__)


@consultation_bp.get("")
@jwt_required()
def list_consultations():
    consultations = Consultation.query.order_by(Consultation.created_at.desc()).limit(50).all()
    return success([c.to_dict() for c in consultations])


@consultation_bp.post("")
@jwt_required()
def start_consultation():
    payload = request.get_json(silent=True) or {}
    patient_id = payload.get("patient_id")

    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can start consultations", status=403)

    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    consultation = Consultation(
        doctor_id=doctor.id,
        patient_id=patient.id,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    db.session.add(consultation)
    db.session.commit()

    data = consultation.to_dict(include_detail=True)
    data["can_manage"] = True
    return success(data, message="Consultation started", status=201)


def _is_owning_doctor(consultation):
    doctor = get_current_doctor()
    return bool(doctor and doctor.id == consultation.doctor_id)


@consultation_bp.get("/<int:consultation_id>")
@jwt_required()
def get_consultation(consultation_id):
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    data = consultation.to_dict(include_detail=True)
    # Tells the frontend whether to show live recording controls: viewing is
    # fine for anyone (e.g. admin oversight), but only the doctor this
    # consultation belongs to may record audio or end it — enforced for real
    # below, this flag just lets the UI hide controls that would 403 anyway.
    data["can_manage"] = _is_owning_doctor(consultation)
    return success(data)


@consultation_bp.post("/<int:consultation_id>/transcribe")
@jwt_required()
def transcribe_turn(consultation_id):
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if not _is_owning_doctor(consultation):
        return error("Only the doctor running this consultation can record audio", status=403)
    if consultation.status != "in_progress":
        return error("Consultation is not in progress", status=409)

    # Speaker is no longer manually tagged during capture — a doctor can't stop
    # to click a toggle mid-conversation. Segments are stored as "unknown" and
    # Gemini infers the doctor/patient split from context at end_consultation.
    speaker = request.form.get("speaker", "unknown")
    if speaker not in ("doctor", "patient", "unknown"):
        return error("speaker must be 'doctor', 'patient', or 'unknown'", status=422)

    audio_file = request.files.get("audio")
    if not audio_file:
        return error("audio file is required", status=422)

    try:
        text = whisper_client.transcribe(audio_file.read())
    except Exception as exc:  # noqa: BLE001 - surface transcription failure to the client
        return error(f"Transcription failed: {exc}", status=502)

    if not text:
        return error("Could not detect any speech in that recording", status=422)

    message = ConversationMessage(consultation_id=consultation.id, speaker=speaker, message=text)
    db.session.add(message)
    db.session.commit()

    payload = message.to_dict()
    socketio.emit("new_message", payload, room=consultation_room(consultation.id))

    return success(payload, status=201)


@consultation_bp.post("/<int:consultation_id>/end")
@jwt_required()
def end_consultation(consultation_id):
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if consultation.status == "completed":
        data = consultation.to_dict(include_detail=True)
        data["can_manage"] = _is_owning_doctor(consultation)
        return success(data, message="Already completed")
    if not _is_owning_doctor(consultation):
        return error("Only the doctor running this consultation can end it", status=403)

    if not consultation.messages:
        return error("Cannot end a consultation with no conversation recorded", status=422)

    formulary = Medicine.query.all()

    try:
        ai_result = gemini_client.generate_consultation_summary(
            patient=consultation.patient.to_dict(),
            messages=[m.to_dict() for m in consultation.messages],
            formulary=[m.to_dict() for m in formulary],
        )
    except Exception as exc:  # noqa: BLE001 - surface AI failure to the client
        return error(f"AI summary generation failed: {exc}", status=502)

    consultation.status = "completed"
    consultation.ended_at = datetime.utcnow()

    linked_appointment = Appointment.query.filter_by(consultation_id=consultation.id).first()
    if linked_appointment:
        linked_appointment.status = "completed"

    summary = ConsultationSummary(
        consultation_id=consultation.id,
        summary=ai_result.get("summary"),
        symptoms=ai_result.get("symptoms"),
        possible_diagnosis=ai_result.get("possible_diagnosis"),
        follow_up_advice="\n".join(ai_result.get("follow_up_advice") or []),
        lifestyle_advice="\n".join(ai_result.get("lifestyle_advice") or []),
        labeled_transcript=json.dumps(ai_result.get("labeled_transcript") or []),
    )
    db.session.add(summary)

    formulary_by_name = {m.name.lower(): m for m in formulary}
    for item in ai_result.get("prescriptions") or []:
        medicine_name = item.get("medicine_name") or ""
        matched = formulary_by_name.get(medicine_name.lower())
        db.session.add(
            GeneratedPrescription(
                consultation_id=consultation.id,
                medicine_id=matched.id if matched else None,
                medicine_name=medicine_name,
                dose=item.get("dose"),
                frequency=item.get("frequency"),
                duration=item.get("duration"),
            )
        )

    try:
        db.session.commit()
    except Exception as exc:  # noqa: BLE001 - surface DB failure as a clean JSON error
        db.session.rollback()
        return error(f"Could not save the generated summary: {exc}", status=500)

    result = consultation.to_dict(include_detail=True)
    result["can_manage"] = True
    socketio.emit("consultation_completed", result, room=consultation_room(consultation.id))
    return success(result, message="Consultation completed")
