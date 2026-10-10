"""Sensor platform for Haushaltshilfe Pro using File Storage backup."""
import logging
import json
from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.config_entries import ConfigEntry

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up persistent storage sensors reading from permanent Store."""
    store_data = hass.data[DOMAIN].get("data", {})

    sensors = [
        # 1. Tasks Storage
        HaushaltshilfeStoreSensor(
            hass=hass,
            entity_id_name="haushalt_tasks_storage",
            friendly_name="Haushalt Tasks Storage",
            unique_id="haushalt_tasks_storage_v2",
            event_type="set_tasks_data",
            storage_key="tasks_data",
            attr_key="tasks_json",
            default_val="[]",
            icon="mdi:clipboard-check-outline",
            store_data=store_data,
        ),
        # 2. Shop Favoriten
        HaushaltshilfeStoreSensor(
            hass=hass,
            entity_id_name="haushalt_shop_favs_storage",
            friendly_name="Haushalt Shop Favs Storage",
            unique_id="haushalt_shop_storage_v2",
            event_type="set_shop_favs",
            storage_key="shop_favs",
            attr_key="shop_favs_json",
            default_val='{"cats":["Alle","Gemüse","Fleisch","Vorrat","Haus"],"favs":[]}',
            icon="mdi:cart-outline",
            store_data=store_data,
        ),
        # 3. Todo Favoriten (Haushalt Kategorien & Buttons)
        HaushaltshilfeStoreSensor(
            hass=hass,
            entity_id_name="haushalt_todo_favs_storage",
            friendly_name="Haushalt Todo Favs Storage",
            unique_id="haushalt_todo_favs_storage_v2",
            event_type="set_todo_favs",
            storage_key="todo_favs",
            attr_key="todo_favs_json",
            default_val='{"cats":["Alle","Haus","Bad","Wohnen","Küche","Garten"],"favs":[]}',
            icon="mdi:check-all",
            store_data=store_data,
        ),
        # 4. Food Favoriten
        HaushaltshilfeStoreSensor(
            hass=hass,
            entity_id_name="haushalt_food_favs_storage",
            friendly_name="Haushalt Food Favs Storage",
            unique_id="haushalt_food_storage_v2",
            event_type="set_food_favs",
            storage_key="food_favs",
            attr_key="food_favs_json",
            default_val='{"cats":["Alle","Schnell","Italienisch","Leicht"],"favs":[]}',
            icon="mdi:silverware-fork-knife",
            store_data=store_data,
        ),
        # 5. Finance DB
        HaushaltshilfeStoreSensor(
            hass=hass,
            entity_id_name="haushalt_finance_db",
            friendly_name="Haushalt Finance DB",
            unique_id="haushalt_finance_db_sensor",
            event_type="set_finance_data",
            storage_key="finance_db",
            attr_key="data",
            default_val='{"months":[]}',
            icon="mdi:finance",
            store_data=store_data,
            is_finance=True,
        ),
        # 6. Shopping DB
        HaushaltshilfeStoreSensor(
            hass=hass,
            entity_id_name="haushalt_shopping_db",
            friendly_name="Haushalt Shopping DB",
            unique_id="haushalt_shopping_db_sensor",
            event_type="set_shopping_data",
            storage_key="shopping_db",
            attr_key="shopping_json",
            default_val="[]",
            icon="mdi:cart-basket",
            store_data=store_data,
        ),
    ]
    
    async_add_entities(sensors)


class HaushaltshilfeStoreSensor(SensorEntity):
    """Sensor reading directly from the permanent JSON Store."""

    _attr_has_entity_name = False

    def __init__(
        self, 
        hass: HomeAssistant, 
        entity_id_name: str, 
        friendly_name: str, 
        unique_id: str, 
        event_type: str, 
        storage_key: str,
        attr_key: str, 
        default_val: str,
        icon: str,
        store_data: dict,
        is_finance: bool = False
    ):
        self.hass = hass
        self._attr_key = attr_key
        self._event_type = event_type
        self._storage_key = storage_key
        self._store_data = store_data
        self._default_val = default_val
        self._is_finance = is_finance
        
        # Erzwingt die exakte Entity ID für Home Assistant
        self.entity_id = f"sensor.{entity_id_name}"
        self._attr_name = friendly_name
        self._attr_unique_id = unique_id
        self._attr_icon = icon

    @property
    def native_value(self):
        return "OK"

    @property
    def extra_state_attributes(self):
        saved = self._store_data.get(self._storage_key, self._default_val)
        
        if self._is_finance:
            parsed = json.loads(saved) if isinstance(saved, str) else saved
            str_val = json.dumps(saved) if isinstance(saved, (dict, list)) else str(saved)
            return {
                "data": parsed,
                "value": str_val
            }

        str_val = json.dumps(saved) if isinstance(saved, (dict, list)) else str(saved)
        return {
            self._attr_key: str_val,
            "value": str_val,
            "data": str_val
        }

    async def async_added_to_hass(self):
        """Register state and listen to incoming update events."""
        self.async_write_ha_state()

        @callback
        def handle_event(event):
            self.async_write_ha_state()

        self.async_on_remove(
            self.hass.bus.async_listen(self._event_type, handle_event)
        )
        if self._is_finance:
            self.async_on_remove(
                self.hass.bus.async_listen("set_finance_db", handle_event)
            )
