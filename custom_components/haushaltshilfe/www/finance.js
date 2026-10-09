// --- HA BASIS FUNKTIONEN (DIREKT IN FINANCE) ---
async function fetchHA(entity) {
    try {
        const r = await fetch(`${HA_URL}/api/states/${entity}`, { 
            headers: {'Authorization': `Bearer ${HA_TOKEN}`} 
        });
        return await r.json();
    } catch(e) { 
        console.error("HA Fetch Error:", e); 
        return null; 
    }
}

// Korrigierte Speicher-Funktion: Sendet das Event set_finance_db direkt an die HA API
async function saveToHA(dataObj) {
    try {
        await fetch(`${HA_URL}/api/events/set_finance_db`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: dataObj
            })
        });
    } catch(e) { 
        console.error("HA Save Error:", e); 
    }
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

// Variable um zu merken, welcher Monat gerade im Popup offen ist
let currentOpenMonthIdx = null;

// --- 1. ÜBERSICHT LADEN (DASHBOARD) ---
async function loadFinance() {
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

    // Falls das Modal offen ist, Inhalt dort auch aktualisieren
    if (currentOpenMonthIdx !== null) openFinanceModal(currentOpenMonthIdx);
}

// --- 2. POPUP ÖFFNEN ---
async function openFinanceModal(mIdx) {
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

    // --- BUTTON VERSCHIEBUNG ---
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

    // 1. NUR DER HEADER
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

    // 2. RESTLICHER INHALT
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

function closeFinanceModal() {
    currentOpenMonthIdx = null;
    document.getElementById('finance-modal').style.display = 'none';
    loadFinance();
}

async function addEntry(mIdx) {
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
}

async function delEntry(mIdx, type, iIdx) {
    if(!confirm("Eintrag löschen?")) return;
    const s = await fetchHA('sensor.haushalt_finance_db');
    if (!s || !s.attributes) return;
    let root = s.attributes.data || s.attributes;
    root.months[mIdx][type].splice(iIdx, 1);
    await saveToHA(root);
    setTimeout(loadFinance, 500);
}

async function addNewMonth() {
    const inputName = prompt("Welcher Monat soll hinzugefügt werden?", "Oktober 2026");
    
    if (!inputName || inputName.trim() === "") return;

    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = (s && s.attributes) ? (s.attributes.data || s.attributes) : { months: [] };
    if (!root.months) root.months = [];

    root.months.push({
        month_name: inputName.trim(),
        fixum: [],
        spendings: []
    });

    await saveToHA(root);
    setTimeout(loadFinance, 500);
}

async function deleteMonth(mIdx) {
    if(!confirm("Gesamten Monat löschen?")) return;
    const s = await fetchHA('sensor.haushalt_finance_db');
    if (!s || !s.attributes) return;
    let root = s.attributes.data || s.attributes;
    root.months.splice(mIdx, 1);
    await saveToHA(root);
    setTimeout(loadFinance, 500);
}
