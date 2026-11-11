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

    applyTabsToDOM(visibleTabs);
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

            payload.current_master_pw = verifiedMasterPw;
            payload.visible_tabs = selectedTabs;
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

            // Drag & Drop (Maus + Touch) aktivieren
            enableSidebarDragAndDrop(btn, 'shop', index);

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

            // Drag & Drop (Maus + Touch) aktivieren
            enableSidebarDragAndDrop(btn, 'todo', index);

            todoSide.appendChild(btn);
        });

        const addBtnTodo = document.createElement('button');
        addBtnTodo.className = "side-btn side-btn-add";
        addBtnTodo.textContent = "+ Raum";
        addBtnTodo.onclick = () => addSidebarItem('todo');
        todoSide.appendChild(addBtnTodo);
    }
}


// ========================================================
// --- OPTIMIERTE DRAG & DROP LOGIK FÜR SIDEBAR ---
// ========================================================
let sidebarDragState = {
    type: null,
    fromIndex: null,
    toIndex: null,
    isDragging: false,
    startY: 0,
    activeElement: null
};

function enableSidebarDragAndDrop(btn, type, index) {
    // --- 1. PC MAUS DRAG & DROP ---
    btn.draggable = true;

    btn.addEventListener('dragstart', (e) => {
        sidebarDragState.type = type;
        sidebarDragState.fromIndex = index;
        btn.classList.add('dragging-side-btn');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
        }
    });

    btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (sidebarDragState.type !== type || sidebarDragState.fromIndex === index) return;
        btn.classList.add('drag-over-side-btn');
    });

    btn.addEventListener('dragleave', () => {
        btn.classList.remove('drag-over-side-btn');
    });

    btn.addEventListener('drop', async (e) => {
        e.preventDefault();
        btn.classList.remove('drag-over-side-btn');
        if (sidebarDragState.type !== type) return;
        
        const fromIdx = sidebarDragState.fromIndex;
        const toIdx = index;
        if (fromIdx !== null && fromIdx !== toIdx) {
            await applySidebarNewOrder(type, fromIdx, toIdx);
        }
    });

    btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging-side-btn');
        document.querySelectorAll('.drag-over-side-btn').forEach(el => el.classList.remove('drag-over-side-btn'));
        sidebarDragState.type = null;
        sidebarDragState.fromIndex = null;
    });

    // --- 2. HANDY / TABLET TOUCH (FLÜSSIG & DIREKT) ---
    btn.addEventListener('touchstart', (e) => {
        // Mülleimer ausnehmen
        if (e.target.classList.contains('del-sidebar')) return;

        const touch = e.touches[0];
        sidebarDragState.startY = touch.clientY;
        sidebarDragState.type = type;
        sidebarDragState.fromIndex = index;
        sidebarDragState.toIndex = index;
        sidebarDragState.activeElement = btn;
        btn.dataset.wasDragged = "false";
    }, { passive: true });

    btn.addEventListener('touchmove', (e) => {
        if (sidebarDragState.type !== type || sidebarDragState.fromIndex !== index) return;

        const touch = e.touches[0];
        const moveDistance = Math.abs(touch.clientY - sidebarDragState.startY);

        // Sobald der Finger minimal bewegt wird (10px), startet das Ziehen sofort flüssig
        if (!sidebarDragState.isDragging && moveDistance > 10) {
            sidebarDragState.isDragging = true;
            btn.classList.add('dragging-side-btn');
            btn.dataset.wasDragged = "true";
            if (navigator.vibrate) navigator.vibrate(30); // Kurzes haptisches Feedback
        }

        if (sidebarDragState.isDragging) {
            // Verhindert, dass die ganze Seite mitgescrollt wird, während man einen Raum verschiebt
            if (e.cancelable) e.preventDefault();

            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const overBtn = targetEl ? targetEl.closest(`.side-btn[data-type="${type}"]`) : null;

            document.querySelectorAll('.drag-over-side-btn').forEach(el => el.classList.remove('drag-over-side-btn'));

            if (overBtn && overBtn !== btn) {
                overBtn.classList.add('drag-over-side-btn');
                sidebarDragState.toIndex = parseInt(overBtn.dataset.index, 10);
            }
        }
    }, { passive: false });

    const endTouchDrag = async () => {
        if (!sidebarDragState.isDragging) {
            sidebarDragState.type = null;
            sidebarDragState.fromIndex = null;
            return;
        }

        sidebarDragState.isDragging = false;
        btn.classList.remove('dragging-side-btn');
        document.querySelectorAll('.drag-over-side-btn').forEach(el => el.classList.remove('drag-over-side-btn'));

        const fromIdx = sidebarDragState.fromIndex;
        const toIdx = sidebarDragState.toIndex;
        
        sidebarDragState.type = null;
        sidebarDragState.fromIndex = null;
        sidebarDragState.toIndex = null;
        sidebarDragState.activeElement = null;

        if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx) {
            await applySidebarNewOrder(type, fromIdx, toIdx);
        }

        setTimeout(() => { btn.dataset.wasDragged = "false"; }, 150);
    };

    btn.addEventListener('touchend', endTouchDrag);
    btn.addEventListener('touchcancel', endTouchDrag);
}

