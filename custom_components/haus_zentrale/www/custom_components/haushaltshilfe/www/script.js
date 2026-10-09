    let isSessionActive = sessionStorage.getItem("session_active");
    let storedUser = localStorage.getItem("selectedUser");
    let user = (isSessionActive || storedUser === "Tablet") ? storedUser : "";
    
    let curTab = sessionStorage.getItem("current_tab") || "shop";
    let curTheme = localStorage.getItem("app_theme") || "theme-light";
    let users = ["Domenic:Sabrina1707.", "Sabrina:Sabrina1707.", "Tablet:Sabrina1707."]; 
    
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

    // --- SYSTEM FUNKTIONEN ---
    function openSystemSettings() {
        const eingabe = prompt("SYSTEM-ZUGRIFF: Master-Passwort eingeben:");
        if (eingabe === MASTER_PW || eingabe === "admin") {
            document.getElementById("set_token").value = HA_TOKEN || "";
            document.getElementById("set_admin_pw").value = ADMIN_PW || "";
            document.getElementById("settingsOverlay").style.display = "flex";
        } else {
            alert("Master-Passwort falsch! Zugriff verweigert.");
        }
    }

    async function saveSystemSettings() {
        const newToken = document.getElementById("set_token").value.trim();
        const newAdminPw = document.getElementById("set_admin_pw").value.trim();
        if (newToken && newAdminPw) {
            localStorage.setItem("ha_token", newToken);
            HA_TOKEN = newToken;
            
            // Speichert das Admin Passwort global im Home Assistant Helfer
            await fetch(`${HA_URL}/api/services/input_text/set_value`, {
                method: 'POST',
                headers: {'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json'},
                body: JSON.stringify({ entity_id: ADMIN_PW_ENTITY, value: newAdminPw })
            });

            alert("Systemeinstellungen gespeichert! Lade neu...");
            location.reload();
        } else {
            alert("Bitte alle Felder ausfüllen!");
        }
    }

    function toggleUserAdmin() { 
        const check = prompt("ADMIN-BEREICH: Admin-Passwort eingeben:");
        if (check === ADMIN_PW) {
            // 1. Icons an den Usern (Stift/X) zeigen
            document.getElementById("userGrid").classList.add("admin-mode");
        
            // 2. Buttons tauschen (Wir überschreiben das komplette Style-Attribut)
            document.getElementById("admin-open-btn").style.setProperty("display", "none", "important");
            document.getElementById("admin-close-btn").style.setProperty("display", "block", "important");
        } else { 
            alert("Passwort falsch!"); 
        }
    }

    function closeUserAdmin() {
        // 1. Icons an den Usern verstecken
        document.getElementById("userGrid").classList.remove("admin-mode");
    
        // 2. Buttons zurücktauschen
        document.getElementById("admin-open-btn").style.setProperty("display", "block", "important");
        document.getElementById("admin-close-btn").style.setProperty("display", "none", "important");
    }

    async function addUserPrompt() {
        const check = prompt("ADMIN-BEREICH: Admin-Passwort eingeben:");
        if (check === ADMIN_PW) {
            const name = prompt("Name:");
            if (name) {
                const pw = prompt(`Passwort für ${name}:`, "Bitte Passwort eingeben");
                if (pw) { users.push(`${name}:${pw}`); await saveUsers(); renderUserGrid(); }
            }
        } else { alert("Passwort falsch!"); }
    }

    function addNewCat(t) { 
        const check = prompt("ADMIN-BEREICH: Admin-Passwort eingeben:"); 
        if (check === ADMIN_PW) { 
            const n = prompt("Kategorie:"); 
            if(n) { db[t].cats.push(n); syncUp(); render(); } 
        } else { alert("Passwort falsch!"); } 
    }

    function addNewFav(t) { 
        const check = prompt("ADMIN-BEREICH: Admin-Passwort eingeben:"); 
        if (check === ADMIN_PW) { 
            const n = prompt("Name des Favoriten:"); 
            if(n) { db[t].favs.push({n, c:curCat}); syncUp(); render(); } 
        } else { alert("Passwort falsch!"); } 
    }


    // --- THEME STEUERUNG (DROPDOWN) ---

    function toggleThemeMenu(event) {
    // Verhindert, dass der Klick zum Hintergrund durchgereicht wird
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        const dropdown = document.getElementById("themeDropdown");
    
        if (dropdown) {
            // Toggle die Sichtbarkeit
            dropdown.classList.toggle("show");
        
            // TEST: Wenn du das hier in der Konsole (F12) siehst, funktioniert die Logik!
            console.log("Menü geklickt! Sichtbar:", dropdown.classList.contains("show"));
        } else {
            // Das passiert, wenn die ID im HTML nicht gefunden wird
            alert("Kritischer Fehler: Menü-ID 'themeDropdown' nicht im HTML gefunden!");
        }
    }

    function setTheme(themeName) {
        const themes = ["theme-light", "theme-dark", "theme-glass", "theme-blue", "theme-green"];
        
        // 1. Alle alten Klassen entfernen
        document.body.classList.remove(...themes);
        
        // 2. Neue Klasse setzen
        curTheme = themeName;
        document.body.className = curTheme;
        
        // 3. Speichern für den nächsten Start
        localStorage.setItem("app_theme", curTheme);
        
        // 4. Menü schließen
        const dropdown = document.getElementById("themeDropdown");
        if (dropdown) dropdown.classList.remove("show");
    }

    // Schließt das Menü, wenn man irgendwo anders hinklickt
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
        await syncDown(); 
        await loadUsers(); 
        renderUserGrid();
        if (user) startApp(); 
        highlightToday(); 

        // ENTER-TASTE für das Shop-Mengen-Modal
        const shopInput = document.getElementById("shopQtyValue");
        if (shopInput) {
            shopInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    confirmShopAdd();
                }
            });
        }
  
        // ENTER-TASTE für das Haus-Intervall-Modal (optional, falls noch nicht drin)
        const intervalInput = document.getElementById("modalValue");
        if (intervalInput) {
           intervalInput.addEventListener("keypress", (e) => {
               if (e.key === "Enter") {
                    e.preventDefault();
                     // Hier prüfen wir, welcher Button aktiv sein könnte, 
                    // standardmäßig nehmen wir meistens 't' für Tage
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
            const r = await fetch(`${HA_URL}/api/states/${USER_LIST_ENTITY}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} });
            const d = await r.json();
            if (d.state && d.state.startsWith('[') && d.state !== "[]") users = JSON.parse(d.state);
        } catch(e) {}
    }

    async function saveUsers() {
        try {
            await fetch(`${HA_URL}/api/services/input_text/set_value`, { 
                method: 'POST', headers: {'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json'}, 
                body: JSON.stringify({ entity_id: USER_LIST_ENTITY, value: JSON.stringify(users) }) 
            });
        } catch(e) {}
    }

    function renderUserGrid() {
        const grid = document.getElementById("userGrid");
        if(!grid) return;
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
        if (confirm(`User löschen?`)) { users = users.filter(item => item !== uStr); await saveUsers(); renderUserGrid(); }
    }

    function selUser(u, b) { 
        user = u; 
        document.querySelectorAll('.user-btn').forEach(x => x.classList.remove('selected')); 
        b.classList.add('selected'); 
    }

    async function doLogin() { 
        const enteredPw = document.getElementById("pw").value;
        const foundUser = users.find(uStr => {
            const [uName, uPw] = uStr.split(':');
            return uName === user && uPw === enteredPw;
        });

        if (foundUser) {
            sessionStorage.setItem("session_active", "true");
            localStorage.setItem("selectedUser", user);

            // App-Oberfläche anzeigen
            await startApp(); 
        
            // EXPLIZIT: Nach dem Login die Liste einmal frisch zeichnen
            if (curTab === 'todo') {
                renderTodoList();
            }
        } else { 
            alert("Passwort falsch!"); 
        }
    }
    
    async function changeUserPassword(uStr) {
        const [uName, oldPw] = uStr.split(':');
        const newPw = prompt(`Neues Passwort für ${uName} festlegen:`, oldPw);
        if (newPw && newPw !== oldPw) {
            const index = users.indexOf(uStr);
            if (index !== -1) {
                users[index] = `${uName}:${newPw}`;
                // Speichert die Liste als JSON-String zurück in deinen HA-Helper
                await fetch(`${HA_URL}/api/services/input_text/set_value`, { 
                    method: 'POST', 
                    headers: {'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ entity_id: USER_LIST_ENTITY, value: JSON.stringify(users) }) 
                });
                renderUserGrid();
                alert(`Passwort für ${uName} geändert! ✅`);
            }
        }
    
    }
    
    function togglePasswordVisibility() {
        const pwInput = document.getElementById("pw");
        const eyeBtn = document.getElementById("eye-icon");
    
        if (pwInput.type === "password") {
            pwInput.type = "text";
            eyeBtn.innerText = "🔒"; // Symbol ändert sich zu Schloss
        } else {
            pwInput.type = "password";
            eyeBtn.innerText = "👁️"; // Symbol ändert sich zu Auge
        }
    }

    async function startApp() {
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("app").style.display = "block";

        console.log("Starte initialen Daten-Sync...");
        await syncDown(); // Hier warten wir, bis todoDb gefüllt ist
        console.log("Initialer Sync abgeschlossen.");

        // Erst jetzt den Tab initialisieren (das ruft intern render() und load() auf)
        tab(curTab); 

        // Intervalle starten
        setInterval(load, 5000);
        setInterval(updateStatus, 1000);
        setInterval(syncDown, 20000); 
        setInterval(loadTrash, 600000);
        setInterval(updateAppBadges, 1000);
    }

    async function syncUpSidebar(type) {
        const ent = type === 'shop' ? STORES_ENTITY : ROOMS_ENTITY;
        const val = type === 'shop' ? stores : rooms;
        try { await fetch(`${HA_URL}/api/services/input_text/set_value`, { method: 'POST', headers: {'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify({ entity_id: ent, value: JSON.stringify(val) }) }); } catch(e) {}
    }

async function renderSidebars() {
    // --- 1. SHOP-DATEN AUS DEM NEUEN SICHEREN SENSOR HOLEN ---
    let allOptions = [];
    try {
        const cfg = SYNC_CONFIG.shopping; // Greift auf deinen neuen Shopping-Sensor zu
        const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        const d = await r.json();
        
        // Daten aus dem Attribut "shopping_json" (oder "data") holen
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            // Falls es als Text gespeichert ist, parsen wir es, sonst direkt nutzen
            allOptions = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }
    } catch(e) { 
        console.error("Sidebar-Zählung Shop fehlgeschlagen", e); 
    }

    // --- 2. SHOP SIDEBAR RENDERN ---
    const shopSide = document.getElementById("shopSidebar");
    if(shopSide) {
        shopSide.innerHTML = stores.map(s => {
            // Zählt alle Items, die mit dem Kürzel des Geschäfts enden (z.B. @Aldi)
            const count = allOptions.filter(opt => opt.endsWith(` @${s}`)).length;
            const badge = count > 0 ? `<span class="shop-badge">${count}</span>` : '';
            
            return `<button class="side-btn ${activeStore === s ? 'active-shop' : ''}" 
                onclick="activeStore='${s}'; renderSidebars(); load();" 
                oncontextmenu="event.preventDefault(); deleteSidebarItem('shop','${s}')">
                ${s} ${badge}
            </button>`;
        }).join('') + `<button class="side-btn side-btn-add" onclick="addSidebarItem('shop')">+ Ort</button>`;
    }

    // --- 3. TODO SIDEBAR RENDERN (Mit Invertierung bei Auswahl) ---
    const todoSide = document.getElementById("todoSidebar");
    if(todoSide) {
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        todoSide.innerHTML = rooms.map(r => {
            const roomTasks = todoDb.filter(t => t.room === r);
            const totalCount = roomTasks.length;
            const hasUrgent = roomTasks.some(t => new Date(t.nextDate) <= todayEnd);
            
            const isActive = activeRoom === r;

            // Logik für das Aussehen:
            let badgeStyle = "";
            if (!isActive) {
                badgeStyle = hasUrgent ? "background: var(--danger);" : "background: #8e8e93;";
            }

            const badgeClass = hasUrgent ? 'shop-badge badge-blink' : 'shop-badge';
            const badge = totalCount > 0 ? `<span class="${badgeClass}" style="${badgeStyle}">${totalCount}</span>` : '';

            return `<button class="side-btn ${isActive ? 'active-todo' : ''}" 
                onclick="activeRoom='${r}'; renderSidebars(); renderTodoList();" 
                oncontextmenu="event.preventDefault(); deleteSidebarItem('todo','${r}')">
                ${r} ${badge}
            </button>`;
        }).join('') + `<button class="side-btn side-btn-add" onclick="addSidebarItem('todo')">+ Raum</button>`;
    }
}  

    async function addSidebarItem(type) { const n = prompt("Name:"); if(n) { if(type==='shop') stores.push(n); else rooms.push(n); await syncUpSidebar(type); renderSidebars(); } }
    async function deleteSidebarItem(type, val) { if(confirm("Löschen?")) { if(type==='shop') stores = stores.filter(x=>x!==val); else rooms = rooms.filter(x=>x!==val); await syncUpSidebar(type); renderSidebars(); } }

async function saveTodoDb(taskName = "Update", actionType = "aktualisiert") {
    // ZENTRALER FIX: Bereinigt alle Zeitstempel direkt in der echten Liste (App + HA sync)
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

    // Bereinigte Liste in Text umwandeln
    const dataToSend = JSON.stringify(todoDb || []);

    // 1. Suche die Aufgabe in der Liste (Namen normalisieren)
    const taskObj = (todoDb || []).find(t => 
        t.name.toLowerCase().trim() === taskName.toLowerCase().trim()
    );
    
    // 2. Den Raumnamen ermitteln. 
    let roomName = "Haus"; // Standardwert

    if (taskObj) {
        roomName = taskObj.room || taskObj.category || "Haus";
    } else if (typeof activeRoom !== 'undefined' && activeRoom) {
        roomName = activeRoom;
    }

    try {
        const response = await fetch(`${HA_URL}/api/events/set_tasks_data`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tasks: dataToSend, 
                user_name: user,       
                task_name: taskName,   
                room_name: roomName,   
                action: actionType     
            })
        });

        if (!response.ok) throw new Error(`Server-Fehler: ${response.status}`);
        console.log(`✅ Event gesendet: [${roomName}] ${taskName}`);
        
        if (typeof renderSidebars === "function") renderSidebars();

    } catch (e) {
        console.error("❌ Fehler beim Senden des Speicher-Events:", e);
    }
}
    
async function completeTodo(id) {
    // WICHTIG: String-Umwandlung für Text- und Zahlen-IDs
    const t = todoDb.find(x => String(x.id) === String(id));
    
    if (!t) {
        console.error("Aufgabe mit ID " + id + " nicht in todoDb gefunden!");
        return;
    }

    if (confirm(`"${t.name}" erledigt?`)) {
        try {
            const now = new Date();

            // --- SPEZIAL-LOGIK FÜR MÜLLABFUHR ---
            if (t.room.trim() === "Müllabfuhr") {
                todoDb = todoDb.filter(x => String(x.id) !== String(id));
                await saveTodoDb(t.name, "Müll erledigt & entfernt 🗑️");
            } 
            else {
                // --- NORMALE LOGIK FÜR HAUSHALT ---
                t.lastDone = now.toISOString();
                let nextDate;

                // FALL A: Wochentage
                if (t.selectedDays && t.selectedDays.length > 0) {
                    let next = new Date();
                    const wochenAbstand = t.weeks || 1;
                    
                    for (let i = 1; i <= 7 * wochenAbstand; i++) {
                        let temp = new Date();
                        temp.setDate(temp.getDate() + i);
                        if (t.selectedDays.includes(temp.getDay())) {
                            next = temp;
                            break;
                        }
                    }
                    nextDate = next;
                } 
                // FALL B: Normales Intervall (Stunden oder Tage)
                else {
                    const hours = t.intervalHours || 24;
                    nextDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));
                }

                // --- UHRZEIT AUS DEM OBJEKT ERZWINGEN ---
                // Wir nehmen die gespeicherte Uhrzeit (z.B. "07:30") oder 10:00 als Fallback
                if (t.time) {
                    const [h, m] = t.time.split(':');
                    nextDate.setHours(parseInt(h), parseInt(m), 0, 0);
                } else {
                    nextDate.setHours(10, 0, 0, 0);
                }

                t.nextDate = nextDate.toISOString();
                await saveTodoDb(t.name, "erledigt ✅");
            }

            // UI-Update
            renderTodoList();
            if (typeof updateAppBadges === "function") updateAppBadges();

        } catch (error) {
            console.error("Fehler beim Speichern:", error);
        }
    }
}    
     
async function deleteTodo(id) {
    // WICHTIG: Wir wandeln beide Seiten in Strings um, 
    // damit "123" (Text) und 123 (Zahl) als gleich erkannt werden.
    const taskToDelete = todoDb.find(x => String(x.id) === String(id));
    
    if (taskToDelete && confirm(`Möchtest du "${taskToDelete.name}" wirklich löschen?`)) {
        // Den Namen für Home Assistant merken
        const deletedName = taskToDelete.name;

        // Aus der lokalen Liste filtern (auch hier mit String-Vergleich)
        todoDb = todoDb.filter(x => String(x.id) !== String(id));

        // Den Namen an Home Assistant senden
        await saveTodoDb(deletedName, "gelöscht 🗑️");

        // UI neu zeichnen
        renderTodoList();

        // Badge aktualisieren, falls eine fällige Aufgabe gelöscht wurde
        if (typeof updateAppBadges === "function") {
            updateAppBadges();
        }
    } else if (!taskToDelete) {
        console.error("Löschen fehlgeschlagen: Aufgabe mit ID " + id + " nicht gefunden.");
    }
}  
      
function addTodo(manualName = null) {
    const i = document.getElementById("in-todo");
    tempTodoName = manualName || i.value.trim();
    if (!tempTodoName) return;

    // 1. Auswahlmenü (Dropdown) im Fenster finden
    const select = document.getElementById("modalAssignee");

    // 2. Dropdown leeren und mit "Niemand" starten
    select.innerHTML = '<option value="">Niemand (Alle)</option>'; 

    // 3. Alle User aus deiner 'users' Liste hinzufügen
    users.forEach(uStr => {
        const uName = uStr.split(':')[0]; 
        const option = document.createElement("option");
        option.value = uName;
        option.innerText = uName;

        // 4. Automatisch den aktuell angemeldeten User vor-auswählen
        if (uName === user) {
            option.selected = true;
        }

        select.appendChild(option);
    });

    // 5. Titel setzen
    document.getElementById("modalTitle").innerText = `Intervall für "${tempTodoName}"`;
    
    // 6. Standardwerte für Intervall und UHRZEIT setzen
    document.getElementById("modalValue").value = "1";
    
    // --- HIER DIE RICHTIGE ERGÄNZUNG FÜR DIE UHRZEIT ---
    // Wir setzen beim Öffnen standardmäßig 10:00 Uhr
    const timeInput = document.getElementById("modalTime");
    if (timeInput) {
        timeInput.value = "10:00"; 
    }

    // 7. Fenster öffnen
    document.getElementById("intervalModal").style.display = "flex";

    // 8. Eingabefeld leeren, falls es kein Favorit (manualName) war
    if (!manualName) i.value = ""; 

    // 9. Wochentage zurücksetzen (damit nichts vom letzten Mal hängen bleibt)
    selectedDays = [];
    document.querySelectorAll('.day-dot').forEach(dot => dot.classList.remove('active'));
}

let selectedDays = []; // Speicher für Mo-So (1-0)

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
    const timeInput = document.getElementById("modalTime"); // NEU: Das Uhrzeit-Feld

    let nextDate;
    let hours;
    const now = new Date();
    
    // Uhrzeit auslesen (z.B. "10:30")
    const timeVal = timeInput ? timeInput.value : "10:00";
    const [hrs, mins] = timeVal.split(':').map(Number);

    // FALL 1: Festes Datum
    if (einheit === 'date') {
        if (!dateInput.value) { alert("Bitte Datum auswählen!"); return; }
        nextDate = new Date(dateInput.value);
        // Hier nehmen wir die Uhrzeit direkt aus dem Zeit-Feld, falls im Datum-Picker keine Uhrzeit war
        nextDate.setHours(hrs, mins, 0, 0);
        
        const diffMs = nextDate.getTime() - now.getTime();
        hours = Math.max(1, Math.round(diffMs / 3600000)); 
    } 
    // FALL 2: Wochentage
    else if (einheit === 'days') {
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

        // --- UHRZEIT AUS DEM FELD SETZEN ---
        nextDate.setHours(hrs, mins, 0, 0);
    
        hours = wochenRhythmus * 7 * 24; 
    }
    // FALL 3: Stunden oder Tage
    else {
        const val = parseFloat(valInput.value.replace(',', '.'));
        if (isNaN(val) || val <= 0) { alert("Bitte eine Zahl eingeben!"); return; }
        
        hours = (einheit === 't') ? val * 24 : val;
        
        // Bei Intervallen in TAGEN ('t') wollen wir meistens die exakte Uhrzeit
        if (einheit === 't') {
            nextDate = new Date(now);
            nextDate.setDate(now.getDate() + Math.round(val));
            nextDate.setHours(hrs, mins, 0, 0);
        } else {
            // Bei STUNDEN rechnen wir einfach stumpf drauf (z.B. alle 4 Stunden)
            nextDate = new Date(now.getTime() + (hours * 3600000));
        }
    }

    // Das fertige Aufgaben-Objekt
    const newTodo = { 
        id: Date.now(), 
        name: tempTodoName, 
        room: activeRoom, 
        assignedTo: assigneeInput.value,
        time: timeVal, // WICHTIG: Die Zeit fest im Objekt speichern!
        intervalHours: hours, 
        selectedWeekdays: einheit === 'days' ? [...selectedDays] : null,
        weeks: (einheit === 'days') ? (parseInt(valInput.value) || 1) : 1, // Wochen-Rhythmus merken
        lastDone: now.toISOString(), 
        nextDate: nextDate.toISOString() 
    };

    // Speichern
    todoDb.push(newTodo);
    await saveTodoDb(newTodo.name, "neu erstellt 🆕");

    // Modal schließen und aufräumen
    document.getElementById("intervalModal").style.display = "none";
    
    if(dateInput) dateInput.value = ""; 
    valInput.value = "1"; 
    if(timeInput) timeInput.value = "10:00"; // Wieder auf Standard setzen
    selectedDays = []; 
    document.querySelectorAll('.day-dot').forEach(dot => dot.classList.remove('active'));

    renderTodoList();
}
    
    // --- BEARBEITEN FUNKTIONEN ---

function openEdit(id) {
    const t = todoDb.find(x => String(x.id) === String(id));
    
    if(t) {
        // ID und Name setzen
        document.getElementById('edit-id').value = t.id;
        document.getElementById('edit-name').value = t.name;
        
        // --- BENUTZER (ASSIGNEE) STABIL LADEN ---
        const editSelect = document.getElementById('edit-assignee');
        if (editSelect) {
            // Liste leeren und Standard-Option setzen
            editSelect.innerHTML = '<option value="">Niemand (Alle)</option>';
            
            // Namen direkt aus der globalen 'users' Variable generieren
            if (typeof users !== 'undefined' && Array.isArray(users)) {
                users.forEach(uStr => {
                    const uName = uStr.split(':')[0]; 
                    const option = document.createElement("option");
                    option.value = uName;
                    option.innerText = uName;
                    
                    // Den aktuell gespeicherten Benutzer vor-auswählen
                    if (uName === t.assignedTo) {
                        option.selected = true;
                    }
                    editSelect.appendChild(option);
                });
            }
            
            // Falls t.assignedTo leer war, wird automatisch "Niemand" gewählt
            if (!t.assignedTo) {
                editSelect.value = "";
            }
        }

        // --- Rhythmus berechnen ---
        let displayVal;
        if (t.selectedWeekdays && t.selectedWeekdays.length > 0) {
            displayVal = Math.round(t.intervalHours / 168); 
        } else {
            displayVal = (t.intervalHours >= 24) ? t.intervalHours / 24 : t.intervalHours;
        }
        
        const intervalInput = document.getElementById('edit-interval-val');
        if(intervalInput) intervalInput.value = displayVal;

        // --- UHRZEIT LADEN ---
        const timeInput = document.getElementById('edit-time');
        if(timeInput) {
            timeInput.value = t.time || "10:00"; 
        }

        // Datum für das Input-Feld formatieren (nächstes Datum)
        if(t.nextDate) {
            const date = new Date(t.nextDate);
            const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            const dateInput = document.getElementById('edit-date-val');
            if(dateInput) dateInput.value = local;
        }

        // Wochentage laden
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
        
        // Modal anzeigen
        const modal = document.getElementById('editModal');
        if(modal) modal.style.display = 'flex';
    } else {
        console.error("Bearbeiten fehlgeschlagen: ID " + id + " nicht gefunden.");
    }
}    

    // 2. Das Fenster schließen
    function closeEdit() {
        document.getElementById('editModal').style.display = 'none';
    }

async function saveEdit(modus) {
    const id = document.getElementById('edit-id').value;
    // Wichtig: String-Vergleich für maximale Kompatibilität
    const idx = todoDb.findIndex(t => String(t.id) === String(id));
    if(idx === -1) return;

    const name = document.getElementById('edit-name').value.trim();
    const val = parseFloat(document.getElementById('edit-interval-val').value) || 1;
    const dateVal = document.getElementById('edit-date-val').value;
    const assignee = document.getElementById('edit-assignee').value;
    
    // --- NEU: Uhrzeit auslesen ---
    const timeVal = document.getElementById('edit-time').value || "10:00";
    const [hrs, mins] = timeVal.split(':').map(Number);
    // ------------------------------

    const now = new Date();

    // Grunddaten aktualisieren
    todoDb[idx].name = name;
    todoDb[idx].assignedTo = assignee; 
    todoDb[idx].time = timeVal; // Uhrzeit fest im Objekt speichern

    if (modus === 'date') {
        if(!dateVal) return alert("Bitte Datum wählen!");
        const targetDate = new Date(dateVal);
        
        // Gewählte Uhrzeit in das Zieldatum einrechnen
        targetDate.setHours(hrs, mins, 0, 0);
        
        todoDb[idx].nextDate = targetDate.toISOString();
        const diff = targetDate - now;
        todoDb[idx].intervalHours = Math.max(1, Math.round(diff / (1000 * 60 * 60)));
        
        delete todoDb[idx].selectedDays;
        delete todoDb[idx].weeks;
    } 
    else if (modus === 'days') {
        if (!selectedDays || selectedDays.length === 0) return alert("Bitte Wochentage wählen!");
        
        todoDb[idx].selectedDays = [...selectedDays];
        const wochenRhythmus = Math.max(1, Math.round(val)); 
        todoDb[idx].weeks = wochenRhythmus;
        
        let tageDiff = -1;

        for (let i = 0; i <= 7; i++) {
            let temp = new Date();
            temp.setDate(temp.getDate() + i);
            
            // --- NEU: Gewählte Uhrzeit statt fester 10 Uhr ---
            temp.setHours(hrs, mins, 0, 0);
            
            if (selectedDays.includes(temp.getDay())) {
                // Prüfen, ob der Termin heute schon in der Vergangenheit liegt
                if (i === 0 && temp < now) continue;
                
                tageDiff = i;
                break;
            }
        }

        if (tageDiff === -1) tageDiff = 7; 

        let finalDate = new Date();
        finalDate.setDate(now.getDate() + tageDiff + ((wochenRhythmus - 1) * 7));
        
        // --- NEU: Uhrzeit setzen ---
        finalDate.setHours(hrs, mins, 0, 0);

        todoDb[idx].nextDate = finalDate.toISOString();
        todoDb[idx].intervalHours = wochenRhythmus * 168; 
    } 
    else {
        // Modus 's' (Stunden) oder 't' (Tage)
        const hours = (modus === 't') ? val * 24 : val;
        todoDb[idx].intervalHours = hours;
        
        let nextDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));
        
        // Wenn in TAGEN gerechnet wird, die Uhrzeit wieder auf die Zielzeit setzen
        if (modus === 't') {
            nextDate.setHours(hrs, mins, 0, 0);
        }

        todoDb[idx].nextDate = nextDate.toISOString();
        
        delete todoDb[idx].selectedDays;
        delete todoDb[idx].weeks;
    }

    // Speichern und UI aktualisieren
    await saveTodoDb(name, "bearbeitet ✏️");
    
    // Falls vorhanden, Modal schließen
    if (typeof closeEdit === "function") {
        closeEdit();
    } else {
        document.getElementById('editModal').style.display = 'none';
    }
    
    renderTodoList();
}    

function renderTodoList() {
    // 1. Sidebar-Badges zuerst aktualisieren
    if (typeof renderSidebars === "function") {
        renderSidebars();
    }

    const ul = document.getElementById("list-todo"); 
    if (!ul) return; 
    ul.innerHTML = "";

    // 2. Filtern nach aktivem Raum und SORTIEREN (nach Datum UND Uhrzeit)
    const filtered = todoDb
        .filter(t => t.room === activeRoom)
        .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));
    
    if (!filtered.length) { 
        ul.innerHTML = "<li style='text-align:center; padding:20px;'>Raum sauber! ✨</li>"; 
        return; 
    }

    const now = new Date();
    // Vergleichsdatum für "Heute" (Mitternacht)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    filtered.forEach(t => {
        const next = new Date(t.nextDate);
        const diffMs = next - now;
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        
        // Berechnung für die Anzeige "In X Tagen"
        const tempNext = new Date(t.nextDate);
        const diffDays = Math.floor((tempNext.setHours(0,0,0,0) - todayStart.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        
        const isOverdue = diffMs < 0; 
        
        // --- Status-Farben und Texte festlegen ---
        let statusColor = "var(--primary)"; 
        let timeText = `In ${diffDays} Tg.`;

        if (isOverdue) {
            statusColor = "var(--danger)"; 
            timeText = "ÜBERFÄLLIG";
        } else if (diffHours < 1) {
            statusColor = "var(--accent)"; 
            timeText = "SOFORT!";
        } else if (diffDays === 0) {
            statusColor = "var(--accent)"; 
            timeText = "Heute";
        } else if (diffDays === 1) {
            statusColor = "#f39c12"; 
            timeText = "Morgen";
        }

        let btnLabel = isOverdue ? "Zurücksetzen 🔄" : "Erledigt ✅";

        // --- Zeit-Formatierung (Inklusive Uhrzeit!) ---
        const formatDT = (isoStr) => {
            if (!isoStr) return '---';
            const d = new Date(isoStr);
            const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' });
            const datePart = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            const timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return `${weekday}, ${datePart} ${timePart}`;
        };
        
        const li = document.createElement("li");
        // Blinken bei Überfälligkeit oder wenn es in den nächsten 6 Stunden fällig ist
        if (diffHours <= 6 || isOverdue) li.classList.add("urgent-blink");

        // HTML-Struktur mit Buttons (WICHTIG: IDs in '${t.id}' wegen Text-IDs)
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
    
    // 3. App-Badges (unten in der Tab-Bar) aktualisieren
    if (typeof updateAppBadges === "function") {
        updateAppBadges();
    }
}

    async function syncDown() {
        try {
            console.log("🔄 SyncDown gestartet...");

            // 1. Admin-Passwort laden
            const rPw = await fetch(`${HA_URL}/api/states/${ADMIN_PW_ENTITY}`, { 
                headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
            });
            const dPw = await rPw.json();
            if (dPw.state && dPw.state !== "unknown" && dPw.state !== "unavailable") {
                ADMIN_PW = dPw.state;
            }

            // 2. Favoriten-Chips laden (Shop, Food & Todo-Buttons)
            for (let t of ['shop', 'food', 'todo']) {
                const cfg = SYNC_CONFIG[t]; // Holt die Config für den aktuellen Schleifen-Durchlauf
    
                // Abfrage an den jeweiligen Sensor (z.B. sensor.haushalt_food_favs_storage)
                const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
                    headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
                });
                const d = await r.json();

                // WICHTIG: Prüfen, ob der Sensor existiert und das Attribut hat
                if (d && d.attributes && d.attributes[cfg.attr]) {
                    let rawData = d.attributes[cfg.attr];
                    let parsed;

                    // Falls HA den Inhalt als String (Text) liefert, müssen wir ihn parsen
                    if (typeof rawData === 'string') {
                        try {
                            parsed = JSON.parse(rawData);
                        } catch(e) {
                            console.error(`Fehler beim Parsen von ${t}:`, e);
                            parsed = { cats: ["Alle"], favs: [] };
                        }
                    } else {
                        // Falls HA es direkt als Objekt liefert (JSON-Format)
                        parsed = rawData;
                    }

                    // Jetzt die Daten in deine lokale App-Datenbank (db) schreiben
                    if (parsed) {
                        db[t].cats = parsed.cats || ["Alle"];
                        db[t].favs = parsed.favs || [];
                        console.log(`✅ ${t} Favoriten erfolgreich geladen:`, db[t]);
                    }
                } else {
                    console.warn(`⚠️ Konnte Attribut ${cfg.attr} in ${cfg.entity} nicht finden.`);
                }
            }

            // 3. Parallel alle Listen und den TRIGGER-SENSOR laden
            const [rStores, rRooms, rTodoData] = await Promise.all([
                fetch(`${HA_URL}/api/states/${STORES_ENTITY}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} }),
                fetch(`${HA_URL}/api/states/${ROOMS_ENTITY}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} }),
                fetch(`${HA_URL}/api/states/${TODO_DATA_ENTITY}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} })
            ]);
 
            const dSt = await rStores.json();
            const dR = await rRooms.json();
            const dTodo = await rTodoData.json();

            // 4. Läden und Räume verarbeiten
            if (dSt.state?.startsWith('[')) stores = JSON.parse(dSt.state);
            if (dR.state?.startsWith('[')) rooms = JSON.parse(dR.state);

            // 5. AUFGABEN verarbeiten
            if (dTodo && dTodo.attributes && dTodo.attributes.tasks_json) {
                try {
                    let rawData = dTodo.attributes.tasks_json;
                    let savedTasks;

                    // FIX: Falls HA den String doppelt escaped hat oder als Objekt schickt
                    if (typeof rawData === 'string') {
                        savedTasks = JSON.parse(rawData);
                    } else {
                        savedTasks = rawData; 
                    }

                    if (Array.isArray(savedTasks)) {
                        todoDb = savedTasks;
                        console.log("✅ Aufgaben geladen:", todoDb.length);
                    }
                } catch (jsonErr) {
                    console.error("❌ JSON-Fehler bei Aufgaben:", jsonErr);
                }
            } else {
                console.warn("⚠️ Aufgaben-Sensor liefert keine Daten.");
            }

            // 6. UI AKTUALISIEREN
            // Wichtig: Wir rendern nur, wenn wir nicht mehr im Login-Bildschirm sind
            if (document.getElementById("app").style.display !== "none") {
                renderSidebars(); 
                render(); 
            
                // Nur wenn der Todo-Tab aktiv ist UND das Element existiert
                if (curTab === 'todo' && document.getElementById("list-todo")) {
                    renderTodoList(); 
                }
            
                // load() kümmert sich um die Einkaufsliste (Shop) oder den Essensplan (Food)
                if (typeof load === 'function') {
                    load();
               }
            }

            console.log("✅ SyncDown erfolgreich abgeschlossen.");

        } catch(e) {
            console.error("❌ Kritischer Fehler in syncDown:", e);
        }
    }

    async function syncUp() { 
        // 1. Die Konfiguration für den aktuellen Tab (shop, food oder todo) holen
        const cfg = SYNC_CONFIG[curTab];
    
        // Sicherheitscheck: Falls der Tab nicht in SYNC_CONFIG steht (z.B. 'trash'), nichts tun
        if (!cfg) {
            console.warn(`⚠️ syncUp abgebrochen: Keine Konfiguration für ${curTab} gefunden.`);
            return;
        }

        // 2. Die Daten (Kategorien & Favoriten) in einen JSON-String umwandeln
        const data = JSON.stringify(db[curTab]);

        try { 
            // 3. Den API-Aufruf an den Event-Endpunkt von Home Assistant senden
            const response = await fetch(`${HA_URL}/api/events/${cfg.event}`, { 
                method: 'POST', 
                headers: {
                    'Authorization': `Bearer ${HA_TOKEN}`, 
                    'Content-Type': 'application/json'
                }, 
                // Hier senden wir das JSON-Objekt mit dem Key 'favs'
                body: JSON.stringify({ 
                    favs: data 
                }) 
            });

            if (response.ok) {
                console.log(`✅ Favoriten für ${curTab} erfolgreich per Event (${cfg.event}) gespeichert.`);
            } else {
                console.error(`❌ Fehler beim Speichern: Status ${response.status}`);
            }

        } catch(e) {
            console.error(`❌ Kritischer Fehler beim Speichern der Favoriten für ${curTab}:`, e);
        } 
    }

