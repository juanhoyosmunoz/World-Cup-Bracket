// REST API data layer — replaces the former Firestore SDK.
//
// All `watch*` functions keep the same signature: they accept a callback,
// fetch once immediately, then poll at a fixed interval. They return an
// unsubscribe function (same as the old onSnapshot pattern).
//
// In DEMO_MODE everything routes to the in-memory store in `./demo.ts`.

import { apiFetch } from "../firebase";
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
import {
  DEMO_MODE,
  buses,
  demoSaveBracket,
  demoSaveFavorite,
  demoSavePrediction,
} from "./demo";

type Unsubscribe = () => void;

const POLL_MS = 15_000;

function poll<T>(
  path: string,
  cb: (data: T) => void,
  interval = POLL_MS
): Unsubscribe {
  let active = true;
  const doFetch = () =>
    apiFetch<T>(path)
      .then((d) => {
        if (active) cb(d);
      })
      .catch((e) => console.warn(`poll ${path}:`, e));
  doFetch();
  const id = setInterval(doFetch, interval);
  return () => {
    active = false;
    clearInterval(id);
  };
}

export function watchAppConfig(cb: (cfg: AppConfig | null) => void): Unsubscribe {
  if (DEMO_MODE) return buses.appConfig.subscribe(cb);
  return poll<AppConfig | null>("/api/app-config", cb);
}

export function watchTeams(cb: (teams: Team[]) => void): Unsubscribe {
  if (DEMO_MODE) return buses.teams.subscribe(cb);
  return poll<Team[]>("/api/teams", cb);
}

export function watchFixtures(cb: (fx: Fixture[]) => void): Unsubscribe {
  if (DEMO_MODE) return buses.fixtures.subscribe(cb);
  return poll<Fixture[]>("/api/fixtures", cb);
}

export function watchResults(cb: (res: Record<string, MatchResult>) => void): Unsubscribe {
  if (DEMO_MODE) return buses.results.subscribe(cb);
  return poll<Record<string, MatchResult>>("/api/results", cb);
}

export function watchMyPredictions(
  uid: string,
  cb: (p: GroupPrediction[]) => void
): Unsubscribe {
  if (DEMO_MODE)
    return buses.allPredictions.subscribe((all) =>
      cb(all.filter((p) => p.uid === uid))
    );
  return poll<GroupPrediction[]>("/api/predictions/me", cb);
}

export function watchMyFavorite(
  uid: string,
  cb: (f: FavoritePick | null) => void
): Unsubscribe {
  if (DEMO_MODE) return buses.favorite.subscribe(cb);
  return poll<FavoritePick | null>("/api/favorites/me", cb);
}

export function watchMyBracket(
  uid: string,
  cb: (b: KnockoutBracket | null) => void
): Unsubscribe {
  if (DEMO_MODE) return buses.bracket.subscribe(cb);
  return poll<KnockoutBracket | null>("/api/brackets/me", cb);
}

export function watchLeaderboard(
  cb: (l: LeaderboardEntry[]) => void
): Unsubscribe {
  if (DEMO_MODE) return buses.leaderboard.subscribe(cb);
  return poll<LeaderboardEntry[]>("/api/leaderboard", cb);
}

export async function savePrediction(p: GroupPrediction) {
  if (DEMO_MODE) {
    demoSavePrediction(p);
    return;
  }
  await apiFetch(`/api/predictions/${p.fixtureId}`, {
    method: "PUT",
    body: JSON.stringify({
      fixtureId: p.fixtureId,
      pickedOutcome: p.pickedOutcome,
      homeGoals: p.homeGoals ?? null,
      awayGoals: p.awayGoals ?? null,
    }),
  });
}

export async function saveFavorite(uid: string, teamId: string) {
  if (DEMO_MODE) {
    demoSaveFavorite(uid, teamId);
    return;
  }
  await apiFetch("/api/favorites", {
    method: "PUT",
    body: JSON.stringify({ teamId }),
  });
}

export async function saveBracket(uid: string, b: Partial<KnockoutBracket>) {
  if (DEMO_MODE) {
    demoSaveBracket(uid, b);
    return;
  }
  await apiFetch("/api/brackets", {
    method: "PUT",
    body: JSON.stringify({ picks: b.picks ?? {} }),
  });
}

export function watchPredictionsForFixture(
  fixtureId: string,
  cb: (preds: GroupPrediction[]) => void
): Unsubscribe {
  if (DEMO_MODE)
    return buses.allPredictions.subscribe((all) =>
      cb(all.filter((p) => p.fixtureId === fixtureId))
    );
  return poll<GroupPrediction[]>(
    `/api/predictions/fixture/${fixtureId}`,
    cb
  );
}

export async function getOnce<T>(path: string): Promise<T | null> {
  if (DEMO_MODE) return null;
  try {
    return await apiFetch<T>(`/api/${path}`);
  } catch {
    return null;
  }
}
