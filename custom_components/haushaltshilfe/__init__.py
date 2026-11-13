"""The Haushaltshilfe Pro integration with persistent JSON file storage."""
import asyncio
import logging
import os
import json
from datetime import date, datetime, timedelta
from homeassistant.core import HomeAssistant, callback
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    CONF_ADMIN_PW,
    CONF_MASTER_PW,
    CONF_VISIBLE_TABS,
    CONF_FEATURES,
    CONF_CALENDARS,
    CONF_CALENDAR_WRITE,
    FEATURE_KEYS,
    DEFAULT_FEATURES,
    TEXT_ENTITIES,
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
from .security import (
    hash_password,
    is_hashed,
    parse_users,
    public_users,
    serialize_users,
    verify_password,
)

_LOGGER = logging.getLogger(__name__)

FAILED_LOGIN_DELAY = 1.0

# Kalender (Startseite): wie viele Tage auf einmal gelesen werden dürfen, Länge von Texten
CALENDAR_MAX_DAYS = 62
CALENDAR_MAX_TEXT = 200
CAL_FEATURE_CREATE = 1   # CalendarEntityFeature.CREATE_EVENT
CAL_FEATURE_DELETE = 2   # CalendarEntityFeature.DELETE_EVENT

ALLOWED_PROXY_EVENTS = {
    "set_tasks_data",
    "set_todo_favs",
    "set_shop_favs",
    "set_food_favs",
    "set_shopping_data",
    "set_finance_data",
    "set_finance_db",
    "set_finance_templates",
}

ALLOWED_WRITE_PREFIXES = (
    "input_text.helper_",
    "input_text.essen_",
    "text.helper_",
    "text.essen_",
    "sensor.haushalt_",
)

PLATFORMS = ["sensor", "text"]
STORAGE_KEY = f"{DOMAIN}_data_store"
STORAGE_VERSION = 1


async def _read_json(request) -> dict:
    """Liest den Request-Body als JSON, auch wenn der Content-Type fehlt."""
    try:
        data = await request.json()
    except Exception:
        try:
            data = json.loads(await request.text())
        except Exception:
            data = {}
    return data if isinstance(data, dict) else {}


def _stored_pw(hass, conf_key: str, store_key: str) -> str:
    """Liefert den gespeicherten (gehashten) Master- oder Admin-Passwort-Wert."""
    entry = hass.data.get(DOMAIN, {}).get("entry")
    store_data = hass.data.get(DOMAIN, {}).get("data", {})
    if entry is not None:
        value = entry.options.get(conf_key, entry.data.get(conf_key))
        if value:
            return str(value)
    return str(store_data.get(store_key, "") or "")


def _opt(entry, key, default):
    """Option lesen (Optionen vor ursprünglichen Daten)."""
    if entry is None:
        return default
    if key in entry.options:
        return entry.options.get(key)
    if key in entry.data:
        return entry.data.get(key)
    return default


def _get_features(entry) -> list:
    """Eingeschaltete Zusatzfunktionen (Vorrat, Wartung, Kalender). Ohne Angabe: Vorrat + Wartung."""
    raw = _opt(entry, CONF_FEATURES, None)
    if raw is None:
        return list(DEFAULT_FEATURES)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = [v.strip().strip("'\"") for v in raw.strip("[]").split(",") if v.strip()]
    if not isinstance(raw, (list, tuple)):
        return list(DEFAULT_FEATURES)
    return [k for k in FEATURE_KEYS if k in raw]


def _get_calendar_ids(entry) -> list:
    """Kalender, die auf der Startseite angezeigt werden dürfen (nur calendar.*)."""
    raw = _opt(entry, CONF_CALENDARS, []) or []
    if isinstance(raw, str):
        raw = [raw]
    out = []
    for ent in raw:
        ent = str(ent).strip()
        if ent.startswith("calendar.") and ent not in out:
            out.append(ent)
    return out


def _get_calendar_write(entry, ids) -> str:
    """Kalender, in den neue Termine geschrieben werden (sonst der erste angezeigte)."""
    w = str(_opt(entry, CONF_CALENDAR_WRITE, "") or "").strip()
    if w and w in ids:
        return w
    return ids[0] if ids else ""


def _calendar_info(hass, entry) -> dict:
    """Kalender-Infos für die App: Name und was der Kalender kann (Termine anlegen / löschen)."""
    ids = _get_calendar_ids(entry)
    cals = []
    for ent in ids:
        st = hass.states.get(ent)
        attrs = st.attributes if st is not None else {}
        try:
            feats = int(attrs.get("supported_features") or 0)
        except (TypeError, ValueError):
            feats = 0
        cals.append({
            "entity_id": ent,
            "name": str(attrs.get("friendly_name") or ent),
            "can_create": bool(feats & CAL_FEATURE_CREATE),
            "can_delete": bool(feats & CAL_FEATURE_DELETE),
        })
    return {"calendars": cals, "calendar_write": _get_calendar_write(entry, ids)}


