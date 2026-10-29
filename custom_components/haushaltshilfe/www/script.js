    let users = []; 
    let isSessionActive = sessionStorage.getItem("session_active");
    let storedUser = localStorage.getItem("selectedUser");
    let user = (isSessionActive || storedUser === "Tablet" || (storedUser && isPersistentUser(storedUser))) ? storedUser : "";
    
    let curTab = sessionStorage.getItem("current_tab") || "shop";
    let curTheme = localStorage.getItem("app_theme") || "theme-light";
    
    let curCat = "Alle", lastActivity = Date.now(), isUpdatingFood = false;
    let activeStore = "Aldi", activeRoom = "Küche";
    let stores = ["Aldi", "Lidl", "Rewe"], rooms = ["Küche", "Bad", "Wohnen"], todoDb = [];
    let tempTodoName = ""; 

    let db = { 
        shop: { cats: ["Alle", "Gemüse", "Fleisch", "Vorrat", "Haus"], favs: [] }, 
        food: { cats: ["Alle", "Schnell", "Italienisch", "Leicht"], favs: [] }, 
        todo: { cats: ["Alle", "Haus", "Bad", "Wohnen", "Küche", "Garten"], favs: [] } 
    };

    const staticFavs = {
        shop: [{n:"🍎 Äpfel",c:"Gemüse"},{n:"🍌 Bananen",c:"Gemüse"},{n:"🥒 Gurke",c:"Gemüse"},{n:"🥩 Hack",c:"Fleisch"},{n:"🍗 Hähnchen",c:"Fleisch"},{n:"🥛 Milch",c:"Vorrat"},{n:"🥚 Eier",c:"Vorrat"},{n:"🍞 Brot",c:"Vorrat"},{n:"🧀 Käse",c:"Vorrat"},{n:"🧻 WC-Papier",c:"Haus"},{n:"🧼 Spüli",c:"Haus"}],
        food: [{n:"🍕 Pizza",c:"Schnell"},{n:"🍝 Pasta",c:"Italienisch"},{n:"🥙 Döner",c:"Schnell"},{n:"🍔 Burger",c:"Schnell"},{n:"🍚 Reis-Pfanne",c:"Leicht"},{n:"🥗 Salat",c:"Leicht"}],
        todo: [{n:"🗑️ Müll raus",c:"Haus"},{n:"🧺 Wäsche",c:"Haus"},{n:"🧼 Bad putzen",c:"Bad"},{n:"🧹 Saugen",c:"Wohnen"},{n:"🪴 Blumen",c:"Garten"},{n:"🍽️ Spüler",c:"Küche"}]
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

// Passwörter werden nur noch am Server geprüft. Ein bestätigtes Passwort bleibt
// für diese Sitzung im Speicher (nicht im localStorage), damit man im
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
            if (data && Array.isArray(data.visible_tabs)) {
                visibleTabs = data.visible_tabs;
                localStorage.setItem("ha_visible_tabs", JSON.stringify(visibleTabs));
            }
        }
    } catch (e) {
        console.warn("Konnte Tabs nicht über credentials laden:", e);
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

function showDeleteModal(message, title = "Benutzer löschen") {
    return new Promise((resolve) => {
        deleteResolver = resolve;
        const modal = document.getElementById('customDeleteModal');
        const titleEl = document.getElementById('customDeleteTitle');
        const msgEl = document.getElementById('customDeleteMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
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
                    const themes = ["theme-light", "theme-dark", "theme-glass", "theme-blue", "theme-green", "theme-winter", "theme-xmas"];
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

function showInputPrompt(message, title = "Eingabe") {
    return new Promise((resolve) => {
        inputResolver = resolve;
        const modal = document.getElementById('customInputModal');
        const titleEl = document.getElementById('customInputTitle');
        const msgEl = document.getElementById('customInputMessage');
        const inputEl = document.getElementById('customInputField');
        
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
        if (inputEl) {
            inputEl.value = ""; // Vorheriges leeren
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
    const themes = ["theme-light", "theme-dark", "theme-glass", "theme-blue", "theme-green", "theme-winter", "theme-xmas", "theme-newyear"];
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
    if(!grid) return;

    if (!users || users.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-muted, #888); font-size: 0.95rem;">
                Bitte einen Benutzer erstellen
            </div>`;
        return;
    }

    const colors = ['#FF5733', '#34C759', '#007AFF', '#FF9500', '#5856D6', '#FF2D55'];
    grid.innerHTML = users.map((uStr, i) => {
        const [uName, uPw] = uStr.split(':');
        const initial = uName.charAt(0).toUpperCase();
        const color = colors[i % colors.length];
        return `
            <button class="user-btn ${user === uName ? 'selected' : ''}" onclick="selUser('${uName}', this)" style="position:relative;">
                <div style="display:flex; align-items:center; gap:10px; padding-left:5px;">
                    <div style="width:30px; height:30px; background:${color}; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:0.8rem; flex-shrink:0;">${initial}</div>
                    <span style="flex:1; text-align:left;">${uName}</span>
                </div>
                <div class="user-edit-pen" style="position:absolute; top:-8px; left:-8px; background:var(--accent); color:white; width:26px; height:26px; border-radius:50%; font-size:12px; display:none; align-items:center; justify-content:center; border:2.5px solid white; z-index:10;" onclick="event.stopPropagation(); changeUserPassword('${uStr}')">✏️</div>
                <div class="user-del-x" onclick="event.stopPropagation(); deleteUser('${uStr}')">×</div>
            </button>`;
    }).join('');
}

async function deleteUser(uStr) {  
    const uName = uStr.split(':')[0];
    
    // Nutzt jetzt das komplett eigene Lösch-Modal
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
        document.getElementById("userModalTitle").innerText = `Benutzer "${uName}" bearbeiten`;
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
        shopSide.innerHTML = "";
        stores.forEach((s, index) => {
            const count = allOptions.filter(opt => opt.endsWith(` @${s}`)).length;
            const badge = count > 0 ? `<span class="shop-badge">${count}</span>` : '';
            
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
            del.innerHTML = "🗑️ ";
            del.className = "del-sidebar";
            del.style.marginRight = "6px";
            del.style.cursor = "pointer";
            del.onclick = (e) => {
                e.stopPropagation();
                deleteSidebarItem('shop', s);
            };
            btn.appendChild(del);

            // 2. Danach Name + Badge (rechts daneben)
            const txt = document.createElement('span');
            txt.style.display = "flex";
            txt.style.alignItems = "center";
            txt.style.gap = "8px";
            txt.style.pointerEvents = "none"; // Verhindert Probleme beim Ziehen
            txt.innerHTML = `${s} ${badge}`;
            btn.appendChild(txt);

            // Drag & Drop (Maus + Touch) aktivieren
            enableSidebarDragAndDrop(btn, 'shop', index);

            shopSide.appendChild(btn);
        });

        const addBtn = document.createElement('button');
        addBtn.className = "side-btn side-btn-add";
        addBtn.innerText = "+ Ort";
        addBtn.onclick = () => addSidebarItem('shop');
        shopSide.appendChild(addBtn);
    }

    // --- TODO SIDEBAR (RÄUME) ---
    const todoSide = document.getElementById("todoSidebar");
    if(todoSide) {
        todoSide.innerHTML = "";
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        rooms.forEach((r, index) => {
            const roomTasks = todoDb.filter(t => t.room === r);
            const totalCount = roomTasks.length;
            const hasUrgent = roomTasks.some(t => new Date(t.nextDate) <= todayEnd);
            
            const isActive = activeRoom === r;

            let badgeStyle = "";
            if (!isActive) {
                badgeStyle = hasUrgent ? "background: var(--danger);" : "background: #8e8e93;";
            }

            const badgeClass = hasUrgent ? 'shop-badge badge-blink' : 'shop-badge';
            const badge = totalCount > 0 ? `<span class="${badgeClass}" style="${badgeStyle}">${totalCount}</span>` : '';

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
            del.innerHTML = "🗑️ ";
            del.className = "del-sidebar";
            del.style.marginRight = "6px";
            del.style.cursor = "pointer";
            del.onclick = (e) => {
                e.stopPropagation();
                deleteSidebarItem('todo', r);
            };
            btn.appendChild(del);

            // 2. Danach Raumname + Badge (rechts daneben)
            const txt = document.createElement('span');
            txt.style.display = "flex";
            txt.style.alignItems = "center";
            txt.style.gap = "8px";
            txt.style.pointerEvents = "none";
            txt.innerHTML = `${r} ${badge}`;
            btn.appendChild(txt);

            // Drag & Drop (Maus + Touch) aktivieren
            enableSidebarDragAndDrop(btn, 'todo', index);

            todoSide.appendChild(btn);
        });

        const addBtnTodo = document.createElement('button');
        addBtnTodo.className = "side-btn side-btn-add";
        addBtnTodo.innerText = "+ Raum";
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
            statusColor = "var(--accent)"; 
            timeText = `In ${diffMins} Min.`;
        } else if (diffDays === 0) {
            statusColor = "var(--accent)"; 
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

        li.innerHTML = `
            <div style="margin-bottom: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <strong style="font-size:1.1rem;">${t.name}</strong>
                        ${t.assignedTo ? `<span style="font-size:0.75rem; color:var(--gray); font-weight:bold;">👤 ${t.assignedTo}</span>` : ''}
                    </div>
                    <span style="color:${statusColor}; font-weight:800; font-size:0.7rem; background:${statusColor}15; padding:4px 8px; border-radius:8px; border: 1px solid ${statusColor}30; white-space:nowrap;">${timeText}</span>
                </div>
                <div style="font-size:0.75rem; color:var(--gray); margin-top:12px; display:flex; flex-direction:column; gap:4px;">
                    <span>📅 Fällig: ${formatDT(t.nextDate)} Uhr</span>
                    <span>✅ Zuletzt: ${t.lastDone ? formatDT(t.lastDone) : 'Neu'}</span>
                </div>
            </div>
            <div style="display:flex; gap:10px; margin-top: auto;">
                <button onclick="completeTodo('${t.id}')" style="flex:3; color:white; border:none; padding:12px; border-radius:12px; font-weight:bold; cursor:pointer; background: ${statusColor}; transition: background 0.3s;">
                    ${btnLabel}
                </button>
                <button onclick="openEdit('${t.id}')" style="flex:1; background:#f2f2f7; border:none; border-radius:12px; font-weight:bold; cursor:pointer; font-size:1.2rem;">✏️</button>
                <button onclick="deleteTodo('${t.id}')" style="flex:1; background:#f2f2f7; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">🗑️</button>
            </div>`;
        ul.appendChild(li);
    });
    
    if (typeof updateAppBadges === "function") {
        updateAppBadges();
    }
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
async function load() {
    if (typeof renderSidebars === "function") await renderSidebars();
    if (curTab === 'trash' || isUpdatingFood) return;
    if (curTab === 'todo') { renderTodoList(); return; }

    if (curTab === 'food') {
        for(let i=0; i<7; i++) {
            try {
                const d = await haGetState(FOOD_ENTITIES[i]); 
                const inp = document.getElementById(`plan-${i}`);
                const sel = document.getElementById(`cook-${i}`);

                if (sel && sel.options.length <= 1) {
                    sel.innerHTML = '<option value="">👨‍🍳 Wer kocht?</option>';
                    users.forEach(uStr => {
                        const uName = uStr.split(':')[0];
                        const opt = document.createElement("option");
                        opt.value = uName;
                        opt.innerText = uName;
                        sel.appendChild(opt);
                    });
                }

                // --- HIER IST DER SCHUTZ: Wenn du im Feld tippst, wird dieser Tag übersprungen ---
                if (inp && document.activeElement === inp) {
                    continue;
                }

                if (inp && !isUpdatingFood) {
                    const raw = (d.state === 'unknown' || d.state === '---') ? '' : d.state;
                    if (raw.includes(' | ')) {
                        const parts = raw.split(' | ');
                        inp.value = parts[0].trim();
                        if (sel) sel.value = parts[1].trim();
                    } else {
                        inp.value = raw;
                        if (sel) sel.value = ""; 
                    }
                }
            } catch(e) { console.error("Fehler beim Laden des Essensplans Tag " + i, e); }
        }
        if (typeof updateAppBadges === "function") updateAppBadges();
        return; 
    }

    if (curTab === 'shop') {
        try {
            const cfg = SYNC_CONFIG.shopping;
            const d = await haGetState(cfg.entity); 

            let fullList = [];
            if (d && d.attributes && d.attributes[cfg.attr]) {
                const rawData = d.attributes[cfg.attr];
                fullList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
            }

            let filtered = fullList.filter(o => o.endsWith(` @${activeStore}`));
            document.getElementById("list-shop").innerHTML = filtered.reverse().map(t => 
                `<li style="flex-direction:row; align-items:center;">
                    <span>${t.split(' @')[0]}</span>
                    <button class="btn-del-item" onclick="delItem('${t}')">🗑️</button>
                </li>`
            ).join('') || "<li>Leer! ✨</li>";
        } catch(e) {
            document.getElementById("list-shop").innerHTML = "<li>Fehler beim Laden ⚠️</li>";
        }
    }

    if (typeof updateAppBadges === "function") updateAppBadges();
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
    chip.innerHTML = `<span>${f.n}</span>`;

    if(isCustom) { 
        const del = document.createElement('span'); 
        del.innerHTML = " 🗑️"; 
        del.className = "del-fav"; 
        del.onclick = (e) => { e.stopPropagation(); deleteFav(idx); }; 
        chip.appendChild(del); 
    }

    chip.onclick = async () => { 
        if(curTab === 'shop') {
            addShop(f.n); 
        } else if(curTab === 'food') {
            // Nutzt jetzt das neue, eigene Wochentag-Modal
            const d = await showFoodDayPrompt(
                `Für welchen Tag?\n(0 = Mo, 1 = Di, 2 = Mi, 3 = Do, 4 = Fr, 5 = Sa, 6 = So)`, 
                `Essen planen: ${f.n}`
            );
            
            if(d !== null && d !== "") {
                 const dayIdx = parseInt(d);
                if(dayIdx >= 0 && dayIdx <= 6) {
                    document.getElementById('plan-' + dayIdx).value = f.n;
                    saveFood(dayIdx); 
                } else {
                    await showAlert("Bitte eine Zahl zwischen 0 und 6 eingeben.", "Ungültige Eingabe ❌");
                }
            }
        } else { 
            addTodo(f.n); 
        }
    };
    return chip;
}

function tab(t) { 
    curTab = t; 
    sessionStorage.setItem("current_tab", t); 
    ['shop','food','todo','trash','finance'].forEach(v => { 
        const view = document.getElementById('v-'+v);
        const tabBtn = document.getElementById('t-'+v);
        if(view) view.style.display = t===v?'block':'none'; 
        if(tabBtn) tabBtn.className = `tab-item ${t===v?'active-'+t:''}`; 
    }); 

    if(t==='trash') { 
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

async function saveFood(idx) {
    isUpdatingFood = true;
    const dishElem = document.getElementById(`plan-${idx}`);
    const cookElem = document.getElementById(`cook-${idx}`);
    if (!dishElem) return;

    const dish = dishElem.value.trim();
    const cook = cookElem ? cookElem.value : "";
    const finalValue = cook ? `${dish} | ${cook}` : dish;

    try {
        await haSetInputText(FOOD_ENTITIES[idx], finalValue);
    } catch (e) {
        console.error("Fehler beim Speichern des Essensplans:", e);
    }

    setTimeout(() => { isUpdatingFood = false; }, 2000);
}

function highlightToday() { 
    let d = new Date().getDay(); 
    let idx = d === 0 ? 6 : d - 1; 
    document.querySelectorAll('.day-card').forEach(c => c.classList.remove('today')); 
    if(document.getElementById('card-'+idx)) document.getElementById('card-'+idx).classList.add('today'); 
}

async function clearWeek() {
    const confirmed = await showDeleteModal(
        "Möchtest du wirklich den gesamten Essensplan für diese Woche löschen?",
        "Woche zurücksetzen 🧹"
    );

    if (confirmed) {
        for (let i = 0; i < 7; i++) {
            const el = document.getElementById('plan-' + i);
            if (el) el.value = '';
            await saveFood(i);
        }
    }
}

async function loadTrash() {
    let h = ""; 
    try { 
        for (const s of TRASH_CONFIG) { 
            const [dDays, dDate] = await Promise.all([ 
                haGetState(s.id), 
                haGetState(s.dateId) 
            ]);
            
            let tage = dDays.state; 
            let rohDatum = dDate.state;
            let dF = "Unbekannt";
            let dateObj = null;
            
            if (rohDatum && rohDatum !== "unknown" && rohDatum !== "unavailable") {
                if (rohDatum.includes('.')) {
                    dF = rohDatum; 
                    const p = rohDatum.split('.');
                    dateObj = new Date(p[2], p[1]-1, p[0]);
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

            let dV = parseInt(tage);
            let col = isNaN(dV) ? "var(--text)" : (dV <= 1 ? "var(--danger)" : (dV <= 3 ? "var(--accent)" : "var(--text)"));
            
            h += `<div class="trash-row">
                    <div class="trash-header">
                        <span class="trash-name">${s.icon} ${s.name}</span>
                        <span class="trash-days" style="color: ${col}">${tage} Tage</span>
                    </div>
                    <div class="trash-date">📅 Termin: <strong>${dF}</strong></div>
                  </div>`;
        } 
        document.getElementById("trash-content").innerHTML = h; 
        if(curTab === 'todo') renderTodoList();
    } catch (e) { 
        console.error("Fehler beim Laden des Müll-Syncs:", e);
        document.getElementById("trash-content").innerHTML = "Fehler beim Laden!"; 
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
    
    const isPersistent = (user === "Tablet" || (typeof isPersistentUser === 'function' && isPersistentUser(user)));
    let firstLineContent = isPersistent ? `📺 ${user} • ${timeStr}` : `${user} • ${timeStr}`;
    const coloredLine = `<span class="user-name-gradient">${firstLineContent}</span>`;

    if (!isPersistent) {  
        const diff = Date.now() - lastActivity; 
        const timeLeft = 600000 - diff;  
        if (timeLeft <= 0) logout();  
        const min = Math.floor(timeLeft / 60000); 
        const sec = Math.floor((timeLeft % 60000) / 1000);  
        statusElem.innerHTML = `${coloredLine}<br><span style="font-size:0.8rem; color:var(--danger); font-weight:bold;">Logout: ${min}:${sec < 10 ? '0' : ''}${sec}</span>`;  
    } else { 
        statusElem.innerHTML = coloredLine; 
    }  
}

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
