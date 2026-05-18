# Antenna World Cup 2026 Bracket

An internal World Cup 2026 prediction tournament for ~20 Antenna employees.
Desktop-first React app on Firebase (Auth, Firestore, Hosting, Cloud
Functions). Google sign-in is restricted to `@antenna.live` accounts.

---

## Tech stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS, React Router
- **Backend**: Firebase Auth (Google), Firestore, Cloud Functions (Node 20), Hosting
- **Football data**: API-FOOTBALL via a provider abstraction (swap-friendly)

---

## Local development

### 1. Prerequisites

```bash
node --version   # >= 20
npm --version    # >= 10
npm i -g firebase-tools
firebase login
```

### 2. Install dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 3. Configure environment

Copy `.env.example` → `.env` and fill in your Firebase web app config:

```bash
cp .env.example .env
```

You'll need:

- `VITE_FIREBASE_*` — from Firebase Console → Project Settings → General → Your apps → Web app
- `VITE_ALLOWED_EMAIL_DOMAIN` — defaults to `antenna.live`
- `VITE_ADMIN_EMAILS` — the three admin emails, comma-separated

### 4. Firestore security rules (initial deploy)

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

The rules in `firestore.rules` enforce:

- Only `@antenna.live` users may read/write anything.
- A user may only create/update **their own** predictions, and **only before
  the match's lock time** (kickoff − 1 hour).
- Predictions of other users are invisible until the match locks.
- The knockout bracket has a single shared lock cutoff
  (`appConfig.knockoutLockAt`).
- Admin custom claim (`request.auth.token.admin == true`) is required to write
  fixtures, results, and appConfig. The claim is set by the `setAdmins` Cloud
  Function and is the **source of truth** — `users/{uid}.admin` cannot be set
  from the client.

### 5. Run locally with emulators

```bash
# In one terminal
firebase emulators:start

# In another, run Vite pointed at the emulators
VITE_USE_EMULATORS=true npm run dev
```

Visit http://localhost:5173.

---

## First-time deployment

### 1. Create the Firebase project

In the Firebase Console:

1. Create a new project (e.g. `antenna-wc2026`).
2. Enable **Authentication → Google** as a sign-in provider.
3. Add your `@antenna.live` Workspace domain to the authorized domains.
4. Create a Firestore database in production mode.
5. Register a Web app to get the config values for `.env`.
6. Upgrade to the Blaze plan (required for Cloud Functions).

Update `.firebaserc` with your project id:

```json
{ "projects": { "default": "antenna-wc2026" } }
```

### 2. Set Cloud Functions parameters

```bash
# Admin emails (comma-separated, lowercased)
firebase functions:secrets:set ADMIN_EMAILS
# Paste: lauren@antenna.live,camila@antenna.live,juan@antenna.live

# API-FOOTBALL key
firebase functions:secrets:set APIFOOTBALL_KEY
# Paste your key from https://dashboard.api-football.com/

# Plain params (override defaults if needed)
firebase functions:config:set apifootball.league_id=1 apifootball.season=2026
```

Or set them as runtime env vars in `functions/.env`:

```
ADMIN_EMAILS=lauren@antenna.live,camila@antenna.live,juan@antenna.live
APIFOOTBALL_LEAGUE_ID=1
APIFOOTBALL_SEASON=2026
```

### 3. Deploy everything

```bash
npm run build
firebase deploy
```

This deploys Firestore rules, Cloud Functions, and Hosting.

### 4. Promote the three admins

Have each of `lauren@antenna.live`, `camila@antenna.live`, `juan@antenna.live`
sign in once at the deployed URL. Then any of them (the env-listed emails
have admin access even before the claim is set, as a bootstrap) navigates to
**Admin → Participants → Apply admin claims**. This calls the `setAdmins`
Cloud Function which sets `customClaims.admin = true` for each listed email.

Sign-out / sign-in again to refresh ID tokens after claims change.

### 5. Seed teams and group fixtures

You can either:

**Option A — Pull from the API** (recommended once kickoff is closer and the
draw is final):

1. Admin → Sync tab → **Sync teams**
2. Admin → Sync tab → **Sync fixtures**

**Option B — Local seed** (placeholder data for development):

```bash
# Download a service account JSON from Firebase console → Project settings → Service accounts
# Save it as ./serviceAccount.json (already in .gitignore)
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/serviceAccount.json"

npm run seed:teams
TOURNAMENT_START_ISO="2026-06-11T20:00:00Z" npm run seed:fixtures
```

The fixtures seed writes 72 group-stage matches and an `appConfig/main`
document with reasonable defaults; the admin Config tab can adjust the
lock times afterwards.

