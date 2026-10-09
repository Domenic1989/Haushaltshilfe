"""Sensor platform for Haushaltshilfe Pro with persistent storage."""
import logging
import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.config_entries import ConfigEntry

from .const import (
    DOMAIN,
    EVENT_SET_SHOPPING,
    EVENT_SET_TASKS,
    EVENT_SET_SHOP_FAVS,
    EVENT_SET_FOOD_FAVS,
    EVENT_SET_TODO_FAVS,
    EVENT_SET_FINANCE,
)

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Haushaltshilfe sensors and register save action."""
    sensors = [
        HaushaltshilfeDataSensor(hass, "Shopping DB", "shopping_db", "shopping_json", EVENT_SET_SHOPPING, []),
        HaushaltshilfeDataSensor(hass, "Tasks Storage", "tasks_storage", "tasks_json", EVENT_SET_TASKS, []),
        HaushaltshilfeDataSensor(hass, "Shop Favs Storage", "shop_favs_storage", "shop_favs_json", EVENT_SET_SHOP_FAVS, {"cats": ["Alle"], "favs": []}),
        HaushaltshilfeDataSensor(hass, "Food Favs Storage", "food_favs_storage", "food_favs_json", EVENT_SET_FOOD_FAVS, {"cats": ["Alle"], "favs": []}),
        HaushaltshilfeDataSensor(hass, "Todo Favs Storage", "todo_favs_storage", "todo_favs_json", EVENT_SET_TODO_FAVS, {"cats": ["Alle"], "favs": []}),
        HaushaltshilfeDataSensor(hass, "Finance DB", "finance_db", "data", EVENT_SET_FINANCE, {"months": []}),
    ]
    
    async_add_entities(sensors)

    # Globale Action/Service anbieten, um Daten per Action ODER Event zu speichern
    async def handle_save_data(call):
        target_event = call.data.get("event")
        payload = call.data.get("data")
        if target_event and payload is not None:
            hass.bus.async_fire(target_event, {"data": payload})

    if not hass.services.has_service(DOMAIN, "save_data"):
        hass.services.async_register(
            DOMAIN,
            "save_data",
            handle_save_data,
            schema=vol.Schema({
                vol.Required("event"): cv.string,
                vol.Required("data"): vol.Coerce(object),
            }),
        )


class HaushaltshilfeDataSensor(RestoreEntity, SensorEntity):
    """Representation of a persistent Haushaltshilfe Storage Sensor."""

    def __init__(self, hass: HomeAssistant, name: str, key: str, attr_name: str, event_type: str, default_val):
        self._hass = hass
        self._attr_name_str = name
        self._key = key
        self._attr_key = attr_name
        self._event_type = event_type
        self._data = default_val
        self._attr_unique_id = f"haushalt_{key}"
        self._attr_name = f"Haushalt {name}"
        self._attr_icon = "mdi:database"

    @property
    def native_value(self):
        return "OK"

    @property
    def extra_state_attributes(self):
        return {self._attr_key: self._data}

    async def async_added_to_hass(self):
        """Restore previous state on startup and register event listener."""
        await super().async_added_to_hass()
        
        # Daten aus der HA-Datenbank wiederherstellen
        last_state = await self.async_get_last_state()
        if last_state and self._attr_key in last_state.attributes:
            self._data = last_state.attributes[self._attr_key]
            _LOGGER.info(f"Restored state for {self._attr_name}")

        @callback
        def handle_event(event):
            data = event.data
            
            # Alle gängigen Datenstrukturen abfangen
            if "data" in data:
                self._data = data["data"]
            elif "json_data" in data:
                self._data = data["json_data"]
            elif "tasks" in data:
                self._data = data["tasks"]
            elif "favs" in data:
                self._data = data["favs"]
            elif self._attr_key in data:
                self._data = data[self._attr_key]
            else:
                # Falls das Event direkt das Daten-Objekt/Array sendet
                self._data = data

            self.async_write_ha_state()

        self.async_on_remove(
            self._hass.bus.async_listen(self._event_type, handle_event)
        )
