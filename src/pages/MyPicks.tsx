import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "../auth/AuthProvider";
import {
  saveBracket,
  saveFavorite,
  savePrediction,
  watchAppConfig,
  watchFixtures,
  watchMyBracket,
  watchMyFavorite,
  watchMyPredictions,
  watchResults,
  watchTeams,
} from "../lib/firestore";
import type { AppConfig, Fixture, GroupPrediction, KnockoutBracket, MatchResult, Team, FavoritePick } from "../types";
import MatchCard from "../components/MatchCard";
import Countdown from "../components/Countdown";
import MatchPicksModal from "../components/MatchPicksModal";
import { favoriteLocked, knockoutLocked } from "../lib/locking";
import { KO_SLOTS, SLOTS_BY_STAGE, stageLabel, feederSlots } from "../lib/bracket";

type Tab = "group" | "knockout" | "favorite";

export default function MyPicks() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [teamsArr, setTeams] = useState<Team[]>([]);
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [predictions, setPredictions] = useState<GroupPrediction[]>([]);
  const [favorite, setFavorite] = useState<FavoritePick | null>(null);
  const [bracket, setBracket] = useState<KnockoutBracket | null>(null);
  const [tab, setTab] = useState<Tab>("group");
  const [picksFixtureId, setPicksFixtureId] = useState<string | null>(null);

  useEffect(() => watchAppConfig(setCfg), []);
  useEffect(() => watchFixtures(setFixtures), []);
  useEffect(() => watchTeams(setTeams), []);
  useEffect(() => watchResults(setResults), []);
  useEffect(() => (user ? watchMyPredictions(user.uid, setPredictions) : undefined), [user]);
  useEffect(() => (user ? watchMyFavorite(user.uid, setFavorite) : undefined), [user]);
  useEffect(() => (user ? watchMyBracket(user.uid, setBracket) : undefined), [user]);

  const teams = useMemo(() => Object.fromEntries(teamsArr.map((t) => [t.id, t])), [teamsArr]);
  const predByFixture = useMemo(
    () => Object.fromEntries(predictions.map((p) => [p.fixtureId, p])),
    [predictions]
  );
  const groupFixtures = useMemo(
    () => fixtures.filter((f) => f.stage === "GROUP"),
    [fixtures]
  );
  // Group group-stage matches by user-local date so the picks page reads as
  // a daily fixture list (matches the way users think about the tournament).
  const byDay = useMemo(() => {
    const m = new Map<string, { label: string; sortKey: number; fixtures: Fixture[] }>();
    for (const f of groupFixtures) {
      const d = (f.kickoff as any).toDate?.() as Date | undefined;
      if (!d) continue;
      const key = d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
      const label = d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      // Bucket start = start-of-day in local TZ
      const sortKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const cur = m.get(key) ?? { label, sortKey, fixtures: [] };
      cur.fixtures.push(f);
      m.set(key, cur);
    }
    // Inside each day, keep chronological by kickoff
    for (const v of m.values()) {
      v.fixtures.sort(
        (a, b) => (a.kickoff as any).toMillis() - (b.kickoff as any).toMillis()
      );
    }
    return [...m.values()].sort((a, b) => a.sortKey - b.sortKey);
  }, [groupFixtures]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-extrabold">My Picks</h1>
        <div className="flex gap-1 rounded-full bg-ink-100 p-1">
          <TabBtn active={tab === "group"} onClick={() => setTab("group")}>Group Stage</TabBtn>
          <TabBtn active={tab === "knockout"} onClick={() => setTab("knockout")}>Knockout Bracket</TabBtn>
          <TabBtn active={tab === "favorite"} onClick={() => setTab("favorite")}>Favorite Team</TabBtn>
        </div>
      </div>

      {tab === "favorite" && (
        <FavoriteTab teams={teamsArr} favorite={favorite} locked={favoriteLocked(cfg)} cfg={cfg}
          onPick={async (teamId) => {
            if (!user) return;
            await saveFavorite(user.uid, teamId);
          }}
        />
      )}

      {tab === "group" && (
        <div className="space-y-8">
          {byDay.length === 0 && (
            <div className="card-padded text-center text-ink-500">
              No group-stage matches scheduled yet.
            </div>
          )}
          {byDay.map((day) => {
            const openCount = day.fixtures.filter((f) => !predByFixture[f.id]).length;
            return (
              <section key={day.label}>
                <div className="flex items-end justify-between mb-3">
                  <h2 className="text-lg font-bold">{day.label}</h2>
                  <div className="text-xs text-ink-500">
                    {day.fixtures.length} match{day.fixtures.length === 1 ? "" : "es"}
                    {openCount > 0 && (
                      <span className="ml-2 chip-yellow">{openCount} to pick</span>
                    )}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {day.fixtures.map((f) => (
                    <MatchCard
                      key={f.id}
                      fixture={f}
                      teams={teams}
                      hideLive
                      myPrediction={predByFixture[f.id]}
                      result={results[f.id]}
                      favoriteTeamId={favorite?.teamId ?? null}
                      onSave={async ({ outcome, homeGoals, awayGoals }) => {
                        if (!user) return;
                        await savePrediction({
                          uid: user.uid,
                          fixtureId: f.id,
                          pickedOutcome: outcome,
                          homeGoals,
                          awayGoals,
                          updatedAt: undefined as any,
                        });
                      }}
                      onViewAllPicks={() => setPicksFixtureId(f.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "knockout" && (
        <KnockoutTab
          cfg={cfg}
          fixtures={fixtures}
          teams={teams}
          bracket={bracket}
          onSave={async (picks, submit) => {
            if (!user) return;
            await saveBracket(user.uid, {
              picks,
              submittedAt: submit ? (new Date() as any) : bracket?.submittedAt,
            });
          }}
        />
      )}

      {picksFixtureId && (
        <MatchPicksModal
          fixtureId={picksFixtureId}
          fixture={fixtures.find((f) => f.id === picksFixtureId)!}
          teams={teams}
          result={results[picksFixtureId]}
          onClose={() => setPicksFixtureId(null)}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-4 py-1.5 rounded-full text-sm font-semibold transition",
        active ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-white"
      )}
    >
      {children}
    </button>
  );
}

function FavoriteTab({
  teams,
  favorite,
  locked,
  cfg,
  onPick,
}: {
  teams: Team[];
  favorite: FavoritePick | null;
  locked: boolean;
  cfg: AppConfig | null;
  onPick: (teamId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const filtered = teams
    .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="card-padded">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Pick your favorite team</h2>
          <p className="text-sm text-ink-500">
            Your favorite team doubles your group-stage points whenever they play and you predict correctly.
          </p>
        </div>
        <div className="text-xs">
          {locked ? (
            <span className="chip-red">Favorite locked</span>
          ) : (
            cfg?.favoriteLockAt && (
              <Countdown to={cfg.favoriteLockAt as any} className="chip-yellow" />
            )
          )}
        </div>
      </div>

      <div className="mt-4">
        <input
          className="field-input max-w-sm"
          placeholder="Search teams…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={locked}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {filtered.map((t) => (
          <button
            key={t.id}
            disabled={locked}
            onClick={() => onPick(t.id)}
            className={clsx(
              "p-3 rounded-xl border text-left transition",
              favorite?.teamId === t.id
                ? "border-brand-500 bg-brand-50"
                : "border-ink-200 hover:bg-ink-50",
              locked && "cursor-not-allowed opacity-70"
            )}
          >
            <div className="text-2xl">{t.flag}</div>
            <div className="font-semibold text-sm leading-tight mt-1">{t.name}</div>
            {t.group && <div className="text-xs text-ink-500">Group {t.group}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function KnockoutTab({
  cfg,
  fixtures,
  teams,
  bracket,
  onSave,
}: {
  cfg: AppConfig | null;
  fixtures: Fixture[];
  teams: Record<string, Team>;
  bracket: KnockoutBracket | null;
  onSave: (picks: KnockoutBracket["picks"], submit?: boolean) => Promise<void>;
}) {
  const locked = knockoutLocked(cfg);
  const [picks, setPicks] = useState<KnockoutBracket["picks"]>(bracket?.picks ?? {});
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setPicks(bracket?.picks ?? {});
    setDirty(false);
  }, [bracket?.picks]);

  function setPick(slot: string, teamId: string | null, score?: { h?: number | null; a?: number | null }) {
    setPicks((prev) => {
      const next = { ...prev, [slot]: {
        ...(prev[slot] ?? {}),
        teamId,
        homeGoals: score?.h !== undefined ? score.h : prev[slot]?.homeGoals ?? null,
        awayGoals: score?.a !== undefined ? score.a : prev[slot]?.awayGoals ?? null,
      } };
      // If we changed who advances at this slot, downstream slots that referenced
      // the previously-picked team must be cleared (otherwise we'd display
      // teams that the user no longer says reached that round).
      const prevTeam = prev[slot]?.teamId ?? null;
      if (prevTeam && prevTeam !== teamId) {
        for (const s of KO_SLOTS) {
          if (s === slot) continue;
          if (next[s]?.teamId === prevTeam) next[s] = { ...next[s], teamId: null };
        }
      }
      return next;
    });
    setDirty(true);
  }

  // For R32 slot S, the candidate teams are the actual teams the admin has
  // mapped in fixtures.bracketSlot=S. For deeper slots, the candidates are
  // the user's own picks for the two feeder slots.
  function candidatesFor(slot: string): (Team | undefined)[] {
    const fs = feederSlots(slot);
    if (!fs) {
      // R32 — read from the fixture that has bracketSlot == slot
      const fx = fixtures.find((f) => f.bracketSlot === slot);
      return [
        fx?.homeTeamId ? teams[fx.homeTeamId] : undefined,
        fx?.awayTeamId ? teams[fx.awayTeamId] : undefined,
      ];
    }
    if (slot === "THIRD") {
      // Third place: the two SF "losers" — i.e., for each SF slot, the
      // candidate is the OTHER team between the user's picks at that SF's
      // feeders.
      return ["SF-1", "SF-2"].map((sf) => {
        const fs2 = feederSlots(sf)!;
        const winnerPick = picks[sf]?.teamId;
        const candidates = fs2.map((f) => picks[f]?.teamId).filter(Boolean) as string[];
        const loser = candidates.find((c) => c !== winnerPick);
        return loser ? teams[loser] : undefined;
      });
    }
    return fs.map((f) => {
      const tid = picks[f]?.teamId;
      return tid ? teams[tid] : undefined;
    });
  }

  async function handleSave(submit = false) {
    setSaveStatus("saving");
    try {
      await onSave(picks, submit);
      setDirty(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("error");
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const allFilled = ["R32","R16","QF","SF","THIRD","FINAL"].every((stage) =>
    SLOTS_BY_STAGE[stage as keyof typeof SLOTS_BY_STAGE].every((s) => picks[s]?.teamId)
  );

  return (
    <div className="space-y-6">
      <div className="card-padded flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Knockout bracket</h2>
          <p className="text-sm text-ink-500">
            Fill in winners through the Final. Any missed pick breaks the line below it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locked ? (
            <span className="chip-red">Bracket locked</span>
          ) : (
            cfg?.knockoutLockAt && (
              <Countdown to={cfg.knockoutLockAt as any} className="chip-yellow" />
            )
          )}
          {!locked && (
            <>
              <button
                onClick={() => handleSave(false)}
                disabled={!dirty || saveStatus === "saving"}
                className="btn-ghost"
              >
                {saveStatus === "saving" ? "Saving…" : "Save draft"}
              </button>
              <button
                onClick={() => setConfirming(true)}
                disabled={!allFilled || saveStatus === "saving"}
                className="btn-primary"
              >
                Submit bracket
              </button>
            </>
          )}
          {saveStatus === "saved" && <span className="chip-green">Saved</span>}
          {saveStatus === "error" && <span className="chip-red">Failed to save</span>}
        </div>
      </div>

      {/* Bracket layout: horizontal columns per stage, scrollable */}
      <div className="card overflow-x-auto">
        <div className="min-w-[1100px] p-6 grid grid-cols-7 gap-6 items-stretch">
          {(["R32","R16","QF","SF","FINAL"] as const).map((stage) => (
            <div key={stage} className="flex flex-col gap-3">
              <div className="text-xs uppercase tracking-wide font-bold text-ink-500">
                {stageLabel(stage)}
              </div>
              {SLOTS_BY_STAGE[stage].map((slot) => (
                <SlotPicker
                  key={slot}
                  slot={slot}
                  locked={locked}
                  candidates={candidatesFor(slot)}
                  pickTeamId={picks[slot]?.teamId ?? null}
                  pickScore={{ h: picks[slot]?.homeGoals ?? null, a: picks[slot]?.awayGoals ?? null }}
                  showScore={slot === "FINAL"}
                  onChange={(teamId, score) => setPick(slot, teamId, score)}
                />
              ))}
            </div>
          ))}
          {/* THIRD place column at the right */}
          <div className="flex flex-col gap-3">
            <div className="text-xs uppercase tracking-wide font-bold text-ink-500">
              Third Place
            </div>
            <SlotPicker
              slot="THIRD"
              locked={locked}
              candidates={candidatesFor("THIRD")}
              pickTeamId={picks["THIRD"]?.teamId ?? null}
              pickScore={{ h: null, a: null }}
              showScore={false}
              onChange={(teamId) => setPick("THIRD", teamId)}
            />
          </div>
          {/* Empty column to right-align */}
          <div />
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          onCancel={() => setConfirming(false)}
          onConfirm={() => handleSave(true)}
          title="Submit your bracket?"
          body="You can keep editing until the lock deadline, but please double-check your final score prediction — it's used as the tiebreaker."
        />
      )}
    </div>
  );
}

function SlotPicker({
  slot,
  locked,
  candidates,
  pickTeamId,
  pickScore,
  showScore,
  onChange,
}: {
  slot: string;
  locked: boolean;
  candidates: (Team | undefined)[];
  pickTeamId: string | null;
  pickScore: { h: number | null; a: number | null };
  showScore: boolean;
  onChange: (teamId: string | null, score?: { h?: number | null; a?: number | null }) => void;
}) {
  return (
    <div className="rounded-xl border border-ink-200 p-3 bg-white">
      <div className="text-[10px] font-bold text-ink-400 uppercase mb-2">{slot}</div>
      <div className="space-y-1.5">
        {candidates.map((team, i) => {
          const id = team?.id ?? `__empty_${i}`;
          const isActive = team && pickTeamId === team.id;
          return (
            <button
              key={id}
              type="button"
              disabled={locked || !team}
              onClick={() => team && onChange(team.id)}
              className={clsx(
                "w-full text-left px-2 py-1.5 rounded-lg text-sm transition border",
                isActive ? "bg-brand-500 text-ink-950 border-brand-500"
                         : team ? "border-ink-200 hover:bg-ink-50"
                                : "border-dashed border-ink-200 text-ink-400 italic"
              )}
            >
              {team ? (
                <span className="flex items-center gap-2">
                  <span>{team.flag}</span>
                  <span className="font-semibold">{team.name}</span>
                </span>
              ) : "TBD — fill earlier round"}
            </button>
          );
        })}
      </div>
      {showScore && (
        <div className="mt-3">
          <div className="text-[10px] font-bold text-ink-400 uppercase">Final score (tiebreaker)</div>
          <div className="flex items-center gap-1 mt-1">
            <input
              disabled={locked}
              inputMode="numeric"
              className="field-input w-12 text-center"
              value={pickScore.h ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                onChange(pickTeamId, { h: v === "" ? null : parseInt(v, 10) });
              }}
              placeholder="–"
            />
            <span className="text-ink-400">:</span>
            <input
              disabled={locked}
              inputMode="numeric"
              className="field-input w-12 text-center"
              value={pickScore.a ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                onChange(pickTeamId, { a: v === "" ? null : parseInt(v, 10) });
              }}
              placeholder="–"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ onCancel, onConfirm, title, body }: { onCancel: () => void; onConfirm: () => void; title: string; body: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="card-padded max-w-md w-full">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-ink-600 mt-1">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} className="btn-primary">Submit</button>
        </div>
      </div>
    </div>
  );
}
