import logging
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.event import async_track_custom_popup_action
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass, config_entry, async_add_entities):
    """Set up the Haushaltshilfe sensors."""
    entities = [
        HaushaltshilfeStorageSensor(hass, "haushalt_todo_storage", "Haushalt Todo Storage", "data"),
        HaushaltshilfeStorageSensor(hass, "haushalt_shopping_data", "Haushalt Shopping Data", "shopping_json"),
        HaushaltshilfeStorageSensor(hass, "haushalt_shop_favs_storage", "Haushalt Shop Favs Storage", "data"),
        HaushaltshilfeStorageSensor(hass, "haushalt_todo_favs_storage", "Haushalt Todo Favs Storage", "data"),
        HaushaltshilfeStorageSensor(hass, "haushalt_food_favs_storage", "Haushalt Food Favs Storage", "data"),
    ]
    async_add_entities(entities)

class HaushaltshilfeStorageSensor(SensorEntity):
    """Representation of a Haushaltshilfe Storage Sensor."""

    def __init__(self, hass, entity_id_name, name, attr_key):
        self.hass = hass
        self._attr_name = name
        self.entity_id = f"sensor.{entity_id_name}"
        self._attr_native_value = "OK"
        self._attr_icon = "mdi:database"
        self._attr_extra_state_attributes = {attr_key: "[]"}

    @property
    def should_poll(self):
        return False