// Speichert die neue Reihenfolge und synchronisiert sie mit Home Assistant
async function applySidebarNewOrder(type, fromIndex, toIndex) {
    const arr = (type === 'shop') ? stores : rooms;
    
    // Element an alter Position entfernen und an neuer Position einfügen
    const [movedItem] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, movedItem);

    // Direkt mit deiner bestehenden Funktion in Home Assistant speichern
    await syncUpSidebar(type);
    
    // Sidebar neu zeichnen
    renderSidebars();
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

async function saveTodoDb(taskName = "Update", actionType = "aktualisiert") {
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
            user_name: user,       
            task_name: taskName,   
            room_name: roomName,   
            action: actionType     
        });
        if (typeof renderSidebars === "function") renderSidebars();
    } catch (e) {
        console.error("❌ Fehler beim Senden des Speicher-Events:", e);
    }
}

async function completeTodo(id) {
    const t = todoDb.find(x => String(x.id) === String(id));
    if (!t) return;

    try {
        const now = new Date();
        if (t.room.trim() === "Müllabfuhr") {
            todoDb = todoDb.filter(x => String(x.id) !== String(id));
            await saveTodoDb(t.name, "Müll erledigt & entfernt 🗑️");
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
            await saveTodoDb(t.name, "erledigt ✅");
        }

        renderTodoList();
        if (typeof updateAppBadges === "function") updateAppBadges();
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
    }
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
        btnEdit.className = "todo-btn todo-btn-icon";
        btnEdit.style.cssText = "background:#f2f2f7; border:none; cursor:pointer;";
        btnEdit.textContent = "✏️";
        btnEdit.addEventListener("click", () => openEdit(t.id));

        const btnDel = document.createElement("button");
        btnDel.className = "todo-btn todo-btn-icon";
        btnDel.style.cssText = "background:#f2f2f7; border:none; cursor:pointer;";
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
                }
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
// Aktuell: Sonntag 23:00 Uhr.
// Zum Testen z. B.: SHIFT_DAY = 6, SHIFT_HOUR = 6, SHIFT_MINUTE = 5 (Samstag 06:05)
const SHIFT_DAY = 0;    // 0 = Sonntag, 1 = Montag, ..., 6 = Samstag
const SHIFT_HOUR = 23;  // Stunde (0 bis 23)
const SHIFT_MINUTE = 0; // Minute (0 bis 59)

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
    return `${year}-${month}-${day}_${SHIFT_DAY}-${SHIFT_HOUR}-${SHIFT_MINUTE}`;
}

