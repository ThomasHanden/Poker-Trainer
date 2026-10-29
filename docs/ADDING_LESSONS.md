# Adding a lesson

Add a `Lesson` object (see `src/content/lessons/types.ts`) to the section file in `src/content/lessons/`. Required: `id`, `section`, `title`, `summary`, `level`, `format`, `plain[]`, `why[]`, `example {title, steps[]}`, `mistakes[]`, optional `math {formulas[], notes[]}`, `assumptions[]`, `quiz[]` (answer = option index, with explanation), `practice {label, templates?, concepts?}`, `related[]` (lesson ids), `sources[]` (ids from `src/content/sources.ts`).

Write original explanations; state assumptions and avoid universal rules from simplified models. `tests/content.test.ts` checks every field, quiz indices, and that every referenced lesson/template/concept/source exists. Optional study sequences are in `lessons/index.ts`.
