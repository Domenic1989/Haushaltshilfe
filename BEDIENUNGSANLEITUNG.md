

## 🔑 Übersicht der Standard-Passwörter

| Funktion / Rolle | Standard-Passwort | Beschreibung / Einsatzort |
| :--- | :--- | :--- |
| **Master-Passwort** | `homeassistant` | Zugriff auf die System-Einstellungen (`⚙️` oben rechts am Login-Bildschirm). |
| **Admin-Passwort** | `1234` | Zugriff auf die Benutzerverwaltung (`⚙️ Verwaltung` zum Löschen von Benutzern). |
| **Standard-Benutzer `Admin`** | `admin` | Erstes Standard-Konto bei Neuinstallation. |
| **Standard-Benutzer `Tablet`** | `tablet` | Zweites Standard-Konto (z. B. für Wandtablets). |

> 💡 **Hinweis:** Sämtliche Passwörter können nach dem ersten Start in den **System-Einstellungen** oder der `config.js` individuell angepasst werden.

---

## 1. 🔑 Anmelden & Benutzerverwaltung

### Anmelden
1. Klicke im Login-Bildschirm auf deinen **Benutzer-Avatar** im Raster.
2. Gib dein **Passwort** in das Eingabefeld ein.
3. Klicke auf **Anmelden**.

---

### Neuer Benutzer erstellen (`👤 + Neu`)
1. Klicke auf dem Login-Bildschirm auf den Button **`👤 + Neu`**.
2. **Wichtig:** Ein neuer Benutzer kann **nur durch die direkte Vergabe eines Passworts** angelegt werden!
3. Es öffnen sich nacheinander die Eingabefelder:
   - **Benutzername**: Gib den Namen ein (z. B. `Klara`).
   - **Passwort**: Gib das persönliche Passwort für diesen Benutzer ein (z. B. `1234`).
4. Bestätige mit **OK**.
5. Der Benutzer erscheint sofort als auswählbare Karte im Login-Grid und kann sich ab sofort mit dem vergebenen Passwort anmelden.

---

### Benutzer verwalten & löschen (`⚙️ Verwaltung`)
1. Klicke auf **`⚙️ Verwaltung`**.
2. Gib das **Admin-Passwort** ein (Standard: `1234`).
3. An allen Benutzerkarten erscheint nun ein rotes **`✕`**.
4. Klicke auf das **`✕`** des Benutzers, den du löschen möchtest.
5. Klicke auf **`❌ Beenden`**, um den Verwaltungsmodus wieder zu verlassen.

---

### System-Einstellungen (`⚙️` Oben Rechts)
1. Klicke oben rechts auf das Zahnrad-Symbol **`⚙️`**.
2. Gib das **Master-Passwort** ein (Standard: `homeassistant`).
3. In diesem Dialog kannst du:
   - Den **Long-Lived Access Token** eintragen oder aktualisieren.
   - Das **Admin-Passwort** für die Benutzerverwaltung ändern.
4. Klicke auf **Speichern**.

---

## 2. 🛒 Einkaufs-Modul (`Shop`)

- **Artikel hinzufügen**: Gib den Namen im Feld *„Was fehlt?“* ein und klicke auf **`+`**.
- **Mengen-Auswahl**: Beim Klick auf ein Favoriten-Icon öffnet sich ein Pop-up zur Auswahl der gewünschten Stückzahl.
- **Kategorie erstellen**: Klicke auf **`📂 + Kategorie`**, um Abteilungen anzulegen (z. B. *Getränke*, *Obst*).
- **Favorit anlegen**: Klicke auf **`⭐️ + Favoriten`**, um häufig gekaufte Artikel als Schnellauswahl einzurichten.
- **Geschäfte-Filter**: Filter über die linke Seitenleiste nach Supermärkten (z. B. *Aldi*, *Rewe*, *Lidl*).

---

## 3. 🍽️ Wochenplan-Modul (`Essen`)

- **Gericht eintragen**: Trage direkt im Feld des jeweiligen Wochentags (MO–SO) ein, was gekocht wird.
- **Koch / Verantwortlichen zuweisen**: Wähle im Dropdown-Menü neben dem Tag die kochende Person aus.
- **Favoriten nutzen**: Speichere Lieblingsgerichte als Favoriten ab, um sie schnell in den Wochenplan einzufügen.
- **Woche zurücksetzen**: Klicke unten auf **`Woche zurücksetzen 🧹`**, um alle Tage auf einmal zu leeren.

---

## 4. 🏠 Aufgaben- & Haus-Modul (`Haus`)

### Neue Aufgabe anlegen
1. Gib die Aufgabe im Textfeld ein (z. B. *„Rasen mähen“*) und klicke auf **`+`**.
2. Im **Details & Intervall Modal** kannst du festlegen:
   - **Zugeordnet an**: Wähle das zuständige Familienmitglied aus.
   - **Option 1 (Intervall)**: Intervall in **Stunden** oder **Tagen** festlegen.
   - **Option 2 (Wochentage)**: Wähle bestimmte Wochentage aus (M, D, M, D, F, S, S).
   - **Option 3 (Festes Datum)**: Exaktes Fälligkeitsdatum mit Uhrzeit wählen.

### Aufgabe erledigen & bearbeiten
- **Erledigen**: Klicke auf den Kreis / das Häkchen neben der Aufgabe.
- **Bearbeiten**: Klicke auf die Aufgabe, um Name, Person oder Intervall im Edit-Modal anzupassen.

---

## 5. 💰 Finanz-Modul (`Finanzen`)

- **Monat anlegen**: Klicke auf **`➕ Monat manuell hinzufügen`** (z. B. *Oktober 2026*).
- **Eintrag hinzufügen**: Klicke auf eine Monatskarte und trage Betrag (`€`), Beschreibung (*Was?*) sowie Typ ein:
  - 📌 **Fixum**: Feste monatliche Kosten (Miete, Strom, Internet).
  - 🛒 **Spendings**: Variable Ausgaben (Einkauf, Tanken, Freizeit).
- **Eintrag löschen**: Klicke auf das **`✕`** neben dem jeweiligen Eintrag.

---

## 6. 🚛 Müll-Modul (`Müll`)

- Zeigt automatisch die nächsten Termine für **Gelber Sack**, **Altpapier** und **Restmüll** an.
- Die Daten werden automatisch aus den hinterlegten Home-Assistant-Sensoren geladen.

---

## 7. 🎨 Themes & Design anpassen

Klicke oben links auf das Paletten-Symbol **`🎨`**, um das Design zu wechseln:
- 💎 **Glass** (Glassmorphism-Look)
- 🌑 **Dark** (Dunkler Modus)
- ☀️ **Light** (Helles Design)
- 🟢 **Green** / 🔵 **Blue** (Farbige Akzente)
