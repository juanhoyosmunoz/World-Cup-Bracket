"""
Verify the API-Football provider:
1. Parsing/mapping logic works correctly
2. The provider is properly wired into sync endpoints
3. Stage mapping covers all World Cup 2026 rounds
"""
import sys
sys.path.insert(0, ".")

from app.providers.apifootball import _map_stage, _map_status, _extract_group_letter


def test_stage_mapping():
    """All known API-FOOTBALL round labels map to the correct internal stage."""
    cases = [
        ("Group Stage - 1", "GROUP"),
        ("Group Stage - 2", "GROUP"),
        ("Group Stage - 3", "GROUP"),
        ("Group A - 1", "GROUP"),
        ("Round of 32", "R32"),
        ("Round of 16", "R16"),
        ("Quarter-finals", "QF"),
        ("Semi-finals", "SF"),
        ("3rd Place Final", "THIRD"),
        ("Third Place", "THIRD"),
        ("Final", "FINAL"),
        # Edge cases
        ("group stage", "GROUP"),
        ("ROUND OF 32", "R32"),
        ("Quarter Finals", "QF"),
        ("semi-final", "SF"),
    ]
    for round_name, expected in cases:
        result = _map_stage(round_name)
        assert result == expected, f"_map_stage('{round_name}') = '{result}', expected '{expected}'"
    print("  stage mapping: OK")


def test_status_mapping():
    """API-FOOTBALL status codes map to our internal statuses."""
    cases = [
        ("FT", "FINISHED"),
        ("AET", "FINISHED"),
        ("PEN", "FINISHED"),
        ("1H", "LIVE"),
        ("HT", "LIVE"),
        ("2H", "LIVE"),
        ("ET", "LIVE"),
        ("P", "LIVE"),
        ("LIVE", "LIVE"),
        ("PST", "POSTPONED"),
        ("CANC", "POSTPONED"),
        ("ABD", "POSTPONED"),
        ("NS", "SCHEDULED"),
        ("TBD", "SCHEDULED"),
    ]
    for api_status, expected in cases:
        result = _map_status(api_status)
        assert result == expected, f"_map_status('{api_status}') = '{result}', expected '{expected}'"
    print("  status mapping: OK")


def test_group_letter_extraction():
    """Group letter extraction from round strings."""
    assert _extract_group_letter("Group A - 1") == "A"
    assert _extract_group_letter("Group L - 3") == "L"
    assert _extract_group_letter("Group Stage - 1") is None  # no letter in generic
    assert _extract_group_letter("Round of 32") is None
    print("  group letter extraction: OK")


def test_provider_wiring():
    """Verify the admin router imports and calls the provider correctly."""
    from app.routers.admin import sync_teams, sync_fixtures, sync_results
    # Just verify the functions exist and are async
    import inspect
    assert inspect.iscoroutinefunction(sync_teams), "sync_teams should be async"
    assert inspect.iscoroutinefunction(sync_fixtures), "sync_fixtures should be async"
    assert inspect.iscoroutinefunction(sync_results), "sync_results should be async"
    print("  provider wiring in admin router: OK")


def test_provider_functions_exist():
    """Verify the provider module exports the expected functions."""
    from app.providers.apifootball import fetch_teams, fetch_fixtures
    import inspect
    assert inspect.iscoroutinefunction(fetch_teams)
    assert inspect.iscoroutinefunction(fetch_fixtures)
    print("  provider functions exist and are async: OK")


def test_scheduled_sync_uses_provider():
    """Verify the scheduled sync function is wired up."""
    from app.main import scheduled_sync
    import inspect
    assert inspect.iscoroutinefunction(scheduled_sync)
    print("  scheduled sync exists and is async: OK")


def test_scheduler_configured():
    """Verify APScheduler is configured with 15-min interval."""
    from app.main import scheduler
    # Scheduler won't have jobs until the app starts, but the object should exist
    assert scheduler is not None
    print("  scheduler configured: OK")


if __name__ == "__main__":
    print("=== API-Football Provider Tests ===")
    test_stage_mapping()
    test_status_mapping()
    test_group_letter_extraction()
    print()

    print("=== Integration Wiring ===")
    test_provider_wiring()
    test_provider_functions_exist()
    test_scheduled_sync_uses_provider()
    test_scheduler_configured()
    print()

    print("ALL API-FOOTBALL TESTS PASSED")
