"""Config flow and Options flow for Haushaltshilfe Pro integration."""
import voluptuous as vol
import homeassistant.helpers.config_validation as cv
from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN, CONF_ADMIN_PW, CONF_MASTER_PW, CONF_VISIBLE_TABS

# Verfügbare Tabs für das Formular
AVAILABLE_TABS = {
    "shop": "🛒 Einkaufsliste",
    "todo": "📋 Haushalt / Aufgaben",
    "food": "🍽️ Essensplan",
    "trash": "🗑️ Müllkalender",
    "finance": "💶 Finanzen",
}


class HaushaltshilfeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Haushaltshilfe Pro."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Haushaltshilfe Pro", data=user_input)

        data_schema = vol.Schema({
            vol.Optional(CONF_ADMIN_PW, default="1234"): str,
            vol.Optional(CONF_MASTER_PW, default="homeassistant"): str,
            vol.Optional(
                CONF_VISIBLE_TABS, 
                default=list(AVAILABLE_TABS.keys())
            ): cv.multi_select(AVAILABLE_TABS),
        })

        return self.async_show_form(
            step_id="user", data_schema=data_schema
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
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        # Aktuelle Werte aus den Optionen oder Config-Data auslesen
        current_admin_pw = self.config_entry.options.get(
            CONF_ADMIN_PW, 
            self.config_entry.data.get(CONF_ADMIN_PW, "1234")
        )
        current_master_pw = self.config_entry.options.get(
            CONF_MASTER_PW, 
            self.config_entry.data.get(CONF_MASTER_PW, "homeassistant")
        )
        current_tabs = self.config_entry.options.get(
            CONF_VISIBLE_TABS, 
            self.config_entry.data.get(CONF_VISIBLE_TABS, list(AVAILABLE_TABS.keys()))
        )

        options_schema = vol.Schema({
            vol.Optional(CONF_ADMIN_PW, default=current_admin_pw): str,
            vol.Optional(CONF_MASTER_PW, default=current_master_pw): str,
            vol.Optional(
                CONF_VISIBLE_TABS, 
                default=current_tabs
            ): cv.multi_select(AVAILABLE_TABS),
        })

        return self.async_show_form(
            step_id="init",
            data_schema=options_schema
        )
