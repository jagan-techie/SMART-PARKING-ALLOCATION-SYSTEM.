"""Comprehensive unit, mathematical optimality, and API integration tests."""

import itertools
import os
import sys
import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from optimization.assignment_solver import run_hungarian_optimization
from optimization.constraints import check_vehicle_slot_feasibility, validate_solution
from optimization.cost_matrix import compute_pair_cost


def _v(
    vid,
    vtype="Car",
    utype="Student",
    block="A",
    prio=4,
    acc=False,
    status="Waiting",
):
    return {
        "vehicle_id": vid,
        "registration_number": f"KA-01-XX-{vid[-3:]}",
        "vehicle_type": vtype,
        "user_type": utype,
        "destination_block": block,
        "priority_level": prio,
        "requires_accessible": acc,
        "parking_status": status,
    }


def _s(
    sid,
    zone="Zone B",
    stype="Car",
    da=100,
    db=100,
    dc=100,
    dd=100,
    acc=False,
    avail=True,
    status="Available",
):
    return {
        "slot_id": sid,
        "zone": zone,
        "slot_type": stype,
        "distance_to_block_a": da,
        "distance_to_block_b": db,
        "distance_to_block_c": dc,
        "distance_to_block_d": dd,
        "is_accessible": acc,
        "is_available": avail,
        "status": status,
    }


def test_1_and_2_one_to_one_assignment_uniqueness():
    """1. Every assigned vehicle gets exactly one slot. 2. No slot receives multiple vehicles."""
    vehicles = [_v("VEH-001", "Car"), _v("VEH-002", "Car"), _v("VEH-003", "Bike")]
    slots = [
        _s("SLT-001", stype="Car", da=40),
        _s("SLT-002", stype="Car", da=80),
        _s("SLT-003", stype="Bike", da=50),
    ]
    res = run_hungarian_optimization(vehicles, slots)
    assert res["constraints_validated"] is True
    assert len(res["assignments"]) == 3

    assigned_vehicles = [a["vehicle_id"] for a in res["assignments"]]
    assigned_slots = [a["slot_id"] for a in res["assignments"]]
    assert len(set(assigned_vehicles)) == len(assigned_vehicles)
    assert len(set(assigned_slots)) == len(assigned_slots)


def test_3_incompatible_vehicle_slot_never_assigned():
    """3. Incompatible vehicle-slot assignments never occur."""
    vehicles = [_v("VEH-CAR", "Car"), _v("VEH-BIKE", "Bike")]
    # Only Bike slot is available for the Car; Car cannot take Bike slot
    slots = [_s("SLT-BIKE", stype="Bike", da=20)]
    res = run_hungarian_optimization(vehicles, slots)

    assert res["constraints_validated"] is True
    assert len(res["assignments"]) == 1
    assert res["assignments"][0]["vehicle_id"] == "VEH-BIKE"
    assert len(res["unassigned_vehicles"]) == 1
    assert res["unassigned_vehicles"][0]["vehicle_id"] == "VEH-CAR"


def test_4_unavailable_slots_never_assigned():
    """4. Unavailable or occupied slots are never assigned."""
    vehicles = [_v("VEH-001", "Car"), _v("VEH-002", "Car")]
    slots = [
        _s("SLT-OCC", stype="Car", da=10, avail=False, status="Occupied"),
        _s("SLT-MAINT", stype="Car", da=15, avail=False, status="Unavailable"),
        _s("SLT-FREE", stype="Car", da=200, avail=True, status="Available"),
    ]
    res = run_hungarian_optimization(vehicles, slots)
    assert res["constraints_validated"] is True
    assert len(res["assignments"]) == 1
    assert res["assignments"][0]["slot_id"] == "SLT-FREE"


