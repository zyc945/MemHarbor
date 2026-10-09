import { it, expect, vi, afterEach } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import { GitHubVersionStore } from '../src/github/client';
import { R2Repository } from '../src/r2/repository';
import { Objects, Versions } from './fakes';
import { flag } from '../src/config';
afterEach(() => vi.restoreAllMocks());
function setup(enhanced = false) {
  const objects = new Objects(), versions = new Versions();
  vi.spyOn(R2Repository.prototype, 'get').mockImplementation(async key => {
    const object = await objects.get(key); return object ? { ...object, metadata: object.metadata } : null;
  });
  vi.spyOn(R2Repository.prototype, 'put').mockImplementation(objects.put.bind(objects));
  vi.spyOn(R2Repository.prototype, 'compareAndSwap').mockImplementation(objects.compareAndSwap.bind(objects));
  vi.spyOn(R2Repository.prototype, 'delete').mockImplementation(objects.delete.bind(objects));
  vi.spyOn(R2Repository.prototype, 'list').mockImplementation(objects.list.bind(objects));
  vi.spyOn(GitHubVersionStore.prototype, 'snapshot').mockImplementation(() => versions.snapshot());
  vi.spyOn(GitHubVersionStore.prototype, 'head').mockImplementation(() => versions.head());
  vi.spyOn(GitHubVersionStore.prototype, 'commitFiles').mockImplementation((base, changes) => versions.commitFiles(base, changes));
  const env: Env = { MEMORY_BUCKET: {} as R2Bucket, MAX_FILE_BYTES: '262144', GITHUB_OWNER: 'your-github-owner', GITHUB_REPO: 'your-private-memory-repo', GITHUB_BRANCH: 'main',
    GITHUB_TOKEN: 'synthetic', GITHUB_WEBHOOK_SECRET: 'synthetic', MEMORY_READ_TOKEN: 'read', MEMORY_WRITE_TOKEN: 'write',
    ...(enhanced ? { MEMORY_CONTENT_SEARCH: 'true' } : {}) };
  const pending: Promise<unknown>[] = [];
  const ctx = {} as ExecutionContext;
  ctx.waitUntil = p => { pending.push(p); };
  return { objects, versions, env, ctx, pending };
}
const req = (path: string, token = 'read', body?: object) => new Request('https://test.invalid' + path, {
  method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
it('keeps old configuration working and performs no index I/O or background work during default reads', async () => {
  const { env, ctx, pending, objects } = setup();
  const created = await worker.fetch(req('/api/v1/topics', 'write', { path: 'demo', title: 'Demo' }), env, ctx);
  expect(await created.json()).toMatchObject({ published: true });
  expect(pending).toHaveLength(0); expect(await objects.list('_search/')).toEqual([]);
  const reads = vi.spyOn(objects, 'get');
  expect((await worker.fetch(req('/api/v1/index'), env, ctx)).status).toBe(200);
  expect(reads.mock.calls.some(([key]) => key.startsWith('_search/'))).toBe(false);
  expect((await worker.fetch(req('/api/v1/index', 'invalid'), env, ctx)).status).toBe(401);
});
it('isolates background index failure from successful writes and scheduled publication', async () => {
  const { env, ctx, pending, objects } = setup(true);
  const cas = objects.compareAndSwap.bind(objects);
  vi.spyOn(objects, 'compareAndSwap').mockImplementation((key, etag, content) => {
    if (key.startsWith('_search/')) throw new Error('Index unavailable');
    return cas(key, etag, content);
  });
  const result = await worker.fetch(req('/api/v1/topics', 'write', { path: 'demo', title: 'Demo' }), env, ctx);
  expect(await result.json()).toMatchObject({ published: true, status: 'created' });
  expect(pending).toHaveLength(1); await Promise.all(pending);
  await expect(worker.scheduled({} as ScheduledController, env, ctx)).resolves.toBeUndefined();
  expect((await worker.fetch(req('/api/v1/topics'), env, ctx)).status).toBe(200);
});
it('retains signed webhook defaults, supports explicit disable and rejects enabled-without-secret', async () => {
  const { env, ctx } = setup();
  const body = JSON.stringify({ repository: { full_name: env.GITHUB_OWNER + '/' + env.GITHUB_REPO } });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('synthetic'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const signature = 'sha256=' + [...signed].map(n => n.toString(16).padStart(2, '0')).join('');
  const ping = () => new Request('https://test.invalid/webhooks/github', { method: 'POST', body,
    headers: { 'X-GitHub-Event': 'ping', 'X-Hub-Signature-256': signature } });
  expect((await worker.fetch(ping(), env, ctx)).status).toBe(200);
  expect((await worker.fetch(ping(), { ...env, MEMORY_WEBHOOK_ENABLED: 'false' }, ctx)).status).toBe(404);
  expect((await worker.fetch(ping(), { ...env, MEMORY_WEBHOOK_ENABLED: 'true', GITHUB_WEBHOOK_SECRET: undefined }, ctx)).status).toBe(401);
  for (const value of ['yes', '', '0']) expect(() => flag(value)).toThrow();
});
