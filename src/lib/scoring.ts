// -----------------------------------------------------------------------------
// SCORING — single source of truth for both the client (preview) and the
// Cloud Function (authoritative recompute). Keep this file pure.
//
// Group stage:
//   - Correct winner (or correct draw):            3 points
//   - Correct winner + exact score:                5 points
//   - Favorite team match, correct winner:         6 points (= 3 doubled)
//   - Favorite team match, correct + exact score: 10 points (= 5 doubled)
//
//     "Favorite team match" means the user's favorite team is one of the two
//     teams playing the fixture AND the user's outcome pick is correct.
//
// Knockout stage (per correct pick, with bracket-line propagation):
//   R32 = 5, R16 = 10, QF = 20, SF = 40, THIRD = 50, FINAL = 80.
//   A user's pick at round R only scores when:
//     (a) the pick equals the actual winner of that bracket slot, AND
//     (b) the user correctly placed that team in EVERY prior round on its
//         path (any earlier miss "breaks the line" and zeroes out downstream).
//
// Tiebreaker:
//   Closest predicted final score to the actual final score, measured as
//   |homePred - homeAct| + |awayPred - awayAct| (lower is better).
//   Users with no final score pick are placed at Infinity (lose the tiebreak).
// -----------------------------------------------------------------------------

import type {
  FavoritePick,
  Fixture,
  GroupPrediction,
  KnockoutBracket,
  MatchResult,
  Stage,
} from "../types";

export const GROUP_POINTS = {
  correctWinner: 3,
  correctExact: 5,
  favCorrectWinner: 6,
  favCorrectExact: 10,
} as const;

export const KO_POINTS: Record<Exclude<Stage, "GROUP">, number> = {
  R32: 5,
  R16: 10,
  QF: 20,
  SF: 40,
  THIRD: 50,
  FINAL: 80,
};

/** Returns "DRAW" or the winning team id given a result. */
export function resultOutcome(r: MatchResult): "DRAW" | string {
  if (r.outcome) return r.outcome;
  if (r.homeGoals === r.awayGoals) return "DRAW";
  return ""; // caller should already have set outcome; fixture-level lookup elsewhere.
}

export interface GroupScoreDetail {
  fixtureId: string;
  basePoints: number;       // 3 or 5 (or 0)
  favoriteApplied: boolean; // whether multiplier kicked in
  awarded: number;          // base * (favoriteApplied ? 2 : 1)
  exact: boolean;
}

/**
 * Score a single group-stage prediction.
 * `favoriteTeamId` is the user's favorite team id (or null if not picked).
 */
export function scoreGroupPrediction(
  pred: GroupPrediction | undefined,
  fixture: Fixture,
  result: MatchResult | undefined,
  favoriteTeamId: string | null
): GroupScoreDetail {
  const empty: GroupScoreDetail = {
    fixtureId: fixture.id,
    basePoints: 0,
    favoriteApplied: false,
    awarded: 0,
    exact: false,
  };
  if (!pred || !result) return empty;

  // Outcome match?
  const actualOutcome: "DRAW" | string =
    result.homeGoals === result.awayGoals
      ? "DRAW"
      : result.homeGoals > result.awayGoals
        ? fixture.homeTeamId ?? ""
        : fixture.awayTeamId ?? "";
  const outcomeCorrect = pred.pickedOutcome === actualOutcome;
  if (!outcomeCorrect) return empty;

  // Exact score?
  const exact =
    pred.homeGoals != null &&
    pred.awayGoals != null &&
    pred.homeGoals === result.homeGoals &&
    pred.awayGoals === result.awayGoals;

  const base = exact ? GROUP_POINTS.correctExact : GROUP_POINTS.correctWinner;

  // Favorite team multiplier: applies if user's favorite team is one of the
  // two teams playing AND the user's outcome pick was correct.
  const fav =
    favoriteTeamId != null &&
    (fixture.homeTeamId === favoriteTeamId || fixture.awayTeamId === favoriteTeamId);

  const awarded = fav ? base * 2 : base;
  return {
    fixtureId: fixture.id,
    basePoints: base,
    favoriteApplied: fav,
    awarded,
    exact,
  };
}

// --- Knockout scoring --------------------------------------------------------

/**
 * The knockout bracket is encoded as a fixed-shape map of slot ids:
 *   R32-1..R32-16, R16-1..R16-8, QF-1..QF-4, SF-1..SF-2, THIRD, FINAL.
 * Each slot's "feeders" come from the previous round, paired in standard
 * bracket order (1,2 -> 1; 3,4 -> 2; ...).
 */