async def _async_check_pw(hass, stored: str, given) -> bool:
    """Prüft ein Passwort im Executor und bremst bei Fehlversuchen."""
    ok = await hass.async_add_executor_job(verify_password, stored, given)
    if not ok:
        await asyncio.sleep(FAILED_LOGIN_DELAY)
    return ok


async def _async_check_master(hass, given) -> bool:
    return await _async_check_pw(hass, _stored_pw(hass, CONF_MASTER_PW, "helper_master_pw"), given)


async def _async_check_admin(hass, given) -> bool:
    return await _async_check_pw(hass, _stored_pw(hass, CONF_ADMIN_PW, "helper_admin_pw"), given)


async def async_migrate_secrets(hass, entry: ConfigEntry, store_data: dict) -> bool:
    """Hasht Klartext-Passwörter und entfernt das früher gespeicherte HA-Token."""
    if store_data.pop("saved_ha_token", None):
        _LOGGER.warning(
            "Haushaltshilfe: Ein gespeichertes Home-Assistant-Token wurde entfernt. "
            "Bitte das Token unter Profil -> Sicherheit -> Langlebige Zugangstoken widerrufen."
        )

    new_data = dict(entry.data)
    new_options = dict(entry.options)
    changed = False
    for container in (new_data, new_options):
        for key in (CONF_MASTER_PW, CONF_ADMIN_PW):
            value = container.get(key)
            if value and not is_hashed(value):
                container[key] = await hass.async_add_executor_job(hash_password, str(value))
                changed = True
    if changed:
        hass.config_entries.async_update_entry(entry, data=new_data, options=new_options)

    for conf_key, store_key in ((CONF_MASTER_PW, "helper_master_pw"), (CONF_ADMIN_PW, "helper_admin_pw")):
        value = new_options.get(conf_key, new_data.get(conf_key))
        if value:
            store_data[store_key] = value
        elif store_data.get(store_key) and not is_hashed(store_data[store_key]):
            store_data[store_key] = await hass.async_add_executor_job(hash_password, str(store_data[store_key]))

    users = parse_users(store_data.get("users_list", "[]"))
    users_changed = False
    for u in users:
        if not is_hashed(u["pw"]):
            u["pw"] = await hass.async_add_executor_job(hash_password, u["pw"])
            users_changed = True
    if users_changed:
        store_data["users_list"] = serialize_users(users)

    return changed


