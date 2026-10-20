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

    // 1. Prüfe, ob in s.state ein aktueller JSON-String liegt (passiert durch set_input_text)
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

// Dauerhaftes Speichern: Sendet Event an Integration UND schreibt State für Neustartsicherheit
async function saveToHA(dataObj) {
    try {
        const baseUrl = (typeof getBaseUrl === "function") ? getBaseUrl() : window.location.origin;

        // 1. Event feuern für die Live-Aktualisierung im Sensor (Python Integration)
        await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "fire_event", event_type: "set_finance_db", event_data: { data: dataObj } })
        });

        // 2. Zustand direkt in HA State API über den Proxy schreiben
        await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "set_input_text", entity_id: "sensor.haushalt_finance_db", value: JSON.stringify(dataObj) })
        });
    } catch(e) { 
        console.error("HA Save Error:", e); 
    }
}

// --- FIXKOSTEN VORLAGEN LOGIK & HA SYNC ---

let fixkostenTemplates = [];

async function loadFixkostenTemplates() {
    try {
        const baseUrl = (typeof getBaseUrl === "function") ? getBaseUrl() : window.location.origin;
        
        // 1. Primär über input_text.helper_finance_templates laden
        const r1 = await fetch(`${baseUrl}/api/haushaltshilfe/proxy?entity_id=input_text.helper_finance_templates&_t=${Date.now()}`, { cache: "no-store" });
        if (r1.ok) {
            const s1 = await r1.json();
            if (s1 && s1.state && s1.state !== "unknown" && s1.state !== "unavailable" && s1.state.trim() !== "") {
                const parsed = JSON.parse(s1.state);
                if (Array.isArray(parsed)) {
                    fixkostenTemplates = parsed;
                    localStorage.setItem("ha_fixkosten_templates", JSON.stringify(fixkostenTemplates));
                    return;
                }
            }
        }

        // 2. Zweiter Check über sensor.haushalt_finance_templates
        const r2 = await fetch(`${baseUrl}/api/haushaltshilfe/proxy?entity_id=sensor.haushalt_finance_templates&_t=${Date.now()}`, { cache: "no-store" });
        if (r2.ok) {
            const s2 = await r2.json();
            if (s2 && s2.attributes && s2.attributes.templates) {
                fixkostenTemplates = typeof s2.attributes.templates === 'string' 
                    ? JSON.parse(s2.attributes.templates) 
                    : s2.attributes.templates;
                localStorage.setItem("ha_fixkosten_templates", JSON.stringify(fixkostenTemplates));
                return;
            }
        }

        // 3. Fallback LocalStorage
        const local = localStorage.getItem("ha_fixkosten_templates");
        if (local) fixkostenTemplates = JSON.parse(local);
    } catch(e) {
        console.warn("Konnte Fixkosten-Vorlagen nicht aus HA laden:", e);
        const local = localStorage.getItem("ha_fixkosten_templates");
        if (local) {
            try { fixkostenTemplates = JSON.parse(local); } catch(err) {}
        }
    }
}

