"""Input Text platform for Haushaltshilfe Pro."""
import logging
from homeassistant.components.input_text import InputText
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, HELPER_ENTITIES

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Haushaltshilfe input_text entities."""
    entities = []
    
    for helper_id, config in HELPER_ENTITIES.items():
        entity_config = {
            "id": helper_id,
            "name": config["name"],
            "initial": config["initial"],
            "min": 0,
            "max": 10000,
            "mode": "text",
        }
        entities.append(InputText(entity_config))

    async_add_entities(entities)
    _LOGGER.info(f"Haushaltshilfe: {len(entities)} InputText-Entitäten geladen.")
