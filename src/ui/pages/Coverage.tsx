import { TEMPLATES } from '../../scenarios/templates';
import { FEATURE_COVERAGE } from '../../content/coverage';
import { SECTIONS, lessonsInSection } from '../../content/lessons';
import { PROFILE_LIST } from '../../opponents/profiles';
import { CONCEPTS } from '../../content/concepts';
import { Link } from 'react-router-dom';

export function CoveragePage() {
  return (
    <div className="page coverage">
      <h1>Coverage map</h1>
      <p className="lead">What the app implements, what is approximate, and what is not supported. The app does not cover every possible poker situation, and its recommendations are not solver-verified.</p>
      <section>
        <h2>Features</h2>
        <div className="table-scroll">
          <table className="cov">
            <thead>
              <tr>
                <th>Area</th>
                <th>Item</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_COVERAGE.map((f, i) => (
                <tr key={i}>
                  <td>{f.area}</td>
                  <td>{f.item}</td>
                  <td>
                    <span className={`status s-${f.status}`}>{f.status}</span>
                  </td>
                  <td>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Scenario templates ({TEMPLATES.length})</h2>
        <div className="table-scroll">
          <table className="cov">
            <thead>
              <tr>
                <th>Template</th>
                <th>Street</th>
                <th>Format</th>
                <th>Seats</th>
                <th>Hero</th>
                <th>Stacks (bb)</th>
                <th>Pot</th>
                <th>Facing</th>
                <th>Difficulty</th>
                <th>Evaluation</th>
                <th>Concepts</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATES.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/practice?template=${t.id}`}>{t.title}</Link>
                    <div className="note">
                      {t.id} v{t.version}
                    </div>
                  </td>
                  <td>{t.street}</td>
                  <td>{t.formats.join(', ')}</td>
                  <td>{t.tableSizes.join(', ')}</td>
                  <td>{t.heroPositions.join(', ')}</td>
                  <td>{t.stackBB.join(', ')}</td>
                  <td>
                    {t.potType}
                    {t.multiway ? ', multiway' : ''}
                  </td>
                  <td>{t.facing}</td>
                  <td>{t.difficulties.map((d) => d[0].toUpperCase()).join('')}</td>
                  <td>{t.evaluation.method}</td>
                  <td>{t.concepts.map((c) => CONCEPTS[c].name).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Difficulty letters: B, I, A, E. Settings combinations outside these rows are reported as unsupported instead of generating misleading scenarios.</p>
      </section>
      <section>
        <h2>Curriculum</h2>
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <strong>{s.title}</strong> — {lessonsInSection(s.id).length} lessons (all implemented): {lessonsInSection(s.id).map((l) => l.title).join(' · ')}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Opponent profiles</h2>
        <div className="table-scroll">
          <table className="cov">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Description</th>
                <th>Looseness</th>
                <th>Aggression</th>
                <th>Call shift</th>
                <th>Bluff</th>
                <th>C-bet</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_LIST.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.description}</td>
                  <td>{p.looseness}</td>
                  <td>{p.aggression}</td>
                  <td>{p.callShift}</td>
                  <td>{p.bluff}</td>
                  <td>{p.cbet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
