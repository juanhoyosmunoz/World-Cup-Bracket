"""
Comprehensive tests for the scoring logic.
Verifies the Python port matches the original TypeScript implementation.
"""
import sys
sys.path.insert(0, ".")

from app.scoring import (
    aggregate_user_score,
    rank_scores,
    feeder_slots,
    stage_of_slot,
    GROUP_POINTS_CORRECT_WINNER,
    GROUP_POINTS_CORRECT_EXACT,
    KO_POINTS,
)


# --- Helper: mock ORM-like objects with attribute access ---------------------

class Obj:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


# --- Test feeder_slots -------------------------------------------------------

def test_feeder_slots():
    assert feeder_slots("R32-1") is None, "R32 has no feeders"
    assert feeder_slots("R16-1") == ("R32-1", "R32-2")
    assert feeder_slots("R16-4") == ("R32-7", "R32-8")
    assert feeder_slots("QF-1") == ("R16-1", "R16-2")
    assert feeder_slots("QF-3") == ("R16-5", "R16-6")
    assert feeder_slots("SF-1") == ("QF-1", "QF-2")
    assert feeder_slots("SF-2") == ("QF-3", "QF-4")
    assert feeder_slots("FINAL") == ("SF-1", "SF-2")
    assert feeder_slots("THIRD") == ("SF-1", "SF-2")
    print("  feeder_slots: OK")


def test_stage_of_slot():
    assert stage_of_slot("R32-5") == "R32"
    assert stage_of_slot("R16-3") == "R16"
    assert stage_of_slot("QF-2") == "QF"
    assert stage_of_slot("SF-1") == "SF"
    assert stage_of_slot("THIRD") == "THIRD"
    assert stage_of_slot("FINAL") == "FINAL"
    print("  stage_of_slot: OK")


# --- Test group scoring ------------------------------------------------------

def test_group_scoring_correct_winner():
    """User picks the right winner but wrong exact score -> 3 pts."""
    fixtures = {
        "f1": Obj(id="f1", stage="GROUP", home_team_id="ARG", away_team_id="BRA",
                   kickoff="2026-06-11T20:00:00Z", lock_at="2026-06-11T19:00:00Z",
                   status="FINISHED", bracket_slot=None)
    }
    results = {
        "f1": Obj(fixture_id="f1", home_goals=2, away_goals=1, outcome="ARG")
    }
    preds = [Obj(uid="u1", fixture_id="f1", picked_outcome="ARG", home_goals=3, away_goals=0,
                 updated_at="")]

    s = aggregate_user_score(
        uid="u1", predictions=preds, fixtures=fixtures, results=results,
        favorite=None, bracket=None, slot_results={},
        actual_winners={}, actual_losers={}, final_actual=None,
    )
    assert s["group_points"] == GROUP_POINTS_CORRECT_WINNER, f"Expected {GROUP_POINTS_CORRECT_WINNER}, got {s['group_points']}"
    assert s["correct_outcomes"] == 1
    assert s["correct_exact_scores"] == 0
    print("  group correct winner (no exact): OK")


def test_group_scoring_exact_score():
    """User picks the exact score -> 5 pts."""
    fixtures = {
        "f1": Obj(id="f1", stage="GROUP", home_team_id="ARG", away_team_id="BRA",
                   kickoff="2026-06-11T20:00:00Z", lock_at="2026-06-11T19:00:00Z",
                   status="FINISHED", bracket_slot=None)
    }
    results = {
        "f1": Obj(fixture_id="f1", home_goals=2, away_goals=1, outcome="ARG")
    }
    preds = [Obj(uid="u1", fixture_id="f1", picked_outcome="ARG", home_goals=2, away_goals=1,
                 updated_at="")]

    s = aggregate_user_score(
        uid="u1", predictions=preds, fixtures=fixtures, results=results,
        favorite=None, bracket=None, slot_results={},
        actual_winners={}, actual_losers={}, final_actual=None,
    )
    assert s["group_points"] == GROUP_POINTS_CORRECT_EXACT, f"Expected {GROUP_POINTS_CORRECT_EXACT}, got {s['group_points']}"
    assert s["correct_exact_scores"] == 1
    print("  group exact score: OK")


