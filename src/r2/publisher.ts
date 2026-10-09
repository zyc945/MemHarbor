import type { MemoryObjectStore, Snapshot, PublishedSnapshot, TopicMeta } from '../domain/types';
import { FILES } from '../domain/types';
import { validateContent } from '../memory/parser';
import { catalog } from '../memory/catalog';
import { blobKey, emptySnapshot, readSnapshot } from './snapshot';

export class Publisher {
  constructor(private objects: MemoryObjectStore, private maxBytes: number) {}
  // Prepare immutable objects only. The service checks HEAD and swaps the pointer.
  async prepare(snapshot: Snapshot) {
    const topics = catalog(snapshot);
    let previous = emptySnapshot();
    try { previous = (await readSnapshot(this.objects)).snapshot; } catch { /* Disposable serving state can be repaired. */ }
    const now = new Date().toISOString();
    const manifest: PublishedSnapshot = { schema_version: 3, git_commit: snapshot.commit, generated_at: now, topics: [], metadata: {} };
    const blobs = new Map<string, string>();
    for (const parsed of topics) {
      const meta: TopicMeta = { schema_version: 3, topic: parsed.id, path: parsed.path, git_commit: snapshot.commit, published_at: now, files: {} };
      for (const name of FILES) {
        const value = snapshot.files[parsed.path + '/' + name];
        if (!value) continue;
        validateContent(value.content, this.maxBytes);
        meta.files[name] = { git_blob_sha: value.revision, size: new TextEncoder().encode(value.content).byteLength };
        blobs.set(value.revision, value.content);
      }
      const oldMeta = previous.metadata[parsed.id];
      const unchanged = oldMeta?.path === parsed.path && JSON.stringify(oldMeta.files) === JSON.stringify(meta.files);
      manifest.topics.push({ ...parsed, updated_at: unchanged
        ? previous.topics.find(t => t.id === parsed.id)?.updated_at ?? snapshot.updatedAt : snapshot.updatedAt });
      manifest.metadata[parsed.id] = meta;
    }
    // No mutation occurs before validation finishes. Shared blobs have immutable content.
    for (const [sha, content] of blobs) {
      const key = blobKey(sha);
      const old = await this.objects.get(key);
      if (old?.content !== content || old.metadata?.git_blob_sha !== sha) await this.objects.put(key, content, { git_blob_sha: sha });
    }
    const key = '_snapshots/' + crypto.randomUUID() + '.json';
    await this.objects.put(key, JSON.stringify(manifest));
    return key;
  }
}
