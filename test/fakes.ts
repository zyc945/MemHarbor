export const ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_ID = '22222222-2222-4222-8222-222222222222';
import type { MemoryObjectStore, MemoryVersionStore, Snapshot, MemoryObject } from '../src/domain/types';
import { conflict } from '../src/domain/errors';
export class Objects implements MemoryObjectStore {
  data = new Map<string, MemoryObject>();
  fail = false;
  async get(key: string) { return this.data.get(key) ?? null; }
  async put(key: string, content: string, metadata?: Record<string, string>) {
    if (this.fail) throw new Error('storage unavailable');
    this.data.set(key, { content, metadata, etag: crypto.randomUUID() });
  }
  async compareAndSwap(key: string, etag: string | null, content: string) {
    if (this.fail) throw new Error('storage unavailable');
    if ((this.data.get(key)?.etag ?? null) !== etag) return false;
    this.data.set(key, { content, etag: crypto.randomUUID() });
    return true;
  }
  async delete(key: string) { if (this.fail) throw new Error('storage unavailable'); this.data.delete(key); }
  async list(prefix = '') { return [...this.data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })); }
}
export class Versions implements MemoryVersionStore {
  state: Snapshot = { commit: 'c0', tree: 't0', files: {}, updatedAt: '2026-09-21T00:00:00Z' };
  commits = 0;
  reads = 0;
  fail = false;
  async head() { return this.state.commit; }
  async snapshot() { this.reads++; return structuredClone(this.state); }
  async commitFiles(base: Snapshot, changes: Record<string, string | null>) {
    if (this.fail) throw new Error('GitHub unavailable');
    if (base.commit !== this.state.commit) conflict(this.state.commit);
    this.commits++;
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) delete this.state.files[path];
      else this.state.files[path] = { content, revision: 'blob-' + this.commits + '-' + path };
    }
    this.state.commit = 'c' + this.commits;
    return this.state.commit;
  }
}
