import { it, expect } from 'vitest';
import { MemoryService } from '../src/memory/service';
import { Objects, Versions } from './fakes';
import { blocks, bytes, clip } from '../src/memory/blocks';
import { rest } from '../src/http/rest';
import { searchKey, buildIndex } from '../src/memory/content-search';
import { readSnapshot } from '../src/r2/snapshot';
async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function fixture(enabled = true) {
  const objects = new Objects(), versions = new Versions();
  const service = new MemoryService(objects, versions, 262144, undefined, { contentSearch: enabled });
  const a = await service.createMemory({ path: '项目/正式', title: 'Deploy', files: { 'DECISIONS.md': '# Evidence\n\n星际回滚 capsule café\n\n```text\n# not a heading\n```\n' } });
  const b = await service.createMemory({ path: '项目/旧版', title: 'Deploy', status: 'archived', files: { 'STATE.md': '# State\n\n星际回滚 capsule café\n' } });
  return { objects, versions, service, a, b };
}
it('keeps body indexing off and out of canonical publication even when enabled', async () => {
  const { service, objects, a } = await fixture(false);
  expect(a.published).toBe(true);
  expect(await objects.list('_search/')).toEqual([]);
  await expect(service.searchMemories({ query: 'capsule', scope: 'content' })).rejects.toMatchObject({ details: { reason: 'disabled' } });
  await expect(service.buildSearchIndex()).rejects.toMatchObject({ details: { reason: 'disabled' } });
  expect((await service.searchMemories({ query: 'capsule' })).total).toBe(0);
  const enabled = await fixture();
  expect(enabled.a.published).toBe(true);
  await expect(enabled.service.searchMemories({ query: 'capsule', scope: 'content' })).rejects.toMatchObject({ details: { reason: 'missing' } });
});
it('ranks body evidence, preserves metadata ordering, filters before pagination and pins old indexes', async () => {
  const { service, a, b } = await fixture();
  await service.buildSearchIndex();
  for (const query of ['星际回滚', '回滚', '星', 'cafe\u0301', 'capsule café']) {
    const result = await service.searchMemories({ query, scope: 'content', include_archived: false });
    expect(result.topics.map(t => t.id)).toEqual([a.id]);
    expect(result).toMatchObject({ search_scope: 'content', topics: [{ matches: [{ file: 'DECISIONS.md', start_line: 3, excerpt: '星际回滚 capsule café' }] }] });
  }
  const first = await service.searchMemories({ query: 'capsule', scope: 'all', limit: 1 });
  expect(first.total).toBe(2);
  await service.createMemory({ path: 'new', title: 'capsule' });
  const second = await service.searchMemories({ query: 'capsule', scope: 'all', limit: 1, cursor: first.next_cursor! });
  expect(second.git_commit).toBe(first.git_commit);
  expect(new Set([...first.topics, ...second.topics].map(t => t.id))).toEqual(new Set([a.id, b.id]));
  await service.buildSearchIndex();
  const metadata = await service.searchMemories({ query: 'Deploy' });
  const all = await service.searchMemories({ query: 'Deploy', scope: 'all' });
  expect(all.topics.map(t => t.id)).toEqual(metadata.topics.map(t => t.id));
  expect((await service.searchMemories({ query: 'capsule', scope: 'content', path_prefix: '项目/正式' })).total).toBe(1);
  expect((await service.searchMemories({ query: 'unknown zeppelin', scope: 'content' })).total).toBe(0);
  await expect(service.searchMemories({ query: 'Deploy', scope: 'metadata', status: 'archived', include_archived: false })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
});
it('rejects missing/corrupt/mismatched/oversized/cancelled indexes without affecting base reads', async () => {
  const { service, objects, a } = await fixture();
  const pointer = (await objects.get('_current.json'))!.content;
  await Promise.all([service.buildSearchIndex(), service.buildSearchIndex()]);
  const { snapshot } = await readSnapshot(objects), key = searchKey(snapshot.git_commit);
  const good = (await objects.get(key))!.content;
  for (const content of ['{', good.replace(snapshot.git_commit, 'wrong')]) {
    await objects.put(key, content);
    await expect(service.searchMemories({ query: 'capsule', scope: 'content' })).rejects.toMatchObject({ code: 'PUBLISH_ERROR', details: { component: 'search_index' } });
    expect((await service.loadContext({ topic: a.id })).files['STATE.md']).toBeTruthy();
  }
  await objects.delete(key);
  await expect(buildIndex(objects, snapshot, { inputBytes: 1, outputBytes: 1, blocks: 1 })).rejects.toThrow();
  await expect(buildIndex(objects, snapshot, undefined, AbortSignal.abort())).rejects.toThrow();
  expect(await objects.get(key)).toBeNull();
  expect((await objects.get('_current.json'))!.content).toBe(pointer);
});
it('parses fenced code, repeated headings and complete lists without corrupting Unicode clips', async () => {
  const source = '---\nid: hidden\n---\n前言\n\n# Same\n\n- one\n  continued\n- two\n\n```md\n# fake\n\nend\n```\n\n# Same\n\n末尾😀';
  const parsed = await blocks(source, true);
  expect(parsed[0]).toMatchObject({ start_line: 4, content: '前言' });
  expect(parsed.some(b => b.content === '- one\n  continued\n- two')).toBe(true);
  expect(parsed.some(b => b.content === '```md\n# fake\n\nend\n```')).toBe(true);
  expect(parsed.at(-1)?.heading_path).toEqual(['Same [2]']);
  const list = '- run\n  ```sh\n  echo synthetic\n  ```\n- verify';
  expect((await blocks(list)).map(b => b.content)).toEqual([list]);
  for (let n = 0; n < 14; n++) { const result = clip('中文😀末尾', n); expect(bytes(result.excerpt)).toBeLessThanOrEqual(n); expect(result.excerpt).not.toContain('�'); }
});
it.each([
  '- ```sh\n  echo one\n\n\n  echo two\n  ```',
  '1. run\n\n    ```sh\n    alpha\n\n\n    beta\n    ```\n\n2. verify',
  '- outer\n  10. ~~~text\n      # code heading\n\n\n      tail\n      ~~~',
  '10. run\n\n\t```sh\n\techo synthetic\n\n\n\t```',
  '- - ```sh\n    echo one\n\n\n    echo two\n    ```',
  '-\n\n  ```sh\n  echo one\n\n\n  echo two\n  ```',
])('keeps a list and its nested fences intact: %s', async list => {
  const parsed = await blocks('# Before\n\n' + list + '\n\n# After\n\nconstraint');
  expect(parsed.map(b => b.content)).toEqual(['# Before', list, '# After', 'constraint']);
  expect(parsed[1].heading_path).toEqual(['Before']);
  expect(parsed.at(-1)?.heading_path).toEqual(['After']);
  expect(parsed[1].end_line - parsed[1].start_line + 1).toBe(list.split('\n').length);
});
it('does not let an unclosed list fence consume a dedented section', async () => {
  const source = '- ```sh\n  echo synthetic\n\n# Outside\n\nconstraint';
  const parsed = await blocks(source);
  expect(parsed.at(-1)).toMatchObject({ heading_path: ['Outside'], content: 'constraint' });
});
it('does not select half of a list code fence under a context budget', async () => {
  const service = new MemoryService(new Objects(), new Versions());
  const list = '1. run\n\n    ```sh\n    alpha\n\n\n    beta\n    ```\n\n2. verify';
  const created = await service.createMemory({ path: 'probe', title: 'Synthetic', files: { 'STATE.md': list } });
  for (const max_bytes of [26, 60, 100]) {
    const response = await service.loadContext({ topic: created.id, max_bytes });
    const sections = response.sections.filter(s => s.file === 'STATE.md');
    expect(sections.length).toBeLessThanOrEqual(1);
    for (const section of sections) expect(section.content).toBe(list);
    expect(response.coverage.returned_bytes).toBeLessThanOrEqual(max_bytes);
  }
});
it('detects incomplete or altered index blocks and repairs them without changing canonical state', async () => {
  const { service, objects, versions, a } = await fixture();
  await service.buildSearchIndex();
  const { snapshot } = await readSnapshot(objects), key = searchKey(snapshot.git_commit);
  const good = (await objects.get(key))!.content, pointer = await objects.get('_current.json'), commits = versions.commits;
  for (const change of ['empty', 'missing', 'duplicate', 'content', 'location', 'order']) {
    const broken = JSON.parse(good);
    if (change === 'empty') broken.blocks = [];
    if (change === 'missing') broken.blocks.pop();
    if (change === 'duplicate') broken.blocks.push(broken.blocks[0]);
    if (change === 'content') broken.blocks[0].content = 'Altered synthetic content';
    if (change === 'location') broken.blocks[0].start_line++;
    if (change === 'order') broken.blocks.reverse();
    await objects.put(key, JSON.stringify(broken));
    await expect(service.searchMemories({ query: 'capsule', scope: 'content' }))
      .rejects.toMatchObject({ code: 'PUBLISH_ERROR', details: { component: 'search_index' } });
    expect((await service.loadContext({ topic: a.id })).files['STATE.md']).toBeTruthy();
    await Promise.all([service.buildSearchIndex(), service.buildSearchIndex()]);
    expect((await objects.get(key))!.content).toBe(good);
    expect((await service.searchMemories({ query: 'capsule', scope: 'content' })).total).toBe(2);
  }
  expect(await objects.get('_current.json')).toEqual(pointer); expect(versions.commits).toBe(commits);
});
it('keeps valid empty indexes usable and rejects malformed payloads and duplicate block IDs', async () => {
  const { service, objects, versions, a } = await fixture();
  const before = await service.loadContext({ topic: a.id, mode: 'full' });
  await service.deleteMemory((await service.listMemories()).topics.find(t => t.id !== a.id)!.id, before.git_commit);
  const context = before.files['CONTEXT.md'].slice(0, before.files['CONTEXT.md'].indexOf('\n---', 4) + 4) + '\n';
  await service.checkpointMemory({ topic: a.id, expected_commit: versions.state.commit, reason: 'Empty synthetic bodies',
    files: { 'CONTEXT.md': context, 'STATE.md': '', 'DECISIONS.md': '', 'TODO.md': '', 'SOURCES.md': '' } });
  await service.buildSearchIndex();
  expect((await service.searchMemories({ query: 'absent', scope: 'content' })).total).toBe(0);
  const full = await service.loadContext({ topic: a.id, mode: 'full' });
  await service.checkpointMemory({ topic: a.id, expected_commit: full.git_commit, reason: 'Synthetic body',
    files: { 'STATE.md': '# State\n\nfirst\n\nsecond' } });
  await service.buildSearchIndex();
  const { snapshot } = await readSnapshot(objects), key = searchKey(snapshot.git_commit);
  const index = JSON.parse((await objects.get(key))!.content);
  index.blocks[1].block_id = index.blocks[0].block_id;
  const { integrity: _integrity, ...payload } = index;
  index.integrity.sha256 = await sha256(JSON.stringify(payload));
  await objects.put(key, JSON.stringify(index));
  await expect(service.searchMemories({ query: 'first', scope: 'content' }))
    .rejects.toMatchObject({ details: { reason: 'invalid_blocks' } });
  await objects.put(key, '{');
  await expect(service.searchMemories({ query: 'first', scope: 'content' }))
    .rejects.toMatchObject({ details: { reason: 'corrupt' } });
});
it('builds v2 separately from v1 and preserves metadata cursor fingerprints', async () => {
  const { service, objects } = await fixture();
  const { snapshot } = await readSnapshot(objects), key = searchKey(snapshot.git_commit);
  const legacyKey = '_search/v1/' + encodeURIComponent(snapshot.git_commit) + '.json';
  await service.buildSearchIndex();
  const { integrity: _integrity, ...payload } = JSON.parse((await objects.get(key))!.content);
  await objects.put(legacyKey, JSON.stringify({ ...payload, version: 1 }));
  await objects.delete(key);
  const original = await objects.get(legacyKey);
  await expect(service.searchMemories({ query: 'capsule', scope: 'content' }))
    .rejects.toMatchObject({ details: { reason: 'missing' } });
  expect(await service.buildSearchIndex()).toMatchObject({ index_version: 2 });
  expect(key).toBe('_search/v2/' + encodeURIComponent(snapshot.git_commit) + '.json');
  expect(await objects.get(legacyKey)).toEqual(original);
  const metadata = await service.searchMemories({ query: 'Deploy', scope: 'metadata', path_prefix: '项目', limit: 1 });
  const cursor = JSON.parse(atob(metadata.next_cursor!.replace(/-/g, '+').replace(/_/g, '/')));
  expect(cursor.filter_hash).toBe(await sha256(JSON.stringify(['search-v1', 'Deploy', 'metadata', null, '项目', true, 1])));
  expect((await service.searchMemories({ query: 'Deploy', scope: 'metadata', path_prefix: '项目', limit: 1,
    cursor: metadata.next_cursor! })).topics).toHaveLength(1);
  const body = await service.searchMemories({ query: 'capsule', scope: 'content', limit: 1 });
  const previous = JSON.parse(atob(body.next_cursor!.replace(/-/g, '+').replace(/_/g, '/')));
  delete previous.filter_hash;
  previous.filter = JSON.stringify(['search-v1', 'capsule', 'content', null, null, true, 1]);
  await expect(service.searchMemories({ query: 'capsule', scope: 'content', limit: 1, cursor: btoa(JSON.stringify(previous)) }))
    .rejects.toMatchObject({ code: 'INVALID_CONTENT', details: { action: 'Restart the search without a cursor.', index_version: 2 } });
  expect((await service.searchMemories({ query: 'capsule', scope: 'content', limit: 1, cursor: body.next_cursor! })).topics).toHaveLength(1);
});
it('returns separate bounded sections and never truncates complete mode or accepts full budgets', async () => {
  const { service, a } = await fixture();
  const before = await service.loadContext({ topic: a.id, mode: 'decision' });
  for (const max_bytes of [1, 40, 100, 5000]) {
    const result = await service.loadContext({ topic: a.id, mode: 'decision', max_bytes });
    expect(result).not.toHaveProperty('files'); expect(result).not.toHaveProperty('revisions');
    const counted = result.sections.reduce((n, s) => n + bytes(s.heading_path.join('\n')) + bytes(s.content), 0);
    expect(counted).toBe(result.coverage.returned_bytes); expect(counted).toBeLessThanOrEqual(max_bytes);
    for (const section of result.sections) expect(before.files[section.file]).toContain(section.content);
  }
  expect((await service.loadContext({ topic: a.id, max_bytes: 1 })).coverage.partial).toBe(true);
  await expect(service.loadContext({ topic: a.id, mode: 'full', max_bytes: 100 })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  expect(await service.loadContext({ topic: a.id, mode: 'decision' })).toEqual(before);
});
it('omits oversized complete code blocks and returns bounded Unicode excerpts with readback locations', async () => {
  const { service, a } = await fixture();
  const before = await service.loadContext({ topic: a.id, mode: 'full' });
  const code = '```text\ncatapult ' + '😀'.repeat(800) + '\n```';
  await service.checkpointMemory({ topic: a.id, expected_commit: before.git_commit, reason: 'Large synthetic block', files: { 'STATE.md': '# Code\n\n' + code } });
  await service.buildSearchIndex();
  const result = await service.searchMemories({ query: 'catapult', scope: 'content' });
  expect(result).toMatchObject({ topics: [{ matches: [{ truncated: true, uri: 'memory://topics/' + a.id + '/STATE.md' }] }] });
  const budget = await service.loadContext({ topic: a.id, max_bytes: 256 });
  expect(budget.sections.every(s => !s.content.includes('catapult'))).toBe(true);
  expect(budget.coverage.partial).toBe(true);
  expect((await service.searchMemories({ query: 'catap', scope: 'content' })).total).toBe(0);
});
it('keeps public projection whitelisted and index maintenance write-only without Git/pointer changes', async () => {
  const { service, objects, versions } = await fixture();
  const before = (await objects.get('_current.json'))!.content, commits = versions.commits;
  const req = () => new Request('https://example.test/api/v1/admin/search-index', { method: 'POST', body: '{}' });
  await expect(rest(req(), service, 'read')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await (await rest(req(), service, 'write')).json()).toMatchObject({ status: 'search_indexed' });
  expect(versions.commits).toBe(commits); expect((await objects.get('_current.json'))!.content).toBe(before);
  const projection = await service.publicIndex();
  expect(projection.schema_version).toBe(1);
  expect(Object.keys(projection.topics[0]).sort()).toEqual(['aliases', 'path', 'status', 'tags', 'title', 'updated_at'].sort());
  expect(JSON.stringify(projection)).not.toMatch(/matches|revision|_snapshots|_search|capsule/);
  await expect(rest(new Request('https://example.test/api/v1/topics?q=Deploy&scope=metadata&include_archived=0'), service, 'read')).rejects.toThrow();
});
it('retains later valid edits during forward correction and noops do not refresh timestamps', async () => {
  const { service, versions, a } = await fixture();
  const before = await service.loadContext({ topic: a.id, mode: 'full' });
  await service.checkpointMemory({ topic: a.id, expected_commit: before.git_commit, reason: 'Independent valid result', files: { 'STATE.md': 'Valid later result' } });
  const latest = await service.loadContext({ topic: a.id, mode: 'full' });
  await expect(service.checkpointMemory({ topic: a.id, expected_commit: before.git_commit, reason: 'Stale correction', files: { 'DECISIONS.md': 'Corrected source S1' } })).rejects.toMatchObject({ code: 'CONFLICT' });
  await service.checkpointMemory({ topic: a.id, expected_commit: latest.git_commit, reason: 'Correct source S1 only', files: { 'DECISIONS.md': 'Corrected source S1' } });
  await service.buildSearchIndex();
  expect((await service.loadContext({ topic: a.id })).files['STATE.md']).toBe('Valid later result');
  const row = (await service.listMemories()).topics.find(t => t.id === a.id)!;
  const file = await service.readMemoryFile({ topic: a.id, file: 'DECISIONS.md' });
  const commits = versions.commits; versions.state.updatedAt = '2099-01-01T00:00:00Z';
  expect((await service.updateMemory({ topic: a.id, file: file.file, content: file.content, expected_revision: file.revision, reason: 'No change' })).status).toBe('noop');
  expect(versions.commits).toBe(commits);
  expect((await service.listMemories()).topics.find(t => t.id === a.id)!.updated_at).toBe(row.updated_at);
});
