// HA-URL wird automatisch ermittelt
let HA_URL = window.location.origin;

// Token & Passwörter
let HA_TOKEN = localStorage.getItem("ha_token") || "";
let MASTER_PW = "homeassistant";
let ADMIN_PW = "1234";

// Entitäten-Mapping (Passend zur Haus-Zentrale Integration)
const USER_LIST_ENTITY = "input_text.haushalt_users";
const STORES_ENTITY = "input_text.haushalt_stores";
const ROOMS_ENTITY = "input_text.haushalt_rooms";
const ADMIN_PW_ENTITY = "input_text.haushalt_admin_pw";

const TODO_DATA_ENTITY = "sensor.haushalt_todo_storage";

const SYNC_CONFIG = {
    shopping: { 
        entity: "sensor.haushalt_shopping_data", 
        attr: "shopping_json", 
        event: "set_shopping_data" 
    },
    shop: { 
        entity: "sensor.haushalt_shop_favs_storage", 
        attr: "data", 
        event: "set_shop_favs" 
    },
    todo: { 
        entity: "sensor.haushalt_todo_favs_storage", 
        attr: "data", 
        event: "set_todo_favs" 
    },
    food: { 
        entity: "sensor.haushalt_food_favs_storage", 
        attr: "data", 
        event: "set_food_favs" 
    }
};

const FOOD_ENTITIES = [
    "input_text.haushalt_food_mo",
    "input_text.haushalt_food_di",
    "input_text.haushalt_food_mi",
    "input_text.haushalt_food_do",
    "input_text.haushalt_food_fr",
    "input_text.haushalt_food_sa",
    "input_text.haushalt_food_so"
];

// Müll-Konfiguration (an deine lokalen Sensoren anpassbar)
const TRASH_CONFIG = [
    { id: "sensor.gelber_sack", dateId: "sensor.gelber_sack_datum", name: "Gelber Sack", icon: "🟡" },
    { id: "sensor.papier", dateId: "sensor.papier_datum", name: "Altpapier", icon: "📦" },
    { id: "sensor.restmull", dateId: "sensor.restmull_datum", name: "Restmüll", icon: "🗑️" }
];
