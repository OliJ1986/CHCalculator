"""Credential and session primitives for the first-party account flow.

Passwords use the standard-library scrypt password KDF. Session and action
tokens are random opaque values; only SHA-256 digests are persisted.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import (
    EmailVerificationToken,
    LoginAttempt,
    PasswordResetToken,
    Profile,
    User,
    UserSession,
)
from .meals import DEFAULT_TIMEZONE

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
EMAIL_PATTERN = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}$")
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
TOKEN_BYTES = 32
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_LOCK = timedelta(minutes=15)


class AuthError(ValueError):
    pass


class InvalidCredentials(AuthError):
    pass


class AccountNotVerified(AuthError):
    pass


class LoginRateLimited(AuthError):
    pass


def normalize_email(value: str) -> str:
    email = value.strip().casefold()
    if not EMAIL_PATTERN.fullmatch(email):
        raise AuthError("Érvényes email-cím szükséges")
    return email


def validate_password(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH or len(value) > PASSWORD_MAX_LENGTH:
        raise AuthError(f"A jelszó {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} karakter legyen")
    if any(ord(char) < 32 for char in value):
        raise AuthError("A jelszó vezérlőkaraktert nem tartalmazhat")
    return value


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    validate_password(password)
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_DKLEN)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_unb64(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(_unb64(expected)),
        )
        return hmac.compare_digest(actual, _unb64(expected))
    except (ValueError, TypeError, OverflowError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def create_user(db: Session, email: str, password: str, settings: Settings) -> tuple[User | None, str | None]:
    normalized = normalize_email(email)
    validate_password(password)
    existing = db.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        return None, None
    user = User(email=normalized, password_hash=hash_password(password))
    db.add(user)
    db.flush()
    db.add(Profile(id=user.id, user_id=user.id, timezone=DEFAULT_TIMEZONE))
    raw_token = secrets.token_urlsafe(TOKEN_BYTES)
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash(raw_token),
            expires_at=datetime.now(UTC) + timedelta(hours=settings.auth_verification_ttl_hours),
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None, None
    return user, raw_token


def verify_email(db: Session, raw_token: str) -> User | None:
    record = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash(raw_token),
            EmailVerificationToken.used_at.is_(None),
        )
    )
    if record is None or (_utc(record.expires_at) or datetime.min.replace(tzinfo=UTC)) <= datetime.now(UTC):
        return None
    user = db.get(User, record.user_id)
    if user is None or user.disabled_at is not None:
        return None
    now = datetime.now(UTC)
    user.email_verified_at = now
    record.used_at = now
    db.commit()
    return user


def _attempt_key(email: str, ip: str | None) -> str:
    return f"{email}|{ip or 'unknown'}"


def check_login_rate(db: Session, email: str, ip: str | None) -> None:
    record = db.get(LoginAttempt, _attempt_key(email, ip))
    if record is None:
        return
    now = datetime.now(UTC)
    locked_until = _utc(record.locked_until)
    if locked_until and locked_until > now:
        raise LoginRateLimited("Túl sok sikertelen próbálkozás; próbáld újra később")
    first = _utc(record.first_failed_at)
    if first and now - first > LOGIN_WINDOW:
        db.delete(record)
        db.commit()


def record_login_failure(db: Session, email: str, ip: str | None) -> None:
    key = _attempt_key(email, ip)
    now = datetime.now(UTC)
    record = db.get(LoginAttempt, key)
    if record is None or (_utc(record.first_failed_at) and now - (_utc(record.first_failed_at) or now) > LOGIN_WINDOW):
        record = LoginAttempt(key=key, failures=0, first_failed_at=now)
        db.add(record)
    record.failures += 1
    if record.failures >= LOGIN_MAX_FAILURES:
        record.locked_until = now + LOGIN_LOCK
    db.commit()


def clear_login_failures(db: Session, email: str, ip: str | None) -> None:
    db.execute(delete(LoginAttempt).where(LoginAttempt.key == _attempt_key(email, ip)))
    db.commit()


def authenticate(db: Session, email: str, password: str, ip: str | None) -> User:
    normalized = normalize_email(email)
    check_login_rate(db, normalized, ip)
    user = db.scalar(select(User).where(User.email == normalized))
    valid = user is not None and user.disabled_at is None and verify_password(password, user.password_hash)
    if not valid:
        record_login_failure(db, normalized, ip)
        raise InvalidCredentials("Hibás email vagy jelszó")
    if user.email_verified_at is None:
        raise AccountNotVerified("Az email-cím megerősítése szükséges")
    clear_login_failures(db, normalized, ip)
    return user


def create_session(db: Session, user: User, settings: Settings) -> tuple[UserSession, str, str]:
    raw = secrets.token_urlsafe(TOKEN_BYTES)
    csrf = secrets.token_urlsafe(24)
    session = UserSession(
        user_id=user.id,
        token_hash=token_hash(raw),
        csrf_token_hash=token_hash(csrf),
        expires_at=datetime.now(UTC) + timedelta(hours=settings.auth_session_ttl_hours),
        last_seen_at=datetime.now(UTC),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, raw, csrf


def get_session(db: Session, raw: str | None) -> tuple[UserSession, User] | None:
    if not raw:
        return None
    session = db.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash(raw), UserSession.revoked_at.is_(None))
    )
    if session is None or (_utc(session.expires_at) or datetime.min.replace(tzinfo=UTC)) <= datetime.now(UTC):
        return None
    user = db.get(User, session.user_id)
    if user is None or user.disabled_at is not None:
        return None
    return session, user


def revoke_session(db: Session, raw: str | None) -> None:
    if not raw:
        return
    session = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(raw)))
    if session is not None:
        session.revoked_at = datetime.now(UTC)
        db.commit()


def revoke_all_sessions(db: Session, user_id: str) -> None:
    db.query(UserSession).filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None)).update(
        {UserSession.revoked_at: datetime.now(UTC)}, synchronize_session=False
    )
    db.commit()


def create_password_reset(db: Session, email: str, settings: Settings) -> str | None:
    normalized = normalize_email(email)
    user = db.scalar(select(User).where(User.email == normalized, User.disabled_at.is_(None)))
    if user is None:
        return None
    raw = secrets.token_urlsafe(TOKEN_BYTES)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash(raw),
            expires_at=datetime.now(UTC) + timedelta(minutes=settings.auth_reset_ttl_minutes),
        )
    )
    db.commit()
    return raw


def reset_password(db: Session, raw_token: str, new_password: str) -> bool:
    validate_password(new_password)
    record = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash(raw_token),
            PasswordResetToken.used_at.is_(None),
        )
    )
    if record is None or (_utc(record.expires_at) or datetime.min.replace(tzinfo=UTC)) <= datetime.now(UTC):
        return False
    user = db.get(User, record.user_id)
    if user is None or user.disabled_at is not None:
        return False
    user.password_hash = hash_password(new_password)
    record.used_at = datetime.now(UTC)
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).update(
        {UserSession.revoked_at: datetime.now(UTC)}, synchronize_session=False
    )
    db.commit()
    return True


def profile_for_user(db: Session, user: User) -> Profile:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is not None:
        return profile
    profile = Profile(id=user.id, user_id=user.id, timezone=DEFAULT_TIMEZONE)
    db.add(profile)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
        if profile is None:
            raise
        return profile
    db.refresh(profile)
    return profile
