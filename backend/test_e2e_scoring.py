"""
End-to-end integration test: full user lifecycle through the API.

Simulates the real flow:
1. Config setup (lock times in the future)
2. Seed teams + fixtures (group stage & knockout)
3. Two users make group-stage predictions
4. One user picks a favorite team
5. Both users submit knockout brackets
6. Results arrive (manual entry via admin endpoint)
7. Recompute leaderboard
8. Verify points are exactly correct per the scoring rules
"""
import sys
sys.path.insert(0, ".")

import os
os.environ["DATABASE_URL"] = "sqlite:///test_e2e.db"
os.environ["DEV_USER_EMAIL"] = ""
os.environ["DEV_USER_NAME"] = ""
os.environ["ADMIN_EMAILS"] = "alice@antenna.live,bob@antenna.live"
os.environ["ALLOWED_EMAIL_DOMAIN"] = "antenna.live"

from app.config import Settings
import app.config
app.config.settings = Settings()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app
from datetime import datetime
from app.models import Team, Fixture, User

engine = create_engine("sqlite:///test_e2e.db", connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine, autoflush=False)
Base.metadata.create_all(bind=engine)

def override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_db

from fastapi.testclient import TestClient


def as_user(email: str, name: str) -> TestClient:
    return TestClient(app, headers={
        "X-Auth-User-Email": email,
        "X-Auth-User-Id": email,
        "X-Auth-User-Name": name,
    })

alice = as_user("alice@antenna.live", "Alice")
bob = as_user("bob@antenna.live", "Bob")

# ------------------------------------------------------------------
# 1. Seed config with future locks
# ------------------------------------------------------------------
def step_config():
    r = alice.put("/api/admin/config", json={
        "favoriteLockAt": "2030-06-11T19:00:00Z",
        "knockoutLockAt": "2030-06-29T19:00:00Z",
        "tournamentStartAt": "2030-06-11T20:00:00Z",
        "tournamentEndAt": "2030-07-19T22:00:00Z",
        "phase": "GROUP",
    })
    assert r.status_code == 200
    print("  config set: OK")

# ------------------------------------------------------------------
# 2. Seed teams and fixtures directly in DB
# ------------------------------------------------------------------
def step_seed():
    db = TestSession()

    teams = [
        Team(id="ARG", name="Argentina", short_name="ARG", flag="🇦🇷", group="A"),
        Team(id="MEX", name="Mexico", short_name="MEX", flag="🇲🇽", group="A"),
        Team(id="BRA", name="Brazil", short_name="BRA", flag="🇧🇷", group="B"),
        Team(id="GER", name="Germany", short_name="GER", flag="🇩🇪", group="B"),
        Team(id="FRA", name="France", short_name="FRA", flag="🇫🇷", group="C"),
        Team(id="ESP", name="Spain", short_name="ESP", flag="🇪🇸", group="D"),
    ]
    for t in teams:
        db.merge(t)

    dt = datetime.fromisoformat
    fixtures = [
        Fixture(
            id="G-A1", stage="GROUP", group="A",
            home_team_id="ARG", away_team_id="MEX",
            kickoff=dt("2030-06-12T18:00:00"), lock_at=dt("2030-06-12T17:00:00"),
            status="SCHEDULED",
        ),
        Fixture(
            id="G-B1", stage="GROUP", group="B",
            home_team_id="BRA", away_team_id="GER",
            kickoff=dt("2030-06-12T21:00:00"), lock_at=dt("2030-06-12T20:00:00"),
            status="SCHEDULED",
        ),
        Fixture(
            id="G-A2", stage="GROUP", group="A",
            home_team_id="MEX", away_team_id="ARG",
            kickoff=dt("2030-06-15T18:00:00"), lock_at=dt("2030-06-15T17:00:00"),
            status="SCHEDULED",
        ),
        Fixture(
            id="KO-R32-1", stage="R32", bracket_slot="R32-1",
            home_team_id="ARG", away_team_id="BRA",
            kickoff=dt("2030-06-25T18:00:00"), lock_at=dt("2030-06-25T17:00:00"),
            status="SCHEDULED",
        ),
        Fixture(
            id="KO-R32-2", stage="R32", bracket_slot="R32-2",
            home_team_id="GER", away_team_id="FRA",
            kickoff=dt("2030-06-25T21:00:00"), lock_at=dt("2030-06-25T20:00:00"),
            status="SCHEDULED",
        ),
        Fixture(
            id="KO-R16-1", stage="R16", bracket_slot="R16-1",
            home_team_id="ARG", away_team_id="GER",
            kickoff=dt("2030-06-28T18:00:00"), lock_at=dt("2030-06-28T17:00:00"),
            status="SCHEDULED",
        ),
    ]
    for f in fixtures:
        db.merge(f)

    db.commit()
    db.close()

    r = alice.get("/api/teams")
    assert len(r.json()) == 6
    r = alice.get("/api/fixtures")
    assert len(r.json()) == 6
    print("  seeded 6 teams + 6 fixtures: OK")

