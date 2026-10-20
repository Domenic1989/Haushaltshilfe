// ---- KONFIGURATION & PASSWÖRTER ----

const HA_URL = "";

// Prüft, ob ein frisches Token direkt aus der aktiven HA-Oberfläche (iframe) verfügbar ist
function getLiveHASessionToken() {
    try {
        if (window.parent && window.parent.hass && window.parent.hass.auth && window.parent.hass.auth.data) {
            return window.parent.hass.auth.data.access_token || "";
        }
        if (window.hass && window.hass.auth && window.hass.auth.data) {
            return window.hass.auth.data.access_token || "";
        }
    } catch(e) {
        console.warn("Konnte Token nicht automatisch aus Session lesen:", e);
    }
    return "";
}

// Holt das Auth-Token (entweder live aus HA oder aus dem lokalen Speicher)
function getHAToken() {
    const liveToken = getLiveHASessionToken();
    if (liveToken) return liveToken;
    return localStorage.getItem("ha_token") || "";
}

// HA_TOKEN wird dynamisch ermittelt
let HA_TOKEN = getHAToken();

// SICHERHEIT: Nur wenn wir ein ECHTES, FRISCHES Token aus der HA-Session haben, im Backend sichern!
const liveSessionToken = getLiveHASessionToken();
if (liveSessionToken && liveSessionToken.trim() !== "") {
    HA_TOKEN = liveSessionToken;
    localStorage.setItem("ha_token", HA_TOKEN);
    let baseUrl = (typeof HA_URL !== "undefined" && HA_URL !== "") ? HA_URL : window.location.origin;
    fetch(`${baseUrl}/api/haushaltshilfe/save_token`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${HA_TOKEN}`, 
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ token: HA_TOKEN })
    }).then(res => {
        if (res.status === 401) {
            // Falls Token ungültig ist -> Bereinigen!
            localStorage.removeItem("ha_token");
            HA_TOKEN = "";
        }
    }).catch(e => console.warn("Backend Token-Sync fehlgeschlagen:", e));
} else if (!HA_TOKEN || HA_TOKEN === "null" || HA_TOKEN === "undefined") {
    HA_TOKEN = "";
}

// Lädt die Benutzernamen vom Server, auch wenn am Handy noch kein Token da ist
async function fetchPublicUsers() {
    try {
        let baseUrl = (typeof HA_URL !== "undefined" && HA_URL !== "") ? HA_URL : window.location.origin;
        const response = await fetch(`${baseUrl}/api/haushaltshilfe/public_users`);
        if (response.ok) {
            const data = await response.json();
            return data.users || [];
        }
    } catch (e) {
        console.warn("Fehler beim Laden der öffentlichen Benutzer:", e);
    }
    return [];
}

// Prüft das Benutzer-Passwort am Server und holt bei Erfolg das HA_TOKEN aufs Handy
async function loginUserViaBackend(username, password) {
    try {
        let baseUrl = (typeof HA_URL !== "undefined" && HA_URL !== "") ? HA_URL : window.location.origin;
        const response = await fetch(`${baseUrl}/api/haushaltshilfe/app_login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.token) {
                HA_TOKEN = data.token;
                localStorage.setItem("ha_token", data.token);
                return true;
            }
        }
    } catch (e) {
        console.error("Login über Backend fehlgeschlagen:", e);
    }
    return false;
}

// Master-Passwort ohne hartcodierten Fallback
const MASTER_PW = ""; 
const ADMIN_PW_ENTITY = "";
let ADMIN_PW = ""; // Dynamisch über getAdminPw() befüllt, ohne "1234"

// ---- ENTITÄTEN-ÜBERSICHT ----
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
