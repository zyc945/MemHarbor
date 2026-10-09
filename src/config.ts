import { MemoryError } from './domain/errors';
export function flag(value: string | boolean | undefined, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new MemoryError('INTERNAL_ERROR', 'Invalid boolean configuration.');
}
