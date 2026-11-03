"""Text platform for Haushaltshilfe Pro."""
import json
import logging
from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, TEXT_ENTITIES, CONF_VISIBLE_TABS

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Haushaltshilfe text entities from config entry."""
    store = hass.data[DOMAIN].get("store")
    store_data = hass.data[DOMAIN].get("data", {})
    text_entities_map = hass.data[DOMAIN].setdefault("text_entities", {})

    entities = []
    for key, cfg in TEXT_ENTITIES.items():
        ent = HaushaltshilfeTextEntity(
            hass=hass,
            entry=entry,
            store=store,
            store_data=store_data,
            key=key,
            friendly_name=cfg["name"],
            initial=cfg["initial"],
            icon=cfg.get("icon", "mdi:text"),
        )
        entities.append(ent)
        text_entities_map[key] = ent

    async_add_entities(entities)


class HaushaltshilfeTextEntity(TextEntity):
    """Representation of a persistent Haushaltshilfe text entity."""

    _attr_has_entity_name = False
    _attr_native_min = 0
    _attr_native_max = 255

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        store,
        store_data: dict,
        key: str,
        friendly_name: str,
        initial: str,
        icon: str,
    ) -> None:
        """Initialize the text entity."""
        self.hass = hass
        self._entry = entry
        self._store = store
        self._store_data = store_data
        self._key = key
        self._initial = initial

        self.entity_id = f"text.{key}"
        self._attr_name = friendly_name
        self._attr_unique_id = f"haushaltshilfe_text_{key}"
        self._attr_icon = icon

    @property
    def native_value(self) -> str:
        """Return the value reported by the text."""
        if self._key == "helper_visible_tabs":
            opt_tabs = self._entry.options.get(
                CONF_VISIBLE_TABS, self._entry.data.get(CONF_VISIBLE_TABS)
            )
            if opt_tabs is not None and self._key not in self._store_data:
                val = json.dumps(opt_tabs) if isinstance(opt_tabs, list) else str(opt_tabs)
                return val[:255]

        val = str(self._store_data.get(self._key, self._initial))
        return val[:255]

    async def async_set_value(self, value: str) -> None:
        """Change the text value and save to persistent store."""
        val_str = str(value)[:255]
        self._store_data[self._key] = val_str
        self.async_write_ha_state()

        if self._store is not None:
            await self._store.async_save(self._store_data)

        if self._key == "helper_visible_tabs":
            try:
                parsed = json.loads(val_str)
                if isinstance(parsed, list):
                    new_options = dict(self._entry.options)
                    if new_options.get(CONF_VISIBLE_TABS) != parsed:
                        new_options[CONF_VISIBLE_TABS] = parsed
                        self.hass.config_entries.async_update_entry(
                            self._entry, options=new_options
                        )
            except Exception as err:
                _LOGGER.debug("Could not sync visible_tabs to options: %s", err)
