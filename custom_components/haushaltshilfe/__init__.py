"""The Haushaltshilfe Pro integration with persistent JSON file storage."""
import asyncio
import logging
import os
import shutil
import json
from homeassistant.core import HomeAssistant, callback
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.storage import Store

from .const import DOMAIN, CONF_ADMIN_PW, CONF_MASTER_PW, CONF_VISIBLE_TABS
from .security import (
    hash_password,
    is_hashed,
    parse_users,
    public_users,
    serialize_users,
    verify_password,
)

_LOGGER = logging.getLogger(__name__)

# Verzögerung nach falschem Passwort, bremst Durchprobieren aus
FAILED_LOGIN_DELAY = 1.0

# Nur diese Events darf das Frontend über den Proxy feuern
ALLOWED_PROXY_EVENTS = {
    "set_tasks_data",
    "set_todo_favs",
    "set_shop_favs",
    "set_food_favs",
    "set_shopping_data",
    "set_finance_data",
    "set_finance_db",
    "set_finance_templates",
}

# Nur diese Entitäten darf das Frontend über den Proxy beschreiben
ALLOWED_WRITE_PREFIXES = (
    "input_text.helper_",
    "input_text.essen_",
    "sensor.haushalt_",
)


async def _read_json(request) -> dict:
    """Liest den Request-Body als JSON, auch wenn der Content-Type fehlt."""
    try:
        data = await request.json()
    except Exception:
        try:
            data = json.loads(await request.text())
        except Exception:
            data = {}
    return data if isinstance(data, dict) else {}


def _stored_pw(hass, conf_key: str, store_key: str) -> str:
    """Liefert den gespeicherten (gehashten) Master- oder Admin-Passwort-Wert."""
    entry = hass.data.get(DOMAIN, {}).get("entry")
    store_data = hass.data.get(DOMAIN, {}).get("data", {})
    if entry is not None:
        value = entry.options.get(conf_key, entry.data.get(conf_key))
        if value:
            return str(value)
    return str(store_data.get(store_key, "") or "")


async def _async_check_pw(hass, stored: str, given) -> bool:
    """Prüft ein Passwort im Executor und bremst bei Fehlversuchen."""
    ok = await hass.async_add_executor_job(verify_password, stored, given)
    if not ok:
        await asyncio.sleep(FAILED_LOGIN_DELAY)
    return ok


async def _async_check_master(hass, given) -> bool:
    return await _async_check_pw(hass, _stored_pw(hass, CONF_MASTER_PW, "helper_master_pw"), given)


async def _async_check_admin(hass, given) -> bool:
    return await _async_check_pw(hass, _stored_pw(hass, CONF_ADMIN_PW, "helper_admin_pw"), given)


async def async_migrate_secrets(hass, entry: ConfigEntry, store_data: dict) -> bool:
    """Hasht Klartext-Passwörter und entfernt das früher gespeicherte HA-Token.

    Gibt True zurück, wenn der Config-Entry geändert wurde.
    """
    # 1. Früher hier abgelegtes Long-Lived-Token entfernen (wurde ohne Auth ausgeliefert)
    if store_data.pop("saved_ha_token", None):
        _LOGGER.warning(
            "Haushaltshilfe: Ein gespeichertes Home-Assistant-Token wurde entfernt. "
            "Bitte das Token unter Profil -> Sicherheit -> Langlebige Zugangstoken widerrufen."
        )

    # 2. Master-/Admin-Passwort im Config-Entry hashen
    new_data = dict(entry.data)
    new_options = dict(entry.options)
    changed = False
    for container in (new_data, new_options):
        for key in (CONF_MASTER_PW, CONF_ADMIN_PW):
            value = container.get(key)
            if value and not is_hashed(value):
                container[key] = await hass.async_add_executor_job(hash_password, str(value))
                changed = True
    if changed:
        hass.config_entries.async_update_entry(entry, data=new_data, options=new_options)

    # 3. Kopien im Store durch die Hashes ersetzen
    for conf_key, store_key in ((CONF_MASTER_PW, "helper_master_pw"), (CONF_ADMIN_PW, "helper_admin_pw")):
        value = new_options.get(conf_key, new_data.get(conf_key))
        if value:
            store_data[store_key] = value
        elif store_data.get(store_key) and not is_hashed(store_data[store_key]):
            store_data[store_key] = await hass.async_add_executor_job(hash_password, str(store_data[store_key]))

    # 4. Benutzer-Passwörter hashen
    users = parse_users(store_data.get("users_list", "[]"))
    users_changed = False
    for u in users:
        if not is_hashed(u["pw"]):
            u["pw"] = await hass.async_add_executor_job(hash_password, u["pw"])
            users_changed = True
    if users_changed:
        store_data["users_list"] = serialize_users(users)

    return changed

