import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HandState } from '../../engine/rules';
import { ScenarioEvaluation, DecisionEvaluation, GRADE_LABEL, Grade } from '../../evaluation/evaluate';
import { Scenario } from '../../scenarios/types';
import { getTemplate } from '../../scenarios/templates';
import { CardRow } from './Card';
import { fmtBB } from './Table';
import { LESSON_INDEX } from '../../content/lessons';
import { PROFILES } from '../../opponents/profiles';
import { HandReplay } from './HandReplay';
import { useStore } from '../store';

export const gradeClass = (g: Grade) => `grade g-${g}`;
const ICON: Record<Grade, string> = { best: '✓', good: '✓', inaccuracy: '!', mistake: '✗', blunder: '✗', unscored: '?' };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function GradeBadge({ grade, points }: { grade: Grade; points?: number | null }) {
  return (
    <span className={gradeClass(grade)}>
      <span aria-hidden="true">{ICON[grade]}</span> {GRADE_LABEL[grade]}
      {points !== undefined && points !== null ? ` · ${points}` : ''}
    </span>
  );
}

/** The preferred action(s) in plain words, e.g. "Fold" or "Bet 33%". */
function preferredText(d: DecisionEvaluation): string | null {
  const pref = d.alternatives.filter((a) => a.rating === 'preferred').map((a) => a.label);
  return pref.length ? pref.join(' or ') : null;
}

function verdict(d: DecisionEvaluation): string {
  const pref = preferredText(d);
  const chosenPreferred = d.alternatives.some((a) => a.key === d.actionKey && a.rating === 'preferred');
  if (d.grade === 'unscored') return pref ? `Not scored with confidence. Baseline preference: ${pref}.` : 'Not scored with confidence.';
  if (chosenPreferred) return d.sizing?.verdict === 'off' ? 'Right action, but the size was outside the recommended range.' : 'This was the preferred play.';
  if (d.grade === 'good') return pref ? `Reasonable. Preferred: ${pref}.` : 'Reasonable.';
  return pref ? `Better: ${pref}.` : 'Another action was better here.';
}

type Tab = 'situation' | 'ranges' | 'options' | 'opponents' | 'sources';

