"""The staff shift schedule.

One writer, many readers. An administrator builds and maintains the rota;
every other role can read their own shifts and nothing else. That asymmetry is
the whole point of the module, so it is enforced in one place rather than
per-route: `_scope_to_caller` narrows every listing query for a non-admin, and
every mutating route carries `@role_required("admin")`.

A non-admin asking for someone else's shifts is answered with their own rather
than a 403. The alternative leaks the roster by inference -- a 403 for
`?user_id=7` and an empty list for `?user_id=8` tells you which IDs are on
tonight. Narrowing silently tells you nothing.
"""

from datetime import date, datetime, time, timedelta

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.audit import audit
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import current_role, role_required
from portal.helpers.notify import notify
from portal.helpers.response import error, success
from portal.models.branch import Branch
from portal.models.department import Department
from portal.models.role import STAFF_ROLES, Role
from portal.models.staff_shift import SHIFT_SLOTS, SHIFT_STATUSES, SLOT_HOURS, StaffShift
from portal.models.user import User

shift_bp = Blueprint("shift", __name__)

SHIFT_CREATED = "shift.created"
SHIFT_UPDATED = "shift.updated"
SHIFT_ASSIGNED = "shift.assigned"
SHIFT_CANCELLED = "shift.cancelled"
SHIFT_DELETED = "shift.deleted"

# A rota request with no dates would otherwise return every shift ever
# rostered. Two weeks from today is what a schedule screen opens on.
DEFAULT_RANGE_DAYS = 14
MAX_RANGE_DAYS = 366
MAX_NOTES = 500

# How long a run of days one create request may cover. A rota is built a week
# or a month at a time; a cap well past that stops a typo in the year turning
# into three hundred rows and three hundred audit entries.
MAX_CREATE_DAYS = 92


def _caller_id():
    return int(get_jwt_identity())


def _is_admin():
    return current_role() == "admin"


def _parse_date(raw, field):
    """Returns (date, error_message). Both None means the field was absent."""
    if not raw:
        return None, None
    try:
        return datetime.strptime(str(raw).strip(), "%Y-%m-%d").date(), None
    except ValueError:
        return None, f"{field} must be in YYYY-MM-DD format"


def _parse_time(raw, field):
    """Accepts HH:MM and HH:MM:SS, which is what <input type=time> sends
    depending on whether the browser includes seconds."""
    if not raw:
        return None, None
    text = str(raw).strip()
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).time(), None
        except ValueError:
            continue
    return None, f"{field} must be in HH:MM format"


def _resolve_hours(payload, slot, existing=None):
    """The shift's start and end, from the payload if given and from the
    slot's defaults otherwise.

    Returns (starts_at, ends_at, error). A `custom` slot has no defaults, so
    both times are required for it.
    """
    starts_at, err = _parse_time(payload.get("starts_at"), "starts_at")
    if err:
        return None, None, err
    ends_at, err = _parse_time(payload.get("ends_at"), "ends_at")
    if err:
        return None, None, err

    if starts_at is None:
        starts_at = existing.starts_at if existing else None
    if ends_at is None:
        ends_at = existing.ends_at if existing else None

    # Falling back to the slot's hours only when nothing else supplied them
    # means changing a shift's slot re-times it, while editing only its notes
    # leaves a hand-tuned time alone.
    if slot in SLOT_HOURS:
        default_start, default_end = SLOT_HOURS[slot]
        starts_at = starts_at or default_start
        ends_at = ends_at or default_end

    if starts_at is None or ends_at is None:
        return None, None, "starts_at and ends_at are required for a custom shift"
    if starts_at == ends_at:
        return None, None, "starts_at and ends_at cannot be the same time"
    return starts_at, ends_at, None


def _minutes(t):
    return t.hour * 60 + t.minute


def _overlaps(a_start, a_end, b_start, b_end):
    """Whether two same-day shifts collide, treating an end at or before the
    start as running into the next morning."""
    a0, a1 = _minutes(a_start), _minutes(a_end)
    b0, b1 = _minutes(b_start), _minutes(b_end)
    if a1 <= a0:
        a1 += 24 * 60
    if b1 <= b0:
        b1 += 24 * 60
    return a0 < b1 and b0 < a1


