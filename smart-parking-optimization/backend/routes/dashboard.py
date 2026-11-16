"""Dashboard KPIs, Analytics, and CSV Report Export endpoints."""

import csv
import io
from collections import defaultdict
from flask import Blueprint, Response, jsonify, request

from models import (
    AllocationHistory,
    OptimizationRun,
    ParkingDemand,
    ParkingSlot,
    SessionLocal,
    Vehicle,
)

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/api/dashboard/stats", methods=["GET"])
def get_dashboard_stats():
    session = SessionLocal()
    try:
        slots = session.query(ParkingSlot).all()
        vehicles = session.query(Vehicle).all()
        active_allocs = (
            session.query(AllocationHistory)
            .filter(AllocationHistory.allocation_status == "Active")
            .all()
        )
        demands = session.query(ParkingDemand).all()
        latest_runs = (
            session.query(OptimizationRun)
            .order_by(OptimizationRun.created_at.desc())
            .limit(5)
            .all()
        )

        total_slots = len(slots)
        occupied_slots = sum(1 for s in slots if s.status == "Occupied")
        unavailable_slots = sum(1 for s in slots if s.status == "Unavailable")
        available_slots = sum(1 for s in slots if s.status == "Available" and s.is_available)

        vehicles_waiting = sum(1 for v in vehicles if v.parking_status == "Waiting")
        vehicles_assigned = sum(1 for v in vehicles if v.parking_status == "Assigned")
        utilization_pct = round((occupied_slots / total_slots) * 100.0, 1) if total_slots > 0 else 0.0

        total_active_cost = round(sum(a.allocation_cost for a in active_allocs), 2)
        avg_active_cost = round(total_active_cost / len(active_allocs), 2) if active_allocs else 0.0

        # Vehicle type distribution (active + waiting vehicles, plus overall)
        vtype_counts = defaultdict(int)
        for v in vehicles:
            vtype_counts[v.vehicle_type] += 1

        # Zone-wise occupancy
        zone_map = defaultdict(lambda: {"available": 0, "occupied": 0, "unavailable": 0, "total": 0})
        for s in slots:
            zone_map[s.zone]["total"] += 1
            if s.status == "Occupied":
                zone_map[s.zone]["occupied"] += 1
            elif s.status == "Available" and s.is_available:
                zone_map[s.zone]["available"] += 1
            else:
                zone_map[s.zone]["unavailable"] += 1

        zone_occupancy = []
        for zone_name in sorted(zone_map.keys()):
            stats = zone_map[zone_name]
            occ_pct = round((stats["occupied"] / stats["total"]) * 100.0, 1) if stats["total"] > 0 else 0.0
            zone_occupancy.append({"zone": zone_name, **stats, "utilization_pct": occ_pct})

        # Hourly demand aggregation from ParkingDemand
        period_order = ["08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00"]
        period_demand = defaultdict(lambda: {"demand_sum": 0, "avail_sum": 0, "rows": 0})
        for d in demands:
            period_demand[d.time_period]["demand_sum"] += d.demand_count
            period_demand[d.time_period]["avail_sum"] += d.available_slots
            period_demand[d.time_period]["rows"] += 1

        hourly_demand = []
        for tp in period_order:
            bucket = period_demand[tp]
            avg_demand = round(bucket["demand_sum"] / max(1, bucket["rows"]), 1)
            total_demand = bucket["demand_sum"]
            avg_avail = round(bucket["avail_sum"] / max(1, bucket["rows"]), 1)
            hourly_demand.append(
                {
                    "time_period": tp,
                    "total_demand": total_demand,
                    "avg_demand": avg_demand,
                    "avg_available_slots": avg_avail,
                }
            )

        # Cost comparison from actual saved OptimizationRuns (no fabricated baseline multipliers)
        cost_comparison = []
        if latest_runs:
            for r in reversed(latest_runs):
                cost_comparison.append(
                    {
                        "label": r.run_id,
                        "hungarian_cost": r.total_allocation_cost,
                        "baseline_cost": r.baseline_total_cost,
                        "hungarian_avg": r.average_allocation_cost,
                        "baseline_avg": r.baseline_average_cost,
                    }
                )

        return jsonify(
            {
                "kpis": {
                    "total_slots": total_slots,
                    "occupied_slots": occupied_slots,
                    "unavailable_slots": unavailable_slots,
                    "available_slots": available_slots,
                    "vehicles_waiting": vehicles_waiting,
                    "vehicles_assigned": vehicles_assigned,
                    "total_vehicles": len(vehicles),
                    "utilization_percentage": utilization_pct,
                    "total_allocation_cost": total_active_cost,
                    "average_allocation_cost": avg_active_cost,
                },
                "charts": {
                    "utilization_doughnut": {
                        "available": available_slots,
                        "occupied": occupied_slots,
                        "unavailable": unavailable_slots,
                    },
                    "vehicle_type_distribution": [
                        {"vehicle_type": k, "count": vtype_counts.get(k, 0)}
                        for k in ["Car", "Bike", "Scooter"]
                    ],
                    "zone_occupancy": zone_occupancy,
                    "hourly_demand": hourly_demand,
                    "cost_comparison": cost_comparison,
                },
            }
        )
    finally:
        session.close()


