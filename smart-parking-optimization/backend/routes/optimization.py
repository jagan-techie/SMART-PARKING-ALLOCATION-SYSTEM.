"""Optimization Engine REST API endpoints."""

from datetime import datetime
import json
from typing import Any, Dict, List
from flask import Blueprint, jsonify, request

from config import DEFAULT_SEED
from models import (
    AllocationHistory,
    OptimizationRun,
    ParkingSlot,
    SessionLocal,
    Vehicle,
    get_system_config,
)
from optimization.assignment_solver import run_hungarian_optimization
from optimization.cost_matrix import build_cost_matrix

optimization_bp = Blueprint("optimization", __name__)


def _next_run_id(session) -> str:
    existing = [r.run_id for r in session.query(OptimizationRun.run_id).all()]
    max_num = 0
    for rid in existing:
        if rid.startswith("RUN-"):
            try:
                max_num = max(max_num, int(rid.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return f"RUN-{max_num + 1:04d}"


def _next_alloc_num(session) -> int:
    existing = [a.allocation_id for a in session.query(AllocationHistory.allocation_id).all()]
    max_num = 0
    for aid in existing:
        if aid.startswith("ALC-"):
            try:
                max_num = max(max_num, int(aid.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return max_num + 1


def _load_target_vehicles_and_slots(session, data: Dict[str, Any]):
    req_vehicle_ids = data.get("vehicle_ids")
    req_slot_ids = data.get("slot_ids")

    if req_vehicle_ids is not None:
        if len(req_vehicle_ids) == 0:
            vehicles = []
        else:
            vehicles = (
                session.query(Vehicle)
                .filter(
                    Vehicle.vehicle_id.in_(req_vehicle_ids),
                    Vehicle.parking_status == "Waiting",
                )
                .order_by(Vehicle.vehicle_id.asc())
                .all()
            )
    else:
        vehicles = (
            session.query(Vehicle)
            .filter(Vehicle.parking_status == "Waiting")
            .order_by(Vehicle.vehicle_id.asc())
            .all()
        )

    if req_slot_ids is not None:
        if len(req_slot_ids) == 0:
            slots = []
        else:
            # Never allow occupied or unavailable slots to be assigned
            slots = (
                session.query(ParkingSlot)
                .filter(
                    ParkingSlot.slot_id.in_(req_slot_ids),
                    ParkingSlot.is_available == True,
                    ParkingSlot.status == "Available",
                )
                .order_by(ParkingSlot.slot_id.asc())
                .all()
            )
    else:
        slots = (
            session.query(ParkingSlot)
            .filter(ParkingSlot.is_available == True, ParkingSlot.status == "Available")
            .order_by(ParkingSlot.slot_id.asc())
            .all()
        )

    return vehicles, slots


def _persist_optimization_run(
    session,
    result: Dict[str, Any],
    weights: Dict[str, float],
    apply_to_db: bool = True,
) -> str:
    now = datetime.now()
    run_id = _next_run_id(session)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")

    if apply_to_db and result["assignments"]:
        next_alc = _next_alloc_num(session)
        for item in result["assignments"]:
            v_id = item["vehicle_id"]
            s_id = item["slot_id"]
            vehicle = session.get(Vehicle, v_id)
            slot = session.get(ParkingSlot, s_id)

            if vehicle is None or slot is None:
                continue
            if not slot.is_available or slot.status != "Available":
                raise ValueError(f"Slot {s_id} is no longer available")
            if vehicle.parking_status == "Assigned":
                raise ValueError(f"Vehicle {v_id} is already assigned")

            slot.is_available = False
            slot.status = "Occupied"
            slot.assigned_vehicle_id = v_id

            vehicle.parking_status = "Assigned"
            vehicle.assigned_slot_id = s_id

            session.add(
                AllocationHistory(
                    allocation_id=f"ALC-{next_alc:04d}",
                    vehicle_id=v_id,
                    slot_id=s_id,
                    allocation_date=date_str,
                    allocation_time=time_str,
                    allocation_cost=float(item["allocation_cost"]),
                    allocation_status="Active",
                    run_id=run_id,
                )
            )
            next_alc += 1

    summary = result["summary"]
    baseline = result["baseline_comparison"]

    # Trim full cost_matrix when storing in OptimizationRun to keep SQLite compact
    compact_result = {
        "assignments": result["assignments"],
        "unassigned_vehicles": result["unassigned_vehicles"],
        "summary": summary,
        "baseline_comparison": baseline,
        "constraints_validated": result["constraints_validated"],
    }

    run_record = OptimizationRun(
        run_id=run_id,
        created_at=now.isoformat(timespec="seconds"),
        total_vehicles=summary["total_vehicles"],
        total_available_slots=summary["total_available_slots"],
        assigned_count=summary["assigned_count"],
        unassigned_count=summary["unassigned_count"],
        total_allocation_cost=summary["total_allocation_cost"],
        average_allocation_cost=summary["average_allocation_cost"],
        utilization_percentage=summary["utilization_percentage"],
        baseline_assigned_count=baseline["baseline_assigned_count"],
        baseline_total_cost=baseline["baseline_total_cost"],
        baseline_average_cost=baseline["baseline_average_cost"],
        weights_json=json.dumps(weights),
        result_json=json.dumps(compact_result),
    )
    session.add(run_record)
    session.commit()
    return run_id


@optimization_bp.route("/api/optimization/generate-matrix", methods=["POST"])
def generate_matrix():
    data = request.get_json(silent=True) or {}
    session = SessionLocal()
    try:
        cfg = get_system_config(session)
        weights = {**cfg["weights"], **(data.get("weights") or {})}
        vehicles, slots = _load_target_vehicles_and_slots(session, data)

        matrix_data = build_cost_matrix(
            vehicles,
            slots,
            weights=weights,
            priority_rules=cfg["priority_rules"],
            compatibility_rules=cfg["compatibility_rules"],
            zone_rules=cfg["zone_rules"],
            check_availability=True,
        )

        feasible_pairs = int(matrix_data["feasible_mask"].sum())
        total_pairs = len(vehicles) * len(slots)

        return jsonify(
            {
                "vehicle_ids": matrix_data["vehicle_ids"],
                "slot_ids": matrix_data["slot_ids"],
                "vehicles": [v.to_dict() for v in vehicles],
                "slots": [s.to_dict() for s in slots],
                "display_matrix": matrix_data["display_matrix"],
                "feasible_pairs": feasible_pairs,
                "total_pairs": total_pairs,
                "weights": weights,
            }
        )
    finally:
        session.close()


@optimization_bp.route("/api/optimization/run", methods=["POST"])
def run_optimization():
    data = request.get_json(silent=True) or {}
    session = SessionLocal()
    try:
        cfg = get_system_config(session)
        weights = {**cfg["weights"], **(data.get("weights") or {})}
        apply_allocation = bool(data.get("apply_allocation", True))
        seed = int(data.get("seed", DEFAULT_SEED))

        vehicles, slots = _load_target_vehicles_and_slots(session, data)
        result = run_hungarian_optimization(
            vehicles,
            slots,
            weights=weights,
            priority_rules=cfg["priority_rules"],
            compatibility_rules=cfg["compatibility_rules"],
            zone_rules=cfg["zone_rules"],
            seed=seed,
        )

        run_id = None
        if apply_allocation:
            run_id = _persist_optimization_run(session, result, weights, apply_to_db=True)

        return jsonify(
            {
                **result,
                "run_id": run_id,
                "applied": apply_allocation,
                "weights": weights,
            }
        )
    except ValueError as exc:
        session.rollback()
        return jsonify({"error": str(exc)}), 409
    finally:
        session.close()


@optimization_bp.route("/api/optimization/save", methods=["POST"])
def save_optimization():
    """Commit a previewed optimization result and update slot availability & history."""
    data = request.get_json(silent=True) or {}
    assignments = data.get("assignments")
    if assignments is None:
        return jsonify({"error": "assignments payload is required"}), 400

    session = SessionLocal()
    try:
        cfg = get_system_config(session)
        weights = {**cfg["weights"], **(data.get("weights") or {})}

        result_payload = {
            "assignments": assignments,
            "unassigned_vehicles": data.get("unassigned_vehicles", []),
            "summary": data.get("summary", {}),
            "baseline_comparison": data.get("baseline_comparison", {}),
            "constraints_validated": bool(data.get("constraints_validated", True)),
        }
        run_id = _persist_optimization_run(session, result_payload, weights, apply_to_db=True)
        return jsonify({"message": "Allocation saved and applied successfully", "run_id": run_id}), 201
    except ValueError as exc:
        session.rollback()
        return jsonify({"error": str(exc)}), 409
    finally:
        session.close()


@optimization_bp.route("/api/optimization/results", methods=["GET"])
def get_latest_results():
    session = SessionLocal()
    try:
        latest = (
            session.query(OptimizationRun)
            .order_by(OptimizationRun.created_at.desc())
            .first()
        )
        if latest is None:
            return jsonify({"has_results": False, "latest_run": None})
        return jsonify({"has_results": True, "latest_run": latest.to_dict(include_details=True)})
    finally:
        session.close()


@optimization_bp.route("/api/optimization/history", methods=["GET"])
def get_optimization_history():
    session = SessionLocal()
    try:
        runs = (
            session.query(OptimizationRun)
            .order_by(OptimizationRun.created_at.desc())
            .limit(50)
            .all()
        )
        recent_allocations = (
            session.query(AllocationHistory)
            .order_by(AllocationHistory.allocation_date.desc(), AllocationHistory.allocation_time.desc())
            .limit(100)
            .all()
        )
        return jsonify(
            {
                "optimization_runs": [r.to_dict(include_details=False) for r in runs],
                "allocations": [a.to_dict() for a in recent_allocations],
            }
        )
    finally:
        session.close()

