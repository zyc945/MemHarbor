import { it, expect } from 'vitest';
import { FILES } from '../src/domain/types';
import { pathSchema, topicSchema } from '../src/domain/schemas';
import { memoryLocation } from '../src/domain/paths';
import { MemoryService } from '../src/memory/service';
import { moveContext } from '../src/memory/parser';
import { Objects, Versions, OTHER_ID } from './fakes';
function setup() {
  const objects = new Objects(), versions = new Versions();
  return { objects, versions, service: new MemoryService(objects, versions) };
}
it('separates UUID validation from Unicode path validation', () => {
  for (const path of ['works/infra/network', '工作/基础设施/网络', '个人/家庭/吉姆', '日本語/メモ',
    '한국어/기억', 'العربية/ذاكرة', 'हिन्दी/यादें', 'Ελληνικά/Σημειώσεις', 'Works/Infra', '𠮷'.repeat(64), 'single', 'topics/legacy'])
    expect(pathSchema.safeParse(path).success, path).toBe(true);
  for (const path of ['', '/a', 'a/', 'a//b', 'a/../b', 'a/./b', 'a\\b', 'a/%2e', 'a/\u0301', 'a/\u200b', 'a/\u202eabc', 'a/\0', 'a/\n', 'a/ b', 'a/😀', 'a／b', '𠮷'.repeat(65), 'a/'.repeat(512) + 'a'])
    expect(pathSchema.safeParse(path).success, path).toBe(false);
  expect(topicSchema.safeParse('works/infra/network').success).toBe(false);
  expect(topicSchema.safeParse(OTHER_ID).success).toBe(true);
  expect(memoryLocation('single/STATE.md')).toEqual({ path: 'single', file: 'STATE.md' });
});
it('creates unique server IDs and resolves NFC paths without GitHub reads', async () => {
  const { service, versions } = setup();
  const a = await service.createMemory({ path: '工作/cafe\u0301', title: '网络' });
  const b = await service.createMemory({ path: 'personal/network', title: '网络' });
  expect(a.id).not.toBe(b.id);
  expect(topicSchema.safeParse(a.id).success).toBe(true);
  expect(a.path).toBe('工作/café');
  const reads = versions.reads;
  expect(await service.resolveMemory({ path: '工作/cafe\u0301' })).toMatchObject({ id: a.id, path: a.path });
  expect((await service.loadContext({ topic: a.id, mode: 'full' })).path).toBe(a.path);
  expect((await service.searchMemories({ query: '工作/café' })).topics[0].id).toBe(a.id);
  expect(versions.reads).toBe(reads);
  await expect(service.createMemory({ path: a.path, title: 'Duplicate' })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(service.createMemory({ id: OTHER_ID, path: 'new', title: 'Caller ID' })).rejects.toThrow();
  await expect(service.loadContext({ topic: a.path })).rejects.toMatchObject({ code: 'INVALID_TOPIC' });
});
it('moves only direct files in one commit and keeps UUID-based references valid', async () => {
  const { service, versions, objects } = setup();
  const parent = await service.createMemory({ path: 'works/infra', title: 'Infra' });
  const child = await service.createMemory({ path: 'works/infra/network', title: 'Network' });
  const original = await service.loadContext({ topic: parent.id, mode: 'full' });
  const count = versions.commits;
  const moved = await service.moveMemory({ topic: parent.id, path: '工作/基础设施', expected_commit: versions.state.commit, reason: 'Organize' });
  expect(moved).toMatchObject({ status: 'moved', published: true, id: parent.id });
  expect(versions.commits).toBe(count + 1);
  const loaded = await service.loadContext({ topic: parent.id, mode: 'full' });
  expect(loaded.path).toBe('工作/基础设施');
  expect(loaded.files['STATE.md']).toBe(original.files['STATE.md']);
  expect(loaded.files['CONTEXT.md']).toContain('id: ' + parent.id);
  expect(loaded.files['CONTEXT.md']).toContain('path: 工作/基础设施');
  expect(await objects.get('works/infra/_meta.json')).toBeNull();
  expect((await service.loadContext({ topic: child.id })).path).toBe(child.path);
  await expect(service.resolveMemory({ path: parent.path })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const state = await service.readMemoryFile({ topic: parent.id, file: 'STATE.md' });
  await service.updateMemory({ topic: parent.id, file: 'STATE.md', content: 'Updated after move', reason: 'test', expected_revision: state.revision });
  expect(versions.state.files['工作/基础设施/STATE.md'].content).toBe('Updated after move');
  await service.deleteMemory(parent.id, versions.state.commit);
  expect((await service.loadContext({ topic: child.id })).id).toBe(child.id);
});
it('rejects stale moves and occupied destinations; retries a completed move as noop', async () => {
  const { service, versions } = setup();
  const a = await service.createMemory({ path: 'a', title: 'A' });
  await service.createMemory({ path: 'b', title: 'B' });
  await expect(service.moveMemory({ topic: a.id, path: 'c', expected_commit: a.git_commit, reason: 'stale' })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(service.moveMemory({ topic: a.id, path: 'b', expected_commit: versions.state.commit, reason: 'occupied' })).rejects.toMatchObject({ code: 'CONFLICT' });
  const input = { topic: a.id, path: 'c', expected_commit: versions.state.commit, reason: 'move' };
  await service.moveMemory(input);
  const count = versions.commits;
  expect(await service.moveMemory(input)).toMatchObject({ status: 'noop', published: true });
  expect(versions.commits).toBe(count);
});
it('recovers a committed move after publication failure without duplicating commits', async () => {
  const { service, objects, versions } = setup();
  const a = await service.createMemory({ path: 'a', title: 'A' });
  const input = { topic: a.id, path: 'b', expected_commit: a.git_commit, reason: 'move' };
  objects.fail = true;
  expect(await service.moveMemory(input)).toMatchObject({ status: 'committed_not_published' });
  objects.fail = false;
  expect(await service.moveMemory(input)).toMatchObject({ status: 'noop', published: true });
  expect(versions.commits).toBe(2);
  expect((await service.loadContext({ topic: a.id })).path).toBe('b');
});
it('rejects changing UUID or path through normal content updates', async () => {
  const { service, versions } = setup();
  const a = await service.createMemory({ path: 'a', title: 'A' });
  const original = await service.readMemoryFile({ topic: a.id, file: 'CONTEXT.md' });
  for (const content of [original.content.replace(a.id, OTHER_ID), original.content.replace('path: a', 'path: b')]) {
    await expect(service.updateMemory({ topic: a.id, file: 'CONTEXT.md', content, reason: 'bad', expected_revision: original.revision })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
    await expect(service.checkpointMemory({ topic: a.id, files: { 'CONTEXT.md': content }, reason: 'bad', expected_commit: a.git_commit })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  }
  expect(versions.commits).toBe(1);
});
it('rejects duplicate UUIDs, mismatched paths, non-NFC and legacy YAML before publication', async () => {
  for (const kind of ['duplicate', 'mismatch', 'nfd-path', 'nfd-yaml', 'legacy']) {
    const { service, versions, objects } = setup();
    const a = await service.createMemory({ path: '工作/café', title: 'A' });
    const before = structuredClone(objects.data);
    const key = a.path + '/CONTEXT.md', value = versions.state.files[key];
    if (kind === 'duplicate') versions.state.files['copy/CONTEXT.md'] = { ...value, content: moveContext(value.content, 'copy') };
    if (kind === 'mismatch') value.content = moveContext(value.content, 'other');
    if (kind === 'nfd-path') versions.state.files[key.normalize('NFD')] = value;
    if (kind === 'nfd-yaml') value.content = value.content.replace(a.path, a.path.normalize('NFD'));
    if (kind === 'legacy') value.content = value.content.replace(a.id, a.path).replace('path: ' + a.path + '\n', '');
    await expect(service.reconcileAll()).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
    expect(objects.data).toEqual(before);
  }
});
it('reconciles a manual move preserving identity and unrelated objects', async () => {
  const { service, versions, objects } = setup();
  const a = await service.createMemory({ path: 'old/location', title: 'A' });
  for (const name of FILES) {
    const value = versions.state.files[a.path + '/' + name];
    versions.state.files['new/location/' + name] = { ...value, content: name === 'CONTEXT.md' ? moveContext(value.content, 'new/location') : value.content };
    delete versions.state.files[a.path + '/' + name];
  }
  await objects.put('old/location/notes.txt', 'unrelated');
  versions.state.commit = 'manual';
  await service.reconcileAll();
  expect((await service.loadContext({ topic: a.id })).path).toBe('new/location');
  expect(await objects.get('old/location/CONTEXT.md')).toBeNull();
  expect((await objects.get('old/location/notes.txt'))?.content).toBe('unrelated');
});
it('refuses mixed index/metadata identities during publication', async () => {
  const { service, objects } = setup();
  const a = await service.createMemory({ path: 'a', title: 'A' });
  const key = JSON.parse((await objects.get('_current.json'))!.content).key;
  const manifest = JSON.parse((await objects.get(key))!.content);
  manifest.metadata[a.id].topic = OTHER_ID;
  await objects.put(key, JSON.stringify(manifest));
  await expect(service.loadContext({ topic: a.id })).rejects.toMatchObject({ code: 'PUBLISH_ERROR' });
});

it('allows parent creation after child and deletes only the parent files', async () => {
  const { service, versions } = setup();
  const child = await service.createMemory({ path: 'works/infra/network', title: 'Child' });
  const parent = await service.createMemory({ path: 'works/infra', title: 'Parent' });
  await service.deleteMemory(parent.id, versions.state.commit);
  expect((await service.loadContext({ topic: child.id })).path).toBe(child.path);
  expect((await service.listMemories()).topics.map(t => t.id)).toEqual([child.id]);
});
it('requires reconcile to upgrade a legacy R2 index', async () => {
  const { service, objects } = setup();
  await objects.put('_index.json', JSON.stringify({ schema_version: 1, topics: [] }));
  await expect(service.listMemories()).rejects.toMatchObject({ code: 'PUBLISH_ERROR' });
  await service.reconcileAll();
  expect((await service.listMemories()).topics).toEqual([]);
  expect(JSON.parse((await objects.get('_current.json'))!.content).schema_version).toBe(3);
});
