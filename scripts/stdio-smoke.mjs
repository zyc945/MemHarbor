import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
for (const args of [[], ['--check'], ['--demo'], ['--demo', '--check']]) {
  const invalid = spawnSync(process.execPath, ['dist/local/main.mjs', ...args], {
    env: { PATH: process.env.PATH, MEMORY_ACCESS: 'invalid' }, encoding: 'utf8', timeout: 10000
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.equal(JSON.parse(invalid.stderr).error, 'INVALID_CONTENT');
}
for (const access of [undefined, 'read', 'write']) {
  const checked = spawnSync(process.execPath, ['dist/local/main.mjs', '--demo', '--check'], {
    env: { PATH: process.env.PATH, ...(access === undefined ? {} : { MEMORY_ACCESS: access }) },
    encoding: 'utf8', timeout: 10000
  });
  assert.equal(checked.status, 0);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.ready, true);
  assert.equal(result.synthetic, true);
  assert.equal(result.read_verified, true);
  assert.equal(result.write_verified, false);
}
for (const access of ['read', 'write']) {
  const client = new Client({ name: 'isolated-stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/local/main.mjs', '--demo'],
    env: { PATH: process.env.PATH, MEMORY_ACCESS: access, MEMORY_CONTENT_SEARCH: 'true' }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 9);
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, JSON.stringify(result.structuredContent)); return result.structuredContent;
    };
    const listed = await call('list_memories');
    assert.equal(listed.total, 1);
    const topic = listed.topics[0].id;
    const full = await call('load_context', { topic, mode: 'full' });
    assert.ok(full.files['CONTEXT.md']);
    const limited = await call('load_context', { topic, max_bytes: 100 });
    assert.ok(!('files' in limited)); assert.ok(limited.coverage.returned_bytes <= 100);
    let searched;
    for (let i = 0; i < 20; i++) {
      searched = await client.callTool({ name: 'search_memories', arguments: { query: 'migration', scope: 'content' } });
      if (!searched.isError) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(!searched.isError); assert.equal(searched.structuredContent.total, 1);
    const created = await client.callTool({ name: 'create_memory', arguments: { path: 'test/新建', title: 'New synthetic memory',
      files: { 'CONTEXT.md': 'Synthetic background', 'STATE.md': 'Not started', 'DECISIONS.md': 'Keep this decision',
        'TODO.md': '- [ ] First step', 'SOURCES.md': 'Synthetic source' } } });
    if (access === 'read') assert.equal(created.structuredContent.error, 'FORBIDDEN');
    else {
      assert.ok(!created.isError); assert.equal(created.structuredContent.published, true);
      const id = created.structuredContent.id;
      const before = await call('load_context', { topic: id, mode: 'full' });
      assert.equal(Object.keys(before.files).length, 5);
      const checkpoint = await call('checkpoint_memory', { topic: id, expected_commit: before.git_commit,
        reason: 'Synthetic progress', files: { 'STATE.md': 'First step complete', 'TODO.md': '- [x] First step\n- [ ] Next step' } });
      assert.equal(checkpoint.published, true);
      const after = await call('load_context', { topic: id, mode: 'full' });
      assert.ok(after.files['STATE.md'] === 'First step complete');
      for (const file of ['CONTEXT.md', 'DECISIONS.md', 'SOURCES.md']) assert.ok(after.files[file] === before.files[file]);
      assert.equal((await call('resolve_memory', { path: 'test/新建' })).id, id);
      assert.equal((await call('load_context', { topic: id })).git_commit, after.git_commit);
      const value = await call('read_memory_file', { topic, file: 'STATE.md' });
      const update = await call('update_memory', { topic, file: 'STATE.md', content: 'Verified synthetic update', expected_revision: value.revision, reason: 'Smoke' });
      assert.equal(update.published, true);
      assert.equal((await call('load_context', { topic })).files['STATE.md'], 'Verified synthetic update');
    }
  } finally { await client.close(); await transport.close(); }
}
console.log('PASS: isolated Node stdio official-client discovery, permissions, search, budget and complete read/write loop.');
