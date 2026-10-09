import logging
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import panel_custom

DOMAIN = "haushaltshilfe"

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Registrierung des Frontend-Panels in der Seitenleiste
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
    # Panel beim Entfernen der Integration wieder austragen
    panel_custom.async_unregister_panel(hass, "haushaltshilfe")
    return True
