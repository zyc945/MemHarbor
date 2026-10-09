import { fileSchema, pathSchema } from './schemas';
import { MemoryError } from './errors';
import type { MemoryFile } from './types';

export function memoryLocation(path: string): { path: string; file: MemoryFile } | null {
  const slash = path.lastIndexOf('/');

  const directory = path.slice(0, slash);
  const name = fileSchema.safeParse(path.slice(slash + 1));
  if (!name.success) return null;
  if (slash < 1 || !pathSchema.safeParse(directory).success)
    throw new MemoryError('INVALID_CONTENT', 'Canonical memory filename has an invalid directory.');
  if (directory !== directory.normalize('NFC'))
    throw new MemoryError('INVALID_CONTENT', 'Canonical memory directories must use Unicode NFC.');
  return { path: directory, file: name.data };
}

export function isMemoryObject(key: string): boolean {
  return memoryLocation(key) !== null
    || (key.endsWith('/_meta.json') && memoryLocation(key.slice(0, -10) + 'CONTEXT.md') !== null);
}
