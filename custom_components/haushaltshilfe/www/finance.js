// --- HA BASIS FUNKTIONEN (ÜBER TOKEN-FREIEN PROXY MIT CACHE-BUSTER) ---
async function fetchHA(entity) {
    try {
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

    if (s.state && typeof s.state === "string" && s.state.trim().startsWith("{")) {
        try { root = JSON.parse(s.state); } catch(e) {}
    }

    if (!root && s.attributes && s.attributes.data) {
        root = typeof s.attributes.data === "string" ? JSON.parse(s.attributes.data) : s.attributes.data;
    }

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
    cancelFixkostenEdit();
    renderFixkostenList();
    
    const modal = document.getElementById('fixkostenModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// --- EINKOMMEN / ÜBRIG / GESPART: Rechenhilfen ---
function finNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function finSum(arr) { return Array.isArray(arr) ? arr.reduce((a, i) => a + finNum(i && i.amount), 0) : 0; }
function finRound(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function finEur(x, plus) { const v = finRound(x); return (plus && v > 0 ? "+" : "") + v.toFixed(2) + "€"; }

// Zahlen eines Monats: Übrig = Einkommen − Fixkosten − Ausgaben (nur sinnvoll, wenn Einkommen eingetragen ist)
function finMonthStats(m) {
    const income = finSum(m && m.income), fix = finSum(m && m.fixum), spend = finSum(m && m.spendings);
    return { income, fix, spend, cost: fix + spend, left: income - fix - spend, hasIncome: !!(m && Array.isArray(m.income) && m.income.length > 0) };
}
// Zahlen eines Jahres: gespart wird nur aus Monaten gezählt, in denen Einkommen eingetragen ist
function finYearStats(months) {
    const r = { income: 0, fix: 0, spend: 0, saved: 0, counted: 0, total: 0 };
    (months || []).forEach(m => {
        const st = finMonthStats(m);
        r.total++; r.fix += st.fix; r.spend += st.spend;
        if (st.hasIncome) { r.income += st.income; r.saved += st.left; r.counted++; }
    });
    return r;
}
// Kleines farbiges Schild (grün = Plus, rot = Minus), Farben stehen in home.css
function finPill(value, extraClass) {
    const v = finRound(value);
    const el = document.createElement("span");
    el.className = "fin-pill " + (v < 0 ? "is-minus" : (v > 0 ? "is-plus" : "is-zero")) + (extraClass ? " " + extraClass : "");
    el.textContent = finEur(v, true);
    return el;
}
function finToast(msg) { if (typeof ingToast === "function") ingToast(msg); }

// --- Art der Vorlage: Fixkosten oder Einkommen ---
window.setTplKind = function(kind) {
    const row = document.getElementById("tplKindRow");
    const k = (kind === "income") ? "income" : "fix";
    if (row) {
        row.dataset.kind = k;
        row.querySelectorAll("button[data-kind]").forEach(b => {
            const on = b.dataset.kind === k;
            b.classList.toggle("is-on", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
        });
    }
    const saveBtn = document.getElementById("tplSaveBtn");
    if (saveBtn && parseInt(saveBtn.dataset.editIndex || "-1", 10) < 0) {
        saveBtn.textContent = k === "income" ? "➕ Einkommen speichern" : "➕ Fixkosten-Eintrag speichern";
    }
};
function getTplKind() {
    const row = document.getElementById("tplKindRow");
    return row && row.dataset.kind === "income" ? "income" : "fix";
}

function renderFixkostenList() {
    const listEl = document.getElementById("fixkostenList");
    if (!listEl) return;
    listEl.replaceChildren();

    if (!fixkostenTemplates || fixkostenTemplates.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style.cssText = "font-size:0.85rem; color:var(--gray); text-align:center; padding:15px; background:var(--bg); border-radius:12px;";
        emptyDiv.textContent = "Noch keine Fixkosten-Vorlagen hinterlegt.";
        listEl.appendChild(emptyDiv);
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
        div.className = "fix-tpl-row";
        div.style.cssText = "background:var(--bg); cursor:pointer;";
        div.addEventListener("click", () => editFixkostenTemplate(index));

        const infoDiv = document.createElement("div");
        infoDiv.className = "fix-tpl-info";

        const strongEl = document.createElement("strong");
        strongEl.style.cssText = "color:var(--text); font-size:0.95rem;";
        strongEl.textContent = (tpl.kind === "income" ? "💰 " : "") + tpl.title;

        const sepSpan = document.createElement("span");
        sepSpan.textContent = " — ";

        const amountSpan = document.createElement("span");
        amountSpan.style.cssText = "font-weight:bold; color:var(--primary);";
        amountSpan.textContent = `${parseFloat(tpl.amount).toFixed(2)} €`;

        const subDiv = document.createElement("div");
        subDiv.style.cssText = "font-size:0.75rem; color:var(--gray); margin-top:2px;";
        subDiv.textContent = (tpl.kind === "income" ? "Einkommen · " : "") + (monthLabels[tpl.months] || tpl.months);

        infoDiv.appendChild(strongEl);
        infoDiv.appendChild(sepSpan);
        infoDiv.appendChild(amountSpan);
        infoDiv.appendChild(subDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "fix-tpl-actions";

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.title = "Löschen";
        btnDel.className = "fix-tpl-del";
        btnDel.style.cssText = "background:transparent !important; border:none !important; box-shadow:none !important; outline:none !important; color:var(--danger); cursor:pointer; padding:0 !important; margin:0 !important; width:2.5rem; height:2.5rem; min-width:0; display:flex; align-items:center; justify-content:center; font-size:1.2rem; border-radius:50%;";
        btnDel.textContent = "🗑️";
        btnDel.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            deleteFixkostenTemplate(index);
        });

        actionsDiv.appendChild(btnDel);

        div.appendChild(infoDiv);
        div.appendChild(actionsDiv);
        listEl.appendChild(div);
    });
}

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
        setTplKind(tpl.kind === "income" ? "income" : "fix");

        saveBtn.dataset.editIndex = index;
        saveBtn.innerHTML = "💾 Änderung speichern";
        saveBtn.style.background = "var(--accent)";

        if (editBtn) editBtn.style.display = "none";
        if (cancelBtn) cancelBtn.style.display = "block";

        amountInput.focus();
    }
};

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
        setTplKind("fix");
        saveBtn.innerHTML = "➕ Fixkosten-Eintrag speichern";
        saveBtn.style.background = "var(--primary)";

        if (editBtn) editBtn.style.display = "block";
        if (cancelBtn) cancelBtn.style.display = "none";
    }
};

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
    const kind = getTplKind();

    if (!title || isNaN(amount)) {
        const modal = document.getElementById("customConfirmModal");
        const titleEl = document.getElementById("customConfirmTitle");
        const msgEl = document.getElementById("customConfirmMessage");
        
        if (modal && titleEl && msgEl) {
            titleEl.innerText = "Fehlende Eingabe";
            msgEl.innerText = "Bitte eine Bezeichnung und einen gültigen Betrag eingeben!";
            modal.style.display = "flex";
            
            window.resolveConfirm = function() {
                modal.style.display = "none";
            };
        } else {
            alert("Bitte eine Bezeichnung und einen gültigen Betrag eingeben!");
        }
        return;
    }

    if (!Array.isArray(fixkostenTemplates)) fixkostenTemplates = [];

    // Fixkosten bleiben wie bisher gespeichert (ohne "kind"); nur Einkommen bekommt die Kennzeichnung
    const entry = { title: title, amount: amount, months: months };
    if (kind === "income") entry.kind = "income";

    if (editIndex >= 0 && editIndex < fixkostenTemplates.length) {
        fixkostenTemplates[editIndex] = entry;
    } else {
        fixkostenTemplates.push(entry);
    }

    await saveFixkostenTemplates();
    cancelFixkostenEdit();
    renderFixkostenList();
};

