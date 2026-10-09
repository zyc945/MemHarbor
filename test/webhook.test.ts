import { it, expect } from 'vitest';
import { webhook } from '../src/github/webhook';
import { MemoryService } from '../src/memory/service';
import { Objects, Versions, ID } from './fakes';
import { makeContext } from '../src/memory/parser';
const config = { owner: 'owner', repo: 'memory', branch: 'main', secret: 'webhook-test-secret' };
async function request(payload: unknown, valid = true) {
  const body = JSON.stringify(payload), encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://memory.test/webhooks/github', {
    method: 'POST', body, headers: { 'X-GitHub-Event': 'push', 'X-Hub-Signature-256': 'sha256=' + (valid ? signature : '0'.repeat(64)) },
  });
}
it('rejects bad signatures and ignores other repositories/branches', async () => {
  const versions = new Versions(), service = new MemoryService(new Objects(), versions);
  const payload = { repository: { full_name: 'owner/memory' }, ref: 'refs/heads/main' };
  await expect(webhook(await request(payload, false), service, config)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  for (const p of [{ ...payload, ref: 'refs/heads/other' }, { ...payload, repository: { full_name: 'other/repo' } }]) {
    expect(await (await webhook(await request(p), service, config)).json()).toMatchObject({ status: 'ignored' });
  }
  expect(versions.reads).toBe(0);
});
it('old and duplicate pushes publish current HEAD without making commits', async () => {
  const versions = new Versions(), objects = new Objects(), service = new MemoryService(objects, versions);
  versions.state.files['works/infra/network/CONTEXT.md'] = {
    content: makeContext({ id: ID, path: 'works/infra/network', title: 'Latest', aliases: [], tags: [], status: 'active' }, ''), revision: 'latest',
  };
  for (let i = 0; i < 2; i++) {
    await webhook(await request({ repository: { full_name: 'owner/memory' }, ref: 'refs/heads/main', after: 'historical' }), service, config);
  }
  expect((await service.listMemories()).topics[0].title).toBe('Latest');
  expect(versions.commits).toBe(0);
  expect(await objects.get('_current.json')).not.toBeNull();
});
