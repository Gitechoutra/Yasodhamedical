import json
from datetime import datetime, time, timedelta

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity

from portal.ai import gemini_client
from portal.extensions import db, socketio
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.audit import CONSULTATION_ENDED, CONSULTATION_STARTED, PRESCRIPTION_UNVERIFIED, PRESCRIPTION_VERIFIED, audit
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import clinical_only
from portal.helpers.notify import notify, role_user_ids
from portal.helpers.patient_access import can_access_patient
from portal.helpers.queue_helper import claim_appointment_for, complete_appointment_for
from portal.helpers.response import error, success
from portal.models.consultation import Consultation
from portal.models.consultation_summary import ConsultationSummary
from portal.models.conversation_message import ConversationMessage
from portal.models.generated_prescription import GeneratedPrescription
from portal.models.medicine import Medicine
from portal.models.patient import Patient
from portal.websocket.consultation_socket import consultation_room

consultation_bp = Blueprint("consultations", __name__)


VALID_CONSULTATION_STATUSES = ("scheduled", "in_progress", "completed")

# How far back each ?period= value looks, in days. "all" means no limit.
PERIOD_DAYS = {"today": 0, "week": 7, "month": 30, "year": 365}

LIST_LIMIT = 100


@consultation_bp.get("")
@clinical_only
def list_consultations():
    """Consultation history — completed consultations only.

    A consultation still in progress lives in the Appointments queue (with a
    Resume button) until it's finished, so this page is purely the record of
    finished visits. ?status= can still ask for another status explicitly.
    """
    query = Consultation.query

    status = request.args.get("status", "completed")
    if status != "all":
        if status not in VALID_CONSULTATION_STATUSES:
            allowed = ", ".join(VALID_CONSULTATION_STATUSES)
            return error(f"status must be one of: {allowed}, all", status=422)
        query = query.filter(Consultation.status == status)

    # A doctor's own work only, matching how the dashboard counts them.
    doctor = get_current_doctor()
    if doctor:
        query = query.filter(Consultation.doctor_id == doctor.id)

    period = request.args.get("period")
    if period and period != "all":
        if period not in PERIOD_DAYS:
            allowed = ", ".join(list(PERIOD_DAYS) + ["all"])
            return error(f"period must be one of: {allowed}", status=422)
        days = PERIOD_DAYS[period]
        since = datetime.combine(datetime.utcnow().date() - timedelta(days=days), time.min)
        # Falls back to created_at for a consultation that has no start time.
        query = query.filter(
            db.func.coalesce(Consultation.started_at, Consultation.created_at) >= since
        )

    search = (request.args.get("search") or "").strip()
    if search:
        query = query.outerjoin(Patient, Consultation.patient_id == Patient.id).outerjoin(
            ConsultationSummary, ConsultationSummary.consultation_id == Consultation.id
        )
        like = f"%{search}%"
        conditions = [
            Patient.name.ilike(like),
            ConsultationSummary.possible_diagnosis.ilike(like),
            ConsultationSummary.symptoms.ilike(like),
            ConsultationSummary.summary.ilike(like),
        ]
        # "PAT0004" / "4" should find that patient by id, not just by name.
        digits = "".join(ch for ch in search if ch.isdigit())
        if digits:
            conditions.append(Patient.id == int(digits))
        query = query.filter(db.or_(*conditions))

    consultations = (
        query.order_by(
            # Newest visit first; ended_at is the moment that matters for a
            # completed consultation.
            db.func.coalesce(Consultation.ended_at, Consultation.started_at, Consultation.created_at).desc()
        )
        .limit(LIST_LIMIT)
        .all()
    )
    return success([c.to_dict(include_summary=True) for c in consultations])


