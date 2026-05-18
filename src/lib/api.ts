// Provider abstraction for football fixtures + results.
//
// The client never calls the football API directly; it always reads from
// Firestore. Cloud Functions are responsible for talking to the API on a
// schedule and writing normalized data into `fixtures` and `results`.
//
// This file describes the provider interface; the active implementation lives
// in `functions/src/providers/`. Swap providers by setting
// `adminConfig/main.provider` and deploying a new implementation.

export interface NormalizedFixture {
  externalId: string;
  stage: "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
  group?: string;
  bracketSlot?: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffISO: string;
  venue?: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  homeGoals?: number;
  awayGoals?: number;
}

export interface NormalizedTeam {
  id: string;
  name: string;
  shortName: string;
  flag: string;
  group?: string;
}

export interface FixtureProvider {
  name: string;
  fetchTeams(): Promise<NormalizedTeam[]>;
  fetchFixtures(): Promise<NormalizedFixture[]>;
}
