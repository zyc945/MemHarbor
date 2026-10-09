import { MemoryError, conflict } from '../domain/errors';
import { file, topic, parse, limitSchema, statusSchema, modeSchema, updateSchema, createSchema, checkpointSchema, moveSchema, memoryPath, searchOptionsSchema, budgetSchema } from '../domain/schemas';
import { FILES, MODES, type MemoryObjectStore, type MemoryVersionStore, type PublishedSnapshot, type Topic, type Snapshot, type TopicMeta } from '../domain/types';
import { catalog } from './catalog';
import { Publisher } from '../r2/publisher';
import { validateContent, parseContext, makeContext, moveContext } from './parser';
import { search } from './search';
import { page } from './pagination';
import { blobSha } from '../github/blob';
import { blobKey, CURRENT_KEY, readSnapshot } from '../r2/snapshot';
import { blocks, bytes, type Block } from './blocks';
import { buildIndex, loadIndex, contentSearch, indexError, SEARCH_LIMITS, SEARCH_VERSION } from './content-search';
export type AuditFields = { operation?: string; topic?: string; file?: string; git_commit?: string; result?: string };
export type SearchInput = { query: string; limit?: number; cursor?: string; scope?: string; status?: unknown; path_prefix?: unknown; include_archived?: unknown };
type Identity = { id: string; topic: string; path: string; git_commit: string };
type FullContext = Identity & { files: Record<string, string>; revisions: Record<string, string> };
type BudgetContext = Identity & { sections: (Block & { file: string; revision: string })[];
  coverage: { max_bytes: number; returned_bytes: number; partial: boolean; files: { file: string; omitted_blocks: number; uri: string }[] } };
