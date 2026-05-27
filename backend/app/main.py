import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import admin, public, user

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def scheduled_sync():
    """Runs every 15 minutes — mirrors the Firebase scheduledSync function."""
    from .database import SessionLocal
    from .providers.apifootball import fetch_fixtures

    if not settings.apifootball_key:
        return

    db = SessionLocal()
    try:
        from .routers.admin import record_health_sync

        fxs = await fetch_fixtures(
            api_key=settings.apifootball_key,
            league_id=settings.apifootball_league_id,
            season=settings.apifootball_season,
        )

        from datetime import datetime, timezone

        from .models import Fixture, Result

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
                existing.stage = f["stage"]
                existing.group = f.get("group")
                existing.bracket_slot = f.get("bracketSlot")
                if f.get("homeTeamId") is not None:
                    existing.home_team_id = f["homeTeamId"]
                if f.get("awayTeamId") is not None:
                    existing.away_team_id = f["awayTeamId"]
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

            if (
                f["status"] == "FINISHED"
                and f.get("homeGoals") is not None
                and f.get("awayGoals") is not None
            ):
                hg, ag = f["homeGoals"], f["awayGoals"]
                outcome = (
                    "DRAW"
                    if hg == ag
                    else (f.get("homeTeamId") or "")
                    if hg > ag
                    else (f.get("awayTeamId") or "")
                )
                now = datetime.now(timezone.utc)
                existing_result = db.get(Result, fid)
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

            elif f["status"] == "LIVE":
                fixture = db.get(Fixture, fid)
                if fixture:
                    fixture.status = "LIVE"

        db.commit()

        from .routers.admin import _do_recompute_leaderboard

        _do_recompute_leaderboard(db)
        record_health_sync(db, "scheduledSync", True)

    except Exception as e:
        logger.error("scheduledSync failed: %s", e)
        try:
            from .routers.admin import record_health_sync

            record_health_sync(db, "scheduledSync", False, str(e))
        except Exception:
            pass
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    scheduler.add_job(scheduled_sync, "interval", minutes=15, id="sync")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="World Cup Bracket API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user.router)
app.include_router(public.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
