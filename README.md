# 🏠 Haushaltshilfe Pro für Home Assistant

Eine elegante, benutzerfreundliche All-in-One-Lösung für die Organisation deines Haushalts direkt in Home Assistant. Verwalte Einkaufslisten, Finanzen, Aufgaben, Essenspläne und Müllabfuhr-Termine in einem übersichtlichen Custom Panel.

---

## ✨ Features

- 🛒 **Einkaufsliste & Favoriten**: Schnellartikel hinzufügen, Kategorien filtern und Geschäfte zuweisen.
- 💰 **Finanzplaner**: Monatsübersichten für Fixkosten und variable Ausgaben mit automatischer Summenberechnung.
- 📋 **Aufgaben & Termine**: Aufgaben zuweisen, Räumen zuordnen und als erledigt markieren.
- 🍽️ **Wochen-Essensplan**: Speiseplan von Montag bis Sonntag übersichtlich verwalten.
- 🗑️ **Müllabfuhr-Übersicht**: Direkte Anbindung an bestehende Müll-Sensoren (z. B. *Waste Collection Schedule*).
- 🔄 **Neustart-sicher (`RestoreEntity`)**: Alle Daten (Finanzen, Einkäufe, Aufgaben) bleiben auch nach einem Home Assistant Neustart dauerhaft gespeichert.
- 🔑 **Zero-Config-Authentifizierung**: Das Panel nutzt automatisch die bestehende Session deiner Home Assistant Anmeldung – kein manueller Token-Export oder Passworteingabe notwendig!

---

## 🚀 Installation & Einrichtung

### 1. Installation über HACS (oder Manuell)

