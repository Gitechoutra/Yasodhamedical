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
    """Creates the default administrator only when the database has *no*
    administrator at all.

    Returns (user, created) — `user` is the existing admin when one was found.

    The test is deliberately "is there an admin account", not "does this email
    exist". Those differ the moment somebody changes their credentials, and
    matching on email got that case badly wrong: an administrator who changed
    their address to their own would restart the server and find a *second*
    admin sitting next to theirs, holding the default password from the
    repository. Anyone who could read the repo could sign in.

    Under this rule the only database that gets an account is one that has
    nobody to sign in as, which is the actual problem being solved.

    Nothing about an existing account is ever touched — not the password, not
    the email, not `is_active`. That includes an admin who is disabled: a
    restart must not manufacture a fresh working administrator to sit beside
    one somebody deliberately switched off, because that turns "can restart
    the server" into "can regain admin".

    Raises RuntimeError if the `admin` role is missing, which is a caller
    ordering mistake: roles have to be seeded first.
    """
    name, email, password, _is_default = admin_credentials()

    admin_role = Role.query.filter_by(name="admin").first()
    if not admin_role:
        # Say so plainly rather than failing on a NoneType attribute below.
        raise RuntimeError(
            "The 'admin' role does not exist. Run the roles seeder before this one."
        )

    # Oldest first, so the account reported back is stable across restarts
    # rather than whichever row the database happened to return.
    existing = (
        User.query.filter_by(role_id=admin_role.id).order_by(User.id).first()
    )
    if existing:
        return existing, False

    # No administrator anywhere — but the configured email could still be in
    # use by some other role, and `users.email` is unique. Report that rather
    # than letting it surface as an IntegrityError at boot.
    clash = User.query.filter_by(email=email).first()
    if clash:
        raise RuntimeError(
            f"Cannot create the default administrator: {email} is already used by "
            f"a {clash.role.name if clash.role else 'non-admin'} account. "
            "Set SEED_ADMIN_EMAIL to a different address."
        )

    admin = User(name=name, email=email, role_id=admin_role.id)
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()
    return admin, True


def run():
    """The `python -m portal.seeds` entry point. Reports to stdout."""
    _name, _email, _password, is_default_password = admin_credentials()

    admin, created = create_admin_if_missing()

    if not created:
        # The existing admin's own address, not the configured one — they
        # differ precisely when somebody has changed their credentials, and
        # printing the configured value there would suggest the seeder had
        # done something to it.
        print(f"  Admin       -> an administrator already exists ({admin.email}), left untouched")
        if not admin.is_active:
            print(
                "                 NOTE: that account is disabled. Re-enable it in the "
                "database if you are locked out."
            )
        return admin

    print(f"  Admin       -> created {admin.email}")
    if is_default_password:
        print(
            "                 WARNING: using the default password. "
            "Set SEED_ADMIN_PASSWORD, or change it after first sign-in."
        )
    return admin
