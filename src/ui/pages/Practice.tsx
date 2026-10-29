import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { run } from '../../workers/client';
import { GenerateResult } from '../../scenarios/generator';
import { Scenario, PracticeSettings } from '../../scenarios/types';
import { PlaySession, startSession, heroAct } from '../../scenarios/play';
import { PlayerAction, legalActions, HandState } from '../../engine/rules';
import { ScenarioEvaluation, LiveHelp, Assistance, DecisionEvaluation } from '../../evaluation/evaluate';
import { Table, HistoryList, DecisionFacts, fmtBB } from '../components/Table';
import { ActionBar } from '../components/ActionBar';
import { SettingsPanel, settingsSummary } from '../components/SettingsPanel';
import { ReviewView, GradeBadge } from '../components/ReviewView';
import { getTemplate } from '../../scenarios/templates';
import { HandRecord, newId } from '../../persistence/storage';
import { PROFILES } from '../../opponents/profiles';
import { CONCEPTS, ConceptId } from '../../content/concepts';
import { Term } from '../components/Term';

type Phase = 'idle' | 'loading' | 'playing' | 'evaluating' | 'done' | 'error';
const NO_ASSIST: Assistance = { hint: false, potOdds: false, equity: false, feedback: false };

interface SessionStats {
  hands: number;
  scored: number;
  scoreSum: number;
  streak: number;
  bestStreak: number;
}
const SESSION_KEY = 'felt-school:session';
const EMPTY_SESSION: SessionStats = { hands: 0, scored: 0, scoreSum: 0, streak: 0, bestStreak: 0 };
function loadSession(): SessionStats {
  try {
    return { ...EMPTY_SESSION, ...JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}') };
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
const isClean = (ev: ScenarioEvaluation) => ev.decisions.length > 0 && ev.decisions.every((d) => d.grade === 'best' || d.grade === 'good');

export function PracticePage() {
  const { data, update } = useStore();
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [sess, setSess] = useState<PlaySession | null>(null);
  const [evaluation, setEvaluation] = useState<ScenarioEvaluation | null>(null);
  const [error, setError] = useState<{ msg: string; suggestions?: string[] } | null>(null);
  const [help, setHelp] = useState<LiveHelp | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [assist, setAssist] = useState<Assistance>(NO_ASSIST);
  const [feedback, setFeedback] = useState<DecisionEvaluation | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [showKeys, setShowKeys] = useState(false);
  const [stats, setStats] = useState<SessionStats>(loadSession);
  const [fastShown, setFastShown] = useState(false);
  const [fastPaused, setFastPaused] = useState(false);
  const fastMode = !!data.prefs.fastMode;
  const decisionStart = useRef(Date.now());
  const autoSeedUsed = useRef(false);
  const settings = data.settings;
  const targetTemplate = params.get('template') ?? undefined;
  const targetConcept = params.get('concept') as ConceptId | null;
  const targetSeed = params.get('seed') ? Number(params.get('seed')) : undefined;

  const effectiveSettings: PracticeSettings = useMemo(
    () => (targetConcept && CONCEPTS[targetConcept] ? { ...settings, concepts: [targetConcept] } : settings),
    [settings, targetConcept],
  );

  const setSettings = (s: PracticeSettings) => update((d) => ({ ...d, settings: s }));

  const begin = useCallback(
    async (opts: { templateId?: string; seed?: number; settingsOverride?: PracticeSettings } = {}) => {
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
          opts: { templateId: opts.templateId ?? targetTemplate, seed: opts.seed ?? (autoSeedUsed.current ? undefined : targetSeed), recentFingerprints: data.recent.fingerprints, recentTemplates: data.recent.templates },
        });
        if (!res.scenario) {
          setError({ msg: res.error ?? 'Could not generate a scenario.', suggestions: res.suggestions });
          setPhase('error');
          return;
        }
        autoSeedUsed.current = true;
        const sc = res.scenario;
        update((d) => ({
          ...d,
          recent: { fingerprints: [...d.recent.fingerprints, sc.fingerprint].slice(-50), templates: [...d.recent.templates, sc.templateId].slice(-20) },
        }));
        const st = startSession(sc);
        setSess(st);
        setShowSettings(false);
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

  const finish = async (s: PlaySession) => {
    setPhase('evaluating');
    try {
      const ev = await run<ScenarioEvaluation>({ kind: 'evaluate', scenario: s.scenario, decisions: s.decisions });
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
      requestAnimationFrame(() => document.querySelector(fast ? '.fast-result' : '.rsum')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      setError({ msg: `Evaluation failed: ${(e as Error).message}` });
      setPhase('error');
    }
  };

  const onAct = useCallback(
    (a: PlayerAction) => {
      if (!sess || phase !== 'playing') return;
      const guided = sess.scenario.settings.mode === 'guided';
      const assisted: Assistance = { ...assist, feedback: guided && sess.scenario.settings.assists.immediateFeedback };
      let next: PlaySession;
      try {
        next = heroAct(sess, a, assisted, Date.now() - decisionStart.current);
      } catch (e) {
        setError({ msg: (e as Error).message });
        return;
      }
      setSess(next);
      setHelp(null);
      setAssist(NO_ASSIST);
      decisionStart.current = Date.now();
      if (guided && sess.scenario.settings.assists.immediateFeedback) {
        const last = next.decisions[next.decisions.length - 1];
        run<ScenarioEvaluation>({ kind: 'evaluate', scenario: next.scenario, decisions: [last] })
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
      const h = await run<LiveHelp>({ kind: 'help', scenario: sess.scenario, state: sess.state, equity: kind === 'equity' });
      setHelp((old) => ({ ...h, equity: h.equity ?? old?.equity, rangeSummary: h.rangeSummary ?? old?.rangeSummary }));
    } catch {
      /* ignore */
    }
    setHelpLoading(false);
  };

  // fast mode: deal the next hand automatically after a clean hand
  useEffect(() => {
    if (phase !== 'done' || !fastShown || fastPaused) return;
    const t = setTimeout(() => begin(), 2200);
    return () => clearTimeout(t);
  }, [phase, fastShown, fastPaused, begin]);

  // page-level shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') setShowKeys((s) => !s);
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

  const targetLabel = targetTemplate ? getTemplate(targetTemplate)?.title ?? targetTemplate : targetConcept ? CONCEPTS[targetConcept]?.name : null;
  const opponents = sc
    ? Object.entries(sc.shownProfiles)
        .filter(([i]) => !sess!.state.players[Number(i)].folded || sess!.state.history.some((h) => h.player === Number(i) && h.type !== 'fold' && !h.type.startsWith('post')))
        .map(([i, p]) => `${sess!.state.players[Number(i)].position}: ${PROFILES[p].short}`)
    : [];
  const retry = () => sc && begin({ templateId: sc.templateId, seed: sc.seed, settingsOverride: sc.settings });
  const related = () => sc && begin({ templateId: sc.templateId, settingsOverride: sc.settings });
  const lastAction = sess ? lastActionText(sess.state, sc!.heroIndex) : '';

  return (
    <div className="page practice">
      <header className="practice-head">
        <div className="ph-main">
          <h1 className="ph-title">{sc ? sc.title : 'Practice'}</h1>
          <p className="ph-sub">{sc ? sc.setupText : 'Pick your settings and play. Every decision is graded when the hand ends.'}</p>
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
              const on = (settings.street === 'full') === (m === 'full');
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={on}
                  className={on ? 'on' : ''}
                  data-testid={`mode-${m}`}
                  onClick={() => {
                    if (on) return;
                    const next: PracticeSettings = { ...settings, street: m === 'full' ? 'full' : 'any', concepts: m === 'full' ? [] : settings.concepts };
                    setSettings(next);
                    if (targetTemplate || targetConcept) setParams({});
                    begin({ settingsOverride: next, templateId: m === 'full' ? 'full-hand' : undefined });
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button className="btn primary big" onClick={() => begin()} disabled={phase === 'loading' || phase === 'evaluating'} data-testid="new-scenario">
            {phase === 'loading' ? 'Dealing…' : sess ? 'Next hand' : 'Start practicing'}
          </button>
          <label className="fast-toggle" title="After a hand where every decision was good, show a short result and deal the next hand automatically. Mistakes always stop for a full review.">
            <input type="checkbox" checked={fastMode} onChange={(e) => update((d) => ({ ...d, prefs: { ...d.prefs, fastMode: e.target.checked } }))} /> Fast mode
          </label>
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
          <span className="note">Unlimited hands — every deal is new.</span>
          <button className="linklike" onClick={() => { setStats(EMPTY_SESSION); saveSession(EMPTY_SESSION); }}>
            Reset
          </button>
        </div>
      )}
      {showSettings && (
        <div className="settings-wrap">
          <SettingsPanel settings={settings} onChange={setSettings} />
          <div className="settings-done">
            <button className="btn" onClick={() => setShowSettings(false)}>
              Done
            </button>
            {!sess && (
              <button className="btn primary" onClick={() => begin()} disabled={phase === 'loading'}>
                Deal a hand with these settings
              </button>
            )}
          </div>
        </div>
      )}
      {!showSettings && !sess && phase !== 'loading' && (
        <div className="practice-empty">
          <p>Press <strong>Start practicing</strong> to deal your first hand.</p>
        </div>
      )}
      {error && (
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
      )}
      {phase === 'loading' && <div className="loading" role="status">Dealing a fresh scenario…</div>}
      {sess && sc && !(phase === 'done' && evaluation) && (
        <div className="practice-body">
          <Table state={sess.state} hero={sc.heroIndex} profiles={sc.shownProfiles} fourColor={data.prefs.fourColor} />
          {heroTurn && (
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
                  {assist.hint && <p className="hint">{sess.decisions.length === 0 ? template?.hint : 'Which hands in their range call or fold each option? Compare the price with your equity, and think about later streets.'}</p>}
                  {assist.potOdds && la && la.toCall > 0 && (
                    <p className="hint">
                      <Term id="potodds">Pot odds</Term>: call {fmtBB(la.toCall, sc.state.config.bb)} into {fmtBB(la.pot, sc.state.config.bb)} → you need {((100 * la.toCall) / (la.pot + la.toCall)).toFixed(1)}% equity to break even.
                    </p>
                  )}
                  {assist.equity && help?.equity && (
                    <p className="hint">
                      <Term id="equity">Equity</Term> vs the modeled range: <strong>{(help.equity.value * 100).toFixed(1)}%</strong> ({help.equity.method}
                      {help.equity.samples && help.equity.se > 0 ? `, ±${(196 * help.equity.se).toFixed(1)}%` : ''}). {help.rangeSummary}
                    </p>
                  )}
                </div>
              )}
              <button className="linklike shortcuts-link" onClick={() => setShowKeys((k) => !k)} aria-expanded={showKeys}>
                Keyboard shortcuts
              </button>
              {showKeys && (
                <p className="keys">
                  <kbd>F</kbd> fold · <kbd>C</kbd> check/call · <kbd>B</kbd>/<kbd>R</kbd> bet or raise · <kbd>1</kbd>–<kbd>7</kbd> sizes · <kbd>A</kbd> all-in · <kbd>Enter</kbd> confirm · <kbd>H</kbd> hint · <kbd>N</kbd> next hand
                </p>
              )}
            </section>
          )}
          {phase === 'evaluating' && <div className="loading" role="status">Hand complete — reviewing your decisions…</div>}
          <details className="hand-so-far">
            <summary>
              <span>Hand so far</span>
              {lastAction && <span className="hsf-last">{lastAction}</span>}
            </summary>
            <HistoryList state={sess.state} hero={sc.heroIndex} />
          </details>
        </div>
      )}
      {phase === 'done' && evaluation && sess && sc && fastShown && (
        <section className="fast-result" aria-live="polite">
          <div className="fr-top">
            <span className="fr-score">{evaluation.score ?? '—'}</span>
            <div>
              <strong>Good hand.</strong> {evaluation.decisions.map((d) => `${d.street[0].toUpperCase() + d.street.slice(1)}: ${d.actionLabel.replace(/ \(\d+% pot\)/, '')}`).join(' · ')}
              <p className="note">{fastPaused ? 'Paused.' : 'Next hand in a moment…'}</p>
            </div>
          </div>
          {!fastPaused && <div className="fr-bar" aria-hidden="true"><span /></div>}
          <div className="review-actions">
            <button className="btn primary" onClick={() => begin()}>
              Next hand now
            </button>
            <button className="btn" onClick={() => { setFastPaused(true); setFastShown(false); }}>
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
      {phase === 'done' && evaluation && sess && sc && !fastShown && (
        <ReviewView
          scenario={sc}
          finalState={sess.state}
          evaluation={evaluation}
          onNext={() => begin()}
          onRetry={retry}
          onRelated={related}
          bookmarked={record?.bookmarked}
          onBookmark={record ? () => update((d) => ({ ...d, history: d.history.map((h) => (h.id === record.id ? { ...h, bookmarked: !h.bookmarked } : h)) })) : undefined}
        />
      )}
    </div>
  );
}

/** One-line description of the most recent action, for the collapsed history strip. */
function lastActionText(st: HandState, hero: number): string {
  for (let i = st.history.length - 1; i >= 0; i--) {
    const h = st.history[i];
    if (h.type.startsWith('post')) continue;
    const who = h.player === hero ? 'You' : st.players[h.player].position;
    const verb = h.player === hero ? { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise to' }[h.type as 'fold'] : { fold: 'folds', check: 'checks', call: 'calls', bet: 'bets', raise: 'raises to' }[h.type as 'fold'];
    const amt = h.type === 'bet' || h.type === 'raise' ? ` ${fmtBB(h.to, st.config.bb)}` : h.type === 'call' ? ` ${fmtBB(h.amount, st.config.bb)}` : '';
    return `Last: ${who} ${verb}${amt}`;
  }
  return '';
}
