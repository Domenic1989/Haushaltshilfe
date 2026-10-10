"""The Haushaltshilfe Pro integration with persistent JSON file storage."""
import logging
import os
import shutil
import json
from homeassistant.core import HomeAssistant, callback
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend
from homeassistant.helpers.storage import Store

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]
STORAGE_KEY = f"{DOMAIN}_data_store"
STORAGE_VERSION = 1

AUTO_INPUT_TEXTS = {
    "helper_admin_pw": {"name": "Admin Passwort", "initial": "1234"},
    "helper_user_list": {"name": "Benutzerliste", "initial": '["Admin:admin", "Tablet:tablet"]'},
    "helper_shop_stores": {"name": "Geschäfte", "initial": '["Aldi", "Lidl", "Rewe"]'},
    "helper_room_list": {"name": "Räume", "initial": '["Küche", "Bad", "Wohnen"]'},
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

    # 1. Input-Text-Helfer initialisieren / wiederherstellen
    for helper_id, config in AUTO_INPUT_TEXTS.items():
        entity_id = f"input_text.{helper_id}"
        val_to_set = store_data.get(helper_id, config["initial"])
        
        hass.states.async_set(
            entity_id,
            val_to_set,
            {
                "editable": True,
                "min": 0,
                "max": 10000,
                "mode": "text",
                "friendly_name": config["name"],
            },
        )

    # 2. Speichere Input-Text Änderungen (Geschäfte, Räume, Essen)
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

    hass.bus.async_listen("call_service", handle_call_service_event)

    # 3. Custom Events abfangen & exakt passend zur JS-Struktur sichern
    EVENT_MAPPING = {
        "set_tasks_data": "tasks_data",
        "set_todo_favs": "todo_favs",
        "set_shop_favs": "shop_favs",
        "set_food_favs": "food_favs",
        "set_shopping_data": "shopping_db",
        "set_finance_data": "finance_db",
        "set_finance_db": "finance_db",
    }

    @callback
    def handle_custom_events(event):
        ev_type = event.event_type
        if ev_type in EVENT_MAPPING:
            storage_key = EVENT_MAPPING[ev_type]
            
            # WICHTIG: Holt 'tasks', 'favs', 'json_data' oder 'data' aus dem Event
            raw_val = (
                event.data.get("tasks") 
                or event.data.get("favs") 
                or event.data.get("json_data") 
                or event.data.get("data")
            )
            
            if raw_val is not None:
                # Falls es bereits ein String ist (wie bei saveTodoDb), direkt speichern
                if isinstance(raw_val, str):
                    store_data[storage_key] = raw_val
                else:
                    store_data[storage_key] = json.dumps(raw_val)
                
                # Datei auf Festplatte sichern
                hass.async_create_task(store.async_save(store_data))

    for ev_name in EVENT_MAPPING.keys():
        hass.bus.async_listen(ev_name, handle_custom_events)

    # Synchronisiere WWW-Ordner
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
        sidebar_icon="mdi:home-assistant",
        frontend_url_path="haushaltshilfe",
        config={"url": "/local/haushaltshilfe/index.html"},
        require_admin=False,
    )

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        try:
            frontend.async_remove_panel(hass, "haushaltshilfe")
        except Exception:
            pass

    return unload_ok
