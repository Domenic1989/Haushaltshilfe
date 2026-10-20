"""Config flow and Options flow for Haushaltshilfe Pro integration."""
import voluptuous as vol
import homeassistant.helpers.config_validation as cv
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import DOMAIN, CONF_ADMIN_PW, CONF_MASTER_PW, CONF_VISIBLE_TABS

# Verfügbare Tabs für das Formular
AVAILABLE_TABS = {
    "shop": "🛒 Einkaufsliste",
    "todo": "📋 Haushalt / Aufgaben",
    "food": "🍽️ Essensplan",
    "trash": "🗑️ Müllkalender",
    "finance": "💶 Finanzen",
}

# Passwort-Selector für maskierte Eingabefelder (Punkte)
PASSWORD_SELECTOR = TextSelector(
    TextSelectorConfig(type=TextSelectorType.PASSWORD)
)


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
                default=list(AVAILABLE_TABS.keys())
            ): cv.multi_select(AVAILABLE_TABS),
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
        # self.config_entry wird von HA automatisch in OptionsFlow bereitgestellt
        entry = self.config_entry

        if user_input is not None:
            # Starte immer mit einer Kombination aus Data und den bisherigen Options als Basis
            updated_options = {**entry.data, **entry.options}

            # Master-Passwort: Nur überschreiben, wenn tatsächlich etwas eingegeben wurde
            master_pw = user_input.get(CONF_MASTER_PW)
            if master_pw and str(master_pw).strip():
                updated_options[CONF_MASTER_PW] = str(master_pw).strip()

            # Admin-Passwort: Nur überschreiben, wenn tatsächlich etwas eingegeben wurde
            admin_pw = user_input.get(CONF_ADMIN_PW)
            if admin_pw and str(admin_pw).strip():
                updated_options[CONF_ADMIN_PW] = str(admin_pw).strip()

            # Sichtbare Tabs direkt aus dem Multi-Select übernehmen
            if CONF_VISIBLE_TABS in user_input:
                updated_options[CONF_VISIBLE_TABS] = user_input[CONF_VISIBLE_TABS]

            return self.async_create_entry(title="", data=updated_options)

        # Aktuell gewählte Tabs auslesen
        current_tabs = entry.options.get(
            CONF_VISIBLE_TABS, 
            entry.data.get(CONF_VISIBLE_TABS, list(AVAILABLE_TABS.keys()))
        )

        options_schema = vol.Schema({
            vol.Optional(CONF_ADMIN_PW): PASSWORD_SELECTOR,
            vol.Optional(CONF_MASTER_PW): PASSWORD_SELECTOR,
            vol.Optional(
                CONF_VISIBLE_TABS, 
                default=current_tabs
            ): cv.multi_select(AVAILABLE_TABS),
        })

        return self.async_show_form(
            step_id="init",
            data_schema=options_schema
        )
