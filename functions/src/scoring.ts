// Server-side mirror of src/lib/scoring.ts — kept in sync by hand.
// Keep this pure and side-effect free.

import type {
  FavoritePick,
  Fixture,
  GroupPrediction,
  KnockoutBracket,
  MatchResult,
  Stage,
} from "./types";

const GROUP_POINTS = {
  correctWinner: 3,
  correctExact: 5,
} as const;

const KO_POINTS: Record<Exclude<Stage, "GROUP">, number> = {
  R32: 5, R16: 10, QF: 20, SF: 40, THIRD: 50, FINAL: 80,
};

function feederSlots(slot: string): [string, string] | null {
  if (slot === "FINAL") return ["SF-1", "SF-2"];
  if (slot === "THIRD") return ["SF-1", "SF-2"];
  const m = slot.match(/^(R32|R16|QF|SF)-(\d+)$/);
  if (!m) return null;
  const stage = m[1]; const n = parseInt(m[2], 10);
  if (stage === "R32") return null;
  if (stage === "R16") return [`R32-${n * 2 - 1}`, `R32-${n * 2}`];
  if (stage === "QF")  return [`R16-${n * 2 - 1}`, `R16-${n * 2}`];
  if (stage === "SF")  return [`QF-${n * 2 - 1}`,  `QF-${n * 2}`];
  return null;
}
function stageOfSlot(slot: string): Exclude<Stage, "GROUP"> {
  if (slot === "FINAL") return "FINAL";
  if (slot === "THIRD") return "THIRD";
  return slot.split("-")[0] as Exclude<Stage, "GROUP" | "THIRD" | "FINAL">;
}

function lineIntact(
  slot: string,
  team: string,
  picks: Record<string, { teamId: string | null }>,
  actualWinners: Record<string, string | undefined>
): boolean {
  const fs = feederSlots(slot);
  if (!fs || slot === "THIRD") return true;
  const matchingFeeder = fs.find((f) => picks[f]?.teamId === team);
  if (!matchingFeeder) return false;
  if (actualWinners[matchingFeeder] !== team) return false;
  return lineIntact(matchingFeeder, team, picks, actualWinners);
}

export interface UserScore {
  uid: string;
  groupPoints: number;
  knockoutPoints: number;
  favoriteBonusPoints: number;
  exactScoreBonusPoints: number;
  correctOutcomes: number;
  correctExactScores: number;
  totalPoints: number;
  finalScoreDelta: number | null;
}

export function aggregateUserScore(args: {
  uid: string;
  predictions: GroupPrediction[];
  fixtures: Record<string, Fixture>;
  results: Record<string, MatchResult>;
  favorite: FavoritePick | null;
  bracket: KnockoutBracket | null;
  slotResults: Record<string, MatchResult | undefined>;
  actualWinners: Record<string, string | undefined>;
  actualLosers: Record<string, string | undefined>;
  finalActual?: { homeGoals: number; awayGoals: number };
}): UserScore {
  let groupPoints = 0;
  let favoriteBonus = 0;
  let exactBonus = 0;
  let correctOutcomes = 0;
  let correctExact = 0;

  const favoriteTeamId = args.favorite?.teamId ?? null;

  for (const pred of args.predictions) {
    const fx = args.fixtures[pred.fixtureId];
    if (!fx) continue;
    const r = args.results[pred.fixtureId];
    if (!r) continue;

    const actualOutcome: "DRAW" | string =
      r.homeGoals === r.awayGoals
        ? "DRAW"
        : r.homeGoals > r.awayGoals
          ? (fx.homeTeamId ?? "")
          : (fx.awayTeamId ?? "");

    if (pred.pickedOutcome !== actualOutcome) continue;
    const exact =
      pred.homeGoals != null &&
      pred.awayGoals != null &&
      pred.homeGoals === r.homeGoals &&
      pred.awayGoals === r.awayGoals;
    const base = exact ? GROUP_POINTS.correctExact : GROUP_POINTS.correctWinner;
    const fav =
      favoriteTeamId != null &&
      (fx.homeTeamId === favoriteTeamId || fx.awayTeamId === favoriteTeamId);
    const awarded = fav ? base * 2 : base;

    groupPoints += awarded;
    correctOutcomes += 1;
    if (exact) correctExact += 1;
    if (fav) favoriteBonus += awarded - base;
    if (exact) exactBonus += (fav ? 2 : 1) * (GROUP_POINTS.correctExact - GROUP_POINTS.correctWinner);
  }

  let koPoints = 0;
  let finalScoreDelta: number | null = null;
  if (args.bracket) {
    const allSlots = [
      ...Array.from({ length: 16 }, (_, i) => `R32-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `QF-${i + 1}`),
      ...Array.from({ length: 2 }, (_, i) => `SF-${i + 1}`),
      "THIRD", "FINAL",
    ];
    const picks = args.bracket.picks;
    for (const slot of allSlots) {
      const pick = picks[slot];
      if (!pick?.teamId) continue;
      const stage = stageOfSlot(slot);
      if (slot === "THIRD") {
        const actualThirdWinner = args.actualWinners["THIRD"];
        const sf1Pick = picks["SF-1"]?.teamId;
        const sf2Pick = picks["SF-2"]?.teamId;
        const sf1Loser = args.actualLosers["SF-1"];
        const sf2Loser = args.actualLosers["SF-2"];
        const team = pick.teamId;
        const fromSlot =
          team && sf1Pick && sf1Pick !== team ? "SF-1"
            : team && sf2Pick && sf2Pick !== team ? "SF-2" : null;
        const intact =
          fromSlot != null &&
          (fromSlot === "SF-1"
            ? sf1Loser === team && lineIntact("SF-1", sf1Pick!, picks, args.actualWinners)
            : sf2Loser === team && lineIntact("SF-2", sf2Pick!, picks, args.actualWinners));
        if (intact && actualThirdWinner === team) {
          koPoints += KO_POINTS.THIRD;
          correctOutcomes += 1;
        }
        continue;
      }
      const actualWinner = args.actualWinners[slot];
      if (actualWinner !== pick.teamId) continue;
      if (!lineIntact(slot, pick.teamId, picks, args.actualWinners)) continue;
      koPoints += KO_POINTS[stage];
      correctOutcomes += 1;
      const r = args.slotResults[slot];
      if (r && pick.homeGoals != null && pick.awayGoals != null &&
          pick.homeGoals === r.homeGoals && pick.awayGoals === r.awayGoals) {
        correctExact += 1;
      }
    }
    const finalPick = picks["FINAL"];
    if (args.finalActual && finalPick && finalPick.homeGoals != null && finalPick.awayGoals != null) {
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

export function rankScores<T extends UserScore>(scores: T[]): (T & { rank: number })[] {
  const sorted = [...scores].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const ad = a.finalScoreDelta ?? Number.POSITIVE_INFINITY;
    const bd = b.finalScoreDelta ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    if (b.correctExactScores !== a.correctExactScores) return b.correctExactScores - a.correctExactScores;
    if (b.correctOutcomes !== a.correctOutcomes) return b.correctOutcomes - a.correctOutcomes;
    return 0;
  });
  let rank = 0; let prevKey = "";
  return sorted.map((s, i) => {
    const key = [s.totalPoints, s.finalScoreDelta ?? "x", s.correctExactScores, s.correctOutcomes].join("|");
    if (key !== prevKey) rank = i + 1;
    prevKey = key;
    return { ...s, rank };
  });
}
