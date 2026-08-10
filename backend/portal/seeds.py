"""CLI entry point: python -m portal.seeds

Seeds what every checkout needs to have in common:

    1. the default roles
    2. the default administrator account
    3. the medicine master data (formulary + pharmacy brand catalogue)

Order matters — an account cannot be created without its role, and a brand
cannot link to its formulary generic before the formulary exists. Staff
logins, branches and pharmacy stock are demo data and are deliberately not
seeded here; `seeders/seed_core.py` still holds them if that is ever wanted
back.

Safe to run more than once: roles are only ever added, the administrator is a
single account that gets created or brought back in step with the configured
credentials (see `seeders/seed_admin`), and medicines are only ever inserted
when missing — never duplicated, and never overwritten once they exist, so a
medicine a developer added or edited by hand is left alone.
"""

from portal import create_app
from portal.seeders import seed_admin, seed_medicines, seed_roles


def run():
    seed_roles.run()
    seed_admin.run()
    seed_medicines.run()


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        print("Seeding...")
        run()
        print("Seed complete.")
