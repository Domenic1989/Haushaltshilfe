"""The Haushaltshilfe Pro integration with persistent JSON file storage."""
import logging
import os
import shutil
import json
from homeassistant.core import HomeAssistant, callback
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend
from homeassistant.helpers.storage import Store

from .const import DOMAIN, CONF_ADMIN_PW, CONF_MASTER_PW, CONF_VISIBLE_TABS

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]
STORAGE_KEY = f"{DOMAIN}_data_store"
STORAGE_VERSION = 1

AUTO_INPUT_TEXTS = {
    "helper_master_pw": {"name": "Master Passwort", "initial": "homeassistant"},
    "helper_admin_pw": {"name": "Admin Passwort", "initial": "1234"},
    "helper_user_list": {"name": "Benutzerliste", "initial": '["Admin:admin", "Tablet:tablet"]'},
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


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro with persistent JSON storage."""
    hass.data.setdefault(DOMAIN, {})
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    
    store_data = await store.async_load() or {}
    hass.data[DOMAIN]["store"] = store
    hass.data[DOMAIN]["data"] = store_data

    # Optionswerte aus der Integration auslesen
    opt_admin = entry.options.get(CONF_ADMIN_PW)
    opt_master = entry.options.get(CONF_MASTER_PW)
    opt_tabs = entry.options.get(CONF_VISIBLE_TABS)

    # 1. Input-Text-Helfer initialisieren / wiederherstellen
    for helper_id, config in AUTO_INPUT_TEXTS.items():
        entity_id = f"input_text.{helper_id}"
        
        if helper_id == "helper_admin_pw":
            val_to_set = opt_admin if opt_admin is not None else store_data.get(helper_id, config["initial"])
        elif helper_id == "helper_master_pw":
            val_to_set = opt_master if opt_master is not None else store_data.get(helper_id, config["initial"])
        elif helper_id == "helper_visible_tabs":
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
                "mode": "password" if "pw" in helper_id else "text",
                "friendly_name": config["name"],
            },
        )

    await store.async_save(store_data)

    # 2. Listener für REST API Aufrufe aus dem Dashboard
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
                
                # State und Store sofort schreiben
                hass.states.async_set(entity_id, str(value), attrs)
                store_data[helper_key] = str(value)
                hass.async_create_task(store.async_save(store_data))

                # Entry Options im Hintergrund synchronisieren (ohne Reload-Schleife)
                new_options = dict(entry.options)
                updated = False
                if helper_key == "helper_admin_pw" and new_options.get(CONF_ADMIN_PW) != str(value):
                    new_options[CONF_ADMIN_PW] = str(value)
                    updated = True
                elif helper_key == "helper_master_pw" and new_options.get(CONF_MASTER_PW) != str(value):
                    new_options[CONF_MASTER_PW] = str(value)
                    updated = True
                elif helper_key == "helper_visible_tabs":
                    try:
                        parsed = json.loads(str(value))
                        if new_options.get(CONF_VISIBLE_TABS) != parsed:
                            new_options[CONF_VISIBLE_TABS] = parsed
                            updated = True
                    except Exception:
                        pass

                if updated:
                    hass.config_entries.async_update_entry(entry, options=new_options)

    hass.bus.async_listen("call_service", handle_call_service_event)

    # Custom Events abfangen
    EVENT_MAPPING = {
        "set_tasks_data": "tasks_data",
        "set_todo_favs": "todo_favs",
        "set_shop_favs": "shop_favs",
        "set_food_favs": "food_favs",
        "set_shopping_data": "shopping_db",
        "set_finance_data": "finance_db",
        "set_finance_db": "finance_db",
        "set_finance_templates": "finance_templates",
    }

    @callback
    def handle_custom_events(event):
        ev_type = event.event_type
        if ev_type in EVENT_MAPPING:
            storage_key = EVENT_MAPPING[ev_type]
            raw_val = None
            for key in ("tasks", "favs", "json_data", "data"):
                if event.data.get(key) is not None:
                    raw_val = event.data.get(key)
                    break
            
            if raw_val is not None:
                if isinstance(raw_val, str):
                    store_data[storage_key] = raw_val
                else:
                    store_data[storage_key] = json.dumps(raw_val)
                
                hass.async_create_task(store.async_save(store_data))

    for ev_name in EVENT_MAPPING.keys():
        hass.bus.async_listen(ev_name, handle_custom_events)

    # WWW Ordner synchronisieren
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

    entry.async_on_unload(entry.add_update_listener(update_listener))

    return True


async def update_listener(hass: HomeAssistant, entry: ConfigEntry):
    """Wird aufgerufen, wenn Einstellungen in den HA-Integrationsoptionen geändert werden."""
    store = hass.data[DOMAIN].get("store")
    store_data = hass.data[DOMAIN].get("data", {})

    admin_pw = entry.options.get(CONF_ADMIN_PW)
    master_pw = entry.options.get(CONF_MASTER_PW)
    visible_tabs = entry.options.get(CONF_VISIBLE_TABS)

    # 1. Admin-Passwort synchronisieren
    if admin_pw is not None:
        val_admin = str(admin_pw)
        store_data["helper_admin_pw"] = val_admin
        current_state = hass.states.get("input_text.helper_admin_pw")
        attrs = current_state.attributes.copy() if current_state else {}
        hass.states.async_set("input_text.helper_admin_pw", val_admin, attrs)

    # 2. Master-Passwort synchronisieren
    if master_pw is not None:
        val_master = str(master_pw)
        store_data["helper_master_pw"] = val_master
        current_state = hass.states.get("input_text.helper_master_pw")
        attrs = current_state.attributes.copy() if current_state else {}
        hass.states.async_set("input_text.helper_master_pw", val_master, attrs)

    # 3. Sichtbare Tabs synchronisieren (Liste sauber als JSON-String formatieren)
    if visible_tabs is not None:
        if isinstance(visible_tabs, list):
            tabs_str = json.dumps(visible_tabs)
        else:
            tabs_str = str(visible_tabs)

        store_data["helper_visible_tabs"] = tabs_str
        current_state = hass.states.get("input_text.helper_visible_tabs")
        attrs = current_state.attributes.copy() if current_state else {}
        
        # State in HA sofort setzen, damit das Dashboard den neuen Wert ausliest
        hass.states.async_set("input_text.helper_visible_tabs", tabs_str, attrs)

    # In der JSON-Datei speichern
    if store:
        await store.async_save(store_data)
