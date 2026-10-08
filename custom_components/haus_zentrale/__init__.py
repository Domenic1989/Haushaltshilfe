"""The Haus-Zentrale Pro integration."""
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
    """Set up Haus-Zentrale Pro from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    # 1. Frontend-Dateien aus /www nach /www/haus-zentrale/ kopieren
    source_dir = hass.config.path("custom_components", DOMAIN, "www")
    target_dir = hass.config.path("www", "haus-zentrale")

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

        try:
            await hass.async_add_executor_job(copy_frontend_files)
            _LOGGER.info("Haus-Zentrale Frontend-Dateien erfolgreich synchronisiert.")
        except Exception as err:
            _LOGGER.warning("Fehler beim Kopieren der Web-Dateien: %s", err)

    # 2. Sensoren-Plattform laden
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 3. Sidebar Panel in Home Assistant registrieren
    try:
        frontend.async_register_built_in_panel(
            hass,
            component_name="iframe",
            sidebar_title="Haus-Zentrale",
            sidebar_icon="mdi:home-assistant",
            frontend_url_path="haus-zentrale",
            config={"url": "/local/haus-zentrale/index.html"},
            require_admin=False,
        )
    except Exception as err:
        _LOGGER.warning("Panel konnte nicht registriert werden (evtl. bereits vorhanden): %s", err)

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        try:
            frontend.async_remove_panel(hass, "haus-zentrale")
        except Exception:
            pass

    return unload_ok