def test_group_scoring_wrong_pick():
    """User picks wrong outcome -> 0 pts."""
    fixtures = {
        "f1": Obj(id="f1", stage="GROUP", home_team_id="ARG", away_team_id="BRA",
                   kickoff="2026-06-11T20:00:00Z", lock_at="2026-06-11T19:00:00Z",
                   status="FINISHED", bracket_slot=None)
    }
    results = {
        "f1": Obj(fixture_id="f1", home_goals=2, away_goals=1, outcome="ARG")
    }
    preds = [Obj(uid="u1", fixture_id="f1", picked_outcome="BRA", home_goals=0, away_goals=3,
                 updated_at="")]

    s = aggregate_user_score(
        uid="u1", predictions=preds, fixtures=fixtures, results=results,
        favorite=None, bracket=None, slot_results={},
        actual_winners={}, actual_losers={}, final_actual=None,
    )
    assert s["group_points"] == 0
    assert s["correct_outcomes"] == 0
    print("  group wrong pick: OK")


def test_group_scoring_draw():
    """User picks draw correctly -> 3 pts (or 5 with exact)."""
    fixtures = {
        "f1": Obj(id="f1", stage="GROUP", home_team_id="ARG", away_team_id="BRA",
                   kickoff="2026-06-11T20:00:00Z", lock_at="2026-06-11T19:00:00Z",
                   status="FINISHED", bracket_slot=None)
    }
    results = {
        "f1": Obj(fixture_id="f1", home_goals=1, away_goals=1, outcome="DRAW")
    }
    preds = [Obj(uid="u1", fixture_id="f1", picked_outcome="DRAW", home_goals=1, away_goals=1,
                 updated_at="")]

    s = aggregate_user_score(
        uid="u1", predictions=preds, fixtures=fixtures, results=results,
        favorite=None, bracket=None, slot_results={},
        actual_winners={}, actual_losers={}, final_actual=None,
    )
    assert s["group_points"] == GROUP_POINTS_CORRECT_EXACT  # 5 (exact draw)
    print("  group draw exact: OK")


def test_group_scoring_favorite_bonus():
    """Favorite team doubles the points: 3 -> 6, 5 -> 10."""
    fixtures = {
        "f1": Obj(id="f1", stage="GROUP", home_team_id="ARG", away_team_id="BRA",
                   kickoff="2026-06-11T20:00:00Z", lock_at="2026-06-11T19:00:00Z",
                   status="FINISHED", bracket_slot=None),
        "f2": Obj(id="f2", stage="GROUP", home_team_id="MEX", away_team_id="ARG",
                   kickoff="2026-06-12T20:00:00Z", lock_at="2026-06-12T19:00:00Z",
                   status="FINISHED", bracket_slot=None),
    }
    results = {
        "f1": Obj(fixture_id="f1", home_goals=2, away_goals=1, outcome="ARG"),
        "f2": Obj(fixture_id="f2", home_goals=0, away_goals=1, outcome="ARG"),
    }
    preds = [
        Obj(uid="u1", fixture_id="f1", picked_outcome="ARG", home_goals=3, away_goals=0, updated_at=""),
        Obj(uid="u1", fixture_id="f2", picked_outcome="ARG", home_goals=0, away_goals=1, updated_at=""),
    ]

    s = aggregate_user_score(
        uid="u1", predictions=preds, fixtures=fixtures, results=results,
        favorite=Obj(uid="u1", team_id="ARG", set_at=""),
        bracket=None, slot_results={},
        actual_winners={}, actual_losers={}, final_actual=None,
    )
    # f1: ARG plays, correct winner, no exact -> 3*2=6
    # f2: ARG plays, correct winner + exact -> 5*2=10
    assert s["group_points"] == 16, f"Expected 16, got {s['group_points']}"
    assert s["favorite_bonus_points"] == 8, f"Expected 8 bonus, got {s['favorite_bonus_points']}"
    print("  group favorite bonus (2x): OK")


