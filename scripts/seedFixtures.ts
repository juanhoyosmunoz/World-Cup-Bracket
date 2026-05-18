// Seed a placeholder fixture skeleton for the 12-group, 48-team format.
// In each group of 4: 6 round-robin matches → 72 group matches total.
// Knockout R32: 16 matches (top 2 of each group + 8 best 3rds). The actual
// bracket pairings depend on standings and are filled by the API sync once
// the group stage finishes. This script creates fixture documents for the
// group stage only; admin can sync the rest later.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
//   FIREBASE_PROJECT_ID=<id> npm run seed:fixtures

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const TOURNAMENT_START_ISO = process.env.TOURNAMENT_START_ISO ?? "2026-06-11T20:00:00Z";

// Adjust to your real schedule once published.
const KICKOFF_GAP_HOURS = 3;

async function loadTeamsByGroup() {
  const snap = await db.collection("teams").get();
  const m: Record<string, string[]> = {};
  snap.forEach((d) => {
    const t = d.data();
    if (t.group) (m[t.group] ??= []).push(t.id);
  });
  return m;
}

function roundRobin(teams: string[]): [string, string][] {
  // Classic 4-team round robin (3 rounds, 2 matches each).
  const [a, b, c, d] = teams;
  return [
    [a, b], [c, d],   // Matchday 1
    [a, c], [b, d],   // Matchday 2
    [a, d], [b, c],   // Matchday 3
  ];
}

async function main() {
  const byGroup = await loadTeamsByGroup();
  const start = new Date(TOURNAMENT_START_ISO);
  const batch = db.batch();
  let cursor = start.getTime();
  let count = 0;

  for (const group of Object.keys(byGroup).sort()) {
    const ids = byGroup[group];
    if (ids.length < 4) continue;
    const pairs = roundRobin(ids.slice(0, 4));
    for (let i = 0; i < pairs.length; i++) {
      const [home, away] = pairs[i];
      const kickoffMs = cursor + i * KICKOFF_GAP_HOURS * 3600_000;
      const lockMs = kickoffMs - 60 * 60_000;
      const id = `GRP-${group}-${i + 1}`;
      batch.set(db.collection("fixtures").doc(id), {
        id,
        stage: "GROUP",
        group,
        homeTeamId: home,
        awayTeamId: away,
        kickoff: Timestamp.fromMillis(kickoffMs),
        lockAt: Timestamp.fromMillis(lockMs),
        status: "SCHEDULED",
      });
      count++;
    }
    // Advance the cursor 4 days for the next group's matches (purely cosmetic
    // until the real schedule arrives).
    cursor += 4 * 24 * 3600_000;
  }

  // appConfig with sensible defaults
  const tournamentStart = Timestamp.fromMillis(start.getTime());
  const tournamentEnd = Timestamp.fromMillis(start.getTime() + 35 * 24 * 3600_000);
  // First KO match ~ 14 days into tournament, lock = -10 min
  const firstKoMs = start.getTime() + 14 * 24 * 3600_000;
  batch.set(db.collection("appConfig").doc("main"), {
    favoriteLockAt: Timestamp.fromMillis(start.getTime() - 60 * 60_000),
    knockoutLockAt: Timestamp.fromMillis(firstKoMs - 60 * 60_000),
    tournamentStartAt: tournamentStart,
    tournamentEndAt: tournamentEnd,
    phase: "PRE",
  });

  await batch.commit();
  console.log(`Seeded ${count} group-stage fixtures and appConfig.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
