"""Vehicle Management REST API endpoints."""

from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from models import (
    AllocationHistory,
    ParkingSlot,
    SessionLocal,
    Vehicle,
    get_system_config,
)

vehicles_bp = Blueprint("vehicles", __name__)

VALID_VEHICLE_TYPES = {"Car", "Bike", "Scooter"}
VALID_USER_TYPES = {"Student", "Faculty", "Staff", "Visitor"}
VALID_BLOCKS = {"A", "B", "C", "D"}
VALID_STATUSES = {"Waiting", "Assigned", "Departed"}


def _next_vehicle_id(session) -> str:
    existing = [v.vehicle_id for v in session.query(Vehicle.vehicle_id).all()]
    max_num = 0
    for vid in existing:
        if vid.startswith("VEH-"):
            try:
                max_num = max(max_num, int(vid.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return f"VEH-{max_num + 1:03d}"


@vehicles_bp.route("/api/vehicles", methods=["GET"])
def list_vehicles():
    session = SessionLocal()
    try:
        query = session.query(Vehicle)

        search = request.args.get("search", "").strip()
        vehicle_type = request.args.get("vehicle_type", "").strip()
        user_type = request.args.get("user_type", "").strip()
        destination_block = request.args.get("destination_block", "").strip()
        parking_status = request.args.get("parking_status", "").strip()
        requires_accessible = request.args.get("requires_accessible", "").strip().lower()

        if search:
            like_term = f"%{search}%"
            query = query.filter(
                or_(
                    Vehicle.vehicle_id.ilike(like_term),
                    Vehicle.registration_number.ilike(like_term),
                    Vehicle.user_type.ilike(like_term),
                    Vehicle.assigned_slot_id.ilike(like_term),
                )
            )
        if vehicle_type:
            query = query.filter(Vehicle.vehicle_type == vehicle_type)
        if user_type:
            query = query.filter(Vehicle.user_type == user_type)
        if destination_block:
            query = query.filter(Vehicle.destination_block == destination_block)
        if parking_status:
            query = query.filter(Vehicle.parking_status == parking_status)
        if requires_accessible in ("true", "false"):
            query = query.filter(Vehicle.requires_accessible == (requires_accessible == "true"))

        vehicles = query.order_by(Vehicle.vehicle_id.asc()).all()
        return jsonify({"vehicles": [v.to_dict() for v in vehicles], "count": len(vehicles)})
    finally:
        session.close()


@vehicles_bp.route("/api/vehicles", methods=["POST"])
def create_vehicle():
    data = request.get_json(silent=True) or {}
    session = SessionLocal()
    try:
        reg_no = str(data.get("registration_number", "")).strip().upper()
        v_type = str(data.get("vehicle_type", "")).strip()
        u_type = str(data.get("user_type", "")).strip()
        block = str(data.get("destination_block", "")).strip().upper()

        if not reg_no:
            return jsonify({"error": "registration_number is required"}), 400
        if v_type not in VALID_VEHICLE_TYPES:
            return jsonify({"error": f"vehicle_type must be one of {sorted(VALID_VEHICLE_TYPES)}"}), 400
        if u_type not in VALID_USER_TYPES:
            return jsonify({"error": f"user_type must be one of {sorted(VALID_USER_TYPES)}"}), 400
        if block not in VALID_BLOCKS:
            return jsonify({"error": f"destination_block must be one of {sorted(VALID_BLOCKS)}"}), 400

        if session.query(Vehicle).filter(Vehicle.registration_number == reg_no).first():
            return jsonify({"error": f"Vehicle with registration {reg_no} already exists"}), 409

        cfg = get_system_config(session)
        p_rules = cfg["priority_rules"]
        priority_level = int(data.get("priority_level") or p_rules.get(u_type, {}).get("level", 4))

        vehicle_id = str(data.get("vehicle_id") or _next_vehicle_id(session)).strip()
        if session.get(Vehicle, vehicle_id):
            return jsonify({"error": f"Vehicle ID {vehicle_id} already exists"}), 409

        status = str(data.get("parking_status", "Waiting")).strip()
        if status not in VALID_STATUSES:
            status = "Waiting"

        vehicle = Vehicle(
            vehicle_id=vehicle_id,
            registration_number=reg_no,
            vehicle_type=v_type,
            user_type=u_type,
            destination_block=block,
            priority_level=priority_level,
            requires_accessible=bool(data.get("requires_accessible", False)),
            arrival_time=str(data.get("arrival_time", "09:00")).strip(),
            departure_time=str(data.get("departure_time", "17:00")).strip(),
            parking_status=status,
            assigned_slot_id=None,
        )
        session.add(vehicle)
        session.commit()
        return jsonify({"message": "Vehicle created successfully", "vehicle": vehicle.to_dict()}), 201
    finally:
        session.close()


@vehicles_bp.route("/api/vehicles/<vehicle_id>", methods=["PUT"])
def update_vehicle(vehicle_id):
    data = request.get_json(silent=True) or {}
    session = SessionLocal()
    try:
        vehicle = session.get(Vehicle, vehicle_id)
        if vehicle is None:
            return jsonify({"error": f"Vehicle {vehicle_id} not found"}), 404

        if "registration_number" in data:
            reg_no = str(data["registration_number"]).strip().upper()
            if not reg_no:
                return jsonify({"error": "registration_number cannot be empty"}), 400
            dup = (
                session.query(Vehicle)
                .filter(Vehicle.registration_number == reg_no, Vehicle.vehicle_id != vehicle_id)
                .first()
            )
            if dup:
                return jsonify({"error": f"Registration {reg_no} is already in use"}), 409
            vehicle.registration_number = reg_no

        if "vehicle_type" in data:
            if data["vehicle_type"] not in VALID_VEHICLE_TYPES:
                return jsonify({"error": "Invalid vehicle_type"}), 400
            vehicle.vehicle_type = data["vehicle_type"]

        if "user_type" in data:
            if data["user_type"] not in VALID_USER_TYPES:
                return jsonify({"error": "Invalid user_type"}), 400
            vehicle.user_type = data["user_type"]
            if "priority_level" not in data:
                cfg = get_system_config(session)
                vehicle.priority_level = int(cfg["priority_rules"].get(vehicle.user_type, {}).get("level", 4))

        if "destination_block" in data:
            block = str(data["destination_block"]).strip().upper()
            if block not in VALID_BLOCKS:
                return jsonify({"error": "Invalid destination_block"}), 400
            vehicle.destination_block = block

        if "priority_level" in data:
            vehicle.priority_level = int(data["priority_level"])
        if "requires_accessible" in data:
            vehicle.requires_accessible = bool(data["requires_accessible"])
        if "arrival_time" in data:
            vehicle.arrival_time = str(data["arrival_time"]).strip()
        if "departure_time" in data:
            vehicle.departure_time = str(data["departure_time"]).strip()

        if "parking_status" in data:
            new_status = str(data["parking_status"]).strip()
            if new_status not in VALID_STATUSES:
                return jsonify({"error": "Invalid parking_status"}), 400
            # Release slot if vehicle departs or returns to Waiting
            if vehicle.parking_status == "Assigned" and new_status != "Assigned":
                if vehicle.assigned_slot_id:
                    slot = session.get(ParkingSlot, vehicle.assigned_slot_id)
                    if slot:
                        slot.is_available = True
                        slot.status = "Available"
                        slot.assigned_vehicle_id = None
                    active_alloc = (
                        session.query(AllocationHistory)
                        .filter(
                            AllocationHistory.vehicle_id == vehicle_id,
                            AllocationHistory.allocation_status == "Active",
                        )
                        .all()
                    )
                    for alloc in active_alloc:
                        alloc.allocation_status = "Completed" if new_status == "Departed" else "Cancelled"
                vehicle.assigned_slot_id = None
            vehicle.parking_status = new_status

        session.commit()
        return jsonify({"message": "Vehicle updated successfully", "vehicle": vehicle.to_dict()})
    finally:
        session.close()


@vehicles_bp.route("/api/vehicles/<vehicle_id>", methods=["DELETE"])
def delete_vehicle(vehicle_id):
    session = SessionLocal()
    try:
        vehicle = session.get(Vehicle, vehicle_id)
        if vehicle is None:
            return jsonify({"error": f"Vehicle {vehicle_id} not found"}), 404

        if vehicle.assigned_slot_id:
            slot = session.get(ParkingSlot, vehicle.assigned_slot_id)
            if slot:
                slot.is_available = True
                slot.status = "Available"
                slot.assigned_vehicle_id = None

        session.delete(vehicle)
        session.commit()
        return jsonify({"message": f"Vehicle {vehicle_id} deleted successfully"})
    finally:
        session.close()