PLATFORMS = ["sensor"]
STORAGE_KEY = f"{DOMAIN}_data_store"
STORAGE_VERSION = 1

AUTO_INPUT_TEXTS = {
    "helper_visible_tabs": {"name": "Sichtbare Tabs", "initial": '["shop","todo","food","trash","finance"]'},
    "helper_shop_stores": {"name": "Geschäfte", "initial": '["Aldi", "Lidl", "Rewe"]'},
    "helper_room_list": {"name": "Räume", "initial": '["Küche", "Bad", "Wohnen"]'},
    "helper_finance_templates": {"name": "Fixkosten Vorlagen", "initial": "[]"},
    "essen_montag": {"name": "Essen Montag", "initial": ""},
    "essen_dienstag": {"name": "Essen Dienstag", "initial": ""},
    "essen_mittwoch": {"name": "Essen Mittwoch", "initial": ""},
    "essen_donnerstag": {"name": "Essen Donnerstag", "initial": ""},
    "essen_freitag": {"name": "Essen Freitag", "initial": ""},
    "essen_samstag": {"name": "Essen Samstag", "initial": ""},
    "essen_sonntag": {"name": "Essen Sonntag", "initial": ""},
}


class HaushaltshilfeCredentialsView(HomeAssistantView):
    """Liefert die sichtbaren Tabs. Passwörter werden NICHT mehr ausgeliefert."""
    url = "/api/haushaltshilfe/credentials"
    name = "api:haushaltshilfe:credentials"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        entry = hass.data.get(DOMAIN, {}).get("entry")
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        if not entry:
            return self.json({"error": "Config entry not found"}, status_code=500)

        # Tabs aus Options -> Data -> Store holen
        raw_tabs = entry.options.get(CONF_VISIBLE_TABS)
        if raw_tabs is None:
            raw_tabs = entry.data.get(CONF_VISIBLE_TABS)
        if raw_tabs is None:
            raw_tabs = store_data.get("helper_visible_tabs", '["shop", "todo", "food", "trash", "finance"]')

        # Sicherstellen, dass immer eine saubere Liste ans Frontend geht
        if isinstance(raw_tabs, str):
            try:
                visible_tabs = json.loads(raw_tabs)
            except Exception:
                visible_tabs = [v.strip().strip("'\"") for v in raw_tabs.strip("[]").split(",") if v.strip()]
        elif isinstance(raw_tabs, list):
            visible_tabs = raw_tabs
        else:
            visible_tabs = ["shop", "todo", "food", "trash", "finance"]

        return self.json({
            "visible_tabs": visible_tabs,
            "has_master_pw": bool(_stored_pw(hass, CONF_MASTER_PW, "helper_master_pw")),
            "has_admin_pw": bool(_stored_pw(hass, CONF_ADMIN_PW, "helper_admin_pw")),
        })


class HaushaltshilfeVerifyView(HomeAssistantView):
    """Prüft Master- oder Admin-Passwort serverseitig (gibt nur ok/nicht ok zurück)."""
    url = "/api/haushaltshilfe/verify"
    name = "api:haushaltshilfe:verify"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        data = await _read_json(request)
        kind = data.get("kind")
        password = data.get("password", "")

        if kind == "master":
            ok = await _async_check_master(hass, password)
        elif kind == "admin":
            ok = await _async_check_admin(hass, password)
        else:
            return self.json({"success": False, "message": "Unbekannter Typ"}, status_code=400)

        if ok:
            return self.json({"success": True})
        return self.json({"success": False}, status_code=403)


