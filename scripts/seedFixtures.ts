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
import { KO_SLOTS, knockoutSlotTimes, stageOfSlot } from "../src/lib/bracket";

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

  // Knockout fixtures — one per bracket slot (R32 → FINAL). Teams stay TBD until
  // the API sync fills the bracket once the group stage resolves. Each fixture
  // carries an official WC 2026 kickoff/lock time so the bracket UI shows a
  // per-match lock countdown; each pick locks 1 hour before kickoff.
  let koCount = 0;
  for (const slot of KO_SLOTS) {
    const t = knockoutSlotTimes(slot)!;
    const id = `KO-${slot}`;
    batch.set(db.collection("fixtures").doc(id), {
      id,
      stage: stageOfSlot(slot),
      bracketSlot: slot,
      homeTeamId: null,
      awayTeamId: null,
      kickoff: Timestamp.fromMillis(t.kickoffMs),
      lockAt: Timestamp.fromMillis(t.lockMs),
      status: "SCHEDULED",
    });
    koCount++;
  }

  // appConfig with sensible defaults
  const tournamentStart = Timestamp.fromMillis(start.getTime());
  const tournamentEnd = Timestamp.fromMillis(start.getTime() + 35 * 24 * 3600_000);
  batch.set(db.collection("appConfig").doc("main"), {
    favoriteLockAt: Timestamp.fromMillis(start.getTime() - 60 * 60_000),
    // Backstop only: each knockout match locks individually 1h before its own
    // kickoff. This coarse server cutoff = the Final's lock time.
    knockoutLockAt: Timestamp.fromMillis(knockoutSlotTimes("FINAL")!.lockMs),
    tournamentStartAt: tournamentStart,
    tournamentEndAt: tournamentEnd,
    phase: "PRE",
  });

  await batch.commit();
  console.log(`Seeded ${count} group-stage + ${koCount} knockout fixtures and appConfig.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
