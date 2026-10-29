import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { run } from '../../workers/client';
import { GenerateResult } from '../../scenarios/generator';
import { Scenario, PracticeSettings } from '../../scenarios/types';
import { PlaySession, startSession, heroAct } from '../../scenarios/play';
import { PlayerAction, legalActions } from '../../engine/rules';
import { buildTimeline, TimelineStep } from '../../engine/timeline';
import { ScenarioEvaluation, LiveHelp, Assistance, DecisionEvaluation } from '../../evaluation/evaluate';
import { Table, DecisionFacts, actionText, fmtBB } from '../components/Table';
import { stepCaption } from '../components/HandReplay';
import { ActionBar } from '../components/ActionBar';
import { SettingsPanel, settingsSummary } from '../components/SettingsPanel';
import { ReviewView, GradeBadge } from '../components/ReviewView';
import { getTemplate } from '../../scenarios/templates';
import { HandRecord, PlaySpeed, newId } from '../../persistence/storage';
import { PROFILES } from '../../opponents/profiles';
import { CONCEPTS, ConceptId } from '../../content/concepts';
import { Term } from '../components/Term';

type Phase = 'idle' | 'loading' | 'playing' | 'evaluating' | 'done' | 'error';
const NO_ASSIST: Assistance = {
  hint: false,
  potOdds: false,
  equity: false,
  feedback: false,
};

interface SessionStats {
  hands: number;
  scored: number;
  scoreSum: number;
  streak: number;
  bestStreak: number;
}
const SESSION_KEY = 'felt-school:session';
const EMPTY_SESSION: SessionStats = {
  hands: 0,
  scored: 0,
  scoreSum: 0,
  streak: 0,
  bestStreak: 0,
};
function loadSession(): SessionStats {
  try {
    return {
      ...EMPTY_SESSION,
      ...JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}'),
    };
  } catch {
    return EMPTY_SESSION;
  }
}
function saveSession(s: SessionStats) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}
/** The hand playing out on the table, one action at a time. */
interface Playback {
  steps: TimelineStep[];
  i: number;
}

const SPEED: Record<PlaySpeed, number> = { slow: 1.5, normal: 1, fast: 0.55 };

/** How long a step stays on screen before the next action (ms), at normal speed. */
function stepDelay(steps: TimelineStep[], i: number): number {
  const st = steps[i];
  if (!st.record) return 1300;
  if (st.state.complete) return 2400;
  if (i > 0 && steps[i - 1].state.board.length < st.state.board.length) return 2000;
  return st.record.type === 'fold' ? 700 : 1400;
}

const isClean = (ev: ScenarioEvaluation) => ev.decisions.length > 0 && ev.decisions.every((d) => d.grade === 'best' || d.grade === 'good');

