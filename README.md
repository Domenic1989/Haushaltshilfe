[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg)](https://github.com/hacs/default)
[![GitHub Release](https://img.shields.io/github/v/release/Domenic1989/Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe/releases)
[![GitHub Downloads](https://img.shields.io/github/downloads/Domenic1989/Haushaltshilfe/total)](https://github.com/Domenic1989/Haushaltshilfe/releases)
[![GitHub Stars](https://img.shields.io/github/stars/Domenic1989/Haushaltshilfe?style=flat&color=yellow)](https://github.com/Domenic1989/Haushaltshilfe/stargazers)
[![Visitors](https://visitor-badge.laobi.icu/badge?page_id=Domenic1989.Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe)
[![Last Commit](https://img.shields.io/github/last-commit/Domenic1989/Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe/commits/main)
[![Issues](https://img.shields.io/github/issues/Domenic1989/Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe/issues)
[![License](https://img.shields.io/github/license/Domenic1989/Haushaltshilfe?color=blue)](https://github.com/Domenic1989/Haushaltshilfe/blob/main/LICENSE)
![GitHub Downloads](https://img.shields.io/github/downloads/Domenic1989/Haushaltshilfe/total?color=blue&style=for-the-badge)


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
- 🎛️ **Dynamische Tab-Steuerung**: Blende einzelne Navigations-Tabs ganz nach Bedarf aus oder ein – entweder direkt im Dashboard-Overlay oder über die Home Assistant Integrations-Einstellungen.
- 🔐 **Passwort- & System-Verwaltung**: Master-Passwort, Admin-Passwort und Access-Tokens bequem über die Benutzeroberfläche oder in Home Assistant anpassen.
- 🔄 **Vollständige Bidirektionale Synchronisation**: Egal ob du Passwörter oder die Tab-Sichtbarkeit im Dashboard-Overlay oder in den HA-Integrationsoptionen änderst – beide Stellen halten sich automatisch gegenseitig synchron!

  ### 💰 Finanzen & Fixkosten-Vorlagen
* Monatsübersicht für Ausgaben und Fixkosten.
* Vorlagen-Verwaltung mit flexiblen Intervallen (monatlich, quartalsweise, jährlich) für die automatische Übernahme in neue Monate.
* Geräteübergreifende Synchronisation via Home Assistant Helper (`helper_finance_templates`).

  ### 🔔 Home Assistant Automatisierungen & Push-Benachrichtigungen
* **Aufgaben-Bestätigung:** Push-Nachricht bei Erledigung/Bearbeitung einer Aufgabe mit Raum- und Namenangabe.
* **Fälligkeits-Erinnerung:** Minuten-genaue Push-Erinnerung, wenn eine Aufgabe fällig wird.
* Die fertigen YAML-Vorlagen dafür findest du im Ordner [`automations/`](automations/).

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


  const TRASH_CONFIG = [
    { id: "sensor.gelber_sack", dateId: "sensor.gelber_sack_datum", name: "Gelber Sack", icon: "🟡" },
    { id: "sensor.papier", dateId: "sensor.papier_datum", name: "Altpapier", icon: "📦" },
    { id: "sensor.restmull", dateId: "sensor.restmull_datum", name: "Restmüll", icon: "🗑️" }
  ];

# 📖 Bedienungsanleitung – Haus-Zentrale Pro 🏠

## 🔑 Übersicht der Standard-Passwörter & Einstellungen

| Funktion / Rolle | Standard-Passwort | Beschreibung / Einsatzort |
| :--- | :--- | :--- |
| **Master-Passwort** | `homeassistant` | Zugriff auf die System-Einstellungen (`⚙️` oben rechts am Login-Bildschirm). |
| **Admin-Passwort** | `1234` | Zugriff auf die Benutzerverwaltung (`⚙️ Verwaltung` zum Löschen von Benutzern). |
| **Standard-Benutzer `Admin`** | `admin` | Erstes Standard-Konto bei Neuinstallation. |
| **Standard-Benutzer `Tablet`** | `tablet` | Zweites Standard-Konto (z. B. für Wandtablets). |

> 💡 **Hinweis zu Passwörtern & Tabs:** Sämtliche Passwörter sowie die Sichtbarkeit der einzelnen Tabs können flexibel auf zwei Wegen angepasst werden:
> 1. **Über das Dashboard**: Im Login-Bildschirm oben rechts auf das Zahnrad `⚙️` klicken.
> 2. **Über Home Assistant**: Unter **Einstellungen ➔ Geräte & Dienste ➔ Haushaltshilfe Pro ➔ Konfigurieren**.
> 
> Beide Einstellungen halten sich vollständig automatisch in beide Richtungen synchron!

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

## 🎛️ Tab-Sichtbarkeit anpassen

Sämtliche Navigations-Tabs (🛒 Einkaufsliste, 📋 Aufgaben, 🍽️ Essensplan, 🗑️ Müll, 💶 Finanzen) können flexibel auf zwei Wegen ein- oder ausgeblendet werden:

1. **Über das Dashboard**: 
   - Klicke auf der Anmeldeseite oben rechts auf das Zahnrad **`⚙️`**.
   - Gib das Master-Passwort ein und passe die Häkchen im Bereich **„Sichtbare Tabs in der Leiste“** an.
2. **Über Home Assistant**: 
   - Gehe zu **Einstellungen ➔ Geräte & Dienste ➔ Haushaltshilfe Pro ➔ Konfigurieren**.
   - Wähle dort die gewünschten Tabs in der Mehrfachauswahl aus.

> 💡 **Hinweis:** Beide Wege halten sich vollständig automatisch in beide Richtungen synchron!

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
  
  ### Fixkosten-Vorlagen verwalten
1. Öffne das **Finanz-Tab**.
2. Klicke auf **⚙️ Fixkosten verwalten**.
3. Erstelle deine wiederkehrenden Ausgaben (Miete, Strom etc.) und wähle das passende Intervall.
4. Klicke auf **Speichern**. Beim Anlegen eines neuen Monats über **➕ Monat hinzufügen** werden deine Fixkosten nun automatisch eingetragen.

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
  