function DecisionCard({ d, id, onShow }: { d: DecisionEvaluation; id: string; onShow: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('situation');
  const reasons = d.why.slice(0, 3);
  return (
    <article className={`dcard ${d.isKey ? 'key' : ''}`} id={id}>
      <header className="dcard-head">
        <span className="street-tag">{d.street}</span>
        <span className="dcard-act">You: {d.actionLabel}</span>
        <GradeBadge grade={d.grade} points={d.points} />
        {d.assisted && <span className="tag assisted">assisted</span>}
      </header>
      <p className="dcard-verdict">{verdict(d)}</p>
      {d.sizing && d.sizing.verdict !== 'preferred' && (
        <p className="dcard-sizing">
          Sizing ({d.sizing.chosen}): {d.sizing.verdict === 'acceptable' ? 'acceptable' : 'outside the recommended range'}. {d.sizing.note}
        </p>
      )}
      <ul className="dcard-why">
        {reasons.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
      {d.conflict && <p className="dcard-conflict">⚖ {d.conflict}</p>}
      <div className="dcard-links">
        <button className="linklike dcard-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide full analysis' : 'Full analysis'}
        </button>
        <button className="linklike" onClick={onShow}>
          See it on the table
        </button>
      </div>
      {open && (
        <div className="dcard-full">
          <div className="tabs small" role="tablist">
            {(
              [
                ['situation', 'Situation'],
                ['ranges', 'Ranges'],
                ['options', 'Options & math'],
                ['opponents', 'Opponent types'],
                ['sources', 'Sources'],
              ] as [Tab, string][]
            ).map(([t, l]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'situation' && (
            <dl className="questions">
              <dt>1. What information was available?</dt>
              <dd>{d.info}</dd>
              <dt>3. How did position, board texture and stack depth matter?</dt>
              <dd>
                {d.context.map((c, i) => (
                  <p key={i}>{c}</p>
                ))}
              </dd>
              <dt>4. What was your action trying to accomplish?</dt>
              <dd>{d.intent}</dd>
            </dl>
          )}
          {tab === 'ranges' && (
            <dl className="questions">
              <dt>2. What ranges were plausible?</dt>
              <dd>{d.ranges}</dd>
            </dl>
          )}
          {tab === 'options' && (
            <dl className="questions">
              <dt>5. Which alternatives were reasonable?</dt>
              <dd>
                <table className="alts">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Rating</th>
                      <th>Simulated EV vs model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.alternatives.map((a) => (
                      <tr key={a.key} className={a.key === d.actionKey ? 'chosen' : ''}>
                        <td>{a.label}</td>
                        <td>{a.rating ?? '—'}</td>
                        <td>{a.evBB !== undefined ? `${a.evBB >= 0 ? '+' : ''}${a.evBB.toFixed(2)}bb ±${(1.96 * (a.seBB ?? 0)).toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </dd>
              <dt>6. Why is one action preferable under these assumptions?</dt>
              <dd>
                <ul>
                  {d.why.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                {d.math.length > 0 && (
                  <table className="math">
                    <tbody>
                      {d.math.map((m, i) => (
                        <tr key={i}>
                          <th>{m.label}</th>
                          <td>{m.value}</td>
                          <td>
                            <span className={`kind k-${m.kind}`}>{m.kind === 'exact' ? 'exact' : m.kind === 'simulation' ? 'simulated' : m.kind === 'table' ? 'precomputed' : 'model'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {d.modelSummary && <p className="note">{d.modelSummary}</p>}
              </dd>
            </dl>
          )}
          {tab === 'opponents' && (
            <dl className="questions">
              <dt>7. What opponent tendencies could change the recommendation?</dt>
              <dd>
                <ul>
                  {d.tendencies.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                  {d.profileVariants?.map((v) => (
                    <li key={v.profile}>
                      Against a <strong>{v.profile}</strong> (ranges re-inferred), the simulation’s best action would be: {v.best}.
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
          )}
          {tab === 'sources' && (
            <p className="sources">
              <strong>Recommendation:</strong> {d.recommended}
              <br />
              <strong>Evaluation sources:</strong> {d.sources.join(' · ') || 'none'}
              <br />
              <strong>Confidence:</strong> {d.confidence}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function ReviewView({
  scenario,
  finalState,
  evaluation,
  onNext,
  onRetry,
  onRelated,
  bookmarked,
  onBookmark,
}: {
  scenario: Scenario;
  finalState: HandState;
  evaluation: ScenarioEvaluation;
  onNext?: () => void;
  onRetry?: () => void;
  onRelated?: () => void;
  bookmarked?: boolean;
  onBookmark?: () => void;
}) {
  const t = getTemplate(scenario.templateId);
  const [reveal, setReveal] = useState(false);
  const [jumpTo, setJumpTo] = useState<{ decision: number; nonce: number }>();
  const { data } = useStore();
  const hero = scenario.heroIndex;
  const bb = finalState.config.bb;
  const res = finalState.result;
  const villains = finalState.players.filter((p) => p.index !== hero && p.hole.length === 2);
  const hidden = Object.entries(scenario.trueProfiles).filter(([i, p]) => scenario.shownProfiles[Number(i)] !== p);
  const jump = (i: number) => document.getElementById(`dec-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="review" data-testid="review">
      <section className="rsum">
        <div className="rsum-top">
          <div className="score-box" aria-label="Overall score">
            {evaluation.score !== null ? (
              <>
                <span className="score" data-testid="score">
                  {evaluation.score}
                </span>
                <span className="score-label">instructional score</span>
              </>
            ) : (
              <span className="score-label">Insufficient confidence to score</span>
            )}
          </div>
          <div className="rsum-main">
            <h2>Hand review</h2>
            <p className="rsum-takeaway">{evaluation.takeaway}</p>
            <div className="timeline" aria-label="Your decisions">
              {evaluation.decisions.map((d, i) => (
                <button key={i} className={`tchip g-${d.grade}`} onClick={() => jump(i)} title={GRADE_LABEL[d.grade]}>
                  <span className="tchip-st">{cap(d.street)}</span> {d.actionLabel.replace(/ \(\d+% pot\)/, '')} <span aria-hidden="true">{ICON[d.grade]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {res && (
          <p className="rsum-result">
            {res.reason === 'fold' ? 'Hand ended when a player folded.' : 'Showdown: '}
            {res.showdownPlayers.map((p) => (
              <span key={p} className="sd">
                {p === hero ? 'You' : finalState.players[p].position} <CardRow cards={finalState.players[p].hole} size="sm" />
              </span>
            ))}
            You {res.net[hero] >= 0 ? 'won' : 'lost'} {fmtBB(Math.abs(res.net[hero]), bb)} — <em>the result doesn’t affect your score.</em>
            {res.reason === 'fold' && villains.length > 0 && (
              <button className="linklike" onClick={() => setReveal((r) => !r)}>
                {reveal ? 'Hide' : 'Show'} opponent’s cards
              </button>
            )}
            {reveal &&
              villains.map((v) => (
                <span key={v.index} className="sd">
                  {' '}
                  {v.position} <CardRow cards={v.hole} size="sm" />
                </span>
              ))}
          </p>
        )}
        {hidden.length > 0 && (
          <p className="note">Hidden tendencies (expert): {hidden.map(([i, p]) => `${finalState.players[Number(i)].position} was a ${PROFILES[p].name}`).join('; ')}. You were assessed against the “Unknown” baseline you could see.</p>
        )}
        <div className="review-actions">
          {onNext && (
            <button className="btn primary" onClick={onNext}>
              Next hand
            </button>
          )}
          {onRetry && (
            <button className="btn" onClick={onRetry}>
              Retry this spot
            </button>
          )}
          {onRelated && (
            <button className="btn" onClick={onRelated}>
              Similar spot
            </button>
          )}
          {onBookmark && (
            <button className="btn ghost" aria-pressed={bookmarked} onClick={onBookmark}>
              {bookmarked ? '★ Saved' : '☆ Save'}
            </button>
          )}
        </div>
      </section>

      <HandReplay finalState={finalState} hero={hero} profiles={scenario.shownProfiles} fourColor={data.prefs.fourColor} decisions={evaluation.decisions} jumpTo={jumpTo} />

      <section className="rdecisions">
        {evaluation.decisions.map((d, i) => (
          <DecisionCard key={i} d={d} id={`dec-${i}`} onShow={() => setJumpTo({ decision: i, nonce: Date.now() })} />
        ))}
      </section>

      <section className="rfoot">
        <div className="lesson-links">
          <span className="rfoot-l">Study:</span>
          {evaluation.lessons.map((id) =>
            LESSON_INDEX[id] ? (
              <Link key={id} to={`/learn/${id}`} className="pchip link">
                {LESSON_INDEX[id].title}
              </Link>
            ) : null,
          )}
        </div>
        <details className="assumptions">
          <summary>Assumptions and evaluation method</summary>
          <ul>
            {scenario.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
            <li>Scores are instructional assessments from transparent heuristics, charts, exact math and simulations against the opponent model — not solver-verified optimal play. The hand’s result never affects the score.</li>
            {t && <li>Key-decision method: {t.evaluation.method}.</li>}
            <li>
              Scenario <code>{scenario.id}</code> · template v{scenario.templateVersion} · scoring v{evaluation.scoringVersion} · confidence {evaluation.confidence}
            </li>
          </ul>
        </details>
      </section>
    </div>
  );
}