# ------------------------------------------------------------------
# 3. Users make group-stage predictions
# ------------------------------------------------------------------
def step_predictions():
    # Alice predicts Group A match 1: ARG wins 2-1 (correct outcome + exact score)
    r = alice.put("/api/predictions/G-A1", json={
        "fixtureId": "G-A1",
        "pickedOutcome": "ARG",
        "homeGoals": 2,
        "awayGoals": 1,
    })
    assert r.status_code == 200, f"Alice G-A1: {r.status_code} {r.text}"

    # Alice predicts Group B match 1: BRA wins 3-0 (correct outcome, wrong score)
    r = alice.put("/api/predictions/G-B1", json={
        "fixtureId": "G-B1",
        "pickedOutcome": "BRA",
        "homeGoals": 3,
        "awayGoals": 0,
    })
    assert r.status_code == 200

    # Alice predicts Group A match 2: Draw 1-1 (wrong - actual will be ARG 1-0)
    r = alice.put("/api/predictions/G-A2", json={
        "fixtureId": "G-A2",
        "pickedOutcome": "DRAW",
        "homeGoals": 1,
        "awayGoals": 1,
    })
    assert r.status_code == 200

    # Bob predicts Group A match 1: MEX wins 0-1 (wrong)
    r = bob.put("/api/predictions/G-A1", json={
        "fixtureId": "G-A1",
        "pickedOutcome": "MEX",
        "homeGoals": 0,
        "awayGoals": 1,
    })
    assert r.status_code == 200

    # Bob predicts Group B match 1: Draw 1-1 (correct outcome + exact score)
    r = bob.put("/api/predictions/G-B1", json={
        "fixtureId": "G-B1",
        "pickedOutcome": "DRAW",
        "homeGoals": 1,
        "awayGoals": 1,
    })
    assert r.status_code == 200

    # Verify predictions saved
    r = alice.get("/api/predictions/me")
    assert len(r.json()) == 3
    r = bob.get("/api/predictions/me")
    assert len(r.json()) == 2

    print("  predictions saved (Alice: 3, Bob: 2): OK")

# ------------------------------------------------------------------
# 4. Favorites
# ------------------------------------------------------------------
def step_favorites():
    # Alice picks ARG as favorite
    r = alice.put("/api/favorites", json={"teamId": "ARG"})
    assert r.status_code == 200
    assert r.json()["teamId"] == "ARG"

    # Bob picks no favorite (doesn't call the endpoint)

    r = alice.get("/api/favorites/me")
    assert r.json()["teamId"] == "ARG"
    r = bob.get("/api/favorites/me")
    assert r.json() is None

    print("  favorites set (Alice: ARG, Bob: none): OK")

# ------------------------------------------------------------------
# 5. Knockout brackets
# ------------------------------------------------------------------
def step_brackets():
    # Alice bracket: ARG beats BRA in R32-1, GER beats FRA in R32-2, ARG beats GER in R16-1
    r = alice.put("/api/brackets", json={
        "picks": {
            "R32-1": {"teamId": "ARG", "homeGoals": 2, "awayGoals": 0},
            "R32-2": {"teamId": "GER", "homeGoals": 2, "awayGoals": 1},
            "R16-1": {"teamId": "ARG", "homeGoals": 1, "awayGoals": 0},
        }
    })
    assert r.status_code == 200
    data = r.json()
    assert data["picks"]["R32-1"]["teamId"] == "ARG"
    assert data["picks"]["R16-1"]["teamId"] == "ARG"

    # Bob bracket: BRA beats ARG in R32-1, FRA beats GER in R32-2, BRA beats FRA in R16-1
    r = bob.put("/api/brackets", json={
        "picks": {
            "R32-1": {"teamId": "BRA", "homeGoals": 0, "awayGoals": 3},
            "R32-2": {"teamId": "FRA", "homeGoals": 1, "awayGoals": 2},
            "R16-1": {"teamId": "BRA", "homeGoals": 2, "awayGoals": 0},
        }
    })
    assert r.status_code == 200
    assert r.json()["picks"]["R32-1"]["teamId"] == "BRA"

    print("  brackets saved (Alice: ARG path, Bob: BRA path): OK")

