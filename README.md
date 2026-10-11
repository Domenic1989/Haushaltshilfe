# 🏠 Haushaltshilfe Pro für Home Assistant

Eine elegante, benutzerfreundliche All-in-One-Lösung für die Organisation deines Haushalts direkt in Home Assistant. Verwalte Einkaufslisten, Finanzen, Aufgaben, Essenspläne und Müllabfuhr-Termine in einem übersichtlichen Custom Panel.

---

## ✨ Features

- 🛒 **Einkaufsliste & Favoriten**: Schnellartikel hinzufügen, Kategorien filtern und Geschäfte zuweisen.
- 💰 **Finanzplaner**: Monatsübersichten für Fixkosten und variable Ausgaben mit automatischer Summenberechnung.
- 📋 **Aufgaben & Termine**: Aufgaben zuweisen, Räumen zuordnen und als erledigt markieren.
- 🍽️ **Wochen-Essensplan**: Speiseplan von Montag bis Sonntag übersichtlich verwalten.
- 🗑️ **Müllabfuhr-Übersicht**: Direkte Anbindung an bestehende Müll-Sensoren über ein zentrales Konfigurations-Makro.
- 🔄 **Neustart-sicher**: Alle Daten (Finanzen, Einkäufe, Aufgaben) bleiben auch nach einem Home Assistant Neustart dauerhaft gespeichert.
- 🔑 **Multi-Device Login & Token-Speicherung**: Einmalig auf jedem Gerät (Smartphone, Tablet, PC) einrichten – die Sitzung bleibt dauerhaft gespeichert!

---

## 🚀 Installation & Einrichtung

### 1. Installation über HACS (oder Manuell)

#### Via HACS (Empfohlen)
1. Öffne **HACS** in deiner Home Assistant Instanz.
2. Klicke oben rechts auf die drei Punkte ➔ **Benutzerdefinierte Repositories**.
3. Füge die URL `https://github.com/Domenic1989/Haushaltshilfe` ein und wähle als Kategorie **Integration**.
4. Klicke auf **Herunterladen**.

#### Manuelle Installation
Kopiere den Ordner `custom_components/haushaltshilfe` in deinen Home Assistant Ordner `custom_components/`.

---

### 2. Integration aktivieren

1. Gehe in Home Assistant zu **Einstellungen** ➔ **Geräte & Dienste**.
2. Klicke unten rechts auf **Integration hinzufügen**.
3. Suche nach **Haushaltshilfe Pro** und füge die Integration hinzu.
4. Starte Home Assistant einmal neu, damit das Seitenleisten-Panel geladen wird.

> **Hinweis:** Es müssen **keine** Einträge in der `configuration.yaml` gemacht und **keine** Helfer manuell angelegt werden. Alle Speicher-Sensoren werden von der Integration automatisch generiert und verwaltet!

---

## 📱 Erstanmeldung & Geräte-Einrichtung

Wenn du die Haushaltshilfe Pro zum ersten Mal auf einem neuen Gerät (Smartphone, Tablet, Wand-Display oder PC) öffnest, richtest du die Verbindung einmalig ein:

1. **Long-Lived Access Token erstellen**:
   - Klicke in Home Assistant unten links auf dein **Benutzerprofil** (dein Name/Avatar).
   - Scrolle ganz nach unten zum Bereich **Langlebige Zugangstoken** (*Long-Lived Access Tokens*).
   - Klicke auf **Token erstellen**, gib einen Namen ein (z. B. *Tablet Küche*) und kopiere den generierten Schlüssel.
2. **Token in den Einstellungen eingeben**:
   - Öffne die Haushaltshilfe Pro und klicke oben rechts auf das **Zahnrad-Icon** ⚙️, um in die **Einstellungen** zu gelangen.
   - Füge deinen kopierten Access Token dort in das entsprechende Feld ein und bestätige die Eingabe.
   - Der Token wird sicher im `localStorage` des jeweiligen Geräts gespeichert.
   - Du bleibst auf diesem Gerät dauerhaft angemeldet und musst den Token nicht erneut eingeben!

---

## 🌐 Direktaufruf über den Webbrowser (URL)

Du kannst das Panel der Haushaltshilfe Pro auf zwei Arten aufrufen:

1. **Über die Seitenleiste**: Klicke einfach auf den Menüeintrag **Haushaltshilfe** in deinem Home Assistant.
2. **Direkt per Browser-URL**: Rufe die Adresse direkt auf, z. B. auf einem Wand-Tablet oder Kiosk-Browser:
   ```text
   http://<DEINE-HOME-ASSISTANT-IP>:8123/local/haushaltshilfe/index.html

## 🗑️ Müllabfuhr konfigurieren (Optional)

Solltest du bereits die HACS-Integration *Waste Collection Schedule* nutzen, passt du in der Datei `www/haushaltshilfe/config.js` einfach die Entitäten-IDs deiner Müll-Sensoren an:

```javascript
const TRASH_CONFIG = [
    { id: "sensor.gelber_sack", dateId: "sensor.gelber_sack_datum", name: "Gelber Sack", icon: "🟡" },
    { id: "sensor.papier", dateId: "sensor.papier_datum", name: "Altpapier", icon: "📦" },
    { id: "sensor.restmull", dateId: "sensor.restmull_datum", name: "Restmüll", icon: "🗑️" }
];

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
  
