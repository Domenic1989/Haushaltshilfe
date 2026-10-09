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

    # 2. Sensoren laden
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 3. Sidebar Panel ohne fehlerhafte Keyboards registrieren
    # Reihenfolge: (hass, component_name, sidebar_title, sidebar_icon, url_path, config, require_admin)
    frontend.async_register_built_in_panel(
        hass,
        "iframe",
        "Haushaltshilfe",
        "mdi:home-assistant",
        "haushaltshilfe",
        {"url": "/local/haushaltshilfe/index.html"},
        False,
    )

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        frontend.async_remove_panel(hass, "haushaltshilfe")

    return unload_ok
