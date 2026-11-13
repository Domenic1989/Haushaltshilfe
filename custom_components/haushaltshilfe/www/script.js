    let users = []; 
    let isSessionActive = sessionStorage.getItem("session_active");
    let storedUser = localStorage.getItem("selectedUser");
    let user = (isSessionActive || storedUser === "Tablet" || (storedUser && isPersistentUser(storedUser))) ? storedUser : "";
    
    let curTab = sessionStorage.getItem("current_tab") || "home";
    let curTheme = localStorage.getItem("app_theme") || "theme-light";
    
    let curCat = "Alle", lastActivity = Date.now(), isUpdatingFood = false;
    let activeStore = "Aldi", activeRoom = "Küche";
    let stores = [], rooms = [], todoDb = [];
    let tempTodoName = ""; 
    const shopHidden = new Set();   // Einträge, die gerade abgehakt/verschoben werden (nicht zwischendurch wieder zeigen)
    let shopListSig = "";          // letzter gezeichneter Stand der Einkaufsliste

    let db = { 
        shop: { cats: ["Alle",], favs: [] }, 
        food: { cats: ["Alle"], favs: [] }, 
        todo: { cats: ["Alle"], favs: [] } 
    };

    const staticFavs = {
        shop: [],
        food: [],
        todo: []
    };

// ---- MASTER-PASSWORT DYNAMISCH HOLEN ----
const TABS_ENTITY = "input_text.helper_visible_tabs";

function getBaseUrl() {
    let baseUrl = window.location.origin;
    try {
        if (window.parent && window.parent.location && window.parent.location.origin && window.parent.location.origin !== "null") {
            baseUrl = window.parent.location.origin;
        }
    } catch(e) {}
    if (!baseUrl || baseUrl === "null") {
        baseUrl = (typeof HA_URL !== "undefined" && HA_URL !== "") ? HA_URL : window.location.origin;
    }
    return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

// Admin-Modus nicht für jede Aktion neu tippen muss.
let verifiedMasterPw = null;
let verifiedAdminPw = null;

// Ergebnis: "ok" | "wrong" | "noauth" | "error"
async function verifyPassword(kind, password) {
    const baseUrl = getBaseUrl();
    try {
        const res = await fetch(`${baseUrl}/api/haushaltshilfe/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: kind, password: password })
        });
        if (res.ok) return "ok";
        if (res.status === 401) return "noauth";
        if (res.status === 403) return "wrong";
        return "error";
    } catch (e) {
        console.warn("Passwortprüfung fehlgeschlagen:", e);
        return "error";
    }
}

// Fragt das Admin-Passwort ab (oder nutzt das bereits bestätigte) und prüft es am Server
async function requireAdmin() {
    if (verifiedAdminPw !== null) return true;
    const check = await showPasswordPrompt("ADMIN-BEREICH:\nAdmin-Passwort eingeben:");
    if (check === null) return false;
    const result = await verifyPassword("admin", check);
    if (result === "ok") {
        verifiedAdminPw = check;
        return true;
    }
    if (result === "wrong") {
        await showAlert("Passwort falsch! Zugriff verweigert.", "Fehler ❌");
    } else if (result !== "noauth") {
        await showAlert("Server nicht erreichbar.", "Fehler ⚠️");
    }
    return false;
}

// Admin-Aktion an den Server schicken (Benutzer anlegen/ändern/löschen)
async function userAction(payload) {
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/api/haushaltshilfe/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ admin_pw: verifiedAdminPw || "" }, payload))
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 403) verifiedAdminPw = null;
    if (res.ok && Array.isArray(data.users)) users = data.users;
    return { ok: res.ok, message: data.message || `Status ${res.status}` };
}

// ---- TOKEN-FREIE KOMMUNIKATION MIT HOME ASSISTANT (PROXY) ----
async function haGetState(entityId) {
    const baseUrl = getBaseUrl();
    try {
        const r = await fetch(`${baseUrl}/api/haushaltshilfe/proxy?entity_id=${encodeURIComponent(entityId)}`);
        if (!r.ok) return { state: "unknown", attributes: {} };
        return await r.json();
    } catch (e) {
        return { state: "unknown", attributes: {} };
    }
}

async function haFireEvent(eventType, eventData) {
    const baseUrl = getBaseUrl();
    return await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "fire_event", event_type: eventType, event_data: eventData })
    });
}

async function haSetInputText(entityId, value) {
    const baseUrl = getBaseUrl();
    return await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "set_input_text", entity_id: entityId, value: value })
    });
}

// ---- ZUSATZFUNKTIONEN (📦 Vorrat, 🔧 Wartung, 📅 Kalender): in der Integration oder in den App-Einstellungen ein-/ausschaltbar ----
// Was Home Assistant meldet, gilt für alle Geräte. Fehlt die Meldung (ältere Integration), gilt der zuletzt gemerkte Stand dieses Geräts.
const HH_FEATURE_KEYS = ["stock", "maint", "calendar"];
const HH_FEATURE_DEFAULT = ["stock", "maint"];   // wer Vorrat/Wartung schon nutzt, behält sie; der Kalender startet aus
let hhFeatures = (function () {
    try {
        const a = JSON.parse(localStorage.getItem("ha_features") || "null");
        if (Array.isArray(a)) return a.filter(k => HH_FEATURE_KEYS.includes(k));
    } catch (e) { /* egal */ }
    return HH_FEATURE_DEFAULT.slice();
})();
let hhCredLoaded = false;       // Antwort der Integration (Zusatzfunktionen, Kalender) schon gelesen?
let hhCalendars = [];          // [{ entity_id, name, can_create, can_delete }]
let hhCalendarWrite = "";
function hhFeature(key) { return hhFeatures.includes(key); }
function hhSetFeatures(list) {
    hhFeatures = (Array.isArray(list) ? list : []).filter(k => HH_FEATURE_KEYS.includes(k));
    try { localStorage.setItem("ha_features", JSON.stringify(hhFeatures)); } catch (e) { /* egal */ }
}
// Knöpfe, Karten und Haken passend zeigen oder verstecken (die Daten bleiben immer erhalten)
function applyFeaturesToDOM() {
    const show = (id, on) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (on) el.style.removeProperty("display"); else el.style.setProperty("display", "none", "important");
    };
    show("btn-shop-stock", hhFeature("stock"));
    show("home-card-stock", hhFeature("stock"));
    show("btn-todo-maint", hhFeature("maint"));
    show("home-card-maint", hhFeature("maint"));
    show("home-card-calendar", hhFeature("calendar"));
    document.querySelectorAll(".feature-toggle").forEach(cb => { cb.checked = hhFeature(cb.value); });
    if (!hhFeature("stock")) { const m = document.getElementById("stockModal"); if (m) m.style.display = "none"; }
    if (!hhFeature("maint")) { const m = document.getElementById("maintModal"); if (m) m.style.display = "none"; }
    if (!hhFeature("calendar") && typeof calCloseAll === "function") { try { calCloseAll(); } catch (e) { /* egal */ } }
}
window.hhFeature = hhFeature;

// ---- HELFER: SICHTBARE TABS ABFRAGEN & ANWENDEN ----
async function applyVisibleTabs() {
    let visibleTabs = null;
    const baseUrl = getBaseUrl();

    try {
        // Nutzt jetzt EXAKT denselben Endpunkt wie die funktionierenden Passwörter!
        const res = await fetch(`${baseUrl}/api/haushaltshilfe/credentials?_t=${Date.now()}`, {
            cache: "no-store"
        });
        if (res.ok) {
            const data = await res.json();
            if (data) {
                // NEU: Müll-Konfiguration direkt dynamisch vom Server übernehmen
                if (Array.isArray(data.trash_config)) {
                    TRASH_CONFIG = data.trash_config;
                }
                if (Array.isArray(data.visible_tabs)) {
                    visibleTabs = data.visible_tabs;
                    localStorage.setItem("ha_visible_tabs", JSON.stringify(visibleTabs));
                }
                if (Array.isArray(data.features)) hhSetFeatures(data.features);
                if (Array.isArray(data.calendars)) {
                    hhCalendars = data.calendars;
                    hhCalendarWrite = String(data.calendar_write || "");
                }
            }
        }
    } catch (e) {
        console.warn("Konnte Credentials nicht laden:", e);
    }

    if (!visibleTabs || !Array.isArray(visibleTabs)) {
        const local = localStorage.getItem("ha_visible_tabs");
        if (local) {
            try { visibleTabs = JSON.parse(local); } catch(e) {}
        }
    }

    if (!visibleTabs || !Array.isArray(visibleTabs)) {
        visibleTabs = ["shop", "todo", "food", "trash", "finance"];
    }

    hhCredLoaded = true;
    applyTabsToDOM(visibleTabs);
    if (hhFeature("calendar") && typeof renderHomeCalendar === "function") { try { renderHomeCalendar(); } catch (e) { /* Startseite noch nicht da */ } }
    return visibleTabs;
}


function applyTabsToDOM(visibleTabs) {
    // 1. Tab-Buttons in der Navigationsleiste ein-/ausblenden
    const tabMap = {
        "shop": "t-shop",
        "food": "t-food",
        "todo": "t-todo",
        "finance": "t-finance",
        "trash": "t-trash"
    };

    Object.keys(tabMap).forEach(tabKey => {
        const btnId = tabMap[tabKey];
        const btnEl = document.getElementById(btnId);

        if (btnEl) {
            if (visibleTabs.includes(tabKey)) {
                btnEl.style.setProperty("display", "inline-flex", "important");
            } else {
                btnEl.style.setProperty("display", "none", "important");
            }
        }

        // Startseite: Karte des Bereichs nur zeigen, wenn der Bereich eingeschaltet ist
        const homeCards = { todo: "home-card-todo", shop: "home-card-shop", food: "home-card-food", finance: "home-card-money" };
        const cardEl = homeCards[tabKey] ? document.getElementById(homeCards[tabKey]) : null;
        if (cardEl) {
            if (visibleTabs.includes(tabKey)) cardEl.style.removeProperty("display");
            else cardEl.style.setProperty("display", "none", "important");
        }
    });

    // 2. WICHTIG: Die Checkboxen im Einstellungs-Dialog (.tab-toggle) aktualisieren!
    const checkboxes = document.querySelectorAll(".tab-toggle");
    checkboxes.forEach(cb => {
        cb.checked = visibleTabs.includes(cb.value);
    });

    // 3. Zusatzfunktionen (Vorrat, Wartung, Kalender)
    applyFeaturesToDOM();
}



window.applyVisibleTabs = applyVisibleTabs;

document.addEventListener("DOMContentLoaded", () => {
    applyVisibleTabs();

    const appEl = document.getElementById("app");
    if (appEl) {
        const appObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "style" || mutation.attributeName === "class") {
                    applyVisibleTabs();
                }
            });
        });
        appObserver.observe(appEl, { attributes: true });
    }
});

// --- 1. Für normale Hinweise / Fehler (wie "Passwort falsch") ---
let deleteResolver = null;

function showDeleteModal(message, title = "Benutzer löschen", confirmButtonText = "Löschen") {
    return new Promise((resolve) => {
        deleteResolver = resolve;
        const modal = document.getElementById('customDeleteModal');
        const titleEl = document.getElementById('customDeleteTitle');
        const msgEl = document.getElementById('customDeleteMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
        
        // Optional: Wenn dein Bestätigungs-Button im HTML eine ID hat (z.B. id="customDeleteConfirmBtn"),
        // können wir den Text hier dynamisch anpassen:
        const confirmBtn = document.getElementById('customDeleteConfirmBtn');
        if (confirmBtn) confirmBtn.innerText = confirmButtonText;

        if (modal) modal.style.display = 'flex';
    });
}

function resolveDelete(val) {
    const modal = document.getElementById('customDeleteModal');
    if (modal) modal.style.display = 'none';
    if (deleteResolver) {
        deleteResolver(val);
        deleteResolver = null;
    }
}

// ---- SAUBERE ALERT & CONFIRM FUNKTIONEN FÜR DIE NEUEN MODALS ----
let confirmResolver = null;

function showAlert(message, title = "Hinweis") {
    return new Promise((resolve) => {
        confirmResolver = resolve;
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('customConfirmTitle');
        const msgEl = document.getElementById('customConfirmMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
        
        if (modal) modal.style.display = 'flex';
    });
}

function resolveConfirm(val) {
    const modal = document.getElementById('customConfirmModal');
    if (modal) modal.style.display = 'none';
    if (confirmResolver) {
        confirmResolver(val);
        confirmResolver = null;
    }
}


// --- 1. GERÄTE-ID (Muss als allererstes da sein) ---
let deviceId = localStorage.getItem('house_central_device_id');
if (!deviceId) {
    const ua = navigator.userAgent;
    const screenRes = window.screen.width + 'x' + window.screen.height;
    const rawStr = ua + '_' + screenRes;
    let hash = 0;
    for (let i = 0; i < rawStr.length; i++) {
        hash = ((hash << 5) - hash) + rawStr.charCodeAt(i);
        hash |= 0;
    }
    deviceId = 'dev_' + Math.abs(hash);
    localStorage.setItem('house_central_device_id', deviceId);
}

// Globale Variablen (nur einmal deklariert!)
let currentAppZoom = parseFloat(localStorage.getItem('house_central_zoom')) || 1.0;
window.curTheme = localStorage.getItem('app_theme') || 'theme-glass';

// Sofort beim Start lokal anwenden, damit alles sofort da ist!
document.addEventListener("DOMContentLoaded", () => {
    applyAppZoom(currentAppZoom);
    document.body.className = window.curTheme;
    
    // Versuche im Hintergrund die Server-Werte zu holen (blockiert den Start nicht!)
    loadDeviceZoom();
});

// Wendet den Zoom auf das gesamte Dokument an
function applyAppZoom(zoomVal) {
    currentAppZoom = zoomVal;
    document.documentElement.style.setProperty('--app-zoom', currentAppZoom);
    document.body.style.zoom = currentAppZoom; // Für Desktop/Fully Kiosk/Tablet
    
    const pctText = Math.round(currentAppZoom * 100) + '%';

    // 1. Anzeige in den System-Einstellungen aktualisieren
    const label = document.getElementById('zoomPercentLabel');
    if (label) {
        label.innerText = pctText;
    }

    // 2. Anzeige oben im Theme-Dropdown (Schnellmenü) aktualisieren
    const quickLabel = document.getElementById('quickZoomLabel');
    if (quickLabel) {
        quickLabel.innerText = pctText;
    }

    // 3. Slider in den Einstellungen synchron halten
    const range = document.getElementById('systemZoomRange');
    if (range) {
        range.value = currentAppZoom;
    }
}

// Speichert den Zoom direkt über deine bestehende API
async function saveQuickDeviceZoom(val) {
    localStorage.setItem('house_central_zoom', val);
    localStorage.setItem('app_zoom', val);
    localStorage.setItem('systemZoom', val);
    
    try {
        const baseUrl = getBaseUrl();
        const payload = { 
            device_id: deviceId, 
            zoom: val 
        };

        await fetch(`${baseUrl}/api/haushaltshilfe/update_credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.log("Schnell-Zoom im Hintergrund gespeichert (lokaler Fallback aktiv).");
    }
}

// Live-Vorschau beim Verschieben des Reglers in den System-Einstellungen
window.previewSystemZoom = function(val) {
    applyAppZoom(parseFloat(val));
};

// Feinjustierung über die Plus/Minus-Buttons (Einstellungen & Schnellmenü)
window.adjustSystemZoom = function(step) {
    let newVal = Math.min(1.6, Math.max(0.6, Math.round((currentAppZoom + step) * 100) / 100));
    applyAppZoom(newVal);
    saveQuickDeviceZoom(newVal); // Speichert sofort ab
};

// Schnell-Reset per Klick auf die Prozentzahl im Dropdown
window.resetQuickZoom = function() {
    applyAppZoom(1.0);
    saveQuickDeviceZoom(1.0);
};

async function loadDeviceZoom() {
    try {
        const baseUrl = getBaseUrl();
        const res = await fetch(`${baseUrl}/api/haushaltshilfe/get_zoom?device_id=${deviceId}`);
        if (res.ok) {
            const data = await res.json();
            if (data) {
                // Zoom vom Server übernehmen, falls vorhanden
                if (data.zoom !== undefined && parseFloat(data.zoom) !== currentAppZoom) {
                    currentAppZoom = parseFloat(data.zoom);
                    applyAppZoom(currentAppZoom);
                }
                // Theme vom Server übernehmen, falls vorhanden (inkl. Winter & Weihnachten!)
                if (data.theme) {
                    window.curTheme = data.theme;
                    const themes = ["theme-light", "theme-dark", "theme-glass", "theme-blue", "theme-green", "theme-winter", "theme-xmas", "theme-bayern"];
                    document.body.classList.remove(...themes);
                    document.body.className = window.curTheme;
                    localStorage.setItem('app_theme', window.curTheme);
                }
            }
        }
    } catch (e) {
        console.log("Server im Hintergrund nicht erreichbar, nutze lokale Werte.");
    }
}


/* --- ERWEITERTE SYSTEM-EINSTELLUNGEN --- */

window.openSystemSettings = async function() {
    try {
        const elToken = document.getElementById("set_token");
        const elMaster = document.getElementById("set_master_pw");
        const elAdmin = document.getElementById("set_admin_pw");

        // Ohne Anmeldung (Kiosk ohne Token) kann der Server nichts prüfen:
        // dann nur das Token-Feld anbieten.
        const tokenOnly = !getHAToken();

        if (!tokenOnly) {
            const eingabe = await showPasswordPrompt("SYSTEM-ZUGRIFF:\nMaster-Passwort eingeben:");
            if (eingabe === null) return;

            const result = await verifyPassword("master", eingabe);
            if (result === "wrong") {
                await showAlert("Master-Passwort falsch! Zugriff verweigert.", "Zugriff verweigert ❌");
                return;
            }
            if (result !== "ok" && result !== "noauth") {
                await showAlert("Server nicht erreichbar.", "Fehler ⚠️");
                return;
            }
            verifiedMasterPw = result === "ok" ? eingabe : null;
        }

        const visibleTabs = await applyVisibleTabs();

        // Das HA-Sitzungstoken wird nie angezeigt, nur ein manuell hinterlegtes Kiosk-Token
        if (elToken) {
            elToken.value = "";
            elToken.placeholder = isInHASession()
                ? "Nicht nötig (HA-Sitzung aktiv)"
                : (getHAToken() ? "Token hinterlegt - leer lassen = unverändert" : "Long-Lived Access Token einfügen");
        }
        if (elMaster) elMaster.value = "";
        if (elAdmin) elAdmin.value = "";

        document.querySelectorAll(".settings-protected").forEach(el => {
            el.style.display = (tokenOnly || verifiedMasterPw === null) ? "none" : "";
        });

        // Zoom-Wert beim Öffnen im Regler & Label anzeigen
        applyAppZoom(currentAppZoom);
        hhHintsSync();

        document.querySelectorAll(".tab-toggle").forEach(cb => {
            cb.checked = visibleTabs.includes(cb.value);
        });

        const overlay = document.getElementById("settingsOverlay");
        if (overlay) overlay.style.display = "flex";
    } catch (err) {
        await showAlert("Fehler beim Öffnen der Einstellungen: " + err.message, "Fehler ⚠️");
    }
};

window.saveSystemSettings = async function() {
    try {
        const elMaster = document.getElementById("set_master_pw");
        const elAdmin = document.getElementById("set_admin_pw");
        const elToken = document.getElementById("set_token");

        // Zoom-Faktor lokal als Backup sichern
        localStorage.setItem('house_central_zoom', currentAppZoom);

        // Bedienhinweise (nur dieses Gerät)
        const hintCb = document.getElementById("hintsToggle");
        if (hintCb) hhHintsSetOn(hintCb.checked);

        // Kiosk-Token nur auf diesem Gerät speichern
        const newToken = elToken ? elToken.value.trim() : "";
        if (newToken) {
            setKioskToken(newToken);
            HA_TOKEN = newToken;
        }

        const baseUrl = getBaseUrl();
        const payload = { device_id: deviceId, zoom: currentAppZoom };

        // Passwörter/Tabs nur, wenn das Master-Passwort in dieser Sitzung bestätigt wurde
        if (verifiedMasterPw !== null) {
            const newMasterPw = elMaster ? elMaster.value.trim() : "";
            const newAdminPw = elAdmin ? elAdmin.value.trim() : "";
            const selectedTabs = Array.from(document.querySelectorAll(".tab-toggle:checked")).map(cb => cb.value);

            const selectedFeatures = Array.from(document.querySelectorAll(".feature-toggle:checked")).map(cb => cb.value);

            payload.current_master_pw = verifiedMasterPw;
            payload.visible_tabs = selectedTabs;
            payload.features = selectedFeatures;
            hhSetFeatures(selectedFeatures);
            if (newMasterPw) payload.master_pw = newMasterPw;   // leer = unverändert
            if (newAdminPw) payload.admin_pw = newAdminPw;      // leer = unverändert
            localStorage.setItem("ha_visible_tabs", JSON.stringify(selectedTabs));
        }

        const updateRes = await fetch(`${baseUrl}/api/haushaltshilfe/update_credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (newToken && updateRes.status === 401) {
            await showAlert("Das eingegebene Token wird von Home Assistant nicht akzeptiert.", "Token ungültig ❌");
            return;
        }
        if (!updateRes.ok) {
            const errText = await updateRes.text();
            await showAlert(`Server-Fehler (Status ${updateRes.status}): ${errText}`, "Server-Fehler ❌");
            return;
        }

        verifiedMasterPw = null;
        verifiedAdminPw = null;

        await showAlert("Einstellungen erfolgreich gespeichert!", "Erfolg 🎉");
        const overlay = document.getElementById("settingsOverlay");
        if (overlay) overlay.style.display = "none";

        location.reload();
    } catch (err) {
        await showAlert("Schwerwiegender Fehler beim Speichern: " + err.message, "Fehler ❌");
    }
};

window.closeSystemSettingsCancel = function() {
    verifiedMasterPw = null;
    const overlay = document.getElementById("settingsOverlay");
    if (overlay) {
        overlay.style.display = "none";
    }
};



async function toggleUserAdmin() {  
    if (await requireAdmin()) {
        document.getElementById("userGrid").classList.add("admin-mode");
        document.getElementById("admin-open-btn").style.setProperty("display", "none", "important");
        document.getElementById("admin-close-btn").style.setProperty("display", "block", "important");
    }
}

function closeUserAdmin() {
    verifiedAdminPw = null;
    document.getElementById("userGrid").classList.remove("admin-mode");
    document.getElementById("admin-open-btn").style.setProperty("display", "block", "important");
    document.getElementById("admin-close-btn").style.setProperty("display", "none", "important");
}
    
function showPasswordPrompt(title = "Passwort eingeben:") {
    return new Promise((resolve) => {
        const modal = document.getElementById("passwordModal");
        const titleElem = document.getElementById("passwordModalTitle");
        const inputElem = document.getElementById("passwordModalInput");

        titleElem.innerText = title;
        inputElem.value = "";
        modal.style.display = "flex";
        inputElem.focus();

        inputElem.onkeydown = (e) => {
            if (e.key === "Enter") {
                closePasswordModal(true);
            }
        };

        window.currentPasswordResolve = resolve;
    });
}

function closePasswordModal(confirmed) {
    const modal = document.getElementById("passwordModal");
    const inputElem = document.getElementById("passwordModalInput");
    const val = inputElem.value;
    
    modal.style.display = "none";
    inputElem.onkeydown = null;

    if (window.currentPasswordResolve) {
        window.currentPasswordResolve(confirmed ? val : null);
        window.currentPasswordResolve = null;
    }
}    


let isEditingUser = false;

async function addUserPrompt() {
    if (await requireAdmin()) {
        isEditingUser = false;
        document.getElementById("userModalTitle").innerText = "Neuen Benutzer erstellen";
        document.getElementById("userModalOldStr").value = "";
        document.getElementById("userModalName").value = "";
        document.getElementById("userModalPw").value = "";
        document.getElementById("userModalPersistent").checked = false;
        
        document.getElementById("userModalPw").placeholder = "Passwort";
        document.getElementById("userModal").style.display = "flex";
        document.getElementById("userModalName").focus();
    }
}

function closeUserModal() {
    document.getElementById("userModal").style.display = "none";
}

async function saveUserModal() {
    const nameInput = document.getElementById("userModalName").value.trim();
    const pwInput = document.getElementById("userModalPw").value.trim();
    const persistentChecked = document.getElementById("userModalPersistent").checked;
    const oldStr = document.getElementById("userModalOldStr").value;

    // Beim Bearbeiten darf das Passwort leer bleiben (= unverändert)
    if (!nameInput || (!isEditingUser && !pwInput)) {
        alert("Bitte Name und Passwort ausfüllen!");
        return;
    }
    if (nameInput.includes(":")) {
        alert("Der Name darf keinen Doppelpunkt enthalten!");
        return;
    }

    const payload = isEditingUser
        ? { action: "update", old_name: oldStr.split(':')[0], name: nameInput, password: pwInput, persistent: persistentChecked }
        : { action: "add", name: nameInput, password: pwInput, persistent: persistentChecked };

    const result = await userAction(payload);
    if (!result.ok) {
        await showAlert("Speichern fehlgeschlagen: " + result.message, "Fehler ❌");
        return;
    }

    renderUserGrid();
    closeUserModal();
}

function isPersistentUser(uName) {
    if (!users || !Array.isArray(users)) return false;
    const found = users.find(x => x.startsWith(uName + ':'));
    if (!found) return false;
    const parts = found.split(':');
    return parts[2] === 'persistent';
}

let inputResolver = null;

function showInputPrompt(message, title = "Eingabe", prefill = "") {
    return new Promise((resolve) => {
        inputResolver = resolve;
        const modal = document.getElementById('customInputModal');
        const titleEl = document.getElementById('customInputTitle');
        const msgEl = document.getElementById('customInputMessage');
        const inputEl = document.getElementById('customInputField');
        
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
        if (inputEl) {
            inputEl.value = prefill || ""; // Vorheriges leeren (oder Vorschlag eintragen)
            setTimeout(() => inputEl.focus(), 100); // Direkt fokussieren
        }
        
        if (modal) modal.style.display = 'flex';
    });
}

function resolveInput(confirmed) {
    const modal = document.getElementById('customInputModal');
    const inputEl = document.getElementById('customInputField');
    let value = null;
    
    if (confirmed && inputEl) {
        value = inputEl.value.trim();
    }
    
    if (modal) modal.style.display = 'none';
    if (inputResolver) {
        inputResolver(value);
        inputResolver = null;
    }
}

async function addNewCat(t) {  
    if (await requireAdmin()) {
        const n = await showInputPrompt("Bitte Namen der neuen Kategorie eingeben:", "Kategorie hinzufügen");  
        if(n) { db[t].cats.push(n); syncUp(); render(); }  
    }  
}

async function addNewFav(t) {  
    if (await requireAdmin()) {
        const n = await showInputPrompt("Bitte Namen des Favoriten eingeben:", "Favorit hinzufügen");  
        if(n) { db[t].favs.push({n, c:curCat}); syncUp(); render(); }  
    }  
}

function toggleThemeMenu(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const dropdown = document.getElementById("themeDropdown");
    if (dropdown) {
        dropdown.classList.toggle("show");
    }
}

async function setTheme(themeName) {
    const themes = ["theme-light", "theme-dark", "theme-glass", "theme-blue", "theme-green", "theme-winter", "theme-xmas", "theme-newyear", "theme-royal", "theme-spring"];
    document.body.classList.remove(...themes);
    window.curTheme = themeName;
    document.body.className = window.curTheme;
    localStorage.setItem("app_theme", window.curTheme);
    
    try {
        const baseUrl = getBaseUrl();
        await fetch(`${baseUrl}/api/haushaltshilfe/update_zoom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                device_id: deviceId, 
                theme: window.curTheme 
            })
        });
    } catch (e) {
        console.error("Konnte Theme nicht speichern:", e);
    }
    
    const dropdown = document.getElementById("themeDropdown");
    if (dropdown) dropdown.classList.remove("show");
}

// --- THEME MODUS (AUTO ODER MANUELL) SCHALTEN ---
function toggleThemeMode() {
    let currentMode = localStorage.getItem("theme_mode") || "auto";
    
    if (currentMode === "auto") {
        localStorage.setItem("theme_mode", "manual");
        showThemeModeUI("Manuell ✋");
    } else {
        localStorage.setItem("theme_mode", "auto");
        showThemeModeUI("Auto 🤖");
        checkAndSwitchSeasonalTheme();
    }
}

// Aktualisiert nur noch den Text des Buttons
function showThemeModeUI(text) {
    const btn = document.getElementById("themeModeBtn");
    if (btn) {
        btn.innerText = text;
        // Optional: Falls du im JS noch eine Klasse für den Zustand setzen willst (z.B. für CSS-Styling)
        if (text.includes("Manuell")) {
            btn.classList.add("is-manual");
        } else {
            btn.classList.remove("is-manual");
        }
    }
}

// --- AUTOMATISCHER LIVE-THEME-WECHSEL ---
function checkAndSwitchSeasonalTheme() {
    const mode = localStorage.getItem("theme_mode") || "auto";
    if (mode === "manual") {
        return; 
    }

    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    let targetTheme = null;

    if (month === 12 && day <= 30) {
        targetTheme = "theme-xmas";
    } else if ((month === 12 && day >= 31) || (month === 1 && day <= 2)) {
        targetTheme = "theme-newyear";
    }

    if (targetTheme) {
        if (!document.body.classList.contains(targetTheme)) {
            if (typeof setTheme === "function") {
                setTheme(targetTheme);
            } else {
                document.body.className = document.body.className.replace(/theme-\S+/g, '');
                document.body.classList.add(targetTheme);
                localStorage.setItem("app_theme", targetTheme);
            }
            console.log("Automatischer Jahreszeit-Wechsel zu: " + targetTheme);
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const savedMode = localStorage.getItem("theme_mode") || "auto";
    showThemeModeUI(savedMode === "auto" ? "Auto 🤖" : "Manuell ✋");
    checkAndSwitchSeasonalTheme();
});

setInterval(() => {
    checkAndSwitchSeasonalTheme();
}, 60000);

window.addEventListener('click', function(event) {
    const dropdown = document.getElementById("themeDropdown");
    const button = document.querySelector('.theme-toggle-top');
    if (dropdown && dropdown.classList.contains('show')) {
        if (button && !button.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    }
});

window.onload = async () => { 
    document.body.className = curTheme;
    
    await loadUsers(); 
    renderUserGrid();

    if (!user && storedUser && (storedUser === "Tablet" || isPersistentUser(storedUser))) {
        user = storedUser;
    }

    if (user) {
        await startApp(); 
    }
    highlightToday(); 

    const shopInput = document.getElementById("shopQtyValue");
    if (shopInput) {
        shopInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                confirmShopAdd();
            }
        });
    }

    const intervalInput = document.getElementById("modalValue");
    if (intervalInput) {
       intervalInput.addEventListener("keypress", (e) => {
           if (e.key === "Enter") {
                e.preventDefault();
                confirmInterval('t'); 
            }
        });
    }
    
    const pwInput = document.getElementById("pw");
    if (pwInput) {
        pwInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                doLogin();
            }
        });
    }
};

window.onclick = () => { lastActivity = Date.now(); };

async function loadUsers() {
    try {
        const baseUrl = getBaseUrl();
        const response = await fetch(`${baseUrl}/api/haushaltshilfe/users`);
        if (response.ok) {
            const data = await response.json();
            if (data && data.users) {
                if (typeof data.users === 'string') {
                    try { users = JSON.parse(data.users); } catch(err) { users = []; }
                } else if (Array.isArray(data.users)) {
                    users = data.users;
                }
            }
        }
        if (typeof renderUserGrid === 'function') {
            renderUserGrid();
        }
    } catch(e) {
        console.warn("Laden der Benutzer über API fehlgeschlagen:", e);
    }
}

// saveUsers() entfernt: Die komplette Liste (mit Passwörtern) wird nicht mehr
// hochgeladen. Änderungen laufen einzeln über userAction() mit Admin-Passwort.
function renderUserGrid() {
    const grid = document.getElementById("userGrid");
    if (!grid) return;
    grid.replaceChildren();

    if (!users || users.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style.cssText = "grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-muted, #888); font-size: 0.95rem;";
        emptyDiv.textContent = "Bitte einen Benutzer erstellen";
        grid.appendChild(emptyDiv);
        return;
    }

    const colors = ['#FF5733', '#34C759', '#007AFF', '#FF9500', '#5856D6', '#FF2D55'];
    users.forEach((uStr, i) => {
        const [uName, uPw] = uStr.split(':');
        const initial = uName ? uName.charAt(0).toUpperCase() : "";
        const color = colors[i % colors.length];

        // 1. Haupt-Button für den Benutzer
        const btn = document.createElement("button");
        btn.className = `user-btn ${user === uName ? 'selected' : ''}`;
        btn.style.position = "relative";
        btn.addEventListener("click", () => selUser(uName, btn));

        // 2. Innerer Flex-Container (Avatar + Name)
        const innerFlex = document.createElement("div");
        innerFlex.style.cssText = "display:flex; align-items:center; gap:10px; padding-left:5px;";

        const avatar = document.createElement("div");
        avatar.style.cssText = `width:30px; height:30px; background:${color}; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:0.8rem; flex-shrink:0;`;
        avatar.textContent = initial;

        const nameSpan = document.createElement("span");
        nameSpan.style.cssText = "flex:1; text-align:left;";
        nameSpan.textContent = uName; // Hier absolut sicher dank textContent!

        innerFlex.appendChild(avatar);
        innerFlex.appendChild(nameSpan);

        // 3. Stift-Button zum Ändern des Passworts
        const editPen = document.createElement("div");
        editPen.className = "user-edit-pen";
        editPen.style.cssText = "position:absolute; top:-8px; left:-8px; background:var(--accent); color:white; width:26px; height:26px; border-radius:50%; font-size:12px; display:none; align-items:center; justify-content:center; border:2.5px solid white; z-index:10; cursor:pointer;";
        editPen.textContent = "✏️";
        editPen.addEventListener("click", (e) => {
            e.stopPropagation();
            changeUserPassword(uStr);
        });

        // 4. X-Button zum Löschen des Benutzers
        const delX = document.createElement("div");
        delX.className = "user-del-x";
        delX.style.cursor = "pointer";
        delX.textContent = "×";
        delX.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteUser(uStr);
        });

        btn.appendChild(innerFlex);
        btn.appendChild(editPen);
        btn.appendChild(delX);
        grid.appendChild(btn);
    });
}

async function deleteUser(uStr) {  
    const uName = uStr.split(':')[0];
    
    const confirmed = await showDeleteModal(`Möchtest du den Benutzer "${uName}" wirklich löschen?`, "Benutzer löschen");
    
    if (confirmed) {  
        if (!(await requireAdmin())) return;
        const result = await userAction({ action: "delete", name: uName });
        if (!result.ok) {
            await showAlert("Löschen fehlgeschlagen: " + result.message, "Fehler ❌");
            return;
        }
        renderUserGrid();  
    }
}

function selUser(u, b) { 
    user = u; 
    document.querySelectorAll('.user-btn').forEach(x => x.classList.remove('selected')); 
    b.classList.add('selected'); 
}

async function doLogin() { 
    const enteredPw = document.getElementById("pw").value;
    // Passwort wird ausschließlich am Server geprüft
    const foundUser = await loginUserViaBackend(user, enteredPw);

    if (foundUser) {
        sessionStorage.setItem("session_active", "true");
        localStorage.setItem("selectedUser", user);
        await startApp(); 
        if (curTab === 'todo') {
            renderTodoList();
        }
    } else { 
        await showAlert("Das eingegebene Passwort ist falsch!", "Anmeldung fehlgeschlagen ❌"); 
    }
}
    
async function changeUserPassword(uStr) {
    if (await requireAdmin()) {
        const parts = uStr.split(':');
        const uName = parts[0];
        const isPersistent = parts[2] === 'persistent';

        isEditingUser = true;
        
        // Sicherer Text ohne rohes Template-HTML
        const modalTitle = document.getElementById("userModalTitle");
        if (modalTitle) {
            modalTitle.textContent = `Benutzer "${uName}" bearbeiten`;
        }

        document.getElementById("userModalOldStr").value = uStr;
        document.getElementById("userModalName").value = uName;
        document.getElementById("userModalPw").value = "";
        document.getElementById("userModalPw").placeholder = "Leer lassen = Passwort unverändert";
        document.getElementById("userModalPersistent").checked = isPersistent;

        document.getElementById("userModal").style.display = "flex";
        document.getElementById("userModalPw").focus();
    }
}
    
function togglePasswordVisibility() {
    const pwInput = document.getElementById("pw");
    const eyeBtn = document.getElementById("eye-icon");
    if (pwInput.type === "password") {
        pwInput.type = "text";
        eyeBtn.innerText = "🔒";
    } else {
        pwInput.type = "password";
        eyeBtn.innerText = "👁️";
    }
}

async function startApp() {
    const loginOverlay = document.getElementById("loginOverlay");
    const appEl = document.getElementById("app");
    if (loginOverlay) loginOverlay.style.display = "none";
    if (appEl) appEl.style.display = "block";

    console.log("Starte initialen Daten-Sync...");
    await syncDown();
    console.log("Initialer Sync abgeschlossen.");

    tab(curTab); 

    setInterval(load, 2000);
    setInterval(updateStatus, 1000);
    setInterval(syncDown, 20000); 
    setInterval(loadTrash, 600000);
    setInterval(updateAppBadges, 1000);
}

async function syncUpSidebar(type) {
    const ent = type === 'shop' ? STORES_ENTITY : ROOMS_ENTITY;
    const val = type === 'shop' ? stores : rooms;
    try { await haSetInputText(ent, JSON.stringify(val)); } catch(e) {}
}

async function renderSidebars() {
    let allOptions = [];
    try {
        const cfg = SYNC_CONFIG.shopping;
        const d = await haGetState(cfg.entity);
        
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            allOptions = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }
    } catch(e) { 
        console.error("Sidebar-Zählung Shop fehlgeschlagen", e); 
    }

    // Gerade wird gezogen: erst danach neu zeichnen (sonst verschwindet das Element unter dem Finger)
    if (typeof hhSortBusy === "function" && hhSortBusy()) { hhSortLater(renderSidebars); return; }

    // --- SHOP SIDEBAR ---
    const shopSide = document.getElementById("shopSidebar");
    if(shopSide) {
        shopSide.replaceChildren();
        stores.forEach((s, index) => {
            const count = allOptions.filter(opt => opt.endsWith(` @${s}`)).length;
            
            const btn = document.createElement('button');
            btn.className = `side-btn ${activeStore === s ? 'active-shop' : ''}`;
            btn.dataset.index = index;
            btn.dataset.type = 'shop';
            btn.dataset.dropStore = s;   // Ziel zum Verschieben von Artikeln

            btn.onclick = () => { 
                if (btn.dataset.wasDragged === "true") return;
                activeStore = s; 
                renderSidebars(); 
                load(); 
            };
            btn.oncontextmenu = (e) => { 
                e.preventDefault(); 
                if (!btn.classList.contains('dragging-side-btn')) {
                    deleteSidebarItem('shop', s); 
                }
            };

            // 1. Mülleimer zuerst (links)
            const del = document.createElement('span');
            del.textContent = "🗑️ ";
            del.className = "del-sidebar";
            del.style.marginRight = "6px";
            del.style.cursor = "pointer";
            del.onclick = (e) => {
                e.stopPropagation();
                deleteSidebarItem('shop', s);
            };
            btn.appendChild(del);

            // 2. Danach Name + Badge (sicher ohne innerHTML!)
            const txt = document.createElement('span');
            txt.style.display = "flex";
            txt.style.alignItems = "center";
            txt.style.gap = "8px";
            txt.style.pointerEvents = "none";

            const nameSpan = document.createElement('span');
            nameSpan.textContent = s;
            txt.appendChild(nameSpan);

            if (count > 0) {
                const badgeEl = document.createElement('span');
                badgeEl.className = "shop-badge";
                badgeEl.textContent = String(count);
                txt.appendChild(badgeEl);
            }

            btn.appendChild(txt);

            // Sortieren per Ziehen (Handy: gedrückt halten, PC: Maus)
            hhSortBind(btn, 'shop', index, (f, t) => applySidebarNewOrder('shop', f, t), { ignore: '.del-sidebar', label: s });

            shopSide.appendChild(btn);
        });

        const addBtn = document.createElement('button');
        addBtn.className = "side-btn side-btn-add";
        addBtn.textContent = "+ Ort";
        addBtn.onclick = () => addSidebarItem('shop');
        shopSide.appendChild(addBtn);
    }

    // --- TODO SIDEBAR (RÄUME) ---
    const todoSide = document.getElementById("todoSidebar");
    if(todoSide) {
        todoSide.replaceChildren();
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        rooms.forEach((r, index) => {
            const roomTasks = todoDb.filter(t => t.room === r);
            const totalCount = roomTasks.length;
            const hasUrgent = roomTasks.some(t => new Date(t.nextDate) <= todayEnd);
            
            const isActive = activeRoom === r;

            const btn = document.createElement('button');
            btn.className = `side-btn ${isActive ? 'active-todo' : ''}`;
            btn.dataset.index = index;
            btn.dataset.type = 'todo';

            btn.onclick = () => { 
                if (btn.dataset.wasDragged === "true") return;
                activeRoom = r; 
                renderSidebars(); 
                renderTodoList(); 
            };
            btn.oncontextmenu = (e) => { 
                e.preventDefault(); 
                if (!btn.classList.contains('dragging-side-btn')) {
                    deleteSidebarItem('todo', r); 
                }
            };

            // 1. Mülleimer zuerst (links)
            const del = document.createElement('span');
            del.textContent = "🗑️ ";
            del.className = "del-sidebar";
            del.style.marginRight = "6px";
            del.style.cursor = "pointer";
            del.onclick = (e) => {
                e.stopPropagation();
                deleteSidebarItem('todo', r);
            };
            btn.appendChild(del);

            // 2. Danach Raumname + Badge (sicher ohne innerHTML!)
            const txt = document.createElement('span');
            txt.style.display = "flex";
            txt.style.alignItems = "center";
            txt.style.gap = "8px";
            txt.style.pointerEvents = "none";

            const roomSpan = document.createElement('span');
            roomSpan.textContent = r;
            txt.appendChild(roomSpan);

            if (totalCount > 0) {
                const badgeEl = document.createElement('span');
                badgeEl.className = hasUrgent ? 'shop-badge badge-blink' : 'shop-badge';
                if (!isActive) {
                    badgeEl.style.background = hasUrgent ? "var(--danger)" : "#8e8e93";
                }
                badgeEl.textContent = String(totalCount);
                txt.appendChild(badgeEl);
            }

            btn.appendChild(txt);

            // Sortieren per Ziehen (Handy: gedrückt halten, PC: Maus)
            hhSortBind(btn, 'todo', index, (f, t) => applySidebarNewOrder('todo', f, t), { ignore: '.del-sidebar', label: r });

            todoSide.appendChild(btn);
        });

        const addBtnTodo = document.createElement('button');
        addBtnTodo.className = "side-btn side-btn-add";
        addBtnTodo.textContent = "+ Raum";
        addBtnTodo.onclick = () => addSidebarItem('todo');
        todoSide.appendChild(addBtnTodo);
    }

    hhHintSet("shop", Array.isArray(stores) ? stores.length : 0);
    hhHintSet("todo", Array.isArray(rooms) ? rooms.length : 0);
}


// ========================================================
// --- SORTIEREN PER ZIEHEN (Geschäfte, Räume, Jahre, Monate) ---
// Handy/Tablet: Element kurz gedrückt halten, dann ziehen (normales Scrollen geht weiter).
// PC: einfach mit der Maus ziehen. Ein "Geist" folgt dem Finger, die Ziel-Stelle bekommt einen Balken,
// am Rand wird automatisch gescrollt. Esc bricht ab. (Artikel im Einkauf verschieben: eigener Code, siehe shopDrag.)
// ========================================================
const hhSort = {
    pending: false, active: false, el: null, group: "", from: -1, to: -1, row: false,
    timer: 0, raf: 0, ghost: null, bar: null, scrollers: [], later: [],
    sx: 0, sy: 0, x: 0, y: 0, mode: "", onDrop: null, shield: 0, pid: -1
};

function hhZoom() { return (typeof currentAppZoom === "number" && currentAppZoom > 0) ? currentAppZoom : 1; }
function hhSortBusy() { return hhSort.pending || hhSort.active; }
// Etwas erst nach dem Ziehen tun (z. B. Liste neu zeichnen, die sonst unter dem Finger verschwindet)
function hhSortLater(fn) { if (!hhSort.later.includes(fn)) hhSort.later.push(fn); }

// opts: { label: Text im Geist, ignore: Selektor für Stellen, an denen nicht gezogen wird (z. B. Mülleimer) }
function hhSortBind(el, group, index, onDrop, opts) {
    if (!el) return;
    const o = opts || {};
    el.dataset.sortGroup = group;
    el.dataset.sortIndex = String(index);
    if (o.label) el.dataset.sortLabel = o.label;
    el.draggable = false;
    el.addEventListener("pointerdown", e => hhSortDown(e, el, group, onDrop, o.ignore || ""));
}

function hhSortItems(group) { return Array.from(document.querySelectorAll('[data-sort-group="' + group + '"]')); }

function hhSortDown(e, el, group, onDrop, ignore) {
    const s = hhSort;
    if (s.pending || s.active) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const skip = (ignore ? ignore + "," : "") + "input, select, textarea, [contenteditable]";
    if (e.target && e.target.closest && e.target.closest(skip)) return;
    if (hhSortItems(group).length < 2) return;                       // nichts zum Sortieren
    s.pending = true; s.active = false;
    s.el = el; s.group = group; s.onDrop = onDrop;
    s.from = s.to = parseInt(el.dataset.sortIndex, 10);
    s.sx = s.x = e.clientX; s.sy = s.y = e.clientY;
    s.mode = (e.pointerType === "mouse") ? "mouse" : "touch";
    s.pid = e.pointerId;                                              // nur dieser Finger / Zeiger zählt (zweiter Finger stört nicht)
    if (s.mode === "touch") s.timer = setTimeout(hhSortStart, 380);  // erst gedrückt halten, damit Scrollen weiter geht
    document.addEventListener("pointermove", hhSortMove, true);
    document.addEventListener("pointerup", hhSortUp, true);
    document.addEventListener("pointercancel", hhSortCancel, true);
    document.addEventListener("keydown", hhSortKey, true);
}

function hhSortStart() {
    const s = hhSort;
    if (!s.pending || s.active) return;
    clearTimeout(s.timer);
    if (!s.el || !s.el.isConnected) { hhSortCleanup(); return; }
    s.pending = false; s.active = true;
    const items = hhSortItems(s.group);
    if (items.length > 1) {                                           // Reihe (nebeneinander) oder Spalte (untereinander)?
        const a = items[0].getBoundingClientRect(), b = items[1].getBoundingClientRect();
        s.row = Math.abs(a.top - b.top) < Math.min(a.height, b.height) * 0.5;
    } else s.row = false;
    s.el.classList.add("hh-sort-src");
    document.body.classList.add("hh-sorting");
    document.addEventListener("touchmove", hhSortBlockScroll, { passive: false });

    const g = document.createElement("div");
    g.className = "hh-sort-ghost";
    g.textContent = "↕ " + (s.el.dataset.sortLabel || (s.el.textContent || "").trim().slice(0, 40));
    document.body.appendChild(g);
    s.ghost = g;
    const bar = document.createElement("div");
    bar.className = "hh-sort-bar";
    document.body.appendChild(bar);
    s.bar = bar;

    s.scrollers = hhSortScrollers(s.el);
    if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* egal */ } }
    hhSortUpdate();
    s.raf = requestAnimationFrame(hhSortTick);
}

function hhSortBlockScroll(e) { if (hhSort.active && e.cancelable) e.preventDefault(); }

// Alles, was beim Ziehen am Rand mitscrollen darf (innerste zuerst), zuletzt die Seite selbst
function hhSortScrollers(el) {
    const out = [];
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const sx = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 2;
        const sy = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2;
        if (sx || sy) out.push({ n, sx, sy, root: false });
    }
    out.push({ n: null, sx: true, sy: true, root: true });
    return out;
}

function hhSortTick() {
    const s = hhSort;
    if (!s.active) return;
    s.raf = requestAnimationFrame(hhSortTick);
    const edge = 56, vmax = 16;
    const step = d => Math.max(1, Math.round(vmax * Math.min(1, Math.max(0, (edge - d) / edge))));
    let moved = false;
    s.scrollers.forEach(sc => {
        const r = sc.root ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight } : sc.n.getBoundingClientRect();
        if (s.x < r.left - 40 || s.x > r.right + 40 || s.y < r.top - 40 || s.y > r.bottom + 40) return;   // Finger nicht über diesem Bereich
        let dx = 0, dy = 0;
        if (sc.sy) { if (s.y - r.top < edge) dy = -step(s.y - r.top); else if (r.bottom - s.y < edge) dy = step(r.bottom - s.y); }
        if (sc.sx) { if (s.x - r.left < edge) dx = -step(s.x - r.left); else if (r.right - s.x < edge) dx = step(r.right - s.x); }
        if (!dx && !dy) return;
        if (sc.root) {
            const bx = window.scrollX, by = window.scrollY;
            window.scrollBy(dx, dy);
            if (window.scrollX !== bx || window.scrollY !== by) moved = true;
        } else {
            const bx = sc.n.scrollLeft, by = sc.n.scrollTop;
            if (dx) sc.n.scrollLeft = bx + dx;
            if (dy) sc.n.scrollTop = by + dy;
            if (sc.n.scrollLeft !== bx || sc.n.scrollTop !== by) moved = true;
        }
    });
    if (moved) hhSortUpdate();
}

// Welches Element liegt unter dem Finger? Zwischen den Elementen / dahinter: das nächstliegende (aber nicht, wenn der Finger weit weg ist)
function hhSortTargetAt(x, y) {
    const sel = '[data-sort-group="' + hhSort.group + '"]';
    const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    for (const n of stack) { const t = n.closest ? n.closest(sel) : null; if (t) return t; }
    let best = null, bd = 1e9;
    document.querySelectorAll(sel).forEach(t => {
        const r = t.getBoundingClientRect();
        const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
        if (d < bd) { bd = d; best = t; }
    });
    return bd <= 48 ? best : null;
}

function hhSortUpdate() {
    const s = hhSort;
    if (!s.active || !s.ghost) return;
    const z = hhZoom();
    const w = s.ghost.offsetWidth * z, h = s.ghost.offsetHeight * z;
    s.ghost.style.left = (Math.max(4, Math.min(window.innerWidth - w - 4, s.x - w / 2)) / z) + "px";
    s.ghost.style.top = (Math.max(4, s.y - h - 20) / z) + "px";           // über dem Finger, damit er das Ziel nicht verdeckt

    const t = hhSortTargetAt(s.x, s.y);
    const to = t ? parseInt(t.dataset.sortIndex, 10) : -1;
    if (to !== s.to && to >= 0 && to !== s.from && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* egal */ } }
    s.to = to >= 0 ? to : s.from;
    document.querySelectorAll(".hh-sort-over").forEach(n => { if (n !== t) n.classList.remove("hh-sort-over"); });
    if (!t || s.to === s.from) { s.bar.style.display = "none"; return; }
    t.classList.add("hh-sort-over");
    const r = t.getBoundingClientRect(), after = s.to > s.from, th = 4, b = s.bar;
    b.style.display = "block";
    if (s.row) {      // nebeneinander: senkrechter Balken links bzw. rechts vom Ziel
        b.style.width = th + "px"; b.style.height = (r.height / z) + "px";
        b.style.left = ((after ? r.right : r.left) / z - th / 2) + "px"; b.style.top = (r.top / z) + "px";
    } else {          // untereinander: waagerechter Balken oberhalb bzw. unterhalb
        b.style.height = th + "px"; b.style.width = (r.width / z) + "px";
        b.style.top = ((after ? r.bottom : r.top) / z - th / 2) + "px"; b.style.left = (r.left / z) + "px";
    }
}

function hhSortMove(e) {
    const s = hhSort;
    if (!(s.pending || s.active) || e.pointerId !== s.pid) return;
    s.x = e.clientX; s.y = e.clientY;
    if (s.pending) {
        const dist = Math.hypot(s.x - s.sx, s.y - s.sy);
        if (s.mode === "mouse") { if (dist > 6) hhSortStart(); }
        else if (dist > 10) hhSortCleanup();                          // der Finger scrollt: nicht ziehen
        return;
    }
    if (e.cancelable) e.preventDefault();
    hhSortUpdate();
}

function hhSortUp(e) {
    const s = hhSort;
    if (!(s.pending || s.active) || e.pointerId !== s.pid) return;
    const wasActive = s.active;
    if (wasActive) { s.x = e.clientX; s.y = e.clientY; hhSortUpdate(); }
    const el = s.el, group = s.group, from = s.from, to = s.to, cb = s.onDrop;
    hhSortCleanup();
    if (wasActive && to >= 0 && to !== from) {
        hhSortMoveDom(el, group, from, to);
        try {
            const r = cb && cb(from, to);
            if (r && typeof r.catch === "function") r.catch(err => console.error("❌ Sortieren:", err));
        } catch (err) { console.error("❌ Sortieren:", err); }
    }
}
function hhSortCancel(e) { if (!e || e.pointerId === hhSort.pid) hhSortCleanup(); }
function hhSortKey(e) { if (e.key === "Escape") hhSortCleanup(); }

// Sofort so anzeigen, wie es gleich gespeichert wird (die Liste wird danach ohnehin neu gezeichnet)
function hhSortMoveDom(el, group, from, to) {
    if (!el || !el.isConnected) return;
    const items = hhSortItems(group);
    const t = items.find(x => parseInt(x.dataset.sortIndex, 10) === to);
    if (!t || t === el || t.parentNode !== el.parentNode) return;
    el.parentNode.insertBefore(el, to > from ? t.nextSibling : t);
    hhSortItems(group).forEach((x, i) => { x.dataset.sortIndex = String(i); if (x.dataset.index !== undefined) x.dataset.index = String(i); });
}

function hhSortCleanup() {
    const s = hhSort;
    const wasActive = s.active;
    clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    document.removeEventListener("pointermove", hhSortMove, true);
    document.removeEventListener("pointerup", hhSortUp, true);
    document.removeEventListener("pointercancel", hhSortCancel, true);
    document.removeEventListener("keydown", hhSortKey, true);
    document.removeEventListener("touchmove", hhSortBlockScroll, { passive: false });
    if (s.el) s.el.classList.remove("hh-sort-src");
    document.querySelectorAll(".hh-sort-src, .hh-sort-over").forEach(n => n.classList.remove("hh-sort-src", "hh-sort-over"));
    if (s.ghost) s.ghost.remove();
    if (s.bar) s.bar.remove();
    document.body.classList.remove("hh-sorting");
    if (wasActive) s.shield = Date.now() + 450;                       // das "Loslassen" soll nichts antippen (Geschäft wählen, Jahr öffnen …)
    s.pending = false; s.active = false; s.el = null; s.ghost = null; s.bar = null; s.scrollers = []; s.onDrop = null;
    const later = s.later.splice(0);
    if (later.length) setTimeout(() => later.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 0);
}

// App im Hintergrund (z. B. Anruf): Ziehen abbrechen
document.addEventListener("visibilitychange", () => { if (document.hidden && hhSortBusy()) hhSortCleanup(); });

// Während des Ziehens und kurz danach: kein Antippen / kein Rechtsklick-Menü (Rechtsklick löscht sonst Orte und Räume)
document.addEventListener("click", e => {
    if (Date.now() < hhSort.shield) { e.stopPropagation(); e.preventDefault(); }
}, true);
document.addEventListener("contextmenu", e => {
    if (hhSort.pending || hhSort.active || Date.now() < hhSort.shield) { e.preventDefault(); e.stopPropagation(); }
}, true);

// ---- Hinweise: "das geht" ----
// Kleine Zeile über der jeweiligen Liste; in den Einstellungen abschaltbar (nur auf diesem Gerät).
function hhHintsOn() { try { return localStorage.getItem("hh_hints") !== "0"; } catch (e) { return true; } }
function hhHintsSetOn(on) {
    try { localStorage.setItem("hh_hints", on ? "1" : "0"); } catch (e) { /* egal */ }
    hhHintsRefresh();
}
function hhHintsSync() {
    const cb = document.getElementById("hintsToggle");
    if (cb) cb.checked = hhHintsOn();
}
const hhHintCount = {};
function hhHintText(key) {
    const t = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    const drag = t ? "gedrückt halten und ziehen" : "mit der Maus ziehen";
    switch (key) {
        case "shop": return t ? "💡 Gedrückt halten & ziehen: Artikel in ein anderes Geschäft schieben, Geschäfte sortieren."
                              : "💡 Mit der Maus ziehen: Artikel in ein anderes Geschäft schieben, Geschäfte sortieren.";
        case "todo": return `💡 Räume ${drag}, um sie zu sortieren.`;
        case "years": return `💡 Jahre ${drag}, um sie zu sortieren.`;
        case "months": return `💡 Monate ${drag}, um sie zu sortieren.`;
    }
    return "";
}
// n = Anzahl der Elemente, die sich sortieren lassen (ab 2 sinnvoll)
function hhHintSet(key, n) { hhHintCount[key] = n; hhHintApply(key); }
function hhHintApply(key) {
    document.querySelectorAll('.hh-hint[data-hint="' + key + '"]').forEach(el => {
        el.textContent = hhHintText(key);
        el.style.display = (hhHintsOn() && (hhHintCount[key] || 0) >= 2) ? "" : "none";
    });
}
function hhHintsRefresh() { ["shop", "todo", "years", "months"].forEach(hhHintApply); }


// Speichert die neue Reihenfolge und synchronisiert sie mit Home Assistant
async function applySidebarNewOrder(type, fromIndex, toIndex) {
    const arr = (type === 'shop') ? stores : rooms;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= arr.length || toIndex >= arr.length) return;

    // Element an alter Position entfernen und an neuer Position einfügen
    const [movedItem] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, movedItem);

    // Sofort neu zeichnen (nicht erst nach dem Speichern), dann in Home Assistant sichern
    renderSidebars();
    await syncUpSidebar(type);
}  

let currentSidebarType = 'room';
let pendingDeleteType = null;
let pendingDeleteVal = null;

// 1. Hinzufügen-Modal öffnen (für Shop oder Raum)
function addSidebarItem(type) {
    currentSidebarType = type;
    const modal = document.getElementById('roomModal');
    const input = document.getElementById('newRoomInput');
    const title = modal ? modal.querySelector('h3') : null;

    if (modal && input) {
        input.value = "";
        if (title) {
            title.innerText = (type === 'shop') ? "Neues Geschäft hinzufügen" : "Neuen Raum hinzufügen";
        }
        modal.style.display = 'flex';
        input.focus();
    }
}

// Hinzufügen-Modal schließen
function closeRoomModal() {
    const modal = document.getElementById('roomModal');
    if (modal) modal.style.display = 'none';
    if (typeof stockStoreDlgClosed === "function") stockStoreDlgClosed();   // Vorrat-Formular: neues Geschäft übernehmen
}

// 2. Eingabe bestätigen und speichern
async function confirmAddRoom() {
    const input = document.getElementById('newRoomInput');
    if (!input) return;
    
    const n = input.value.trim();
    if (!n) {
        alert("Bitte einen Namen eingeben!");
        return;
    }

    if (currentSidebarType === 'shop') {
        if (stores.includes(n)) {
            alert("Dieses Geschäft gibt es bereits!");
            return;
        }
        stores.push(n);
    } else {
        if (rooms.includes(n)) {
            alert("Diesen Raum gibt es bereits!");
            return;
        }
        rooms.push(n);
    }

    closeRoomModal();
    await syncUpSidebar(currentSidebarType);
    renderSidebars();
}

// 3. Löschen-Modal öffnen
async function deleteSidebarItem(type, val) {
    // Nutzt exakt dasselbe schicke Modal mit rotem Button wie bei deleteCat
    const confirmed = await showDeleteModal(`Möchtest du "${val}" wirklich löschen?`, "Löschen bestätigen");
    
    if (confirmed) {
        if (type === 'shop') {
            stores = stores.filter(x => x !== val);
        } else {
            rooms = rooms.filter(x => x !== val);
        }

        await syncUpSidebar(type);
        renderSidebars();
    }
}

// Lösch-Modal schließen
function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'none';
    pendingDeleteType = null;
    pendingDeleteVal = null;
}

// 4. Tatsächliches Löschen ausführen (wird vom Button im Modal aufgerufen)
async function confirmDelete() {
    if (!pendingDeleteType || !pendingDeleteVal) return;

    const type = pendingDeleteType;
    const val = pendingDeleteVal;

    closeDeleteModal();

    if (type === 'shop') {
        stores = stores.filter(x => x !== val);
    } else {
        rooms = rooms.filter(x => x !== val);
    }

    await syncUpSidebar(type);
    renderSidebars();
}

async function saveTodoDb(taskName = "Update", actionType = "aktualisiert", byName = "") {
    if (Array.isArray(todoDb)) {
        todoDb.forEach(t => {
            if (t.nextDate && String(t.nextDate).endsWith('Z')) {
                let d = new Date(t.nextDate);
                if (!isNaN(d.getTime())) {
                    t.nextDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, -1);
                }
            }
            if (t.lastDone && String(t.lastDone).endsWith('Z')) {
                let d = new Date(t.lastDone);
                if (!isNaN(d.getTime())) {
                    t.lastDone = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, -1);
                }
            }
        });
    }

    const dataToSend = JSON.stringify(todoDb || []);
    const taskObj = (todoDb || []).find(t => t.name.toLowerCase().trim() === taskName.toLowerCase().trim());
    let roomName = taskObj ? (taskObj.room || taskObj.category || "Haus") : (activeRoom || "Haus");

    try {
        await haFireEvent("set_tasks_data", {
            tasks: dataToSend, 
            user_name: byName || user,
            task_name: taskName,   
            room_name: roomName,   
            action: actionType     
        });
        if (typeof renderSidebars === "function") renderSidebars();
    } catch (e) {
        console.error("❌ Fehler beim Senden des Speicher-Events:", e);
    }
}

// ===== Lob-Fenster: geht nach dem Erledigen kurz auf ("Super gemacht, Sabrina!") =====
// [Symbol, Text mit {n} für den Namen, (Text ohne Namen – sonst wird ", {n}" einfach weggelassen)]
const HH_PRAISE = [
    ["🎉", "Super gemacht, {n}!"], ["👏", "Klasse, {n}!"], ["🌟", "Stark, {n}!"],
    ["💪", "Top Leistung, {n}!"], ["🏆", "Sauber erledigt, {n}!"], ["✨", "Das sieht gut aus, {n}!"],
    ["🙌", "Danke, {n}!"], ["🥳", "Wieder was geschafft, {n}!"], ["😎", "Du rockst, {n}!"],
    ["🚀", "Läuft bei dir, {n}!"], ["🦸", "Haushaltsheld {n} hat zugeschlagen!", "Der Haushaltsheld hat zugeschlagen!"],
    ["🌈", "Wunderbar, {n}!"], ["🧹", "Alles blitzblank, {n}!"], ["🔥", "Du bist on fire, {n}!"],
    ["🥇", "Goldmedaille für {n}!", "Goldmedaille!"], ["💫", "Fantastisch, {n}!"], ["🤩", "Wow, {n}, so geht das!", "Wow, so geht das!"],
    ["👍", "Daumen hoch für {n}!", "Daumen hoch!"], ["🎯", "Volltreffer, {n}!"], ["🍀", "Gut gemacht, {n}!"],
    ["🧠", "Clever gelöst, {n}!"], ["☀️", "Ein Haken mehr, {n}!"], ["🎊", "Hurra, {n} hat's geschafft!", "Hurra, geschafft!"],
    ["🐝", "Fleißig wie eine Biene, {n}!"], ["🏅", "Respekt, {n}!"], ["🤝", "Danke für deine Hilfe, {n}!"],
    ["⭐", "Du bist ein Stern, {n}!"], ["🦾", "Starke Arbeit, {n}!"], ["🎈", "Erledigt und abgehakt, {n}!"],
    ["🍰", "Das hast du dir verdient, {n}!"], ["🕺", "Tanz der Erledigten, {n}!"], ["🌻", "Schön, dass du das machst, {n}!"]
];
// Es kommt immer ein anderer Spruch: erst werden alle durchgespielt (zufällige Reihenfolge), dann geht es von vorn los.
// Der Stand wird auf dem Gerät gemerkt, damit es auch nach dem Neuladen der Seite nicht gleich wieder dieselben sind.
let hhPraiseUsed = null;
function hhPraisePick() {
    const n = HH_PRAISE.length;
    if (!Array.isArray(hhPraiseUsed)) {
        hhPraiseUsed = [];
        try {
            const raw = JSON.parse(localStorage.getItem("hh_praise_used") || "[]");
            if (Array.isArray(raw)) hhPraiseUsed = raw.filter(i => Number.isInteger(i) && i >= 0 && i < n);
        } catch (e) { /* ohne Speicher: nur für diese Sitzung */ }
    }
    let free = [];
    for (let i = 0; i < n; i++) if (!hhPraiseUsed.includes(i)) free.push(i);
    if (!free.length) {   // Runde zu Ende: neu mischen, nicht mit dem zuletzt gezeigten starten
        const last = hhPraiseUsed.length ? hhPraiseUsed[hhPraiseUsed.length - 1] : -1;
        hhPraiseUsed = [];
        for (let i = 0; i < n; i++) if (i !== last || n === 1) free.push(i);
    }
    const pick = free[Math.floor(Math.random() * free.length)];
    hhPraiseUsed.push(pick);
    try { localStorage.setItem("hh_praise_used", JSON.stringify(hhPraiseUsed)); } catch (e) { /* egal */ }
    return pick;
}
let hhPraiseTimer = null;
function hhPraiseClose() {
    clearTimeout(hhPraiseTimer);
    hhPraiseTimer = null;
    const o = document.getElementById("hhPraiseOverlay");
    if (!o) return;
    o.classList.add("is-out");
    setTimeout(() => { if (o.parentNode) o.remove(); }, 240);
}
// who: Name der Person, text: zweite Zeile (z. B. "Staubsaugen erledigt")
function hhPraise(who, text) {
    try {
        const old = document.getElementById("hhPraiseOverlay");
        if (old) old.remove();
        clearTimeout(hhPraiseTimer);
        const i = hhPraisePick();
        const name = String(who || "").trim();
        const entry = HH_PRAISE[i];
        const msg = name ? entry[1].replace("{n}", name) : (entry[2] || entry[1].replace(", {n}", ""));

        const o = document.createElement("div");
        o.id = "hhPraiseOverlay";
        o.className = "cook-modal-overlay hh-praise-overlay";
        o.setAttribute("role", "status");
        o.setAttribute("aria-live", "polite");
        const card = document.createElement("div");
        card.className = "modal-card cook-modal-card hh-praise-card";
        card.onclick = hhPraiseClose;
        const em = document.createElement("div");
        em.className = "hh-praise-emoji";
        em.textContent = HH_PRAISE[i][0];
        const tt = document.createElement("div");
        tt.className = "hh-praise-title";
        tt.textContent = msg;
        card.append(em, tt);
        if (text) {
            const sub = document.createElement("div");
            sub.className = "hh-praise-sub";
            sub.textContent = text;
            card.appendChild(sub);
        }
        o.appendChild(card);
        document.body.appendChild(o);
        hhPraiseTimer = setTimeout(hhPraiseClose, 2400);
    } catch (e) { /* das Lob ist nur nett – darf nie etwas kaputt machen */ }
}

// ===== "Wer hat es gemacht?" beim Erledigen / Zurücksetzen =====
// Liefert den gewählten Benutzernamen, oder null wenn abgebrochen wurde.
// Gibt es nur einen Benutzer, wird nicht gefragt.
function hhWhoDid(taskName) {
    const names = [];
    (Array.isArray(users) ? users : []).forEach(u => {
        if (typeof u === "string" && u.includes(":")) {
            const n = u.split(":")[0];
            if (n && !names.includes(n)) names.push(n);
        }
    });
    if (names.length <= 1) return Promise.resolve(names[0] || user || "");
    if (document.getElementById("hhWhoOverlay")) return Promise.resolve(null);   // Fenster ist schon offen

    return new Promise(resolve => {
        const modal = document.createElement("div");
        modal.id = "hhWhoOverlay";
        modal.className = "cook-modal-overlay";
        let done = false;
        const onKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); } };
        const finish = (val) => {
            if (done) return;
            done = true;
            modal.remove();
            document.removeEventListener("keydown", onKey, true);
            resolve(val);
        };
        document.addEventListener("keydown", onKey, true);
        modal.onclick = () => finish(null);

        const card = document.createElement("div");
        card.className = "modal-card cook-modal-card hh-who-card";
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-label", "Wer hat es gemacht?");
        card.onclick = e => e.stopPropagation();
        const h = document.createElement("h3");
        h.style.margin = "0 0 4px 0";
        h.style.textAlign = "center";
        h.textContent = "👤 Wer hat es gemacht?";
        card.appendChild(h);
        if (taskName) {
            const sub = document.createElement("div");
            sub.className = "hh-who-sub";
            sub.textContent = taskName;
            card.appendChild(sub);
        }
        const list = document.createElement("div");
        list.className = "cook-modal-list";
        names.forEach(n => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "cat-btn cook-modal-option" + (n === user ? " active-food" : "");
            b.textContent = "👤 " + n;
            b.onclick = () => finish(n);
            list.appendChild(b);
        });
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "cat-btn cook-modal-option hh-who-cancel";
        cancel.textContent = "Abbrechen";
        cancel.onclick = () => finish(null);
        list.appendChild(cancel);
        card.appendChild(list);
        modal.appendChild(card);
        document.body.appendChild(modal);
        const cur = list.querySelector(".active-food") || list.firstElementChild;
        if (cur) cur.focus({ preventScroll: true });
    });
}

async function completeTodo(id) {
    let t = todoDb.find(x => String(x.id) === String(id));
    if (!t) return;

    // Wer hat es gemacht? (nicht unbedingt der Benutzer, der gerade angemeldet ist)
    const who = await hhWhoDid(t.name);
    if (!who) return;   // abgebrochen
    t = todoDb.find(x => String(x.id) === String(id));   // Stand könnte sich währenddessen geändert haben
    if (!t) return;

    try {
        const now = new Date();
        if (t.room.trim() === "Müllabfuhr") {
            todoDb = todoDb.filter(x => String(x.id) !== String(id));
            await saveTodoDb(t.name, "Müll erledigt & entfernt 🗑️", who);
        } else {
            t.lastDone = now.toISOString();
            let nextDate;

            if (t.selectedWeekdays && t.selectedWeekdays.length > 0) {
                let next = new Date();
                const wochenAbstand = t.weeks || 1;
                
                for (let i = 1; i <= 7 * wochenAbstand; i++) {
                    let temp = new Date();
                    temp.setDate(temp.getDate() + i);
                    if (t.selectedWeekdays.includes(temp.getDay())) {
                        next = temp;
                        break;
                    }
                }
                nextDate = next;
                if (t.time) {
                    const [h, m] = t.time.split(':');
                    nextDate.setHours(parseInt(h), parseInt(m), 0, 0);
                } else {
                    nextDate.setHours(10, 0, 0, 0);
                }
            } else {
                const hours = (t.intervalHours !== undefined && t.intervalHours !== null) ? parseFloat(t.intervalHours) : 24;
                nextDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));

                // Uhrzeit NUR überschreiben, wenn es ein Tages-Intervall (>= 24h) ist!
                // Bei Minuten und Stunden (< 24h) bleibt die exakt berechnete Uhrzeit erhalten.
                if (hours >= 24) {
                    if (t.time) {
                        const [h, m] = t.time.split(':');
                        nextDate.setHours(parseInt(h), parseInt(m), 0, 0);
                    } else {
                        nextDate.setHours(10, 0, 0, 0);
                    }
                }
            }

            t.nextDate = nextDate.toISOString();
            await saveTodoDb(t.name, "erledigt ✅", who);
        }

        todoHistoryAdd(t.name, t.room, who);   // Verlauf (läuft im Hintergrund)
        hhPraise(who, t.name + " erledigt ✅");
        renderTodoList();
        if (typeof updateAppBadges === "function") updateAppBadges();
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
    }
}     

// ===== Verlauf der erledigten Aufgaben =====
// Liegt in db.todo.history (neueste zuerst) und wird mit den Aufgaben-Favoriten in Home Assistant
// gespeichert, damit alle Geräte denselben Verlauf sehen. Eintrag: { id, n: Name, r: Raum, b: wer, t: Zeitstempel (ms) }
const TODO_HISTORY_MAX = 100;
const todoHistGone = new Set();   // gelöschte IDs (diese Sitzung), damit ein veralteter Stand sie nicht zurückbringt
let todoHistQueue = Promise.resolve();

function todoHistList() {
    return (db && db.todo && Array.isArray(db.todo.history)) ? db.todo.history : [];
}

function todoHistMerge(a, b) {
    const map = new Map();
    [...(a || []), ...(b || [])].forEach(e => {
        if (e && e.id && !todoHistGone.has(e.id) && !map.has(e.id)) map.set(e.id, e);
    });
    return [...map.values()].sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, TODO_HISTORY_MAX);
}

async function todoHistReadRemote() {
    const cfg = SYNC_CONFIG.todo;
    const d = await haGetState(cfg.entity);
    const raw = d && d.attributes && d.attributes[cfg.attr];
    if (!raw) return null;
    const parsed = (typeof raw === "string") ? JSON.parse(raw) : raw;
    return (parsed && typeof parsed === "object") ? parsed : null;
}

// Frischen Stand holen, ändern, zurückschreiben – nacheinander, damit nichts verloren geht
function todoHistWrite(mutator) {
    todoHistQueue = todoHistQueue.then(async () => {
        let base = null;
        try { base = await todoHistReadRemote(); } catch (e) { /* dann mit dem lokalen Stand */ }
        if (!base) base = { cats: db.todo.cats, favs: db.todo.favs, maint: db.todo.maint };
        const merged = todoHistMerge(base.history, todoHistList());
        const out = todoHistMerge(mutator(merged) || [], []);
        base.history = out;
        db.todo.history = out;
        const res = await haFireEvent(SYNC_CONFIG.todo.event, { favs: JSON.stringify(base) });
        if (res && res.ok === false) throw new Error("HTTP " + res.status);
        return out;
    }).catch(e => { console.error("❌ Verlauf konnte nicht gespeichert werden:", e); });
    return todoHistQueue;
}

function todoHistoryAdd(name, room, by) {
    const e = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        n: String(name || "").slice(0, 80),
        r: String(room || "").slice(0, 40),
        b: String(by || (typeof user !== "undefined" && user) || "").slice(0, 30),
        t: Date.now()
    };
    // sofort lokal anzeigen, dann speichern
    db.todo.history = todoHistMerge([e], todoHistList());
    return todoHistWrite(list => [e, ...list]);
}

function todoHistFmt(ts) {
    const d = new Date(ts);
    const wd = d.toLocaleDateString("de-DE", { weekday: "short" });
    const p2 = n => String(n).padStart(2, "0");
    return `${wd}, ${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())} Uhr`;
}

function todoHistRender() {
    const box = document.getElementById("histList");
    if (!box) return;
    const list = todoHistList().slice().sort((x, y) => (y.t || 0) - (x.t || 0));   // neueste zuerst
    box.textContent = "";
    const sub = document.getElementById("histSub");
    if (sub) sub.textContent = list.length ? `${list.length} ${list.length === 1 ? "Eintrag" : "Einträge"} · nach Namen sortiert` : "";
    const clr = document.getElementById("histClear");
    if (clr) clr.disabled = !list.length;
    if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "ing-empty";
        empty.textContent = "Noch nichts erledigt. Sobald du bei einer Aufgabe auf „Erledigt“ tippst, steht sie hier.";
        box.appendChild(empty);
        return;
    }
    // Pro Person eine Überschrift (A–Z, ohne Namen zuletzt), darunter ihre Aufgaben
    const groups = new Map();
    list.forEach(e => {
        const k = String(e.b || "").trim();
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    });
    const keys = [...groups.keys()].sort((a, b) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b, "de", { sensitivity: "base" });
    });
    keys.forEach(k => {
        const items = groups.get(k);
        const h = document.createElement("div");
        h.className = "hist-person";
        const hn = document.createElement("span");
        hn.className = "hist-person-name";
        hn.textContent = "👤 " + (k || "Ohne Namen");
        const hc = document.createElement("span");
        hc.className = "hist-count";
        hc.textContent = String(items.length);
        h.append(hn, hc);
        box.appendChild(h);
        items.forEach(e => {
            const row = document.createElement("div");
            row.className = "hist-row";
            row.dataset.id = e.id;
            const main = document.createElement("div");
            main.className = "hist-main";
            const nm = document.createElement("div");
            nm.className = "hist-name";
            nm.textContent = "✅ " + (e.n || "Aufgabe");
            main.append(nm);
            if (e.r) {
                const meta = document.createElement("div");
                meta.className = "hist-meta";
                meta.textContent = e.r;
                main.append(meta);
            }
            const tm = document.createElement("div");
            tm.className = "hist-time";
            tm.textContent = todoHistFmt(e.t);
            main.append(tm);
            const del = document.createElement("button");
            del.type = "button";
            del.className = "hh-round hist-del";
            del.textContent = "🗑️";
            del.setAttribute("aria-label", "Eintrag löschen");
            del.title = "Eintrag löschen";
            del.onclick = () => todoHistoryRemove(e.id);
            row.append(main, del);
            box.appendChild(row);
        });
    });
}

async function openTodoHistory() {
    todoHistRender();
    const m = document.getElementById("historyModal");
    if (m) m.style.display = "flex";
    try {   // aktuellen Stand von Home Assistant nachladen (z. B. von anderen Geräten)
        const remote = await todoHistReadRemote();
        if (remote && Array.isArray(remote.history)) {
            db.todo.history = todoHistMerge(remote.history, todoHistList());
            if (m && m.style.display !== "none") todoHistRender();
        }
    } catch (e) { /* egal */ }
}
function closeTodoHistory() {
    const m = document.getElementById("historyModal");
    if (m) m.style.display = "none";
}

function todoHistoryRemove(id) {
    todoHistGone.add(id);
    db.todo.history = todoHistList().filter(e => e.id !== id);
    todoHistRender();
    return todoHistWrite(list => list.filter(e => e.id !== id));
}

async function todoHistoryClear() {
    if (!todoHistList().length) return;
    const ok = await showDeleteModal("Möchtest du den ganzen Verlauf löschen? Das kann nicht rückgängig gemacht werden.", "Verlauf löschen 🗑️", "Alles löschen");
    if (!ok) return;
    todoHistList().forEach(e => todoHistGone.add(e.id));
    db.todo.history = [];
    todoHistRender();
    await todoHistWrite(() => []);
}

// ===== Wartung (wiederkehrende Wartungen mit Intervall) =====
// Liegt in db.todo.maint und wird mit den Aufgaben-Favoriten in Home Assistant gespeichert (alle Geräte gleich).
//   items: { id, n: Name, e: Zahl, u: d|w|m|y, w: Vorwarnung in Tagen, x: nächster Termin (JJJJ-MM-TT), l: zuletzt gemacht (JJJJ-MM-TT oder "") }
//   tpls:  { id, n, e, u, w }  – nur gespeichert, wenn Vorlagen geändert wurden (sonst gelten die Standard-Vorlagen)
//   hist:  { id, n, b: wer, t: Zeitstempel }  – Verlauf der Wartungen, nur im Wartungsfenster sichtbar (nicht im Aufgaben-Verlauf)
const MAINT_HIST_MAX = 50;
const MAINT_UNITS = [["d", "Tage", "Tag"], ["w", "Wochen", "Woche"], ["m", "Monate", "Monat"], ["y", "Jahre", "Jahr"]];
const MAINT_WARN = [[0, "Keine"], [3, "3 Tage"], [7, "1 Woche"], [14, "2 Wochen"], [30, "1 Monat"]];
const MAINT_DEFAULT_TPLS = [
    { id: "d1", n: "Rauchmelder prüfen", e: 12, u: "m", w: 14 },
    { id: "d2", n: "Heizung warten", e: 12, u: "m", w: 30 },
    { id: "d3", n: "Reifenwechsel", e: 6, u: "m", w: 14 },
    { id: "d4", n: "Auto: TÜV / HU", e: 24, u: "m", w: 30 },
    { id: "d5", n: "Dunstabzug-Filter reinigen", e: 3, u: "m", w: 7 },
    { id: "d6", n: "Waschmaschine reinigen", e: 3, u: "m", w: 7 },
    { id: "d7", n: "Geschirrspüler-Filter reinigen", e: 1, u: "m", w: 3 },
    { id: "d8", n: "Kaffeemaschine entkalken", e: 3, u: "m", w: 7 },
    { id: "d9", n: "Kühlschrank reinigen", e: 6, u: "m", w: 7 },
    { id: "d10", n: "Dachrinne reinigen", e: 12, u: "m", w: 14 },
    { id: "d11", n: "Versicherungen prüfen", e: 12, u: "m", w: 30 }
];
let maintBusy = 0;   // Anzahl noch nicht gespeicherter Änderungen (solange gilt der lokale Stand)

function maintPad(n) { return String(n).padStart(2, "0"); }
function maintId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function maintIso(d) { return `${d.getFullYear()}-${maintPad(d.getMonth() + 1)}-${maintPad(d.getDate())}`; }
function maintParse(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? d : null;
}
function maintToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
// Datum + Intervall (Monate/Jahre mit Monatsende: 31.01. + 1 Monat = 28.02.)
function maintAdd(date, e, u) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (u === "d") d.setDate(d.getDate() + e);
    else if (u === "w") d.setDate(d.getDate() + 7 * e);
    else {
        const months = (u === "y") ? 12 * e : e;
        const day = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + months);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, last));
    }
    return d;
}
function maintDaysUntil(iso) {
    const d = maintParse(iso);
    return d ? Math.round((d - maintToday()) / 86400000) : null;
}
function maintFmtLong(iso) {
    const d = maintParse(iso);
    return d ? hhDtDateText(d.getFullYear(), d.getMonth(), d.getDate()) : "";
}
function maintFmtShort(iso) {
    const d = maintParse(iso);
    return d ? `${maintPad(d.getDate())}.${maintPad(d.getMonth() + 1)}.${d.getFullYear()}` : "";
}
function maintEveryText(e, u) {
    if (e === 1) return { d: "jeden Tag", w: "jede Woche", m: "jeden Monat", y: "jedes Jahr" }[u] || "";
    const lab = MAINT_UNITS.find(x => x[0] === u);
    return `alle ${e} ${lab ? lab[1] : ""}`;
}
function maintWarnText(w) {
    if (!w) return "ohne Vorwarnung";
    const f = MAINT_WARN.find(x => x[0] === w);
    return (f ? f[1] : `${w} Tage`) + " vorher";
}

function maintSaneItem(it) {
    if (!it || typeof it !== "object" || !it.id) return null;
    const e = Math.max(1, Math.min(999, parseInt(it.e, 10) || 1));
    const u = ["d", "w", "m", "y"].includes(it.u) ? it.u : "m";
    const w = Math.max(0, Math.min(365, parseInt(it.w, 10) || 0));
    return {
        id: String(it.id).slice(0, 24),
        n: String(it.n || "").trim().slice(0, 60) || "Wartung",
        e, u, w,
        x: maintParse(it.x) ? String(it.x).slice(0, 10) : maintIso(maintAdd(maintToday(), e, u)),
        l: maintParse(it.l) ? String(it.l).slice(0, 10) : ""
    };
}
function maintSaneTpl(t) {
    const x = maintSaneItem(t);
    return x ? { id: x.id, n: x.n, e: x.e, u: x.u, w: x.w } : null;
}
function maintNorm(raw) {
    const src = (raw && typeof raw === "object") ? raw : {};
    const out = { items: [], hist: [] };
    const seen = new Set();
    (Array.isArray(src.items) ? src.items : []).forEach(it => {
        const x = maintSaneItem(it);
        if (x && !seen.has(x.id)) { seen.add(x.id); out.items.push(x); }
    });
    if (Array.isArray(src.tpls)) {
        const seenT = new Set();
        out.tpls = [];
        src.tpls.forEach(t => {
            const x = maintSaneTpl(t);
            if (x && !seenT.has(x.id)) { seenT.add(x.id); out.tpls.push(x); }
        });
    }
    const seenH = new Set();
    (Array.isArray(src.hist) ? src.hist : []).forEach(h => {
        if (!h || !h.id || seenH.has(h.id)) return;
        seenH.add(h.id);
        out.hist.push({ id: String(h.id).slice(0, 24), n: String(h.n || "").slice(0, 60), b: String(h.b || "").slice(0, 30), t: Number(h.t) || 0 });
    });
    out.hist.sort((a, b) => b.t - a.t);
    out.hist = out.hist.slice(0, MAINT_HIST_MAX);
    return out;
}
function maintData() {
    if (!db.todo.maint || typeof db.todo.maint !== "object") db.todo.maint = { items: [], hist: [] };
    if (!Array.isArray(db.todo.maint.items)) db.todo.maint.items = [];
    if (!Array.isArray(db.todo.maint.hist)) db.todo.maint.hist = [];
    return db.todo.maint;
}
function maintTpls() {
    const m = maintData();
    return Array.isArray(m.tpls) ? m.tpls : MAINT_DEFAULT_TPLS;
}
function maintItemsSorted() {
    return maintData().items.slice().sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : a.n.localeCompare(b.n, "de", { sensitivity: "base" })));
}

function maintInText(days) {
    if (days === 1) return "morgen";
    if (days < 14) return `in ${days} Tagen`;
    if (days < 60) return `in ${Math.round(days / 7)} Wochen`;
    if (days < 700) return `in ${Math.round(days / 30.4)} Monaten`;
    return `in ${Math.round(days / 365)} Jahren`;
}
// k: over = überfällig, soon = fällig / in der Vorwarnzeit, ok = später
function maintStatus(it) {
    const days = maintDaysUntil(it.x);
    if (days === null) return { k: "ok", days: 9999, text: "" };
    if (days < 0) return { k: "over", days, text: days === -1 ? "⚠️ seit gestern überfällig" : `⚠️ seit ${-days} Tagen überfällig` };
    if (days === 0) return { k: "soon", days, text: "⏰ heute fällig" };
    if (days <= it.w) return { k: "soon", days, text: days === 1 ? "⏰ morgen fällig" : `⏰ in ${days} Tagen fällig` };
    return { k: "ok", days, text: "📅 " + maintInText(days) };
}
// Fällig oder in der Vorwarnzeit (für die Startseite)
function maintDueList() {
    return maintItemsSorted().filter(it => { const d = maintDaysUntil(it.x); return d !== null && d <= it.w; });
}
// Heute fällig oder überfällig (für das Zähl-Symbol)
function maintBadgeCount() {
    return maintData().items.filter(it => { const d = maintDaysUntil(it.x); return d !== null && d <= 0; }).length;
}

// ---- Speichern: frischen Stand holen, ändern, zurückschreiben (gemeinsame Warteschlange mit dem Aufgaben-Verlauf) ----
function maintWrite(mutator) {
    maintBusy++;
    todoHistQueue = todoHistQueue.then(async () => {
        let base = null;
        try { base = await todoHistReadRemote(); } catch (e) { /* dann mit dem lokalen Stand */ }
        const hadRemote = !!base;
        if (!base) base = { cats: db.todo.cats, favs: db.todo.favs, history: todoHistList() };
        const m = maintNorm(hadRemote ? base.maint : maintData());
        const out = maintNorm(mutator(m) || m);
        base.maint = out;
        db.todo.maint = out;
        const res = await haFireEvent(SYNC_CONFIG.todo.event, { favs: JSON.stringify(base) });
        if (res && res.ok === false) throw new Error("HTTP " + res.status);
        return out;
    }).catch(e => {
        console.error("❌ Wartung konnte nicht gespeichert werden:", e);
        if (typeof ingToast === "function") ingToast("⚠️ Wartung konnte nicht gespeichert werden");
    }).then(r => { maintBusy = Math.max(0, maintBusy - 1); return r; });
    return todoHistQueue;
}
// Änderung sofort lokal zeigen, dann speichern
function maintDo(mutator) {
    const local = maintNorm(maintData());
    db.todo.maint = maintNorm(mutator(local) || local);
    maintRefreshUI();
    return maintWrite(mutator).then(r => { maintRefreshUI(); return r; });
}

function maintRefreshUI() {
    const m = document.getElementById("maintModal");
    if (m && m.style.display !== "none") maintRender();
    const t = document.getElementById("maintTplModal");
    if (t && t.style.display !== "none") maintTplRender();
    if (typeof renderHomeTodos === "function") { try { renderHomeTodos(); } catch (e) { /* Startseite noch nicht da */ } }
    if (typeof updateAppBadges === "function") { try { updateAppBadges(); } catch (e) { /* egal */ } }
}

// ---- Aktionen ----
function maintSaveItem(data) {
    const item = maintSaneItem({ ...data, id: data.id || maintId() });
    return maintDo(m => {
        const i = m.items.findIndex(x => x.id === item.id);
        if (i >= 0) m.items[i] = item; else m.items.push(item);
        return m;
    });
}
async function maintDelete(id) {
    const it = maintData().items.find(x => x.id === id);
    if (!it) return;
    const ok = await showDeleteModal(`Möchtest du "${it.n}" wirklich löschen?`, "Wartung löschen 🗑️");
    if (!ok) return;
    await maintDo(m => { m.items = m.items.filter(x => x.id !== id); return m; });
}
// Erledigt: fragt, wer es gemacht hat, setzt "zuletzt" auf heute und den nächsten Termin auf heute + Intervall
async function maintComplete(id) {
    const it = maintData().items.find(x => x.id === id);
    if (!it) return false;
    const who = await hhWhoDid(it.n);
    if (!who) return false;
    const cur = maintData().items.find(x => x.id === id);   // Stand könnte sich währenddessen geändert haben
    if (!cur) return false;
    const today = maintToday();
    const todayIso = maintIso(today);
    const nextIso = maintIso(maintAdd(today, cur.e, cur.u));
    const entry = { id: maintId(), n: cur.n, b: String(who).slice(0, 30), t: Date.now() };
    const saved = maintDo(m => {
        const i = m.items.find(x => x.id === id);
        if (!i) return m;
        i.l = todayIso;
        i.x = nextIso;
        m.hist.unshift(entry);
        return m;
    });
    hhPraise(who, `${cur.n} erledigt ✅ · nächster Termin ${maintFmtShort(nextIso)}`);
    await saved;
    return true;
}
function maintHistRemove(id) {
    return maintDo(m => { m.hist = m.hist.filter(h => h.id !== id); return m; });
}
async function maintHistClear() {
    if (!maintData().hist.length) return;
    const ok = await showDeleteModal("Möchtest du den ganzen Wartungs-Verlauf löschen? Das kann nicht rückgängig gemacht werden.", "Verlauf löschen 🗑️", "Alles löschen");
    if (!ok) return;
    await maintDo(m => { m.hist = []; return m; });
}

// ---- Hauptfenster ----
let maintTab = "list";
function maintSetTab(k) {
    maintTab = (k === "hist") ? "hist" : "list";
    maintRender();
}
function maintMk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}
function maintRoundBtn(cls, text, label, fn) {
    const b = maintMk("button", "hh-round maint-btn " + cls, text);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.onclick = fn;
    return b;
}
function maintRender() {
    const box = document.getElementById("maintList");
    if (!box) return;
    const isList = maintTab === "list";
    const tl = document.getElementById("maintTabList"), th = document.getElementById("maintTabHist");
    if (tl) { tl.classList.toggle("is-on", isList); tl.setAttribute("aria-pressed", isList ? "true" : "false"); }
    if (th) { th.classList.toggle("is-on", !isList); th.setAttribute("aria-pressed", isList ? "false" : "true"); }
    const al = document.getElementById("maintActList"), ah = document.getElementById("maintActHist");
    if (al) al.style.display = isList ? "flex" : "none";
    if (ah) ah.style.display = isList ? "none" : "flex";
    const keep = box.scrollTop;
    box.textContent = "";
    const sub = document.getElementById("maintSub");
    if (isList) maintRenderList(box, sub); else maintRenderHist(box, sub);
    box.scrollTop = keep;
}
function maintRenderList(box, sub) {
    const items = maintItemsSorted();
    let over = 0, soon = 0;
    items.forEach(it => { const k = maintStatus(it).k; if (k === "over") over++; else if (k === "soon") soon++; });
    if (sub) {
        sub.textContent = items.length
            ? [`${items.length} ${items.length === 1 ? "Wartung" : "Wartungen"}`, over ? `${over} überfällig` : "", soon ? `${soon} bald fällig` : ""].filter(Boolean).join(" · ")
            : "";
    }
    if (!items.length) {
        box.appendChild(maintMk("div", "ing-empty", "Noch keine Wartung. Tippe auf „＋ Neu“ und wähle eine Vorlage, z. B. Rauchmelder oder Heizung."));
        return;
    }
    items.forEach(it => {
        const st = maintStatus(it);
        const row = maintMk("div", "maint-row maint-s-" + st.k);
        row.dataset.id = it.id;
        const main = maintMk("div", "maint-main");
        main.appendChild(maintMk("div", "maint-name", "🔧 " + it.n));
        main.appendChild(maintMk("div", "maint-meta", "🔁 " + maintEveryText(it.e, it.u) + (it.l ? " · zuletzt " + maintFmtShort(it.l) : "")));
        main.appendChild(maintMk("div", "maint-due", st.text + " · " + maintFmtLong(it.x)));
        const btns = maintMk("div", "maint-btns");
        btns.appendChild(maintRoundBtn("maint-ok", "✅", "Erledigt", () => maintComplete(it.id)));
        btns.appendChild(maintRoundBtn("maint-edit", "✏️", "Bearbeiten", () => maintEditItem(it.id)));
        btns.appendChild(maintRoundBtn("maint-del", "🗑️", "Löschen", () => maintDelete(it.id)));
        row.append(main, btns);
        box.appendChild(row);
    });
}
function maintRenderHist(box, sub) {
    const list = maintData().hist.slice().sort((a, b) => (b.t || 0) - (a.t || 0));
    if (sub) sub.textContent = list.length ? `${list.length} ${list.length === 1 ? "Eintrag" : "Einträge"} · nach Namen sortiert` : "";
    const clr = document.getElementById("maintHistClear");
    if (clr) clr.disabled = !list.length;
    if (!list.length) {
        box.appendChild(maintMk("div", "ing-empty", "Noch nichts erledigt. Sobald du bei einer Wartung auf ✅ tippst, steht sie hier."));
        return;
    }
    const groups = new Map();
    list.forEach(e => {
        const k = String(e.b || "").trim();
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    });
    const keys = [...groups.keys()].sort((a, b) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b, "de", { sensitivity: "base" });
    });
    keys.forEach(k => {
        const items = groups.get(k);
        const h = maintMk("div", "hist-person");
        h.append(maintMk("span", "hist-person-name", "👤 " + (k || "Ohne Namen")), maintMk("span", "hist-count", String(items.length)));
        box.appendChild(h);
        items.forEach(e => {
            const row = maintMk("div", "hist-row");
            row.dataset.id = e.id;
            const main = maintMk("div", "hist-main");
            main.append(maintMk("div", "hist-name", "✅ " + (e.n || "Wartung")), maintMk("div", "hist-time", todoHistFmt(e.t)));
            const del = maintMk("button", "hh-round hist-del", "🗑️");
            del.type = "button";
            del.setAttribute("aria-label", "Eintrag löschen");
            del.title = "Eintrag löschen";
            del.onclick = () => maintHistRemove(e.id);
            row.append(main, del);
            box.appendChild(row);
        });
    });
}
async function openMaint() {
    if (!hhFeature("maint")) return;   // in den Einstellungen ausgeschaltet
    maintTab = "list";
    maintRender();
    const m = document.getElementById("maintModal");
    if (m) m.style.display = "flex";
    try {   // aktuellen Stand von Home Assistant nachladen (z. B. von anderen Geräten)
        const remote = await todoHistReadRemote();
        if (remote && !maintBusy) {
            db.todo.maint = maintNorm(remote.maint);
            maintRefreshUI();
        }
    } catch (e) { /* egal */ }
}
function closeMaint() {
    const m = document.getElementById("maintModal");
    if (m) m.style.display = "none";
}

// ---- Vorlagen ("＋ Neu": Vorlage wählen, ändern, löschen) ----
function maintNew() { maintTplOpen(); }
function maintTplOpen() {
    maintTplRender();
    const m = document.getElementById("maintTplModal");
    if (m) m.style.display = "flex";
}
function maintTplClose() {
    const m = document.getElementById("maintTplModal");
    if (m) m.style.display = "none";
}
function maintTplRender() {
    const box = document.getElementById("maintTplList");
    if (!box) return;
    box.textContent = "";
    const list = maintTpls();
    const rst = document.getElementById("maintTplReset");
    if (rst) rst.style.display = Array.isArray(maintData().tpls) ? "" : "none";
    if (!list.length) {
        box.appendChild(maintMk("div", "ing-empty", "Keine Vorlagen mehr. Mit „＋ Vorlage“ legst du eine neue an, oder hole die Standard-Vorlagen zurück."));
        return;
    }
    list.forEach(t => {
        const row = maintMk("div", "maint-tpl-row");
        const main = maintMk("button", "hh-pickrow maint-tpl-main");
        main.type = "button";
        const nm = maintMk("span", "maint-tpl-name");
        nm.append(maintMk("strong", "", t.n), maintMk("small", "", maintEveryText(t.e, t.u) + " · " + maintWarnText(t.w)));
        main.appendChild(nm);
        main.onclick = () => maintFormOpen("item", t, false, true);
        row.append(main,
            maintRoundBtn("maint-edit", "✏️", "Vorlage ändern", () => maintFormOpen("tpl", t, true, false)),
            maintRoundBtn("maint-del", "🗑️", "Vorlage löschen", () => maintTplDelete(t.id)));
        box.appendChild(row);
    });
}
function maintTplMutate(fn) {
    return maintDo(m => {
        if (!Array.isArray(m.tpls)) m.tpls = MAINT_DEFAULT_TPLS.map(t => ({ ...t }));
        fn(m.tpls);
        return m;
    });
}
async function maintTplDelete(id) {
    const t = maintTpls().find(x => x.id === id);
    if (!t) return;
    const ok = await showDeleteModal(`Vorlage "${t.n}" löschen? Bestehende Wartungen bleiben unverändert.`, "Vorlage löschen 🗑️");
    if (!ok) return;
    await maintTplMutate(l => { const i = l.findIndex(x => x.id === id); if (i >= 0) l.splice(i, 1); });
}
async function maintTplReset() {
    const ok = await showDeleteModal("Die Standard-Vorlagen zurückholen? Deine geänderten und eigenen Vorlagen werden dabei ersetzt.", "Vorlagen zurücksetzen ↺", "Zurücksetzen");
    if (!ok) return;
    await maintDo(m => { delete m.tpls; return m; });
}
function maintTplNew() { maintFormOpen("tpl", null, false, false); }

// ---- Formular (Wartung oder Vorlage) ----
const maintForm = { kind: "item", id: null, edit: false, fromTpl: false, e: 12, u: "m", w: 14, touched: false };

function maintEditItem(id) {
    const it = maintData().items.find(x => x.id === id);
    if (it) maintFormOpen("item", it, true, false);
}
// src: vorhandener Eintrag/Vorlage (edit = true) oder Vorlage als Vorbelegung für eine neue Wartung; null = leer
function maintFormOpen(kind, src, edit, fromTpl) {
    const f = maintForm;
    f.kind = kind;
    f.edit = !!edit;
    f.id = (edit && src) ? src.id : null;
    f.fromTpl = !!fromTpl;
    f.touched = false;
    f.e = src ? src.e : 12;
    f.u = src ? src.u : "m";
    f.w = src ? src.w : 14;
    const isItem = kind === "item";
    document.getElementById("mfTitle").textContent = isItem
        ? (edit ? "✏️ Wartung bearbeiten" : "🔧 Neue Wartung")
        : (edit ? "✏️ Vorlage ändern" : "📋 Neue Vorlage");
    document.getElementById("mfName").value = src ? src.n : "";
    document.getElementById("mfEvery").value = String(f.e);
    document.getElementById("mfNextRow").style.display = isItem ? "" : "none";
    if (isItem) {
        document.getElementById("mfNext").value = (edit && src && src.x) ? src.x : maintIso(maintAdd(maintToday(), f.e, f.u));
    }
    maintFormPaint();
    if (fromTpl) maintTplClose();   // Vorlagen-Fenster ruht, bis das Formular zu ist
    const m = document.getElementById("maintFormModal");
    if (m) m.style.display = "flex";
    const nm = document.getElementById("mfName");
    if (nm && !nm.value) { try { nm.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
}
function maintFormPaint() {
    const f = maintForm;
    document.querySelectorAll("#mfUnits button").forEach(b => {
        const u = b.dataset.u;
        const lab = MAINT_UNITS.find(x => x[0] === u);
        if (lab) b.textContent = (f.e === 1) ? lab[2] : lab[1];
        b.classList.toggle("is-on", u === f.u);
        b.setAttribute("aria-pressed", u === f.u ? "true" : "false");
    });
    document.querySelectorAll("#mfWarns button").forEach(b => {
        const on = Number(b.dataset.w) === f.w;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
    });
}
// Neuer Eintrag: nächster Termin = heute + Intervall, solange man ihn nicht selbst gewählt hat
function maintFormAutoNext() {
    const f = maintForm;
    if (f.kind === "item" && !f.edit && !f.touched) {
        document.getElementById("mfNext").value = maintIso(maintAdd(maintToday(), f.e, f.u));
    }
}
function maintFormEvery() {
    const v = parseInt(document.getElementById("mfEvery").value, 10);
    if (v >= 1 && v <= 999) { maintForm.e = v; maintFormPaint(); maintFormAutoNext(); }
}
function maintFormUnit(u) { maintForm.u = u; maintFormPaint(); maintFormAutoNext(); }
function maintFormWarn(w) { maintForm.w = w; maintFormPaint(); }
function maintFormClose(cancelled) {
    const m = document.getElementById("maintFormModal");
    if (m) m.style.display = "none";
    if (cancelled && maintForm.kind === "item" && maintForm.fromTpl) maintTplOpen();   // zurück zur Vorlagen-Auswahl
}
async function maintFormSave() {
    const f = maintForm;
    const name = document.getElementById("mfName").value.trim();
    if (!name) {
        if (typeof ingToast === "function") ingToast("Bitte einen Namen eingeben ✏️");
        document.getElementById("mfName").focus();
        return;
    }
    const e = parseInt(document.getElementById("mfEvery").value, 10);
    if (!(e >= 1 && e <= 999)) {
        if (typeof ingToast === "function") ingToast("Bitte eine Zahl von 1 bis 999 eingeben");
        document.getElementById("mfEvery").focus();
        return;
    }
    f.e = e;
    if (f.kind === "item") {
        const next = document.getElementById("mfNext").value;
        if (!maintParse(next)) {
            if (typeof ingToast === "function") ingToast("Bitte einen Termin wählen 📅");
            return;
        }
        const old = f.edit ? maintData().items.find(x => x.id === f.id) : null;
        maintFormClose(false);
        maintTab = "list";
        await maintSaveItem({ id: f.id || undefined, n: name, e, u: f.u, w: f.w, x: next, l: old ? old.l : "" });
    } else {
        maintFormClose(false);
        const tpl = maintSaneTpl({ id: f.id || maintId(), n: name, e, u: f.u, w: f.w });
        await maintTplMutate(l => {
            const i = l.findIndex(x => x.id === tpl.id);
            if (i >= 0) l[i] = tpl; else l.push(tpl);
        });
    }
}
function maintInit() {
    const nx = document.getElementById("mfNext");
    if (nx) nx.addEventListener("change", () => { maintForm.touched = true; });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", maintInit);
else maintInit();

// ===== Vorrat (Bestand mit Einkaufsgrenze, Orten und Einkaufsliste) =====
// Liegt in db.shop.stock und wird mit den Einkaufs-Favoriten in Home Assistant gespeichert (alle Geräte gleich).
//   items:  { id, n: Name, q: Menge jetzt, u: Einheit, o: Ort-ID oder "", w: Startseite ab, m: Einkaufsliste ab,
//             s: Geschäft oder "" (= das gerade offene), k: a (automatisch) | h (von Hand), l: 1 = steht schon auf der Einkaufsliste,
//             d: 1 = bei der Nachfrage "Nicht jetzt" gewählt (bis wieder genug da ist, wird nicht noch einmal gefragt) }
//   places: { id, n }  – nur gespeichert, wenn Orte geändert wurden (sonst gelten die Standard-Orte)
const STOCK_MAX_ITEMS = 100;
const STOCK_UNITS = ["Stk", "Pack", "Fl.", "Dose", "kg", "l"];
const STOCK_DEFAULT_PLACES = [
    { id: "p1", n: "Vorratsschrank" },
    { id: "p2", n: "Kühlschrank" },
    { id: "p3", n: "Tiefkühler" },
    { id: "p4", n: "Keller" },
    { id: "p5", n: "Bad" }
];
// Vorschläge im Formular (füllen Name, Einheit, Menge und Grenzen aus; der Ort wird nur gesetzt, wenn es ihn gibt)
const STOCK_SUGGEST = [
    { n: "Nudeln", u: "Pack", p: "Vorratsschrank", q: 3, w: 2, m: 1 },
    { n: "Reis", u: "Pack", p: "Vorratsschrank", q: 2, w: 1, m: 1 },
    { n: "Mehl", u: "Pack", p: "Vorratsschrank", q: 2, w: 1, m: 1 },
    { n: "Dosentomaten", u: "Dose", p: "Vorratsschrank", q: 6, w: 4, m: 2 },
    { n: "Kaffee", u: "Pack", p: "Vorratsschrank", q: 2, w: 1, m: 1 },
    { n: "Öl", u: "Fl.", p: "Vorratsschrank", q: 2, w: 1, m: 1 },
    { n: "Milch", u: "Pack", p: "Kühlschrank", q: 3, w: 2, m: 1 },
    { n: "Eier", u: "Pack", p: "Kühlschrank", q: 2, w: 1, m: 1 },
    { n: "Tiefkühlpizza", u: "Stk", p: "Tiefkühler", q: 4, w: 2, m: 1 },
    { n: "Wasser", u: "Fl.", p: "Keller", q: 24, w: 10, m: 6 },
    { n: "Klopapier", u: "Pack", p: "Bad", q: 3, w: 2, m: 1 },
    { n: "Spülmittel", u: "Fl.", p: "Bad", q: 2, w: 1, m: 1 }
];
let stockBusy = 0;                        // Anzahl noch nicht gespeicherter Änderungen (solange gilt der lokale Stand)
let stockQueue = Promise.resolve();       // Speichern nacheinander
let stockFilter = "all";                  // "all" | Ort-ID | "none"
const stockForm = { id: null, edit: false, u: "Stk", k: "a", lastStore: "", waitStore: false, storesBefore: 0 };

function stockEl(id) { return document.getElementById(id); }
function stockId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function stockNum(v, d) {
    const n = parseInt(v, 10);
    return (isFinite(n) && n >= 0) ? Math.min(n, 999) : d;
}
function stockSaneItem(it) {
    if (!it || typeof it !== "object") return null;
    const n = String(it.n || "").trim().slice(0, 60);
    if (!n) return null;
    const m = stockNum(it.m, 1);
    let w = stockNum(it.w, 2);
    if (w < m) w = m;
    return {
        id: String(it.id || "").slice(0, 24) || stockId(),
        n,
        q: stockNum(it.q, 0),
        u: STOCK_UNITS.includes(it.u) ? it.u : "Stk",
        o: String(it.o || "").slice(0, 24),
        w,
        m,
        s: String(it.s || "").slice(0, 40),
        k: it.k === "h" ? "h" : "a",
        l: it.l ? 1 : 0,
        d: it.d ? 1 : 0
    };
}
function stockSanePlace(p) {
    if (!p || typeof p !== "object") return null;
    const n = String(p.n || "").trim().slice(0, 30);
    if (!n) return null;
    return { id: String(p.id || "").slice(0, 24) || stockId(), n };
}
function stockNorm(raw) {
    const src = (raw && typeof raw === "object") ? raw : {};
    const out = { items: [] };
    const seen = new Set();
    (Array.isArray(src.items) ? src.items : []).forEach(it => {
        const x = stockSaneItem(it);
        if (x && !seen.has(x.id) && out.items.length < STOCK_MAX_ITEMS) { seen.add(x.id); out.items.push(x); }
    });
    if (Array.isArray(src.places)) {
        out.places = [];
        const seenP = new Set();
        src.places.forEach(p => {
            const x = stockSanePlace(p);
            if (x && !seenP.has(x.id) && out.places.length < 20) { seenP.add(x.id); out.places.push(x); }
        });
    }
    return out;
}
function stockData() {
    if (!db.shop.stock || typeof db.shop.stock !== "object") db.shop.stock = { items: [] };
    if (!Array.isArray(db.shop.stock.items)) db.shop.stock.items = [];
    return db.shop.stock;
}
function stockPlaces() {
    const s = stockData();
    return Array.isArray(s.places) ? s.places : STOCK_DEFAULT_PLACES;
}
function stockPlaceName(id) {
    const p = stockPlaces().find(x => x.id === id);
    return p ? p.n : "";
}
// Geschäft für die Einkaufsliste: das gewählte, sonst (oder wenn es gelöscht wurde) das gerade offene
function stockStoreFor(it) {
    return (it.s && Array.isArray(stores) && stores.includes(it.s)) ? it.s : activeStore;
}
function stockQtyText(it) { return `${it.q} ${it.u}`; }
// k: empty = leer, low = Einkaufsgrenze erreicht, warn = Startseiten-Grenze erreicht, ok = genug da
function stockStatus(it) {
    if (it.q <= 0) return { k: "empty", text: "Leer" };
    if (it.q <= it.m) return { k: "low", text: "Nachkaufen" };
    if (it.q <= Math.max(it.w, it.m)) return { k: "warn", text: "Wird knapp" };
    return { k: "ok", text: "" };
}
function stockNeedsList(it) { return it.q <= it.m && !it.l; }
function stockLowList() {
    return stockData().items
        .filter(it => stockStatus(it).k !== "ok")
        .sort((a, b) => (a.q - b.q) || a.n.localeCompare(b.n, "de", { sensitivity: "base" }));
}
function stockNameSort(a, b) { return a.n.localeCompare(b.n, "de", { sensitivity: "base" }); }

// Wer die Einkaufsgrenze erreicht hat: Merker zurücksetzen (wieder genug da) oder – im Modus "automatisch" – für die Liste vormerken.
// ask = true (Standard "Immer fragen"): nichts vormerken, die Frage "auf die Liste? in welchen Laden?" folgt danach.
function stockAutoFlag(s, adds, ask) {
    s.items.forEach(it => {
        if (it.q > it.m) { it.l = 0; it.d = 0; return; }
        if (it.k === "a" && !it.l && !it.d) {
            if (!ask) it.l = 1;
            if (adds) adds.push({ id: it.id, n: it.n, s: it.s, q: it.q, u: it.u });
        }
    });
}

// ---- Nachfrage vor dem Verschieben auf die Einkaufsliste ----
// "ask" (Standard): jedes Mal fragen, auch in welchen Laden (egal, was beim Artikel hinterlegt ist – man kauft nicht immer im selben).
// "auto": ohne Nachfrage in den beim Artikel hinterlegten Laden (sonst das gerade offene).
function stockAskMode() {
    try { return localStorage.getItem("hh_stock_ask") === "auto" ? "auto" : "ask"; } catch (e) { return "ask"; }
}
function stockSetAskMode(v) {
    try { localStorage.setItem("hh_stock_ask", v === "auto" ? "auto" : "ask"); } catch (e) { /* egal */ }
    stockAskModeSync();
}
function stockAskModeSync() {
    const sel = document.getElementById("stockAskMode");
    if (sel && sel.value !== stockAskMode()) sel.value = stockAskMode();
}
let stockAskResolver = null;
const stockAskPending = new Set();      // Artikel, nach denen gerade gefragt wird (keine doppelte Frage)
// o: { n, q, u, s (hinterlegter Laden), manual, index, total } -> { store, remember } oder null ("Nicht jetzt" / abgebrochen)
function stockAskStore(o) {
    return new Promise(resolve => {
        stockAskResolver = resolve;
        const unit = o.u || "";
        document.getElementById("stockAskTitle").textContent = `🛒 „${o.n}“ auf die Einkaufsliste?`;
        let text;
        if (o.manual) text = "In welchen Laden soll der Artikel?";
        else if (o.q <= 0) text = "Der Artikel ist leer.";
        else text = `Es ist nur noch ${o.q} ${unit} da.`;
        if (o.total > 1) text += ` (${o.index + 1} von ${o.total})`;
        document.getElementById("stockAskText").textContent = text;
        document.getElementById("stockAskRemember").checked = false;
        const pref = (o.s && Array.isArray(stores) && stores.includes(o.s)) ? o.s : (Array.isArray(stores) && stores.includes(activeStore) ? activeStore : undefined);
        const wrap = document.getElementById("stockAskStoreWrap");
        if (wrap) wrap.style.display = ingFillStores(document.getElementById("stockAskStore"), pref) ? "" : "none";
        const no = document.getElementById("stockAskNo");
        if (no) no.textContent = o.manual ? "Abbrechen" : "Nicht jetzt";
        ingApplyTone("stockAskModal");
        document.getElementById("stockAskModal").style.display = "flex";
    });
}
function stockAskAnswer(yes) {
    const remember = document.getElementById("stockAskRemember").checked;
    const sel = document.getElementById("stockAskStore");
    const store = (sel && sel.value) || "";
    document.getElementById("stockAskModal").style.display = "none";
    if (stockAskResolver) {
        const r = stockAskResolver;
        stockAskResolver = null;
        r(yes ? { store, remember } : null);
    }
}
// Neue Fälle (Einkaufsgrenze erreicht): je nach Modus gleich auf die Liste oder erst fragen
async function stockHandleAdds(adds) {
    if (!adds || !adds.length) return;
    if (stockAskMode() === "auto") { await stockPushAdds(adds); return; }
    const todo = adds.filter(a => !stockAskPending.has(a.id));
    todo.forEach(a => stockAskPending.add(a.id));
    const picks = [], skipped = [];
    try {
        for (let i = 0; i < todo.length; i++) {
            const a = todo[i];
            const r = await stockAskStore({ ...a, index: i, total: todo.length });
            if (!r) { skipped.push(a.id); continue; }
            if (r.remember) stockSetAskMode("auto");
            picks.push({ id: a.id, n: a.n, s: r.store });
        }
        if (skipped.length) await stockDo(st => { st.items.forEach(it => { if (skipped.includes(it.id)) it.d = 1; }); return st; }, { noAuto: true });
        if (picks.length) {
            const ids = new Set(picks.map(x => x.id));
            await stockDo(st => { st.items.forEach(it => { if (ids.has(it.id)) it.l = 1; }); return st; }, { noAuto: true });
            await stockPushAdds(picks);
        }
    } finally {
        todo.forEach(a => stockAskPending.delete(a.id));
    }
}

// ---- Speichern: frischen Stand holen, ändern, zurückschreiben ----
async function stockReadRemote() {
    const cfg = SYNC_CONFIG.shop;
    const d = await haGetState(cfg.entity);
    const raw = d && d.attributes && d.attributes[cfg.attr];
    if (!raw) return null;
    const parsed = (typeof raw === "string") ? JSON.parse(raw) : raw;
    return (parsed && typeof parsed === "object") ? parsed : null;
}
function stockWrite(mutator, opts) {
    const noAuto = !!(opts && opts.noAuto);
    stockBusy++;
    stockQueue = stockQueue.then(async () => {
        let base = null;
        try { base = await stockReadRemote(); } catch (e) { /* dann mit dem lokalen Stand */ }
        const hadRemote = !!base;
        if (!base) base = { cats: db.shop.cats, favs: db.shop.favs };
        const s = stockNorm(hadRemote ? base.stock : stockData());
        const out = stockNorm(mutator(s) || s);
        const adds = [];
        if (!noAuto) stockAutoFlag(out, adds, stockAskMode() === "ask");
        base.stock = out;
        db.shop.stock = out;
        const res = await haFireEvent(SYNC_CONFIG.shop.event, { favs: JSON.stringify(base) });
        if (res && res.ok === false) throw new Error("HTTP " + res.status);
        return { out, adds };
    }).catch(e => {
        console.error("❌ Vorrat konnte nicht gespeichert werden:", e);
        if (typeof ingToast === "function") ingToast("⚠️ Vorrat konnte nicht gespeichert werden");
        return null;
    }).then(r => { stockBusy = Math.max(0, stockBusy - 1); return r; });
    return stockQueue;
}
// Änderung sofort lokal zeigen, dann speichern; neue "Einkaufsliste"-Fälle danach auf die Liste setzen
function stockDo(mutator, opts) {
    const local = stockNorm(stockData());
    db.shop.stock = stockNorm(mutator(local) || local);
    stockRefreshUI();
    return stockWrite(mutator, opts).then(async r => {
        stockRefreshUI();
        if (r && r.adds.length) {
            const done = stockHandleAdds(r.adds);
            if (stockAskMode() === "auto") await done;                // automatisch: erst fertig, wenn der Artikel auf der Liste steht
            else done.catch(e => console.error("❌ Vorrat → Einkaufsliste:", e));   // fragen: nicht auf die Antwort im Dialog warten
        }
        return r;
    });
}
function stockRefreshUI() {
    const m = stockEl("stockModal");
    if (m && m.style.display !== "none") stockRender();
    const p = stockEl("stockPlacesModal");
    if (p && p.style.display !== "none") stockPlacesRender();
    if (typeof renderHomeStock === "function") { try { renderHomeStock(); } catch (e) { /* Startseite noch nicht da */ } }
}

// ---- Einkaufsliste ----
// Einträge der Liste sehen so aus: "3x Nudeln @Aldi" – für den Vergleich zählt nur der Name
function stockListKey(s) {
    return String(s).replace(/\s*@.*$/, "").replace(/^\s*\d+\s*x\s+/i, "").trim().toLowerCase();
}
async function stockPushToList(items) {
    const cfg = SYNC_CONFIG.shopping;
    const data = await haGetState(cfg.entity);
    // Ohne gelesene Liste nichts schreiben (sonst würde eine nicht erreichbare Liste überschrieben)
    if (!data || !data.attributes || !(cfg.attr in data.attributes)) throw new Error("Einkaufsliste nicht erreichbar");
    let list = [];
    const raw = data.attributes[cfg.attr];
    if (raw) {
        const parsed = (typeof raw === "string") ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) list = parsed.slice();
    }
    const have = new Set(list.map(stockListKey));
    let added = 0;
    items.forEach(it => {
        const key = stockListKey(it.n);
        if (have.has(key)) return;   // steht schon drauf
        have.add(key);
        list.push(`${it.n} @${stockStoreFor(it)}`);
        added++;
    });
    if (added) {
        const res = await haFireEvent(cfg.event, { json_data: list });
        if (res && res.ok === false) throw new Error("HTTP " + res.status);
    }
    return added;
}
async function stockPushAdds(adds) {
    try {
        const n = await stockPushToList(adds);
        if (typeof ingToast === "function") {
            if (adds.length === 1) ingToast(n ? `🛒 ${adds[0].n} steht jetzt auf der Einkaufsliste` : `🛒 ${adds[0].n} steht schon auf der Einkaufsliste`);
            else ingToast(`🛒 ${n} von ${adds.length} Artikeln auf die Einkaufsliste gesetzt`);
        }
        if (typeof updateAppBadges === "function") { try { updateAppBadges(); } catch (e) { /* egal */ } }
    } catch (e) {
        console.error("❌ Einkaufsliste nicht erreichbar:", e);
        if (typeof ingToast === "function") ingToast("⚠️ Einkaufsliste nicht erreichbar");
        const ids = new Set(adds.map(a => a.id));
        await stockWrite(s => { s.items.forEach(it => { if (ids.has(it.id)) it.l = 0; }); return s; }, { noAuto: true });
        stockRefreshUI();
    }
}

// ---- Aktionen ----
function stockSetQty(id, q) {
    const v = Math.max(0, Math.min(999, q));
    return stockDo(s => { const it = s.items.find(x => x.id === id); if (it) it.q = v; return s; });
}
function stockStep(id, d) {
    const it = stockData().items.find(x => x.id === id);
    if (!it) return Promise.resolve();
    return stockSetQty(id, it.q + d);
}
async function stockAskQty(id) {
    const it = stockData().items.find(x => x.id === id);
    if (!it) return;
    const v = await showInputPrompt(`Wie viel ist von „${it.n}“ jetzt da? (in ${it.u})`, "📦 Menge setzen", String(it.q));
    if (v === null) return;
    const n = parseInt(String(v).trim(), 10);
    if (!isFinite(n) || n < 0 || n > 999) {
        if (typeof ingToast === "function") ingToast("Bitte eine Zahl von 0 bis 999 eingeben");
        return;
    }
    await stockSetQty(id, n);
}
// Von Hand auf die Einkaufsliste setzen
async function stockToList(id) {
    const it = stockData().items.find(x => x.id === id);
    if (!it || it.l || stockAskPending.has(id)) return;
    let store = it.s;
    if (stockAskMode() === "ask") {
        stockAskPending.add(id);
        try {
            const r = await stockAskStore({ n: it.n, q: it.q, u: it.u, s: it.s, manual: true });
            if (!r) return;                                   // abgebrochen: nichts ändern
            if (r.remember) stockSetAskMode("auto");
            store = r.store;
        } finally {
            stockAskPending.delete(id);
        }
    }
    const pick = { id: it.id, n: it.n, s: store };
    await stockDo(s => { const x = s.items.find(y => y.id === id); if (x) { x.l = 1; x.d = 0; } return s; }, { noAuto: true });
    await stockPushAdds([pick]);
}
function stockSaveItem(data) {
    const item = stockSaneItem({ ...data, id: data.id || stockId() });
    return stockDo(s => {
        const i = s.items.findIndex(x => x.id === item.id);
        if (i >= 0) s.items[i] = { ...item, l: s.items[i].l, d: 0 };
        else if (s.items.length < STOCK_MAX_ITEMS) s.items.push({ ...item, l: 0 });
        return s;
    });
}
async function stockDelete(id) {
    const it = stockData().items.find(x => x.id === id);
    if (!it) return;
    const ok = await showDeleteModal(`Möchtest du "${it.n}" wirklich löschen?`, "Artikel löschen 🗑️");
    if (!ok) return;
    await stockDo(s => { s.items = s.items.filter(x => x.id !== id); return s; });
}

// ---- Orte ----
function stockPlaceMutate(fn) {
    return stockDo(s => {
        if (!Array.isArray(s.places)) s.places = STOCK_DEFAULT_PLACES.map(p => ({ ...p }));
        fn(s);
        return s;
    });
}
function stockPlaceTaken(name, exceptId) {
    const k = name.trim().toLowerCase();
    return stockPlaces().some(p => p.id !== exceptId && p.n.toLowerCase() === k);
}
async function stockPlaceAdd() {
    const v = await showInputPrompt("Wie heißt der neue Ort?", "📍 Neuer Ort", "");
    const name = (v || "").trim().slice(0, 30);
    if (!name) return;
    if (stockPlaceTaken(name, null)) { if (typeof ingToast === "function") ingToast("Diesen Ort gibt es schon"); return; }
    await stockPlaceMutate(s => { s.places.push({ id: stockId(), n: name }); });
}
async function stockPlaceRename(id) {
    const cur = stockPlaces().find(p => p.id === id);
    if (!cur) return;
    const v = await showInputPrompt("Neuer Name für den Ort:", "✏️ Ort umbenennen", cur.n);
    const name = (v || "").trim().slice(0, 30);
    if (!name || name === cur.n) return;
    if (stockPlaceTaken(name, id)) { if (typeof ingToast === "function") ingToast("Diesen Ort gibt es schon"); return; }
    await stockPlaceMutate(s => { const p = s.places.find(x => x.id === id); if (p) p.n = name; });
}
async function stockPlaceDelete(id) {
    const cur = stockPlaces().find(p => p.id === id);
    if (!cur) return;
    const n = stockData().items.filter(it => it.o === id).length;
    const msg = n
        ? `Möchtest du "${cur.n}" wirklich löschen? Die ${n} Artikel darin bleiben erhalten und stehen dann unter „Ohne Ort“.`
        : `Möchtest du "${cur.n}" wirklich löschen?`;
    const ok = await showDeleteModal(msg, "Ort löschen 🗑️");
    if (!ok) return;
    await stockPlaceMutate(s => {
        s.places = s.places.filter(p => p.id !== id);
        s.items.forEach(it => { if (it.o === id) it.o = ""; });
    });
}

// ---- Hauptfenster ----
function stockSetFilter(k) { stockFilter = k; stockRender(); }
function stockRow(it) {
    const st = stockStatus(it);
    const row = maintMk("div", "stock-row stock-s-" + st.k);
    row.dataset.id = it.id;
    const top = maintMk("div", "stock-top");
    const main = maintMk("div", "stock-main");
    main.appendChild(maintMk("div", "stock-name", it.n));
    const place = stockPlaceName(it.o);
    main.appendChild(maintMk("div", "stock-meta", [
        place ? "📍 " + place : "",
        "🛒 " + (it.s && Array.isArray(stores) && stores.includes(it.s) ? it.s : "offenes Geschäft"),
        it.k === "a" ? "🤖 Automatisch" : "✋ Von Hand"
    ].filter(Boolean).join(" · ")));
    main.appendChild(maintMk("div", "stock-lim", `Startseite ab ${Math.max(it.w, it.m)} · Einkaufsliste ab ${it.m}`));
    top.appendChild(main);
    const label = (st.text ? st.text : "") + (it.l ? (st.text ? " · " : "") + "🛒 auf der Liste" : "");
    if (label) top.appendChild(maintMk("span", "stock-pill s-" + (st.k === "ok" ? "list" : st.k), label));
    row.appendChild(top);

    const bottom = maintMk("div", "stock-bottom");
    const step = maintMk("div", "stock-step");
    const minus = maintRoundBtn("stock-minus", "−", "Eine Einheit weniger", () => stockStep(it.id, -1));
    const plus = maintRoundBtn("stock-plus", "＋", "Eine Einheit mehr", () => stockStep(it.id, 1));
    const qty = maintMk("button", "stock-qty", stockQtyText(it));
    qty.type = "button";
    qty.setAttribute("aria-label", "Menge eintippen");
    qty.title = "Menge eintippen";
    qty.onclick = () => stockAskQty(it.id);
    minus.disabled = it.q <= 0;
    step.append(minus, qty, plus);
    const btns = maintMk("div", "maint-btns stock-btns");
    if (stockNeedsList(it)) btns.appendChild(maintRoundBtn("stock-list", "🛒", "Auf die Einkaufsliste setzen", () => stockToList(it.id)));
    btns.appendChild(maintRoundBtn("maint-edit", "✏️", "Bearbeiten", () => stockEditItem(it.id)));
    btns.appendChild(maintRoundBtn("maint-del", "🗑️", "Löschen", () => stockDelete(it.id)));
    bottom.append(step, btns);
    row.appendChild(bottom);
    return row;
}
function stockRender() {
    const box = stockEl("stockList");
    if (!box) return;
    const s = stockData();
    const places = stockPlaces();
    if (stockFilter !== "all" && stockFilter !== "none" && !places.some(p => p.id === stockFilter)) stockFilter = "all";
    const placeIds = new Set(places.map(p => p.id));
    const hasPlace = it => placeIds.has(it.o);
    const noPlace = s.items.filter(it => !hasPlace(it));

    const chips = stockEl("stockChips");
    if (chips) {
        chips.textContent = "";
        const mk = (key, label) => {
            const b = maintMk("button", "hh-tab stock-chip" + (stockFilter === key ? " is-on" : ""), label);
            b.type = "button";
            b.setAttribute("aria-pressed", stockFilter === key ? "true" : "false");
            b.onclick = () => stockSetFilter(key);
            chips.appendChild(b);
        };
        mk("all", `Alle (${s.items.length})`);
        places.forEach(p => mk(p.id, `📍 ${p.n} (${s.items.filter(it => it.o === p.id).length})`));
        if (noPlace.length && places.length) mk("none", `Ohne Ort (${noPlace.length})`);
        chips.style.display = (s.items.length || places.length) ? "" : "none";
    }

    const lowN = stockLowList().length;
    const sub = stockEl("stockSub");
    if (sub) sub.textContent = s.items.length ? `${s.items.length} ${s.items.length === 1 ? "Artikel" : "Artikel"}${lowN ? ` · ${lowN} knapp` : " · alles da ✅"}` : "";

    const keep = box.scrollTop;
    box.textContent = "";
    if (!s.items.length) {
        box.appendChild(maintMk("div", "ing-empty", "Noch kein Vorrat. Tippe auf „＋ Neu“ und wähle einen Vorschlag, z. B. Nudeln oder Klopapier."));
        box.scrollTop = 0;
        return;
    }
    let list = s.items.slice();
    if (stockFilter === "none") list = noPlace;
    else if (stockFilter !== "all") list = list.filter(it => it.o === stockFilter);
    if (!list.length) {
        box.appendChild(maintMk("div", "ing-empty", "Hier ist noch nichts drin."));
        return;
    }
    const cols = maintMk("div", "stock-cols");   // Tablet/PC: Spalten nebeneinander (siehe home.css)
    box.appendChild(cols);
    if (stockFilter === "all") {
        const groups = [];
        places.forEach(p => groups.push({ name: p.n, items: list.filter(it => it.o === p.id) }));
        groups.push({ name: "Ohne Ort", items: list.filter(it => !hasPlace(it)) });
        const used = groups.filter(g => g.items.length);
        const showHead = used.length > 1 || (used.length === 1 && used[0].name !== "Ohne Ort");
        used.forEach(g => {
            if (showHead) {
                const h = maintMk("div", "hist-person");
                h.append(maintMk("span", "hist-person-name", (g.name === "Ohne Ort" ? "" : "📍 ") + g.name), maintMk("span", "hist-count", String(g.items.length)));
                cols.appendChild(h);
            }
            g.items.sort(stockNameSort).forEach(it => cols.appendChild(stockRow(it)));
        });
    } else {
        list.sort(stockNameSort).forEach(it => cols.appendChild(stockRow(it)));
    }
    box.scrollTop = keep;
}
async function openStock() {
    if (!hhFeature("stock")) return;   // in den Einstellungen ausgeschaltet
    stockAskModeSync();
    stockRender();
    const m = stockEl("stockModal");
    if (m) m.style.display = "flex";
    try {   // aktuellen Stand von Home Assistant nachladen (z. B. von anderen Geräten)
        const remote = await stockReadRemote();
        if (remote && !stockBusy) {
            db.shop.stock = stockNorm(remote.stock);
            stockRefreshUI();
        }
    } catch (e) { /* egal */ }
}
function closeStock() {
    const m = stockEl("stockModal");
    if (m) m.style.display = "none";
}

// ---- Orte-Fenster ----
function stockPlacesRender() {
    const box = stockEl("stockPlacesList");
    if (!box) return;
    box.textContent = "";
    const places = stockPlaces();
    if (!places.length) {
        box.appendChild(maintMk("div", "ing-empty", "Noch kein Ort. Tippe auf „＋ Ort“."));
        return;
    }
    places.forEach(p => {
        const n = stockData().items.filter(it => it.o === p.id).length;
        const row = maintMk("div", "stock-place-row");
        const name = maintMk("div", "stock-place-name");
        name.append(maintMk("strong", "", "📍 " + p.n), maintMk("small", "", n === 1 ? "1 Artikel" : n + " Artikel"));
        const btns = maintMk("div", "maint-btns");
        btns.appendChild(maintRoundBtn("maint-edit", "✏️", "Umbenennen", () => stockPlaceRename(p.id)));
        btns.appendChild(maintRoundBtn("maint-del", "🗑️", "Löschen", () => stockPlaceDelete(p.id)));
        row.append(name, btns);
        box.appendChild(row);
    });
}
function stockPlacesOpen() {
    stockPlacesRender();
    const m = stockEl("stockPlacesModal");
    if (m) m.style.display = "flex";
}
function stockPlacesClose() {
    const m = stockEl("stockPlacesModal");
    if (m) m.style.display = "none";
    stockRender();
}

// ---- Formular (neuer Artikel / bearbeiten) ----
function stockEditItem(id) {
    const it = stockData().items.find(x => x.id === id);
    if (it) stockFormOpen(it, true);
}
function stockNew() { stockFormOpen(null, false); }
function stockFormFillPlaces(sel) {
    const el = stockEl("sfPlace");
    if (!el) return;
    el.textContent = "";
    const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; el.appendChild(o); };
    add("", "Ohne Ort");
    stockPlaces().forEach(p => add(p.id, p.n));
    el.value = stockPlaces().some(p => p.id === sel) ? sel : "";
}
function stockFormFillStores(sel) {
    const el = stockEl("sfStore");
    if (!el) return;
    el.textContent = "";
    const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; el.appendChild(o); };
    add("", "Kein festes Geschäft (das offene)");
    (Array.isArray(stores) ? stores : []).forEach(s => add(s, s));
    add("__new__", "＋ Neues Geschäft …");
    const ok = !!sel && Array.isArray(stores) && stores.includes(sel);
    el.value = ok ? sel : "";
    stockForm.lastStore = ok ? sel : "";
}
// "＋ Neues Geschäft": das vorhandene Fenster zum Anlegen öffnen (liegt über diesem Fenster)
function stockFormStoreChange() {
    const el = stockEl("sfStore");
    if (!el) return;
    if (el.value === "__new__") {
        stockForm.waitStore = true;
        stockForm.storesBefore = Array.isArray(stores) ? stores.length : 0;
        el.value = stockForm.lastStore;
        if (typeof addSidebarItem === "function") addSidebarItem("shop");
    } else {
        stockForm.lastStore = el.value;
    }
}
// Wird aufgerufen, wenn das Fenster "Neues Geschäft" zugeht (angelegt oder abgebrochen)
function stockStoreDlgClosed() {
    if (!stockForm.waitStore) return;
    stockForm.waitStore = false;
    const added = (Array.isArray(stores) && stores.length > stockForm.storesBefore) ? stores[stores.length - 1] : null;
    stockFormFillStores(added || stockForm.lastStore);
}
function stockFormOpen(src, edit) {
    const f = stockForm;
    f.edit = !!edit;
    f.id = (edit && src) ? src.id : null;
    f.u = src ? src.u : "Stk";
    f.k = src ? src.k : "a";
    f.waitStore = false;
    stockEl("sfTitle").textContent = edit ? "✏️ Artikel bearbeiten" : "📦 Neuer Artikel";
    stockEl("sfName").value = src ? src.n : "";
    stockEl("sfQty").value = String(src ? src.q : 3);
    stockEl("sfWarn").value = String(src ? src.w : 2);
    stockEl("sfMin").value = String(src ? src.m : 1);
    stockFormFillPlaces(src ? src.o : "");
    stockFormFillStores(src ? src.s : "");
    stockFormSuggest();
    stockFormPaint();
    const m = stockEl("stockFormModal");
    if (m) m.style.display = "flex";
    const nm = stockEl("sfName");
    if (nm && !nm.value) { try { nm.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
}
// Vorschläge nur bei neuen Artikeln
function stockFormSuggest() {
    const row = stockEl("sfSugRow");
    const box = stockEl("sfSug");
    if (!row || !box) return;
    row.style.display = stockForm.edit ? "none" : "";
    box.textContent = "";
    const have = new Set(stockData().items.map(it => it.n.toLowerCase()));
    STOCK_SUGGEST.filter(sg => !have.has(sg.n.toLowerCase())).forEach(sg => {
        const b = maintMk("button", "hh-tab stock-sug", sg.n);
        b.type = "button";
        b.onclick = () => stockFormApplySuggest(sg);
        box.appendChild(b);
    });
    if (!box.childElementCount) row.style.display = "none";
}
function stockFormApplySuggest(sg) {
    stockEl("sfName").value = sg.n;
    stockEl("sfQty").value = String(sg.q);
    stockEl("sfWarn").value = String(sg.w);
    stockEl("sfMin").value = String(sg.m);
    stockForm.u = sg.u;
    const p = stockPlaces().find(x => x.n.toLowerCase() === sg.p.toLowerCase());
    if (p) stockEl("sfPlace").value = p.id;
    stockFormPaint();
}
function stockFormUnit(u) { stockForm.u = u; stockFormPaint(); }
function stockFormMode(k) { stockForm.k = (k === "h") ? "h" : "a"; stockFormPaint(); }
function stockFormPaint() {
    const f = stockForm;
    document.querySelectorAll("#sfUnits button").forEach(b => {
        const on = b.dataset.u === f.u;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("#sfMode button").forEach(b => {
        const on = b.dataset.k === f.k;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const hint = stockEl("sfModeHint");
    if (hint) hint.textContent = f.k === "a"
        ? "Sobald die Einkaufsgrenze erreicht ist, kommt der Artikel von selbst auf die Einkaufsliste."
        : "Der Artikel erscheint auf der Startseite. Mit 🛒 setzt du ihn selbst auf die Einkaufsliste.";
}
function stockFormClose() {
    const m = stockEl("stockFormModal");
    if (m) m.style.display = "none";
    stockForm.waitStore = false;
}
async function stockFormSave() {
    const f = stockForm;
    const name = stockEl("sfName").value.trim();
    if (!name) {
        if (typeof ingToast === "function") ingToast("Bitte einen Namen eingeben ✏️");
        stockEl("sfName").focus();
        return;
    }
    if (stockData().items.some(it => it.id !== f.id && it.n.toLowerCase() === name.toLowerCase())) {
        if (typeof ingToast === "function") ingToast("Diesen Artikel gibt es schon");
        return;
    }
    if (!f.edit && stockData().items.length >= STOCK_MAX_ITEMS) {
        if (typeof ingToast === "function") ingToast(`Es sind höchstens ${STOCK_MAX_ITEMS} Artikel möglich`);
        return;
    }
    const q = stockNum(stockEl("sfQty").value, 0);
    const m = stockNum(stockEl("sfMin").value, 1);
    const w = stockNum(stockEl("sfWarn").value, 2);
    const data = {
        id: f.id, n: name, q, u: f.u, o: stockEl("sfPlace").value,
        w: Math.max(w, m), m, s: stockEl("sfStore").value === "__new__" ? "" : stockEl("sfStore").value, k: f.k
    };
    stockFormClose();
    await stockSaveItem(data);
    stockRender();
}

async function deleteTodo(id) {
    const taskToDelete = todoDb.find(x => String(x.id) === String(id));
    if (taskToDelete) {
        const confirmed = await showDeleteModal(`Möchtest du "${taskToDelete.name}" wirklich löschen?`);
        if (confirmed) {
            const deletedName = taskToDelete.name;
            todoDb = todoDb.filter(x => String(x.id) !== String(id));
            await saveTodoDb(deletedName, "gelöscht 🗑️");
            renderTodoList();
            if (typeof updateAppBadges === "function") updateAppBadges();
        }
    }
}      
      
function addTodo(manualName = null) {
    const i = document.getElementById("in-todo");
    tempTodoName = manualName || (i ? i.value.trim() : "");
    if (!tempTodoName) return;

    const select = document.getElementById("modalAssignee");
    if (select) {
        select.innerHTML = '<option value="">Niemand (Alle)</option>'; 

        if (Array.isArray(users)) {
            users.forEach(uStr => {
                if (typeof uStr === 'string' && uStr.includes(':')) {
                    const uName = uStr.split(':')[0]; 
                    const option = document.createElement("option");
                    option.value = uName;
                    option.innerText = uName;
                    
                    if (uName === user) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                }
            });
        }
    }

    const modalTitle = document.getElementById("modalTitle");
    if (modalTitle) {
        modalTitle.innerText = `Intervall für "${tempTodoName}"`;
    }

    const modalValue = document.getElementById("modalValue");
    if (modalValue) {
        modalValue.value = "1";
    }
    
    const timeInput = document.getElementById("modalTime");
    if (timeInput) {
        timeInput.value = "10:00"; 
    }

    const modal = document.getElementById("intervalModal");
    if (modal) {
        modal.style.display = "flex";
    }

    if (!manualName && i) {
        i.value = ""; 
    }

    selectedDays = [];
    document.querySelectorAll('.day-dot').forEach(dot => dot.classList.remove('active'));
}

let selectedDays = [];

function toggleDay(dayNum, element) {
    const index = selectedDays.indexOf(dayNum);
    if (index > -1) {
        selectedDays.splice(index, 1);
        element.classList.remove('active');
    } else {
        selectedDays.push(dayNum);
        element.classList.add('active');
    }
}

async function confirmInterval(einheit) {
    const valInput = document.getElementById("modalValue");
    const dateInput = document.getElementById("modalDate");
    const assigneeInput = document.getElementById("modalAssignee");
    const timeInput = document.getElementById("modalTime");

    let nextDate;
    let hours;
    const now = new Date();
    
    const timeVal = timeInput ? timeInput.value : "10:00";
    const [hrs, mins] = timeVal.split(':').map(Number);

    if (einheit === 'date') {
        if (!dateInput.value) { alert("Bitte Datum auswählen!"); return; }
        nextDate = new Date(dateInput.value);
        if (dateInput.value.length <= 10) {
            nextDate.setHours(hrs, mins, 0, 0);
        }
        const diffMs = nextDate.getTime() - now.getTime();
        hours = Math.max(1 / 60, diffMs / 3600000); 
    } else if (einheit === 'days') {
        if (!selectedDays || selectedDays.length === 0) { 
            alert("Bitte mindestens einen Wochentag auswählen!"); 
            return; 
        }
        const wochenRhythmus = parseInt(valInput.value) || 1;
        const currentDay = now.getDay(); 
        let minDiff = 7; 
        
        selectedDays.forEach(day => {
            let diff = (day - currentDay + 7) % 7;
            if (diff === 0) diff = 7; 
            if (diff < minDiff) minDiff = diff;
        });

        nextDate = new Date(now);
        nextDate.setDate(now.getDate() + minDiff);
        
        if (wochenRhythmus > 1) {
            nextDate.setDate(nextDate.getDate() + (wochenRhythmus - 1) * 7);
        }

        nextDate.setHours(hrs, mins, 0, 0);
        hours = wochenRhythmus * 7 * 24; 
    } else {
        const val = parseFloat(valInput.value.replace(',', '.'));
        if (isNaN(val) || val <= 0) { alert("Bitte eine Zahl eingeben!"); return; }
        
        if (einheit === 't') {
            hours = val * 24;
            nextDate = new Date(now);
            nextDate.setDate(now.getDate() + Math.round(val));
            nextDate.setHours(hrs, mins, 0, 0);
        } else if (einheit === 'm') {
            hours = val / 60;
            nextDate = new Date(now.getTime() + (val * 60 * 1000));
        } else {
            hours = val;
            nextDate = new Date(now.getTime() + (hours * 3600000));
        }
    }

    const rawAssignee = assigneeInput ? assigneeInput.value : "";
    const assignedPerson = (rawAssignee && rawAssignee.trim() !== "") ? rawAssignee.trim() : null;

    const newTodo = { 
        id: Date.now(), 
        name: tempTodoName, 
        room: activeRoom, 
        assignedTo: assignedPerson,
        time: timeVal, 
        intervalHours: hours, 
        intervalUnit: einheit,
        selectedWeekdays: einheit === 'days' ? [...selectedDays] : null,
        weeks: (einheit === 'days') ? (parseInt(valInput.value) || 1) : 1, 
        lastDone: now.toISOString(), 
        nextDate: nextDate.toISOString() 
    };

    todoDb.push(newTodo);
    await saveTodoDb(newTodo.name, "neu erstellt 🆕");

    document.getElementById("intervalModal").style.display = "none";
    if(dateInput) dateInput.value = ""; 
    valInput.value = "1"; 
    if(timeInput) timeInput.value = "10:00"; 
    selectedDays = []; 
    document.querySelectorAll('.day-dot').forEach(dot => dot.classList.remove('active'));

    renderTodoList();
}
    
function openEdit(id) {
    const t = todoDb.find(x => String(x.id) === String(id));
    if(t) {
        document.getElementById('edit-id').value = t.id;
        document.getElementById('edit-name').value = t.name;
        
        const editSelect = document.getElementById('edit-assignee');
        if (editSelect) {
            editSelect.innerHTML = '<option value="">Niemand (Alle)</option>';
            if (typeof users !== 'undefined' && Array.isArray(users)) {
                users.forEach(uStr => {
                    const uName = uStr.split(':')[0]; 
                    const option = document.createElement("option");
                    option.value = uName;
                    option.innerText = uName;
                    if (uName === t.assignedTo) option.selected = true;
                    editSelect.appendChild(option);
                });
            }
            if (!t.assignedTo) editSelect.value = "";
        }

        let displayVal;
        if (t.selectedWeekdays && t.selectedWeekdays.length > 0) {
            displayVal = t.weeks || Math.round(t.intervalHours / 168) || 1;
        } else if (t.intervalUnit === 'm' || (t.intervalHours > 0 && t.intervalHours < 1)) {
            displayVal = Math.round(t.intervalHours * 60);
        } else if (t.intervalHours >= 24) {
            displayVal = Math.round((t.intervalHours / 24) * 10) / 10;
        } else {
            displayVal = Math.round(t.intervalHours * 10) / 10;
        }
        
        const intervalInput = document.getElementById('edit-interval-val');
        if(intervalInput) intervalInput.value = displayVal;

        const timeInput = document.getElementById('edit-time');
        if(timeInput) timeInput.value = t.time || "10:00"; 

        if(t.nextDate) {
            const date = new Date(t.nextDate);
            const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            const dateInput = document.getElementById('edit-date-val');
            if(dateInput) dateInput.value = local;
        }

        selectedDays = []; 
        const dots = document.querySelectorAll('#edit-weekday-row .day-dot');
        dots.forEach(dot => dot.classList.remove('active'));

        const daysToLoad = t.selectedWeekdays; 
        if(daysToLoad && Array.isArray(daysToLoad)) {
            selectedDays = [...daysToLoad];
            dots.forEach(dot => {
                const match = dot.getAttribute('onclick').match(/\d+/);
                if(match) {
                    const dayNum = parseInt(match[0]);
                    if(selectedDays.includes(dayNum)) dot.classList.add('active');
                }
            });
        }
        
        const modal = document.getElementById('editModal');
        if(modal) modal.style.display = 'flex';
    }
}    

function closeEdit() {
    document.getElementById('editModal').style.display = 'none';
}

async function saveEdit(modus) {
    const id = document.getElementById('edit-id').value;
    const idx = todoDb.findIndex(t => String(t.id) === String(id));
    if(idx === -1) return;

    const name = document.getElementById('edit-name').value.trim();
    const val = parseFloat(String(document.getElementById('edit-interval-val').value).replace(',', '.')) || 1;
    const dateVal = document.getElementById('edit-date-val').value;
    
    const assigneeEl = document.getElementById('edit-assignee') || document.getElementById('editAssignee');
    const assignee = assigneeEl ? assigneeEl.value.trim() : "";
    
    const timeVal = document.getElementById('edit-time').value || "10:00";
    const [hrs, mins] = timeVal.split(':').map(Number);
    const now = new Date();

    todoDb[idx].name = name;
    todoDb[idx].assignedTo = (assignee !== "" && assignee !== "Niemand") ? assignee : null; 
    todoDb[idx].time = timeVal; 
    todoDb[idx].intervalUnit = modus;

    if (modus === 'date') {
        if(!dateVal) return alert("Bitte Datum wählen!");
        const targetDate = new Date(dateVal);
        if (dateVal.length <= 10) {
            targetDate.setHours(hrs, mins, 0, 0);
        }
        todoDb[idx].nextDate = targetDate.toISOString();
        const diff = targetDate - now;
        todoDb[idx].intervalHours = Math.max(1 / 60, diff / (1000 * 60 * 60));
        todoDb[idx].selectedWeekdays = null;
        delete todoDb[idx].selectedDays;
        delete todoDb[idx].weeks;
    } else if (modus === 'days') {
        if (!selectedDays || selectedDays.length === 0) return alert("Bitte Wochentage wählen!");
        todoDb[idx].selectedWeekdays = [...selectedDays];
        delete todoDb[idx].selectedDays;
        const wochenRhythmus = Math.max(1, Math.round(val)); 
        todoDb[idx].weeks = wochenRhythmus;
        
        let tageDiff = -1;
        for (let i = 0; i <= 7; i++) {
            let temp = new Date();
            temp.setDate(temp.getDate() + i);
            temp.setHours(hrs, mins, 0, 0);
            if (selectedDays.includes(temp.getDay())) {
                if (i === 0 && temp < now) continue;
                tageDiff = i;
                break;
            }
        }
        if (tageDiff === -1) tageDiff = 7; 

        let finalDate = new Date();
        finalDate.setDate(now.getDate() + tageDiff + ((wochenRhythmus - 1) * 7));
        finalDate.setHours(hrs, mins, 0, 0);

        todoDb[idx].nextDate = finalDate.toISOString();
        todoDb[idx].intervalHours = wochenRhythmus * 168; 
    } else {
        let hours;
        let nextDate;
        if (modus === 't') {
            hours = val * 24;
            nextDate = new Date(now);
            nextDate.setDate(now.getDate() + Math.round(val));
            nextDate.setHours(hrs, mins, 0, 0);
        } else if (modus === 'm') {
            hours = val / 60;
            nextDate = new Date(now.getTime() + (val * 60 * 1000));
        } else {
            hours = val;
            nextDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));
        }

        todoDb[idx].intervalHours = hours;
        todoDb[idx].nextDate = nextDate.toISOString();
        todoDb[idx].selectedWeekdays = null;
        delete todoDb[idx].selectedDays;
        delete todoDb[idx].weeks;
    }

    await saveTodoDb(name, "bearbeitet ✏️");
    closeEdit();
    renderTodoList();
}    


function renderTodoList() {
    if (typeof renderSidebars === "function") {
        renderSidebars();
    }

    const ul = document.getElementById("list-todo"); 
    if (!ul) return; 
    ul.innerHTML = "";

    const filtered = todoDb
        .filter(t => t.room === activeRoom)
        .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));
    
    if (!filtered.length) { 
        ul.innerHTML = "<li style='text-align:center; padding:20px;'>Raum sauber! ✨</li>"; 
        return; 
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    filtered.forEach(t => {
        const next = new Date(t.nextDate);
        const diffMs = next - now;
        const diffMins = Math.ceil(diffMs / (1000 * 60));
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        
        const tempNext = new Date(t.nextDate);
        const diffDays = Math.floor((tempNext.setHours(0,0,0,0) - todayStart.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        
        const isOverdue = diffMs < 0; 
        
        let statusColor = "var(--primary)"; 
        let timeText = `In ${diffDays} Tg.`;

        if (isOverdue) {
            statusColor = "var(--danger)"; 
            timeText = "ÜBERFÄLLIG";
        } else if (diffMins < 60) {
            statusColor = "#f39c12"; 
            timeText = `In ${diffMins} Min.`;
        } else if (diffDays === 0) {
            statusColor = "#f39c12"; 
            timeText = (t.intervalHours && t.intervalHours < 24) ? `In ${diffHours} Std.` : "Heute";
        } else if (diffDays === 1) {
            statusColor = "#f39c12"; 
            timeText = "Morgen";
        }

        let btnLabel = isOverdue ? "Zurücksetzen 🔄" : "Erledigt ✅";

        const formatDT = (isoStr) => {
            if (!isoStr) return '---';
            const d = new Date(isoStr);
            const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' });
            const datePart = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            const timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return `${weekday}, ${datePart} ${timePart}`;
        };
        
        const li = document.createElement("li");
        if (diffHours <= 6 || isOverdue) li.classList.add("urgent-blink");

        const safeName = escapeHtml(t.name);
        const safeAssigned = t.assignedTo ? escapeHtml(t.assignedTo) : "";

        li.innerHTML = `
            <div class="todo-body">
                <div class="todo-head">
                    <div class="todo-title-col">
                        <strong class="todo-title">${safeName}</strong>
                        ${safeAssigned ? `<span class="todo-assigned" style="color:var(--gray);">👤 ${safeAssigned}</span>` : ''}
                    </div>
                    <span class="todo-pill" style="color:${statusColor}; background:${statusColor}15; border: 1px solid ${statusColor}30;">${escapeHtml(timeText)}</span>
                </div>
                <div class="todo-meta" style="color:var(--gray);">
                    <span>📅 Fällig: ${escapeHtml(formatDT(t.nextDate))} Uhr</span>
                    <span>✅ Zuletzt: ${t.lastDone ? escapeHtml(formatDT(t.lastDone)) : 'Neu'}</span>
                </div>
            </div>
            <div class="todo-actions-row"></div>`;

        const actionsRow = li.querySelector(".todo-actions-row");

        const btnComplete = document.createElement("button");
        btnComplete.className = "todo-btn todo-btn-done";
        btnComplete.style.cssText = `color:white; border:none; cursor:pointer; background: ${statusColor}; transition: background 0.3s;`;
        btnComplete.textContent = btnLabel;
        btnComplete.addEventListener("click", () => completeTodo(t.id));

        const btnEdit = document.createElement("button");
        btnEdit.className = "todo-btn todo-btn-icon todo-btn-edit";
        btnEdit.setAttribute("aria-label", "Bearbeiten");
        btnEdit.title = "Bearbeiten";
        btnEdit.textContent = "✏️";
        btnEdit.addEventListener("click", () => openEdit(t.id));

        const btnDel = document.createElement("button");
        btnDel.className = "todo-btn todo-btn-icon todo-btn-del";
        btnDel.setAttribute("aria-label", "Löschen");
        btnDel.title = "Löschen";
        btnDel.textContent = "🗑️";
        btnDel.addEventListener("click", () => deleteTodo(t.id));

        actionsRow.appendChild(btnComplete);
        actionsRow.appendChild(btnEdit);
        actionsRow.appendChild(btnDel);

        ul.appendChild(li);
    });
    
    if (typeof updateAppBadges === "function") {
        updateAppBadges();
    }
}


// Hilfsfunktion gegen XSS (Punkt 4 aus dem Review)
function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function syncDown() {
    try {
        console.log("🔄 SyncDown gestartet...");

        for (let t of ['shop', 'food', 'todo']) {
            const cfg = SYNC_CONFIG[t];
            const d = await haGetState(cfg.entity);

            if (d && d.attributes && d.attributes[cfg.attr]) {
                let rawData = d.attributes[cfg.attr];
                let parsed = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
                if (parsed) {
                    db[t].cats = parsed.cats || ["Alle"];
                    db[t].favs = parsed.favs || [];
                    if (t === "food" && parsed.recipes && typeof parsed.recipes === "object") {
                        db[t].recipes = parsed.recipes;
                        try { localStorage.setItem("hh_recipes", JSON.stringify(parsed.recipes)); } catch (e) { /* egal */ }
                    }
                    if (t === "food" && parsed.weekShift && typeof parsed.weekShift === "object") {
                        db[t].weekShift = parsed.weekShift;
                    }
                    if (t === "todo") {
                        db[t].history = todoHistMerge(Array.isArray(parsed.history) ? parsed.history : [], []);
                        const hm = document.getElementById("historyModal");
                        if (hm && hm.style.display !== "none") todoHistRender();
                        if (!maintBusy) db[t].maint = maintNorm(parsed.maint);   // Wartung (solange nichts Ungespeichertes da ist)
                        maintRefreshUI();
                    }
                    if (t === "shop") {
                        if (!stockBusy) db[t].stock = stockNorm(parsed.stock);   // Vorrat (solange nichts Ungespeichertes da ist)
                        stockRefreshUI();
                    }
                }
            }
            if (t === "food" && d && d.attributes) {
                shiftCfgLoaded = true; // fehlt weekShift in HA, gelten die Standardwerte (Sonntag 23:00)
                updateFoodAutoInfo();
            }
        }

        const [dSt, dR, dTodo] = await Promise.all([
            haGetState(STORES_ENTITY),
            haGetState(ROOMS_ENTITY),
            haGetState(TODO_DATA_ENTITY)
        ]);
 
        if (dSt.state?.startsWith('[')) stores = JSON.parse(dSt.state);
        if (dR.state?.startsWith('[')) rooms = JSON.parse(dR.state);

        if (dTodo && dTodo.attributes && dTodo.attributes.tasks_json) {
            try {
                let rawData = dTodo.attributes.tasks_json;
                let savedTasks = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
                if (Array.isArray(savedTasks)) todoDb = savedTasks;
            } catch (jsonErr) {
                console.error("❌ JSON-Fehler bei Aufgaben:", jsonErr);
            }
        }

        if (document.getElementById("app").style.display !== "none") {
            renderSidebars(); 
            render(); 
            if (curTab === 'todo' && document.getElementById("list-todo")) renderTodoList(); 
            if (typeof load === 'function') load();
        }

        console.log("✅ SyncDown erfolgreich abgeschlossen.");
    } catch(e) {
        console.error("❌ Kritischer Fehler in syncDown:", e);
    }
}

async function syncUp() { 
    const cfg = SYNC_CONFIG[curTab];
    if (!cfg) return;
    const data = JSON.stringify(db[curTab]);

    try { 
        await haFireEvent(cfg.event, { favs: data });
    } catch(e) {
        console.error(`❌ Fehler beim Speichern der Favoriten für ${curTab}:`, e);
    } 
}

// --- GLOBALE VARIABLEN FÜR DEN ERWEITERTEN WOCHENPLAN ---
let activeFoodWeek = 0; // 0 = Diese Woche, 1 = Nächste Woche
let activeMealInput = null; // Merkt sich das zuletzt angeklickte Feld für Favoriten-Chips
let isShiftingWeek = false; // Schutz vor doppeltem Ausführen beim Wochenwechsel

// --- EINSTELLUNGEN FÜR DEN AUTOMATISCHEN WOCHENWECHSEL ---
// Standard: Sonntag 23:00 Uhr. In der App über das ⚙️ am Hinweis im Wochenplan änderbar.
// Die Einstellung steckt in db.food.weekShift und wird mit den Favoriten in Home Assistant
// gespeichert – dadurch haben alle Geräte denselben Wert.
const SHIFT_DEFAULT = { on: true, day: 0, hour: 23, minute: 0 };  // day: 0 = Sonntag, 1 = Montag, ..., 6 = Samstag
const SHIFT_DAY_NAMES = ["Sonntags", "Montags", "Dienstags", "Mittwochs", "Donnerstags", "Freitags", "Samstags"];
const SHIFT_DAY_FULL = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
let shiftCfgLoaded = false; // erst true, wenn die gespeicherte Einstellung aus Home Assistant gelesen wurde

function getShiftCfg() {
    const w = (db && db.food && db.food.weekShift && typeof db.food.weekShift === "object") ? db.food.weekShift : {};
    const day = Number(w.day), hour = Number(w.hour), minute = Number(w.minute);
    return {
        on: w.on !== false,
        day: (Number.isInteger(day) && day >= 0 && day <= 6) ? day : SHIFT_DEFAULT.day,
        hour: (Number.isInteger(hour) && hour >= 0 && hour <= 23) ? hour : SHIFT_DEFAULT.hour,
        minute: (Number.isInteger(minute) && minute >= 0 && minute <= 59) ? minute : SHIFT_DEFAULT.minute
    };
}
function shiftSuffix(c) { return `_${c.day}-${c.hour}-${c.minute}`; }
function shiftTimeText(c) { return `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`; }

// Hinweis-Text im Wochenplan passend zur Einstellung
function updateFoodAutoInfo() {
    const el = document.getElementById("foodAutoText");
    if (!el) return;
    const c = getShiftCfg();
    el.textContent = c.on
        ? `✨ Automatischer Wochenwechsel ${SHIFT_DAY_NAMES[c.day]} um ${shiftTimeText(c)} Uhr oder manuell über den Button`
        : "✋ Wochenwechsel nur manuell über den Button „Woche abschließen“";
}

// Nächster automatischer Wechsel (nach jetzt) – für die Vorschau im Einstellungsfenster
function nextShiftDate(c, from) {
    const now = from || new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), c.hour, c.minute, 0, 0);
    d.setDate(d.getDate() + ((c.day - d.getDay() + 7) % 7));
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
    return d;
}

// ===== Wochenwechsel einstellen (Fenster) =====
let wsState = { on: true, day: 0 };

function wsPad(n) { return String(n).padStart(2, "0"); }

function wsReadTime() {
    const t = document.getElementById("wsTime");
    const m = /^(\d{1,2}):(\d{2})/.exec((t && t.value) || "");
    return m ? { hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) } : { hour: SHIFT_DEFAULT.hour, minute: SHIFT_DEFAULT.minute };
}

function wsRender() {
    const on = document.getElementById("wsOn"), off = document.getElementById("wsOff");
    if (on) on.classList.toggle("is-on", wsState.on);
    if (off) off.classList.toggle("is-on", !wsState.on);
    document.querySelectorAll("#wsDays button").forEach(b => b.classList.toggle("is-on", Number(b.dataset.day) === wsState.day));
    const det = document.getElementById("wsDetail");
    if (det) det.classList.toggle("is-off", !wsState.on);
    const pv = document.getElementById("wsPreview");
    if (pv) {
        if (!wsState.on) {
            pv.textContent = "Kein automatischer Wechsel – du schließt die Woche selbst mit dem Button „Woche abschließen“ ab.";
        } else {
            const t = wsReadTime();
            const d = nextShiftDate({ day: wsState.day, hour: t.hour, minute: t.minute });
            pv.textContent = `Nächster Wechsel: ${SHIFT_DAY_FULL[d.getDay()]}, ${wsPad(d.getDate())}.${wsPad(d.getMonth() + 1)}. um ${wsPad(t.hour)}:${wsPad(t.minute)} Uhr`;
        }
    }
}

function openWeekShiftSettings() {
    const c = getShiftCfg();
    wsState = { on: c.on, day: c.day };
    const t = document.getElementById("wsTime");
    if (t) t.value = shiftTimeText(c);
    wsRender();
    const m = document.getElementById("weekShiftModal");
    if (m) m.style.display = "flex";
}
function wsClose() {
    const m = document.getElementById("weekShiftModal");
    if (m) m.style.display = "none";
}
function wsSetOn(v) { wsState.on = !!v; wsRender(); }
function wsSetDay(d) { wsState.day = d; wsRender(); }

async function wsSave() {
    const t = wsReadTime();
    const cfg = { on: wsState.on, day: wsState.day, hour: t.hour, minute: t.minute };
    db.food.weekShift = cfg;
    wsClose();
    updateFoodAutoInfo();
    try {
        // Mit den Favoriten in Home Assistant speichern -> alle Geräte übernehmen es (spätestens nach ~20 s)
        const res = await haFireEvent(SYNC_CONFIG.food.event, { favs: JSON.stringify(db.food) });
        if (res && res.ok === false) throw new Error("HTTP " + res.status);
    } catch (e) {
        console.error("❌ Wochenwechsel-Einstellung konnte nicht gespeichert werden:", e);
        showAlert("Die Einstellung konnte nicht gespeichert werden.", "Fehler ⚠️");
        return;
    }
    // Timer neu eichen (ohne Gerichte zu löschen) – es wird nichts sofort verschoben
    try { await checkAndAutoAdvanceFoodWeek(); } catch (e) { /* egal */ }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { document.getElementById("wsTime") && document.getElementById("wsTime").addEventListener("change", wsRender); });
else if (document.getElementById("wsTime")) document.getElementById("wsTime").addEventListener("change", wsRender);

function setActiveMealInput(el) {
    activeMealInput = el;
}

async function switchFoodWeek(weekIdx) {
    activeFoodWeek = weekIdx;
    const btn0 = document.getElementById("btn-week-0");
    const btn1 = document.getElementById("btn-week-1");
    if (btn0) btn0.classList.toggle("active-food", weekIdx === 0);
    if (btn1) btn1.classList.toggle("active-food", weekIdx === 1);
    
    highlightToday();
    await load();
}

// Hilfsfunktion: Zerlegt den gespeicherten String einer Woche (Abwärtskompatibel!)
function parseFoodWeekStr(str, isSunday = false) {
    if (!str || str === 'unknown' || str === '---') {
        return { bf: "", lunch: "", dn: "", cook: "", out: "", outCook: "" };
    }
    const parts = str.split('|');
    if (parts.length >= 4) {
        return {
            bf: (parts[0] || "").trim(),
            lunch: (parts[1] || "").trim(),
            dn: (parts[2] || "").trim(),
            cook: (parts[3] || "").trim(),
            out: isSunday ? (parts[4] || "").trim() : "",
            outCook: isSunday ? (parts[5] || "").trim() : ""
        };
    }
    if (str.includes(' | ')) {
        const oldParts = str.split(' | ');
        return { bf: "", lunch: oldParts[0].trim(), dn: "", cook: (oldParts[1] || "").trim(), out: "", outCook: "" };
    }
    return { bf: "", lunch: str.trim(), dn: "", cook: "", out: "", outCook: "" };
}

function serializeFoodWeekObj(obj, isSunday = false) {
    const clean = (val) => (val || "").replace(/\|/g, "/").replace(/~/g, "-").trim();
    if (isSunday) {
        return `${clean(obj.bf)}|${clean(obj.lunch)}|${clean(obj.dn)}|${clean(obj.cook)}|${clean(obj.out)}|${clean(obj.outCook)}`;
    }
    return `${clean(obj.bf)}|${clean(obj.lunch)}|${clean(obj.dn)}|${clean(obj.cook)}`;
}

// --- WOCHENWECHSEL LOGIK (AUTOMATISCH & MANUELL PER BUTTON) ---
function formatStamp(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    // Hängt Tag/Stunde/Minute an, damit Änderungen im Code sofort als neuer Test erkannt werden!
    return `${year}-${month}-${day}${shiftSuffix(getShiftCfg())}`;
}

function getCurrentCycleStamp() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const min = now.getMinutes();
    const target = new Date(now);
    const cfg = getShiftCfg();

    if (day === cfg.day) {
        // Vor der eingestellten Uhrzeit gilt noch der Stempel von letzter Woche (-7 Tage)
        if (hour < cfg.hour || (hour === cfg.hour && min < cfg.minute)) {
            target.setDate(now.getDate() - 7);
        }
    } else {
        const diff = (day - cfg.day + 7) % 7;
        target.setDate(now.getDate() - diff);
    }
    return formatStamp(target);
}

function getManualAdvanceCycleStamp() {
    const now = new Date();
    const day = now.getDay();
    const target = new Date(now);
    const cfg = getShiftCfg();

    if (day !== cfg.day) {
        const diff = (cfg.day - day + 7) % 7;
        target.setDate(now.getDate() + diff);
    }
    return formatStamp(target);
}

// ✅ NEU: Stempel ("2026-11-08_0-23-0") -> fortlaufende Tageszahl (sommerzeit-sicher, zum Vergleichen/Zählen)
function stampToDayNumber(stamp) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(stamp || "");
    if (!m) return null;
    return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

// ✅ NEU: Liest einen Essensplan-Helper.
// Leer / unknown = "" (ist völlig okay und KEIN Grund mehr, den Wechsel zu überspringen!).
// Nur wenn Home Assistant wirklich nicht antwortet, gibt es einen Fehler -> dann wird nichts überschrieben.
async function readFoodRaw(entityId) {
    const d = await haGetState(entityId);
    if (!d || d.state === 'unavailable') {
        throw new Error(`Home Assistant: ${entityId} nicht lesbar`);
    }
    return (d.state && d.state !== 'unknown' && d.state !== '---') ? d.state : '';
}

// ✅ NEU: Schreiben mit bis zu 3 Versuchen (falls HA kurz nicht erreichbar ist)
async function setInputTextWithRetry(entityId, value, tries = 3) {
    for (let t = 1; t <= tries; t++) {
        try {
            await haSetInputText(entityId, value);
            return;
        } catch (e) {
            if (t === tries) throw e;
            await new Promise(r => setTimeout(r, 1000 * t));
        }
    }
}

// ✅ GEÄNDERT: Schaltet IMMER um, egal ob Daten drin sind oder nicht
async function checkAndAutoAdvanceFoodWeek() {
    if (isShiftingWeek || isUpdatingFood) return;
    // Erst wenn die gespeicherte Einstellung gelesen wurde (sonst würde ein Gerät mit
    // Standardwerten den Timer der anderen Geräte durcheinanderbringen)
    if (!shiftCfgLoaded) return;
    const cfg = getShiftCfg();
    if (!cfg.on) return; // "Nur manuell": nie automatisch verschieben
    try {
        const raw = await readFoodRaw(FOOD_ENTITIES[0]); // leer ist okay!
        const weekParts = raw.split('~');
        const savedStamp = (weekParts[2] || "").trim();
        const currentStamp = getCurrentCycleStamp();
        const configSuffix = shiftSuffix(cfg);

        const savedDay = stampToDayNumber(savedStamp);
        const currentDay = stampToDayNumber(currentStamp);

        // Noch kein (gültiger) Stempel ODER Tag/Uhrzeit im Code geändert:
        // Einmalig auf den aktuellen Startwert eichen, ohne Daten zu löschen!
        if (savedDay === null || !savedStamp.endsWith(configSuffix)) {
            const w0 = weekParts[0] || serializeFoodWeekObj({}, false);
            const w1 = weekParts[1] || serializeFoodWeekObj({}, false);
            await haSetInputText(FOOD_ENTITIES[0], `${w0}~${w1}~${currentStamp}`);
            console.log("Wochenwechsel-Timer neu geeicht auf Startwert:", currentStamp);
            return;
        }

        // Sobald die Uhrzeit erreicht ist, wird currentStamp größer als savedStamp -> Vorrücken!
        if (currentDay > savedDay) {
            // Falls die App länger zu war: so viele Wochen wie verpasst wurden (mind. 1)
            const cyclesMissed = Math.max(1, Math.round((currentDay - savedDay) / 7));
            console.log(`Automatischer Wochenwechsel ausgelöst: ${savedStamp.split('_')[0]} -> ${currentStamp.split('_')[0]} (${cyclesMissed} Woche(n))`);
            await executeFoodWeekShift(true, cyclesMissed);
        }
    } catch (e) {
        console.error("Fehler beim Prüfen des automatischen Wochenwechsels:", e);
    }
}

// Eigenen Hintergrund-Timer starten (prüft alle 15 Sekunden, auch wenn man nichts klickt!)
if (!window._foodShiftInterval) {
    window._foodShiftInterval = setInterval(checkAndAutoAdvanceFoodWeek, 15000);
}

// ✅ NEU: Handy/Tablet pausieren Timer im Hintergrund -> sofort prüfen, sobald die Seite wieder aktiv wird
if (!window._foodShiftListeners) {
    window._foodShiftListeners = true;
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) checkAndAutoAdvanceFoodWeek();
    });
    window.addEventListener("focus", () => checkAndAutoAdvanceFoodWeek());
    window.addEventListener("online", () => checkAndAutoAdvanceFoodWeek());
}

// ✅ GEÄNDERT: erst alles lesen, dann schreiben; mit Doppelschutz für mehrere Geräte
async function executeFoodWeekShift(isAutomatic = false, cyclesMissed = 1) {
    if (isShiftingWeek) return;

    if (!isAutomatic) {
        const confirmed = await showDeleteModal(
            "Möchtest du die aktuelle Woche abschließen? Die Gerichte von 'Nächste Woche' rücken nach vorne in 'Diese Woche' und die nächste Woche wird geleert.",
            "Woche verschieben 🔄",
            "Woche abschließen" // <-- Hier steht jetzt exakt der Text, der auf dem Button stehen soll!
        );
        if (!confirmed) return;
    }

    isShiftingWeek = true;
    isUpdatingFood = true;

    try {
        // Automatisch: kurze Zufallspause + erneute Prüfung, falls ein anderes Gerät schneller war
        // (verhindert, dass zwei Geräte gleichzeitig verschieben und "Diese Woche" dadurch leer wird)
        if (isAutomatic) {
            await new Promise(r => setTimeout(r, Math.random() * 3000));
            const freshRaw = await readFoodRaw(FOOD_ENTITIES[0]);
            const freshDay = stampToDayNumber((freshRaw.split('~')[2] || "").trim());
            const currentDay = stampToDayNumber(getCurrentCycleStamp());
            if (freshDay !== null && currentDay !== null && freshDay >= currentDay) {
                console.log("Wochenwechsel wurde bereits von einem anderen Gerät erledigt.");
                return;
            }
        }

        const newStamp = isAutomatic ? getCurrentCycleStamp() : getManualAdvanceCycleStamp();

        // 1) Erst ALLES lesen. Schlägt das fehl, wird noch nichts überschrieben und beim nächsten Tick neu versucht.
        const rawList = [];
        for (let i = 0; i < 7; i++) {
            rawList.push(await readFoodRaw(FOOD_ENTITIES[i]));
        }

        // 2) Dann schreiben (Montags-Helper zuerst, weil dort der Stempel liegt)
        for (let i = 0; i < 7; i++) {
            const entityId = FOOD_ENTITIES[i];
            const weekParts = rawList[i].split('~');
            const isSunday = (i === 6);

            // Eine Woche verpasst: Woche 1 (Nächste Woche) -> wird zu Woche 0 (Diese Woche)
            // Mehrere Wochen verpasst: auch die ehemals "nächste" Woche ist schon vorbei -> alles leer
            const newWeek0Str = (cyclesMissed >= 2)
                ? serializeFoodWeekObj({}, isSunday)
                : serializeFoodWeekObj(parseFoodWeekStr(weekParts[1] || "", isSunday), isSunday);

            // Neue Woche 1 wird komplett geleert
            const emptyWeek1Str = serializeFoodWeekObj({}, isSunday);

            // Im Montags-Helper (i === 0) speichern wir den Stempel als 3. Teil mit ab
            const finalValue = (i === 0)
                ? `${newWeek0Str}~${emptyWeek1Str}~${newStamp}`
                : `${newWeek0Str}~${emptyWeek1Str}`;

            await setInputTextWithRetry(entityId, finalValue);
        }

        // Nach dem Vorrücken immer automatisch auf den Tab "Diese Woche" (0) wechseln
        activeFoodWeek = 0;
        const btn0 = document.getElementById("btn-week-0");
        const btn1 = document.getElementById("btn-week-1");
        if (btn0) btn0.classList.add("active-food");
        if (btn1) btn1.classList.remove("active-food");

        highlightToday();
        if (isAutomatic) {
            console.log("Woche wurde automatisch übertragen.");
        }
    } catch (e) {
        console.error("Fehler beim Vorrücken der Woche:", e);
    } finally {
        isUpdatingFood = false;
        isShiftingWeek = false;
        await load();
    }
}

function upgradeCookSelect(sel, idx, defaultLabel) {
    if (!sel) return;
    sel.style.setProperty("display", "none", "important");

    let wrapper = document.getElementById(`custom-cook-wrap-${idx}`);
    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = `custom-cook-wrap-${idx}`;
        wrapper.className = "custom-cook-wrapper";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = `custom-cook-btn-${idx}`;
        btn.className = "cook-select custom-cook-btn";
        btn.setAttribute("onclick", `openCookModal(${idx}, event)`);

        wrapper.appendChild(btn);
        
        if (sel.nextSibling) {
            sel.parentNode.insertBefore(wrapper, sel.nextSibling);
        } else {
            sel.parentNode.appendChild(wrapper);
        }
    }

    const btn = document.getElementById(`custom-cook-btn-${idx}`);
    if (btn) {
        const val = sel.value;
        btn.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${val ? "👨‍🍳 " + val : defaultLabel}</span> <span class="cook-arrow">▾</span>`;
    }
}

// Öffnet das Menü als zentriertes Popup auf dem Bildschirm
window.openCookModal = function(idx, ev) {
    if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
    }
    const sel = document.getElementById(`cook-${idx}`);
    if (!sel) return;

    const defaultLabel = idx === 7 ? '👨‍🍳 Wer Zahlt/Plant?' : '👨‍🍳 Wer kocht?';

    let modal = document.getElementById("customCookModalOverlay");
    if (modal) modal.remove();

    modal = document.createElement("div");
    modal.id = "customCookModalOverlay";
    modal.className = "cook-modal-overlay";
    modal.onclick = () => modal.remove();

    const card = document.createElement("div");
    card.className = "modal-card cook-modal-card";
    card.onclick = (e) => e.stopPropagation();

    const title = document.createElement("h3");
    title.id = "customConfirmTitle";
    title.style.margin = "0 0 6px 0";
    title.style.textAlign = "center";
    title.textContent = defaultLabel;
    card.appendChild(title);

    const list = document.createElement("div");
    list.className = "cook-modal-list";

    // Option: Niemand / Zurücksetzen
    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "cat-btn cook-modal-option" + (!sel.value ? " active-food" : "");
    noneBtn.textContent = "✖ " + defaultLabel + " (Keiner)";
    noneBtn.onclick = () => {
        sel.value = "";
        upgradeCookSelect(sel, idx, defaultLabel);
        modal.remove();
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof sel.onchange === "function") sel.onchange();
    };
    list.appendChild(noneBtn);

    // Alle echten Benutzer einfügen
    Array.from(sel.options).forEach(opt => {
        if (!opt.value) return;
        const itemBtn = document.createElement("button");
        itemBtn.type = "button";
        const isSelected = sel.value === opt.value;
        itemBtn.className = "cat-btn cook-modal-option" + (isSelected ? " active-food" : "");
        itemBtn.textContent = "👨‍🍳 " + opt.textContent;

        itemBtn.onclick = () => {
            sel.value = opt.value;
            upgradeCookSelect(sel, idx, defaultLabel);
            modal.remove();
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            if (typeof sel.onchange === "function") sel.onchange();
        };
        list.appendChild(itemBtn);
    });

    card.appendChild(list);
    modal.appendChild(card);
    document.body.appendChild(modal);
};

// Schließt das Menü, wenn man irgendwo daneben tippt
document.addEventListener("click", () => {
    document.querySelectorAll(".custom-cook-menu.open").forEach(m => m.classList.remove("open"));
});

async function load() {
    await checkAndAutoAdvanceFoodWeek();

    if (typeof renderSidebars === "function") await renderSidebars();
    if (curTab === 'trash' || isUpdatingFood) return;
    if (curTab === 'home') { loadHome(false); return; }
    if (curTab === 'todo') { renderTodoList(); return; }

    if (curTab === 'food') {
        for (let j = 0; j <= 7; j++) {
            const sel = document.getElementById(`cook-${j}`);
            if (sel) {
                const defaultLabel = j === 7 ? '👨‍🍳 Wer Zahlt/Plant?' : '👨‍🍳 Wer kocht?';
                if (sel.options.length <= 1) {
                    sel.innerHTML = `<option value="">${defaultLabel}</option>`;
                    users.forEach(uStr => {
                        const uName = uStr.split(':')[0];
                        const opt = document.createElement("option");
                        opt.value = uName;
                        opt.textContent = uName;
                        sel.appendChild(opt);
                    });
                }
                upgradeCookSelect(sel, j, defaultLabel);
            }
        }

        for (let i = 0; i < 7; i++) {
            try {
                const d = await haGetState(FOOD_ENTITIES[i]);
                const inpBf = document.getElementById(`plan-${i}-bf`);
                const inpLunch = document.getElementById(`plan-${i}`);
                const inpDn = document.getElementById(`plan-${i}-dn`);
                const sel = document.getElementById(`cook-${i}`);

                if ([inpBf, inpLunch, inpDn].includes(document.activeElement)) {
                    continue;
                }

                if (!isUpdatingFood && d) {
                    const raw = (d.state === 'unknown' || d.state === '---') ? '' : d.state;
                    const weekParts = raw.split('~');
                    const currentWeekRaw = activeFoodWeek === 0 ? (weekParts[0] || "") : (weekParts[1] || "");
                    const parsed = parseFoodWeekStr(currentWeekRaw, i === 6);

                    if (inpBf) inpBf.value = parsed.bf;
                    if (inpLunch) inpLunch.value = parsed.lunch;
                    if (inpDn) inpDn.value = parsed.dn;
                    if (sel) {
                        sel.value = parsed.cook;
                        upgradeCookSelect(sel, i, '👨‍🍳 Wer kocht?'); // Aktualisiert den Button sofort mit dem geladenen Namen!
                    }

                    if (i === 6) {
                        const inpOut = document.getElementById("plan-7");
                        const selOut = document.getElementById("cook-7");
                        if (inpOut && document.activeElement !== inpOut) {
                            inpOut.value = parsed.out;
                            if (selOut) {
                                selOut.value = parsed.outCook;
                                upgradeCookSelect(selOut, 7, '👨‍🍳 Wer Zahlt/Plant?'); // Aktualisiert auch den Out-Button sofort!
                            }
                        }
                    }
                }
            } catch (e) { console.error("Fehler beim Laden des Essensplans Tag " + i, e); }
        }
        if (typeof updateAppBadges === "function") updateAppBadges();
        return;
    }

    if (curTab === 'shop') {
        const listEl = document.getElementById("list-shop");
        if (!listEl) return;
        try {
            const cfg = SYNC_CONFIG.shopping;
            const d = await haGetState(cfg.entity);

            let fullList = [];
            if (d && d.attributes && d.attributes[cfg.attr]) {
                const rawData = d.attributes[cfg.attr];
                fullList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
            }

            let filtered = fullList.filter(o => o.endsWith(` @${activeStore}`) && !shopHidden.has(o)).reverse();

            // Nicht zeichnen, solange gezogen wird, und nur neu zeichnen, wenn sich wirklich etwas geändert hat
            if (shopDrag.pending || shopDrag.active) return;
            const sig = activeStore + "\n" + filtered.join("\n");
            if (sig === shopListSig && listEl.childElementCount > 0) {
                if (typeof updateAppBadges === "function") updateAppBadges();
                return;
            }
            shopListSig = sig;
            listEl.replaceChildren();

            if (filtered.length === 0) {
                const emptyLi = document.createElement("li");
                emptyLi.textContent = "Leer! ✨";
                listEl.appendChild(emptyLi);
            } else {
                filtered.forEach(t => {
                    const li = document.createElement("li");
                    li.style.flexDirection = "row";
                    li.style.alignItems = "center";

                    const span = document.createElement("span");
                    span.textContent = t.split(' @')[0];

                    const btn = document.createElement("button");
                    btn.className = "btn-del-item";
                    btn.type = "button";
                    btn.textContent = "✓";
                    btn.setAttribute("aria-label", "Erledigt – von der Einkaufsliste nehmen");
                    btn.title = "Erledigt";
                    btn.addEventListener("click", () => shopItemDone(li, btn, t));

                    li.appendChild(span);
                    li.appendChild(btn);
                    shopDragBind(li, t);
                    listEl.appendChild(li);
                });
            }
        } catch (e) {
            shopListSig = "";
            listEl.replaceChildren();
            const errLi = document.createElement("li");
            errLi.textContent = "Fehler beim Laden ⚠️";
            listEl.appendChild(errLi);
        }
    }

    if (typeof updateAppBadges === "function") updateAppBadges();
}

async function saveFood(idx) {
    isUpdatingFood = true;

    const entityIdx = (idx === 7) ? 6 : idx;
    const isSunday = (entityIdx === 6);

    const bfElem = document.getElementById(`plan-${entityIdx}-bf`);
    const lunchElem = document.getElementById(`plan-${entityIdx}`);
    const dnElem = document.getElementById(`plan-${entityIdx}-dn`);
    const cookElem = document.getElementById(`cook-${entityIdx}`);

    const outElem = document.getElementById("plan-7");
    const outCookElem = document.getElementById("cook-7");

    if (!lunchElem && !bfElem && !dnElem) {
        isUpdatingFood = false;
        return;
    }

    const editedWeekObj = {
        bf: bfElem ? bfElem.value.trim() : "",
        lunch: lunchElem ? lunchElem.value.trim() : "",
        dn: dnElem ? dnElem.value.trim() : "",
        cook: cookElem ? cookElem.value : "",
        out: isSunday && outElem ? outElem.value.trim() : "",
        outCook: isSunday && outCookElem ? outCookElem.value : ""
    };

    let changedMeals = [];
    let saved = false;

    try {
        const d = await haGetState(FOOD_ENTITIES[entityIdx]);
        const raw = (d && d.state && d.state !== 'unknown' && d.state !== '---') ? d.state : '';
        const weekParts = raw.split('~');

        // Welche Gerichte wurden gerade neu eingetragen/geändert? (für den Zutaten-Vorschlag)
        const oldMeals = parseFoodWeekStr((activeFoodWeek === 0 ? weekParts[0] : weekParts[1]) || "", isSunday);
        changedMeals = ["bf", "lunch", "dn"]
            .filter(k => editedWeekObj[k] && editedWeekObj[k] !== String(oldMeals[k] || "").trim())
            .map(k => ({ text: editedWeekObj[k], meal: k, dayIdx: entityIdx }));

        let week0Str = weekParts[0] ? serializeFoodWeekObj(parseFoodWeekStr(weekParts[0], isSunday), isSunday) : serializeFoodWeekObj({}, isSunday);
        let week1Str = weekParts[1] ? serializeFoodWeekObj(parseFoodWeekStr(weekParts[1], isSunday), isSunday) : serializeFoodWeekObj({}, isSunday);

        if (activeFoodWeek === 0) {
            week0Str = serializeFoodWeekObj(editedWeekObj, isSunday);
        } else {
            week1Str = serializeFoodWeekObj(editedWeekObj, isSunday);
        }

        const configSuffix = shiftSuffix(getShiftCfg());
        const savedStamp = (weekParts[2] || "").trim();
        const stampToKeep = (savedStamp && savedStamp.endsWith(configSuffix)) ? savedStamp : getCurrentCycleStamp();

        const existingStamp = (entityIdx === 0) ? `~${stampToKeep}` : '';
        const finalValue = `${week0Str}~${week1Str}${existingStamp}`;
        await haSetInputText(FOOD_ENTITIES[entityIdx], finalValue);
        saved = true;
    } catch (e) {
        console.error("Fehler beim Speichern des Essensplans:", e);
    }

    setTimeout(() => { isUpdatingFood = false; }, 2000);

    if (saved && changedMeals.length && curTab === 'food' && typeof ingMaybeSuggest === "function") {
        ingMaybeSuggest(changedMeals, entityIdx, activeFoodWeek)
            .catch(e => console.error("Zutaten-Vorschlag fehlgeschlagen:", e));
    }
}

function highlightToday() {
    let d = new Date().getDay();
    let idx = d === 0 ? 6 : d - 1;
    document.querySelectorAll('.day-card').forEach(c => c.classList.remove('today'));
    if (activeFoodWeek === 0 && document.getElementById('card-' + idx)) {
        document.getElementById('card-' + idx).classList.add('today');
    }
}

async function clearWeek() {
    const weekLabel = activeFoodWeek === 0 ? "diese Woche" : "nächste Woche";
    const confirmed = await showDeleteModal(
        `Möchtest du wirklich den gesamten Essensplan für ${weekLabel} löschen?`,
        "Woche zurücksetzen 🧹"
    );

    if (confirmed) {
        for (let i = 0; i < 7; i++) {
            const elBf = document.getElementById(`plan-${i}-bf`);
            const elLunch = document.getElementById(`plan-${i}`);
            const elDn = document.getElementById(`plan-${i}-dn`);
            const elCook = document.getElementById(`cook-${i}`);
            if (elBf) elBf.value = '';
            if (elLunch) elLunch.value = '';
            if (elDn) elDn.value = '';
            if (elCook) elCook.value = '';

            if (i === 6) {
                const elOut = document.getElementById("plan-7");
                const elOutCook = document.getElementById("cook-7");
                if (elOut) elOut.value = '';
                if (elOutCook) elOutCook.value = '';
            }
            await saveFood(i);
        }
    }
}
// ==========================================================================
//  ZUTATEN-AUTOMATIK
//  Gericht im Wochenplan  →  passende Zutaten als Vorschlag für die Einkaufsliste
//  - beim Eintragen eines bekannten Gerichts (abschaltbar) oder per Knopf "Einkauf aus dem Plan"
//  - eigene Rezepte werden in db.food.recipes gemerkt (Home Assistant + Kopie im Browser)
// ==========================================================================

// Zutaten stehen als Text: "Name" oder "Name*Menge", durch Komma getrennt
const ING_RECIPES = [
    // ---- Frühstück ----
    { n: "Müsli", a: ["Müsli", "Granola"], i: "Müsli, Milch, Joghurt, Obst" },
    { n: "Porridge", a: ["Porridge", "Haferbrei"], i: "Haferflocken, Milch, Bananen, Honig" },
    { n: "Eier", a: ["Rührei", "Spiegelei", "Omelett", "Omelette"], i: "Eier*6, Butter, Schnittlauch, Brot" },
    { n: "Pancakes", a: ["Pancakes", "Pfannkuchen", "Eierkuchen", "Crêpes", "Crepes"], i: "Mehl, Eier*3, Milch, Butter, Zucker, Ahornsirup" },
    { n: "Brötchen", a: ["Brötchen", "Semmeln"], i: "Brötchen*6, Butter, Aufschnitt, Käse, Marmelade" },
    { n: "Frühstücksbuffet", a: ["Frühstücksbuffet", "Brunch"], i: "Brötchen*6, Eier*6, Aufschnitt, Käse, Butter, Marmelade, Orangensaft" },
    { n: "Joghurt mit Obst", a: ["Joghurt mit", "Obstsalat"], i: "Naturjoghurt, Obst, Honig, Haferflocken" },
    { n: "Abendbrot", a: ["Abendbrot", "Brotzeit", "Vesper", "Brot & Käse", "Brot und Käse", "Brot mit Käse"], i: "Brot, Butter, Aufschnitt, Käse, Gurke, Tomaten" },
    // ---- Nudeln, Pizza, Italienisch ----
    { n: "Pizza", a: ["Pizza"], i: "Pizzateig, Tomatensoße, Mozzarella*2, Salami, Champignons, Zwiebeln" },
    { n: "Tiefkühlpizza", a: ["Tiefkühlpizza", "TK-Pizza", "TK Pizza"], i: "Tiefkühlpizza*2" },
    { n: "Spaghetti Bolognese", a: ["Spaghetti Bolognese", "Bolognese", "Spaghetti Bolo"], i: "Spaghetti, Hackfleisch, Passierte Tomaten, Zwiebeln, Karotten, Parmesan" },
    { n: "Carbonara", a: ["Carbonara"], i: "Spaghetti, Speckwürfel, Eier*3, Parmesan, Sahne" },
    { n: "Lasagne", a: ["Lasagne"], i: "Lasagneplatten, Hackfleisch, Passierte Tomaten, Zwiebeln, Béchamelsoße, Mozzarella*2, Parmesan" },
    { n: "Nudeln", a: ["Nudeln"], i: "Nudeln, Passierte Tomaten, Zwiebeln, Parmesan" },
    { n: "Gnocchi", a: ["Gnocchi"], i: "Gnocchi*2, Passierte Tomaten, Mozzarella, Parmesan, Basilikum" },
    { n: "Risotto", a: ["Risotto"], i: "Risottoreis, Zwiebeln, Weißwein, Parmesan, Gemüsebrühe, Champignons" },
    { n: "Nudelsalat", a: ["Nudelsalat"], i: "Nudeln, Mayonnaise, Mais, Gurken, Paprika, Fleischwurst, Erbsen" },
    // ---- Fleisch und Deftiges ----
    { n: "Schnitzel", a: ["Schnitzel"], i: "Schnitzel*4, Paniermehl, Eier*2, Mehl, Zitrone, Kartoffeln" },
    { n: "Currywurst", a: ["Currywurst"], i: "Bratwurst*4, Pommes, Ketchup, Currypulver" },
    { n: "Burger", a: ["Burger", "Hamburger", "Cheeseburger"], i: "Burgerbrötchen, Hackfleisch, Käsescheiben, Salat, Tomaten, Zwiebeln, Gurken" },
    { n: "Hot Dog", a: ["Hot Dog", "Hotdog"], i: "Hot-Dog-Brötchen, Würstchen*4, Röstzwiebeln, Ketchup, Senf" },
    { n: "Tacos", a: ["Tacos", "Burrito", "Fajita"], i: "Tortillas, Hackfleisch, Kidneybohnen, Mais, Salsa, Käse (gerieben), Salat, Paprika" },
    { n: "Wraps", a: ["Wrap", "Wraps"], i: "Wraps, Hähnchenbrust, Salat, Tomaten, Gurke, Soße" },
    { n: "Chili con Carne", a: ["Chili con Carne", "Chili"], i: "Hackfleisch, Kidneybohnen, Mais, Passierte Tomaten, Zwiebeln, Paprika, Reis" },
    { n: "Gulasch", a: ["Gulasch"], i: "Rindergulasch, Zwiebeln*2, Paprika, Tomatenmark, Kartoffeln" },
    { n: "Rouladen", a: ["Rouladen", "Roulade"], i: "Rinderrouladen*4, Senf, Gewürzgurken, Speck, Zwiebeln, Rotkohl, Klöße" },
    { n: "Braten", a: ["Braten", "Sonntagsbraten", "Schweinebraten"], i: "Schweinebraten, Zwiebeln, Karotten, Klöße, Rotkohl, Bratensoße" },
    { n: "Hähnchen", a: ["Hähnchen", "Hühnchen", "Brathähnchen", "Hähnchenschenkel"], i: "Hähnchenschenkel*4, Kartoffeln, Gemüse, Gewürzmischung" },
    { n: "Bratwurst", a: ["Bratwurst", "Grillabend", "Grillen"], i: "Bratwurst*4, Brötchen, Senf, Ketchup" },
    { n: "Maultaschen", a: ["Maultaschen"], i: "Maultaschen, Zwiebeln, Eier*2, Brühe" },
    { n: "Spätzle", a: ["Spätzle", "Käsespätzle"], i: "Spätzle, Käse (gerieben), Zwiebeln*2, Röstzwiebeln" },
    { n: "Döner", a: ["Döner", "Gyros"], i: "Dönerfleisch, Fladenbrot, Salat, Tomaten, Zwiebeln, Joghurtsoße" },
    { n: "Fischstäbchen", a: ["Fischstäbchen"], i: "Fischstäbchen, Kartoffeln, Spinat, Milch" },
    { n: "Sushi", a: ["Sushi"], i: "Sushireis, Nori, Lachs, Gurke, Avocado, Sojasoße, Wasabi" },
    // ---- Suppen und Eintöpfe ----
    { n: "Kartoffelsuppe", a: ["Kartoffelsuppe"], i: "Kartoffeln, Karotten, Lauch, Zwiebeln, Gemüsebrühe, Würstchen" },
    { n: "Linsensuppe", a: ["Linsensuppe", "Linseneintopf", "Linsen"], i: "Linsen, Karotten, Kartoffeln, Zwiebeln, Gemüsebrühe, Würstchen" },
    { n: "Gemüsesuppe", a: ["Gemüsesuppe", "Gemüseeintopf"], i: "Suppengemüse, Kartoffeln, Zwiebeln, Gemüsebrühe" },
    { n: "Hühnersuppe", a: ["Hühnersuppe", "Hühnchensuppe"], i: "Hähnchenschenkel*2, Suppengemüse, Nudeln, Petersilie" },
    { n: "Tomatensuppe", a: ["Tomatensuppe"], i: "Passierte Tomaten, Zwiebeln, Sahne, Gemüsebrühe, Brot" },
    { n: "Erbsensuppe", a: ["Erbsensuppe"], i: "Erbsen, Kartoffeln, Karotten, Würstchen, Gemüsebrühe" },
    { n: "Eintopf", a: ["Eintopf"], i: "Suppengemüse, Kartoffeln, Würstchen, Gemüsebrühe" },
    // ---- Vegetarisch, Pfanne, Ofen ----
    { n: "Kaiserschmarrn", a: ["Kaiserschmarrn"], i: "Mehl, Eier*4, Milch, Rosinen, Puderzucker, Apfelmus" },
    { n: "Curry", a: ["Curry", "Hähnchen-Curry", "Hähnchencurry"], i: "Hähnchenbrust, Kokosmilch, Currypaste, Reis, Paprika, Zwiebeln" },
    { n: "Kartoffelpüree", a: ["Kartoffelpüree", "Püree"], i: "Kartoffeln, Milch, Butter, Muskat" },
    { n: "Bratkartoffeln", a: ["Bratkartoffeln"], i: "Kartoffeln, Zwiebeln, Speckwürfel, Eier*4" },
    { n: "Pellkartoffeln", a: ["Pellkartoffeln"], i: "Kartoffeln, Quark, Leinöl, Schnittlauch, Zwiebeln" },
    { n: "Flammkuchen", a: ["Flammkuchen"], i: "Flammkuchenteig, Schmand, Zwiebeln*2, Speckwürfel, Lauchzwiebeln" },
    { n: "Quiche", a: ["Quiche"], i: "Quiche-Teig, Eier*3, Sahne, Schinken, Käse (gerieben), Lauch" },
    { n: "Gemüsepfanne", a: ["Gemüsepfanne", "Gemüse-Pfanne", "Wokgemüse"], i: "Wokgemüse*2, Paprika, Zwiebeln, Sojasoße, Reis" },
    { n: "Ofengemüse", a: ["Ofengemüse", "Ofenkartoffeln"], i: "Kartoffeln, Karotten, Zucchini, Paprika, Feta, Olivenöl" },
    { n: "Auflauf", a: ["Auflauf"], i: "Sahne, Käse (gerieben)*2, Brokkoli, Schinken" },
    { n: "Kartoffelauflauf", a: ["Kartoffelauflauf", "Kartoffelgratin", "Gratin"], i: "Kartoffeln, Sahne, Käse (gerieben), Knoblauch, Muskat" },
    { n: "Toast Hawaii", a: ["Toast Hawaii", "Toast"], i: "Toastbrot, Kochschinken, Ananas, Käsescheiben" },
    // ---- Salate ----
    { n: "Salat", a: ["Salat"], i: "Blattsalat, Tomaten, Gurke, Paprika, Dressing" },
    { n: "Salat mit Hähnchen", a: ["Salat mit Hähnchen", "Salat mit Hühnchen", "Hähnchensalat"], i: "Blattsalat, Hähnchenbrust, Tomaten, Gurke, Dressing, Brot" },
    { n: "Kartoffelsalat", a: ["Kartoffelsalat"], i: "Kartoffeln, Zwiebeln, Gurken, Brühe, Essig, Würstchen*4, Senf" },
];

// Einträge, für die nichts eingekauft wird (Reste, Restaurant, "Fr beim Italiener" …)
const ING_SKIP = /(^| )(reste\w*|nichts|kein\w*|ausser haus|auswaerts|restaurant|lieferdienst|bestell\w*|essen gehen|beim|bei|offen)( |$)/;

const ING_DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const ING_MEALS = { bf: "Frühstück", lunch: "Mittagessen", dn: "Abendessen" };

// ---- Hilfsfunktionen -----------------------------------------------------
function ingNorm(s) {
    return String(s || "").toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Vergleichsschlüssel: Zwiebel = Zwiebeln, Tomate = Tomaten
function ingFold(s) {
    return ingNorm(s).replace(/(en|n|e|s)$/, "");
}

// "Milch, 2 Zwiebeln, Käse*2, 500 g Mehl"  →  [{n, q}]
function ingParseList(str) {
    return String(str || "").split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).map(tok => {
        let q = 1, n = tok, m;
        if (/^\d+(?:[.,]\d+)?\s*(kg|g|l|ml|pck|pkg|packung|packungen|dose|dosen|bund|stk|stueck|stück|glas|flasche|flaschen)\b/i.test(tok)) {
            return { n: tok, q: 1 };
        }
        if ((m = tok.match(/^(\d{1,2})\s*(?:x|×)?\s+(.+)$/i))) { q = parseInt(m[1], 10); n = m[2]; }
        else if ((m = tok.match(/^(.+?)\s*[*×x]\s*(\d{1,2})$/i))) { n = m[1]; q = parseInt(m[2], 10); }
        return { n: n.trim(), q: Math.max(1, q || 1) };
    }).filter(x => x.n);
}

function ingItemsToText(items) {
    return items.map(x => x.q > 1 ? `${x.n}*${x.q}` : x.n).join(", ");
}

function ingItemName(entry) {
    return String(entry).split(" @")[0].replace(/^\d+\s*x\s+/i, "");
}

// ---- Eigene Rezepte (Home Assistant + Kopie im Browser) -------------------
function ingLocalRecipes() {
    try { return JSON.parse(localStorage.getItem("hh_recipes") || "{}") || {}; } catch (e) { return {}; }
}

// Maßgeblich ist der Stand aus Home Assistant; die Browser-Kopie gilt nur, solange dort noch nichts steht
function ingGetRecipes() {
    return (db.food && db.food.recipes) ? db.food.recipes : ingLocalRecipes();
}

// aliases: Suchwörter, bei denen das Rezept greift (bei angepassten Standard-Rezepten die ursprünglichen)
function ingSaveRecipe(text, itemsText, aliases) {
    const key = ingNorm(text);
    if (!key) return;
    if (!db.food.recipes) db.food.recipes = Object.assign({}, ingLocalRecipes());
    if (itemsText) {
        const rec = { n: String(text).trim(), i: itemsText };
        if (Array.isArray(aliases) && aliases.length) rec.a = aliases;
        db.food.recipes[key] = rec;
    } else {
        delete db.food.recipes[key];
    }
    try { localStorage.setItem("hh_recipes", JSON.stringify(db.food.recipes)); } catch (e) { /* Browser-Speicher gesperrt */ }
    try {
        const cfg = SYNC_CONFIG.food;
        if (cfg && cfg.event) haFireEvent(cfg.event, { favs: JSON.stringify(db.food) });
    } catch (e) { console.error("Rezept konnte nicht gespeichert werden:", e); }
}

// ---- Gericht → Rezepte ----------------------------------------------------
function ingFindRecipes(text) {
    const t = ingNorm(text);
    if (!t) return [];
    const cands = [];

    const user = ingGetRecipes();
    Object.keys(user).forEach(k => {
        const rec = user[k] || {};
        const aliases = (Array.isArray(rec.a) && rec.a.length ? rec.a : [k]).map(ingNorm).filter(Boolean);
        let best = null;
        aliases.forEach(a => {
            const at = t.indexOf(a);
            if (at >= 0 && (!best || a.length > best.len)) best = { at, len: a.length };
        });
        if (best) cands.push({ n: rec.n || k, start: best.at, end: best.at + best.len, user: true, items: ingParseList(rec.i) });
    });

    ING_RECIPES.forEach(r => {
        if (!r._a) r._a = r.a.map(ingNorm).filter(Boolean);
        let best = null;
        r._a.forEach(a => {
            const at = t.indexOf(a);
            if (at >= 0 && (!best || a.length > best.len)) best = { at, len: a.length };
        });
        if (best) cands.push({ n: r.n, start: best.at, end: best.at + best.len, user: false, items: ingParseList(r.i) });
    });

    // Längster Treffer gewinnt (Kartoffelsalat statt Salat), eigene Rezepte vor eingebauten
    cands.sort((x, y) => ((y.end - y.start) - (x.end - x.start)) || ((y.user ? 1 : 0) - (x.user ? 1 : 0)));
    const out = [];
    cands.forEach(c => {
        const covered = out.some(o => c.start >= o.start && c.end <= o.end);
        if (!covered) out.push(c);
    });
    return out.sort((x, y) => x.start - y.start);
}

// ---- Dialog ---------------------------------------------------------------
let ingState = { open: false, rows: [], dishes: [], extra: [], onList: new Set(), resolve: null, mode: "auto" };

// Modus beim Eintragen eines Gerichts: ask = jedes Mal fragen · auto = direkt auf die Liste · manual = selbst auswählen · off = nichts tun
function ingMode() {
    const m = localStorage.getItem("hh_ing_mode");
    if (m === "ask" || m === "auto" || m === "manual" || m === "off") return m;
    return localStorage.getItem("hh_ing_auto") === "0" ? "off" : "ask";
}
function ingSetMode(m) { try { localStorage.setItem("hh_ing_mode", m); } catch (e) { /* egal */ } }

async function ingReadList() {
    try {
        const cfg = SYNC_CONFIG.shopping;
        const d = await haGetState(cfg.entity);
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const raw = d.attributes[cfg.attr];
            const list = (typeof raw === "string") ? JSON.parse(raw) : raw;
            return Array.isArray(list) ? list : [];
        }
    } catch (e) { console.error("Einkaufsliste konnte nicht gelesen werden:", e); }
    return [];
}

function ingCompute() {
    const old = new Map(ingState.rows.map(r => [r.key, r]));
    const map = new Map();
    const add = (name, qty, from, isExtra) => {
        const key = ingFold(name);
        if (!key) return;
        let r = map.get(key);
        if (!r) { r = { key, name, qty: 0, from: new Set(), extraOnly: true }; map.set(key, r); }
        r.qty += qty;
        if (from) r.from.add(from);
        if (!isExtra) r.extraOnly = false;
    };

    const chips = new Map();
    ingState.dishes.forEach(d => {
        const t = String(d.text || "").trim();
        const nt = ingNorm(t);
        if (!nt || ING_SKIP.test(nt)) return;
        const found = ingFindRecipes(t);
        if (!chips.has(nt)) chips.set(nt, { text: t, known: found.length > 0 });
        found.forEach(rc => rc.items.forEach(it => add(it.n, it.q, rc.n, false)));
    });
    ingState.extra.forEach(e => add(e.n, e.q, null, true));

    ingState.chips = [...chips.values()];
    ingState.rows = [...map.values()].map(r => {
        const o = old.get(r.key);
        r.onList = ingState.onList.has(r.key);
        if (o && o.userQty) { r.qty = o.qty; r.userQty = true; }
        r.checked = o ? o.checked : (r.extraOnly ? true : !r.onList);
        return r;
    });
}

function ingMakeBtn(text, css, onClick, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (css) b.style.cssText = css;
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
}

function ingRender() {
    const box = document.getElementById("ingList");
    if (!box) return;
    box.replaceChildren();

    if (!ingState.rows.length) {
        const empty = document.createElement("div");
        empty.className = "ing-empty";
        empty.textContent = "Für diese Gerichte kenne ich noch keine Zutaten. Tippe unten auf ein Gericht oder füge Zutaten hinzu.";
        box.appendChild(empty);
    }

    ingState.rows.forEach((r, idx) => {
        const row = document.createElement("div");
        row.className = "ing-row" + (r.onList ? " is-dup" : "");

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "ing-cb-" + idx;
        cb.checked = r.checked;
        cb.addEventListener("change", () => { r.checked = cb.checked; ingUpdateCount(); });

        const lab = document.createElement("label");
        lab.className = "ing-name";
        lab.htmlFor = cb.id;
        const main = document.createElement("span");
        main.textContent = r.name;
        lab.appendChild(main);
        const sub = r.onList ? "✓ steht schon auf der Liste" : (r.from.size ? "für " + [...r.from].join(", ") : "");
        if (sub) {
            const small = document.createElement("small");
            small.textContent = sub;
            lab.appendChild(small);
        }

        const qty = document.createElement("div");
        qty.className = "ing-qty";
        const num = document.createElement("b");
        num.textContent = String(r.qty);
        const minus = ingMakeBtn("−", "", () => { if (r.qty > 1) { r.qty--; r.userQty = true; ingRender(); } }, "hh-round");
        minus.setAttribute("aria-label", "weniger");
        const plus = ingMakeBtn("+", "", () => { if (r.qty < 99) { r.qty++; r.userQty = true; ingRender(); } }, "hh-round");
        plus.setAttribute("aria-label", "mehr");
        qty.append(minus, num, plus);

        row.append(cb, lab, qty);
        box.appendChild(row);
    });

    // Gerichte (zum Ändern oder Merken von Rezepten)
    const dishes = document.getElementById("ingDishes");
    const dishWrap = document.getElementById("ingDishWrap");
    if (dishes && dishWrap) {
        dishes.replaceChildren();
        (ingState.chips || []).forEach(c => {
            const chip = ingMakeBtn((c.known ? "✏️ " : "➕ ") + c.text, "", () => ingEditRecipe(c.text));
            chip.className = "ing-dish" + (c.known ? "" : " is-new");
            chip.title = c.known ? "Zutaten ändern" : "Zutaten für dieses Gericht merken";
            dishes.appendChild(chip);
        });
        dishWrap.style.display = (ingState.chips || []).length ? "" : "none";
        const sum = document.getElementById("ingDishSummary");
        if (sum) sum.textContent = `📖 Gerichte & Rezepte (${(ingState.chips || []).length}) – tippen zum Ändern oder Merken`;
    }
    ingUpdateCount();
}

function ingUpdateCount() {
    const n = ingState.rows.filter(r => r.checked).length;
    const yes = document.getElementById("ingYes");
    if (yes) {
        yes.textContent = n ? `Auf die Liste (${n})` : "Nichts ausgewählt";
        yes.disabled = n === 0;
        yes.style.opacity = n ? "1" : "0.45";
    }
}

function ingAddCustom() {
    const inp = document.getElementById("ingAddInput");
    if (!inp) return;
    const items = ingParseList(inp.value);
    if (!items.length) return;
    items.forEach(it => {
        const key = ingFold(it.n);
        const ex = ingState.extra.find(e => ingFold(e.n) === key);
        if (ex) ex.q += it.q; else ingState.extra.push({ n: it.n, q: it.q });
        const row = ingState.rows.find(r => r.key === key);
        if (row) row.checked = true;
    });
    inp.value = "";
    ingCompute();
    ingRender();
    inp.focus();
}

async function ingEditRecipe(text) {
    const found = ingFindRecipes(text);
    const cur = found.length ? ingItemsToText(found.flatMap(f => f.items)) : "";
    const val = await showInputPrompt(
        `Zutaten für „${text}" – mit Komma trennen, Menge z. B. 2 Zwiebeln. Leer lassen = Rezept vergessen.`,
        "Rezept merken 📖",
        cur
    );
    if (val === null) return;
    ingSaveRecipe(text, val);
    ingCompute();
    ingRender();
}

// Manche Themes haben dunkle Karten mit dunkler Standardschrift (z. B. Glass) → Schrift automatisch hell
function ingApplyTone(id) {
    const modal = document.getElementById(id || "ingModal");
    const card = modal && modal.querySelector(".win-card");
    if (!card) return;
    // Theme-Datei bringt eigene Farben (--hh-themed) -> kein Hell/Dunkel-Raten nötig
    if (getComputedStyle(document.body).getPropertyValue("--hh-themed").trim()) { delete modal.dataset.tone; return; }
    const m = (getComputedStyle(card).backgroundColor || "").match(/[\d.]+/g) || [];
    const a = m[3] === undefined ? 1 : parseFloat(m[3]);
    const mix = v => (parseFloat(v) || 0) * a + 40 * (1 - a);   // halbtransparent: liegt auf abgedunkeltem Hintergrund
    const lum = (0.299 * mix(m[0]) + 0.587 * mix(m[1]) + 0.114 * mix(m[2])) / 255;
    modal.dataset.tone = lum < 0.5 ? "dark" : "light";
}

function ingToast(msg) {
    const old = document.getElementById("hhToast");
    if (old) old.remove();
    const t = document.createElement("div");
    t.id = "hhToast";
    t.className = "hh-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 2600);
}

function ingClose(done) {
    const modal = document.getElementById("ingModal");
    if (modal) modal.style.display = "none";
    ingState.open = false;
    if (ingState.resolve) { ingState.resolve(!!done); ingState.resolve = null; }
}

// Schreibt Zutaten auf die Einkaufsliste (ein Event mit der kompletten Liste, wie beim normalen Hinzufügen)
async function ingWrite(picks, store) {
    const cfg = SYNC_CONFIG.shopping;
    const list = await ingReadList();
    picks.forEach(r => list.push(`${r.qty > 1 ? r.qty + "x " : ""}${r.name} @${store}`));
    await haFireEvent(cfg.event, { json_data: list });
    try { localStorage.setItem("hh_ing_store", store); } catch (e) { /* egal */ }
    homeLastFetch = 0;
    load();
    if (typeof updateAppBadges === "function") updateAppBadges();
}

function ingDefaultStore() {
    const names = (Array.isArray(stores) && stores.length) ? stores : [activeStore];
    const remembered = localStorage.getItem("hh_ing_store");
    return names.includes(remembered) ? remembered : (names.includes(activeStore) ? activeStore : names[0]);
}

// Laden-Auswahl befüllen (Zutaten-Dialog und Frage); gibt zurück, ob es mehrere Läden gibt
function ingFillStores(sel, preferred) {
    if (!sel) return false;
    sel.replaceChildren();
    const names = (Array.isArray(stores) && stores.length) ? stores.slice() : [activeStore];
    names.forEach(s => {
        const o = document.createElement("option");
        o.value = s;
        o.textContent = s;
        sel.appendChild(o);
    });
    sel.value = names.includes(preferred) ? preferred : ingDefaultStore();
    return names.length > 1;
}

// ===== Themefähige Auswahllisten =====
// Ersetzt das System-Popup von select.hh-field durch eine eigene Liste mit den Theme-Farben (--hh-*).
// Das echte <select> bleibt unsichtbar bestehen: value, change-Ereignis und onchange funktionieren wie bisher.
let hhSelCurrent = null;

function hhSelEnhance(sel) {
    if (!sel || sel.dataset.hhSel) return;
    sel.dataset.hhSel = "1";
    const wrap = document.createElement("div");
    wrap.className = "hh-sel";
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add("hh-sel-native");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hh-sel-btn";
    btn.id = (sel.id || "hhSel" + Math.random().toString(36).slice(2, 7)) + "Btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    const txt = document.createElement("span");
    txt.className = "hh-sel-txt";
    const arrow = document.createElement("span");
    arrow.className = "hh-sel-arrow";
    arrow.setAttribute("aria-hidden", "true");
    btn.append(txt, arrow);

    const list = document.createElement("div");
    list.className = "hh-sel-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    wrap.append(btn, list);

    const lab = sel.id ? document.querySelector(`label[for="${sel.id}"]`) : null;
    if (lab) lab.htmlFor = btn.id;

    // Beschriftung am Knopf aktuell halten (auch bei value = … und neu befüllten Optionen)
    const sync = () => {
        const o = sel.options[sel.selectedIndex];
        txt.textContent = o ? o.textContent : "";
        btn.disabled = sel.disabled || sel.options.length === 0;
    };
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    Object.defineProperty(sel, "value", {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); sync(); }
    });
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled"] });
    sel.addEventListener("change", sync);
    sync();

    const close = (focusBtn) => {
        if (list.hidden) return;
        list.hidden = true;
        wrap.classList.remove("is-open", "is-up", "is-right");
        btn.setAttribute("aria-expanded", "false");
        if (hhSelCurrent === wrap) hhSelCurrent = null;
        if (focusBtn) btn.focus();
    };
    wrap._hhClose = close;

    const choose = (value) => {
        const changed = sel.value !== value;
        close(true);
        if (!changed) return;
        sel.value = value;
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
    };

    // Liste innerhalb des Fensters platzieren (nach unten oder oben, links oder rechts bündig); berücksichtigt den App-Zoom
    const place = () => {
        const card = wrap.closest(".win-card") || document.body;
        const cr = card.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        const k = (wrap.offsetWidth > 0 && wr.width > 0) ? wr.width / wrap.offsetWidth : 1;
        list.style.maxHeight = "";
        list.style.maxWidth = "";
        wrap.classList.remove("is-up", "is-right");
        const gap = 6 * k, edge = 10 * k;
        const need = list.scrollHeight * k + gap;
        const below = cr.bottom - wr.bottom - edge;
        const above = wr.top - cr.top - edge;
        const up = need > below && above > below;
        const room = Math.max(140 * k, (up ? above : below) - gap);
        list.style.maxHeight = Math.floor(Math.min(room, 288 * k) / k) + "px";
        const right = (wr.left + wr.width / 2) > (cr.left + cr.width / 2);
        const maxW = right ? (wr.right - cr.left - edge) : (cr.right - wr.left - edge);
        list.style.maxWidth = Math.floor(Math.max(wr.width, maxW) / k) + "px";
        wrap.classList.toggle("is-up", up);
        wrap.classList.toggle("is-right", right);
    };

    const open = () => {
        if (btn.disabled || !list.hidden) return;
        hhSelCloseAll(wrap);
        list.replaceChildren();
        Array.from(sel.options).forEach(o => {
            const b = document.createElement("button");
            const on = o.value === sel.value;
            b.type = "button";
            b.className = "hh-sel-opt" + (on ? " is-sel" : "");
            b.setAttribute("role", "option");
            b.setAttribute("aria-selected", on ? "true" : "false");
            b.dataset.value = o.value;
            const t = document.createElement("span");
            t.textContent = o.textContent;
            const c = document.createElement("span");
            c.className = "hh-sel-check";
            c.setAttribute("aria-hidden", "true");
            c.textContent = "✓";
            b.append(t, c);
            b.addEventListener("click", () => choose(o.value));
            list.appendChild(b);
        });
        list.hidden = false;
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        hhSelCurrent = wrap;
        place();
        const cur = list.querySelector(".is-sel") || list.querySelector(".hh-sel-opt");
        if (cur) {
            list.scrollTop = Math.max(0, cur.offsetTop - (list.clientHeight - cur.offsetHeight) / 2);
            cur.focus({ preventScroll: true });
        }
    };

    btn.addEventListener("click", () => { if (list.hidden) open(); else close(true); });
    btn.addEventListener("keydown", e => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
    list.addEventListener("keydown", e => {
        const it = Array.from(list.querySelectorAll(".hh-sel-opt"));
        const i = it.indexOf(document.activeElement);
        if (e.key === "ArrowDown") { e.preventDefault(); it[Math.min(it.length - 1, i + 1)].focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); it[Math.max(0, i - 1)].focus(); }
        else if (e.key === "Home") { e.preventDefault(); it[0].focus(); }
        else if (e.key === "End") { e.preventDefault(); it[it.length - 1].focus(); }
        else if (e.key === "Tab") { close(false); }
    });

    // Schließt die Dialog-Anzeige, schließt auch die Liste
    const win = wrap.closest(".win");
    if (win) new MutationObserver(() => { if (getComputedStyle(win).display === "none") close(false); }).observe(win, { attributes: true, attributeFilter: ["style", "class"] });
}

function hhSelCloseAll(except) {
    document.querySelectorAll(".hh-sel.is-open").forEach(w => { if (w !== except && w._hhClose) w._hhClose(false); });
}

document.addEventListener("pointerdown", e => {
    if (hhSelCurrent && !hhSelCurrent.contains(e.target)) hhSelCurrent._hhClose(false);
}, true);
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && hhSelCurrent) { e.preventDefault(); e.stopPropagation(); hhSelCurrent._hhClose(true); }
}, true);
window.addEventListener("resize", () => hhSelCloseAll());

function hhSelInit() { document.querySelectorAll("select.hh-field").forEach(hhSelEnhance); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hhSelInit);
else hhSelInit();

// ===== "Zugeordnet an": Auswahl wie bei "Wer kocht?" (Knopf + Popup in der Bildschirmmitte) =====
// Der Knopf übernimmt das Aussehen des echten <select> (Farben kommen aus Theme und style.css).
// Das <select> bleibt unsichtbar bestehen: value und change funktionieren wie bisher.
const HH_ASSIGN_COPY = [
    "background-color", "background-image", "color", "-webkit-text-fill-color",
    "border-top-width", "border-top-style", "border-top-color",
    "border-right-width", "border-right-style", "border-right-color",
    "border-bottom-width", "border-bottom-style", "border-bottom-color",
    "border-left-width", "border-left-style", "border-left-color",
    "border-radius", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "font-size", "font-weight", "font-family", "box-shadow", "letter-spacing"
];

function hhAssignEnhance(sel, title) {
    if (!sel || sel.dataset.hhAssign) return;
    sel.dataset.hhAssign = "1";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = sel.id + "Btn";
    btn.className = "hh-assign-btn";
    btn.setAttribute("aria-haspopup", "dialog");
    const txt = document.createElement("span");
    txt.className = "hh-assign-txt";
    const arrow = document.createElement("span");
    arrow.className = "hh-assign-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "▾";
    btn.append(txt, arrow);
    sel.parentNode.insertBefore(btn, sel.nextSibling);
    sel.style.setProperty("display", "none", "important");

    const paint = () => {
        const cs = getComputedStyle(sel);
        HH_ASSIGN_COPY.forEach(p => {
            const v = cs.getPropertyValue(p);
            if (v) btn.style.setProperty(p, v, "important");
        });
    };
    const sync = () => {
        const o = sel.options[sel.selectedIndex];
        const t = o ? o.textContent : "";
        txt.textContent = (sel.value ? "👤 " : "👥 ") + t;
        btn.setAttribute("aria-label", title + ": " + t);
        paint();
    };
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    Object.defineProperty(sel, "value", {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); sync(); }
    });
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["selected"] });
    sel.addEventListener("change", sync);
    const win = sel.closest(".win");
    if (win) new MutationObserver(() => { if (getComputedStyle(win).display !== "none") paint(); }).observe(win, { attributes: true, attributeFilter: ["style", "class"] });
    btn.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); hhAssignOpen(sel, title, btn); });
    sync();
}

function hhAssignOpen(sel, title, returnFocus) {
    const old = document.getElementById("customAssignModalOverlay");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "customAssignModalOverlay";
    modal.className = "cook-modal-overlay";
    const onKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
    const close = () => {
        modal.remove();
        document.removeEventListener("keydown", onKey, true);
        if (returnFocus) returnFocus.focus();
    };
    document.addEventListener("keydown", onKey, true);
    modal.onclick = close;

    const card = document.createElement("div");
    card.className = "modal-card cook-modal-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", title);
    card.onclick = e => e.stopPropagation();
    const h = document.createElement("h3");
    h.style.margin = "0 0 6px 0";
    h.style.textAlign = "center";
    h.textContent = title;
    card.appendChild(h);

    const list = document.createElement("div");
    list.className = "cook-modal-list";
    Array.from(sel.options).forEach(opt => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cat-btn cook-modal-option" + (sel.value === opt.value ? " active-food" : "");
        b.textContent = (opt.value ? "👤 " : "✖ ") + opt.textContent;
        b.onclick = () => {
            const changed = sel.value !== opt.value;
            sel.value = opt.value;
            close();
            if (changed) sel.dispatchEvent(new Event("change", { bubbles: true }));
        };
        list.appendChild(b);
    });
    card.appendChild(list);
    modal.appendChild(card);
    document.body.appendChild(modal);
    const cur = list.querySelector(".active-food") || list.firstElementChild;
    if (cur) cur.focus({ preventScroll: true });
}

function hhAssignInit() {
    hhAssignEnhance(document.getElementById("modalAssignee"), "Zugeordnet an");
    hhAssignEnhance(document.getElementById("edit-assignee"), "Zugeordnet an");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hhAssignInit);
else hhAssignInit();

// ==========================================================================
// Datum & Uhrzeit im Theme-Look (Aufgabe hinzufügen / bearbeiten)
// Das echte Feld bleibt im Hintergrund (value = "2026-11-12T10:00" bzw. "10:00"),
// sichtbar ist ein Knopf, der ein Auswahlfenster mit Kalender / Uhrzeit öffnet.
// ==========================================================================
const HHDT_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function hhDtPad(n) { return String(n).padStart(2, "0"); }

function hhDtParse(v, mode) {
    const o = { y: null, mo: null, d: null, h: 10, mi: 0 };
    if (!v) return o;
    let m;
    if (mode === "t") {
        m = /^(\d{1,2}):(\d{2})/.exec(v);
        if (m) { o.h = Math.min(23, +m[1]); o.mi = Math.min(59, +m[2]); }
        return o;
    }
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(v);
    if (m) {
        o.y = +m[1]; o.mo = +m[2] - 1; o.d = +m[3];
        if (m[4] !== undefined) { o.h = Math.min(23, +m[4]); o.mi = Math.min(59, +m[5]); }
    }
    return o;
}

function hhDtDateText(y, mo, d) {
    const dt = new Date(y, mo, d);
    return `${dt.toLocaleDateString("de-DE", { weekday: "short" })}, ${hhDtPad(d)}.${hhDtPad(mo + 1)}.${y}`;
}

function hhDtLabel(v, mode) {
    const o = hhDtParse(v, mode);
    if (mode === "t") return v ? `${hhDtPad(o.h)}:${hhDtPad(o.mi)} Uhr` : "Uhrzeit wählen";
    if (mode === "d") return o.y === null ? "Datum wählen" : hhDtDateText(o.y, o.mo, o.d);
    if (o.y === null) return "Datum & Uhrzeit wählen";
    return `${hhDtDateText(o.y, o.mo, o.d)} · ${hhDtPad(o.h)}:${hhDtPad(o.mi)} Uhr`;
}

function hhDtEnhance(inp, mode, title) {
    if (!inp || inp.dataset.hhDt) return;
    inp.dataset.hhDt = "1";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = inp.id + "Btn";
    btn.className = "hh-assign-btn hh-dt-btn";
    btn.setAttribute("aria-haspopup", "dialog");
    const txt = document.createElement("span");
    txt.className = "hh-assign-txt";
    const ico = document.createElement("span");
    ico.className = "hh-assign-arrow";
    ico.setAttribute("aria-hidden", "true");
    ico.textContent = mode === "t" ? "🕒" : "📅";
    btn.append(txt, ico);
    inp.parentNode.insertBefore(btn, inp.nextSibling);
    inp.style.setProperty("display", "none", "important");

    const paint = () => {
        const cs = getComputedStyle(inp);
        HH_ASSIGN_COPY.forEach(p => {
            const v = cs.getPropertyValue(p);
            if (v) btn.style.setProperty(p, v, "important");
        });
        // Höhe vom echten Feld übernehmen (Datumsfelder sind von Haus aus höher als ein Text-Knopf)
        if (btn.offsetParent !== null) {
            inp.style.setProperty("display", "block", "important");
            const hh = inp.offsetHeight;
            inp.style.setProperty("display", "none", "important");
            if (hh > 0) btn.style.setProperty("min-height", hh + "px", "important");
        }
    };
    const sync = () => {
        const t = hhDtLabel(inp.value, mode);
        txt.textContent = t;
        btn.setAttribute("aria-label", title + ": " + t);
        paint();
    };
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(inp, "value", {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); sync(); }
    });
    inp.addEventListener("change", sync);
    inp.addEventListener("input", sync);
    const win = inp.closest(".win");
    if (win) new MutationObserver(() => { if (getComputedStyle(win).display !== "none") paint(); }).observe(win, { attributes: true, attributeFilter: ["style", "class"] });
    btn.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); hhDtOpen(inp, mode, title, btn); });
    sync();
}

function hhDtOpen(inp, mode, title, returnFocus) {
    const old = document.getElementById("hhDtOverlay");
    if (old) old.remove();
    const cur = hhDtParse(inp.value, mode);
    const now = new Date();
    const st = {
        y: cur.y, mo: cur.mo, d: cur.d, h: cur.h, mi: cur.mi,
        vy: cur.y !== null ? cur.y : now.getFullYear(),
        vm: cur.y !== null ? cur.mo : now.getMonth(),
        tab: mode === "t" ? "time" : "date"
    };
    if ((mode === "dt" || mode === "d") && st.y === null) { st.y = now.getFullYear(); st.mo = now.getMonth(); st.d = now.getDate(); }

    const overlay = document.createElement("div");
    overlay.id = "hhDtOverlay";
    overlay.className = "cook-modal-overlay";
    const card = document.createElement("div");
    card.className = "modal-card cook-modal-card hh-dt-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", title);
    card.onclick = e => e.stopPropagation();

    const head = document.createElement("h3");
    head.className = "hh-dt-title";
    head.textContent = (mode === "t" ? "🕒 " : "📅 ") + title;
    const sum = document.createElement("div");
    sum.className = "hh-dt-sum";
    const tabs = document.createElement("div");
    tabs.className = "hh-dt-tabs";
    const body = document.createElement("div");
    body.className = "hh-dt-body";
    const foot = document.createElement("div");
    foot.className = "hh-dt-foot";
    card.append(head);
    if (mode === "dt") card.append(sum, tabs);
    card.append(body, foot);
    overlay.appendChild(card);

    const mk = (cls, text, attrs) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = text;
        if (attrs) Object.keys(attrs).forEach(k => b.setAttribute(k, attrs[k]));
        return b;
    };

    const onKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
    const close = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey, true);
        if (returnFocus) returnFocus.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey, true);
    overlay.onclick = close;

    const apply = () => {
        const val = mode === "t"
            ? `${hhDtPad(st.h)}:${hhDtPad(st.mi)}`
            : (mode === "d"
                ? `${st.y}-${hhDtPad(st.mo + 1)}-${hhDtPad(st.d)}`
                : `${st.y}-${hhDtPad(st.mo + 1)}-${hhDtPad(st.d)}T${hhDtPad(st.h)}:${hhDtPad(st.mi)}`);
        const changed = inp.value !== val;
        inp.value = val;
        close();
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        if (changed) inp.dispatchEvent(new Event("change", { bubbles: true }));
    };

    // Tabs (nur bei Datum + Uhrzeit)
    const renderTabs = () => {
        tabs.textContent = "";
        [["date", "📅 Datum"], ["time", "🕒 Uhrzeit"]].forEach(([k, label]) => {
            const b = mk("hh-dt-tab" + (st.tab === k ? " is-on" : ""), label, { "data-k": "tab-" + k });
            b.onclick = () => { st.tab = k; render("tab-" + k); };
            tabs.appendChild(b);
        });
    };

    const renderDate = () => {
        const nav = document.createElement("div");
        nav.className = "hh-dt-nav";
        const step = (dm) => {
            const d = new Date(st.vy, st.vm + dm, 1);
            st.vy = d.getFullYear(); st.vm = d.getMonth();
        };
        const bPY = mk("hh-dt-nbtn", "«", { "aria-label": "Jahr zurück", "data-k": "py" });
        const bPM = mk("hh-dt-nbtn", "‹", { "aria-label": "Monat zurück", "data-k": "pm" });
        const lab = document.createElement("div");
        lab.className = "hh-dt-month";
        lab.textContent = new Date(st.vy, st.vm, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
        const bNM = mk("hh-dt-nbtn", "›", { "aria-label": "Monat vor", "data-k": "nm" });
        const bNY = mk("hh-dt-nbtn", "»", { "aria-label": "Jahr vor", "data-k": "ny" });
        bPY.onclick = () => { step(-12); render("py"); };
        bPM.onclick = () => { step(-1); render("pm"); };
        bNM.onclick = () => { step(1); render("nm"); };
        bNY.onclick = () => { step(12); render("ny"); };
        nav.append(bPY, bPM, lab, bNM, bNY);
        body.appendChild(nav);

        const wd = document.createElement("div");
        wd.className = "hh-dt-grid hh-dt-wd";
        HHDT_DAYS.forEach(n => { const s = document.createElement("span"); s.textContent = n; wd.appendChild(s); });
        body.appendChild(wd);

        const grid = document.createElement("div");
        grid.className = "hh-dt-grid";
        const first = new Date(st.vy, st.vm, 1);
        const offset = (first.getDay() + 6) % 7;
        for (let i = 0; i < 42; i++) {
            const dt = new Date(st.vy, st.vm, 1 - offset + i);
            const y = dt.getFullYear(), mo = dt.getMonth(), d = dt.getDate();
            const isSel = st.y === y && st.mo === mo && st.d === d;
            const isToday = now.getFullYear() === y && now.getMonth() === mo && now.getDate() === d;
            const cls = "hh-dt-day" + (mo !== st.vm ? " is-out" : "") + (isToday ? " is-today" : "") + (isSel ? " is-sel" : "");
            const b = mk(cls, String(d), { "data-k": `d-${y}-${mo}-${d}`, "aria-label": hhDtDateText(y, mo, d), "aria-pressed": isSel ? "true" : "false" });
            b.onclick = () => {
                st.y = y; st.mo = mo; st.d = d; st.vy = y; st.vm = mo;
                render(`d-${y}-${mo}-${d}`);
            };
            grid.appendChild(b);
        }
        body.appendChild(grid);
    };

    const renderTime = () => {
        const disp = document.createElement("div");
        disp.className = "hh-dt-clock";
        disp.textContent = `${hhDtPad(st.h)} : ${hhDtPad(st.mi)}`;
        body.appendChild(disp);

        const l1 = document.createElement("div");
        l1.className = "hh-dt-lab";
        l1.textContent = "Stunde";
        body.appendChild(l1);
        const gh = document.createElement("div");
        gh.className = "hh-dt-grid hh-dt-tgrid";
        for (let h = 0; h < 24; h++) {
            const b = mk("hh-dt-cell" + (st.h === h ? " is-sel" : ""), hhDtPad(h), { "data-k": "h-" + h, "aria-label": hhDtPad(h) + " Uhr", "aria-pressed": st.h === h ? "true" : "false" });
            b.onclick = () => { st.h = h; render("h-" + h); };
            gh.appendChild(b);
        }
        body.appendChild(gh);

        const l2 = document.createElement("div");
        l2.className = "hh-dt-lab hh-dt-lab-row";
        const l2t = document.createElement("span");
        l2t.textContent = "Minute";
        const steps = document.createElement("span");
        steps.className = "hh-dt-steps";
        const bm = mk("hh-dt-step", "−1", { "aria-label": "Eine Minute zurück", "data-k": "m-1" });
        const bp = mk("hh-dt-step", "+1", { "aria-label": "Eine Minute vor", "data-k": "m+1" });
        bm.onclick = () => { st.mi = (st.mi + 59) % 60; render("m-1"); };
        bp.onclick = () => { st.mi = (st.mi + 1) % 60; render("m+1"); };
        steps.append(bm, bp);
        l2.append(l2t, steps);
        body.appendChild(l2);
        const gm = document.createElement("div");
        gm.className = "hh-dt-grid hh-dt-tgrid";
        for (let m = 0; m < 60; m += 5) {
            const b = mk("hh-dt-cell" + (st.mi === m ? " is-sel" : ""), hhDtPad(m), { "data-k": "m-" + m, "aria-label": hhDtPad(m) + " Minuten", "aria-pressed": st.mi === m ? "true" : "false" });
            b.onclick = () => { st.mi = m; render("m-" + m); };
            gm.appendChild(b);
        }
        body.appendChild(gm);
    };

    const renderFoot = () => {
        foot.textContent = "";
        const quick = mk("hh-dt-btn-q", st.tab === "date" ? "Heute" : "Jetzt", { "data-k": "quick" });
        quick.onclick = () => {
            const n = new Date();
            if (st.tab === "date") { st.y = n.getFullYear(); st.mo = n.getMonth(); st.d = n.getDate(); st.vy = st.y; st.vm = st.mo; render("quick"); }
            else { st.h = n.getHours(); st.mi = n.getMinutes(); render("quick"); }
        };
        const no = mk("hh-dt-btn-no", "Abbrechen", { "data-k": "no" });
        no.onclick = close;
        const ok = mk("hh-dt-btn-ok", "Übernehmen ✅", { "data-k": "ok" });
        ok.onclick = apply;
        foot.append(quick, no, ok);
    };

    const render = (focusKey) => {
        if (mode === "dt") {
            sum.textContent = st.y === null ? "—" : `${hhDtDateText(st.y, st.mo, st.d)} · ${hhDtPad(st.h)}:${hhDtPad(st.mi)} Uhr`;
            renderTabs();
        }
        const keep = body.scrollTop;
        body.textContent = "";
        if (st.tab === "date") renderDate(); else renderTime();
        renderFoot();
        if (focusKey) {
            const el = overlay.querySelector(`[data-k="${focusKey}"]`);
            if (el) el.focus({ preventScroll: true });
        }
        body.scrollTop = keep;
    };

    document.body.appendChild(overlay);
    render(null);
    const first = overlay.querySelector(".hh-dt-day.is-sel, .hh-dt-cell.is-sel, .hh-dt-day.is-today");
    if (first) first.focus({ preventScroll: false });
}

function hhDtInit() {
    hhDtEnhance(document.getElementById("modalDate"), "dt", "Festes Datum");
    hhDtEnhance(document.getElementById("edit-date-val"), "dt", "Festes Datum");
    hhDtEnhance(document.getElementById("modalTime"), "t", "Standard-Uhrzeit");
    hhDtEnhance(document.getElementById("edit-time"), "t", "Uhrzeit");
    hhDtEnhance(document.getElementById("wsTime"), "t", "Uhrzeit");
    hhDtEnhance(document.getElementById("mfNext"), "d", "Nächster Termin");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hhDtInit);
else hhDtInit();

function ingCountText(n) { return `${n} ${n === 1 ? "Zutat" : "Zutaten"}`; }

async function ingConfirm() {
    const picks = ingState.rows.filter(r => r.checked && r.qty > 0);
    if (!picks.length) { ingClose(false); return; }
    const sel = document.getElementById("ingStore");
    const store = (sel && sel.value) || ingDefaultStore();

    try {
        await ingWrite(picks, store);
        ingClose(true);
        ingToast(`✅ ${ingCountText(picks.length)} auf die Liste (${store})`);
    } catch (e) {
        console.error("Zutaten konnten nicht hinzugefügt werden:", e);
        showAlert("Die Zutaten konnten nicht zur Einkaufsliste hinzugefügt werden.", "Fehler ⚠️");
    }
}

// Alles, was noch nicht auf der Liste steht, ohne Nachfrage hinzufügen
async function ingAutoAdd(chosenStore) {
    const picks = ingState.rows.filter(r => !r.onList && r.qty > 0);
    if (!picks.length) return false;
    const store = chosenStore || ingDefaultStore();
    try {
        await ingWrite(picks, store);
        const dup = ingState.rows.length - picks.length;
        ingToast(`⚡ ${ingCountText(picks.length)} automatisch auf die Liste (${store})` + (dup ? ` · ${dup} schon drauf` : ""));
        return true;
    } catch (e) {
        console.error("Zutaten konnten nicht automatisch hinzugefügt werden:", e);
        showAlert("Die Zutaten konnten nicht zur Einkaufsliste hinzugefügt werden.", "Fehler ⚠️");
        return false;
    }
}

// Zutaten für die Gerichte berechnen (gegen die aktuelle Einkaufsliste)
async function ingPrepare(dishes) {
    const list = await ingReadList();
    ingState.onList = new Set(list.map(e => ingFold(ingItemName(e))));
    ingState.dishes = dishes || [];
    ingState.extra = [];
    ingState.rows = [];
    ingCompute();
}

function ingShow(opts) {
    const modal = document.getElementById("ingModal");
    if (!modal) return Promise.resolve(false);
    ingState.mode = opts.mode || "auto";
    document.getElementById("ingTitle").textContent = opts.title || "🛒 Zutaten";
    document.getElementById("ingSub").textContent = opts.sub || "";
    document.getElementById("ingAddInput").value = "";
    document.getElementById("ingNo").textContent = ingState.mode === "auto" ? "Nein danke" : "Abbrechen";

    ingFillStores(document.getElementById("ingStore"), opts.store);

    document.getElementById("ingMode").value = ingMode();

    ingRender();
    const dishWrap = document.getElementById("ingDishWrap");
    if (dishWrap) dishWrap.open = (ingState.chips || []).length <= 3;
    ingApplyTone("ingModal");
    modal.style.display = "flex";
    ingState.open = true;
    return new Promise(res => { ingState.resolve = res; });
}

async function ingOpen(opts) {
    if (ingState.open) return false;
    await ingPrepare(opts.dishes);
    return ingShow(opts);
}

// Abfrage: automatisch oder händisch?
let ingAskResolver = null;

function ingAsk(o) {
    return new Promise(resolve => {
        ingAskResolver = resolve;
        document.getElementById("ingAskTitle").textContent = o.title;
        document.getElementById("ingAskText").textContent = o.text;
        document.getElementById("ingAskRemember").checked = false;
        const storeWrap = document.getElementById("ingAskStoreWrap");
        if (storeWrap) storeWrap.style.display = ingFillStores(document.getElementById("ingAskStore"), o.store) ? "" : "none";
        ingApplyTone("ingAskModal");
        document.getElementById("ingAskModal").style.display = "flex";
    });
}

function ingAskAnswer(how) {
    const remember = document.getElementById("ingAskRemember").checked;
    const storeSel = document.getElementById("ingAskStore");
    const store = (storeSel && storeSel.value) || "";
    document.getElementById("ingAskModal").style.display = "none";
    if (ingAskResolver) {
        const r = ingAskResolver;
        ingAskResolver = null;
        r({ how, remember, store });
    }
}

// Wird von saveFood() nach dem Speichern aufgerufen
async function ingMaybeSuggest(changed, dayIdx, week) {
    const mode = ingMode();
    if (mode === "off" || !changed.length || ingState.open || ingAskResolver) return;
    const anyKnown = changed.some(c => !ING_SKIP.test(ingNorm(c.text)) && ingFindRecipes(c.text).length);
    if (!anyKnown) return;

    await ingPrepare(changed);
    const fresh = ingState.rows.filter(r => !r.onList);
    if (!fresh.length) return;   // alles Nötige steht schon auf der Liste

    const weekTxt = week === 1 ? " · nächste Woche" : "";
    const where = `${ING_DAYS[dayIdx] || ""} · ${changed.map(c => ING_MEALS[c.meal]).join(" + ")}${weekTxt}`;
    const title = changed.length === 1 ? `🛒 Zutaten für „${changed[0].text}"` : "🛒 Zutaten für deine Gerichte";

    let how = mode;
    let store = "";
    if (mode === "ask") {
        const dup = ingState.rows.length - fresh.length;
        const a = await ingAsk({
            title,
            text: `${ingCountText(fresh.length)} fehlen noch${dup ? ` (${dup} stehen schon auf der Liste)` : ""}. ` +
                  `Soll ich sie automatisch auf die Einkaufsliste setzen oder möchtest du sie selbst auswählen?`
        });
        if (a.remember) ingSetMode(a.how === "off" ? "off" : a.how);
        if (a.how === "off") return;
        how = a.how;
        store = a.store;
    }

    if (how === "auto") await ingAutoAdd(store);
    else await ingShow({ mode: "auto", title, sub: where, store });
}

// Knopf "Einkauf aus dem Plan": alle Gerichte der angezeigten Woche
async function openWeekIngredients() {
    const dishes = [];
    for (let i = 0; i < 7; i++) {
        [["bf", `plan-${i}-bf`], ["lunch", `plan-${i}`], ["dn", `plan-${i}-dn`]].forEach(([meal, id]) => {
            const el = document.getElementById(id);
            const text = el ? el.value.trim() : "";
            if (text) dishes.push({ text, meal, dayIdx: i });
        });
    }
    if (!dishes.length) {
        showAlert("Im Wochenplan stehen noch keine Gerichte. Trag zuerst etwas ein, dann stelle ich die Zutaten zusammen.", "Noch nichts geplant 🍽️");
        return;
    }
    await ingOpen({
        mode: "week",
        title: "🛒 Einkauf aus dem Plan",
        sub: activeFoodWeek === 0 ? "Diese Woche" : "Nächste Woche",
        dishes
    });
}

// ==========================================================================
//  REZEPTE-SEITE  (alle eingebauten und eigenen Rezepte ansehen, ändern, neu anlegen)
// ==========================================================================
function recAll() {
    const user = ingGetRecipes();
    const list = [];
    const used = new Set();

    ING_RECIPES.forEach(r => {
        const key = ingNorm(r.n);
        const ov = user[key];
        if (ov) used.add(key);
        list.push({
            key, name: r.n,
            aliases: ov ? (Array.isArray(ov.a) && ov.a.length ? ov.a : [r.n]) : r.a,
            itemsText: ov ? ov.i : r.i,
            source: ov ? "override" : "builtin"
        });
    });
    Object.keys(user).forEach(k => {
        if (used.has(k)) return;
        const rec = user[k] || {};
        list.push({
            key: k, name: rec.n || k,
            aliases: (Array.isArray(rec.a) && rec.a.length) ? rec.a : [rec.n || k],
            itemsText: rec.i || "", source: "own"
        });
    });
    return list.sort((x, y) => x.name.localeCompare(y.name, "de"));
}

function recItemsPretty(itemsText) {
    return ingParseList(itemsText).map(x => x.q > 1 ? `${x.q}× ${x.n}` : x.n).join(", ");
}

function recRender() {
    const box = document.getElementById("recList");
    if (!box) return;
    const all = recAll();
    const q = ingNorm((document.getElementById("recSearch") || {}).value || "");
    const shown = all.filter(r => !q || ingNorm([r.name, ...r.aliases, r.itemsText].join(" ")).includes(q));

    const own = all.filter(r => r.source !== "builtin").length;
    const sub = document.getElementById("recSub");
    if (sub) sub.textContent = `${all.length} Rezepte · ${own} eigene oder angepasste` + (q ? ` · ${shown.length} gefunden` : "");

    box.replaceChildren();
    if (!shown.length) {
        const empty = document.createElement("div");
        empty.className = "ing-empty";
        empty.textContent = q ? "Nichts gefunden. Du kannst unten ein neues Rezept anlegen." : "Noch keine Rezepte.";
        box.appendChild(empty);
        return;
    }
    shown.forEach(r => {
        const item = document.createElement("div");
        item.className = "rec-item";

        const head = document.createElement("div");
        head.className = "rec-head";
        const name = document.createElement("span");
        name.className = "rec-name";
        name.textContent = r.name;
        head.appendChild(name);
        if (r.source !== "builtin") {
            const badge = document.createElement("span");
            badge.className = "rec-badge";
            badge.textContent = r.source === "own" ? "Eigenes" : "Angepasst";
            head.appendChild(badge);
        }
        item.appendChild(head);

        const ing = document.createElement("div");
        ing.className = "rec-ing";
        ing.textContent = recItemsPretty(r.itemsText) || "Keine Zutaten hinterlegt";
        item.appendChild(ing);

        const others = r.aliases.filter(a => ingNorm(a) !== ingNorm(r.name));
        if (others.length) {
            const al = document.createElement("div");
            al.className = "rec-alias";
            al.textContent = "Erkennt auch: " + others.join(", ");
            item.appendChild(al);
        }

        const btns = document.createElement("div");
        btns.className = "rec-btns";
        btns.appendChild(ingMakeBtn("🛒 Einkaufen", "", () => recShop(r), "hh-pill"));
        btns.appendChild(ingMakeBtn("✏️ Ändern", "", () => recEdit(r), "hh-pill"));
        if (r.source !== "builtin") {
            btns.appendChild(ingMakeBtn(r.source === "own" ? "🗑️ Löschen" : "↩︎ Standard", "", () => recDelete(r), "hh-pill"));
        }
        item.appendChild(btns);
        box.appendChild(item);
    });
}

function openRecipes() {
    const modal = document.getElementById("recipesModal");
    if (!modal) return;
    const s = document.getElementById("recSearch");
    if (s) s.value = "";
    recRender();
    ingApplyTone("recipesModal");
    modal.style.display = "flex";
}

function recClose() {
    const modal = document.getElementById("recipesModal");
    if (modal) modal.style.display = "none";
}

function recShop(r) {
    ingOpen({
        mode: "week",
        title: `🛒 Zutaten für „${r.name}"`,
        sub: "Rezept",
        dishes: [{ text: r.aliases[0] || r.name, meal: "lunch", dayIdx: 0 }]
    });
}

async function recEdit(r) {
    const val = await showInputPrompt(
        `Zutaten für „${r.name}" – mit Komma trennen, Menge z. B. 2 Zwiebeln oder Käse*2.` +
        (r.source === "builtin" ? "" : " Leer lassen = " + (r.source === "own" ? "Rezept löschen." : "Standard wiederherstellen.")),
        "Rezept ändern ✏️",
        ingItemsToText(ingParseList(r.itemsText))
    );
    if (val === null) return;
    if (!val && r.source === "builtin") return;
    ingSaveRecipe(r.name, val, r.aliases);
    recRender();
    ingToast(val ? "✅ Rezept gespeichert" : (r.source === "own" ? "🗑️ Rezept gelöscht" : "↩︎ Standard wiederhergestellt"));
}

async function recDelete(r) {
    const own = r.source === "own";
    const ok = await showDeleteModal(
        own ? `Rezept „${r.name}" wirklich löschen?` : `Deine Änderungen an „${r.name}" verwerfen und das Standard-Rezept wiederherstellen?`,
        own ? "Rezept löschen" : "Standard wiederherstellen",
        own ? "Löschen" : "Wiederherstellen"
    );
    if (!ok) return;
    ingSaveRecipe(r.name, "", r.aliases);
    recRender();
    ingToast(own ? "🗑️ Rezept gelöscht" : "↩︎ Standard wiederhergestellt");
}

async function recNew() {
    const name = await showInputPrompt("Name des Gerichts – so, wie du es in den Wochenplan schreibst:", "Neues Rezept 📖");
    if (!name) return;
    if (recAll().some(r => ingNorm(r.name) === ingNorm(name))) {
        await showAlert(`Ein Rezept „${name}" gibt es schon. Such es oben und tippe auf „Ändern".`, "Gibt es schon");
        return;
    }
    const ing = await showInputPrompt(`Zutaten für „${name}" – mit Komma trennen, Menge z. B. 2 Zwiebeln oder Käse*2.`, "Zutaten 🛒");
    if (!ing) return;
    ingSaveRecipe(name, ing, [name]);
    const s = document.getElementById("recSearch");
    if (s) s.value = name;
    recRender();
    ingToast("✅ Rezept gespeichert");
}

// ==========================================================================
//  MAHLZEITEN-AUSWAHL
//  Tipp auf ein Essensfeld → (Frage: Favoriten?) → Fenster mit Favoriten / Rezepten,
//  Suche, Eintippen + Übernehmen
// ==========================================================================
let mealPick = { open: false, target: null, dayIdx: 0, meal: "lunch", tab: "list", cat: "Alle" };
let mealAskResolver = null;

// ask = erst fragen (Favoriten?) · favs = gleich Favoriten · list = gleich Rezepte/Eintippen · off = Feld normal antippen und tippen
function mealPickMode() {
    const m = localStorage.getItem("hh_pick_mode");
    return (m === "ask" || m === "favs" || m === "list" || m === "off") ? m : "ask";
}

function mealPickSetMode(m) {
    try { localStorage.setItem("hh_pick_mode", m); } catch (e) { /* egal */ }
    applyMealInputMode();
}

// Felder sind nur lesbar, solange die Auswahl aktiv ist – so poppt keine Tastatur vor dem Fenster auf
function applyMealInputMode() {
    const pick = mealPickMode() !== "off";
    document.querySelectorAll("input.day-input").forEach(el => {
        if (el.id === "plan-7") return;
        el.readOnly = pick;
        el.classList.toggle("is-pick", pick);
    });
}

function mealFavs() {
    return ((db.food && db.food.favs) || [])
        .map(f => (typeof f === "string") ? { n: f, c: "" } : f)
        .filter(f => f && f.n);
}

function mealInfoFromInput(el) {
    const m = /^plan-(\d)(?:-(bf|dn))?$/.exec(el.id || "");
    if (!m) return null;
    return { dayIdx: parseInt(m[1], 10), meal: m[2] === "bf" ? "bf" : (m[2] === "dn" ? "dn" : "lunch") };
}

document.addEventListener("click", ev => {
    const el = ev.target && ev.target.closest ? ev.target.closest("input.day-input") : null;
    if (!el || el.id === "plan-7" || !el.readOnly) return;
    if (mealPickMode() === "off" || mealPick.open || mealAskResolver) return;
    el.blur();
    activeMealInput = el;
    openMealPicker(el);
});

function mealAsk(o) {
    return new Promise(resolve => {
        mealAskResolver = resolve;
        document.getElementById("mealAskTitle").textContent = o.title;
        document.getElementById("mealAskText").textContent = o.text;
        document.getElementById("mealAskRemember").checked = false;
        ingApplyTone("mealAskModal");
        document.getElementById("mealAskModal").style.display = "flex";
    });
}

function mealAskAnswer(how) {
    const remember = document.getElementById("mealAskRemember").checked;
    document.getElementById("mealAskModal").style.display = "none";
    if (mealAskResolver) {
        const r = mealAskResolver;
        mealAskResolver = null;
        r(how ? { how, remember } : null);
    }
}

async function openMealPicker(el) {
    const info = mealInfoFromInput(el);
    if (!info) return;
    mealPick.target = el;
    mealPick.dayIdx = info.dayIdx;
    mealPick.meal = info.meal;
    mealPick.cat = "Alle";

    const title = `🍽️ ${ING_MEALS[info.meal]} · ${ING_DAYS[info.dayIdx]}`;
    const hasFavs = mealFavs().length > 0;
    let tab = "list";
    const mode = mealPickMode();

    if (mode === "favs") tab = hasFavs ? "favs" : "list";
    else if (mode === "ask" && hasFavs) {
        const a = await mealAsk({ title, text: "Möchtest du etwas aus deinen Favoriten nehmen?" });
        if (!a) return;
        if (a.remember) mealPickSetMode(a.how);
        tab = a.how;
    }
    showMealPicker(title, tab);
}

function showMealPicker(title, tab) {
    const modal = document.getElementById("mealPickModal");
    if (!modal) return;
    const cur = mealPick.target ? mealPick.target.value.trim() : "";
    document.getElementById("pickTitle").textContent = title;
    document.getElementById("pickSub").textContent = cur ? `Aktuell: ${cur}` : "Noch nichts eingetragen";
    document.getElementById("pickInput").value = "";
    document.getElementById("pickMode").value = mealPickMode();
    document.getElementById("pickClear").style.display = cur ? "" : "none";
    mealPick.tab = tab;
    mealPickRender();
    ingApplyTone("mealPickModal");
    modal.style.display = "flex";
    mealPick.open = true;
    setTimeout(() => {
        // Am PC direkt tippbar; am Handy keine Tastatur erzwingen
        if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
            const inp = document.getElementById("pickInput");
            if (inp) inp.focus();
        }
    }, 120);
}

function mealPickTab(tab) {
    mealPick.tab = tab;
    mealPickRender();
}

function mealPickRender() {
    const list = document.getElementById("pickList");
    const cats = document.getElementById("pickCats");
    if (!list || !cats) return;
    const q = ingNorm(document.getElementById("pickInput").value || "");
    const favs = mealFavs();
    const recs = recAll();

    // Reiter
    const bf = document.getElementById("pickTabFavs"), bl = document.getElementById("pickTabList");
    bf.textContent = `⭐ Favoriten (${favs.length})`;
    bl.textContent = `📖 Rezepte (${recs.length})`;
    bf.className = "hh-tab" + (mealPick.tab === "favs" ? " is-on" : "");
    bl.className = "hh-tab" + (mealPick.tab === "list" ? " is-on" : "");

    // Kategorien (nur bei Favoriten)
    cats.replaceChildren();
    const catNames = ((db.food && db.food.cats) || ["Alle"]).filter(c => c && c !== "Alle");
    if (mealPick.tab === "favs" && catNames.length) {
        ["Alle", ...catNames].forEach(c => {
            const chip = ingMakeBtn(c, "", () => { mealPick.cat = c; mealPickRender(); });
            chip.className = "ing-dish" + (mealPick.cat === c ? " is-active" : "");
            cats.appendChild(chip);
        });
        cats.style.display = "";
    } else {
        cats.style.display = "none";
    }

    // Einträge
    let rows;
    if (mealPick.tab === "favs") {
        rows = favs
            .filter(f => (mealPick.cat === "Alle" || f.c === mealPick.cat) && (!q || ingNorm(f.n).includes(q)))
            .map(f => ({ name: f.n, meta: (mealPick.cat === "Alle" && f.c && f.c !== "Alle") ? f.c : "" }));
    } else {
        rows = recs
            .filter(r => !q || ingNorm([r.name, ...r.aliases].join(" ")).includes(q))
            .map(r => ({ name: r.name, meta: "" }));
    }

    list.replaceChildren();
    if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "ing-empty";
        empty.textContent = q
            ? "Nichts gefunden. Tippe auf „Übernehmen“, um deinen Text einzutragen."
            : (mealPick.tab === "favs" ? "Noch keine Favoriten. Du kannst sie oben im Wochenplan mit „⭐️ + Favoriten“ anlegen." : "Noch keine Rezepte.");
        list.appendChild(empty);
        return;
    }
    rows.forEach(r => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hh-pickrow";
        const n = document.createElement("span");
        n.textContent = r.name;
        n.style.overflowWrap = "anywhere";
        b.appendChild(n);
        if (r.meta) {
            const m = document.createElement("small");
            m.textContent = r.meta;
            m.style.cssText = "opacity:0.6;font-weight:600;flex:0 0 auto;";
            b.appendChild(m);
        }
        b.addEventListener("click", () => mealPickChoose(r.name));
        list.appendChild(b);
    });
}

function mealPickChoose(name) {
    const el = mealPick.target;
    const day = mealPick.dayIdx;
    mealPickClose();
    if (!el || !String(name || "").trim()) return;
    el.value = String(name).trim();
    saveFood(day);
}

function mealPickApplyTyped() {
    const t = (document.getElementById("pickInput").value || "").trim();
    if (!t) return;
    mealPickChoose(t);
}

function mealPickClear() {
    const el = mealPick.target;
    const day = mealPick.dayIdx;
    mealPickClose();
    if (!el) return;
    el.value = "";
    saveFood(day);
}

function mealPickClose() {
    const modal = document.getElementById("mealPickModal");
    if (modal) modal.style.display = "none";
    mealPick.open = false;
}

// ===== Einkauf: Artikel abhaken und per Ziehen in ein anderes Geschäft verschieben =====
// Einträge der Liste sehen so aus: "2x Nudeln @Aldi" (Name + " @" + Geschäft).
function shopItemDone(li, btn, t) {
    if (btn.disabled) return;
    btn.disabled = true;
    li.classList.add("is-done");          // kurz abhaken (durchgestrichen), dann aus der Liste nehmen
    shopHidden.add(t);
    setTimeout(async () => {
        try { await delItem(t); } finally { shopHidden.delete(t); }
    }, 380);
}

// Artikel in ein anderes Geschäft schieben: nur das " @Geschäft" am Ende des Eintrags wird getauscht
async function shopMoveItem(text, fromStore, toStore) {
    if (!toStore || toStore === fromStore) return false;
    const suffix = ` @${fromStore}`;
    if (!String(text).endsWith(suffix)) return false;
    const moved = text.slice(0, text.length - suffix.length) + ` @${toStore}`;
    shopHidden.add(text);
    try {
        const cfg = SYNC_CONFIG.shopping;
        const d = await haGetState(cfg.entity);
        // Ohne gelesene Liste nichts schreiben (sonst würde eine nicht erreichbare Liste überschrieben)
        if (!d || !d.attributes || !(cfg.attr in d.attributes)) throw new Error("Einkaufsliste nicht erreichbar");
        let list = [];
        const raw = d.attributes[cfg.attr];
        if (raw) {
            const parsed = (typeof raw === "string") ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) list = parsed.slice();
        }
        const idx = list.indexOf(text);
        if (idx < 0) return false;                       // wurde inzwischen schon geändert (z. B. auf einem anderen Gerät)
        list.splice(idx, 1);
        if (!list.includes(moved)) list.push(moved);     // steht dort schon genau so drin → zusammenführen
        const res = await haFireEvent(cfg.event, { json_data: list });
        if (res && res.ok === false) throw new Error("HTTP " + res.status);
        if (typeof ingToast === "function") ingToast(`🛒 ${String(text).slice(0, text.length - suffix.length)} → ${toStore}`);
        return true;
    } catch (e) {
        console.error("❌ Verschieben fehlgeschlagen:", e);
        if (typeof ingToast === "function") ingToast("⚠️ Verschieben hat nicht geklappt");
        return false;
    } finally {
        shopHidden.delete(text);
        try { await load(); } catch (e) { /* egal */ }
        if (typeof updateAppBadges === "function") { try { updateAppBadges(); } catch (e) { /* egal */ } }
    }
}

const shopDrag = { pending: false, active: false, li: null, text: "", from: "", timer: null, ghost: null, tray: null, sx: 0, sy: 0, x: 0, y: 0, mode: "", target: "" };

function shopDragBind(li, text) {
    li.title = "Gedrückt halten und auf ein anderes Geschäft ziehen";
    li.addEventListener("pointerdown", e => shopDragDown(e, li, text));
    li.addEventListener("contextmenu", e => { if (shopDrag.pending || shopDrag.active) e.preventDefault(); });
}
function shopDragDown(e, li, text) {
    const s = shopDrag;
    if (s.pending || s.active) return;
    if (e.target.closest && e.target.closest(".btn-del-item")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!Array.isArray(stores) || stores.filter(x => x !== activeStore).length === 0) return;   // nichts zum Hinziehen da
    s.pending = true; s.active = false;
    s.li = li; s.text = text; s.from = activeStore;
    s.sx = s.x = e.clientX; s.sy = s.y = e.clientY;
    s.mode = (e.pointerType === "mouse") ? "mouse" : "touch";
    if (s.mode === "touch") s.timer = setTimeout(shopDragStart, 380);   // langes Drücken, damit Scrollen weiter geht
    document.addEventListener("pointermove", shopDragMove, true);
    document.addEventListener("pointerup", shopDragUp, true);
    document.addEventListener("pointercancel", shopDragCancel, true);
    document.addEventListener("keydown", shopDragKey, true);
}
function shopDragStart() {
    const s = shopDrag;
    if (!s.pending || s.active) return;
    clearTimeout(s.timer);
    s.pending = false; s.active = true;
    s.li.classList.add("is-dragging");
    document.body.classList.add("shop-dragging");
    document.addEventListener("touchmove", shopDragBlockScroll, { passive: false });

    const name = s.text.slice(0, s.text.length - (` @${s.from}`).length);
    const g = document.createElement("div");
    g.className = "shop-ghost";
    g.textContent = "🛒 " + name;
    document.body.appendChild(g);
    s.ghost = g;

    const tray = document.createElement("div");
    tray.className = "shop-tray";
    tray.id = "shopDropTray";
    const title = document.createElement("div");
    title.className = "shop-tray-title";
    title.textContent = "Verschieben nach …";
    const chips = document.createElement("div");
    chips.className = "shop-tray-chips";
    stores.filter(x => x !== s.from).forEach(st => {
        const c = document.createElement("div");
        c.className = "shop-tray-chip";
        c.dataset.dropStore = st;
        c.textContent = st;
        chips.appendChild(c);
    });
    tray.append(title, chips);
    document.body.appendChild(tray);
    s.tray = tray;
    if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* egal */ } }
    shopDragPlace();
}
function shopDragBlockScroll(e) { if (shopDrag.active && e.cancelable) e.preventDefault(); }
function shopDragPlace() {
    const s = shopDrag;
    if (!s.active || !s.ghost) return;
    const z = (typeof currentAppZoom === "number" && currentAppZoom > 0) ? currentAppZoom : 1;
    const w = s.ghost.offsetWidth * z, h = s.ghost.offsetHeight * z;
    s.ghost.style.left = ((s.x - w / 2) / z) + "px";
    s.ghost.style.top = ((s.y - h - 14) / z) + "px";          // über dem Finger, damit er das Ziel nicht verdeckt
    // Ziel unter dem Finger
    let target = "";
    const els = document.elementsFromPoint ? document.elementsFromPoint(s.x, s.y) : [];
    for (const el of els) {
        const t = el.closest ? el.closest("[data-drop-store]") : null;
        if (t) { target = t.dataset.dropStore; break; }
    }
    if (target === s.from) target = "";
    s.target = target;
    document.querySelectorAll("[data-drop-store].is-drop").forEach(el => { if (el.dataset.dropStore !== target) el.classList.remove("is-drop"); });
    if (target) document.querySelectorAll("[data-drop-store]").forEach(el => { if (el.dataset.dropStore === target) el.classList.add("is-drop"); });
}
function shopDragMove(e) {
    const s = shopDrag;
    if (!(s.pending || s.active)) return;
    s.x = e.clientX; s.y = e.clientY;
    if (s.pending) {
        const dist = Math.hypot(s.x - s.sx, s.y - s.sy);
        if (s.mode === "mouse" && dist > 6) shopDragStart();
        else if (s.mode === "touch" && dist > 10) shopDragCleanup();   // der Finger scrollt: nicht ziehen
        return;
    }
    if (e.cancelable) e.preventDefault();
    shopDragPlace();
}
function shopDragUp(e) {
    const s = shopDrag;
    if (!(s.pending || s.active)) return;
    const wasActive = s.active;
    if (wasActive) { s.x = e.clientX; s.y = e.clientY; shopDragPlace(); }
    const target = wasActive ? s.target : "";
    const text = s.text, from = s.from;
    shopDragCleanup();
    if (wasActive && target) shopMoveItem(text, from, target);
}
function shopDragCancel() { shopDragCleanup(); }
function shopDragKey(e) { if (e.key === "Escape") shopDragCleanup(); }
function shopDragCleanup() {
    const s = shopDrag;
    clearTimeout(s.timer);
    document.removeEventListener("pointermove", shopDragMove, true);
    document.removeEventListener("pointerup", shopDragUp, true);
    document.removeEventListener("pointercancel", shopDragCancel, true);
    document.removeEventListener("keydown", shopDragKey, true);
    document.removeEventListener("touchmove", shopDragBlockScroll, { passive: false });
    if (s.li) s.li.classList.remove("is-dragging");
    if (s.ghost) s.ghost.remove();
    if (s.tray) s.tray.remove();
    document.body.classList.remove("shop-dragging");
    document.querySelectorAll("[data-drop-store].is-drop").forEach(el => el.classList.remove("is-drop"));
    s.pending = false; s.active = false; s.li = null; s.ghost = null; s.tray = null; s.target = "";
}

async function delItem(t) {
    try {
        const cfg = SYNC_CONFIG.shopping;
        const d = await haGetState(cfg.entity);

        // Ohne gelesene Liste nichts schreiben (sonst würde eine nicht erreichbare Liste leer überschrieben)
        if (!d || !d.attributes || !(cfg.attr in d.attributes)) throw new Error("Einkaufsliste nicht erreichbar");

        let currentList = [];
        if (d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            currentList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }

        const newList = currentList.filter(x => x !== t);
        await haFireEvent(cfg.event, { json_data: newList });
        await load();
        if (typeof updateAppBadges === "function") updateAppBadges();
    } catch (e) {
        console.error("❌ Kritischer Fehler in delItem:", e);
    }
}

async function deleteCat(type, name) { 
    if (name !== 'Alle') { 
        // Nutzt jetzt das echte Lösch-Modal (mit "Abbrechen" und "Löschen")
        const confirmed = await showDeleteModal(`Kategorie "${name}" wirklich löschen?`, "Kategorie löschen");
        if (confirmed) { 
            db[type].cats = db[type].cats.filter(x => x !== name); 
            db[type].favs = db[type].favs.filter(x => x.c !== name); 
            curCat = "Alle"; 
            syncUp(); 
            render(); 
        } 
    } 
}

async function deleteFav(idx) { 
    // Nutzt ebenfalls das echte Lösch-Modal
    const confirmed = await showDeleteModal("Möchtest du diesen Favoriten wirklich löschen?", "Favorit löschen");
    if (confirmed) { 
        db[curTab].favs.splice(idx, 1); 
        await syncUp(); 
        render(); 
    } 
}

// Schickes Bestätigungs-Modal statt window.confirm()
function showConfirm(message, title = "Löschen bestätigen") {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('customConfirmTitle');
        const msgEl = document.getElementById('customConfirmMessage');
        const btnYes = document.getElementById('customConfirmYes');
        const btnNo = document.getElementById('customConfirmNo');

        if (!modal) {
            resolve(confirm(message)); // Fallback falls Modal fehlt
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.style.display = 'flex';

        const handleYes = () => {
            modal.style.display = 'none';
            cleanup();
            resolve(true);
        };

        const handleNo = () => {
            modal.style.display = 'none';
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
        };

        btnYes.addEventListener('click', handleYes, { once: true });
        btnNo.addEventListener('click', handleNo, { once: true });
    });
}

function render() {
    const cBox = document.getElementById(`cats-${curTab}`); 
    if(!cBox) return; 
    cBox.innerHTML = "";
    
    db[curTab].cats.forEach(c => { 
        const b = document.createElement('button'); 
        b.className = `cat-btn ${curCat === c ? 'active-'+curTab : ''}`; 
        
        // Text-Span erstellen
        const txt = document.createElement('span');
        txt.innerText = c;
        b.appendChild(txt);

        // Das "×" nur bei selbst erstellten Kategorien (und nicht bei "Alle") einfügen
        if (c !== 'Alle') {
            const del = document.createElement('span');
            del.innerHTML = " 🗑️";
            del.className = "del-cat";
            del.style.marginLeft = "6px";
            del.style.cursor = "pointer";
            del.style.fontWeight = "bold";
            
            // Klick auf das X ruft direkt deine Löschfunktion auf
            del.onclick = (e) => { 
                e.stopPropagation(); 
                deleteCat(curTab, c); 
            };
            b.appendChild(del);
        }

        b.onclick = () => { curCat = c; render(); }; 
        // Rechtsklick kann als Backup natürlich drin bleiben oder weichen
        b.oncontextmenu = (e) => { e.preventDefault(); deleteCat(curTab, c); }; 
        
        cBox.appendChild(b); 
    });

    const fBox = document.getElementById(`favs-${curTab}`); 
    if(!fBox) return; 
    fBox.innerHTML = "";
    
    staticFavs[curTab]?.forEach(f => { if(curCat==='Alle'||f.c===curCat) fBox.appendChild(createFavChip(f, false)); });
    db[curTab].favs.forEach((f, idx) => { if(curCat==='Alle'||f.c===curCat) fBox.appendChild(createFavChip(f, true, idx)); });
}

let foodResolver = null;

function showFoodDayPrompt(message, title = "Essen planen") {
    return new Promise((resolve) => {
        foodResolver = resolve;
        const modal = document.getElementById('customFoodModal');
        const titleEl = document.getElementById('customFoodTitle');
        const msgEl = document.getElementById('customFoodMessage');
        const inputEl = document.getElementById('customFoodField');
        
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
        if (inputEl) {
            // Standard-Tag direkt voreintragen (0=Mo bis 6=So)
            const defaultDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
            inputEl.value = defaultDay;
            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 100);
        }
        
        if (modal) modal.style.display = 'flex';
    });
}

function resolveFoodPrompt(confirmed) {
    const modal = document.getElementById('customFoodModal');
    const inputEl = document.getElementById('customFoodField');
    let value = null;
    
    if (confirmed && inputEl) {
        value = inputEl.value.trim();
    }
    
    if (modal) modal.style.display = 'none';
    if (foodResolver) {
        foodResolver(value);
        foodResolver = null;
    }
}

function createFavChip(f, isCustom, idx) {
    const chip = document.createElement('div'); 
    chip.className = 'fav-chip'; 

    const span = document.createElement('span');
    span.textContent = f.n; // XSS-sicher dank textContent!
    chip.appendChild(span);

    if (isCustom) { 
        const del = document.createElement('span'); 
        del.textContent = " 🗑️"; 
        del.className = "del-fav"; 
        del.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            deleteFav(idx); 
        });
        chip.appendChild(del); 
    }

    chip.addEventListener('click', async () => { 
        if (curTab === 'shop') {
            addShop(f.n); 
        } else if (curTab === 'food') {
            // 1. Wenn der Nutzer gerade in ein bestimmtes Feld geklickt hat -> Direkt eintragen!
            if (activeMealInput && document.body.contains(activeMealInput)) {
                activeMealInput.value = f.n;
                const idParts = activeMealInput.id.split('-');
                const dayIdx = parseInt(idParts[1], 10);
                if (!isNaN(dayIdx) && dayIdx >= 0 && dayIdx <= 6) {
                    saveFood(dayIdx);
                    return;
                }
            }

            // 2. Ansonsten: Erst Wochentag abfragen (0-6)
            const d = await showFoodDayPrompt(
                `Für welchen Wochentag?\n(0 = Mo, 1 = Di, 2 = Mi, 3 = Do, 4 = Fr, 5 = Sa, 6 = So)`, 
                `Essen planen: ${f.n}`
            );
            
            if (d === null || d === "") return;
            const dayIdx = parseInt(d.trim(), 10);

            if (isNaN(dayIdx) || dayIdx < 0 || dayIdx > 6) {
                await showAlert("Bitte eine Zahl zwischen 0 und 6 eingeben.", "Ungültige Eingabe ❌");
                return;
            }

            // 3. Dann Mahlzeit abfragen (Frühstück, Mittag oder Abend)
            const m = await showFoodDayPrompt(
                `Welche Mahlzeit für Tag ${dayIdx}?\n\n1 = 🥐 Frühstück\n2 = ☀️ Mittagessen\n3 = 🌙 Abendessen`, 
                `Mahlzeit wählen`
            );

            if (m === null || m === "") return;
            const mealChoice = m.trim();

            let targetInputId = 'plan-' + dayIdx; // Standard: Mittag
            if (mealChoice === '1' || mealChoice.toLowerCase().startsWith('f')) {
                targetInputId = 'plan-' + dayIdx + '-bf'; // Frühstück
            } else if (mealChoice === '3' || mealChoice.toLowerCase().startsWith('a')) {
                targetInputId = 'plan-' + dayIdx + '-dn'; // Abendessen
            }

            const targetInput = document.getElementById(targetInputId);
            if (targetInput) {
                targetInput.value = f.n;
                saveFood(dayIdx); 
            }

        } else { 
            addTodo(f.n); 
        }
    });

    return chip;
}

function tab(t) { 
    applyMealInputMode();
    curTab = t; 
    sessionStorage.setItem("current_tab", t); 
    ['home','shop','food','todo','trash','finance'].forEach(v => { 
        const view = document.getElementById('v-'+v);
        const tabBtn = document.getElementById('t-'+v);
        if(view) view.style.display = t===v?'block':'none'; 
        // "Start" nutzt zusätzlich die Shop-Farbe, damit alle Themes den aktiven Tab hervorheben
        if(tabBtn) tabBtn.className = `tab-item ${t===v ? 'active-'+v + (v==='home' ? ' active-shop' : '') : ''}`; 
    }); 

    if(t==='home') {
        loadHome(true);
    } else if(t==='trash') { 
        loadTrash(); 
    } else if(t==='finance') {
        loadFinance();
    } else { 
        render(); 
        load(); 
        renderSidebars(); 
    } 
}

let tempShopItem = "";

async function addShop(manual) {
    const i = document.getElementById("in-shop");
    tempShopItem = manual || i.value.trim();

    if (tempShopItem) {
        document.getElementById("shopQtyTitle").innerText = `Menge für "${tempShopItem}"`;
        document.getElementById("shopQtyValue").value = "1"; 
        document.getElementById("shopQtyModal").style.display = "flex";
        
        setTimeout(() => {
            const valInput = document.getElementById("shopQtyValue");
            valInput.focus();
            valInput.select();
        }, 50);

        if (!manual) i.value = ""; 
    }
}
    
async function confirmShopAdd() {
    const q = document.getElementById("shopQtyValue");
    let qty = parseInt(q.value) || 1;
    const vollerName = (qty > 1) ? `${qty}x ${tempShopItem}` : tempShopItem;

    try {
        const cfg = SYNC_CONFIG.shopping;
        const data = await haGetState(cfg.entity);

        let currentList = [];
        if (data && data.attributes && data.attributes[cfg.attr]) {
            const rawData = data.attributes[cfg.attr];
            currentList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }

        currentList.push(`${vollerName} @${activeStore}`);
        await haFireEvent(cfg.event, { json_data: currentList });

        document.getElementById("shopQtyModal").style.display = "none";
        load(); 
    } catch (e) {
        console.error("Fehler beim Hinzufügen zum Einkauf:", e);
    }
}


async function loadTrash() {
    const container = document.getElementById("trash-content");
    if (!container) return;
    container.textContent = "";

    try {
        if (!Array.isArray(TRASH_CONFIG) || TRASH_CONFIG.length === 0) {
            const emptyMsg = document.createElement("div");
            emptyMsg.className = "trash-row";
            emptyMsg.textContent = "Keine Müll-Sensoren in den Integrations-Optionen konfiguriert.";
            container.appendChild(emptyMsg);
            return;
        }

        for (const s of TRASH_CONFIG) {
            if (!s.id || !s.dateId) continue;

            const [dDays, dDate] = await Promise.all([
                haGetState(s.id),
                haGetState(s.dateId)
            ]);

            let tage = (dDays && dDays.state !== undefined) ? String(dDays.state) : "?";
            let rohDatum = (dDate && dDate.state !== undefined) ? String(dDate.state) : "";
            let dF = "Unbekannt";
            let dateObj = null;

            if (rohDatum && rohDatum !== "unknown" && rohDatum !== "unavailable") {
                if (rohDatum.includes('.')) {
                    dF = rohDatum;
                    const p = rohDatum.split('.');
                    dateObj = new Date(p[2], p[1] - 1, p[0]);
                } else {
                    dateObj = new Date(rohDatum);
                    if (!isNaN(dateObj.getTime())) {
                        dF = dateObj.toLocaleDateString('de-DE');
                    } else {
                        dF = rohDatum;
                    }
                }
            }

            if (dateObj && !isNaN(dateObj.getTime())) {
                const taskName = `🗑️ ${s.name} rausstellen`;
                let reminderDate = new Date(dateObj);
                reminderDate.setDate(reminderDate.getDate() - 1);
                reminderDate.setHours(18, 0, 0, 0);

                const taskExists = todoDb.some(t => t.name === taskName && t.nextDate.startsWith(reminderDate.toISOString().split('T')[0]));

                if (!taskExists && reminderDate > new Date()) {
                    const newTrashTodo = {
                        id: "trash-" + s.name + "-" + reminderDate.getTime(),
                        name: taskName,
                        room: "Müllabfuhr",
                        assignedTo: "Alle",
                        intervalHours: 0,
                        lastDone: null,
                        nextDate: reminderDate.toISOString()
                    };
                    todoDb.push(newTrashTodo);
                    saveTodoDb(taskName, "automatisch geplant 🤖");
                }
            }

            let dV = parseInt(tage, 10);
            let col = isNaN(dV) ? "var(--text)" : (dV <= 1 ? "var(--danger)" : (dV <= 3 ? "var(--accent)" : "var(--text)"));

            // Sicherer DOM-Aufbau ohne innerHTML
            const row = document.createElement("div");
            row.className = "trash-row";

            const header = document.createElement("div");
            header.className = "trash-header";

            const nameSpan = document.createElement("span");
            nameSpan.className = "trash-name";
            nameSpan.textContent = `${s.icon || "🗑️"} ${s.name || ""}`;

            const daysSpan = document.createElement("span");
            daysSpan.className = "trash-days";
            daysSpan.style.color = col;
            daysSpan.textContent = `${tage} Tage`;

            header.appendChild(nameSpan);
            header.appendChild(daysSpan);

            const dateDiv = document.createElement("div");
            dateDiv.className = "trash-date";
            dateDiv.appendChild(document.createTextNode("📅 Termin: "));
            const strongDate = document.createElement("strong");
            strongDate.textContent = dF;
            dateDiv.appendChild(strongDate);

            row.appendChild(header);
            row.appendChild(dateDiv);
            container.appendChild(row);
        }

        if (curTab === 'todo') renderTodoList();
    } catch (e) {
        console.error("Fehler beim Laden des Müll-Syncs:", e);
        container.textContent = "Fehler beim Laden!";
    }
}

    
async function syncTrashToTodos() {
    for (const s of TRASH_CONFIG) {
        try {
            const dDate = await haGetState(s.dateId);
            const rohDatum = dDate.state;

            if (rohDatum && rohDatum !== "unknown" && rohDatum !== "unavailable") {
                let termin = new Date(rohDatum);
                termin.setDate(termin.getDate() - 1); 
                termin.setHours(18, 0, 0, 0);

                const taskName = `🗑️ ${s.name} rausstellen`;
                const exists = todoDb.some(t => t.name === taskName && t.nextDate.startsWith(termin.toISOString().split('T')[0]));

                if (!exists) {
                    const newTrashTodo = {
                        id: Date.now() + Math.random(),
                        name: taskName,
                        room: "Müllabfuhr",
                        assignedTo: "Alle",
                        intervalHours: 0,
                        lastDone: null,
                        nextDate: termin.toISOString()
                    };
                    todoDb.push(newTrashTodo);
                    await saveTodoDb(taskName, "automatisch geplant 🤖"); 
                }
            }
        } catch (e) {
            console.error("Fehler beim Müll-Sync:", e);
        }
    }
    renderTodoList();
}    

function logout() { 
    sessionStorage.clear(); 
    localStorage.removeItem("selectedUser"); 
    location.reload(); 
}

function updateStatus() {  
    if (!user) return;  
    const timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });  
    const statusElem = document.getElementById("statusInfo");  
    if (!statusElem) return;
    
    // Alten Inhalt sicher entfernen
    statusElem.replaceChildren();

    const isPersistent = (user === "Tablet" || (typeof isPersistentUser === 'function' && isPersistentUser(user)));
    let firstLineContent = isPersistent ? `📺 ${user} • ${timeStr}` : `${user} • ${timeStr}`;

    // Hauptzeile mit Benutzernamen sicher als Text einfügen
    const span = document.createElement('span');
    span.className = 'user-name-gradient';
    span.textContent = firstLineContent;
    statusElem.appendChild(span);

    if (!isPersistent) {  
        const diff = Date.now() - lastActivity; 
        const timeLeft = 600000 - diff;  
        if (timeLeft <= 0) {
            logout();
            return;
        }
        const min = Math.floor(timeLeft / 60000); 
        const sec = Math.floor((timeLeft % 60000) / 1000);  

        // Zeilenumbruch und Logout-Timer sicher anhängen
        statusElem.appendChild(document.createElement('br'));

        const logoutSpan = document.createElement('span');
        logoutSpan.style.cssText = "font-size:0.8rem; color:var(--danger); font-weight:bold;";
        logoutSpan.textContent = `Logout: ${min}:${sec < 10 ? '0' : ''}${sec}`;
        statusElem.appendChild(logoutSpan);
    }
}

// ============================================================================
// STARTSEITE  –  Willkommen · heute fällige Aufgaben · Einkaufsliste · Ausgaben des Monats
// ============================================================================
let homeLastFetch = 0;
const homeHtmlCache = {};

// Schreibt nur, wenn sich der Inhalt geändert hat (kein Flackern beim Auffrischen)
function homeSet(id, html) {
    const el = document.getElementById(id);
    if (!el || homeHtmlCache[id] === html) return;
    homeHtmlCache[id] = html;
    el.innerHTML = html;
}

function homeMoney(v) {
    return (parseFloat(v) || 0).toFixed(2) + "€";
}

function renderHomeHeader() {
    const now = new Date();
    const h = now.getHours();
    const part = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Guten Tag" : "Guten Abend";
    const name = (user && user !== "Tablet") ? ", " + user : "";
    const date = now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    const sub = document.getElementById("home-sub");
    if (sub) sub.textContent = `${part}${name} · ${date}`;
}

// Heute fällige (und überfällige) Aufgaben – gleiche Regel wie das Zahlen-Symbol am Tab "Haus"
function renderHomeTodos() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const due = (todoDb || [])
        .filter(t => t && t.nextDate && t.room !== "Müll" && new Date(t.nextDate) <= end)
        .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));

    const MAX = 6;
    let html = "";
    if (!due.length) {
        html = `<div class="home-empty">Heute ist nichts offen 🎉</div>`;
    } else {
        due.slice(0, MAX).forEach(t => {
            const d = new Date(t.nextDate);
            const overdue = d < now;
            const color = overdue ? "var(--danger)" : "#f39c12";
            const timeStr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
            const pill = overdue ? "Überfällig" : (timeStr === "00:00" ? "Heute" : timeStr + " Uhr");
            const sub = [
                t.room ? "🚪 " + escapeHtml(t.room) : "",
                t.assignedTo ? "👤 " + escapeHtml(t.assignedTo) : ""
            ].filter(Boolean).join(" · ");
            html += `<div class="home-row">
                <div class="home-row-main">
                    <strong class="home-row-title">${escapeHtml(t.name)}</strong>
                    ${sub ? `<span class="home-row-sub" style="color:var(--gray);">${sub}</span>` : ""}
                </div>
                <span class="home-pill" style="color:${color}; background:${color}15; border:1px solid ${color}30;">${pill}</span>
                <button type="button" class="home-done" data-home-act="done" data-id="${escapeHtml(String(t.id))}" aria-label="Erledigt">✅</button>
            </div>`;
        });
        if (due.length > MAX) {
            html += `<button type="button" class="home-more" data-home-act="go" data-tab="todo">+ ${due.length - MAX} weitere anzeigen</button>`;
        }
    }
    homeSet("home-todo-list", html);
    const c = document.getElementById("home-todo-count");
    if (c) {
        c.textContent = String(due.length);
        c.classList.toggle("is-zero", due.length === 0);
    }
    if (typeof renderHomeMaint === "function") renderHomeMaint();
}

// Eigene Karte "Wartung" auf der Startseite: fällig oder in der Vorwarnzeit
function renderHomeMaint() {
    const all = maintData().items;
    const mdue = maintDueList();
    const MAX = 6;
    let html = "";
    if (!all.length) {
        html = `<div class="home-empty">Noch keine Wartung angelegt.</div>`;
    } else if (!mdue.length) {
        const nxt = maintItemsSorted()[0];
        const st = nxt ? maintStatus(nxt) : null;
        html = `<div class="home-empty">Nichts fällig – alles in Ordnung ✅${nxt ? `<span class="home-empty-sub">Als Nächstes: ${escapeHtml(nxt.n)} (${escapeHtml(maintInText(st.days))})</span>` : ""}</div>`;
    } else {
        mdue.slice(0, MAX).forEach(it => {
            const st = maintStatus(it);
            const color = st.k === "over" ? "var(--danger)" : "#f39c12";
            const pill = st.days < 0 ? "Überfällig" : (st.days === 0 ? "Heute" : (st.days === 1 ? "Morgen" : "in " + st.days + " T."));
            html += `<div class="home-row home-row-maint">
                <div class="home-row-main">
                    <strong class="home-row-title">🔧 ${escapeHtml(it.n)}</strong>
                    <span class="home-row-sub" style="color:inherit; opacity:0.8;">${escapeHtml(maintEveryText(it.e, it.u))}</span>
                </div>
                <span class="home-pill" style="color:${color}; background:${color}15; border:1px solid ${color}30;">${pill}</span>
                <button type="button" class="home-done" data-home-act="maint-done" data-id="${escapeHtml(it.id)}" aria-label="Wartung erledigt">✅</button>
            </div>`;
        });
        if (mdue.length > MAX) {
            html += `<button type="button" class="home-more" data-home-act="maint-open">+ ${mdue.length - MAX} weitere anzeigen</button>`;
        }
    }
    homeSet("home-maint-list", html);
    const c = document.getElementById("home-maint-count");
    if (c) {
        c.textContent = String(mdue.length);
        c.classList.toggle("is-zero", mdue.length === 0);
    }
}

// Startseite: Karte "Vorrat" – nur was knapp ist oder fehlt
function renderHomeStock() {
    const all = stockData().items;
    const low = stockLowList();
    const MAX = 6;
    let html = "";
    if (!all.length) {
        html = `<div class="home-empty">Noch kein Vorrat angelegt.<span class="home-empty-sub">Tippe unten auf „Zum Vorrat“.</span></div>`;
    } else if (!low.length) {
        html = `<div class="home-empty">Alles da ✅<span class="home-empty-sub">${all.length} Artikel im Vorrat</span></div>`;
    } else {
        low.slice(0, MAX).forEach(it => {
            const st = stockStatus(it);
            const color = st.k === "warn" ? "#f39c12" : "var(--danger)";
            const place = stockPlaceName(it.o);
            const sub = [place ? "📍 " + place : "", it.l ? "🛒 steht auf der Liste" : (st.k === "warn" ? st.text : "")].filter(Boolean).join(" · ");
            const pill = it.q <= 0 ? "Leer" : stockQtyText(it);
            html += `<div class="home-row home-row-stock">
                <div class="home-row-main">
                    <strong class="home-row-title">📦 ${escapeHtml(it.n)}</strong>
                    ${sub ? `<span class="home-row-sub" style="color:inherit; opacity:0.8;">${escapeHtml(sub)}</span>` : ""}
                </div>
                <span class="home-pill" style="color:${color}; background:${color}15; border:1px solid ${color}30;">${escapeHtml(pill)}</span>
                ${stockNeedsList(it) ? `<button type="button" class="home-done" data-home-act="stock-list" data-id="${escapeHtml(it.id)}" aria-label="Auf die Einkaufsliste setzen">🛒</button>` : ""}
            </div>`;
        });
        if (low.length > MAX) {
            html += `<button type="button" class="home-more" data-home-act="stock-open">+ ${low.length - MAX} weitere anzeigen</button>`;
        }
    }
    homeSet("home-stock-list", html);
    const c = document.getElementById("home-stock-count");
    if (c) {
        c.textContent = String(low.length);
        c.classList.toggle("is-zero", low.length === 0);
    }
}

// Einkaufsliste: nach Geschäft gruppiert
async function renderHomeShop() {
    let items = [];
    try {
        const cfg = SYNC_CONFIG.shopping;
        const d = await haGetState(cfg.entity);
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const raw = d.attributes[cfg.attr];
            items = (typeof raw === "string") ? JSON.parse(raw) : raw;
        }
    } catch (e) {
        homeSet("home-shop-list", `<div class="home-empty">Einkaufsliste konnte nicht geladen werden ⚠️</div>`);
        return;
    }
    if (!Array.isArray(items)) items = [];

    const groups = new Map();
    items.slice().reverse().forEach(o => {
        const parts = String(o).split(" @");
        const name = parts[0];
        const store = parts.slice(1).join(" @") || "Sonstiges";
        if (!groups.has(store)) groups.set(store, []);
        groups.get(store).push(name);
    });

    const MAX_CHIPS = 5;
    let html = "";
    if (!items.length) {
        html = `<div class="home-empty">Nichts auf der Liste – alles da ✅</div>`;
    } else {
        [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([store, names]) => {
            const chips = names.slice(0, MAX_CHIPS).map(n => `<span class="home-chip">${escapeHtml(n)}</span>`).join("");
            const more = names.length > MAX_CHIPS ? `<span class="home-chip home-chip-more">+${names.length - MAX_CHIPS}</span>` : "";
            html += `<button type="button" class="home-store" data-home-act="store" data-store="${escapeHtml(store)}">
                <span class="home-store-head"><strong>${escapeHtml(store)}</strong><span class="home-count">${names.length}</span></span>
                <span class="home-chips">${chips}${more}</span>
            </button>`;
        });
    }
    homeSet("home-shop-list", html);
    const c = document.getElementById("home-shop-count");
    if (c) {
        c.textContent = String(items.length);
        c.classList.toggle("is-zero", items.length === 0);
    }
}

// Farbiges Schild für Plus / Minus (Farben stehen in home.css)
function homePill(v) {
    const n = Math.round(((parseFloat(v) || 0) + Number.EPSILON) * 100) / 100;
    const cls = n < 0 ? "is-minus" : (n > 0 ? "is-plus" : "is-zero");
    return `<span class="fin-pill ${cls}">${n > 0 ? "+" : ""}${n.toFixed(2)}€</span>`;
}

// Ausgaben des aktuellen Monats (aus der Finanz-Datenbank).
// Zusätzlich (nur wenn in den Finanzen eingeschaltet, getrennt): "Übrig" des Monats und "Gespart" des aktuellen Jahres.
async function renderHomeMoney() {
    const now = new Date();
    const monthNames = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
    const label = now.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    const title = document.getElementById("home-money-title");
    if (title) title.textContent = `💰 Ausgaben ${label}`;

    if (typeof fetchHA !== "function" || typeof parseFinanceRoot !== "function") return;

    let m = null, root = null;
    try {
        const s = await fetchHA("sensor.haushalt_finance_db");
        root = parseFinanceRoot(s);
        m = (root.months || []).find(x =>
            x && x.month_name &&
            x.month_name.toLowerCase().includes(monthNames[now.getMonth()]) &&
            String(extractYearFromMonth(x)) === String(now.getFullYear())
        ) || null;
    } catch (e) {
        homeSet("home-money-body", `<div class="home-empty">Finanzen konnten nicht geladen werden ⚠️</div>`);
        return;
    }

    const sum = arr => (arr || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
    // Jeder Benutzer schaltet das in den Finanzen für sich ein (mit seinem Passwort)
    const who = (typeof user !== "undefined" && user) ? String(user) : (localStorage.getItem("selectedUser") || "");
    const opts = (typeof financeHomeOpts === "function") ? financeHomeOpts(root, who) : {};

    // Gespart: nur das aktuelle Jahr (Monate ohne Einkommen zählen 0)
    let savedRow = "";
    if (opts.saved && typeof finYearStats === "function") {
        const months = (root.months || []).filter(x => x && String(extractYearFromMonth(x)) === String(now.getFullYear()));
        savedRow = `<div class="home-money-row home-money-saved"><span>Gespart ${now.getFullYear()}</span><b>${homePill(finYearStats(months).saved)}</b></div>`;
    }

    if (!m) {
        homeSet("home-money-body", `<div class="home-empty">Für ${escapeHtml(label)} gibt es noch keinen Monat in den Finanzen.</div>${savedRow}`);
        return;
    }

    const fix = sum(m.fixum);
    const spend = sum(m.spendings);
    const latest = (m.spendings || []).slice(-4).reverse();

    let html = `
        <div class="home-money-row"><span>Fixkosten</span><b>${homeMoney(fix)}</b></div>
        <div class="home-money-row"><span>Ausgaben</span><b>${homeMoney(spend)}</b></div>
        <div class="home-money-total"><span>Gesamt</span><b>${homeMoney(fix + spend)}</b></div>`;
    // Einkommen eingetragen und eingeschaltet → zeigen, wie viel in diesem Monat übrig ist
    if (opts.left && Array.isArray(m.income) && m.income.length) {
        html += `<div class="home-money-row home-money-left"><span>Übrig</span><b>${homePill(sum(m.income) - fix - spend)}</b></div>`;
    }
    html += savedRow;
    if (latest.length) {
        html += `<div class="home-money-last-title">Zuletzt</div>`;
        latest.forEach(i => {
            html += `<div class="home-money-row home-money-last"><span>${escapeHtml(i.name)}</span><span>${homeMoney(i.amount)}</span></div>`;
        });
    }
    homeSet("home-money-body", html);
}

// Essensplan der aktuellen Woche (Mo–So), heute hervorgehoben
async function renderHomeFood() {
    const dayNames = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
    const dayIcons = ["🥣", "🥗", "🍲", "🍝", "🍕", "🍔", "🍗"];
    const todayIdx = (new Date().getDay() + 6) % 7;

    let weeks = [];
    try {
        const states = await Promise.all(FOOD_ENTITIES.slice(0, 7).map(e => haGetState(e)));
        weeks = states.map((d, i) => {
            const raw = (d && typeof d.state === "string" && d.state !== "unknown" && d.state !== "---") ? d.state : "";
            return parseFoodWeekStr(raw.split("~")[0] || "", i === 6);
        });
    } catch (e) {
        homeSet("home-food-list", `<div class="home-empty">Wochenplan konnte nicht geladen werden ⚠️</div>`);
        return;
    }

    const hasAny = weeks.some(w => w.bf || w.lunch || w.dn || w.out);
    if (!hasAny) {
        homeSet("home-food-list", `<div class="home-empty">Diese Woche ist noch nichts geplant 🍽️</div>`);
        return;
    }

    let html = "";
    weeks.forEach((w, i) => {
        const meals = [["Frühstück", w.bf], ["Mittag", w.lunch], ["Abend", w.dn]]
            .filter(m => m[1])
            .map(m => `<span class="home-meal"><em>${m[0]}</em> ${escapeHtml(m[1])}</span>`);
        if (w.out) meals.push(`<span class="home-meal"><em>Auswärts</em> ${escapeHtml(w.out)}${w.outCook ? " (" + escapeHtml(w.outCook) + ")" : ""}</span>`);
        const body = meals.length ? meals.join("") : `<span class="home-meal home-meal-empty" style="color:var(--gray);">Noch nichts geplant</span>`;
        const cls = "home-day" + (i === todayIdx ? " is-today" : "") + (i < todayIdx ? " is-past" : "");
        html += `<div class="${cls}">
            <div class="home-day-label"><span>${dayIcons[i]}</span>${dayNames[i]}</div>
            <div class="home-day-main">${body}</div>
            ${w.cook ? `<span class="home-cook">👨‍🍳 ${escapeHtml(w.cook)}</span>` : ""}
        </div>`;
    });
    homeSet("home-food-list", html);
}

// Aufgaben sofort, Essen/Einkauf/Finanzen höchstens alle 10 Sekunden (oder mit force)
async function loadHome(force) {
    renderHomeHeader();
    renderHomeTodos();
    renderHomeStock();
    const nowMs = Date.now();
    if (!force && nowMs - homeLastFetch < 10000) return;
    homeLastFetch = nowMs;
    await Promise.all([renderHomeFood(), renderHomeShop(), renderHomeMoney(), renderHomeCalendar()]);
}

// ========================================================
// --- 📅 KALENDER (Startseite: aktuelle Woche · Tippen öffnet den Monat) ---
// Die Termine kommen aus den Home-Assistant-Kalendern, die in der Integration gewählt wurden
// (auch mehrere, z. B. einer pro Person – jeder bekommt eine eigene Farbe).
// Ein- und ausschalten: Integration → Optionen oder App-Einstellungen (hhFeature("calendar")).
// ========================================================
const CAL_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const CAL_WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CAL_WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const CAL_MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const CAL_TTL = 90 * 1000;          // so lange gilt ein geladener Zeitraum, bevor neu gefragt wird
const CAL_PENDING_MS = 90 * 1000;   // frisch angelegte/gelöschte Termine sofort zeigen, auch wenn der Kalender kurz braucht
const calS = {
    cache: new Map(),     // "von|bis" -> { t, events, failed, ok }
    month: null,          // { y, m }  (m = 0..11)
    sel: "",              // gewählter Tag (YYYY-MM-DD)
    events: [],           // zuletzt gezeigte Termine im Monatsfenster
    hidden: new Set(),    // ausgeblendete Kalender (pro Gerät gemerkt)
    pend: [],             // { t, kind: "add" | "del", ev }
    seq: 0,               // verwirft veraltete Antworten beim schnellen Blättern
    homeSeq: 0,
    saving: false,
    allDay: false,
    status: ""
};
try { (JSON.parse(localStorage.getItem("hh_cal_hidden") || "[]") || []).forEach(x => calS.hidden.add(String(x))); } catch (e) { /* egal */ }

// ---- Datum ----
function calPad(n) { return String(n).padStart(2, "0"); }
function calIso(d) { return `${d.getFullYear()}-${calPad(d.getMonth() + 1)}-${calPad(d.getDate())}`; }
function calFromIso(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function calDay0(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function calAddDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function calMonday(d) { const x = calDay0(d); return calAddDays(x, -((x.getDay() + 6) % 7)); }
function calFmtTime(d) { return `${calPad(d.getHours())}:${calPad(d.getMinutes())}`; }
function calShortDate(d) { return `${d.getDate()}.${d.getMonth() + 1}.`; }
function calLongDate(d) { return `${CAL_WD_LONG[d.getDay()]}, ${d.getDate()}. ${CAL_MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function calMk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

// ---- Kalender (Farben, Namen) ----
function calInfo(id) { return hhCalendars.find(c => c.entity_id === id) || null; }
function calColor(id) {
    const i = hhCalendars.findIndex(c => c.entity_id === id);
    return CAL_COLORS[(i < 0 ? 0 : i) % CAL_COLORS.length];
}
function calNameOf(ev) { const c = calInfo(ev.cal); return (c && c.name) || ev.calName || ev.cal; }

// ---- Termine ----
// Rohdaten vom Server -> Termin mit Beginn/Ende als Datum und den Kalendertagen, die er berührt (first..last)
function calNormEvent(ev) {
    if (!ev || !ev.start) return null;
    const allDay = !!ev.allDay;
    let start, end;
    if (allDay) {
        start = calFromIso(ev.start);
        end = calFromIso(ev.end) || (start ? calAddDays(start, 1) : null);
    } else {
        start = new Date(ev.start);
        end = ev.end ? new Date(ev.end) : null;
        if (isNaN(start)) start = null;
        if (end && isNaN(end)) end = null;
        if (start && !end) end = start;
    }
    if (!start || !end) return null;
    const first = calDay0(start);
    let last;
    if (allDay) last = calAddDays(end, -1);                                              // Ende ist der Tag danach
    else if (end > start && end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0) last = calAddDays(calDay0(end), -1);   // endet um 00:00
    else last = calDay0(end);
    if (last < first) last = first;
    return {
        cal: String(ev.cal || ""), calName: String(ev.calName || ""),
        title: String(ev.summary || "").trim() || "(ohne Titel)", rawTitle: String(ev.summary || ""),
        allDay, start, end, first, last,
        rawStart: String(ev.start), location: String(ev.location || ""), description: String(ev.description || "")
    };
}
// Frisch angelegte Termine sofort zeigen und gelöschte sofort ausblenden (einige Kalender brauchen einen Moment)
function calOverlay(events) {
    const now = Date.now();
    calS.pend = calS.pend.filter(p => now - p.t < CAL_PENDING_MS);
    let out = events.slice();
    calS.pend.forEach(p => {
        const same = x => x.cal === p.ev.cal && x.rawTitle === p.ev.rawTitle && x.allDay === p.ev.allDay && x.start.getTime() === p.ev.start.getTime();
        if (p.kind === "add") { if (!out.some(same)) out.push(p.ev); }
        else out = out.filter(x => !same(x));
    });
    return out;
}
function calEventsOn(events, day) {
    const t = day.getTime();
    return calOverlay(events)
        .filter(e => !calS.hidden.has(e.cal) && e.first.getTime() <= t && e.last.getTime() >= t)
        .sort((a, b) => (a.allDay === b.allDay)
            ? ((a.start - b.start) || a.title.localeCompare(b.title, "de", { sensitivity: "base" }))
            : (a.allDay ? -1 : 1));
}
function calTimeText(e, day) {
    if (e.allDay) return "Ganztägig";
    const startsHere = e.first.getTime() === day.getTime();
    const endsHere = e.last.getTime() === day.getTime();
    if (startsHere && endsHere) return e.end > e.start ? `${calFmtTime(e.start)}–${calFmtTime(e.end)} Uhr` : `${calFmtTime(e.start)} Uhr`;
    if (startsHere) return `ab ${calFmtTime(e.start)} Uhr`;
    if (endsHere) return `bis ${calFmtTime(e.end)} Uhr`;
    return "Ganztägig";
}
function calRangeText(e) {
    return e.first.getTime() === e.last.getTime() ? "" : `${calShortDate(e.first)} – ${calShortDate(e.last)}`;
}

// ---- Laden ----
async function calLoad(from, to, force) {
    const key = calIso(from) + "|" + calIso(to);
    const hit = calS.cache.get(key);
    if (!force && hit && Date.now() - hit.t < CAL_TTL) return hit;
    const res = { t: Date.now(), events: [], failed: [], ok: false };
    try {
        const url = `${getBaseUrl()}/api/haushaltshilfe/calendar?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`;
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
            const d = await r.json();
            if (Array.isArray(d.calendars)) { hhCalendars = d.calendars; hhCalendarWrite = String(d.calendar_write || ""); }
            if (d.enabled === false && hhFeature("calendar")) {          // in Home Assistant ausgeschaltet
                hhSetFeatures(hhFeatures.filter(k => k !== "calendar"));
                applyFeaturesToDOM();
            }
            res.events = (Array.isArray(d.events) ? d.events : []).map(calNormEvent).filter(Boolean);
            res.failed = Array.isArray(d.failed) ? d.failed.map(String) : [];
            res.ok = true;
        }
    } catch (e) { console.warn("Kalender nicht erreichbar:", e); }
    if (res.ok) { calS.cache.set(key, res); return res; }
    return hit || res;                                                   // alter Stand ist besser als nichts
}
function calInvalidate() { calS.cache.clear(); }

// ---- Startseite: aktuelle Woche ----
async function renderHomeCalendar() {
    const body = document.getElementById("home-cal-body");
    if (!body || !hhFeature("calendar") || !hhCredLoaded) return;
    const mine = ++calS.homeSeq;
    const today = calDay0(new Date());
    const mon = calMonday(today);
    if (!hhCalendars.length) {
        homeSet("home-cal-body", `<div class="home-empty">Noch kein Kalender gewählt.<span class="home-empty-sub">Wähle ihn in Home Assistant unter Einstellungen → Geräte &amp; Dienste → Haushaltshilfe Pro → Konfigurieren.</span></div>`);
        const c0 = document.getElementById("home-cal-count");
        if (c0) { c0.textContent = "0"; c0.classList.add("is-zero"); }
        return;
    }
    const res = await calLoad(mon, calAddDays(mon, 7));
    if (mine !== calS.homeSeq || !hhFeature("calendar")) return;

    let strip = `<div class="cal-week" role="group" aria-label="Aktuelle Woche">`;
    const rows = [];
    let total = 0;
    for (let i = 0; i < 7; i++) {
        const d = calAddDays(mon, i);
        const evs = calEventsOn(res.events, d);
        total += evs.length;
        const cls = "cal-wday" + (d.getTime() === today.getTime() ? " is-today" : "") + (d < today ? " is-past" : "") + (evs.length ? " has-ev" : "");
        let dots = evs.slice(0, 3).map(e => `<i class="cal-dot" style="background:${calColor(e.cal)}"></i>`).join("");
        if (evs.length > 3) dots += `<small class="cal-more">+${evs.length - 3}</small>`;
        const label = `${CAL_WD_LONG[d.getDay()]}, ${d.getDate()}. ${CAL_MONTHS[d.getMonth()]}${evs.length ? ": " + evs.length + (evs.length === 1 ? " Termin" : " Termine") : ""}`;
        strip += `<button type="button" class="${cls}" data-home-act="cal-open" data-day="${calIso(d)}" aria-label="${escapeHtml(label)}">
            <span class="cal-wd">${CAL_WD_SHORT[i]}</span><span class="cal-wn">${d.getDate()}</span><span class="cal-wdots">${dots}</span></button>`;
        evs.forEach(e => rows.push({ d, e }));
    }
    strip += `</div>`;

    const MAX = 6;
    let list = rows;
    if (list.length > MAX) list = list.filter(r => r.d >= today);       // bei vielen Terminen zuerst das, was noch kommt
    const shown = list.slice(0, MAX);
    let html = strip;
    if (!rows.length) {
        html += `<div class="home-empty">Diese Woche ist nichts eingetragen.<span class="home-empty-sub">Tippe auf einen Tag, um einen Termin anzulegen.</span></div>`;
    } else {
        shown.forEach(({ d, e }) => {
            const isPast = d < today;
            const dayTxt = d.getTime() === today.getTime() ? "Heute" : (d.getTime() === calAddDays(today, 1).getTime() ? "Morgen" : `${CAL_WD_SHORT[(d.getDay() + 6) % 7]} ${calShortDate(d)}`);
            const sub = [calTimeText(e, d), e.location ? "📍 " + e.location : "", hhCalendars.length > 1 ? calNameOf(e) : ""].filter(Boolean).join(" · ");
            html += `<button type="button" class="cal-row${isPast ? " is-past" : ""}" style="border-left-color:${calColor(e.cal)}" data-home-act="cal-open" data-day="${calIso(d)}">
                <span class="cal-row-day">${escapeHtml(dayTxt)}</span>
                <span class="cal-row-main"><strong class="home-row-title">${escapeHtml(e.title)}</strong><span class="home-row-sub">${escapeHtml(sub)}</span></span>
            </button>`;
        });
        if (list.length > MAX) html += `<button type="button" class="home-more" data-home-act="cal-open" data-day="${calIso(today)}">+ ${list.length - MAX} weitere anzeigen</button>`;
    }
    if (!res.ok) html += `<div class="home-empty home-empty-sub">⚠️ Kalender gerade nicht erreichbar</div>`;
    else if (res.failed.length) html += `<div class="home-empty home-empty-sub">⚠️ ${escapeHtml(res.failed.map(id => (calInfo(id) || { name: id }).name).join(", "))}: nicht lesbar</div>`;
    homeSet("home-cal-body", html);
    const c = document.getElementById("home-cal-count");
    if (c) { c.textContent = String(total); c.classList.toggle("is-zero", total === 0); }
}

// ---- Monatsfenster ----
function calGridStart() { return calMonday(new Date(calS.month.y, calS.month.m, 1)); }
function calOpen(dayIso) {
    if (!hhFeature("calendar")) return;
    const d = calFromIso(dayIso) || calDay0(new Date());
    calS.month = { y: d.getFullYear(), m: d.getMonth() };
    calS.sel = calIso(d);
    const m = document.getElementById("calModal");
    if (m) m.style.display = "flex";
    calSwipeInit();
    calRenderModal();
}
function calClose() {
    const m = document.getElementById("calModal");
    if (m) m.style.display = "none";
    calS.seq++;
}
function calCloseAll() {
    calClose();
    const f = document.getElementById("calFormModal");
    if (f) f.style.display = "none";
}
function calMonthIsToday(y, m) { const t = new Date(); return t.getFullYear() === y && t.getMonth() === m; }
function calShift(n) {
    if (!calS.month) return;
    const d = new Date(calS.month.y, calS.month.m + n, 1);
    calS.month = { y: d.getFullYear(), m: d.getMonth() };
    const sel = calFromIso(calS.sel);
    if (!sel || sel.getFullYear() !== d.getFullYear() || sel.getMonth() !== d.getMonth()) {
        calS.sel = calMonthIsToday(d.getFullYear(), d.getMonth()) ? calIso(new Date()) : calIso(d);
    }
    calRenderModal();
}
function calToday() {
    const t = new Date();
    calS.month = { y: t.getFullYear(), m: t.getMonth() };
    calS.sel = calIso(t);
    calRenderModal();
}
function calSelect(iso) {
    const d = calFromIso(iso);
    if (!d) return;
    calS.sel = iso;
    if (d.getFullYear() !== calS.month.y || d.getMonth() !== calS.month.m) {   // Tag aus dem Nachbarmonat: dorthin blättern
        calS.month = { y: d.getFullYear(), m: d.getMonth() };
        calRenderModal();
        return;
    }
    document.querySelectorAll("#calGrid .cal-cell").forEach(c => c.classList.toggle("is-sel", c.dataset.day === iso));
    calPaintDetail();
}
function calToggleCal(id) {
    if (calS.hidden.has(id)) calS.hidden.delete(id); else calS.hidden.add(id);
    try { localStorage.setItem("hh_cal_hidden", JSON.stringify(Array.from(calS.hidden))); } catch (e) { /* egal */ }
    calPaintModal();
    renderHomeCalendar();
}
async function calRenderModal(force) {
    const mine = ++calS.seq;
    const from = calGridStart(), to = calAddDays(from, 42);
    const hit = calS.cache.get(calIso(from) + "|" + calIso(to));
    calS.status = hit ? "" : "⏳ Termine werden geladen …";
    calS.events = hit ? hit.events : [];
    calPaintModal();
    if (hit && !force && Date.now() - hit.t < CAL_TTL) return;
    const res = await calLoad(from, to, force);
    if (mine !== calS.seq) return;
    calS.events = res.events;
    if (!res.ok) calS.status = "⚠️ Kalender gerade nicht erreichbar";
    else if (res.failed.length) calS.status = "⚠️ Nicht lesbar: " + res.failed.map(id => (calInfo(id) || { name: id }).name).join(", ");
    else calS.status = "";
    calPaintModal();
}
function calPaintModal() {
    const { y, m } = calS.month;
    const title = document.getElementById("calTitle");
    if (title) title.textContent = `${CAL_MONTHS[m]} ${y}`;

    // Legende: ein Kalender pro Person – antippen blendet ihn ein/aus
    const legend = document.getElementById("calLegend");
    if (legend) {
        legend.replaceChildren();
        if (hhCalendars.length > 1) {
            hhCalendars.forEach(c => {
                const on = !calS.hidden.has(c.entity_id);
                const b = calMk("button", "hh-tab cal-chip" + (on ? " is-on" : ""));
                b.type = "button";
                b.setAttribute("aria-pressed", on ? "true" : "false");
                b.title = on ? "Antippen: diesen Kalender ausblenden" : "Antippen: diesen Kalender einblenden";
                const dot = calMk("i", "cal-dot");
                dot.style.background = calColor(c.entity_id);
                b.append(dot, calMk("span", "", c.name));
                b.onclick = () => calToggleCal(c.entity_id);
                legend.appendChild(b);
            });
            legend.style.display = "";
        } else legend.style.display = "none";
    }
    const st = document.getElementById("calStatus");
    if (st) { st.textContent = calS.status; st.style.display = calS.status ? "" : "none"; }

    const grid = document.getElementById("calGrid");
    if (grid) {
        grid.replaceChildren();
        const today = calDay0(new Date());
        const start = calGridStart();
        for (let i = 0; i < 42; i++) {
            const d = calAddDays(start, i);
            const iso = calIso(d);
            const evs = calEventsOn(calS.events, d);
            const b = calMk("button", "cal-cell" + (d.getMonth() !== m ? " is-out" : "") + (d.getTime() === today.getTime() ? " is-today" : "") + (iso === calS.sel ? " is-sel" : "") + (evs.length ? " has-ev" : ""));
            b.type = "button";
            b.dataset.day = iso;
            b.setAttribute("aria-label", `${calLongDate(d)}${evs.length ? ", " + evs.length + (evs.length === 1 ? " Termin" : " Termine") : ""}`);
            b.appendChild(calMk("span", "cal-num", String(d.getDate())));
            const dots = calMk("span", "cal-dots");
            evs.slice(0, 3).forEach(e => { const dot = calMk("i", "cal-dot"); dot.style.background = calColor(e.cal); dots.appendChild(dot); });
            if (evs.length > 3) dots.appendChild(calMk("small", "cal-more", "+" + (evs.length - 3)));
            b.appendChild(dots);
            const titles = calMk("span", "cal-titles");     // nur auf breiten Bildschirmen sichtbar
            evs.slice(0, 2).forEach(e => {
                const t = calMk("span", "cal-t", (e.allDay ? "" : calFmtTime(e.start) + " ") + e.title);
                t.style.borderLeftColor = calColor(e.cal);
                titles.appendChild(t);
            });
            if (evs.length > 2) titles.appendChild(calMk("span", "cal-t cal-t-more", `+${evs.length - 2} weitere`));
            b.appendChild(titles);
            b.onclick = () => calSelect(iso);
            grid.appendChild(b);
        }
    }
    calPaintDetail();
}
function calPaintDetail() {
    const d = calFromIso(calS.sel) || calDay0(new Date());
    const t = document.getElementById("calDayTitle");
    if (t) t.textContent = calLongDate(d);
    const canAdd = hhCalendars.some(c => c.can_create);
    const add = document.getElementById("calAddBtn");
    if (add) add.style.display = canAdd ? "" : "none";
    const list = document.getElementById("calDayList");
    if (!list) return;
    list.replaceChildren();
    if (!hhCalendars.length) {
        list.appendChild(calMk("div", "ing-empty", "Noch kein Kalender gewählt. Wähle ihn in Home Assistant unter Einstellungen → Geräte & Dienste → Haushaltshilfe Pro → Konfigurieren."));
        return;
    }
    const evs = calEventsOn(calS.events, d);
    if (!evs.length) list.appendChild(calMk("div", "ing-empty", canAdd ? "Keine Termine an diesem Tag. Mit „＋ Termin“ legst du einen an." : "Keine Termine an diesem Tag."));
    evs.forEach(e => list.appendChild(calEventRow(e, d)));
    if (!canAdd) list.appendChild(calMk("div", "ing-sub cal-readonly", "Die gewählten Kalender erlauben keine neuen Termine (nur lesen)."));
}
function calEventRow(e, day) {
    const row = calMk("div", "cal-ev");
    row.style.borderLeftColor = calColor(e.cal);
    const main = calMk("div", "cal-ev-main");
    main.appendChild(calMk("div", "cal-ev-title", e.title));
    const sub = [calTimeText(e, day), calRangeText(e), e.location ? "📍 " + e.location : "", hhCalendars.length > 1 ? "👤 " + calNameOf(e) : ""].filter(Boolean).join(" · ");
    main.appendChild(calMk("div", "cal-ev-sub", sub));
    if (e.description) main.appendChild(calMk("div", "cal-ev-note", e.description));
    row.appendChild(main);
    const info = calInfo(e.cal);
    if (info && info.can_delete) {
        const del = calMk("button", "hh-round cal-ev-del", "🗑️");
        del.type = "button";
        del.title = "Termin löschen";
        del.setAttribute("aria-label", "Termin löschen");
        del.onclick = () => calDeleteEvent(e);
        row.appendChild(del);
    }
    return row;
}

// Wischen nach links/rechts blättert den Monat (Handy/Tablet)
function calSwipeInit() {
    const el = document.getElementById("calBody");
    if (!el || el.dataset.swipe) return;
    el.dataset.swipe = "1";
    let sx = 0, sy = 0, t0 = 0, on = false;
    el.addEventListener("touchstart", e => {
        const g = e.target.closest ? e.target.closest("#calGrid, .cal-wdhead") : null;
        if (!g || e.touches.length !== 1) { on = false; return; }
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now(); on = true;
    }, { passive: true });
    el.addEventListener("touchend", e => {
        if (!on) return;
        on = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Date.now() - t0 < 800 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.6) calShift(dx < 0 ? 1 : -1);
    }, { passive: true });
}
document.addEventListener("keydown", e => {
    const m = document.getElementById("calModal");
    if (!m || m.style.display === "none" || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    const f = document.getElementById("calFormModal");
    if (f && f.style.display !== "none") return;
    if (e.key === "ArrowLeft") { e.preventDefault(); calShift(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); calShift(1); }
});

// ---- Neuer Termin ----
function calNew(dayIso) {
    const writable = hhCalendars.filter(c => c.can_create);
    if (!writable.length) { if (typeof ingToast === "function") ingToast("Die gewählten Kalender erlauben keine neuen Termine"); return; }
    const d = calFromIso(typeof dayIso === "string" ? dayIso : calS.sel) || calDay0(new Date());
    const sel = document.getElementById("cfCal");
    sel.textContent = "";
    writable.forEach(c => { const o = document.createElement("option"); o.value = c.entity_id; o.textContent = c.name; sel.appendChild(o); });
    let pref = "";
    try { pref = localStorage.getItem("hh_cal_last") || ""; } catch (e) { /* egal */ }
    if (!writable.some(c => c.entity_id === pref)) pref = writable.some(c => c.entity_id === hhCalendarWrite) ? hhCalendarWrite : writable[0].entity_id;
    sel.value = pref;
    document.getElementById("cfCalRow").style.display = writable.length > 1 ? "" : "none";
    document.getElementById("cfTitle").value = "";
    document.getElementById("cfDate").value = calIso(d);
    document.getElementById("cfUntil").value = "";
    document.getElementById("cfLoc").value = "";
    document.getElementById("cfNote").value = "";
    const now = new Date();
    let h = (calIso(d) === calIso(now) && now.getHours() >= 6 && now.getHours() < 21) ? now.getHours() + 1 : 9;
    document.getElementById("cfFrom").value = `${calPad(h)}:00`;
    document.getElementById("cfTo").value = `${calPad(Math.min(h + 1, 23))}:00`;
    calFormMode(false);
    const m = document.getElementById("calFormModal");
    if (m) m.style.display = "flex";
    setTimeout(() => { const t = document.getElementById("cfTitle"); if (t) t.focus(); }, 60);
}
function calFormMode(allDay) {
    calS.allDay = !!allDay;
    document.getElementById("cfTimeRow").style.display = allDay ? "none" : "";
    document.getElementById("cfUntilRow").style.display = allDay ? "" : "none";
    [["cfTabTime", !allDay], ["cfTabDay", allDay]].forEach(([id, on]) => {
        const b = document.getElementById(id);
        if (b) { b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }
    });
}
// Beginn ändern: das Ende wandert mit (gleiche Dauer)
function calFormFromChanged() {
    const f = document.getElementById("cfFrom").value, t = document.getElementById("cfTo").value;
    const a = /^(\d{2}):(\d{2})$/.exec(f);
    if (!a) return;
    const prev = calS.fromPrev || f;
    calS.fromPrev = f;
    const p = /^(\d{2}):(\d{2})$/.exec(prev), b = /^(\d{2}):(\d{2})$/.exec(t);
    let dur = 60;
    if (p && b) { const d0 = (+b[1] * 60 + +b[2]) - (+p[1] * 60 + +p[2]); if (d0 > 0) dur = d0; }
    const end = Math.min(23 * 60 + 59, +a[1] * 60 + +a[2] + dur);
    document.getElementById("cfTo").value = `${calPad(Math.floor(end / 60))}:${calPad(end % 60)}`;
}
function calFormClose() {
    const m = document.getElementById("calFormModal");
    if (m) m.style.display = "none";
}
function calToast(msg) { if (typeof ingToast === "function") ingToast(msg); }
async function calFormSave() {
    if (calS.saving) return;
    const title = document.getElementById("cfTitle").value.trim();
    if (!title) { calToast("Bitte einen Titel eingeben ✏️"); document.getElementById("cfTitle").focus(); return; }
    const date = document.getElementById("cfDate").value;
    if (!calFromIso(date)) { calToast("Bitte ein Datum wählen 📅"); return; }
    const cal = document.getElementById("cfCal").value;
    const payload = { action: "create", calendar: cal, summary: title, allDay: calS.allDay };
    let ev;
    if (calS.allDay) {
        const until = document.getElementById("cfUntil").value;
        if (until && until < date) { calToast("Das Ende liegt vor dem Beginn"); return; }
        payload.start = date;
        if (until) payload.end = until;
        ev = { start: date, end: calIso(calAddDays(calFromIso(until || date), 1)), allDay: true };
    } else {
        const f = document.getElementById("cfFrom").value, t = document.getElementById("cfTo").value;
        if (!/^\d{2}:\d{2}$/.test(f)) { calToast("Bitte eine Uhrzeit wählen 🕒"); return; }
        const s = new Date(`${date}T${f}`);
        const e = /^\d{2}:\d{2}$/.test(t) ? new Date(`${date}T${t}`) : new Date(s.getTime() + 3600000);
        if (isNaN(s) || isNaN(e) || e <= s) { calToast("Das Ende muss nach dem Beginn liegen"); return; }
        payload.start = s.toISOString();
        payload.end = e.toISOString();
        ev = { start: payload.start, end: payload.end, allDay: false };
    }
    const loc = document.getElementById("cfLoc").value.trim();
    const note = document.getElementById("cfNote").value.trim();
    if (loc) payload.location = loc;
    if (note) payload.description = note;
    calS.saving = true;
    const btn = document.getElementById("cfSave");
    if (btn) btn.disabled = true;
    try {
        const r = await fetch(`${getBaseUrl()}/api/haushaltshilfe/calendar`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        let d = {};
        try { d = await r.json(); } catch (e2) { /* egal */ }
        if (r.ok && d.success) {
            try { localStorage.setItem("hh_cal_last", cal); } catch (e3) { /* egal */ }
            const norm = calNormEvent(Object.assign({ cal, calName: (calInfo(cal) || {}).name || "", summary: title, location: loc, description: note }, ev));
            if (norm) calS.pend.push({ t: Date.now(), kind: "add", ev: norm });
            calFormClose();
            calInvalidate();
            calToast(`📅 „${title}“ ist eingetragen`);
            const m = document.getElementById("calModal");
            if (m && m.style.display !== "none") {
                const dd = calFromIso(date);
                if (dd) { calS.sel = date; calS.month = { y: dd.getFullYear(), m: dd.getMonth() }; }
                calRenderModal(true);
            }
            renderHomeCalendar();
            setTimeout(() => { calInvalidate(); const mm = document.getElementById("calModal"); if (mm && mm.style.display !== "none") calRenderModal(true); renderHomeCalendar(); }, 3000);
        } else {
            await showAlert(d.message || `Der Termin konnte nicht gespeichert werden (Status ${r.status}).`, "Termin nicht gespeichert ⚠️");
        }
    } catch (err) {
        console.error("❌ Termin speichern:", err);
        await showAlert("Home Assistant ist gerade nicht erreichbar.", "Termin nicht gespeichert ⚠️");
    } finally {
        calS.saving = false;
        if (btn) btn.disabled = false;
    }
}
async function calDeleteEvent(e) {
    const ok = await showDeleteModal(`Möchtest du „${e.title}“ wirklich löschen?`, "Termin löschen 🗑️");
    if (!ok) return;
    try {
        const r = await fetch(`${getBaseUrl()}/api/haushaltshilfe/calendar`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", calendar: e.cal, summary: e.rawTitle, allDay: e.allDay, start: e.allDay ? e.rawStart : e.start.toISOString() })
        });
        let d = {};
        try { d = await r.json(); } catch (e2) { /* egal */ }
        if (r.ok && d.success) {
            calS.pend.push({ t: Date.now(), kind: "del", ev: e });
            calInvalidate();
            calToast("🗑️ Termin gelöscht");
            const m = document.getElementById("calModal");
            if (m && m.style.display !== "none") calRenderModal(true);
            renderHomeCalendar();
        } else {
            await showAlert(d.message || `Der Termin konnte nicht gelöscht werden (Status ${r.status}).`, "Termin nicht gelöscht ⚠️");
        }
    } catch (err) {
        console.error("❌ Termin löschen:", err);
        await showAlert("Home Assistant ist gerade nicht erreichbar.", "Termin nicht gelöscht ⚠️");
    }
}

// Klicks auf der Startseite (Erledigt, Geschäft öffnen, Bereich öffnen)
document.addEventListener("click", async (e) => {
    const el = e.target.closest ? e.target.closest("[data-home-act]") : null;
    if (!el) return;
    const act = el.getAttribute("data-home-act");
    if (act === "go") {
        tab(el.getAttribute("data-tab"));
    } else if (act === "store") {
        activeStore = el.getAttribute("data-store");
        tab("shop");
    } else if (act === "done") {
        el.disabled = true;
        try {
            await completeTodo(el.getAttribute("data-id"));
        } finally {
            el.disabled = false;   // bei Abbruch ("Wer hat es gemacht?") wieder bedienbar
        }
        renderHomeTodos();
        updateAppBadges();
    } else if (act === "maint-done") {
        el.disabled = true;
        try {
            await maintComplete(el.getAttribute("data-id"));
        } finally {
            el.disabled = false;   // bei Abbruch ("Wer hat es gemacht?") wieder bedienbar
        }
        renderHomeTodos();
    } else if (act === "maint-open") {
        openMaint();
    } else if (act === "stock-list") {
        el.disabled = true;
        try {
            await stockToList(el.getAttribute("data-id"));
        } finally {
            el.disabled = false;
        }
    } else if (act === "stock-open") {
        openStock();
    } else if (act === "cal-open") {
        calOpen(el.getAttribute("data-day") || "");
    }
});

async function updateAppBadges() {
    try {
        const cfg = SYNC_CONFIG.shopping;
        const d = await haGetState(cfg.entity);
        
        let totalShopCount = 0;
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            const allItems = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
            totalShopCount = allItems.length;
        }

        const shopBadge = document.getElementById('badge-shop');
        if (shopBadge) {
            shopBadge.innerText = totalShopCount;
            shopBadge.classList.toggle('visible', totalShopCount > 0);
        }
    } catch(e) {
        console.error("Fehler beim globalen Shop-Count", e);
    }

    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    const urgentCount = (todoDb || []).filter(t => {
        const isUrgent = new Date(t.nextDate) <= todayEnd;
        const isRelevant = t.room !== "Müll"; 
        return isUrgent && isRelevant;
    }).length;
    
    const todoBadge = document.getElementById('badge-todo');
    if (todoBadge) {
        todoBadge.innerText = urgentCount;
        todoBadge.classList.toggle('visible', urgentCount > 0);
    }
}
