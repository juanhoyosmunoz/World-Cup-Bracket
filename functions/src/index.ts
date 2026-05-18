// Cloud Functions for the Antenna World Cup 2026 Bracket
//
//   - setAdmins:           grant admin custom claim to env-listed emails (admin-only)
//   - syncTeams:           pull teams from provider → Firestore (admin-only callable + scheduled)
//   - syncFixtures:        pull fixtures from provider → Firestore (admin-only callable + scheduled)
//   - syncResults:         pull results from provider, write `results/` + flip status (callable + scheduled)
//   - recomputeLeaderboard: aggregate all users' scores into `leaderboard/` (callable + on result write)
//
// Provider abstraction lives in `providers/`. Default is API-FOOTBALL.

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineString, defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

import { apiFootballProvider } from "./providers/apifootball";
import { aggregateUserScore, rankScores } from "./scoring";
import type {
  AppConfig,
  FavoritePick,
  Fixture,
  GroupPrediction,
  KnockoutBracket,
  LeaderboardEntry,
  MatchResult,
  Team,
  UserProfile,
} from "./types";

initializeApp();
const db = getFirestore();

const ADMIN_EMAILS = defineString("ADMIN_EMAILS", { default: "" });
const APIFOOTBALL_KEY = defineSecret("APIFOOTBALL_KEY");
const APIFOOTBALL_LEAGUE_ID = defineString("APIFOOTBALL_LEAGUE_ID", { default: "1" });
const APIFOOTBALL_SEASON = defineString("APIFOOTBALL_SEASON", { default: "2026" });

const LOCK_LEAD_MS = 60 * 60 * 1000;

function requireAdmin(ctx: { auth?: { token?: { admin?: boolean; email?: string } } | null }) {
  if (!ctx.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (ctx.auth.token?.admin === true) return;
  const adminEmails = ADMIN_EMAILS.value().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.includes((ctx.auth.token?.email ?? "").toLowerCase())) return;
  throw new HttpsError("permission-denied", "Admin required.");
}

async function recordHealth(task: string, ok: boolean, error?: string) {
  await db.collection("syncHealth").add({
    task,
    ok,
    error: error ?? null,
    at: Timestamp.now(),
  });
}

// -----------------------------------------------------------------------------
// setAdmins — grants admin claim to env-configured emails. Idempotent.
// -----------------------------------------------------------------------------
export const setAdmins = onCall(async (req) => {
  requireAdmin(req);
  const emails = ADMIN_EMAILS.value().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const results: { email: string; uid?: string; ok: boolean; error?: string }[] = [];
  for (const email of emails) {
    try {
      const u = await getAuth().getUserByEmail(email);
      const cur = (u.customClaims ?? {}) as Record<string, unknown>;
      if (cur.admin !== true) {
        await getAuth().setCustomUserClaims(u.uid, { ...cur, admin: true });
      }
      results.push({ email, uid: u.uid, ok: true });
    } catch (e: any) {
      results.push({ email, ok: false, error: e?.message ?? String(e) });
    }
  }
  return { results };
});

// -----------------------------------------------------------------------------
// Provider selection
// -----------------------------------------------------------------------------
function provider() {
  return apiFootballProvider({
    apiKey: APIFOOTBALL_KEY.value(),
    leagueId: parseInt(APIFOOTBALL_LEAGUE_ID.value(), 10),
    season: parseInt(APIFOOTBALL_SEASON.value(), 10),
  });
}

// -----------------------------------------------------------------------------
// syncTeams
// -----------------------------------------------------------------------------
async function doSyncTeams() {
  const teams = await provider().fetchTeams();
  const batch = db.batch();
  for (const t of teams) {
    batch.set(db.collection("teams").doc(t.id), {
      id: t.id, name: t.name, shortName: t.shortName, flag: t.flag, group: t.group ?? null,
    } satisfies Team, { merge: true });
  }
  await batch.commit();
  return { count: teams.length };
}

export const syncTeams = onCall({ secrets: [APIFOOTBALL_KEY] }, async (req) => {
  requireAdmin(req);
  try {
    const r = await doSyncTeams();
    await recordHealth("syncTeams", true);
    return r;
  } catch (e: any) {
    await recordHealth("syncTeams", false, e?.message ?? String(e));
    throw new HttpsError("internal", e?.message ?? "syncTeams failed");
  }
});

