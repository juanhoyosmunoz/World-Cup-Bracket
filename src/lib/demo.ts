// DEMO MODE — runs the app without any Firebase backend so the UI can be
// previewed locally with `npm run dev` and zero setup. Enabled when
// `VITE_DEMO_MODE=true` in .env. All Firestore reads/writes are routed
// through this module's in-memory store.

import type { Timestamp } from "firebase/firestore";
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
} from "../types";

export const DEMO_MODE =
  (import.meta as any).env?.VITE_DEMO_MODE === "true";

type Listener<T> = (v: T) => void;

class Bus<T> {
  private listeners = new Set<Listener<T>>();
  constructor(private getter: () => T) {}
  subscribe(cb: Listener<T>) {
    this.listeners.add(cb);
    cb(this.getter());
    return () => this.listeners.delete(cb);
  }
  notify() { for (const l of this.listeners) l(this.getter()); }
}

// Fake Timestamp shim that exposes toDate()/toMillis().
function ts(date: Date): Timestamp {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1e6,
  } as unknown as Timestamp;
}

const now = new Date("2026-06-08T12:00:00Z"); // a few days before tournament

// --- Mock user --------------------------------------------------------------

export const DEMO_USER = {
  uid: "demo-user",
  email: "camila@antenna.live",
  displayName: "Camila Schuchner",
  photoURL:
    "https://api.dicebear.com/9.x/initials/svg?seed=CS&backgroundColor=FFD600",
};

// --- Teams ------------------------------------------------------------------

// Real 2026 FIFA World Cup group draw (December 2025).
// Source: en.wikipedia.org/wiki/2026_FIFA_World_Cup.
const SCO_FLAG = "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
const ENG_FLAG = "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";

