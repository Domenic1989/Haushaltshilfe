import logging
from homeassistant.components.input_text import InputText
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass, config_entry, async_add_entities):
    """Set up the Haushaltshilfe Input Text entities."""
    helpers = [
        ("haushalt_users", "Haushalt Benutzer", "[]"),
        ("haushalt_stores", "Haushalt Geschäfte", "[]"),
        ("haushalt_rooms", "Haushalt Räume", "[]"),
        ("haushalt_admin_pw", "Haushalt Admin PW", "1234"),
        ("haushalt_food_mo", "Essen Montag", ""),
        ("haushalt_food_di", "Essen Dienstag", ""),
        ("haushalt_food_mi", "Essen Mittwoch", ""),
        ("haushalt_food_do", "Essen Donnerstag", ""),
        ("haushalt_food_fr", "Essen Freitag", ""),
        ("haushalt_food_sa", "Essen Samstag", ""),
        ("haushalt_food_so", "Essen Sonntag", ""),
    ]

    entities = []
    for entity_id_name, name, initial_val in helpers:
        entities.append(HaushaltshilfeInputText(entity_id_name, name, initial_val))

    async_add_entities(entities, True)

class HaushaltshilfeInputText(InputText):
    """Representation of a Haushaltshilfe Input Text Helper."""

    def __init__(self, entity_id_name, name, initial_value):
        self.entity_id = f"input_text.{entity_id_name}"
        self._attr_name = name
        self._attr_native_value = initial_value
        self._attr_icon = "mdi:card-text-outline"
