"""SQLAlchemy database models and initialization helpers."""

import json
import os
from datetime import datetime
from typing import Any, Dict

import pandas as pd
from sqlalchemy import (
    Boolean,
    Column,
    Float,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import declarative_base, scoped_session, sessionmaker

from config import (
    DATA_DIR,
    DB_PATH,
    DEFAULT_COMPATIBILITY_RULES,
    DEFAULT_PRIORITY_RULES,
    DEFAULT_SEED,
    DEFAULT_WEIGHTS,
    DEFAULT_ZONE_RULES,
)
from dataset.generate_dataset import generate_all_datasets

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False, "timeout": 30},
    future=True,
)
SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))
Base = declarative_base()


class Vehicle(Base):
    __tablename__ = "vehicles"

    vehicle_id = Column(String(32), primary_key=True)
    registration_number = Column(String(32), unique=True, nullable=False)
    vehicle_type = Column(String(24), nullable=False)
    user_type = Column(String(24), nullable=False)
    destination_block = Column(String(8), nullable=False)
    priority_level = Column(Integer, nullable=False, default=4)
    requires_accessible = Column(Boolean, nullable=False, default=False)
    arrival_time = Column(String(16), nullable=False)
    departure_time = Column(String(16), nullable=False)
    parking_status = Column(String(24), nullable=False, default="Waiting")
    assigned_slot_id = Column(String(32), nullable=True)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "vehicle_id": self.vehicle_id,
            "registration_number": self.registration_number,
            "vehicle_type": self.vehicle_type,
            "user_type": self.user_type,
            "destination_block": self.destination_block,
            "priority_level": self.priority_level,
            "requires_accessible": bool(self.requires_accessible),
            "arrival_time": self.arrival_time,
            "departure_time": self.departure_time,
            "parking_status": self.parking_status,
            "assigned_slot_id": self.assigned_slot_id,
        }


class ParkingSlot(Base):
    __tablename__ = "parking_slots"

    slot_id = Column(String(32), primary_key=True)
    zone = Column(String(32), nullable=False)
    slot_type = Column(String(24), nullable=False)
    distance_to_block_a = Column(Integer, nullable=False)
    distance_to_block_b = Column(Integer, nullable=False)
    distance_to_block_c = Column(Integer, nullable=False)
    distance_to_block_d = Column(Integer, nullable=False)
    is_accessible = Column(Boolean, nullable=False, default=False)
    is_available = Column(Boolean, nullable=False, default=True)
    status = Column(String(24), nullable=False, default="Available")  # Available, Occupied, Unavailable
    assigned_vehicle_id = Column(String(32), nullable=True)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "slot_id": self.slot_id,
            "zone": self.zone,
            "slot_type": self.slot_type,
            "distance_to_block_a": self.distance_to_block_a,
            "distance_to_block_b": self.distance_to_block_b,
            "distance_to_block_c": self.distance_to_block_c,
            "distance_to_block_d": self.distance_to_block_d,
            "is_accessible": bool(self.is_accessible),
            "is_available": bool(self.is_available),
            "status": self.status,
            "assigned_vehicle_id": self.assigned_vehicle_id,
        }


class AllocationHistory(Base):
    __tablename__ = "allocation_history"

    allocation_id = Column(String(32), primary_key=True)
    vehicle_id = Column(String(32), nullable=False)
    slot_id = Column(String(32), nullable=False)
    allocation_date = Column(String(16), nullable=False)
    allocation_time = Column(String(16), nullable=False)
    allocation_cost = Column(Float, nullable=False)
    allocation_status = Column(String(24), nullable=False)
    run_id = Column(String(32), nullable=True)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "allocation_id": self.allocation_id,
            "vehicle_id": self.vehicle_id,
            "slot_id": self.slot_id,
            "allocation_date": self.allocation_date,
            "allocation_time": self.allocation_time,
            "allocation_cost": self.allocation_cost,
            "allocation_status": self.allocation_status,
            "run_id": self.run_id,
        }


