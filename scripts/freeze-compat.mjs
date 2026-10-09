import { writeFile } from 'node:fs/promises';
import { legacy } from './legacy.mjs';
const old = await legacy();
try {
  const { MemoryService, Objects, Versions, makeContext, ID, OTHER_ID, rest } = old.module;
  const objects = new Objects(), versions = new Versions();
  for (const [id, path, status] of [[ID, '工作/café', 'active'], [OTHER_ID, 'archive', 'archived']]) {
    const entry = { id, path, status, title: 'network', aliases: ['网络'], tags: ['infra'] };
    for (const name of ['CONTEXT.md', 'STATE.md', 'DECISIONS.md', 'TODO.md', 'SOURCES.md']) {
      const content = name === 'CONTEXT.md' ? makeContext(entry, 'Synthetic context') : '\ufeff# Synthetic\n\nnetwork rollback fixture\n';
      versions.state.files[path + '/' + name] = { content, revision: id + '-' + name };
    }
  }
  const service = new MemoryService(objects, versions);
  await service.reconcileAll();
  const list = await service.listMemories({ limit: 1 });
  const search = await service.searchMemories({ query: 'network', limit: 1 });
  const ignored = await rest(new Request('https://example.test/api/v1/topics?q=network&status=paused&path_prefix=missing'), service, 'read');
  const fixture = { commit: 'faa989e20ed5c83d715f2937b3a3fcc7d78ea81a', state: versions.state,
    objects: [...objects.data], list, search, ignored: await ignored.json(), full: await service.loadContext({ topic: ID, mode: 'full' }) };
  await writeFile('test/fixtures/compatibility.json', JSON.stringify(fixture, null, 2) + '\n');
  console.log('Frozen synthetic requests, results, snapshot and cursors from previous program.');
} finally { await old.close(); }
