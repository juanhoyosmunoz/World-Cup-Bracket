// Compute group-stage standings from fixtures + results.
//
// Standard FIFA tiebreakers (in order):
//   1. Points
//   2. Goal difference
//   3. Goals for
//   4. Head-to-head points (between tied teams only)
//   5. Head-to-head goal difference
//   6. (further criteria are FIFA-discretion; we stop here and treat as tied)
//
// For the "best third-placed teams" cross-group ranking (top 8 of 12 advance
// to R32 in the 48-team format), we use the same chain on aggregate group
// stats per team: Pts → GD → GF.

import type { Fixture, MatchResult } from "../types";

export interface StandingsRow {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

function blank(teamId: string): StandingsRow {
  return {
    teamId,
    played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
  };
}

/**
 * @param group  group letter, e.g., "A"
 * @param fixtures  all fixtures (we filter to this group)
 * @param results   results map keyed by fixture id
 */
export function computeGroupStandings(
  group: string,
  fixtures: Fixture[],
  results: Record<string, MatchResult | undefined>
): StandingsRow[] {
  const groupFixtures = fixtures.filter(
    (f) => f.stage === "GROUP" && f.group === group
  );
  const teams = new Map<string, StandingsRow>();
  const ensure = (id: string) => {
    if (!teams.has(id)) teams.set(id, blank(id));
    return teams.get(id)!;
  };
  // Seed all four teams from fixture team ids so even pre-tournament we render rows.
  for (const f of groupFixtures) {
    if (f.homeTeamId) ensure(f.homeTeamId);
    if (f.awayTeamId) ensure(f.awayTeamId);
  }

  // Head-to-head deltas keyed by `${a}_${b}` (alphabetical) so we can break
  // simple two-way ties (most common case for top-of-group races).
  const h2hPts: Record<string, Record<string, number>> = {};
  const h2hGd: Record<string, Record<string, number>> = {};

  for (const f of groupFixtures) {
    const r = results[f.id];
    if (!r || !f.homeTeamId || !f.awayTeamId) continue;
    const h = ensure(f.homeTeamId);
    const a = ensure(f.awayTeamId);
    h.played += 1; a.played += 1;
    h.goalsFor += r.homeGoals; h.goalsAgainst += r.awayGoals;
    a.goalsFor += r.awayGoals; a.goalsAgainst += r.homeGoals;

    if (r.homeGoals > r.awayGoals) {
      h.wins += 1; h.points += 3; a.losses += 1;
      addH2H(h2hPts, f.homeTeamId, f.awayTeamId, 3, 0);
    } else if (r.awayGoals > r.homeGoals) {
      a.wins += 1; a.points += 3; h.losses += 1;
      addH2H(h2hPts, f.homeTeamId, f.awayTeamId, 0, 3);
    } else {
      h.draws += 1; a.draws += 1; h.points += 1; a.points += 1;
      addH2H(h2hPts, f.homeTeamId, f.awayTeamId, 1, 1);
    }
    const gd = r.homeGoals - r.awayGoals;
    addH2H(h2hGd, f.homeTeamId, f.awayTeamId, gd, -gd);
  }

  for (const t of teams.values()) {
    t.goalDiff = t.goalsFor - t.goalsAgainst;
  }

  // Sort using the tiebreaker chain.
  const rows = [...teams.values()];
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    // Head-to-head only meaningful between exactly two tied teams.
    const ah = h2hPts[a.teamId]?.[b.teamId] ?? 0;
    const bh = h2hPts[b.teamId]?.[a.teamId] ?? 0;
    if (bh !== ah) return bh - ah;
    const agd = h2hGd[a.teamId]?.[b.teamId] ?? 0;
    const bgd = h2hGd[b.teamId]?.[a.teamId] ?? 0;
    if (bgd !== agd) return bgd - agd;
    return 0;
  });
  return rows;
}

function addH2H(
  store: Record<string, Record<string, number>>,
  a: string,
  b: string,
  va: number,
  vb: number
) {
  (store[a] ??= {})[b] = (store[a][b] ?? 0) + va;
  (store[b] ??= {})[a] = (store[b][a] ?? 0) + vb;
}

/**
 * Rank the 12 third-placed teams to identify the 8 that advance to R32.
 * Returns a Set of teamIds that qualify as "best thirds".
 */
export function bestThirdQualifiers(
  groups: string[],
  fixtures: Fixture[],
  results: Record<string, MatchResult | undefined>
): Set<string> {
  const thirds: StandingsRow[] = [];
  for (const g of groups) {
    const s = computeGroupStandings(g, fixtures, results);
    if (s[2]) thirds.push(s[2]);
  }
  thirds.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return 0;
  });
  return new Set(thirds.slice(0, 8).map((t) => t.teamId));
}