const TEAMS: Team[] = [
  // Group A
  { id: "MEX", name: "Mexico",               shortName: "MEX", flag: "🇲🇽", group: "A" },
  { id: "RSA", name: "South Africa",         shortName: "RSA", flag: "🇿🇦", group: "A" },
  { id: "KOR", name: "South Korea",          shortName: "KOR", flag: "🇰🇷", group: "A" },
  { id: "CZE", name: "Czech Republic",       shortName: "CZE", flag: "🇨🇿", group: "A" },
  // Group B
  { id: "CAN", name: "Canada",               shortName: "CAN", flag: "🇨🇦", group: "B" },
  { id: "BIH", name: "Bosnia & Herzegovina", shortName: "BIH", flag: "🇧🇦", group: "B" },
  { id: "QAT", name: "Qatar",                shortName: "QAT", flag: "🇶🇦", group: "B" },
  { id: "SUI", name: "Switzerland",          shortName: "SUI", flag: "🇨🇭", group: "B" },
  // Group C
  { id: "BRA", name: "Brazil",               shortName: "BRA", flag: "🇧🇷", group: "C" },
  { id: "MAR", name: "Morocco",              shortName: "MAR", flag: "🇲🇦", group: "C" },
  { id: "HAI", name: "Haiti",                shortName: "HAI", flag: "🇭🇹", group: "C" },
  { id: "SCO", name: "Scotland",             shortName: "SCO", flag: SCO_FLAG, group: "C" },
  // Group D
  { id: "USA", name: "United States",        shortName: "USA", flag: "🇺🇸", group: "D" },
  { id: "PAR", name: "Paraguay",             shortName: "PAR", flag: "🇵🇾", group: "D" },
  { id: "AUS", name: "Australia",            shortName: "AUS", flag: "🇦🇺", group: "D" },
  { id: "TUR", name: "Türkiye",              shortName: "TUR", flag: "🇹🇷", group: "D" },
  // Group E
  { id: "GER", name: "Germany",              shortName: "GER", flag: "🇩🇪", group: "E" },
  { id: "CUW", name: "Curaçao",              shortName: "CUW", flag: "🇨🇼", group: "E" },
  { id: "CIV", name: "Ivory Coast",          shortName: "CIV", flag: "🇨🇮", group: "E" },
  { id: "ECU", name: "Ecuador",              shortName: "ECU", flag: "🇪🇨", group: "E" },
  // Group F
  { id: "NED", name: "Netherlands",          shortName: "NED", flag: "🇳🇱", group: "F" },
  { id: "JPN", name: "Japan",                shortName: "JPN", flag: "🇯🇵", group: "F" },
  { id: "SWE", name: "Sweden",               shortName: "SWE", flag: "🇸🇪", group: "F" },
  { id: "TUN", name: "Tunisia",              shortName: "TUN", flag: "🇹🇳", group: "F" },
  // Group G
  { id: "BEL", name: "Belgium",              shortName: "BEL", flag: "🇧🇪", group: "G" },
  { id: "EGY", name: "Egypt",                shortName: "EGY", flag: "🇪🇬", group: "G" },
  { id: "IRN", name: "Iran",                 shortName: "IRN", flag: "🇮🇷", group: "G" },
  { id: "NZL", name: "New Zealand",          shortName: "NZL", flag: "🇳🇿", group: "G" },
  // Group H
  { id: "ESP", name: "Spain",                shortName: "ESP", flag: "🇪🇸", group: "H" },
  { id: "CPV", name: "Cape Verde",           shortName: "CPV", flag: "🇨🇻", group: "H" },
  { id: "KSA", name: "Saudi Arabia",         shortName: "KSA", flag: "🇸🇦", group: "H" },
  { id: "URU", name: "Uruguay",              shortName: "URU", flag: "🇺🇾", group: "H" },
  // Group I
  { id: "FRA", name: "France",               shortName: "FRA", flag: "🇫🇷", group: "I" },
  { id: "SEN", name: "Senegal",              shortName: "SEN", flag: "🇸🇳", group: "I" },
  { id: "IRQ", name: "Iraq",                 shortName: "IRQ", flag: "🇮🇶", group: "I" },
  { id: "NOR", name: "Norway",               shortName: "NOR", flag: "🇳🇴", group: "I" },
  // Group J
  { id: "ARG", name: "Argentina",            shortName: "ARG", flag: "🇦🇷", group: "J" },
  { id: "ALG", name: "Algeria",              shortName: "ALG", flag: "🇩🇿", group: "J" },
  { id: "AUT", name: "Austria",              shortName: "AUT", flag: "🇦🇹", group: "J" },
  { id: "JOR", name: "Jordan",               shortName: "JOR", flag: "🇯🇴", group: "J" },
  // Group K
  { id: "POR", name: "Portugal",             shortName: "POR", flag: "🇵🇹", group: "K" },
  { id: "COD", name: "DR Congo",             shortName: "COD", flag: "🇨🇩", group: "K" },
  { id: "UZB", name: "Uzbekistan",           shortName: "UZB", flag: "🇺🇿", group: "K" },
  { id: "COL", name: "Colombia",             shortName: "COL", flag: "🇨🇴", group: "K" },
  // Group L
  { id: "ENG", name: "England",              shortName: "ENG", flag: ENG_FLAG, group: "L" },
  { id: "CRO", name: "Croatia",              shortName: "CRO", flag: "🇭🇷", group: "L" },
  { id: "GHA", name: "Ghana",                shortName: "GHA", flag: "🇬🇭", group: "L" },
  { id: "PAN", name: "Panama",               shortName: "PAN", flag: "🇵🇦", group: "L" },
];

// --- Fixtures (6 group matches × 12 groups = 72; staggered every 3h) --------

function roundRobin(teams: string[]): [string, string][] {
  const [a, b, c, d] = teams;
  return [[a, b], [c, d], [a, c], [b, d], [a, d], [b, c]];
}