// -----------------------------------------------------------------------------
// syncFixtures
// -----------------------------------------------------------------------------
async function doSyncFixtures() {
  const fxs = await provider().fetchFixtures();
  const batch = db.batch();
  for (const f of fxs) {
    const kickoff = Timestamp.fromDate(new Date(f.kickoffISO));
    const lockAt = Timestamp.fromMillis(kickoff.toMillis() - LOCK_LEAD_MS);
    const id = f.externalId; // use provider id as our id for stability
    batch.set(db.collection("fixtures").doc(id), {
      id,
      externalId: f.externalId,
      stage: f.stage,
      group: f.group ?? null,
      bracketSlot: f.bracketSlot ?? null,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      kickoff,
      lockAt,
      status: f.status,
      venue: f.venue ?? null,
    } satisfies Fixture, { merge: true });
  }
  await batch.commit();
  return { count: fxs.length };
}

export const syncFixtures = onCall({ secrets: [APIFOOTBALL_KEY] }, async (req) => {
  requireAdmin(req);
  try {
    const r = await doSyncFixtures();
    await recordHealth("syncFixtures", true);
    return r;
  } catch (e: any) {
    await recordHealth("syncFixtures", false, e?.message ?? String(e));
    throw new HttpsError("internal", e?.message ?? "syncFixtures failed");
  }
});

// -----------------------------------------------------------------------------
// syncResults
// -----------------------------------------------------------------------------
async function doSyncResults() {
  const fxs = await provider().fetchFixtures();
  const batch = db.batch();
  let writes = 0;
  for (const f of fxs) {
    if (f.status === "FINISHED" && typeof f.homeGoals === "number" && typeof f.awayGoals === "number") {
      const id = f.externalId;
      const outcome =
        f.homeGoals === f.awayGoals
          ? "DRAW"
          : f.homeGoals > f.awayGoals
            ? (f.homeTeamId ?? "")
            : (f.awayTeamId ?? "");
      batch.set(db.collection("results").doc(id), {
        fixtureId: id,
        homeGoals: f.homeGoals,
        awayGoals: f.awayGoals,
        outcome,
        finalizedAt: Timestamp.now(),
        source: "API",
      } satisfies MatchResult, { merge: true });
      batch.set(db.collection("fixtures").doc(id), { status: "FINISHED" }, { merge: true });
      writes++;
    } else if (f.status === "LIVE") {
      batch.set(db.collection("fixtures").doc(f.externalId), { status: "LIVE" }, { merge: true });
    }
  }
  await batch.commit();
  return { writes };
}

export const syncResults = onCall({ secrets: [APIFOOTBALL_KEY] }, async (req) => {
  requireAdmin(req);
  try {
    const r = await doSyncResults();
    await recordHealth("syncResults", true);
    return r;
  } catch (e: any) {
    await recordHealth("syncResults", false, e?.message ?? String(e));
    throw new HttpsError("internal", e?.message ?? "syncResults failed");
  }
});

// Scheduled sync — every 15 minutes during the tournament window.
export const scheduledSync = onSchedule(
  { schedule: "every 15 minutes", secrets: [APIFOOTBALL_KEY], timeZone: "UTC" },
  async () => {
    try {
      await doSyncFixtures();
      await doSyncResults();
      await recordHealth("scheduledSync", true);
    } catch (e: any) {
      logger.error("scheduledSync failed", e);
      await recordHealth("scheduledSync", false, e?.message ?? String(e));
    }
  }
);