window.deleteFixkostenTemplate = async function(index) {
    if (!Array.isArray(fixkostenTemplates) || !fixkostenTemplates[index]) return;
    
    const item = fixkostenTemplates[index];
    const name = item.title || item.name || "diese Vorlage";
    
    const confirmed = await showDeleteModal(`Möchtest du die ${item.kind === "income" ? "Einkommens" : "Fixkosten"}-Vorlage "${name}" wirklich löschen?`, "Vorlage löschen");
    
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

// Liefert die zum Monat passenden Vorlagen, getrennt nach Fixkosten und Einkommen
async function getTemplatesForMonthName(monthName) {
    await loadFixkostenTemplates();
    const monthNum = parseMonthIndex(monthName);
    const out = { fixum: [], income: [] };

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
                const item = { name: tpl.title, amount: parseFloat(tpl.amount) };
                (tpl.kind === "income" ? out.income : out.fixum).push(item);
            }
        });
    }
    return out;
}

async function getFixkostenForMonthName(monthName) {
    return (await getTemplatesForMonthName(monthName)).fixum;
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

// --- XSS-SICHERE RENDERING-FUNKTION FÜR FINANZ-EINTRÄGE ---
function renderFinanceItems(items, mIdx, type) {
    const container = document.createElement("div");

    if (!items || items.length === 0) {
        container.style.cssText = "opacity:0.2; font-size:0.7rem; padding:5px;";
        container.textContent = "Leer";
        return container;
    }

    items.forEach((i, iIdx) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "finance-item";

        const nameSpan = document.createElement("span");
        nameSpan.className = "fi-name";
        nameSpan.textContent = i.name;

        const deleteBtn = document.createElement("b");
        deleteBtn.className = "fi-amount";
        deleteBtn.style.cssText = "cursor:pointer; color:var(--danger);";
        deleteBtn.textContent = `${parseFloat(i.amount).toFixed(2)}€ ✕`;
        
        deleteBtn.addEventListener("click", () => {
            delEntry(mIdx, type, iIdx);
        });

        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(deleteBtn);
        container.appendChild(itemDiv);
    });

    return container;
}

