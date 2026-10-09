"""The Haushaltshilfe Pro integration."""
import logging
import os
import shutil
import json
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

# Alle input_text Helfer mit exakten JSON-Initialwerten für dein Frontend:
HELPER_ENTITIES = {
    # Administration & Grundlagen
    "helper_admin_pw": {
        "name": "Haushalt Admin PW",
        "initial": "1234",
        "icon": "mdi:lock",
    },
    "helper_user_list": {
        "name": "Haushalt User List",
        "initial": json.dumps(["Admin:admin", "Tablet:tablet"]),
        "icon": "mdi:account-group",
    },
    "helper_shop_stores": {
        "name": "Haushalt Shop Stores",
        "initial": json.dumps(["Aldi", "Lidl", "Rewe"]),
        "icon": "mdi:store",
    },
    "helper_room_list": {
        "name": "Haushalt Room List",
        "initial": json.dumps(["Küche", "Bad", "Wohnzimmer"]),
        "icon": "mdi:home-floor-1",
    },
    # Favoriten & Kategorien Storage
    "helper_shop_favs": {
        "name": "Haushalt Shop Favs",
        "initial": json.dumps({"cats": ["Alle", "Gemüse", "Fleisch", "Vorrat", "Haus"], "favs": []}),
        "icon": "mdi:cart-outline",
    },
    "helper_food_favs": {
        "name": "Haushalt Food Favs",
        "initial": json.dumps({"cats": ["Alle", "Schnell", "Italienisch", "Leicht"], "favs": []}),
        "icon": "mdi:silverware-variant",
    },
    "helper_todo_favs": {
        "name": "Haushalt Todo Favs",
        "initial": json.dumps({"cats": ["Alle", "Haus", "Bad", "Wohnen", "Küche", "Garten"], "favs": []}),
        "icon": "mdi:checkbox-marked-circle-outline",
    },
    # Essensplan Wochentage
    "essen_montag": {
        "name": "Essen Montag",
        "initial": "",
        "icon": "mdi:silverware-fork-knife",
    },
    "essen_dienstag": {
        "name": "Essen Dienstag",
        "initial": "",
        "icon": "mdi:silverware-fork-knife",
    },
    "essen_mittwoch": {
        "name": "Essen Mittwoch",
        "initial": "",
        "icon": "mdi:silverware-fork-knife",
    },
    "essen_donnerstag": {
        "name": "Essen Donnerstag",
        "initial": "",
        "icon": "mdi:silverware-fork-knife",
    },
    "essen_freitag": {
        "name": "Essen Freitag",
        "initial": "",
        "icon": "mdi:silverware-fork-knife",
    },
    "essen_samstag": {
        "name": "Essen Samstag",
        "initial": "",
        "icon": "mdi:silverware-fork-knife",
    },
    "essen_sonntag": {
        "name": "Essen Sonntag",
        "initial": "",
        "icon": "mdi:silverware-fork-knife",
    },
}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    registry = er.async_get(hass)

    # 1. Registrieren und Erhalten der input_text Helfer
    for helper_id, config in HELPER_ENTITIES.items():
        entity_id = f"input_text.{helper_id}"

        # In der Entity Registry registrieren, damit HA die Entität fest kennt
        registry.async_get_or_create(
            domain="input_text",
            platform=DOMAIN,
            unique_id=f"haushalt_input_text_{helper_id}",
            suggested_object_id=helper_id,
            original_name=config["name"],
            original_icon=config["icon"],
        )

        # Nur wenn im State Store aktuell KEIN Zustand existiert (erster Start),
        # wird der Initialwert gesetzt. Bei Neustarts bleibt der echte State erhalten!
        existing_state = hass.states.get(entity_id)
        if existing_state is None or existing_state.state in ("unknown", "unavailable"):
            try:
                hass.states.async_set(
                    entity_id,
                    config["initial"],
                    {
                        "friendly_name": config["name"],
                        "icon": config["icon"],
                        "editable": True,
                    },
                )
                _LOGGER.info(f"Helfer {entity_id} mit Initialwert angelegt.")
            except Exception as e:
                _LOGGER.error(f"Fehler beim Initialisieren von {entity_id}: {e}")

    # 2. Frontend-Dateien aus /www nach /config/www/haushaltshilfe kopieren
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
        _LOGGER.info("Haushaltshilfe Frontend-Dateien erfolgreich synchronisiert.")

    # 3. Sensoren laden
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 4. Sidebar-Panel registrieren
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
