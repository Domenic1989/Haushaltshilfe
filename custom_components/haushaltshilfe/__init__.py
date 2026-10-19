"""The Haushaltshilfe Pro integration with persistent JSON file storage."""
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

_LOGGER = logging.getLogger(__name__)

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
    """API Endpoint um Master- und Admin-Passwort sowie sichtbare Tabs an das Frontend zu liefern."""
    url = "/api/haushaltshilfe/credentials"
    name = "api:haushaltshilfe:credentials"
    requires_auth = False

    async def get(self, request):
        hass = request.app["hass"]
        entry = hass.data.get(DOMAIN, {}).get("entry")
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        if not entry:
            return self.json({"error": "Config entry not found"}, status=500)

        m_pw = entry.options.get(CONF_MASTER_PW, entry.data.get(CONF_MASTER_PW, store_data.get("helper_master_pw", "")))
        a_pw = entry.options.get(CONF_ADMIN_PW, entry.data.get(CONF_ADMIN_PW, store_data.get("helper_admin_pw", "")))
        
        # Tabs genau wie die Passwörter aus Options -> Data -> Store holen
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
            "master_pw": str(m_pw),
            "admin_pw": str(a_pw),
            "visible_tabs": visible_tabs
        })


class HaushaltshilfeUpdateCredentialsView(HomeAssistantView):
    """API Endpoint um Master- und Admin-Passwort sowie sichtbare Tabs zentral zu speichern."""
    url = "/api/haushaltshilfe/update_credentials"
    name = "api:haushaltshilfe:update_credentials"
    requires_auth = False

    async def post(self, request):
        hass = request.app["hass"]
        entry = hass.data.get(DOMAIN, {}).get("entry")
        if not entry:
            return self.json({"error": "Config entry not found"}, status=500)

        try:
            data = await request.json()
        except Exception:
            try:
                raw_text = await request.text()
                data = json.loads(raw_text)
            except Exception:
                data = {}

        new_master = data.get("master_pw")
        new_admin = data.get("admin_pw")
        new_tabs = data.get("visible_tabs")

        new_options = {**entry.data, **entry.options}
        updated = False

        if new_master is not None and str(new_master).strip() != "":
            new_options[CONF_MASTER_PW] = str(new_master).strip()
            updated = True
        
        if new_admin is not None and str(new_admin).strip() != "":
            new_options[CONF_ADMIN_PW] = str(new_admin).strip()
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

        if updated:
            hass.config_entries.async_update_entry(entry, options=new_options)
            
            store_data = hass.data[DOMAIN].get("data", {})
            store = hass.data[DOMAIN].get("store")
            if store_data is not None and store is not None:
                if new_master is not None and str(new_master).strip() != "":
                    store_data["helper_master_pw"] = str(new_master).strip()
                if new_admin is not None and str(new_admin).strip() != "":
                    store_data["helper_admin_pw"] = str(new_admin).strip()
                if parsed_tabs is not None:
                    tabs_str = json.dumps(parsed_tabs)
                    store_data["helper_visible_tabs"] = tabs_str
                    current_state = hass.states.get("input_text.helper_visible_tabs")
                    attrs = current_state.attributes.copy() if current_state else {}
                    hass.states.async_set("input_text.helper_visible_tabs", tabs_str, attrs)

                await store.async_save(store_data)

            return self.json({"success": True})

        return self.json({"success": False, "message": "Keine Änderungen"}, status=400)


class HaushaltshilfeUsersView(HomeAssistantView):
    """API Endpoint um die Benutzerliste abzurufen und zu speichern."""
    url = "/api/haushaltshilfe/users"
    name = "api:haushaltshilfe:users"
    requires_auth = False

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        
        raw_users = store_data.get("users_list")
        
        if raw_users is None:
            users_list = []
            store_data["users_list"] = json.dumps(users_list)
            if store is not None:
                await store.async_save(store_data)
        else:
            if isinstance(raw_users, str):
                try:
                    users_list = json.loads(raw_users)
                except Exception:
                    users_list = []
            else:
                users_list = raw_users
                
        return self.json({"users": users_list})

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")

        try:
            data = await request.json()
        except Exception:
            try:
                raw_text = await request.text()
                data = json.loads(raw_text)
            except Exception:
                data = {}

        new_users = data.get("users")
        if new_users is not None:
            if isinstance(new_users, list):
                store_data["users_list"] = json.dumps(new_users)
            else:
                store_data["users_list"] = str(new_users)

            if store is not None:
                await store.async_save(store_data)

            return self.json({"success": True})

        return self.json({"success": False, "message": "Keine Benutzer übergeben"}, status=400)