class HaushaltshilfeUpdateCredentialsView(HomeAssistantView):
    """Speichert Master-/Admin-Passwort, sichtbare Tabs sowie den Zoom zentral."""
    url = "/api/haushaltshilfe/update_credentials"
    name = "api:haushaltshilfe:update_credentials"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        entry = hass.data.get(DOMAIN, {}).get("entry")
        if not entry:
            return self.json({"error": "Config entry not found"}, status_code=500)

        data = await _read_json(request)

        new_master = data.get("master_pw")
        new_admin = data.get("admin_pw")
        new_tabs = data.get("visible_tabs")
        new_device_id = data.get("device_id")
        new_zoom = data.get("zoom")

        new_master = str(new_master).strip() if new_master is not None else ""
        new_admin = str(new_admin).strip() if new_admin is not None else ""

        # Alles außer dem gerätespezifischen Zoom ist durch das Master-Passwort geschützt
        if new_master or new_admin or new_tabs is not None:
            if not await _async_check_master(hass, data.get("current_master_pw", "")):
                return self.json({"success": False, "message": "Master-Passwort falsch"}, status_code=403)

        new_options = {**entry.data, **entry.options}
        updated = False

        if new_master:
            new_options[CONF_MASTER_PW] = await hass.async_add_executor_job(hash_password, new_master)
            updated = True

        if new_admin:
            new_options[CONF_ADMIN_PW] = await hass.async_add_executor_job(hash_password, new_admin)
            updated = True

        parsed_tabs = None
        if new_tabs is not None:
            if isinstance(new_tabs, str):
                try:
                    parsed_tabs = json.loads(new_tabs)
                except Exception:
                    parsed_tabs = [v.strip().strip("'\"") for v in new_tabs.strip("[]").split(",") if v.strip()]
            elif isinstance(new_tabs, list):
                parsed_tabs = new_tabs

            if parsed_tabs is not None:
                new_options[CONF_VISIBLE_TABS] = parsed_tabs
                updated = True

        # Speichert auch dann, wenn NUR der Zoom geändert wurde
        if updated or (new_device_id and new_zoom is not None):
            if updated:
                hass.config_entries.async_update_entry(entry, options=new_options)

            store_data = hass.data[DOMAIN].get("data", {})
            store = hass.data[DOMAIN].get("store")
            if store_data is not None and store is not None:
                if new_master:
                    store_data["helper_master_pw"] = new_options[CONF_MASTER_PW]
                if new_admin:
                    store_data["helper_admin_pw"] = new_options[CONF_ADMIN_PW]
                if parsed_tabs is not None:
                    tabs_str = json.dumps(parsed_tabs)
                    store_data["helper_visible_tabs"] = tabs_str
                    current_state = hass.states.get("input_text.helper_visible_tabs")
                    attrs = current_state.attributes.copy() if current_state else {}
                    hass.states.async_set("input_text.helper_visible_tabs", tabs_str, attrs)

                # ZOOM SPEICHERN LOGIK
                if new_device_id and new_zoom is not None:
                    zooms_raw = store_data.get("device_zooms", "{}")
                    try:
                        zooms = json.loads(zooms_raw) if isinstance(zooms_raw, str) else zooms_raw
                    except Exception:
                        zooms = {}
                    zooms[str(new_device_id)] = float(new_zoom)
                    store_data["device_zooms"] = json.dumps(zooms)

                await store.async_save(store_data)

            return self.json({"success": True})

        return self.json({"success": False, "message": "Keine Änderungen"}, status_code=400)


