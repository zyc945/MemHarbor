import { it, expect } from 'vitest';
import { GitHubVersionStore } from '../src/github/client';
import type { Snapshot } from '../src/domain/types';
const options = { owner: 'owner', repo: 'private', branch: 'main', token: 'test-token' };
const base: Snapshot = { commit: 'old', tree: 'tree', files: {}, updatedAt: '' };
it('bounds T1 blob retention and rejects oversized snapshots before download without changing T2 defaults', async () => {
  let downloads = 0;
  const fetcher: typeof fetch = async url => {
    const path = String(url);
    if (path.endsWith('/private')) return Response.json({ private: true });
    if (path.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
    if (path.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' }, committer: { date: 'now' } });
    if (path.includes('/git/trees/')) return Response.json({ truncated: false, tree: ['a', 'b'].map(sha => ({ path: sha + '/STATE.md', sha, type: 'blob', mode: '100644', size: 4 })) });
    downloads++; return Response.json({ content: Buffer.from(path.endsWith('/a') ? 'aaaa' : 'bbbb').toString('base64'), encoding: 'base64' });
  };
  const limited = new GitHubVersionStore({ ...options, maxCacheBytes: 4, maxSnapshotBytes: 8 }, fetcher);
  await limited.snapshot(); await limited.snapshot(); expect(downloads).toBe(4);
  downloads = 0;
  const original = new GitHubVersionStore(options, fetcher);
  await original.snapshot(); await original.snapshot(); expect(downloads).toBe(2);
  downloads = 0;
  await expect(new GitHubVersionStore({ ...options, maxSnapshotBytes: 7 }, fetcher).snapshot()).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
  expect(downloads).toBe(0);
});
it('creates one commit and advances the branch without force', async () => {
  const requests: { url: string; method: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url: String(url), method: init?.method ?? 'GET', body });
    const headers = new Headers(init?.headers);
    expect(headers.get('X-GitHub-Api-Version')).toBe('2022-11-28');
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    if (String(url).endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'old' } });
    return Response.json({ sha: String(url).endsWith('/git/trees') ? 'new-tree' : 'new-commit' });
  };
  const store = new GitHubVersionStore(options, fetcher);
  expect(await store.commitFiles(base, { 'topics/test/STATE.md': 'new', 'topics/test/TODO.md': '# TODO' }, 'checkpoint')).toBe('new-commit');
  expect(requests.map(r => r.method)).toEqual(['GET', 'POST', 'POST', 'PATCH']);
  expect(requests[1].body.base_tree).toBe('tree');
  expect(requests[2].body.parents).toEqual(['old']);
  expect(requests[3].body.force).toBe(false);
});
it.each<{ name: string; limit?: number; changes: Record<string, string | null>; rejected: boolean }>([
  { name: 'new file exceeds the total', limit: 10, changes: { 'b/STATE.md': 'x' }, rejected: true },
  { name: 'UTF-8 replacement exceeds by one byte', limit: 10, changes: { 'a/STATE.md': '中文a' }, rejected: true },
  { name: 'combined changes exceed the total', limit: 13,
    changes: { 'a/STATE.md': '中文ab', 'a/TODO.md': '😀cd' }, rejected: true },
  { name: 'same-sized Unicode replacement fits exactly', limit: 10, changes: { 'a/STATE.md': '😀ab' }, rejected: false },
  { name: 'move counts the final paths only', limit: 10,
    changes: { 'b/STATE.md': '中文', 'a/STATE.md': null }, rejected: false },
  { name: 'deletions offset an earlier addition', limit: 10,
    changes: { 'b/STATE.md': '0123456789', 'a/STATE.md': null, 'a/TODO.md': null }, rejected: false },
  { name: 'empty replacement reduces the total', limit: 10, changes: { 'a/STATE.md': '' }, rejected: false },
  { name: 'deletion reduces the total', limit: 10, changes: { 'a/STATE.md': null }, rejected: false },
  { name: 'unconfigured T2 retains its write behavior', changes: { 'b/STATE.md': 'x' }, rejected: false },
])('checks the proposed snapshot before Git writes: $name', async ({ limit, changes, rejected }) => {
  const snapshot: Snapshot = { ...base, files: {
    'a/STATE.md': { content: '中文', revision: 'state' },
    'a/TODO.md': { content: '😀', revision: 'todo' },
  } };
  const before = structuredClone(snapshot), requests: string[] = [];
  const store = new GitHubVersionStore({ ...options, maxSnapshotBytes: limit }, async (_url, init) => {
    requests.push(init?.method ?? 'GET');
    return Response.json({ object: { sha: snapshot.commit }, sha: 'new' });
  });
  const result = store.commitFiles(snapshot, changes, 'Synthetic capacity check');
  if (rejected) {
    await expect(result).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
    expect(requests).toEqual(['GET']);
  } else {
    await expect(result).resolves.toBe('new');
    expect(requests).toEqual(['GET', 'POST', 'POST', 'PATCH']);
  }
  expect(snapshot).toEqual(before);
});
it('rejects stale HEAD and maps a racing ref failure to conflict', async () => {
  let calls = 0;
  const store = new GitHubVersionStore(options, async () => {
    calls++; return Response.json({ object: { sha: 'newer' } });
  });
  await expect(store.commitFiles(base, {}, 'test')).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(calls).toBe(1);
  const racing = new GitHubVersionStore(options, async (_url, init) => {
    if (init?.method === 'PATCH') return Response.json({ message: 'test-token private details' }, { status: 422 });
    return Response.json({ object: { sha: 'old' }, sha: 'new' });
  });
  await expect(racing.commitFiles(base, {}, 'test')).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('reads pinned blobs including UTF-8, enforces private repo and safe trees', async () => {
  const content = '中文 memory';
  const responses = [
    { private: true }, { object: { sha: 'head' } }, { tree: { sha: 'tree' }, committer: { date: 'now' } },
    { truncated: false, tree: [
      { path: 'topics/test/STATE.md', type: 'blob', mode: '100644', sha: 'blob', size: 20 },
      { path: 'README.md', type: 'blob', mode: '100644', sha: 'ignored' },
    ] },
    { content: Buffer.from(content).toString('base64'), encoding: 'base64' },
  ];
  const store = new GitHubVersionStore(options, async () => Response.json(responses.shift()));
  const snapshot = await store.snapshot();
  expect(snapshot.files).toEqual({ 'topics/test/STATE.md': { content, revision: 'blob' } });
  const publicRepo = new GitHubVersionStore(options, async () => Response.json({ private: false }));
  await expect(publicRepo.snapshot()).rejects.toMatchObject({ code: 'GITHUB_ERROR' });
});
it('sanitizes upstream errors', async () => {
  const store = new GitHubVersionStore(options, async () => new Response('secret internal stack test-token', { status: 500 }));
  await expect(store.head()).rejects.toMatchObject({ code: 'GITHUB_ERROR', message: 'GitHub request failed.' });
});
it('discovers multi-level and legacy canonical files while ignoring unrelated paths', async () => {
  const paths = ['works/infra/network/CONTEXT.md', 'personal/home/jim/STATE.md', 'topics/old/STATE.md', '工作/基础设施/网络/CONTEXT.md'];
  const responses = [
    { private: true }, { object: { sha: 'head' } }, { tree: { sha: 'tree' }, committer: { date: 'now' } },
    { truncated: false, tree: [...paths, 'README.md', 'works/infra/notes.txt'].map((path, i) => ({
      path, type: 'blob', mode: '100644', sha: 'blob-' + i, size: 4,
    })) },
    ...paths.map(() => ({ content: 'dGVzdA==', encoding: 'base64' })),
  ];
  const store = new GitHubVersionStore(options, async () => Response.json(responses.shift()));
  expect(Object.keys((await store.snapshot()).files)).toEqual(paths);
  expect(responses).toHaveLength(0);
});

it('rejects decomposed Git paths rather than silently ignoring or merging them', async () => {
  for (const paths of [['工作/cafe\u0301/STATE.md'], ['工作/café/STATE.md', '工作/cafe\u0301/STATE.md']]) {
    const responses = [
      { private: true }, { object: { sha: 'head' } }, { tree: { sha: 'tree' }, committer: { date: 'now' } },
      { truncated: false, tree: paths.map(path => ({ path, type: 'blob', mode: '100644', sha: 'blob' })) },
      { content: 'dGVzdA==', encoding: 'base64' },
    ];
    const store = new GitHubVersionStore(options, async () => Response.json(responses.shift()));
    await expect(store.snapshot()).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  }
});

it('rejects invalid canonical paths before fetching blobs or changing published data', async () => {
  const { Objects, Versions } = await import('./fakes');
  const { MemoryService } = await import('../src/memory/service');
  const objects = new Objects();
  await new MemoryService(objects, new Versions()).createMemory({ path: 'good', title: 'Existing' });
  const before = structuredClone(objects.data);
  for (const path of ['bad name/CONTEXT.md', 'CONTEXT.md', 'bad%name/STATE.md']) {
    const responses = [{ private: true }, { object: { sha: 'head' } }, { tree: { sha: 'tree' } },
      { tree: [{ path, type: 'blob', mode: '100644', sha: 'x' }], truncated: false }];
    const store = new GitHubVersionStore(options, async () => Response.json(responses.shift()));
    await expect(new MemoryService(objects, store).reconcileAll()).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
    expect(responses).toHaveLength(0);
    expect(objects.data).toEqual(before);
  }
});

it('reuses verified blobs across requests, deduplicates downloads and rejects corrupt cache', async () => {
  const { Objects } = await import('./fakes');
  const { blobSha } = await import('../src/github/blob');
  const cache = new Objects(), content = 'shared', sha = await blobSha(content);
  let downloads = 0;
  const fetcher: typeof fetch = async url => {
    const path = String(url);
    if (path.endsWith('/private')) return Response.json({ private: true });
    if (path.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
    if (path.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' }, committer: { date: 'now' } });
    if (path.includes('/git/trees/')) return Response.json({ truncated: false, tree: ['a/STATE.md', 'b/STATE.md'].map(path => ({ path, sha, type: 'blob', mode: '100644' })) });
    downloads++; return Response.json({ content: btoa(content), encoding: 'base64' });
  };
  const store = new GitHubVersionStore({ ...options, cache }, fetcher);
  await store.snapshot(); await store.snapshot();
  expect(downloads).toBe(1);
  await cache.put('_blobs/' + sha, content);
  await new GitHubVersionStore({ ...options, cache }, fetcher).snapshot();
  expect(downloads).toBe(1);
  await cache.put('_blobs/' + sha, 'corrupted');
  expect((await new GitHubVersionStore({ ...options, cache }, fetcher).snapshot()).files['a/STATE.md'].content).toBe(content);
  expect(downloads).toBe(2);
});

it('preserves UTF-8 BOM bytes and reuses their SHA-verified cache', async () => {
  const { Objects } = await import('./fakes');
  const { blobSha } = await import('../src/github/blob');
  const cache = new Objects(), content = '\uFEFF# State\nOriginal', sha = await blobSha(content);
  let downloads = 0;
  const fetcher: typeof fetch = async url => {
    const path = String(url);
    if (path.endsWith('/private')) return Response.json({ private: true });
    if (path.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
    if (path.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' }, committer: { date: 'now' } });
    if (path.includes('/git/trees/')) return Response.json({ truncated: false, tree: [{ path: 'a/STATE.md', sha, type: 'blob', mode: '100644' }] });
    downloads++; return Response.json({ content: Buffer.from(content).toString('base64'), encoding: 'base64' });
  };
  const first = (await new GitHubVersionStore({ ...options, cache }, fetcher).snapshot()).files['a/STATE.md'];
  expect(first.content).toBe(content);
  expect(await blobSha(first.content)).toBe(first.revision);
  await cache.put('_blobs/' + sha, first.content);
  expect((await new GitHubVersionStore({ ...options, cache }, fetcher).snapshot()).files['a/STATE.md']).toEqual(first);
  expect(downloads).toBe(1);
});
