import type { MemoryObjectStore } from '../domain/types';
export class R2Repository implements MemoryObjectStore {
  constructor(private bucket: R2Bucket) {}
  async get(key: string) {
    const object = await this.bucket.get(key);
    // Preserve BOM bytes so content continues to match its Git blob revision.
    return object ? { content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await object.arrayBuffer()),
      etag: object.etag, metadata: object.customMetadata } : null;
  }
  async put(key: string, content: string, metadata?: Record<string, string>) {
    await this.bucket.put(key, content, {
      customMetadata: metadata,
      httpMetadata: { contentType: key.endsWith('.json') ? 'application/json' : 'text/markdown; charset=utf-8' },
    });
  }
  async compareAndSwap(key: string, etag: string | null, content: string) {
    const result = await this.bucket.put(key, content, {
      onlyIf: etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: etag },
      httpMetadata: { contentType: 'application/json' },
    });
    return result !== null;
  }
  async delete(key: string) { await this.bucket.delete(key); }
  async list(prefix = '') {
    const objects: { key: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, cursor });
      objects.push(...page.objects.map(({ key }) => ({ key })));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return objects;
  }
}
