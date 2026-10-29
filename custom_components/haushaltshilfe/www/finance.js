// --- HA BASIS FUNKTIONEN (ÜBER TOKEN-FREIEN PROXY MIT CACHE-BUSTER) ---
async function fetchHA(entity) {
    try {
        // Nutzt haGetState mit, falls vom Hauptskript vorhanden, sonst direkt den Proxy ohne Cache
        if (typeof haGetState === "function") {
            const res = await haGetState(entity);
            if (res) return res;
        }
        const baseUrl = (typeof getBaseUrl === "function") ? getBaseUrl() : window.location.origin;
        const r = await fetch(`${baseUrl}/api/haushaltshilfe/proxy?entity_id=${encodeURIComponent(entity)}&_t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!r.ok) return null;
        return await r.json();
    } catch(e) { 
        console.error("HA Fetch Error:", e); 
        return null; 
    }
}

// Liest die Datenbank immer zuverlässig aus (egal ob HA sie in state oder attributes.data ablegt!)
function parseFinanceRoot(s) {
    if (!s) return { years: [], months: [] };
    let root = null;

    // 1. Prüfe, ob in s.state ein aktueller JSON-String liegt
    if (s.state && typeof s.state === "string" && s.state.trim().startsWith("{")) {
        try { root = JSON.parse(s.state); } catch(e) {}
    }

    // 2. Prüfe s.attributes.data
    if (!root && s.attributes && s.attributes.data) {
        root = typeof s.attributes.data === "string" ? JSON.parse(s.attributes.data) : s.attributes.data;
    }

    // 3. Fallback direkt auf s.attributes
    if (!root && s.attributes && (Array.isArray(s.attributes.years) || Array.isArray(s.attributes.months))) {
        root = s.attributes;
    }

    if (!root || typeof root !== "object") root = { years: [], months: [] };
    if (!Array.isArray(root.years)) root.years = [];
    if (!Array.isArray(root.months)) root.months = [];

    return root;
}

// Dauerhaftes Speichern: Sendet Event an Integration (schreibt unbegrenzt in die Sensor-Attribute)
async function saveToHA(dataObj) {
    try {
        const baseUrl = (typeof getBaseUrl === "function") ? getBaseUrl() : window.location.origin;

        await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: "fire_event", 
                event_type: "set_finance_db", 
                event_data: { data: dataObj } 
            })
        });
    } catch(e) { 
        console.error("HA Save Error:", e); 
    }
}

// --- FIXKOSTEN VORLAGEN LOGIK & HA SYNC ---

let fixkostenTemplates = [];

// --- 1. FIXKOSTEN-VORLAGEN LADEN ---
async function loadFixkostenTemplates() {
    try {
        const baseUrl = (typeof getBaseUrl === "function") ? getBaseUrl() : window.location.origin;
        const r = await fetch(`${baseUrl}/api/haushaltshilfe/proxy?entity_id=sensor.haushalt_finance_templates&_t=${Date.now()}`, { cache: "no-store" });
        if (r.ok) {
            const s = await r.json();
            if (s && s.attributes) {
                const rawTpl = s.attributes.templates || s.attributes.data || s.attributes.value;
                if (rawTpl) {
                    const parsed = typeof rawTpl === 'string' ? JSON.parse(rawTpl) : rawTpl;
                    if (Array.isArray(parsed)) {
                        fixkostenTemplates = parsed;
                        localStorage.setItem("ha_fixkosten_templates", JSON.stringify(fixkostenTemplates));
                        renderFixkostenList();
                        return;
                    }
                }
            }
        }
        const local = localStorage.getItem("ha_fixkosten_templates");
        if (local) fixkostenTemplates = JSON.parse(local);
    } catch(e) {
        console.warn("Konnte Fixkosten-Vorlagen nicht aus HA laden:", e);
        const local = localStorage.getItem("ha_fixkosten_templates");
        if (local) {
            try { fixkostenTemplates = JSON.parse(local); } catch(err) {}
        }
    }
    renderFixkostenList();
}

async function saveFixkostenTemplates() {
    const jsonStr = JSON.stringify(fixkostenTemplates);
    localStorage.setItem("ha_fixkosten_templates", jsonStr);

    try {
        const baseUrl = (typeof getBaseUrl === "function") ? getBaseUrl() : window.location.origin;
        await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: "fire_event", 
                event_type: "set_finance_templates", 
                event_data: { templates: fixkostenTemplates } 
            })
        });
    } catch(e) {
        console.error("Fehler beim Speichern der Fixkosten-Vorlagen:", e);
    }
}

window.openFixkostenModal = async function() {
    try {
        await loadFixkostenTemplates();
    } catch(e) {
        console.warn("Vorlagen-Laden fehlgeschlagen, öffne Modal dennoch:", e);
    }
    cancelFixkostenEdit(); // Setzt das Formular sauber zurück
    renderFixkostenList();
    
    const modal = document.getElementById('fixkostenModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

// --- 2. LISTE ZEICHNEN (Jetzt nur noch mit Mülleimer, Bearbeiten passiert über den Stift oben im HTML) ---
function renderFixkostenList() {
    const listEl = document.getElementById("fixkostenList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!fixkostenTemplates || fixkostenTemplates.length === 0) {
        listEl.innerHTML = "<div style='font-size:0.85rem; color:var(--gray); text-align:center; padding:15px; background:var(--bg); border-radius:12px;'>Noch keine Fixkosten-Vorlagen hinterlegt.</div>";
        return;
    }

    const monthLabels = {
        "all": "Jeden Monat",
        "1,4,7,10": "Quartalsweise (Jan, Apr, Jul, Okt)",
        "1,7": "Halbjährlich (Jan, Jul)",
        "1": "Nur Januar", "2": "Nur Februar", "3": "Nur März", "4": "Nur April",
        "5": "Nur Mai", "6": "Nur Juni", "7": "Nur Juli", "8": "Nur August",
        "9": "Nur September", "10": "Nur Oktober", "11": "Nur November", "12": "Nur Dezember"
    };

    fixkostenTemplates.forEach((tpl, index) => {
        const div = document.createElement("div");
        div.style = "display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:12px 15px; border-radius:12px; cursor:pointer;";
        // Klickt man auf den Eintrag selbst oder den Stift, wird er zum Bearbeiten geladen
        div.onclick = () => editFixkostenTemplate(index);

        div.innerHTML = `
            <div>
                <strong style="color:var(--text); font-size:0.95rem;">${tpl.title}</strong> — <span style="font-weight:bold; color:var(--primary);">${parseFloat(tpl.amount).toFixed(2)} €</span>
                <div style="font-size:0.75rem; color:var(--gray); margin-top:2px;">${monthLabels[tpl.months] || tpl.months}</div>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
                <button type="button" 
                    onclick="event.stopPropagation(); event.preventDefault(); deleteFixkostenTemplate(${index});" 
                    style="position:relative; z-index:50; background:transparent !important; border:none !important; box-shadow:none !important; outline:none !important; color:var(--danger); cursor:pointer; font-size:1.3rem; padding:12px 10px; margin:-8px -8px -8px 0; border-radius:10px;" title="Löschen">
                    🗑️
                </button>
            </div>
        `;
        listEl.appendChild(div);
    });
}

// --- 3. VORLAGE IN DIE FORMULAR-FELDER LADEN (BEARBEITEN) ---
window.editFixkostenTemplate = function(index) {
    const tpl = fixkostenTemplates[index];
    if (!tpl) return;

    const titleInput = document.getElementById("tpl_title");
    const amountInput = document.getElementById("tpl_amount");
    const monthsSelect = document.getElementById("tpl_months");
    const saveBtn = document.getElementById("tplSaveBtn");
    const editBtn = document.getElementById("tplEditBtn");
    const cancelBtn = document.getElementById("tplCancelEditBtn");

    if (titleInput && amountInput && monthsSelect && saveBtn) {
        titleInput.value = tpl.title;
        amountInput.value = tpl.amount;
        monthsSelect.value = tpl.months;

        // Merkt sich den Index im HTML-Button
        saveBtn.dataset.editIndex = index;
        saveBtn.innerHTML = "💾 Änderung speichern";
        saveBtn.style.background = "var(--accent)";

        // Zeigt den Abbrechen-Button an und versteckt den Extra-Stift
        if (editBtn) editBtn.style.display = "none";
        if (cancelBtn) cancelBtn.style.display = "block";

        amountInput.focus();
    }
};

// --- 4. BEARBEITEN ABBRECHEN ---
window.cancelFixkostenEdit = function() {
    const titleInput = document.getElementById("tpl_title");
    const amountInput = document.getElementById("tpl_amount");
    const monthsSelect = document.getElementById("tpl_months");
    const saveBtn = document.getElementById("tplSaveBtn");
    const editBtn = document.getElementById("tplEditBtn");
    const cancelBtn = document.getElementById("tplCancelEditBtn");

    if (titleInput && amountInput && saveBtn) {
        titleInput.value = "";
        amountInput.value = "";
        if (monthsSelect) monthsSelect.value = "all";

        saveBtn.dataset.editIndex = "-1";
        saveBtn.innerHTML = "➕ Fixkosten-Eintrag speichern";
        saveBtn.style.background = "var(--primary)";

        if (editBtn) editBtn.style.display = "block";
        if (cancelBtn) cancelBtn.style.display = "none";
    }
};

// --- 5. SPEICHERN (ENTWEDER NEU ODER ALS UPDATE) ---
window.addFixkostenTemplate = async function() {
    const titleInput = document.getElementById("tpl_title");
    const amountInput = document.getElementById("tpl_amount");
    const monthsSelect = document.getElementById("tpl_months");
    const saveBtn = document.getElementById("tplSaveBtn");

    if (!titleInput || !amountInput || !monthsSelect) return;

    const title = titleInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const months = monthsSelect.value;
    const editIndex = saveBtn ? parseInt(saveBtn.dataset.editIndex || "-1", 10) : -1;

    if (!title || isNaN(amount)) {
        // Schickes eigenes Modal statt alert(...)
        const modal = document.getElementById("customConfirmModal");
        const titleEl = document.getElementById("customConfirmTitle");
        const msgEl = document.getElementById("customConfirmMessage");
        
        if (modal && titleEl && msgEl) {
            titleEl.innerText = "Fehlende Eingabe";
            msgEl.innerText = "Bitte eine Bezeichnung und einen gültigen Betrag eingeben!";
            modal.style.display = "flex";
            
            // Definiert die Schließen-Funktion für den OK-Button
            window.resolveConfirm = function() {
                modal.style.display = "none";
            };
        } else {
            alert("Bitte eine Bezeichnung und einen gültigen Betrag eingeben!");
        }
        return;
    }

    if (!Array.isArray(fixkostenTemplates)) fixkostenTemplates = [];

    if (editIndex >= 0 && editIndex < fixkostenTemplates.length) {
        // Bestehende Vorlage aktualisieren
        fixkostenTemplates[editIndex] = { title: title, amount: amount, months: months };
    } else {
        // Neue Vorlage hinzufügen
        fixkostenTemplates.push({ title: title, amount: amount, months: months });
    }

    await saveFixkostenTemplates();
    cancelFixkostenEdit();
    renderFixkostenList();
};

// --- 6. VORLAGE LÖSCHEN ---
window.deleteFixkostenTemplate = async function(index) {
    if (!Array.isArray(fixkostenTemplates) || !fixkostenTemplates[index]) return;
    
    const item = fixkostenTemplates[index];
    const name = item.title || item.name || "diese Vorlage";
    
    const confirmed = await showDeleteModal(`Möchtest du die Fixkosten-Vorlage "${name}" wirklich löschen?`, "Vorlage löschen");
    
    if (confirmed) {
        const saveBtn = document.getElementById("tplSaveBtn");
        if (saveBtn && parseInt(saveBtn.dataset.editIndex || "-1", 10) === index) {
            cancelFixkostenEdit();
        }
        fixkostenTemplates.splice(index, 1);
        await saveFixkostenTemplates();
        renderFixkostenList();
    }
};

function parseMonthIndex(monthString) {
    const str = monthString.toLowerCase();
    const months = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
    for (let i = 0; i < months.length; i++) {
        if (str.includes(months[i])) return i + 1;
    }
    const match = str.match(/\b(1[0-2]|[1-9])\b/);
    if (match) return parseInt(match[0]);
    return new Date().getMonth() + 1;
}

async function getFixkostenForMonthName(monthName) {
    await loadFixkostenTemplates();
    const monthNum = parseMonthIndex(monthName);
    let autoFixum = [];

    if (Array.isArray(fixkostenTemplates)) {
        fixkostenTemplates.forEach(tpl => {
            let isMatch = false;
            if (tpl.months === "all") {
                isMatch = true;
            } else {
                const allowed = tpl.months.toString().split(",").map(m => parseInt(m.trim()));
                if (allowed.includes(monthNum)) isMatch = true;
            }
            if (isMatch) {
                autoFixum.push({ name: tpl.title, amount: parseFloat(tpl.amount) });
            }
        });
    }
    return autoFixum;
}

// --- FINANCE LOGIK (JAHRE -> MONATE) ---

console.log("Finance Modul aktiv (Eigenständiger Auto-Sync)");

let activeFinanceYear = null;
let currentOpenMonthIdx = null;
let lastFinanceDataHash = "";

function extractYearFromMonth(m) {
    if (m.year) return String(m.year);
    if (m.month_name) {
        const match = m.month_name.match(/\b(20\d{2})\b/);
        if (match) return match[1];
    }
    return null;
}

function openFinanceInputModal(titleText, placeholderText, defaultValue, callback) {
    const modal = document.getElementById('roomModal');
    const input = document.getElementById('newRoomInput');
    const title = modal ? modal.querySelector('h3') : null;
    const confirmBtn = modal ? modal.querySelector('button[onclick*="confirmAddRoom"]') : null;

    if (modal && input && confirmBtn) {
        if (title) title.innerText = titleText;
        input.placeholder = placeholderText;
        input.value = defaultValue || "";
        modal.style.zIndex = "10005";
        modal.style.display = 'flex';
        input.focus();

        const restoreRoomModal = () => {
            modal.style.display = 'none';
            if (title) title.innerText = "Neuen Raum hinzufügen";
            input.placeholder = "Raumname (z.B. Keller)";
            confirmBtn.onclick = function() { if (typeof confirmAddRoom === 'function') confirmAddRoom(); };
        };

        confirmBtn.onclick = async function() {
            const val = input.value.trim();
            if (!val) return;
            restoreRoomModal();
            await callback(val);
        };

        const cancelBtn = modal.querySelector('button[onclick*="closeRoomModal"]');
        if (cancelBtn) {
            cancelBtn.onclick = function() { restoreRoomModal(); };
        }
    } else {
        const val = prompt(titleText, defaultValue);
        if (val && val.trim() !== "") callback(val.trim());
    }
}

function openFinanceDeleteModal(questionText, callback) {
    const modal = document.getElementById('deleteModal');
    const textEl = document.getElementById('deleteModalText');
    const confirmBtn = document.getElementById('deleteConfirmBtn');

    if (modal && textEl && confirmBtn) {
        textEl.innerText = questionText;
        modal.style.zIndex = "10005";
        modal.style.display = 'flex';

        const restoreDeleteModal = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = function() { if (typeof confirmDelete === 'function') confirmDelete(); };
        };

        confirmBtn.onclick = async function() {
            restoreDeleteModal();
            await callback();
        };

        const cancelBtn = modal.querySelector('button[onclick*="closeDeleteModal"]');
        if (cancelBtn) {
            cancelBtn.onclick = function() { restoreDeleteModal(); };
        }
    } else {
        if (confirm(questionText)) callback();
    }
}

function renderFinanceItems(items, mIdx, type) {
    if (!items || items.length === 0) return '<div style="opacity:0.2; font-size:0.7rem; padding:5px;">Leer</div>';
    return items.map((i, iIdx) => `
        <div class="finance-item" style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.03); margin:3px 0; padding:6px 10px; border-radius:8px; font-size:0.85rem;">
            <span>${i.name}</span>
            <b onclick="delEntry(${mIdx}, '${type}', ${iIdx})" style="cursor:pointer; color:var(--danger);">${parseFloat(i.amount).toFixed(2)}€ ✕</b>
        </div>`).join('');
}

// --- 1. ÜBERSICHT LADEN (JAHRE ODER MONATE) ---
window.loadFinance = async function(isBackgroundSync = false) {
    // Während man ein Jahr oder einen Monat zieht, keinen Auto-Sync dazwischenfunken lassen
    if (isBackgroundSync && financeDragState.isDragging) return;

    const yearsView = document.getElementById('finance-years-view');
    const monthsView = document.getElementById('finance-months-view');
    const yearsContainer = document.getElementById('years-container');
    const monthsContainer = document.getElementById('months-container');

    if (!yearsContainer || !monthsContainer) return;

    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);
    
    // Prüft beim Auto-Sync im Hintergrund, ob sich überhaupt etwas geändert hat
    const currentHash = JSON.stringify(root);
    if (isBackgroundSync && currentHash === lastFinanceDataHash) {
        return;
    }
    lastFinanceDataHash = currentHash;

    let list = root.months;
    // WICHTIG: Kein zwangsweises .sort() mehr hier, damit deine eigene Drag & Drop Reihenfolge erhalten bleibt!
    let yearsList = root.years.map(String);

    if (activeFinanceYear === null) {
        // --- ANSICHT 1: JAHRE ANZEIGEN ---
        if (yearsView) yearsView.style.display = 'block';
        if (monthsView) monthsView.style.display = 'none';

        yearsContainer.innerHTML = "";

        if (yearsList.length === 0) {
            yearsContainer.innerHTML = `<div style="text-align:center; padding:30px; opacity:0.6; font-weight:bold; grid-column: 1 / -1;">Noch kein Jahr angelegt. Klicke oben auf "➕ Jahr hinzufügen".</div>`;
            return;
        }

        yearsList.forEach((yearStr, yIdx) => {
            const monthsInYear = list.filter(m => extractYearFromMonth(m) === yearStr);
            
            let sumFixYear = 0;
            let sumVarYear = 0;
            monthsInYear.forEach(m => {
                sumFixYear += (m.fixum || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
                sumVarYear += (m.spendings || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
            });

            const card = document.createElement('div');
            card.className = "month-card";
            card.style = "position:relative; padding: 20px; border-radius: 20px; cursor:grab; user-select:none; -webkit-user-select:none;";
            card.dataset.index = yIdx;
            card.dataset.type = 'year';

            card.onclick = () => {
                if (card.dataset.wasDragged === "true") return;
                openFinanceYear(yearStr);
            };

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="color:var(--primary); margin: 0; font-size:1.4rem; cursor:pointer; flex:1;">
                        📅 Jahr ${yearStr}
                    </h3>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.8rem; opacity:0.7; font-weight:bold; background:rgba(0,0,0,0.06); padding:4px 10px; border-radius:10px; cursor:pointer;">
                            ${monthsInYear.length} Monate
                        </span>
                        <button type="button" class="del-finance-btn"
                            onclick="event.stopPropagation(); event.preventDefault(); deleteFinanceYear('${yearStr}', event);" 
                            style="position:relative; z-index:50; background:transparent !important; border:none !important; box-shadow:none !important; outline:none !important; color:var(--danger); cursor:pointer; font-size:1.3rem; padding:15px 18px; margin:-8px -8px -8px 0; border-radius:10px;">
                            🗑️
                        </button>
                    </div>
                </div>
                <div style="font-size:0.9rem; opacity:0.85; cursor:pointer; pointer-events:none;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Fixkosten (Jahr):</span><b>${sumFixYear.toFixed(2)}€</b></div>
                    <div style="display:flex; justify-content:space-between;"><span>Ausgaben (Jahr):</span><b>${sumVarYear.toFixed(2)}€</b></div>
                    <hr style="border:0; border-top:1px solid rgba(0,0,0,0.1); margin:10px 0;">
                    <div class="summary-total" style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.05rem; padding-top:4px;">
                        <span>Jahresgesamt:</span><span>${(sumFixYear + sumVarYear).toFixed(2)}€</span>
                    </div>
                </div>`;

            enableFinanceDragAndDrop(card, 'year', yIdx);
            yearsContainer.appendChild(card);
        });
    } else {
        // --- ANSICHT 2: MONATE DES GEWÄHLTEN JAHRES ANZEIGEN ---
        if (yearsView) yearsView.style.display = 'none';
        if (monthsView) monthsView.style.display = 'block';

        const titleEl = document.getElementById('finance-year-title');
        if (titleEl) titleEl.innerText = `Finanzen ${activeFinanceYear} 📅`;

        monthsContainer.innerHTML = "";
        
        const monthsWithIndex = list
            .map((m, idx) => ({ m, idx }))
            .filter(item => extractYearFromMonth(item.m) === String(activeFinanceYear));

        if (monthsWithIndex.length === 0) {
            monthsContainer.innerHTML = `<div style="text-align:center; padding:30px; opacity:0.6; font-weight:bold; grid-column: 1 / -1;">Noch keine Monate in ${activeFinanceYear} angelegt. Klicke oben auf "➕ Monat in diesem Jahr hinzufügen".</div>`;
        } else {
            monthsWithIndex.forEach(({ m, idx: mIdx }, localIdx) => {
                const sumFix = (m.fixum || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
                const sumVar = (m.spendings || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
                
                const card = document.createElement('div');
                card.className = "month-card";
                card.style = "cursor:pointer; text-align:center; user-select:none; -webkit-user-select:none;";
                card.dataset.index = localIdx;
                card.dataset.type = 'month';

                card.onclick = () => {
                    if (card.dataset.wasDragged === "true") return;
                    openFinanceModal(mIdx);
                };

                card.innerHTML = `
                    <h3 style="color:var(--primary); margin: 0 0 10px 0; pointer-events:none;">${m.month_name}</h3>
                    <div style="font-size:0.85rem; opacity:0.8; pointer-events:none;">
                        <div style="display:flex; justify-content:space-between;"><span>Fix:</span><b>${sumFix.toFixed(2)}€</b></div>
                        <div style="display:flex; justify-content:space-between;"><span>Ausg:</span><b>${sumVar.toFixed(2)}€</b></div>
                        <hr style="border:0; border-top:1px solid rgba(0,0,0,0.1); margin:8px 0;">
                        <div class="summary-total" style="display:flex; justify-content:space-between; font-weight:bold; color:var(--text);">
                            <span>Gesamt:</span><span>${(sumFix+sumVar).toFixed(2)}€</span>
                        </div>
                    </div>`;

                enableFinanceDragAndDrop(card, 'month', localIdx);
                monthsContainer.appendChild(card);
            });
        }

        if (currentOpenMonthIdx !== null) {
            if (isBackgroundSync) {
                updateOpenFinanceModalContent(root, currentOpenMonthIdx);
            } else {
                openFinanceModal(currentOpenMonthIdx);
            }
        }
    }
};

// ========================================================
// --- DRAG & DROP LOGIK FÜR JAHRE UND MONATE ---
// ========================================================
let financeDragState = {
    type: null,
    fromIndex: null,
    toIndex: null,
    isDragging: false,
    startX: 0,
    startY: 0
};

function enableFinanceDragAndDrop(card, type, index) {
    // --- 1. PC MAUS DRAG & DROP ---
    card.draggable = true;

    card.addEventListener('dragstart', (e) => {
        financeDragState.type = type;
        financeDragState.fromIndex = index;
        financeDragState.isDragging = true;
        card.classList.add('dragging-side-btn');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
        }
    });

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (financeDragState.type !== type || financeDragState.fromIndex === index) return;
        card.classList.add('drag-over-side-btn');
    });

    card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-side-btn');
    });

    card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over-side-btn');
        if (financeDragState.type !== type) return;
        
        const fromIdx = financeDragState.fromIndex;
        const toIdx = index;
        financeDragState.isDragging = false;

        if (fromIdx !== null && fromIdx !== toIdx) {
            await applyFinanceNewOrder(type, fromIdx, toIdx);
        }
    });

    card.addEventListener('dragend', () => {
        financeDragState.isDragging = false;
        card.classList.remove('dragging-side-btn');
        document.querySelectorAll('.drag-over-side-btn').forEach(el => el.classList.remove('drag-over-side-btn'));
        financeDragState.type = null;
        financeDragState.fromIndex = null;
    });

    // --- 2. HANDY / TABLET TOUCH (2D-GRID KOMPATIBEL) ---
    card.addEventListener('touchstart', (e) => {
        if (e.target.closest('.del-finance-btn') || e.target.tagName === 'BUTTON') return;

        const touch = e.touches[0];
        financeDragState.startX = touch.clientX;
        financeDragState.startY = touch.clientY;
        financeDragState.type = type;
        financeDragState.fromIndex = index;
        financeDragState.toIndex = index;
        card.dataset.wasDragged = "false";
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        if (financeDragState.type !== type || financeDragState.fromIndex !== index) return;

        const touch = e.touches[0];
        const moveX = Math.abs(touch.clientX - financeDragState.startX);
        const moveY = Math.abs(touch.clientY - financeDragState.startY);

        // Startet im 2D-Grid, sobald man mind. 12px zieht (horizontal oder vertikal)
        if (!financeDragState.isDragging && (moveX > 12 || moveY > 12)) {
            financeDragState.isDragging = true;
            card.classList.add('dragging-side-btn');
            card.dataset.wasDragged = "true";
            if (navigator.vibrate) navigator.vibrate(30);
        }

        if (financeDragState.isDragging) {
            if (e.cancelable) e.preventDefault();

            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const overCard = targetEl ? targetEl.closest(`.month-card[data-type="${type}"]`) : null;

            document.querySelectorAll('.drag-over-side-btn').forEach(el => el.classList.remove('drag-over-side-btn'));

            if (overCard && overCard !== card) {
                overCard.classList.add('drag-over-side-btn');
                financeDragState.toIndex = parseInt(overCard.dataset.index, 10);
            }
        }
    }, { passive: false });

    const endTouchDrag = async () => {
        if (!financeDragState.isDragging) {
            financeDragState.type = null;
            financeDragState.fromIndex = null;
            return;
        }

        financeDragState.isDragging = false;
        card.classList.remove('dragging-side-btn');
        document.querySelectorAll('.drag-over-side-btn').forEach(el => el.classList.remove('drag-over-side-btn'));

        const fromIdx = financeDragState.fromIndex;
        const toIdx = financeDragState.toIndex;
        
        financeDragState.type = null;
        financeDragState.fromIndex = null;
        financeDragState.toIndex = null;

        if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx) {
            await applyFinanceNewOrder(type, fromIdx, toIdx);
        }

        setTimeout(() => { card.dataset.wasDragged = "false"; }, 150);
    };

    card.addEventListener('touchend', endTouchDrag);
    card.addEventListener('touchcancel', endTouchDrag);
}