def _clashing_shift(user_id, shift_date, starts_at, ends_at, exclude_id=None):
    """An existing scheduled shift for this person that overlaps the new one.

    Double-booking a nurse is the mistake this table exists to prevent, so it
    is checked on write rather than left for someone to notice on the ward.
    """
    if not user_id:
        return None
    query = StaffShift.query.filter(
        StaffShift.user_id == user_id,
        StaffShift.status == "scheduled",
        # A night shift on the previous day can run into this one.
        StaffShift.shift_date.in_([shift_date, shift_date - timedelta(days=1)]),
    )
    if exclude_id:
        query = query.filter(StaffShift.id != exclude_id)

    for other in query.all():
        if other.shift_date == shift_date:
            if _overlaps(starts_at, ends_at, other.starts_at, other.ends_at):
                return other
        # The day before only collides if it spills past midnight into this
        # shift's morning.
        elif other.crosses_midnight and _minutes(other.ends_at) > _minutes(starts_at):
            return other
    return None


def _assignable_user(user_id):
    """Returns (user, error_message). Admins are excluded deliberately: this
    rosters the staff who work shifts, and an administrator account is a
    management login, not a slot on the ward."""
    user = db.session.get(User, user_id)
    if not user:
        return None, "That staff member does not exist"
    if not user.is_active:
        return None, "That staff account is disabled"
    role_name = user.role.name if user.role else None
    if role_name not in STAFF_ROLES:
        return None, "Only staff accounts can be rostered"
    return user, None


def _scope_to_caller(query):
    """Every listing goes through here. A non-admin sees their own shifts and
    nothing else, whatever they asked for."""
    if _is_admin():
        return query
    return query.filter(StaffShift.user_id == _caller_id())


def _range_from_args():
    """The window to list. Returns (start, end, error)."""
    start, err = _parse_date(request.args.get("from"), "from")
    if err:
        return None, None, err
    end, err = _parse_date(request.args.get("to"), "to")
    if err:
        return None, None, err

    if start is None and end is None:
        start = date.today()
        end = start + timedelta(days=DEFAULT_RANGE_DAYS)
    elif start is None:
        start = end - timedelta(days=DEFAULT_RANGE_DAYS)
    elif end is None:
        end = start + timedelta(days=DEFAULT_RANGE_DAYS)

    if end < start:
        return None, None, "'to' cannot be earlier than 'from'"
    if (end - start).days > MAX_RANGE_DAYS:
        return None, None, f"Date range cannot exceed {MAX_RANGE_DAYS} days"
    return start, end, None


def _create_dates(payload):
    """The days one create request covers. Returns (dates, error_message).

    A create carries a *window* rather than a single date. The same person
    works the same slot for a run of days far more often than for one, so the
    administrator names the run once instead of repeating the form for every
    day of it. A one-day shift is that window collapsed: either end on its own
    stands for both.

    `shift_date` is still accepted so an older client — or anything scripted
    against the previous shape of this endpoint — keeps working unchanged.
    """
    fallback = payload.get("shift_date")
    start, err = _parse_date(payload.get("from_date") or fallback, "from_date")
    if err:
        return None, err
    end, err = _parse_date(payload.get("to_date") or fallback, "to_date")
    if err:
        return None, err

    if start is None and end is None:
        return None, "from_date is required"
    start = start or end
    end = end or start

    if end < start:
        return None, "'to_date' cannot be earlier than 'from_date'"
    span = (end - start).days + 1
    if span > MAX_CREATE_DAYS:
        return None, f"A shift cannot be rostered across more than {MAX_CREATE_DAYS} days at once"

    return [start + timedelta(days=offset) for offset in range(span)], None


def _validate_common(payload, existing=None):
    """Shared create/update validation for everything except the date.

    The date is left out because the two callers want different things from
    it: an update moves one row, a create writes one row per day of a range.
    See `_create_dates`.

    Returns (fields, error_message). `fields` is a dict ready to apply to a
    StaffShift.
    """
    slot = (payload.get("slot") or (existing.slot if existing else "")).strip().lower()
    if slot not in SHIFT_SLOTS:
        return None, f"slot must be one of: {', '.join(SHIFT_SLOTS)}"

    starts_at, ends_at, err = _resolve_hours(payload, slot, existing)
    if err:
        return None, err

    fields = {
        "slot": slot,
        "starts_at": starts_at,
        "ends_at": ends_at,
    }

    for key, model in (("department_id", Department), ("branch_id", Branch)):
        if key not in payload:
            continue
        raw = payload.get(key)
        if raw in (None, "", 0):
            fields[key] = None
            continue
        try:
            row = db.session.get(model, int(raw))
        except (TypeError, ValueError):
            return None, f"{key} must be a number"
        if not row:
            return None, f"{key} does not exist"
        fields[key] = row.id

    if "notes" in payload:
        notes = (payload.get("notes") or "").strip()
        fields["notes"] = notes[:MAX_NOTES] or None

    return fields, None