@dashboard_bp.route("/api/analytics", methods=["GET"])
def get_analytics():
    session = SessionLocal()
    try:
        day_type_filter = request.args.get("day_type", "").strip()
        zone_filter = request.args.get("zone", "").strip()
        vtype_filter = request.args.get("vehicle_type", "").strip()
        status_filter = request.args.get("status", "").strip()
        limit = min(500, max(10, int(request.args.get("limit", 100))))

        vehicles = session.query(Vehicle).all()
        slots = session.query(ParkingSlot).all()
        history = (
            session.query(AllocationHistory)
            .order_by(AllocationHistory.allocation_date.desc(), AllocationHistory.allocation_time.desc())
            .all()
        )
        demands = session.query(ParkingDemand).all()
        opt_runs = session.query(OptimizationRun).order_by(OptimizationRun.created_at.desc()).all()

        veh_map = {v.vehicle_id: v for v in vehicles}
        slot_map = {s.slot_id: s for s in slots}

        # Filter history
        filtered_history = []
        for h in history:
            v = veh_map.get(h.vehicle_id)
            s = slot_map.get(h.slot_id)
            if zone_filter and (not s or s.zone != zone_filter):
                continue
            if vtype_filter and (not v or v.vehicle_type != vtype_filter):
                continue
            if status_filter and h.allocation_status != status_filter:
                continue
            filtered_history.append(
                {
                    **h.to_dict(),
                    "registration_number": v.registration_number if v else "-",
                    "vehicle_type": v.vehicle_type if v else "-",
                    "user_type": v.user_type if v else "-",
                    "destination_block": v.destination_block if v else "-",
                    "zone": s.zone if s else "-",
                    "slot_type": s.slot_type if s else "-",
                }
            )

        # Demand trends by date
        filtered_demands = [
            d
            for d in demands
            if (not day_type_filter or d.day_type == day_type_filter)
            and (not vtype_filter or d.vehicle_type == vtype_filter)
        ]
        demand_by_date = defaultdict(lambda: {"demand": 0, "available": []})
        for d in filtered_demands:
            demand_by_date[d.date]["demand"] += d.demand_count
            demand_by_date[d.date]["available"].append(d.available_slots)

        demand_trends = []
        for dt in sorted(demand_by_date.keys()):
            avail_list = demand_by_date[dt]["available"]
            demand_trends.append(
                {
                    "date": dt,
                    "total_demand": demand_by_date[dt]["demand"],
                    "avg_available_slots": round(sum(avail_list) / len(avail_list), 1) if avail_list else 0,
                }
            )

        # Demand by day_type
        demand_by_day_type = defaultdict(int)
        for d in demands:
            demand_by_day_type[d.day_type] += d.demand_count

        # Zone utilization & average historical cost
        zone_stats = defaultdict(lambda: {"total_slots": 0, "occupied": 0, "available": 0, "unavailable": 0, "alloc_count": 0, "cost_sum": 0.0})
        for s in slots:
            zone_stats[s.zone]["total_slots"] += 1
            if s.status == "Occupied":
                zone_stats[s.zone]["occupied"] += 1
            elif s.status == "Available" and s.is_available:
                zone_stats[s.zone]["available"] += 1
            else:
                zone_stats[s.zone]["unavailable"] += 1

        for h in history:
            s = slot_map.get(h.slot_id)
            if s:
                zone_stats[s.zone]["alloc_count"] += 1
                zone_stats[s.zone]["cost_sum"] += h.allocation_cost

        zone_utilization = []
        for z in sorted(zone_stats.keys()):
            st = zone_stats[z]
            zone_utilization.append(
                {
                    "zone": z,
                    "total_slots": st["total_slots"],
                    "occupied": st["occupied"],
                    "available": st["available"],
                    "unavailable": st["unavailable"],
                    "utilization_pct": round((st["occupied"] / st["total_slots"]) * 100.0, 1) if st["total_slots"] else 0.0,
                    "historical_allocations": st["alloc_count"],
                    "avg_cost": round(st["cost_sum"] / st["alloc_count"], 2) if st["alloc_count"] else 0.0,
                }
            )

        # Vehicle & user distribution
        v_dist = defaultdict(int)
        u_dist = defaultdict(int)
        for v in vehicles:
            v_dist[v.vehicle_type] += 1
            u_dist[v.user_type] += 1

        # Average cost by user_type (shows priority fairness!)
        user_cost = defaultdict(list)
        for h in history:
            v = veh_map.get(h.vehicle_id)
            if v:
                user_cost[v.user_type].append(h.allocation_cost)
        cost_by_user = [
            {
                "user_type": u,
                "count": len(user_cost[u]),
                "avg_cost": round(sum(user_cost[u]) / len(user_cost[u]), 2) if user_cost[u] else 0.0,
            }
            for u in ["Faculty", "Staff", "Visitor", "Student"]
        ]

        total_hist_cost = sum(h["allocation_cost"] for h in filtered_history)
        avg_hist_cost = round(total_hist_cost / len(filtered_history), 2) if filtered_history else 0.0

        return jsonify(
            {
                "summary": {
                    "total_records": len(filtered_history),
                    "average_cost": avg_hist_cost,
                    "active_allocations": sum(1 for h in filtered_history if h["allocation_status"] == "Active"),
                    "completed_allocations": sum(1 for h in filtered_history if h["allocation_status"] == "Completed"),
                    "optimization_runs_count": len(opt_runs),
                },
                "demand_trends": demand_trends,
                "demand_by_day_type": [
                    {"day_type": k, "total_demand": v} for k, v in demand_by_day_type.items()
                ],
                "zone_utilization": zone_utilization,
                "vehicle_distribution": [
                    {"vehicle_type": k, "count": v_dist.get(k, 0)} for k in ["Car", "Bike", "Scooter"]
                ],
                "user_distribution": [
                    {"user_type": k, "count": u_dist.get(k, 0)} for k in ["Student", "Faculty", "Staff", "Visitor"]
                ],
                "cost_by_user": cost_by_user,
                "optimization_runs": [r.to_dict() for r in opt_runs[:15]],
                "history": filtered_history[:limit],
            }
        )
    finally:
        session.close()


