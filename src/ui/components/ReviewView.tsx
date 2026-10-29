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

export const gradeClass = (g: Grade) => `grade g-${g}`;

export function GradeBadge({ grade, points }: { grade: Grade; points?: number | null }) {
  const icon: Record<Grade, string> = { best: '✓✓', good: '✓', inaccuracy: '!', mistake: '✗', blunder: '✗✗', unscored: '?' };
  return (
    <span className={gradeClass(grade)}>
      <span aria-hidden="true">{icon[grade]}</span> {GRADE_LABEL[grade]}
      {points !== undefined && points !== null ? ` · ${points}` : ''}
    </span>
  );
}

function DecisionDetail({ d, defaultOpen }: { d: DecisionEvaluation; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`decision ${d.isKey ? 'key' : ''}`}>
      <button className="decision-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="street-tag">{d.street}</span>
        <span className="act">{d.actionLabel}</span>
        <GradeBadge grade={d.grade} points={d.points} />
        {d.isKey && <span className="tag">key decision</span>}
        {d.assisted && <span className="tag assisted">assisted</span>}
        <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="decision-body">
          <p className="recommended">
            <strong>Recommendation:</strong> {d.recommended}
          </p>
          {d.sizing && (
            <p className={`sizing-verdict s-${d.sizing.verdict}`}>
              <strong>Sizing ({d.sizing.chosen}):</strong> {d.sizing.verdict === 'preferred' ? 'in the preferred range.' : d.sizing.verdict === 'acceptable' ? 'acceptable.' : 'outside the recommended range.'} {d.sizing.note}
            </p>
          )}
          {d.conflict && <p className="conflict">⚖ {d.conflict}</p>}
          <dl className="questions">
            <dt>1. What information was available?</dt>
            <dd>{d.info}</dd>
            <dt>2. What ranges were plausible?</dt>
            <dd>{d.ranges}</dd>
            <dt>3. How did position, board texture and stack depth matter?</dt>
            <dd>
              {d.context.map((c, i) => (
                <p key={i}>{c}</p>
              ))}
            </dd>
            <dt>4. What was your action trying to accomplish?</dt>
            <dd>{d.intent}</dd>
            <dt>5. Which alternatives were reasonable?</dt>
            <dd>
              <table className="alts">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Strategic rating</th>
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
                          <span className={`kind k-${m.kind}`}>{m.kind === 'exact' ? 'exact' : m.kind === 'simulation' ? 'simulated' : m.kind === 'table' ? 'precomputed table' : 'model estimate'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {d.modelSummary && <p className="note">{d.modelSummary}</p>}
            </dd>
            <dt>7. What opponent tendencies could change the recommendation?</dt>
            <dd>
              <ul>
                {d.tendencies.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
                {d.profileVariants?.map((v) => (
                  <li key={v.profile}>
                    If the opponent were a <strong>{v.profile}</strong> (ranges re-inferred for that profile), the simulation’s best action would be: {v.best}.
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
          <p className="sources">
            <strong>Evaluation sources:</strong> {d.sources.join(' · ') || 'none'} — <strong>confidence:</strong> {d.confidence}
          </p>
        </div>
      )}
    </section>
  );
}

export function Replay({ state, hero, evaluation }: { state: HandState; hero: number; evaluation: ScenarioEvaluation }) {
  const bb = state.config.bb;
  const byIndex = new Map(evaluation.decisions.map((d) => [d.decisionIndex, d]));
  const streets = ['preflop', 'flop', 'turn', 'river'] as const;
  const nBoard = { preflop: 0, flop: 3, turn: 4, river: 5 };
  return (
    <div className="replay">
      {streets.map((st) => {
        const recs = state.history.map((h, i) => ({ h, i })).filter((x) => x.h.street === st && !x.h.type.startsWith('post'));
        if (!recs.length && st !== 'preflop') return null;
        return (
          <div key={st} className="replay-street">
            <div className="replay-head">
              <strong>{st[0].toUpperCase() + st.slice(1)}</strong>
              {st !== 'preflop' && <CardRow cards={state.board.slice(0, nBoard[st])} size="sm" />}
            </div>
            <ul>
              {recs.map(({ h, i }) => {
                const d = byIndex.get(i);
                const who = h.player === hero ? 'You' : state.players[h.player].position;
                const amt = h.type === 'bet' || h.type === 'raise' ? ` ${fmtBB(h.to, bb)}` : h.type === 'call' ? ` ${fmtBB(h.amount, bb)}` : '';
                return (
                  <li key={i} className={h.player === hero ? 'mine' : ''}>
                    {who} {h.type}
                    {amt}
                    {h.allIn ? ' (all-in)' : ''}
                    {h.scripted && h.player !== hero ? <span className="scripted" title="Part of the scenario set-up"> · setup</span> : null}
                    {d && (
                      <>
                        {' '}
                        <GradeBadge grade={d.grade} />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {state.result && (
        <div className="replay-result">
          <strong>Result:</strong>{' '}
          {state.result.reason === 'fold' ? 'Won uncontested after a fold.' : 'Showdown.'}{' '}
          {state.result.showdownPlayers.length > 0 &&
            state.result.showdownPlayers.map((p) => (
              <span key={p} className="sd">
                {p === hero ? 'You' : state.players[p].position}: <CardRow cards={state.players[p].hole} size="sm" />
              </span>
            ))}{' '}
          You {state.result.net[hero] >= 0 ? 'won' : 'lost'} {fmtBB(Math.abs(state.result.net[hero]), bb)}. <em>The result does not affect your score.</em>
        </div>
      )}
    </div>
  );
}

export function ReviewView({
  scenario,
  finalState,
  evaluation,
  onRetry,
  onRelated,
  bookmarked,
  onBookmark,
  revealOpponents,
}: {
  scenario: Scenario;
  finalState: HandState;
  evaluation: ScenarioEvaluation;
  onRetry?: () => void;
  onRelated?: () => void;
  bookmarked?: boolean;
  onBookmark?: () => void;
  revealOpponents?: boolean;
}) {
  const t = getTemplate(scenario.templateId);
  const [reveal, setReveal] = useState(!!revealOpponents);
  const villains = finalState.players.filter((p) => p.index !== scenario.heroIndex && p.hole.length === 2);
  const hiddenProfiles = Object.entries(scenario.trueProfiles).filter(([i, p]) => scenario.shownProfiles[Number(i)] !== p);
  return (
    <div className="review" data-testid="review">
      <header className="review-head">
        <div>
          <h2>{scenario.title}</h2>
          <p className="note">
            Scenario <code>{scenario.id}</code> · {scenario.difficulty} · {finalState.config.format} · {finalState.players.length}-handed · template v{scenario.templateVersion} · scoring v{evaluation.scoringVersion}
          </p>
        </div>
        <div className="score-box" aria-label="Overall score">
          {evaluation.score !== null ? (
            <>
              <span className="score">{evaluation.score}</span>
              <span className="score-label">instructional score · confidence {evaluation.confidence}</span>
            </>
          ) : (
            <span className="score-label">Insufficient confidence to score</span>
          )}
          {evaluation.assisted && <span className="tag assisted">assisted</span>}
        </div>
      </header>
      <div className="review-actions">
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            ↺ Retry this spot
          </button>
        )}
        {onRelated && (
          <button className="btn" onClick={onRelated}>
            ⇄ Related scenario
          </button>
        )}
        {onBookmark && (
          <button className="btn" aria-pressed={bookmarked} onClick={onBookmark}>
            {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
          </button>
        )}
      </div>
      <div className="takeaway">
        <strong>Takeaway:</strong> {evaluation.takeaway}
      </div>
      <div className="grid2 review-lists">
        <div>
          <h3>What you did well</h3>
          {evaluation.correct.length ? (
            <ul>
              {evaluation.correct.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="note">No decision was rated preferred or reasonable this time.</p>
          )}
        </div>
        <div>
          <h3>Most consequential mistakes</h3>
          {evaluation.mistakes.length ? (
            <ol>
              {evaluation.mistakes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          ) : (
            <p className="note">No mistakes identified with confidence.</p>
          )}
        </div>
      </div>
      <h3>Street-by-street replay</h3>
      <Replay state={finalState} hero={scenario.heroIndex} evaluation={evaluation} />
      {villains.length > 0 && finalState.result?.reason === 'fold' && (
        <label className="reveal">
          <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> The hand is over: reveal the opponent’s actual cards (for learning; you would not normally see them)
        </label>
      )}
      {reveal && (
        <p>
          {villains.map((v) => (
            <span key={v.index} className="sd">
              {v.position}: <CardRow cards={v.hole} size="sm" />
            </span>
          ))}
        </p>
      )}
      {hiddenProfiles.length > 0 && (
        <p className="note">
          Hidden opponent tendencies (expert mode): {hiddenProfiles.map(([i, p]) => `${finalState.players[Number(i)].position} was a ${PROFILES[p].name}`).join('; ')}. Your decisions were evaluated against the “Unknown” baseline you could see.
        </p>
      )}
      <h3>Decisions</h3>
      {evaluation.decisions.map((d, i) => (
        <DecisionDetail key={i} d={d} defaultOpen={d.isKey || d.grade === 'mistake' || d.grade === 'blunder'} />
      ))}
      <h3>Study the concepts</h3>
      <ul className="lesson-links">
        {evaluation.lessons.map((id) => (
          <li key={id}>{LESSON_INDEX[id] ? <Link to={`/learn/${id}`}>{LESSON_INDEX[id].title}</Link> : <span>{id} (lesson not yet written)</span>}</li>
        ))}
      </ul>
      <details className="assumptions">
        <summary>Assumptions and evaluation method</summary>
        <ul>
          {scenario.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
          <li>Scores are instructional assessments from transparent heuristics, charts, exact math and simulations against the opponent model — not solver-verified optimal play. Results of the hand never affect the score.</li>
          {t && <li>Evaluation method for the key decision: {t.evaluation.method}.</li>}
        </ul>
      </details>
    </div>
  );
}