export type ServiceOptions = { contentSearch?: boolean; searchLimits?: typeof SEARCH_LIMITS };
export class MemoryService {
  publications = 0;
  constructor(readonly objects: MemoryObjectStore, readonly versions: MemoryVersionStore, readonly maxBytes = 262144, private audit: (fields: AuditFields) => void = () => {}, readonly options: ServiceOptions = {}) {}
  private async index() {
    return (await readSnapshot(this.objects)).snapshot;
  }
  async listMemories(input: { status?: string; limit?: number; cursor?: string; path_prefix?: string } = {}) {
    this.audit({ operation: 'list_memories' });
    const limit = parse(limitSchema, input.limit);
    const status = input.status === undefined ? undefined : parse(statusSchema, input.status);
    const prefix = input.path_prefix === undefined ? undefined : memoryPath(input.path_prefix);
    return page(this.objects, input.cursor, JSON.stringify(['list', status ?? null, prefix ?? null]), limit,
      rows => rows.filter(t => (!status || t.status === status) && (!prefix || t.path === prefix || t.path.startsWith(prefix + '/'))));
  }
  async searchMemories(input: SearchInput) {
    this.audit({ operation: 'search_memories' });
    const limit = parse(limitSchema, input.limit ?? 10);
    if (input.scope === undefined) return page(this.objects, input.cursor, JSON.stringify(['search', input.query]), limit,
      rows => search(rows, input.query, rows.length));
    const options = parse(searchOptionsSchema, input);
    if (options.scope !== 'metadata' && !this.options.contentSearch) indexError('disabled');
    const enhanced = options.scope !== 'metadata' || options.status || options.path_prefix || !options.include_archived;
    // Metadata cursors keep their original fingerprint; body cursors follow the index version.
    const filter = enhanced ? JSON.stringify(['search-v1', input.query, options.scope, options.status ?? null,
      options.path_prefix ?? null, options.include_archived, options.scope === 'metadata' ? 1 : SEARCH_VERSION]) : JSON.stringify(['search', input.query]);
    const result = await page(this.objects, input.cursor, filter, limit, async (rows, snapshot) => {
      rows = rows.filter(t => (!options.status || t.status === options.status) && (options.include_archived || t.status !== 'archived')
        && (!options.path_prefix || t.path === options.path_prefix || t.path.startsWith(options.path_prefix + '/')));
      return options.scope === 'metadata' ? search(rows, input.query, rows.length)
        : contentSearch(rows, input.query, options.scope, await loadIndex(this.objects, snapshot, this.options.searchLimits));
    }).catch(error => {
      if (input.cursor && options.scope !== 'metadata' && error instanceof MemoryError && error.code === 'INVALID_CONTENT')
        throw new MemoryError(error.code, error.message, { ...error.details,
          action: 'Restart the search without a cursor.', index_version: SEARCH_VERSION });
      throw error;
    });
    return { ...result, search_scope: options.scope };
  }
  async publicIndex() {
    const snapshot = await this.index();
    return { schema_version: 1, generated_at: snapshot.generated_at, git_commit: snapshot.git_commit,
      topics: snapshot.topics.map(({ path, title, status, description, aliases, tags, updated_at }) =>
        ({ path, title, status, ...(description === undefined ? {} : { description }), aliases, tags, updated_at })) };
  }
  async buildSearchIndex(signal?: AbortSignal) {
    if (!this.options.contentSearch) indexError('disabled');
    const snapshot = await this.index();
    try { await buildIndex(this.objects, snapshot, this.options.searchLimits, signal); }
    catch (error) { if (error instanceof MemoryError && error.details.component === 'search_index') throw error; indexError('build_failed'); }
    return { status: 'search_indexed', git_commit: snapshot.git_commit, index_version: SEARCH_VERSION };
  }
  async resolveMemory(input: { path: string }) {
    this.audit({ operation: 'resolve_memory' });
    const path = memoryPath(input.path);
    const matches = (await this.index()).topics.filter(t => t.path === path);
    if (!matches.length) throw new MemoryError('NOT_FOUND', 'Memory path not found.');
    if (matches.length !== 1) throw new MemoryError('PUBLISH_ERROR', 'Duplicate path in index. Reconcile.');
    return matches[0];
  }
  private meta(index: PublishedSnapshot, id: string): TopicMeta {
    const entry = index.topics.find(t => t.id === id);
    if (!entry) throw new MemoryError('NOT_FOUND', 'Memory topic not found.');
    const meta = index.metadata[id];
    if (!meta || meta.topic !== id || meta.path !== entry.path || meta.git_commit !== index.git_commit)
      throw new MemoryError('PUBLISH_ERROR', 'Invalid snapshot identity. Reconcile.');
    return meta;
  }
  private find(snapshot: Snapshot, id: string): Topic {
    const found = catalog(snapshot).find(t => t.id === id);
    if (!found) throw new MemoryError('NOT_FOUND', 'Memory topic not found.');
    return found;
  }
  private validateContext(current: Topic, content: string) {
    if (parseContext(current.path, content).id !== current.id)
      throw new MemoryError('INVALID_CONTENT', 'Memory UUID is immutable. Use move_memory to change path.');
  }
  private async readFile(meta: TopicMeta, name: typeof FILES[number]) {
    const revision = meta.files[name]?.git_blob_sha;
    if (!revision) throw new MemoryError('NOT_FOUND', 'Memory file not found.');
    const object = await this.objects.get(blobKey(revision));
    if (!object || object.metadata?.git_blob_sha !== revision)
      throw new MemoryError('PUBLISH_ERROR', 'Snapshot blob is missing or inconsistent. Reconcile.');
    return { id: meta.topic, topic: meta.topic, path: meta.path, file: name, content: object.content, revision, git_commit: meta.git_commit };
  }
  async readMemoryFile(input: { topic: string; file: string }) {
    const name = file(input.file), id = topic(input.topic);
    const meta = this.meta(await this.index(), id);
    this.audit({ operation: 'read_memory_file', topic: id, file: name, git_commit: meta.git_commit });
    return this.readFile(meta, name);
  }
  async loadContext(input: { topic: string; mode?: string; max_bytes?: undefined }): Promise<FullContext>;
  async loadContext(input: { topic: string; mode?: string; max_bytes: number }): Promise<BudgetContext>;
  async loadContext(input: { topic: string; mode?: string; max_bytes?: number }): Promise<FullContext | BudgetContext>;
  async loadContext(input: { topic: string; mode?: string; max_bytes?: number }): Promise<FullContext | BudgetContext> {
    const id = topic(input.topic), mode = parse(modeSchema, input.mode ?? 'default');
    const budget = input.max_bytes === undefined ? undefined : parse(budgetSchema, input.max_bytes);
    if (budget !== undefined && (mode === 'full' || budget > MODES[mode].length * this.maxBytes))
      throw new MemoryError('INVALID_CONTENT', 'Budget is invalid for the selected context mode.');
    const meta = this.meta(await this.index(), id);
    const files: Record<string, string> = {}, revisions: Record<string, string> = {};
    for (const name of MODES[mode]) {
      const result = await this.readFile(meta, name);
      files[name] = result.content;
      revisions[name] = result.revision;
    }
    this.audit({ operation: 'load_context', topic: id, file: undefined, git_commit: meta.git_commit });
    if (budget !== undefined) {
      const queues = await Promise.all(Object.entries(files).map(async ([name, content]) => ({ file: name,
        blocks: await blocks(content), used: new Set<number>() })));
      const sections: BudgetContext['sections'] = [];
      let returned = 0;
      const lengths = Math.max(...queues.map(q => q.blocks.length));
      for (let i = 0; i < lengths; i++) for (const queue of queues) {
        const block = queue.blocks[i];
        if (!block) continue;
        const size = bytes(block.heading_path.join('\n')) + bytes(block.content);
        if (returned + size > budget) continue;
        returned += size; queue.used.add(i);
      }
      for (const queue of queues) for (const i of queue.used)
        sections.push({ file: queue.file, revision: revisions[queue.file], ...queue.blocks[i] });
      return { id, topic: id, path: meta.path, git_commit: meta.git_commit, sections,
        coverage: { max_bytes: budget, returned_bytes: returned, partial: queues.some(q => q.used.size < q.blocks.length),
          files: queues.map(q => ({ file: q.file, omitted_blocks: q.blocks.length - q.used.size, uri: 'memory://topics/' + id + '/' + q.file })) } };
    }
    return { id, topic: id, path: meta.path, git_commit: meta.git_commit, files, revisions };
  }
  async reconcileAll() {
    for (let attempt = 0; attempt < 3; attempt++) {
      // Capture the pointer BEFORE reading Git. A stale publisher cannot replace a newer pointer.
      const previous = await this.objects.get(CURRENT_KEY);
      const snapshot = await this.versions.snapshot();
      const key = await new Publisher(this.objects, this.maxBytes).prepare(snapshot);
      if (await this.versions.head() !== snapshot.commit) continue;
      if (!await this.objects.compareAndSwap(CURRENT_KEY, previous?.etag ?? null,
        JSON.stringify({ schema_version: 3, key, git_commit: snapshot.commit }))) continue;
      if (await this.versions.head() === snapshot.commit) {
        this.publications++;
        this.audit({ git_commit: snapshot.commit });
        return { status: 'reconciled', git_commit: snapshot.commit, published: true };
      }
    }
    throw new MemoryError('PUBLISH_ERROR', 'Repository or publication pointer changed repeatedly. Reconcile again.');
  }
  private async publishResult(status: string, commit: string, revision?: string) {
    try {
      await this.reconcileAll();
      this.audit({ git_commit: commit, result: status });
      return { status, git_commit: commit, ...(revision ? { revision } : {}), published: true };
    } catch {
      this.audit({ git_commit: commit, result: 'committed_not_published' });
      return { status: 'committed_not_published', git_commit: commit, ...(revision ? { revision } : {}), published: false };
    }
  }
  async updateMemory(value: unknown) {
    const input = parse(updateSchema, value);
    this.audit({ operation: 'update_memory', topic: input.topic, file: input.file });
    validateContent(input.content, this.maxBytes);
    const snapshot = await this.versions.snapshot();
    const identity = this.find(snapshot, input.topic);
    if (input.file === 'CONTEXT.md') this.validateContext(identity, input.content);
    const path = identity.path + '/' + input.file;
    const current = snapshot.files[path];
    if (!current) throw new MemoryError('NOT_FOUND', 'Memory file not found.');
    if (current.content === input.content)
      return this.publishResult('noop', snapshot.commit, current.revision);
    if (current.revision !== input.expected_revision) conflict(current.revision);
    const commit = await this.versions.commitFiles(snapshot, { [path]: input.content },
      'memory(' + input.topic + '): ' + input.reason);
    return this.publishResult('updated', commit, await blobSha(input.content));
  }

