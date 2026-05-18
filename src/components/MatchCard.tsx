import { useMemo, useState, useEffect } from "react";
import type { Fixture, GroupPrediction, MatchResult, Team } from "../types";
import { fixtureLocked, formatKickoff, elapsedMatchMinute } from "../lib/locking";
import Countdown from "./Countdown";
import TeamBadge from "./TeamBadge";
import clsx from "clsx";

interface Props {
  fixture: Fixture;
  teams: Record<string, Team>;
  myPrediction?: GroupPrediction;
  result?: MatchResult;
  favoriteTeamId?: string | null;
  onSave?: (p: { outcome: string; homeGoals: number | null; awayGoals: number | null }) => Promise<void>;
  /** When the match is locked, expose a "See all picks" action that opens
      the participants-picks modal. Locked-only because Firestore rules
      only return other users' predictions after the fixture locks. */
  onViewAllPicks?: () => void;
}

export default function MatchCard({ fixture, teams, myPrediction, result, favoriteTeamId, onSave, onViewAllPicks }: Props) {
  const locked = fixtureLocked(fixture);
  const isLive = fixture.status === "LIVE";

  // Tick the live minute counter while the match is in progress. 30s is
  // tight enough to feel live without wasting renders.
  const [liveMinute, setLiveMinute] = useState(() => elapsedMatchMinute(fixture.kickoff as any));
  useEffect(() => {
    if (!isLive) return;
    setLiveMinute(elapsedMatchMinute(fixture.kickoff as any));
    const id = setInterval(
      () => setLiveMinute(elapsedMatchMinute(fixture.kickoff as any)),
      30_000
    );
    return () => clearInterval(id);
  }, [isLive, fixture.kickoff]);
  const home = fixture.homeTeamId ? teams[fixture.homeTeamId] : undefined;
  const away = fixture.awayTeamId ? teams[fixture.awayTeamId] : undefined;
  const involvesFavorite =
    favoriteTeamId &&
    (fixture.homeTeamId === favoriteTeamId || fixture.awayTeamId === favoriteTeamId);

  const [outcome, setOutcome] = useState<string>(myPrediction?.pickedOutcome ?? "");
  const [hg, setHg] = useState<string>(myPrediction?.homeGoals?.toString() ?? "");
  const [ag, setAg] = useState<string>(myPrediction?.awayGoals?.toString() ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setOutcome(myPrediction?.pickedOutcome ?? "");
    setHg(myPrediction?.homeGoals?.toString() ?? "");
    setAg(myPrediction?.awayGoals?.toString() ?? "");
  }, [myPrediction?.pickedOutcome, myPrediction?.homeGoals, myPrediction?.awayGoals]);

  const dirty = useMemo(() => {
    const cur = {
      outcome: myPrediction?.pickedOutcome ?? "",
      hg: myPrediction?.homeGoals?.toString() ?? "",
      ag: myPrediction?.awayGoals?.toString() ?? "",
    };
    return cur.outcome !== outcome || cur.hg !== hg || cur.ag !== ag;
  }, [myPrediction, outcome, hg, ag]);

  // Prevent accidental tab close with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function save() {
    if (!onSave || !outcome) return;
    setStatus("saving");
    try {
      const hgN = hg === "" ? null : Math.max(0, parseInt(hg, 10));
      const agN = ag === "" ? null : Math.max(0, parseInt(ag, 10));
      await onSave({ outcome, homeGoals: Number.isFinite(hgN as number) ? hgN : null, awayGoals: Number.isFinite(agN as number) ? agN : null });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  const kickoffLocal = formatKickoff(fixture.kickoff as any);

  return (
    <div className={clsx("card-padded relative", locked && "opacity-95")}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {fixture.group && (
            <span className="chip-yellow font-bold">Group {fixture.group}</span>
          )}
          {involvesFavorite && (
            <span className="chip-yellow" title="Favorite team multiplier eligible">
              ★ Favorite x2
            </span>
          )}
          <span className="chip-gray">{kickoffLocal}</span>
        </div>
        <div className="text-xs">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 text-white px-2.5 py-0.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE · {liveMinute >= 95 ? "90+" : `${liveMinute}'`}
            </span>
          ) : locked ? (
            <span className="chip-red">Locked</span>
          ) : (
            <Countdown to={fixture.lockAt} className="chip-gray" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <button
          type="button"
          disabled={locked || !fixture.homeTeamId}
          onClick={() => setOutcome(fixture.homeTeamId!)}
          className={clsx(
            "flex items-center justify-end gap-3 px-3 py-3 rounded-xl border transition",
            outcome === fixture.homeTeamId
              ? "border-brand-500 bg-brand-50"
              : "border-ink-200 hover:bg-ink-50",
            locked && "cursor-not-allowed"
          )}
        >
          <TeamBadge team={home} />
        </button>

        <div className="flex flex-col items-center gap-1">
          {result ? (
            <div className="text-2xl font-extrabold tabular-nums">
              {result.homeGoals} – {result.awayGoals}
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={locked}
                onClick={() => setOutcome("DRAW")}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-bold border",
                  outcome === "DRAW"
                    ? "border-brand-500 bg-brand-50"
                    : "border-ink-200 hover:bg-ink-50"
                )}
              >
                DRAW
              </button>
              <div className="flex items-center gap-1">
                <input
                  disabled={locked}
                  className="field-input w-12 text-center px-1 py-1"
                  inputMode="numeric"
                  placeholder="–"
                  value={hg}
                  onChange={(e) => setHg(e.target.value.replace(/[^0-9]/g, ""))}
                />
                <span className="text-ink-400">:</span>
                <input
                  disabled={locked}
                  className="field-input w-12 text-center px-1 py-1"
                  inputMode="numeric"
                  placeholder="–"
                  value={ag}
                  onChange={(e) => setAg(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
              <div className="text-[10px] text-ink-400 uppercase tracking-wide">exact (optional)</div>
            </>
          )}
        </div>

        <button
          type="button"
          disabled={locked || !fixture.awayTeamId}
          onClick={() => setOutcome(fixture.awayTeamId!)}
          className={clsx(
            "flex items-center justify-start gap-3 px-3 py-3 rounded-xl border transition",
            outcome === fixture.awayTeamId
              ? "border-brand-500 bg-brand-50"
              : "border-ink-200 hover:bg-ink-50",
            locked && "cursor-not-allowed"
          )}
        >
          <TeamBadge team={away} />
        </button>
      </div>

      {!locked && onSave && (
        <div className="mt-4 flex items-center justify-end gap-2">
          {status === "saved" && <span className="chip-green">Saved</span>}
          {status === "error" && <span className="chip-red">Failed to save</span>}
          {dirty && status === "idle" && <span className="chip-yellow">Unsaved changes</span>}
          <button
            className="btn-primary"
            onClick={save}
            disabled={!outcome || !dirty || status === "saving"}
          >
            {status === "saving" ? "Saving…" : "Save pick"}
          </button>
        </div>
      )}

      {locked && onViewAllPicks && (
        <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between text-xs">
          <span className="text-ink-500">Picks are now visible to everyone</span>
          <button
            type="button"
            onClick={onViewAllPicks}
            className="font-semibold text-ink-900 hover:text-brand-600 underline underline-offset-2"
          >
            See all picks →
          </button>
        </div>
      )}
    </div>
  );
}