// Speichert die neue Reihenfolge der Jahre oder Monate in Home Assistant
async function applyFinanceNewOrder(type, fromIndex, toIndex) {
    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);

    if (type === 'year') {
        let yearsList = root.years.map(String);
        const [movedYear] = yearsList.splice(fromIndex, 1);
        yearsList.splice(toIndex, 0, movedYear);
        root.years = yearsList;
    } else if (type === 'month') {
        const yearStr = String(activeFinanceYear);
        const yearMonths = root.months.filter(m => extractYearFromMonth(m) === yearStr);
        
        const [movedMonth] = yearMonths.splice(fromIndex, 1);
        yearMonths.splice(toIndex, 0, movedMonth);

        // Ersetzt die Monate des aktuellen Jahres in der neuen Reihenfolge, lässt andere Jahre unberührt
        let pointer = 0;
        root.months = root.months.map(m => {
            if (extractYearFromMonth(m) === yearStr) {
                return yearMonths[pointer++];
            }
            return m;
        });
    }

    await saveToHA(root);
    lastFinanceDataHash = "";
    loadFinance(false);
}

function updateOpenFinanceModalContent(root, mIdx) {
    const content = document.getElementById('modal-content');
    const modal = document.getElementById('finance-modal');
    if (!content || !modal || modal.style.display === 'none') return;

    let m = (root.months || [])[mIdx];
    if (!m) {
        closeFinanceModal();
        return;
    }

    content.innerHTML = `
        <div style="margin-bottom:20px; margin-top:20px;">
            <small style="font-weight:bold; opacity:0.5;">📌 FIXKOSTEN</small>
            <div style="margin-top:8px;">${renderFinanceItems(m.fixum, mIdx, 'fixum')}</div>
        </div>
        <div>
            <small style="font-weight:bold; opacity:0.5;">🛒 AUSGABEN</small>
            <div style="margin-top:8px;">${renderFinanceItems(m.spendings, mIdx, 'spendings')}</div>
        </div>
        <div style="text-align: center; margin-top: 30px;">
            <button type="button" 
                onclick="event.stopPropagation(); event.preventDefault(); deleteMonth(${mIdx});" 
                style="position:relative; z-index:50; background:transparent !important; border:none !important; box-shadow:none !important; outline:none !important; color:var(--danger); cursor:pointer; font-size:1.3rem; padding:12px 20px; border-radius:10px;">
                🗑️ Gesamten Monat löschen
            </button>
        </div>
    `;
}

