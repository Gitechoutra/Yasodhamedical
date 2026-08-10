"""Reconciliation that runs every time the app starts.

The roles table is the one piece of data the application cannot function
without: `users.role_id` is NOT NULL, and several routes look a role up by
name and fail outright if it is missing. A migration inserts them, and the
seeder reconciles them, but both are things somebody has to remember to run —
and a database restored from an older dump, or one migrated before a role was
added, comes up missing them with no obvious symptom beyond staff creation
failing later.

Doing it at boot removes that class of problem: whatever `python app.py` is
pointed at, the eight roles exist by the time it serves a request.
"""

from sqlalchemy import inspect

from portal.extensions import db
from portal.models.role import DEFAULT_ROLES, Role


def ensure_roles(app):
    """Inserts any of DEFAULT_ROLES that the database is missing.

    Additive only. An existing role is left exactly as it is — including its
    description, which an administrator may have edited deliberately, and
    which the seeder is the right place to refresh in bulk.

    Never raises. Startup failing because of a transient database problem is
    strictly worse than starting and reporting the problem per request: the
    app is already built at this point, and every route surfaces a database
    outage on its own.
    """
    try:
        with app.app_context():
            # A fresh database has no tables until `flask db upgrade` runs —
            # and that command imports this same factory, so querying blindly
            # here would break the very migration that creates the table.
            if not inspect(db.engine).has_table(Role.__tablename__):
                app.logger.info(
                    "Roles table does not exist yet -- run 'flask db upgrade' first. "
                    "Skipping the role check."
                )
                return []

            existing = {name for (name,) in db.session.query(Role.name).all()}
            missing = [(n, d) for n, d in DEFAULT_ROLES if n not in existing]

            if not missing:
                app.logger.info(
                    "Role check: all %d roles present (%s)",
                    len(DEFAULT_ROLES),
                    ", ".join(name for name, _ in DEFAULT_ROLES),
                )
                return []

            for name, description in missing:
                db.session.add(Role(name=name, description=description))
            db.session.commit()

            added = [name for name, _ in missing]
            app.logger.info(
                "Role check: added %d missing role%s -- %s",
                len(added),
                "" if len(added) == 1 else "s",
                ", ".join(added),
            )
            return added

    except Exception as exc:  # noqa: BLE001 - see the docstring
        # rollback so a half-applied insert cannot poison the next session
        # that picks this connection up.
        try:
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        app.logger.warning("Could not verify the roles table at startup: %s", exc)
        return []