function getCurrentCycleStamp() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const min = now.getMinutes();
    const target = new Date(now);

    if (day === SHIFT_DAY) {
        // Vor der eingestellten Uhrzeit gilt noch der Stempel von letzter Woche (-7 Tage)
        if (hour < SHIFT_HOUR || (hour === SHIFT_HOUR && min < SHIFT_MINUTE)) {
            target.setDate(now.getDate() - 7);
        }
    } else {
        const diff = (day - SHIFT_DAY + 7) % 7;
        target.setDate(now.getDate() - diff);
    }
    return formatStamp(target);
}

function getManualAdvanceCycleStamp() {
    const now = new Date();
    const day = now.getDay();
    const target = new Date(now);

    if (day !== SHIFT_DAY) {
        const diff = (SHIFT_DAY - day + 7) % 7;
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
    try {
        const raw = await readFoodRaw(FOOD_ENTITIES[0]); // leer ist okay!
        const weekParts = raw.split('~');
        const savedStamp = (weekParts[2] || "").trim();
        const currentStamp = getCurrentCycleStamp();
        const configSuffix = `_${SHIFT_DAY}-${SHIFT_HOUR}-${SHIFT_MINUTE}`;

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

            let filtered = fullList.filter(o => o.endsWith(` @${activeStore}`)).reverse();
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
                    btn.textContent = "🗑️";
                    btn.addEventListener("click", () => delItem(t));

                    li.appendChild(span);
                    li.appendChild(btn);
                    listEl.appendChild(li);
                });
            }
        } catch (e) {
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

        const configSuffix = `_${SHIFT_DAY}-${SHIFT_HOUR}-${SHIFT_MINUTE}`;
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

async function delItem(t) {
    try {
        const cfg = SYNC_CONFIG.shopping;
        const d = await haGetState(cfg.entity);

        let currentList = [];
        if (d && d.attributes && d.attributes[cfg.attr]) {
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

// Ausgaben des aktuellen Monats (aus der Finanz-Datenbank)
async function renderHomeMoney() {
    const now = new Date();
    const monthNames = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
    const label = now.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    const title = document.getElementById("home-money-title");
    if (title) title.textContent = `💰 Ausgaben ${label}`;

    if (typeof fetchHA !== "function" || typeof parseFinanceRoot !== "function") return;

    let m = null;
    try {
        const s = await fetchHA("sensor.haushalt_finance_db");
        const root = parseFinanceRoot(s);
        m = (root.months || []).find(x =>
            x && x.month_name &&
            x.month_name.toLowerCase().includes(monthNames[now.getMonth()]) &&
            String(extractYearFromMonth(x)) === String(now.getFullYear())
        ) || null;
    } catch (e) {
        homeSet("home-money-body", `<div class="home-empty">Finanzen konnten nicht geladen werden ⚠️</div>`);
        return;
    }

    if (!m) {
        homeSet("home-money-body", `<div class="home-empty">Für ${escapeHtml(label)} gibt es noch keinen Monat in den Finanzen.</div>`);
        return;
    }

    const sum = arr => (arr || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
    const fix = sum(m.fixum);
    const spend = sum(m.spendings);
    const latest = (m.spendings || []).slice(-4).reverse();

    let html = `
        <div class="home-money-row"><span>Fixkosten</span><b>${homeMoney(fix)}</b></div>
        <div class="home-money-row"><span>Ausgaben</span><b>${homeMoney(spend)}</b></div>
        <div class="home-money-total"><span>Gesamt</span><b>${homeMoney(fix + spend)}</b></div>`;
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
    const nowMs = Date.now();
    if (!force && nowMs - homeLastFetch < 10000) return;
    homeLastFetch = nowMs;
    await Promise.all([renderHomeFood(), renderHomeShop(), renderHomeMoney()]);
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
        await completeTodo(el.getAttribute("data-id"));
        renderHomeTodos();
        updateAppBadges();
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
