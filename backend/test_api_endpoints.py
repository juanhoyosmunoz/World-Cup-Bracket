"""
Test all API endpoints respond correctly using FastAPI's TestClient.
Uses an in-memory SQLite DB so no PostgreSQL is needed.
"""
import sys
sys.path.insert(0, ".")

import os
os.environ["DATABASE_URL"] = "sqlite:///test.db"
os.environ["DEV_USER_EMAIL"] = "juan@antenna.live"
os.environ["DEV_USER_NAME"] = "Juan Hoyos"
os.environ["ADMIN_EMAILS"] = "juan@antenna.live,lauren@antenna.live"
os.environ["ALLOWED_EMAIL_DOMAIN"] = "antenna.live"

from app.config import Settings
# Reload settings with test values
import app.config
app.config.settings = Settings()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app

engine = create_engine("sqlite:///test.db", connect_args={"check_same_thread": False})
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
client = TestClient(app)

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    print("  GET /api/health: OK")

def test_me():
    r = client.get("/api/me")
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "juan@antenna.live"
    assert data["isAdmin"] == True
    assert data["displayName"] == "Juan Hoyos"
    print("  GET /api/me: OK")

def test_app_config_empty():
    r = client.get("/api/app-config")
    assert r.status_code == 200
    assert r.json() is None
    print("  GET /api/app-config (empty): OK")

