// Expensive operations, runnable inside the Web Worker or (fallback) on the main thread.

import { generateScenario, rebuildScenario, GenerateOptions } from '../scenarios/generator';
import { PracticeSettings, Scenario } from '../scenarios/types';
import { evaluateScenario, liveHelp, DecisionRecord, ScenarioEvaluation, LiveHelp } from '../evaluation/evaluate';
import { replay } from '../scenarios/play';
import { HandState, PlayerAction } from '../engine/rules';
import { equityVsRange, equityMultiway, EquityResult } from '../engine/equity';
import { parseRange, expandRange } from '../ranges/hands';
import { Card, createRng } from '../engine/cards';
import { classEquityVsRange } from '../ranges/preflopEquity';
import * as practice from '../ranges/practice';

export type TaskRequest =
  | { kind: 'generate'; settings: PracticeSettings; opts: GenerateOptions }
  | { kind: 'evaluate'; scenario: Scenario; decisions: DecisionRecord[] }
  | { kind: 'help'; scenario: Scenario; state: HandState; equity: boolean }
  | { kind: 'rebuild'; scenarioId: string; settings: PracticeSettings; actions: PlayerAction[] }
  | { kind: 'equity'; hero: Card[]; ranges: string[]; board: Card[]; samples: number }
  | { kind: 'classEquity'; hand: string; range: string }
  | { kind: 'rangeDrill'; drill: practice.DrillKind; seed: number };

export interface RebuildResult {
  scenario?: Scenario;
  evaluation?: ScenarioEvaluation;
  finalState?: HandState;
  note?: string;
  error?: string;
}

export function runTask(req: TaskRequest): unknown {
  switch (req.kind) {
    case 'generate':
      return generateScenario(req.settings, req.opts);
    case 'evaluate':
      return evaluateScenario(req.scenario, req.decisions);
    case 'help':
      return liveHelp(req.scenario, req.state, req.equity) as LiveHelp;
    case 'rebuild': {
      const r = rebuildScenario(req.scenarioId, req.settings);
      if (!r.scenario) return { error: r.error } as RebuildResult;
      const sess = replay(r.scenario, req.actions);
      const evaluation = evaluateScenario(r.scenario, sess.decisions);
      return { scenario: r.scenario, evaluation, finalState: sess.state, note: r.error } as RebuildResult;
    }
    case 'equity': {
      const combos = req.ranges.map((t) => expandRange(parseRange(t), [...req.hero, ...req.board]));
      const rng = createRng(1234);
      const res: EquityResult = combos.length === 1 ? equityVsRange(req.hero, combos[0], req.board, { samples: req.samples, rng }) : equityMultiway(req.hero, combos, req.board, req.samples, rng);
      return res;
    }
    case 'classEquity':
      return classEquityVsRange(req.hand, parseRange(req.range));
    case 'rangeDrill':
      return practice.buildDrill(req.drill, req.seed);
  }
}
