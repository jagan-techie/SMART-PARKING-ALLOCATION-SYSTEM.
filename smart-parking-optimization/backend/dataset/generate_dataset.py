"""Synthetic Dataset Generator for Smart College Parking Space Allocation Optimization System.

Generates reproducible, internally consistent datasets using a fixed random seed:
  - vehicles.csv (200 records)
  - parking_slots.csv (220 records)
  - allocation_history.csv (1000 records)
  - parking_demand.csv (500 records)
  - vehicle_slot_cost_matrix.csv (200 x 220 cost matrix)
"""

import os
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import numpy as np
import pandas as pd

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from config import (
    DATA_DIR,
    DEFAULT_COMPATIBILITY_RULES,
    DEFAULT_PRIORITY_RULES,
    DEFAULT_SEED,
    DEFAULT_WEIGHTS,
    DEFAULT_ZONE_RULES,
)
from optimization.constraints import check_vehicle_slot_feasibility
from optimization.cost_matrix import compute_pair_cost


# Campus block coordinates (meters on campus grid)
BLOCK_COORDS = {
    "A": (60.0, 90.0),
    "B": (185.0, 90.0),
    "C": (315.0, 95.0),
    "D": (185.0, 225.0),
}

# Zone layout configuration totaling 220 parking slots
ZONE_SPECS = [
    {
        "zone": "Zone A",
        "center": (50.0, 65.0),
        "count": 55,
        "type_weights": [("Car", 35), ("Bike", 10), ("Scooter", 10)],
        "accessible_count": 8,
    },
    {
        "zone": "Zone B",
        "center": (185.0, 125.0),
        "count": 55,
        "type_weights": [("Car", 25), ("Bike", 15), ("Scooter", 10), ("Two-Wheeler", 5)],
        "accessible_count": 6,
    },
    {
        "zone": "Zone C",
        "center": (325.0, 85.0),
        "count": 50,
        "type_weights": [("Car", 28), ("Bike", 10), ("Scooter", 8), ("Two-Wheeler", 4)],
        "accessible_count": 6,
    },
    {
        "zone": "Zone D",
        "center": (175.0, 260.0),
        "count": 60,
        "type_weights": [("Car", 6), ("Bike", 20), ("Scooter", 14), ("Two-Wheeler", 20)],
        "accessible_count": 4,
    },
]

STATE_CODES = ["KA", "MH", "TN", "DL", "TS"]


def _format_minutes_hhmm(minutes: int) -> str:
    minutes = max(0, min(23 * 60 + 59, minutes))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _generate_registration(rng: np.random.Generator, existing: set) -> str:
    while True:
        state = STATE_CODES[int(rng.integers(0, len(STATE_CODES)))]
        district = int(rng.integers(1, 30))
        letters = "".join(chr(int(rng.integers(65, 91))) for _ in range(2))
        number = int(rng.integers(1000, 9999))
        reg = f"{state}-{district:02d}-{letters}-{number}"
        if reg not in existing:
            existing.add(reg)
            return reg


