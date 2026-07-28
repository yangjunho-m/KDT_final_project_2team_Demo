from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.db.models import UserAccount
from app.schemas.domain import User


def seed_demo_admin(db: Session) -> None:
    settings = get_settings()
    existing_user = get_user_by_username(db, settings.demo_admin_username)
    password_hash = hash_password(settings.demo_admin_password)

    if existing_user is None:
        db.add(
            UserAccount(
                username=settings.demo_admin_username,
                password_hash=password_hash,
                display_name="시연 관리자",
                role="ADMIN",
            )
        )
        db.commit()
        return

    if existing_user.password_hash != password_hash:
        existing_user.password_hash = password_hash
        db.commit()


def get_user_by_username(db: Session, username: str) -> UserAccount | None:
    statement = select(UserAccount).where(UserAccount.username == username)
    return db.execute(statement).scalar_one_or_none()


def authenticate_user(db: Session, username: str, password: str) -> UserAccount | None:
    user = get_user_by_username(db, username)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def to_user_schema(user: UserAccount) -> User:
    return User(
        id=f"USR-{user.id:03d}",
        username=user.username,
        displayName=user.display_name,
        roles=[user.role],
    )