class ParkingDemand(Base):
    __tablename__ = "parking_demand"

    record_id = Column(String(32), primary_key=True)
    date = Column(String(16), nullable=False)
    day_type = Column(String(24), nullable=False)
    time_period = Column(String(24), nullable=False)
    vehicle_type = Column(String(24), nullable=False)
    user_type = Column(String(24), nullable=False)
    demand_count = Column(Integer, nullable=False)
    available_slots = Column(Integer, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "record_id": self.record_id,
            "date": self.date,
            "day_type": self.day_type,
            "time_period": self.time_period,
            "vehicle_type": self.vehicle_type,
            "user_type": self.user_type,
            "demand_count": self.demand_count,
            "available_slots": self.available_slots,
        }


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"

    run_id = Column(String(32), primary_key=True)
    created_at = Column(String(32), nullable=False)
    total_vehicles = Column(Integer, nullable=False)
    total_available_slots = Column(Integer, nullable=False)
    assigned_count = Column(Integer, nullable=False)
    unassigned_count = Column(Integer, nullable=False)
    total_allocation_cost = Column(Float, nullable=False)
    average_allocation_cost = Column(Float, nullable=False)
    utilization_percentage = Column(Float, nullable=False)
    baseline_assigned_count = Column(Integer, nullable=False)
    baseline_total_cost = Column(Float, nullable=False)
    baseline_average_cost = Column(Float, nullable=False)
    weights_json = Column(Text, nullable=False)
    result_json = Column(Text, nullable=False)

    def to_dict(self, include_details: bool = False) -> Dict[str, Any]:
        data = {
            "run_id": self.run_id,
            "created_at": self.created_at,
            "total_vehicles": self.total_vehicles,
            "total_available_slots": self.total_available_slots,
            "assigned_count": self.assigned_count,
            "unassigned_count": self.unassigned_count,
            "total_allocation_cost": self.total_allocation_cost,
            "average_allocation_cost": self.average_allocation_cost,
            "utilization_percentage": self.utilization_percentage,
            "baseline_assigned_count": self.baseline_assigned_count,
            "baseline_total_cost": self.baseline_total_cost,
            "baseline_average_cost": self.baseline_average_cost,
            "weights": json.loads(self.weights_json),
        }
        if include_details:
            data["result"] = json.loads(self.result_json)
        return data


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(64), primary_key=True)
    value_json = Column(Text, nullable=False)
    updated_at = Column(String(32), nullable=False)


def _seed_default_settings(session) -> None:
    defaults = {
        "weights": DEFAULT_WEIGHTS,
        "priority_rules": DEFAULT_PRIORITY_RULES,
        "compatibility_rules": DEFAULT_COMPATIBILITY_RULES,
        "zone_rules": DEFAULT_ZONE_RULES,
    }
    now = datetime.now().isoformat(timespec="seconds")
    for k, val in defaults.items():
        existing = session.get(SystemSetting, k)
        if existing is None:
            session.add(SystemSetting(key=k, value_json=json.dumps(val), updated_at=now))
    session.commit()


def get_system_config(session) -> Dict[str, Any]:
    """Retrieve live OR weights, priority rules, compatibility rules, and zone rules."""
    defaults = {
        "weights": DEFAULT_WEIGHTS,
        "priority_rules": DEFAULT_PRIORITY_RULES,
        "compatibility_rules": DEFAULT_COMPATIBILITY_RULES,
        "zone_rules": DEFAULT_ZONE_RULES,
    }
    config: Dict[str, Any] = {}
    for k, default_val in defaults.items():
        row = session.get(SystemSetting, k)
        if row is not None:
            config[k] = json.loads(row.value_json)
        else:
            config[k] = default_val
    return config


def update_system_config(session, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    allowed = {"weights", "priority_rules", "compatibility_rules", "zone_rules"}
    for k in allowed:
        if k in payload and payload[k] is not None:
            row = session.get(SystemSetting, k)
            if row is None:
                session.add(SystemSetting(key=k, value_json=json.dumps(payload[k]), updated_at=now))
            else:
                row.value_json = json.dumps(payload[k])
                row.updated_at = now
    session.commit()
    return get_system_config(session)


def _as_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "1", "yes")


