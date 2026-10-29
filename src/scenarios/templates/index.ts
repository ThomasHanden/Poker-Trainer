import { ScenarioTemplate } from '../types';
import { PREFLOP_TEMPLATES } from './preflop';
import { TOURNAMENT_TEMPLATES } from './tournament';
import { POSTFLOP_TEMPLATES } from './postflop';
import { FULL_HAND } from './fullhand';

export const TEMPLATES: ScenarioTemplate[] = [...PREFLOP_TEMPLATES, ...TOURNAMENT_TEMPLATES, ...POSTFLOP_TEMPLATES, FULL_HAND];

export function getTemplate(id: string): ScenarioTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
