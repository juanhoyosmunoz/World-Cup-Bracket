"""
football-data.org provider (v4) — free tier covers FIFA World Cup.

Replaces the former API-FOOTBALL provider. The function signatures
(fetch_teams, fetch_fixtures) and return shapes are unchanged so the
rest of the codebase doesn't need to change.
"""

from __future__ import annotations

import re

import httpx

BASE_URL = "https://api.football-data.org/v4"
TIMEOUT = 15.0

# football-data.org competition code for FIFA World Cup
COMPETITION = "WC"


async def fetch_teams(
    *, api_key: str, **_kwargs: object,
) -> list[dict]:
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"X-Auth-Token": api_key},
        timeout=TIMEOUT,
    ) as client:
        resp = await client.get(f"/competitions/{COMPETITION}/teams")
        resp.raise_for_status()
        data = resp.json()

    teams = data.get("teams", [])
    return [
        {
            "id": str(t["id"]),
            "name": t.get("name", ""),
            "shortName": t.get("tla") or t.get("shortName") or t.get("name", "")[:3].upper(),
            "flag": t.get("crest", ""),
            "group": _extract_group_from_area(t),
        }
        for t in teams
    ]


def _extract_group_from_area(team: dict) -> str | None:
    group = team.get("group")
    if group:
        m = re.search(r"Group ([A-L])", group, re.IGNORECASE)
        return m.group(1) if m else None
    return None


async def fetch_fixtures(
    *, api_key: str, **_kwargs: object,
) -> list[dict]:
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"X-Auth-Token": api_key},
        timeout=TIMEOUT,
    ) as client:
        resp = await client.get(f"/competitions/{COMPETITION}/matches")
        resp.raise_for_status()
        data = resp.json()

    matches = data.get("matches", [])
    matches.sort(key=lambda m: m.get("utcDate", ""))

    counters: dict[str, int] = {}

    def next_slot(stage: str) -> str:
        counters[stage] = counters.get(stage, 0) + 1
        if stage in ("FINAL", "THIRD"):
            return stage
        return f"{stage}-{counters[stage]}"

    out: list[dict] = []
    for m in matches:
        stage_raw = m.get("stage", "")
        group_raw = m.get("group")
        stage = _map_stage(stage_raw)
        slot = None if stage == "GROUP" else next_slot(stage)
        status = _map_status(m.get("status", "SCHEDULED"))

        home = m.get("homeTeam", {})
        away = m.get("awayTeam", {})
        score = m.get("score", {})
        ft = score.get("fullTime", {})

        home_goals = ft.get("home")
        away_goals = ft.get("away")
        if home_goals is None and status == "FINISHED":
            ht = score.get("halfTime", {})
            home_goals = ht.get("home")
            away_goals = ht.get("away")

        out.append(
            {
                "externalId": str(m["id"]),
                "stage": stage,
                "group": _extract_group_letter(group_raw) if stage == "GROUP" else None,
                "bracketSlot": slot,
                "homeTeamId": str(home["id"]) if home.get("id") else None,
                "awayTeamId": str(away["id"]) if away.get("id") else None,
                "kickoffISO": m.get("utcDate", ""),
                "venue": m.get("venue"),
                "status": status,
                "homeGoals": home_goals,
                "awayGoals": away_goals,
            }
        )
    return out


def _map_stage(stage: str) -> str:
    s = stage.upper().replace("_", " ")
    if "GROUP" in s:
        return "GROUP"
    if "ROUND OF 32" in s or "LAST 32" in s or "ROUND 32" in s:
        return "R32"
    if "ROUND OF 16" in s or "LAST 16" in s or "ROUND 16" in s:
        return "R16"
    if "QUARTER" in s:
        return "QF"
    if "SEMI" in s:
        return "SF"
    if "THIRD" in s or "3RD" in s:
        return "THIRD"
    if "FINAL" in s:
        return "FINAL"
    return "GROUP"


def _extract_group_letter(group_name: str | None) -> str | None:
    if not group_name:
        return None
    m = re.search(r"Group ([A-L])", group_name, re.IGNORECASE)
    if m:
        return m.group(1)
    m = re.search(r"GROUP_([A-L])", group_name, re.IGNORECASE)
    if m:
        return m.group(1)
    return None


def _map_status(s: str) -> str:
    s = s.upper()
    if s in ("FINISHED",):
        return "FINISHED"
    if s in ("IN_PLAY", "PAUSED", "LIVE"):
        return "LIVE"
    if s in ("POSTPONED", "CANCELLED", "SUSPENDED"):
        return "POSTPONED"
    return "SCHEDULED"
