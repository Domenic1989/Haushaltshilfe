// --- KONFIGURATION & PASSWÖRTER ---
const HA_URL = window.location.origin; // Deine Home Assistant URL
let HA_TOKEN = localStorage.getItem("ha_token") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwN2UwYjY4OWU5ZGM0YThlODdmMTVlMzEwNTA5NzgyMiIsImlhdCI6MTc3NDg3NDUxOSwiZXhwIjoyMDkwMjM0NTE5fQ.Bki20CjOs9CB4yLB1XmrveW0jccCrwNG8nnToodNbzs"; 

// Das Master-Passwort für System-Einstellungen
const MASTER_PW = "homeassistant"; 

// Admin-Passwort Steuerung via Helfer
const ADMIN_PW_ENTITY = "input_text.helper_admin_pw";
let ADMIN_PW = "1234"; 

// --- ENTITÄTEN-ÜBERSICHT (STORES & ROOMS) ---
const USER_LIST_ENTITY = "input_text.helper_user_list"; 
const STORES_ENTITY = "input_text.helper_shop_stores";
const ROOMS_ENTITY = "input_text.helper_room_list"; 

// --- DIE SICHEREN SPEICHER (Trigger-Sensoren ohne 255-Zeichen-Limit) ---

// 1. Aufgaben & Termine
const TODO_DATA_ENTITY = "sensor.haushalt_tasks_storage";
const ENTITY_FINANCE = 'sensor.haushalt_finance_db';

// 2. Favoriten & Kategorien & Einkaufsliste (NEU: Shopping hinzugefügt)
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
    // NEUER SPEICHER FÜR DIE EINKAUFSLISTE
    shopping: {
        entity: "sensor.haushalt_shopping_db",
        attr: "shopping_json",
        event: "set_shopping_data"
    }
};

// --- ESSENSPLAN (Wie gewünscht die 7 alten behalten) ---
const FOOD_ENTITIES = [
    "input_text.essen_montag", 
    "input_text.essen_dienstag", 
    "input_text.essen_mittwoch", 
    "input_text.essen_donnerstag", 
    "input_text.essen_freitag", 
    "input_text.essen_samstag", 
    "input_text.essen_sonntag"
];

// --- MÜLL-KONFIGURATION ---
const TRASH_CONFIG = [
    { id: "sensor.gelber_sack", dateId: "sensor.gelber_sack_datum", name: "Gelber Sack", icon: "💛" },
    { id: "sensor.papier", dateId: "sensor.papier_datum", name: "Altpapier", icon: "💙" },
    { id: "sensor.restmull", dateId: "sensor.restmull_datum", name: "Restmüll", icon: "🖤" }
];
