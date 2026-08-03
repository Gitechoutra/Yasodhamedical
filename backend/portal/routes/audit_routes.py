"""Reading the audit trail.

Admin-only, and read-only: there is no route here that writes or deletes,
because an audit log you can edit is not an audit log. Entries are created by
`helpers/audit.audit()` inside the transaction of the change they describe.
"""

from flask import Blueprint, request

from portal.helpers.decorators import role_required
from portal.helpers.response import error, success
from portal.models.audit_log import AuditLog

audit_bp = Blueprint("audit", __name__)

DEFAULT_LIMIT = 100
MAX_LIMIT = 500


@audit_bp.get("")
@role_required("admin")
def list_audit_entries():
    """The whole trail, newest first, filterable by entity or by actor."""
    query = AuditLog.query

    entity = (request.args.get("entity") or "").strip()
    if entity:
        query = query.filter(AuditLog.entity == entity)

    entity_id = request.args.get("entity_id", type=int)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)

    user_id = request.args.get("user_id", type=int)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    action = (request.args.get("action") or "").strip()
    if action:
        # Prefix match so "nursing." pulls the whole nursing vocabulary.
        query = query.filter(AuditLog.action.like(f"{action}%"))

    limit = request.args.get("limit", type=int) or DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    rows = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .all()
    )
    return success([r.to_dict() for r in rows])


@audit_bp.get("/entity/<entity>/<int:entity_id>")
@role_required("admin", "doctor")
def entity_history(entity, entity_id):
    """Everything that has happened to one record.

    Open to doctors as well as admins: reviewing the history of a patient or a
    nursing assignment they are responsible for is clinical work, not just
    oversight.
    """
    if not entity.isidentifier():
        return error("Invalid entity", status=422)

    rows = (
        AuditLog.query.filter(AuditLog.entity == entity, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(MAX_LIMIT)
        .all()
    )
    return success([r.to_dict() for r in rows])
