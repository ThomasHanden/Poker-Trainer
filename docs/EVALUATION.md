# Evaluation method and limitations (scoring v1.0.0)

## Pipeline per hero decision
1. **Context** (hero’s information only): hero view of the state, legal actions, pot odds, SPR, texture, made hand, draws, strength percentile.
2. **Opponent ranges**: Bayesian inference — every combo not blocked by known cards is weighted by the product of the policy’s probabilities of each observed action (preflop charts, postflop strength/draw rules) under the *shown* profile.
3. **Equity**: exact enumeration on turn/river (and small flop cases), Monte Carlo otherwise (8,000 samples, SE reported); preflop heads-up uses the precomputed 169×169 table (4,000 samples/pair, ≈±0.8%).
4. **Guidance**: the template’s guide (key decision) or a generic guide (later decisions) rates actions as preferred / mixed / discouraged / mistake with reasons, sizing bands and math. Sources: illustrative charts, computed push/fold equilibrium, exact math, ICM, heuristics.
5. **Model EV** (postflop): rollouts with common random numbers — opponent hands sampled from the inferred range, random runouts (never the real deck), opponents act by the policy, later hero decisions by a baseline policy. 500 samples per action (key decision), 250 otherwise; paired standard errors.
6. **Grade**: guidance rating combined with model verdict (see Method page). Sizing graded separately. Unscored when neither source is confident.
7. **Profile variants** (key postflop decision): ranges re-inferred and EVs re-simulated vs station, nit and LAG.

Hand score = weighted mean of decision points (key ×2, low confidence ×0.6).

## Limitations
- Charts are illustrative, not solver outputs; mixed frequencies are teaching approximations.
- The opponent policy is a simple strength/draw/profile model; real players differ. Inferred ranges are exact only for the simulated opponent.
- Model EVs use a baseline hero policy for future streets and the opponent model; they are not true EVs and can disagree with heuristic guidance (the review reports such conflicts).
- ICM uses Malmuth–Harville; ignores skill, position and future blinds. The ICM shove template assumes a chip-EV calling range for the big blind (stated).
- Push/fold equilibrium uses class-averaged equities and shove/fold vs call/fold only.
- Rake is assumed in chart design but not deducted from pots.
