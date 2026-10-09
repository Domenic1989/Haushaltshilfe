"""The Haushaltshilfe Pro integration."""
import logging
import os
import shutil
import json
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend

_LOGGER = logging.getLogger(__name__)

DOMAIN = "haushaltshilfe"
PLATFORMS = ["sensor"]

# Sämtliche input_text Helfer einheitlich strukturiert:
HELPER_ENTITIES = {
    # Administration & Benutzer
    "helper_admin_pw": {
        "name": "helper admin pw",
        "initial": "1234",
    },
    "helper_user_list": {
        "name": "helper user list",
        "initial": json.dumps(["Admin:admin", "Tablet:tablet"]),
    },
    # Listen (Orte & Räume)
    "helper_shop_stores": {
        "name": "helper shop stores",
        "initial": json.dumps(["Aldi", "Lidl", "Rewe"]),
    },
    "helper_room_list": {
        "name": "helper room list",
        "initial": json.dumps(["Küche", "Schlafzimmer", "Bad OG", "Bad EG"]),
    },
    # Favoriten & Kategorien (Shop, Food, Todo)
    "helper_shop_favs": {
        "name": "helper shop favs",
        "initial": json.dumps({"cats": ["Alle", "Gemüse", "Fleisch", "Vorrat", "Haus"], "favs": []}),
    },
    "helper_food_favs": {
        "name": "helper food favs",
        "initial": json.dumps({"cats": ["Alle", "Schnell", "Italienisch", "Leicht"], "favs": []}),
    },
    "helper_todo_favs": {
        "name": "helper todo favs",
        "initial": json.dumps({"cats": ["Alle", "Haus", "Bad", "Wohnen", "Küche", "Garten"], "favs": []}),
    },
    # Essensplan Wochentage
    "essen_montag": {"name": "essen montag", "initial": ""},
    "essen_dienstag": {"name": "essen dienstag", "initial": ""},
    "essen_mittwoch": {"name": "essen mittwoch", "initial": ""},
    "essen_donnerstag": {"name": "essen donnerstag", "initial": ""},
    "essen_freitag": {"name": "essen freitag", "initial": ""},
    "essen_samstag": {"name": "essen samstag", "initial": ""},
    "essen_sonntag": {"name": "essen sonntag", "initial": ""},
}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    # Erstellt JEDEN Helfer mit exakt der gleichen Attributstruktur
    for helper_id, config in HELPER_ENTITIES.items():
        entity_id = f"input_text.{helper_id}"

        existing_state = hass.states.get(entity_id)
        if existing_state is None or existing_state.state in ("unknown", "unavailable"):
            try:
                hass.states.async_set(
                    entity_id,
                    config["initial"],
                    {
                        "editable": True,
                        "min": 0,
                        "max": 255,
                        "pattern": None,
                        "mode": "text",
                        "friendly_name": config["name"],
                    },
                )
                _LOGGER.info(f"Helfer {entity_id} mit allen Attributen angelegt.")
            except Exception as e:
                _LOGGER.error(f"Fehler beim Erstellen von {entity_id}: {e}")

    # Synchronisation der Frontend-Dateien (/www -> /config/www/haushaltshilfe)
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
        frontend.async_remove_panel(hass, "haushaltshilfe")

    return unload_ok
