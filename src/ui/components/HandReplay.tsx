import { useEffect, useMemo, useState } from 'react';
import { HandState, Street } from '../../engine/rules';
import { buildTimeline, TimelineStep } from '../../engine/timeline';
import { DecisionEvaluation, GRADE_LABEL } from '../../evaluation/evaluate';
import { ProfileId } from '../../opponents/profiles';
import { Table, HistoryList, actionText, fmtBB } from './Table';

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Step-through replay of a hand on the table, with the hero's graded decisions marked. */
export function HandReplay({
  finalState,
  hero,
  profiles,
  fourColor,
  decisions,
  jumpTo,
}: {
  finalState: HandState;
  hero: number;
  profiles: Record<number, ProfileId>;
  fourColor: boolean;
  decisions: DecisionEvaluation[];
  /** request to show a given hero decision (changes when a decision card asks for it) */
  jumpTo?: { decision: number; nonce: number };
}) {
  const steps = useMemo(() => buildTimeline(finalState), [finalState]);
  const [i, setI] = useState(() => (steps ? steps.length - 1 : 0));
  const [playing, setPlaying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const last = (steps?.length ?? 1) - 1;

  // hero decision k ↔ the k-th unscripted hero action
  const heroSteps = useMemo(() => (steps ?? []).map((s, k) => (s.record && s.record.player === hero && !s.record.scripted ? k : -1)).filter((k) => k >= 0), [steps, hero]);
  const gradeAt = (k: number) => {
    const d = heroSteps.indexOf(k);
    return d >= 0 ? decisions[d] : undefined;
  };

  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setI((x) => Math.min(last, x + 1)), 1100);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  useEffect(() => {
    if (!jumpTo || heroSteps[jumpTo.decision] === undefined) return;
    // show the table as the decision was faced: the step before the hero acted
    setPlaying(false);
    setI(Math.max(0, heroSteps[jumpTo.decision] - 1));
    document.getElementById('replay')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [jumpTo, heroSteps]);

  if (!steps) {
    return (
      <section className="replay" id="replay">
        <h3>Hand history</h3>
        <HistoryList state={finalState} hero={hero} />
      </section>
    );
  }

  const step = steps[i];
  const st = step.state;
  const bb = st.config.bb;
  const rec = step.record;
  const who = (p: number) => (p === hero ? 'You' : st.players[p].position);
  const nextUp = steps[i + 1]?.record;
  const facing = nextUp && nextUp.player === hero && !nextUp.scripted ? gradeAt(i + 1) : undefined;
  const thisDecision = rec ? gradeAt(i) : undefined;
  const BOARD: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  const streetOf = (n: number): Street => (n >= 5 ? 'river' : n === 4 ? 'turn' : n === 3 ? 'flop' : 'preflop');
  const streetStart = (s: Street) => steps.findIndex((x) => x.state.board.length >= BOARD[s]);
  const spotlight = rec ? { seat: rec.player, label: cap(actionText(rec, bb, rec.player === hero)).replace(/ \(all-in\)$/, ' · all-in') } : undefined;

  const caption = stepCaption(steps, i, hero);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') setI((x) => Math.min(last, x + 1));
    else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    else return;
    e.preventDefault();
    setPlaying(false);
  };

  return (
    <section className="replay" id="replay" aria-label="Hand replay" tabIndex={-1} onKeyDown={onKey}>
      <div className="replay-head">
        <h3>Replay</h3>
        <div className="seg replay-streets" role="group" aria-label="Jump to street">
          {STREETS.map((s) => {
            const k = streetStart(s);
            if (k < 0) return null;
            return (
              <button key={s} className={streetOf(st.board.length) === s ? 'on' : ''} onClick={() => { setPlaying(false); setI(k); }}>
                {cap(s)}
              </button>
            );
          })}
        </div>
        <label className="replay-reveal">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all cards
        </label>
      </div>

      <Table state={st} hero={hero} profiles={profiles} fourColor={fourColor} revealAll={showAll} spotlight={spotlight} />

      <div className="replay-caption" aria-live="polite">
        <span className="replay-count">
          {i}/{last}
        </span>
        <span>
          {rec && <strong className="street-tag">{cap(rec.street)}</strong>} {caption}
          {thisDecision && <span className={`tchip g-${thisDecision.grade} inline`}>{GRADE_LABEL[thisDecision.grade]}</span>}
          {facing && <span className="replay-facing"> Your decision next — pot {fmtBB(st.players.reduce((a, p) => a + p.totalCommitted, 0), bb)}.</span>}
        </span>
      </div>

      <div className="replay-scrub" aria-hidden="true">
        {steps.map((s, k) => {
          const g = gradeAt(k);
          const newStreet = k > 0 && s.state.board.length > steps[k - 1].state.board.length;
          return (
            <button
              key={k}
              tabIndex={-1}
              className={`rdot ${k === i ? 'on' : ''} ${k < i ? 'past' : ''} ${g ? `g-${g.grade} hero` : ''} ${newStreet ? 'gap' : ''}`}
              onClick={() => { setPlaying(false); setI(k); }}
              title={s.record ? `${who(s.record.player)} ${actionText(s.record, bb, s.record.player === hero)}` : 'Start'}
            />
          );
        })}
      </div>

      <div className="replay-controls">
        <button className="btn small" onClick={() => { setPlaying(false); setI(0); }} disabled={i === 0} aria-label="Back to start">⏮</button>
        <button className="btn small" onClick={() => { setPlaying(false); setI((x) => Math.max(0, x - 1)); }} disabled={i === 0} aria-label="Previous action">◀<span className="rc-t"> Back</span></button>
        <button className="btn small primary" data-testid="replay-play" aria-label={playing ? "Pause" : i >= last ? "Replay from the start" : "Play"} onClick={() => { if (i >= last) setI(0); setPlaying((p) => !p); }}>
          {playing ? '❚❚' : i >= last ? '↻' : '▶'}
          <span className="rc-t">{playing ? ' Pause' : i >= last ? ' Replay' : ' Play'}</span>
        </button>
        <button className="btn small" data-testid="replay-next" onClick={() => { setPlaying(false); setI((x) => Math.min(last, x + 1)); }} disabled={i >= last} aria-label="Next action"><span className="rc-t">Next </span>▶</button>
        <button className="btn small" onClick={() => { setPlaying(false); setI(last); }} disabled={i >= last} aria-label="Jump to end">⏭</button>
      </div>
    </section>
  );
}

/** Plain-words caption for one step of a timeline: who did what, and which card came. */
export function stepCaption(steps: TimelineStep[], i: number, hero: number): string {
  const st = steps[i].state;
  const rec = steps[i].record;
  const bb = st.config.bb;
  const who = (p: number) => (p === hero ? 'You' : st.players[p].position);
  const dealt = rec && i > 0 && steps[i - 1].state.board.length < st.board.length;
  if (!rec) return `Blinds posted. ${who(st.toAct)} to act first.`;
  let caption = `${who(rec.player)} ${actionText(rec, bb, rec.player === hero)}.`;
  if (st.complete && st.result) {
    const res = st.result;
    const winner = Number(Object.entries(res.net).sort((a, b) => b[1] - a[1])[0][0]);
    if (res.reason === 'fold') caption += ` Hand over — ${who(winner)} ${winner === hero ? 'win' : 'wins'} the pot.`;
    else caption += dealt ? ' Board runs out; showdown.' : ' Showdown.';
  } else if (dealt) caption += ` ${cap(st.street)} dealt.`;
  return caption;
}
