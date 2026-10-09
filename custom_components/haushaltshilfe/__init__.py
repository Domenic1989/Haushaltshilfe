"""The Haushaltshilfe Pro integration."""
import logging
import os
import shutil
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

# Alle input_text Helfer aus config.js, die automatisch angelegt werden sollen:
HELPER_ENTITIES = {
    # Administration & Grundlagen
    "helper_admin_pw": {
        "name": "Haushalt Admin PW",
        "initial": "1234",
        "icon": "mdi:lock",
    },
    "helper_user_list": {
        "name": "Haushalt User List",
        "initial": "Admin:admin,Tablet:tablet",
        "icon": "mdi:account-group",
    },
    "helper_shop_stores": {
        "name": "Haushalt Shop Stores",
        "initial": "Aldi,Rewe,Lidl",
        "icon": "mdi:store",
    },
    "helper_room_list": {
        "name": "Haushalt Room List",
        "initial": "Küche,Bad,Wohnzimmer",
        "icon": "mdi:home-floor-1",
    },
    # Essensplan Wochentage (FOOD_ENTITIES aus config.js)
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

    # 1. input_text-Helfer automatisch erstellen, falls sie noch nicht existieren
    for helper_id, config in HELPER_ENTITIES.items():
        entity_id = f"input_text.{helper_id}"

        if not hass.states.get(entity_id):
            try:
                await hass.services.async_call(
                    "input_text",
                    "create",
                    {
                        "name": config["name"],
                        "initial": config["initial"],
                        "icon": config["icon"],
                        "max": 255,
                    },
                    blocking=True,
                )
                _LOGGER.info(f"Helfer {entity_id} erfolgreich automatisch erstellt.")
            except Exception as e:
                _LOGGER.error(f"Fehler beim Erstellen von {entity_id}: {e}")

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