def test_5_accessible_slots_follow_bidirectional_eligibility():
    """5. Accessible slots are assigned ONLY to eligible vehicles, and vice versa."""
    vehicles = [
        _v("VEH-REG", "Car", acc=False),
        _v("VEH-ACC", "Car", acc=True),
    ]
    slots = [
        _s("SLT-ACC", stype="Car", da=30, acc=True),
        _s("SLT-REG", stype="Car", da=35, acc=False),
    ]
    res = run_hungarian_optimization(vehicles, slots)
    assert res["constraints_validated"] is True
    mapping = {a["vehicle_id"]: a["slot_id"] for a in res["assignments"]}
    assert mapping["VEH-ACC"] == "SLT-ACC"
    assert mapping["VEH-REG"] == "SLT-REG"

    # Regular vehicle alone must NOT take an accessible slot
    res_only_reg = run_hungarian_optimization(
        [_v("VEH-REG", "Car", acc=False)],
        [_s("SLT-ACC", stype="Car", da=25, acc=True)],
    )
    assert len(res_only_reg["assignments"]) == 0
    assert len(res_only_reg["unassigned_vehicles"]) == 1


def test_6_objective_matches_selected_assignments():
    """6. The calculated objective value equals the sum of individual selected assignment costs."""
    vehicles = [
        _v("VEH-001", "Car", "Faculty", "A", prio=1),
        _v("VEH-002", "Bike", "Student", "D", prio=4),
        _v("VEH-003", "Scooter", "Staff", "B", prio=2),
    ]
    slots = [
        _s("SLT-001", "Zone A", "Car", da=40, db=120, dc=200, dd=220),
        _s("SLT-002", "Zone D", "Two-Wheeler", da=180, db=120, dc=150, dd=35),
        _s("SLT-003", "Zone B", "Scooter", da=110, db=45, dc=120, dd=130),
    ]
    res = run_hungarian_optimization(vehicles, slots)
    veh_map = {v["vehicle_id"]: v for v in vehicles}
    slot_map = {s["slot_id"]: s for s in slots}

    recomputed_sum = 0.0
    for item in res["assignments"]:
        pair_cost, meta = compute_pair_cost(veh_map[item["vehicle_id"]], slot_map[item["slot_id"]])
        assert meta["feasible"] is True
        assert item["allocation_cost"] == pytest.approx(pair_cost, abs=1e-6)
        recomputed_sum += pair_cost

    assert res["summary"]["total_allocation_cost"] == pytest.approx(recomputed_sum, abs=1e-2)


def test_7_more_vehicles_than_available_slots():
    """7. Handles m > n cleanly, prioritizing higher-priority vehicles when slots are scarce."""
    vehicles = [
        _v("VEH-STU", "Car", "Student", "A", prio=4),
        _v("VEH-FAC", "Car", "Faculty", "A", prio=1),
        _v("VEH-VIS", "Car", "Visitor", "A", prio=3),
    ]
    slots = [
        _s("SLT-1", "Zone A", "Car", da=50),
        _s("SLT-2", "Zone B", "Car", da=90),
    ]
    res = run_hungarian_optimization(vehicles, slots)
    assert res["constraints_validated"] is True
    assert res["summary"]["assigned_count"] == 2
    assert res["summary"]["unassigned_count"] == 1
    assigned_ids = {a["vehicle_id"] for a in res["assignments"]}
    assert "VEH-FAC" in assigned_ids


def test_8_more_slots_than_vehicles():
    """8. Handles n > m cleanly, assigning every feasible vehicle to its minimum-cost slot."""
    vehicles = [_v("VEH-001", "Car", "Faculty", "A", prio=1)]
    slots = [
        _s("SLT-FAR", "Zone D", "Car", da=300),
        _s("SLT-NEAR", "Zone A", "Car", da=30),
        _s("SLT-MID", "Zone B", "Car", da=120),
    ]
    res = run_hungarian_optimization(vehicles, slots)
    assert res["constraints_validated"] is True
    assert res["summary"]["assigned_count"] == 1
    assert res["assignments"][0]["slot_id"] == "SLT-NEAR"


def test_9_zero_vehicles_and_zero_slots():
    """9. Handles 0 vehicles and/or 0 available slots gracefully without exceptions."""
    res_no_veh = run_hungarian_optimization([], [_s("SLT-1")])
    assert res_no_veh["success"] is True
    assert res_no_veh["summary"]["assigned_count"] == 0

    res_no_slot = run_hungarian_optimization([_v("VEH-1")], [])
    assert res_no_slot["success"] is True
    assert res_no_slot["summary"]["assigned_count"] == 0
    assert res_no_slot["summary"]["unassigned_count"] == 1

    res_empty = run_hungarian_optimization([], [])
    assert res_empty["success"] is True
    assert res_empty["summary"]["assigned_count"] == 0


