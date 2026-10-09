"""Sensor platform for Haushaltshilfe Pro."""
import logging
from homeassistant.components.sensor import SensorEntity
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
    """Set up the Haushaltshilfe sensors."""
    sensors = [
        HaushaltshilfeDataSensor(hass, "Shopping DB", "shopping_db", "shopping_json", EVENT_SET_SHOPPING, []),
        HaushaltshilfeDataSensor(hass, "Tasks Storage", "tasks_storage", "tasks_json", EVENT_SET_TASKS, []),
        HaushaltshilfeDataSensor(hass, "Shop Favs Storage", "shop_favs_storage", "shop_favs_json", EVENT_SET_SHOP_FAVS, {"cats": ["Alle"], "favs": []}),
        HaushaltshilfeDataSensor(hass, "Food Favs Storage", "food_favs_storage", "food_favs_json", EVENT_SET_FOOD_FAVS, {"cats": ["Alle"], "favs": []}),
        HaushaltshilfeDataSensor(hass, "Todo Favs Storage", "todo_favs_storage", "todo_favs_json", EVENT_SET_TODO_FAVS, {"cats": ["Alle"], "favs": []}),
        HaushaltshilfeDataSensor(hass, "Finance DB", "finance_db", "data", EVENT_SET_FINANCE, []),
    ]
    
    async_add_entities(sensors)


class HaushaltshilfeDataSensor(SensorEntity):
    """Representation of a Haushaltshilfe Storage Sensor."""

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
        """Register event listener on startup."""
        @callback
        def handle_event(event):
            data = event.data
            
            # Überprüfe flexibel alle gängigen Event-Payload-Schlüssel
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

            self.async_write_ha_state()

        self.async_on_remove(
            self._hass.bus.async_listen(self._event_type, handle_event)
        )
