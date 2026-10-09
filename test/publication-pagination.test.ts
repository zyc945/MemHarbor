import { it, expect } from 'vitest';
import { MemoryService } from '../src/memory/service';
import { Objects, Versions } from './fakes';
import { makeContext } from '../src/memory/parser';

it('keeps pagination pinned across publication, with Unicode filters and more than 100 rows', async () => {
  const objects = new Objects(), versions = new Versions(), service = new MemoryService(objects, versions);
  for (let i = 0; i < 105; i++) {
    const path = '工作/' + i.toString().padStart(3, '0');
    versions.state.files[path + '/CONTEXT.md'] = { revision: 'context-' + i,
      content: makeContext({ id: crypto.randomUUID(), path, title: '网络 ' + i, status: 'active', aliases: [], tags: [] }, '') };
  }
  await service.reconcileAll();
  const first = await service.listMemories({ limit: 100, path_prefix: '工作' });
  const search = await service.searchMemories({ query: '网络', limit: 100 });
  expect(first.total).toBe(105);
  versions.state.files = {}; versions.state.commit = 'empty';
  await service.reconcileAll();
  const last = await service.listMemories({ limit: 100, path_prefix: '工作', cursor: first.next_cursor! });
  expect(last.topics).toHaveLength(5);
  expect(last.next_cursor).toBeNull();
  expect(new Set([...first.topics, ...last.topics].map(t => t.id)).size).toBe(105);
  expect((await service.searchMemories({ query: '网络', cursor: search.next_cursor! })).topics).toHaveLength(5);
  expect((await service.listMemories()).total).toBe(0);
  await expect(service.listMemories({ cursor: first.next_cursor! })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  await expect(service.listMemories({ cursor: 'garbage' })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
});

it('blocks an old publisher paused after its HEAD check from replacing a newer snapshot', async () => {
  const objects = new Objects(), versions = new Versions(), service = new MemoryService(objects, versions);
  const created = await service.createMemory({ path: 'race', title: 'Race' });
  const swap = objects.compareAndSwap.bind(objects);
  let resume!: () => void, reached!: () => void;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const waiting = new Promise<void>(resolve => { reached = resolve; });
  let pause = true;
  objects.compareAndSwap = async (...args) => {
    if (pause) { pause = false; reached(); await gate; }
    return swap(...args);
  };
  const old = service.reconcileAll();
  await waiting;
  await versions.commitFiles(await versions.snapshot(), { 'race/STATE.md': 'new state' });
  await service.reconcileAll();
  resume(); await old;
  expect((await service.loadContext({ topic: created.id })).files['STATE.md']).toBe('new state');
});

it('pins all files during a read and leaves current data intact on interrupted preparation', async () => {
  const objects = new Objects(), versions = new Versions(), service = new MemoryService(objects, versions);
  const created = await service.createMemory({ path: 'a', title: 'A' });
  const baseline = await service.loadContext({ topic: created.id, mode: 'full' });
  const get = objects.get.bind(objects); let switched = false;
  objects.get = async key => {
    if (!switched && key.startsWith('_blobs/')) {
      switched = true;
      await versions.commitFiles(await versions.snapshot(), { 'a/STATE.md': 'new state' });
      await service.reconcileAll();
    }
    return get(key);
  };
  expect(await service.loadContext({ topic: created.id, mode: 'full' })).toEqual(baseline);
  const pointer = await get('_current.json');
  await versions.commitFiles(await versions.snapshot(), { 'a/STATE.md': 'unpublished' });
  objects.fail = true;
  await expect(service.reconcileAll()).rejects.toThrow();
  objects.fail = false;
  expect(await get('_current.json')).toEqual(pointer);
  expect((await service.loadContext({ topic: created.id })).files['STATE.md']).toBe('new state');
});

it('creates five populated files and status in one commit, rejecting invalid input before writing', async () => {
  const versions = new Versions(), service = new MemoryService(new Objects(), versions);
  const files = { 'CONTEXT.md': 'Stable context', 'STATE.md': 'Current', 'DECISIONS.md': 'Decision', 'TODO.md': 'Next', 'SOURCES.md': 'Source' };
  const result = await service.createMemory({ path: 'a', title: 'A', status: 'paused', files });
  expect(result.published).toBe(true);
  expect(versions.commits).toBe(1);
  const loaded = await service.loadContext({ topic: result.id, mode: 'full' });
  expect(loaded.files).toMatchObject({ ...files, 'CONTEXT.md': expect.stringContaining('Stable context') });
  expect((await service.listMemories()).topics[0].status).toBe('paused');
  for (const input of [{ initial_context: 'duplicate', files }, { files: { 'bad.md': 'bad' } }, { files: { 'STATE.md': 'x'.repeat(262145) } }])
    await expect(service.createMemory({ path: 'b', title: 'B', ...input })).rejects.toThrow();
  expect(versions.commits).toBe(1);
});

it('paginates long Unicode filters with bounded cursors and accepts existing cursors', async () => {
  const service = new MemoryService(new Objects(), new Versions());
  const prefix = Array(10).fill('中'.repeat(60)).join('/'), query = '中'.repeat(500);
  for (const suffix of ['a', 'b']) await service.createMemory({ path: prefix + '/' + suffix, title: query });
  const first = await service.listMemories({ path_prefix: prefix, limit: 1 });
  expect(first.next_cursor!.length).toBeLessThan(4096);
  const last = await service.listMemories({ path_prefix: prefix, limit: 1, cursor: first.next_cursor! });
  expect(last.topics).toHaveLength(1);
  expect(last.topics[0].id).not.toBe(first.topics[0].id);
  expect(last.next_cursor).toBeNull();
  const found = await service.searchMemories({ query, limit: 1 });
  expect(found.next_cursor!.length).toBeLessThan(4096);
  expect((await service.searchMemories({ query, limit: 1, cursor: found.next_cursor! })).topics).toHaveLength(1);
  await expect(service.searchMemories({ query: 'changed', cursor: found.next_cursor! })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  const unfiltered = await service.listMemories({ limit: 1 });
  const legacy = JSON.parse(atob(unfiltered.next_cursor!.replace(/-/g, '+').replace(/_/g, '/')));
  delete legacy.filter_hash;
  legacy.filter = JSON.stringify(['list', null, null]);
  expect((await service.listMemories({ cursor: btoa(JSON.stringify(legacy)) })).topics).toHaveLength(1);
});