@consultation_bp.post("")
@clinical_only
def start_consultation():
    payload = request.get_json(silent=True) or {}
    patient_id = payload.get("patient_id")

    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can start consultations", status=403)

    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)
    if not can_access_patient(patient, doctor):
        return error("This patient is assigned to another doctor", status=403)

    consultation = Consultation(
        doctor_id=doctor.id,
        patient_id=patient.id,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    db.session.add(consultation)
    db.session.flush()  # assigns consultation.id before the appointment links to it

    # If this patient was also sitting in the queue, claim that entry now so
    # it moves with the consultation instead of being stranded on "waiting".
    claim_appointment_for(consultation, doctor)

    audit(
        CONSULTATION_STARTED,
        entity="consultation",
        entity_id=consultation.id,
        detail=f"Consultation started with {patient.name}",
    )
    db.session.commit()
    dashboard_changed("consultation_started")

    data = consultation.to_dict(include_detail=True)
    data["can_manage"] = True
    return success(data, message="Consultation started", status=201)


def _is_owning_doctor(consultation):
    doctor = get_current_doctor()
    return bool(doctor and doctor.id == consultation.doctor_id)


@consultation_bp.get("/<int:consultation_id>")
@clinical_only
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
@clinical_only
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
        text = gemini_client.transcribe_audio(audio_file.read())
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


MAX_PRESCRIPTION_ITEMS = 30


@consultation_bp.put("/<int:consultation_id>/prescriptions")
@clinical_only
def replace_prescriptions(consultation_id):
    """Replaces the prescription with the doctor's edited version.

    Gemini's suggestion is a draft; the doctor is the prescriber. Sending the
    whole list rather than per-row edits keeps the saved prescription exactly
    what was on screen — no partial-update races between rows.
    """
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if not _is_owning_doctor(consultation):
        return error("Only the doctor who ran this consultation can edit its prescription", status=403)

    if consultation.prescription_verified_at:
        # Verification locks the prescription. Withdrawing the sign-off is the
        # deliberate way back in, so a signed prescription can never change
        # underneath the signature — enforced here, not just in the UI.
        return error(
            "This prescription is verified and locked. Unlock it to make changes.",
            status=409,
        )

    payload = request.get_json(silent=True) or {}
    items = payload.get("prescriptions")
    if not isinstance(items, list):
        return error("prescriptions must be a list", status=422)
    if len(items) > MAX_PRESCRIPTION_ITEMS:
        return error(f"A prescription can hold at most {MAX_PRESCRIPTION_ITEMS} medicines", status=422)

    cleaned = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            return error(f"Item {index + 1} is not valid", status=422)
        name = (item.get("medicine_name") or "").strip()
        if not name:
            return error(f"Item {index + 1} needs a medicine name", status=422)
        cleaned.append(
            {
                "medicine_name": name[:150],
                "dose": (item.get("dose") or "").strip()[:255] or None,
                "frequency": (item.get("frequency") or "").strip()[:255] or None,
                "duration": (item.get("duration") or "").strip()[:255] or None,
            }
        )

    # Re-match against the formulary so the "off-formulary" flag reflects what
    # the doctor actually typed, not the original suggestion.
    formulary_by_name = {m.name.lower(): m for m in Medicine.query.all()}

    for existing in list(consultation.prescriptions):
        db.session.delete(existing)
    db.session.flush()

    for item in cleaned:
        matched = formulary_by_name.get(item["medicine_name"].lower())
        db.session.add(
            GeneratedPrescription(
                consultation_id=consultation.id,
                medicine_id=matched.id if matched else None,
                **item,
            )
        )

    db.session.commit()

    data = consultation.to_dict(include_detail=True)
    data["can_manage"] = True
    return success(data, message="Prescription updated")


@consultation_bp.post("/<int:consultation_id>/prescriptions/verify")
@clinical_only
def verify_prescription(consultation_id):
    """Records the treating doctor's sign-off on the prescription."""
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if not _is_owning_doctor(consultation):
        return error("Only the doctor who ran this consultation can verify its prescription", status=403)
    if consultation.status != "completed":
        return error("Finish the consultation before verifying its prescription", status=409)

    consultation.prescription_verified_at = datetime.utcnow()
    consultation.prescription_verified_by = int(get_jwt_identity())
    audit(
        PRESCRIPTION_VERIFIED,
        entity="consultation",
        entity_id=consultation.id,
        detail=f"Prescription signed off for {consultation.patient.name if consultation.patient else 'patient'}",
    )
    db.session.commit()
    # Flips the Rx badge on any open Consultations list.
    dashboard_changed("prescription_verified")

    data = consultation.to_dict(include_detail=True)
    data["can_manage"] = True
    return success(data, message="Prescription verified")


@consultation_bp.delete("/<int:consultation_id>/prescriptions/verify")
@clinical_only
def unverify_prescription(consultation_id):
    """Withdraws a sign-off, e.g. it was clicked by mistake."""
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if not _is_owning_doctor(consultation):
        return error("Only the doctor who ran this consultation can change its verification", status=403)

    consultation.prescription_verified_at = None
    consultation.prescription_verified_by = None
    audit(
        PRESCRIPTION_UNVERIFIED,
        entity="consultation",
        entity_id=consultation.id,
        detail="Prescription sign-off withdrawn",
    )
    db.session.commit()
    dashboard_changed("prescription_unverified")

    data = consultation.to_dict(include_detail=True)
    data["can_manage"] = True
    return success(data, message="Verification withdrawn")


@consultation_bp.post("/<int:consultation_id>/end")
@clinical_only
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

    # Drops the patient out of the Appointments queue — completed patients
    # must never remain there.
    complete_appointment_for(consultation)

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

    doctor_name = consultation.doctor.user.name if consultation.doctor and consultation.doctor.user else "A doctor"
    patient_name = consultation.patient.name if consultation.patient else "a patient"
    notify(
        role_user_ids("admin"),
        title="Consultation completed",
        body=f"{doctor_name} finished a consultation with {patient_name}. Summary is ready.",
        category="consultation",
        link=f"/dashboard/consultations/{consultation.id}",
        exclude_user_id=get_jwt_identity(),
    )

    audit(
        CONSULTATION_ENDED,
        entity="consultation",
        entity_id=consultation.id,
        detail=f"Consultation completed with {patient_name}; summary generated",
    )

    try:
        db.session.commit()
    except Exception as exc:  # noqa: BLE001 - surface DB failure as a clean JSON error
        db.session.rollback()
        return error(f"Could not save the generated summary: {exc}", status=500)

    result = consultation.to_dict(include_detail=True)
    result["can_manage"] = True
    socketio.emit("consultation_completed", result, room=consultation_room(consultation.id))
    # Moves the patient out of Appointments and out of the active count.
    dashboard_changed("consultation_completed")
    return success(result, message="Consultation completed")
