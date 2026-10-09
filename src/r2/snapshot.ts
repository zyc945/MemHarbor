import { MemoryError } from '../domain/errors';
import type { MemoryObjectStore, PublishedSnapshot } from '../domain/types';

export const CURRENT_KEY = '_current.json';
const snapshotKey = /^_snapshots\/[0-9a-f-]{36}\.json$/;
export const emptySnapshot = (): PublishedSnapshot => ({ schema_version: 3, git_commit: '', generated_at: '', topics: [], metadata: {} });
export function blobKey(sha: string) { return '_blobs/' + sha; }
export function parsePointer(content: string): string {
  try {
    const value = JSON.parse(content);
    if (value.schema_version !== 3 || !snapshotKey.test(value.key)) throw new Error('pointer');
    return value.key;
  } catch { throw new MemoryError('PUBLISH_ERROR', 'Invalid snapshot pointer. Reconcile.'); }
}
export async function readSnapshot(objects: MemoryObjectStore, key?: string): Promise<{ key: string | null; snapshot: PublishedSnapshot }> {
  if (!key) {
    const current = await objects.get(CURRENT_KEY);
    if (!current) {
      if (await objects.get('_index.json')) throw new MemoryError('PUBLISH_ERROR', 'Reconcile to upgrade the serving snapshot.');
      return { key: null, snapshot: emptySnapshot() };
    }
    key = parsePointer(current.content);
  }
  if (!snapshotKey.test(key)) throw new MemoryError('INVALID_CONTENT', 'Invalid snapshot cursor.');
  const value = await objects.get(key);
  if (!value) throw new MemoryError('PUBLISH_ERROR', 'Snapshot is unavailable. Reconcile or restart pagination.');
  try {
    const snapshot: PublishedSnapshot = JSON.parse(value.content);
    if (snapshot.schema_version !== 3 || !Array.isArray(snapshot.topics) || !snapshot.metadata || !snapshot.git_commit)
      throw new Error('manifest');
    return { key, snapshot };
  } catch { throw new MemoryError('PUBLISH_ERROR', 'Invalid serving snapshot. Reconcile.'); }
}
