import { it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { legacy } from '../scripts/legacy.mjs';
import { MemoryService } from '../src/memory/service';
import { Objects, Versions, ID } from './fakes';
import { rest } from '../src/http/rest';
import { mcp } from '../src/mcp/server';
const fixture = JSON.parse(readFileSync('test/fixtures/compatibility.json', 'utf8'));
let old: Awaited<ReturnType<typeof legacy>>;
beforeAll(async () => { old = await legacy(); });
afterAll(async () => { await old.close(); });
function services() {
  const objects = new Objects(), versions = new Versions();
  objects.data = new Map(structuredClone(fixture.objects)); versions.state = structuredClone(fixture.state);
  return { objects, versions, current: new MemoryService(objects, versions), previous: new old.module.MemoryService(objects, versions) };
}
it('reads the actual previous program snapshot and preserves default REST results and full bytes', async () => {
  const { current, versions, objects } = services();
  const before = [...objects.data];
  expect(await current.listMemories({ limit: 1 })).toEqual(fixture.list);
  expect(await current.searchMemories({ query: 'network', limit: 1 })).toEqual(fixture.search);
  expect(await current.loadContext({ topic: ID, mode: 'full' })).toEqual(fixture.full);
  const request = new Request('https://example.test/api/v1/topics?q=network&status=paused&path_prefix=missing&include_archived=nonsense');
  expect(await (await rest(request, current, 'read')).json()).toEqual(fixture.ignored);
  expect(versions.reads).toBe(0); expect([...objects.data]).toEqual(before);
});
it('supports old/new cursor round trips including unhashed legacy filters', async () => {
  const { current, previous } = services();
  expect(await current.listMemories({ limit: 1, cursor: fixture.list.next_cursor }))
    .toEqual(await previous.listMemories({ limit: 1, cursor: fixture.list.next_cursor }));
  const next = await current.searchMemories({ query: 'network', limit: 1 });
  expect(await previous.searchMemories({ query: 'network', limit: 1, cursor: next.next_cursor! }))
    .toEqual(await current.searchMemories({ query: 'network', limit: 1, cursor: next.next_cursor! }));
  const cursor = JSON.parse(atob(fixture.search.next_cursor.replace(/-/g, '+').replace(/_/g, '/')));
  delete cursor.filter_hash; cursor.filter = JSON.stringify(['search', 'network']);
  expect(await current.searchMemories({ query: 'network', limit: 1, cursor: btoa(JSON.stringify(cursor)) }))
    .toEqual(await previous.searchMemories({ query: 'network', limit: 1, cursor: fixture.search.next_cursor }));
  expect((await current.searchMemories({ query: 'network', scope: 'metadata', include_archived: true, limit: 1 })).next_cursor).toBe(next.next_cursor);
});
it('keeps ignored MCP search fields compatible with the frozen program unless scope is explicit', async () => {
  const { current, previous } = services();
  const request = (extra: object) => new Request('https://memory.test/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'search_memories', arguments: { query: 'network', ...extra } } }),
  });
  for (const extra of [{ include_archived: 'false' }, { status: 'unknown' }, { path_prefix: ['wrong'] },
    { status: null, path_prefix: '../outside', include_archived: 0 }]) {
    const original = await (await old.module.mcp(request(extra), previous, 'read')).json();
    expect(await (await mcp(request(extra), current, 'read')).json()).toEqual(original);
    expect(await (await mcp(request({ ...extra, scope: 'metadata' }), current, 'read')).json())
      .toMatchObject({ result: { isError: true, structuredContent: { error: 'INVALID_CONTENT' } } });
  }
  expect(await (await mcp(request({ scope: 'metadata', include_archived: false }), current, 'read')).json())
    .toMatchObject({ result: { structuredContent: { search_scope: 'metadata' } } });
  for (const extra of [{ query: '' }, { limit: 0 }, { cursor: 5 }])
    expect(await (await mcp(request(extra), current, 'read')).json()).toMatchObject({ result: { isError: true } });
});
it('allows application rollback after new writes without reverting data or publication', async () => {
  const { current, previous, objects, versions } = services();
  const before = await current.readMemoryFile({ topic: ID, file: 'STATE.md' });
  const result = await current.updateMemory({ topic: ID, file: 'STATE.md', content: 'New accepted state', expected_revision: before.revision, reason: 'fixture' });
  expect(result.published).toBe(true);
  expect((await previous.readMemoryFile({ topic: ID, file: 'STATE.md' })).content).toBe('New accepted state');
  const pointer = (await objects.get('_current.json'))!.content;
  expect((await previous.listMemories()).git_commit).toBe(versions.state.commit);
  expect((await objects.get('_current.json'))!.content).toBe(pointer);
  const next = await previous.readMemoryFile({ topic: ID, file: 'STATE.md' });
  await previous.updateMemory({ topic: ID, file: 'STATE.md', content: 'After rollback', expected_revision: next.revision, reason: 'fixture' });
  expect((await current.readMemoryFile({ topic: ID, file: 'STATE.md' })).content).toBe('After rollback');
});
