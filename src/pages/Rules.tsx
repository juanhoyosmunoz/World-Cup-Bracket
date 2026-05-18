export default function Rules() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-extrabold">How it works</h1>

      <section className="card-padded">
        <h2 className="text-xl font-bold">The format</h2>
        <p className="text-ink-700 mt-1">
          48 teams in 12 groups play a Group Stage and a Knockout Stage. The Knockout
          Stage begins with the Round of 32 and runs through the Final.
        </p>
      </section>

      <section className="card-padded border-2 border-brand-500/40">
        <div className="flex items-start gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-ink-950 font-black text-lg shrink-0">
            $
          </div>
          <div>
            <h2 className="text-xl font-bold">Entry fee</h2>
            <p className="text-ink-700 mt-1">
              <strong>$10 USD</strong> per participant. Pay Lauren before the tournament
              starts to be included in the pool.
            </p>
          </div>
        </div>
      </section>

      <section className="card-padded">
        <h2 className="text-xl font-bold">Step 1 — Pick your favorite team</h2>
        <p className="text-ink-700 mt-1">
          Each participant picks one favorite team before the tournament starts.
          Your favorite team <strong>doubles</strong> your group-stage points whenever they play
          and you predict correctly.
        </p>
      </section>

      <section className="card-padded">
        <h2 className="text-xl font-bold">Step 2 — Group stage scoring</h2>
        <p className="text-ink-700 mt-1">
          For every group-stage match, you submit:
        </p>
        <ul className="list-disc pl-6 mt-2 text-ink-700">
          <li><strong>Winner pick (required):</strong> a team to win, or "Draw".</li>
          <li><strong>Exact score (optional):</strong> bonus points if you nail it.</li>
        </ul>

        <table className="mt-4 w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-ink-500">
              <th className="text-left py-2 px-3 bg-ink-50 rounded-l-lg">Outcome</th>
              <th className="text-right py-2 px-3 bg-ink-50 rounded-r-lg">Points</th>
            </tr>
          </thead>
          <tbody className="[&>tr>td]:py-2 [&>tr>td]:px-3">
            <tr><td>Correct winner</td><td className="text-right font-bold">3</td></tr>
            <tr><td>Correct winner + exact score</td><td className="text-right font-bold">5</td></tr>
            <tr><td>Favorite team — correct winner</td><td className="text-right font-bold">6</td></tr>
            <tr><td>Favorite team — correct + exact score</td><td className="text-right font-bold">10</td></tr>
          </tbody>
        </table>
        <p className="text-ink-500 text-xs mt-2">
          The favorite-team rows are the doubled values; that is, your points are
          doubled when the match involves your favorite team <em>and</em> your outcome pick is correct.
        </p>

        <div className="mt-4 rounded-xl bg-brand-50 border border-brand-200 p-4">
          <div className="font-bold text-ink-900">Example</div>
          <p className="text-sm text-ink-700 mt-1">
            Your favorite team is Argentina. Argentina plays Mexico and you pick
            Argentina to win 2–1. Argentina wins 2–1: <strong>10 points</strong>.
            If Argentina had won 3–1: <strong>6 points</strong> (winner correct, score wrong, doubled).
          </p>
        </div>
      </section>

      <section className="card-padded">
        <h2 className="text-xl font-bold">Step 3 — Knockout bracket</h2>
        <p className="text-ink-700 mt-1">
          Fill out a classic bracket through the Final before the knockout round begins.
          A missed match breaks that line of your bracket — you stop earning points down
          that path, even if a later pick happens to be correct.
        </p>

        <table className="mt-4 w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-ink-500">
              <th className="text-left py-2 px-3 bg-ink-50 rounded-l-lg">Round</th>
              <th className="text-right py-2 px-3 bg-ink-50">Matches</th>
              <th className="text-right py-2 px-3 bg-ink-50 rounded-r-lg">Points each</th>
            </tr>
          </thead>
          <tbody className="[&>tr>td]:py-2 [&>tr>td]:px-3">
            <tr><td>Round of 32</td><td className="text-right">16</td><td className="text-right font-bold">5</td></tr>
            <tr><td>Round of 16</td><td className="text-right">8</td><td className="text-right font-bold">10</td></tr>
            <tr><td>Quarterfinals</td><td className="text-right">4</td><td className="text-right font-bold">20</td></tr>
            <tr><td>Semifinals</td><td className="text-right">2</td><td className="text-right font-bold">40</td></tr>
            <tr><td>Third Place</td><td className="text-right">1</td><td className="text-right font-bold">50</td></tr>
            <tr><td>Final</td><td className="text-right">1</td><td className="text-right font-bold">80</td></tr>
          </tbody>
        </table>

        <p className="text-ink-700 text-sm mt-3">
          You'll also enter an optional predicted final score on the Final — it doesn't
          score on its own, but it's the <strong>tiebreaker</strong>.
        </p>
      </section>

      <section className="card-padded">
        <h2 className="text-xl font-bold">Tiebreaker</h2>
        <p className="text-ink-700 mt-1">
          If two or more participants tie on total points, the person whose predicted
          final score is closest to the actual final score wins the tie
          (measured as <code className="bg-ink-100 px-1 py-0.5 rounded">|home₁ − home₂| + |away₁ − away₂|</code>).
        </p>
      </section>

      <section className="card-padded">
        <h2 className="text-xl font-bold">Locks &amp; visibility</h2>
        <ul className="list-disc pl-6 mt-2 text-ink-700 space-y-1">
          <li>Group-stage matches lock <strong>1 hour before kickoff</strong>.</li>
          <li>The knockout bracket locks 1 hour before the first Round of 32 match.</li>
          <li>Favorite team selection locks before the tournament begins.</li>
          <li>Other participants can only see your pick <em>after</em> the lock for that match.</li>
        </ul>

        <div className="mt-4 rounded-xl bg-brand-50 border border-brand-200 p-4">
          <div className="font-bold text-ink-900">👀 See everyone's picks</div>
          <p className="text-sm text-ink-700 mt-1">
            Once a match locks, click <strong>“See all picks →”</strong> on any
            match card (Dashboard or My Picks) to open a list of every
            participant's prediction for that match — their winner pick, exact
            score, and points earned, plus a community stat showing what % of
            the pool got the result right.
          </p>
        </div>
      </section>
    </div>
  );
}
