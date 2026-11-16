"""Main Flask Application for Smart College Parking Space Allocation Optimization System."""

import os
import sys
from flask import Flask, jsonify, make_response, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from config import Config
from models import SessionLocal, init_db
from routes import (
    dashboard_bp,
    optimization_bp,
    settings_bp,
    slots_bp,
    vehicles_bp,
)


def create_app(initialize_db: bool = True) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            resp = make_response()
            resp.headers["Access-Control-Allow-Origin"] = "*"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            return resp, 204

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response

    @app.teardown_appcontext
    def remove_session(exception=None):
        SessionLocal.remove()

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(vehicles_bp)
    app.register_blueprint(slots_bp)
    app.register_blueprint(optimization_bp)
    app.register_blueprint(settings_bp)

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "Smart College Parking Optimization API"})

    @app.errorhandler(404)
    def not_found(err):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def server_error(err):
        return jsonify({"error": f"Internal server error: {err}"}), 500

    if initialize_db:
        init_db()

    return app


app = create_app(initialize_db=True)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False)

