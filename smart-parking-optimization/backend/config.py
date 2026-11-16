import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "dataset", "data")
DB_PATH = os.path.join(BASE_DIR, "parking_system.db")

DEFAULT_SEED = 42
PROHIBITED_COST = 1e12
DUMMY_BASE_PENALTY = 100000.0

DEFAULT_WEIGHTS = {
    "distance_weight": 1.0,
    "priority_weight": 15.0,
    "zone_weight": 10.0,
}

# Priority levels: lower number = higher priority
DEFAULT_PRIORITY_RULES = {
    "Faculty": {"level": 1, "urgency": 4.0, "unassigned_penalty_boost": 4000.0},
    "Staff": {"level": 2, "urgency": 2.5, "unassigned_penalty_boost": 2500.0},
    "Visitor": {"level": 3, "urgency": 1.5, "unassigned_penalty_boost": 1500.0},
    "Student": {"level": 4, "urgency": 0.5, "unassigned_penalty_boost": 500.0},
}

DEFAULT_COMPATIBILITY_RULES = {
    "Car": ["Car"],
    "Bike": ["Bike", "Two-Wheeler"],
    "Scooter": ["Scooter", "Two-Wheeler"],
}

DEFAULT_ZONE_RULES = {
    "Zone A": {
        "label": "Zone A - Academic & Faculty Core",
        "preferred_users": ["Faculty"],
        "restricted_users": [],
        "penalties": {"Faculty": 0.0, "Staff": 1.5, "Visitor": 4.0, "Student": 5.0},
    },
    "Zone B": {
        "label": "Zone B - Science & Engineering Lot",
        "preferred_users": ["Staff", "Student", "Faculty"],
        "restricted_users": [],
        "penalties": {"Faculty": 0.5, "Staff": 0.0, "Visitor": 2.0, "Student": 1.0},
    },
    "Zone C": {
        "label": "Zone C - Admin & Visitor Plaza",
        "preferred_users": ["Visitor", "Staff"],
        "restricted_users": [],
        "penalties": {"Faculty": 1.0, "Staff": 0.0, "Visitor": 0.0, "Student": 3.5},
    },
    "Zone D": {
        "label": "Zone D - Two-Wheeler & Student Hub",
        "preferred_users": ["Student"],
        "restricted_users": [],
        "penalties": {"Faculty": 2.5, "Staff": 1.0, "Visitor": 2.0, "Student": 0.0},
    },
}


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "smart-college-parking-or-ca3")
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{DB_PATH}"
    DATA_DIR = DATA_DIR
    DB_PATH = DB_PATH

