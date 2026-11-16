# Synthetic Dataset Documentation

## Overview
This directory contains the synthetic dataset generator (`generate_dataset.py`) and the generated CSV datasets (`data/`) for the **Smart College Parking Space Allocation Optimization System**.

All datasets are generated deterministically using a fixed NumPy random seed (`DEFAULT_SEED = 42`) so results are 100% reproducible for academic evaluation and Operations Research experiments.

---

## Generated Files

### 1. `vehicles.csv` (200 records)
Represents campus vehicles requesting or holding parking allocations.

| Field | Type | Description |
|---|---|---|
| `vehicle_id` | String | Unique identifier (`VEH-001` to `VEH-200`) |
| `registration_number` | String | Synthetic Indian-format license plate (e.g., `KA-04-AB-1923`) |
| `vehicle_type` | String | `Car`, `Bike`, or `Scooter` |
| `user_type` | String | `Student`, `Faculty`, `Staff`, or `Visitor` |
| `destination_block` | String | Target campus academic/admin block (`A`, `B`, `C`, or `D`) |
| `priority_level` | Integer | `1` (Faculty), `2` (Staff), `3` (Visitor), `4` (Student) |
| `requires_accessible` | Boolean | `True` if the driver requires a reserved accessible slot |
| `arrival_time` | String | Arrival timestamp (`HH:MM`, 24-hour format) |
| `departure_time` | String | Expected departure timestamp (`HH:MM`) |
| `parking_status` | String | Initial state: `Waiting` (75), `Assigned` (80), `Departed` (45) |

### 2. `parking_slots.csv` (220 records)
Represents individual physical parking bays across four campus zones.

| Field | Type | Description |
|---|---|---|
| `slot_id` | String | Unique slot identifier (`SLT-001` to `SLT-220`) |
| `zone` | String | Campus parking zone (`Zone A`, `Zone B`, `Zone C`, `Zone D`) |
| `slot_type` | String | Compatible slot category: `Car`, `Bike`, `Scooter`, or `Two-Wheeler` |
| `distance_to_block_a` | Integer | Walking distance (meters) from slot to Block A |
| `distance_to_block_b` | Integer | Walking distance (meters) from slot to Block B |
| `distance_to_block_c` | Integer | Walking distance (meters) from slot to Block C |
| `distance_to_block_d` | Integer | Walking distance (meters) from slot to Block D |
| `is_accessible` | Boolean | `True` if reserved as an accessible/PRM parking bay |
| `is_available` | Boolean | `True` if currently free; `False` if occupied or under maintenance |

#### Zone Distribution (220 Slots)
- **Zone A (55 slots — Academic & Faculty Core):** Closest to Block A; predominantly Car slots (35 Car, 10 Bike, 10 Scooter), 8 accessible slots.
- **Zone B (55 slots — Science & Engineering Lot):** Closest to Block B; balanced mix (25 Car, 15 Bike, 10 Scooter, 5 Two-Wheeler), 6 accessible slots.
- **Zone C (50 slots — Admin & Visitor Plaza):** Closest to Block C; visitor/staff friendly (28 Car, 10 Bike, 8 Scooter, 4 Two-Wheeler), 6 accessible slots.
- **Zone D (60 slots — Two-Wheeler & Student Hub):** Closest to Block D; high two-wheeler density (6 Car, 20 Bike, 14 Scooter, 20 Two-Wheeler), 4 accessible slots.

### 3. `allocation_history.csv` (1000 records)
Historical and active allocation log across 30 days.

| Field | Type | Description |
|---|---|---|
| `allocation_id` | String | Unique log identifier (`ALC-0001` to `ALC-1000`) |
| `vehicle_id` | String | Foreign key referencing `vehicles.csv` |
| `slot_id` | String | Foreign key referencing `parking_slots.csv` |
| `allocation_date` | String | Date of allocation (`YYYY-MM-DD`) |
| `allocation_time` | String | Time of allocation (`HH:MM:SS`) |
| `allocation_cost` | Float | Cost computed from the weighted OR objective function |
| `allocation_status` | String | `Active` (80 current parked), `Completed`, or `Cancelled` |

### 4. `parking_demand.csv` (500 records)
Aggregated demand snapshots across day types, time windows, vehicle categories, and user categories.

| Field | Type | Description |
|---|---|---|
| `record_id` | String | Unique record ID (`DEM-001` to `DEM-500`) |
| `date` | String | Observation date (`YYYY-MM-DD`) |
| `day_type` | String | `Weekday`, `Weekend`, `Exam Day`, or `Event Day` |
| `time_period` | String | Two-hour window (`08:00-10:00` through `16:00-18:00`) |
| `vehicle_type` | String | `Car`, `Bike`, or `Scooter` |
| `user_type` | String | `Student`, `Faculty`, `Staff`, or `Visitor` |
| `demand_count` | Integer | Number of vehicles arriving in that segment |
| `available_slots` | Integer | Free slot capacity observed during that period |

### 5. `vehicle_slot_cost_matrix.csv` (200 rows × 221 columns)
Precomputed assignment cost matrix $C = [c_{ij}]$ matching the live Optimization Engine's rules:
- Rows correspond to `vehicle_id` (`VEH-001` to `VEH-200`).
- Columns correspond to `slot_id` (`SLT-001` to `SLT-220`).
- Feasible pairs hold their numeric weighted cost $c_{ij}$; prohibited pairs (occupied/unavailable slots, incompatible vehicle-slot types, or violated accessibility constraints) contain `INF`.

---

## Methodology & Internal Consistency
1. **Geometric Campus Coordinates:** Campus Blocks A, B, C, and D and Zones A–D are placed on a 2D campus coordinate grid. Slot distances are computed as Euclidean distance plus realistic pedestrian walkway overhead (8–24 m), preserving spatial consistency.
2. **Correlated User & Vehicle Patterns:** Faculty and Visitors exhibit higher car ownership and earlier/mid-day arrival windows respectively, while Students exhibit higher two-wheeler usage and Block B/D affinity.
3. **Occupancy Reconciliation:** Every vehicle marked `Assigned` (80 vehicles) is paired with a unique compatible, accessibility-compliant slot marked `is_available = False`, and recorded as `Active` in `allocation_history.csv`. Ten additional slots are marked unavailable (maintenance/reserved), leaving 130 available slots for the 75 `Waiting` vehicles.
4. **Constraint-Verified History:** All 1,000 historical rows obey vehicle-slot compatibility and accessibility eligibility rules and use `compute_pair_cost()` for exact cost consistency.

---

## Limitations
- Arrival and departure times are modeled as static daily snapshots rather than continuous real-time sensor streams.
- Walking distances use simulated campus grid coordinates rather than GIS footpath surveys.
- Demand fluctuations (`parking_demand.csv`) are synthesized from Poisson-modulated multipliers rather than multi-year campus gate logs.