@dashboard_bp.route("/api/reports/export", methods=["GET"])
def export_report_csv():
    report_type = request.args.get("type", "history").strip().lower()
    session = SessionLocal()
    try:
        output = io.StringIO()
        writer = csv.writer(output)

        if report_type == "vehicles":
            writer.writerow(
                [
                    "vehicle_id",
                    "registration_number",
                    "vehicle_type",
                    "user_type",
                    "destination_block",
                    "priority_level",
                    "requires_accessible",
                    "arrival_time",
                    "departure_time",
                    "parking_status",
                    "assigned_slot_id",
                ]
            )
            for v in session.query(Vehicle).order_by(Vehicle.vehicle_id).all():
                writer.writerow(
                    [
                        v.vehicle_id,
                        v.registration_number,
                        v.vehicle_type,
                        v.user_type,
                        v.destination_block,
                        v.priority_level,
                        v.requires_accessible,
                        v.arrival_time,
                        v.departure_time,
                        v.parking_status,
                        v.assigned_slot_id or "",
                    ]
                )
            filename = "vehicles_report.csv"
        elif report_type == "slots":
            writer.writerow(
                [
                    "slot_id",
                    "zone",
                    "slot_type",
                    "distance_to_block_a",
                    "distance_to_block_b",
                    "distance_to_block_c",
                    "distance_to_block_d",
                    "is_accessible",
                    "is_available",
                    "status",
                    "assigned_vehicle_id",
                ]
            )
            for s in session.query(ParkingSlot).order_by(ParkingSlot.slot_id).all():
                writer.writerow(
                    [
                        s.slot_id,
                        s.zone,
                        s.slot_type,
                        s.distance_to_block_a,
                        s.distance_to_block_b,
                        s.distance_to_block_c,
                        s.distance_to_block_d,
                        s.is_accessible,
                        s.is_available,
                        s.status,
                        s.assigned_vehicle_id or "",
                    ]
                )
            filename = "parking_slots_report.csv"
        else:
            veh_map = {v.vehicle_id: v for v in session.query(Vehicle).all()}
            slot_map = {s.slot_id: s for s in session.query(ParkingSlot).all()}
            writer.writerow(
                [
                    "allocation_id",
                    "vehicle_id",
                    "registration_number",
                    "vehicle_type",
                    "user_type",
                    "destination_block",
                    "slot_id",
                    "zone",
                    "slot_type",
                    "allocation_date",
                    "allocation_time",
                    "allocation_cost",
                    "allocation_status",
                    "run_id",
                ]
            )
            rows = (
                session.query(AllocationHistory)
                .order_by(AllocationHistory.allocation_date.desc(), AllocationHistory.allocation_time.desc())
                .all()
            )
            for h in rows:
                v = veh_map.get(h.vehicle_id)
                s = slot_map.get(h.slot_id)
                writer.writerow(
                    [
                        h.allocation_id,
                        h.vehicle_id,
                        v.registration_number if v else "",
                        v.vehicle_type if v else "",
                        v.user_type if v else "",
                        v.destination_block if v else "",
                        h.slot_id,
                        s.zone if s else "",
                        s.slot_type if s else "",
                        h.allocation_date,
                        h.allocation_time,
                        h.allocation_cost,
                        h.allocation_status,
                        h.run_id or "",
                    ]
                )
            filename = "allocation_history_report.csv"

        csv_bytes = output.getvalue()
        return Response(
            csv_bytes,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    finally:
        session.close()

