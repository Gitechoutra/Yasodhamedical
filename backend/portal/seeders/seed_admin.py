"""Seeds the default administrator login.

The one account that cannot be created through the application: Staff
Management deliberately refuses to grant the `admin` role (see
`models/role.STAFF_ROLES`), because granting administrator is how every other
grant is made. So the first admin has to come from outside the app, and this
is it.

The credentials are read from the environment, falling back to the documented
development defaults. That fallback is a convenience for a local checkout, not
a deployment story — see the warning `run()` prints when it uses one.

    SEED_ADMIN_NAME      default: Admin
    SEED_ADMIN_EMAIL     default: admin@yasodhahospitals.com
    SEED_ADMIN_PASSWORD  default: Admin@123

Requires the `admin` role to exist, so `seed_roles` runs first — `seeds.py`
sequences the two.
"""

import os

from portal.extensions import db
from portal.models.role import Role
from portal.models.user import User

DEFAULT_NAME = "Admin"
DEFAULT_EMAIL = "admin@yasodhahospitals.com"
DEFAULT_PASSWORD = "Admin@123"


def run():
    """Creates the administrator if there isn't one with that email yet.

    Never touches an existing account. Re-running after someone has changed
    the admin password must not reset it back to the seed value — that would
    turn a routine `seed` into a silent credential rollback.
    """
    name = os.environ.get("SEED_ADMIN_NAME", DEFAULT_NAME).strip() or DEFAULT_NAME
    email = (
        os.environ.get("SEED_ADMIN_EMAIL", DEFAULT_EMAIL).strip().lower() or DEFAULT_EMAIL
    )
    password = os.environ.get("SEED_ADMIN_PASSWORD") or DEFAULT_PASSWORD

    admin_role = Role.query.filter_by(name="admin").first()
    if not admin_role:
        # Seeding roles first is the caller's job; say so plainly rather than
        # failing on a NoneType attribute three lines down.
        raise RuntimeError(
            "The 'admin' role does not exist. Run the roles seeder before this one."
        )

    existing = User.query.filter_by(email=email).first()
    if existing:
        print(f"  Admin       -> already exists ({email}), left untouched")
        return existing

    admin = User(name=name, email=email, role_id=admin_role.id)
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()

    print(f"  Admin       -> created {email}")
    if password == DEFAULT_PASSWORD:
        print(
            "                 WARNING: using the default password. "
            "Set SEED_ADMIN_PASSWORD, or change it after first sign-in."
        )

    return admin