class HaushaltshilfeCredentialsView(HomeAssistantView):
    """Liefert die sichtbaren Tabs und die Müll-Sensoren. Passwörter werden NICHT ausgeliefert."""
    url = "/api/haushaltshilfe/credentials"
    name = "api:haushaltshilfe:credentials"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        entry = hass.data.get(DOMAIN, {}).get("entry")
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        if not entry:
            return self.json({"error": "Config entry not found"}, status_code=500)

        raw_tabs = entry.options.get(CONF_VISIBLE_TABS)
        if raw_tabs is None:
            raw_tabs = entry.data.get(CONF_VISIBLE_TABS)
        if raw_tabs is None:
            raw_tabs = store_data.get("helper_visible_tabs", '["shop", "todo", "food", "trash", "finance"]')

        if isinstance(raw_tabs, str):
            try:
                visible_tabs = json.loads(raw_tabs)
            except Exception:
                visible_tabs = [v.strip().strip("'\"") for v in raw_tabs.strip("[]").split(",") if v.strip()]
        elif isinstance(raw_tabs, list):
            visible_tabs = raw_tabs
        else:
            visible_tabs = ["shop", "todo", "food", "trash", "finance"]

        def _get_opt(key, default):
            if key in entry.options:
                return entry.options.get(key) or ""
            if key in entry.data:
                return entry.data.get(key) or ""
            return default

        trash_config = []
        yellow_days = _get_opt(CONF_TRASH_YELLOW_DAYS, "sensor.gelber_sack")
        yellow_date = _get_opt(CONF_TRASH_YELLOW_DATE, "sensor.gelber_sack_datum")
        if yellow_days and yellow_date:
            trash_config.append({
                "id": yellow_days,
                "dateId": yellow_date,
                "name": "Gelber Sack",
                "icon": "🟡",
            })

        paper_days = _get_opt(CONF_TRASH_PAPER_DAYS, "sensor.papier")
        paper_date = _get_opt(CONF_TRASH_PAPER_DATE, "sensor.papier_datum")
        if paper_days and paper_date:
            trash_config.append({
                "id": paper_days,
                "dateId": paper_date,
                "name": "Altpapier",
                "icon": "📦",
            })

        rest_days = _get_opt(CONF_TRASH_REST_DAYS, "sensor.restmull")
        rest_date = _get_opt(CONF_TRASH_REST_DATE, "sensor.restmull_datum")
        if rest_days and rest_date:
            trash_config.append({
                "id": rest_days,
                "dateId": rest_date,
                "name": "Restmüll",
                "icon": "🗑️",
            })
            
        # --- NEU: Biomüll ---
        bio_days = _get_opt(CONF_TRASH_BIO_DAYS, "sensor.biomuell")
        bio_date = _get_opt(CONF_TRASH_BIO_DATE, "sensor.biomuell_datum")
        if bio_days and bio_date:
            trash_config.append({
                "id": bio_days,
                "dateId": bio_date,
                "name": "Biomüll",
                "icon": "🟢",
            })

        # --- NEU: Weihnachtsbäume ---
        xmas_days = _get_opt(CONF_TRASH_XMAS_DAYS, "sensor.weihnachtsbaum")
        xmas_date = _get_opt(CONF_TRASH_XMAS_DATE, "sensor.weihnachtsbaum_datum")
        if xmas_days and xmas_date:
            trash_config.append({
                "id": xmas_days,
                "dateId": xmas_date,
                "name": "Weihnachtsbaum",
                "icon": "🎄",
            })    

        cal_info = _calendar_info(hass, entry)

        return self.json({
            "visible_tabs": visible_tabs,
            "features": _get_features(entry),
            "calendars": cal_info["calendars"],
            "calendar_write": cal_info["calendar_write"],
            "trash_config": trash_config,
            "has_master_pw": bool(_stored_pw(hass, CONF_MASTER_PW, "helper_master_pw")),
            "has_admin_pw": bool(_stored_pw(hass, CONF_ADMIN_PW, "helper_admin_pw")),
        })


class HaushaltshilfeVerifyView(HomeAssistantView):
    """Prüft Master- oder Admin-Passwort serverseitig."""
    url = "/api/haushaltshilfe/verify"
    name = "api:haushaltshilfe:verify"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        data = await _read_json(request)
        kind = data.get("kind")
        password = data.get("password", "")

        if kind == "master":
            ok = await _async_check_master(hass, password)
        elif kind == "admin":
            ok = await _async_check_admin(hass, password)
        else:
            return self.json({"success": False, "message": "Unbekannter Typ"}, status_code=400)

        if ok:
            return self.json({"success": True})
        return self.json({"success": False}, status_code=403)


class HaushaltshilfeUpdateCredentialsView(HomeAssistantView):
    """Speichert Master-/Admin-Passwort, sichtbare Tabs sowie den Zoom zentral."""
    url = "/api/haushaltshilfe/update_credentials"
    name = "api:haushaltshilfe:update_credentials"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        entry = hass.data.get(DOMAIN, {}).get("entry")
        if not entry:
            return self.json({"error": "Config entry not found"}, status_code=500)

        data = await _read_json(request)

        new_master = data.get("master_pw")
        new_admin = data.get("admin_pw")
        new_tabs = data.get("visible_tabs")
        new_features = data.get("features")
        new_device_id = data.get("device_id")
        new_zoom = data.get("zoom")

        new_master = str(new_master).strip() if new_master is not None else ""
        new_admin = str(new_admin).strip() if new_admin is not None else ""

        if new_master or new_admin or new_tabs is not None or new_features is not None:
            if not await _async_check_master(hass, data.get("current_master_pw", "")):
                return self.json({"success": False, "message": "Master-Passwort falsch"}, status_code=403)

        new_options = {**entry.data, **entry.options}
        updated = False

        if new_master:
            new_options[CONF_MASTER_PW] = await hass.async_add_executor_job(hash_password, new_master)
            updated = True

        if new_admin:
            new_options[CONF_ADMIN_PW] = await hass.async_add_executor_job(hash_password, new_admin)
            updated = True

        parsed_tabs = None
        if new_tabs is not None:
            if isinstance(new_tabs, str):
                try:
                    parsed_tabs = json.loads(new_tabs)
                except Exception:
                    parsed_tabs = [v.strip().strip("'\"") for v in new_tabs.strip("[]").split(",") if v.strip()]
            elif isinstance(new_tabs, list):
                parsed_tabs = new_tabs

            if parsed_tabs is not None:
                new_options[CONF_VISIBLE_TABS] = parsed_tabs
                updated = True

        if new_features is not None:
            if isinstance(new_features, str):
                try:
                    new_features = json.loads(new_features)
                except Exception:
                    new_features = [v.strip().strip("'\"") for v in new_features.strip("[]").split(",") if v.strip()]
            if isinstance(new_features, (list, tuple)):
                new_options[CONF_FEATURES] = [k for k in FEATURE_KEYS if k in new_features]
                updated = True

        if updated or (new_device_id and new_zoom is not None):
            if updated:
                hass.config_entries.async_update_entry(entry, options=new_options)

            store_data = hass.data[DOMAIN].get("data", {})
            store = hass.data[DOMAIN].get("store")
            text_entities = hass.data[DOMAIN].get("text_entities", {})

            if store_data is not None and store is not None:
                if new_master:
                    store_data["helper_master_pw"] = new_options[CONF_MASTER_PW]
                if new_admin:
                    store_data["helper_admin_pw"] = new_options[CONF_ADMIN_PW]
                if parsed_tabs is not None:
                    tabs_str = json.dumps(parsed_tabs)
                    store_data["helper_visible_tabs"] = tabs_str
                    if "helper_visible_tabs" in text_entities:
                        text_entities["helper_visible_tabs"].async_write_ha_state()

                if new_device_id and new_zoom is not None:
                    zooms_raw = store_data.get("device_zooms", "{}")
                    try:
                        zooms = json.loads(zooms_raw) if isinstance(zooms_raw, str) else zooms_raw
                    except Exception:
                        zooms = {}
                    zooms[str(new_device_id)] = float(new_zoom)
                    store_data["device_zooms"] = json.dumps(zooms)

                await store.async_save(store_data)

            return self.json({"success": True})

        return self.json({"success": False, "message": "Keine Änderungen"}, status_code=400)


