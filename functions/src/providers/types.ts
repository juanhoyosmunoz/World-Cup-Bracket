export interface NormalizedTeam {
  id: string; name: string; shortName: string; flag: string; group?: string;
}
export interface NormalizedFixture {
  externalId: string;
  stage: "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
  group?: string; bracketSlot?: string;
  homeTeamId: string | null; awayTeamId: string | null;
  kickoffISO: string; venue?: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  homeGoals?: number; awayGoals?: number;
}
export interface FixtureProvider {
  name: string;
  fetchTeams(): Promise<NormalizedTeam[]>;
  fetchFixtures(): Promise<NormalizedFixture[]>;
}
