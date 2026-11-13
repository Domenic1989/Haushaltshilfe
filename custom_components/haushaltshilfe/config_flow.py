"""Config flow and Options flow for Haushaltshilfe Pro integration."""
import voluptuous as vol
import homeassistant.helpers.config_validation as cv
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import (
    DOMAIN,
    CONF_ADMIN_PW,
    CONF_MASTER_PW,
    CONF_VISIBLE_TABS,
    CONF_FEATURES,
    CONF_CALENDARS,
    CONF_CALENDAR_WRITE,
    DEFAULT_FEATURES,
    CONF_TRASH_YELLOW_DAYS,
    CONF_TRASH_YELLOW_DATE,
    CONF_TRASH_PAPER_DAYS,
    CONF_TRASH_PAPER_DATE,
    CONF_TRASH_REST_DAYS,
    CONF_TRASH_REST_DATE,
    CONF_TRASH_BIO_DAYS,
    CONF_TRASH_BIO_DATE,
    CONF_TRASH_XMAS_DAYS,
    CONF_TRASH_XMAS_DATE,
)

# Verfügbare Tabs für das Formular
AVAILABLE_TABS = {
    "shop": "🛒 Einkaufsliste",
    "todo": "📋 Haushalt / Aufgaben",
    "food": "🍽️ Essensplan",
    "trash": "🗑️ Müllkalender",
    "finance": "💶 Finanzen",
}

# Zusatzfunktionen für das Formular
AVAILABLE_FEATURES = {
    "stock": "📦 Vorrat",
    "maint": "🔧 Wartung",
    "calendar": "📅 Kalender (Startseite)",
}

# Passwort-Selector für maskierte Eingabefelder (Punkte)
PASSWORD_SELECTOR = TextSelector(
    TextSelectorConfig(type=TextSelectorType.PASSWORD)
)

# Entity-Selector für Kalender (mehrere zum Anzeigen, einer zum Eintragen)
CALENDAR_LIST_SELECTOR = EntitySelector(
    EntitySelectorConfig(domain="calendar", multiple=True)
)
CALENDAR_ONE_SELECTOR = EntitySelector(
    EntitySelectorConfig(domain="calendar")
)

# Entity-Selector für Müll-Sensoren
SENSOR_SELECTOR = EntitySelector(
    EntitySelectorConfig(domain="sensor")
)

TRASH_DEFAULTS = {
    CONF_TRASH_YELLOW_DAYS: "sensor.gelber_sack",
    CONF_TRASH_YELLOW_DATE: "sensor.gelber_sack_datum",
    CONF_TRASH_PAPER_DAYS: "sensor.papier",
    CONF_TRASH_PAPER_DATE: "sensor.papier_datum",
    CONF_TRASH_REST_DAYS: "sensor.restmull",
    CONF_TRASH_REST_DATE: "sensor.restmull_datum",
    CONF_TRASH_BIO_DAYS: "sensor.biomuell",
    CONF_TRASH_BIO_DATE: "sensor.biomuell_datum",
    CONF_TRASH_XMAS_DAYS: "sensor.weihnachtsbaum",
    CONF_TRASH_XMAS_DATE: "sensor.weihnachtsbaum_datum",
}


class HaushaltshilfeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Haushaltshilfe Pro."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        errors = {}

        if user_input is not None:
            if not user_input.get(CONF_ADMIN_PW):
                errors[CONF_ADMIN_PW] = "invalid_auth"
            if not user_input.get(CONF_MASTER_PW):
                errors[CONF_MASTER_PW] = "invalid_auth"

            if not errors:
                return self.async_create_entry(title="Haushaltshilfe Pro", data=user_input)

        data_schema = vol.Schema({
            vol.Required(CONF_ADMIN_PW): PASSWORD_SELECTOR,
            vol.Required(CONF_MASTER_PW): PASSWORD_SELECTOR,
            vol.Optional(
                CONF_VISIBLE_TABS,
                default=list(AVAILABLE_TABS.keys()),
            ): cv.multi_select(AVAILABLE_TABS),
            vol.Optional(
                CONF_FEATURES,
                default=DEFAULT_FEATURES,
            ): cv.multi_select(AVAILABLE_FEATURES),
            vol.Optional(CONF_TRASH_YELLOW_DAYS, default=TRASH_DEFAULTS[CONF_TRASH_YELLOW_DAYS]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_YELLOW_DATE, default=TRASH_DEFAULTS[CONF_TRASH_YELLOW_DATE]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_PAPER_DAYS, default=TRASH_DEFAULTS[CONF_TRASH_PAPER_DAYS]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_PAPER_DATE, default=TRASH_DEFAULTS[CONF_TRASH_PAPER_DATE]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_REST_DAYS, default=TRASH_DEFAULTS[CONF_TRASH_REST_DAYS]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_REST_DATE, default=TRASH_DEFAULTS[CONF_TRASH_REST_DATE]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_BIO_DAYS, default=TRASH_DEFAULTS[CONF_TRASH_BIO_DAYS]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_BIO_DATE, default=TRASH_DEFAULTS[CONF_TRASH_BIO_DATE]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_XMAS_DAYS, default=TRASH_DEFAULTS[CONF_TRASH_XMAS_DAYS]): SENSOR_SELECTOR,
            vol.Optional(CONF_TRASH_XMAS_DATE, default=TRASH_DEFAULTS[CONF_TRASH_XMAS_DATE]): SENSOR_SELECTOR,
        })

        return self.async_show_form(
            step_id="user", data_schema=data_schema, errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return HaushaltshilfeOptionsFlowHandler()


class HaushaltshilfeOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for Haushaltshilfe Pro."""

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        entry = self.config_entry

        if user_input is not None:
            updated_options = {**entry.data, **entry.options}

            master_pw = user_input.get(CONF_MASTER_PW)
            if master_pw and str(master_pw).strip():
                updated_options[CONF_MASTER_PW] = str(master_pw).strip()

            admin_pw = user_input.get(CONF_ADMIN_PW)
            if admin_pw and str(admin_pw).strip():
                updated_options[CONF_ADMIN_PW] = str(admin_pw).strip()

            if CONF_VISIBLE_TABS in user_input:
                updated_options[CONF_VISIBLE_TABS] = user_input[CONF_VISIBLE_TABS]

            if CONF_FEATURES in user_input:
                updated_options[CONF_FEATURES] = list(user_input[CONF_FEATURES])

            cals = user_input.get(CONF_CALENDARS) or []
            if isinstance(cals, str):
                cals = [cals]
            updated_options[CONF_CALENDARS] = [str(c) for c in cals if c]
            updated_options[CONF_CALENDAR_WRITE] = user_input.get(CONF_CALENDAR_WRITE) or ""

            for trash_key in TRASH_DEFAULTS:
                updated_options[trash_key] = user_input.get(trash_key, "")

            return self.async_create_entry(title="", data=updated_options)

        current_tabs = entry.options.get(
            CONF_VISIBLE_TABS,
            entry.data.get(CONF_VISIBLE_TABS, list(AVAILABLE_TABS.keys())),
        )

        current_features = entry.options.get(
            CONF_FEATURES,
            entry.data.get(CONF_FEATURES, DEFAULT_FEATURES),
        )
        current_cals = entry.options.get(CONF_CALENDARS, entry.data.get(CONF_CALENDARS, [])) or []
        current_write = entry.options.get(CONF_CALENDAR_WRITE, entry.data.get(CONF_CALENDAR_WRITE, "")) or ""

        def _get_trash_opt(key):
            return entry.options.get(key, entry.data.get(key, TRASH_DEFAULTS[key]))

        options_schema = vol.Schema({
            vol.Optional(CONF_ADMIN_PW): PASSWORD_SELECTOR,
            vol.Optional(CONF_MASTER_PW): PASSWORD_SELECTOR,
            vol.Optional(
                CONF_VISIBLE_TABS,
                default=current_tabs,
            ): cv.multi_select(AVAILABLE_TABS),
            vol.Optional(
                CONF_FEATURES,
                default=current_features,
            ): cv.multi_select(AVAILABLE_FEATURES),
            vol.Optional(
                CONF_CALENDARS,
                description={"suggested_value": current_cals},
            ): CALENDAR_LIST_SELECTOR,
            vol.Optional(
                CONF_CALENDAR_WRITE,
                description={"suggested_value": current_write or None},
            ): CALENDAR_ONE_SELECTOR,
            vol.Optional(
                CONF_TRASH_YELLOW_DAYS,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_YELLOW_DAYS)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_YELLOW_DATE,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_YELLOW_DATE)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_PAPER_DAYS,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_PAPER_DAYS)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_PAPER_DATE,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_PAPER_DATE)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_REST_DAYS,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_REST_DAYS)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_REST_DATE,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_REST_DATE)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_BIO_DAYS,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_BIO_DAYS)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_BIO_DATE,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_BIO_DATE)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_XMAS_DAYS,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_XMAS_DAYS)},
            ): SENSOR_SELECTOR,
            vol.Optional(
                CONF_TRASH_XMAS_DATE,
                description={"suggested_value": _get_trash_opt(CONF_TRASH_XMAS_DATE)},
            ): SENSOR_SELECTOR,
        })

        return self.async_show_form(
            step_id="init",
            data_schema=options_schema,
        )
