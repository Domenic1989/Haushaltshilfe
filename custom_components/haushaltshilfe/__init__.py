import os
import shutil
import logging
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import panel_custom
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "input_text"]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro from a config entry."""

    # 1. Automatisches Kopieren der Frontend-Dateien nach /config/www/haushaltshilfe/
    source_dir = hass.config.path("custom_components", DOMAIN, "www")
    target_dir = hass.config.path("www", DOMAIN)

    if os.path.exists(source_dir):
        def copy_files():
            os.makedirs(target_dir, exist_ok=True)
            for file in os.listdir(source_dir):
                s = os.path.join(source_dir, file)
                d = os.path.join(target_dir, file)
                if os.path.isfile(s):
                    shutil.copy2(s, d)

        await hass.async_add_executor_job(copy_files)

    # 2. Plattformen laden
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 3. Sidebar-Panel registrieren
    panel_custom.async_register_panel(
        hass,
        webcomponent_name="haushaltshilfe-panel",
        sidebar_title="Haushaltshilfe",
        sidebar_icon="mdi:home-assistant",
        url_path="haushaltshilfe",
        module_url="/local/haushaltshilfe/index.html",
        embed_iframe=True,
        require_admin=False,
    )

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    panel_custom.async_unregister_panel(hass, "haushaltshilfe")
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