// --- 1. ÜBERSICHT LADEN (JAHRE ODER MONATE) ---
window.loadFinance = async function(isBackgroundSync = false) {
    if (isBackgroundSync && typeof hhSortBusy === "function" && hhSortBusy()) return;   // gerade wird eine Karte gezogen

    const yearsView = document.getElementById('finance-years-view');
    const monthsView = document.getElementById('finance-months-view');
    const yearsContainer = document.getElementById('years-container');
    const monthsContainer = document.getElementById('months-container');

    if (!yearsContainer || !monthsContainer) return;

    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);
    
    const currentHash = JSON.stringify(root);
    if (isBackgroundSync && currentHash === lastFinanceDataHash) {
        return;
    }
    lastFinanceDataHash = currentHash;

    let list = root.months;
    let yearsList = root.years.map(String);

    renderFinanceSavedCard(root);
    const savedModalEl = document.getElementById('savedModal');
    if (savedModalEl && savedModalEl.style.display === 'flex') renderSavedModal(root);

    if (activeFinanceYear === null) {
        // --- ANSICHT 1: JAHRE ANZEIGEN ---
        if (yearsView) yearsView.style.display = 'block';
        if (monthsView) monthsView.style.display = 'none';

        yearsContainer.replaceChildren();
        if (typeof hhHintSet === "function") hhHintSet("years", yearsList.length);

        if (yearsList.length === 0) {
            const emptyYearDiv = document.createElement("div");
            emptyYearDiv.style.cssText = "text-align:center; padding:30px; opacity:0.6; font-weight:bold; grid-column: 1 / -1;";
            emptyYearDiv.textContent = 'Noch kein Jahr angelegt. Klicke oben auf "➕ Jahr hinzufügen".';
            yearsContainer.appendChild(emptyYearDiv);
            return;
        }

        yearsList.forEach((yearStr, yIdx) => {
            const monthsInYear = list.filter(m => extractYearFromMonth(m) === yearStr);
            
            const yst = finYearStats(monthsInYear);
            const sumFixYear = yst.fix;
            const sumVarYear = yst.spend;

            const card = document.createElement('div');
            card.className = "month-card year-card";
            card.style.cssText = "cursor:grab; user-select:none; -webkit-user-select:none;";
            card.dataset.index = yIdx;
            card.dataset.type = 'year';

            card.addEventListener("click", () => {
                if (card.dataset.wasDragged === "true") return;
                openFinanceYear(yearStr);
            });

            // Sicherer DOM-Aufbau der Jahreskarte gegen XSS (inkl. 4-Digits-Prüfung)
            const topRow = document.createElement("div");
            topRow.className = "year-card-top";

            const h3 = document.createElement("h3");
            h3.className = "year-card-title";
            h3.style.cssText = "color:var(--primary); cursor:pointer;";
            h3.textContent = `📅 Jahr ${yearStr}`;

            const countBadge = document.createElement("span");
            countBadge.className = "year-card-count";
            countBadge.style.cssText = "cursor:pointer;";
            countBadge.textContent = `${monthsInYear.length} Monate`;

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "del-finance-btn year-card-del";
            delBtn.style.cssText = "background:transparent !important; border:none !important; box-shadow:none !important; outline:none !important; color:var(--danger); cursor:pointer; padding:0 !important; margin:0 !important; width:2.4rem; height:2.4rem; min-width:0; display:flex; align-items:center; justify-content:center; font-size:1.2rem; border-radius:50%;";
            delBtn.textContent = "🗑️";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                deleteFinanceYear(yearStr, e);
            });

            topRow.appendChild(h3);
            topRow.appendChild(countBadge);
            topRow.appendChild(delBtn);

            const infoBox = document.createElement("div");
            infoBox.className = "year-card-info";
            infoBox.style.cssText = "cursor:pointer; pointer-events:none;";

            const fixRow = document.createElement("div");
            fixRow.className = "mc-row";
            const fixLabel = document.createElement("span");
            fixLabel.textContent = "Fixkosten (Jahr):";
            const fixVal = document.createElement("b");
            fixVal.textContent = `${sumFixYear.toFixed(2)}€`;
            fixRow.appendChild(fixLabel);
            fixRow.appendChild(fixVal);

            const varRow = document.createElement("div");
            varRow.className = "mc-row";
            const varLabel = document.createElement("span");
            varLabel.textContent = "Ausgaben (Jahr):";
            const varVal = document.createElement("b");
            varVal.textContent = `${sumVarYear.toFixed(2)}€`;
            varRow.appendChild(varLabel);
            varRow.appendChild(varVal);

            const hr = document.createElement("hr");
            hr.className = "mc-hr";

            const totalRow = document.createElement("div");
            totalRow.className = "summary-total";
            const totalLabel = document.createElement("span");
            totalLabel.textContent = "Jahresgesamt:";
            const totalVal = document.createElement("span");
            totalVal.textContent = `${(sumFixYear + sumVarYear).toFixed(2)}€`;
            totalRow.appendChild(totalLabel);
            totalRow.appendChild(totalVal);

            if (yst.counted > 0) {
                const incRowY = document.createElement("div");
                incRowY.className = "mc-row";
                const incLabelY = document.createElement("span");
                incLabelY.textContent = "Einkommen (Jahr):";
                const incValY = document.createElement("b");
                incValY.textContent = `${yst.income.toFixed(2)}€`;
                incRowY.appendChild(incLabelY);
                incRowY.appendChild(incValY);
                infoBox.appendChild(incRowY);
            }
            infoBox.appendChild(fixRow);
            infoBox.appendChild(varRow);
            infoBox.appendChild(hr);
            infoBox.appendChild(totalRow);
            if (yst.counted > 0) {
                const savedRowY = document.createElement("div");
                savedRowY.className = "mc-row mc-left";
                const savedLabelY = document.createElement("span");
                savedLabelY.textContent = "Gespart:";
                savedRowY.appendChild(savedLabelY);
                savedRowY.appendChild(finPill(yst.saved));
                infoBox.appendChild(savedRowY);
            }

            card.appendChild(topRow);
            card.appendChild(infoBox);

            if (typeof hhSortBind === "function") hhSortBind(card, 'fin-year', yIdx, (f, t) => applyFinanceNewOrder('year', f, t), { ignore: '.del-finance-btn, button', label: `📅 Jahr ${yearStr}` });
            yearsContainer.appendChild(card);
        });
    } else {
        // --- ANSICHT 2: MONATE DES GEWÄHLTEN JAHRES ANZEIGEN ---
        if (yearsView) yearsView.style.display = 'none';
        if (monthsView) monthsView.style.display = 'block';

        const titleEl = document.getElementById('finance-year-title');
        if (titleEl) titleEl.textContent = `Finanzen ${activeFinanceYear} 📅`;

        monthsContainer.replaceChildren();
        
        const monthsWithIndex = list
            .map((m, idx) => ({ m, idx }))
            .filter(item => extractYearFromMonth(item.m) === String(activeFinanceYear));

        if (typeof hhHintSet === "function") hhHintSet("months", monthsWithIndex.length);

        if (monthsWithIndex.length === 0) {
            const emptyMonthDiv = document.createElement("div");
            emptyMonthDiv.style.cssText = "text-align:center; padding:30px; opacity:0.6; font-weight:bold; grid-column: 1 / -1;";
            emptyMonthDiv.textContent = `Noch keine Monate in ${activeFinanceYear} angelegt. Klicke oben auf "➕ Monat in diesem Jahr hinzufügen".`;
            monthsContainer.appendChild(emptyMonthDiv);
        } else {
            monthsWithIndex.forEach(({ m, idx: mIdx }, localIdx) => {
                const mst = finMonthStats(m);
                const sumFix = mst.fix;
                const sumVar = mst.spend;
                
                const card = document.createElement('div');
                card.className = "month-card";
                card.style.cssText = "cursor:pointer; text-align:center; user-select:none; -webkit-user-select:none;";
                card.dataset.index = localIdx;
                card.dataset.type = 'month';

                card.addEventListener("click", () => {
                    if (card.dataset.wasDragged === "true") return;
                    openFinanceModal(mIdx);
                });

                // Sicherer DOM-Aufbau für Monatskarten (Freitext ${m.month_name} geschützt)
                const monthTitle = document.createElement("h3");
                monthTitle.className = "month-card-title";
                monthTitle.style.cssText = "color:var(--primary); pointer-events:none;";
                monthTitle.textContent = m.month_name;

                const infoBox = document.createElement("div");
                infoBox.className = "month-card-info";
                infoBox.style.cssText = "pointer-events:none;";

                const fixRow = document.createElement("div");
                fixRow.className = "mc-row";
                fixRow.innerHTML = `<span>Fix:</span><b>${sumFix.toFixed(2)}€</b>`;

                const varRow = document.createElement("div");
                varRow.className = "mc-row";
                varRow.innerHTML = `<span>Ausg:</span><b>${sumVar.toFixed(2)}€</b>`;

                const hr = document.createElement("hr");
                hr.className = "mc-hr";

                const totalRow = document.createElement("div");
                totalRow.className = "summary-total";
                totalRow.style.cssText = "color:var(--text);";
                totalRow.innerHTML = `<span>Gesamt:</span><span>${(sumFix+sumVar).toFixed(2)}€</span>`;

                if (mst.hasIncome) {
                    const incRow = document.createElement("div");
                    incRow.className = "mc-row";
                    incRow.innerHTML = `<span>Einkommen:</span><b>${mst.income.toFixed(2)}€</b>`;
                    infoBox.appendChild(incRow);
                }
                infoBox.appendChild(fixRow);
                infoBox.appendChild(varRow);
                infoBox.appendChild(hr);
                infoBox.appendChild(totalRow);
                if (mst.hasIncome) {
                    const leftRow = document.createElement("div");
                    leftRow.className = "mc-row mc-left";
                    const leftLabel = document.createElement("span");
                    leftLabel.textContent = "Übrig:";
                    leftRow.appendChild(leftLabel);
                    leftRow.appendChild(finPill(mst.left));
                    infoBox.appendChild(leftRow);
                }

                card.appendChild(monthTitle);
                card.appendChild(infoBox);

                if (typeof hhSortBind === "function") hhSortBind(card, 'fin-month', localIdx, (f, t) => applyFinanceNewOrder('month', f, t), { ignore: '.del-finance-btn, button', label: `📅 ${m.month_name}` });
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
// --- REIHENFOLGE VON JAHREN UND MONATEN SPEICHERN ---
// (Ziehen selbst: hhSortBind in script.js – Handy: gedrückt halten, PC: Maus)
// ========================================================
async function applyFinanceNewOrder(type, fromIndex, toIndex) {
    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);

    if (type === 'year') {
        let yearsList = root.years.map(String);
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= yearsList.length || toIndex >= yearsList.length) { lastFinanceDataHash = ""; loadFinance(false); return; }   // inzwischen woanders geändert
        const [movedYear] = yearsList.splice(fromIndex, 1);
        yearsList.splice(toIndex, 0, movedYear);
        root.years = yearsList;
    } else if (type === 'month') {
        const yearStr = String(activeFinanceYear);
        const yearMonths = root.months.filter(m => extractYearFromMonth(m) === yearStr);
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= yearMonths.length || toIndex >= yearMonths.length) { lastFinanceDataHash = ""; loadFinance(false); return; }   // inzwischen woanders geändert

        const [movedMonth] = yearMonths.splice(fromIndex, 1);
        yearMonths.splice(toIndex, 0, movedMonth);

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

    // Grundstruktur des Modals aufbauen
    content.replaceChildren();

    // 0. Übrig / Gespart (Einkommen − Fixkosten − Ausgaben)
    const st = finMonthStats(m);
    const resSection = document.createElement('div');
    resSection.className = "fin-section fin-result-section";
    const resTitle = document.createElement('small');
    resTitle.className = "fin-section-title";
    resTitle.textContent = "🧮 ÜBRIG / GESPART";
    resSection.appendChild(resTitle);
    const resBox = document.createElement('div');
    resBox.className = "fin-section-box";
    const resRow = document.createElement('div');
    resRow.className = "finance-item fin-result";
    const resName = document.createElement('span');
    resName.className = "fi-name";
    resName.textContent = st.hasIncome ? "Übrig in diesem Monat" : "Noch kein Einkommen eingetragen";
    resRow.appendChild(resName);
    if (st.hasIncome) resRow.appendChild(finPill(st.left));
    const resNote = document.createElement('div');
    resNote.className = "fin-result-note";
    resNote.textContent = st.hasIncome
        ? `Einkommen ${finEur(st.income)} − Fixkosten ${finEur(st.fix)} − Ausgaben ${finEur(st.spend)}`
        : "Trage unten bei „💰 EINKOMMEN“ dein Einkommen ein, dann wird hier gerechnet.";
    resRow.appendChild(resNote);
    resBox.appendChild(resRow);
    resSection.appendChild(resBox);
    content.appendChild(resSection);

    // 0b. Einkommen Sektion
    const incSection = document.createElement('div');
    incSection.className = "fin-section";
    const incTitle = document.createElement('small');
    incTitle.className = "fin-section-title";
    incTitle.textContent = "💰 EINKOMMEN";
    incSection.appendChild(incTitle);
    const incBox = document.createElement('div');
    incBox.className = "fin-section-box";
    incBox.appendChild(renderFinanceItems(m.income, mIdx, 'income'));
    if (!st.hasIncome) {
        const fillBtn = document.createElement('button');
        fillBtn.type = "button";
        fillBtn.className = "finance-item fin-fill-income";
        fillBtn.textContent = "↻ Einkommen aus Vorlagen eintragen";
        fillBtn.addEventListener("click", () => fillIncomeFromTemplates(mIdx));
        incBox.appendChild(fillBtn);
    }
    incSection.appendChild(incBox);
    content.appendChild(incSection);

    // 1. Fixkosten Sektion
    const fixSection = document.createElement('div');
    fixSection.className = "fin-section";

    const fixTitle = document.createElement('small');
    fixTitle.className = "fin-section-title";
    fixTitle.textContent = "📌 FIXKOSTEN";
    fixSection.appendChild(fixTitle);

    const fixBox = document.createElement('div');
    fixBox.className = "fin-section-box";
    const renderedFix = renderFinanceItems(m.fixum, mIdx, 'fixum');
    if (renderedFix) fixBox.appendChild(renderedFix);
    fixSection.appendChild(fixBox);
    content.appendChild(fixSection);

    // 2. Ausgaben Sektion
    const spendSection = document.createElement('div');
    spendSection.className = "fin-section";

    const spendTitle = document.createElement('small');
    spendTitle.className = "fin-section-title";
    spendTitle.textContent = "🛒 AUSGABEN";
    spendSection.appendChild(spendTitle);

    const spendBox = document.createElement('div');
    spendBox.className = "fin-section-box";
    const renderedSpend = renderFinanceItems(m.spendings, mIdx, 'spendings');
    if (renderedSpend) spendBox.appendChild(renderedSpend);
    spendSection.appendChild(spendBox);
    content.appendChild(spendSection);

    // 3. Löschen-Button
    const deleteWrapper = document.createElement('div');
    deleteWrapper.className = "fin-delete-wrap";

    const delMonthBtn = document.createElement('button');
    delMonthBtn.type = "button";
    delMonthBtn.className = "fin-delete-month";
    delMonthBtn.style.cssText = "background:transparent !important; border:none !important; box-shadow:none !important; outline:none !important; color:var(--danger); cursor:pointer; padding:0.7rem 1.2rem; font-size:1.1rem; border-radius:12px;";
    delMonthBtn.textContent = "🗑️ Gesamten Monat löschen";
    delMonthBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        deleteMonth(mIdx);
    });

    deleteWrapper.appendChild(delMonthBtn);
    content.appendChild(deleteWrapper);
}