async function saveFixkostenTemplates() {
    const jsonStr = JSON.stringify(fixkostenTemplates);
    localStorage.setItem("ha_fixkosten_templates", jsonStr);

    try {
        const baseUrl = (typeof getBaseUrl === "function") ? getBaseUrl() : window.location.origin;

        await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "fire_event", event_type: "set_finance_templates", event_data: { templates: fixkostenTemplates } })
        });

        await fetch(`${baseUrl}/api/haushaltshilfe/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "set_input_text", entity_id: "input_text.helper_finance_templates", value: jsonStr })
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
    
    renderFixkostenList();
    
    const modal = document.getElementById('fixkostenModal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        alert("Modal 'fixkostenModal' wurde nicht im HTML-Code gefunden!");
    }
};

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
        div.style = "display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:12px 15px; border-radius:12px;";
        div.innerHTML = `
            <div>
                <strong style="color:var(--text); font-size:0.95rem;">${tpl.title}</strong> — <span style="font-weight:bold; color:var(--primary);">${parseFloat(tpl.amount).toFixed(2)} €</span>
                <div style="font-size:0.75rem; color:var(--gray); margin-top:2px;">${monthLabels[tpl.months] || tpl.months}</div>
            </div>
            <button type="button" onclick="deleteFixkostenTemplate(${index})" style="background:none; border:none; color:#ff4d4d; cursor:pointer; font-weight:bold; font-size:1.2rem; padding:5px;">✕</button>
        `;
        listEl.appendChild(div);
    });
}

window.addFixkostenTemplate = async function() {
    const titleInput = document.getElementById("tpl_title");
    const amountInput = document.getElementById("tpl_amount");
    const monthsSelect = document.getElementById("tpl_months");

    if (!titleInput || !amountInput || !monthsSelect) return;

    const title = titleInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const months = monthsSelect.value;

    if (!title || isNaN(amount)) {
        alert("Bitte eine Bezeichnung und einen gültigen Betrag eingeben!");
        return;
    }

    if (!Array.isArray(fixkostenTemplates)) fixkostenTemplates = [];
    fixkostenTemplates.push({ title: title, amount: amount, months: months });

    await saveFixkostenTemplates();

    titleInput.value = "";
    amountInput.value = "";
    renderFixkostenList();
};

window.deleteFixkostenTemplate = async function(index) {
    if (!Array.isArray(fixkostenTemplates)) return;
    fixkostenTemplates.splice(index, 1);
    await saveFixkostenTemplates();
    renderFixkostenList();
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
    let yearsList = root.years.map(String);

    yearsList.sort((a, b) => parseInt(b) - parseInt(a));

    if (activeFinanceYear === null) {
        // --- ANSICHT 1: JAHRE ANZEIGEN ---
        if (yearsView) yearsView.style.display = 'block';
        if (monthsView) monthsView.style.display = 'none';

        yearsContainer.innerHTML = "";

        if (yearsList.length === 0) {
            yearsContainer.innerHTML = `<div style="text-align:center; padding:30px; opacity:0.6; font-weight:bold; grid-column: 1 / -1;">Noch kein Jahr angelegt. Klicke oben auf "➕ Jahr hinzufügen".</div>`;
            return;
        }

        yearsList.forEach(yearStr => {
            const monthsInYear = list.filter(m => extractYearFromMonth(m) === yearStr);
            
            let sumFixYear = 0;
            let sumVarYear = 0;
            monthsInYear.forEach(m => {
                sumFixYear += (m.fixum || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
                sumVarYear += (m.spendings || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
            });

            yearsContainer.innerHTML += `
            <div class="month-card" style="position:relative; padding: 20px; border-radius: 20px; cursor:default;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 onclick="openFinanceYear('${yearStr}')" style="color:var(--primary); margin: 0; font-size:1.4rem; cursor:pointer; flex:1;">
                        📅 Jahr ${yearStr}
                    </h3>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span onclick="openFinanceYear('${yearStr}')" style="font-size:0.8rem; opacity:0.7; font-weight:bold; background:rgba(0,0,0,0.06); padding:4px 10px; border-radius:10px; cursor:pointer;">
                            ${monthsInYear.length} Monate
                        </span>
                        <button type="button" 
                            onclick="event.stopPropagation(); event.preventDefault(); deleteFinanceYear('${yearStr}', event);" 
                            style="position:relative; z-index:50; background:transparent !important; border:none !important; box-shadow:none !important; outline:none !important; color:var(--danger); cursor:pointer; font-size:1.3rem; padding:15px 18px; margin:-8px -8px -8px 0; border-radius:10px;">
                            🗑️
                        </button>
                    </div>
                </div>
                <div onclick="openFinanceYear('${yearStr}')" style="font-size:0.9rem; opacity:0.85; cursor:pointer;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Fixkosten (Jahr):</span><b>${sumFixYear.toFixed(2)}€</b></div>
                    <div style="display:flex; justify-content:space-between;"><span>Ausgaben (Jahr):</span><b>${sumVarYear.toFixed(2)}€</b></div>
                    <hr style="border:0; border-top:1px solid rgba(0,0,0,0.1); margin:10px 0;">
                    <div class="summary-total" style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.05rem; padding-top:4px;">
                        <span>Jahresgesamt:</span><span>${(sumFixYear + sumVarYear).toFixed(2)}€</span>
                    </div>
                </div>
            </div>`;
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
            monthsWithIndex.forEach(({ m, idx: mIdx }) => {
                const sumFix = (m.fixum || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
                const sumVar = (m.spendings || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
                
                monthsContainer.innerHTML += `
                <div class="month-card" onclick="openFinanceModal(${mIdx})" style="cursor:pointer; text-align:center;">
                    <h3 style="color:var(--primary); margin: 0 0 10px 0;">${m.month_name}</h3>
                    <div style="font-size:0.85rem; opacity:0.8;">
                        <div style="display:flex; justify-content:space-between;"><span>Fix:</span><b>${sumFix.toFixed(2)}€</b></div>
                        <div style="display:flex; justify-content:space-between;"><span>Ausg:</span><b>${sumVar.toFixed(2)}€</b></div>
                        <hr style="border:0; border-top:1px solid rgba(0,0,0,0.1); margin:8px 0;">
                        <div class="summary-total" style="display:flex; justify-content:space-between; font-weight:bold; color:var(--text);">
                            <span>Gesamt:</span><span>${(sumFix+sumVar).toFixed(2)}€</span>
                        </div>
                    </div>
                </div>`;
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
        <button onclick="deleteMonth(${mIdx})" style="margin-top:30px; background:none; border:none; color:var(--danger); font-size:0.8rem; width:100%; text-align:center; cursor:pointer;">× Gesamten Monat löschen ×</button>
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

// --- JAHR HINZUFÜGEN ---
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
        root.years = existingYears;

        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    });
};

// --- JAHR LÖSCHEN ---
window.deleteFinanceYear = function(yearStr, event) {
    if (event) event.stopPropagation();
    openFinanceDeleteModal(`Möchtest du das Jahr "${yearStr}" inklusive ALLER darin enthaltenen Monate wirklich löschen?`, async () => {
        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);

        root.years = root.years.map(String).filter(y => y !== String(yearStr));
        root.months = root.months.filter(m => extractYearFromMonth(m) !== String(yearStr));

        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    });
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

    const isMobile = window.innerWidth < 768;
    const accent = "var(--primary-color)";
    const h = isMobile ? "70px" : "60px";

    modal.style.display = 'flex';

    setTimeout(() => {
        const closeBtn = modal.querySelector('button[onclick="closeFinanceModal()"]');
        if (closeBtn) {
            if (!isMobile) {
                closeBtn.style.setProperty('top', '100px', 'important');
                closeBtn.style.setProperty('right', '70px', 'important');
                closeBtn.style.setProperty('width', '100px', 'important');
                closeBtn.style.setProperty('height', '100px', 'important');
                closeBtn.style.setProperty('font-size', '2.4rem', 'important');
            } else {
                closeBtn.style.setProperty('top', '15px', 'important');
                closeBtn.style.setProperty('right', '15px', 'important');
                closeBtn.style.setProperty('width', '45px', 'important');
                closeBtn.style.setProperty('height', '45px', 'important');
                closeBtn.style.setProperty('font-size', '1.1rem', 'important');
            }
            closeBtn.style.setProperty('z-index', '1000', 'important');
            closeBtn.style.setProperty('color', 'var(--primary-text-color)', 'important');
        }
    }, 10);

    headerFixed.style.padding = isMobile ? "30px 15px" : "20px 15px";
    headerFixed.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-right:110px;">
            <h2 style="margin:0; font-size:${isMobile ? '1.5rem' : '1.4rem'}; font-weight: 800; text-transform: uppercase;">
                ${m.month_name}
            </h2>
        </div>
        
        <div class="finance-input-row" style="display:flex; gap:${isMobile ? '5px' : '10px'}; align-items:center; width:100%;">
            <input type="number" step="0.01" id="amt-${mIdx}" placeholder="€" 
                style="width:22%; height:${h}; border-radius:12px; border: 2px solid ${accent} !important; padding:0 8px; font-size:1.1rem; background: var(--card-background-color, white); color: var(--primary-text-color); outline:none;">
            
            <input type="text" id="name-${mIdx}" placeholder="Was?" 
                style="flex:1; height:${h}; border-radius:12px; border: 2px solid ${accent} !important; padding:0 12px; font-size:1.1rem; background: var(--card-background-color, white); color: var(--primary-text-color); outline:none; min-width:0;">
            
            <select id="type-${mIdx}" style="width:18%; height:${h}; border-radius:12px; border: 2px solid ${accent} !important; font-size:1.8rem; background: var(--card-background-color, white); color: var(--primary-text-color); appearance:none; text-align:center;">
                <option value="spendings">🛒</option>
                <option value="fixum">📌</option>
            </select>
            
            <button class="btn-add" onclick="addEntry(${mIdx})" 
                style="width:${isMobile ? '75px' : '65px'}; height:${h}; border-radius:12px; background:${accent}; color:white; border:none; font-size:1.1rem; cursor:pointer; font-weight:bold; flex-shrink:0;">
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
    openFinanceDeleteModal("Diesen Eintrag wirklich löschen?", async () => {
        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);
        if (!root.months[mIdx] || !root.months[mIdx][type]) return;

        root.months[mIdx][type].splice(iIdx, 1);
        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    });
};

// --- MONAT HINZUFÜGEN ---
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

        if (!root.years.map(String).includes(String(activeFinanceYear))) {
            root.years.push(String(activeFinanceYear));
        }

        root.months.push({
            year: String(activeFinanceYear),
            month_name: monthTitle,
            fixum: autoFixum,
            spendings: []
        });

        await saveToHA(root);
        lastFinanceDataHash = "";
        setTimeout(() => loadFinance(false), 200);
    });
};

// --- MONAT LÖSCHEN ---
window.deleteMonth = async function(mIdx) {
    openFinanceDeleteModal("Gesamten Monat wirklich löschen?", async () => {
        const s = await fetchHA('sensor.haushalt_finance_db');
        let root = parseFinanceRoot(s);
        
        root.months.splice(mIdx, 1);
        
        await saveToHA(root);
        closeFinanceModal();
    });
};

// --- EIGENER AUTO-SYNC NUR FÜR DAS FINANZ-SKRIPT (ALLE 2 SEKUNDEN) ---
if (window.financeDedicatedSync) clearInterval(window.financeDedicatedSync);
window.financeDedicatedSync = setInterval(async () => {
    const finSection = document.getElementById('v-finance');
    // Prüft automatisch, ob der Finanz-Bereich gerade offen/sichtbar ist
    const isVisible = finSection && finSection.style.display !== 'none' && finSection.offsetParent !== null;
    
    if (isVisible) {
        await window.loadFinance(true);
    }

    // Falls das Fixkosten-Vorlagen-Popup offen ist, auch dieses live synchronisieren
    const fixModal = document.getElementById('fixkostenModal');
    if (fixModal && fixModal.style.display === 'flex') {
        const oldTplHash = JSON.stringify(fixkostenTemplates);
        await loadFixkostenTemplates();
        if (JSON.stringify(fixkostenTemplates) !== oldTplHash) {
            renderFixkostenList();
        }
    }
}, 2000);