class HaushaltshilfeUsersView(HomeAssistantView):
    """Benutzerliste abrufen (ohne Passwörter) und einzelne Benutzer verwalten."""
    url = "/api/haushaltshilfe/users"
    name = "api:haushaltshilfe:users"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        users = parse_users(store_data.get("users_list", "[]"))
        return self.json({"users": public_users(users)})

    async def post(self, request):
        """Aktionen: add, update, delete. Jede Aktion braucht das Admin-Passwort."""
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        data = await _read_json(request)

        action = data.get("action")
        if action not in ("add", "update", "delete"):
            # Das alte Format {"users": [...]} würde Passwörter im Klartext übertragen
            return self.json({"success": False, "message": "Ungültige Aktion"}, status_code=400)

        if not await _async_check_admin(hass, data.get("admin_pw", "")):
            return self.json({"success": False, "message": "Admin-Passwort falsch"}, status_code=403)

        users = parse_users(store_data.get("users_list", "[]"))
        name = str(data.get("name", "")).strip()
        password = str(data.get("password", "")).strip()
        persistent = bool(data.get("persistent", False))

        def find(n):
            return next((u for u in users if u["name"].lower() == n.lower()), None)

        if action in ("add", "update") and (not name or ":" in name):
            return self.json({"success": False, "message": "Ungültiger Name"}, status_code=400)

        if action == "add":
            if not password:
                return self.json({"success": False, "message": "Passwort fehlt"}, status_code=400)
            if find(name):
                return self.json({"success": False, "message": "Benutzer existiert bereits"}, status_code=409)
            users.append({
                "name": name,
                "pw": await hass.async_add_executor_job(hash_password, password),
                "persistent": persistent,
            })

        elif action == "update":
            old_name = str(data.get("old_name", name)).strip()
            target = find(old_name)
            if target is None:
                return self.json({"success": False, "message": "Benutzer nicht gefunden"}, status_code=404)
            other = find(name)
            if other is not None and other is not target:
                return self.json({"success": False, "message": "Benutzer existiert bereits"}, status_code=409)
            target["name"] = name
            target["persistent"] = persistent
            if password:  # leer = Passwort unverändert lassen
                target["pw"] = await hass.async_add_executor_job(hash_password, password)

        elif action == "delete":
            target = find(name)
            if target is None:
                return self.json({"success": False, "message": "Benutzer nicht gefunden"}, status_code=404)
            users.remove(target)

        store_data["users_list"] = serialize_users(users)
        if store is not None:
            await store.async_save(store_data)

        return self.json({"success": True, "users": public_users(users)})


class HaushaltshilfePublicUsersView(HomeAssistantView):
    """Liefert nur die Benutzernamen (ohne Passwörter) für den Login-Screen."""
    url = "/api/haushaltshilfe/public_users"
    name = "api:haushaltshilfe:public_users"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        users = parse_users(store_data.get("users_list", "[]"))
        return self.json({"users": [{"name": u["name"], "persistent": u["persistent"]} for u in users]})


class HaushaltshilfeAppLoginView(HomeAssistantView):
    """Prüft Benutzername & Passwort. Gibt KEIN Home-Assistant-Token mehr heraus."""
    url = "/api/haushaltshilfe/app_login"
    name = "api:haushaltshilfe:app_login"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        data = await _read_json(request)

        username = str(data.get("username", ""))
        password = data.get("password", "")

        users = parse_users(store_data.get("users_list", "[]"))
        target = next((u for u in users if u["name"] == username), None)
        stored = target["pw"] if target else ""

        if target is not None and await _async_check_pw(hass, stored, password):
            return self.json({"success": True})

        if target is None:
            await asyncio.sleep(FAILED_LOGIN_DELAY)
        return self.json({"success": False, "message": "Invalid credentials"}, status_code=401)