const FIXTURES: Fixture[] = (() => {
  const out: Fixture[] = [];
  const byGroup: Record<string, string[]> = {};
  for (const t of TEAMS) (byGroup[t.group!] ??= []).push(t.id);

  const start = new Date("2026-06-11T20:00:00Z").getTime();
  let cursor = start;
  for (const g of Object.keys(byGroup).sort()) {
    const pairs = roundRobin(byGroup[g]);
    for (let i = 0; i < pairs.length; i++) {
      const [h, a] = pairs[i];
      const kickoffMs = cursor + i * 3 * 3600_000;
      out.push({
        id: `GRP-${g}-${i + 1}`,
        stage: "GROUP",
        group: g,
        homeTeamId: h,
        awayTeamId: a,
        kickoff: ts(new Date(kickoffMs)),
        lockAt: ts(new Date(kickoffMs - 60 * 60_000)),
        status: "SCHEDULED",
      });
    }
    cursor += 2 * 24 * 3600_000;
  }
  return out;
})();

// R32 placeholder fixtures with bracketSlot R32-1..R32-16 mapped to top-2
// finishers using a plausible pairing so the bracket UI has candidates.
const R32_FIXTURES: Fixture[] = (() => {
  // Use first two teams of each group as the "qualifiers" for demo purposes.
  const byGroup: Record<string, string[]> = {};
  for (const t of TEAMS) (byGroup[t.group!] ??= []).push(t.id);
  const groups = Object.keys(byGroup).sort();
  const winners = groups.map((g) => byGroup[g][0]);
  const runners = groups.map((g) => byGroup[g][1]);
  // 24 qualifiers + 8 best 3rds (use 3rd team in each group for demo).
  const thirds = groups.slice(0, 8).map((g) => byGroup[g][2]);
  const allKnockoutTeams = [...winners, ...runners, ...thirds];

  const koStart = new Date("2026-06-29T20:00:00Z").getTime();
  return Array.from({ length: 16 }, (_, i) => {
    const home = allKnockoutTeams[i * 2] ?? null;
    const away = allKnockoutTeams[i * 2 + 1] ?? null;
    const kickoff = koStart + i * 3 * 3600_000;
    return {
      id: `R32-FX-${i + 1}`,
      stage: "R32" as const,
      bracketSlot: `R32-${i + 1}`,
      homeTeamId: home,
      awayTeamId: away,
      kickoff: ts(new Date(kickoff)),
      lockAt: ts(new Date(kickoff - 10 * 60_000)),
      status: "SCHEDULED" as const,
    };
  });
})();

const ALL_FIXTURES: Fixture[] = [...FIXTURES, ...R32_FIXTURES];

// Demo: simulate several simultaneous LIVE matches so the user can preview
// the live-now section without waiting for June 11. Each tuple is
// [fixtureId, minutesElapsedAtRealNow].
(function makeFixturesLive() {
  const liveSeed: [string, number][] = [
    ["GRP-F-1", 37],   // 🇳🇱 NED vs 🇯🇵 JPN  · 1st half
    ["GRP-G-1", 14],   // 🇧🇪 BEL vs 🇪🇬 EGY  · early
    ["GRP-H-1", 67],   // 🇪🇸 ESP vs 🇨🇻 CPV  · 2nd half
  ];
  for (const [id, minutes] of liveSeed) {
    const target = ALL_FIXTURES.find((f) => f.id === id);
    if (!target) continue;
    const kickoffMs = Date.now() - minutes * 60_000;
    target.status = "LIVE";
    target.kickoff = ts(new Date(kickoffMs));
    target.lockAt = ts(new Date(kickoffMs - 60 * 60_000));
  }
})();

// --- AppConfig --------------------------------------------------------------

const APP_CONFIG: AppConfig = {
  favoriteLockAt: ts(new Date("2026-06-11T19:00:00Z")),
  knockoutLockAt: ts(new Date("2026-06-29T19:00:00Z")),
  tournamentStartAt: ts(new Date("2026-06-11T20:00:00Z")),
  tournamentEndAt: ts(new Date("2026-07-19T22:00:00Z")),
  phase: "PRE",
};

// --- Mutable user state -----------------------------------------------------