class HaushaltshilfeUsersView(HomeAssistantView):
    """Benutzerliste abrufen (ohne Passwörter) und einzelne Benutzer verwalten."""
    url = "/api/haushaltshilfe/users"
    name = "api:haushaltshilfe:users"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        users = parse_users(store_data.get("users_list", "[]"))
        return self.json({"users": public_users(users)})

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        data = await _read_json(request)

        action = data.get("action")
        if action not in ("add", "update", "delete"):
            return self.json({"success": False, "message": "Ungültige Aktion"}, status_code=400)

        if not await _async_check_admin(hass, data.get("admin_pw", "")):
            return self.json({"success": False, "message": "Admin-Passwort falsch"}, status_code=403)

        users = parse_users(store_data.get("users_list", "[]"))
        name = str(data.get("name", "")).strip()
        password = str(data.get("password", "")).strip()
        persistent = bool(data.get("persistent", False))

        def find(n):
            return next((u for u in users if u["name"].lower() == n.lower()), None)

        if action in ("add", "update") and (not name or ":" in name):
            return self.json({"success": False, "message": "Ungültiger Name"}, status_code=400)

        if action == "add":
            if not password:
                return self.json({"success": False, "message": "Passwort fehlt"}, status_code=400)
            if find(name):
                return self.json({"success": False, "message": "Benutzer existiert bereits"}, status_code=409)
            users.append({
                "name": name,
                "pw": await hass.async_add_executor_job(hash_password, password),
                "persistent": persistent,
            })

        elif action == "update":
            old_name = str(data.get("old_name", name)).strip()
            target = find(old_name)
            if target is None:
                return self.json({"success": False, "message": "Benutzer nicht gefunden"}, status_code=404)
            other = find(name)
            if other is not None and other is not target:
                return self.json({"success": False, "message": "Benutzer existiert bereits"}, status_code=409)
            target["name"] = name
            target["persistent"] = persistent
            if password:
                target["pw"] = await hass.async_add_executor_job(hash_password, password)

        elif action == "delete":
            target = find(name)
            if target is None:
                return self.json({"success": False, "message": "Benutzer nicht gefunden"}, status_code=404)
            users.remove(target)

        store_data["users_list"] = serialize_users(users)
        if store is not None:
            await store.async_save(store_data)

        return self.json({"success": True, "users": public_users(users)})


class HaushaltshilfePublicUsersView(HomeAssistantView):
    """Liefert nur die Benutzernamen (ohne Passwörter) für den Login-Screen."""
    url = "/api/haushaltshilfe/public_users"
    name = "api:haushaltshilfe:public_users"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        users = parse_users(store_data.get("users_list", "[]"))
        return self.json({"users": [{"name": u["name"], "persistent": u["persistent"]} for u in users]})


