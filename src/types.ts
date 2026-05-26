export type Stage =
  | "GROUP"
  | "R32"
  | "R16"
  | "QF"
  | "SF"
  | "THIRD"
  | "FINAL";

export const STAGE_ORDER: Stage[] = [
  "GROUP",
  "R32",
  "R16",
  "QF",
  "SF",
  "THIRD",
  "FINAL",
];

export type FixtureStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  flag: string;
  group?: string;
}

export interface Fixture {
  id: string;
  externalId?: string;
  stage: Stage;
  group?: string;
  bracketSlot?: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoff: string;
  lockAt: string;
  status: FixtureStatus;
  venue?: string;
  feederHome?: string;
  feederAway?: string;
}

export interface MatchResult {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
  outcome: "DRAW" | string;
  finalizedAt: string;
  source: "API" | "MANUAL";
}

export interface GroupPrediction {
  uid: string;
  fixtureId: string;
  pickedOutcome: "DRAW" | string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  updatedAt: string;
}

export interface BracketPick {
  teamId: string | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
}

export interface KnockoutBracket {
  uid: string;
  picks: Record<string, BracketPick>;
  submittedAt?: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: string;
}

export interface FavoritePick {
  uid: string;
  teamId: string;
  setAt: string;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL?: string;
  totalPoints: number;
  groupPoints: number;
  knockoutPoints: number;
  favoriteBonusPoints: number;
  exactScoreBonusPoints: number;
  correctOutcomes: number;
  correctExactScores: number;
  finalScoreDelta: number | null;
  previousRank: number | null;
  rank: number;
  updatedAt: string;
}

export interface AppConfig {
  favoriteLockAt: string;
  knockoutLockAt: string;
  tournamentStartAt: string;
  tournamentEndAt: string;
  phase: "PRE" | "GROUP" | "KO" | "DONE";
}