# ------------------------------------------------------------------
# 6. Results come in via admin manual entry
# ------------------------------------------------------------------
def step_results():
    # G-A1: ARG 2 - MEX 1  (Alice: exact score, Bob: wrong)
    r = alice.put("/api/admin/results/G-A1", json={"homeGoals": 2, "awayGoals": 1})
    assert r.status_code == 200

    # G-B1: BRA 1 - GER 1  (Alice: correct outcome BRA wrong, Bob: exact draw 1-1)
    r = alice.put("/api/admin/results/G-B1", json={"homeGoals": 1, "awayGoals": 1})
    assert r.status_code == 200

    # G-A2: MEX 0 - ARG 1  so ARG wins (Alice: predicted DRAW -> wrong)
    r = alice.put("/api/admin/results/G-A2", json={"homeGoals": 0, "awayGoals": 1})
    assert r.status_code == 200

    # KO R32-1: ARG 2 - BRA 0  (ARG wins -> Alice correct, Bob wrong)
    r = alice.put("/api/admin/results/KO-R32-1", json={"homeGoals": 2, "awayGoals": 0})
    assert r.status_code == 200

    # KO R32-2: GER 2 - FRA 1  (GER wins -> Alice correct, Bob wrong)
    r = alice.put("/api/admin/results/KO-R32-2", json={"homeGoals": 2, "awayGoals": 1})
    assert r.status_code == 200

    # KO R16-1: ARG 1 - GER 0  (ARG wins, Alice's line intact from R32-1 -> R16-1)
    r = alice.put("/api/admin/results/KO-R16-1", json={"homeGoals": 1, "awayGoals": 0})
    assert r.status_code == 200

    r = alice.get("/api/results")
    assert len(r.json()) == 6
    print("  6 results entered: OK")

# ------------------------------------------------------------------
# 7. Verify leaderboard points
# ------------------------------------------------------------------
def step_verify_leaderboard():
    r = alice.get("/api/leaderboard")
    assert r.status_code == 200
    board = r.json()

    scores = {e["uid"]: e for e in board}

    a = scores["alice@antenna.live"]
    b = scores["bob@antenna.live"]

    # === ALICE expected ===
    #
    # Group stage:
    #   G-A1: predicted ARG 2-1, actual ARG 2-1 -> exact score = 5 pts
    #         ARG is Alice's favorite & ARG is playing -> 2x bonus -> 10 pts (bonus = 5)
    #   G-B1: predicted BRA 3-0, actual DRAW 1-1 -> wrong outcome = 0 pts
    #   G-A2: predicted DRAW 1-1, actual ARG (0-1) -> wrong outcome = 0 pts
    #   Group total: 10 pts
    #   Favorite bonus: 5 pts
    #   Exact score bonus: 1 exact * (5-3) * 2(fav) = 4
    #
    # Knockout:
    #   R32-1: picked ARG, actual winner ARG, line intact (R32 = root) -> 5 pts
    #   R32-2: picked GER, actual winner GER, line intact (R32 = root) -> 5 pts
    #   R16-1: picked ARG, actual winner ARG, line intact (feeder R32-1: picked ARG, won ARG) -> 10 pts
    #   KO total: 20 pts
    #
    # Total: 10 + 20 = 30

    print(f"\n  Alice: total={a['totalPoints']}, group={a['groupPoints']}, "
          f"ko={a['knockoutPoints']}, favBonus={a['favoriteBonusPoints']}, "
          f"exactBonus={a['exactScoreBonusPoints']}, "
          f"outcomes={a['correctOutcomes']}, exact={a['correctExactScores']}")

    assert a["groupPoints"] == 10, f"Alice group pts: expected 10, got {a['groupPoints']}"
    assert a["knockoutPoints"] == 20, f"Alice KO pts: expected 20, got {a['knockoutPoints']}"
    assert a["totalPoints"] == 30, f"Alice total: expected 30, got {a['totalPoints']}"
    assert a["favoriteBonusPoints"] == 5, f"Alice fav bonus: expected 5, got {a['favoriteBonusPoints']}"
    assert a["exactScoreBonusPoints"] == 4, f"Alice exact bonus: expected 4, got {a['exactScoreBonusPoints']}"
    assert a["correctOutcomes"] >= 4, f"Alice outcomes: expected >=4, got {a['correctOutcomes']}"
    assert a["correctExactScores"] >= 1, f"Alice exact scores: expected >=1, got {a['correctExactScores']}"

    # === BOB expected ===
    #
    # Group stage:
    #   G-A1: predicted MEX, actual ARG -> wrong = 0 pts
    #   G-B1: predicted DRAW 1-1, actual DRAW 1-1 -> exact = 5 pts (no favorite bonus)
    #   Group total: 5 pts
    #
    # Knockout:
    #   R32-1: picked BRA, actual winner ARG -> wrong = 0 pts
    #   R32-2: picked FRA, actual winner GER -> wrong = 0 pts
    #   R16-1: picked BRA, actual winner ARG -> wrong = 0 pts
    #   KO total: 0 pts
    #
    # Total: 5

    print(f"  Bob:   total={b['totalPoints']}, group={b['groupPoints']}, "
          f"ko={b['knockoutPoints']}, favBonus={b['favoriteBonusPoints']}, "
          f"exactBonus={b['exactScoreBonusPoints']}, "
          f"outcomes={b['correctOutcomes']}, exact={b['correctExactScores']}")

    assert b["groupPoints"] == 5, f"Bob group pts: expected 5, got {b['groupPoints']}"
    assert b["knockoutPoints"] == 0, f"Bob KO pts: expected 0, got {b['knockoutPoints']}"
    assert b["totalPoints"] == 5, f"Bob total: expected 5, got {b['totalPoints']}"
    assert b["favoriteBonusPoints"] == 0, f"Bob fav bonus: expected 0, got {b['favoriteBonusPoints']}"
    assert b["correctOutcomes"] >= 1, f"Bob outcomes: expected >=1, got {b['correctOutcomes']}"

    # Ranking: Alice should be #1, Bob #2
    assert a["rank"] == 1, f"Alice rank: expected 1, got {a['rank']}"
    assert b["rank"] == 2, f"Bob rank: expected 2, got {b['rank']}"

    print(f"  Rankings: Alice #{a['rank']}, Bob #{b['rank']}: OK")
    print("  All point calculations verified: OK")

