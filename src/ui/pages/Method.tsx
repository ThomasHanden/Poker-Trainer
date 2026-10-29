import { SCORING_VERSION, GRADE_POINTS } from '../../evaluation/evaluate';
import { PREFLOP_TABLE_INFO } from '../../ranges/preflopEquity';
import { SOURCES } from '../../content/sources';

export function MethodPage() {
  return (
    <div className="page method">
      <h1>How evaluation works</h1>
      <p className="lead">Scores are instructional assessments, not exact measures of optimal play. Here is exactly what goes into them (scoring v{SCORING_VERSION}).</p>
      <section>
        <h2>Never outcome-based</h2>
        <p>Whether you won the pot never affects your score. Each decision is judged with the information you had when you acted: your cards, the board so far, the action, stacks, and the opponent profile shown to you.</p>
      </section>
      <section>
        <h2>Four kinds of evidence (always labelled)</h2>
        <ul>
          <li>
            <strong>Exact calculations</strong> — pot odds, break-even frequencies, EV of all-in decisions given a stated range, ICM values (Malmuth–Harville) for stated stacks and payouts, and exact turn/river equity against the modelled range (full enumeration).
          </li>
          <li>
            <strong>Simulation estimates</strong> — flop and multiway equity (Monte Carlo, with sample counts and 95% error bars), and multi-street EV of each action against the opponent model (the opponent acts by its policy; your later decisions are played by a baseline policy). These are estimates for the model, not true EVs.
          </li>
          <li>
            <strong>Computed equilibrium</strong> — the heads-up push/fold chart, solved by fictitious play on a 169-class all-in equity table (Monte Carlo, {PREFLOP_TABLE_INFO.samplesPerPair.toLocaleString()} samples per pair, ≈±{(PREFLOP_TABLE_INFO.approxStdError * 100).toFixed(1)}%).
          </li>
          <li>
            <strong>Heuristic strategy guidance</strong> — template rules written for this app (e.g. “bet small with a range advantage on dry boards”) and illustrative preflop charts. They are teaching baselines, not solver output.
          </li>
        </ul>
        <p>No solver is integrated. Nothing in the app is presented as solver-approved, and no optimal frequencies are claimed.</p>
      </section>
      <section>
        <h2>Opponent model and ranges</h2>
        <p>
          Simulated opponents use one probabilistic policy, parameterised by profile. It sees only public information and its own cards — never yours or future board cards. The same policy is used to infer ranges: every combo is weighted by how likely the policy was to take the observed actions with it. The ranges shown in reviews are therefore exact for the simulated opponent and approximate for real players. Hidden holdings are sampled from these ranges with card removal.
        </p>
      </section>
      <section>
        <h2>Grades and points</h2>
        <ul>
          <li>Preferred play: {GRADE_POINTS.best} · Reasonable (including any action that is part of a mixed strategy): {GRADE_POINTS.good} · Inaccuracy: {GRADE_POINTS.inaccuracy} · Mistake: {GRADE_POINTS.mistake} · Serious mistake: {GRADE_POINTS.blunder}.</li>
          <li>Sizing is graded separately for bets and raises (preferred / acceptable −5 / outside −20) and only when sizing is relevant.</li>
          <li>When guidance and simulation disagree, the review says so. A baseline-preferred action is not downgraded for being less exploitative; a discouraged action can be upgraded when the simulation shows it performs as well against this opponent.</li>
          <li>When there is no rated guidance and the simulation is too noisy, the decision is shown as “not scored (insufficient confidence)”.</li>
          <li>The hand score is a weighted average (key decision ×2; low-confidence decisions ×0.6). One decision cannot show whether you mix at the right frequency, so mixed spots accept any action in the mix.</li>
        </ul>
      </section>
      <section>
        <h2>Versioning and reproducibility</h2>
        <p>Every scenario has an id of the form <code>template@version#seed</code>. The same id and settings rebuild the same hand, and opponents’ actions are seeded, so reviews are regenerated exactly. Scoring and template versions are stored with each hand so older results remain interpretable.</p>
      </section>
      <section>
        <h2>Known limitations</h2>
        <ul>
          <li>Preflop charts are illustrative; real equilibrium strategies depend on rake, sizes and populations.</li>
          <li>The opponent model is simple: it uses hand strength percentiles, draw equity and profile parameters, not a full game-theoretic strategy.</li>
          <li>Simulated EVs use a baseline policy for your future decisions, so they understate what a stronger future strategy could achieve.</li>
          <li>ICM ignores skill and future blind pressure; bounty and satellite structures are not modelled.</li>
        </ul>
      </section>
      <section>
        <h2>Sources</h2>
        <ul>
          {Object.values(SOURCES).map((s) => (
            <li key={s.id}>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
              {s.author ? ` — ${s.author}` : ''}
              {s.year ? ` (${s.year})` : ''}: {s.usedFor}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