class HaushaltshilfeStateProxyView(HomeAssistantView):
    """Liest States und schreibt die eigenen Entitäten/Events der Integration."""
    url = "/api/haushaltshilfe/proxy"
    name = "api:haushaltshilfe:proxy"
    requires_auth = True

    async def get(self, request):
        """Liefert State und Attribute einer Entität (nur für angemeldete HA-Benutzer)."""
        hass = request.app["hass"]
        entity_id = request.query.get("entity_id")

        if entity_id:
            state = hass.states.get(entity_id)
            if not state:
                return self.json({"state": "unknown", "attributes": {}})
            return self.json({"state": state.state, "attributes": dict(state.attributes)})

        return self.json({"error": "No entity_id provided"}, status_code=400)

    async def post(self, request):
        """Feuert ein erlaubtes Event oder setzt eine Entität der Integration."""
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        entry = hass.data.get(DOMAIN, {}).get("entry")

        data = await _read_json(request)
        if not data:
            return self.json({"error": "Invalid JSON"}, status_code=400)

        action = data.get("action")

        # 1. Custom Event feuern (für Einkaufsliste, Aufgaben, Favoriten, Finanzen, Vorlagen)
        if action == "fire_event":
            event_type = data.get("event_type")
            event_data = data.get("event_data", {})
            if event_type not in ALLOWED_PROXY_EVENTS:
                return self.json({"error": "Event not allowed"}, status_code=403)
            if not isinstance(event_data, dict):
                event_data = {}
            hass.bus.async_fire(event_type, event_data)
            return self.json({"success": True})

        # 2. Input_text oder Sensor der Integration setzen & im Store sichern
        if action == "set_input_text":
            entity_id = data.get("entity_id")
            value = data.get("value", "")
            if not isinstance(entity_id, str) or not entity_id.startswith(ALLOWED_WRITE_PREFIXES):
                return self.json({"error": "Entity not allowed"}, status_code=403)

            helper_key = entity_id.replace("input_text.", "").replace("sensor.haushalt_", "")
            if helper_key in ("helper_master_pw", "helper_admin_pw", "users_list", "saved_ha_token"):
                return self.json({"error": "Entity not allowed"}, status_code=403)

            if helper_key == "finance_templates":
                store_data["finance_templates"] = str(value)
                store_data["helper_finance_templates"] = str(value)
            else:
                store_data[helper_key] = str(value)

            current_state = hass.states.get(entity_id)
            attrs = current_state.attributes.copy() if current_state else {}
            hass.states.async_set(entity_id, str(value), attrs)

            # Falls es die Fixkosten-Vorlagen sind, halte beide Entitäten synchron
            if "finance_templates" in entity_id:
                try:
                    parsed_tpl = json.loads(str(value)) if isinstance(value, str) else value
                except Exception:
                    parsed_tpl = []
                hass.states.async_set("input_text.helper_finance_templates", str(value), {"friendly_name": "Fixkosten Vorlagen"})
                hass.states.async_set("sensor.haushalt_finance_templates", "OK", {"templates": parsed_tpl})

            if store is not None:
                await store.async_save(store_data)

            if helper_key == "helper_visible_tabs" and entry is not None:
                try:
                    if isinstance(value, list):
                        parsed = value
                    elif isinstance(value, str):
                        try:
                            parsed = json.loads(value)
                        except json.JSONDecodeError:
                            parsed = [v.strip().strip("'\"") for v in value.strip("[]").split(",") if v.strip()]
                    else:
                        parsed = list(value)

                    new_options = dict(entry.options)
                    if new_options.get(CONF_VISIBLE_TABS) != parsed:
                        new_options[CONF_VISIBLE_TABS] = parsed
                        hass.config_entries.async_update_entry(entry, options=new_options)
                except Exception as e:
                    _LOGGER.error("Fehler beim Aktualisieren der visible_tabs Optionen im Proxy: %s", e)

            return self.json({"success": True})

        return self.json({"error": "Unknown action"}, status_code=400)


class HaushaltshilfeGetZoomView(HomeAssistantView):
    """API Endpoint um Zoom und Theme gerätespezifisch abzurufen."""
    url = "/api/haushaltshilfe/get_zoom"
    name = "api:haushaltshilfe:get_zoom"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        device_id = request.query.get("device_id", "default")

        zooms_raw = store_data.get("device_zooms", "{}")
        themes_raw = store_data.get("device_themes", "{}")
        try:
            zooms = json.loads(zooms_raw) if isinstance(zooms_raw, str) else zooms_raw
            themes = json.loads(themes_raw) if isinstance(themes_raw, str) else themes_raw
        except Exception:
            zooms = {}
            themes = {}

        zoom_val = zooms.get(device_id, 1.0)
        theme_val = themes.get(device_id, "theme-glass")

        return self.json({"zoom": zoom_val, "theme": theme_val})