def generate_parking_slots(rng: np.random.Generator) -> pd.DataFrame:
    """Generate 220 realistic college parking slots across 4 campus zones."""
    records = []
    slot_num = 1

    for spec in ZONE_SPECS:
        zone = spec["zone"]
        cx, cy = spec["center"]
        slot_types: List[str] = []
        for stype, cnt in spec["type_weights"]:
            slot_types.extend([stype] * cnt)
        rng.shuffle(slot_types)

        # Mark accessible slots preferentially among Car and Two-Wheeler slots
        car_indices = [idx for idx, st in enumerate(slot_types) if st == "Car"]
        other_indices = [idx for idx, st in enumerate(slot_types) if st != "Car"]
        rng.shuffle(car_indices)
        rng.shuffle(other_indices)
        accessible_pool = car_indices + other_indices
        accessible_indices = set(accessible_pool[: spec["accessible_count"]])

        for idx, stype in enumerate(slot_types):
            # Spread slots within a ~35m radius of zone center
            sx = cx + float(rng.normal(0.0, 14.0))
            sy = cy + float(rng.normal(0.0, 14.0))

            dists = {}
            for block, (bx, by) in BLOCK_COORDS.items():
                euclid = float(np.hypot(sx - bx, sy - by))
                walkway_overhead = float(rng.uniform(8.0, 24.0))
                dists[block] = int(round(max(20.0, euclid + walkway_overhead)))

            records.append(
                {
                    "slot_id": f"SLT-{slot_num:03d}",
                    "zone": zone,
                    "slot_type": stype,
                    "distance_to_block_a": dists["A"],
                    "distance_to_block_b": dists["B"],
                    "distance_to_block_c": dists["C"],
                    "distance_to_block_d": dists["D"],
                    "is_accessible": idx in accessible_indices,
                    "is_available": True,
                }
            )
            slot_num += 1

    return pd.DataFrame(records)


def generate_vehicles(rng: np.random.Generator) -> pd.DataFrame:
    """Generate 200 realistic campus vehicles with correlated user, block, and arrival patterns."""
    user_types = ["Student", "Faculty", "Staff", "Visitor"]
    user_probs = [0.54, 0.20, 0.16, 0.10]

    # Vehicle type conditional probabilities by user type
    vtype_by_user = {
        "Student": (["Car", "Bike", "Scooter"], [0.20, 0.44, 0.36]),
        "Faculty": (["Car", "Bike", "Scooter"], [0.76, 0.14, 0.10]),
        "Staff": (["Car", "Bike", "Scooter"], [0.42, 0.34, 0.24]),
        "Visitor": (["Car", "Bike", "Scooter"], [0.72, 0.16, 0.12]),
    }

    # Block affinity by user type
    block_by_user = {
        "Student": (["A", "B", "C", "D"], [0.22, 0.30, 0.16, 0.32]),
        "Faculty": (["A", "B", "C", "D"], [0.42, 0.30, 0.18, 0.10]),
        "Staff": (["A", "B", "C", "D"], [0.20, 0.26, 0.38, 0.16]),
        "Visitor": (["A", "B", "C", "D"], [0.18, 0.18, 0.50, 0.14]),
    }

    # Realistic arrival windows (minutes since midnight)
    arrival_params = {
        "Faculty": (8 * 60 + 45, 35, 7 * 60 + 30, 11 * 60),
        "Staff": (8 * 60 + 25, 30, 7 * 60 + 15, 10 * 60 + 30),
        "Student": (9 * 60 + 15, 55, 7 * 60 + 45, 13 * 60 + 30),
        "Visitor": (11 * 60 + 30, 90, 9 * 60, 16 * 60),
    }

    existing_regs = set()
    records = []

    # Exact status distribution: 80 Assigned, 75 Waiting, 45 Departed
    statuses = ["Assigned"] * 80 + ["Waiting"] * 75 + ["Departed"] * 45
    rng.shuffle(statuses)

    for i in range(200):
        u_type = str(rng.choice(user_types, p=user_probs))
        v_choices, v_probs = vtype_by_user[u_type]
        v_type = str(rng.choice(v_choices, p=v_probs))
        b_choices, b_probs = block_by_user[u_type]
        dest_block = str(rng.choice(b_choices, p=b_probs))

        priority_level = int(DEFAULT_PRIORITY_RULES[u_type]["level"])

        # Realistic ~7% accessibility requirement overall (slightly higher for Car/Visitor/Faculty)
        acc_prob = 0.09 if v_type == "Car" else 0.04
        requires_accessible = bool(rng.random() < acc_prob)

        mean_arr, std_arr, min_arr, max_arr = arrival_params[u_type]
        arr_min = int(np.clip(rng.normal(mean_arr, std_arr), min_arr, max_arr))
        duration = int(rng.integers(120, 480)) if u_type != "Visitor" else int(rng.integers(60, 240))
        dep_min = min(21 * 60 + 30, arr_min + duration)

        records.append(
            {
                "vehicle_id": f"VEH-{i + 1:03d}",
                "registration_number": _generate_registration(rng, existing_regs),
                "vehicle_type": v_type,
                "user_type": u_type,
                "destination_block": dest_block,
                "priority_level": priority_level,
                "requires_accessible": requires_accessible,
                "arrival_time": _format_minutes_hhmm(arr_min),
                "departure_time": _format_minutes_hhmm(dep_min),
                "parking_status": statuses[i],
            }
        )

    return pd.DataFrame(records)