// All predictions from every (mock) participant, including the demo user.
// The "See all picks" modal queries this list when a match is locked.
type DemoPrediction = GroupPrediction & { _demoName?: string; _demoPhoto?: string };
let allPredictions: DemoPrediction[] = [];
let favorite: FavoritePick | null = {
  uid: DEMO_USER.uid,
  teamId: "ARG",
  setAt: ts(new Date()),
};
let bracket: KnockoutBracket | null = null;
// Pre-seeded results for the first ~12 group matches so the Groups,
// Leaderboard, and Dashboard pages show something interesting in demo mode.
function mkResult(
  fixtureId: string,
  fixtures: Fixture[],
  homeGoals: number,
  awayGoals: number
): MatchResult | null {
  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx || !fx.homeTeamId || !fx.awayTeamId) return null;
  const outcome =
    homeGoals === awayGoals
      ? "DRAW"
      : homeGoals > awayGoals
        ? fx.homeTeamId
        : fx.awayTeamId;
  return {
    fixtureId,
    homeGoals,
    awayGoals,
    outcome,
    finalizedAt: ts(new Date()),
    source: "API",
  };
}

const results: Record<string, MatchResult> = (() => {
  const m: Record<string, MatchResult> = {};
  const seed: [string, number, number][] = [
    // Group A — all 6 matches
    ["GRP-A-1", 2, 1], ["GRP-A-2", 0, 0],
    ["GRP-A-3", 3, 1], ["GRP-A-4", 1, 2],
    ["GRP-A-5", 2, 0], ["GRP-A-6", 1, 1],
    // Group B — 4 of 6 matches
    ["GRP-B-1", 3, 0], ["GRP-B-2", 1, 1],
    ["GRP-B-3", 2, 0], ["GRP-B-4", 2, 2],
    // First match in groups C, D, E
    ["GRP-C-1", 2, 1],
    ["GRP-D-1", 1, 0],
    ["GRP-E-1", 3, 2],
  ];
  for (const [id, h, a] of seed) {
    const r = mkResult(id, ALL_FIXTURES, h, a);
    if (r) m[id] = r;
  }
  // Mark the corresponding fixtures FINISHED for nicer display.
  for (const id of Object.keys(m)) {
    const fx = ALL_FIXTURES.find((f) => f.id === id);
    if (fx) fx.status = "FINISHED";
  }
  return m;
})();

// Seed predictions from each mock participant for every completed match,
// so the "See all picks" modal has real data to render. Each mock user has
// a per-match (outcome, homeGoals, awayGoals) tuple. Outcomes are encoded
// as "H" (home), "A" (away), "D" (draw), then resolved to team ids below.
const MOCK_USERS: { uid: string; name: string; photo?: string }[] = [
  { uid: "u-1", name: "Lauren M.",  photo: "https://api.dicebear.com/9.x/initials/svg?seed=LM&backgroundColor=FFD600" },
  { uid: "u-2", name: "Juan R.",    photo: "https://api.dicebear.com/9.x/initials/svg?seed=JR&backgroundColor=FFE14D" },
  { uid: "u-3", name: "Diego A.",   photo: "https://api.dicebear.com/9.x/initials/svg?seed=DA&backgroundColor=FFEC80" },
  { uid: "u-4", name: "Sofía L.",   photo: "https://api.dicebear.com/9.x/initials/svg?seed=SL&backgroundColor=FFF7B3" },
  { uid: "u-5", name: "Marco T.",   photo: "https://api.dicebear.com/9.x/initials/svg?seed=MT&backgroundColor=D6B400" },
  { uid: "u-6", name: "Anita W.",   photo: "https://api.dicebear.com/9.x/initials/svg?seed=AW&backgroundColor=A88E00" },
];

