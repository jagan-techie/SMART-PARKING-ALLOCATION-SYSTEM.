"""System Settings and Dataset Regeneration REST API endpoints."""

from flask import Blueprint, jsonify, request

from config import DEFAULT_SEED
from models import (
    ParkingSlot,
    SessionLocal,
    Vehicle,
    get_system_config,
    init_db,
    update_system_config,
)

settings_bp = Blueprint("settings", __name__)


@settings_bp.route("/api/settings", methods=["GET"])
def get_settings():
    session = SessionLocal()
    try:
        return jsonify(get_system_config(session))
    finally:
        session.close()


@settings_bp.route("/api/settings", methods=["PUT"])
def save_settings():
    data = request.get_json(silent=True) or {}
    session = SessionLocal()
    try:
        updated = update_system_config(session, data)
        return jsonify({"message": "Settings saved successfully", "settings": updated})
    finally:
        session.close()


@settings_bp.route("/api/dataset/regenerate", methods=["POST"])
def regenerate_dataset():
    data = request.get_json(silent=True) or {}
    seed = int(data.get("seed", DEFAULT_SEED))
    init_db(force_reseed=True, seed=seed)

    session = SessionLocal()
    try:
        total_vehicles = session.query(Vehicle).count()
        waiting_vehicles = session.query(Vehicle).filter(Vehicle.parking_status == "Waiting").count()
        total_slots = session.query(ParkingSlot).count()
        available_slots = (
            session.query(ParkingSlot)
            .filter(ParkingSlot.is_available == True, ParkingSlot.status == "Available")
            .count()
        )
        return jsonify(
            {
                "message": f"Synthetic datasets regenerated cleanly with seed {seed}",
                "seed": seed,
                "counts": {
                    "total_vehicles": total_vehicles,
                    "waiting_vehicles": waiting_vehicles,
                    "total_slots": total_slots,
                    "available_slots": available_slots,
                },
            }
        )
    finally:
        session.close()

