"""Hungarian Algorithm Assignment Solver and Valid Feasible Baseline."""

from typing import Any, Dict, List, Optional
import numpy as np
from scipy.optimize import linear_sum_assignment

from config import (
    DEFAULT_PRIORITY_RULES,
    DEFAULT_SEED,
    DUMMY_BASE_PENALTY,
    PROHIBITED_COST,
)
from .constraints import _as_bool, _val, validate_solution
from .cost_matrix import build_cost_matrix, compute_pair_cost, get_walking_distance


def _dummy_unassigned_penalty(
    vehicle: Any,
    priority_rules: Optional[Dict[str, Dict[str, Any]]] = None,
) -> float:
    """
    Penalty for leaving a vehicle unassigned (assigned to a dummy slot).
    Always larger than any feasible real slot cost, and scaled by user priority
    and accessibility need so higher-priority vehicles are served first when
    capacity is constrained.
    """
    p_rules = priority_rules if priority_rules is not None else DEFAULT_PRIORITY_RULES
    user_type = str(_val(vehicle, "user_type", "Student"))
    boost = float(p_rules.get(user_type, {}).get("unassigned_penalty_boost", 500.0))
    accessible_boost = 5000.0 if _as_bool(_val(vehicle, "requires_accessible", False)) else 0.0
    return DUMMY_BASE_PENALTY + boost + accessible_boost


def run_random_feasible_baseline(
    vehicles: List[Any],
    slots: List[Any],
    weights: Optional[Dict[str, float]] = None,
    priority_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    compatibility_rules: Optional[Dict[str, List[str]]] = None,
    zone_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    cost_data: Optional[Dict[str, Any]] = None,
    seed: int = DEFAULT_SEED,
) -> Dict[str, Any]:
    """
    Generate a valid random feasible allocation using the exact same vehicles,
    slots, cost matrix, and hard compatibility/accessibility constraints.
    """
    if not vehicles or not slots:
        return {
            "assigned_count": 0,
            "unassigned_count": len(vehicles),
            "total_cost": 0.0,
            "average_cost": 0.0,
            "assignments": [],
        }

    if cost_data is None:
        cost_data = build_cost_matrix(
            vehicles,
            slots,
            weights=weights,
            priority_rules=priority_rules,
            compatibility_rules=compatibility_rules,
            zone_rules=zone_rules,
            check_availability=True,
        )

    matrix = cost_data["matrix"]
    feasible_mask = cost_data["feasible_mask"]

    rng = np.random.default_rng(seed)
    vehicle_indices = np.arange(len(vehicles))
    rng.shuffle(vehicle_indices)

    used_slots = set()
    assignments = []
    total_cost = 0.0

    for i in vehicle_indices:
        feasible_slot_indices = [
            j for j in range(len(slots))
            if feasible_mask[i, j] and j not in used_slots
        ]
        if not feasible_slot_indices:
            continue

        chosen_j = int(rng.choice(feasible_slot_indices))
        used_slots.add(chosen_j)
        pair_cost = float(matrix[i, chosen_j])
        total_cost += pair_cost
        assignments.append({
            "vehicle_id": _val(vehicles[i], "vehicle_id"),
            "slot_id": _val(slots[chosen_j], "slot_id"),
            "allocation_cost": round(pair_cost, 2),
        })

    assigned_count = len(assignments)
    return {
        "assigned_count": assigned_count,
        "unassigned_count": len(vehicles) - assigned_count,
        "total_cost": round(total_cost, 2),
        "average_cost": round(total_cost / assigned_count, 2) if assigned_count > 0 else 0.0,
        "assignments": assignments,
    }


