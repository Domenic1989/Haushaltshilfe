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
    EVENT_SET_ROOMS,
    EVENT_SET_STORES,
    EVENT_SET_USERS,
    EVENT_SET_ADMIN_PW,
    EVENT_SET_FOOD_PLAN,
)

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up all Haushaltshilfe persistent sensors."""
    sensors = [
        # Bisherige Listen & Favoriten
        HaushaltshilfeDataSensor(hass, "Shopping DB", "shopping_db", "shopping_json", EVENT_SET_SHOPPING, [], ["input_text.helper_shopping"]),
        HaushaltshilfeDataSensor(hass, "Tasks Storage", "tasks_storage", "tasks_json", EVENT_SET_TASKS, [], ["input_text.helper_tasks"]),
        HaushaltshilfeDataSensor(hass, "Shop Favs Storage", "shop_favs_storage", "shop_favs_json", EVENT_SET_SHOP_FAVS, {"cats": ["Alle"], "favs": []}, ["input_text.helper_shop_favs"]),
        HaushaltshilfeDataSensor(hass, "Food Favs Storage", "food_favs_storage", "food_favs_json", EVENT_SET_FOOD_FAVS, {"cats": ["Alle"], "favs": []}, ["input_text.helper_food_favs"]),
        HaushaltshilfeDataSensor(hass, "Todo Favs Storage", "todo_favs_storage", "todo_favs_json", EVENT_SET_TODO_FAVS, {"cats": ["Alle"], "favs": []}, ["input_text.helper_todo_favs"]),
        HaushaltshilfeDataSensor(hass, "Finance DB", "finance_db", "data", EVENT_SET_FINANCE, {"months": []}, []),
        
        # Räume, Läden, Benutzer, Passwort & Essensplan
        HaushaltshilfeDataSensor(hass, "Room List Storage", "room_list_storage", "rooms_json", EVENT_SET_ROOMS, ["Küche", "Bad", "Wohnzimmer"], ["input_text.helper_room_list"]),
        HaushaltshilfeDataSensor(hass, "Shop Stores Storage", "shop_stores_storage", "stores_json", EVENT_SET_STORES, ["Aldi", "Rewe", "Lidl"], ["input_text.helper_shop_stores"]),
        HaushaltshilfeDataSensor(hass, "User List Storage", "user_list_storage", "users_json", EVENT_SET_USERS, ["Admin:admin", "Tablet:tablet"], ["input_text.helper_user_list"]),
        HaushaltshilfeDataSensor(hass, "Admin PW Storage", "admin_pw_storage", "admin_pw", EVENT_SET_ADMIN_PW, "1234", ["input_text.helper_admin_pw"]),
        HaushaltshilfeDataSensor(hass, "Food Plan Storage", "food_plan_storage", "food_plan_json", EVENT_SET_FOOD_PLAN, ["", "", "", "", "", "", ""], [
            "input_text.essen_montag", "input_text.essen_dienstag", "input_text.essen_mittwoch",
            "input_text.essen_donnerstag", "input_text.essen_freitag", "input_text.essen_samstag", "input_text.essen_sonntag"
        ]),
    ]
    
    async_add_entities(sensors)

    # Universelle Action zum Speichern
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

    def __init__(self, hass: HomeAssistant, name: str, key: str, attr_name: str, event_type: str, default_val, alt_entities=None):
        self._hass = hass
        self._attr_name_str = name
        self._key = key
        self._attr_key = attr_name
        self._event_type = event_type
        self._default_val = default_val
        self._data = default_val
        self._alt_entities = alt_entities or []
        self._attr_unique_id = f"haushalt_{key}"
        self._attr_name = f"Haushalt {name}"
        self._attr_icon = "mdi:database"

    @property
    def native_value(self):
        return "OK"

    @property
    def extra_state_attributes(self):
        # Stellt die Daten unter dem Haupt-Attribut ODER als "value" bereit, damit jedes Skript sie lesen kann
        return {
            self._attr_key: self._data,
            "value": self._data,
            "json_data": self._data
        }

    async def async_added_to_hass(self):
        """Restore previous state on startup and register event listener."""
        await super().async_added_to_hass()
        
        last_state = await self.async_get_last_state()
        if last_state and self._attr_key in last_state.attributes:
            self._data = last_state.attributes[self._attr_key]
            _LOGGER.info(f"Restored state for {self._attr_name}")
        elif last_state and "value" in last_state.attributes:
            self._data = last_state.attributes["value"]

        @callback
        def handle_event(event):
            data = event.data
            
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
            elif "value" in data:
                self._data = data["value"]
            else:
                self._data = data

            self.async_write_ha_state()

        # 1. Auf primäres Event lauschen (z.B. set_rooms_data)
        self.async_on_remove(
            self._hass.bus.async_listen(self._event_type, handle_event)
        )

        # 2. Zusätzlich auf State-Changes der alten input_text Entitäten lauschen!
        # Sobald das Frontend in ein input_text schreibt, speichert dieser Sensor es persistent ab.
        @callback
        def handle_state_change(event):
            new_state = event.data.get("new_state")
            if new_state and new_state.state not in (None, "unknown", "unavailable"):
                # Spezialfall Essensplan: Zusammenbauen der einzelnen Tage
                if self._key == "food_plan_storage":
                    if not isinstance(self._data, list) or len(self._data) != 7:
                        self._data = ["", "", "", "", "", "", ""]
                    
                    entity_id = event.data.get("entity_id", "")
                    days = [
                        "input_text.essen_montag", "input_text.essen_dienstag", "input_text.essen_mittwoch",
                        "input_text.essen_donnerstag", "input_text.essen_freitag", "input_text.essen_samstag", "input_text.essen_sonntag"
                    ]
                    if entity_id in days:
                        idx = days.index(entity_id)
                        self._data[idx] = new_state.state
                else:
                    self._data = new_state.state

                self.async_write_ha_state()

        for alt_entity in self._alt_entities:
            self.async_on_remove(
                self._hass.bus.async_listen("state_changed", lambda evt, ent=alt_entity: handle_state_change(evt) if evt.data.get("entity_id") == ent else None)
            )