class HaushaltshilfeUpdateZoomView(HomeAssistantView):
    """API Endpoint um Zoom und Theme gerätespezifisch auf dem Server zu speichern."""
    url = "/api/haushaltshilfe/update_zoom"
    name = "api:haushaltshilfe:update_zoom"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        data = await _read_json(request)

        device_id = data.get("device_id")
        zoom = data.get("zoom")
        theme = data.get("theme")

        if device_id:
            device_id = str(device_id)
            # 1. Daten aus dem Store laden
            zooms_raw = store_data.get("device_zooms", "{}")
            themes_raw = store_data.get("device_themes", "{}")
            try:
                zooms = json.loads(zooms_raw) if isinstance(zooms_raw, str) else zooms_raw
                themes = json.loads(themes_raw) if isinstance(themes_raw, str) else themes_raw
            except Exception:
                zooms = {}
                themes = {}

            # 2. Werte aktualisieren (wenn übergeben)
            if zoom is not None:
                try:
                    zooms[device_id] = float(zoom)
                except (TypeError, ValueError):
                    return self.json({"success": False, "message": "Ungültiger Zoom"}, status_code=400)
                store_data["device_zooms"] = json.dumps(zooms)

            if theme is not None:
                themes[device_id] = str(theme)
                store_data["device_themes"] = json.dumps(themes)

            # 3. Auf der Festplatte speichern
            if store is not None:
                await store.async_save(store_data)

            return self.json({"success": True})

        return self.json({"success": False, "message": "Ungültige Device-ID"}, status_code=400)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro with persistent JSON storage."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["entry"] = entry

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    store_data = await store.async_load() or {}
    hass.data[DOMAIN]["store"] = store
    hass.data[DOMAIN]["data"] = store_data

    if "users_list" not in store_data:
        store_data["users_list"] = json.dumps([])

    # Klartext-Passwörter hashen, altes HA-Token aus dem Store entfernen
    await async_migrate_secrets(hass, entry, store_data)

    opt_tabs = entry.options.get(CONF_VISIBLE_TABS, entry.data.get(CONF_VISIBLE_TABS))

    # Synchronisiere finance_templates und helper_finance_templates beim Start
    if "finance_templates" in store_data and store_data["finance_templates"] != "[]":
        store_data["helper_finance_templates"] = store_data["finance_templates"]
    elif "helper_finance_templates" in store_data:
        store_data["finance_templates"] = store_data["helper_finance_templates"]

    for helper_id, config in AUTO_INPUT_TEXTS.items():
        entity_id = f"input_text.{helper_id}"
        
        if helper_id == "helper_visible_tabs":
            if opt_tabs is not None:
                val_to_set = json.dumps(opt_tabs) if isinstance(opt_tabs, list) else str(opt_tabs)
            else:
                val_to_set = store_data.get(helper_id, config["initial"])
        else:
            val_to_set = store_data.get(helper_id, config["initial"])
        
        store_data[helper_id] = str(val_to_set)

        hass.states.async_set(
            entity_id,
            str(val_to_set),
            {
                "editable": True,
                "min": 0,
                "max": 10000,
                "mode": "text",
                "friendly_name": config["name"],
            },
        )

    await store.async_save(store_data)

    @callback
    def handle_call_service_event(event):
        data = event.data
        if data.get("domain") == "input_text" and data.get("service") == "set_value":
            service_data = data.get("service_data", {})
            entity_id = service_data.get("entity_id")
            value = service_data.get("value")

            if isinstance(entity_id, list) and entity_id:
                entity_id = entity_id[0]

            if entity_id and value is not None and entity_id.startswith("input_text."):
                helper_key = entity_id.replace("input_text.", "")
                if helper_key in ("helper_master_pw", "helper_admin_pw", "users_list", "saved_ha_token"):
                    return
                current_state = hass.states.get(entity_id)
                attrs = current_state.attributes.copy() if current_state else {}
                
                hass.states.async_set(entity_id, str(value), attrs)
                store_data[helper_key] = str(value)
                hass.async_create_task(store.async_save(store_data))

                new_options = dict(entry.options)
                updated = False
                if helper_key == "helper_visible_tabs":
                    try:
                        if isinstance(value, list):
                            parsed = value
                        elif isinstance(value, str):
                            try:
                                parsed = json.loads(value)
                            except json.JSONDecodeError:
                                parsed = [v.strip().strip("'\"") for v in value.strip("[]").split(",") if v.strip()]
                        else:
                            parsed = list(value)

                        if new_options.get(CONF_VISIBLE_TABS) != parsed:
                            new_options[CONF_VISIBLE_TABS] = parsed
                            updated = True
                    except Exception as e:
                        _LOGGER.error("Fehler beim Verarbeiten der visible_tabs im Call-Service: %s", e)

                if updated:
                    hass.config_entries.async_update_entry(entry, options=new_options)

    hass.bus.async_listen("call_service", handle_call_service_event)

    EVENT_MAPPING = {
        "set_tasks_data": "tasks_data",
        "set_todo_favs": "todo_favs",
        "set_shop_favs": "shop_favs",
        "set_food_favs": "food_favs",
        "set_shopping_data": "shopping_db",
        "set_finance_data": "finance_db",
        "set_finance_db": "finance_db",
        "set_finance_templates": "helper_finance_templates",
        # "set_users_data" entfernt: Benutzer werden nur noch über
        # /api/haushaltshilfe/users (mit Admin-Passwort, gehasht) geändert.
    }

    @callback
    def handle_custom_events(event):
        ev_type = event.event_type
        if ev_type in EVENT_MAPPING:
            storage_key = EVENT_MAPPING[ev_type]
            raw_val = None
            for key in ("tasks", "favs", "json_data", "data", "users", "templates"):
                if event.data.get(key) is not None:
                    raw_val = event.data.get(key)
                    break
            
            if raw_val is not None:
                val_str = raw_val if isinstance(raw_val, str) else json.dumps(raw_val)
                store_data[storage_key] = val_str

                if ev_type == "set_finance_templates":
                    store_data["finance_templates"] = val_str
                    store_data["helper_finance_templates"] = val_str
                    try:
                        parsed_tpl = json.loads(val_str) if isinstance(val_str, str) else raw_val
                    except Exception:
                        parsed_tpl = []
                    hass.states.async_set("input_text.helper_finance_templates", val_str, {"friendly_name": "Fixkosten Vorlagen"})
                    hass.states.async_set("sensor.haushalt_finance_templates", "OK", {"templates": parsed_tpl})
                
                hass.async_create_task(store.async_save(store_data))

    for ev_name in EVENT_MAPPING.keys():
        hass.bus.async_listen(ev_name, handle_custom_events)

    source_dir = hass.config.path("custom_components", DOMAIN, "www")
    target_dir = hass.config.path("www", "haushaltshilfe")

    if os.path.exists(source_dir):
        def copy_frontend_files():
            os.makedirs(target_dir, exist_ok=True)
            for item in os.listdir(source_dir):
                s = os.path.join(source_dir, item)
                d = os.path.join(target_dir, item)
                if os.path.isdir(s):
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)

        await hass.async_add_executor_job(copy_frontend_files)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    frontend.async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title="Haushaltshilfe",
        sidebar_icon="mdi:home-heart",
        frontend_url_path="haushaltshilfe",
        config={"url": "/local/haushaltshilfe/index.html"},
        require_admin=False,
    )

    hass.http.register_view(HaushaltshilfeCredentialsView())
    hass.http.register_view(HaushaltshilfeVerifyView())
    hass.http.register_view(HaushaltshilfeUpdateCredentialsView())
    hass.http.register_view(HaushaltshilfeUsersView())
    hass.http.register_view(HaushaltshilfePublicUsersView())
    hass.http.register_view(HaushaltshilfeAppLoginView())
    hass.http.register_view(HaushaltshilfeStateProxyView())
    hass.http.register_view(HaushaltshilfeGetZoomView())
    hass.http.register_view(HaushaltshilfeUpdateZoomView())

    entry.async_on_unload(entry.add_update_listener(update_listener))

    return True


async def update_listener(hass: HomeAssistant, entry: ConfigEntry):
    store = hass.data[DOMAIN].get("store")
    store_data = hass.data[DOMAIN].get("data", {})

    # Im Options-Flow neu eingegebene Passwörter kommen im Klartext an -> hashen.
    # Ändert das den Entry, ruft HA diesen Listener erneut auf (dann ist alles gehasht).
    if await async_migrate_secrets(hass, entry, store_data):
        return

    # Hier der entscheidende Fallback, damit visible_tabs nie None wird:
    visible_tabs = entry.options.get(CONF_VISIBLE_TABS)
    if visible_tabs is None:
        visible_tabs = entry.data.get(CONF_VISIBLE_TABS, ["shop", "todo", "food", "trash", "finance"])

    if visible_tabs is not None:
        tabs_str = json.dumps(visible_tabs) if isinstance(visible_tabs, list) else str(visible_tabs)
        store_data["helper_visible_tabs"] = tabs_str
        
        entity_id = "input_text.helper_visible_tabs"
        current_state = hass.states.get(entity_id)
        attrs = current_state.attributes.copy() if current_state else {}
        
        hass.states.async_set(entity_id, tabs_str, attrs)

    if store:
        await store.async_save(store_data)
