"""CLI entry point: python -m portal.seeds

Seeds the two things a fresh database needs before anyone can sign in:

    1. the default roles
    2. the default administrator account

Order matters — an account cannot be created without its role. Everything
else (departments, staff logins, the formulary, pharmacy stock) is demo data
and is deliberately not seeded here; `seeders/seed_core.py` still holds it if
it is ever wanted back.

Safe to run more than once: each seeder creates only what is missing and
leaves anything that already exists alone.
"""

from portal import create_app
from portal.seeders import seed_admin, seed_roles


def run():
    seed_roles.run()
    seed_admin.run()


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        print("Seeding...")
        run()
        print("Seed complete.")
