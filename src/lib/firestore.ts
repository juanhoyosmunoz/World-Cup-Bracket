// Thin typed wrappers around Firestore reads/writes the UI uses repeatedly.
//
// In DEMO_MODE all of these route to the in-memory store in `./demo.ts`,
// so the app runs end-to-end with no Firebase backend.

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  AppConfig,
  FavoritePick,
  Fixture,
  GroupPrediction,
  KnockoutBracket,
  LeaderboardEntry,
  MatchResult,
  Team,
} from "../types";
import { serverTimestamp } from "firebase/firestore";
import {
  DEMO_MODE,
  buses,
  demoSaveBracket,
  demoSaveFavorite,
  demoSavePrediction,
} from "./demo";

export function watchAppConfig(cb: (cfg: AppConfig | null) => void): Unsubscribe {
  if (DEMO_MODE) return buses.appConfig.subscribe(cb);
  return onSnapshot(doc(db, "appConfig", "main"), (snap) => {
    cb(snap.exists() ? (snap.data() as AppConfig) : null);
  });
}

export function watchTeams(cb: (teams: Team[]) => void): Unsubscribe {
  if (DEMO_MODE) return buses.teams.subscribe(cb);
  return onSnapshot(collection(db, "teams"), (snap) => {
    cb(snap.docs.map((d) => d.data() as Team));
  });
}

export function watchFixtures(cb: (fx: Fixture[]) => void): Unsubscribe {
  if (DEMO_MODE) return buses.fixtures.subscribe(cb);
  const q = query(collection(db, "fixtures"), orderBy("kickoff", "asc"));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
  );
}

export function watchResults(cb: (res: Record<string, MatchResult>) => void): Unsubscribe {
  if (DEMO_MODE) return buses.results.subscribe(cb);
  return onSnapshot(collection(db, "results"), (snap) => {
    const map: Record<string, MatchResult> = {};
    snap.docs.forEach((d) => (map[d.id] = d.data() as MatchResult));
    cb(map);
  });
}

export function watchMyPredictions(
  uid: string,
  cb: (p: GroupPrediction[]) => void
): Unsubscribe {
  if (DEMO_MODE) return buses.allPredictions.subscribe((all) => cb(all.filter((p) => p.uid === uid)));
  const q = query(collection(db, "predictions"), where("uid", "==", uid));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => d.data() as GroupPrediction))
  );
}

export function watchMyFavorite(uid: string, cb: (f: FavoritePick | null) => void): Unsubscribe {
  if (DEMO_MODE) return buses.favorite.subscribe(cb);
  return onSnapshot(doc(db, "favorites", uid), (snap) => {
    cb(snap.exists() ? (snap.data() as FavoritePick) : null);
  });
}

export function watchMyBracket(uid: string, cb: (b: KnockoutBracket | null) => void): Unsubscribe {
  if (DEMO_MODE) return buses.bracket.subscribe(cb);
  return onSnapshot(doc(db, "knockoutBrackets", uid), (snap) => {
    cb(snap.exists() ? (snap.data() as KnockoutBracket) : null);
  });
}

export function watchLeaderboard(cb: (l: LeaderboardEntry[]) => void): Unsubscribe {
  if (DEMO_MODE) return buses.leaderboard.subscribe(cb);
  const q = query(collection(db, "leaderboard"), orderBy("totalPoints", "desc"));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => d.data() as LeaderboardEntry))
  );
}

export async function savePrediction(p: GroupPrediction) {
  if (DEMO_MODE) { demoSavePrediction(p); return; }
  const id = `${p.uid}_${p.fixtureId}`;
  await setDoc(
    doc(db, "predictions", id),
    { ...p, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function saveFavorite(uid: string, teamId: string) {
  if (DEMO_MODE) { demoSaveFavorite(uid, teamId); return; }
  await setDoc(
    doc(db, "favorites", uid),
    { uid, teamId, setAt: serverTimestamp() },
    { merge: true }
  );
}

export async function saveBracket(uid: string, b: Partial<KnockoutBracket>) {
  if (DEMO_MODE) { demoSaveBracket(uid, b); return; }
  await setDoc(
    doc(db, "knockoutBrackets", uid),
    { uid, ...b, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function watchPredictionsForFixture(
  fixtureId: string,
  cb: (preds: GroupPrediction[]) => void
): Unsubscribe {
  if (DEMO_MODE) return buses.allPredictions.subscribe((all) => cb(all.filter((p) => p.fixtureId === fixtureId)));
  const q = query(collection(db, "predictions"), where("fixtureId", "==", fixtureId));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => d.data() as GroupPrediction))
  );
}

export async function getOnce<T>(path: string): Promise<T | null> {
  if (DEMO_MODE) return null;
  const s = await getDoc(doc(db, path));
  return s.exists() ? (s.data() as T) : null;
}
