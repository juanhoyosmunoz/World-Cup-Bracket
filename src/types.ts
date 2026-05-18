import type { Timestamp } from "firebase/firestore";

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
  id: string;            // ISO code or API id
  name: string;          // "Argentina"
  shortName: string;     // "ARG"
  flag: string;          // emoji or URL
  group?: string;        // "A" .. "L" (group stage only)
}

export interface Fixture {
  id: string;
  externalId?: string;   // API-FOOTBALL fixture id
  stage: Stage;
  group?: string;        // for GROUP stage
  bracketSlot?: string;  // e.g., "R32-1", "R16-1", "QF-1", "SF-1", "THIRD", "FINAL"
  homeTeamId: string | null;   // null when TBD (knockout slots before feeders resolve)
  awayTeamId: string | null;
  kickoff: Timestamp;          // server timestamp
  lockAt: Timestamp;           // kickoff - 10 min (server-set)
  status: FixtureStatus;
  venue?: string;
  /** filled in after match: feeders for knockout slots (R16/QF/SF/etc.) */
  feederHome?: string;
  feederAway?: string;
}

export interface MatchResult {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
  /** team id of winner, or "DRAW" (group stage only). Computed. */
  outcome: "DRAW" | string;
  finalizedAt: Timestamp;
  source: "API" | "MANUAL";
}

export interface GroupPrediction {
  /** doc id = `${uid}_${fixtureId}` */
  uid: string;
  fixtureId: string;
  /** team id of predicted winner, or "DRAW" */
  pickedOutcome: "DRAW" | string;
  /** optional exact score */
  homeGoals?: number | null;
  awayGoals?: number | null;
  updatedAt: Timestamp;
}

export interface BracketPick {
  /** team id picked to win this slot */
  teamId: string | null;
  /** optional exact score (used only for FINAL tiebreaker today, future bonus). */
  homeGoals?: number | null;
  awayGoals?: number | null;
}

export interface KnockoutBracket {
  uid: string;
  /** keyed by bracket slot id, e.g., "R32-1", "R16-1", ..., "FINAL", "THIRD" */
  picks: Record<string, BracketPick>;
  submittedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  /** admin flag is the source of truth on the custom claim, not in Firestore. */
}

export interface FavoritePick {
  uid: string;
  teamId: string;
  setAt: Timestamp;
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
  /** difference in absolute goals from actual final score (tiebreaker, lower=better). null if no pick. */
  finalScoreDelta: number | null;
  /** previous rank for movement display. null on first compute. */
  previousRank: number | null;
  rank: number;
  updatedAt: Timestamp;
}

export interface AppConfig {
  /** epoch ms after which favorite team can no longer be changed */
  favoriteLockAt: Timestamp;
  /** epoch ms after which knockout bracket can no longer be edited */
  knockoutLockAt: Timestamp;
  /** display only */
  tournamentStartAt: Timestamp;
  tournamentEndAt: Timestamp;
  /** "PRE" | "GROUP" | "KO" | "DONE" — display banner */
  phase: "PRE" | "GROUP" | "KO" | "DONE";
}
