"""Cost matrix generation for the Smart College Parking Assignment Problem."""

from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from config import (
    DEFAULT_COMPATIBILITY_RULES,
    DEFAULT_PRIORITY_RULES,
    DEFAULT_WEIGHTS,
    DEFAULT_ZONE_RULES,
    PROHIBITED_COST,
)
from .constraints import _as_bool, _val, check_vehicle_slot_feasibility


def get_walking_distance(vehicle: Any, slot: Any) -> float:
    """Return walking distance (in meters) from slot to the vehicle's destination block."""
    block = str(_val(vehicle, "destination_block", "A")).strip().lower()
    field_map = {
        "a": "distance_to_block_a",
        "b": "distance_to_block_b",
        "c": "distance_to_block_c",
        "d": "distance_to_block_d",
    }
    field_name = field_map.get(block, "distance_to_block_a")
    return float(_val(slot, field_name, 200.0))


def compute_pair_cost(
    vehicle: Any,
    slot: Any,
    weights: Optional[Dict[str, float]] = None,
    priority_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    compatibility_rules: Optional[Dict[str, List[str]]] = None,
    zone_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    check_availability: bool = True,
) -> Tuple[float, Dict[str, Any]]:
    """
    Calculate the assignment cost c_ij for assigning vehicle i to slot j.

    Cost(i, j) =
        (distance_weight * walking_distance)
        + (priority_weight * priority_penalty)
        + (zone_weight * zone_penalty)

    Incompatible/infeasible pairs return PROHIBITED_COST.
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    p_rules = priority_rules if priority_rules is not None else DEFAULT_PRIORITY_RULES
    z_rules = zone_rules if zone_rules is not None else DEFAULT_ZONE_RULES

    feasible, reason = check_vehicle_slot_feasibility(
        vehicle,
        slot,
        compatibility_rules=compatibility_rules,
        zone_rules=z_rules,
        check_availability=check_availability,
    )
    if not feasible:
        return PROHIBITED_COST, {
            "feasible": False,
            "reason": reason,
            "walking_distance": None,
            "priority_penalty": None,
            "zone_penalty": None,
            "total_cost": None,
        }

    walking_distance = get_walking_distance(vehicle, slot)

    user_type = str(_val(vehicle, "user_type", "Student"))
    user_priority = p_rules.get(user_type, p_rules.get("Student", {"urgency": 0.5}))
    urgency = float(user_priority.get("urgency", 0.5))
    if _as_bool(_val(vehicle, "requires_accessible", False)):
        urgency += 1.0

    # Interaction with normalized distance ensures high-priority users receive closer slots
    priority_penalty = urgency * (walking_distance / 100.0)

    zone_name = str(_val(slot, "zone", "Zone B"))
    zone_penalties = z_rules.get(zone_name, {}).get("penalties", {})
    zone_penalty = float(zone_penalties.get(user_type, 1.0))

    # Mild preference for exact dedicated slot type over shared Two-Wheeler slot
    if _val(vehicle, "vehicle_type") != _val(slot, "slot_type"):
        zone_penalty += 0.5

    total_cost = (
        float(w["distance_weight"]) * walking_distance
        + float(w["priority_weight"]) * priority_penalty
        + float(w["zone_weight"]) * zone_penalty
    )
    total_cost = round(total_cost, 2)

    return total_cost, {
        "feasible": True,
        "reason": "Feasible",
        "walking_distance": round(walking_distance, 2),
        "priority_penalty": round(priority_penalty, 2),
        "zone_penalty": round(zone_penalty, 2),
        "total_cost": total_cost,
    }


def build_cost_matrix(
    vehicles: List[Any],
    slots: List[Any],
    weights: Optional[Dict[str, float]] = None,
    priority_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    compatibility_rules: Optional[Dict[str, List[str]]] = None,
    zone_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    check_availability: bool = True,
) -> Dict[str, Any]:
    """
    Build the m x n assignment cost matrix and feasibility mask.

    Returns a dictionary containing:
      - matrix: np.ndarray of shape (m, n), PROHIBITED_COST where infeasible
      - feasible_mask: np.ndarray of shape (m, n) bool
      - display_matrix: 2D list with float costs or None for infeasible pairs
      - vehicle_ids: list of vehicle_id
      - slot_ids: list of slot_id
    """
    m = len(vehicles)
    n = len(slots)
    matrix = np.full((m, n), PROHIBITED_COST, dtype=np.float64)
    feasible_mask = np.zeros((m, n), dtype=bool)
    display_matrix: List[List[Optional[float]]] = []

    for i, vehicle in enumerate(vehicles):
        row_display: List[Optional[float]] = []
        for j, slot in enumerate(slots):
            cost, meta = compute_pair_cost(
                vehicle,
                slot,
                weights=weights,
                priority_rules=priority_rules,
                compatibility_rules=compatibility_rules,
                zone_rules=zone_rules,
                check_availability=check_availability,
            )
            if meta["feasible"]:
                matrix[i, j] = cost
                feasible_mask[i, j] = True
                row_display.append(cost)
            else:
                row_display.append(None)
        display_matrix.append(row_display)

    return {
        "matrix": matrix,
        "feasible_mask": feasible_mask,
        "display_matrix": display_matrix,
        "vehicle_ids": [_val(v, "vehicle_id") for v in vehicles],
        "slot_ids": [_val(s, "slot_id") for s in slots],
    }

