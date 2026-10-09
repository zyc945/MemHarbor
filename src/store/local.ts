import type { MemoryObject, MemoryObjectStore, PublishedSnapshot } from '../domain/types';
import { MemoryError } from '../domain/errors';
import { CURRENT_KEY, blobKey, parsePointer } from '../r2/snapshot';
import { bytes } from '../memory/blocks';

// T1 only. Operations are serialized by LocalRuntime; a lease protects all
// objects used or prepared by that operation in addition to the current graph.
export class LocalObjectStore implements MemoryObjectStore {
  private data = new Map<string, MemoryObject>();
  private sizes = new Map<string, number>();
  private pins = new Set<string>();
  usedBytes = 0;
  peakBytes = 0;
  constructor(readonly maxBytes = 32 * 1024 * 1024) {}
  private currentKeys() {
    const keep = new Set([CURRENT_KEY]), pointer = this.data.get(CURRENT_KEY);
    if (pointer) {
      const key = parsePointer(pointer.content); keep.add(key);
      const manifest = this.data.get(key);
      if (manifest) {
        const snapshot: PublishedSnapshot = JSON.parse(manifest.content);
        for (const meta of Object.values(snapshot.metadata)) for (const file of Object.values(meta.files))
          keep.add(blobKey(file.git_blob_sha));
      }
    }
    return keep;
  }
  async lease<T>(operation: () => Promise<T>) {
    const before = new Set(this.data.keys());
    this.pins = new Set();
    try { return await operation(); }
    catch (error) {
      const keep = this.currentKeys();
      for (const key of this.data.keys()) if (!before.has(key) && !keep.has(key)) this.remove(key);
      throw error;
    } finally { this.pins.clear(); }
  }
  async get(key: string) { this.pins.add(key); return this.data.get(key) ?? null; }
  private remove(key: string) {
    this.usedBytes -= this.sizes.get(key) ?? 0; this.sizes.delete(key); this.data.delete(key);
  }
  private write(key: string, content: string, metadata?: Record<string, string>) {
    const size = bytes(key) + bytes(content) + bytes(JSON.stringify(metadata ?? {}));
    const oldSize = this.sizes.get(key) ?? 0, keep = this.currentKeys();
    const candidates = [...this.data.keys()].filter(k => k !== key && !keep.has(k) && !this.pins.has(k))
      .sort((a, b) => Number(b.startsWith('_search/')) - Number(a.startsWith('_search/')));
    // Check capacity before evicting anything. Index failure cannot evict the base graph.
    if (this.usedBytes - oldSize + size - candidates.reduce((n, k) => n + this.sizes.get(k)!, 0) > this.maxBytes)
      throw new MemoryError('CONTENT_TOO_LARGE', 'Local object cache capacity exceeded.');
    for (const candidate of candidates) {
      if (this.usedBytes - oldSize + size <= this.maxBytes) break;
      this.remove(candidate);
    }
    this.data.set(key, { content, metadata, etag: crypto.randomUUID() });
    this.sizes.set(key, size); this.usedBytes += size - oldSize;
    this.peakBytes = Math.max(this.peakBytes, this.usedBytes); this.pins.add(key);
  }
  async put(key: string, content: string, metadata?: Record<string, string>) { this.write(key, content, metadata); }
  async compareAndSwap(key: string, etag: string | null, content: string) {
    if ((this.data.get(key)?.etag ?? null) !== etag) return false;
    this.write(key, content); return true;
  }
  async delete(key: string) {
    if (this.currentKeys().has(key) || this.pins.has(key)) throw new MemoryError('CONFLICT', 'Object is in use.');
    this.remove(key);
  }
  async list(prefix = '') { return [...this.data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })); }
}
