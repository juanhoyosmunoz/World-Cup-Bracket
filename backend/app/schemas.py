from datetime import datetime

from pydantic import BaseModel


class TeamOut(BaseModel):
    id: str
    name: str
    shortName: str
    flag: str
    group: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_row(cls, row) -> "TeamOut":
        return cls(
            id=row.id,
            name=row.name,
            shortName=row.short_name,
            flag=row.flag,
            group=row.group,
        )


class FixtureOut(BaseModel):
    id: str
    externalId: str | None = None
    stage: str
    group: str | None = None
    bracketSlot: str | None = None
    homeTeamId: str | None = None
    awayTeamId: str | None = None
    kickoff: str
    lockAt: str
    status: str
    venue: str | None = None

    @classmethod
    def from_orm_row(cls, row) -> "FixtureOut":
        return cls(
            id=row.id,
            externalId=row.external_id,
            stage=row.stage,
            group=row.group,
            bracketSlot=row.bracket_slot,
            homeTeamId=row.home_team_id,
            awayTeamId=row.away_team_id,
            kickoff=row.kickoff.isoformat(),
            lockAt=row.lock_at.isoformat(),
            status=row.status,
            venue=row.venue,
        )


class ResultOut(BaseModel):
    fixtureId: str
    homeGoals: int
    awayGoals: int
    outcome: str
    finalizedAt: str
    source: str

    @classmethod
    def from_orm_row(cls, row) -> "ResultOut":
        return cls(
            fixtureId=row.fixture_id,
            homeGoals=row.home_goals,
            awayGoals=row.away_goals,
            outcome=row.outcome,
            finalizedAt=row.finalized_at.isoformat(),
            source=row.source,
        )


class PredictionOut(BaseModel):
    uid: str
    fixtureId: str
    pickedOutcome: str
    homeGoals: int | None = None
    awayGoals: int | None = None
    updatedAt: str

    @classmethod
    def from_orm_row(cls, row) -> "PredictionOut":
        return cls(
            uid=row.uid,
            fixtureId=row.fixture_id,
            pickedOutcome=row.picked_outcome,
            homeGoals=row.home_goals,
            awayGoals=row.away_goals,
            updatedAt=row.updated_at.isoformat(),
        )


class PredictionIn(BaseModel):
    fixtureId: str
    pickedOutcome: str
    homeGoals: int | None = None
    awayGoals: int | None = None


class FavoriteOut(BaseModel):
    uid: str
    teamId: str
    setAt: str

    @classmethod
    def from_orm_row(cls, row) -> "FavoriteOut":
        return cls(
            uid=row.uid,
            teamId=row.team_id,
            setAt=row.set_at.isoformat(),
        )


class FavoriteIn(BaseModel):
    teamId: str


class BracketPick(BaseModel):
    teamId: str | None = None
    homeGoals: int | None = None
    awayGoals: int | None = None


class KnockoutBracketOut(BaseModel):
    uid: str
    picks: dict[str, BracketPick]
    submittedAt: str | None = None
    updatedAt: str

    @classmethod
    def from_orm_row(cls, row) -> "KnockoutBracketOut":
        picks = {}
        for slot, pick_data in (row.picks or {}).items():
            if isinstance(pick_data, dict):
                picks[slot] = BracketPick(**pick_data)
            else:
                picks[slot] = pick_data
        return cls(
            uid=row.uid,
            picks=picks,
            submittedAt=row.submitted_at.isoformat() if row.submitted_at else None,
            updatedAt=row.updated_at.isoformat(),
        )


class KnockoutBracketIn(BaseModel):
    picks: dict[str, BracketPick]
    submittedAt: str | None = None


class LeaderboardOut(BaseModel):
    uid: str
    displayName: str
    photoURL: str | None = None
    totalPoints: int
    groupPoints: int
    knockoutPoints: int
    favoriteBonusPoints: int
    exactScoreBonusPoints: int
    correctOutcomes: int
    correctExactScores: int
    finalScoreDelta: int | None = None
    previousRank: int | None = None
    rank: int
    updatedAt: str

    @classmethod
    def from_orm_row(cls, row) -> "LeaderboardOut":
        return cls(
            uid=row.uid,
            displayName=row.display_name,
            photoURL=row.photo_url,
            totalPoints=row.total_points,
            groupPoints=row.group_points,
            knockoutPoints=row.knockout_points,
            favoriteBonusPoints=row.favorite_bonus_points,
            exactScoreBonusPoints=row.exact_score_bonus_points,
            correctOutcomes=row.correct_outcomes,
            correctExactScores=row.correct_exact_scores,
            finalScoreDelta=row.final_score_delta,
            previousRank=row.previous_rank,
            rank=row.rank,
            updatedAt=row.updated_at.isoformat(),
        )


class AppConfigOut(BaseModel):
    favoriteLockAt: str
    knockoutLockAt: str
    tournamentStartAt: str
    tournamentEndAt: str
    phase: str

    @classmethod
    def from_orm_row(cls, row) -> "AppConfigOut":
        return cls(
            favoriteLockAt=row.favorite_lock_at.isoformat(),
            knockoutLockAt=row.knockout_lock_at.isoformat(),
            tournamentStartAt=row.tournament_start_at.isoformat(),
            tournamentEndAt=row.tournament_end_at.isoformat(),
            phase=row.phase,
        )


class AppConfigIn(BaseModel):
    favoriteLockAt: datetime
    knockoutLockAt: datetime
    tournamentStartAt: datetime
    tournamentEndAt: datetime
    phase: str


class ManualResultIn(BaseModel):
    homeGoals: int
    awayGoals: int


class UserOut(BaseModel):
    uid: str
    email: str
    displayName: str
    photoURL: str | None = None
    createdAt: str

    @classmethod
    def from_orm_row(cls, row) -> "UserOut":
        return cls(
            uid=row.uid,
            email=row.email,
            displayName=row.display_name,
            photoURL=row.photo_url,
            createdAt=row.created_at.isoformat(),
        )


class SyncHealthOut(BaseModel):
    id: int
    task: str
    ok: bool
    error: str | None = None
    at: str

    @classmethod
    def from_orm_row(cls, row) -> "SyncHealthOut":
        return cls(
            id=row.id,
            task=row.task,
            ok=row.ok,
            error=row.error,
            at=row.at.isoformat(),
        )