def reconcile_initial_occupancy(
    rng: np.random.Generator,
    vehicles_df: pd.DataFrame,
    slots_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame, List[Tuple[str, str, float]]]:
    """
    Pair every 'Assigned' vehicle with a unique compatible & accessibility-compliant slot,
    marking those slots unavailable, plus 10 additional maintenance/unavailable slots.
    Returns updated (vehicles_df, slots_df, active_pairs).
    """
    vehicles_df = vehicles_df.copy()
    slots_df = slots_df.copy()
    active_pairs: List[Tuple[str, str, float]] = []

    used_slots = set()
    assigned_indices = vehicles_df.index[vehicles_df["parking_status"] == "Assigned"].tolist()

    # Allocate accessible vehicles first so scarce accessible slots aren't misrouted
    assigned_indices.sort(
        key=lambda idx: (
            not bool(vehicles_df.loc[idx, "requires_accessible"]),
            int(vehicles_df.loc[idx, "priority_level"]),
        )
    )

    for idx in assigned_indices:
        v_row = vehicles_df.loc[idx].to_dict()
        candidates = []
        for s_idx, s_row in slots_df.iterrows():
            s_id = s_row["slot_id"]
            if s_id in used_slots:
                continue
            cost, meta = compute_pair_cost(v_row, s_row.to_dict(), check_availability=True)
            if meta["feasible"]:
                candidates.append((cost, s_idx, s_id))

        if candidates:
            # Pick among top 3 lowest-cost feasible slots for realistic slightly suboptimal baseline
            candidates.sort(key=lambda item: item[0])
            pick_range = min(3, len(candidates))
            chosen_cost, chosen_s_idx, chosen_s_id = candidates[int(rng.integers(0, pick_range))]
            used_slots.add(chosen_s_id)
            slots_df.loc[chosen_s_idx, "is_available"] = False
            active_pairs.append((v_row["vehicle_id"], chosen_s_id, float(chosen_cost)))
        else:
            # Keep consistency if no compatible slot remains
            vehicles_df.loc[idx, "parking_status"] = "Waiting"

    # Also mark 10 remaining non-accessible slots as unavailable (maintenance/reserved)
    free_non_acc = slots_df.index[
        (slots_df["is_available"] == True) & (slots_df["is_accessible"] == False)
    ].tolist()
    rng.shuffle(free_non_acc)
    for m_idx in free_non_acc[:10]:
        slots_df.loc[m_idx, "is_available"] = False

    return vehicles_df, slots_df, active_pairs


