"""Constants for the Haushaltshilfe Pro integration."""
import json

DOMAIN = "haushaltshilfe"

# Persistent Speicher-Events (abgestimmt auf deine script.js & finance.js)
EVENT_SET_SHOPPING = "set_shopping_data"
EVENT_SET_TASKS = "set_tasks_data"
EVENT_SET_SHOP_FAVS = "set_shop_favs"
EVENT_SET_FOOD_FAVS = "set_food_favs"
EVENT_SET_TODO_FAVS = "set_todo_favs"
EVENT_SET_FINANCE = "set_finance_db"
EVENT_SET_FINANCE_TEMPLATES = "set_finance_templates"
EVENT_SET_ROOMS = "set_rooms_data"
EVENT_SET_STORES = "set_stores_data"
EVENT_SET_USERS = "set_users_data"
EVENT_SET_ADMIN_PW = "set_admin_pw_data"
EVENT_SET_FOOD_PLAN = "set_food_plan_data"

CONF_ADMIN_PW = "admin_pw"
CONF_MASTER_PW = "master_pw"
CONF_VISIBLE_TABS = "visible_tabs"

# Definition für die echten Text-Entitäten (Plattform: text.py)
TEXT_ENTITIES = {
    "helper_visible_tabs": {
        "name": "Sichtbare Tabs",
        "initial": json.dumps(["shop", "todo", "food", "trash", "finance"]),
        "icon": "mdi:tab",
    },
    "helper_shop_stores": {
        "name": "Geschäfte",
        "initial": json.dumps(["Aldi", "Lidl", "Rewe"]),
        "icon": "mdi:store",
    },
    "helper_room_list": {
        "name": "Räume",
        "initial": json.dumps(["Küche", "Schlafzimmer", "Bad OG", "Bad EG"]),
        "icon": "mdi:door",
    },
    "essen_montag": {"name": "Essen Montag", "initial": "", "icon": "mdi:silverware-fork-knife"},
    "essen_dienstag": {"name": "Essen Dienstag", "initial": "", "icon": "mdi:silverware-fork-knife"},
    "essen_mittwoch": {"name": "Essen Mittwoch", "initial": "", "icon": "mdi:silverware-fork-knife"},
    "essen_donnerstag": {"name": "Essen Donnerstag", "initial": "", "icon": "mdi:silverware-fork-knife"},
    "essen_freitag": {"name": "Essen Freitag", "initial": "", "icon": "mdi:silverware-fork-knife"},
    "essen_samstag": {"name": "Essen Samstag", "initial": "", "icon": "mdi:silverware-fork-knife"},
    "essen_sonntag": {"name": "Essen Sonntag", "initial": "", "icon": "mdi:silverware-fork-knife"},
}
# Müll-Sensoren (Options Flow)
CONF_TRASH_YELLOW_DAYS = "trash_yellow_days"
CONF_TRASH_YELLOW_DATE = "trash_yellow_date"
CONF_TRASH_PAPER_DAYS = "trash_paper_days"
CONF_TRASH_PAPER_DATE = "trash_paper_date"
CONF_TRASH_REST_DAYS = "trash_rest_days"
CONF_TRASH_REST_DATE = "trash_rest_date"