export function PracticePage() {
  const { data, update } = useStore();
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [sess, setSess] = useState<PlaySession | null>(null);
  const [evaluation, setEvaluation] = useState<ScenarioEvaluation | null>(null);
  const [error, setError] = useState<{
    msg: string;
    suggestions?: string[];
  } | null>(null);
  const [help, setHelp] = useState<LiveHelp | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [assist, setAssist] = useState<Assistance>(NO_ASSIST);
  const [feedback, setFeedback] = useState<DecisionEvaluation | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pb, setPb] = useState<Playback | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [stats, setStats] = useState<SessionStats>(loadSession);
  const [fastShown, setFastShown] = useState(false);
  const [fastPaused, setFastPaused] = useState(false);
  const fastMode = !!data.prefs.fastMode;
  const speed: PlaySpeed = data.prefs.playSpeed ?? 'normal';
  const scrolledFor = useRef<string | null>(null);
  const decisionStart = useRef(Date.now());
  const autoSeedUsed = useRef(false);
  const settings = data.settings;
  const targetTemplate = params.get('template') ?? undefined;
  const targetConcept = params.get('concept') as ConceptId | null;
  const targetSeed = params.get('seed') ? Number(params.get('seed')) : undefined;

  const effectiveSettings: PracticeSettings = useMemo(() => (targetConcept && CONCEPTS[targetConcept] ? { ...settings, concepts: [targetConcept] } : settings), [settings, targetConcept]);

  const setSettings = (s: PracticeSettings) => update((d) => ({ ...d, settings: s }));

  const begin = useCallback(
    async (
      opts: {
        templateId?: string;
        seed?: number;
        settingsOverride?: PracticeSettings;
      } = {},
    ) => {
      setPhase('loading');
      setError(null);
      setEvaluation(null);
      setFeedback(null);
      setHelp(null);
      setAssist(NO_ASSIST);
      setRecordId(null);
      try {
        const s = opts.settingsOverride ?? effectiveSettings;
        const res = await run<GenerateResult>({
          kind: 'generate',
          settings: s,
          opts: {
            templateId: opts.templateId ?? targetTemplate,
            seed: opts.seed ?? (autoSeedUsed.current ? undefined : targetSeed),
            recentFingerprints: data.recent.fingerprints,
            recentTemplates: data.recent.templates,
          },
        });
        if (!res.scenario) {
          setError({
            msg: res.error ?? 'Could not generate a scenario.',
            suggestions: res.suggestions,
          });
          setPhase('error');
          return;
        }
        autoSeedUsed.current = true;
        const sc = res.scenario;
        update((d) => ({
          ...d,
          recent: {
            fingerprints: [...d.recent.fingerprints, sc.fingerprint].slice(-50),
            templates: [...d.recent.templates, sc.templateId].slice(-20),
          },
        }));
        const st = startSession(sc);
        setSess(st);
        setShowSettings(false);
        play(st.state, 0);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        decisionStart.current = Date.now();
        if (st.state.complete) await finish(st);
        else setPhase('playing');
      } catch (e) {
        setError({ msg: (e as Error).message });
        setPhase('error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveSettings, targetTemplate, data.recent],
  );

  // auto-start from home page / lesson links
  const autoStarted = useRef<string | null>(null);
  useEffect(() => {
    const key = params.toString();
    if (autoStarted.current === key) return;
    if (params.get('start') === '1' || params.get('template') || params.get('concept')) {
      autoStarted.current = key;
      autoSeedUsed.current = false;
      begin();
    }
  }, [params, begin]);

  /** Animate the hand on the table from the step at history index `from` (0 = the deal). */
  const play = (state: PlaySession['state'], from: number) => {
    const steps = buildTimeline(state);
    if (!steps) return setPb(null);
    const start = from === 0 ? 0 : steps.findIndex((x) => x.historyIndex >= from);
    // nothing new to show (e.g. you act and it is your turn again on the same street)
    if (start < 0 || (start >= steps.length - 1 && from !== 0 && !state.complete)) return setPb(null);
    setPb({ steps, i: start });
  };

  useEffect(() => {
    if (!pb) return;
    const last = pb.steps.length - 1;
    const t = setTimeout(() => setPb(pb.i >= last ? null : { ...pb, i: pb.i + 1 }), stepDelay(pb.steps, pb.i) * SPEED[speed]);
    return () => clearTimeout(t);
  }, [pb, speed]);

  const finish = async (s: PlaySession) => {
    setPhase('evaluating');
    try {
      const ev = await run<ScenarioEvaluation>({
        kind: 'evaluate',
        scenario: s.scenario,
        decisions: s.decisions,
      });
      setEvaluation(ev);
      setStats((old) => {
        const clean = isClean(ev);
        const n: SessionStats = {
          hands: old.hands + 1,
          scored: old.scored + (ev.score !== null ? 1 : 0),
          scoreSum: old.scoreSum + (ev.score ?? 0),
          streak: clean ? old.streak + 1 : 0,
          bestStreak: Math.max(old.bestStreak, clean ? old.streak + 1 : 0),
        };
        saveSession(n);
        return n;
      });
      const fast = !!data.prefs.fastMode && isClean(ev);
      setFastShown(fast);
      setFastPaused(false);
      const sc = s.scenario;
      const t = getTemplate(sc.templateId);
      const rec: HandRecord = {
        id: newId(),
        scenarioId: sc.id,
        templateId: sc.templateId,
        templateVersion: sc.templateVersion,
        scoringVersion: ev.scoringVersion,
        title: sc.title,
        settings: sc.settings,
        difficulty: sc.difficulty,
        mode: sc.settings.mode,
        format: sc.state.config.format,
        heroPosition: sc.state.players[sc.heroIndex].position,
        keyStreet: t?.street ?? 'preflop',
        createdAt: Date.now(),
        heroActions: s.decisions.map((d) => d.action),
        assists: s.decisions.map((d) => d.assisted),
        score: ev.score,
        confidence: ev.confidence,
        assisted: ev.assisted,
        decisions: ev.decisions.map((d) => ({
          street: d.street,
          actionLabel: d.actionLabel,
          grade: d.grade,
          points: d.points,
          confidence: d.confidence,
          concepts: d.concepts,
          mistakeCategories: d.mistakeCategories,
          isKey: d.isKey,
          assisted: d.assisted,
          sizing: d.sizing?.verdict,
        })),
        netBB: (s.state.result?.net[sc.heroIndex] ?? 0) / sc.state.config.bb,
        bookmarked: false,
      };
      update((d) => ({ ...d, history: [...d.history, rec] }));
      setRecordId(rec.id);
      setPhase('done');
    } catch (e) {
      setError({ msg: `Evaluation failed: ${(e as Error).message}` });
      setPhase('error');
    }
  };

  const onAct = useCallback(
    (a: PlayerAction) => {
      if (!sess || phase !== 'playing') return;
      const guided = sess.scenario.settings.mode === 'guided';
      const assisted: Assistance = {
        ...assist,
        feedback: guided && sess.scenario.settings.assists.immediateFeedback,
      };
      let next: PlaySession;
      try {
        next = heroAct(sess, a, assisted, Date.now() - decisionStart.current);
      } catch (e) {
        setError({ msg: (e as Error).message });
        return;
      }
      setSess(next);
      play(next.state, sess.state.history.length);
      setHelp(null);
      setAssist(NO_ASSIST);
      decisionStart.current = Date.now();
      if (guided && sess.scenario.settings.assists.immediateFeedback) {
        const last = next.decisions[next.decisions.length - 1];
        run<ScenarioEvaluation>({
          kind: 'evaluate',
          scenario: next.scenario,
          decisions: [last],
        })
          .then((ev) => setFeedback(ev.decisions[0]))
          .catch(() => setFeedback(null));
      }
      if (next.state.complete) finish(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sess, phase, assist],
  );

  const requestHelp = async (kind: 'potOdds' | 'equity' | 'hint') => {
    if (!sess) return;
    setAssist((a) => ({ ...a, [kind]: true }));
    if (kind === 'hint') return;
    setHelpLoading(true);
    try {
      const h = await run<LiveHelp>({
        kind: 'help',
        scenario: sess.scenario,
        state: sess.state,
        equity: kind === 'equity',
      });
      setHelp((old) => ({
        ...h,
        equity: h.equity ?? old?.equity,
        rangeSummary: h.rangeSummary ?? old?.rangeSummary,
      }));
    } catch {
      /* ignore */
    }
    setHelpLoading(false);
  };

  // fast mode: deal the next hand automatically after a clean hand
  useEffect(() => {
    if (phase !== 'done' || pb || !fastShown || fastPaused) return;
    const t = setTimeout(() => begin(), 2200);
    return () => clearTimeout(t);
  }, [phase, pb, fastShown, fastPaused, begin]);

  // once the hand has finished playing out, bring the review into view
  const reviewReady = phase === 'done' && !!evaluation && !pb;
  useEffect(() => {
    if (!reviewReady || !recordId || scrolledFor.current === recordId) return;
    scrolledFor.current = recordId;
    requestAnimationFrame(() => document.querySelector(fastShown ? '.fast-result' : '.rsum')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [reviewReady, recordId, fastShown]);

  // page-level shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') setShowKeys((s) => !s);
      if (pb && (e.key === ' ' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        setPb(null);
        return;
      }
      if (phase === 'playing') {
        if (e.key.toLowerCase() === 'h' && sess?.scenario.settings.mode === 'guided') requestHelp('hint');
        return;
      }
      if (e.key.toLowerCase() === 'n' && phase !== 'loading' && phase !== 'evaluating') begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sc: Scenario | undefined = sess?.scenario;
  const template = sc ? getTemplate(sc.templateId) : undefined;
  const heroTurn = sess && !sess.state.complete && sess.state.toAct === sc!.heroIndex;
  const guided = sc?.settings.mode === 'guided';
  const record = recordId ? data.history.find((h) => h.id === recordId) : undefined;
  const la = sess && heroTurn ? legalActions(sess.state) : null;

  const targetLabel = targetTemplate ? (getTemplate(targetTemplate)?.title ?? targetTemplate) : targetConcept ? CONCEPTS[targetConcept]?.name : null;
  const opponents = sc
    ? Object.entries(sc.shownProfiles)
        .filter(([i]) => !sess!.state.players[Number(i)].folded || sess!.state.history.some((h) => h.player === Number(i) && h.type !== 'fold' && !h.type.startsWith('post')))
        .map(([i, p]) => `${sess!.state.players[Number(i)].position}: ${PROFILES[p].short}`)
    : [];
  const retry = () =>
    sc &&
    begin({
      templateId: sc.templateId,
      seed: sc.seed,
      settingsOverride: sc.settings,
    });
  const pbStep = pb ? pb.steps[pb.i] : null;
  const shownState = pbStep ? pbStep.state : sess?.state;
  const spotlight = pbStep?.record
    ? {
        seat: pbStep.record.player,
        label: cap(actionText(pbStep.record, pbStep.state.config.bb, pbStep.record.player === sc!.heroIndex)).replace(/ \(all-in\)$/, ' · all-in'),
      }
    : undefined;
  const chooseMode = (m: 'spots' | 'full') => {
    const next: PracticeSettings = {
      ...settings,
      street: m === 'full' ? 'full' : 'any',
      concepts: m === 'full' ? [] : settings.concepts,
    };
    setSettings(next);
    if (targetTemplate || targetConcept) setParams({});
    return next;
  };
  const isFull = settings.street === 'full';

  const errorBox = error && (
    <div className="error-box" role="alert">
      <p>{error.msg}</p>
      {error.suggestions && (
        <ul>
          {error.suggestions.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
  const fastToggle = (
    <label className="fast-toggle" title="After a hand where every decision was good, show a short result and deal the next hand automatically. Mistakes always stop for a full review.">
      <input
        type="checkbox"
        checked={fastMode}
        onChange={(e) =>
          update((d) => ({
            ...d,
            prefs: { ...d.prefs, fastMode: e.target.checked },
          }))
        }
      />{' '}
      Fast mode
    </label>
  );

  // ---------- start screen: choose what to play, then deal ----------
  if (!sess) {
    return (
      <div className="page practice">
        <section className="lobby" aria-label="Start practicing">
          <div className="lobby-intro">
            <h1 className="ph-title">Practice</h1>
            <p className="ph-sub">Sit down at a table and play. The action plays out until it reaches you, you make the call, and then you see the best play and why.</p>
            {targetLabel && (
              <p className="pchip target">
                Target: {targetLabel}
                <button aria-label="Clear target" onClick={() => setParams({})}>
                  ×
                </button>
              </p>
            )}
          </div>

          <div className="lobby-step">
            <h2 className="lobby-h">
              <span className="lobby-n">1</span> What do you want to play?
            </h2>
            <div className="lobby-modes" role="radiogroup" aria-label="Practice type">
              {(
                [
                  ['spots', 'Single spots', 'One key decision from a common situation — preflop, flop, turn or river. Quick reps, one lesson at a time.', 'About 30 seconds a hand'],
                  ['full', 'Full hands', 'A whole hand from the deal to the end. You make every decision along the way, street by street.', 'About 2 minutes a hand'],
                ] as const
              ).map(([m, title, desc, meta]) => {
                const on = isFull === (m === 'full');
                return (
                  <button key={m} role="radio" aria-checked={on} className={`lobby-mode ${on ? 'on' : ''}`} data-testid={`mode-${m}`} onClick={() => chooseMode(m)}>
                    <span className="lm-radio" aria-hidden="true" />
                    <span className="lm-text">
                      <strong>{title}</strong>
                      <span>{desc}</span>
                      <em>{meta}</em>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lobby-step">
            <h2 className="lobby-h">
              <span className="lobby-n">2</span> Set the table
            </h2>
            <SettingsPanel settings={settings} onChange={setSettings} />
          </div>

          <div className="lobby-go">
            <button className="btn primary big" onClick={() => begin()} disabled={phase === 'loading'} data-testid="new-scenario">
              {phase === 'loading' ? 'Dealing…' : 'Deal the first hand'}
            </button>
            {fastToggle}
          </div>
          {errorBox}
          <ol className="lobby-how" aria-label="How a hand works">
            <li>
              <strong>Watch</strong> the action reach your seat
            </li>
            <li>
              <strong>Decide</strong> — fold, call or raise
            </li>
            <li>
              <strong>Learn</strong> the best play and why
            </li>
          </ol>
        </section>
      </div>
    );
  }

  // ---------- at the table ----------
  return (
    <div className="page practice">
      <header className="practice-head">
        <div className="ph-main">
          <h1 className="ph-title">{sc ? sc.title : 'Practice'}</h1>
          {sc && <p className="ph-sub">{sc.setupText}</p>}
          <div className="ph-chips">
            {settingsSummary(settings)
              .split(' · ')
              .map((c) => (
                <span key={c} className="pchip">
                  {c}
                </span>
              ))}
            {opponents.map((o) => (
              <span key={o} className="pchip muted">
                {o}
              </span>
            ))}
            {sc?.icm && <span className="pchip muted">Payouts {sc.icm.payouts.join('/')}%</span>}
            {targetLabel && (
              <span className="pchip target">
                Target: {targetLabel}
                <button aria-label="Clear target" onClick={() => setParams({})}>
                  ×
                </button>
              </span>
            )}
            <button className="linklike ph-change" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
              {showSettings ? 'Close settings' : 'Change settings'}
            </button>
          </div>
        </div>
        <div className="ph-side">
          <div className="seg mode-switch" role="radiogroup" aria-label="Practice type">
            {(
              [
                ['spots', 'Single spots'],
                ['full', 'Full hands'],
              ] as const
            ).map(([m, label]) => {
              const on = isFull === (m === 'full');
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={on}
                  className={on ? 'on' : ''}
                  data-testid={`mode-${m}`}
                  onClick={() => {
                    if (on) return;
                    begin({
                      settingsOverride: chooseMode(m),
                      templateId: m === 'full' ? 'full-hand' : undefined,
                    });
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button className="btn primary big" onClick={() => begin()} disabled={phase === 'loading' || phase === 'evaluating'} data-testid="new-scenario">
            {phase === 'loading' ? 'Dealing…' : 'Next hand'}
          </button>
          {fastToggle}
        </div>
      </header>
      {stats.hands > 0 && (
        <div className="session-strip" aria-label="This session">
          <span>
            <strong>{stats.hands}</strong> {stats.hands === 1 ? 'hand' : 'hands'} this session
          </span>
          {stats.scored > 0 && (
            <span>
              Average <strong>{Math.round(stats.scoreSum / stats.scored)}</strong>
            </span>
          )}
          <span>
            Streak <strong>{stats.streak}</strong>
            {stats.bestStreak > stats.streak ? <span className="note"> (best {stats.bestStreak})</span> : null}
          </span>
          <button
            className="linklike"
            onClick={() => {
              setStats(EMPTY_SESSION);
              saveSession(EMPTY_SESSION);
            }}
          >
            Reset
          </button>
        </div>
      )}
      {showSettings && (
        <div className="settings-wrap">
          <SettingsPanel settings={settings} onChange={setSettings} />
          <div className="settings-done">
            <span className="note">Changes apply from the next hand.</span>
            <button className="btn" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>
        </div>
      )}
      {errorBox}
      {phase === 'loading' && (
        <div className="loading" role="status">
          Dealing a fresh hand…
        </div>
      )}
      {sc && shownState && phase !== 'loading' && !reviewReady && (
        <div className="practice-body">
          <Table state={shownState} hero={sc.heroIndex} profiles={sc.shownProfiles} fourColor={data.prefs.fourColor} spotlight={spotlight} />
          {pb && (
            <div className="playback" aria-live="polite" data-testid="playback">
              <span className="pb-caption">
                {pbStep?.record && <strong className="street-tag">{cap(pbStep.record.street)}</strong>} {stepCaption(pb.steps, pb.i, sc.heroIndex)}
              </span>
              <span className="pb-controls">
                <span className="seg pb-speed" role="radiogroup" aria-label="Speed">
                  {(['slow', 'normal', 'fast'] as const).map((v) => (
                    <button key={v} role="radio" aria-checked={speed === v} className={speed === v ? 'on' : ''} onClick={() => update((d) => ({ ...d, prefs: { ...d.prefs, playSpeed: v } }))}>
                      {cap(v)}
                    </button>
                  ))}
                </span>
                <button className="btn small ghost pb-skip" onClick={() => setPb(null)} data-testid="skip-playback">
                  Skip <span aria-hidden="true">›</span>
                </button>
              </span>
            </div>
          )}
          {heroTurn && !pb && (
            <section className="decision-panel" aria-label="Your decision">
              <DecisionFacts state={sess.state} hero={sc.heroIndex} />
              <ActionBar state={sess.state} onAct={onAct} disabled={phase !== 'playing'} />
              {feedback && (
                <p className="dp-feedback" role="status">
                  Last decision: {feedback.actionLabel} <GradeBadge grade={feedback.grade} />
                </p>
              )}
              {guided && (
                <div className="dp-help">
                  <div className="assist-buttons">
                    <span className="dp-help-label">Help</span>
                    {sc.settings.assists.hints && (
                      <button className="btn small" onClick={() => requestHelp('hint')}>
                        Hint
                      </button>
                    )}
                    {sc.settings.assists.potOdds && la && la.toCall > 0 && (
                      <button className="btn small" onClick={() => requestHelp('potOdds')}>
                        Pot odds
                      </button>
                    )}
                    {sc.settings.assists.equity && sc.difficulty !== 'expert' && (
                      <button className="btn small" onClick={() => requestHelp('equity')} disabled={helpLoading}>
                        {helpLoading ? 'Calculating…' : 'Equity'}
                      </button>
                    )}
                    <span className="note">Using help marks the decision as assisted.</span>
                  </div>
                  {assist.hint && (
                    <p className="hint">
                      {sess.decisions.length === 0 ? template?.hint : 'Which hands in their range call or fold each option? Compare the price with your equity, and think about later streets.'}
                    </p>
                  )}
                  {assist.potOdds && la && la.toCall > 0 && (
                    <p className="hint">
                      <Term id="potodds">Pot odds</Term>: call {fmtBB(la.toCall, sc.state.config.bb)} into {fmtBB(la.pot, sc.state.config.bb)} → you need{' '}
                      {((100 * la.toCall) / (la.pot + la.toCall)).toFixed(1)}% equity to break even.
                    </p>
                  )}
                  {assist.equity && help?.equity && (
                    <p className="hint">
                      <Term id="equity">Equity</Term> vs the modeled range: <strong>{(help.equity.value * 100).toFixed(1)}%</strong> ({help.equity.method}
                      {help.equity.samples && help.equity.se > 0 ? `, ±${(196 * help.equity.se).toFixed(1)}%` : ''}
                      ). {help.rangeSummary}
                    </p>
                  )}
                </div>
              )}
              <div className="dp-links">
                <button className="linklike" onClick={() => play(sess.state, 0)} data-testid="watch-again">
                  Watch the action again
                </button>
                <button className="linklike shortcuts-link" onClick={() => setShowKeys((k) => !k)} aria-expanded={showKeys}>
                  Keyboard shortcuts
                </button>
              </div>
              {showKeys && (
                <p className="keys">
                  <kbd>F</kbd> fold · <kbd>C</kbd> check/call · <kbd>B</kbd>/<kbd>R</kbd> bet or raise · <kbd>1</kbd>–<kbd>7</kbd> sizes · <kbd>A</kbd> all-in · <kbd>Enter</kbd> confirm · <kbd>H</kbd>{' '}
                  hint · <kbd>S</kbd> skip the replay · <kbd>N</kbd> next hand
                </p>
              )}
            </section>
          )}
          {phase === 'evaluating' && !pb && (
            <div className="loading" role="status">
              Hand complete — reviewing your decisions…
            </div>
          )}
        </div>
      )}
      {reviewReady && evaluation && sc && fastShown && (
        <section className="fast-result" aria-live="polite">
          <div className="fr-top">
            <span className="fr-score">{evaluation.score ?? '—'}</span>
            <div>
              <strong>Good hand.</strong> {evaluation.decisions.map((d) => `${cap(d.street)}: ${d.actionLabel.replace(/ \(\d+% pot\)/, '')}`).join(' · ')}
              <p className="note">{fastPaused ? 'Paused.' : 'Next hand in a moment…'}</p>
            </div>
          </div>
          {!fastPaused && (
            <div className="fr-bar" aria-hidden="true">
              <span />
            </div>
          )}
          <div className="review-actions">
            <button className="btn primary" onClick={() => begin()}>
              Next hand now
            </button>
            <button
              className="btn"
              onClick={() => {
                setFastPaused(true);
                setFastShown(false);
              }}
            >
              Show full review
            </button>
            {!fastPaused && (
              <button className="btn ghost" onClick={() => setFastPaused(true)}>
                Pause
              </button>
            )}
          </div>
        </section>
      )}
      {reviewReady && evaluation && sc && !fastShown && (
        <ReviewView
          scenario={sc}
          finalState={sess.state}
          evaluation={evaluation}
          onNext={() => begin()}
          onRetry={retry}
          bookmarked={record?.bookmarked}
          onBookmark={
            record
              ? () =>
                  update((d) => ({
                    ...d,
                    history: d.history.map((h) => (h.id === record.id ? { ...h, bookmarked: !h.bookmarked } : h)),
                  }))
              : undefined
          }
        />
      )}
    </div>
  );
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