// ========================================================
// --- GESPART: SUMME ÜBER ALLE JAHRE + FENSTER "JAHR FÜR JAHR" ---
// ========================================================
// Gespart = Einkommen − Fixkosten − Ausgaben eines Monats. Jeder Monat steht in der Liste;
// ohne Einkommen (oder wenn nichts übrig blieb) steht dort 0,00 € bzw. der Minusbetrag.
function financeSavedTotals(root) {
    const yearSet = new Set((root.years || []).map(String));
    (root.months || []).forEach(m => { const y = extractYearFromMonth(m); if (y) yearSet.add(y); });
    const years = Array.from(yearSet).sort((a, b) => parseInt(b) - parseInt(a));
    let total = 0, anyIncome = false;
    const rows = years.map(y => {
        const months = (root.months || []).filter(m => extractYearFromMonth(m) === y);
        const st = finYearStats(months);
        total += st.saved;
        if (st.counted > 0) anyIncome = true;
        return { year: y, months, st };
    });
    return { total, rows, anyIncome };
}

// Was soll auf der Startseite stehen? Jeder Benutzer entscheidet für sich (Datenbank: homeShow.<Benutzer>).
// Einschalten geht nur mit dem Passwort des Benutzers, Ausschalten ohne.
function financeCurrentUser() {
    try { if (typeof user !== "undefined" && user) return String(user); } catch (e) { /* egal */ }
    try { return localStorage.getItem("selectedUser") || ""; } catch (e) { return ""; }
}