// --- JAHR ÖFFNEN & ZURÜCK ---
window.openFinanceYear = function(yearStr) {
    activeFinanceYear = String(yearStr);
    lastFinanceDataHash = "";
    loadFinance(false);
};

window.backToYears = function() {
    activeFinanceYear = null;
    currentOpenMonthIdx = null;
    lastFinanceDataHash = "";
    loadFinance(false);
};

// --- JAHR HINZUFÜGEN (Sortiert automatisch absteigend ein, neuestes Jahr oben) ---
window.addNewYear = async function() {
    openFinanceInputModal("Neues Jahr hinzufügen", "Jahr eingeben (z. B. 2026)", "", async (inputYear) => {
        const cleanYear = String(inputYear).trim();
        const yearNum = parseInt(cleanYear);

        if (isNaN(yearNum) || cleanYear.length !== 4 || yearNum < 2000 || yearNum > 2100) {
            alert("Bitte eine gültige vierstellige Jahreszahl eingeben (z. B. 2026)!");
            return;
        }

        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);

        const existingYears = root.years.map(String);
        if (existingYears.includes(cleanYear)) {
            alert(`Das Jahr ${cleanYear} existiert bereits!`);
            return;
        }

        existingYears.push(cleanYear);
        // Beim Neuanlegen einmalig sauber absteigend sortieren (z.B. 2027, 2026, 2025)
        existingYears.sort((a, b) => parseInt(b) - parseInt(a));
        root.years = existingYears;

        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    });
};

