// Review a live-table hand with the trainer: step through your decisions as they were (Guided
// review), or answer each one again before seeing what you did (Try again). The analysis is the
// trainer's own (src/review/liveReview.ts), run in the background; the hand itself is never changed.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Table, HistoryList, fmtBB } from '../components/Table';
import { ActionBar } from '../components/ActionBar';
import { CardRow } from '../components/Card';
import { findLiveHand, saveReview, savedReview, type LiveHand } from '../liveHands';
import { run } from '../../workers/client';
import {
  ASSESSMENT_LABEL,
  assessmentOf,
  preferredOf,
  rebuildDecisions,
  type Assessment,
  type LiveDecision,
  type LiveReview,
  type ReviewedDecision,
} from '../../review/liveReview';
import type { DecisionEvaluation } from '../../evaluation/evaluate';
import { pctStr } from '../../evaluation/guides';
import type { PlayerAction, Street } from '../../engine/rules';
import { tableLabel } from '../../multiplayer/table';
import { CONCEPTS, type ConceptId } from '../../content/concepts';
import { LESSON_INDEX } from '../../content/lessons';
import { canPractise } from '../../scenarios/generator';
import { newRunId } from '../../progress/conceptRun';

type Mode = 'guided' | 'try';
const STREET_NAME: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function LiveReviewPage() {
  const { id = '' } = useParams();
  const lh = useMemo(() => findLiveHand(decodeURIComponent(id)), [id]);
  if (!lh) {
    return (
      <div className="page lr-page">
        <BackLinks />
        <div className="lr-state">
          <h1>Hand not found</h1>
          <p>This hand is not in this browser’s live hand history. Hands are kept in the browser you played them on (for your account when you were signed in).</p>
        </div>
      </div>
    );
  }
  return <Review lh={lh} />;
}

function BackLinks() {
  return (
    <p className="lr-back">
      <Link to="/play/history">← Your live hands</Link> · <Link to="/play">Live Play</Link>
    </p>
  );
}

type Status = { kind: 'loading' } | { kind: 'ready'; review: LiveReview } | { kind: 'error'; message: string };