def test_group_scoring_no_favorite_on_unrelated_match():
    """Favorite bonus only applies when favorite team is in the match."""
    fixtures = {
        "f1": Obj(id="f1", stage="GROUP", home_team_id="GER", away_team_id="FRA",
                   kickoff="2026-06-11T20:00:00Z", lock_at="2026-06-11T19:00:00Z",
                   status="FINISHED", bracket_slot=None)
    }
    results = {
        "f1": Obj(fixture_id="f1", home_goals=2, away_goals=1, outcome="GER")
    }
    preds = [Obj(uid="u1", fixture_id="f1", picked_outcome="GER", home_goals=2, away_goals=1, updated_at="")]

    s = aggregate_user_score(
        uid="u1", predictions=preds, fixtures=fixtures, results=results,
        favorite=Obj(uid="u1", team_id="ARG", set_at=""),
        bracket=None, slot_results={},
        actual_winners={}, actual_losers={}, final_actual=None,
    )
    # ARG not playing -> no bonus
    assert s["group_points"] == GROUP_POINTS_CORRECT_EXACT  # 5
    assert s["favorite_bonus_points"] == 0
    print("  favorite no bonus on unrelated match: OK")


# --- Test knockout scoring ---------------------------------------------------

def test_ko_scoring_r32_correct():
    """Correct R32 pick -> 5 pts."""
    s = aggregate_user_score(
        uid="u1", predictions=[], fixtures={}, results={},
        favorite=None,
        bracket=Obj(uid="u1", picks={
            "R32-1": {"teamId": "ARG", "homeGoals": None, "awayGoals": None},
        }),
        slot_results={},
        actual_winners={"R32-1": "ARG"},
        actual_losers={"R32-1": "BRA"},
        final_actual=None,
    )
    assert s["knockout_points"] == KO_POINTS["R32"]  # 5
    print("  KO R32 correct: OK")


def test_ko_scoring_line_intact():
    """R16 pick only scores if R32 feeder was also correct (line intact)."""
    s = aggregate_user_score(
        uid="u1", predictions=[], fixtures={}, results={},
        favorite=None,
        bracket=Obj(uid="u1", picks={
            "R32-1": {"teamId": "ARG", "homeGoals": None, "awayGoals": None},
            "R32-2": {"teamId": "GER", "homeGoals": None, "awayGoals": None},
            "R16-1": {"teamId": "ARG", "homeGoals": None, "awayGoals": None},
        }),
        slot_results={},
        actual_winners={
            "R32-1": "ARG",
            "R32-2": "GER",
            "R16-1": "ARG",
        },
        actual_losers={
            "R32-1": "BRA",
            "R32-2": "FRA",
            "R16-1": "GER",
        },
        final_actual=None,
    )
    # R32-1 correct: 5 pts, R32-2 correct: 5 pts, R16-1 correct+intact: 10 pts
    assert s["knockout_points"] == 5 + 5 + 10, f"Expected 20, got {s['knockout_points']}"
    print("  KO line intact R16: OK")


def test_ko_scoring_broken_line():
    """R16 pick doesn't score if R32 feeder was wrong (broken line)."""
    s = aggregate_user_score(
        uid="u1", predictions=[], fixtures={}, results={},
        favorite=None,
        bracket=Obj(uid="u1", picks={
            "R32-1": {"teamId": "BRA", "homeGoals": None, "awayGoals": None},
            "R32-2": {"teamId": "GER", "homeGoals": None, "awayGoals": None},
            "R16-1": {"teamId": "ARG", "homeGoals": None, "awayGoals": None},
        }),
        slot_results={},
        actual_winners={
            "R32-1": "ARG",   # user picked BRA, was wrong
            "R32-2": "GER",
            "R16-1": "ARG",   # correct winner, BUT user didn't pick ARG at R32-1
        },
        actual_losers={
            "R32-1": "BRA",
            "R32-2": "FRA",
            "R16-1": "GER",
        },
        final_actual=None,
    )
    # R32-1 wrong: 0, R32-2 correct: 5, R16-1 line broken: 0
    assert s["knockout_points"] == 5, f"Expected 5, got {s['knockout_points']}"
    print("  KO broken line: OK")


