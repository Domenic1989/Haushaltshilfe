"""Passwort-Hashing und Benutzerlisten-Helfer für Haushaltshilfe Pro.

Passwörter werden nur noch als PBKDF2-SHA256-Hash gespeichert und
ausschließlich serverseitig geprüft. Alte Klartext-Werte werden beim Start
automatisch migriert (siehe async_migrate_secrets in __init__.py).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os

HASH_PREFIX = "pbkdf2_sha256"
HASH_ITERATIONS = 200_000


def is_hashed(value) -> bool:
    """True, wenn der Wert bereits im Hash-Format vorliegt."""
    return isinstance(value, str) and value.startswith(HASH_PREFIX + "$")


def hash_password(password: str) -> str:
    """Erzeugt einen gesalzenen PBKDF2-Hash (blockierend -> im Executor aufrufen)."""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt, HASH_ITERATIONS)
    return f"{HASH_PREFIX}${HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(stored, password) -> bool:
    """Prüft ein Passwort gegen Hash oder (Alt-)Klartext, zeitkonstant.

    Blockierend bei Hash-Werten -> im Executor aufrufen.
    """
    if not stored or password is None:
        return False
    password = str(password)
    if is_hashed(stored):
        try:
            _, iterations, salt_hex, hash_hex = stored.split("$")
            digest = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
            )
        except (ValueError, TypeError):
            return False
        return hmac.compare_digest(digest.hex(), hash_hex)
    return hmac.compare_digest(str(stored).encode("utf-8"), password.encode("utf-8"))


# ---- Benutzerliste -------------------------------------------------------
# Speicherformat bleibt kompatibel: JSON-Liste aus "name:passwort[:persistent]",
# nur dass "passwort" jetzt ein Hash ist.

def parse_users(raw) -> list[dict]:
    """Liest die gespeicherte Benutzerliste in eine Liste von Dicts."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            raw = []
    if not isinstance(raw, list):
        return []

    users = []
    for entry in raw:
        if not isinstance(entry, str) or ":" not in entry:
            continue
        name, rest = entry.split(":", 1)
        persistent = False
        if rest.endswith(":persistent"):
            rest = rest[: -len(":persistent")]
            persistent = True
        users.append({"name": name, "pw": rest, "persistent": persistent})
    return users


def serialize_users(users: list[dict]) -> str:
    """Schreibt die Benutzerliste zurück ins Speicherformat (inkl. Hashes)."""
    out = []
    for u in users:
        s = f"{u['name']}:{u['pw']}"
        if u.get("persistent"):
            s += ":persistent"
        out.append(s)
    return json.dumps(out)


def public_users(users: list[dict]) -> list[str]:
    """Benutzerliste fürs Frontend - ohne Passwort/Hash.

    Format "name:" bzw. "name::persistent", damit das bestehende Frontend
    (uStr.split(':')[0], parts[2] === 'persistent') unverändert funktioniert.
    """
    return [f"{u['name']}::persistent" if u.get("persistent") else f"{u['name']}:" for u in users]