def generate_allocation_history(
    rng: np.random.Generator,
    vehicles_df: pd.DataFrame,
    slots_df: pd.DataFrame,
    active_pairs: List[Tuple[str, str, float]],
    base_date: datetime,
) -> pd.DataFrame:
    """Generate 1000 internally consistent allocation history records."""
    records = []
    veh_dicts = vehicles_df.to_dict("records")
    slot_dicts = slots_df.to_dict("records")

    # Precompute feasible slots per vehicle (ignoring current availability for historical days)
    feasible_slots_for_vehicle: Dict[str, List[Tuple[str, float]]] = {}
    for v in veh_dicts:
        pairs = []
        for s in slot_dicts:
            cost, meta = compute_pair_cost(v, s, check_availability=False)
            if meta["feasible"]:
                pairs.append((s["slot_id"], float(cost)))
        pairs.sort(key=lambda x: x[1])
        feasible_slots_for_vehicle[v["vehicle_id"]] = pairs

    # 1. Include all active pairs as today's Active allocations
    today_str = base_date.strftime("%Y-%m-%d")
    veh_lookup = {v["vehicle_id"]: v for v in veh_dicts}

    alloc_num = 1
    for v_id, s_id, cost in active_pairs:
        arr_time = veh_lookup[v_id]["arrival_time"] + ":00"
        records.append(
            {
                "allocation_id": f"ALC-{alloc_num:04d}",
                "vehicle_id": v_id,
                "slot_id": s_id,
                "allocation_date": today_str,
                "allocation_time": arr_time,
                "allocation_cost": round(cost, 2),
                "allocation_status": "Active",
            }
        )
        alloc_num += 1

    # 2. Fill remaining records up to 1000 over the past 30 days
    remaining = 1000 - len(records)
    for _ in range(remaining):
        day_offset = int(rng.integers(1, 31))
        rec_date = (base_date - timedelta(days=day_offset)).strftime("%Y-%m-%d")

        # Choose a vehicle that has feasible slots
        while True:
            v = veh_dicts[int(rng.integers(0, len(veh_dicts)))]
            options = feasible_slots_for_vehicle[v["vehicle_id"]]
            if options:
                break

        # Sample from top 35% feasible slots to reflect historical mostly-good allocations
        top_k = max(1, int(len(options) * 0.35))
        s_id, cost = options[int(rng.integers(0, top_k))]
        jitter_sec = int(rng.integers(0, 60))
        rec_time = f"{v['arrival_time']}:{jitter_sec:02d}"
        status = "Completed" if rng.random() < 0.92 else "Cancelled"

        records.append(
            {
                "allocation_id": f"ALC-{alloc_num:04d}",
                "vehicle_id": v["vehicle_id"],
                "slot_id": s_id,
                "allocation_date": rec_date,
                "allocation_time": rec_time,
                "allocation_cost": round(cost, 2),
                "allocation_status": status,
            }
        )
        alloc_num += 1

    df = pd.DataFrame(records)
    df = df.sort_values(by=["allocation_date", "allocation_time"], ascending=[False, False]).reset_index(drop=True)
    df["allocation_id"] = [f"ALC-{i + 1:04d}" for i in range(len(df))]
    return df