def test_ko_deep_line():
    """Full bracket run: R32 -> R16 -> QF -> SF -> FINAL, all correct."""
    picks = {
        "R32-1": {"teamId": "ARG"},
        "R32-2": {"teamId": "GER"},
        "R16-1": {"teamId": "ARG"},
        "R32-3": {"teamId": "BRA"},
        "R32-4": {"teamId": "FRA"},
        "R16-2": {"teamId": "BRA"},
        "QF-1":  {"teamId": "ARG"},
        "R32-5": {"teamId": "ESP"},
        "R32-6": {"teamId": "ENG"},
        "R16-3": {"teamId": "ESP"},
        "R32-7": {"teamId": "NED"},
        "R32-8": {"teamId": "POR"},
        "R16-4": {"teamId": "NED"},
        "QF-2":  {"teamId": "ESP"},
        "SF-1":  {"teamId": "ARG"},
        # Need SF-2 feeders
        "R32-9":  {"teamId": "URU"},
        "R32-10": {"teamId": "COL"},
        "R16-5":  {"teamId": "URU"},
        "R32-11": {"teamId": "MEX"},
        "R32-12": {"teamId": "USA"},
        "R16-6":  {"teamId": "MEX"},
        "QF-3":   {"teamId": "URU"},
        "R32-13": {"teamId": "JPN"},
        "R32-14": {"teamId": "KOR"},
        "R16-7":  {"teamId": "JPN"},
        "R32-15": {"teamId": "SEN"},
        "R32-16": {"teamId": "MAR"},
        "R16-8":  {"teamId": "SEN"},
        "QF-4":   {"teamId": "JPN"},
        "SF-2":   {"teamId": "URU"},
        "FINAL":  {"teamId": "ARG", "homeGoals": 2, "awayGoals": 1},
    }
    actual_winners = {k: v["teamId"] for k, v in picks.items() if v.get("teamId")}
    actual_losers = {}  # not needed for this test

    s = aggregate_user_score(
        uid="u1", predictions=[], fixtures={}, results={},
        favorite=None,
        bracket=Obj(uid="u1", picks=picks),
        slot_results={},
        actual_winners=actual_winners,
        actual_losers=actual_losers,
        final_actual={"homeGoals": 2, "awayGoals": 1},
    )
    # All 32 slots correct. Total:
    # 16*R32(5) + 8*R16(10) + 4*QF(20) + 2*SF(40) + FINAL(80)
    # = 80 + 80 + 80 + 80 + 80 = 400
    # (THIRD not picked)
    expected = 16*5 + 8*10 + 4*20 + 2*40 + 80
    assert s["knockout_points"] == expected, f"Expected {expected}, got {s['knockout_points']}"
    assert s["final_score_delta"] == 0, "Exact final score -> delta 0"
    print(f"  KO full bracket ({expected} pts): OK")


def test_final_score_delta():
    """Final score tiebreaker calculation."""
    picks = {
        "FINAL": {"teamId": "ARG", "homeGoals": 3, "awayGoals": 1},
    }
    s = aggregate_user_score(
        uid="u1", predictions=[], fixtures={}, results={},
        favorite=None,
        bracket=Obj(uid="u1", picks=picks),
        slot_results={},
        actual_winners={"FINAL": "ARG"},
        actual_losers={"FINAL": "BRA"},
        final_actual={"homeGoals": 2, "awayGoals": 0},
    )
    # |3-2| + |1-0| = 2
    assert s["final_score_delta"] == 2, f"Expected 2, got {s['final_score_delta']}"
    print("  final score delta: OK")


# --- Test ranking ------------------------------------------------------------

def test_ranking_simple():
    entries = [
        {"uid": "a", "total_points": 30, "final_score_delta": None,
         "correct_exact_scores": 2, "correct_outcomes": 5,
         "group_points": 20, "knockout_points": 10,
         "favorite_bonus_points": 0, "exact_score_bonus_points": 0},
        {"uid": "b", "total_points": 50, "final_score_delta": None,
         "correct_exact_scores": 3, "correct_outcomes": 8,
         "group_points": 30, "knockout_points": 20,
         "favorite_bonus_points": 0, "exact_score_bonus_points": 0},
        {"uid": "c", "total_points": 50, "final_score_delta": 2,
         "correct_exact_scores": 4, "correct_outcomes": 7,
         "group_points": 35, "knockout_points": 15,
         "favorite_bonus_points": 0, "exact_score_bonus_points": 0},
    ]
    ranked = rank_scores(entries)
    assert ranked[0]["uid"] == "c", "c has same pts as b but lower delta"
    assert ranked[0]["rank"] == 1
    assert ranked[1]["uid"] == "b", "b has same pts but delta=None (infinity)"
    assert ranked[1]["rank"] == 2
    assert ranked[2]["uid"] == "a"
    assert ranked[2]["rank"] == 3
    print("  ranking with tiebreaker: OK")


