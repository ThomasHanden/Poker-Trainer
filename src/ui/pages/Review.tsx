import { Select } from '../components/Select';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { run } from '../../workers/client';
import { RebuildResult } from '../../workers/tasks';
import { ReviewView, GradeBadge } from '../components/ReviewView';
import { TEMPLATES } from '../../scenarios/templates';

export function ReviewListPage() {
  const { data, update } = useStore();
  const [filter, setFilter] = useState<'all' | 'bookmarked' | 'mistakes' | 'assisted' | 'unassisted'>('all');
  const [tpl, setTpl] = useState('any');
  const rows = useMemo(() => {
    let h = [...data.history].reverse();
    if (filter === 'bookmarked') h = h.filter((x) => x.bookmarked);
    if (filter === 'mistakes') h = h.filter((x) => x.decisions.some((d) => d.grade === 'mistake' || d.grade === 'blunder'));
    if (filter === 'assisted') h = h.filter((x) => x.assisted);
    if (filter === 'unassisted') h = h.filter((x) => !x.assisted);
    if (tpl !== 'any') h = h.filter((x) => x.templateId === tpl);
    return h;
  }, [data.history, filter, tpl]);
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Your hands</p>
        <h1>Review</h1>
        <p className="lead">Every hand you finish is saved here. Open one to replay it and read the review again.</p>
      </header>
      <div className="filters">
        <label>
          Show
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All hands</option>
            <option value="bookmarked">Saved hands</option>
            <option value="mistakes">With mistakes</option>
            <option value="unassisted">Unassisted only</option>
            <option value="assisted">Assisted only</option>
          </Select>
        </label>
        <label>
          Scenario type
          <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="any">Any</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p>No hands to show yet. <Link to="/practice">Play a scenario</Link> and it will appear here.</p>
        </div>
      ) : (
        <ul className="review-list">
          {rows.map((h) => {
            const key = h.decisions.find((d) => d.isKey);
            return (
              <li key={h.id}>
                <Link to={`/review/${h.id}`} className="review-row">
                  <span className="when">{new Date(h.createdAt).toLocaleString()}</span>
                  <span className="title">{h.title}</span>
                  <span className="meta">
                    {h.heroPosition} · {h.difficulty} · {h.format}
                  </span>
                  <span className="score-mini">{h.score ?? '—'}</span>
                  {key && <GradeBadge grade={key.grade} />}
                  {h.assisted && <span className="tag assisted">assisted</span>}
                </Link>
                <button
                  className="star"
                  aria-label={h.bookmarked ? 'Unsave hand' : 'Save hand'}
                  title={h.bookmarked ? 'Saved — click to unsave' : 'Save hand'}
                  aria-pressed={h.bookmarked}
                  onClick={() => update((d) => ({ ...d, history: d.history.map((x) => (x.id === h.id ? { ...x, bookmarked: !x.bookmarked } : x)) }))}
                >
                  {h.bookmarked ? '★' : '☆'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ReviewDetailPage() {
  const { id } = useParams();
  const { data, update } = useStore();
  const nav = useNavigate();
  const rec = data.history.find((h) => h.id === id);
  const [res, setRes] = useState<RebuildResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!rec) return;
    setLoading(true);
    run<RebuildResult>({ kind: 'rebuild', scenarioId: rec.scenarioId, settings: rec.settings, actions: rec.heroActions })
      .then(setRes)
      .catch((e) => setRes({ error: (e as Error).message }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.id]);
  if (!rec)
    return (
      <div className="page">
        <p>That hand is not in your history. <Link to="/review">Back to reviews</Link></p>
      </div>
    );
  return (
    <div className="page">
      <p>
        <Link to="/review">← All reviews</Link>
      </p>
      {loading && <div className="loading" role="status">Rebuilding the hand and its review…</div>}
      {res?.error && !res.scenario && <div className="error-box">{res.error}</div>}
      {res?.note && <div className="banner warn">{res.note}</div>}
      {rec.scoringVersion && res?.evaluation && res.evaluation.scoringVersion !== rec.scoringVersion && (
        <div className="banner warn">
          This hand was originally scored with scoring v{rec.scoringVersion} (score {rec.score ?? '—'}); it is shown here with the current v{res.evaluation.scoringVersion}.
        </div>
      )}
      {res?.scenario && res.evaluation && res.finalState && (
        <ReviewView
          scenario={res.scenario}
          finalState={res.finalState}
          evaluation={res.evaluation}
          bookmarked={rec.bookmarked}
          onBookmark={() => update((d) => ({ ...d, history: d.history.map((x) => (x.id === rec.id ? { ...x, bookmarked: !x.bookmarked } : x)) }))}
          onRetry={() => nav(`/practice?template=${res.scenario!.templateId}&seed=${res.scenario!.seed}`)}
          onRelated={() => nav(`/practice?template=${res.scenario!.templateId}`)}
        />
      )}
    </div>
  );
}
