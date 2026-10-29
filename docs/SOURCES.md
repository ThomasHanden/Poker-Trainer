# Sources and research notes

See `src/content/sources.ts` (shown in-app on each lesson and the Method page). During development the following were checked online:
- Poker TDA Rule 47 on re-opening the bet: short all-ins do not reopen for players who already acted; cumulative short all-ins totaling a full raise do; after such reopening the minimum raise is the last full valid raise. (Card Player summary of TDA rules; TDA forum threads, non-authoritative, on edge cases.)
- Independent Chip Model: Harville (1973) / Malmuth (1986–87) origin; P(first) ∝ stack; conditional later places; known limitations (ignores skill; poor for unlikely events). Wikipedia and arXiv 2011.07610.
- Minimum defense frequency = pot/(pot+bet), a benchmark vs balanced opponents with stated caveats (training-site glossaries).
- Fundamental theorem of poker (Sklansky) and the simplified river indifference bluff share b/(1+2b).

Books are cited for the concepts they are known for; their text was not reproduced. No paid training content, proprietary charts or solver datasets were used. All numbers specific to this app (preflop equities, push/fold chart, drill answers, review figures) are computed by the code in this repository.
