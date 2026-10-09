    let isSessionActive = sessionStorage.getItem("session_active");
    let storedUser = localStorage.getItem("selectedUser");
    let user = (isSessionActive || storedUser === "Tablet") ? storedUser : "";
    
    let curTab = sessionStorage.getItem("current_tab") || "shop";
    let curTheme = localStorage.getItem("app_theme") || "theme-light";
    let users = ["Admin:admin", "Tablet:tablet"]; 
    
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
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        const dropdown = document.getElementById("themeDropdown");
    
        if (dropdown) {
            dropdown.classList.toggle("show");
            console.log("Menü geklickt! Sichtbar:", dropdown.classList.contains("show"));
        } else {
            alert("Kritischer Fehler: Menü-ID 'themeDropdown' nicht im HTML gefunden!");
        }
    }

    function setTheme(themeName) {
        const themes = ["theme-light", "theme-dark", "theme-glass", "theme-blue", "theme-green"];
        
        document.body.classList.remove(...themes);
        curTheme = themeName;
        document.body.className = curTheme;
        localStorage.setItem("app_theme", curTheme);
        
        const dropdown = document.getElementById("themeDropdown");
        if (dropdown) dropdown.classList.remove("show");
    }

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

            await startApp(); 
        
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
            eyeBtn.innerText = "🔒";
        } else {
            pwInput.type = "password";
            eyeBtn.innerText = "👁️";
        }
    }

    async function startApp() {
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("app").style.display = "block";

        console.log("Starte initialen Daten-Sync...");
        await syncDown();
        console.log("Initialer Sync abgeschlossen.");

        tab(curTab); 

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
    let allOptions = [];
    try {
        const cfg = SYNC_CONFIG.shopping;
        const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        const d = await r.json();
        
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            allOptions = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }
    } catch(e) { 
        console.error("Sidebar-Zählung Shop fehlgeschlagen", e); 
    }

    const shopSide = document.getElementById("shopSidebar");
    if(shopSide) {
        shopSide.innerHTML = stores.map(s => {
            const count = allOptions.filter(opt => opt.endsWith(` @${s}`)).length;
            const badge = count > 0 ? `<span class="shop-badge">${count}</span>` : '';
            
            return `<button class="side-btn ${activeStore === s ? 'active-shop' : ''}" 
                onclick="activeStore='${s}'; renderSidebars(); load();" 
                oncontextmenu="event.preventDefault(); deleteSidebarItem('shop','${s}')">
                ${s} ${badge}
            </button>`;
        }).join('') + `<button class="side-btn side-btn-add" onclick="addSidebarItem('shop')">+ Ort</button>`;
    }

    const todoSide = document.getElementById("todoSidebar");
    if(todoSide) {
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        todoSide.innerHTML = rooms.map(r => {
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

    const taskObj = (todoDb || []).find(t => 
        t.name.toLowerCase().trim() === taskName.toLowerCase().trim()
    );
    
    let roomName = "Haus";

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
    const t = todoDb.find(x => String(x.id) === String(id));
    
    if (!t) {
        console.error("Aufgabe mit ID " + id + " nicht in todoDb gefunden!");
        return;
    }

    if (confirm(`"${t.name}" erledigt?`)) {
        try {
            const now = new Date();

            if (t.room.trim() === "Müllabfuhr") {
                todoDb = todoDb.filter(x => String(x.id) !== String(id));
                await saveTodoDb(t.name, "Müll erledigt & entfernt 🗑️");
            } 
            else {
                t.lastDone = now.toISOString();
                let nextDate;

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
                else {
                    const hours = t.intervalHours || 24;
                    nextDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));
                }

                if (t.time) {
                    const [h, m] = t.time.split(':');
                    nextDate.setHours(parseInt(h), parseInt(m), 0, 0);
                } else {
                    nextDate.setHours(10, 0, 0, 0);
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
}    
     
async function deleteTodo(id) {
    const taskToDelete = todoDb.find(x => String(x.id) === String(id));
    
    if (taskToDelete && confirm(`Möchtest du "${taskToDelete.name}" wirklich löschen?`)) {
        const deletedName = taskToDelete.name;
        todoDb = todoDb.filter(x => String(x.id) !== String(id));
        await saveTodoDb(deletedName, "gelöscht 🗑️");
        renderTodoList();

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

    const select = document.getElementById("modalAssignee");
    select.innerHTML = '<option value="">Niemand (Alle)</option>'; 

    users.forEach(uStr => {
        const uName = uStr.split(':')[0]; 
        const option = document.createElement("option");
        option.value = uName;
        option.innerText = uName;

        if (uName === user) {
            option.selected = true;
        }

        select.appendChild(option);
    });

    document.getElementById("modalTitle").innerText = `Intervall für "${tempTodoName}"`;
    document.getElementById("modalValue").value = "1";
    
    const timeInput = document.getElementById("modalTime");
    if (timeInput) {
        timeInput.value = "10:00"; 
    }

    document.getElementById("intervalModal").style.display = "flex";

    if (!manualName) i.value = ""; 

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
        nextDate.setHours(hrs, mins, 0, 0);
        
        const diffMs = nextDate.getTime() - now.getTime();
        hours = Math.max(1, Math.round(diffMs / 3600000)); 
    } 
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

        nextDate.setHours(hrs, mins, 0, 0);
        hours = wochenRhythmus * 7 * 24; 
    }
    else {
        const val = parseFloat(valInput.value.replace(',', '.'));
        if (isNaN(val) || val <= 0) { alert("Bitte eine Zahl eingeben!"); return; }
        
        hours = (einheit === 't') ? val * 24 : val;
        
        if (einheit === 't') {
            nextDate = new Date(now);
            nextDate.setDate(now.getDate() + Math.round(val));
            nextDate.setHours(hrs, mins, 0, 0);
        } else {
            nextDate = new Date(now.getTime() + (hours * 3600000));
        }
    }

    const newTodo = { 
        id: Date.now(), 
        name: tempTodoName, 
        room: activeRoom, 
        assignedTo: assigneeInput.value,
        time: timeVal, 
        intervalHours: hours, 
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
                    
                    if (uName === t.assignedTo) {
                        option.selected = true;
                    }
                    editSelect.appendChild(option);
                });
            }
            
            if (!t.assignedTo) {
                editSelect.value = "";
            }
        }

        let displayVal;
        if (t.selectedWeekdays && t.selectedWeekdays.length > 0) {
            displayVal = Math.round(t.intervalHours / 168); 
        } else {
            displayVal = (t.intervalHours >= 24) ? t.intervalHours / 24 : t.intervalHours;
        }
        
        const intervalInput = document.getElementById('edit-interval-val');
        if(intervalInput) intervalInput.value = displayVal;

        const timeInput = document.getElementById('edit-time');
        if(timeInput) {
            timeInput.value = t.time || "10:00"; 
        }

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
    } else {
        console.error("Bearbeiten fehlgeschlagen: ID " + id + " nicht gefunden.");
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
    const val = parseFloat(document.getElementById('edit-interval-val').value) || 1;
    const dateVal = document.getElementById('edit-date-val').value;
    const assignee = document.getElementById('edit-assignee').value;
    
    const timeVal = document.getElementById('edit-time').value || "10:00";
    const [hrs, mins] = timeVal.split(':').map(Number);

    const now = new Date();

    todoDb[idx].name = name;
    todoDb[idx].assignedTo = assignee; 
    todoDb[idx].time = timeVal; 

    if (modus === 'date') {
        if(!dateVal) return alert("Bitte Datum wählen!");
        const targetDate = new Date(dateVal);
        
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
    } 
    else {
        const hours = (modus === 't') ? val * 24 : val;
        todoDb[idx].intervalHours = hours;
        
        let nextDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));
        
        if (modus === 't') {
            nextDate.setHours(hrs, mins, 0, 0);
        }

        todoDb[idx].nextDate = nextDate.toISOString();
        
        delete todoDb[idx].selectedDays;
        delete todoDb[idx].weeks;
    }

    await saveTodoDb(name, "bearbeitet ✏️");
    
    if (typeof closeEdit === "function") {
        closeEdit();
    } else {
        document.getElementById('editModal').style.display = 'none';
    }
    
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
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        
        const tempNext = new Date(t.nextDate);
        const diffDays = Math.floor((tempNext.setHours(0,0,0,0) - todayStart.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        
        const isOverdue = diffMs < 0; 
        
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

            const rPw = await fetch(`${HA_URL}/api/states/${ADMIN_PW_ENTITY}`, { 
                headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
            });
            const dPw = await rPw.json();
            if (dPw.state && dPw.state !== "unknown" && dPw.state !== "unavailable") {
                ADMIN_PW = dPw.state;
            }

            for (let t of ['shop', 'food', 'todo']) {
                const cfg = SYNC_CONFIG[t];
    
                const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
                    headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
                });
                const d = await r.json();

                if (d && d.attributes && d.attributes[cfg.attr]) {
                    let rawData = d.attributes[cfg.attr];
                    let parsed;

                    if (typeof rawData === 'string') {
                        try {
                            parsed = JSON.parse(rawData);
                        } catch(e) {
                            console.error(`Fehler beim Parsen von ${t}:`, e);
                            parsed = { cats: ["Alle"], favs: [] };
                        }
                    } else {
                        parsed = rawData;
                    }

                    if (parsed) {
                        db[t].cats = parsed.cats || ["Alle"];
                        db[t].favs = parsed.favs || [];
                        console.log(`✅ ${t} Favoriten erfolgreich geladen:`, db[t]);
                    }
                } else {
                    console.warn(`⚠️ Konnte Attribut ${cfg.attr} in ${cfg.entity} nicht finden.`);
                }
            }

            const [rStores, rRooms, rTodoData] = await Promise.all([
                fetch(`${HA_URL}/api/states/${STORES_ENTITY}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} }),
                fetch(`${HA_URL}/api/states/${ROOMS_ENTITY}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} }),
                fetch(`${HA_URL}/api/states/${TODO_DATA_ENTITY}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} })
            ]);
 
            const dSt = await rStores.json();
            const dR = await rRooms.json();
            const dTodo = await rTodoData.json();

            if (dSt.state?.startsWith('[')) stores = JSON.parse(dSt.state);
            if (dR.state?.startsWith('[')) rooms = JSON.parse(dR.state);

            if (dTodo && dTodo.attributes && dTodo.attributes.tasks_json) {
                try {
                    let rawData = dTodo.attributes.tasks_json;
                    let savedTasks;

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

            if (document.getElementById("app").style.display !== "none") {
                renderSidebars(); 
                render(); 
            
                if (curTab === 'todo' && document.getElementById("list-todo")) {
                    renderTodoList(); 
                }
            
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
        const cfg = SYNC_CONFIG[curTab];
    
        if (!cfg) {
            console.warn(`⚠️ syncUp abgebrochen: Keine Konfiguration für ${curTab} gefunden.`);
            return;
        }

        const data = JSON.stringify(db[curTab]);

        try { 
            const response = await fetch(`${HA_URL}/api/events/${cfg.event}`, { 
                method: 'POST', 
                headers: {
                    'Authorization': `Bearer ${HA_TOKEN}`, 
                    'Content-Type': 'application/json'
                }, 
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
    if (typeof renderSidebars === "function") {
        await renderSidebars();
    }

    if(curTab==='trash' || isUpdatingFood) return;

    if(curTab==='todo') { 
        renderTodoList(); 
        return; 
    }

    // --- ESSENSPLAN LADE-LOGIK (KORRIGIERT) ---
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

                // WICHTIGE SPERRE: Überschreibt das Feld nur, wenn es nicht aktiv bearbeitet wird
                if(inp && document.activeElement !== inp && !isUpdatingFood) {
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

    if (typeof updateAppBadges === "function") {
        updateAppBadges();
    }
}

async function delItem(t) {
    try {
        const cfg = SYNC_CONFIG.shopping;
        
        const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        const d = await r.json();

        let currentList = [];
        if (d && d.attributes && d.attributes[cfg.attr]) {
            const rawData = d.attributes[cfg.attr];
            currentList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }

        const newList = currentList.filter(x => x !== t);

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
            await load();
            
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
    
        if(isCustom) { 
            const del = document.createElement('span'); 
            del.innerHTML = " ×"; 
            del.className = "del-fav"; 
            del.onclick = (e) => { e.stopPropagation(); deleteFav(idx); }; 
            chip.appendChild(del); 
        }
    
        chip.onclick = () => { 
            if(curTab === 'shop') {
                addShop(f.n); 
            } else if(curTab === 'food') {
                const d = prompt("Für welchen Tag? (0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr, 5=Sa, 6=So)", new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
            
                if(d !== null && d !== "") {
                     const dayIdx = parseInt(d);
                    if(dayIdx >= 0 && dayIdx <= 6) {
                        document.getElementById('plan-' + dayIdx).value = f.n;
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

        const r = await fetch(`${HA_URL}/api/states/${cfg.entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        const data = await r.json();

        let currentList = [];
        if (data && data.attributes && data.attributes[cfg.attr]) {
            const rawData = data.attributes[cfg.attr];
            currentList = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
        }

        currentList.push(`${vollerName} @${activeStore}`);

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

    // --- ESSENSPLAN SPEICHER-LOGIK (KORRIGIERT) ---
    async function saveFood(idx) {
        isUpdatingFood = true;
    
        const dishElem = document.getElementById(`plan-${idx}`);
        const cookElem = document.getElementById(`cook-${idx}`);
        
        if (!dishElem) return;

        const dish = dishElem.value.trim();
        const cook = cookElem ? cookElem.value : "";
    
        const finalValue = cook ? `${dish} | ${cook}` : dish;

        try {
            const response = await fetch(`${HA_URL}/api/services/input_text/set_value`, { 
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

            if (response.ok) {
                console.log(`✅ Essensplan Tag ${idx} gespeichert: ${finalValue}`);
            } else {
                console.error(`❌ Speichern fehlgeschlagen: Status ${response.status}`);
            }
        } catch (e) {
            console.error("Fehler beim Speichern des Essensplans:", e);
        }
    
        // 2 Sekunden Puffer, damit der HA-State im Backend ankommt vor dem nächsten Sync
        setTimeout(() => {
            isUpdatingFood = false;
        }, 2000);
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
            const rDate = await fetch(`${HA_URL}/api/states/${s.dateId}`, { headers: {'Authorization': `Bearer ${HA_TOKEN}`} });
            const dDate = await rDate.json();
            const rohDatum = dDate.state;

            if (rohDatum && rohDatum !== "unknown" && rohDatum !== "unavailable") {
                let termin = new Date(rohDatum);
                termin.setDate(termin.getDate() - 1); 
                termin.setHours(18, 0, 0, 0);

                const taskName = `🗑️ ${s.name} rausstellen`;
                
                const exists = todoDb.some(t => t.name === taskName && t.nextDate.startsWith(termin.toISOString().split('T')[0]));

                if (!exists) {
                    console.log(`🤖 Automatik: Neue Aufgabe für ${s.name} am ${termin.toLocaleDateString()} erstellt.`);
                    
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
