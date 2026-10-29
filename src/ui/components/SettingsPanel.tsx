import { useMemo } from 'react';
import { PracticeSettings, DIFFICULTIES, STACK_BANDS, StackBand } from '../../scenarios/types';
import { matchingTemplates } from '../../scenarios/generator';
import { PROFILE_LIST } from '../../opponents/profiles';
import { CONCEPTS, ConceptId, CONCEPT_IDS } from '../../content/concepts';
import { TEMPLATES } from '../../scenarios/templates';

const DIFF_HELP: Record<string, string> = {
  beginner: 'Clearer spots, mostly baseline opponents, full help available.',
  intermediate: 'More borderline hands and some opponent tendencies.',
  advanced: 'Ambiguous hands, varied opponents, multiway and 3-bet pots.',
  expert: 'Thin, mixed spots; opponent tendencies hidden unless you choose one; no equity help.',
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** One-line description of the current settings, used when the panel is collapsed. */
export function settingsSummary(s: PracticeSettings): string {
  const parts = [cap(s.difficulty), s.mode === 'guided' ? 'Guided' : 'Assessment'];
  if (s.format !== 'any') parts.push(s.format === 'cash' ? 'Cash' : 'Tournament');
  if (s.tableSize !== 'any') parts.push(s.tableSize === 2 ? 'Heads-up' : s.tableSize === 6 ? '6-max' : 'Full ring');
  if (s.stack !== 'any') parts.push(STACK_BANDS[s.stack].label.split(' (')[0]);
  if (s.heroPosition !== 'any') parts.push(s.heroPosition);
  if (s.street !== 'any') parts.push(s.street === 'full' ? 'Full hand' : cap(s.street));
  if (s.players !== 'any') parts.push(s.players === 'multiway' ? 'Multiway' : 'Heads-up pot');
  if (s.potType !== 'any') parts.push(s.potType.toUpperCase());
  if (s.opponent !== 'random') parts.push(PROFILE_LIST.find((p) => p.id === s.opponent)?.short ?? '');
  if (s.concepts.length) parts.push(`${s.concepts.length} concept${s.concepts.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

export function SettingsPanel({ settings, onChange }: { settings: PracticeSettings; onChange: (s: PracticeSettings) => void }) {
  const m = useMemo(() => matchingTemplates(settings), [settings]);
  const set = <K extends keyof PracticeSettings>(k: K, v: PracticeSettings[K]) => onChange({ ...settings, [k]: v });
  const positions = ['any', 'UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const usedConcepts = new Set(TEMPLATES.flatMap((t) => t.concepts));
  const toggleConcept = (c: ConceptId) => set('concepts', settings.concepts.includes(c) ? settings.concepts.filter((x) => x !== c) : [...settings.concepts, c]);
  const advancedCount =
    [settings.tableSize, settings.stack, settings.heroPosition, settings.street, settings.players, settings.potType].filter((v) => v !== 'any').length +
    (settings.opponent !== 'random' ? 1 : 0) +
    settings.concepts.length;
  const reset = () => onChange({ ...settings, tableSize: 'any', stack: 'any', heroPosition: 'any', street: 'any', players: 'any', potType: 'any', opponent: 'random', concepts: [] });
  return (
    <div className="settings">
      <div className="settings-quick">
        <div className="field">
          <span className="field-label">Difficulty</span>
          <div className="seg" role="radiogroup" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button key={d} role="radio" aria-checked={settings.difficulty === d} className={settings.difficulty === d ? 'on' : ''} onClick={() => set('difficulty', d)}>
                {cap(d)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Mode</span>
          <div className="seg" role="radiogroup" aria-label="Mode">
            {(['assessment', 'guided'] as const).map((md) => (
              <button key={md} role="radio" aria-checked={settings.mode === md} className={settings.mode === md ? 'on' : ''} onClick={() => set('mode', md)}>
                {md === 'guided' ? 'Guided' : 'Assessment'}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Game format</span>
          <select value={settings.format} onChange={(e) => set('format', e.target.value as PracticeSettings['format'])}>
            <option value="any">Any</option>
            <option value="cash">Cash game</option>
            <option value="tournament">Tournament</option>
          </select>
        </label>
      </div>
      <p className="note settings-help">
        {DIFF_HELP[settings.difficulty]}{' '}
        {settings.mode === 'guided' ? 'Guided: optional help during the hand; assisted decisions are tracked separately.' : 'Assessment: no help during the hand; feedback comes afterwards.'}
      </p>
      {settings.mode === 'guided' && (
        <div className="checks">
          {(
            [
              ['hints', 'Hints'],
              ['potOdds', 'Pot odds'],
              ['equity', 'Equity help'],
              ['immediateFeedback', 'Feedback after each decision'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={settings.assists[k]} onChange={(e) => set('assists', { ...settings.assists, [k]: e.target.checked })} /> {label}
            </label>
          ))}
        </div>
      )}
      <details className="more" open={advancedCount > 0 || undefined}>
        <summary>
          More options{advancedCount > 0 ? <span className="count">{advancedCount}</span> : null}
        </summary>
        <div className="grid3">
          <label className="field">
            <span className="field-label">Table size</span>
            <select value={String(settings.tableSize)} onChange={(e) => set('tableSize', e.target.value === 'any' ? 'any' : (Number(e.target.value) as 2 | 6 | 9))}>
              <option value="any">Any</option>
              <option value="2">Heads-up</option>
              <option value="6">Six-handed</option>
              <option value="9">Full ring (9)</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Effective stack</span>
            <select value={settings.stack} onChange={(e) => set('stack', e.target.value as StackBand | 'any')}>
              <option value="any">Any</option>
              {(Object.keys(STACK_BANDS) as StackBand[]).map((k) => (
                <option key={k} value={k}>
                  {STACK_BANDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Your position</span>
            <select value={settings.heroPosition} onChange={(e) => set('heroPosition', e.target.value)}>
              {positions.map((p) => (
                <option key={p} value={p}>
                  {p === 'any' ? 'Any' : p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Starting street</span>
            <select value={settings.street} onChange={(e) => set('street', e.target.value as PracticeSettings['street'])}>
              <option value="any">Any</option>
              <option value="preflop">Preflop</option>
              <option value="flop">Flop</option>
              <option value="turn">Turn</option>
              <option value="river">River</option>
              <option value="full">Complete hand</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Players in the pot</span>
            <select value={settings.players} onChange={(e) => set('players', e.target.value as PracticeSettings['players'])}>
              <option value="any">Any</option>
              <option value="headsup">Heads-up</option>
              <option value="multiway">Multiway</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Pot type</span>
            <select value={settings.potType} onChange={(e) => set('potType', e.target.value as PracticeSettings['potType'])}>
              <option value="any">Any</option>
              <option value="limped">Limped</option>
              <option value="srp">Single-raised</option>
              <option value="3bp">3-bet pot</option>
              <option value="4bp">4-bet pot</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Opponents</span>
            <select value={settings.opponent} onChange={(e) => set('opponent', e.target.value as PracticeSettings['opponent'])}>
              <option value="random">Mixed</option>
              {PROFILE_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <span className="field-label">Concepts {settings.concepts.length ? `(${settings.concepts.length} selected)` : '(any)'}</span>
          <div className="chips">
            {CONCEPT_IDS.filter((c) => usedConcepts.has(c)).map((c) => (
              <button key={c} className={`chip ${settings.concepts.includes(c) ? 'on' : ''}`} aria-pressed={settings.concepts.includes(c)} onClick={() => toggleConcept(c)}>
                {CONCEPTS[c].name}
              </button>
            ))}
          </div>
        </div>
        {advancedCount > 0 && (
          <button className="linklike" onClick={reset}>
            Reset options
          </button>
        )}
      </details>
      <div className={`match ${m.templates.length ? 'ok' : 'bad'}`} role="status">
        {m.templates.length ? (
          <>
            <span className="dot" aria-hidden="true" /> {m.templates.length} scenario type{m.templates.length === 1 ? '' : 's'} available
          </>
        ) : (
          <>
            <strong>Unsupported combination.</strong> {m.reasons.join(' ')} Try widening a setting.
          </>
        )}
      </div>
    </div>
  );
}
