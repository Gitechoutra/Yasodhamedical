from urllib.parse import parse_qs, urlparse

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.response import error, success
from portal.models.emergency_case import EmergencyCase
from portal.models.notification import Notification

notification_bp = Blueprint("notifications", __name__)

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


def _resolve_link(notification):
    """Where a notification actually points, decided fresh on every read.

    A "patient assigned to you" link is written once, at registration —
    but if that patient turns out to have an unclaimed Emergency Case (which
    can only be logged *after* the patient already exists, so it is never
    present yet at that moment), the doctor's one actionable step is to claim
    it, not to open a record with nothing to do on it. Re-checking here means
    an old notification heals itself as soon as that becomes true, instead of
    staying wrong forever because the link was frozen at write time.
    """
    if notification.category != "patient_assignment" or not notification.link:
        return notification.link
    raw_patient_id = parse_qs(urlparse(notification.link).query).get("patient_id", [None])[0]
    try:
        patient_id = int(raw_patient_id)
    except (TypeError, ValueError):
        return notification.link
    has_open_case = (
        db.session.query(EmergencyCase.id)
        .filter_by(patient_id=patient_id, status="waiting")
        .first()
        is not None
    )
    return "/dashboard/emergency" if has_open_case else notification.link


@notification_bp.get("")
@jwt_required()
def list_notifications():
    """The bell menu's only read: a page of the caller's own notifications
    plus the badge count, so opening it costs one request."""
    user_id = get_jwt_identity()

    limit = request.args.get("limit", type=int) or DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    query = Notification.query.filter_by(user_id=user_id)
    if request.args.get("unread") == "true":
        query = query.filter_by(is_read=False)
    category = request.args.get("category")
    if category:
        query = query.filter_by(category=category)

    items = query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()

    item_dicts = []
    for n in items:
        data = n.to_dict()
        data["link"] = _resolve_link(n)
        item_dicts.append(data)

    return success({"items": item_dicts, "unread_count": unread_count})


@notification_bp.post("/<int:notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    user_id = get_jwt_identity()
    notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not notification:
        # Scoped by user_id above, so someone else's id reads as "not found"
        # rather than confirming it exists.
        return error("Notification not found", status=404)

    notification.is_read = True
    db.session.commit()

    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    data = notification.to_dict()
    data["link"] = _resolve_link(notification)
    return success({"notification": data, "unread_count": unread_count})


@notification_bp.post("/read-all")
@jwt_required()
def mark_all_read():
    user_id = get_jwt_identity()
    updated = (
        Notification.query.filter_by(user_id=user_id, is_read=False)
        .update({"is_read": True}, synchronize_session=False)
    )
    db.session.commit()
    return success({"updated": updated, "unread_count": 0}, message="All notifications marked read")
