import { it, expect } from 'vitest';
import { MemoryService } from '../src/memory/service';
import { Objects, Versions, ID } from './fakes';
import { makeContext } from '../src/memory/parser';
export async function setup() {
  const objects = new Objects(), versions = new Versions(), service = new MemoryService(objects, versions);
  versions.state.files = {
    'topics/test/CONTEXT.md': { content: makeContext({ id: ID, path: 'topics/test', title: 'Test', status: 'active', tags: [], aliases: [] }, ''), revision: 'context' },
    'topics/test/STATE.md': { content: 'old', revision: 'old' },
  };
  await service.reconcileAll();
  return { objects, versions, service };
}
const update = { topic: ID, file: 'STATE.md', content: 'new', reason: 'test', expected_revision: 'old' };
it('commits before publishing and rejects stale revisions', async () => {
  const { service, versions } = await setup();
  expect(await service.updateMemory(update)).toMatchObject({ status: 'updated', published: true });
  expect(versions.commits).toBe(1);
  await expect(service.updateMemory({ ...update, content: 'different' })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await service.readMemoryFile({ topic: ID, file: 'STATE.md' })).content).toBe('new');
});
it('does not duplicate commits after failed publishing', async () => {
  const { service, objects, versions } = await setup();
  objects.fail = true;
  expect(await service.updateMemory(update)).toMatchObject({ status: 'committed_not_published', published: false });
  objects.fail = false;
  expect(await service.updateMemory(update)).toMatchObject({ status: 'noop', published: true });
  expect(versions.commits).toBe(1);
});
it('GitHub failure leaves R2 unchanged; invalid input never commits', async () => {
  const { service, objects, versions } = await setup();
  const before = structuredClone(objects.data);
  versions.fail = true;
  await expect(service.updateMemory(update)).rejects.toThrow();
  expect(objects.data).toEqual(before);
  versions.fail = false;
  for (const invalid of [{ ...update, file: '../x' }, { ...update, content: '中'.repeat(100000) }])
    await expect(service.updateMemory(invalid)).rejects.toThrow();
  expect(versions.commits).toBe(0);
});
it('creates five files in one commit and rejects duplicate topics', async () => {
  const { service, versions } = await setup();
  const input = { path: 'new', title: '新主题', initial_context: 'hello' };
  const created = await service.createMemory(input);
  expect(created).toMatchObject({ status: 'created', published: true });
  expect(versions.commits).toBe(1);
  expect(Object.keys((await service.loadContext({ topic: created.id, mode: 'full' })).files)).toHaveLength(5);
  await expect(service.createMemory(input)).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('checkpoint is atomic, detects stale commits and validates all files first', async () => {
  const { service, versions } = await setup();
  const input = { topic: ID, reason: 'checkpoint', expected_commit: 'c0', files: { 'STATE.md': 'new', 'TODO.md': '# TODO' } };
  expect(await service.checkpointMemory(input)).toMatchObject({ status: 'checkpointed', published: true });
  expect(versions.commits).toBe(1);
  expect(await service.checkpointMemory(input)).toMatchObject({ status: 'noop' });
  await expect(service.checkpointMemory({ ...input, files: { 'STATE.md': 'later' } })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(service.checkpointMemory({ ...input, expected_commit: 'c1', files: { 'STATE.md': 'valid', 'CONTEXT.md': 'bad' } }))
    .rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  expect(versions.commits).toBe(1);
});
it('deletes only canonical topic files with concurrency protection', async () => {
  const { service, versions, objects } = await setup();
  await expect(service.deleteMemory(ID, 'stale')).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await service.deleteMemory(ID, 'c0')).toMatchObject({ status: 'deleted', published: true });
  expect(versions.commits).toBe(1);
  expect(await objects.list('topics/test/')).toEqual([]);
});
