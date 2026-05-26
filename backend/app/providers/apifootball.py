"""
API-FOOTBALL provider — Python port of functions/src/providers/apifootball.ts.
"""

from __future__ import annotations

import re

import httpx

BASE_URL = "https://v3.football.api-sports.io"
TIMEOUT = 15.0


async def fetch_teams(
    *, api_key: str, league_id: int, season: int
) -> list[dict]:
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"x-apisports-key": api_key},
        timeout=TIMEOUT,
    ) as client:
        resp = await client.get(
            "/teams", params={"league": league_id, "season": season}
        )
        resp.raise_for_status()
        items = resp.json().get("response", [])

    return [
        {
            "id": str(it["team"]["id"]),
            "name": it["team"]["name"],
            "shortName": it["team"].get("code")
            or it["team"]["name"][:3].upper(),
            "flag": it["team"].get("logo", ""),
        }
        for it in items
    ]


async def fetch_fixtures(
    *, api_key: str, league_id: int, season: int
) -> list[dict]:
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"x-apisports-key": api_key},
        timeout=TIMEOUT,
    ) as client:
        resp = await client.get(
            "/fixtures", params={"league": league_id, "season": season}
        )
        resp.raise_for_status()
        items = resp.json().get("response", [])

    items.sort(key=lambda a: a["fixture"]["date"])

    counters: dict[str, int] = {}

    def next_slot(stage: str) -> str:
        counters[stage] = counters.get(stage, 0) + 1
        if stage in ("FINAL", "THIRD"):
            return stage
        return f"{stage}-{counters[stage]}"

    out: list[dict] = []
    for it in items:
        round_name: str = it.get("league", {}).get("round", "")
        stage = _map_stage(round_name)
        slot = None if stage == "GROUP" else next_slot(stage)
        status = _map_status(it.get("fixture", {}).get("status", {}).get("short", "NS"))

        home_id = it.get("teams", {}).get("home", {}).get("id")
        away_id = it.get("teams", {}).get("away", {}).get("id")

        out.append(
            {
                "externalId": str(it["fixture"]["id"]),
                "stage": stage,
                "group": _extract_group_letter(round_name) if stage == "GROUP" else None,
                "bracketSlot": slot,
                "homeTeamId": str(home_id) if home_id else None,
                "awayTeamId": str(away_id) if away_id else None,
                "kickoffISO": it["fixture"]["date"],
                "venue": it.get("fixture", {}).get("venue", {}).get("name"),
                "status": status,
                "homeGoals": it.get("goals", {}).get("home"),
                "awayGoals": it.get("goals", {}).get("away"),
            }
        )
    return out


def _map_stage(round_name: str) -> str:
    r = round_name.lower()
    if "group" in r:
        return "GROUP"
    if "round of 32" in r:
        return "R32"
    if "round of 16" in r:
        return "R16"
    if "quarter" in r:
        return "QF"
    if "semi" in r:
        return "SF"
    if "3rd" in r or "third" in r:
        return "THIRD"
    if "final" in r:
        return "FINAL"
    return "GROUP"


def _extract_group_letter(round_name: str) -> str | None:
    m = re.search(r"Group ([A-L])", round_name, re.IGNORECASE)
    return m.group(1) if m else None


def _map_status(s: str) -> str:
    if s in ("FT", "AET", "PEN"):
        return "FINISHED"
    if s in ("1H", "HT", "2H", "ET", "P", "LIVE"):
        return "LIVE"
    if s in ("PST", "CANC", "ABD", "AWD", "WO"):
        return "POSTPONED"
    return "SCHEDULED"
