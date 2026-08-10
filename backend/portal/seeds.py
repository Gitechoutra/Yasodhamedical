"""CLI entry point: python -m portal.seeds

Seeds the two things a fresh database needs before anyone can sign in:

    1. the default roles
    2. the default administrator account
    3. the hospital departments
    4. the starting clinical formulary

Order matters — an account cannot be created without its role.

These are the same four checks `python app.py` performs on every start (see
`helpers/bootstrap`), so this command is really only for running them without
starting a server. Demo staff logins, patients and pharmacy stock are sample
content rather than reference data and are deliberately not seeded here;
`seeders/seed_core.py` still holds them if they are ever wanted back.

Safe to run more than once: roles are only ever added, and the administrator
is a single account that gets created or brought back in step with the
configured credentials — never duplicated. See `seeders/seed_admin` for what
"in step" means and how to switch it off.
"""

from portal import create_app
from portal.seeders import seed_admin, seed_departments, seed_medicines, seed_roles


def run():
    seed_roles.run()
    seed_admin.run()
    seed_departments.run()
    seed_medicines.run()


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        print("Seeding...")
        run()
        print("Seed complete.")
