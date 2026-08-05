import json
from datetime import datetime, time, timedelta

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity

from portal.ai import gemini_client
from portal.extensions import db, socketio
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers import knowledge_base
from portal.helpers.audit import (
    CONSULTATION_ENDED,
    CONSULTATION_RESUMED,
    CONSULTATION_STARTED,
    PRECEDENT_ACCEPTED,
    PRECEDENT_LEARNED,
    PRECEDENT_RETIRED,
    PRESCRIPTION_UNVERIFIED,
    PRESCRIPTION_VERIFIED,
    audit,
)
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.case_helper import (
    attach_to_case,
    case_for_new_session,
    open_case_for,
    prior_session_context,
    todays_session,
)
from portal.helpers.decorators import clinical_only
from portal.helpers.formulary import formulary_payload, prescribable_for, resolve_medicine
from portal.helpers.notify import notify, role_user_ids
from portal.helpers.patient_access import can_access_patient
from portal.helpers.queue_helper import (
    claim_appointment_for,
    complete_appointment_for,
    reopen_appointment_for,
)
from portal.helpers.response import error, success
from portal.models.consultation import Consultation
from portal.models.consultation_summary import ConsultationSummary
from portal.models.conversation_message import ConversationMessage
from portal.models.generated_prescription import GeneratedPrescription
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
    """Starts a consultation session for a patient.

    This is also how the *next* session of an ongoing case begins: the new
    consultation joins the patient's open case, so the earlier session keeps
    its own transcript, summary and prescription untouched and the case simply
    gains a session. Nothing here ever writes to an existing consultation.
    """
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

    # Both guards are checked against the existing case before anything is
    # created, so a rejected start leaves no half-open case behind.
    existing = open_case_for(patient.id, doctor.id)

    # Two sessions cannot be recorded at once — the second recording would
    # have nowhere unambiguous to land, and the doctor almost certainly means
    # to go back to the one already open.
    running = existing.open_session if existing else None
    if running:
        return error(
            f"Session {running.session_number} of this case is still in progress. "
            "End it before starting the next one.",
            status=409,
        )

    # A session is one visit. If this patient has already been seen today,
    # more conversation belongs to that same session — the doctor continues
    # it rather than opening a second one, so today's visit ends up as one
    # summary and one prescription instead of two half-records.
    todays = todays_session(existing) if existing else None
    if todays:
        return error(
            f"You already saw this patient today in session {todays.session_number}. "
            "Continue that consultation to add to it — a new session is for a visit on "
            "another day.",
            status=409,
        )

    case = case_for_new_session(patient.id, doctor.id, payload.get("reason"))

    consultation = Consultation(
        doctor_id=doctor.id,
        patient_id=patient.id,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    attach_to_case(consultation, case)
    db.session.add(consultation)
    db.session.flush()  # assigns consultation.id before the appointment links to it

    # If this patient was also sitting in the queue, claim that entry now so
    # it moves with the consultation instead of being stranded on "waiting".
    claim_appointment_for(consultation, doctor)

    audit(
        CONSULTATION_STARTED,
        entity="consultation",
        entity_id=consultation.id,
        detail=(
            f"Session {consultation.session_number} started with {patient.name} "
            f"({case.code})"
        ),
    )
    db.session.commit()
    dashboard_changed("consultation_started")

    return success(_room_payload(consultation, can_manage=True), message="Consultation started", status=201)


def _is_owning_doctor(consultation):
    doctor = get_current_doctor()
    return bool(doctor and doctor.id == consultation.doctor_id)


def _previous_sessions(consultation):
    """The earlier sessions of this case, oldest first.

    Sent with the consultation so a doctor recording a follow-up can read what
    happened last time without leaving the room — the conversation, what was
    diagnosed, and what was prescribed then. Read-only history: nothing here
    is editable from the consultation room, and nothing the doctor does now
    changes it.
    """
    case = consultation.case
    if not case:
        return []
    earlier = [
        session
        for session in case.sessions
        if session.id != consultation.id
        and session.status == "completed"
        and (session.session_number or 0) < (consultation.session_number or 0)
    ]
    earlier.sort(key=lambda s: s.session_number or 0)
    return [session.to_dict(include_summary=True) for session in earlier]


def _room_payload(consultation, can_manage=None):
    """Everything the consultation room renders, in one shape.

    Every route here returns it, because the room replaces its whole state
    from whatever a request hands back — building it in one place is what
    stops, say, the previous-session history disappearing off the screen after
    a prescription is verified.

    `can_manage` tells the frontend whether to show live recording controls:
    viewing is fine for anyone (e.g. admin oversight), but only the doctor the
    consultation belongs to may record audio or end it. Enforced for real in
    each route; this flag just hides controls that would 403 anyway.
    """
    data = consultation.to_dict(include_detail=True)
    data["can_manage"] = _is_owning_doctor(consultation) if can_manage is None else can_manage
    data["previous_sessions"] = _previous_sessions(consultation)
    return data


@consultation_bp.get("/<int:consultation_id>")
@clinical_only
def get_consultation(consultation_id):
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    return success(_room_payload(consultation))


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
    except gemini_client.QuotaExceededError as exc:
        # The recording itself is still in the browser's hands — the doctor can
        # press stop again once the limit clears without losing what was said.
        return error(str(exc), status=429)
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
# Ceiling for the free-text fields on a prescription line. Generous — these
# are clinical instructions, and truncating one mid-sentence is worse than
# storing a long one.
MAX_TEXT = 2000


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

    # Matched against the department's inventory. Out-of-stock items are
    # included: a doctor deliberately choosing a medicine the shelf is
    # momentarily out of is still naming a real product.
    prescribable = prescribable_for(consultation.doctor, include_out_of_stock=True)

    cleaned = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            return error(f"Item {index + 1} is not valid", status=422)
        name = (item.get("medicine_name") or "").strip()
        if not name:
            return error(f"Item {index + 1} needs a medicine name", status=422)

        # A saved prescription must name something the hospital stocks — that
        # is what lets the pharmacy fill it without interpreting free text.
        # The editor only lets a doctor pick from the catalogue, so reaching
        # this means an AI suggestion nobody carries, and the doctor has to
        # replace it rather than sign it off.
        brand, medicine_id = resolve_medicine(name, prescribable)
        if brand is None and medicine_id is None:
            return error(
                f"“{name}” is not in this department's medicine list. Use the search "
                "box to pick a medicine the pharmacy stocks, or ask the pharmacy to "
                "add it.",
                status=422,
            )

        cleaned.append(
            {
                # Stored as the catalogue's own name when it resolved, so two
                # doctors writing the same drug produce the same text.
                "medicine_name": (brand.display_name if brand else name)[:150],
                "brand_id": brand.id if brand else None,
                "medicine_id": medicine_id,
                "dose": (item.get("dose") or "").strip()[:255] or None,
                "frequency": (item.get("frequency") or "").strip()[:255] or None,
                "duration": (item.get("duration") or "").strip()[:255] or None,
                "quantity": (item.get("quantity") or "").strip()[:80] or None,
                "instructions": (item.get("instructions") or "").strip()[:MAX_TEXT] or None,
                "notes": (item.get("notes") or "").strip()[:MAX_TEXT] or None,
            }
        )

    for existing in list(consultation.prescriptions):
        db.session.delete(existing)
    db.session.flush()

    for item in cleaned:
        db.session.add(GeneratedPrescription(consultation_id=consultation.id, **item))

    db.session.commit()

    return success(_room_payload(consultation, can_manage=True), message="Prescription updated")


@consultation_bp.post("/<int:consultation_id>/prescriptions/verify")
@clinical_only
def verify_prescription(consultation_id):
    """Records the treating doctor's sign-off on the prescription.

    This is also the moment the case enters the knowledge base. Sign-off is
    what turns an AI suggestion into a doctor's own decision, so it is the
    only point at which a case becomes fit to guide anyone else's treatment —
    learning any earlier would let an unreviewed suggestion propagate.
    """
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if not _is_owning_doctor(consultation):
        return error("Only the doctor who ran this consultation can verify its prescription", status=403)
    if consultation.status != "completed":
        return error("Finish the consultation before verifying its prescription", status=409)

    consultation.prescription_verified_at = datetime.utcnow()
    consultation.prescription_verified_by = int(get_jwt_identity())

    # Credit the approved cases whose medicines survived the doctor's review,
    # before this consultation itself becomes one of them.
    accepted = knowledge_base.record_acceptance(consultation)
    precedent = knowledge_base.learn_from_approval(consultation)

    patient_name = consultation.patient.name if consultation.patient else "patient"
    audit(
        PRESCRIPTION_VERIFIED,
        entity="consultation",
        entity_id=consultation.id,
        detail=f"Prescription signed off for {patient_name}",
    )
    if precedent:
        db.session.flush()  # assigns precedent.id for the audit row
        audit(
            PRECEDENT_LEARNED,
            entity="precedent",
            entity_id=precedent.id,
            detail=(
                f"Approved case learned from consultation {consultation.id}: "
                f"{(precedent.diagnosis or 'no diagnosis recorded')[:120]}"
            ),
        )
    for used in accepted:
        audit(
            PRECEDENT_ACCEPTED,
            entity="precedent",
            entity_id=used.id,
            detail=(
                f"Precedent kept in the approved prescription for consultation "
                f"{consultation.id} (accepted {used.times_accepted} time(s))"
            ),
        )

    db.session.commit()
    # Flips the Rx badge on any open Consultations list.
    dashboard_changed("prescription_verified")

    return success(_room_payload(consultation, can_manage=True), message="Prescription verified")


@consultation_bp.delete("/<int:consultation_id>/prescriptions/verify")
@clinical_only
def unverify_prescription(consultation_id):
    """Withdraws a sign-off, e.g. it was clicked by mistake.

    Withdrawing also retires the case from the knowledge base: a prescription
    that is no longer approved must stop guiding anyone else's treatment.
    """
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if not _is_owning_doctor(consultation):
        return error("Only the doctor who ran this consultation can change its verification", status=403)

    consultation.prescription_verified_at = None
    consultation.prescription_verified_by = None
    retired = knowledge_base.retire_for(consultation)

    audit(
        PRESCRIPTION_UNVERIFIED,
        entity="consultation",
        entity_id=consultation.id,
        detail="Prescription sign-off withdrawn",
    )
    if retired:
        audit(
            PRECEDENT_RETIRED,
            entity="precedent",
            entity_id=retired.id,
            detail=(
                f"Approved case withdrawn from the knowledge base; sign-off on "
                f"consultation {consultation.id} was retracted"
            ),
        )
    db.session.commit()
    dashboard_changed("prescription_unverified")

    return success(_room_payload(consultation, can_manage=True), message="Verification withdrawn")


@consultation_bp.post("/<int:consultation_id>/continue")
@clinical_only
def continue_consultation(consultation_id):
    """Reopens a just-ended consultation so more of the same conversation can
    be recorded.

    This is what happens when the patient is still in the room and remembers
    one more thing after the doctor has pressed End. It is deliberately *not*
    a new session: the extra conversation belongs to the visit that is already
    under way, so it is appended to the same transcript and the summary and
    prescription are regenerated over the whole thing when the doctor ends it
    again. A patient coming back on another day is the opposite case, and gets
    a new session instead — see `start_consultation`.
    """
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if not _is_owning_doctor(consultation):
        return error("Only the doctor who ran this consultation can continue it", status=403)

    if consultation.status != "completed":
        # Already recording — pressing Continue again is a no-op rather than
        # an error, since the doctor is asking for exactly the state they are
        # already in.
        return success(
            _room_payload(consultation, can_manage=True),
            message="Consultation is already in progress",
        )

    if not consultation.is_from_today:
        when = (consultation.started_at or consultation.created_at).strftime("%d %b %Y")
        return error(
            f"This consultation was on {when}. A visit on another day is a new session — "
            "start one instead so this one keeps its own summary and prescription.",
            status=409,
        )

    if consultation.prescription_verified_at:
        return error(
            "This prescription is verified and locked. Unlock it before adding more to "
            "the consultation — continuing regenerates the prescription.",
            status=409,
        )

    consultation.status = "in_progress"
    consultation.ended_at = None

    # The patient is back in the room, so they belong back in the queue as
    # in-consultation rather than sitting under "completed".
    reopen_appointment_for(consultation)

    audit(
        CONSULTATION_RESUMED,
        entity="consultation",
        entity_id=consultation.id,
        detail=(
            f"Session {consultation.session_number or 1} reopened to continue the same "
            f"conversation with {consultation.patient.name if consultation.patient else 'patient'}"
        ),
    )
    db.session.commit()
    dashboard_changed("consultation_resumed")

    data = _room_payload(consultation, can_manage=True)
    socketio.emit("consultation_resumed", data, room=consultation_room(consultation.id))
    return success(data, message="Recording reopened — carry on with the same consultation")


@consultation_bp.post("/<int:consultation_id>/end")
@clinical_only
def end_consultation(consultation_id):
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if consultation.status == "completed":
        return success(_room_payload(consultation), message="Already completed")
    if not _is_owning_doctor(consultation):
        return error("Only the doctor running this consultation can end it", status=403)

    if not consultation.messages:
        return error("Cannot end a consultation with no conversation recorded", status=422)

    # The doctor's own department's pharmacy inventory, in stock — so every
    # suggestion is something the counter can actually dispense today.
    prescribable = prescribable_for(consultation.doctor)

    # What this hospital's doctors have already approved for a presentation
    # like this one. Retrieval failure is deliberately not fatal — a
    # consultation that can't reach the knowledge base is summarised on its
    # own merits, exactly as every consultation was before it existed.
    matches = knowledge_base.find_similar(
        consultation.messages, exclude_patient_id=consultation.patient_id
    )

    try:
        ai_result = gemini_client.generate_consultation_summary(
            patient=consultation.patient.to_dict(),
            messages=[m.to_dict() for m in consultation.messages],
            formulary=formulary_payload(prescribable),
            # A follow-up session is read against what came before it, so
            # "the swelling has gone down" summarises as progress rather than
            # as an unexplained remark.
            prior_sessions=prior_session_context(consultation),
            session_number=consultation.session_number,
            # De-identified: clinical content and coarse demographics only,
            # never who the precedent came from.
            precedents=[p.for_model(similarity=s) for p, s in matches],
        )
    except gemini_client.QuotaExceededError as exc:
        # Nothing has been written at this point, so the consultation stays in
        # progress with its transcript intact and can simply be ended again.
        return error(
            f"{exc} Your recording is safe — nothing has been lost, and you can end "
            "this consultation again once the limit clears.",
            status=429,
        )
    except Exception as exc:  # noqa: BLE001 - surface AI failure to the client
        return error(f"AI summary generation failed: {exc}", status=502)

    consultation.status = "completed"
    consultation.ended_at = datetime.utcnow()

    # Drops the patient out of the Appointments queue — completed patients
    # must never remain there.
    complete_appointment_for(consultation)

    # A consultation that was continued after being ended already has a
    # summary and a prescription. They describe a conversation that has since
    # grown, so they are rewritten over the full transcript rather than added
    # to — one session always has exactly one summary and one prescription,
    # covering everything that was said in it.
    summary = consultation.summary
    if summary is None:
        summary = ConsultationSummary(consultation_id=consultation.id)
        db.session.add(summary)
    summary.summary = ai_result.get("summary")
    summary.symptoms = ai_result.get("symptoms")
    summary.possible_diagnosis = ai_result.get("possible_diagnosis")
    summary.follow_up_advice = "\n".join(ai_result.get("follow_up_advice") or [])
    summary.lifestyle_advice = "\n".join(ai_result.get("lifestyle_advice") or [])
    summary.labeled_transcript = json.dumps(ai_result.get("labeled_transcript") or [])
    # What the AI was shown, frozen against this summary. It is the answer to
    # "why is this being suggested", and it has to keep answering it even
    # after the knowledge base moves on.
    summary.matched_precedents = json.dumps(knowledge_base.snapshot_matches(matches))
    knowledge_base.record_suggested(matches)

    for stale in list(consultation.prescriptions):
        db.session.delete(stale)
    db.session.flush()

    # Only a precedent actually retrieved for this consultation can be cited
    # as the source of a medicine. Checked rather than trusted: a model that
    # invented an id would otherwise attach doctor-approved provenance to a
    # suggestion no doctor ever made.
    retrieved_ids = {precedent.id for precedent, _ in matches}
    for item in ai_result.get("prescriptions") or []:
        medicine_name = item.get("medicine_name") or ""
        brand, medicine_id = resolve_medicine(medicine_name, prescribable)
        cited = item.get("from_precedent_id")
        db.session.add(
            GeneratedPrescription(
                consultation_id=consultation.id,
                brand_id=brand.id if brand else None,
                medicine_id=medicine_id,
                # Normalised to the catalogue's own name when it resolved, so
                # the pharmacy reads the same text it filed the medicine under.
                medicine_name=(brand.display_name if brand else medicine_name)[:150],
                dose=item.get("dose"),
                frequency=item.get("frequency"),
                duration=item.get("duration"),
                quantity=(item.get("quantity") or "").strip()[:80] or None,
                # Falls back to the catalogue's standing instructions, so a
                # medicine the pharmacy documented never arrives label-less.
                instructions=(item.get("instructions") or "").strip()[:MAX_TEXT]
                or (brand.usage_instructions if brand else None),
                source_precedent_id=cited if cited in retrieved_ids else None,
            )
        )

    doctor_name = consultation.doctor.user.name if consultation.doctor and consultation.doctor.user else "A doctor"
    patient_name = consultation.patient.name if consultation.patient else "a patient"
    # Sessions after the first are worth naming as such — "finished a
    # consultation" reads as a completed visit, which a mid-treatment session
    # is not.
    session_label = (
        f"session {consultation.session_number}"
        if consultation.session_number and consultation.session_number > 1
        else "a consultation"
    )
    notify(
        role_user_ids("admin"),
        title="Consultation completed",
        body=f"{doctor_name} finished {session_label} with {patient_name}. Summary is ready.",
        category="consultation",
        link=f"/dashboard/consultations/{consultation.id}",
        exclude_user_id=get_jwt_identity(),
    )

    audit(
        CONSULTATION_ENDED,
        entity="consultation",
        entity_id=consultation.id,
        detail=(
            f"Session {consultation.session_number or 1} completed with {patient_name}"
            f"{f' ({consultation.case.code})' if consultation.case else ''}; summary generated"
        ),
    )

    try:
        db.session.commit()
    except Exception as exc:  # noqa: BLE001 - surface DB failure as a clean JSON error
        db.session.rollback()
        return error(f"Could not save the generated summary: {exc}", status=500)

    result = _room_payload(consultation, can_manage=True)
    socketio.emit("consultation_completed", result, room=consultation_room(consultation.id))
    # Moves the patient out of Appointments and out of the active count.
    dashboard_changed("consultation_completed")
    return success(result, message="Consultation completed")