function financeHomeOpts(root, userName) {
    const all = (root && root.homeShow && typeof root.homeShow === "object") ? root.homeShow : {};
    const o = (userName && all[userName] && typeof all[userName] === "object") ? all[userName] : {};
    return { saved: !!o.saved, left: !!o.left };
}

function paintHomeOptButtons() {
    const o = window.__finHomeOpts || { saved: false, left: false };
    document.querySelectorAll(".saved-card-opts button[data-opt]").forEach(btn => {
        const on = !!o[btn.dataset.opt];
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.textContent = (on ? "✓ " : "") + (btn.dataset.opt === "saved" ? "💰 Gespart (Jahr)" : "🧮 Übrig (Monat)");
    });
}

window.toggleHomeOpt = async function(key) {
    if (key !== "saved" && key !== "left") return;
    const who = financeCurrentUser();
    if (!who) { finToast("Bitte zuerst anmelden."); return; }
    if (window.__finHomeBusy) return;

    const cur = window.__finHomeOpts || { saved: false, left: false };
    const turningOn = !cur[key];

    if (turningOn) {
        // Einschalten: Passwort des angemeldeten Benutzers abfragen und am Server prüfen
        window.__finHomeBusy = true;
        try {
            const what = key === "saved" ? "Das Gesparte dieses Jahres" : "Das Übrige dieses Monats";
            const pw = await showPasswordPrompt(`🔒 Passwort von ${who} eingeben:\n${what} wird dann auf deiner Startseite angezeigt.`);
            if (pw === null) return;
            const ok = await loginUserViaBackend(who, pw);
            if (!ok) {
                await showAlert("Das Passwort ist falsch. Der Schalter bleibt aus.", "Passwort falsch ❌");
                return;
            }
        } finally {
            window.__finHomeBusy = false;
        }
    }

    const next = { saved: !!cur.saved, left: !!cur.left };
    next[key] = turningOn;
    window.__finHomeOpts = next;      // sofort sichtbar, auch bei schnellem Doppeltippen
    paintHomeOptButtons();

    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);
    const all = (root.homeShow && typeof root.homeShow === "object") ? root.homeShow : {};
    root.homeShow = Object.assign({}, all, { [who]: next });     // Einstellungen anderer Benutzer bleiben unberührt
    await saveToHA(root);
    lastFinanceDataHash = "";
    setTimeout(() => loadFinance(false), 400);
};

