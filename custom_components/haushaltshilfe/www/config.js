// ---- KONFIGURATION & PASSWÖRTER ----

const HA_URL = "";
let HA_TOKEN = localStorage.getItem("ha_token") || "";

const MASTER_PW = "homeassistant";
const ADMIN_PW_ENTITY = "input_text.helper_admin_pw";
let ADMIN_PW = "1234";

// ---- ENTITÄTEN-ÜBERSICHT ----
const USER_LIST_ENTITY = "input_text.helper_user_list";
const STORES_ENTITY = "input_text.helper_shop_stores";
const ROOMS_ENTITY = "input_text.helper_room_list";

// ---- SPEICHER-ENTITÄTEN ----
const TODO_DATA_ENTITY = "sensor.haushalt_tasks_storage";
const ENTITY_FINANCE = "sensor.haushalt_finance_db";

const SYNC_CONFIG = {
    shop: {
        entity: "sensor.haushalt_shop_favs_storage",
        attr: "shop_favs_json",
        event: "set_shop_favs"
    },
    todo: {
        entity: "sensor.haushalt_todo_favs_storage",
        attr: "todo_favs_json",
        event: "set_todo_favs"
    },
    food: {
        entity: "sensor.haushalt_food_favs_storage",
        attr: "food_favs_json",
        event: "set_food_favs"
    },
    shopping: {
        entity: "sensor.haushalt_shopping_db",
        attr: "shopping_json",
        event: "set_shopping_data"
    }
};

const FOOD_ENTITIES = [
    "input_text.essen_montag",
    "input_text.essen_dienstag",
    "input_text.essen_mittwoch",
    "input_text.essen_donnerstag",
    "input_text.essen_freitag",
    "input_text.essen_samstag",
    "input_text.essen_sonntag"
];

// ---- MÜLL-KONFIGURATION ----
const TRASH_CONFIG = [
    { id: "sensor.gelber_sack", dateId: "sensor.gelber_sack_datum", name: "Gelber Sack", icon: "🟡" },
    { id: "sensor.papier", dateId: "sensor.papier_datum", name: "Altpapier", icon: "📦" },
    { id: "sensor.restmull", dateId: "sensor.restmull_datum", name: "Restmüll", icon: "🗑️" }
];
