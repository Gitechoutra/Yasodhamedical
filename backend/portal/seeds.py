"""CLI entry point: python -m portal.seeds"""

from portal import create_app
from portal.seeders import seed_core

app = create_app()

with app.app_context():
    seed_core.run()
