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
   
