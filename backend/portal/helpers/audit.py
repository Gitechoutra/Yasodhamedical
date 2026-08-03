"""Recording who did what.

Call `audit(...)` from a route right before its `db.session.commit()` -- the
row joins the open session, so an audit entry can never outlive the change it
describes (a failed commit rolls both back together). Same discipline as
`helpers/notify`.

This is the answer to "who changed this patient's medication, and when" during
a dispute or an inspection, so entries are append-only: nothing in the app
updates or deletes an AuditLog row.
"""

from flask_jwt_extended import get_jwt, get_jwt_identity

from portal.extensions import db
from portal.models.audit_log import AuditLog

# Actions worth being able to search for later. Not enforced -- a free-form
# action still records -- but keeping the vocabulary in one place stops
# "patient.update" and "patient_updated" both ending up in the table.
PATIENT_CREATED = "patient.created"
PATIENT_UPDATED = "patient.updated"
PATIENT_REASSIGNED = "patient.reassigned"
APPOINTMENT_CREATED = "appointment.created"
CONSULTATION_STARTED = "consultation.started"
CONSULTATION_ENDED = "consultation.ended"
PRESCRIPTION_VERIFIED = "prescription.verified"
PRESCRIPTION_UNVERIFIED = "prescription.unverified"
NURSING_ASSIGNED = "nursing.assigned"
NURSING_UPDATED = "nursing.plan_updated"
NURSING_CLOSED = "nursing.closed"
MEDICATION_ORDERED = "nursing.medication_ordered"
MEDICATION_ADMINISTERED = "nursing.medication_administered"
OBSERVATION_RECORDED = "nursing.observation_recorded"
NOTE_ADDED = "nursing.note_added"
HANDOVER = "nursing.handover"
ALERT_RAISED = "nursing.alert_raised"
ALERT_ANSWERED = "nursing.alert_answered"
MESSAGE_SENT = "care.message_sent"


def audit(action, entity=None, entity_id=None, detail=None, user_id=None):
    """Queues one audit row against the current user. Returns the row.

    `detail` is a short human-readable summary -- what a reader needs to
    understand the entry without joining back to five other tables.
    """
    if user_id is None:
        try:
            user_id = int(get_jwt_identity())
        except (TypeError, ValueError):
            user_id = None

    try:
        role = get_jwt().get("role")
    except RuntimeError:
        # Called outside a request (a seeder, a shell). Still worth recording.
        role = None

    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        actor_role=role,
        detail=(detail or None) if detail is None else str(detail)[:255],
    )
    db.session.add(entry)
    return entry
