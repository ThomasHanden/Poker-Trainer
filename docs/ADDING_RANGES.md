# Adding a preset range chart

Charts are in `src/ranges/presets.ts`, built with `chart({...})`: `id`, `name`, `group` (open/defend/vs3bet/vs4bet/squeeze/iso/pushfold/call-shove), `format`, `tableSize`, `position`, `vsPosition`, `stackBB`, `priorAction`, `sizing`, `assumptions[]` (format, table size, stack depth, rake/ante, prior action, opponent assumption), `confidence` (`illustrative` unless produced by a documented computation), `raise` and `call` range strings (call is clamped so raise + call ≤ 1).

If the opponent policy should use the chart, wire it in `src/opponents/policy.ts` (`defendChartFor` or the relevant branch). `tests/content.test.ts` validates assumptions and frequency sums. Computed charts (push/fold) come from `src/ranges/pushfold.ts`.