function renderFinanceSavedCard(root) {
    const wrap = document.getElementById("finance-saved-wrap");
    if (!wrap) return;
    const t = financeSavedTotals(root);
    const who = financeCurrentUser();
    window.__finHomeOpts = financeHomeOpts(root, who);
    wrap.replaceChildren();

    const card = document.createElement("div");
    card.className = "saved-card";

    // Hauptteil: Antippen öffnet das Fenster "Gespart"
    const main = document.createElement("div");
    main.className = "saved-card-main";
    main.setAttribute("role", "button");
    main.tabIndex = 0;
    const open = () => openSavedModal();
    main.addEventListener("click", open);
    main.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });

    const head = document.createElement("div");
    head.className = "saved-card-head";
    const title = document.createElement("div");
    title.className = "saved-card-title";
    title.textContent = "💰 Gespart insgesamt";
    head.appendChild(title);
    head.appendChild(finPill(t.total, "fin-pill-big"));

    const sub = document.createElement("div");
    sub.className = "saved-card-sub";
    sub.textContent = t.anyIncome ? "Jahr für Jahr ansehen →" : "Trage in einem Monat dein Einkommen ein, dann siehst du hier, was übrig bleibt →";

    main.appendChild(head);
    main.appendChild(sub);
    card.appendChild(main);

    // Schalter: was soll auf der Startseite stehen?
    const opts = document.createElement("div");
    opts.className = "saved-card-opts";
    const label = document.createElement("span");
    label.className = "saved-opts-label";
    label.textContent = "🏠 Auf der Startseite zeigen:";
    opts.appendChild(label);
    ["saved", "left"].forEach(key => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fin-opt-btn";
        btn.dataset.opt = key;
        btn.addEventListener("click", () => toggleHomeOpt(key));
        opts.appendChild(btn);
    });
    const hint = document.createElement("div");
    hint.className = "saved-opts-hint";
    hint.textContent = who
        ? `🔒 Einschalten geht nur mit dem Passwort von ${who}, ausschalten ohne. Die Einstellung gilt nur für ${who}.`
        : "🔒 Melde dich an, um das für die Startseite einzustellen.";
    opts.appendChild(hint);
    card.appendChild(opts);
    wrap.appendChild(card);
    paintHomeOptButtons();
}

