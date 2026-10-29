# Poker Decision Trainer (No-Limit Hold’em)

A complete, local-first training web app that teaches better NLHE decisions through fresh practice scenarios, honest post-hand reviews, a theory library, a range explorer and progress tracking. No account, no paid API, no levels or unlocks.

## Run it

Requirements: Node 18+ (developed on Node 22).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/ (static files; works from any static host, uses hash routing)
npm run preview    # serve the production build on http://localhost:4173
```

Tests:

```bash
npm test                       # unit/integration tests (Vitest)
npx playwright install chromium   # once, if you have no Playwright browser
npm run test:e2e               # end-to-end flows on desktop + mobile viewports (Playwright)
# In sandboxes with a pre-installed Chromium: PW_CHROMIUM=/path/to/chrome npm run test:e2e
npm run gen:equity -- 4000     # regenerate the preflop equity table (≈5 min)
```

## What’s inside

| Area | Highlights |
|---|---|
| **Practice** | 37 validated scenario templates (13 cash preflop, 5 tournament/short-stack, 9 flop, 5 turn, 5 river). Settings: difficulty (beginner→expert), cash/tournament, heads-up/6-max/full ring, stack band, hero position, starting street or complete hand, heads-up/multiway, pot type, opponent profile, concepts, guided vs assessment. Unsupported combinations are explained instead of generated. Fresh scenarios avoid recent fingerprints and templates. |
| **Table** | Hole/board cards (optional four-colour deck), button, positions, stacks, effective stack, blinds/antes, pot and per-street bets, amount to call, action history. Fold/check/call/bet/raise/all-in only when legal; pot-% presets (25–150%), min, all-in and custom “raise to” with live “raise by” and validation (min-raise, stack limit, short all-in). Keyboard shortcuts (`?`). |
| **Opponents** | One probabilistic policy (6 profiles) that sees only public info + its own cards; hidden cards are sampled from the range implied by the scripted action (Bayesian, with card removal). Expert mode hides profiles. |
| **Review** | Score (or “insufficient confidence”), street-by-street replay, each decision answering 7 questions (info, plausible ranges with computed composition, position/texture/SPR, intent with fold/call breakdown, alternatives with ratings + simulated EV ± error, why, how tendencies change it — including re-simulation vs other profiles), sizing verdicts, sources & confidence, takeaway, correct plays, mistakes, lesson links, retry/related, bookmark. |
| **Learn** | 81 lessons in 9 sections covering the full requested curriculum, each with explanation, why it matters, worked example, mistakes, math, assumptions, knowledge check and practice link. Search, levels, optional study sequences, completion tracking. |
| **Ranges** | 13×13 matrix: presets with stated assumptions (illustrative charts + computed push/fold), weighted painting, card removal, combo counts/percentages, “why is this hand here?”, save/load, import/export text, compare A vs B, equity calculator (exact or simulated with SE), five drills (opening range, river continue, value/bluff sorting, blockers, board advantage) with computed answers. |
| **Progress** | Strengths/weaknesses by concept, street, position, difficulty (min-sample guard), trend chart with table view, suggested practice, assisted vs unassisted kept separate, export/import/reset. |
| **Coverage / Method** | In-app coverage map (implemented / approximate / unsupported) and a full description of evaluation sources and limitations. |

## Architecture

```
src/engine/       cards & seeded RNG, 5–7 card evaluator, NLHE rules/state machine, equity (exact + Monte Carlo), ICM, board analysis
src/ranges/       169-class model + range format, preset charts, precomputed preflop equity access, push/fold solver, range drills
src/opponents/    profiles, policy (shared by play and inference), Bayesian range inference
src/scenarios/    template types, 37 templates, generator/materializer (seeded, reproducible), play controller
src/evaluation/   decision context, rollouts (model EV), guidance builders, scoring/grades, explanations
src/content/      lessons (81), concepts, glossary, sources, coverage
src/persistence/  versioned localStorage, export/import/migrate
src/workers/      Web Worker for generation/evaluation/equity (main-thread fallback)
src/ui/           React UI (pages + components), HashRouter
scripts/          preflop equity table generator
tests/, e2e/      Vitest and Playwright suites
```

Docs: [RULES](docs/RULES.md) · [EVALUATION & limitations](docs/EVALUATION.md) · [RANGE_FORMAT](docs/RANGE_FORMAT.md) · [Adding scenarios](docs/ADDING_SCENARIOS.md) · [Adding lessons](docs/ADDING_LESSONS.md) · [Adding ranges](docs/ADDING_RANGES.md) · [COVERAGE](docs/COVERAGE.md) · [SOURCES](docs/SOURCES.md) · [CONTINUATION checklist](docs/CONTINUATION.md)

## Honesty statement

- No solver is integrated; nothing is labelled solver-approved. Preflop charts are **illustrative baselines** written for this app. The heads-up push/fold chart is **computed** in a stated simplified model.
- Exact results (pot odds, all-in EV given stated ranges, ICM for stated stacks/payouts, turn/river equity vs modelled ranges) are labelled *exact*; Monte Carlo results show sample counts and error bars; multi-street EVs are *model estimates*.
- Scores are instructional assessments and never depend on the hand’s outcome.