// --- JAHR LÖSCHEN ---
window.deleteFinanceYear = async function(yearStr, event) {
    if (event) event.stopPropagation();
    
    const confirmed = await showDeleteModal(`Möchtest du das Jahr "${yearStr}" inklusive ALLER darin enthaltenen Monate wirklich löschen?`, "Jahr löschen");
    
    if (confirmed) {
        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);

        root.years = root.years.map(String).filter(y => y !== String(yearStr));
        root.months = root.months.filter(m => extractYearFromMonth(m) !== String(yearStr));

        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    }
};

// --- 2. POPUP FÜR MONAT ÖFFNEN ---
window.openFinanceModal = async function(mIdx) {
    currentOpenMonthIdx = mIdx;
    const modal = document.getElementById('finance-modal');
    const headerFixed = document.getElementById('modal-header-fixed');
    
    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);
    let m = root.months[mIdx];
    if (!m) return;

    modal.style.display = 'flex';

    const modalContentDiv = modal.querySelector('div');
    if (modalContentDiv) {
        modalContentDiv.style.setProperty('position', 'relative', 'important');
    }

    const closeBtn = modal.querySelector('button[onclick="closeFinanceModal()"]');
    if (closeBtn) {
        closeBtn.style.setProperty('position', 'absolute', 'important');
        closeBtn.style.setProperty('top', '12px', 'important');
        closeBtn.style.setProperty('right', '12px', 'important');
        closeBtn.style.setProperty('left', 'auto', 'important');
        closeBtn.style.setProperty('bottom', 'auto', 'important');
        closeBtn.style.setProperty('width', '2.6rem', 'important');
        closeBtn.style.setProperty('height', '2.6rem', 'important');
        closeBtn.style.setProperty('font-size', '1.3rem', 'important');
        closeBtn.style.setProperty('border-radius', '50%', 'important');
        closeBtn.style.setProperty('display', 'flex', 'important');
        closeBtn.style.setProperty('align-items', 'center', 'important');
        closeBtn.style.setProperty('justify-content', 'center', 'important');
        closeBtn.style.setProperty('padding', '0', 'important');
        closeBtn.style.setProperty('margin', '0', 'important');
        closeBtn.style.setProperty('z-index', '99999', 'important');
    }

    headerFixed.style.padding = "10px 5px 15px 5px";
    headerFixed.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-right:3.5rem; min-height:2.6rem;">
            <h2 style="margin:0; font-size:1.5rem; font-weight: 800; text-transform: uppercase;">
                ${m.month_name}
            </h2>
        </div>
        
        <div class="finance-input-row" style="display:flex; gap:8px; align-items:center; width:100%;">
            <input type="number" step="0.01" id="amt-${mIdx}" placeholder="€">
            
            <input type="text" id="name-${mIdx}" placeholder="Was?">
            
            <select id="type-${mIdx}">
                <option value="spendings">🛒</option>
                <option value="fixum">📌</option>
            </select>
            
            <button class="btn-add" onclick="addEntry(${mIdx})">
                OK
            </button>
        </div>
    `;

    updateOpenFinanceModalContent(root, mIdx);
};

window.closeFinanceModal = function() {
    currentOpenMonthIdx = null;
    const modal = document.getElementById('finance-modal');
    if (modal) modal.style.display = 'none';
    lastFinanceDataHash = "";
    loadFinance(false);
};

// --- EINTRAG HINZUFÜGEN ---
window.addEntry = async function(mIdx) {
    const aIn = document.getElementById(`amt-${mIdx}`);
    const nIn = document.getElementById(`name-${mIdx}`);
    const tIn = document.getElementById(`type-${mIdx}`);
    const a = parseFloat(aIn.value.replace(',', '.')), n = nIn.value.trim(), t = tIn.value;

    if (isNaN(a) || !n) return;

    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);
    if (!root.months[mIdx]) return;
    
    if (!root.months[mIdx][t]) root.months[mIdx][t] = [];
    root.months[mIdx][t].push({name: n, amount: a});
    
    await saveToHA(root);
    aIn.value = ""; nIn.value = "";
    lastFinanceDataHash = "";
    setTimeout(() => loadFinance(false), 200);
};

// --- EINTRAG LÖSCHEN ---
window.delEntry = async function(mIdx, type, iIdx) {
    const confirmed = await showDeleteModal("Diesen Eintrag wirklich löschen?", "Eintrag löschen");
    
    if (confirmed) {
        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);
        if (!root.months[mIdx] || !root.months[mIdx][type]) return;

        root.months[mIdx][type].splice(iIdx, 1);
        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    }
};

// --- MONAT HINZUFÜGEN (Sortiert die Monate des Jahres direkt chronologisch Jan -> Dez) ---
window.addNewMonth = async function() {
    if (!activeFinanceYear) {
        alert("Bitte öffne zuerst ein Jahr, um darin einen Monat anzulegen!");
        return;
    }

    openFinanceInputModal(`Monat in ${activeFinanceYear} hinzufügen`, "Monatsname (z. B. Oktober)", "", async (inputName) => {
        let monthTitle = inputName.trim();
        if (!monthTitle.includes(String(activeFinanceYear))) {
            monthTitle = `${monthTitle} ${activeFinanceYear}`;
        }

        const autoFixum = await getFixkostenForMonthName(monthTitle);

        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);

        const yearStr = String(activeFinanceYear);
        if (!root.years.map(String).includes(yearStr)) {
            root.years.push(yearStr);
            root.years.sort((a, b) => parseInt(b) - parseInt(a));
        }

        root.months.push({
            year: yearStr,
            month_name: monthTitle,
            fixum: autoFixum,
            spendings: []
        });

        // Automatisch chronologisch (Januar bis Dezember) innerhalb dieses Jahres sortieren
        const yearMonths = root.months
            .filter(m => extractYearFromMonth(m) === yearStr)
            .sort((a, b) => parseMonthIndex(a.month_name) - parseMonthIndex(b.month_name));

        let pointer = 0;
        root.months = root.months.map(m => {
            if (extractYearFromMonth(m) === yearStr) {
                return yearMonths[pointer++];
            }
            return m;
        });

        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    });
};

// --- MONAT LÖSCHEN ---
window.deleteMonth = async function(mIdx) {
    const confirmed = await showDeleteModal("Gesamten Monat wirklich löschen?", "Monat löschen");
    
    if (confirmed) {
        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);
        
        root.months.splice(mIdx, 1);
        
        await saveToHA(root);
        closeFinanceModal();
    }
};

// --- EIGENER AUTO-SYNC NUR FÜR DAS FINANZ-SKRIPT (ALLE 2 SEKUNDEN) ---
if (window.financeDedicatedSync) clearInterval(window.financeDedicatedSync);
window.financeDedicatedSync = setInterval(async () => {
    const finSection = document.getElementById('v-finance');
    const isVisible = finSection && finSection.style.display !== 'none' && finSection.offsetParent !== null;
    
    if (isVisible) {
        await window.loadFinance(true);
    }

    const fixModal = document.getElementById('fixkostenModal');
    if (fixModal && fixModal.style.display === 'flex') {
        const oldTplHash = JSON.stringify(fixkostenTemplates);
        await loadFixkostenTemplates();
        if (JSON.stringify(fixkostenTemplates) !== oldTplHash) {
            renderFixkostenList();
        }
    }
}, 2000);