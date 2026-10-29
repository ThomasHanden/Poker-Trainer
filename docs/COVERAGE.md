# Coverage map

The authoritative, always-current coverage map is generated in the app at **#/coverage** from the template metadata, lesson index and `src/content/coverage.ts`.

Summary:
- **Implemented**: NLHE rules incl. side pots and TDA-style reopening; 37 scenario templates across preflop/flop/turn/river, cash and tournament (push/fold, re-shove, bubble ICM, final-table ICM); guided and assessment modes; reviews; 81 lessons covering every requested curriculum item; range explorer with drills; progress dashboard; persistence with export/import/reset.
- **Approximate**: illustrative preflop charts; heuristic postflop guidance; opponent model; simulated multi-street EVs; heads-up and full-ring support limited to preflop/short-stack templates (postflop templates are 6-max 100bb); 200bb only in one preflop template.
- **Unsupported**: solver integration, straddles, rake deduction, bounty/satellite scenarios, deep-stack tournament postflop, limped multiway postflop, 4-bet pot postflop, flop donk-bet templates, optional LLM explanations.