const savedOpenYears = new Set();   // aufgeklappte Jahre im Gespart-Fenster (zuerst sind alle zugeklappt)

function renderSavedModal(root) {
    const box = document.getElementById("saved-content");
    if (!box) return;
    const t = financeSavedTotals(root);
    box.replaceChildren();

    // Gesamt
    const totalRow = document.createElement("div");
    totalRow.className = "saved-row saved-total";
    const totalName = document.createElement("span");
    totalName.className = "fi-name";
    totalName.textContent = "Gespart insgesamt";
    totalRow.appendChild(totalName);
    totalRow.appendChild(finPill(t.total, "fin-pill-big"));
    box.appendChild(totalRow);

    if (t.rows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "fin-result-note";
        empty.textContent = "Noch kein Jahr angelegt.";
        box.appendChild(empty);
        return;
    }

    t.rows.forEach(r => {
        const sec = document.createElement("div");
        sec.className = "fin-section saved-year";

        const headBtn = document.createElement("button");
        headBtn.type = "button";
        headBtn.className = "saved-year-head";
        const isOpen = savedOpenYears.has(r.year);
        headBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        const yName = document.createElement("span");
        yName.className = "saved-year-name";
        yName.textContent = `📅 ${r.year}`;
        const yMeta = document.createElement("span");
        yMeta.className = "saved-year-meta";
        yMeta.textContent = `${r.months.length} ${r.months.length === 1 ? "Monat" : "Monate"}`;
        const yArrow = document.createElement("span");
        yArrow.className = "saved-year-arrow";
        yArrow.textContent = isOpen ? "▾" : "▸";
        headBtn.appendChild(yName);
        headBtn.appendChild(yMeta);
        headBtn.appendChild(finPill(r.st.saved));
        headBtn.appendChild(yArrow);
        headBtn.addEventListener("click", () => {
            if (savedOpenYears.has(r.year)) savedOpenYears.delete(r.year); else savedOpenYears.add(r.year);
            renderSavedModal(root);
        });
        sec.appendChild(headBtn);

        if (isOpen) {
            const body = document.createElement("div");
            body.className = "fin-section-box saved-year-body";
            if (r.months.length === 0) {
                const none = document.createElement("div");
                none.className = "fin-result-note";
                none.textContent = "Noch keine Monate in diesem Jahr.";
                body.appendChild(none);
            }
            r.months.forEach(m => {
                const st = finMonthStats(m);
                const row = document.createElement("div");
                row.className = "saved-row";
                const nm = document.createElement("span");
                nm.className = "fi-name";
                nm.textContent = String(m.month_name || "").replace(/\s*\b20\d{2}\b\s*/, " ").trim() || "Monat";
                if (!st.hasIncome) {
                    const note = document.createElement("small");
                    note.className = "saved-note";
                    note.textContent = " · kein Einkommen eingetragen";
                    nm.appendChild(note);
                }
                row.appendChild(nm);
                row.appendChild(finPill(st.hasIncome ? st.left : 0));
                body.appendChild(row);
            });
            sec.appendChild(body);
        }
        box.appendChild(sec);
    });
}

window.openSavedModal = async function() {
    const modal = document.getElementById("savedModal");
    if (!modal) return;
    const s = await fetchHA('sensor.haushalt_finance_db');
    renderSavedModal(parseFinanceRoot(s));
    modal.style.display = "flex";
};

window.closeSavedModal = function() {
    savedOpenYears.clear();
    const modal = document.getElementById("savedModal");
    if (modal) modal.style.display = "none";
};

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

// --- JAHR HINZUFÜGEN (Inklusive strenger 4-stelliger Validierung) ---
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