# ------------------------------------------------------------------
# 8. Verify locks work: lock favorites and test rejection
# ------------------------------------------------------------------
def step_locks():
    # Set favorite lock to the past
    r = alice.put("/api/admin/config", json={
        "favoriteLockAt": "2020-01-01T00:00:00Z",
        "knockoutLockAt": "2030-06-29T19:00:00Z",
        "tournamentStartAt": "2030-06-11T20:00:00Z",
        "tournamentEndAt": "2030-07-19T22:00:00Z",
        "phase": "GROUP",
    })
    assert r.status_code == 200

    # Try to change favorite -> should be locked
    r = alice.put("/api/favorites", json={"teamId": "BRA"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"

    # Verify favorite unchanged
    r = alice.get("/api/favorites/me")
    assert r.json()["teamId"] == "ARG"

    # Set knockout lock to the past
    r = alice.put("/api/admin/config", json={
        "favoriteLockAt": "2020-01-01T00:00:00Z",
        "knockoutLockAt": "2020-01-01T00:00:00Z",
        "tournamentStartAt": "2030-06-11T20:00:00Z",
        "tournamentEndAt": "2030-07-19T22:00:00Z",
        "phase": "KNOCKOUT",
    })
    assert r.status_code == 200

    # Try to save bracket -> should be locked
    r = alice.put("/api/brackets", json={
        "picks": {"R32-1": {"teamId": "BRA", "homeGoals": 0, "awayGoals": 3}}
    })
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"

    # Verify bracket unchanged
    r = alice.get("/api/brackets/me")
    assert r.json()["picks"]["R32-1"]["teamId"] == "ARG"

    print("  favorite lock enforced: OK")
    print("  knockout lock enforced: OK")

# ------------------------------------------------------------------
# 9. Verify prediction visibility rules
# ------------------------------------------------------------------
def step_prediction_visibility():
    # G-A1 is FINISHED -> everyone can see all predictions
    r = bob.get("/api/predictions/fixture/G-A1")
    assert r.status_code == 200
    preds = r.json()
    uids = [p["uid"] for p in preds]
    assert "alice@antenna.live" in uids, "Bob should see Alice's prediction on finished match"
    assert "bob@antenna.live" in uids, "Bob should see own prediction"
    print("  finished match: all predictions visible: OK")

# ------------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------------
import atexit
def cleanup():
    try:
        os.remove("test_e2e.db")
    except Exception:
        pass
atexit.register(cleanup)


if __name__ == "__main__":
    print("=== E2E Integration Test: Full Scoring Lifecycle ===\n")

    print("Step 1: Config")
    step_config()

    print("\nStep 2: Seed data")
    step_seed()

    print("\nStep 3: Predictions")
    step_predictions()

    print("\nStep 4: Favorites")
    step_favorites()

    print("\nStep 5: Knockout brackets")
    step_brackets()

    print("\nStep 6: Results")
    step_results()

    print("\nStep 7: Verify leaderboard & points")
    step_verify_leaderboard()

    print("\nStep 8: Lock enforcement")
    step_locks()

    print("\nStep 9: Prediction visibility")
    step_prediction_visibility()

    print("\n=== ALL E2E TESTS PASSED ===")
