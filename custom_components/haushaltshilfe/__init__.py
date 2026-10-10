"""The Haushaltshilfe Pro integration."""
import logging
import os
import shutil
from homeassistant.core import HomeAssistant, CoreState, callback
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend
from homeassistant.helpers import entity_registry as er
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED

from .const import DOMAIN, HELPER_ENTITIES

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    registry = er.async_get(hass)

    # 1. Registrieren der Helfer in der Entity Registry
    for helper_id, config in HELPER_ENTITIES.items():
        registry.async_get_or_create(
            domain="input_text",
            platform=DOMAIN,
            unique_id=f"haushalt_helper_{helper_id}",
            suggested_object_id=helper_id,
            original_name=config["name"],
        )

    # Funktion zum Wiederherstellen der Daten aus den Datenbank-Sensoren
    @callback
    def restore_helper_states(_=None):
        for helper_id, config in HELPER_ENTITIES.items():
            entity_id = f"input_text.{helper_id}"
            sensor_id = f"sensor.{helper_id}"

            # Wert aus dem Datenbank-Sensor auslesen
            sensor_state = hass.states.get(sensor_id)
            restored_val = config["initial"]

            if sensor_state and sensor_state.state not in (None, "unknown", "unavailable", "OK"):
                restored_val = sensor_state.state
            elif sensor_state and "value" in sensor_state.attributes:
                restored_val = sensor_state.attributes["value"]

            # Zustand im State Store sicherstellen
            current_state = hass.states.get(entity_id)
            attrs = current_state.attributes.copy() if current_state else {
                "editable": True,
                "min": 0,
                "max": 10000,
                "pattern": None,
                "mode": "text",
                "friendly_name": config["name"],
            }

            hass.states.async_set(entity_id, str(restored_val), attrs)
            _LOGGER.info(f"Helfer {entity_id} nach Neustart geladen mit Wert: {restored_val}")

    # Falls HA bereits läuft (z.B. Reload), sofort laden, sonst auf Start-Event warten
    if hass.state == CoreState.running:
        restore_helper_states()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, restore_helper_states)

    # 2. Live-Abfangen aller Service-Aufrufe vom Frontend
    async def handle_call_service_event(event):
        data = event.data
        domain = data.get("domain")
        service = data.get("service")
        service_data = data.get("service_data", {})

        if domain == "input_text" and service == "set_value":
            entity_id = service_data.get("entity_id")
            value = service_data.get("value")

            if isinstance(entity_id, list) and entity_id:
                entity_id = entity_id[0]

            if entity_id and value is not None:
                current_state = hass.states.get(entity_id)
                attrs = current_state.attributes.copy() if current_state else {
                    "editable": True,
                    "min": 0,
                    "max": 10000,
                    "pattern": None,
                    "mode": "text",
                }
                # Sofort im RAM aktualisieren
                hass.states.async_set(entity_id, str(value), attrs)
                
                # Parallel an den RestoreEntity-Sensor spiegeln
                clean_id = entity_id.replace("input_text.", "")
                hass.bus.async_fire("haushaltshilfe_save_data", {
                    "key": clean_id,
                    "value": str(value),
                })

    hass.bus.async_listen("call_service", handle_call_service_event)

    # 3. Frontend-Dateien synchronisieren
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

    # 4. Sensoren laden
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 5. Sidebar-Panel registrieren
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
