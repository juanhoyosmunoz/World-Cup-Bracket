import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import type { AppConfig, Fixture, MatchResult, Team } from "../types";
import { formatKickoff } from "../lib/locking";

export default function Admin() {
  const [tab, setTab] = useState<"sync" | "results" | "users" | "config" | "health">("sync");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-extrabold">Admin</h1>
        <div className="flex gap-1 rounded-full bg-ink-100 p-1">
          {["sync","results","users","config","health"].map((t) => (
            <button key={t}
              onClick={() => setTab(t as any)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${tab === t ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-white"}`}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === "sync" && <SyncTab />}
      {tab === "results" && <ResultsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "config" && <ConfigTab />}
      {tab === "health" && <HealthTab />}
    </div>
  );
}

function SyncTab() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function call(name: string) {
    setBusy(true);
    setStatus("Running…");
    try {
      const res = await httpsCallable(functions, name)({});
      setStatus(JSON.stringify(res.data));
    } catch (e: any) {
      setStatus("Error: " + (e.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-padded space-y-3">
      <h2 className="font-bold text-lg">Sync fixtures &amp; results</h2>
      <p className="text-sm text-ink-600">
        These call Cloud Functions which talk to the configured provider (default: API-FOOTBALL).
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => call("syncTeams")} className="btn-secondary">Sync teams</button>
        <button disabled={busy} onClick={() => call("syncFixtures")} className="btn-secondary">Sync fixtures</button>
        <button disabled={busy} onClick={() => call("syncResults")} className="btn-secondary">Sync results</button>
        <button disabled={busy} onClick={() => call("recomputeLeaderboard")} className="btn-primary">Recompute leaderboard</button>
      </div>
      {status && <pre className="text-xs bg-ink-900 text-white rounded-xl p-3 overflow-auto whitespace-pre-wrap">{status}</pre>}
    </div>
  );
}

function ResultsTab() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [edits, setEdits] = useState<Record<string, { h: string; a: string }>>({});

  useEffect(() =>
    onSnapshot(collection(db, "fixtures"), (snap) =>
      setFixtures(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    ), []);
  useEffect(() =>
    onSnapshot(collection(db, "teams"), (snap) => {
      const m: Record<string, Team> = {};
      snap.docs.forEach((d) => (m[d.id] = d.data() as Team));
      setTeams(m);
    }), []);
  useEffect(() =>
    onSnapshot(collection(db, "results"), (snap) => {
      const m: Record<string, MatchResult> = {};
      snap.docs.forEach((d) => (m[d.id] = d.data() as MatchResult));
      setResults(m);
    }), []);

  async function saveManual(fx: Fixture) {
    const e = edits[fx.id];
    if (!e) return;
    const h = parseInt(e.h, 10);
    const a = parseInt(e.a, 10);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return;
    const outcome = h === a ? "DRAW" : h > a ? fx.homeTeamId! : fx.awayTeamId!;
    await setDoc(doc(db, "results", fx.id), {
      fixtureId: fx.id,
      homeGoals: h,
      awayGoals: a,
      outcome,
      finalizedAt: serverTimestamp(),
      source: "MANUAL",
    } as MatchResult, { merge: true });
    // Mark fixture finished
    await setDoc(doc(db, "fixtures", fx.id), { status: "FINISHED" }, { merge: true });
  }

  const sorted = useMemo(
    () => [...fixtures].sort((a, b) => (a.kickoff as any).toMillis() - (b.kickoff as any).toMillis()),
    [fixtures]
  );

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-ink-100 flex justify-between">
        <div>
          <h2 className="font-bold text-lg">Manual results</h2>
          <p className="text-sm text-ink-500">Use this when the API sync fails or for corrections.</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-ink-50 text-ink-500">
          <tr>
            <th className="text-left px-4 py-2">Match</th>
            <th className="text-left px-4 py-2">Kickoff</th>
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-left px-4 py-2">Score</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((fx) => {
            const h = fx.homeTeamId ? teams[fx.homeTeamId] : null;
            const a = fx.awayTeamId ? teams[fx.awayTeamId] : null;
            const r = results[fx.id];
            const e = edits[fx.id] ?? { h: r?.homeGoals?.toString() ?? "", a: r?.awayGoals?.toString() ?? "" };
            return (
              <tr key={fx.id} className="border-t border-ink-100">
                <td className="px-4 py-2 font-semibold">
                  {h?.flag} {h?.name ?? "TBD"} — {a?.flag} {a?.name ?? "TBD"}
                  <div className="text-xs text-ink-500">{fx.group ? `Group ${fx.group}` : fx.bracketSlot}</div>
                </td>
                <td className="px-4 py-2 text-xs">{formatKickoff(fx.kickoff as any)}</td>
                <td className="px-4 py-2"><span className="chip-gray">{fx.status}</span></td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <input className="field-input w-14 text-center"
                           value={e.h}
                           onChange={(ev) => setEdits((p) => ({ ...p, [fx.id]: { ...e, h: ev.target.value.replace(/[^0-9]/g, "") } }))} />
                    <span>:</span>
                    <input className="field-input w-14 text-center"
                           value={e.a}
                           onChange={(ev) => setEdits((p) => ({ ...p, [fx.id]: { ...e, a: ev.target.value.replace(/[^0-9]/g, "") } }))} />
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <button className="btn-primary" onClick={() => saveManual(fx)} disabled={!fx.homeTeamId || !fx.awayTeamId}>
                    Save
                  </button>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="text-center py-10 text-ink-500">No fixtures yet — sync first.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    return onSnapshot(collection(db, "users"), (snap) =>
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })))
    );
  }, []);

  async function grantAdmins() {
    setStatus("Setting admin claims…");
    try {
      const res = await httpsCallable(functions, "setAdmins")({});
      setStatus(JSON.stringify(res.data));
    } catch (e: any) {
      setStatus("Error: " + (e.message ?? String(e)));
    }
  }

  return (
    <div className="card-padded">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-bold text-lg">Participants ({users.length})</h2>
        <button onClick={grantAdmins} className="btn-secondary">Apply admin claims</button>
      </div>
      {status && <div className="text-xs mb-3 chip-gray">{status}</div>}
      <div className="overflow-hidden rounded-xl border border-ink-100">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">UID</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="border-t border-ink-100">
                <td className="px-4 py-2 font-semibold">{u.displayName}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 text-xs text-ink-400">{u.uid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigTab() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [form, setForm] = useState({ favorite: "", knockout: "", start: "", end: "", phase: "PRE" as AppConfig["phase"] });

  useEffect(() => onSnapshot(doc(db, "appConfig", "main"), (s) => {
    const d = s.exists() ? (s.data() as AppConfig) : null;
    setCfg(d);
    if (d) setForm({
      favorite: tsToLocalInput(d.favoriteLockAt),
      knockout: tsToLocalInput(d.knockoutLockAt),
      start: tsToLocalInput(d.tournamentStartAt),
      end: tsToLocalInput(d.tournamentEndAt),
      phase: d.phase,
    });
  }), []);

  async function save() {
    await setDoc(doc(db, "appConfig", "main"), {
      favoriteLockAt: Timestamp.fromDate(new Date(form.favorite)),
      knockoutLockAt: Timestamp.fromDate(new Date(form.knockout)),
      tournamentStartAt: Timestamp.fromDate(new Date(form.start)),
      tournamentEndAt: Timestamp.fromDate(new Date(form.end)),
      phase: form.phase,
    } satisfies AppConfig, { merge: true });
  }

  return (
    <div className="card-padded space-y-4 max-w-xl">
      <h2 className="font-bold text-lg">Tournament config</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Favorite-team lock">
          <input type="datetime-local" className="field-input" value={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.value })} />
        </Field>
        <Field label="Knockout bracket lock">
          <input type="datetime-local" className="field-input" value={form.knockout} onChange={(e) => setForm({ ...form, knockout: e.target.value })} />
        </Field>
        <Field label="Tournament start">
          <input type="datetime-local" className="field-input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </Field>
        <Field label="Tournament end">
          <input type="datetime-local" className="field-input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </Field>
        <Field label="Phase">
          <select className="field-input" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value as AppConfig["phase"] })}>
            <option>PRE</option><option>GROUP</option><option>KO</option><option>DONE</option>
          </select>
        </Field>
      </div>
      <button className="btn-primary" onClick={save}>Save config</button>
      {cfg && (
        <p className="text-xs text-ink-500">
          Times are stored in UTC; the inputs use your local browser time and are converted automatically.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function tsToLocalInput(t: any): string {
  const d = t?.toDate?.();
  if (!d) return "";
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function HealthTab() {
  const [health, setHealth] = useState<any[]>([]);
  useEffect(() => onSnapshot(collection(db, "syncHealth"), (s) =>
    setHealth(s.docs.map((d) => ({ id: d.id, ...d.data() })))
  ), []);
  return (
    <div className="card-padded">
      <h2 className="font-bold text-lg mb-3">API sync health</h2>
      {health.length === 0 && <p className="text-ink-500 text-sm">No sync runs recorded yet.</p>}
      <div className="space-y-2">
        {health.sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0)).slice(0, 25).map((h) => (
          <div key={h.id} className="rounded-xl border border-ink-100 p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">{h.task}</div>
              <div className="text-xs text-ink-500">{h.at?.toDate?.().toLocaleString()}</div>
            </div>
            <div className="text-sm">
              {h.ok ? <span className="chip-green">OK</span> : <span className="chip-red">{h.error || "Failed"}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
