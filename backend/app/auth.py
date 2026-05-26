from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User


class CurrentUser:
    def __init__(self, uid: str, email: str, display_name: str, photo_url: str | None):
        self.uid = uid
        self.email = email
        self.display_name = display_name
        self.photo_url = photo_url

    @property
    def is_admin(self) -> bool:
        admin_list = [
            e.strip().lower()
            for e in settings.admin_emails.split(",")
            if e.strip()
        ]
        return self.email.lower() in admin_list


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> CurrentUser:
    email = request.headers.get(settings.auth_header_email, "").strip()
    uid = request.headers.get(settings.auth_header_user_id, "").strip()
    name = request.headers.get(settings.auth_header_name, "").strip()
    photo = request.headers.get(settings.auth_header_photo, "").strip() or None

    # Dev fallback: simulate auth via env vars when no proxy headers are present.
    if not email and settings.dev_user_email:
        email = settings.dev_user_email
        name = name or settings.dev_user_name or email.split("@")[0]
        uid = uid or email

    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not email.lower().endswith("@" + settings.allowed_email_domain.lower()):
        raise HTTPException(status_code=403, detail="Domain not allowed")

    if not uid:
        uid = email
    if not name:
        name = email.split("@")[0]

    # Upsert user profile on every request (cheap for ~20 users).
    existing = db.get(User, uid)
    if not existing:
        existing = User(
            uid=uid,
            email=email,
            display_name=name,
            photo_url=photo,
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)
    elif existing.display_name != name or existing.photo_url != photo:
        existing.display_name = name
        existing.photo_url = photo
        db.commit()

    return CurrentUser(
        uid=uid,
        email=email,
        display_name=name,
        photo_url=photo,
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    return user
