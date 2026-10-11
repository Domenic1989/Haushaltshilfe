# 📖 Bedienungsanleitung – Haus-Zentrale Pro 🏠

## 🔑 Übersicht der Standard-Passwörter

| Funktion / Rolle | Standard-Passwort | Beschreibung / Einsatzort |
| :--- | :--- | :--- |
| **Master-Passwort** | `homeassistant` | Zugriff auf die System-Einstellungen (`⚙️` oben rechts am Login-Bildschirm). |
| **Admin-Passwort** | `1234` | Zugriff auf die Benutzerverwaltung (`⚙️ Verwaltung` zum Löschen von Benutzern). |
| **Standard-Benutzer `Admin`** | `admin` | Erstes Standard-Konto bei Neuinstallation. |
| **Standard-Benutzer `Tablet`** | `tablet` | Zweites Standard-Konto (z. B. für Wandtablets). |

> 💡 **Hinweis:** Das Master-Passwort schützt die Grundeinstellungen (Access-Token & Admin-Passwort). Sämtliche Passwörter können nach dem ersten Start in den System-Einstellungen angepasst werden.

---

## 1. 🔑 Anmelden & Benutzerverwaltung (`loginOverlay`)

### Anmelden
1. Klicke im Login-Bildschirm auf deinen **Benutzer-Avatar** im Raster (`userGrid`).
2. Gib dein Passwort in das Eingabefeld ein (über das **👁️-Symbol** kannst du die Eingabe sichtbar machen).
3. Klicke auf **Anmelden**.

---

### Neuer Benutzer erstellen (`👤 + Neu`)
1. Klicke auf dem Login-Bildschirm auf den Button **`👤 + Neu`**.
2. **Wichtig:** Ein neuer Benutzer wird direkt mit Eingabe von Benutzername und persönlichem Passwort angelegt.
3. Bestätige die Abfragen mit **OK**.
4. Der Benutzer erscheint sofort als auswählbare Karte im Login-Grid.

---

### Benutzer verwalten & löschen (`⚙️ Verwaltung`)
1. Klicke auf **`⚙️ Verwaltung`**.
2. Gib das **Admin-Passwort** ein (Standard: `1234`).
3. An allen Benutzerkarten erscheint nun ein rotes **`✕`** zum Löschen.
4. Klicke auf **`❌ Beenden`**, um den Verwaltungsmodus wieder zu verlassen.

---

### System-Einstellungen (`⚙️` Oben Rechts)
1. Klicke oben rechts auf der Login-Karte auf das graue Zahnrad **`⚙️`**.
2. Gib das **Master-Passwort** ein (Standard: `homeassistant`).
3. Im Dialog **System-Einstellungen** (`settingsOverlay`) kannst du:
   - Den **Long-Lived Access Token** eintragen oder aktualisieren.
   - Das **Admin-Passwort** für die Benutzerverwaltung neu festlegen.
4. Klicke auf **Speichern**.

---

## 2. 🛒 Einkaufs-Modul (`Shop` / `v-shop`)

- **Artikel hinzufügen**: Gib den Namen im Feld *„Was fehlt?“* ein und klicke auf **`+`**.
- **Schnellartikel / Favoriten**: Beim Klick auf ein Favoriten-Icon öffnet sich das Mengen-Modal (`shopQtyModal`), in dem du die gewünschte Stückzahl festlegst.
- **Kategorie & Favorit erstellen**: Nutze die Buttons **`📂 + Kategorie`** und **`⭐️ + Favoriten`**, um Schnellauswahlen anzulegen.
- **Geschäfte-Filter**: Filtere über die linke Seitenleiste (`shopSidebar`) nach Supermärkten.

---

## 3. 🍽️ Wochenplan-Modul (`Essen` / `v-food`)

- **Gericht eintragen**: Trage direkt im Feld des jeweiligen Wochentags (MO–SO) ein, was gekocht wird.
- **Koch / Verantwortlichen zuweisen**: Wähle im Dropdown-Menü neben dem Tag die kochende Person aus.
- **Kategorien & Favoriten**: Nutze **`📂 + Kategorie`** und **`⭐️ + Favoriten`**, um Lieblingsgerichte schnell in den Wochenplan einzufügen.
- **Woche zurücksetzen**: Klicke unten auf **`Woche zurücksetzen 🧹`**, um alle Tage auf einmal zu leeren.

---

## 4. 🏠 Aufgaben- & Haus-Modul (`Haus` / `v-todo`)

### Neue Aufgabe anlegen (`intervalModal`)
1. Gib die Aufgabe im Textfeld ein (z. B. *„Rasen mähen“*) und klicke auf **`+`**.
2. Im Popup kannst du festlegen:
   - **Zugeordnet an**: Wähle das zuständige Familienmitglied im Dropdown aus.
   - **Option 1 (Intervall)**: Zahl eingeben und als **Stunden** oder **Tage** speichern (inkl. Standard-Uhrzeit).
   - **Option 2 (Wochentage)**: Klicke die Wochentags-Punkte an (M, D, M, D, F, S, S) und klicke auf **Tage Speichern**.
   - **Option 3 (Festes Datum)**: Exaktes Fälligkeitsdatum über den Kalender auswählen und mit **Datum nutzen ✅** bestätigen.

### Aufgabe erledigen & bearbeiten (`editModal`)
- **Erledigen**: Klicke auf das Häkchen neben der Aufgabe.
- **Bearbeiten**: Klicke auf den Namen einer Aufgabe, um das Bearbeiten-Modal zu öffnen. Hier kannst du den Namen, die Zuordnung, Intervalle, Wochentage oder das Datum anpassen.

---

## 5. 💰 Finanz-Modul (`Finanzen` / `v-finance`)

- **Monat anlegen**: Klicke auf **`➕ Monat manuell hinzufügen`** (z. B. *Oktober 2026*).
- **Einträge verwalten**: Klicke auf eine Monatskarte, um das Detail-Modal (`finance-modal`) zu öffnen.
- **Fixum & Spendings**: Trage Fixkosten (Miete, Internet) oder variable Ausgaben (Einkauf, Tanken) mit Betrag (`€`) und Beschreibung ein.
- **Eintrag löschen**: Klicke auf das **`✕`** neben dem jeweiligen Eintrag.

---

## 6. 🚛 Müll-Modul (`Müll` / `v-trash`)

- Zeigt automatisch die nächsten Abholtermine für **Gelber Sack**, **Altpapier**, **Restmüll** und **Biomüll** an.
- Die Daten werden automatisch live aus den hinterlegten Home-Assistant-Sensoren geladen.

---

## 7. 🎨 Themes & Design anpassen (`theme-dropdown`)

Klicke oben auf das Paletten-Symbol **`🎨`**, um das Erscheinungsbild der Oberfläche zu wechseln:
- 💎 **Glass** (Glassmorphism-Look)
- 🌑 **Dark** (Dunkler Modus)
- ☀️ **Light** (Helles Design)
- 🟢 **Green** (Grüne Akzente)
- 🔵 **Blue** (Blaue Akzente)

---

## 🚪 Abmelden (`Logout`)
Klicke in der untersten Navigationsleiste auf das Tür-Symbol **`🚪 Logout`**, um zur Benutzerauswahl zurückzukehren.
