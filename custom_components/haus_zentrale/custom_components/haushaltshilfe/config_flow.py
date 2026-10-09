"""Config flow for Haus-Zentrale Pro integration."""
import voluptuous as vol
from homeassistant import config_entries

from .const import DOMAIN, CONF_ADMIN_PW

class HausZentraleConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Haus-Zentrale."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Haus-Zentrale Pro", data=user_input)

        data_schema = vol.Schema({
            vol.Optional(CONF_ADMIN_PW, default="admin"): str,
        })

        return self.async_show_form(
            step_id="user", data_schema=data_schema
        )
