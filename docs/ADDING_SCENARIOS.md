# Adding a scenario template

Templates live in `src/scenarios/templates/{preflop,tournament,postflop}.ts` and are registered in `templates/index.ts`. A template is a `ScenarioTemplate` (see `src/scenarios/types.ts`):

1. **Metadata**: `id` (stable), `version` (bump when behaviour changes — stored with results), `title`, `summary`, `objectives`, `street` (key decision), `category`, `concepts` (from `content/concepts.ts`), `lessons` (lesson ids), `formats`, `tableSizes`, `heroPositions`, `stackBB`, `potType`, `multiway`, `facing`, `difficulties`, `evaluation {method, assumptions}`, `setupText`, `hint`.
2. **`build(ctx)`** returns a `ScenarioScript` or `null` if the settings cannot be satisfied (use helpers `tableSizeFor`, `positionFor`, `stackFor` which honour user settings):
   - `config` (`cashConfig(n)` / `tourneyConfig(n)`), `stacksBB`, `heroPos`, `profiles` (by position; use `ctx.pickProfile()`),
   - `preflop` actions (`{pos, act, size}`; players not listed before the next actor fold automatically preflop),
   - optional `flop`/`turn`/`river` with `cards(newCards, prior)` constraints and explicit actions,
   - `hero.range` (prior range), `hero.filter` (hand must satisfy at the key decision), `hero.weight` (difficulty mix via `mixWeight`/`chartHeroSpec`).
   - Villain sizes should use `{kind:'policy'}` / `{kind:'policy-large'}` so the scripted action has the same size the policy would use (keeps range inference exact).
3. **`guide(ctx)`** returns `Guidance`: ratings per action key, reasons (mechanisms!), sizing bands (`unit`: pot / bb-to / x-raise), math rows with `kind` (exact/simulation/table/model), tendency notes, confidence and source. Reuse `chartGuidance`, `facingBetGuidance`, `bettingGuidance`, `betMechanics`, `rangeAdvantage`, `blockersForBet/FacingBet`.
4. Run `npm test`: `tests/scenarios.test.ts` automatically generates, plays to completion, evaluates and checks chip conservation for every template. Add the template to the coverage table automatically (it is generated from metadata).

The generator rejects a script if the scripted villain actions are impossible under the policy, so a template can never produce an inconsistent range.