// --- 2. POPUP FÜR MONAT ÖFFNEN (XSS-sicher für ${m.month_name}) ---
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
    
    // Header-Bereich sauber mit createElement aufbauen
    headerFixed.replaceChildren();

    const topHeaderRow = document.createElement("div");
    topHeaderRow.className = "fin-modal-head";
    
    const h2Title = document.createElement("h2");
    h2Title.className = "fin-modal-title";
    h2Title.textContent = m.month_name;
    topHeaderRow.appendChild(h2Title);

    const inputRow = document.createElement("div");
    inputRow.className = "finance-input-row";
    

    const amtInput = document.createElement("input");
    amtInput.type = "number";
    amtInput.step = "0.01";
    amtInput.id = `amt-${mIdx}`;
    amtInput.placeholder = "€";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = `name-${mIdx}`;
    nameInput.placeholder = "Was?";

    const selectType = document.createElement("select");
    selectType.id = `type-${mIdx}`;
    
    const optSpendings = document.createElement("option");
    optSpendings.value = "spendings";
    optSpendings.textContent = "🛒";
    
    const optFixum = document.createElement("option");
    optFixum.value = "fixum";
    optFixum.textContent = "📌";

    const optIncome = document.createElement("option");
    optIncome.value = "income";
    optIncome.textContent = "💰";

    selectType.appendChild(optSpendings);
    selectType.appendChild(optFixum);
    selectType.appendChild(optIncome);

    const okBtn = document.createElement("button");
    okBtn.className = "btn-add";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", () => addEntry(mIdx));

    inputRow.appendChild(amtInput);
    inputRow.appendChild(nameInput);
    inputRow.appendChild(selectType);
    inputRow.appendChild(okBtn);

    headerFixed.appendChild(topHeaderRow);
    headerFixed.appendChild(inputRow);

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

// --- EINKOMMEN AUS VORLAGEN IN EINEN BESTEHENDEN MONAT ÜBERNEHMEN ---
window.fillIncomeFromTemplates = async function(mIdx) {
    const s = await fetchHA('sensor.haushalt_finance_db');
    let root = parseFinanceRoot(s);
    const m = root.months[mIdx];
    if (!m) return;
    if (Array.isArray(m.income) && m.income.length > 0) return;   // nichts doppelt eintragen

    const tpl = await getTemplatesForMonthName(m.month_name || "");
    if (!tpl.income.length) {
        finToast("Keine Einkommens-Vorlage für diesen Monat. Lege sie bei „Fixkosten verwalten“ an.");
        return;
    }
    m.income = tpl.income;
    await saveToHA(root);
    lastFinanceDataHash = "";
    setTimeout(() => loadFinance(false), 200);
    finToast("💰 Einkommen eingetragen");
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

        const autoTpl = await getTemplatesForMonthName(monthTitle);
        const autoFixum = autoTpl.fixum;
        const autoIncome = autoTpl.income;

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
            income: autoIncome,
            fixum: autoFixum,
            spendings: []
        });

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

function upgradeIntervalSelect() {
    const sel = document.getElementById("tpl_months");
    if (!sel) return;
    
    // Falls der Button noch nicht existiert, einmalig anlegen
    let wrapper = document.getElementById("custom-interval-wrapper");
    if (!wrapper) {
        sel.style.setProperty("display", "none", "important");

        wrapper = document.createElement("div");
        wrapper.id = "custom-interval-wrapper";
        wrapper.className = "custom-cook-wrapper";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "custom-interval-btn";
        btn.className = "cook-select custom-cook-btn";
        btn.setAttribute("onclick", "openIntervalModal(event)");

        wrapper.appendChild(btn);
        sel.parentNode.insertBefore(wrapper, sel.nextSibling);
    }

    const btn = document.getElementById("custom-interval-btn");
    if (btn) {
        // Holt sich exakt den Text der aktuell ausgewählten Option aus dem <select>
        const selectedOpt = sel.options[sel.selectedIndex];
        btn.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📅 ${selectedOpt ? selectedOpt.textContent : 'Intervall wählen'}</span> <span class="cook-arrow">▾</span>`;
    }
}

// Öffnet das Auswahlsfenster zentriert in der Bildschirmmitte
window.openIntervalModal = function(ev) {
    if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
    }
    const sel = document.getElementById("tpl_months");
    if (!sel) return;

    let modal = document.getElementById("customIntervalModalOverlay");
    if (modal) modal.remove();

    modal = document.createElement("div");
    modal.id = "customIntervalModalOverlay";
    modal.className = "cook-modal-overlay";
    modal.onclick = () => modal.remove();

    const card = document.createElement("div");
    card.className = "modal-card cook-modal-card";
    card.onclick = (e) => e.stopPropagation();

    const title = document.createElement("h3");
    title.id = "customConfirmTitle";
    title.style.margin = "0 0 6px 0";
    title.style.textAlign = "center";
    title.textContent = "ANFALLES-INTERVALL";
    card.appendChild(title);

    const list = document.createElement("div");
    list.className = "cook-modal-list";

    Array.from(sel.options).forEach(opt => {
        const itemBtn = document.createElement("button");
        itemBtn.type = "button";
        const isSelected = sel.value === opt.value;
        // Nutzt deine gewohnten Klassen für den aktiven Zustand
        itemBtn.className = "cat-btn cook-modal-option" + (isSelected ? " active-food" : "");
        itemBtn.textContent = opt.textContent;

        itemBtn.onclick = () => {
            sel.value = opt.value;
            // Aktualisiert den Button-Text SOFORT, bevor das Popup schließt
            upgradeIntervalSelect();
            modal.remove();
            // Löst das originale change-Event aus
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            if (typeof sel.onchange === "function") sel.onchange();
        };
        list.appendChild(itemBtn);
    });

    card.appendChild(list);
    modal.appendChild(card);
    document.body.appendChild(modal);
};

// Beim Laden der Seite und bei Bedarf aufrufen
document.addEventListener("DOMContentLoaded", () => {
    upgradeIntervalSelect();
});

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
