# Smart College Parking Space Allocation Optimization System

**Operations Research (CA-3) Mini Project** — A full-stack web application implementing the **Assignment Problem** via the **Hungarian Algorithm** (`scipy.optimize.linear_sum_assignment`) to optimally allocate campus vehicles to compatible parking slots while minimizing weighted walking distance, priority penalties, and zone mismatches.

---

## 1. Introduction
Rapid growth in student, faculty, staff, and visitor vehicle volume across college campuses causes daily congestion, wasted cruising time, unfair usage of accessible bays, and uneven parking zone utilization. This project formulates college parking allocation as a **constrained bipartite Assignment Problem** from Operations Research and delivers an interactive admin dashboard to manage vehicles, visualize parking bays, tune objective weights, run the Hungarian Algorithm, and analyze historical performance.

## 2. Problem Statement
Given $m$ incoming or waiting vehicles and $n$ available parking slots across multiple campus zones, how do we assign at most one parking slot to each vehicle (and at most one vehicle to each slot) such that:
- Vehicle-slot size/type compatibility is strictly respected,
- Accessible (PRM) bays are reserved exclusively for eligible vehicles,
- Occupied or maintenance slots are never assigned, and
- The total campus-wide allocation cost (walking distance + priority penalty + zone penalty) is minimized?

## 3. Objectives
1. Formulate college parking allocation mathematically as a Linear Programming Assignment Problem.
2. Solve the problem to proven global optimality in polynomial time ($O(N^3)$) using the Hungarian Algorithm.
3. Enforce hard operational constraints without forcing invalid assignments when capacity or compatibility is limited.
4. Generate reproducible, internally consistent synthetic datasets (`vehicles.csv`, `parking_slots.csv`, `allocation_history.csv`, `parking_demand.csv`, `vehicle_slot_cost_matrix.csv`).
5. Provide a clean, responsive React + Flask + SQLite web dashboard with interactive visualizations and CSV reporting.

## 4. Scope
- Multi-category campus fleet: `Car`, `Bike`, `Scooter`.
- Multi-tier campus users: `Faculty`, `Staff`, `Visitor`, `Student`.
- Multi-zone campus layout: `Zone A`, `Zone B`, `Zone C`, `Zone D` serving Academic/Admin Blocks `A`, `B`, `C`, and `D`.
- Full CRUD management for vehicles and parking slots, interactive visual bay map, cost-matrix heatmap, live OR optimization, baseline comparison, historical analytics, and CSV exports.

## 5. Existing System vs. Proposed System
| Aspect | Existing Manual / FCFS System | Proposed OR Optimization System |
|---|---|---|
| Allocation Logic | First-Come, First-Served (FCFS) or manual guard intuition | Global minimum-cost Assignment Problem solved via Hungarian Algorithm |
| Walking Distance | Drivers cruise blindly; high average walking distance | Minimizes total walking distance to each driver's destination block |
| Priority & Fairness | High-priority faculty or accessible drivers may end up far away | Explicit priority urgency weights and strict bidirectional accessibility rules |
| Constraint Enforcement | Error-prone manual checks | Hard mathematical feasibility masking (`INF` / `1e12` prohibition) |
| Analytics | Paper logs or no visibility | Real-time SQLite telemetry, Chart.js dashboards, and CSV exports |

---

## 6. Operations Research Technique & Mathematical Formulation

### Decision Variable
$$x_{ij} = \begin{cases} 1 & \text{if vehicle } i \text{ is assigned to parking slot } j \\ 0 & \text{otherwise} \end{cases}$$

### Objective Function
$$\text{Minimize } Z = \sum_{i=1}^{m} \sum_{j=1}^{n} c_{ij} \, x_{ij}$$

where the allocation cost $c_{ij}$ for any feasible pair $(i, j)$ is computed as:
$$\text{Cost}(i, j) = (w_{\text{dist}} \times d_{ij}) + (w_{\text{prio}} \times p_{ij}) + (w_{\text{zone}} \times z_{ij})$$
- $d_{ij}$: Walking distance (meters) from slot $j$ to vehicle $i$'s destination block (`A`, `B`, `C`, or `D`).
- $p_{ij} = \text{urgency}_i \times \frac{d_{ij}}{100}$: Distance-coupled priority penalty (Faculty urgency `4.0`, Staff `2.5`, Visitor `1.5`, Student `0.5`, plus `+1.0` for accessible requests). Coupling priority with normalized distance ensures the solver provably assigns closer slots to higher-priority users rather than adding a constant offset.
- $z_{ij}$: Zone mismatch penalty from configurable zone policies (plus `0.5` mild preference for exact dedicated bay type over shared `Two-Wheeler` bays).
- **Default Weights:** $w_{\text{dist}} = 1.0$, $w_{\text{prio}} = 15.0$, $w_{\text{zone}} = 10.0$.

