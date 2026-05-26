"""
Scoring logic — Python port of functions/src/scoring.ts.

Group stage:
  - Correct outcome: 3 pts
  - Correct exact score: 5 pts
  - Favorite team bonus: 2x multiplier on correct group predictions

Knockout (per correct pick, with bracket-line propagation):
  R32=5, R16=10, QF=20, SF=40, THIRD=50, FINAL=80.
"""

from __future__ import annotations

import re
from typing import Any

GROUP_POINTS_CORRECT_WINNER = 3
GROUP_POINTS_CORRECT_EXACT = 5

KO_POINTS: dict[str, int] = {
    "R32": 5,
    "R16": 10,
    "QF": 20,
    "SF": 40,
    "THIRD": 50,
    "FINAL": 80,
}


def feeder_slots(slot: str) -> tuple[str, str] | None:
    if slot == "FINAL":
        return ("SF-1", "SF-2")
    if slot == "THIRD":
        return ("SF-1", "SF-2")
    m = re.match(r"^(R32|R16|QF|SF)-(\d+)$", slot)
    if not m:
        return None
    stage, n_str = m.group(1), int(m.group(2))
    if stage == "R32":
        return None
    if stage == "R16":
        return (f"R32-{n_str * 2 - 1}", f"R32-{n_str * 2}")
    if stage == "QF":
        return (f"R16-{n_str * 2 - 1}", f"R16-{n_str * 2}")
    if stage == "SF":
        return (f"QF-{n_str * 2 - 1}", f"QF-{n_str * 2}")
    return None


def stage_of_slot(slot: str) -> str:
    if slot == "FINAL":
        return "FINAL"
    if slot == "THIRD":
        return "THIRD"
    return slot.split("-")[0]


def _line_intact(
    slot: str,
    team: str,
    picks: dict[str, dict],
    actual_winners: dict[str, str | None],
) -> bool:
    fs = feeder_slots(slot)
    if not fs or slot == "THIRD":
        return True
    matching_feeder = None
    for f in fs:
        pick = picks.get(f)
        if pick and pick.get("teamId") == team:
            matching_feeder = f
            break
    if not matching_feeder:
        return False
    if actual_winners.get(matching_feeder) != team:
        return False
    return _line_intact(matching_feeder, team, picks, actual_winners)