def run_hungarian_optimization(
    vehicles: List[Any],
    slots: List[Any],
    weights: Optional[Dict[str, float]] = None,
    priority_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    compatibility_rules: Optional[Dict[str, List[str]]] = None,
    zone_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    seed: int = DEFAULT_SEED,
) -> Dict[str, Any]:
    """
    Solve the College Parking Assignment Problem using SciPy's linear_sum_assignment
    (Hungarian Algorithm) with dummy-slot augmentation for rectangular / constrained
    feasibility handling.
    """
    m = len(vehicles)
    n = len(slots)

    if m == 0 or n == 0:
        unassigned = [
            {
                "vehicle_id": _val(v, "vehicle_id"),
                "registration_number": _val(v, "registration_number"),
                "vehicle_type": _val(v, "vehicle_type"),
                "user_type": _val(v, "user_type"),
                "destination_block": _val(v, "destination_block"),
                "requires_accessible": _as_bool(_val(v, "requires_accessible", False)),
                "reason": "No available parking slots" if n == 0 else "No vehicles requesting parking",
            }
            for v in vehicles
        ]
        return {
            "success": True,
            "assignments": [],
            "unassigned_vehicles": unassigned,
            "summary": {
                "total_vehicles": m,
                "total_available_slots": n,
                "assigned_count": 0,
                "unassigned_count": m,
                "total_allocation_cost": 0.0,
                "average_allocation_cost": 0.0,
                "utilization_percentage": 0.0,
            },
            "baseline_comparison": {
                "baseline_assigned_count": 0,
                "baseline_unassigned_count": m,
                "baseline_total_cost": 0.0,
                "baseline_average_cost": 0.0,
                "total_cost_difference": 0.0,
                "average_cost_savings": 0.0,
                "average_cost_reduction_pct": 0.0,
                "additional_vehicles_assigned": 0,
                "comparison_note": "No vehicles or available slots to compare.",
            },
            "cost_matrix": {
                "vehicle_ids": [_val(v, "vehicle_id") for v in vehicles],
                "slot_ids": [_val(s, "slot_id") for s in slots],
                "display_matrix": [],
            },
            "constraints_validated": True,
            "validation_errors": [],
        }

    cost_data = build_cost_matrix(
        vehicles,
        slots,
        weights=weights,
        priority_rules=priority_rules,
        compatibility_rules=compatibility_rules,
        zone_rules=zone_rules,
        check_availability=True,
    )
    real_matrix = cost_data["matrix"]
    feasible_mask = cost_data["feasible_mask"]

    # Augment m x n real cost matrix with m dummy columns (one per vehicle)
    # so every vehicle has a valid fallback dummy slot if no feasible real slot is free.
    augmented = np.full((m, n + m), PROHIBITED_COST, dtype=np.float64)
    augmented[:, :n] = real_matrix
    for i, vehicle in enumerate(vehicles):
        augmented[i, n + i] = _dummy_unassigned_penalty(vehicle, priority_rules=priority_rules)

    row_ind, col_ind = linear_sum_assignment(augmented)

    assignments: List[Dict[str, Any]] = []
    unassigned_vehicles: List[Dict[str, Any]] = []
    total_cost = 0.0

    for r, c in zip(row_ind, col_ind):
        vehicle = vehicles[r]
        if c < n and feasible_mask[r, c] and real_matrix[r, c] < PROHIBITED_COST:
            slot = slots[c]
            pair_cost, breakdown = compute_pair_cost(
                vehicle,
                slot,
                weights=weights,
                priority_rules=priority_rules,
                compatibility_rules=compatibility_rules,
                zone_rules=zone_rules,
                check_availability=True,
            )
            total_cost += pair_cost
            assignments.append({
                "vehicle_id": _val(vehicle, "vehicle_id"),
                "registration_number": _val(vehicle, "registration_number"),
                "vehicle_type": _val(vehicle, "vehicle_type"),
                "user_type": _val(vehicle, "user_type"),
                "destination_block": _val(vehicle, "destination_block"),
                "priority_level": _val(vehicle, "priority_level"),
                "requires_accessible": _as_bool(_val(vehicle, "requires_accessible", False)),
                "slot_id": _val(slot, "slot_id"),
                "zone": _val(slot, "zone"),
                "slot_type": _val(slot, "slot_type"),
                "is_accessible": _as_bool(_val(slot, "is_accessible", False)),
                "walking_distance": round(get_walking_distance(vehicle, slot), 2),
                "allocation_cost": round(pair_cost, 2),
                "cost_breakdown": breakdown,
            })
        else:
            has_any_feasible = bool(np.any(feasible_mask[r]))
            if not has_any_feasible:
                if _as_bool(_val(vehicle, "requires_accessible", False)):
                    reason = "No compatible accessible parking slot available"
                else:
                    reason = "No compatible available parking slot meets vehicle constraints"
            else:
                reason = "All compatible slots allocated to higher-priority or lower-cost vehicles"

            unassigned_vehicles.append({
                "vehicle_id": _val(vehicle, "vehicle_id"),
                "registration_number": _val(vehicle, "registration_number"),
                "vehicle_type": _val(vehicle, "vehicle_type"),
                "user_type": _val(vehicle, "user_type"),
                "destination_block": _val(vehicle, "destination_block"),
                "priority_level": _val(vehicle, "priority_level"),
                "requires_accessible": _as_bool(_val(vehicle, "requires_accessible", False)),
                "reason": reason,
            })

    vehicles_by_id = {_val(v, "vehicle_id"): v for v in vehicles}
    slots_by_id = {_val(s, "slot_id"): s for s in slots}
    is_valid, violations = validate_solution(
        assignments,
        vehicles_by_id,
        slots_by_id,
        compatibility_rules=compatibility_rules,
        zone_rules=zone_rules,
        check_availability=True,
    )

    assigned_count = len(assignments)
    unassigned_count = len(unassigned_vehicles)
    avg_cost = round(total_cost / assigned_count, 2) if assigned_count > 0 else 0.0
    utilization_pct = round((assigned_count / n) * 100.0, 2) if n > 0 else 0.0

    # Valid feasible random baseline comparison
    baseline = run_random_feasible_baseline(
        vehicles,
        slots,
        weights=weights,
        priority_rules=priority_rules,
        compatibility_rules=compatibility_rules,
        zone_rules=zone_rules,
        cost_data=cost_data,
        seed=seed,
    )

    avg_savings = round(baseline["average_cost"] - avg_cost, 2)
    avg_reduction_pct = (
        round((avg_savings / baseline["average_cost"]) * 100.0, 2)
        if baseline["average_cost"] > 0
        else 0.0
    )
    additional_assigned = assigned_count - baseline["assigned_count"]

    if additional_assigned > 0:
        note = (
            f"Hungarian Algorithm accommodated {additional_assigned} more vehicle(s) "
            f"and reduced average cost per assigned vehicle by {avg_reduction_pct:.1f}%."
        )
    elif assigned_count == baseline["assigned_count"]:
        note = (
            f"Both matched {assigned_count} vehicle(s); Hungarian achieved optimal total cost "
            f"{round(total_cost, 2)} vs random feasible baseline {baseline['total_cost']}."
        )
    else:
        note = "Comparison based on valid feasible allocations under identical constraints."

    return {
        "success": is_valid,
        "assignments": assignments,
        "unassigned_vehicles": unassigned_vehicles,
        "summary": {
            "total_vehicles": m,
            "total_available_slots": n,
            "assigned_count": assigned_count,
            "unassigned_count": unassigned_count,
            "total_allocation_cost": round(total_cost, 2),
            "average_allocation_cost": avg_cost,
            "utilization_percentage": utilization_pct,
        },
        "baseline_comparison": {
            "baseline_assigned_count": baseline["assigned_count"],
            "baseline_unassigned_count": baseline["unassigned_count"],
            "baseline_total_cost": baseline["total_cost"],
            "baseline_average_cost": baseline["average_cost"],
            "total_cost_difference": round(baseline["total_cost"] - total_cost, 2),
            "average_cost_savings": avg_savings,
            "average_cost_reduction_pct": avg_reduction_pct,
            "additional_vehicles_assigned": additional_assigned,
            "comparison_note": note,
        },
        "cost_matrix": {
            "vehicle_ids": cost_data["vehicle_ids"],
            "slot_ids": cost_data["slot_ids"],
            "display_matrix": cost_data["display_matrix"],
        },
        "constraints_validated": is_valid,
        "validation_errors": violations,
    }