type Pick = ["H" | "A" | "D", number | null, number | null];
const PICK_TABLE: Record<string, Pick[]> = {
  // per-fixture row: order matches MOCK_USERS (u-1..u-6) then DEMO_USER
  "GRP-A-1": [["H", 2, 1], ["H", 1, 0], ["D", 1, 1], ["H", 2, 0], ["A", 1, 2], ["H", 3, 1], ["H", 2, 1]],
  "GRP-A-2": [["D", 1, 1], ["D", 0, 0], ["H", 2, 1], ["D", null, null], ["A", 0, 1], ["D", 1, 1], ["H", 2, 1]],
  "GRP-A-3": [["H", 2, 1], ["H", 3, 0], ["H", 3, 1], ["A", 1, 2], ["H", 2, 0], ["H", 2, 1], ["H", 3, 1]],
  "GRP-A-4": [["A", 0, 2], ["A", 1, 2], ["H", 2, 1], ["D", 1, 1], ["A", 0, 1], ["A", 1, 2], ["H", 1, 1]],
  "GRP-A-5": [["H", 2, 0], ["H", 1, 0], ["H", 3, 1], ["H", 2, 1], ["A", 0, 1], ["H", 2, 0], ["H", 2, 0]],
  "GRP-A-6": [["D", 1, 1], ["H", 1, 0], ["A", 0, 1], ["D", 2, 2], ["D", 1, 1], ["A", 0, 1], ["D", 0, 0]],
  "GRP-B-1": [["H", 2, 0], ["H", 3, 0], ["H", 1, 0], ["A", 0, 1], ["D", 1, 1], ["H", 2, 1], ["H", 3, 0]],
  "GRP-B-2": [["A", 0, 1], ["D", 1, 1], ["H", 2, 1], ["D", 1, 1], ["D", 0, 0], ["H", 2, 0], ["D", 1, 1]],
  "GRP-B-3": [["H", 2, 0], ["H", 1, 0], ["H", 3, 1], ["H", 2, 1], ["A", 0, 1], ["D", 1, 1], ["H", 2, 0]],
  "GRP-B-4": [["D", 1, 1], ["H", 2, 1], ["A", 0, 1], ["D", 2, 2], ["D", 1, 1], ["D", 0, 0], ["D", 2, 2]],
  "GRP-C-1": [["H", 2, 1], ["H", 3, 0], ["H", 2, 0], ["D", 1, 1], ["A", 0, 2], ["H", 1, 0], ["H", 2, 1]],
  "GRP-D-1": [["H", 1, 0], ["H", 2, 1], ["H", 1, 0], ["A", 0, 1], ["D", 1, 1], ["H", 1, 0], ["H", 2, 0]],
  "GRP-E-1": [["H", 3, 1], ["H", 2, 1], ["H", 3, 2], ["A", 1, 2], ["D", 2, 2], ["H", 2, 0], ["H", 3, 2]],
};

(function seedDemoPicks() {
  const participants = [...MOCK_USERS, { uid: DEMO_USER.uid, name: DEMO_USER.displayName, photo: DEMO_USER.photoURL }];
  for (const [fixtureId, picks] of Object.entries(PICK_TABLE)) {
    const fx = ALL_FIXTURES.find((f) => f.id === fixtureId);
    if (!fx) continue;
    picks.forEach((pick, i) => {
      const u = participants[i];
      if (!u) return;
      const [outcomeCode, hg, ag] = pick;
      const outcome =
        outcomeCode === "D"
          ? "DRAW"
          : outcomeCode === "H"
            ? fx.homeTeamId!
            : fx.awayTeamId!;
      allPredictions.push({
        uid: u.uid,
        fixtureId,
        pickedOutcome: outcome,
        homeGoals: hg,
        awayGoals: ag,
        updatedAt: ts(new Date()),
        _demoName: u.name,
        _demoPhoto: u.photo,
      } as DemoPrediction);
    });
  }
})();

// --- Mock leaderboard --------------------------------------------------------

