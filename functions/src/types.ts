// Mirror of the client types, in CommonJS / no-Vite-deps form, so functions
// can compile independently.
import { Timestamp } from "firebase-admin/firestore";

export type Stage = "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
export type FixtureStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";

export interface Team {
  id: string; name: string; shortName: string; flag: string; group?: string | null;
}
export interface Fixture {
  id: string; externalId?: string;
  stage: Stage; group?: string | null; bracketSlot?: string | null;
  homeTeamId: string | null; awayTeamId: string | null;
  kickoff: Timestamp; lockAt: Timestamp; status: FixtureStatus; venue?: string | null;
}
export interface MatchResult {
  fixtureId: string; homeGoals: number; awayGoals: number;
  outcome: "DRAW" | string; finalizedAt: Timestamp; source: "API" | "MANUAL";
}
export interface GroupPrediction {
  uid: string; fixtureId: string; pickedOutcome: "DRAW" | string;
  homeGoals?: number | null; awayGoals?: number | null; updatedAt: Timestamp;
}
export interface BracketPick {
  teamId: string | null; homeGoals?: number | null; awayGoals?: number | null;
}
export interface KnockoutBracket {
  uid: string; picks: Record<string, BracketPick>;
  submittedAt?: Timestamp; updatedAt: Timestamp;
}
export interface UserProfile {
  uid: string; email: string; displayName: string; photoURL?: string; createdAt: Timestamp;
}
export interface FavoritePick { uid: string; teamId: string; setAt: Timestamp; }
export interface LeaderboardEntry {
  uid: string; displayName: string; photoURL?: string;
  totalPoints: number; groupPoints: number; knockoutPoints: number;
  favoriteBonusPoints: number; exactScoreBonusPoints: number;
  correctOutcomes: number; correctExactScores: number;
  finalScoreDelta: number | null;
  previousRank: number | null; rank: number; updatedAt: Timestamp;
}
export interface AppConfig {
  favoriteLockAt: Timestamp; knockoutLockAt: Timestamp;
  tournamentStartAt: Timestamp; tournamentEndAt: Timestamp;
  phase: "PRE" | "GROUP" | "KO" | "DONE";
}
