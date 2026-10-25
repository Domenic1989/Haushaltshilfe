// ---- KONFIGURATION & ANMELDUNG ----
//
// Sicherheit (ab 1.0.7): Alle /api/haushaltshilfe/-Endpunkte verlangen eine
// Home-Assistant-Anmeldung. Das Token kommt
//   1. aus der laufenden HA-Sitzung, wenn das Panel in der HA-Seitenleiste
//      (iframe) geöffnet ist - nichts einzurichten, oder
//   2. für Kiosk/Wand-Tablets mit direktem URL-Aufruf aus einem Long-Lived
//      Access Token, das NUR auf diesem Gerät gespeichert wird.
// Der Server gibt nie mehr ein Token oder Passwort heraus.

const HA_URL = "";
const KIOSK_TOKEN_KEY = "ha_kiosk_token";

// Altlasten aus Versionen <= 1.0.6 entfernen (Klartext-Passwörter / geteiltes Token)
try {
    localStorage.removeItem("ha_master_pw");
    localStorage.removeItem("ha_admin_pw");
    localStorage.removeItem("ha_token");
} catch (e) {}

// HA-Frontend der Elternseite (Panel im iframe, gleiche Origin)
function getParentHass() {
    try {
        if (window.parent && window.parent !== window) {
            const el = window.parent.document.querySelector("home-assistant");
            if (el && el.hass) return el.hass;
        }
    } catch (e) {
        // anderer Origin oder kein HA-Frontend -> Kiosk-Modus
    }
    return null;
}

// Liefert ein gültiges Token für API-Aufrufe (frischt die HA-Sitzung bei Bedarf auf)
async function getAuthToken() {
    const hass = getParentHass();
    if (hass && hass.auth) {
        try {
            if (hass.auth.expired && typeof hass.auth.refreshAccessToken === "function") {
                await hass.auth.refreshAccessToken();
            }
            if (hass.auth.data && hass.auth.data.access_token) {
                return hass.auth.data.access_token;
            }
        } catch (e) {
            console.warn("HA-Sitzungstoken konnte nicht gelesen werden:", e);
        }
    }
    try {
        return localStorage.getItem(KIOSK_TOKEN_KEY) || "";
    } catch (e) {
        return "";
    }
}

// Synchrone Variante: Gibt es überhaupt eine Anmeldung?
function getHAToken() {
    const hass = getParentHass();
    if (hass && hass.auth && hass.auth.data && hass.auth.data.access_token) {
        return hass.auth.data.access_token;
    }
    try {
        return localStorage.getItem(KIOSK_TOKEN_KEY) || "";
    } catch (e) {
        return "";
    }
}

function isInHASession() {
    return getParentHass() !== null;
}

function setKioskToken(token) {
    try {
        if (token) localStorage.setItem(KIOSK_TOKEN_KEY, token);
        else localStorage.removeItem(KIOSK_TOKEN_KEY);
    } catch (e) {}
}

let HA_TOKEN = getHAToken();

// Hängt an jeden Aufruf von /api/haushaltshilfe/ automatisch das Token an.
// So müssen die vielen fetch()-Aufrufe in script.js/finance.js nicht einzeln
// angepasst werden.
(function installAuthFetch() {
    const originalFetch = window.fetch.bind(window);
    let authHintShown = false;

    window.fetch = async function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.indexOf("/api/haushaltshilfe/") === -1) {
            return originalFetch(input, init);
        }

        const opts = Object.assign({}, init || {});
        const headers = new Headers(opts.headers || (input instanceof Request ? input.headers : undefined));
        const token = await getAuthToken();
        if (token) headers.set("Authorization", "Bearer " + token);
        opts.headers = headers;

        const res = await originalFetch(input, opts);
        if (res.status === 401 && !authHintShown) {
            authHintShown = true;
            const msg = "Keine Anmeldung bei Home Assistant.\n\n" +
                "Öffne die Haushaltshilfe über die Seitenleiste von Home Assistant " +
                "oder hinterlege auf diesem Gerät in den System-Einstellungen (⚙️) " +
                "ein Long-Lived Access Token.";
            console.warn(msg);
            if (typeof showAlert === "function") {
                setTimeout(() => showAlert(msg, "Anmeldung fehlt 🔑"), 0);
            }
        }
        return res;
    };
})();

// Lädt die Benutzernamen vom Server (ohne Passwörter)
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

// Prüft das Benutzer-Passwort am Server (es wird kein Token mehr übertragen)
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
            return data.success === true;
        }
    } catch (e) {
        console.error("Login über Backend fehlgeschlagen:", e);
    }
    return false;
}

// Master-/Admin-Passwort werden nur noch serverseitig geprüft
const MASTER_PW = ""; 
const ADMIN_PW_ENTITY = "";
let ADMIN_PW = "";

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