# Distinguishes "caller did not say" from "caller said nobody", which is a
# real state here -- an unassigned slot.
_UNSET = object()


def _describe(shift, user=_UNSET):
    """The one-line summary an audit entry carries.

    `user` is passed explicitly by the routes that have just reassigned the
    shift. `shift.user` still points at whoever held it before: assigning to
    `shift.user_id` marks the column dirty but does not refresh the loaded
    relationship, and `audit()` runs before the commit that would expire it.
    Reading it here logged every reassignment one person behind -- "assigned"
    entries named the previous occupant, or "unassigned" for a slot that had
    just been filled.
    """
    staff = shift.user if user is _UNSET else user
    who = staff.name if staff else "unassigned"
    return f"{shift.shift_date} {shift.slot} ({shift.starts_at:%H:%M}-{shift.ends_at:%H:%M}) — {who}"


def _notify_assigned(user, shifts, actor_id):
    """Tells a member of staff they have been put on the rota.

    Only the person the shifts belong to is told, which is the whole point:
    the rest of the hospital's roster is none of their business, and a nurse
    should not learn from her bell who else is on tonight.

    One notification per assignment rather than per day. Rostering somebody
    across a fortnight is one decision by the administrator and should read as
    one line in that person's bell, not fourteen — and fourteen would push
    every other notification they have off the panel.

    Called before the commit, like every other `notify()` in the app: the rows
    join the open session, so a shift that fails to save cannot leave behind a
    notification announcing it.
    """
    if not user or not shifts:
        return

    first, last = shifts[0], shifts[-1]
    hours = f"{first.starts_at:%H:%M}–{first.ends_at:%H:%M}"

    if len(shifts) == 1:
        title = "You have a new shift"
        body = f"{first.slot.capitalize()} shift on {first.shift_date:%a, %d %b %Y}, {hours}."
    else:
        title = f"You have {len(shifts)} new shifts"
        body = (
            f"{first.slot.capitalize()} shift, {hours}, every day from "
            f"{first.shift_date:%d %b} to {last.shift_date:%d %b %Y}."
        )

    # Worth saying outright. An end time earlier than the start reads as a
    # mistake to whoever is being told to work it.
    if first.crosses_midnight:
        body += " Ends the following morning."

    notify(
        [user.id],
        title=title,
        body=body,
        category="shift",
        # The staff-facing rota. NotificationMenu.resolveLink points this at
        # whichever module the reader actually lives in — a nurse's own shifts
        # are at /nurse/shifts, and /dashboard would bounce her straight out.
        link="/dashboard/shifts",
        exclude_user_id=actor_id,
    )


# ---------------------------------------------------------------- reading --


@shift_bp.get("")
@jwt_required()
def list_shifts():
    """The rota for a date range.

    Admin sees everyone and may filter; every other role sees only their own,
    whatever filters they send.
    """
    start, end, err = _range_from_args()
    if err:
        return error(err, status=422)

    query = StaffShift.query.filter(
        StaffShift.shift_date >= start, StaffShift.shift_date <= end
    )

    status = (request.args.get("status") or "").strip().lower()
    if status and status != "all":
        if status not in SHIFT_STATUSES:
            return error(f"status must be one of: {', '.join(SHIFT_STATUSES)}", status=422)
        query = query.filter(StaffShift.status == status)

    # Admin-only filters. Silently ignored for everyone else, who is scoped to
    # themselves regardless.
    if _is_admin():
        raw_user = (request.args.get("user_id") or "").strip()
        if raw_user == "unassigned":
            query = query.filter(StaffShift.user_id.is_(None))
        elif raw_user:
            try:
                query = query.filter(StaffShift.user_id == int(raw_user))
            except ValueError:
                return error("user_id must be a number or 'unassigned'", status=422)

        role_name = (request.args.get("role") or "").strip()
        if role_name and role_name != "all":
            if role_name not in STAFF_ROLES:
                return error("Unknown role", status=422)
            query = query.join(User, StaffShift.user_id == User.id).join(
                Role, User.role_id == Role.id
            ).filter(Role.name == role_name)

        raw_dept = (request.args.get("department_id") or "").strip()
        if raw_dept:
            try:
                query = query.filter(StaffShift.department_id == int(raw_dept))
            except ValueError:
                return error("department_id must be a number", status=422)

    query = _scope_to_caller(query)
    shifts = query.order_by(StaffShift.shift_date, StaffShift.starts_at, StaffShift.id).all()

    return success(
        {
            "items": [s.to_dict() for s in shifts],
            "from": start.isoformat(),
            "to": end.isoformat(),
            # Lets the client render the right screen without re-deriving the
            # rule from the role.
            "can_manage": _is_admin(),
        }
    )


