// --- HA BASIS FUNKTIONEN (DIREKT IN FINANCE) ---
async function fetchHA(entity) {
    try {
        const token = (typeof HA_TOKEN !== "undefined" && HA_TOKEN) ? HA_TOKEN : (localStorage.getItem("ha_token") || "");
        const url = (typeof HA_URL !== "undefined" && HA_URL) ? HA_URL : window.location.origin;

        if (!token) return null;

        const r = await fetch(`${url}/api/states/${entity}`, { 
            headers: {'Authorization': `Bearer ${token}`} 
        });
        if (!r.ok) return null;
        return await r.json();
    } catch(e) { 
        console.error("HA Fetch Error:", e); 
        return null; 
    }
}

// Dauerhaftes Speichern: Sendet Event an Integration UND schreibt State für Neustartsicherheit
async function saveToHA(dataObj) {
    try {
        const token = (typeof HA_TOKEN !== "undefined" && HA_TOKEN) ? HA_TOKEN : (localStorage.getItem("ha_token") || "");
        const url = (typeof HA_URL !== "undefined" && HA_URL) ? HA_URL : window.location.origin;

        if (!token) return;

        // 1. Event feuern für die Live-Aktualisierung im Sensor (Python Integration)
        await fetch(`${url}/api/events/set_finance_db`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: dataObj })
        });

        // 2. Zustand direkt in HA State API schreiben (dauerhafte Sicherung)
        await fetch(`${url}/api/states/sensor.haushalt_finance_db`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                state: 'OK',
                attributes: { data: dataObj }
            })
        });
    } catch(e) { 
        console.error("HA Save Error:", e); 
    }
}

// --- FIXKOSTEN VORLAGEN LOGIK & HA SYNC ---

let fixkostenTemplates = [];

// Vorlagen aus HA oder LocalStorage laden
async function loadFixkostenTemplates() {
    try {
        const s = await fetchHA('sensor.haushalt_finance_templates');
        if (s && s.attributes && s.attributes.templates) {
            fixkostenTemplates = typeof s.attributes.templates === 'string' 
                ? JSON.parse(s.attributes.templates) 
                : s.attributes.templates;
        } else {
            const local = localStorage.getItem("ha_fixkosten_templates");
            if (local) fixkostenTemplates = JSON.parse(local);
        }
    } catch(e) {
        console.warn("Konnte Fixkosten-Vorlagen nicht aus HA laden:", e);
        const local = localStorage.getItem("ha_fixkosten_templates");
        if (local) {
            try { fixkostenTemplates = JSON.parse(local); } catch(err) {}
        }
    }
}

// Vorlagen in HA und LocalStorage speichern
async function saveFixkostenTemplates() {
    const jsonStr = JSON.stringify(fixkostenTemplates);
    localStorage.setItem("ha_fixkosten_templates", jsonStr);

    try {
        const token = (typeof HA_TOKEN !== "undefined" && HA_TOKEN) ? HA_TOKEN : (localStorage.getItem("ha_token") || "");
        const url = (typeof HA_URL !== "undefined" && HA_URL) ? HA_URL : window.location.origin;

        if (!token) return;

        // Event an Integration
        await fetch(`${url}/api/events/set_finance_templates`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ templates: fixkostenTemplates })
        });

        // State sichern
        await fetch(`${url}/api/states/sensor.haushalt_finance_templates`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                state: 'OK',
                attributes: { templates: fixkostenTemplates }
            })
        });
    } catch(e) {
        console.error("Fehler beim Speichern der Fixkosten-Vorlagen:", e);
    }
}

// Modal für Fixkosten-Vorlagen öffnen (Explizit an window gebunden)
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

// Liste der Vorlagen im Modal rendern
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

// Neue Vorlage aus dem Modal-Formular hinzufügen (Global verfügbar)
window.addFixkostenTemplate = async function() {
    const titleInput = document.getElementById("tpl_title");
    const amountInput = document.getElementById("tpl_amount");
    const monthsSelect = document.getElementById("tpl_months");

    if (!titleInput || !amountInput || !monthsSelect) {
        console.error("Eingabefelder für Fixkosten im HTML nicht gefunden!");
        return;
    }

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

// Vorlage aus Liste löschen (Global verfügbar)
window.deleteFixkostenTemplate = async function(index) {
    if (!Array.isArray(fixkostenTemplates)) return;
    fixkostenTemplates.splice(index, 1);
    await saveFixkostenTemplates();
    renderFixkostenList();
};

// Hilfsfunktion: Erkennt die Monatsnummer (1–12) aus dem Text (z.B. "Oktober 2026" -> 10)
function parseMonthIndex(monthString) {
    const str = monthString.toLowerCase();
    const months = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
    
    for (let i = 0; i < months.length; i++) {
        if (str.includes(months[i])) {
            return i + 1;
        }
    }
    const match = str.match(/\b(1[0-2]|[1-9])\b/);
    if (match) return parseInt(match[0]);

    return new Date().getMonth() + 1;
}

// Ermittelt die auf den neuen Monat passenden Fixkosten-Vorlagen
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
                if (allowed.includes(monthNum)) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                autoFixum.push({
                    name: tpl.title,
                    amount: parseFloat(tpl.amount)
                });
            }
        });
    }

    return autoFixum;
}

// --- FINANCE LOGIK ---

console.log("Finance Modul aktiv");