def test_small_case_matches_exhaustive_enumeration():
    """Verify Hungarian Algorithm matches exact global minimum found via exhaustive enumeration."""
    vehicles = [
        _v("V1", "Car", "Faculty", "A", prio=1),
        _v("V2", "Car", "Staff", "B", prio=2),
        _v("V3", "Car", "Visitor", "C", prio=3),
        _v("V4", "Car", "Student", "D", prio=4),
    ]
    slots = [
        _s("S1", "Zone A", "Car", da=35, db=140, dc=240, dd=210),
        _s("S2", "Zone B", "Car", da=130, db=40, dc=150, dd=130),
        _s("S3", "Zone C", "Car", da=245, db=145, dc=30, dd=190),
        _s("S4", "Zone D", "Car", da=210, db=135, dc=195, dd=45),
        _s("S5", "Zone B", "Car", da=95, db=70, dc=130, dd=160),
    ]

    res = run_hungarian_optimization(vehicles, slots)
    hungarian_cost = res["summary"]["total_allocation_cost"]

    # Exhaustive enumeration over all P(5, 4) = 120 injective matchings
    best_exhaustive_cost = float("inf")
    for perm in itertools.permutations(range(len(slots)), len(vehicles)):
        total = 0.0
        valid = True
        for i, j in enumerate(perm):
            c, meta = compute_pair_cost(vehicles[i], slots[j])
            if not meta["feasible"]:
                valid = False
                break
            total += c
        if valid and total < best_exhaustive_cost:
            best_exhaustive_cost = total

    assert hungarian_cost == pytest.approx(best_exhaustive_cost, abs=1e-2)


def test_10_api_integration_and_history_persistence(tmp_path, monkeypatch):
    """10. End-to-end Flask API test: optimization persists history and repeated runs skip occupied slots."""
    import config
    import models
    from sqlalchemy import create_engine

    test_db = tmp_path / "test_parking.db"
    test_data = tmp_path / "data"
    monkeypatch.setattr(config, "DB_PATH", str(test_db))
    monkeypatch.setattr(config, "DATA_DIR", str(test_data))
    monkeypatch.setattr(models, "DB_PATH", str(test_db))
    monkeypatch.setattr(models, "DATA_DIR", str(test_data))

    new_engine = create_engine(f"sqlite:///{test_db}", connect_args={"check_same_thread": False}, future=True)
    models.SessionLocal.remove()
    models.SessionLocal.configure(bind=new_engine)
    monkeypatch.setattr(models, "engine", new_engine)

    from app import create_app
    app = create_app(initialize_db=True)
    client = app.test_client()

    stats_before = client.get("/api/dashboard/stats").get_json()
    waiting_before = stats_before["kpis"]["vehicles_waiting"]
    avail_before = stats_before["kpis"]["available_slots"]
    assert waiting_before > 0
    assert avail_before > 0

    run_resp = client.post("/api/optimization/run", json={"apply_allocation": True})
    assert run_resp.status_code == 200
    run_data = run_resp.get_json()
    assert run_data["constraints_validated"] is True
    assert run_data["summary"]["assigned_count"] > 0
    assigned_slots_first_run = {a["slot_id"] for a in run_data["assignments"]}

    # Verify history stored
    hist_resp = client.get("/api/optimization/history").get_json()
    assert len(hist_resp["optimization_runs"]) >= 1
    assert hist_resp["optimization_runs"][0]["run_id"] == run_data["run_id"]

    # Repeated optimization must not assign already-occupied slots
    run2_resp = client.post("/api/optimization/run", json={"apply_allocation": True})
    assert run2_resp.status_code == 200
    run2_data = run2_resp.get_json()
    assigned_slots_second_run = {a["slot_id"] for a in run2_data["assignments"]}
    assert assigned_slots_first_run.isdisjoint(assigned_slots_second_run)

    # Clean up SQLite handles on Windows
    models.SessionLocal.remove()
    new_engine.dispose()
