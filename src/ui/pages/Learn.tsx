import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LESSONS, LESSON_INDEX, SECTIONS, SEQUENCES, lessonsInSection } from '../../content/lessons';
import { SOURCES } from '../../content/sources';
import { useStore } from '../store';
import { TEMPLATES } from '../../scenarios/templates';
import { CONCEPTS } from '../../content/concepts';

export function LearnPage() {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<'any' | 'beginner' | 'intermediate' | 'advanced'>('any');
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return LESSONS.filter((l) => (level === 'any' || l.level === level) && (!t || [l.title, l.summary, ...l.plain, ...l.mistakes].join(' ').toLowerCase().includes(t)));
  }, [q, level]);
  const done = (id: string) => data.lessons[id]?.completed;
  const searching = q.trim().length > 0 || level !== 'any';
  return (
    <div className="page learn">
      <header className="page-head">
        <p className="eyebrow">Library · {LESSONS.length} lessons</p>
        <h1>Learn the theory</h1>
        <p className="lead">Short lessons on one idea each, with worked examples, practice problems and a quiz. Start with a study track or pick any topic.</p>
      </header>
      <div className="filters">
        <label className="grow">
          Search
          <input type="search" placeholder="e.g. pot odds, ICM, blockers" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="any">Any</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
      </div>
      {searching ? (
        <section>
          <h2>
            {results.length} result{results.length === 1 ? '' : 's'}
          </h2>
          {results.length === 0 && <p className="empty">No lessons match. Try a broader term.</p>}
          <ul className="lesson-grid">
            {results.map((l) => (
              <LessonCard key={l.id} id={l.id} done={!!done(l.id)} />
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section>
            <h2>Study tracks</h2>
            <p className="note">Optional reading orders. Every lesson is open, so you can also pick any topic below.</p>
            <div className="sequences">
              {SEQUENCES.map((s) => {
                const n = s.lessons.filter(done).length;
                return (
                  <details key={s.id} className="sequence">
                    <summary>
                      <span className="seq-title">{s.title}</span>
                      <span className="seq-blurb">{s.blurb}</span>
                      <span className="seq-count">
                        {n} of {s.lessons.length}
                      </span>
                    </summary>
                    <ol className="link-list numbered">
                      {s.lessons.map((id, i) => (
                        <li key={id}>
                          <Link to={`/learn/${id}`} className={done(id) ? 'done' : ''}>
                            <span className="ll-num" aria-hidden="true">{done(id) ? '✓' : i + 1}</span>
                            <span className="ll-title">{LESSON_INDEX[id].title}</span>
                            {done(id) && <span className="sr-only"> (completed)</span>}
                            <span className="ll-chev" aria-hidden="true">›</span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </details>
                );
              })}
            </div>
          </section>
          {SECTIONS.map((s) => (
            <section key={s.id}>
              <h2>{s.title}</h2>
              <p className="note">{s.blurb}</p>
              <ul className="lesson-grid">
                {lessonsInSection(s.id).map((l) => (
                  <LessonCard key={l.id} id={l.id} done={!!done(l.id)} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function LessonCard({ id, done }: { id: string; done: boolean }) {
  const l = LESSON_INDEX[id];
  return (
    <li className="lesson-card">
      <Link to={`/learn/${id}`}>
        <strong>{l.title}</strong>
        <span>{l.summary}</span>
        <span className="meta">
          {l.level}
          {l.format !== 'both' ? ` · ${l.format}` : ''}
          {done ? ' · ✓ completed' : ''}
        </span>
      </Link>
    </li>
  );
}

export function LessonPage() {
  const { id } = useParams();
  const l = id ? LESSON_INDEX[id] : undefined;
  const { data, update } = useStore();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  if (!l)
    return (
      <div className="page">
        <p>Lesson not found. <Link to="/learn">Back to the library</Link></p>
      </div>
    );
  const prog = data.lessons[l.id];
  const correct = l.quiz.filter((q, i) => answers[i] === q.answer).length;
  const check = () => {
    setChecked(true);
    update((d) => {
      const old = d.lessons[l.id];
      const best = !old?.quizBest || correct / l.quiz.length > old.quizBest.correct / old.quizBest.total ? { correct, total: l.quiz.length, at: Date.now() } : old.quizBest;
      return { ...d, lessons: { ...d.lessons, [l.id]: { ...old, completed: old?.completed || correct === l.quiz.length, quizBest: best, visitedAt: Date.now() } } };
    });
  };
  const practiceHref = l.practice.templates?.length ? `/practice?template=${l.practice.templates[0]}` : l.practice.concepts?.length ? `/practice?concept=${l.practice.concepts[0]}` : '/practice?start=1';
  const section = SECTIONS.find((s) => s.id === l.section)!;
  const toc: [string, string][] = [
    ...(l.takeaways?.length ? [['s-takeaways', 'Takeaways'] as [string, string]] : []),
    ['s-idea', 'The idea'],
    ...(l.terms?.length ? [['s-terms', 'Key terms'] as [string, string]] : []),
    ...(l.deeper?.length ? [['s-deeper', 'Going deeper'] as [string, string]] : []),
    ['s-examples', (l.examples?.length ?? 0) > 0 ? 'Worked examples' : 'Example'],
    ...(l.apply?.length ? [['s-apply', 'Checklist'] as [string, string]] : []),
    ...(l.problems?.length ? [['s-problems', 'Try it yourself'] as [string, string]] : []),
    ['s-quiz', `Quiz (${l.quiz.length})`],
  ];
  const words = [...l.plain, ...(l.deeper ?? []).flatMap((d) => d.body), ...l.why, ...l.example.steps, ...(l.examples ?? []).flatMap((e) => e.steps), ...l.mistakes, ...(l.apply ?? []), ...(l.takeaways ?? []), ...(l.terms ?? []).map((t) => t.join(' ')), ...(l.problems ?? []).map((p) => `${p.q} ${p.a}`), ...l.quiz.map((q) => `${q.q} ${q.options.join(' ')} ${q.explain}`)].join(' ').split(/\s+/).length;
  return (
    <article className="page lesson">
      <p>
        <Link to="/learn">← Library</Link> · {section.title}
      </p>
      <h1>{l.title}</h1>
      <p className="lead">{l.summary}</p>
      <p className="note">
        Level: {l.level} · Applies to: {l.format === 'both' ? 'cash games and tournaments' : l.format === 'cash' ? 'cash games' : 'tournaments'} · about {Math.max(2, Math.round(words / 180))} min read
        {prog?.completed ? ' · ✓ completed' : ''}
      </p>
      <nav className="lesson-toc" aria-label="On this page">
        <span className="toc-l">On this page</span>
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            {label}
          </a>
        ))}
      </nav>
      {l.takeaways && l.takeaways.length > 0 && (
        <section className="takeaways" id="s-takeaways" aria-label="Key takeaways">
          <h2>Key takeaways</h2>
          <ul>
            {l.takeaways.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      <section id="s-idea">
        <h2>The idea</h2>
        {l.plain.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>
      {l.terms && l.terms.length > 0 && (
        <section className="terms" id="s-terms">
          <h2>Key terms</h2>
          <dl>
            {l.terms.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {l.deeper && l.deeper.length > 0 && (
        <section className="deeper" id="s-deeper">
          <h2>Going deeper</h2>
          {l.deeper.map((d) => (
            <div key={d.heading} className="deeper-part">
              <h3>{d.heading}</h3>
              {d.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ))}
        </section>
      )}
      <section>
        <h2>Why it matters</h2>
        <ul>
          {l.why.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </section>
      {[l.example, ...(l.examples ?? [])].map((ex, k) => (
        <section className="example" key={k} id={k === 0 ? 's-examples' : undefined}>
          <h2>
            {(l.examples?.length ?? 0) > 0 ? `Worked example ${k + 1}` : 'Example'}: {ex.title}
          </h2>
          <ol>
            {ex.steps.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </section>
      ))}
      {l.apply && l.apply.length > 0 && (
        <section className="apply" id="s-apply">
          <h2>At the table: a checklist</h2>
          <ol className="checklist">
            {l.apply.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </section>
      )}
      <section>
        <h2>Common mistakes</h2>
        <ul>
          {l.mistakes.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </section>
      {l.math && (
        <section className="mathbox">
          <h2>The math</h2>
          {l.math.formulas && (
            <ul className="formulas">
              {l.math.formulas.map((f, i) => (
                <li key={i}>
                  <code>{f}</code>
                </li>
              ))}
            </ul>
          )}
          {l.math.notes.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}
      <section>
        <h2>Assumptions and exceptions</h2>
        <ul>
          {l.assumptions.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </section>
      {l.problems && l.problems.length > 0 && (
        <section className="problems" id="s-problems">
          <h2>Try it yourself</h2>
          <p className="note">Work each one out, then open the answer.</p>
          <ol>
            {l.problems.map((p, i) => (
              <li key={i}>
                <p className="prob-q">{p.q}</p>
                <details>
                  <summary>Show answer</summary>
                  <p>{p.a}</p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="quiz" id="s-quiz">
        <h2>Knowledge check</h2>
        {l.quiz.map((q, i) => (
          <fieldset key={i} className="quiz-q">
            <legend>
              {i + 1}. {q.q}
            </legend>
            {q.options.map((o, j) => {
              const state = checked ? (j === q.answer ? 'right' : answers[i] === j ? 'wrong' : '') : '';
              return (
                <label key={j} className={`opt ${state}`}>
                  <input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers((a) => ({ ...a, [i]: j }))} disabled={checked} /> {o}
                </label>
              );
            })}
            {checked && <p className={answers[i] === q.answer ? 'right' : 'wrong'}>{answers[i] === q.answer ? 'Correct. ' : 'Not quite. '}{q.explain}</p>}
          </fieldset>
        ))}
        {!checked ? (
          <button className="btn primary" onClick={check} disabled={Object.keys(answers).length < l.quiz.length}>
            Check answers
          </button>
        ) : (
          <p>
            You got {correct} of {l.quiz.length}.{' '}
            <button
              className="btn"
              onClick={() => {
                setChecked(false);
                setAnswers({});
              }}
            >
              Try again
            </button>
          </p>
        )}
        {!prog?.completed && (
          <button className="btn ghost" onClick={() => update((d) => ({ ...d, lessons: { ...d.lessons, [l.id]: { ...d.lessons[l.id], completed: true, visitedAt: Date.now() } } }))}>
            Mark as completed
          </button>
        )}
      </section>
      <section className="practice-link">
        <h2>Practice it</h2>
        <Link className="btn primary big" to={practiceHref} data-testid="practice-related">
          {l.practice.label}
        </Link>
        {l.practice.templates && l.practice.templates.length > 1 && (
          <p className="note">
            Also:{' '}
            {l.practice.templates.slice(1).map((t, i) => (
              <span key={t}>
                {i > 0 && ' · '}
                <Link to={`/practice?template=${t}`}>{TEMPLATES.find((x) => x.id === t)?.title}</Link>
              </span>
            ))}
          </p>
        )}
        {l.practice.concepts && l.practice.concepts.length > 0 && <p className="note">Concepts: {l.practice.concepts.map((c) => CONCEPTS[c].name).join(', ')}</p>}
      </section>
      <section>
        <h2>Related lessons</h2>
        <ul className="link-list">
          {l.related.map((r) => (
            <li key={r}>
              <Link to={`/learn/${r}`}>
                <span className="ll-title">
                  {LESSON_INDEX[r].title}
                  <span className="ll-sub">{LESSON_INDEX[r].summary}</span>
                </span>
                <span className="ll-chev" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="sources">
        <h2>Sources</h2>
        <ul>
          {l.sources.map((s) => {
            const src = SOURCES[s];
            return (
              <li key={s}>
                {src.url ? <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a> : src.title}
                {src.author ? ` — ${src.author}` : ''}
                {src.year ? ` (${src.year})` : ''}. <span className="note">{src.usedFor}</span>
              </li>
            );
          })}
        </ul>
        <p className="note">Explanations are original. Sources are cited for the concepts they are known for.</p>
      </section>
    </article>
  );
}
