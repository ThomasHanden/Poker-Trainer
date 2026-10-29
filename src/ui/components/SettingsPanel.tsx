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
  expert: 'Thin, mixed spots; opponent tendencies hidden (shown as Unknown) unless you choose one.',
};

export function SettingsPanel({ settings, onChange }: { settings: PracticeSettings; onChange: (s: PracticeSettings) => void }) {
  const m = useMemo(() => matchingTemplates(settings), [settings]);
  const set = <K extends keyof PracticeSettings>(k: K, v: PracticeSettings[K]) => onChange({ ...settings, [k]: v });
  const positions = ['any', 'UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const usedConcepts = new Set(TEMPLATES.flatMap((t) => t.concepts));
  const toggleConcept = (c: ConceptId) => set('concepts', settings.concepts.includes(c) ? settings.concepts.filter((x) => x !== c) : [...settings.concepts, c]);
  return (
    <div className="settings">
      <fieldset>
        <legend>Difficulty</legend>
        <div className="seg" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button key={d} role="radio" aria-checked={settings.difficulty === d} className={settings.difficulty === d ? 'on' : ''} onClick={() => set('difficulty', d)}>
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <p className="note">{DIFF_HELP[settings.difficulty]}</p>
      </fieldset>
      <fieldset>
        <legend>Mode</legend>
        <div className="seg" role="radiogroup" aria-label="Mode">
          {(['assessment', 'guided'] as const).map((md) => (
            <button key={md} role="radio" aria-checked={settings.mode === md} className={settings.mode === md ? 'on' : ''} onClick={() => set('mode', md)}>
              {md === 'guided' ? 'Guided practice' : 'Assessment'}
            </button>
          ))}
        </div>
        <p className="note">
          {settings.mode === 'guided'
            ? 'Optional hints, pot odds and equity help during the hand. Assisted decisions are tracked separately in your progress.'
            : 'No strategic help during the hand. Feedback and scoring come after the hand, using only what you knew when you acted.'}
        </p>
        {settings.mode === 'guided' && (
          <div className="checks">
            {(
              [
                ['hints', 'Hints'],
                ['potOdds', 'Pot odds'],
                ['equity', 'Equity vs modelled range'],
                ['immediateFeedback', 'Immediate feedback after each decision'],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" checked={settings.assists[k]} onChange={(e) => set('assists', { ...settings.assists, [k]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="grid2">
        <label>
          Game format
          <select value={settings.format} onChange={(e) => set('format', e.target.value as PracticeSettings['format'])}>
            <option value="any">Any</option>
            <option value="cash">Cash game</option>
            <option value="tournament">Tournament</option>
          </select>
        </label>
        <label>
          Table size
          <select value={String(settings.tableSize)} onChange={(e) => set('tableSize', e.target.value === 'any' ? 'any' : (Number(e.target.value) as 2 | 6 | 9))}>
            <option value="any">Any</option>
            <option value="2">Heads-up</option>
            <option value="6">Six-handed</option>
            <option value="9">Full ring (9)</option>
          </select>
        </label>
        <label>
          Effective stack
          <select value={settings.stack} onChange={(e) => set('stack', e.target.value as StackBand | 'any')}>
            <option value="any">Any</option>
            {(Object.keys(STACK_BANDS) as StackBand[]).map((k) => (
              <option key={k} value={k}>
                {STACK_BANDS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your position
          <select value={settings.heroPosition} onChange={(e) => set('heroPosition', e.target.value)}>
            {positions.map((p) => (
              <option key={p} value={p}>
                {p === 'any' ? 'Any' : p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starting street
          <select value={settings.street} onChange={(e) => set('street', e.target.value as PracticeSettings['street'])}>
            <option value="any">Any</option>
            <option value="preflop">Preflop decision</option>
            <option value="flop">Flop decision</option>
            <option value="turn">Turn decision</option>
            <option value="river">River decision</option>
            <option value="full">Complete hand from preflop</option>
          </select>
        </label>
        <label>
          Players in the pot
          <select value={settings.players} onChange={(e) => set('players', e.target.value as PracticeSettings['players'])}>
            <option value="any">Any</option>
            <option value="headsup">Heads-up pot</option>
            <option value="multiway">Multiway pot</option>
          </select>
        </label>
        <label>
          Pot type
          <select value={settings.potType} onChange={(e) => set('potType', e.target.value as PracticeSettings['potType'])}>
            <option value="any">Any</option>
            <option value="limped">Limped</option>
            <option value="srp">Single-raised</option>
            <option value="3bp">3-bet pot</option>
            <option value="4bp">4-bet pot</option>
          </select>
        </label>
        <label>
          Opponents
          <select value={settings.opponent} onChange={(e) => set('opponent', e.target.value as PracticeSettings['opponent'])}>
            <option value="random">Mixed (varies with difficulty)</option>
            {PROFILE_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Concepts to practice {settings.concepts.length ? `(${settings.concepts.length})` : '(any)'}</legend>
        <div className="chips">
          {CONCEPT_IDS.filter((c) => usedConcepts.has(c)).map((c) => (
            <button key={c} className={`chip ${settings.concepts.includes(c) ? 'on' : ''}`} aria-pressed={settings.concepts.includes(c)} onClick={() => toggleConcept(c)}>
              {CONCEPTS[c].name}
            </button>
          ))}
        </div>
      </fieldset>
      <div className={`match ${m.templates.length ? 'ok' : 'bad'}`} role="status">
        {m.templates.length ? (
          <>
            {m.templates.length} scenario type{m.templates.length === 1 ? '' : 's'} match these settings: {m.templates.slice(0, 6).map((t) => t.title).join(' · ')}
            {m.templates.length > 6 ? ' …' : ''}
          </>
        ) : (
          <>
            <strong>Unsupported combination.</strong> {m.reasons.join(' ')} Try widening a setting; see the Coverage page for what is supported.
          </>
        )}
      </div>
    </div>
  );
}
