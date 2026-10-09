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

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    # 1. Frontend-Dateien aus /www nach /config/www/haushaltshilfe kopieren
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

    # 2. Benötigte input_text Helfer automatisch anlegen
    default_text_helpers = {
        "haushalt_users": '["Domenic:Sabrina1707.","Sabrina:Sabrina1707.","Tablet:Sabrina1707."]',
        "haushalt_stores": '["Aldi","Lidl","Rewe"]',
        "haushalt_rooms": '["Küche","Bad","Wohnen","Garten"]',
        "haushalt_admin_pw": "admin",
        "haushalt_food_mo": "",
        "haushalt_food_di": "",
        "haushalt_food_mi": "",
        "haushalt_food_do": "",
        "haushalt_food_fr": "",
        "haushalt_food_sa": "",
        "haushalt_food_so": "",
    }

    for entity_suffix, default_val in default_text_helpers.items():
        entity_id = f"input_text.{entity_suffix}"
        if not hass.states.get(entity_id):
            await hass.services.async_call(
                "input_text",
                "set_value",
                {"entity_id": entity_id, "value": default_val},
                blocking=False,
            )

    # 3. Sensoren laden
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 4. Sidebar Panel in Home Assistant registrieren
    frontend.async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title="Haushaltshilfe",
        sidebar_icon="mdi:home-assistant",
        url_path="haushaltshilfe",
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