### 6. Configure lock deadlines

In **Admin → Config**, set:

- `Favorite-team lock` — before tournament kickoff
- `Knockout bracket lock` — 1 hour before the first R32 match
- `Tournament start` / `Tournament end`
- `Phase` — `PRE` → `GROUP` → `KO` → `DONE`

---

## How scoring works

The full scoring rules are surfaced in the in-app **Rules** page; the
authoritative implementation is `src/lib/scoring.ts` (client preview) and
`functions/src/scoring.ts` (server recompute). Both files are kept identical
on purpose — keep them in sync if you change the rules.

Group stage:

| Outcome                                                | Points |
|---|---|
| Correct winner                                         | 3      |
| Correct winner + exact score                           | 5      |
| Favorite team correct (winner only)                    | 6      |
| Favorite team correct + exact score                    | 10     |

Knockout:

| Round           | Points each |
|---|---|
| Round of 32     | 5           |
| Round of 16     | 10          |
| Quarterfinals   | 20          |
| Semifinals      | 40          |
| Third Place     | 50          |
| Final           | 80          |

A missed knockout pick **breaks the line** — downstream picks that depend on
the missed pick will not score, even if they happen to be correct.

Tiebreaker: closest predicted final score to actual (Manhattan distance:
`|hPred − hAct| + |aPred − aAct|`, lower wins).

---

## Data model (Firestore)

```
users/{uid}                 — user profile (read-only `admin` flag lives on auth claim)
favorites/{uid}             — { uid, teamId, setAt }
teams/{teamId}              — { id, name, shortName, flag, group }
fixtures/{fixtureId}        — { stage, group, bracketSlot, homeTeamId, awayTeamId,
                                kickoff, lockAt, status, ... }
results/{fixtureId}         — { homeGoals, awayGoals, outcome, finalizedAt, source }
predictions/{uid_fixtureId} — group-stage prediction (deterministic id for uniqueness)
knockoutBrackets/{uid}      — { picks: { "R32-1": { teamId, homeGoals?, awayGoals? }, ... } }
leaderboard/{uid}           — derived totals (overwritten by recomputeLeaderboard)
appConfig/main              — { favoriteLockAt, knockoutLockAt, phase, ... }
syncHealth/{autoId}         — { task, ok, error, at } — admin-only log
```

---

## Cloud Functions

| Function | Trigger | Purpose |
|---|---|---|
| `setAdmins` | callable, admin | Grant admin claim to env-listed emails |
| `syncTeams` | callable, admin | Pull teams from API → `teams/` |
| `syncFixtures` | callable, admin | Pull fixtures + status from API → `fixtures/` |
| `syncResults` | callable, admin | Pull goals → `results/`; flip fixture status |
| `recomputeLeaderboard` | callable, admin | Aggregate all users → `leaderboard/` |
| `scheduledSync` | every 15 min | runs `syncFixtures` + `syncResults` |
| `onResultWrite` | result write | re-runs recompute |

---

## Swapping the football data provider

`functions/src/providers/apifootball.ts` is the only provider-specific code.
To use a different provider:

1. Add `functions/src/providers/<name>.ts` exporting a `FixtureProvider`.
2. Change the import + factory in `functions/src/index.ts` (`provider()`).
3. Redeploy functions.

The client is decoupled: it only reads from Firestore.

---

## Troubleshooting

- **"Permission denied" writing predictions**: the match's `lockAt` has
  passed. Verify in **Admin → Manual results**; if the time is wrong,
  re-sync fixtures or adjust the fixture document.
- **API sync failed**: see **Admin → Health**. Common cause: rate limits or
  an outdated `round` label — see comments in `apifootball.ts`.
- **Leaderboard didn't update**: trigger **Admin → Sync → Recompute
  leaderboard**. Recompute also runs automatically on result writes.
- **Custom-claim admin not active**: ID tokens cache for an hour; have the
  user sign out and back in.

---

## Project layout

```
src/
├── auth/        AuthProvider + route guards
├── components/  Reusable UI (Layout, MatchCard, TeamBadge, Countdown)
├── lib/         scoring, locking, bracket helpers, firestore helpers
├── pages/       Login, Dashboard, MyPicks, Leaderboard, Rules, Admin
├── firebase.ts  Firebase client init
└── types.ts     Shared TypeScript types
functions/
└── src/         Cloud Functions + provider abstraction
scripts/         One-off seed scripts (teams, fixtures)
firestore.rules  Security rules
firebase.json    Hosting + emulators config
```
