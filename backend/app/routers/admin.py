import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, require_admin
from ..config import settings
from ..database import get_db
from ..models import (
    AppConfig,
    Fixture,
    LeaderboardEntry,
    Result,
    SyncHealth,
    Team,
    User,
)
from ..providers.apifootball import fetch_fixtures, fetch_teams
from ..schemas import (
    AppConfigIn,
    AppConfigOut,
    ManualResultIn,
    SyncHealthOut,
    UserOut,
)
from ..scoring import aggregate_user_score, rank_scores

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def record_health(db: Session, task: str, ok: bool, error: str | None = None):
    db.add(SyncHealth(task=task, ok=ok, error=error, at=datetime.now(timezone.utc)))
    db.commit()


@router.post("/sync-teams")
async def sync_teams(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    try:
        teams = await fetch_teams(
            api_key=settings.apifootball_key,
            league_id=settings.apifootball_league_id,
            season=settings.apifootball_season,
        )
        for t in teams:
            existing = db.get(Team, t["id"])
            if existing:
                existing.name = t["name"]
                existing.short_name = t["shortName"]
                existing.flag = t["flag"]
                existing.group = t.get("group")
            else:
                db.add(
                    Team(
                        id=t["id"],
                        name=t["name"],
                        short_name=t["shortName"],
                        flag=t["flag"],
                        group=t.get("group"),
                    )
                )
        db.commit()
        await record_health(db, "syncTeams", True)
        return {"count": len(teams)}
    except Exception as e:
        await record_health(db, "syncTeams", False, str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-fixtures")
async def sync_fixtures(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    try:
        fxs = await fetch_fixtures(
            api_key=settings.apifootball_key,
            league_id=settings.apifootball_league_id,
            season=settings.apifootball_season,
        )
        lock_lead_ms = settings.lock_lead_minutes * 60 * 1000
        for f in fxs:
            kickoff = datetime.fromisoformat(f["kickoffISO"])
            lock_at = datetime.fromtimestamp(
                (kickoff.timestamp() * 1000 - lock_lead_ms) / 1000,
                tz=timezone.utc,
            )
            fid = f["externalId"]
            existing = db.get(Fixture, fid)
            if existing:
                existing.external_id = fid
                existing.stage = f["stage"]
                existing.group = f.get("group")
                existing.bracket_slot = f.get("bracketSlot")
                existing.home_team_id = f.get("homeTeamId")
                existing.away_team_id = f.get("awayTeamId")
                existing.kickoff = kickoff
                existing.lock_at = lock_at
                existing.status = f["status"]
                existing.venue = f.get("venue")
            else:
                db.add(
                    Fixture(
                        id=fid,
                        external_id=fid,
                        stage=f["stage"],
                        group=f.get("group"),
                        bracket_slot=f.get("bracketSlot"),
                        home_team_id=f.get("homeTeamId"),
                        away_team_id=f.get("awayTeamId"),
                        kickoff=kickoff,
                        lock_at=lock_at,
                        status=f["status"],
                        venue=f.get("venue"),
                    )
                )
        db.commit()
        await record_health(db, "syncFixtures", True)
        return {"count": len(fxs)}
    except Exception as e:
        await record_health(db, "syncFixtures", False, str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-results")
async def sync_results(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    try:
        fxs = await fetch_fixtures(
            api_key=settings.apifootball_key,
            league_id=settings.apifootball_league_id,
            season=settings.apifootball_season,
        )
        writes = 0
        for f in fxs:
            fid = f["externalId"]
            if (
                f["status"] == "FINISHED"
                and f.get("homeGoals") is not None
                and f.get("awayGoals") is not None
            ):
                hg, ag = f["homeGoals"], f["awayGoals"]
                if hg == ag:
                    outcome = "DRAW"
                elif hg > ag:
                    outcome = f.get("homeTeamId") or ""
                else:
                    outcome = f.get("awayTeamId") or ""

                existing_result = db.get(Result, fid)
                now = datetime.now(timezone.utc)
                if existing_result:
                    existing_result.home_goals = hg
                    existing_result.away_goals = ag
                    existing_result.outcome = outcome
                    existing_result.finalized_at = now
                    existing_result.source = "API"
                else:
                    db.add(
                        Result(
                            fixture_id=fid,
                            home_goals=hg,
                            away_goals=ag,
                            outcome=outcome,
                            finalized_at=now,
                            source="API",
                        )
                    )

                fixture = db.get(Fixture, fid)
                if fixture:
                    fixture.status = "FINISHED"
                writes += 1

            elif f["status"] == "LIVE":
                fixture = db.get(Fixture, fid)
                if fixture:
                    fixture.status = "LIVE"

        db.commit()
        await record_health(db, "syncResults", True)
        return {"writes": writes}
    except Exception as e:
        await record_health(db, "syncResults", False, str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recompute-leaderboard")
def recompute_leaderboard(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    return _do_recompute_leaderboard(db)


def _do_recompute_leaderboard(db: Session) -> dict:
    from ..models import Favorite, KnockoutBracket, Prediction

    users = {u.uid: u for u in db.scalars(select(User)).all()}
    fixtures = {f.id: f for f in db.scalars(select(Fixture)).all()}
    results = {r.fixture_id: r for r in db.scalars(select(Result)).all()}

    preds_by_uid: dict[str, list] = {}
    for p in db.scalars(select(Prediction)).all():
        preds_by_uid.setdefault(p.uid, []).append(p)

    favs = {f.uid: f for f in db.scalars(select(Favorite)).all()}
    brackets = {b.uid: b for b in db.scalars(select(KnockoutBracket)).all()}

    prev_ranks: dict[str, int] = {}
    for le in db.scalars(select(LeaderboardEntry)).all():
        prev_ranks[le.uid] = le.rank

    slot_results: dict[str, dict | None] = {}
    slot_winners: dict[str, str | None] = {}
    slot_losers: dict[str, str | None] = {}

    for fx in fixtures.values():
        if not fx.bracket_slot:
            continue
        r = results.get(fx.id)
        if r:
            slot_results[fx.bracket_slot] = {
                "homeGoals": r.home_goals,
                "awayGoals": r.away_goals,
            }
            if fx.home_team_id and fx.away_team_id:
                if r.home_goals > r.away_goals:
                    slot_winners[fx.bracket_slot] = fx.home_team_id
                    slot_losers[fx.bracket_slot] = fx.away_team_id
                elif r.away_goals > r.home_goals:
                    slot_winners[fx.bracket_slot] = fx.away_team_id
                    slot_losers[fx.bracket_slot] = fx.home_team_id

    final_res = slot_results.get("FINAL")
    final_actual = (
        {"homeGoals": final_res["homeGoals"], "awayGoals": final_res["awayGoals"]}
        if final_res
        else None
    )

    entries = []
    for uid, profile in users.items():
        preds = preds_by_uid.get(uid, [])
        fav = favs.get(uid)
        brk = brackets.get(uid)

        s = aggregate_user_score(
            uid=uid,
            predictions=preds,
            fixtures=fixtures,
            results=results,
            favorite=fav,
            bracket=brk,
            slot_results=slot_results,
            actual_winners=slot_winners,
            actual_losers=slot_losers,
            final_actual=final_actual,
        )
        entries.append(
            {
                "uid": uid,
                "display_name": profile.display_name,
                "photo_url": profile.photo_url,
                "previous_rank": prev_ranks.get(uid),
                **s,
            }
        )

    ranked = rank_scores(entries)
    now = datetime.now(timezone.utc)

    for r in ranked:
        existing = db.get(LeaderboardEntry, r["uid"])
        if existing:
            for key, val in r.items():
                if key != "uid":
                    setattr(existing, key, val)
            existing.updated_at = now
        else:
            db.add(LeaderboardEntry(**r, updated_at=now))

    db.commit()
    try:
        record_health_sync(db, "recomputeLeaderboard", True)
    except Exception:
        pass
    return {"users": len(ranked)}


def record_health_sync(db: Session, task: str, ok: bool, error: str | None = None):
    db.add(SyncHealth(task=task, ok=ok, error=error, at=datetime.now(timezone.utc)))
    db.commit()


@router.put("/config")
def update_config(
    body: AppConfigIn,
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> AppConfigOut:
    existing = db.get(AppConfig, "main")
    if existing:
        existing.favorite_lock_at = body.favoriteLockAt
        existing.knockout_lock_at = body.knockoutLockAt
        existing.tournament_start_at = body.tournamentStartAt
        existing.tournament_end_at = body.tournamentEndAt
        existing.phase = body.phase
    else:
        existing = AppConfig(
            id="main",
            favorite_lock_at=body.favoriteLockAt,
            knockout_lock_at=body.knockoutLockAt,
            tournament_start_at=body.tournamentStartAt,
            tournament_end_at=body.tournamentEndAt,
            phase=body.phase,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return AppConfigOut.from_orm_row(existing)


@router.put("/results/{fixture_id}")
def save_manual_result(
    fixture_id: str,
    body: ManualResultIn,
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    fixture = db.get(Fixture, fixture_id)
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if not fixture.home_team_id or not fixture.away_team_id:
        raise HTTPException(status_code=400, detail="Teams not yet determined")

    h, a = body.homeGoals, body.awayGoals
    outcome = "DRAW" if h == a else (fixture.home_team_id if h > a else fixture.away_team_id)
    now = datetime.now(timezone.utc)

    existing = db.get(Result, fixture_id)
    if existing:
        existing.home_goals = h
        existing.away_goals = a
        existing.outcome = outcome
        existing.finalized_at = now
        existing.source = "MANUAL"
    else:
        db.add(
            Result(
                fixture_id=fixture_id,
                home_goals=h,
                away_goals=a,
                outcome=outcome,
                finalized_at=now,
                source="MANUAL",
            )
        )

    fixture.status = "FINISHED"
    db.commit()

    _do_recompute_leaderboard(db)
    return {"ok": True}


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> list[UserOut]:
    rows = db.scalars(select(User)).all()
    return [UserOut.from_orm_row(r) for r in rows]


@router.get("/sync-health")
def get_sync_health(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
) -> list[SyncHealthOut]:
    rows = db.scalars(
        select(SyncHealth).order_by(SyncHealth.at.desc()).limit(50)
    ).all()
    return [SyncHealthOut.from_orm_row(r) for r in rows]