def init_db(force_reseed: bool = False, seed: int = DEFAULT_SEED) -> None:
    """Create database tables and seed from synthetic CSV datasets if empty or requested."""
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        _seed_default_settings(session)

        has_vehicles = session.query(Vehicle).count() > 0
        has_slots = session.query(ParkingSlot).count() > 0
        if has_vehicles and has_slots and not force_reseed:
            return

        required_files = [
            os.path.join(DATA_DIR, "vehicles.csv"),
            os.path.join(DATA_DIR, "parking_slots.csv"),
            os.path.join(DATA_DIR, "allocation_history.csv"),
            os.path.join(DATA_DIR, "parking_demand.csv"),
        ]
        if force_reseed or not all(os.path.exists(p) for p in required_files):
            generate_all_datasets(output_dir=DATA_DIR, seed=seed)

        if force_reseed:
            session.query(AllocationHistory).delete()
            session.query(ParkingDemand).delete()
            session.query(OptimizationRun).delete()
            session.query(Vehicle).delete()
            session.query(ParkingSlot).delete()
            session.commit()

        vehicles_df = pd.read_csv(os.path.join(DATA_DIR, "vehicles.csv"))
        slots_df = pd.read_csv(os.path.join(DATA_DIR, "parking_slots.csv"))
        history_df = pd.read_csv(os.path.join(DATA_DIR, "allocation_history.csv"))
        demand_df = pd.read_csv(os.path.join(DATA_DIR, "parking_demand.csv"))

        # Map active allocations to reconcile occupied slot & assigned vehicle links
        active_hist = history_df[history_df["allocation_status"] == "Active"]
        veh_to_slot = dict(zip(active_hist["vehicle_id"], active_hist["slot_id"]))
        slot_to_veh = dict(zip(active_hist["slot_id"], active_hist["vehicle_id"]))

        for _, row in vehicles_df.iterrows():
            v_id = str(row["vehicle_id"])
            session.add(
                Vehicle(
                    vehicle_id=v_id,
                    registration_number=str(row["registration_number"]),
                    vehicle_type=str(row["vehicle_type"]),
                    user_type=str(row["user_type"]),
                    destination_block=str(row["destination_block"]),
                    priority_level=int(row["priority_level"]),
                    requires_accessible=_as_bool(row["requires_accessible"]),
                    arrival_time=str(row["arrival_time"]),
                    departure_time=str(row["departure_time"]),
                    parking_status=str(row["parking_status"]),
                    assigned_slot_id=veh_to_slot.get(v_id),
                )
            )

        for _, row in slots_df.iterrows():
            s_id = str(row["slot_id"])
            is_avail = _as_bool(row["is_available"])
            assigned_veh = slot_to_veh.get(s_id)
            if is_avail:
                status = "Available"
            elif assigned_veh is not None:
                status = "Occupied"
            else:
                status = "Unavailable"

            session.add(
                ParkingSlot(
                    slot_id=s_id,
                    zone=str(row["zone"]),
                    slot_type=str(row["slot_type"]),
                    distance_to_block_a=int(row["distance_to_block_a"]),
                    distance_to_block_b=int(row["distance_to_block_b"]),
                    distance_to_block_c=int(row["distance_to_block_c"]),
                    distance_to_block_d=int(row["distance_to_block_d"]),
                    is_accessible=_as_bool(row["is_accessible"]),
                    is_available=is_avail,
                    status=status,
                    assigned_vehicle_id=assigned_veh,
                )
            )

        for _, row in history_df.iterrows():
            session.add(
                AllocationHistory(
                    allocation_id=str(row["allocation_id"]),
                    vehicle_id=str(row["vehicle_id"]),
                    slot_id=str(row["slot_id"]),
                    allocation_date=str(row["allocation_date"]),
                    allocation_time=str(row["allocation_time"]),
                    allocation_cost=float(row["allocation_cost"]),
                    allocation_status=str(row["allocation_status"]),
                )
            )

        for _, row in demand_df.iterrows():
            session.add(
                ParkingDemand(
                    record_id=str(row["record_id"]),
                    date=str(row["date"]),
                    day_type=str(row["day_type"]),
                    time_period=str(row["time_period"]),
                    vehicle_type=str(row["vehicle_type"]),
                    user_type=str(row["user_type"]),
                    demand_count=int(row["demand_count"]),
                    available_slots=int(row["available_slots"]),
                )
            )

        session.commit()
    finally:
        session.close()

