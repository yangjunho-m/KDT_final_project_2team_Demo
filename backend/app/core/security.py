import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings


def hash_password(password: str) -> str:
    settings = get_settings()
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        settings.secret_key.encode("utf-8"),
        100_000,
    )
    return base64.urlsafe_b64encode(digest).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password), password_hash)


def create_access_token(subject: str) -> dict[str, str]:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    header = _encode_json({"alg": "HS256", "typ": "JWT"})
    payload = _encode_json({"sub": subject, "exp": int(expires_at.timestamp())})
    signing_input = f"{header}.{payload}"
    signature = _sign_jwt(signing_input, settings.secret_key)
    return {
        "accessToken": f"{signing_input}.{signature}",
        "tokenType": "bearer",
        "expiresAt": expires_at.isoformat(),
        "subject": subject,
    }


def decode_access_token(token: str) -> str | None:
    settings = get_settings()
    try:
        header, payload, signature = token.split(".")
    except ValueError:
        return None

    signing_input = f"{header}.{payload}"
    expected_signature = _sign_jwt(signing_input, settings.secret_key)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        header_data = _decode_json(header)
        token_data = _decode_json(payload)
    except (ValueError, json.JSONDecodeError):
        return None
    if header_data.get("alg") != "HS256" or header_data.get("typ") != "JWT":
        return None

    try:
        expires_at = int(token_data["exp"])
    except (KeyError, TypeError, ValueError):
        return None
    if expires_at < int(datetime.now(UTC).timestamp()):
        return None

    subject = token_data.get("sub")
    return str(subject) if subject else None


def _encode_json(data: dict[str, str | int]) -> str:
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _sign_jwt(signing_input: str, secret_key: str) -> str:
    digest = hmac.new(
        secret_key.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _decode_json(value: str) -> dict[str, str | int]:
    padded_value = value + "=" * (-len(value) % 4)
    decoded = base64.urlsafe_b64decode(padded_value.encode("ascii"))
    return json.loads(decoded.decode("utf-8"))
