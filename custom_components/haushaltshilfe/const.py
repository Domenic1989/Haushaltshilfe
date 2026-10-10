"""Constants for the Haushaltshilfe Pro integration."""
import json

DOMAIN = "haushaltshilfe"

# Event Types für Persistent Storage Sensors (Sensor Platform)
EVENT_SET_SHOPPING = "set_shopping_data"
EVENT_SET_TASKS = "set_tasks_data"
EVENT_SET_SHOP_FAVS = "set_shop_favs"
EVENT_SET_FOOD_FAVS = "set_food_favs"
EVENT_SET_TODO_FAVS = "set_todo_favs"
EVENT_SET_FINANCE = "set_finance_db"

# Persistent Speicher-Events
EVENT_SET_ROOMS = "set_rooms_data"
EVENT_SET_STORES = "set_stores_data"
EVENT_SET_USERS = "set_users_data"
EVENT_SET_ADMIN_PW = "set_admin_pw_data"
EVENT_SET_FOOD_PLAN = "set_food_plan_data"

# Configuration Options
CONF_ADMIN_PW = "admin_pw"

# Alle input_text Helfer für die input_text.py Plattform
HELPER_ENTITIES = {
    # Administration & Benutzer
    "helper_admin_pw": {
        "name": "helper admin pw",
        "initial": "1234",
    },
    "helper_user_list": {
        "name": "helper user list",
        "initial": json.dumps(["Admin:admin", "Tablet:tablet"]),
    },
    # Listen (Orte & Räume)
    "helper_shop_stores": {
        "name": "helper shop stores",
        "initial": json.dumps(["Aldi", "Lidl", "Rewe"]),
    },
    "helper_room_list": {
        "name": "helper room list",
        "initial": json.dumps(["Küche", "Schlafzimmer", "Bad OG", "Bad EG"]),
    },
    # Favoriten & Kategorien Storage
    "helper_shop_favs": {
        "name": "helper shop favs",
        "initial": json.dumps({"cats": ["Alle", "Gemüse", "Fleisch", "Vorrat", "Haus"], "favs": []}),
    },
    "helper_food_favs": {
        "name": "helper food favs",
        "initial": json.dumps({"cats": ["Alle", "Schnell", "Italienisch", "Leicht"], "favs": []}),
    },
    "helper_todo_favs": {
        "name": "helper todo favs",
        "initial": json.dumps({"cats": ["Alle", "Haus", "Bad", "Wohnen", "Küche", "Garten"], "favs": []}),
    },
    # Essensplan Wochentage (Essen Montag - Sonntag)
    "essen_montag": {"name": "essen montag", "initial": ""},
    "essen_dienstag": {"name": "essen dienstag", "initial": ""},
    "essen_mittwoch": {"name": "essen mittwoch", "initial": ""},
    "essen_donnerstag": {"name": "essen donnerstag", "initial": ""},
    "essen_freitag": {"name": "essen freitag", "initial": ""},
    "essen_samstag": {"name": "essen samstag", "initial": ""},
    "essen_sonntag": {"name": "essen sonntag", "initial": ""},
}