export function feederSlots(slot: string): [string, string] | null {
  if (slot === "FINAL") return ["SF-1", "SF-2"];
  if (slot === "THIRD") return ["SF-1", "SF-2"]; // both losers — handled specially
  const m = slot.match(/^(R32|R16|QF|SF)-(\d+)$/);
  if (!m) return null;
  const stage = m[1];
  const n = parseInt(m[2], 10);
  if (stage === "R32") return null;
  if (stage === "R16") return [`R32-${n * 2 - 1}`, `R32-${n * 2}`];
  if (stage === "QF") return [`R16-${n * 2 - 1}`, `R16-${n * 2}`];
  if (stage === "SF") return [`QF-${n * 2 - 1}`, `QF-${n * 2}`];
  return null;
}

export function stageOfSlot(slot: string): Exclude<Stage, "GROUP"> {
  if (slot === "FINAL") return "FINAL";
  if (slot === "THIRD") return "THIRD";
  const stage = slot.split("-")[0] as Exclude<Stage, "GROUP" | "THIRD" | "FINAL">;
  return stage;
}

interface KOContext {
  /** actual winner of each slot (team id), or undefined if not played yet. */
  actualWinners: Record<string, string | undefined>;
  /** actual losers (used for THIRD) */
  actualLosers: Record<string, string | undefined>;
  picks: KnockoutBracket["picks"];
}

/**
 * Returns true if the user correctly placed `team` at every prior round
 * feeding into `slot` (i.e., the bracket line is intact through this slot).
 */
function lineIntact(slot: string, team: string, ctx: KOContext): boolean {
  const feeders = feederSlots(slot);
  if (!feeders) return true; // R32 slots have no feeders
  // For THIRD: both SF losers must have been picked correctly. We handle
  // THIRD separately in `scoreKnockoutPick`, so don't recurse via lineIntact.
  if (slot === "THIRD") return true;
  // Which feeder produced `team`?
  const matchingFeeder = feeders.find((f) => ctx.picks[f]?.teamId === team);
  if (!matchingFeeder) return false;          // user never picked team to arrive here
  if (ctx.actualWinners[matchingFeeder] !== team) return false; // team didn't actually advance
  return lineIntact(matchingFeeder, team, ctx);
}

export interface KOScoreDetail {
  slot: string;
  stage: Exclude<Stage, "GROUP">;
  awarded: number;
  correct: boolean;
  /** false if line was broken (line earlier in bracket has an incorrect pick) */
  lineIntact: boolean;
  exactScoreCorrect: boolean;
}

/** Score a single bracket slot pick. THIRD-place is handled specially. */
export function scoreKnockoutSlot(
  slot: string,
  ctx: KOContext,
  results: Record<string, MatchResult | undefined>
): KOScoreDetail {
  const stage = stageOfSlot(slot);
  const pick = ctx.picks[slot];
  const base: KOScoreDetail = {
    slot,
    stage,
    awarded: 0,
    correct: false,
    lineIntact: true,
    exactScoreCorrect: false,
  };
  if (!pick?.teamId) return base;

  let actualWinner: string | undefined;
  let intact: boolean;
  if (slot === "THIRD") {
    actualWinner = ctx.actualWinners["THIRD"];
    // Third place pick is correct only if BOTH SF lines were intact for that
    // user (otherwise their predicted SF losers can't represent reality).
    const sf1Pick = ctx.picks["SF-1"]?.teamId;
    const sf2Pick = ctx.picks["SF-2"]?.teamId;
    const sf1Loser = ctx.actualLosers["SF-1"];
    const sf2Loser = ctx.actualLosers["SF-2"];
    // We require that user's THIRD pick is one of the predicted SF losers
    // AND that loser actually was the real SF loser.
    const thirdTeam = pick.teamId;
    const candidateLoserSlot =
      thirdTeam && sf1Pick && sf1Pick !== thirdTeam
        ? "SF-1"
        : thirdTeam && sf2Pick && sf2Pick !== thirdTeam
          ? "SF-2"
          : null;
    intact =
      candidateLoserSlot != null &&
      (candidateLoserSlot === "SF-1"
        ? sf1Loser === thirdTeam &&
          lineIntact("SF-1", sf1Pick!, ctx) // user got SF-1 winner correct
        : sf2Loser === thirdTeam &&
          lineIntact("SF-2", sf2Pick!, ctx));
  } else {
    actualWinner = ctx.actualWinners[slot];
    intact = lineIntact(slot, pick.teamId, ctx);
  }
  base.lineIntact = intact;

  const correct = actualWinner != null && actualWinner === pick.teamId;
  base.correct = correct;

  if (correct && intact) {
    base.awarded = KO_POINTS[stage];
  }

  // Exact score (tracked for tiebreaker / stats).
  const r = results[slot];
  if (r && pick.homeGoals != null && pick.awayGoals != null) {
    base.exactScoreCorrect =
      pick.homeGoals === r.homeGoals && pick.awayGoals === r.awayGoals;
  }
  return base;
}

// --- Aggregation ------------------------------------------------------------