def generate_parking_demand(
    rng: np.random.Generator,
    total_slots: int,
    base_date: datetime,
) -> pd.DataFrame:
    """Generate 500 hourly/period parking demand records across day types and user/vehicle segments."""
    time_periods = [
        ("08:00-10:00", 1.30),
        ("10:00-12:00", 1.45),
        ("12:00-14:00", 1.15),
        ("14:00-16:00", 1.00),
        ("16:00-18:00", 0.65),
    ]
    vehicle_types = [("Car", 0.38), ("Bike", 0.36), ("Scooter", 0.26)]
    user_types = [("Student", 0.52), ("Faculty", 0.22), ("Staff", 0.16), ("Visitor", 0.10)]

    records = []
    for idx in range(500):
        day_offset = idx // 16  # spans ~32 days
        rec_date = base_date - timedelta(days=day_offset)
        weekday = rec_date.weekday()
        if weekday >= 5:
            day_type = "Weekend"
            day_mult = 0.35
        elif day_offset in (5, 12, 19):
            day_type = "Exam Day"
            day_mult = 1.25
        elif day_offset in (9, 23):
            day_type = "Event Day"
            day_mult = 1.18
        else:
            day_type = "Weekday"
            day_mult = 1.00

        tp_label, tp_mult = time_periods[idx % len(time_periods)]
        v_type, v_share = vehicle_types[(idx // 5) % len(vehicle_types)]
        u_type, u_share = user_types[(idx // 15) % len(user_types)]

        expected_demand = 62.0 * day_mult * tp_mult * v_share * u_share * 3.2
        demand_count = max(1, int(round(rng.poisson(max(1.5, expected_demand)))))

        occupied_est = int(np.clip(round(total_slots * min(0.95, 0.38 * day_mult * tp_mult)), 25, total_slots - 12))
        avail_slots = max(5, total_slots - occupied_est + int(rng.integers(-5, 6)))

        records.append(
            {
                "record_id": f"DEM-{idx + 1:03d}",
                "date": rec_date.strftime("%Y-%m-%d"),
                "day_type": day_type,
                "time_period": tp_label,
                "vehicle_type": v_type,
                "user_type": u_type,
                "demand_count": demand_count,
                "available_slots": min(total_slots, avail_slots),
            }
        )

    return pd.DataFrame(records)


def generate_cost_matrix_csv(
    vehicles_df: pd.DataFrame,
    slots_df: pd.DataFrame,
) -> pd.DataFrame:
    """Generate the 200 x 220 vehicle_slot_cost_matrix.csv using the exact OR cost function."""
    veh_dicts = vehicles_df.to_dict("records")
    slot_dicts = slots_df.to_dict("records")
    slot_ids = [s["slot_id"] for s in slot_dicts]

    rows = []
    for v in veh_dicts:
        row: Dict[str, object] = {"vehicle_id": v["vehicle_id"]}
        for s in slot_dicts:
            cost, meta = compute_pair_cost(
                v,
                s,
                weights=DEFAULT_WEIGHTS,
                priority_rules=DEFAULT_PRIORITY_RULES,
                compatibility_rules=DEFAULT_COMPATIBILITY_RULES,
                zone_rules=DEFAULT_ZONE_RULES,
                check_availability=True,
            )
            row[s["slot_id"]] = round(cost, 2) if meta["feasible"] else "INF"
        rows.append(row)

    columns = ["vehicle_id"] + slot_ids
    return pd.DataFrame(rows, columns=columns)


def generate_all_datasets(
    output_dir: str = DATA_DIR,
    seed: int = DEFAULT_SEED,
) -> Dict[str, str]:
    """Generate all 5 CSV datasets into output_dir and return generated file paths."""
    os.makedirs(output_dir, exist_ok=True)
    rng = np.random.default_rng(seed)
    base_date = datetime(2026, 11, 11)

    slots_df = generate_parking_slots(rng)
    vehicles_df = generate_vehicles(rng)
    vehicles_df, slots_df, active_pairs = reconcile_initial_occupancy(rng, vehicles_df, slots_df)
    history_df = generate_allocation_history(rng, vehicles_df, slots_df, active_pairs, base_date)
    demand_df = generate_parking_demand(rng, len(slots_df), base_date)
    cost_matrix_df = generate_cost_matrix_csv(vehicles_df, slots_df)

    paths = {
        "vehicles": os.path.join(output_dir, "vehicles.csv"),
        "parking_slots": os.path.join(output_dir, "parking_slots.csv"),
        "allocation_history": os.path.join(output_dir, "allocation_history.csv"),
        "parking_demand": os.path.join(output_dir, "parking_demand.csv"),
        "vehicle_slot_cost_matrix": os.path.join(output_dir, "vehicle_slot_cost_matrix.csv"),
    }

    vehicles_df.to_csv(paths["vehicles"], index=False)
    slots_df.to_csv(paths["parking_slots"], index=False)
    history_df.to_csv(paths["allocation_history"], index=False)
    demand_df.to_csv(paths["parking_demand"], index=False)
    cost_matrix_df.to_csv(paths["vehicle_slot_cost_matrix"], index=False)

    return paths


if __name__ == "__main__":
    generated = generate_all_datasets()
    for name, path in generated.items():
        df = pd.read_csv(path)
        print(f"Generated {name}: {df.shape[0]} rows x {df.shape[1]} cols -> {path}")

