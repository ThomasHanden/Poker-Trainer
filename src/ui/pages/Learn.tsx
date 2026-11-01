import { Select } from '../components/Select';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LESSONS, LESSON_INDEX, SECTIONS, SEQUENCES, lessonsInSection } from '../../content/lessons';
import { SOURCES } from '../../content/sources';
import { useStore } from '../store';
import { TEMPLATES } from '../../scenarios/templates';
import { CONCEPTS } from '../../content/concepts';
import { track } from '../analytics';

export function LearnPage() {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<'any' | 'beginner' | 'intermediate' | 'advanced'>('any');
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return LESSONS.filter((l) => (level === 'any' || l.level === level) && (!t || [l.title, l.summary, ...l.plain, ...l.mistakes].join(' ').toLowerCase().includes(t)));
  }, [q, level]);
  const done = (id: string) => !!data.lessons[id]?.completed;
  const searching = q.trim().length > 0 || level !== 'any';
  const doneCount = LESSONS.filter((l) => done(l.id)).length;
  // the next lesson: the first unread one in the first track you have started (else the first track)
  const next = useMemo(() => {
    const started = SEQUENCES.find((s) => s.lessons.some(done) && s.lessons.some((id) => !done(id))) ?? SEQUENCES.find((s) => s.lessons.some((id) => !done(id)));
    const id = started?.lessons.find((x) => !done(x));
    return started && id ? { track: started, id, n: started.lessons.filter(done).length } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.lessons]);
  return (
    <div className="page learn">
      <header className="learn-head">
        <div>
          <h1>Learn</h1>
          <p className="lead">
            {LESSONS.length} short lessons, one idea each{doneCount ? ` · ${doneCount} done` : ''}.
          </p>
        </div>
        <div className="learn-filters">
          <label className="sr-only" htmlFor="learn-q">
            Search lessons
          </label>
          <input id="learn-q" type="search" placeholder="Search: pot odds, ICM, blockers…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="sr-only" htmlFor="learn-level">
            Level
          </label>
          <Select id="learn-level" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="any">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </div>
      </header>
      {searching ? (
        <section className="learn-results">
          <h2>
            {results.length} result{results.length === 1 ? '' : 's'}
          </h2>
          {results.length === 0 ? (
            <p className="empty">No lessons match. Try a broader term.</p>
          ) : (
            <ul className="lesson-rows">
              {results.map((l) => (
                <LessonRow key={l.id} id={l.id} done={done(l.id)} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {next && (
            <Link className="learn-next" to={`/learn/${next.id}`}>
              <span className="learn-next-label">{next.n ? `Continue ${next.track.title}` : `Start with ${next.track.title}`}</span>
              <strong>{LESSON_INDEX[next.id].title}</strong>
              <span className="learn-next-go" aria-hidden="true">
                →
              </span>
            </Link>
          )}
          <section aria-labelledby="tracks-title">
            <h2 id="tracks-title" className="learn-sub">
              Study tracks
            </h2>
            <div className="tracks">
              {SEQUENCES.map((s) => {
                const n = s.lessons.filter(done).length;
                return (
                  <details key={s.id} className="track">
                    <summary>
                      <span className="track-title">{s.title}</span>
                      <span className="track-blurb">{s.blurb}</span>
                      <span className="track-progress" aria-label={`${n} of ${s.lessons.length} done`}>
                        <span style={{ width: `${(100 * n) / s.lessons.length}%` }} />
                      </span>
                      <span className="track-count">
                        {n}/{s.lessons.length}
                      </span>
                    </summary>
                    <ol className="link-list numbered">
                      {s.lessons.map((id, i) => (
                        <li key={id}>
                          <Link to={`/learn/${id}`} className={done(id) ? 'done' : ''}>
                            <span className="ll-num" aria-hidden="true">
                              {done(id) ? '✓' : i + 1}
                            </span>
                            <span className="ll-title">{LESSON_INDEX[id].title}</span>
                            {done(id) && <span className="sr-only"> (completed)</span>}
                            <span className="ll-chev" aria-hidden="true">
                              ›
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </details>
                );
              })}
            </div>
          </section>
          <section aria-labelledby="topics-title">
            <h2 id="topics-title" className="learn-sub">
              All topics
            </h2>
            <div className="topics">
              {SECTIONS.map((s) => {
                const ls = lessonsInSection(s.id);
                const n = ls.filter((l) => done(l.id)).length;
                return (
                  <details key={s.id} className="topic">
                    <summary>
                      <span className="topic-title">{s.title}</span>
                      <span className="topic-blurb">{s.blurb}</span>
                      <span className="topic-count">{n ? `${n}/${ls.length} done` : `${ls.length} lessons`}</span>
                    </summary>
                    <ul className="lesson-rows">
                      {ls.map((l) => (
                        <LessonRow key={l.id} id={l.id} done={done(l.id)} />
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** One lesson in a list: its title and a line about it, its level, and a tick when done. */
function LessonRow({ id, done }: { id: string; done: boolean }) {
  const l = LESSON_INDEX[id];
  return (
    <li className={`lesson-row ${done ? 'done' : ''}`}>
      <Link to={`/learn/${id}`}>
        <span className="lrow-main">
          <span className="lrow-title">
            {done && (
              <span className="lrow-mark" aria-hidden="true">
                ✓{' '}
              </span>
            )}
            {l.title}
          </span>
          <span className="lrow-sum">{l.summary}</span>
        </span>
        <span className={`lrow-level lv-${l.level}`}>
          {l.level}
          {l.format !== 'both' ? ` · ${l.format}` : ''}
        </span>
        {done && <span className="sr-only">(completed)</span>}
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
        <h1>Lesson not found</h1>
        <p>
          There is no lesson at this address. <Link to="/learn">Back to the library</Link>
        </p>
      </div>
    );
  const prog = data.lessons[l.id];
  const correct = l.quiz.filter((q, i) => answers[i] === q.answer).length;
  const check = () => {
    setChecked(true);
    if (!prog?.completed && correct === l.quiz.length) track('Lesson Completed', { via: 'quiz' });
    update((d) => {
      const old = d.lessons[l.id];
      const best = !old?.quizBest || correct / l.quiz.length > old.quizBest.correct / old.quizBest.total ? { correct, total: l.quiz.length, at: Date.now() } : old.quizBest;
      return { ...d, lessons: { ...d.lessons, [l.id]: { ...old, completed: old?.completed || correct === l.quiz.length, quizBest: best, visitedAt: Date.now() } } };
    });
  };
  const practiceHref =
    (l.practice.templates?.length ? `/practice?template=${l.practice.templates[0]}` : l.practice.concepts?.length ? `/practice?concept=${l.practice.concepts[0]}` : '/practice?start=1') +
    (l.practice.mode ? `&mode=${l.practice.mode}` : '') +
    '&from=lesson';
  const section = SECTIONS.find((s) => s.id === l.section)!;
  // the study track this lesson is part of (one you have been working through, if it is in several), and what comes next in it
  const tracks = SEQUENCES.filter((s) => s.lessons.includes(l.id));
  const seq = tracks.find((s) => s.lessons.some((id) => data.lessons[id]?.completed)) ?? tracks[0];
  const nextInTrack = seq ? seq.lessons[seq.lessons.indexOf(l.id) + 1] : undefined;
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
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(id);
              // a section folded away opens when you jump to it
              if (el instanceof HTMLDetailsElement) el.open = true;
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
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
      <section className="why-matters">
        <h2>Why it matters</h2>
        <ul>
          {l.why.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </section>
      {l.deeper && l.deeper.length > 0 && (
        <details className="lesson-more deeper" id="s-deeper">
          <summary>
            <h2>Going deeper</h2>
            <span className="note">{l.deeper.map((d) => d.heading).join(' · ')}</span>
          </summary>
          {l.deeper.map((d) => (
            <div key={d.heading} className="deeper-part">
              <h3>{d.heading}</h3>
              {d.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ))}
        </details>
      )}
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
        <details className="lesson-more mathbox">
          <summary>
            <h2>The math</h2>
          </summary>
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
        </details>
      )}
      <details className="lesson-more">
        <summary>
          <h2>Assumptions and exceptions</h2>
        </summary>
        <ul>
          {l.assumptions.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </details>
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
          <button
            className="btn ghost"
            onClick={() => {
              track('Lesson Completed', { via: 'marked' });
              update((d) => ({ ...d, lessons: { ...d.lessons, [l.id]: { ...d.lessons[l.id], completed: true, visitedAt: Date.now() } } }));
            }}
          >
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
                <Link to={`/practice?template=${t}&from=lesson`}>{TEMPLATES.find((x) => x.id === t)?.title}</Link>
              </span>
            ))}
          </p>
        )}
        {l.practice.concepts && l.practice.concepts.length > 0 && <p className="note">Concepts: {l.practice.concepts.map((c) => CONCEPTS[c].name).join(', ')}</p>}
      </section>
      {seq && (
        <section className="track-next" data-testid="track-next">
          <h2>{nextInTrack ? `Next in ${seq.title}` : `That was the last lesson in ${seq.title}`}</h2>
          {nextInTrack ? (
            <Link className="btn" to={`/learn/${nextInTrack}`}>
              {LESSON_INDEX[nextInTrack].title} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <Link to="/learn">Choose another study track</Link>
          )}
        </section>
      )}
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
      <details className="lesson-more sources">
        <summary>
          <h2>Sources</h2>
        </summary>
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
      </details>
    </article>
  );
}