class HaushaltshilfeSaveTokenView(HomeAssistantView):
    """Speichert ein aktives HA-Token im Backend, damit Mobilgeräte es nach Login abrufen können."""
    url = "/api/haushaltshilfe/save_token"
    name = "api:haushaltshilfe:save_token"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data.get(DOMAIN, {}).get("store")

        try:
            data = await request.json()
        except Exception:
            data = {}

        token = data.get("token")
        if token and isinstance(token, str) and token.strip() != "":
            store_data["saved_ha_token"] = token.strip()
            if store is not None:
                await store.async_save(store_data)
            return self.json({"success": True})

        return self.json({"success": False}, status=400)


class HaushaltshilfePublicUsersView(HomeAssistantView):
    """Liefert nur die Benutzernamen (ohne Passwörter!) für den Login-Screen ohne Token."""
    url = "/api/haushaltshilfe/public_users"
    name = "api:haushaltshilfe:public_users"
    requires_auth = False

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        raw_users = store_data.get("users_list", "[]")

        if isinstance(raw_users, str):
            try:
                users_list = json.loads(raw_users)
            except Exception:
                users_list = []
        else:
            users_list = raw_users if isinstance(raw_users, list) else []

        public_users = []
        for u_str in users_list:
            if isinstance(u_str, str) and ":" in u_str:
                parts = u_str.split(":")
                u_name = parts[0]
                is_pers = len(parts) > 2 and parts[2] == "persistent"
                public_users.append({"name": u_name, "persistent": is_pers})

        return self.json({"users": public_users})


class HaushaltshilfeAppLoginView(HomeAssistantView):
    """Prüft Benutzername & Passwort ohne Token und gibt bei Erfolg das gespeicherte Token zurück."""
    url = "/api/haushaltshilfe/app_login"
    name = "api:haushaltshilfe:app_login"
    requires_auth = False

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})

        try:
            data = await request.json()
        except Exception:
            try:
                raw_text = await request.text()
                data = json.loads(raw_text)
            except Exception:
                data = {}

        username = data.get("username", "")
        password = data.get("password", "")

        raw_users = store_data.get("users_list", "[]")
        if isinstance(raw_users, str):
            try:
                users_list = json.loads(raw_users)
            except Exception:
                users_list = []
        else:
            users_list = raw_users if isinstance(raw_users, list) else []

        for u_str in users_list:
            if isinstance(u_str, str) and ":" in u_str:
                parts = u_str.split(":")
                u_name = parts[0]
                u_pw = parts[1] if len(parts) > 1 else ""
                if u_name == username and u_pw == password:
                    saved_token = store_data.get("saved_ha_token", "")
                    return self.json({"success": True, "token": saved_token})

        return self.json({"success": False, "message": "Invalid credentials"}, status=401)


