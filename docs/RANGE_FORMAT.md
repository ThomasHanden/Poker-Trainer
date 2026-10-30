# Range text format

Tokens separated by commas (or newlines/semicolons). Optional weight suffix `:w` with `w` in [0,1] or a percentage (`:50%`). Tokens apply in order, so later tokens override earlier ones (for single combos too).

| Token | Meaning |
|---|---|
| `AA`, `AKs`, `AKo` | single class |
| `AK` | both AKs and AKo |
| `22+` | all pairs 22 and up |
| `A2s+` / `KTo+` | kicker runs up to (not including) the high card: A2s…AKs, KTo…KQo |
| `QQ-99` | pair run |
| `A5s-A2s` | fixed high card, kicker run |
| `T9s-65s` | same-gap run (T9s, 98s, 87s, 76s, 65s) |
| `AsKs` | specific combo; it changes only that combo, and a class's weight is the average of its combos (`AKs,AsKs:0.5` → AKs 0.875) |

Export (`formatRange`) writes one token per class: `AA,AKs,KQo:0.5`. Combo counts: pairs 6, suited 4, offsuit 12 (1,326 total). Implemented in `src/ranges/hands.ts`, tested in `tests/equity-ranges.test.ts`.
