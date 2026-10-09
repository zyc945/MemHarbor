import { it, expect } from 'vitest';
import { MemoryService } from '../src/memory/service';
import { makeContext } from '../src/memory/parser';
import { Objects, Versions, ID } from './fakes';
function fixture() {
  const objects = new Objects(), versions = new Versions(), service = new MemoryService(objects, versions);
  versions.state.files = {
    'topics/test/CONTEXT.md': { content: makeContext({ id: ID, path: 'topics/test', title: 'Test', status: 'active', aliases: [], tags: [] }, ''), revision: 'a' },
    'topics/test/STATE.md': { content: 'current', revision: 'b' },
  };
  return { objects, versions, service };
}
it('bootstraps empty R2 and repairs missing blobs and retains old and unrelated objects', async () => {
  const { objects, service } = fixture();
  await service.reconcileAll();
  await objects.delete('_blobs/b');
  await objects.put('topics/test/CONTEXT.md', 'stale');
  await objects.put('topics/test/_meta.json', '{broken');
  await objects.put('_index.json', '{broken');
  await objects.put('topics/deleted/STATE.md', 'stale');
  await objects.put('topics/test/EXTRA.md', 'stale');
  await service.reconcileTopic(ID);
  expect((await service.loadContext({ topic: ID })).files['STATE.md']).toBe('current');
  expect((await service.listMemories()).topics).toHaveLength(1);
  expect(await objects.list('topics/deleted/')).toHaveLength(1);
  expect((await objects.get('topics/test/EXTRA.md'))?.content).toBe('stale');
});
it('rechecks HEAD and repairs a concurrent commit during publication', async () => {
  const { objects, versions, service } = fixture();
  const put = objects.put.bind(objects);
  let changed = false;
  objects.put = async (...args) => {
    await put(...args);
    if (!changed) {
      changed = true;
      await versions.commitFiles(await versions.snapshot(), { 'topics/test/STATE.md': 'concurrent' });
    }
  };
  await service.reconcileAll();
  expect((await service.loadContext({ topic: ID })).files['STATE.md']).toBe('concurrent');
});
it('validates canonical content before touching R2', async () => {
  const { objects, versions, service } = fixture();
  await service.reconcileAll();
  const before = structuredClone(objects.data);
  versions.state.files['topics/test/CONTEXT.md'].content = 'invalid front matter';
  await expect(service.reconcileAll()).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  expect(objects.data).toEqual(before);
});
