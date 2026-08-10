"""Seeds the default administrator login.

The one account that cannot be created through the application: Staff
Management deliberately refuses to grant the `admin` role (see
`models/role.STAFF_ROLES`), because granting administrator is how every other
grant is made. So the first admin has to come from outside the app.

The credentials are read from the environment, falling back to the documented
development defaults. That fallback is a convenience for a local checkout, not
a deployment story — see the warning both callers emit when it is in use.

    SEED_ADMIN_NAME      default: Admin
    SEED_ADMIN_EMAIL     default: admin@yasodhahospitals.com
    SEED_ADMIN_PASSWORD  default: Admin@123

Two callers share `create_admin_if_missing` so the credentials are defined in
exactly one place:

  * `portal/seeds.py`   -- the explicit `python -m portal.seeds` command
  * `helpers/bootstrap` -- the automatic check on every application start

Which is why the function below neither prints nor logs: the CLI wants stdout,
the boot path wants the application log, and each formats its own.
"""

import os

from portal.extensions import db
from portal.models.role import Role
from portal.models.user import User

DEFAULT_NAME = "Admin"
DEFAULT_EMAIL = "admin@yasodhahospitals.com"
DEFAULT_PASSWORD = "Admin@123"


def admin_credentials():
    """The configured administrator details.

    Returns (name, email, password, is_default_password). The last one is what
    lets a caller warn about shipping the documented password.
    """
    name = (os.environ.get("SEED_ADMIN_NAME") or "").strip() or DEFAULT_NAME
    email = ((os.environ.get("SEED_ADMIN_EMAIL") or "").strip() or DEFAULT_EMAIL).lower()
    password = os.environ.get("SEED_ADMIN_PASSWORD") or DEFAULT_PASSWORD
    return name, email, password, password == DEFAULT_PASSWORD


def create_admin_if_missing():
    """Creates the administrator only when that email is absent entirely.

    Returns (user, created).

    Never modifies an account that already exists — not its password, not its
    name, and not `is_active`. Re-running after somebody has changed the admin
    password must not roll it back, and a deliberately disabled admin must
    stay disabled rather than being quietly re-enabled by a restart.

    Raises RuntimeError if the `admin` role is missing, which is a caller
    ordering mistake: roles have to be seeded first.
    """
    name, email, password, _is_default = admin_credentials()

    existing = User.query.filter_by(email=email).first()
    if existing:
        return existing, False

    admin_role = Role.query.filter_by(name="admin").first()
    if not admin_role:
        # Say so plainly rather than failing on a NoneType attribute below.
        raise RuntimeError(
            "The 'admin' role does not exist. Run the roles seeder before this one."
        )

    admin = User(name=name, email=email, role_id=admin_role.id)
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()
    return admin, True


def run():
    """The `python -m portal.seeds` entry point. Reports to stdout."""
    _name, email, _password, is_default_password = admin_credentials()

    admin, created = create_admin_if_missing()

    if not created:
        print(f"  Admin       -> already exists ({email}), left untouched")
        return admin

    print(f"  Admin       -> created {email}")
    if is_default_password:
        print(
            "                 WARNING: using the default password. "
            "Set SEED_ADMIN_PASSWORD, or change it after first sign-in."
        )
    return admin
