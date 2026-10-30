# Adding a preset range chart

Charts are in `src/ranges/presets.ts`, built with `chart({...})`: `id`, `name`, `group` (open/defend/vs3bet/vs4bet/squeeze/iso/pushfold/call-shove), `format`, `tableSize`, `position`, `vsPosition`, `stackBB`, `priorAction`, `sizing`, `assumptions[]` (format, table size, stack depth, rake/ante, prior action, opponent assumption), `confidence` (`illustrative` unless produced by a documented computation), `raise` and `call` range strings (call is clamped so raise + call ≤ 1).

Optional fields:
- `short` — the label shown on the chart picker (e.g. “BTN vs BB 3-bet”).
- `callWhy` — when and why flat-calling is used in this spot; shown as “When to just call” on charts that have a call range.
- `reach` + `reachLabel` — for spots only some hands can get to (facing a 3-bet: your opening range; facing a 4-bet: your 3-bet range). Frequencies are then per hand *given* you hold it in the spot; hands outside `reach` show as “not in range”, and the stats are measured against the reaching hands. `tests/ranges-tab.test.ts` checks that a chart only plays hands inside its `reach`.

Facing-a-raise charts for 6-max use `defend(pos, vs, raise, call, …)`, which builds the id `cash6-<pos>-vs-<vs>`; the opponent model (`defendChartFor`) looks charts up by that id.

If the opponent policy should use the chart, wire it in `src/opponents/policy.ts` (`defendChartFor` or the relevant branch). `tests/content.test.ts` validates assumptions and frequency sums. Computed charts (push/fold) come from `src/ranges/pushfold.ts`.