export interface UserScore {
  uid: string;
  groupPoints: number;
  knockoutPoints: number;
  favoriteBonusPoints: number; // portion of group points attributable to the multiplier
  exactScoreBonusPoints: number; // portion of group points attributable to exact-score upgrade
  correctOutcomes: number;
  correctExactScores: number;
  totalPoints: number;
  finalScoreDelta: number | null;
}

export function aggregateUserScore(args: {
  uid: string;
  predictions: GroupPrediction[];
  fixtures: Record<string, Fixture>;
  results: Record<string, MatchResult | undefined>;
  favorite: FavoritePick | null;
  bracket: KnockoutBracket | null;
  /** Slot→fixtureId map for knockout (so we can look up actual results). */
  slotResults: Record<string, MatchResult | undefined>;
  /** Slot→winner team id (computed from results). */
  actualWinners: Record<string, string | undefined>;
  actualLosers: Record<string, string | undefined>;
  /** Actual final score (for tiebreaker). */
  finalActual?: { homeGoals: number; awayGoals: number };
}): UserScore {
  let groupPoints = 0;
  let favoriteBonus = 0;
  let exactBonus = 0;
  let correctOutcomes = 0;
  let correctExact = 0;

  for (const pred of args.predictions) {
    const fx = args.fixtures[pred.fixtureId];
    if (!fx) continue;
    const r = args.results[pred.fixtureId];
    const d = scoreGroupPrediction(
      pred,
      fx,
      r,
      args.favorite?.teamId ?? null
    );
    groupPoints += d.awarded;
    if (d.awarded > 0) correctOutcomes += 1;
    if (d.exact) correctExact += 1;
    if (d.favoriteApplied) favoriteBonus += d.awarded - d.basePoints;
    if (d.exact)
      exactBonus +=
        (d.favoriteApplied ? 2 : 1) *
        (GROUP_POINTS.correctExact - GROUP_POINTS.correctWinner);
  }

  let koPoints = 0;
  let finalScoreDelta: number | null = null;
  if (args.bracket) {
    const ctx = {
      actualWinners: args.actualWinners,
      actualLosers: args.actualLosers,
      picks: args.bracket.picks,
    };
    const allSlots = [
      ...Array.from({ length: 16 }, (_, i) => `R32-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `QF-${i + 1}`),
      ...Array.from({ length: 2 }, (_, i) => `SF-${i + 1}`),
      "THIRD",
      "FINAL",
    ];
    for (const slot of allSlots) {
      const d = scoreKnockoutSlot(slot, ctx, args.slotResults);
      koPoints += d.awarded;
      if (d.correct && d.lineIntact) correctOutcomes += 1;
      if (d.exactScoreCorrect) correctExact += 1;
    }

    // Tiebreaker delta uses the FINAL slot exact score pick if present.
    const finalPick = args.bracket.picks["FINAL"];
    if (
      args.finalActual &&
      finalPick &&
      finalPick.homeGoals != null &&
      finalPick.awayGoals != null
    ) {
      finalScoreDelta =
        Math.abs(finalPick.homeGoals - args.finalActual.homeGoals) +
        Math.abs(finalPick.awayGoals - args.finalActual.awayGoals);
    }
  }

  return {
    uid: args.uid,
    groupPoints,
    knockoutPoints: koPoints,
    favoriteBonusPoints: favoriteBonus,
    exactScoreBonusPoints: exactBonus,
    correctOutcomes,
    correctExactScores: correctExact,
    totalPoints: groupPoints + koPoints,
    finalScoreDelta,
  };
}

/**
 * Sort + rank entries with the tiebreaker rule:
 *   1) higher totalPoints
 *   2) lower finalScoreDelta (closer to actual final score; null = Infinity)
 *   3) more correctExactScores  (secondary fallback, sensible default)
 *   4) more correctOutcomes
 *   5) tied → same rank
 */
export function rankScores<T extends UserScore & { displayName?: string }>(
  scores: T[]
): (T & { rank: number })[] {
  const sorted = [...scores].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const ad = a.finalScoreDelta ?? Number.POSITIVE_INFINITY;
    const bd = b.finalScoreDelta ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    if (b.correctExactScores !== a.correctExactScores)
      return b.correctExactScores - a.correctExactScores;
    if (b.correctOutcomes !== a.correctOutcomes)
      return b.correctOutcomes - a.correctOutcomes;
    return 0;
  });
  // Assign dense ranks honoring ties.
  let rank = 0;
  let prevKey = "";
  return sorted.map((s, i) => {
    const key = [
      s.totalPoints,
      s.finalScoreDelta ?? "x",
      s.correctExactScores,
      s.correctOutcomes,
    ].join("|");
    if (key !== prevKey) rank = i + 1;
    prevKey = key;
    return { ...s, rank };
  });
}
