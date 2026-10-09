import { it, expect } from 'vitest';
import { LocalObjectStore } from '../src/store/local';
import { LocalRuntime } from '../src/local/runtime';
import { syntheticVersions } from '../src/local/synthetic';
import { MemoryService } from '../src/memory/service';
import { Objects } from './fakes';
import { readSnapshot } from '../src/r2/snapshot';
import { GitHubVersionStore } from '../src/github/client';
import { fakeGitHub } from '../scripts/fake-github.mjs';
it('rejects oversized T1 mutations before committing and remains readable and writable', async () => {
  const github = fakeGitHub(), objects = new LocalObjectStore(), writes: string[] = [];
  const versions = new GitHubVersionStore({ owner: 'test-owner', repo: 'test-memory', branch: 'main',
    token: 'fake-github', maxSnapshotBytes: 1000, cache: objects }, (url, init) => {
    if (init?.method !== 'GET') writes.push(init?.method ?? 'GET');
    return github.fetch(new Request(url, init));
  });
  const runtime = new LocalRuntime(objects, versions);
  await runtime.initialize();
  const created = await runtime.service.createMemory({ path: 'demo', title: 'Synthetic' });
  expect(created.published).toBe(true);
  const before = await runtime.service.loadContext({ topic: created.id, mode: 'full' });
  const pointer = await objects.get('_current.json'), commits = github.commitCount;
  writes.length = 0;
  const mutations = [
    () => runtime.service.createMemory({ path: 'extra', title: 'Synthetic', files: { 'STATE.md': 'x'.repeat(1000) } }),
    () => runtime.service.updateMemory({ topic: created.id, file: 'STATE.md', content: 'x'.repeat(1000),
      expected_revision: before.revisions['STATE.md'], reason: 'Synthetic capacity check' }),
    () => runtime.service.checkpointMemory({ topic: created.id, expected_commit: before.git_commit,
      files: { 'STATE.md': 'x'.repeat(600), 'DECISIONS.md': 'x'.repeat(600) }, reason: 'Synthetic capacity check' }),
    () => runtime.service.moveMemory({ topic: created.id, expected_commit: before.git_commit,
      path: Array(15).fill('x'.repeat(64)).join('/'), reason: 'Synthetic capacity check' }),
  ];
  for (const mutate of mutations) {
    await expect(mutate()).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
    expect(writes).toEqual([]);
    expect(github.commitCount).toBe(commits); expect(github.head).toBe(before.git_commit);
    expect(await objects.get('_current.json')).toEqual(pointer);
    expect(await runtime.service.loadContext({ topic: created.id, mode: 'full' })).toEqual(before);
    expect((await runtime.service.listMemories()).total).toBe(1);
  }
  expect(await runtime.service.updateMemory({ topic: created.id, file: 'STATE.md', content: 'Small valid update',
    expected_revision: before.revisions['STATE.md'], reason: 'Synthetic recovery check' }))
    .toMatchObject({ status: 'updated', published: true });
  expect((await runtime.service.loadContext({ topic: created.id })).files['STATE.md']).toBe('Small valid update');
});
it('refreshes current reads after external Git changes and rejects refresh failure without serving stale data', async () => {
  const versions = await syntheticVersions(), store = new LocalObjectStore(), runtime = new LocalRuntime(store, versions);
  await runtime.initialize();
  const first = await runtime.service.listMemories(), id = first.topics[0].id;
  const base = await versions.snapshot();
  await versions.commitFiles(base, { 'demo/project/STATE.md': 'External change' }, 'external');
  expect((await runtime.service.loadContext({ topic: id })).files['STATE.md']).toBe('External change');
  const head = versions.head;
  versions.head = async () => { throw new Error('offline'); };
  await expect(runtime.service.loadContext({ topic: id })).rejects.toThrow('offline');
  versions.head = head;
  expect((await runtime.service.loadContext({ topic: id })).files['STATE.md']).toBe('External change');
});
it('pins pagination across refreshes and reports evicted cursors after restart', async () => {
  const versions = await syntheticVersions(), runtime = new LocalRuntime(new LocalObjectStore(), versions);
  await runtime.initialize();
  await runtime.service.createMemory({ path: 'another', title: 'Another' });
  const first = await runtime.service.listMemories({ limit: 1 });
  await runtime.service.createMemory({ path: 'third', title: 'Third' });
  expect((await runtime.service.listMemories({ limit: 1, cursor: first.next_cursor! })).git_commit).toBe(first.git_commit);
  const restarted = new LocalRuntime(new LocalObjectStore(), versions);
  await restarted.initialize();
  await expect(restarted.service.listMemories({ cursor: first.next_cursor! })).rejects.toMatchObject({ code: 'PUBLISH_ERROR' });
});
it('evicts old pagination manifests under pressure while retaining the current readable snapshot', async () => {
  const versions = await syntheticVersions(), store = new LocalObjectStore(16000), runtime = new LocalRuntime(store, versions);
  await runtime.initialize();
  const created = await runtime.service.createMemory({ path: 'second', title: 'Second' });
  const first = await runtime.service.listMemories({ limit: 1 });
  for (let i = 0; i < 20; i++) {
    const file = await runtime.service.readMemoryFile({ topic: created.id, file: 'STATE.md' });
    await runtime.service.updateMemory({ topic: created.id, file: file.file, content: 'Synthetic change ' + i,
      expected_revision: file.revision, reason: 'Cache pressure' });
  }
  await expect(runtime.service.listMemories({ cursor: first.next_cursor! })).rejects.toMatchObject({ code: 'PUBLISH_ERROR' });
  expect((await runtime.service.listMemories()).total).toBe(2);
  expect(store.peakBytes).toBeLessThanOrEqual(16000);
});
it('serializes concurrent refresh/mutation operations and uses real local CAS', async () => {
  const versions = await syntheticVersions(), runtime = new LocalRuntime(new LocalObjectStore(), versions);
  await runtime.initialize();
  const results = await Promise.all(['one', 'two'].map(path => runtime.service.createMemory({ path, title: path })));
  expect(results.every(result => result.published)).toBe(true);
  expect((await runtime.service.listMemories()).total).toBe(3);
  const store = new LocalObjectStore();
  expect(await store.compareAndSwap('k', null, 'first')).toBe(true);
  expect(await store.compareAndSwap('k', null, 'wrong')).toBe(false);
  const old = await store.get('k');
  const races = await Promise.all(['a', 'b'].map(v => store.compareAndSwap('k', old!.etag, v)));
  expect(races.filter(Boolean)).toHaveLength(1);
});
it('limits peak resident objects, protects the current graph and cleans failed candidates', async () => {
  const versions = await syntheticVersions(), store = new LocalObjectStore(5000), runtime = new LocalRuntime(store, versions);
  await runtime.initialize();
  const before = await readSnapshot(store);
  await expect(store.lease(async () => { await store.put('temporary', 'x'); await store.put('huge', 'x'.repeat(5001)); })).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
  expect(await store.get('temporary')).toBeNull();
  expect((await readSnapshot(store)).snapshot.git_commit).toBe(before.snapshot.git_commit);
  const core = new MemoryService(store, versions, 262144, undefined, { contentSearch: true, searchLimits: { inputBytes: 1, outputBytes: 1, blocks: 1 } });
  await expect(store.lease(() => core.buildSearchIndex())).rejects.toMatchObject({ code: 'PUBLISH_ERROR' });
  expect((await runtime.service.listMemories()).total).toBe(1);
  expect(store.peakBytes).toBeLessThanOrEqual(5000);
  const changed = await versions.snapshot();
  await versions.commitFiles(changed, { 'demo/project/STATE.md': 'x'.repeat(6000) }, 'oversized external commit');
  await expect(runtime.service.listMemories()).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
  expect((await readSnapshot(store)).snapshot.git_commit).toBe(before.snapshot.git_commit);
  const tiny = new LocalRuntime(new LocalObjectStore(1), versions);
  await expect(tiny.initialize()).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
});
it('keeps T1 and T2 enhanced retrieval and budgets identical for the same published data', async () => {
  const versions = await syntheticVersions(), local = new LocalObjectStore(), objects = new Objects();
  const a = new MemoryService(local, versions, 262144, undefined, { contentSearch: true });
  const b = new MemoryService(objects, versions, 262144, undefined, { contentSearch: true });
  for (const service of [a, b]) { await service.reconcileAll(); await service.buildSearchIndex(); }
  expect(await a.searchMemories({ query: 'migration', scope: 'content' })).toEqual(await b.searchMemories({ query: 'migration', scope: 'content' }));
  const id = (await a.listMemories()).topics[0].id;
  expect(await a.loadContext({ topic: id, max_bytes: 100 })).toEqual(await b.loadContext({ topic: id, max_bytes: 100 }));
});
