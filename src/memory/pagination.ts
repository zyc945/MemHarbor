import { MemoryError } from '../domain/errors';
import type { IndexEntry, MemoryObjectStore, PublishedSnapshot } from '../domain/types';
import { readSnapshot } from '../r2/snapshot';

type Cursor = { key: string; offset: number; filter?: string; filter_hash?: string };
export async function page<T extends IndexEntry>(objects: MemoryObjectStore, cursor: string | undefined, filter: string,
  limit: number, select: (topics: IndexEntry[], snapshot: PublishedSnapshot) => T[] | Promise<T[]>) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(filter));
  const filterHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  let position: Cursor | undefined;
  if (cursor !== undefined) {
    try {
      if (cursor.length > 4096) throw new Error('length');
      position = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
      if (!position || typeof position.key !== 'string' || !/^_snapshots\/[0-9a-f-]{36}\.json$/.test(position.key)
        || !Number.isSafeInteger(position.offset) || position.offset < 0
        || (position.filter_hash !== undefined ? position.filter_hash !== filterHash : position.filter !== filter)) throw new Error('cursor');
    } catch { throw new MemoryError('INVALID_CONTENT', 'Invalid cursor or changed pagination filters.'); }
  }
  const { key, snapshot } = await readSnapshot(objects, position?.key);
  const rows = await select(snapshot.topics, snapshot), offset = position?.offset ?? 0;
  if (offset > rows.length) throw new MemoryError('INVALID_CONTENT', 'Cursor offset exceeds result size.');
  const next = offset + limit;
  // Fixed-size digest keeps cursors bounded even for long Unicode filters.
  // Existing cursors containing the original filter remain readable.
  const next_cursor = next < rows.length && key ? btoa(JSON.stringify({ key, offset: next, filter_hash: filterHash }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null;
  return { topics: rows.slice(offset, next), total: rows.length, next_cursor, git_commit: snapshot.git_commit };
}
