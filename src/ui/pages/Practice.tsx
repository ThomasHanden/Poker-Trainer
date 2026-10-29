import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { run } from '../../workers/client';
import { GenerateResult } from '../../scenarios/generator';
import { Scenario, PracticeSettings } from '../../scenarios/types';
import { PlaySession, startSession, heroAct } from '../../scenarios/play';
import { PlayerAction, legalActions } from '../../engine/rules';
import { ScenarioEvaluation, LiveHelp, Assistance, DecisionEvaluation } from '../../evaluation/evaluate';
import { Table, HistoryList, fmtBB } from '../components/Table';
import { ActionBar } from '../components/ActionBar';
import { SettingsPanel } from '../components/SettingsPanel';
import { ReviewView, GradeBadge } from '../components/ReviewView';
import { getTemplate } from '../../scenarios/templates';
import { HandRecord, newId } from '../../persistence/storage';
import { PROFILES } from '../../opponents/profiles';
import { CONCEPTS, ConceptId } from '../../content/concepts';
import { Term } from '../components/Term';

type Phase = 'idle' | 'loading' | 'playing' | 'evaluating' | 'done' | 'error';
const NO_ASSIST: Assistance = { hint: false, potOdds: false, equity: false, feedback: false };

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
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (params.get('start') === '1' || params.get('template') || params.get('concept')) {
      autoStarted.current = true;
      begin();
    }
  }, [params, begin]);

  const finish = async (s: PlaySession) => {
    setPhase('evaluating');
    try {
      const ev = await run<ScenarioEvaluation>({ kind: 'evaluate', scenario: s.scenario, decisions: s.decisions });
      setEvaluation(ev);
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

  return (
    <div className="page practice">
      <div className="practice-top">
        <h1>Practice</h1>
        <div className="top-actions">
          <button className="btn primary big" onClick={() => begin()} disabled={phase === 'loading' || phase === 'evaluating'} data-testid="new-scenario">
            {phase === 'loading' ? 'Dealing…' : 'New scenario'} <kbd>N</kbd>
          </button>
          <button className="btn" aria-expanded={showSettings} onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? 'Hide settings' : 'Settings'}
          </button>
          <button className="btn ghost" onClick={() => setShowKeys((s) => !s)} aria-expanded={showKeys}>
            Shortcuts <kbd>?</kbd>
          </button>
        </div>
      </div>
      {(targetTemplate || targetConcept) && (
        <div className="banner info">
          Targeted practice: {targetTemplate ? getTemplate(targetTemplate)?.title ?? targetTemplate : CONCEPTS[targetConcept!]?.name}.{' '}
          <button className="linklike" onClick={() => setParams({})}>
            Clear target
          </button>
        </div>
      )}
      {showKeys && (
        <div className="keys" role="dialog" aria-label="Keyboard shortcuts">
          <strong>Keyboard:</strong> <kbd>F</kbd> fold · <kbd>C</kbd>/<kbd>K</kbd> check or call · <kbd>B</kbd>/<kbd>R</kbd> open sizing · <kbd>1</kbd>–<kbd>7</kbd> pot-size presets (25–150%) · <kbd>A</kbd> all-in amount · <kbd>Enter</kbd> confirm amount · <kbd>H</kbd> hint (guided) · <kbd>N</kbd> new scenario · <kbd>?</kbd> toggle this help
        </div>
      )}
      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} />}
      {phase === 'idle' && !sess && (
        <div className="empty">
          <p>Choose settings (or keep the defaults) and press <strong>New scenario</strong>. Every scenario is freshly generated from a validated template; you can change difficulty or targets at any time.</p>
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          <p>{error.msg}</p>
          {error.suggestions && (
            <ul>
              {error.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          <p>
            See the <Link to="/coverage">coverage map</Link> for supported combinations.
          </p>
        </div>
      )}
      {phase === 'loading' && <div className="loading" role="status">Generating a fresh scenario…</div>}
      {sess && sc && (
        <div className="practice-grid">
          <div className="practice-main">
            <div className="scenario-head">
              <h2>{sc.title}</h2>
              <p>{sc.setupText}</p>
              <p className="note">
                {sc.state.config.format === 'cash' ? 'Cash game' : 'Tournament'} · {sc.state.players.length === 2 ? 'heads-up' : `${sc.state.players.length}-handed`} · {sc.difficulty} · {guided ? 'guided' : 'assessment'} ·{' '}
                {Object.entries(sc.shownProfiles)
                  .filter(([i]) => !sess.state.players[Number(i)].folded || sess.state.history.some((h) => h.player === Number(i) && h.type !== 'fold' && !h.type.startsWith('post')))
                  .map(([i, p]) => `${sess.state.players[Number(i)].position}: ${PROFILES[p].short}`)
                  .join(', ')}
              </p>
              {sc.icm && <p className="note">Payouts: {sc.icm.description}</p>}
            </div>
            <Table state={sess.state} hero={sc.heroIndex} profiles={sc.shownProfiles} fourColor={data.prefs.fourColor} />
            {heroTurn && <ActionBar state={sess.state} onAct={onAct} disabled={phase !== 'playing'} />}
            {!heroTurn && phase === 'evaluating' && <div className="loading" role="status">Hand complete — analysing your decisions…</div>}
            {feedback && phase === 'playing' && (
              <div className="feedback" role="status">
                <strong>Last decision:</strong> {feedback.actionLabel} <GradeBadge grade={feedback.grade} /> — {feedback.recommended}
              </div>
            )}
            {guided && heroTurn && (
              <div className="assist-panel">
                <h3>Guided help</h3>
                <p className="note">Using help marks this decision as assisted in your progress.</p>
                <div className="assist-buttons">
                  {sc.settings.assists.hints && (
                    <button className="btn" onClick={() => requestHelp('hint')}>
                      Hint <kbd>H</kbd>
                    </button>
                  )}
                  {sc.settings.assists.potOdds && la && la.toCall > 0 && (
                    <button className="btn" onClick={() => requestHelp('potOdds')}>
                      Show pot odds
                    </button>
                  )}
                  {sc.settings.assists.equity && (
                    <button className="btn" onClick={() => requestHelp('equity')} disabled={helpLoading}>
                      {helpLoading ? 'Calculating…' : 'Equity vs modelled range'}
                    </button>
                  )}
                </div>
                {assist.hint && (
                  <p className="hint">
                    💡 {sess.decisions.length === 0 ? template?.hint : 'Ask: which hands in their range call or fold your options? Compare the price with your equity and think about later streets.'}
                  </p>
                )}
                {assist.potOdds && la && la.toCall > 0 && (
                  <p>
                    <Term id="potodds">Pot odds</Term>: call {fmtBB(la.toCall, sc.state.config.bb)} into {fmtBB(la.pot, sc.state.config.bb)} → you need {((100 * la.toCall) / (la.pot + la.toCall)).toFixed(1)}% equity to break even (before considering later streets).
                  </p>
                )}
                {assist.equity && help?.equity && (
                  <p>
                    <Term id="equity">Equity</Term> vs the modelled range: <strong>{(help.equity.value * 100).toFixed(1)}%</strong> ({help.equity.method}
                    {help.equity.samples && help.equity.se > 0 ? `, ${help.equity.samples.toLocaleString()} samples, ±${(196 * help.equity.se).toFixed(1)}%` : ''}). {help.rangeSummary}
                  </p>
                )}
              </div>
            )}
            {phase === 'done' && evaluation && (
              <div className="done-bar">
                <span>
                  Hand complete.{' '}
                  {evaluation.score !== null ? (
                    <>
                      Instructional score <strong data-testid="score">{evaluation.score}</strong> (confidence {evaluation.confidence}).
                    </>
                  ) : (
                    'Insufficient confidence to score.'
                  )}
                </span>
                <button className="btn primary" onClick={() => begin()}>
                  New scenario
                </button>
                <button className="btn" onClick={() => begin({ templateId: sc.templateId, seed: sc.seed, settingsOverride: sc.settings })}>
                  Retry this spot
                </button>
                <button className="btn" onClick={() => begin({ templateId: sc.templateId, settingsOverride: sc.settings })}>
                  Related scenario
                </button>
              </div>
            )}
          </div>
          <aside className="practice-side">
            <h3>Action history</h3>
            <HistoryList state={sess.state} hero={sc.heroIndex} />
          </aside>
        </div>
      )}
      {phase === 'done' && evaluation && sess && sc && (
        <ReviewView
          scenario={sc}
          finalState={sess.state}
          evaluation={evaluation}
          onRetry={() => begin({ templateId: sc.templateId, seed: sc.seed, settingsOverride: sc.settings })}
          onRelated={() => begin({ templateId: sc.templateId, settingsOverride: sc.settings })}
          bookmarked={record?.bookmarked}
          onBookmark={record ? () => update((d) => ({ ...d, history: d.history.map((h) => (h.id === record.id ? { ...h, bookmarked: !h.bookmarked } : h)) })) : undefined}
        />
      )}
    </div>
  );
}