function Review({ lh }: { lh: LiveHand }) {
  const { data } = useStore();
  const rb = useMemo(() => rebuildDecisions(lh), [lh]);
  const [status, setStatus] = useState<Status>(() => {
    const saved = savedReview(lh.id);
    return saved ? { kind: 'ready', review: saved.review } : { kind: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>('guided');
  /** the decision on screen, or the summary after the last one */
  const [step, setStep] = useState<number | 'summary'>(0);

  // the analysis: from this browser if it was already made by this version, otherwise worked out now
  useEffect(() => {
    if (status.kind === 'ready' || !rb.verified || !rb.decisions.length) return;
    let live = true;
    run<LiveReview | { error: string; problems: string[] }>({ kind: 'liveReview', hand: lh })
      .then((r) => {
        if (!live) return;
        if ('error' in r) setStatus({ kind: 'error', message: r.problems[0] ?? 'This hand cannot be reviewed.' });
        else {
          saveReview(r);
          setStatus({ kind: 'ready', review: r });
        }
      })
      .catch(() => live && setStatus({ kind: 'error', message: 'The review could not be worked out. Your hand is safe; try again.' }))
      .finally(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lh, attempt]);

  const me = lh.me;
  const hero = lh.hand.players[me];
  const ds = rb.decisions;
  const d = typeof step === 'number' ? ds[step] : undefined;
  const reviewed = status.kind === 'ready' ? status.review.decisions : null;

  return (
    <div className="page lr-page">
      <BackLinks />
      <header className="lr-head">
        <p className="eyebrow">Hand review</p>
        <h1>
          Hand #{lh.handNo} · {tableLabel(lh.room)}
        </h1>
        <div className="lr-summary">
          <CardRow cards={hero.hole} size="sm" fourColor={data.prefs.fourColor} />
          <span>
            {hero.position} · {lh.hand.players.length} players · {when(lh.at)}
          </span>
        </div>
        <p className="note">
          Amounts are in big blinds. The trainer looks only at what you knew when you acted, never at how the hand turned out.
        </p>
      </header>

      {!rb.verified ? (
        <div className="lr-state" role="alert">
          <h2>This hand can’t be reviewed</h2>
          {rb.problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p className="note">Nothing has been guessed or filled in. You can still see the hand in your history.</p>
        </div>
      ) : !ds.length ? (
        <div className="lr-state">
          <h2>Nothing to review</h2>
          {rb.problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      ) : (
        <>
          <div className="seg lr-modes" role="radiogroup" aria-label="Review mode">
            {(
              [
                ['guided', 'Guided review'],
                ['try', 'Try again'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                {label}
              </button>
            ))}
          </div>
          <p className="note lr-mode-note">
            {mode === 'guided'
              ? 'Step through what you did at each decision, with the trainer’s view of it.'
              : 'Each decision is shown before you acted. Choose what you would do now, then compare. Each one is a separate exercise: the hand then carries on as it was really played.'}
          </p>
          {rb.unassessable && <p className="banner info">{rb.unassessable} You can still step through the hand and check the numbers; decisions are not assessed.</p>}

          <DecisionNav ds={ds} step={step} setStep={setStep} reviewed={mode === 'guided' ? reviewed : null} />

          {d ? (
            <div className="lr-body">
              <div className="lr-table">
                <p className="lr-where">
                  Decision {d.n + 1} of {ds.length} · <strong>{STREET_NAME[d.street]}</strong>
                </p>
                <Table
                  state={d.view}
                  hero={me}
                  profiles={{}}
                  fourColor={data.prefs.fourColor}
                  showNames
                  live
                  handKey={`${lh.id}:${d.index}`}
                  money={(x) => fmtBB(x, d.facts.bb)}
                />
                <Facts d={d} />
                <details className="more live-history">
                  <summary>Actions so far</summary>
                  <HistoryList state={d.view} hero={me} showNames money={(x) => fmtBB(x, d.facts.bb)} />
                </details>
              </div>
              <div className="lr-panel">
                {mode === 'guided' ? (
                  <GuidedPanel key={`g${d.n}`} d={d} r={reviewed?.[d.n] ?? null} status={status} onRetry={() => setAttempt((a) => a + 1)} settingsOk={(c) => canPractise(data.settings, c)} />
                ) : (
                  <TryPanel key={`t${d.n}`} lh={lh} d={d} r={reviewed?.[d.n] ?? null} unassessable={!!rb.unassessable} />
                )}
                <div className="row lr-step-nav">
                  <button className="btn" disabled={d.n === 0} onClick={() => setStep(d.n - 1)}>
                    ← Previous
                  </button>
                  <button className="btn primary" onClick={() => setStep(d.n + 1 < ds.length ? d.n + 1 : 'summary')}>
                    {d.n + 1 < ds.length ? (mode === 'try' ? 'Back to the hand as played: next decision →' : 'Next decision →') : 'Summary →'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Summary lh={lh} status={status} ds={ds} setStep={setStep} onRetry={() => setAttempt((a) => a + 1)} settingsOk={(c) => canPractise(data.settings, c)} />
          )}
        </>
      )}
    </div>
  );
}

function DecisionNav({ ds, step, setStep, reviewed }: { ds: LiveDecision[]; step: number | 'summary'; setStep: (s: number | 'summary') => void; reviewed: ReviewedDecision[] | null }) {
  return (
    <nav className="lr-nav" aria-label="Decisions">
      {ds.map((d) => {
        const a = reviewed?.[d.n]?.assessment;
        return (
          <button key={d.n} className={`lr-step ${step === d.n ? 'on' : ''} ${a ? `as-${a}` : ''}`} aria-current={step === d.n ? 'step' : undefined} onClick={() => setStep(d.n)}>
            <span className="lr-step-street">{STREET_NAME[d.street]}</span>
            <span className="lr-step-n">{d.n + 1}</span>
            {a && <span className="sr-only">{ASSESSMENT_LABEL[a]}</span>}
          </button>
        );
      })}
      <button className={`lr-step summary ${step === 'summary' ? 'on' : ''}`} aria-current={step === 'summary' ? 'step' : undefined} onClick={() => setStep('summary')}>
        Summary
      </button>
    </nav>
  );
}

/** The numbers at this decision, all measured from the hand. */
function Facts({ d }: { d: LiveDecision }) {
  const f = d.facts;
  const bb = (x: number) => fmtBB(x, f.bb);
  return (
    <dl className="lr-facts" aria-label="The numbers at this decision">
      <div>
        <dt>Pot</dt>
        <dd>{bb(f.pot)}</dd>
      </div>
      <div>
        <dt>To call</dt>
        <dd>{f.toCall ? bb(f.toCall) : '—'}</dd>
      </div>
      {f.toCall > 0 && (
        <div>
          <dt title="The share of the final pot your call would be: the equity a call needs before any later betting">Equity needed to call</dt>
          <dd>{pctStr(f.potOdds)}</dd>
        </div>
      )}
      <div>
        <dt>Your stack</dt>
        <dd>{bb(f.stack)}</dd>
      </div>
      <div>
        <dt>Effective stack</dt>
        <dd>{bb(f.effective)}</dd>
      </div>
      {d.street !== 'preflop' && (
        <div>
          <dt title="Stack-to-pot ratio">SPR</dt>
          <dd>{f.spr.toFixed(1)}</dd>
        </div>
      )}
      <div>
        <dt>Players in</dt>
        <dd>
          {f.playersIn} {f.playersIn > 2 ? '(multiway)' : '(heads-up)'}
        </dd>
      </div>
      <div>
        <dt>Position</dt>
        <dd>
          {f.position}
          {f.playersIn > 1 ? (f.inPosition ? ', in position' : ', out of position') : ''}
        </dd>
      </div>
    </dl>
  );
}

function AssessmentBadge({ a }: { a: Assessment }) {
  return <span className={`as-badge as-${a}`}>{ASSESSMENT_LABEL[a]}</span>;
}

/** The first piece of reasoning (not a bare fact) from an evaluation. */
function mainReason(e: DecisionEvaluation): string {
  const isFact = (w: string) => /^(You must call|Your equity against|Being suited adds|Offsuit hands make flushes)/.test(w);
  return e.why.find((w) => !isFact(w)) ?? e.why[0] ?? '';
}

function GuidedPanel({ d, r, status, onRetry, settingsOk }: { d: LiveDecision; r: ReviewedDecision | null; status: Status; onRetry: () => void; settingsOk: (c: ConceptId) => boolean }) {
  const playedLabel = actionText(d.action, d);
  return (
    <section className="lr-card" aria-live="polite">
      <p className="lr-did">
        You <strong>{playedLabel}</strong>
      </p>
      {status.kind === 'loading' && <p className="note">The trainer is looking at this decision…</p>}
      {status.kind === 'error' && <ErrorBox message={status.message} onRetry={onRetry} />}
      {r && !r.evaluation && (
        <>
          <AssessmentBadge a="unassessed" />
          <p>{r.note}</p>
          <PlainMaths d={d} />
        </>
      )}
      {r?.evaluation && <EvaluationView e={r.evaluation} a={r.assessment} d={d} settingsOk={settingsOk} />}
    </section>
  );
}

/** What the evaluator said about one action, in short, with the detail a click away. */
function EvaluationView({ e, a, d, settingsOk, heading }: { e: DecisionEvaluation; a: Assessment; d: LiveDecision; settingsOk: (c: ConceptId) => boolean; heading?: string }) {
  const [open, setOpen] = useState(false);
  const pref = preferredOf(e);
  const equity = e.math.find((m) => /equity/i.test(m.label) && m.kind !== 'exact');
  return (
    <div className="lr-eval">
      {heading && <h3>{heading}</h3>}
      <AssessmentBadge a={a} />
      {a !== 'unassessed' && (
        <p className="lr-pref">
          {pref ? (
            <>
              The trainer prefers: <strong>{pref}</strong>
            </>
          ) : (
            'The trainer has no single preferred play here: several are reasonable.'
          )}
        </p>
      )}
      <p className="lr-reason">{a === 'unassessed' ? 'The trainer is not confident enough about this spot to grade it. ' : ''}{mainReason(e)}</p>
      {d.facts.toCall > 0 && (
        <p className="lr-math">
          You were asked to call {fmtBB(d.facts.toCall, d.facts.bb)} into a pot of {fmtBB(d.facts.pot, d.facts.bb)}, so a call needs about {pctStr(d.facts.potOdds)} equity before any later betting
          {equity ? `. Estimated equity against the inferred range: ${equity.value} (an estimate: it depends on what the opponent really holds)` : ''}.
        </p>
      )}
      <ul className="lr-alts" aria-label="The options">
        {e.alternatives.map((alt) => (
          <li key={alt.key} className={alt.key === e.actionKey ? 'chosen' : ''}>
            <span>{alt.label}</span>
            <span className={`lr-rating r-${alt.rating ?? 'none'}`}>{ratingWord(alt.rating)}</span>
          </li>
        ))}
      </ul>
      <button className="linklike" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? 'Less detail' : 'More detail: ranges, reasoning and sources'}
      </button>
      {open && (
        <div className="lr-more">
          <h4>Why</h4>
          <ul>
            {e.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {e.sizing && (
            <p>
              Sizing ({e.sizing.chosen}): {e.sizing.verdict === 'preferred' ? 'in the preferred range' : e.sizing.verdict === 'acceptable' ? 'acceptable' : 'outside the recommended range'}. {e.sizing.note}
            </p>
          )}
          <h4>The situation</h4>
          {e.context.map((c, i) => (
            <p key={i}>{c}</p>
          ))}
          <p>{e.intent}</p>
          <h4>Opponents’ likely hands (estimated)</h4>
          <p>{e.ranges}</p>
          <p className="note">
            Live opponents are real people whose habits the trainer does not know. Their ranges are inferred from their actions with a general opponent model, so treat them as estimates.
          </p>
          {e.math.length > 0 && (
            <table className="math">
              <tbody>
                {e.math.map((m, i) => (
                  <tr key={i}>
                    <th>{m.label}</th>
                    <td>{m.value}</td>
                    <td>
                      <span className={`kind k-${m.kind}`}>{m.kind === 'exact' ? 'measured' : m.kind === 'simulation' ? 'estimate (simulated)' : m.kind === 'table' ? 'precomputed' : 'model'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {e.modelSummary && <p className="note">{e.modelSummary}</p>}
          <p className="note">
            Heuristic guidance from the trainer, not a solver: {e.sources.join(' · ') || 'no sources'}. Confidence: {e.confidence}.
          </p>
        </div>
      )}
      <PracticeLinks concepts={e.concepts} settingsOk={settingsOk} />
    </div>
  );
}

const ratingWord = (r: string | undefined) =>
  r === 'preferred' ? 'Preferred' : r === 'acceptable' || r === 'mixed' ? 'Reasonable' : r === 'discouraged' ? 'Usually worse' : r === 'mistake' ? 'Likely mistake' : 'Not rated';

/** The measured numbers when the trainer cannot assess a spot. */
function PlainMaths({ d }: { d: LiveDecision }) {
  const f = d.facts;
  return (
    <p className="lr-math">
      {f.toCall > 0
        ? `You were asked to call ${fmtBB(f.toCall, f.bb)} into a pot of ${fmtBB(f.pot, f.bb)}: a call needs about ${pctStr(f.potOdds)} equity before any later betting.`
        : `Nobody had bet: the pot was ${fmtBB(f.pot, f.bb)} and you had ${fmtBB(f.stack, f.bb)} behind (SPR ${f.spr.toFixed(1)}).`}
    </p>
  );
}

function PracticeLinks({ concepts, settingsOk }: { concepts: ConceptId[]; settingsOk: (c: ConceptId) => boolean }) {
  const shown = concepts.filter((c) => CONCEPTS[c]).slice(0, 3);
  if (!shown.length) return null;
  return (
    <div className="lr-practice">
      <span className="note">Concepts here:</span>
      {shown.map((c) => (
        <span key={c} className="lr-concept">
          <strong>{CONCEPTS[c].name}</strong>{' '}
          {settingsOk(c) && (
            <Link className="btn small" to={`/practice?concept=${c}&run=${newRunId()}`}>
              Practise this spot
            </Link>
          )}{' '}
          {LESSON_INDEX[CONCEPTS[c].lesson] && <Link to={`/learn/${CONCEPTS[c].lesson}`}>Lesson</Link>}
        </span>
      ))}
      <p className="note">Practice deals new hands on the same idea; it does not replay this exact hand.</p>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="lr-error" role="alert">
      <p>{message}</p>
      <button className="btn small" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** "called 1bb", "raised to 6bb", "folded" */
function actionText(a: PlayerAction, d: LiveDecision): string {
  const bb = (x: number) => fmtBB(x, d.facts.bb);
  switch (a.type) {
    case 'fold':
      return 'folded';
    case 'check':
      return 'checked';
    case 'call':
      return `called ${bb(Math.min(d.facts.toCall, d.facts.stack))}`;
    case 'bet':
      return `bet ${bb(a.to!)}`;
    case 'raise':
      return `raised to ${bb(a.to!)}`;
    case 'allin':
      return 'went all-in';
  }
}

// ---------------- Try again ----------------

type Tried = { kind: 'idle' } | { kind: 'working'; action: PlayerAction } | { kind: 'done'; action: PlayerAction; e: DecisionEvaluation | null } | { kind: 'error'; action: PlayerAction };

function TryPanel({ lh, d, r, unassessable }: { lh: LiveHand; d: LiveDecision; r: ReviewedDecision | null; unassessable: boolean }) {
  const { data } = useStore();
  const [t, setT] = useState<Tried>({ kind: 'idle' });
  const submit = (action: PlayerAction) => {
    setT({ kind: 'working', action });
    if (unassessable) {
      setT({ kind: 'done', action, e: null });
      return;
    }
    run<DecisionEvaluation | null>({ kind: 'liveTry', hand: lh, decision: d.n, action })
      .then((e) => setT({ kind: 'done', action, e }))
      .catch(() => setT({ kind: 'error', action }));
  };
  if (t.kind === 'idle' || t.kind === 'working') {
    return (
      <section className="lr-card">
        <p className="lr-did">
          <strong>What would you do?</strong> Only the moves the rules allowed are offered.
        </p>
        <ActionBar state={d.view} onAct={submit} disabled={t.kind === 'working'} />
        {t.kind === 'working' && <p className="note">Checking your choice…</p>}
      </section>
    );
  }
  if (t.kind === 'error') {
    return (
      <section className="lr-card">
        <ErrorBox message="Your choice could not be checked. Nothing about the hand has changed." onRetry={() => submit(t.action)} />
      </section>
    );
  }
  const same = sameAction(t.action, d.action);
  const original = r?.evaluation ?? null;
  return (
    <section className="lr-card" aria-live="polite">
      <p className="lr-did">
        You chose to <strong>{actionText(t.action, d).replace(/^(\w+)ed\b/, (w) => ({ folded: 'fold', checked: 'check', called: 'call', raised: 'raise' })[w] ?? w)}</strong>. In the hand you{' '}
        <strong>{actionText(d.action, d)}</strong>
        {same ? ' — the same.' : '.'}
      </p>
      {t.e ? (
        <EvaluationView e={t.e} a={assessmentOf(t.e.grade)} d={d} settingsOk={(c) => canPractise(data.settings, c)} heading="Your choice now" />
      ) : (
        <p>{unassessable ? 'The trainer does not assess this kind of hand, so there is no verdict to compare.' : 'The trainer could not assess this choice.'}</p>
      )}
      {!same && original && (
        <p className="lr-compare">
          What you did in the hand ({original.actionLabel}) was assessed as <AssessmentBadge a={assessmentOf(original.grade)} />.
        </p>
      )}
      {!same && <p className="note">This choice is looked at on its own. The rest of the hand stays as it was really played, so the next decision follows your original action.</p>}
      <button className="linklike" onClick={() => setT({ kind: 'idle' })}>
        Choose again
      </button>
    </section>
  );
}

function sameAction(a: PlayerAction, b: PlayerAction): boolean {
  return a.type === b.type && (a.to ?? null) === (b.to ?? null);
}

// ---------------- summary ----------------

function Summary({ lh, status, ds, setStep, onRetry, settingsOk }: { lh: LiveHand; status: Status; ds: LiveDecision[]; setStep: (s: number) => void; onRetry: () => void; settingsOk: (c: ConceptId) => boolean }) {
  const { data } = useStore();
  const h = lh.hand;
  const net = h.result?.net[lh.me] ?? 0;
  return (
    <section className="lr-card lr-summary-card">
      <h2>Summary</h2>
      <div className="lr-final">
        <span className="note">How it ended (shown only now):</span>
        <CardRow cards={h.board} size="sm" fourColor={data.prefs.fourColor} />
        {h.board2 && <CardRow cards={h.board2} size="sm" fourColor={data.prefs.fourColor} />}
        <span className={net > 0 ? 'up' : net < 0 ? 'down' : ''}>
          {net > 0 ? '+' : ''}
          {fmtBB(net, h.config.bb)}
        </span>
      </div>
      {status.kind === 'loading' && <p className="note">The trainer is still looking at your decisions…</p>}
      {status.kind === 'error' && <ErrorBox message={status.message} onRetry={onRetry} />}
      {status.kind === 'ready' && (
        <>
          <h3>The main thing</h3>
          <p>{status.review.summary.keyPoint}</p>
          {status.review.summary.good.length > 0 && (
            <>
              <h3>Handled well</h3>
              <ul>
                {status.review.summary.good.map((n) => (
                  <li key={n}>
                    <button className="linklike" onClick={() => setStep(n)}>
                      Decision {n + 1} ({STREET_NAME[ds[n].street].toLowerCase()}): {status.review.decisions[n].evaluation?.actionLabel}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {status.review.summary.improvements.length > 0 && (
            <>
              <h3>To work on</h3>
              <ol>
                {status.review.summary.improvements.map((i) => (
                  <li key={i.n}>
                    {i.text}{' '}
                    <button className="linklike" onClick={() => setStep(i.n)}>
                      See decision {i.n + 1}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          <PracticeLinks concepts={status.review.summary.concepts} settingsOk={settingsOk} />
          <p className="note">
            {status.review.summary.assessed} of {ds.length} decision{ds.length === 1 ? '' : 's'} assessed. The result of the hand played no part: good decisions lose sometimes, and poor ones win.
          </p>
        </>
      )}
      <p className="row">
        <Link className="btn" to="/play/history">
          Your live hands
        </Link>
        <Link className="btn" to="/play">
          Back to Live Play
        </Link>
      </p>
    </section>
  );
}