// -----------------------------------------------------------------------------
// recomputeLeaderboard — aggregates all scores; written to `leaderboard/`.
// -----------------------------------------------------------------------------
async function doRecomputeLeaderboard() {
  // Load everything we need into memory. 20 users * ~104 matches → tiny.
  const [usersSnap, fixSnap, resSnap, predSnap, favSnap, brkSnap, prevSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("fixtures").get(),
    db.collection("results").get(),
    db.collection("predictions").get(),
    db.collection("favorites").get(),
    db.collection("knockoutBrackets").get(),
    db.collection("leaderboard").get(),
  ]);

  const users = new Map<string, UserProfile>();
  usersSnap.forEach((d) => users.set(d.id, d.data() as UserProfile));

  const fixtures: Record<string, Fixture> = {};
  fixSnap.forEach((d) => (fixtures[d.id] = { id: d.id, ...(d.data() as any) }));

  const results: Record<string, MatchResult> = {};
  resSnap.forEach((d) => (results[d.id] = d.data() as MatchResult));

  // Bucket predictions by user
  const predsByUid = new Map<string, GroupPrediction[]>();
  predSnap.forEach((d) => {
    const p = d.data() as GroupPrediction;
    if (!predsByUid.has(p.uid)) predsByUid.set(p.uid, []);
    predsByUid.get(p.uid)!.push(p);
  });

  const favs = new Map<string, FavoritePick>();
  favSnap.forEach((d) => favs.set(d.id, d.data() as FavoritePick));

  const brackets = new Map<string, KnockoutBracket>();
  brkSnap.forEach((d) => brackets.set(d.id, d.data() as KnockoutBracket));

  // Compute slot → result map for knockout (slot is fx.bracketSlot)
  const slotResults: Record<string, MatchResult | undefined> = {};
  const slotWinners: Record<string, string | undefined> = {};
  const slotLosers: Record<string, string | undefined> = {};
  for (const fx of Object.values(fixtures)) {
    if (!fx.bracketSlot) continue;
    const r = results[fx.id];
    slotResults[fx.bracketSlot] = r;
    if (r && fx.homeTeamId && fx.awayTeamId) {
      if (r.homeGoals > r.awayGoals) {
        slotWinners[fx.bracketSlot] = fx.homeTeamId;
        slotLosers[fx.bracketSlot] = fx.awayTeamId;
      } else if (r.awayGoals > r.homeGoals) {
        slotWinners[fx.bracketSlot] = fx.awayTeamId;
        slotLosers[fx.bracketSlot] = fx.homeTeamId;
      }
      // KO matches don't end in draws (presume decided by ET/pens; API reports winner via score).
    }
  }
  const finalRes = slotResults["FINAL"];
  const finalActual = finalRes ? { homeGoals: finalRes.homeGoals, awayGoals: finalRes.awayGoals } : undefined;

  // Previous ranks for movement
  const prevRank = new Map<string, number>();
  prevSnap.forEach((d) => {
    const r = d.data() as LeaderboardEntry;
    prevRank.set(r.uid, r.rank);
  });

  const entries: (LeaderboardEntry & {})[] = [];
  for (const [uid, profile] of users) {
    const preds = predsByUid.get(uid) ?? [];
    const fav = favs.get(uid) ?? null;
    const brk = brackets.get(uid) ?? null;
    const s = aggregateUserScore({
      uid,
      predictions: preds,
      fixtures,
      results,
      favorite: fav,
      bracket: brk,
      slotResults,
      actualWinners: slotWinners,
      actualLosers: slotLosers,
      finalActual,
    });
    entries.push({
      uid,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      totalPoints: s.totalPoints,
      groupPoints: s.groupPoints,
      knockoutPoints: s.knockoutPoints,
      favoriteBonusPoints: s.favoriteBonusPoints,
      exactScoreBonusPoints: s.exactScoreBonusPoints,
      correctOutcomes: s.correctOutcomes,
      correctExactScores: s.correctExactScores,
      finalScoreDelta: s.finalScoreDelta,
      previousRank: prevRank.get(uid) ?? null,
      rank: 0, // overwritten below
      updatedAt: Timestamp.now(),
    });
  }

  const ranked = rankScores(entries);
  const batch = db.batch();
  for (const r of ranked) {
    batch.set(db.collection("leaderboard").doc(r.uid), r, { merge: false });
  }
  await batch.commit();
  return { users: ranked.length };
}

export const recomputeLeaderboard = onCall(async (req) => {
  requireAdmin(req);
  try {
    const r = await doRecomputeLeaderboard();
    await recordHealth("recomputeLeaderboard", true);
    return r;
  } catch (e: any) {
    await recordHealth("recomputeLeaderboard", false, e?.message ?? String(e));
    throw new HttpsError("internal", e?.message ?? "recomputeLeaderboard failed");
  }
});

// Whenever a result is written, recompute the leaderboard. (Cheap — 20 users.)
export const onResultWrite = onDocumentWritten("results/{fixtureId}", async () => {
  try {
    await doRecomputeLeaderboard();
  } catch (e) {
    logger.error("onResultWrite recompute failed", e);
  }
});