@shift_bp.get("/mine")
@jwt_required()
def my_shifts():
    """The caller's own shifts, for the read-only view every non-admin gets.

    Separate from the scoped listing above so a client does not have to know
    its own user id, and so an admin can see their own roster too rather than
    the whole hospital's.
    """
    start, end, err = _range_from_args()
    if err:
        return error(err, status=422)

    shifts = (
        StaffShift.query.filter(
            StaffShift.user_id == _caller_id(),
            StaffShift.shift_date >= start,
            StaffShift.shift_date <= end,
        )
        .order_by(StaffShift.shift_date, StaffShift.starts_at)
        .all()
    )
    return success(
        {
            "items": [s.to_dict() for s in shifts],
            "from": start.isoformat(),
            "to": end.isoformat(),
        }
    )


@shift_bp.get("/options")
@role_required("admin")
def shift_options():
    """Everything the roster form needs: who can be assigned, and the slots."""
    users = (
        User.query.join(Role, User.role_id == Role.id)
        .filter(User.is_active.is_(True), Role.name.in_(STAFF_ROLES))
        .order_by(Role.name, User.name)
        .all()
    )
    return success(
        {
            "slots": list(SHIFT_SLOTS),
            "slot_hours": {
                slot: {"starts_at": s.strftime("%H:%M"), "ends_at": e.strftime("%H:%M")}
                for slot, (s, e) in SLOT_HOURS.items()
            },
            "statuses": list(SHIFT_STATUSES),
            "roles": list(STAFF_ROLES),
            "staff": [
                {
                    "id": u.id,
                    "name": u.name,
                    "role": u.role.name if u.role else None,
                    "avatar_url": u.avatar_url,
                }
                for u in users
            ],
            "departments": [
                {"id": d.id, "name": d.name}
                for d in Department.query.order_by(Department.name).all()
            ],
            "branches": [
                {"id": b.id, "name": b.name}
                for b in Branch.query.filter_by(is_active=True).order_by(Branch.name).all()
            ],
        }
    )


@shift_bp.get("/<int:shift_id>")
@jwt_required()
def get_shift(shift_id):
    shift = db.session.get(StaffShift, shift_id)
    # Someone else's shift is reported as missing rather than forbidden, for
    # the same reason the listing narrows silently.
    if not shift or (not _is_admin() and shift.user_id != _caller_id()):
        return error("Shift not found", status=404)
    return success(shift.to_dict())


# ---------------------------------------------------------------- writing --


@shift_bp.post("")
@role_required("admin")
def create_shift():
    """Rosters a run of days, assigned or left open for someone to be put in
    later.

    One row is written per day between `from_date` and `to_date` inclusive,
    all sharing the slot, hours, department and notes given once. The dates
    stay one row each rather than becoming a range column on the table: a rota
    is read, cancelled and reassigned a day at a time, and a shift that had to
    remember it was created alongside four others could not be.
    """
    payload = request.get_json(silent=True) or {}

    fields, err = _validate_common(payload)
    if err:
        return error(err, status=422)

    dates, err = _create_dates(payload)
    if err:
        return error(err, status=422)

    user_id = payload.get("user_id")
    user = None
    if user_id not in (None, "", 0):
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return error("user_id must be a number", status=422)
        user, err = _assignable_user(user_id)
        if err:
            return error(err, status=422)
    else:
        user_id = None

    # Every day is checked before any of them is written. A run that half
    # applied would leave the administrator to work out which days landed and
    # which did not, from a rota that looks deliberate either way.
    for day in dates:
        clash = _clashing_shift(user_id, day, fields["starts_at"], fields["ends_at"])
        if clash:
            return error(
                f"{user.name} is already rostered {clash.starts_at:%H:%M}-"
                f"{clash.ends_at:%H:%M} on {clash.shift_date}",
                status=409,
                errors={"shift_id": clash.id, "shift_date": day.isoformat()},
            )

    created = []
    for day in dates:
        shift = StaffShift(
            user_id=user_id, created_by_id=_caller_id(), shift_date=day, **fields
        )
        db.session.add(shift)
        created.append(shift)
    db.session.flush()  # assigns the ids the audit entries reference

    for shift in created:
        audit(
            SHIFT_CREATED, entity="staff_shift", entity_id=shift.id, detail=_describe(shift, user)
        )

    _notify_assigned(user, created, _caller_id())

    db.session.commit()
    # Wakes the assignee's bell now rather than on its next minute-long poll.
    dashboard_changed("shift_created")

    return success(
        {"items": [s.to_dict() for s in created], "count": len(created)},
        message=(
            "Shift added" if len(created) == 1 else f"{len(created)} shifts added"
        ),
        status=201,
    )