class HaushaltshilfeAppLoginView(HomeAssistantView):
    """Prüft Benutzername & Passwort."""
    url = "/api/haushaltshilfe/app_login"
    name = "api:haushaltshilfe:app_login"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        data = await _read_json(request)

        username = str(data.get("username", ""))
        password = data.get("password", "")

        users = parse_users(store_data.get("users_list", "[]"))
        target = next((u for u in users if u["name"] == username), None)
        stored = target["pw"] if target else ""

        if target is not None and await _async_check_pw(hass, stored, password):
            return self.json({"success": True})

        if target is None:
            await asyncio.sleep(FAILED_LOGIN_DELAY)
        return self.json({"success": False, "message": "Invalid credentials"}, status_code=401)


def _cal_parse_when(value, all_day: bool):
    """Text -> date (ganztägig) oder Datum+Uhrzeit mit Zeitzone. None, wenn unlesbar."""
    text = str(value or "").strip()
    if not text:
        return None
    if all_day:
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None
    parsed = dt_util.parse_datetime(text)
    if parsed is None:
        return None
    return dt_util.as_local(parsed) if parsed.tzinfo is None else parsed


class HaushaltshilfeCalendarView(HomeAssistantView):
    """Termine der gewählten Home-Assistant-Kalender lesen, anlegen und löschen (Startseite)."""
    url = "/api/haushaltshilfe/calendar"
    name = "api:haushaltshilfe:calendar"
    requires_auth = True

    def _setup(self, request):
        hass = request.app["hass"]
        entry = hass.data.get(DOMAIN, {}).get("entry")
        enabled = entry is not None and "calendar" in _get_features(entry)
        return hass, entry, enabled

    async def get(self, request):
        """Termine der gewählten Kalender für 'start' bis 'end' (ISO-Zeit)."""
        hass, entry, enabled = self._setup(request)
        if not enabled:
            return self.json({"enabled": False, "events": [], "failed": [], **_calendar_info(hass, entry)})

        start = dt_util.parse_datetime(request.query.get("start") or "")
        end = dt_util.parse_datetime(request.query.get("end") or "")
        if start is None or end is None:
            return self.json({"error": "Invalid time range"}, status_code=400)
        if start.tzinfo is None:
            start = dt_util.as_local(start)
        if end.tzinfo is None:
            end = dt_util.as_local(end)
        if end <= start or (end - start) > timedelta(days=CALENDAR_MAX_DAYS):
            return self.json({"error": "Invalid time range"}, status_code=400)

        events = []
        failed = []
        for ent in _get_calendar_ids(entry):
            state = hass.states.get(ent)
            if state is None:
                failed.append(ent)
                continue
            name = str(state.attributes.get("friendly_name") or ent)
            try:
                resp = await hass.services.async_call(
                    "calendar",
                    "get_events",
                    {"entity_id": ent, "start_date_time": start, "end_date_time": end},
                    blocking=True,
                    return_response=True,
                )
            except Exception as err:  # ein kaputter Kalender soll die anderen nicht blockieren
                _LOGGER.warning("Kalender %s konnte nicht gelesen werden: %s", ent, err)
                failed.append(ent)
                continue

            for ev in ((resp or {}).get(ent) or {}).get("events", []):
                s = str(ev.get("start") or "")
                if not s:
                    continue
                events.append({
                    "cal": ent,
                    "calName": name,
                    "summary": str(ev.get("summary") or ""),
                    "start": s,
                    "end": str(ev.get("end") or ""),
                    "allDay": len(s) <= 10,
                    "location": str(ev.get("location") or ""),
                    "description": str(ev.get("description") or ""),
                })

        return self.json({"enabled": True, "events": events, "failed": failed, **_calendar_info(hass, entry)})

    async def post(self, request):
        """Termin anlegen ('create') oder löschen ('delete')."""
        hass, entry, enabled = self._setup(request)
        if not enabled:
            return self.json({"success": False, "message": "Kalender ist ausgeschaltet"}, status_code=403)

        data = await _read_json(request)
        action = data.get("action")
        info = _calendar_info(hass, entry)
        by_id = {c["entity_id"]: c for c in info["calendars"]}

        if action == "create":
            ent = str(data.get("calendar") or info["calendar_write"] or "")
            cal = by_id.get(ent)
            if cal is None:
                return self.json({"success": False, "message": "Kalender nicht ausgewählt"}, status_code=400)
            if not cal["can_create"]:
                return self.json({"success": False, "message": "Dieser Kalender erlaubt keine neuen Termine"}, status_code=400)

            summary = str(data.get("summary") or "").strip()[:CALENDAR_MAX_TEXT]
            if not summary:
                return self.json({"success": False, "message": "Titel fehlt"}, status_code=400)
            all_day = bool(data.get("allDay"))
            start = _cal_parse_when(data.get("start"), all_day)
            end = _cal_parse_when(data.get("end"), all_day) if data.get("end") else None
            if start is None:
                return self.json({"success": False, "message": "Ungültiger Beginn"}, status_code=400)

            svc = {"entity_id": ent, "summary": summary}
            if all_day:
                last = end if end is not None else start      # 'end' ist der letzte Tag (inklusive)
                if last < start:
                    return self.json({"success": False, "message": "Ende liegt vor dem Beginn"}, status_code=400)
                svc["start_date"] = start
                svc["end_date"] = last + timedelta(days=1)     # Home Assistant will den Tag danach
            else:
                if end is None:
                    end = start + timedelta(hours=1)
                if end <= start:
                    return self.json({"success": False, "message": "Ende liegt vor dem Beginn"}, status_code=400)
                svc["start_date_time"] = start
                svc["end_date_time"] = end
            desc = str(data.get("description") or "").strip()[:1000]
            loc = str(data.get("location") or "").strip()[:CALENDAR_MAX_TEXT]
            if desc:
                svc["description"] = desc
            if loc:
                svc["location"] = loc
            try:
                await hass.services.async_call("calendar", "create_event", svc, blocking=True)
            except Exception as err:
                _LOGGER.warning("Termin konnte nicht in %s angelegt werden: %s", ent, err)
                return self.json({"success": False, "message": str(err) or "Termin konnte nicht angelegt werden"}, status_code=500)
            return self.json({"success": True})

        if action == "delete":
            ent = str(data.get("calendar") or "")
            cal = by_id.get(ent)
            if cal is None:
                return self.json({"success": False, "message": "Kalender nicht ausgewählt"}, status_code=400)
            if not cal["can_delete"]:
                return self.json({"success": False, "message": "Dieser Kalender erlaubt kein Löschen"}, status_code=400)
            summary = str(data.get("summary") or "")
            all_day = bool(data.get("allDay"))
            start = _cal_parse_when(data.get("start"), all_day)
            if start is None:
                return self.json({"success": False, "message": "Ungültiger Beginn"}, status_code=400)

            component = hass.data.get("calendar")
            entity = component.get_entity(ent) if component is not None and hasattr(component, "get_entity") else None
            if entity is None:
                return self.json({"success": False, "message": "Kalender nicht erreichbar"}, status_code=500)
            if all_day:
                win_start = dt_util.as_local(datetime.combine(start, datetime.min.time()))
                win_end = win_start + timedelta(days=1)
            else:
                win_start, win_end = start - timedelta(minutes=1), start + timedelta(minutes=1)
            try:
                found = await entity.async_get_events(hass, win_start, win_end)
                match = None
                for ev in found:
                    if str(ev.summary or "") == summary and ev.start == start:
                        match = ev
                        break
                if match is None or not getattr(match, "uid", None):
                    return self.json({"success": False, "message": "Termin nicht gefunden"}, status_code=404)
                await entity.async_delete_event(match.uid, getattr(match, "recurrence_id", None), None)
            except Exception as err:
                _LOGGER.warning("Termin konnte in %s nicht gelöscht werden: %s", ent, err)
                return self.json({"success": False, "message": str(err) or "Termin konnte nicht gelöscht werden"}, status_code=500)
            return self.json({"success": True})

        return self.json({"success": False, "message": "Unbekannte Aktion"}, status_code=400)


