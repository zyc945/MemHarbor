import { it, expect } from 'vitest';
import { Objects, Versions, ID } from './fakes';
import { MemoryService } from '../src/memory/service';
import { makeContext } from '../src/memory/parser';
import worker from '../src/index';
import type { Env } from '../src/env';
import { verifySignature } from '../src/github/webhook';

it('two writers reading the same revision cannot overwrite each other', async () => {
  const versions = new Versions(), objects = new Objects(), service = new MemoryService(objects, versions);
  const created = await service.createMemory({ path: 'race', title: 'Race' });
  const original = await service.readMemoryFile({ topic: created.id, file: 'STATE.md' });
  const results = await Promise.allSettled(['A', 'B'].map(content => service.updateMemory({
    topic: created.id, file: 'STATE.md', content, expected_revision: original.revision, reason: 'Race',
  })));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'CONFLICT' } });
  expect(versions.commits).toBe(2);
});
it('protects filename/topic boundaries before touching GitHub', async () => {
  const versions = new Versions(), service = new MemoryService(new Objects(), versions);
  for (const topic of ['../a', 'a/../b', '/absolute', 'Foo Bar', '%2e%2e', 'a'.repeat(65)]) {
    await expect(service.createMemory({ path: topic, title: 'Invalid' })).rejects.toMatchObject({ code: 'INVALID_TOPIC' });
    await expect(service.loadContext({ topic })).rejects.toMatchObject({ code: 'INVALID_TOPIC' });
  }
  for (const file of ['../STATE.md', '/STATE.md', 'other.md', 'STATE.md/child']) {
    await expect(service.updateMemory({ topic: ID, file, content: 'x', expected_revision: 'x', reason: 'test' }))
      .rejects.toMatchObject({ code: 'INVALID_FILE' });
  }
  expect(versions.reads).toBe(0);
});
it('rejects mixed invalid checkpoint files without creating a commit', async () => {
  const versions = new Versions(), service = new MemoryService(new Objects(), versions);
  await expect(service.checkpointMemory({
    topic: ID, expected_commit: 'c0', reason: 'test',
    files: { 'STATE.md': 'okay', '../../secret': 'bad' },
  })).rejects.toThrow();
  expect(versions.reads).toBe(0);
  expect(versions.commits).toBe(0);
});
it('detects partial R2 publication rather than serving mismatched revisions', async () => {
  const objects = new Objects(), service = new MemoryService(objects, new Versions());
  const created = await service.createMemory({ path: 'topics/a', title: 'A' });
  const state = await service.readMemoryFile({ topic: created.id, file: 'STATE.md' });
  await objects.put('_blobs/' + state.revision, state.content, { git_blob_sha: 'wrong' });
  await expect(service.readMemoryFile({ topic: created.id, file: 'STATE.md' })).rejects.toMatchObject({ code: 'PUBLISH_ERROR' });
  await service.reconcileAll();
  expect((await service.readMemoryFile({ topic: created.id, file: 'STATE.md' })).content).toBe(state.content);
});
it('blocks cross-origin browser requests and hides internal error details', async () => {
  const response = await worker.fetch(new Request('https://memory.test/mcp', { headers: { Origin: 'https://evil.test' } }), {} as Env);
  expect(response.status).toBe(403);
  const bucket = {} as R2Bucket;
  bucket.get = async () => { throw new Error('secret-read secret-write internal stack'); };
  const env: Env = {
    MEMORY_READ_TOKEN: 'secret-read', MEMORY_WRITE_TOKEN: 'secret-write', MAX_FILE_BYTES: '262144',
    GITHUB_OWNER: 'your-github-owner', GITHUB_REPO: 'your-private-memory-repo', GITHUB_BRANCH: 'main',
    MEMORY_BUCKET: bucket, GITHUB_TOKEN: 'fake', GITHUB_WEBHOOK_SECRET: 'fake',
  };
  const failure = await worker.fetch(new Request('https://memory.test/api/v1/topics', { headers: { Authorization: 'Bearer secret-read' } }), env);
  expect(failure.status).toBe(500);
  const body = await failure.text();
  expect(body).not.toContain('secret-read');
  expect(body).not.toContain('internal stack');
});
it('checks malformed, missing and byte-altered webhook signatures', async () => {
  for (const signature of [null, 'sha1=abc', 'sha256=' + 'z'.repeat(64)])
    await expect(verifySignature('{}', signature, 'secret')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode('{}')))]
    .map(v => v.toString(16).padStart(2, '0')).join('');
  await expect(verifySignature('{} ', signature, 'secret')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
it('rejects invalid front matter without publishing changes', async () => {
  const service = new MemoryService(new Objects(), new Versions());
  const valid = makeContext({ id: ID, path: 'a', title: 'A', status: 'active', aliases: [], tags: [] }, '');
  await expect(service.createMemory({ path: 'a', title: '', initial_context: valid })).rejects.toThrow();
});