class HaushaltshilfeStateProxyView(HomeAssistantView):
    """Liest und schreibt States & Events für das Frontend komplett ohne Token-Zwang."""
    url = "/api/haushaltshilfe/proxy"
    name = "api:haushaltshilfe:proxy"
    requires_auth = False

    async def get(self, request):
        """Liefert den State und die Attribute einer Entität ohne Token."""
        hass = request.app["hass"]
        entity_id = request.query.get("entity_id")
        
        if entity_id:
            state = hass.states.get(entity_id)
            if not state:
                return self.json({"state": "unknown", "attributes": {}})
            return self.json({"state": state.state, "attributes": dict(state.attributes)})
            
        return self.json({"error": "No entity_id provided"}, status=400)

    async def post(self, request):
        """Feuert ein Event oder setzt einen input_text / sensor Wert ohne Token."""
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        entry = hass.data.get(DOMAIN, {}).get("entry")

        try:
            data = await request.json()
        except Exception:
            try:
                raw_text = await request.text()
                data = json.loads(raw_text)
            except Exception:
                return self.json({"error": "Invalid JSON"}, status=400)

        action = data.get("action")
        
        # 1. Custom Event feuern (für Einkaufsliste, Aufgaben, Favoriten, Finanzen, Vorlagen)
        if action == "fire_event":
            event_type = data.get("event_type")
            event_data = data.get("event_data", {})
            if event_type:
                hass.bus.async_fire(event_type, event_data)
                return self.json({"success": True})

        # 2. Input_text oder Sensor direkt setzen & im Store sichern
        elif action == "set_input_text":
            entity_id = data.get("entity_id")
            value = data.get("value", "")
            if entity_id and (entity_id.startswith("input_text.") or entity_id.startswith("sensor.")):
                helper_key = entity_id.replace("input_text.", "").replace("sensor.haushalt_", "")
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

        return self.json({"error": "Unknown action"}, status=400)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro with persistent JSON storage."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["entry"] = entry

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    store_data = await store.async_load() or {}
    hass.data[DOMAIN]["store"] = store
    hass.data[DOMAIN]["data"] = store_data

    opt_master = entry.options.get(CONF_MASTER_PW, entry.data.get(CONF_MASTER_PW))
    opt_admin = entry.options.get(CONF_ADMIN_PW, entry.data.get(CONF_ADMIN_PW))
    opt_tabs = entry.options.get(CONF_VISIBLE_TABS, entry.data.get(CONF_VISIBLE_TABS))

    if opt_master is not None:
        store_data["helper_master_pw"] = str(opt_master)
    if opt_admin is not None:
        store_data["helper_admin_pw"] = str(opt_admin)

    if "users_list" not in store_data:
        store_data["users_list"] = json.dumps([])

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
        "set_users_data": "users_list",
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
    hass.http.register_view(HaushaltshilfeUpdateCredentialsView())
    hass.http.register_view(HaushaltshilfeUsersView())
    hass.http.register_view(HaushaltshilfeSaveTokenView())
    hass.http.register_view(HaushaltshilfePublicUsersView())
    hass.http.register_view(HaushaltshilfeAppLoginView())
    hass.http.register_view(HaushaltshilfeStateProxyView())

    entry.async_on_unload(entry.add_update_listener(update_listener))

    return True


async def update_listener(hass: HomeAssistant, entry: ConfigEntry):
    store = hass.data[DOMAIN].get("store")
    store_data = hass.data[DOMAIN].get("data", {})

    admin_pw = entry.options.get(CONF_ADMIN_PW) or entry.data.get(CONF_ADMIN_PW)
    master_pw = entry.options.get(CONF_MASTER_PW) or entry.data.get(CONF_MASTER_PW)
    
    # Hier der entscheidende Fallback, damit visible_tabs nie None wird:
    visible_tabs = entry.options.get(CONF_VISIBLE_TABS)
    if visible_tabs is None:
        visible_tabs = entry.data.get(CONF_VISIBLE_TABS, ["shop", "todo", "food", "trash", "finance"])

    if admin_pw is not None:
        store_data["helper_admin_pw"] = str(admin_pw)
    if master_pw is not None:
        store_data["helper_master_pw"] = str(master_pw)

    if visible_tabs is not None:
        tabs_str = json.dumps(visible_tabs) if isinstance(visible_tabs, list) else str(visible_tabs)
        store_data["helper_visible_tabs"] = tabs_str
        
        entity_id = "input_text.helper_visible_tabs"
        current_state = hass.states.get(entity_id)
        attrs = current_state.attributes.copy() if current_state else {}
        
        hass.states.async_set(entity_id, tabs_str, attrs)

    if store:
        await store.async_save(store_data)