class HaushaltshilfeStateProxyView(HomeAssistantView):
    """Liest States und schreibt über die echten Entitäten/Events der Integration."""
    url = "/api/haushaltshilfe/proxy"
    name = "api:haushaltshilfe:proxy"
    requires_auth = True

    async def get(self, request):
        """Liefert State und Attribute einer Entität (inkl. Fallback input_text -> text)."""
        hass = request.app["hass"]
        entity_id = request.query.get("entity_id")

        if entity_id:
            if entity_id.startswith("input_text."):
                short_key = entity_id.replace("input_text.", "")
                if short_key in TEXT_ENTITIES:
                    entity_id = f"text.{short_key}"

            state = hass.states.get(entity_id)
            if not state:
                return self.json({"state": "unknown", "attributes": {}})
            return self.json({"state": state.state, "attributes": dict(state.attributes)})

        return self.json({"error": "No entity_id provided"}, status_code=400)

    async def post(self, request):
        """Feuert ein erlaubtes Event oder aktualisiert eine Text-Entität über deren Methode."""
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        text_entities = hass.data.get(DOMAIN, {}).get("text_entities", {})

        data = await _read_json(request)
        if not data:
            return self.json({"error": "Invalid JSON"}, status_code=400)

        action = data.get("action")

        if action == "fire_event":
            event_type = data.get("event_type")
            event_data = data.get("event_data", {})
            if event_type not in ALLOWED_PROXY_EVENTS:
                return self.json({"error": "Event not allowed"}, status_code=403)
            if not isinstance(event_data, dict):
                event_data = {}
            hass.bus.async_fire(event_type, event_data)
            return self.json({"success": True})

        if action == "set_input_text":
            entity_id = data.get("entity_id")
            value = data.get("value", "")
            if not isinstance(entity_id, str) or not entity_id.startswith(ALLOWED_WRITE_PREFIXES):
                return self.json({"error": "Entity not allowed"}, status_code=403)

            helper_key = (
                entity_id.replace("input_text.", "")
                .replace("text.", "")
                .replace("sensor.haushalt_", "")
            )
            if helper_key in ("helper_master_pw", "helper_admin_pw", "users_list", "saved_ha_token"):
                return self.json({"error": "Entity not allowed"}, status_code=403)

            val_str = str(value)

            if helper_key in text_entities:
                await text_entities[helper_key].async_set_value(val_str)
                return self.json({"success": True})

            if "finance_templates" in entity_id:
                try:
                    parsed_tpl = json.loads(val_str) if isinstance(value, str) else value
                except Exception:
                    parsed_tpl = []
                hass.bus.async_fire("set_finance_templates", {"templates": parsed_tpl})
                return self.json({"success": True})

            if entity_id.startswith("sensor.haushalt_"):
                store_data[helper_key] = val_str
                if helper_key == "finance_db":
                    try:
                        parsed_db = json.loads(val_str)
                    except Exception:
                        parsed_db = {}
                    hass.bus.async_fire("set_finance_db", {"data": parsed_db})
                if store is not None:
                    await store.async_save(store_data)
                return self.json({"success": True})

            store_data[helper_key] = val_str
            if store is not None:
                await store.async_save(store_data)

            return self.json({"success": True})

        return self.json({"error": "Unknown action"}, status_code=400)


