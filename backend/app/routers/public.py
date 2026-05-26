from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, get_current_user
from ..database import get_db
from ..models import (
    AppConfig,
    Fixture,
    KnockoutBracket,
    LeaderboardEntry,
    Prediction,
    Result,
    Team,
)
from ..schemas import (
    AppConfigOut,
    FixtureOut,
    KnockoutBracketOut,
    LeaderboardOut,
    PredictionOut,
    ResultOut,
    TeamOut,
)

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/app-config")
def get_app_config(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> AppConfigOut | None:
    row = db.get(AppConfig, "main")
    return AppConfigOut.from_orm_row(row) if row else None


@router.get("/teams")
def get_teams(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> list[TeamOut]:
    rows = db.scalars(select(Team)).all()
    return [TeamOut.from_orm_row(r) for r in rows]


@router.get("/fixtures")
def get_fixtures(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> list[FixtureOut]:
    rows = db.scalars(select(Fixture).order_by(Fixture.kickoff)).all()
    return [FixtureOut.from_orm_row(r) for r in rows]


@router.get("/results")
def get_results(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> dict[str, ResultOut]:
    rows = db.scalars(select(Result)).all()
    return {r.fixture_id: ResultOut.from_orm_row(r) for r in rows}


@router.get("/leaderboard")
def get_leaderboard(
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> list[LeaderboardOut]:
    rows = db.scalars(
        select(LeaderboardEntry).order_by(LeaderboardEntry.total_points.desc())
    ).all()
    return [LeaderboardOut.from_orm_row(r) for r in rows]


@router.get("/predictions/fixture/{fixture_id}")
def get_predictions_for_fixture(
    fixture_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[PredictionOut]:
    fixture = db.get(Fixture, fixture_id)
    if not fixture:
        return []
    from datetime import datetime, timezone

    from ..utils import ensure_utc

    now = datetime.now(timezone.utc)
    locked = now >= ensure_utc(fixture.lock_at) or fixture.status in ("FINISHED", "LIVE")

    rows = db.scalars(
        select(Prediction).where(Prediction.fixture_id == fixture_id)
    ).all()

    out = []
    for r in rows:
        if r.uid == user.uid or user.is_admin or locked:
            out.append(PredictionOut.from_orm_row(r))
    return out


@router.get("/brackets/{uid}")
def get_bracket(
    uid: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> KnockoutBracketOut | None:
    row = db.get(KnockoutBracket, uid)
    if not row:
        return None

    if uid == user.uid or user.is_admin:
        return KnockoutBracketOut.from_orm_row(row)

    cfg = db.get(AppConfig, "main")
    if cfg:
        from datetime import datetime, timezone

        from ..utils import ensure_utc

        now = datetime.now(timezone.utc)
        if now >= ensure_utc(cfg.knockout_lock_at):
            return KnockoutBracketOut.from_orm_row(row)

    return None