def aggregate_user_score(
    *,
    uid: str,
    predictions: list[Any],
    fixtures: dict[str, Any],
    results: dict[str, Any],
    favorite: Any | None,
    bracket: Any | None,
    slot_results: dict[str, dict | None],
    actual_winners: dict[str, str | None],
    actual_losers: dict[str, str | None],
    final_actual: dict | None,
) -> dict:
    group_points = 0
    favorite_bonus = 0
    exact_bonus = 0
    correct_outcomes = 0
    correct_exact = 0

    favorite_team_id = favorite.team_id if favorite else None

    for pred in predictions:
        fx = fixtures.get(pred.fixture_id)
        if not fx:
            continue
        r = results.get(pred.fixture_id)
        if not r:
            continue

        r_home = r.home_goals
        r_away = r.away_goals
        if r_home == r_away:
            actual_outcome = "DRAW"
        elif r_home > r_away:
            actual_outcome = fx.home_team_id or ""
        else:
            actual_outcome = fx.away_team_id or ""

        if pred.picked_outcome != actual_outcome:
            continue

        exact = (
            pred.home_goals is not None
            and pred.away_goals is not None
            and pred.home_goals == r_home
            and pred.away_goals == r_away
        )
        base = GROUP_POINTS_CORRECT_EXACT if exact else GROUP_POINTS_CORRECT_WINNER
        fav = favorite_team_id is not None and (
            fx.home_team_id == favorite_team_id
            or fx.away_team_id == favorite_team_id
        )
        awarded = base * 2 if fav else base

        group_points += awarded
        correct_outcomes += 1
        if exact:
            correct_exact += 1
        if fav:
            favorite_bonus += awarded - base
        if exact:
            exact_bonus += (2 if fav else 1) * (
                GROUP_POINTS_CORRECT_EXACT - GROUP_POINTS_CORRECT_WINNER
            )

    ko_points = 0
    final_score_delta: int | None = None

    if bracket:
        picks = bracket.picks if isinstance(bracket.picks, dict) else {}
        all_slots = (
            [f"R32-{i}" for i in range(1, 17)]
            + [f"R16-{i}" for i in range(1, 9)]
            + [f"QF-{i}" for i in range(1, 5)]
            + [f"SF-{i}" for i in range(1, 3)]
            + ["THIRD", "FINAL"]
        )

        for slot in all_slots:
            pick = picks.get(slot)
            if not pick or not pick.get("teamId"):
                continue

            team_id = pick["teamId"]
            stage = stage_of_slot(slot)

            if slot == "THIRD":
                actual_third_winner = actual_winners.get("THIRD")
                sf1_pick = picks.get("SF-1", {}).get("teamId")
                sf2_pick = picks.get("SF-2", {}).get("teamId")
                sf1_loser = actual_losers.get("SF-1")
                sf2_loser = actual_losers.get("SF-2")

                if team_id and sf1_pick and sf1_pick != team_id:
                    from_slot = "SF-1"
                elif team_id and sf2_pick and sf2_pick != team_id:
                    from_slot = "SF-2"
                else:
                    from_slot = None

                intact = False
                if from_slot is not None:
                    if from_slot == "SF-1":
                        intact = (
                            sf1_loser == team_id
                            and _line_intact("SF-1", sf1_pick, picks, actual_winners)
                        )
                    else:
                        intact = (
                            sf2_loser == team_id
                            and _line_intact("SF-2", sf2_pick, picks, actual_winners)
                        )

                if intact and actual_third_winner == team_id:
                    ko_points += KO_POINTS["THIRD"]
                    correct_outcomes += 1
                continue

            actual_winner = actual_winners.get(slot)
            if actual_winner != team_id:
                continue
            if not _line_intact(slot, team_id, picks, actual_winners):
                continue

            ko_points += KO_POINTS[stage]
            correct_outcomes += 1

            r = slot_results.get(slot)
            if (
                r
                and pick.get("homeGoals") is not None
                and pick.get("awayGoals") is not None
                and pick["homeGoals"] == r["homeGoals"]
                and pick["awayGoals"] == r["awayGoals"]
            ):
                correct_exact += 1

        final_pick = picks.get("FINAL")
        if (
            final_actual
            and final_pick
            and final_pick.get("homeGoals") is not None
            and final_pick.get("awayGoals") is not None
        ):
            final_score_delta = abs(
                final_pick["homeGoals"] - final_actual["homeGoals"]
            ) + abs(final_pick["awayGoals"] - final_actual["awayGoals"])

    return {
        "uid": uid,
        "group_points": group_points,
        "knockout_points": ko_points,
        "favorite_bonus_points": favorite_bonus,
        "exact_score_bonus_points": exact_bonus,
        "correct_outcomes": correct_outcomes,
        "correct_exact_scores": correct_exact,
        "total_points": group_points + ko_points,
        "final_score_delta": final_score_delta,
    }


def rank_scores(entries: list[dict]) -> list[dict]:
    sorted_entries = sorted(
        entries,
        key=lambda s: (
            -s["total_points"],
            s["final_score_delta"]
            if s["final_score_delta"] is not None
            else float("inf"),
            -s["correct_exact_scores"],
            -s["correct_outcomes"],
        ),
    )
    rank = 0
    prev_key = ""
    result = []
    for i, s in enumerate(sorted_entries):
        delta = s["final_score_delta"] if s["final_score_delta"] is not None else "x"
        key = f'{s["total_points"]}|{delta}|{s["correct_exact_scores"]}|{s["correct_outcomes"]}'
        if key != prev_key:
            rank = i + 1
        prev_key = key
        result.append({**s, "rank": rank})
    return result