class HaushaltshilfeGetZoomView(HomeAssistantView):
    """API Endpoint um Zoom und Theme gerätespezifisch abzurufen."""
    url = "/api/haushaltshilfe/get_zoom"
    name = "api:haushaltshilfe:get_zoom"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        device_id = request.query.get("device_id", "default")

        zooms_raw = store_data.get("device_zooms", "{}")
        themes_raw = store_data.get("device_themes", "{}")
        try:
            zooms = json.loads(zooms_raw) if isinstance(zooms_raw, str) else zooms_raw
            themes = json.loads(themes_raw) if isinstance(themes_raw, str) else themes_raw
        except Exception:
            zooms = {}
            themes = {}

        zoom_val = zooms.get(device_id, 1.0)
        theme_val = themes.get(device_id, "theme-glass")

        return self.json({"zoom": zoom_val, "theme": theme_val})


class HaushaltshilfeUpdateZoomView(HomeAssistantView):
    """API Endpoint um Zoom und Theme gerätespezifisch auf dem Server zu speichern."""
    url = "/api/haushaltshilfe/update_zoom"
    name = "api:haushaltshilfe:update_zoom"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        store_data = hass.data.get(DOMAIN, {}).get("data", {})
        store = hass.data[DOMAIN].get("store")
        data = await _read_json(request)

        device_id = data.get("device_id")
        zoom = data.get("zoom")
        theme = data.get("theme")

        if device_id:
            device_id = str(device_id)
            zooms_raw = store_data.get("device_zooms", "{}")
            themes_raw = store_data.get("device_themes", "{}")
            try:
                zooms = json.loads(zooms_raw) if isinstance(zooms_raw, str) else zooms_raw
                themes = json.loads(themes_raw) if isinstance(themes_raw, str) else themes_raw
            except Exception:
                zooms = {}
                themes = {}

            if zoom is not None:
                try:
                    zooms[device_id] = float(zoom)
                except (TypeError, ValueError):
                    return self.json({"success": False, "message": "Ungültiger Zoom"}, status_code=400)
                store_data["device_zooms"] = json.dumps(zooms)

            if theme is not None:
                themes[device_id] = str(theme)
                store_data["device_themes"] = json.dumps(themes)

            if store is not None:
                await store.async_save(store_data)

            return self.json({"success": True})

        return self.json({"success": False, "message": "Ungültige Device-ID"}, status_code=400)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Haushaltshilfe Pro with persistent JSON storage."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["entry"] = entry
    hass.data[DOMAIN]["text_entities"] = {}

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    store_data = await store.async_load() or {}
    hass.data[DOMAIN]["store"] = store
    hass.data[DOMAIN]["data"] = store_data

    if "users_list" not in store_data:
        store_data["users_list"] = json.dumps([])

    await async_migrate_secrets(hass, entry, store_data)

    opt_tabs = entry.options.get(CONF_VISIBLE_TABS, entry.data.get(CONF_VISIBLE_TABS))

    if "helper_finance_templates" in store_data:
        if "finance_templates" not in store_data or store_data["finance_templates"] == "[]":
            store_data["finance_templates"] = store_data["helper_finance_templates"]
        store_data.pop("helper_finance_templates", None)

    if "finance_templates" not in store_data:
        store_data["finance_templates"] = "[]"

    for helper_id, config in TEXT_ENTITIES.items():
        if helper_id == "helper_visible_tabs" and opt_tabs is not None:
            val_to_set = json.dumps(opt_tabs) if isinstance(opt_tabs, list) else str(opt_tabs)
        else:
            val_to_set = store_data.get(helper_id, config["initial"])
        store_data[helper_id] = str(val_to_set)

    await store.async_save(store_data)

    EVENT_MAPPING = {
        "set_tasks_data": "tasks_data",
        "set_todo_favs": "todo_favs",
        "set_shop_favs": "shop_favs",
        "set_food_favs": "food_favs",
        "set_shopping_data": "shopping_db",
        "set_finance_data": "finance_db",
        "set_finance_db": "finance_db",
        "set_finance_templates": "finance_templates",
    }

    @callback
    def handle_custom_events(event):
        ev_type = event.event_type
        if ev_type in EVENT_MAPPING:
            storage_key = EVENT_MAPPING[ev_type]
            raw_val = None
            for key in ("tasks", "favs", "json_data", "data", "users", "templates"):
                if event.data.get(key) is not None:
                    raw_val = event.data.get(key)
                    break

            if raw_val is not None:
                val_str = raw_val if isinstance(raw_val, str) else json.dumps(raw_val)
                store_data[storage_key] = val_str
                hass.async_create_task(store.async_save(store_data))

    for ev_name in EVENT_MAPPING.keys():
        entry.async_on_unload(
            hass.bus.async_listen(ev_name, handle_custom_events)
        )

    www_dir = hass.config.path("custom_components", DOMAIN, "www")
    if os.path.exists(www_dir) and not hass.data[DOMAIN].get("static_registered"):
        await hass.http.async_register_static_paths([
            StaticPathConfig("/haushaltshilfe_static", www_dir, cache_headers=False)
        ])
        hass.data[DOMAIN]["static_registered"] = True

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    frontend.async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title="Haushaltshilfe",
        sidebar_icon="mdi:home-heart",
        frontend_url_path="haushaltshilfe",
        config={"url": "/haushaltshilfe_static/index.html"},
        require_admin=False,
    )

    if not hass.data[DOMAIN].get("views_registered"):
        hass.http.register_view(HaushaltshilfeCredentialsView())
        hass.http.register_view(HaushaltshilfeVerifyView())
        hass.http.register_view(HaushaltshilfeUpdateCredentialsView())
        hass.http.register_view(HaushaltshilfeUsersView())
        hass.http.register_view(HaushaltshilfePublicUsersView())
        hass.http.register_view(HaushaltshilfeAppLoginView())
        hass.http.register_view(HaushaltshilfeStateProxyView())
        hass.http.register_view(HaushaltshilfeCalendarView())
        hass.http.register_view(HaushaltshilfeGetZoomView())
        hass.http.register_view(HaushaltshilfeUpdateZoomView())
        hass.data[DOMAIN]["views_registered"] = True

    entry.async_on_unload(entry.add_update_listener(update_listener))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        frontend.async_remove_panel(hass, "haushaltshilfe")
    return unload_ok


async def update_listener(hass: HomeAssistant, entry: ConfigEntry):
    """Handle options update."""
    store = hass.data[DOMAIN].get("store")
    store_data = hass.data[DOMAIN].get("data", {})
    text_entities = hass.data[DOMAIN].get("text_entities", {})

    if await async_migrate_secrets(hass, entry, store_data):
        return

    visible_tabs = entry.options.get(CONF_VISIBLE_TABS)
    if visible_tabs is None:
        visible_tabs = entry.data.get(CONF_VISIBLE_TABS, ["shop", "todo", "food", "trash", "finance"])

    if visible_tabs is not None:
        tabs_str = json.dumps(visible_tabs) if isinstance(visible_tabs, list) else str(visible_tabs)
        store_data["helper_visible_tabs"] = tabs_str
        if "helper_visible_tabs" in text_entities:
            text_entities["helper_visible_tabs"].async_write_ha_state()

    if store:
        await store.async_save(store_data)