def test_set_config():
    r = client.put("/api/admin/config", json={
        "favoriteLockAt": "2026-06-11T19:00:00Z",
        "knockoutLockAt": "2026-06-29T19:00:00Z",
        "tournamentStartAt": "2026-06-11T20:00:00Z",
        "tournamentEndAt": "2026-07-19T22:00:00Z",
        "phase": "PRE",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["phase"] == "PRE"
    assert "2026-06-11" in data["favoriteLockAt"]
    print("  PUT /api/admin/config: OK")

def test_app_config_after_set():
    r = client.get("/api/app-config")
    assert r.status_code == 200
    data = r.json()
    assert data is not None
    assert data["phase"] == "PRE"
    print("  GET /api/app-config (after set): OK")

def test_teams_empty():
    r = client.get("/api/teams")
    assert r.status_code == 200
    assert r.json() == []
    print("  GET /api/teams (empty): OK")

def test_fixtures_empty():
    r = client.get("/api/fixtures")
    assert r.status_code == 200
    assert r.json() == []
    print("  GET /api/fixtures (empty): OK")

def test_results_empty():
    r = client.get("/api/results")
    assert r.status_code == 200
    assert r.json() == {}
    print("  GET /api/results (empty): OK")

def test_leaderboard_empty():
    r = client.get("/api/leaderboard")
    assert r.status_code == 200
    assert r.json() == []
    print("  GET /api/leaderboard (empty): OK")

def test_my_predictions_empty():
    r = client.get("/api/predictions/me")
    assert r.status_code == 200
    assert r.json() == []
    print("  GET /api/predictions/me (empty): OK")

def test_my_favorite_empty():
    r = client.get("/api/favorites/me")
    assert r.status_code == 200
    assert r.json() is None
    print("  GET /api/favorites/me (empty): OK")

def test_my_bracket_empty():
    r = client.get("/api/brackets/me")
    assert r.status_code == 200
    assert r.json() is None
    print("  GET /api/brackets/me (empty): OK")

def test_set_favorite():
    # First set config so favorite lock is in the future
    r = client.put("/api/favorites", json={"teamId": "ARG"})
    assert r.status_code == 200
    data = r.json()
    assert data["teamId"] == "ARG"
    assert data["uid"] == "juan@antenna.live"
    print("  PUT /api/favorites: OK")

def test_get_favorite_after_set():
    r = client.get("/api/favorites/me")
    assert r.status_code == 200
    data = r.json()
    assert data["teamId"] == "ARG"
    print("  GET /api/favorites/me (after set): OK")

def test_save_bracket():
    r = client.put("/api/brackets", json={
        "picks": {
            "R32-1": {"teamId": "ARG", "homeGoals": 2, "awayGoals": 0},
            "R32-2": {"teamId": "BRA", "homeGoals": 1, "awayGoals": 0},
        }
    })
    assert r.status_code == 200
    data = r.json()
    assert "R32-1" in data["picks"]
    assert data["picks"]["R32-1"]["teamId"] == "ARG"
    print("  PUT /api/brackets: OK")

def test_get_bracket_after_set():
    r = client.get("/api/brackets/me")
    assert r.status_code == 200
    data = r.json()
    assert data["picks"]["R32-1"]["teamId"] == "ARG"
    assert data["picks"]["R32-2"]["teamId"] == "BRA"
    print("  GET /api/brackets/me (after set): OK")

def test_merge_bracket():
    """Saving new picks should merge with existing, not replace."""
    r = client.put("/api/brackets", json={
        "picks": {
            "R32-3": {"teamId": "GER", "homeGoals": None, "awayGoals": None},
        }
    })
    assert r.status_code == 200
    data = r.json()
    assert data["picks"]["R32-1"]["teamId"] == "ARG", "Old picks preserved"
    assert data["picks"]["R32-3"]["teamId"] == "GER", "New pick added"
    print("  PUT /api/brackets (merge): OK")

def test_admin_users():
    r = client.get("/api/admin/users")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert any(u["email"] == "juan@antenna.live" for u in data)
    print("  GET /api/admin/users: OK")

def test_admin_sync_health_empty():
    r = client.get("/api/admin/sync-health")
    assert r.status_code == 200
    print("  GET /api/admin/sync-health: OK")

def test_recompute_leaderboard_empty():
    """Recompute with no fixtures/results should succeed with 1 user."""
    r = client.post("/api/admin/recompute-leaderboard")
    assert r.status_code == 200
    data = r.json()
    assert data["users"] >= 1
    print("  POST /api/admin/recompute-leaderboard: OK")

def test_leaderboard_after_recompute():
    r = client.get("/api/leaderboard")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    entry = data[0]
    assert entry["totalPoints"] == 0  # no predictions/results yet
    assert entry["rank"] == 1
    print("  GET /api/leaderboard (after recompute): OK")

def test_non_admin_rejected():
    """Non-admin email should be rejected from admin endpoints."""
    from app.config import settings
    old_emails = settings.admin_emails
    settings.admin_emails = "someone-else@antenna.live"
    r = client.post("/api/admin/recompute-leaderboard")
    assert r.status_code == 403
    settings.admin_emails = old_emails
    print("  admin endpoint rejects non-admin: OK")

def test_non_antenna_rejected():
    """Non-antenna domain should be rejected."""
    r = client.get("/api/me", headers={"X-Auth-User-Email": "hacker@gmail.com"})
    # dev user fallback takes precedence, so let's clear it
    from app.config import settings
    old = settings.dev_user_email
    settings.dev_user_email = ""
    r = client.get("/api/me", headers={
        "X-Auth-User-Email": "hacker@gmail.com",
        "X-Auth-User-Id": "hacker"
    })
    assert r.status_code == 403
    settings.dev_user_email = old
    print("  non-antenna domain rejected: OK")


# Cleanup
import atexit
def cleanup():
    import os
    try:
        os.remove("test.db")
    except:
        pass
atexit.register(cleanup)


if __name__ == "__main__":
    print("=== API Endpoint Tests ===")
    test_health()
    test_me()
    print()

    print("=== Config ===")
    test_app_config_empty()
    test_set_config()
    test_app_config_after_set()
    print()

    print("=== Empty State Reads ===")
    test_teams_empty()
    test_fixtures_empty()
    test_results_empty()
    test_leaderboard_empty()
    test_my_predictions_empty()
    test_my_favorite_empty()
    test_my_bracket_empty()
    print()

    print("=== User Writes ===")
    test_set_favorite()
    test_get_favorite_after_set()
    test_save_bracket()
    test_get_bracket_after_set()
    test_merge_bracket()
    print()

    print("=== Admin ===")
    test_admin_users()
    test_admin_sync_health_empty()
    test_recompute_leaderboard_empty()
    test_leaderboard_after_recompute()
    print()

    print("=== Security ===")
    test_non_admin_rejected()
    test_non_antenna_rejected()
    print()

    print("ALL API ENDPOINT TESTS PASSED")