### Constraints
1. **Single Slot per Vehicle:** $\sum_{j=1}^{n} x_{ij} \le 1 \quad \forall i \in \{1,\dots,m\}$ (each assigned vehicle gets exactly one slot; unassignable vehicles map to a dummy slot and stay `Waiting`).
2. **Single Vehicle per Slot:** $\sum_{i=1}^{m} x_{ij} \le 1 \quad \forall j \in \{1,\dots,n\}$.
3. **Vehicle-Slot Compatibility:** $x_{ij} = 0$ if $\text{slot\_type}(j) \notin \text{Allowed}(\text{vehicle\_type}(i))$.
4. **Bidirectional Accessibility Rule:** $x_{ij} = 0$ whenever $\text{requires\_accessible}(i) \ne \text{is\_accessible}(j)$. Accessible slots are assigned **only** to eligible vehicles, and accessible vehicles **only** receive accessible slots.
5. **Availability Constraint:** $x_{ij} = 0$ if slot $j$ is `Occupied` or `Unavailable`.
6. **Binary Integrality:** $x_{ij} \in \{0, 1\}$.

### Balancing with Dummy Slots
Real-world parking matrices are often rectangular ($m \ne n$) or sparse due to prohibited pairs. Rather than forcing invalid assignments, we augment the $m \times n$ matrix with $m$ **dummy slots** (one per vehicle) carrying a large finite unassignment penalty $P_i \approx 100{,}500\text{--}109{,}000$, while prohibited pairs receive $M = 10^{12}$. Because $P_i \ll M$ and $P_i \gg \max_{\text{feasible}} c_{ij}$, the Hungarian Algorithm:
1. Maximizes the number of valid assignments (prioritizing higher-priority vehicles when slots are scarce),
2. Never selects an incompatible or occupied bay, and
3. Achieves the exact minimum real cost $\sum c_{ij} x_{ij}$ among matched vehicles.

---

## 7. Hungarian Algorithm Explained (Viva Guide)
The **Hungarian Algorithm** (developed by Harold Kuhn in 1955 based on work by König and Egerváry) solves the $N \times N$ Assignment Problem in $O(N^3)$ time instead of testing $N!$ brute-force combinations (for 50 vehicles, $50! \approx 3 \times 10^{64}$, which is impossible by brute force!).

**Core Idea in 4 Simple Steps:**
1. **Row Reduction:** Subtract the minimum value of each row from every element in that row (creates at least one zero per vehicle).
2. **Column Reduction:** Subtract the minimum value of each column from every element in that column (creates at least one zero per slot).
3. **Line Covering Test:** Cover all zeros using the minimum number of horizontal and vertical lines. If the number of lines equals $N$, an optimal zero-cost assignment exists among the zeros!
4. **Matrix Adjustment (Dual Update):** If fewer than $N$ lines cover all zeros, find the smallest uncovered entry $k$, subtract $k$ from all uncovered elements, and add $k$ to elements covered by two lines. Repeat until $N$ lines are required, then select $N$ independent zeros.

In this application, `scipy.optimize.linear_sum_assignment()` implements the modified Jonker–Volgenant variant of the Hungarian Algorithm in compiled C/C++ for sub-millisecond execution.

---

## 8. Dataset Description & Methodology
All synthetic datasets are generated deterministically (`seed = 42`) by `backend/dataset/generate_dataset.py` (see `backend/dataset/README.md` for full field tables):
- `vehicles.csv` (200 records): 80 `Assigned`, 75 `Waiting`, 45 `Departed`.
- `parking_slots.csv` (220 records): Distributed across Zones A (55), B (55), C (50), D (60) with geometrically derived walking distances to Blocks A–D.
- `allocation_history.csv` (1000 records): 80 active + 920 historical allocations over 30 days, all constraint-checked and costed via `compute_pair_cost()`.
- `parking_demand.csv` (500 records): Time-period demand across `Weekday`, `Weekend`, `Exam Day`, and `Event Day`.
- `vehicle_slot_cost_matrix.csv` (200 × 220 matrix): Exact numeric costs for feasible pairs and `INF` for prohibited pairs.

