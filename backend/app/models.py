from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    short_name: Mapped[str] = mapped_column(String, nullable=False)
    flag: Mapped[str] = mapped_column(String, nullable=False)
    group: Mapped[str | None] = mapped_column(String, nullable=True)


class Fixture(Base):
    __tablename__ = "fixtures"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    external_id: Mapped[str | None] = mapped_column(String, nullable=True)
    stage: Mapped[str] = mapped_column(String, nullable=False)
    group: Mapped[str | None] = mapped_column(String, nullable=True)
    bracket_slot: Mapped[str | None] = mapped_column(String, nullable=True)
    home_team_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("teams.id"), nullable=True
    )
    away_team_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("teams.id"), nullable=True
    )
    kickoff: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lock_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="SCHEDULED")
    venue: Mapped[str | None] = mapped_column(String, nullable=True)


class Result(Base):
    __tablename__ = "results"

    fixture_id: Mapped[str] = mapped_column(
        String, ForeignKey("fixtures.id"), primary_key=True
    )
    home_goals: Mapped[int] = mapped_column(Integer, nullable=False)
    away_goals: Mapped[int] = mapped_column(Integer, nullable=False)
    outcome: Mapped[str] = mapped_column(String, nullable=False)
    finalized_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    source: Mapped[str] = mapped_column(String, nullable=False, default="API")


class User(Base):
    __tablename__ = "users"

    uid: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    uid: Mapped[str] = mapped_column(String, ForeignKey("users.uid"), nullable=False)
    fixture_id: Mapped[str] = mapped_column(
        String, ForeignKey("fixtures.id"), nullable=False
    )
    picked_outcome: Mapped[str] = mapped_column(String, nullable=False)
    home_goals: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_goals: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Favorite(Base):
    __tablename__ = "favorites"

    uid: Mapped[str] = mapped_column(
        String, ForeignKey("users.uid"), primary_key=True
    )
    team_id: Mapped[str] = mapped_column(
        String, ForeignKey("teams.id"), nullable=False
    )
    set_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class KnockoutBracket(Base):
    __tablename__ = "knockout_brackets"

    uid: Mapped[str] = mapped_column(
        String, ForeignKey("users.uid"), primary_key=True
    )
    picks: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard"

    uid: Mapped[str] = mapped_column(
        String, ForeignKey("users.uid"), primary_key=True
    )
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    total_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    group_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    knockout_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    favorite_bonus_points: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    exact_score_bonus_points: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    correct_outcomes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_exact_scores: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    final_score_delta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AppConfig(Base):
    __tablename__ = "app_config"

    id: Mapped[str] = mapped_column(String, primary_key=True, default="main")
    favorite_lock_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    knockout_lock_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    tournament_start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    tournament_end_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    phase: Mapped[str] = mapped_column(String, nullable=False, default="PRE")


class SyncHealth(Base):
    __tablename__ = "sync_health"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task: Mapped[str] = mapped_column(String, nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
