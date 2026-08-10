"""Reconciliation that runs every time the app starts.

Two things a database has to have before anybody can do anything, and both
are otherwise a command somebody has to remember to run:

  * **the roles.** `users.role_id` is NOT NULL and several routes look a role
    up by name, so a database restored from an older dump — or migrated before
    a role was added — comes up broken with no symptom until staff creation
    fails.
  * **an administrator.** The admin role is the one Staff Management refuses
    to grant, so a database with no admin cannot grow one through the UI. A
    teammate who pulls and runs `python app.py` would have a working server
    and no way to sign in to it.

Doing both at boot removes that class of problem: whatever `python app.py` is
pointed at, the roles exist and there is an account to sign in with by the
time it serves a request.

Deliberately *only* these two. Demo doctors, nurses, departments and stock are
seed data, not startup requirements, and live in `seeders/seed_core.py` behind
an explicit command.
"""

from sqlalchemy import inspect

from portal.extensions import db
from portal.models.role import DEFAULT_ROLES, Role
from portal.models.user import User


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


def ensure_admin(app):
    """Creates the default administrator, or rewrites the existing one to match
    the configured credentials.

    Returns True if it created one. Same contract as `ensure_roles`:
    idempotent, and never raises.

    Note what this does *not* do: it never creates a second account beside an
    administrator whose credentials have changed. Restarting the server after
    changing the configured email must leave you with one admin, moved — not
    two, the second holding a password that is published in the repository.

    The actual work is `seeders/seed_admin.ensure_admin_account`, so that rule
    and the credentials are defined once and behave identically whether they
    arrive via `python app.py` or `python -m portal.seeds`. That is also where
    the `SEED_ADMIN_SYNC=false` opt-out is documented, for deployments that
    want the account left alone once it exists.

    Must run after `ensure_roles` — the account needs its role to exist.
    """
    # Imported here rather than at module scope: helpers are imported early in
    # the app factory, and reaching into a seeder at that point would pull the
    # models in before they are registered.
    from portal.seeders.seed_admin import admin_credentials, ensure_admin_account

    try:
        with app.app_context():
            for table in (Role.__tablename__, User.__tablename__):
                if not inspect(db.engine).has_table(table):
                    app.logger.info(
                        "Admin check: '%s' table does not exist yet -- run "
                        "'flask db upgrade' first. Skipping.",
                        table,
                    )
                    return False

            _name, _email, _password, is_default_password = admin_credentials()
            admin, created, changes = ensure_admin_account()

            if created:
                app.logger.info(
                    "Admin check: created the default administrator -- %s", admin.email
                )
                if is_default_password:
                    app.logger.warning(
                        "That admin uses the default password. Set SEED_ADMIN_PASSWORD, "
                        "or change it after the first sign-in."
                    )
                return True

            if changes:
                app.logger.info(
                    "Admin check: updated the administrator (%s) from the configured "
                    "credentials -- %s",
                    admin.email,
                    ", ".join(changes),
                )
                if is_default_password and "password" in changes:
                    app.logger.warning(
                        "That admin now uses the default password from the repository. "
                        "Set SEED_ADMIN_PASSWORD."
                    )
            else:
                # The existing admin's own address. With syncing off it is not
                # the configured one, and logging the configured value there
                # would imply the check had touched the account.
                app.logger.info(
                    "Admin check: an administrator already exists (%s) -- left untouched",
                    admin.email,
                )

            if not admin.is_active:
                app.logger.warning(
                    "The only administrator (%s) is disabled. No replacement has "
                    "been created -- re-enable it in the database if you are "
                    "locked out.",
                    admin.email,
                )
            return False

    except Exception as exc:  # noqa: BLE001 - startup must not die over this
        try:
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        app.logger.warning("Could not verify the administrator account at startup: %s", exc)
        return False