  async createMemory(value: unknown) {
    const input = parse(createSchema, value);
    const id = crypto.randomUUID();
    this.audit({ operation: 'create_memory', topic: id });
    const context = makeContext({
      id, path: input.path, title: input.title, description: input.description,
      aliases: input.aliases, tags: input.tags, status: input.status,
    }, input.files?.['CONTEXT.md'] ?? input.initial_context);
    const files = {
      'CONTEXT.md': context,
      'STATE.md': input.files?.['STATE.md'] ?? '# Current State\n\n## Current Status\n\nNew topic.\n\n## Next Focus\n',
      'DECISIONS.md': input.files?.['DECISIONS.md'] ?? '# Decisions\n',
      'TODO.md': input.files?.['TODO.md'] ?? '# TODO\n',
      'SOURCES.md': input.files?.['SOURCES.md'] ?? '# Sources\n\n## Documentation\n\n## Conversations\n',
    };
    for (const content of Object.values(files)) validateContent(content, this.maxBytes);
    parseContext(input.path, context);
    const snapshot = await this.versions.snapshot();
    const topics = catalog(snapshot);
    if (topics.some(t => t.id === id || t.path === input.path))
      throw new MemoryError('CONFLICT', 'Memory ID or path already exists.');
    const prefix = input.path + '/';
    const changes = Object.fromEntries(Object.entries(files).map(([name, content]) => [prefix + name, content]));
    if (FILES.some(name => snapshot.files[prefix + name]))
      throw new MemoryError('CONFLICT', 'Memory topic already exists.');
    const commit = await this.versions.commitFiles(snapshot, changes, 'memory(' + id + '): Create topic');
    return { ...await this.publishResult('created', commit), id, path: input.path };
  }
  async checkpointMemory(value: unknown) {
    const input = parse(checkpointSchema, value);
    this.audit({ operation: 'checkpoint_memory', topic: input.topic });
    const snapshot = await this.versions.snapshot();
    const identity = this.find(snapshot, input.topic);
    const changes: Record<string, string> = {};
    for (const [name, content] of Object.entries(input.files)) {
      if (content === undefined) continue;
      validateContent(content, this.maxBytes);
      if (name === 'CONTEXT.md') this.validateContext(identity, content);
      changes[identity.path + '/' + name] = content;
    }
    if (Object.entries(changes).every(([path, content]) => snapshot.files[path]?.content === content))
      return this.publishResult('noop', snapshot.commit);
    if (snapshot.commit !== input.expected_commit) conflict(snapshot.commit);
    const commit = await this.versions.commitFiles(snapshot, changes, 'memory(' + input.topic + '): ' + input.reason);
    return this.publishResult('checkpointed', commit);
  }
  async moveMemory(value: unknown) {
    const input = parse(moveSchema, value);
    this.audit({ operation: 'move_memory', topic: input.topic });
    const snapshot = await this.versions.snapshot();
    const identity = this.find(snapshot, input.topic);
    if (identity.path === input.path)
      return { ...await this.publishResult('noop', snapshot.commit), id: identity.id, path: identity.path };
    if (snapshot.commit !== input.expected_commit) conflict(snapshot.commit);
    const changes: Record<string, string | null> = {};
    for (const name of FILES) {
      const target = input.path + '/' + name;
      if (snapshot.files[target]) throw new MemoryError('CONFLICT', 'Destination path already contains a memory.');
      const old = identity.path + '/' + name;
      const value = snapshot.files[old];
      if (!value) continue;
      const content = name === 'CONTEXT.md' ? moveContext(value.content, input.path) : value.content;
      validateContent(content, this.maxBytes);
      if (name === 'CONTEXT.md' && parseContext(input.path, content).id !== identity.id)
        throw new MemoryError('INVALID_CONTENT', 'Memory UUID is immutable.');
      changes[old] = null;
      changes[target] = content;
    }
    const commit = await this.versions.commitFiles(snapshot, changes, 'memory(' + identity.id + '): ' + input.reason);
    return { ...await this.publishResult('moved', commit), id: identity.id, path: input.path };
  }
  async deleteMemory(id: string, expectedCommit: string) {
    id = topic(id);
    this.audit({ operation: 'delete_memory', topic: id });
    if (!expectedCommit) throw new MemoryError('INVALID_CONTENT', 'expected_commit is required for deletion.');
    const snapshot = await this.versions.snapshot();
    const identity = catalog(snapshot).find(t => t.id === id);
    const paths = identity ? FILES.map(name => identity.path + '/' + name).filter(path => snapshot.files[path]) : [];
    if (!paths.length) return this.publishResult('noop', snapshot.commit);
    if (snapshot.commit !== expectedCommit) conflict(snapshot.commit);
    const commit = await this.versions.commitFiles(snapshot,
      Object.fromEntries(paths.map(path => [path, null])), 'memory(' + id + '): Delete topic');
    return this.publishResult('deleted', commit);
  }
  async reconcileTopic(id: string) {
    id = topic(id);
    // Index and topic metadata form one derived snapshot. Rebuilding it together
    // avoids read-modify-write index races between different topics in small V1 repos.
    return this.reconcileAll();
  }
}
