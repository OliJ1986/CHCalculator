from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User, UserSession
from .services.auth import get_session, profile_for_user, token_hash


def optional_session(request: Request, db: Session = Depends(get_db)) -> tuple[UserSession, User] | None:
    return get_session(db, request.cookies.get(get_settings().auth_cookie_name))


def current_user(session: tuple[UserSession, User] | None = Depends(optional_session)) -> User | None:
    return session[1] if session else None


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    session = get_session(db, request.cookies.get(get_settings().auth_cookie_name))
    if session is None:
        raise HTTPException(status_code=401, detail="Bejelentkezés szükséges")
    return session[1]


def enforce_same_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin:
        return
    settings = get_settings()
    allowed = set(settings.cors_origin_list)
    allowed.add(str(request.base_url).rstrip("/"))
    if origin not in allowed:
        raise HTTPException(status_code=403, detail="Érvénytelen kérési eredet")


def require_csrf(request: Request, db: Session, *, session: tuple[UserSession, User] | None = None) -> tuple[UserSession, User]:
    enforce_same_origin(request)
    active = session or get_session(db, request.cookies.get(get_settings().auth_cookie_name))
    if active is None:
        raise HTTPException(status_code=401, detail="Bejelentkezés szükséges")
    csrf_cookie = request.cookies.get(get_settings().auth_csrf_cookie_name)
    csrf_header = request.headers.get("x-csrf-token")
    if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="CSRF-ellenőrzés sikertelen")
    if not secrets.compare_digest(token_hash(csrf_header), active[0].csrf_token_hash):
        raise HTTPException(status_code=403, detail="CSRF-ellenőrzés sikertelen")
    return active


def user_profile(db: Session, user: User):
    return profile_for_user(db, user)
