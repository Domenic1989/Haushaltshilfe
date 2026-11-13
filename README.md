[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/Domenic1989/Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe/releases)
[![HA Installations](https://img.shields.io/badge/dynamic/json?color=41BDF5&logo=home-assistant&label=installations&query=%24.custom_integrations.haushaltshilfe.total&url=https%3A%2F%2Fanalytics.home-assistant.io%2Fcustom_integrations.json)](https://analytics.home-assistant.io/)
[![GitHub Stars](https://img.shields.io/github/stars/Domenic1989/Haushaltshilfe?style=flat&color=yellow)](https://github.com/Domenic1989/Haushaltshilfe/stargazers)
[![Visitors](https://visitor-badge.laobi.icu/badge?page_id=Domenic1989.Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe)
[![Last Commit](https://img.shields.io/github/last-commit/Domenic1989/Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe/commits/main)
[![Issues](https://img.shields.io/github/issues/Domenic1989/Haushaltshilfe)](https://github.com/Domenic1989/Haushaltshilfe/issues)

# 🏠 Haushaltshilfe Pro für Home Assistant

Eine elegante, benutzerfreundliche All-in-One-Lösung für die Organisation deines Haushalts direkt in Home Assistant. Verwalte Einkaufslisten, Vorrat, Finanzen, Aufgaben, Wartungen, Essenspläne, Termine und Müllabfuhr in einem übersichtlichen Custom Panel.

[![Open your Home Assistant instance and open your repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Domenic1989&repository=Haushaltshilfe&category=integration)

---

## ✨ Features

- 🏡 **Startseite**: Begrüßung mit allem Wichtigen auf einen Blick – heute fällige Aufgaben, fällige Wartungen, knapper Vorrat, die Termine der Woche, Einkaufsliste, aktuelle Ausgaben und das Essen der aktuellen Woche.
- 🍽️ **Wochen-Essensplan**: Speiseplan von Montag bis Sonntag übersichtlich verwalten, für diese Woche und für die nächste Woche. Wann die nächste Woche automatisch zur aktuellen wird (Standard: Sonntag, 23:00 Uhr), stellst du selbst ein.
- 👆 **Schnelle Mahlzeiten-Auswahl**: Ein Tipp auf ein Essensfeld öffnet ein Auswahlfenster mit deinen Favoriten und Rezepten – oder du tippst einfach etwas ein.
- 🛒 **Automatische Einkaufsliste aus dem Essensplan**: Trägst du ein bekanntes Gericht ein (z. B. *Pizza*), setzt die App auf Wunsch die Zutaten automatisch auf die Einkaufsliste – in den Laden deiner Wahl. Automatisch, händisch oder gar nicht: Du entscheidest.
- 📖 **Rezepte**: Über 50 eingebaute Rezepte, die du ansehen, ändern und um eigene Rezepte erweitern kannst.
- 📦 **Vorrat**: Behalte im Blick, was du zu Hause hast. Wird etwas knapp, meldet es die Startseite – und die App fragt dich, ob und in welchem Laden es auf die Einkaufsliste soll.
- 🔧 **Wartung**: Wiederkehrende Aufgaben wie Rauchmelder prüfen, Heizung warten oder TÜV – mit Intervall, Vorwarnung, Vorlagen und eigenem Verlauf.
- 📅 **Kalender**: Die aktuelle Woche auf der Startseite, ein Tipp öffnet den ganzen Monat. Du kannst mehrere Home-Assistant-Kalender (z. B. einen pro Person) mit eigenen Farben anzeigen und Termine direkt eintragen.
- ✅ **Erledigt mit Namen und Lob**: Beim Erledigen fragt die App, wer es gemacht hat, und bedankt sich mit einem kleinen Lob-Fenster. Der **📜 Verlauf** zeigt, wer was erledigt hat.
- ↕️ **Sortieren per Ziehen**: Geschäfte, Räume, Jahre und Monate bringst du durch Ziehen in die gewünschte Reihenfolge, am Handy mit gedrücktem Finger. Artikel schiebst du im Einkauf einfach in ein anderes Geschäft. Kleine 💡 Hinweise in der App zeigen, wo das geht.
- 🧩 **Zusatzfunktionen**: Vorrat, Wartung und Kalender schaltest du ein oder aus – in der App oder in den Integrations-Optionen. Wer sie nicht braucht, sieht sie nicht.
- 🗑️ **Müllabfuhr-Übersicht**: Direkte Anbindung an bestehende Müll-Sensoren, die du ganz bequem in den Integrations-Optionen von Home Assistant auswählst.
- 🔄 **Neustart-sicher**: Alle Daten (Finanzen, Einkäufe, Vorrat, Aufgaben, Wartungen, Essenspläne, Rezepte) bleiben auch nach einem Home Assistant Neustart dauerhaft gespeichert.
- 🔑 **Sichere Anmeldung**: Läuft über deine Home-Assistant-Sitzung. Für Wand-Tablets im Kiosk-Modus kann pro Gerät ein eigenes Token hinterlegt werden.
- 🎛️ **Dynamische Tab-Steuerung**: Blende einzelne Navigations-Tabs ganz nach Bedarf aus oder ein – entweder direkt im Dashboard-Overlay oder über die Home Assistant Integrations-Einstellungen.
- 🔐 **Passwort- & System-Verwaltung**: Master- und Admin-Passwort bequem über die Benutzeroberfläche oder in Home Assistant anpassen. Alle Passwörter werden nur gehasht gespeichert und am Server geprüft.
- 🔄 **Vollständige bidirektionale Synchronisation**: Egal ob du Passwörter oder die Tab-Sichtbarkeit im Dashboard-Overlay oder in den HA-Integrationsoptionen änderst – beide Stellen halten sich automatisch gegenseitig synchron!
- 📱 **Für Handy, Tablet und PC**: Die Oberfläche passt sich der Bildschirmgröße und dem eingestellten Zoom an. Kleine Fenster bleiben klein, große Fenster bleiben groß – auch im Wand-Tablet-Betrieb.
- 🎨 **11 Themes**: Von Glass und Dark bis Weihnachten und FC Bayern. Alle Fenster – auch Essensauswahl, Zutaten, Rezepte, Vorrat, Wartung, Kalender sowie Auswahllisten und Datums-/Uhrzeit-Auswahl – passen sich dem gewählten Theme an.

### 💰 Finanzen, Einkommen & Fixkosten-Vorlagen

* Monatsübersicht für Ausgaben und Fixkosten.
* Vorlagen-Verwaltung mit flexiblen Intervallen (monatlich, quartalsweise, jährlich) für die automatische Übernahme in neue Monate. Neben Fixkosten gibt es jetzt auch **Einkommens-Vorlagen** (z. B. Gehalt).
* **Einkommen & Übrig:** Trage dein Einkommen pro Monat ein. Die App rechnet aus, was übrig bleibt (Einkommen − Fixkosten − Ausgaben).
* **Gespart:** Eine eigene Karte zeigt, wie viel du insgesamt gespart hast – Jahr für Jahr aufklappbar.
* **Auf der Startseite zeigen:** Wer möchte, blendet *Übrig (Monat)* und *Gespart (Jahr)* auf der eigenen Startseite ein. Das gilt nur für den eigenen Benutzer und wird mit dem eigenen Passwort eingeschaltet.
* Geräteübergreifende Synchronisation via Home Assistant Helper (`helper_finance_templates`).

### 🔔 Home Assistant Automatisierungen & Push-Benachrichtigungen

* **Aufgaben-Bestätigung:** Push-Nachricht bei Erledigung/Bearbeitung einer Aufgabe mit Raum- und Namenangabe.
* **Fälligkeits-Erinnerung:** Minuten-genaue Push-Erinnerung, wenn eine Aufgabe fällig wird.
* **Popup bei fälliger Aufgabe (optional):** Ein Vollbild-Popup auf Handy oder Tablet, sobald eine Aufgabe fällig wird. Dafür brauchst du die HACS-Integration *Browser Mod*.
* Die fertigen YAML-Vorlagen dafür findest du im Ordner [`automations/`](automations/).

---

# 🚀 Installation & Einrichtung

### 1. Installation über HACS (empfohlen)

1. Öffne **HACS** in deiner Home Assistant Instanz.
2. Suche nach **Haushaltshilfe** (die Integration ist direkt im offiziellen HACS-Default-Store verfügbar).
3. Klicke auf **Herunterladen**.
4. Starte deine Home Assistant Instanz einmal neu, damit die Integration geladen wird.

*(Falls du die Integration früher manuell installiert hattest, lösche bitte vorab den alten Ordner `custom_components/haushaltshilfe` aus deinem Home Assistant Verzeichnis, bevor du sie über HACS installierst.)*

### 2. Integration aktivieren

1. Gehe in Home Assistant zu **Einstellungen** ➔ **Geräte & Dienste**.
2. Klicke unten rechts auf **Integration hinzufügen**.
3. Suche nach **Haushaltshilfe Pro** und füge die Integration hinzu.
4. Starte Home Assistant einmal neu, damit das Seitenleisten-Panel geladen wird.

> **Hinweis:** Es müssen **keine** Einträge in der `configuration.yaml` gemacht und **keine** Helfer manuell angelegt werden. Alle Speicher-Sensoren werden von der Integration automatisch generiert und verwaltet!

---

## 📱 Erstanmeldung & Geräte-Einrichtung

Wenn du die **Haushaltshilfe Pro** zum ersten Mal auf einem neuen Gerät (Smartphone, Tablet, Wand-Display oder PC) öffnest, richtest du die Verbindung einmalig ein.

### 1. Aufrufen über die Home-Assistant-Seitenleiste (empfohlen, auch in der Companion-App)

Öffne einfach deine Home-Assistant-Oberfläche und klicke in der Seitenleiste auf den Eintrag **Haushaltshilfe** (bzw. **Haushaltshilfe Pro**).

- Die Verbindung zum Server und die Authentifizierung laufen komplett im Hintergrund über deine bestehende Home-Assistant-Sitzung und den integrierten Proxy.
- Bei dieser Nutzung ist kein manuelles Long-Lived Access Token auf den Geräten nötig – es ist nichts weiter einzurichten.

### 2. Benutzer auswählen & einrichten

- Beim ersten Start legst du über **👤 + Neu** die Benutzer an (dafür wird das Admin-Passwort abgefragt) oder wählst deinen bestehenden Benutzer aus.
- Über das Zahnrad-Icon **⚙️** kannst du in den System-Einstellungen jederzeit deine Passwörter und Konfigurationen verwalten.

---

## 🌐 Direktaufruf über den Webbrowser (URL / Kiosk / Wand-Tablet)

Du kannst das Panel der Haushaltshilfe Pro auf zwei Arten aufrufen:

1. **Über die Seitenleiste:** Klicke einfach auf den Menüeintrag **Haushaltshilfe** in deinem Home Assistant.
2. **Direkt per Browser-URL:** Rufe die Adresse direkt auf, z. B. auf einem Wand-Tablet oder im Kiosk-Browser:
   - `http://<DEINE-HOME-ASSISTANT-IP>:8123/haushaltshilfe_static/index.html`
   - `http://<DEINE-HOME-ASSISTANT-IP>/haushaltshilfe_static/index.html`

### Token-Einrichtung für den Direktaufruf

Beim Direktaufruf über die Browser-URL gibt es im Hintergrund keine aktive Home-Assistant-Sitzung. Deshalb braucht das Gerät einmalig ein eigenes Token:

1. In Home Assistant unten links auf dein **Profil** ➔ **Sicherheit** ➔ **Langlebige Zugangstoken** ➔ **Token erstellen** klicken (z. B. *Tablet Küche*). Am besten erstellst du dieses Token mit einem eigenen HA-Benutzer ohne Admin-Rechte.
2. In der Haushaltshilfe auf das Zahnrad **⚙️** tippen, das Token in das Feld **Home-Assistant-Token** einfügen und speichern.

Das Token wird nur im Browser dieses Geräts gespeichert und nie an andere Geräte weitergegeben. Geht das Tablet verloren, widerrufst du einfach dieses eine Token.

> 🔒 **Update-Hinweis für Versionen bis 1.0.6:** Ältere Versionen haben ein Token im Backend gespeichert und ohne Anmeldung herausgegeben. Bitte nach dem Update **alle Langlebigen Zugangstoken widerrufen**, die du für die Haushaltshilfe erstellt hast, und für Kiosk-Geräte neue anlegen.

---

## 🗑️ Müllabfuhr konfigurieren (optional)

Solltest du bereits eine Müllkalender-Integration (wie z. B. *Waste Collection Schedule* über HACS) nutzen, kannst du deine Sensoren ganz bequem und **update-sicher** direkt in der Home Assistant Oberfläche hinterlegen – ganz ohne Dateien bearbeiten zu müssen.

1. Gehe in Home Assistant auf **Einstellungen** ⚙️ ➔ **Geräte & Dienste**.
2. Suche die Integration **Haushaltshilfe Pro** und klicke auf **Konfigurieren**.
3. Wähle im unteren Bereich einfach deine bestehenden Sensoren für **Gelber Sack**, **Papiertonne** und **Restmüll** (jeweils den Sensor für die *verbleibenden Tage* und das *Abholdatum*) aus der Liste aus.
4. Klicke auf **OK** – das Dashboard übernimmt deine Auswahl sofort automatisch und behält sie auch bei zukünftigen HACS-Updates dauerhaft bei!

---

## 🧩 Zusatzfunktionen & Kalender einrichten (optional)

📦 **Vorrat**, 🔧 **Wartung** und 📅 **Kalender** sind Zusatzfunktionen, die du ein- und ausschalten kannst, weil nicht jeder sie braucht. Ausgeschaltet verschwinden die Knöpfe und die Startseiten-Karten – deine Daten bleiben erhalten.

| Funktion | Standard |
| :--- | :--- |
| 📦 Vorrat | an (wer ihn schon nutzt, behält ihn) |
| 🔧 Wartung | an (wer sie schon nutzt, behält sie) |
| 📅 Kalender | aus |

1. Gehe in Home Assistant zu **Einstellungen** ➔ **Geräte & Dienste** ➔ **Haushaltshilfe Pro** ➔ **Konfigurieren**.
2. Wähle bei **Zusatzfunktionen (Vorrat, Wartung, Kalender)** aus, was du nutzen möchtest.
3. Für den Kalender wählst du bei **📅 Kalender: Diese Kalender auf der Startseite anzeigen** einen oder mehrere deiner Home-Assistant-Kalender aus.
4. Bei **📅 Kalender: Neue Termine hier eintragen** legst du fest, in welchen Kalender neue Termine standardmäßig kommen (leer = der erste Kalender).
5. Klicke auf **OK** und lade die App einmal neu.

Alternativ schaltest du die Zusatzfunktionen in der App unter **⚙️ System-Einstellungen** ➔ **Zusatzfunktionen** ein und aus. Welche Kalender angezeigt werden, wählst du immer in Home Assistant.

> 👥 **Kalender für mehrere Personen:** Wähle einfach pro Person einen Kalender aus. Jeder Kalender bekommt in der App eine eigene Farbe, und du kannst einzelne Kalender ein- und ausblenden. Hast du mehrere Kalender, wählst du beim Anlegen eines Termins, in welchen er kommt.

> ℹ️ **Termine anlegen und löschen** geht nur bei Kalendern, die das in Home Assistant erlauben (z. B. Google Kalender oder der „Lokale Kalender“). Reine Abo-Kalender, etwa über eine ICS-Adresse, und Feiertags-Kalender sind nur lesbar. Die App erkennt das selbst und zeigt **＋ Termin** bzw. 🗑️ nur dort, wo es geht.

---

## 🔔 Popup bei fälliger Aufgabe einrichten (optional)

1. Installiere **Browser Mod** über HACS und registriere dein Handy oder Tablet im Reiter *Browser Mod* der Home-Assistant-Seitenleiste.
2. Öffne die Datei *Haushaltshilfe - Popup bei fälliger Aufgabe (Browser Mod).yaml* aus dem Ordner [`automations/`](automations/) und kopiere den Inhalt.
3. Gehe in Home Assistant zu **Einstellungen** ➔ **Automatisierungen** ➔ **Neue Automatisierung**, tippe oben rechts auf **⋮** ➔ **In YAML bearbeiten**, ersetze den Inhalt und speichere.

Jede Minute wird geprüft, ob eine Aufgabe genau jetzt fällig wird. Dann erscheint auf den registrierten Geräten ein Vollbild-Popup mit dem Namen der Aufgabe, dem Raum und der zuständigen Person. Mehrere Aufgaben in derselben Minute stehen in einem Popup. Mit **Zur Haushaltshilfe** springst du direkt in die App. Soll das Popup nur auf bestimmten Geräten erscheinen, steht in der Datei, wie du die Browser-IDs einträgst.

---

# 📖 Bedienungsanleitung – Haushaltshilfe Pro 🏠

## 🔑 Übersicht der Standard-Passwörter & Einstellungen

| Funktion / Rolle | Standard-Passwort | Beschreibung / Einsatzort |
| :--- | :--- | :--- |
| **Master-Passwort** | `Dein_Passwort_welches_du_vergeben_hast` | Zugriff auf die System-Einstellungen (`⚙️` oben rechts am Login-Bildschirm). |
| **Admin-Passwort** | `Dein_Passwort_welches_du_vergeben_hast` | Zugriff auf die Benutzerverwaltung (`⚙️ Verwaltung` zum Löschen von Benutzern). |

> 💡 **Hinweis zu Passwörtern, Tabs & Zusatzfunktionen:** Sämtliche Passwörter, die Sichtbarkeit der einzelnen Tabs und die Zusatzfunktionen können flexibel auf zwei Wegen angepasst werden:
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
2. Gib das **Admin-Passwort** ein.
3. An allen Benutzerkarten erscheint nun ein rotes **`✕`** zum Löschen.
4. Klicke auf **`❌ Beenden`**, um den Verwaltungsmodus wieder zu verlassen.

---

### System-Einstellungen (`⚙️` oben rechts)
1. Klicke oben rechts auf der Login-Karte auf das graue Zahnrad **`⚙️`**.
2. Gib das **Master-Passwort** ein.
3. Im Dialog **System-Einstellungen** (`settingsOverlay`) kannst du:
   - Das **Home-Assistant-Token** eintragen (nur für den Kiosk-Modus nötig – bei aktiver HA-Sitzung steht dort *„Nicht nötig“*).
   - Das **Master-Passwort** für die Systemeinstellung neu festlegen (leer lassen = unverändert).
   - Das **Admin-Passwort** für die Benutzerverwaltung neu festlegen (leer lassen = unverändert).
   - Den **Geräte-Zoom** per Schieberegler oder mit **−** / **+** einstellen. Der Zoom gilt nur für das Gerät, auf dem du ihn änderst.
   - Die **💡 Bedienhinweise** ein- oder ausschalten (z. B. „Gedrückt halten & ziehen …“). Das gilt nur für das Gerät, auf dem du es änderst.
   - Die **sichtbaren Tabs** in der Leiste auswählen.
   - Die **Zusatzfunktionen** 📦 Vorrat, 🔧 Wartung und 📅 Kalender ein- oder ausschalten.
4. Klicke auf **Speichern**.

---

## 🎛️ Tab-Sichtbarkeit anpassen

Die Navigations-Tabs 🛒 Einkaufsliste, 📋 Haushalt / Aufgaben, 🍽️ Essensplan, 🗑️ Müllkalender und 💶 Finanzen können flexibel auf zwei Wegen ein- oder ausgeblendet werden. Die 🏡 Startseite ist immer sichtbar.

1. **Über das Dashboard**:
   - Klicke auf der Anmeldeseite oben rechts auf das Zahnrad **`⚙️`**.
   - Gib das Master-Passwort ein und passe die Häkchen im Bereich **„Sichtbare Tabs in der Leiste“** an.
2. **Über Home Assistant**:
   - Gehe zu **Einstellungen ➔ Geräte & Dienste ➔ Haushaltshilfe Pro ➔ Konfigurieren**.
   - Wähle dort die gewünschten Tabs in der Mehrfachauswahl aus.

> 💡 **Hinweis:** Beide Wege halten sich vollständig automatisch in beide Richtungen synchron!

---

## 🧩 Zusatzfunktionen ein- und ausschalten

📦 Vorrat, 🔧 Wartung und 📅 Kalender sind optional, weil nicht jeder sie braucht.

1. **Über das Dashboard**:
   - Klicke auf der Anmeldeseite oben rechts auf das Zahnrad **`⚙️`** und gib das Master-Passwort ein.
   - Setze oder entferne im Bereich **„Zusatzfunktionen“** die Häkchen und klicke auf **Speichern**.
2. **Über Home Assistant**:
   - Gehe zu **Einstellungen ➔ Geräte & Dienste ➔ Haushaltshilfe Pro ➔ Konfigurieren**.
   - Wähle bei **Zusatzfunktionen** aus, was du nutzen möchtest.

Ausgeschaltet verschwinden der jeweilige Knopf und die Startseiten-Karte. Deine Daten bleiben erhalten und sind wieder da, sobald du die Funktion einschaltest. Die Einstellung gilt für alle Geräte. Welche Kalender angezeigt werden, wählst du in Home Assistant (siehe *Zusatzfunktionen & Kalender einrichten*).

---

## 2. 🏡 Startseite

Nach der Anmeldung siehst du auf einen Blick, was heute wichtig ist:

- **Begrüßung** mit deinem Namen und dem heutigen Datum.
- **Heute fällig**: Die Aufgaben, die heute dran sind (und überfällige). Mit einem Tipp auf das Häkchen erledigst du sie direkt – die App fragt dann, wer es gemacht hat.
- **🔧 Wartung**: Wartungen, die fällig sind oder in der Vorwarnzeit liegen. *(Zusatzfunktion)*
- **📦 Vorrat**: Was knapp wird oder fehlt, mit Menge. Mit **🛒** setzt du einen Artikel direkt auf die Einkaufsliste. *(Zusatzfunktion)*
- **📅 Kalender**: Die aktuelle Woche mit ihren Terminen. Ein Tipp öffnet den ganzen Kalender. *(Zusatzfunktion, standardmäßig aus)*
- **Essen diese Woche**: Der Wochenplan von Montag bis Sonntag, der heutige Tag ist hervorgehoben.
- **Einkaufsliste**: Die fehlenden Artikel, nach Läden gruppiert.
- **Ausgaben des Monats**: Fixkosten, Ausgaben und Gesamtsumme des aktuellen Monats. Wenn du es in den Finanzen eingeschaltet hast, siehst du hier auch *Übrig* (Monat) und *Gespart* (Jahr).

Unter jeder Karte führt ein Link direkt ins passende Modul (*Alle Aufgaben*, *Alle Wartungen*, *Zum Vorrat*, *Ganzen Kalender öffnen*, *Zum Wochenplan*, *Zur Einkaufsliste*, *Zu den Finanzen*).

---

## 3. 🛒 Einkaufs-Modul (`Shop` / `v-shop`)

- **Artikel hinzufügen**: Gib den Namen im Feld *„Was fehlt?“* ein und klicke auf **`+`**.
- **Schnellartikel / Favoriten**: Beim Klick auf ein Favoriten-Icon öffnet sich das Mengen-Modal (`shopQtyModal`), in dem du die gewünschte Stückzahl festlegst.
- **Kategorie & Favorit erstellen**: Nutze die Buttons **`📂 + Kategorie`** und **`⭐️ + Favoriten`**, um Schnellauswahlen anzulegen.
- **Geschäfte-Filter**: Filtere über die linke Seitenleiste (`shopSidebar`) nach Supermärkten. Mit **`+ Ort`** legst du einen neuen Laden an.
- **Geschäfte sortieren**: Ziehe die Geschäfte in der Seitenleiste in die gewünschte Reihenfolge (siehe *Sortieren per Ziehen*).
- **Artikel abhaken**: Mit dem **✓** neben dem Artikel nimmst du ihn von der Liste.
- **Artikel in ein anderes Geschäft schieben**: Halte einen Artikel gedrückt (am PC: mit der Maus anklicken und ziehen) und ziehe ihn auf das Geschäft, in dem du ihn kaufen willst.
- **📦 Vorrat**: Der Knopf **`📦 Vorrat`** öffnet deinen Vorrat (nur wenn die Zusatzfunktion eingeschaltet ist). Mehr dazu im nächsten Kapitel.
- **Zutaten aus dem Essensplan**: Artikel, die aus Rezepten kommen, landen wie alle anderen Artikel auf der Liste – mit Menge und Laden (z. B. `2x Milch @Aldi`). Mehr dazu im Kapitel *Wochenplan*.

---

## 4. 📦 Vorrat (`📦 Vorrat` im Einkaufs-Tab)

Der Vorrat zeigt dir, was du zu Hause hast, und erinnert dich, rechtzeitig nachzukaufen. (Zusatzfunktion – siehe *Zusatzfunktionen ein- und ausschalten*.)

- **Artikel anlegen**: Tippe auf **`＋ Neu`**. Wähle einen Vorschlag (z. B. *Nudeln* oder *Klopapier*) oder gib einen eigenen Namen ein.
- **Menge**: Mit **−** und **＋** änderst du die Menge, mit einem Tipp auf die Zahl tippst du sie direkt ein. Die Einheit wählst du aus: Stück, Packung, Flasche, Dose, kg oder Liter.
- **Zwei Grenzen**: Bei **„Startseite ab“** steht der Artikel als knapp auf der Startseite. Bei **„Einkaufsliste ab“** soll er auf die Einkaufsliste. „Ab“ heißt: wenn nur noch so viel oder weniger da ist.
- **Orte**: Mit **`📍 Orte`** legst du fest, wo du Dinge aufbewahrst (z. B. Vorratsschrank, Kühlschrank, Keller). Oben im Fenster filterst du nach Ort. Löschst du einen Ort, bleiben die Artikel erhalten.
- **Geschäft**: Bei jedem Artikel kannst du ein Geschäft hinterlegen.
- **Einkauf – 🤖 Automatisch oder ✋ Von Hand**: Bei *Automatisch* kümmert sich die App um die Einkaufsliste, sobald die Grenze erreicht ist. Bei *Von Hand* setzt du den Artikel selbst mit dem **🛒** auf die Liste.
- **Status**: Artikel sind als *Wird knapp*, *Nachkaufen* oder *Leer* markiert. Steht ein Artikel schon auf der Einkaufsliste, wird er nicht doppelt hinzugefügt.

### 🛒 Vor dem Verschieben auf die Einkaufsliste gefragt werden

Erreicht ein Artikel mit *Automatisch* seine Einkaufsgrenze, fragt dich die App zuerst: **„In welchen Laden?“** – auch wenn beim Artikel ein Geschäft hinterlegt ist, denn man kauft ja nicht immer im selben.

- **🛒 Auf die Liste**: Der Artikel kommt in den gewählten Laden.
- **Nicht jetzt**: Der Artikel bleibt, wo er ist. Gefragt wird erst wieder, wenn zwischendurch wieder genug da war.
- **Künftig automatisch, ohne Nachfrage**: Mit diesem Haken geht es künftig ohne Nachfrage in den beim Artikel hinterlegten Laden (sonst in das gerade offene Geschäft).
- **Verhalten umstellen**: Im Vorrat-Fenster steht unten **„Beim Auf-die-Liste-Setzen“**: *Immer fragen (Laden wählen)* oder *Automatisch (hinterlegter Laden)*.
- Auch wenn du von Hand auf **🛒** tippst, wird gefragt (mit **Abbrechen**).

### 🏡 Auf der Startseite

Die Karte **📦 Vorrat** zeigt nur, was knapp ist oder fehlt, mit der Menge. Ist alles da, steht dort „Alles da ✅“.

---

## 5. 🍽️ Wochenplan-Modul (`Essen` / `v-food`)

### Grundfunktionen

- **2-Wochen-Planung (Diese Woche / Nächste Woche)**: Nutze den Wochen-Umschalter oben, um nahtlos zwischen dem Speiseplan für **Diese Woche** und **Nächste Woche** zu wechseln.
- **Mahlzeiten eintragen**: Trage in den Feldern des jeweiligen Wochentags (MO–SO) separat für Frühstück, Mittagessen und Abendessen ein, was es gibt.
- **Koch / Verantwortlichen zuweisen**: Wähle im Dropdown-Menü neben dem Tag die kochende Person aus.
- **Kategorien & Favoriten**: Nutze **`📂 + Kategorie`** und **`⭐️ + Favoriten`**, um Lieblingsgerichte schnell in den Wochenplan einzufügen.
- **Woche verschieben / abschließen**: Klicke auf **`Woche abschließen/verschieben 🔄`**, um die Gerichte von „Nächste Woche“ manuell nach vorne in „Diese Woche“ zu rücken und die nächste Woche zu leeren.
- **Automatischer Wochenwechsel**: Standardmäßig rückt der Essensplan jeden Sonntag um 23:00 Uhr automatisch weiter, sodass die nächste Woche nahtlos in die aktuelle Woche übergeht.
- **⏱️ Wochenwechsel einstellen**: Tippe auf das **⚙️** neben dem Hinweis über dem Wochenplan. Dort wählst du **✨ Automatisch** (mit Wochentag und Uhrzeit) oder **✋ Nur manuell**. Eine Vorschau zeigt dir den nächsten Wechsel. Die Einstellung gilt für alle Geräte.
- **Woche zurücksetzen**: Klicke unten auf **`Woche zurücksetzen 🧹`**, um alle Tage der aktiven Woche auf einmal zu leeren.

### 👆 Mahlzeiten-Auswahl (Tipp auf ein Essensfeld)

Tippst du auf ein Frühstücks-, Mittags- oder Abendessen-Feld, geht es so weiter:

1. **Zuerst die Frage:** *„Möchtest du etwas aus deinen Favoriten nehmen?“* – mit den Antworten **⭐ Ja, aus Favoriten**, **📖 Nein, Rezepte & eintippen** und **Abbrechen**. Hast du noch keine Favoriten, entfällt die Frage.
2. **Das Auswahlfenster:**
   - Oben kannst du suchen oder selbst etwas eintippen und mit **✓ Übernehmen** (oder Enter) bestätigen.
   - Darunter wechselst du zwischen **⭐ Favoriten** (mit deinen Kategorien) und **📖 Rezepten**.
   - Ein Tipp auf ein Gericht trägt es direkt ein und speichert es.
   - **🗑️ Leeren** löscht den Eintrag.
3. **Meine Wahl merken:** Mit diesem Haken fragt die App künftig nicht mehr nach den Favoriten.
4. **Verhalten umstellen:** Unten im Auswahlfenster legst du unter **„Beim Antippen eines Feldes“** fest, was passieren soll:
   - *Erst nach Favoriten fragen*
   - *Gleich Favoriten zeigen*
   - *Gleich Rezepte & Eintippen*
   - *Nur normal eintippen* (wie früher, direkt mit der Tastatur)

> 💡 Das Feld **„außer Haus“** (Sonntag) bleibt immer direkt tippbar. Die Einstellung zum Antippen gilt nur für das Gerät, auf dem du sie wählst.

### 🛒 Zutaten automatisch auf die Einkaufsliste

Trägst du ein Gericht ein, das die App kennt (eingebaut oder von dir gespeichert), fragt sie nach den Zutaten:

- **⚡ Automatisch auf die Liste**: Alle fehlenden Zutaten werden direkt auf die Einkaufsliste gesetzt.
- **✋ Händisch auswählen**: Du siehst eine Liste, hakst Zutaten ab und änderst die Menge mit **＋ / −**. Weitere Zutaten kannst du unten ergänzen.
- **Nein danke**: Es passiert nichts.

Weitere Details:

- **In welchen Laden?** Bei der Frage wählst du den Laden aus. Vorausgewählt ist der Laden, den du zuletzt benutzt hast. Gibt es nur einen Laden, entfällt die Auswahl.
- **Keine Doppelten**: Was schon auf der Einkaufsliste steht, wird nicht noch einmal hinzugefügt.
- **Meine Wahl merken**: Mit dem Haken wird die Antwort für alle künftigen Gerichte übernommen. Bei *Automatisch* wird dann immer der zuletzt benutzte Laden genommen.
- **Verhalten umstellen**: Im Zutaten-Fenster steht unter **„Beim Eintragen eines Gerichts“**: *Immer fragen*, *Automatisch hinzufügen*, *Händisch auswählen* oder *Nichts vorschlagen*.
- **🛒 Einkauf aus dem Plan erstellen**: Der Button über dem Wochenplan sammelt die Zutaten aller Gerichte der angezeigten Woche in einem Fenster.
- **Gerichte & Rezepte im Zutaten-Fenster**: Tippe auf ein Gericht, um dessen Zutaten zu ändern oder – bei unbekannten Gerichten – die Zutaten für das nächste Mal zu merken.

### 📖 Rezepte ansehen & ändern

Über **📖 Rezepte ansehen & ändern** öffnest du die Rezepte-Übersicht:

- **Suchen** nach Rezeptname oder Zutat.
- **🛒 Einkaufen**: Die Zutaten des Rezepts auf die Einkaufsliste setzen.
- **✏️ Ändern**: Zutaten und Namen anpassen. Eingebaute Rezepte kannst du ebenfalls ändern – dein eigenes Rezept ersetzt dann das eingebaute.
- **↩︎ Standard**: Setzt ein geändertes eingebautes Rezept auf den Originalzustand zurück.
- **🗑️ Löschen**: Entfernt eines deiner eigenen Rezepte.
- **➕ Neues Rezept**: Legt ein eigenes Rezept an.
- **Angepasst**: Dieses Kennzeichen zeigt dir, dass du ein eingebautes Rezept geändert hast. Oben siehst du, wie viele Rezepte es gibt und wie viele davon eigene oder angepasste sind.
- **Erkennt auch**: Unter manchen Rezepten stehen weitere Namen, unter denen es ebenfalls erkannt wird (z. B. *Grillen* für Bratwurst).

> 💡 **Zutaten eingeben:** Trenne die Zutaten mit Kommas. Mengen kannst du davor schreiben oder mit `*` dahinter, z. B. `Milch, 2 Zwiebeln, Käse*2, 500 g Mehl`.

---

## 6. 🏠 Aufgaben- & Haus-Modul (`Haus` / `v-todo`)

### Neue Aufgabe anlegen (`intervalModal`)
1. Gib die Aufgabe im Textfeld ein (z. B. *„Rasen mähen“*) und klicke auf **`+`**.
2. Im Popup kannst du festlegen:
   - **Zugeordnet an**: Wähle das zuständige Familienmitglied im Dropdown aus.
   - **Option 1 (Intervall)**: Zahl eingeben und als **Stunden**, **Minuten** oder **Tage** speichern (inkl. Standard-Uhrzeit).
   - **Option 2 (Wochentage)**: Klicke die Wochentags-Punkte an (M, D, M, D, F, S, S) und klicke auf **Tage Speichern**.
   - **Option 3 (Festes Datum)**: Exaktes Fälligkeitsdatum über den Kalender auswählen und mit **Datum nutzen ✅** bestätigen.

### Aufgabe erledigen & bearbeiten (`editModal`)
- **Erledigen**: Klicke auf das Häkchen neben der Aufgabe. Gibt es mehrere Benutzer, fragt die App **„Wer hat es gemacht?“** – das muss nicht der angemeldete Benutzer sein. Danach bedankt sie sich mit einem kurzen **Lob-Fenster** (jedes Mal ein anderer Spruch).
- **Bearbeiten**: Klicke auf den Namen einer Aufgabe, um das Bearbeiten-Modal zu öffnen. Hier kannst du den Namen, die Zuordnung, Intervalle, Wochentage oder das Datum anpassen. Datum und Uhrzeit wählst du in einem Fenster im Look deines Themes.
- **Räume sortieren**: Ziehe die Räume in der Seitenleiste in die gewünschte Reihenfolge (siehe *Sortieren per Ziehen*).

### 📜 Verlauf (`📜 Verlauf` im Aufgaben-Tab)
Der **Verlauf** zeigt die zuletzt erledigten Aufgaben, nach Personen sortiert und mit Datum und Uhrzeit. Mit 🗑️ löschst du einzelne Einträge, mit **Alles löschen** den ganzen Verlauf. Der Verlauf ist auf allen Geräten gleich und merkt sich die letzten 100 Einträge.

---

## 7. 🔧 Wartung (`🔧 Wartung` im Aufgaben-Tab)

Für alles, was nur alle paar Wochen, Monate oder Jahre ansteht: Rauchmelder prüfen, Heizung warten, Reifenwechsel, TÜV … (Zusatzfunktion – siehe *Zusatzfunktionen ein- und ausschalten*.)

- **Neue Wartung**: Tippe auf **`＋ Neu`** und wähle eine Vorlage (z. B. *Rauchmelder prüfen*, *Heizung warten*, *Auto: TÜV / HU* oder *Waschmaschine reinigen*) oder starte mit **Leer starten**.
- **Eigene Vorlagen**: Mit **`＋ Vorlage`** legst du eine Vorlage an. Mit ✏️ änderst und mit 🗑️ löschst du Vorlagen. **↺ Standard-Vorlagen zurückholen** bringt die mitgelieferten wieder.
- **Intervall**: Bei **„Wiederholen alle“** gibst du eine Zahl ein und wählst *Tage*, *Wochen*, *Monate* oder *Jahre*.
- **Vorwarnung**: *Keine*, *3 Tage*, *1 Woche*, *2 Wochen* oder *1 Monat* vorher erscheint die Wartung auf der Startseite.
- **Nächster Termin**: Wird aus dem Intervall vorgeschlagen und lässt sich ändern.
- **✅ Erledigt**: Die App fragt, wer es gemacht hat, setzt „zuletzt“ auf heute und den nächsten Termin auf heute plus Intervall.
- **Status**: Überfällige (⚠️) und bald fällige (⏰) Wartungen sind markiert.
- **Verlauf**: Im Reiter **📜 Verlauf** des Wartungsfensters siehst du, wer was erledigt hat (die letzten 50 Einträge). Er ist getrennt vom Aufgaben-Verlauf.
- **Startseite**: Die Karte **🔧 Wartung** zeigt, was fällig ist oder in der Vorwarnzeit liegt.

---

## 8. 📅 Kalender (`📅 Kalender` auf der Startseite)

Der Kalender zeigt die Termine deiner Home-Assistant-Kalender. (Zusatzfunktion, standardmäßig aus – die Einrichtung steht im Kapitel *Zusatzfunktionen & Kalender einrichten*.)

- **Aktuelle Woche**: Die Karte auf der Startseite zeigt Montag bis Sonntag, der heutige Tag ist hervorgehoben. Farbige Punkte markieren Tage mit Terminen, darunter stehen die Termine der Woche.
- **Ganzen Kalender öffnen**: Ein Tipp auf einen Tag, einen Termin oder **„Ganzen Kalender öffnen →“** öffnet den Monat.
- **Blättern**: Mit **‹** und **›** oder durch Wischen nach links und rechts gehst du einen Monat zurück oder vor. **Heute** springt zurück zum aktuellen Tag.
- **Tag ansehen**: Tippe einen Tag an, dann siehst du seine Termine mit Uhrzeit, Ort und Notiz.
- **Termin anlegen**: Mit **`＋ Termin`** gibst du Titel, Datum und Uhrzeit ein – oder wählst *Ganztägig*, bei mehreren Tagen mit „Bis“-Datum. Ort und Notiz sind optional. Hast du mehrere Kalender, wählst du unter **„In welchen Kalender?“** den Ziel-Kalender. Die App merkt sich deine letzte Wahl.
- **Termin löschen**: Mit 🗑️ löschst du einen Termin, wenn der Kalender das erlaubt.
- **Mehrere Kalender**: Jeder Kalender hat eine eigene Farbe. Über die Chips oben im Kalender blendest du einzelne Kalender ein oder aus.

---

## 9. 💰 Finanz-Modul (`Finanzen` / `v-finance`)

- Das Finanz-Modul ist in eine übersichtliche Zwei-Ebenen-Struktur (Jahre ➔ Monate) unterteilt.
- **Jahr anlegen**: Klicke oben auf `➕ Jahr hinzufügen` und gib eine vierstellige Jahreszahl ein (z. B. 2026), um das Jahr als neue Übersichtskarte zu erstellen.
- **Jahr öffnen**: Klicke auf eine Jahreskarte, um in die Monatsansicht des jeweiligen Jahres zu wechseln. (Über das Mülleimer-Icon `🗑️` auf der Jahreskarte lässt sich das gesamte Jahr inklusive aller Monate löschen.)
- **Monat anlegen**: Klicke im geöffneten Jahr auf `➕ Monat in diesem Jahr hinzufügen` (z. B. Oktober). Hinterlegte Fixkosten-Vorlagen werden dabei automatisch für diesen Monat übernommen.
- **Einträge verwalten**: Klicke auf eine Monatskarte, um das Detail-Modal (`finance-modal`) zu öffnen.
- **Fixum & Spendings**: Trage Fixkosten (Miete, Internet) oder variable Ausgaben (Einkauf, Tanken) mit Betrag (€) und Beschreibung ein.
- **Eintrag löschen**: Klicke auf das `✕` neben dem jeweiligen Eintrag.
- **Fixkosten- und Einkommens-Vorlagen verwalten**: Über **`⚙️ Fixkosten verwalten`** kannst du wiederkehrende Posten (inklusive Intervall-Auswahl wie monatlich, quartalsweise oder in bestimmten Monaten) hinterlegen. Mit dem Schalter **📌 Fixkosten / 💰 Einkommen** legst du fest, ob die Vorlage eine Ausgabe oder ein Einkommen (z. B. Gehalt) ist.
  - **Bearbeiten leicht gemacht**: Klicke einfach direkt auf einen bestehenden Eintrag in der Liste, um ihn sofort in die Eingabefelder zu laden, anzupassen und per `💾 Änderung speichern` zu aktualisieren.
- **Einkommen eintragen**: Im Monatsfenster gibt es den Bereich **💰 EINKOMMEN**. Mit **↻ Einkommen aus Vorlagen eintragen** übernimmst du deine Einkommens-Vorlagen.
- **Übrig**: Der Bereich **🧮 ÜBRIG / GESPART** rechnet *Einkommen − Fixkosten − Ausgaben* aus. Auf den Monatskarten stehen *Einkommen* und *Übrig*, auf den Jahreskarten *Einkommen (Jahr)* und *Gespart*.
- **Gespart insgesamt**: Die Karte **💰 Gespart insgesamt** über den Jahren zeigt die Summe. Ein Tipp öffnet das Fenster **Gespart**, das Jahr für Jahr aufklappbar ist. Monate ohne Einkommen zählen mit 0.
- **Auf der Startseite zeigen**: Unter dieser Karte schaltest du **💰 Gespart (Jahr)** und **🧮 Übrig (Monat)** für deine Startseite ein. Einschalten geht nur mit deinem eigenen Passwort, ausschalten ohne. Die Einstellung gilt nur für deinen Benutzer.
- **Jahre und Monate sortieren**: Ziehe die Jahres- bzw. Monatskarten in die gewünschte Reihenfolge (siehe *Sortieren per Ziehen*).

---

## 10. 🚛 Müll-Modul (`Müll` / `v-trash`)

- Zeigt automatisch die nächsten Abholtermine für **Gelber Sack**, **Altpapier**, **Restmüll**, **Biomüll** und die **Weihnachtsbaum-Abholung** an.
- Die Daten werden automatisch live aus den hinterlegten Home-Assistant-Sensoren geladen.

---

## 11. 🎨 Themes & Design anpassen (`theme-dropdown`)

Klicke unten links in der Seitenleiste auf das Symbol **`🎨🔍`**, um das Erscheinungsbild der Oberfläche zu wechseln und den Zoom anzupassen. Mit dem **Theme-Modus** stellst du ein, ob das Theme automatisch passend zur Jahreszeit wechselt (*Auto*) oder dein gewähltes Theme bleibt. Verfügbare Themes:

- 💎 **Glass** (Glassmorphism-Look)
- 🌑 **Dark** (Dunkler Modus)
- ☀️ **Light** (Helles Design)
- 🟢 **Green** (Grüne Akzente)
- 🔵 **Blue** (Blaue Akzente)
- ❄️ **Winter** (Winter-Design)
- 🎄 **Weihnachten** (Mit festlichen Dekorationen)
- 🎆 **Neujahr** (Silvester- & Neujahrs-Look)
- ⚒️ **Königsblau** (Schalke-Design)
- 🌸 **Frühling** (Frühlingshaftes Design)
- 🔴 **FC Bayern** (Mit roten Fußball-Akzenten)

Alle Fenster der App – auch die Fenster für Essensauswahl, Zutaten, Rezepte, Vorrat, Wartung und Kalender sowie die Auswahllisten und die Datums- und Uhrzeit-Auswahl – übernehmen automatisch die Farben des gewählten Themes. Die Oberfläche passt sich dabei Handy, Tablet und PC sowie dem eingestellten Zoom an.

### 🛠️ Für Theme-Entwickler

Jede Theme-Datei (`<name>-theme.css`) enthält am Ende einen Block **„ESSENSWAHL, ZUTATEN & REZEPTE“**. Dort legen `--hh-*`-Variablen die Farben der neuen Fenster fest, zum Beispiel:

| Variable | Wirkung |
| :--- | :--- |
| `--hh-card-bg`, `--hh-card-border` | Hintergrund und Rahmen der Fenster |
| `--hh-text`, `--hh-head` | Schrift- und Überschriftsfarbe |
| `--hh-btn-bg`, `--hh-btn-fg`, `--hh-btn-border` | Hauptknopf (z. B. *Auf die Liste*) |
| `--hh-sec-bg`, `--hh-sec-fg`, `--hh-sec-border` | Nebenknöpfe (z. B. *Abbrechen*) |
| `--hh-field-bg`, `--hh-field-fg`, `--hh-field-border` | Eingabe- und Auswahlfelder |
| `--hh-chip-line`, `--hh-chip-on-bg` | Chips, Reiter und aktive Auswahl |
| `--hh-toast-bg`, `--hh-toast-fg` | Hinweis-Meldung unten |

Ein neues Theme braucht nur diesen Block, damit die Fenster passen. Ohne ihn gilt ein neutrales Standard-Aussehen.

---

## 12. ↕️ Sortieren per Ziehen & Bedienhinweise

Du kannst diese Dinge durch Ziehen in eine andere Reihenfolge bringen:

| Was | Wo |
| :--- | :--- |
| **Geschäfte** | Einkaufs-Tab, Seitenleiste |
| **Räume** | Aufgaben-Tab, Seitenleiste |
| **Jahre** | Finanzen, Jahresübersicht |
| **Monate** | Finanzen, Monatsübersicht |

- **Am Handy und Tablet**: Element **gedrückt halten** (kurz warten) und dann ziehen. Normales Scrollen mit dem Finger geht weiter wie gewohnt.
- **Am PC**: Element mit der **Maus anklicken und ziehen**.
- **Während des Ziehens** zeigt ein Balken, wo das Element landet. Am Rand scrollt die Liste von selbst weiter. Mit **Esc** brichst du ab.
- **Artikel verschieben**: Im Einkauf ziehst du einen Artikel auf ein anderes Geschäft, wenn du ihn dort kaufen möchtest.

**💡 Bedienhinweise:** Über den Listen steht eine kleine Zeile, die zeigt, was sich ziehen lässt (z. B. *„💡 Räume gedrückt halten und ziehen, um sie zu sortieren.“*). Sie erscheint nur, wenn es mindestens zwei Einträge gibt. Wer sie nicht braucht, schaltet sie unter **⚙️ System-Einstellungen** ➔ **„💡 Bedienhinweise anzeigen“** aus. Das gilt nur für das jeweilige Gerät.

---

## 🚪 Abmelden (`Logout`)

Klicke in der untersten Navigationsleiste auf das Tür-Symbol **`🚪 Logout`**, um zur Benutzerauswahl zurückzukehren.

---

## Screenshots

### 🔑 Anmeldung
![Anmeldeseite](screenshots/Anmeldeseite.png)

### 🏡 Startseite
![Startseite](screenshots/Startseite.png)

### ⚙️ Einstellungen
![Integration Einstellung](screenshots/Integtrationeinstellung.png)
![Systemeinstellung](screenshots/Systemeinstellung.png)

### 🎨 Themes & Zoom
![Themes und Zoom](screenshots/Themen.png)

### 🛒 Einkauf
![Einkauf](screenshots/Einkauf.png)

### 🍲 Essensplan, Zutaten & Rezepte
![Essensplan](screenshots/Essenplan.png)

<img src="screenshots/Einkauf%20aus%20dem%20Plan.png" alt="Einkauf aus dem Plan" width="320"> <img src="screenshots/Rezepte.png" alt="Rezepte" width="320">

### ✅ Aufgaben
![Aufgaben](screenshots/Aufgaben.png)
![Aufgaben Hinzufügen](screenshots/Aufgaben%20hinzuf%C3%BCgen.png)
![Aufgaben Bearbeiten](screenshots/Aufgaben%20bearbeiten.png)

### 💶 Finanzen
![Finanzen Jahr](screenshots/Jahr%C3%BCbersicht.png)
![Finanzen Monat](screenshots/Monats%C3%BCbersicht.png)

<img src="screenshots/Fixkosten.png" alt="Standard Fixkosten" width="480">