def test_ranking_tied():
    entries = [
        {"uid": "a", "total_points": 40, "final_score_delta": None,
         "correct_exact_scores": 2, "correct_outcomes": 5,
         "group_points": 20, "knockout_points": 20,
         "favorite_bonus_points": 0, "exact_score_bonus_points": 0},
        {"uid": "b", "total_points": 40, "final_score_delta": None,
         "correct_exact_scores": 2, "correct_outcomes": 5,
         "group_points": 25, "knockout_points": 15,
         "favorite_bonus_points": 0, "exact_score_bonus_points": 0},
    ]
    ranked = rank_scores(entries)
    assert ranked[0]["rank"] == ranked[1]["rank"] == 1, "Same stats -> same rank"
    print("  ranking tied: OK")


# --- Test multiple matches combined ------------------------------------------

def test_combined_scoring():
    """Multiple group matches + knockout to verify total aggregation."""
    fixtures = {
        "f1": Obj(id="f1", stage="GROUP", home_team_id="ARG", away_team_id="BRA",
                   status="FINISHED", bracket_slot=None,
                   kickoff="2026-06-11T20:00:00Z", lock_at="2026-06-11T19:00:00Z"),
        "f2": Obj(id="f2", stage="GROUP", home_team_id="GER", away_team_id="FRA",
                   status="FINISHED", bracket_slot=None,
                   kickoff="2026-06-12T20:00:00Z", lock_at="2026-06-12T19:00:00Z"),
        "f3": Obj(id="f3", stage="GROUP", home_team_id="MEX", away_team_id="USA",
                   status="FINISHED", bracket_slot=None,
                   kickoff="2026-06-13T20:00:00Z", lock_at="2026-06-13T19:00:00Z"),
    }
    results = {
        "f1": Obj(fixture_id="f1", home_goals=2, away_goals=1, outcome="ARG"),
        "f2": Obj(fixture_id="f2", home_goals=0, away_goals=0, outcome="DRAW"),
        "f3": Obj(fixture_id="f3", home_goals=1, away_goals=3, outcome="USA"),
    }
    preds = [
        Obj(uid="u1", fixture_id="f1", picked_outcome="ARG", home_goals=2, away_goals=1, updated_at=""),   # exact 5
        Obj(uid="u1", fixture_id="f2", picked_outcome="DRAW", home_goals=1, away_goals=1, updated_at=""),   # winner 3
        Obj(uid="u1", fixture_id="f3", picked_outcome="MEX", home_goals=2, away_goals=0, updated_at=""),    # wrong 0
    ]

    s = aggregate_user_score(
        uid="u1", predictions=preds, fixtures=fixtures, results=results,
        favorite=Obj(uid="u1", team_id="ARG", set_at=""),
        bracket=Obj(uid="u1", picks={
            "R32-1": {"teamId": "ARG"},
        }),
        slot_results={},
        actual_winners={"R32-1": "ARG"},
        actual_losers={"R32-1": "BRA"},
        final_actual=None,
    )
    # f1: ARG is favorite, exact match -> 5*2=10
    # f2: no favorite involved, correct draw (not exact since 0-0 vs 1-1) -> 3
    # f3: wrong -> 0
    # KO: R32-1 correct -> 5
    assert s["group_points"] == 13, f"Expected 13, got {s['group_points']}"
    assert s["knockout_points"] == 5
    assert s["total_points"] == 18, f"Expected 18, got {s['total_points']}"
    assert s["correct_outcomes"] == 3  # 2 group + 1 KO
    assert s["correct_exact_scores"] == 1
    print("  combined scoring: OK")


# --- Run all tests -----------------------------------------------------------

if __name__ == "__main__":
    print("=== Scoring Tests ===")
    test_feeder_slots()
    test_stage_of_slot()
    print()

    print("=== Group Stage Scoring ===")
    test_group_scoring_correct_winner()
    test_group_scoring_exact_score()
    test_group_scoring_wrong_pick()
    test_group_scoring_draw()
    test_group_scoring_favorite_bonus()
    test_group_scoring_no_favorite_on_unrelated_match()
    print()

    print("=== Knockout Scoring ===")
    test_ko_scoring_r32_correct()
    test_ko_scoring_line_intact()
    test_ko_scoring_broken_line()
    test_ko_deep_line()
    test_final_score_delta()
    print()

    print("=== Ranking ===")
    test_ranking_simple()
    test_ranking_tied()
    print()

    print("=== Combined ===")
    test_combined_scoring()
    print()

    print("ALL TESTS PASSED")
