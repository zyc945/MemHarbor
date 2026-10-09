import { z } from 'zod';
import { MemoryError } from '../domain/errors';
import { FILES, type IndexEntry, type MemoryObjectStore, type PublishedSnapshot } from '../domain/types';
import { blobKey } from '../r2/snapshot';
import { blocks, bytes, clip, pause } from './blocks';
import { search } from './search';

export const SEARCH_VERSION = 2;
export const SEARCH_LIMITS = { inputBytes: 8 * 1024 * 1024, outputBytes: 16 * 1024 * 1024, blocks: 20000 };
const sourceSchema = z.object({ topic: z.string(), path: z.string(), file: z.enum(FILES), revision: z.string() }).strict();
const blockSchema = sourceSchema.extend({ heading_path: z.array(z.string()), block_id: z.string(),
  start_line: z.number().int().positive(), end_line: z.number().int().positive(), content: z.string() }).strict();
const payloadSchema = z.object({ version: z.literal(SEARCH_VERSION), git_commit: z.string(),
  sources: z.array(sourceSchema), blocks: z.array(blockSchema) }).strict();
const indexSchema = payloadSchema.extend({ integrity: z.object({ block_count: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict() }).strict();
type ContentIndex = z.infer<typeof payloadSchema>;
type Limits = typeof SEARCH_LIMITS;
export function indexError(reason: string): never {
  throw new MemoryError('PUBLISH_ERROR', 'Content search index is unavailable.', { component: 'search_index', reason, index_version: SEARCH_VERSION });
}
export const searchKey = (commit: string) => '_search/v' + SEARCH_VERSION + '/' + encodeURIComponent(commit) + '.json';
function sources(snapshot: PublishedSnapshot) {
  return snapshot.topics.flatMap(t => FILES.flatMap(file => {
    const revision = snapshot.metadata[t.id]?.files[file]?.git_blob_sha;
    return revision ? [{ topic: t.id, path: t.path, file, revision }] : [];
  })).sort((a, b) => a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : FILES.indexOf(a.file) - FILES.indexOf(b.file));
}
async function integrity(index: ContentIndex) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(index)));
  return { block_count: index.blocks.length, sha256: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
}
export async function validateIndex(content: string, snapshot: PublishedSnapshot, limits = SEARCH_LIMITS): Promise<ContentIndex> {
  if (bytes(content) > limits.outputBytes) return indexError('capacity');
  const parsed = indexSchema.safeParse(JSON.parse(content));
  if (!parsed.success || parsed.data.version !== SEARCH_VERSION || parsed.data.git_commit !== snapshot.git_commit
    || JSON.stringify(parsed.data.sources) !== JSON.stringify(sources(snapshot))) return indexError('source_mismatch');
  const { integrity: expected, ...index } = parsed.data;
  if (index.blocks.length > limits.blocks) return indexError('capacity');
  if (index.blocks.length !== expected.block_count) return indexError('integrity_mismatch');
  const valid = new Map(index.sources.map((s, i) => [JSON.stringify([s.topic, s.path, s.file, s.revision]), i]));
  let source = -1, block = 0, endLine = 0;
  for (const row of index.blocks) {
    const position = valid.get(JSON.stringify([row.topic, row.path, row.file, row.revision]));
    if (position === undefined || position < source) return indexError('invalid_blocks');
    if (position !== source) { source = position; block = 0; endLine = 0; }
    if (row.block_id !== 'b' + block++ || row.start_line <= endLine || row.end_line < row.start_line
      || row.end_line - row.start_line + 1 !== row.content.split('\n').length) return indexError('invalid_blocks');
    endLine = row.end_line;
  }
  if ((await integrity(index)).sha256 !== expected.sha256) return indexError('integrity_mismatch');
  return index;
}
export async function loadIndex(objects: MemoryObjectStore, snapshot: PublishedSnapshot, limits = SEARCH_LIMITS) {
  if (!snapshot.git_commit) return { version: SEARCH_VERSION, git_commit: '', sources: [], blocks: [] } as ContentIndex;
  try {
    const object = await objects.get(searchKey(snapshot.git_commit));
    if (!object) return indexError('missing');
    return await validateIndex(object.content, snapshot, limits);
  } catch (error) { if (error instanceof MemoryError) throw error; return indexError('corrupt'); }
}
export async function buildIndex(objects: MemoryObjectStore, snapshot: PublishedSnapshot, limits: Limits = SEARCH_LIMITS, signal?: AbortSignal) {
  if (!snapshot.git_commit) return;
  signal?.throwIfAborted();
  const key = searchKey(snapshot.git_commit), old = await objects.get(key);
  if (old) {
    try { await validateIndex(old.content, snapshot, limits); return; }
    catch { /* Rebuild corrupt sidecars, but never replace a valid same-version object. */ }
  }
  let input = 0, output = 0;
  const index: ContentIndex = { version: SEARCH_VERSION, git_commit: snapshot.git_commit, sources: sources(snapshot), blocks: [] };
  if (index.sources.length > limits.blocks || bytes(JSON.stringify(index.sources)) > limits.outputBytes) indexError('capacity');
  for (const source of index.sources) {
    signal?.throwIfAborted();
    input += snapshot.metadata[source.topic].files[source.file]!.size;
    if (input > limits.inputBytes) indexError('capacity');
  }
  for (const source of index.sources) {
    signal?.throwIfAborted();
    const object = await objects.get(blobKey(source.revision));
    if (!object || object.metadata?.git_blob_sha !== source.revision) indexError('missing_blob');
    if (bytes(object.content) !== snapshot.metadata[source.topic].files[source.file]!.size) indexError('source_mismatch');
    const parsed = await blocks(object.content, source.file === 'CONTEXT.md', limits.blocks - index.blocks.length);
    for (const block of parsed) {
      const row = { ...source, ...block };
      output += bytes(JSON.stringify(row));
      if (output > limits.outputBytes) indexError('capacity');
      index.blocks.push(row);
    }
    await pause();
  }
  signal?.throwIfAborted();
  const content = JSON.stringify({ ...index, integrity: await integrity(index) });
  signal?.throwIfAborted();
  if (bytes(content) > limits.outputBytes) indexError('capacity');
  if (!await objects.compareAndSwap(key, old?.etag ?? null, content)) {
    const winner = await objects.get(key);
    if (winner?.content !== content) indexError('immutable_conflict');
  }
}
const normalize = (value: string) => value.normalize('NFC').toLowerCase().trim();
const cjk = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;
function terms(text: string) {
  return (normalize(text).match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}_-]+/gu) ?? []).flatMap(word => {
    const points = [...word];
    return cjk.test(word) && points.length > 1 ? points.slice(1).map((p, i) => points[i] + p) : [word];
  });
}
export async function contentSearch(topics: IndexEntry[], query: string, scope: 'content' | 'all', index: ContentIndex) {
  const q = normalize(query), queryTerms = [...new Set(terms(query))], allowed = new Set(topics.map(t => t.id));
  type Match = Omit<ContentIndex['blocks'][number], 'topic' | 'path' | 'content'> & { excerpt: string; truncated: boolean; uri: string };
  const matches = new Map<string, { rank: number; count: number; items: Match[] }>();
  if (q && queryTerms.length) for (let i = 0; i < index.blocks.length; i++) {
    if (i % 256 === 0) await pause();
    const block = index.blocks[i];
    if (!allowed.has(block.topic)) continue;
    const text = normalize(block.heading_path.join('\n') + '\n' + block.content), tokens = new Set(terms(text));
    const count = queryTerms.filter(term => tokens.has(term) || (cjk.test(term) && [...term].length === 1 && text.includes(term))).length;
    const rank = count === queryTerms.length ? (text.includes(q) ? 2 : 1) : 0;
    if (!rank) continue;
    const current = matches.get(block.topic) ?? { rank: 0, count: 0, items: [] };
    if (rank > current.rank || (rank === current.rank && count > current.count)) { current.rank = rank; current.count = count; current.items = []; }
    if (rank === current.rank && count === current.count && current.items.length < 3) {
      const { topic: _topic, path: _path, content, ...location } = block;
      current.items.push({ ...location, ...clip(content, 1024), uri: 'memory://topics/' + block.topic + '/' + block.file });
    }
    matches.set(block.topic, current);
  }
  const metadata = scope === 'all' ? search(topics, query, topics.length) : [];
  const seen = new Set(metadata.map(t => t.id));
  const body = topics.filter(t => matches.has(t.id) && !seen.has(t.id)).sort((a, b) => {
    const x = matches.get(a.id)!, y = matches.get(b.id)!;
    return y.rank - x.rank || y.count - x.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return [...metadata, ...body].map(t => ({ ...t, ...(matches.has(t.id) ? { matches: matches.get(t.id)!.items } : {}) }));
}
