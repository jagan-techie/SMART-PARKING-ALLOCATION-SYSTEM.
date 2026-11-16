"""Parking Slot Management REST API endpoints."""

from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from models import AllocationHistory, ParkingSlot, SessionLocal, Vehicle

slots_bp = Blueprint("slots", __name__)

VALID_SLOT_TYPES = {"Car", "Bike", "Scooter", "Two-Wheeler"}
VALID_SLOT_STATUSES = {"Available", "Occupied", "Unavailable"}


def _next_slot_id(session) -> str:
    existing = [s.slot_id for s in session.query(ParkingSlot.slot_id).all()]
    max_num = 0
    for sid in existing:
        if sid.startswith("SLT-"):
            try:
                max_num = max(max_num, int(sid.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return f"SLT-{max_num + 1:03d}"


@slots_bp.route("/api/parking-slots", methods=["GET"])
def list_parking_slots():
    session = SessionLocal()
    try:
        query = session.query(ParkingSlot)

        search = request.args.get("search", "").strip()
        zone = request.args.get("zone", "").strip()
        slot_type = request.args.get("slot_type", "").strip()
        status = request.args.get("status", "").strip()
        is_accessible = request.args.get("is_accessible", "").strip().lower()
        is_available = request.args.get("is_available", "").strip().lower()

        if search:
            like_term = f"%{search}%"
            query = query.filter(
                or_(
                    ParkingSlot.slot_id.ilike(like_term),
                    ParkingSlot.zone.ilike(like_term),
                    ParkingSlot.assigned_vehicle_id.ilike(like_term),
                )
            )
        if zone:
            query = query.filter(ParkingSlot.zone == zone)
        if slot_type:
            query = query.filter(ParkingSlot.slot_type == slot_type)
        if status:
            query = query.filter(ParkingSlot.status == status)
        if is_accessible in ("true", "false"):
            query = query.filter(ParkingSlot.is_accessible == (is_accessible == "true"))
        if is_available in ("true", "false"):
            query = query.filter(ParkingSlot.is_available == (is_available == "true"))

        slots = query.order_by(ParkingSlot.slot_id.asc()).all()
        return jsonify({"slots": [s.to_dict() for s in slots], "count": len(slots)})
    finally:
        session.close()


@slots_bp.route("/api/parking-slots", methods=["POST"])
def create_parking_slot():
    data = request.get_json(silent=True) or {}
    session = SessionLocal()
    try:
        zone = str(data.get("zone", "Zone A")).strip()
        slot_type = str(data.get("slot_type", "Car")).strip()
        if slot_type not in VALID_SLOT_TYPES:
            return jsonify({"error": f"slot_type must be one of {sorted(VALID_SLOT_TYPES)}"}), 400

        slot_id = str(data.get("slot_id") or _next_slot_id(session)).strip()
        if session.get(ParkingSlot, slot_id):
            return jsonify({"error": f"Slot ID {slot_id} already exists"}), 409

        status = str(data.get("status", "Available")).strip()
        if status not in VALID_SLOT_STATUSES:
            status = "Available"
        is_avail = bool(data.get("is_available", status == "Available"))
        if not is_avail and status == "Available":
            status = "Unavailable"

        slot = ParkingSlot(
            slot_id=slot_id,
            zone=zone,
            slot_type=slot_type,
            distance_to_block_a=int(data.get("distance_to_block_a", 100)),
            distance_to_block_b=int(data.get("distance_to_block_b", 120)),
            distance_to_block_c=int(data.get("distance_to_block_c", 150)),
            distance_to_block_d=int(data.get("distance_to_block_d", 140)),
            is_accessible=bool(data.get("is_accessible", False)),
            is_available=is_avail,
            status=status,
            assigned_vehicle_id=None,
        )
        session.add(slot)
        session.commit()
        return jsonify({"message": "Parking slot created successfully", "slot": slot.to_dict()}), 201
    finally:
        session.close()


@slots_bp.route("/api/parking-slots/<slot_id>", methods=["PUT"])
def update_parking_slot(slot_id):
    data = request.get_json(silent=True) or {}
    session = SessionLocal()
    try:
        slot = session.get(ParkingSlot, slot_id)
        if slot is None:
            return jsonify({"error": f"Parking slot {slot_id} not found"}), 404

        if "zone" in data:
            slot.zone = str(data["zone"]).strip()
        if "slot_type" in data:
            if data["slot_type"] not in VALID_SLOT_TYPES:
                return jsonify({"error": "Invalid slot_type"}), 400
            slot.slot_type = data["slot_type"]

        for field in ("distance_to_block_a", "distance_to_block_b", "distance_to_block_c", "distance_to_block_d"):
            if field in data:
                setattr(slot, field, max(1, int(data[field])))

        if "is_accessible" in data:
            slot.is_accessible = bool(data["is_accessible"])

        # Handle status / availability updates consistently
        if "status" in data or "is_available" in data:
            new_status = str(data.get("status", slot.status)).strip()
            if new_status not in VALID_SLOT_STATUSES:
                return jsonify({"error": "Invalid slot status"}), 400

            if "status" in data and "is_available" not in data:
                new_is_avail = new_status == "Available"
            elif "is_available" in data and "status" not in data:
                new_is_avail = bool(data["is_available"])
                new_status = "Available" if new_is_avail else ("Occupied" if slot.assigned_vehicle_id else "Unavailable")
            else:
                new_is_avail = bool(data["is_available"])
                if new_status == "Available":
                    new_is_avail = True
                elif new_status in ("Occupied", "Unavailable"):
                    new_is_avail = False

            # Release any assigned vehicle if slot is manually freed or put under maintenance
            if slot.assigned_vehicle_id and new_status != "Occupied":
                veh = session.get(Vehicle, slot.assigned_vehicle_id)
                if veh:
                    veh.parking_status = "Waiting" if new_status == "Unavailable" else "Departed"
                    veh.assigned_slot_id = None
                for alloc in (
                    session.query(AllocationHistory)
                    .filter(
                        AllocationHistory.slot_id == slot_id,
                        AllocationHistory.allocation_status == "Active",
                    )
                    .all()
                ):
                    alloc.allocation_status = "Completed"
                slot.assigned_vehicle_id = None

            slot.status = new_status
            slot.is_available = new_is_avail

        session.commit()
        return jsonify({"message": "Parking slot updated successfully", "slot": slot.to_dict()})
    finally:
        session.close()


@slots_bp.route("/api/parking-slots/<slot_id>", methods=["DELETE"])
def delete_parking_slot(slot_id):
    session = SessionLocal()
    try:
        slot = session.get(ParkingSlot, slot_id)
        if slot is None:
            return jsonify({"error": f"Parking slot {slot_id} not found"}), 404

        if slot.assigned_vehicle_id:
            veh = session.get(Vehicle, slot.assigned_vehicle_id)
            if veh:
                veh.parking_status = "Waiting"
                veh.assigned_slot_id = None

        session.delete(slot)
        session.commit()
        return jsonify({"message": f"Parking slot {slot_id} deleted successfully"})
    finally:
        session.close()

