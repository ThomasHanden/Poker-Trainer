import type { LessonDrills } from '../types';
import { FOUNDATIONS_D } from './foundations';
import { PREFLOP_D } from './preflop';
import { POSTFLOP_D } from './postflop';
import { SIZING_D } from './sizing';
import { MATH_D } from './math';
import { RANGES_D } from './ranges';
import { ADAPTATION_D } from './adaptation';
import { TOURNAMENT_D } from './tournament';
import { DISCIPLINE_D } from './discipline';

export const DRILLS: Record<string, LessonDrills> = {
  ...FOUNDATIONS_D,
  ...PREFLOP_D,
  ...POSTFLOP_D,
  ...SIZING_D,
  ...MATH_D,
  ...RANGES_D,
  ...ADAPTATION_D,
  ...TOURNAMENT_D,
  ...DISCIPLINE_D,
};
