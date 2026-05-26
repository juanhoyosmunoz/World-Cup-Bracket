from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, get_current_user
from ..database import get_db
from ..models import AppConfig, Favorite, Fixture, KnockoutBracket, Prediction
from ..utils import ensure_utc
from ..schemas import (
    FavoriteIn,
    FavoriteOut,
    KnockoutBracketIn,
    KnockoutBracketOut,
    PredictionIn,
    PredictionOut,
    UserOut,
)

router = APIRouter(prefix="/api", tags=["user"])


@router.get("/me")
def get_me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {
        "uid": user.uid,
        "email": user.email,
        "displayName": user.display_name,
        "photoURL": user.photo_url,
        "isAdmin": user.is_admin,
    }


@router.get("/predictions/me")
def get_my_predictions(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[PredictionOut]:
    rows = db.scalars(
        select(Prediction).where(Prediction.uid == user.uid)
    ).all()
    return [PredictionOut.from_orm_row(r) for r in rows]


@router.put("/predictions/{fixture_id}")
def save_prediction(
    fixture_id: str,
    body: PredictionIn,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> PredictionOut:
    fixture = db.get(Fixture, fixture_id)
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    now = datetime.now(timezone.utc)
    if now >= ensure_utc(fixture.lock_at) or fixture.status in ("FINISHED", "LIVE"):
        raise HTTPException(status_code=403, detail="Fixture is locked")

    pred_id = f"{user.uid}_{fixture_id}"
    existing = db.get(Prediction, pred_id)
    if existing:
        existing.picked_outcome = body.pickedOutcome
        existing.home_goals = body.homeGoals
        existing.away_goals = body.awayGoals
        existing.updated_at = now
    else:
        existing = Prediction(
            id=pred_id,
            uid=user.uid,
            fixture_id=fixture_id,
            picked_outcome=body.pickedOutcome,
            home_goals=body.homeGoals,
            away_goals=body.awayGoals,
            updated_at=now,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return PredictionOut.from_orm_row(existing)


@router.get("/favorites/me")
def get_my_favorite(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> FavoriteOut | None:
    row = db.get(Favorite, user.uid)
    return FavoriteOut.from_orm_row(row) if row else None


@router.put("/favorites")
def save_favorite(
    body: FavoriteIn,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> FavoriteOut:
    cfg = db.get(AppConfig, "main")
    if cfg:
        now = datetime.now(timezone.utc)
        if now >= ensure_utc(cfg.favorite_lock_at):
            raise HTTPException(status_code=403, detail="Favorite selection is locked")

    existing = db.get(Favorite, user.uid)
    now = datetime.now(timezone.utc)
    if existing:
        existing.team_id = body.teamId
        existing.set_at = now
    else:
        existing = Favorite(uid=user.uid, team_id=body.teamId, set_at=now)
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return FavoriteOut.from_orm_row(existing)


@router.get("/brackets/me")
def get_my_bracket(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> KnockoutBracketOut | None:
    row = db.get(KnockoutBracket, user.uid)
    return KnockoutBracketOut.from_orm_row(row) if row else None


@router.put("/brackets")
def save_bracket(
    body: KnockoutBracketIn,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> KnockoutBracketOut:
    cfg = db.get(AppConfig, "main")
    if cfg:
        now = datetime.now(timezone.utc)
        if now >= ensure_utc(cfg.knockout_lock_at):
            raise HTTPException(status_code=403, detail="Knockout bracket is locked")

    picks_dict = {
        slot: pick.model_dump() for slot, pick in body.picks.items()
    }

    now = datetime.now(timezone.utc)
    existing = db.get(KnockoutBracket, user.uid)
    if existing:
        merged = {**(existing.picks or {}), **picks_dict}
        existing.picks = merged
        existing.updated_at = now
    else:
        existing = KnockoutBracket(
            uid=user.uid,
            picks=picks_dict,
            updated_at=now,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return KnockoutBracketOut.from_orm_row(existing)
