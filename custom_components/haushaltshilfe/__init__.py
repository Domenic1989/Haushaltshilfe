"""The Haushaltshilfe Pro integration."""
import logging
import os
import shutil
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend

from .const import DOMAIN, HELPER_ENTITIES

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    # 1. Abfangen aller Service-Aufrufe/Events vom Frontend & Weiterleiten an die Helfer
    async def handle_call_service_event(event):
        data = event.data
        domain = data.get("domain")
        service = data.get("service")
        service_data = data.get("service_data", {})

        if domain == "input_text" and service == "set_value":
            entity_id = service_data.get("entity_id")
            value = service_data.get("value")

            # Falls entity_id als Liste übergeben wurde
            if isinstance(entity_id, list) and entity_id:
                entity_id = entity_id[0]

            if entity_id and value is not None:
                # Setzt den Zustand direkt im HA State Store
                current_state = hass.states.get(entity_id)
                attrs = current_state.attributes.copy() if current_state else {
                    "editable": True,
                    "min": 0,
                    "max": 10000,
                    "mode": "text",
                }
                hass.states.async_set(entity_id, str(value), attrs)
                _LOGGER.info(f"Frontend-Wert erfolgreich an {entity_id} übertragen: {value}")

    # Registriere den Event-Listener für Service-Calls
    hass.bus.async_listen("call_service", handle_call_service_event)

    # 2. Synchronisation der Frontend-Dateien
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

    # 3. Sensoren laden
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 4. Sidebar-Panel registrieren
    try:
        frontend.async_remove_panel(hass, "haushaltshilfe")
    except Exception:
        pass

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