---

## 9. System Architecture & Project Structure
```text
smart-parking-optimization/
├── backend/
│   ├── app.py                     # Flask app factory, CORS, DB init
│   ├── config.py                  # Default OR weights, priority, zone & compat rules
│   ├── models.py                  # SQLAlchemy ORM models & SQLite seeding
│   ├── requirements.txt
│   ├── optimization/
│   │   ├── constraints.py         # Hard feasibility & solution validation
│   │   ├── cost_matrix.py         # Weighted cost function & matrix builder
│   │   └── assignment_solver.py   # SciPy Hungarian solver + valid random baseline
│   ├── routes/
│   │   ├── dashboard.py           # /api/dashboard/stats, /api/analytics, /api/reports/export
│   │   ├── vehicles.py            # /api/vehicles CRUD
│   │   ├── slots.py               # /api/parking-slots CRUD
│   │   ├── optimization.py        # /api/optimization/* endpoints
│   │   └── settings.py            # /api/settings, /api/dataset/regenerate
│   ├── dataset/
│   │   ├── generate_dataset.py    # Deterministic synthetic CSV generator
│   │   ├── README.md
│   │   └── data/                  # Generated CSV files
│   └── tests/
│       └── test_optimization.py   # 10+ OR constraint, optimality & API tests
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx
        ├── services/api.js        # Axios API client
        ├── layouts/DashboardLayout.jsx
        ├── components/            # KpiCard, StatusBadge, AlertBanner
        ├── charts/                # Chart.js visualizations
        └── pages/                 # Overview, Vehicles, Slots, Optimization, Analytics, Settings
```

---

## 10. Local Installation & Step-by-Step Run Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### Step 1: Backend Setup & Dataset Generation
```bash
cd smart-parking-optimization/backend
python -m venv venv
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python dataset/generate_dataset.py
```

### Step 2: Run Unit & Mathematical Validation Tests
```bash
pytest -v tests/test_optimization.py
```

### Step 3: Start the Flask Backend Server
```bash
python app.py
```
The API initializes `parking_system.db` (SQLite) automatically on first startup and listens on `http://127.0.0.1:5000`.

### Step 4: Start the React + Vite Frontend
Open a second terminal:
```bash
cd smart-parking-optimization/frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser. Vite automatically proxies `/api/*` requests to `http://127.0.0.1:5000`.

---

## 11. Screenshots & Viva Demonstration Guide
1. **Overview Dashboard:** Showcases the 6 live KPI cards (`Total Slots: 220`, `Occupied: 80`, `Available: 130`, `Waiting: 75`, etc.) and 5 Chart.js charts.
2. **Parking Slot Management:** Demonstrates color-coded visual parking bays (Green = Available, Red = Occupied, Grey = Unavailable, Blue = Selected) across Zones A–D.
3. **Optimization Center:** Select waiting vehicles and available slots, click **Generate Cost Matrix** to inspect the `c_ij` heatmap (with `INF` prohibited cells), then click **Run Hungarian Optimization** to view optimal assignments, minimum total cost, unassigned vehicles (if any), and the valid random feasible baseline comparison.
4. **Analytics & Reports:** Demonstrates demand trends, priority cost fairness across Faculty/Staff/Visitor/Student, and one-click CSV export.

---

## 12. Advantages, Limitations & Future Enhancements
- **Advantages:** Guaranteed global optimality for the linear assignment objective, strict constraint safety, deterministic synthetic benchmarking, and immediate SQLite state updates preventing double-booking.
- **Limitations:** Static batch optimization snapshot rather than continuous dynamic arrival reservation; walking distances use simulated grid coordinates.
- **Future Enhancements:** Time-window / rolling-horizon dynamic optimization, ANPR (camera) license plate integration, EV charging bay constraints, and live campus GIS footpath routing.

cd "c:\Users\bjaga\JC-Badiga J-1bab\3RD  SEMESTER\Mini Project\Introduction to Operation Research\Smart car parking allotment\smart-parking-optimization"
powershell -ExecutionPolicy Bypass -File .\install_and_run.ps1