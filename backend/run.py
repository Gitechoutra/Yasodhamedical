from portal import create_app
from portal.extensions import socketio

app = create_app()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=app.config["DEBUG"], allow_unsafe_werkzeug=True)
