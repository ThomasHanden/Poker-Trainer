import type { LessonExtra } from '../types';
import { FOUNDATIONS_X } from './foundations';
import { PREFLOP_X } from './preflop';
import { POSTFLOP_X } from './postflop';
import { SIZING_X } from './sizing';
import { MATH_X } from './math';
import { RANGES_X } from './ranges';
import { ADAPTATION_X } from './adaptation';
import { TOURNAMENT_X } from './tournament';
import { DISCIPLINE_X } from './discipline';

export const EXTRAS: Record<string, LessonExtra> = {
  ...FOUNDATIONS_X,
  ...PREFLOP_X,
  ...POSTFLOP_X,
  ...SIZING_X,
  ...MATH_X,
  ...RANGES_X,
  ...ADAPTATION_X,
  ...TOURNAMENT_X,
  ...DISCIPLINE_X,
};