function renderFinanceItems(items, mIdx, type) {
    if (!items || items.length === 0) return '<div style="opacity:0.2; font-size:0.7rem; padding:5px;">Leer</div>';
    return items.map((i, iIdx) => `
        <div class="finance-item" style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.03); margin:3px 0; padding:6px 10px; border-radius:8px; font-size:0.85rem;">
            <span>${i.name}</span>
            <b onclick="delEntry(${mIdx}, '${type}', ${iIdx})" style="cursor:pointer; color:var(--danger);">${i.amount.toFixed(2)}€ ✕</b>
        </div>`).join('');
}

let currentOpenMonthIdx = null;

// --- 1. ÜBERSICHT LADEN (DASHBOARD) ---
window.loadFinance = async function() {
    const container = document.getElementById('months-container');
    if (!container) return;
    
    const s = await fetchHA('sensor.haushalt_finance_db');
    if (!s || !s.attributes) return;
    let root = s.attributes.data || s.attributes;
    let list = root.months || [];

    container.innerHTML = "";
    list.forEach((m, mIdx) => {
        const sumFix = (m.fixum || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
        const sumVar = (m.spendings || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
        
        container.innerHTML += `
        <div class="month-card" onclick="openFinanceModal(${mIdx})" style="cursor:pointer; text-align:center;">
            <h3 style="color:var(--primary); margin: 0 0 10px 0;">${m.month_name}</h3>
            <div style="font-size:0.85rem; opacity:0.8;">
                <div style="display:flex; justify-content:space-between;"><span>Fix:</span><b>${sumFix.toFixed(2)}€</b></div>
                <div style="display:flex; justify-content:space-between;"><span>Ausg:</span><b>${sumVar.toFixed(2)}€</b></div>
                <hr style="border:0; border-top:1px solid rgba(0,0,0,0.1); margin:8px 0;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; color:var(--text);">
                    <span>Gesamt:</span><span>${(sumFix+sumVar).toFixed(2)}€</span>
                </div>
            </div>
        </div>`;
    });

    if (currentOpenMonthIdx !== null) openFinanceModal(currentOpenMonthIdx);
};

// --- 2. POPUP ÖFFNEN ---
window.openFinanceModal = async function(mIdx) {
    currentOpenMonthIdx = mIdx;
    const modal = document.getElementById('finance-modal');
    const headerFixed = document.getElementById('modal-header-fixed');
    const content = document.getElementById('modal-content');
    
    const s = await fetchHA('sensor.haushalt_finance_db');
    if (!s || !s.attributes) return;
    let root = s.attributes.data || s.attributes;
    let m = (root.months || [])[mIdx];
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
            <input type="number" id="amt-${mIdx}" placeholder="€" 
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
};

window.closeFinanceModal = function() {
    currentOpenMonthIdx = null;
    const modal = document.getElementById('finance-modal');
    if (modal) modal.style.display = 'none';
    loadFinance();
};

// --- EINTRAG HINZUFÜGEN ---
window.addEntry = async function(mIdx) {
    const aIn = document.getElementById(`amt-${mIdx}`);
    const nIn = document.getElementById(`name-${mIdx}`);
    const tIn = document.getElementById(`type-${mIdx}`);
    const a = parseFloat(aIn.value), n = nIn.value.trim(), t = tIn.value;

    if (!a || !n) return;

    const s = await fetchHA('sensor.haushalt_finance_db');
    if (!s || !s.attributes) return;
    let root = s.attributes.data || s.attributes;
    
    if(!root.months[mIdx][t]) root.months[mIdx][t] = [];
    root.months[mIdx][t].push({name: n, amount: a});
    
    await saveToHA(root);
    aIn.value = ""; nIn.value = "";
    setTimeout(loadFinance, 500);
};

// --- EINTRAG LÖSCHEN ---
window.delEntry = async function(mIdx, type, iIdx) {
    if(!confirm("Eintrag löschen?")) return;
    const s = await fetchHA('sensor.haushalt_finance_db');
    if (!s || !s.attributes) return;
    let root = s.attributes.data || s.attributes;
    root.months[mIdx][type].splice(iIdx, 1);
    await saveToHA(root);
    setTimeout(loadFinance, 500);
};

// --- MONAT HINZUFÜGEN (INCL. AUTOMATISCHER FIXKOSTEN-VORLAGEN-ÜBERNAHME) ---
window.addNewMonth = async function() {
    const inputName = prompt("Welcher Monat soll hinzugefügt werden?", "Oktober 2026");
    
    if (!inputName || inputName.trim() === "") return;

    const monthTitle = inputName.trim();

    // Passende Fixkosten aus den gespeicherten Vorlagen ermitteln
    const autoFixum = await getFixkostenForMonthName(monthTitle);

    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = (s && s.attributes) ? (s.attributes.data || s.attributes) : { months: [] };
    if (!root.months) root.months = [];

    root.months.push({
        month_name: monthTitle,
        fixum: autoFixum,
        spendings: []
    });

    await saveToHA(root);
    setTimeout(loadFinance, 500);
};

// --- MONAT LÖSCHEN ---
window.deleteMonth = async function(mIdx) {
    if (!confirm("Gesamten Monat löschen?")) return;
    
    const s = await fetchHA('sensor.haushalt_finance_db');
    if (!s || !s.attributes) return;
    
    let root = s.attributes.data || s.attributes;
    root.months.splice(mIdx, 1);
    
    await saveToHA(root);
    
    // Popup sofort schließen und Ansicht aktualisieren
    closeFinanceModal();
};
