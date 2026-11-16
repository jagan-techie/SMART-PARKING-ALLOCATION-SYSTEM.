"""Constraint validation rules for the Smart College Parking Assignment Problem."""

from typing import Any, Dict, Iterable, List, Optional, Tuple
from config import DEFAULT_COMPATIBILITY_RULES, DEFAULT_ZONE_RULES


def _val(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    return bool(value)


def check_vehicle_slot_feasibility(
    vehicle: Any,
    slot: Any,
    compatibility_rules: Optional[Dict[str, List[str]]] = None,
    zone_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    check_availability: bool = True,
) -> Tuple[bool, str]:
    """
    Verify all hard operational constraints between a vehicle and a parking slot:
      1. Slot availability constraint (unavailable/occupied slots cannot be assigned).
      2. Vehicle-slot type compatibility.
      3. Bidirectional accessibility eligibility.
      4. Hard parking zone restrictions (if configured).
    """
    compat = compatibility_rules if compatibility_rules is not None else DEFAULT_COMPATIBILITY_RULES
    zones = zone_rules if zone_rules is not None else DEFAULT_ZONE_RULES

    if check_availability:
        is_avail = _as_bool(_val(slot, "is_available", False))
        slot_status = _val(slot, "status", None)
        if not is_avail or (slot_status is not None and slot_status != "Available"):
            return False, "Slot is unavailable or already occupied"

    v_type = _val(vehicle, "vehicle_type")
    s_type = _val(slot, "slot_type")
    allowed_slot_types = compat.get(v_type, [v_type])
    if s_type not in allowed_slot_types:
        return False, f"Incompatible slot type '{s_type}' for vehicle type '{v_type}'"

    v_accessible = _as_bool(_val(vehicle, "requires_accessible", False))
    s_accessible = _as_bool(_val(slot, "is_accessible", False))
    if v_accessible and not s_accessible:
        return False, "Accessible vehicle requires an accessible parking slot"
    if s_accessible and not v_accessible:
        return False, "Accessible parking slot is reserved only for eligible vehicles"

    zone_name = _val(slot, "zone")
    user_type = _val(vehicle, "user_type")
    restricted = zones.get(zone_name, {}).get("restricted_users", [])
    if user_type in restricted:
        return False, f"User type '{user_type}' is restricted from {zone_name}"

    return True, "Feasible"


def validate_solution(
    assignments: Iterable[Dict[str, Any]],
    vehicles_by_id: Dict[str, Any],
    slots_by_id: Dict[str, Any],
    compatibility_rules: Optional[Dict[str, List[str]]] = None,
    zone_rules: Optional[Dict[str, Dict[str, Any]]] = None,
    check_availability: bool = True,
) -> Tuple[bool, List[str]]:
    """
    Validate an assignment solution against all Assignment Problem constraints.
    Returns (is_valid, list_of_violations).
    """
    violations: List[str] = []
    seen_vehicles = set()
    seen_slots = set()

    for item in assignments:
        v_id = item.get("vehicle_id")
        s_id = item.get("slot_id")
        if not v_id or not s_id:
            continue

        if v_id in seen_vehicles:
            violations.append(f"Vehicle {v_id} assigned to more than one slot")
        seen_vehicles.add(v_id)

        if s_id in seen_slots:
            violations.append(f"Slot {s_id} assigned to more than one vehicle")
        seen_slots.add(s_id)

        vehicle = vehicles_by_id.get(v_id)
        slot = slots_by_id.get(s_id)
        if vehicle is None:
            violations.append(f"Unknown vehicle {v_id}")
            continue
        if slot is None:
            violations.append(f"Unknown slot {s_id}")
            continue

        feasible, reason = check_vehicle_slot_feasibility(
            vehicle,
            slot,
            compatibility_rules=compatibility_rules,
            zone_rules=zone_rules,
            check_availability=check_availability,
        )
        if not feasible:
            violations.append(f"Infeasible assignment ({v_id} -> {s_id}): {reason}")

    return len(violations) == 0, violations