@shift_bp.patch("/<int:shift_id>")
@role_required("admin")
def update_shift(shift_id):
    """Edits a shift, reassigns it, or puts it back to scheduled after a
    cancellation. Every field is optional; anything absent is left alone."""
    shift = db.session.get(StaffShift, shift_id)
    if not shift:
        return error("Shift not found", status=404)

    payload = request.get_json(silent=True) or {}

    fields, err = _validate_common(payload, existing=shift)
    if err:
        return error(err, status=422)

    # An edit moves one row, so it takes one date rather than a window —
    # splitting an existing shift across a range would be a different
    # operation with a different answer for what happens to this row's id.
    shift_date, err = _parse_date(payload.get("shift_date"), "shift_date")
    if err:
        return error(err, status=422)
    fields["shift_date"] = shift_date or shift.shift_date

    reassigned = False
    target_user_id = shift.user_id
    user = shift.user
    if "user_id" in payload:
        raw = payload.get("user_id")
        if raw in (None, "", 0):
            target_user_id, user = None, None
        else:
            try:
                target_user_id = int(raw)
            except (TypeError, ValueError):
                return error("user_id must be a number", status=422)
            user, err = _assignable_user(target_user_id)
            if err:
                return error(err, status=422)
        reassigned = target_user_id != shift.user_id

    if "status" in payload:
        status = (payload.get("status") or "").strip().lower()
        if status not in SHIFT_STATUSES:
            return error(f"status must be one of: {', '.join(SHIFT_STATUSES)}", status=422)
        shift.status = status

    # Only a shift that will actually be worked can clash with another.
    if shift.status == "scheduled":
        clash = _clashing_shift(
            target_user_id,
            fields["shift_date"],
            fields["starts_at"],
            fields["ends_at"],
            exclude_id=shift.id,
        )
        if clash:
            return error(
                f"{user.name if user else 'That staff member'} is already rostered "
                f"{clash.starts_at:%H:%M}-{clash.ends_at:%H:%M} on {clash.shift_date}",
                status=409,
                errors={"shift_id": clash.id},
            )

    shift.user_id = target_user_id
    for key, value in fields.items():
        setattr(shift, key, value)

    # The "Assign" button on an unfilled slot lands here, not on create, so
    # telling people only on create would leave the drafted-then-filled rota —
    # the way an administrator is meant to work — silently unannounced. Only a
    # shift that will actually be worked is worth a notification.
    if reassigned and shift.status == "scheduled":
        _notify_assigned(user, [shift], _caller_id())

    audit(
        SHIFT_ASSIGNED if reassigned else SHIFT_UPDATED,
        entity="staff_shift",
        entity_id=shift.id,
        detail=_describe(shift, user),
    )
    db.session.commit()
    if reassigned:
        dashboard_changed("shift_assigned")
    return success(shift.to_dict(), message="Shift updated")


@shift_bp.post("/<int:shift_id>/cancel")
@role_required("admin")
def cancel_shift(shift_id):
    """Cancels without deleting, so the rota keeps its history.

    This is what the UI offers by default; DELETE is reserved for a row that
    was a mistake in the first place.
    """
    shift = db.session.get(StaffShift, shift_id)
    if not shift:
        return error("Shift not found", status=404)
    if shift.status == "cancelled":
        return success(shift.to_dict(), message="Shift was already cancelled")

    shift.status = "cancelled"
    audit(SHIFT_CANCELLED, entity="staff_shift", entity_id=shift.id, detail=_describe(shift))
    db.session.commit()
    return success(shift.to_dict(), message="Shift cancelled")


@shift_bp.delete("/<int:shift_id>")
@role_required("admin")
def delete_shift(shift_id):
    """Removes a shift outright. Nothing holds a foreign key into this table,
    so unlike a staff account a shift is genuinely safe to delete."""
    shift = db.session.get(StaffShift, shift_id)
    if not shift:
        return error("Shift not found", status=404)

    detail = _describe(shift)
    db.session.delete(shift)
    audit(SHIFT_DELETED, entity="staff_shift", entity_id=shift_id, detail=detail)
    db.session.commit()
    return success(message="Shift deleted")