#### Via HACS (Empfohlen)
1. Öffne **HACS** in deiner Home Assistant Instanz.
2. Klicke oben rechts auf die drei Punkte ➔ **Benutzerdefinierte Repositories**.
3. Füge die URL ( https://github.com/Domenic1989/Haushaltshilfe ) dieses Repositories ein und wähle als Kategorie **Integration**.
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

## 🗑️ Müllabfuhr konfigurieren (Optional)

Solltest du bereits die HACS-Integration *Waste Collection Schedule* nutzen, passt du in der Datei `www/haushaltshilfe/config.js` einfach die Entitäten-IDs deiner Müll-Sensoren an:

```javascript
const TRASH_CONFIG = [
    { id: "sensor.gelber_sack", dateId: "sensor.gelber_sack_datum", name: "Gelber Sack", icon: "🟡" },
    { id: "sensor.papier", dateId: "sensor.papier_datum", name: "Altpapier", icon: "📦" },
    { id: "sensor.restmull", dateId: "sensor.restmull_datum", name: "Restmüll", icon: "🗑️" }
];

🔑 Übersicht der Standard-PasswörterFunktion / RolleStandard-PasswortBeschreibung / EinsatzortMaster-PassworthomeassistantZugriff auf die System-Einstellungen (⚙️ oben rechts am Login-Bildschirm).Admin-Passwort1234Zugriff auf die Benutzerverwaltung (⚙️ Verwaltung zum Löschen von Benutzern).Standard-Benutzer AdminadminErstes Standard-Konto bei Neuinstallation.Standard-Benutzer TablettabletZweites Standard-Konto (z. B. für Wandtablets).💡 Hinweis: Sämtliche Passwörter können nach dem ersten Start in den System-Einstellungen oder der config.js individuell angepasst werden.📖 Bedienungsanleitung: Haus-Zentrale ProDiese Bedienungsanleitung erklärt alle Funktionen des Frontends und zeigt Schritt für Schritt, wie Benutzer, Aufgaben, Wochenpläne, Einkäufe und Finanzen verwaltet werden.1. 🔑 Anmelden & BenutzerverwaltungAnmeldenKlicke im Login-Bildschirm auf deinen Benutzer-Avatar im Raster.Gib dein Passwort in das Eingabefeld ein.Klicke auf Anmelden.Neuer Benutzer erstellen (👤 + Neu)Klicke auf dem Login-Bildschirm auf den Button 👤 + Neu.Wichtig: Ein neuer Benutzer kann nur durch die direkte Vergabe eines Passworts angelegt werden!Es öffnen sich nacheinander die Eingabefelder:Benutzername: Gib den Namen ein (z. B. Klara).Passwort: Gib das persönliche Passwort für diesen Benutzer ein (z. B. 1234).Bestätige mit OK.Der Benutzer erscheint sofort als auswählbare Karte im Login-Grid und kann sich ab sofort mit dem vergebenen Passwort anmelden.Benutzer verwalten & löschen (⚙️ Verwaltung)Klicke auf ⚙️ Verwaltung.Gib das Admin-Passwort ein (Standard: 1234).An allen Benutzerkarten erscheint nun ein rotes ✕.Klicke auf das ✕ des Benutzers, den du löschen möchtest.Klicke auf ❌ Beenden, um den Verwaltungsmodus wieder zu verlassen.System-Einstellungen (⚙️ Oben Rechts)Klicke oben rechts auf das Zahnrad-Symbol ⚙️.Gib das Master-Passwort ein (Standard: homeassistant).In diesem Dialog kannst du:Den Long-Lived Access Token eintragen oder aktualisieren.Das Admin-Passwort für die Benutzerverwaltung ändern.Klicke auf Speichern.2. 🛒 Einkaufs-Modul (Shop)Artikel hinzufügen: Gib den Namen im Feld „Was fehlt?“ ein und klicke auf +.Mengen-Auswahl: Beim Klick auf ein Favoriten-Icon öffnet sich ein Pop-up zur Auswahl der gewünschten Stückzahl.Kategorie erstellen: Klicke auf 📂 + Kategorie, um Abteilungen anzulegen (z. B. Getränke, Obst).Favorit anlegen: Klicke auf ⭐️ + Favoriten, um häufig gekaufte Artikel als Schnellauswahl einzurichten.Geschäfte-Filter: Filter über die linke Seitenleiste nach Supermärkten (z. B. Aldi, Rewe, Lidl).3. 🍽️ Wochenplan-Modul (Essen)Gericht eintragen: Trage direkt im Feld des jeweiligen Wochentags (MO–SO) ein, was gekocht wird.Koch / Verantwortlichen zuweisen: Wähle im Dropdown-Menü neben dem Tag die kochende Person aus.Favoriten nutzen: Speichere Lieblingsgerichte als Favoriten ab, um sie schnell in den Wochenplan einzufügen.Woche zurücksetzen: Klicke unten auf Woche zurücksetzen 🧹, um alle Tage auf einmal zu leeren.4. 🏠 Aufgaben- & Haus-Modul (Haus)Neue Aufgabe anlegenGib die Aufgabe im Textfeld ein (z. B. „Rasen mähen“) und klicke auf +.Im Details & Intervall Modal kannst du festlegen:Zugeordnet an: Wähle das zuständige Familienmitglied aus.Option 1 (Intervall): Intervall in Stunden oder Tagen festlegen.Option 2 (Wochentage): Wähle bestimmte Wochentage aus (M, D, M, D, F, S, S).Option 3 (Festes Datum): Exaktes Fälligkeitsdatum mit Uhrzeit wählen.Aufgabe erledigen & bearbeitenErledigen: Klicke auf den Kreis / das Häkchen neben der Aufgabe.Bearbeiten: Klicke auf die Aufgabe, um Name, Person oder Intervall im Edit-Modal anzupassen.5. 💰 Finanz-Modul (Finanzen)Monat anlegen: Klicke auf ➕ Monat manuell hinzufügen (z. B. Oktober 2026).Eintrag hinzufügen: Klicke auf eine Monatskarte und trage Betrag (€), Beschreibung (Was?) sowie Typ ein:📌 Fixum: Feste monatliche Kosten (Miete, Strom, Internet).🛒 Spendings: Variable Ausgaben (Einkauf, Tanken, Freizeit).Eintrag löschen: Klicke auf das ✕ neben dem jeweiligen Eintrag.6. 🚛 Müll-Modul (Müll)Zeigt automatisch die nächsten Termine für Gelber Sack, Altpapier und Restmüll an.Die Daten werden automatisch aus den hinterlegten Home-Assistant-Sensoren geladen.7. 🎨 Themes & Design anpassenKlicke oben links auf das Paletten-Symbol 🎨, um das Design zu wechseln:💎 Glass (Glassmorphism-Look)🌑 Dark (Dunkler Modus)☀️ Light (Helles Design)🟢 Green / 🔵 Blue (Farbige Akzente)

