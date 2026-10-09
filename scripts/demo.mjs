import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const entry = fileURLToPath(new URL('../dist/local/main.mjs', import.meta.url));
const args = process.argv.slice(2);
if (args.length) {
  if (args.length !== 2 || args[0] !== '--config' || !['codex', 'claude-code', 'cursor'].includes(args[1])) {
    console.error('Usage: npm run demo [-- --config codex|claude-code|cursor]');
    process.exitCode = 1;
  } else {
    const server = { command: process.execPath, args: [entry, '--demo'], env: { MEMORY_ACCESS: 'write' } };
    if (args[1] === 'codex') {
      console.log(`# Merge into your Codex config.toml; do not replace existing configuration.
[mcp_servers.memharbor-demo]
command = ${JSON.stringify(server.command)}
args = ${JSON.stringify(server.args)}
env = { MEMORY_ACCESS = "write" }`);
    } else {
      console.log(JSON.stringify({ mcpServers: { 'memharbor-demo': server } }, null, 2));
    }
    console.error('Demo only: no credentials, no persistent storage. Enable one MemHarbor connection at a time.');
  }
} else {
  const client = new Client({ name: 'memharbor-first-use', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--demo'],
    env: { MEMORY_ACCESS: 'write' }, stderr: 'pipe' });
  const call = async (name, arguments_ = {}) => {
    const result = await client.callTool({ name, arguments: arguments_ });
    assert.ok(!result.isError, `${name} failed.`);
    return result.structuredContent;
  };
  try {
    console.log('MemHarbor guided demo: synthetic data only; nothing is saved to GitHub.');
    await client.connect(transport);
    assert.ok((await client.listTools()).tools.length === 9, 'Expected nine memory tools.');
    console.log('1/5 Connected and discovered nine MCP tools.');
    const created = await call('create_memory', { path: 'practice/reading-list', title: 'Practice reading list', files: {
      'CONTEXT.md': 'Synthetic exercise: plan to read one technical book each week.',
      'STATE.md': 'No book selected. Reading has not started.',
      'DECISIONS.md': 'Start with networking fundamentals.',
      'TODO.md': '- [ ] Choose the first book\n- [ ] Read the first chapter',
      'SOURCES.md': 'Synthetic onboarding exercise; no external evidence.'
    } });
    assert.ok(created.published === true, 'Creation was not published.');
    const before = await call('load_context', { topic: created.id, mode: 'full' });
    assert.ok(Object.keys(before.files).length === 5, 'Expected five complete files.');
    console.log('2/5 Created a practice topic and read back all five files.');
    const state = 'Selected Computer Networks. Reading has not started.';
    const updated = await call('checkpoint_memory', { topic: created.id, expected_commit: before.git_commit,
      files: { 'STATE.md': state, 'TODO.md': '- [x] Choose the first book\n- [ ] Read the first chapter' },
      reason: 'Synthetic progress update' });
    assert.ok(updated.published === true, 'Update was not published.');
    const after = await call('load_context', { topic: created.id, mode: 'full' });
    assert.ok(after.files['STATE.md'] === state, 'Updated state did not match.');
    for (const file of ['CONTEXT.md', 'DECISIONS.md', 'SOURCES.md']) {
      assert.ok(after.files[file] === before.files[file], 'An unrelated file changed.');
    }
    console.log('3/5 Updated progress and verified unrelated files were preserved.');
    const found = await call('search_memories', { query: 'Practice reading list' });
    assert.ok(found.topics.some(topic => topic.id === created.id), 'Could not find the saved topic.');
    assert.ok((await call('load_context', { topic: created.id })).git_commit === after.git_commit, 'A read changed the commit.');
    console.log('4/5 Found the same topic again; reading did not create a commit.');
  } catch {
    console.error('Demo failed. Run npm ci and npm run test:stdio; see README.md#optional-service-demo.');
    process.exitCode = 1;
  } finally {
    await client.close();
    await transport.close();
  }
  if (!process.exitCode) {
    console.log('5/5 Closed the demo. Its temporary data has now been discarded.');
    console.log('To get your agent configuration: node scripts/demo.mjs --config codex');
    console.log('Use claude-code or cursor instead of codex for those clients. Follow README.md#optional-service-demo.');
  }
}