const LEADERBOARD: LeaderboardEntry[] = [
  { uid: "u-1",       displayName: "Lauren M.",       totalPoints: 64, groupPoints: 24, knockoutPoints: 40, favoriteBonusPoints: 12, exactScoreBonusPoints: 6, correctOutcomes: 8, correctExactScores: 3, finalScoreDelta: null, previousRank: 2, rank: 1, updatedAt: ts(new Date()) },
  { uid: "u-2",       displayName: "Juan R.",         totalPoints: 58, groupPoints: 28, knockoutPoints: 30, favoriteBonusPoints: 6,  exactScoreBonusPoints: 4, correctOutcomes: 9, correctExactScores: 2, finalScoreDelta: null, previousRank: 1, rank: 2, updatedAt: ts(new Date()) },
  { uid: DEMO_USER.uid,displayName: DEMO_USER.displayName, photoURL: DEMO_USER.photoURL, totalPoints: 53, groupPoints: 23, knockoutPoints: 30, favoriteBonusPoints: 10, exactScoreBonusPoints: 4, correctOutcomes: 7, correctExactScores: 2, finalScoreDelta: null, previousRank: 5, rank: 3, updatedAt: ts(new Date()) },
  { uid: "u-3",       displayName: "Diego A.",        totalPoints: 47, groupPoints: 17, knockoutPoints: 30, favoriteBonusPoints: 0,  exactScoreBonusPoints: 2, correctOutcomes: 6, correctExactScores: 1, finalScoreDelta: null, previousRank: 3, rank: 4, updatedAt: ts(new Date()) },
  { uid: "u-4",       displayName: "Sofía L.",        totalPoints: 41, groupPoints: 21, knockoutPoints: 20, favoriteBonusPoints: 4,  exactScoreBonusPoints: 2, correctOutcomes: 6, correctExactScores: 1, finalScoreDelta: null, previousRank: 4, rank: 5, updatedAt: ts(new Date()) },
  { uid: "u-5",       displayName: "Marco T.",        totalPoints: 33, groupPoints: 18, knockoutPoints: 15, favoriteBonusPoints: 2,  exactScoreBonusPoints: 0, correctOutcomes: 5, correctExactScores: 0, finalScoreDelta: null, previousRank: 6, rank: 6, updatedAt: ts(new Date()) },
  { uid: "u-6",       displayName: "Anita W.",        totalPoints: 28, groupPoints: 13, knockoutPoints: 15, favoriteBonusPoints: 0,  exactScoreBonusPoints: 0, correctOutcomes: 4, correctExactScores: 0, finalScoreDelta: null, previousRank: 7, rank: 7, updatedAt: ts(new Date()) },
];

// --- Bus instances ----------------------------------------------------------

export const buses = {
  appConfig: new Bus<AppConfig>(() => APP_CONFIG),
  teams: new Bus<Team[]>(() => TEAMS),
  fixtures: new Bus<Fixture[]>(() => ALL_FIXTURES),
  results: new Bus<Record<string, MatchResult>>(() => results),
  allPredictions: new Bus<GroupPrediction[]>(() => allPredictions),
  favorite: new Bus<FavoritePick | null>(() => favorite),
  bracket: new Bus<KnockoutBracket | null>(() => bracket),
  leaderboard: new Bus<LeaderboardEntry[]>(() => LEADERBOARD),
};

// --- Mutators called from firestore.ts demo branches ------------------------

export function demoSavePrediction(p: GroupPrediction) {
  const idx = allPredictions.findIndex((x) => x.fixtureId === p.fixtureId && x.uid === p.uid);
  const next: GroupPrediction = { ...p, updatedAt: ts(new Date()) };
  if (idx >= 0) allPredictions[idx] = next;
  else allPredictions.push(next);
  buses.allPredictions.notify();
}

export function demoSaveFavorite(uid: string, teamId: string) {
  favorite = { uid, teamId, setAt: ts(new Date()) };
  buses.favorite.notify();
}

export function demoSaveBracket(uid: string, b: Partial<KnockoutBracket>) {
  bracket = {
    uid,
    picks: { ...(bracket?.picks ?? {}), ...(b.picks ?? {}) },
    submittedAt: b.submittedAt ?? bracket?.submittedAt,
    updatedAt: ts(new Date()),
  };
  buses.bracket.notify();
}

export const DEMO_PROFILE: UserProfile = {
  uid: DEMO_USER.uid,
  email: DEMO_USER.email,
  displayName: DEMO_USER.displayName,
  photoURL: DEMO_USER.photoURL,
  createdAt: ts(new Date()),
};
