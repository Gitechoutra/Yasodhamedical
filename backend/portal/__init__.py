from flask import Flask

from config.config import get_config
from portal.extensions import cors, db, jwt, migrate, socketio
from portal.helpers.response import error
from portal.logger import configure_logger


def create_app():
    app = Flask(__name__)
    app.config.from_object(get_config())

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    socketio.init_app(app, cors_allowed_origins=app.config["CORS_ORIGINS"], async_mode="threading")

    configure_logger(app)

    # Import models so Flask-Migrate can see them via db.metadata.
    from portal import models  # noqa: F401

    from portal.routes import register_routes

    register_routes(app)

    # Registers Socket.IO event handlers (join_consultation, etc.) on `socketio`.
    from portal.websocket import consultation_socket  # noqa: F401

    @app.errorhandler(404)
    def not_found(_e):
        return error("Resource not found", status=404)

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception(e)
        return error("Internal server error", status=500)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app