async function load() {
    // --- NEU: Sidebar immer aktualisieren, egal welcher Tab offen ist ---
    // Das sorgt dafür, dass die Zahlen an den Räumen/Läden im Hintergrund mitlaufen
    if (typeof renderSidebars === "function") {
        await renderSidebars();
    }

    // 1. Abbrechen, wenn Müll-Tab offen oder gerade ein Update läuft
    if(curTab==='trash' || isUpdatingFood) return;

    // 2. Logik für Aufgaben
    if(curTab==='todo') { 
        renderTodoList(); 
        return; 
    }

    // 3. Logik für Essensplan
    if(curTab==='food') {
        for(let i=0; i<7; i++) {
            try {
                const r = await fetch(`${HA_URL}/api/states/${FOOD_ENTITIES[i]}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} });
                const d = await r.json(); 
                
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

                if(inp && document.activeElement !== inp) {
                    const raw = (d.state==='unknown'||d.state==='---') ? '' : d.state;
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

    // 4. Logik für Einkaufsliste
    if(curTab === 'shop') {
        try {
            const cfg = SYNC_CONFIG.shopping;
            const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} });
            const d = await r.json(); 

            let fullList = [];
            if (d && d.attributes && d.attributes[cfg.attr]) {
                const rawData = d.attributes[cfg.attr];
                fullList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
            }

            let filtered = fullList.filter(o => o.endsWith(` @${activeStore}`));

            document.getElementById("list-shop").innerHTML = filtered.reverse().map(t => 
                `<li style="flex-direction:row; align-items:center;">
                    <span>${t.split(' @')[0]}</span>
                    <button class="btn-del-item" onclick="delItem('${t}')">X</button>
                </li>`
            ).join('') || "<li>Leer! ✨</li>";

        } catch(e) {
            console.error("Fehler beim Laden der Einkaufsliste aus Attributen", e);
            document.getElementById("list-shop").innerHTML = "<li>Fehler beim Laden ⚠️</li>";
        }
    }

    // --- BADGE UPDATE AM ENDE (für die untere Leiste) ---
    if (typeof updateAppBadges === "function") {
        updateAppBadges();
    }
}

async function delItem(t) {
    try {
        const cfg = SYNC_CONFIG.shopping;
        
        // 1. Die aktuelle Liste aus dem Trigger-Sensor laden
        const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        const d = await r.json();

        let currentList = [];
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            currentList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }

        // 2. Den Artikel aus der Liste filtern (löschen)
        const newList = currentList.filter(x => x !== t);

        // 3. Die aktualisierte Liste per Event an HA senden
        const response = await fetch(`${HA_URL}/api/events/${cfg.event}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                json_data: newList
            })
        });

        if (response.ok) {
            console.log(`✅ Artikel "${t}" gelöscht und Liste synchronisiert.`);
            
            // 4. Liste im UI neu laden
            await load();
            
            // --- BADGE UPDATE SOFORT AUSFÜHREN ---
            if (typeof updateAppBadges === "function") {
                updateAppBadges();
            }
            
        } else {
            console.error("❌ Fehler beim Senden des Lösch-Events an HA.");
        }

    } catch (e) {
        console.error("❌ Kritischer Fehler in delItem:", e);
    }
}

    function deleteCat(type, name) { if(name !== 'Alle' && confirm(`Löschen?`)) { db[type].cats = db[type].cats.filter(x => x !== name); db[type].favs = db[type].favs.filter(x => x.c !== name); curCat = "Alle"; syncUp(); render(); } }
    async function deleteFav(idx) { if(confirm("Favorit löschen?")) { db[curTab].favs.splice(idx, 1); await syncUp(); render(); } }

    function render() {
        const cBox = document.getElementById(`cats-${curTab}`); if(!cBox) return; cBox.innerHTML = "";
        db[curTab].cats.forEach(c => { 
            const b = document.createElement('button'); b.className = `cat-btn ${curCat === c ? 'active-'+curTab : ''}`; b.innerText = c; b.onclick = () => { curCat = c; render(); }; b.oncontextmenu = (e) => { e.preventDefault(); deleteCat(curTab, c); }; cBox.appendChild(b); 
        });
        const fBox = document.getElementById(`favs-${curTab}`); if(!fBox) return; fBox.innerHTML = "";
        staticFavs[curTab]?.forEach(f => { if(curCat==='Alle'||f.c===curCat) fBox.appendChild(createFavChip(f, false)); });
        db[curTab].favs.forEach((f, idx) => { if(curCat==='Alle'||f.c===curCat) fBox.appendChild(createFavChip(f, true, idx)); });
    }

    function createFavChip(f, isCustom, idx) {
        const chip = document.createElement('div'); 
        chip.className = 'fav-chip'; 
        chip.innerHTML = `<span>${f.n}</span>`;
    
        // Lösch-Button für eigene Favoriten
        if(isCustom) { 
            const del = document.createElement('span'); 
            del.innerHTML = " ×"; 
            del.className = "del-fav"; 
            del.onclick = (e) => { e.stopPropagation(); deleteFav(idx); }; 
            chip.appendChild(del); 
        }
    
        // Klick-Logik
        chip.onclick = () => { 
            if(curTab === 'shop') {
                addShop(f.n); 
            } else if(curTab === 'food') {
                 // Fragt nach dem Tag (0=Mo bis 6=So)
                const d = prompt("Für welchen Tag? (0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr, 5=Sa, 6=So)", new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
            
                if(d !== null && d !== "") {
                     const dayIdx = parseInt(d);
                    if(dayIdx >= 0 && dayIdx <= 6) {
                       // Trägt den Favoriten in das Textfeld ein
                        document.getElementById('plan-' + dayIdx).value = f.n;
                        // Ruft saveFood auf, damit auch der Koch aus dem Dropdown mitgespeichert wird
                        saveFood(dayIdx); 
                    } else {
                        alert("Bitte eine Zahl zwischen 0 und 6 eingeben.");
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
        // Liste um 'finance' erweitert
        ['shop','food','todo','trash','finance'].forEach(v => { 
            const view = document.getElementById('v-'+v);
            const tabBtn = document.getElementById('t-'+v);
            if(view) view.style.display = t===v?'block':'none'; 
            if(tabBtn) tabBtn.className = `tab-item ${t===v?'active-'+t:''}`; 
        }); 
    
        if(t==='trash') { 
            loadTrash(); 
        } else if(t==='finance') {
            loadFinance(); // Ruft deine neue Funktion aus finance.js auf
        } else { 
            render(); 
            load(); 
            renderSidebars(); 
        } 
    }

    let tempShopItem = ""; // Merkt sich den Artikelnamen

    async function addShop(manual) {
        const i = document.getElementById("in-shop");
        tempShopItem = manual || i.value.trim();
    
        if (tempShopItem) {
        // Titel im Popup anpassen (z.B. "Wieviel Äpfel?")
        document.getElementById("shopQtyTitle").innerText = `Menge für "${tempShopItem}"`;
        document.getElementById("shopQtyValue").value = "1"; 
        document.getElementById("shopQtyModal").style.display = "flex";
        
        // Fokus auf das Feld setzen und Text markieren
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

    // Formatierung: z.B. "3x Milch" oder einfach nur "Brot"
    const vollerName = (qty > 1) ? `${qty}x ${tempShopItem}` : tempShopItem;

    try {
        const cfg = SYNC_CONFIG.shopping;

        // 1. Aktuelle Liste vom neuen Trigger-Sensor holen
        const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        const data = await r.json();

        let currentList = [];
        // Daten aus dem Attribut holen (shopping_json)
        if (data && data.attributes && data.attributes[cfg.attr]) {
            const rawData = data.attributes[cfg.attr];
            currentList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }

        // 2. Neuen Artikel mit Laden-Kürzel (@Aldi etc.) hinzufügen
        currentList.push(`${vollerName} @${activeStore}`);

        // 3. Die gesamte Liste per Event an Home Assistant senden
        // WICHTIG: Das Event heißt "set_shopping_data", die Daten liegen in "json_data"
        const response = await fetch(`${HA_URL}/api/events/${cfg.event}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                json_data: currentList
            })
        });

        if (response.ok) {
            console.log(`✅ "${vollerName}" zu ${activeStore} hinzugefügt.`);
            
            // Modal schließen und Liste im Dashboard sofort aktualisieren
            document.getElementById("shopQtyModal").style.display = "none";
            load(); 
        } else {
            throw new Error("Fehler beim Senden des Events");
        }

    } catch (e) {
        console.error("Fehler beim Hinzufügen zum Einkauf:", e);
        alert("Fehler beim Speichern! Prüfe die Verbindung zu Home Assistant.");
    }
}

    async function saveFood(idx) {
        isUpdatingFood = true;
    
        // Holt das Gericht aus dem Textfeld
        const dish = document.getElementById(`plan-${idx}`).value.trim();
        // Holt den Koch aus dem neuen Dropdown
        const cook = document.getElementById(`cook-${idx}`).value;
    
        // Kombiniert beides: "Pizza | Domenic" oder nur "Pizza", wenn kein Koch gewählt ist
        const finalValue = cook ? `${dish} | ${cook}` : dish;

        try {
            await fetch(`${HA_URL}/api/services/input_text/set_value`, { 
                method: 'POST', 
                headers: {
                    'Authorization': `Bearer ${HA_TOKEN}`, 
                    'Content-Type': 'application/json'
                }, 
                body: JSON.stringify({ 
                     entity_id: FOOD_ENTITIES[idx], 
                     value: finalValue 
                }) 
            });
        } catch (e) {
            console.error("Fehler beim Speichern des Essensplans:", e);
        }
    
        // Kurze Sperre aufheben, damit der Sync wieder laufen kann
        setTimeout(() => {
            isUpdatingFood = false;
        }, 500);
    }
    function highlightToday() { let d=new Date().getDay(); let idx=d===0?6:d-1; document.querySelectorAll('.day-card').forEach(c=>c.classList.remove('today')); if(document.getElementById('card-'+idx)) document.getElementById('card-'+idx).classList.add('today'); }
    function clearWeek() { if(confirm("Ganze Woche löschen?")) { for(let i=0; i<7; i++) { document.getElementById('plan-'+i).value=''; saveFood(i); } } }

async function loadTrash() {
    let h = ""; 
    try { 
        for (const s of TRASH_CONFIG) { 
            const [rDays, rDate] = await Promise.all([ 
                fetch(`${HA_URL}/api/states/${s.id}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} }), 
                fetch(`${HA_URL}/api/states/${s.dateId}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} }) 
            ]);
            const dDays = await rDays.json(); 
            const dDate = await rDate.json();
            
            let tage = dDays.state; 
            let rohDatum = dDate.state;

            let dF = "Unbekannt";
            let dateObj = null;
            
            if (rohDatum && rohDatum !== "unknown" && rohDatum !== "unavailable") {
                if (rohDatum.includes('.')) {
                    dF = rohDatum; 
                    // Konvertiert DD.MM.YYYY zu Date Objekt für die Logik unten
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

            // --- NEU: AUTOMATIK-LOGIK FÜR TODO ---
            if (dateObj && !isNaN(dateObj.getTime())) {
                const taskName = `🗑️ ${s.name} rausstellen`;
                
                // Wir planen die Aufgabe für den ABEND DAVOR (18:00 Uhr)
                let reminderDate = new Date(dateObj);
                reminderDate.setDate(reminderDate.getDate() - 1);
                reminderDate.setHours(18, 0, 0, 0);

                // Prüfen, ob genau diese Aufgabe für diesen Termin schon in der todoDb ist
                const taskExists = todoDb.some(t => t.name === taskName && t.nextDate.startsWith(reminderDate.toISOString().split('T')[0]));

                // Nur hinzufügen, wenn der Termin noch in der Zukunft liegt und noch nicht existiert
                if (!taskExists && reminderDate > new Date()) {
                    const newTrashTodo = {
                        id: "trash-" + s.name + "-" + reminderDate.getTime(),
                        name: taskName,
                        room: "Müllabfuhr", // Muss exakt einer deiner Räume sein
                        assignedTo: "Alle",
                        intervalHours: 0, // Einmalig
                        lastDone: null,
                        nextDate: reminderDate.toISOString()
                    };
                    
                    todoDb.push(newTrashTodo);
                    // Leises Speichern ohne Benachrichtigung
                    saveTodoDb(taskName, "automatisch geplant 🤖"); 
                }
            }
            // --- ENDE AUTOMATIK ---

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
        
        // ToDo Liste aktualisieren, falls wir im ToDo Tab sind
        if(curTab === 'todo') renderTodoList();

    } catch (e) { 
        console.error("Fehler beim Laden des Müll-Syncs:", e);
        document.getElementById("trash-content").innerHTML = "Fehler beim Laden!"; 
    }
}
    
async function syncTrashToTodos() {
    // Wir gehen alle Müllsorten aus deiner TRASH_CONFIG durch
    for (const s of TRASH_CONFIG) {
        try {
            // 1. Hol das Datum vom HA Sensor
            const rDate = await fetch(`${HA_URL}/api/states/${s.dateId}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} });
            const dDate = await rDate.json();
            const rohDatum = dDate.state;

            if (rohDatum && rohDatum !== "unknown" && rohDatum !== "unavailable") {
                let termin = new Date(rohDatum);
                // Wir setzen den Termin auf den ABEND DAVOR (z.B. 18 Uhr), damit man den Müll rausstellt
                termin.setDate(termin.getDate() - 1); 
                termin.setHours(18, 0, 0, 0);

                const taskName = `🗑️ ${s.name} rausstellen`;
                
                // 2. Prüfen, ob diese Aufgabe für dieses Datum schon existiert
                const exists = todoDb.some(t => t.name === taskName && t.nextDate.startsWith(termin.toISOString().split('T')[0]));

                if (!exists) {
                    console.log(`🤖 Automatik: Neue Aufgabe für ${s.name} am ${termin.toLocaleDateString()} erstellt.`);
                    
                    const newTrashTodo = {
                        id: Date.now() + Math.random(), // Eindeutige ID
                        name: taskName,
                        room: "Müllabfuhr", // Muss exakt so heißen wie einer deiner rooms
                        assignedTo: "Alle",
                        intervalHours: 0, // Kein festes Intervall, da vom Kalender gesteuert
                        lastDone: null,
                        nextDate: termin.toISOString()
                    };

                    todoDb.push(newTrashTodo);
                    // Wir speichern das ohne Handy-Benachrichtigung, damit es nicht nervt
                    await saveTodoDb(taskName, "automatisch geplant 🤖"); 
                }
            }
        } catch (e) {
            console.error("Fehler beim Müll-Sync:", e);
        }
    }
    renderTodoList();
}    

    function logout() { sessionStorage.clear(); localStorage.removeItem("selectedUser"); location.reload(); }

    function updateStatus() { 
        if (!user) return; 
        const timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); 
        const statusElem = document.getElementById("statusInfo"); 
        
        let firstLineContent = (user === "Tablet") ? `📺 ${user} • ${timeStr}` : `${user} • ${timeStr}`;
        const coloredLine = `<span class="user-name-gradient">${firstLineContent}</span>`;

        if (user !== "Tablet") { 
            const diff = Date.now() - lastActivity; const timeLeft = 600000 - diff; 
            if (timeLeft <= 0) logout(); 
            const min = Math.floor(timeLeft / 60000); const sec = Math.floor((timeLeft % 60000) / 1000); 
            statusElem.innerHTML = `${coloredLine}<br><span style="font-size:0.8rem; color:var(--danger); font-weight:bold;">Logout: ${min}:${sec < 10 ? '0' : ''}${sec}</span>`; 
        } else { statusElem.innerHTML = coloredLine; } 
    }

async function updateAppBadges() {
    // --- 1. SHOP GLOBAL ZÄHLEN (Alle Läden zusammen) ---
    try {
        const cfg = SYNC_CONFIG.shopping;
        const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        const d = await r.json();
        
        let totalShopCount = 0;
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            const allItems = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
            // Wir zählen einfach ALLES, was in der Liste steht
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

    // --- 2. TODO ZÄHLEN (Wie bisher) ---
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    // Hier zählen wir alle Aufgaben (außer Raum "Müll"), damit die Badge 
    // auch bei leeren Räumen aktiv bleibt
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

    
