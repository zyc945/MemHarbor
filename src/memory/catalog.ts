import type { Snapshot, Topic } from '../domain/types';
import { memoryLocation } from '../domain/paths';
import { MemoryError } from '../domain/errors';
import { parseContext } from './parser';

// Build from canonical Git data before every mutation and publication.
export function catalog(snapshot: Snapshot): Topic[] {
  const paths = new Set<string>();
  for (const name of Object.keys(snapshot.files)) {
    const location = memoryLocation(name);
    if (!location) throw new MemoryError('INVALID_CONTENT', 'Invalid canonical memory path.');
    paths.add(location.path);
  }
  const ids = new Set<string>();
  return [...paths].sort().map(path => {
    const context = snapshot.files[path + '/CONTEXT.md'];
    if (!context) throw new MemoryError('INVALID_CONTENT', 'Canonical topic is missing CONTEXT.md.');
    const parsed = parseContext(path, context.content);
    if (ids.has(parsed.id)) throw new MemoryError('INVALID_CONTENT', 'Duplicate memory UUID in canonical repository.');
    ids.add(parsed.id);
    return parsed;
  });
}
