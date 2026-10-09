import { MemoryError, conflict } from '../domain/errors';
import type { MemoryVersionStore, Snapshot, VersionedFile, MemoryObjectStore } from '../domain/types';
import { blobSha } from './blob';
import { blobKey } from '../r2/snapshot';
import { memoryLocation } from '../domain/paths';
type Options = { owner: string; repo: string; branch: string; token: string; maxBytes?: number; cache?: MemoryObjectStore;
  maxCacheBytes?: number; maxSnapshotBytes?: number };
type TreeEntry = { path: string; type: string; sha: string; size?: number; mode: string };
export class GitHubVersionStore implements MemoryVersionStore {
  private blobs = new Map<string, string>();
  private blobBytes = 0;
  private privateChecked = false;
  private base: string;
  private ref: string;
  constructor(private options: Options, private fetcher: typeof fetch = fetch) {
    this.base = 'https://api.github.com/repos/' + encodeURIComponent(options.owner) + '/' + encodeURIComponent(options.repo);
    this.ref = options.branch.split('/').map(encodeURIComponent).join('/');
  }
  private remember(sha: string, content: string) {
    if (this.blobs.has(sha)) return;
    const size = new TextEncoder().encode(content).length, limit = this.options.maxCacheBytes;
    if (limit !== undefined) {
      if (size > limit) return;
      while (this.blobBytes + size > limit && this.blobs.size) {
        const [key, value] = this.blobs.entries().next().value!;
        this.blobBytes -= new TextEncoder().encode(value).length; this.blobs.delete(key);
      }
    }
    this.blobs.set(sha, content); this.blobBytes += size;
  }
  private async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.options.token) throw new MemoryError('GITHUB_ERROR', 'GitHub credentials are not configured.');
    let response: Response;
    try {
      const fetcher = this.fetcher;
      response = await fetcher(this.base + path, {
        method, headers: {
          Authorization: 'Bearer ' + this.options.token,
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ai-memory-service', 'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch { throw new MemoryError('GITHUB_ERROR', 'GitHub request failed.'); }
    if (response.status === 409 || (response.status === 422 && method === 'PATCH'))
      conflict();
    if (!response.ok) throw new MemoryError('GITHUB_ERROR', 'GitHub request failed.', { status: response.status });
    try { return await response.json() as T; }
    catch { throw new MemoryError('GITHUB_ERROR', 'Invalid GitHub response.'); }
  }
  async head() {
    return (await this.api<{ object: { sha: string } }>('/git/ref/heads/' + this.ref)).object.sha;
  }
  async snapshot(): Promise<Snapshot> {
    if (!this.privateChecked) {
      const repository = await this.api<{ private: boolean }>('');
      if (!repository.private) throw new MemoryError('GITHUB_ERROR', 'Memory data repository must be private.');
      this.privateChecked = true;
    }
    const commit = await this.head();
    const info = await this.api<{ tree: { sha: string }; committer: { date: string } }>('/git/commits/' + commit);
    const tree = await this.api<{ tree: TreeEntry[]; truncated: boolean }>('/git/trees/' + info.tree.sha + '?recursive=1');
    if (tree.truncated) throw new MemoryError('GITHUB_ERROR', 'Repository tree is too large to reconcile safely.');
    const files: Record<string, VersionedFile> = {};
    const entries = tree.tree.filter(entry => memoryLocation(entry.path) !== null);
    const snapshotLimit = this.options.maxSnapshotBytes ?? Infinity;
    if (entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0) > snapshotLimit)
      throw new MemoryError('CONTENT_TOO_LARGE', 'Local snapshot capacity exceeded.');
    let snapshotBytes = 0;
    // Validate the entire tree before fetching any content or touching serving objects.
    for (const entry of entries) {
      if (entry.type !== 'blob' || entry.mode !== '100644')
        throw new MemoryError('INVALID_CONTENT', 'Canonical memory files must be regular non-executable files.');
      if ((entry.size ?? 0) > (this.options.maxBytes ?? 262144))
        throw new MemoryError('CONTENT_TOO_LARGE', 'Canonical memory file exceeds the byte limit.');
    }
    for (const entry of entries) {
      let content = this.blobs.get(entry.sha);
      if (content === undefined && this.options.cache) {
        const cached = await this.options.cache.get(blobKey(entry.sha));
        if (cached && await blobSha(cached.content) === entry.sha) content = cached.content;
      }
      if (content !== undefined) {
        if (new TextEncoder().encode(content).length > (this.options.maxBytes ?? 262144))
          throw new MemoryError('CONTENT_TOO_LARGE', 'Canonical memory file exceeds the byte limit.');
        snapshotBytes += new TextEncoder().encode(content).length;
        if (snapshotBytes > snapshotLimit) throw new MemoryError('CONTENT_TOO_LARGE', 'Local snapshot capacity exceeded.');
        this.remember(entry.sha, content);
        files[entry.path] = { content, revision: entry.sha };
        continue;
      }
      const blob = await this.api<{ content: string; encoding: string }>('/git/blobs/' + entry.sha);
      if (blob.encoding !== 'base64') throw new MemoryError('GITHUB_ERROR', 'Unsupported GitHub blob encoding.');
      try {
        const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, '')), c => c.charCodeAt(0));
        if (bytes.length > (this.options.maxBytes ?? 262144))
          throw new MemoryError('CONTENT_TOO_LARGE', 'Canonical memory file exceeds the byte limit.');
        const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        snapshotBytes += bytes.length;
        if (snapshotBytes > snapshotLimit) throw new MemoryError('CONTENT_TOO_LARGE', 'Local snapshot capacity exceeded.');
        this.remember(entry.sha, content);
        files[entry.path] = { content, revision: entry.sha };
      } catch (error) {
        if (error instanceof MemoryError) throw error;
        throw new MemoryError('INVALID_CONTENT', 'Canonical memory file must be valid UTF-8.');
      }
    }
    return { commit, tree: info.tree.sha, files, updatedAt: info.committer.date };
  }
  async commitFiles(base: Snapshot, changes: Record<string, string | null>, message: string) {
    const head = await this.head();
    if (head !== base.commit) conflict(head);
    if (this.options.maxSnapshotBytes !== undefined) {
      // Check the final snapshot before remote writes, including replacements and deletions.
      const encoder = new TextEncoder();
      let snapshotBytes = 0;
      for (const path of new Set([...Object.keys(base.files), ...Object.keys(changes)])) {
        const content = Object.hasOwn(changes, path) ? changes[path] : base.files[path].content;
        if (content !== null) snapshotBytes += encoder.encode(content).length;
      }
      if (snapshotBytes > this.options.maxSnapshotBytes)
        throw new MemoryError('CONTENT_TOO_LARGE', 'Local snapshot capacity exceeded.');
    }
    const tree = await this.api<{ sha: string }>('/git/trees', 'POST', {
      base_tree: base.tree,
      tree: Object.entries(changes).map(([path, content]) => ({
        path, mode: '100644', type: 'blob', ...(content === null ? { sha: null } : { content }),
      })),
    });
    const commit = await this.api<{ sha: string }>('/git/commits', 'POST', {
      message, tree: tree.sha, parents: [base.commit],
    });
    await this.api('/git/refs/heads/' + this.ref, 'PATCH', { sha: commit.sha, force: false });
    for (const content of Object.values(changes))
      if (content !== null) this.remember(await blobSha(content), content);
    return commit.sha;
  }
}
