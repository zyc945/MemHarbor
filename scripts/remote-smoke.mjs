import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

if (process.env.MEMORY_REMOTE_TEST !== '1') {
  throw new Error('Remote mutations are disabled. Set MEMORY_REMOTE_TEST=1 for an isolated test deployment.');
}
const required = ['MEMORY_BASE_URL', 'MEMORY_WRITE_TOKEN', 'MEMORY_READ_TOKEN', 'GITHUB_OWNER',
  'GITHUB_REPO', 'GITHUB_TOKEN', 'GITHUB_WEBHOOK_SECRET'];
for (const name of required) if (!process.env[name]) throw new Error('Missing environment variable: ' + name);
const base = new URL(process.env.MEMORY_BASE_URL);
if (base.protocol !== 'https:') throw new Error('Remote acceptance requires HTTPS.');
const branch = process.env.GITHUB_BRANCH ?? 'main';
let memoryPath = 'acceptance/smoke-' + randomUUID();
let topic;
const apiBase = 'https://api.github.com/repos/' + encodeURIComponent(process.env.GITHUB_OWNER) + '/' + encodeURIComponent(process.env.GITHUB_REPO);
async function github(path, method = 'GET', body) {
  const response = await fetch(apiBase + path, { method, headers: {
    Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json', 'User-Agent': 'memory-acceptance',
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(response.ok, true, 'GitHub request failed: ' + response.status);
  return response.json();
}
async function rest(path, method = 'GET', body, token = process.env.MEMORY_WRITE_TOKEN) {
  return fetch(new URL(path, base), { method, headers: {
    Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const client = new Client({ name: 'remote-acceptance-agent', version: '1.0.0' });
let created = false;
try {
  assert.equal((await github('')).private, true, 'Use a private test data repository.');
  assert.equal((await rest('/api/v1/topics', 'POST', {}, process.env.MEMORY_READ_TOKEN)).status, 403);
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), {
    requestInit: { headers: { Authorization: 'Bearer ' + process.env.MEMORY_WRITE_TOKEN } },
  }));
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError ?? false, false, 'MCP tool failed: ' + name);
    return result.structuredContent;
  };
  assert.equal((await client.listTools()).tools.length, 9);
  const initial = await call('create_memory', { path: memoryPath, title: 'Remote acceptance', aliases: ['远程验收'], status: 'active', files: {
    'CONTEXT.md': 'Disposable test data.', 'STATE.md': '# State\nInitial',
    'DECISIONS.md': '# Decisions\nIsolated acceptance only.', 'TODO.md': '# TODO\nVerify', 'SOURCES.md': '# Sources\nRemote smoke test',
  } });
  topic = initial.id;
  created = true;
  assert.equal(initial.published, true);
  assert.equal((await github('/git/commits/' + initial.git_commit)).parents.length, 1);
  assert.equal((await call('load_context', { topic, mode: 'full' })).files['STATE.md'], '# State\nInitial');
  const page = await call('list_memories', { path_prefix: memoryPath, limit: 1 });
  assert.equal(page.total, 1);
  assert.equal(page.next_cursor, null);
  const read = await call('read_memory_file', { topic, file: 'STATE.md' });
  const update = { topic, file: 'STATE.md', content: '# State\nUpdated', reason: 'Remote acceptance', expected_revision: read.revision };
  const updated = await call('update_memory', update);
  assert.equal(updated.published, true);
  assert.equal((await call('update_memory', update)).status, 'noop');
  const stale = await client.callTool({ name: 'update_memory', arguments: { ...update, content: 'Stale' } });
  assert.equal(stale.structuredContent.error, 'CONFLICT');
  const checkpoint = await call('checkpoint_memory', {
    topic, reason: 'Remote atomic checkpoint', expected_commit: updated.git_commit,
    files: { 'STATE.md': '# State\nCheckpoint', 'TODO.md': '# TODO\n- [x] Verified', 'DECISIONS.md': '# Decisions\nAtomic writes.' },
  });
  assert.equal(checkpoint.published, true);
  assert.deepEqual((await github('/git/commits/' + checkpoint.git_commit)).parents.map(p => p.sha), [updated.git_commit]);
  memoryPath += '-moved';
  const moved = await call('move_memory', { topic, path: memoryPath, reason: 'Remote move', expected_commit: checkpoint.git_commit });
  assert.equal(moved.id, topic);
  assert.equal(moved.published, true);
  assert.equal((await call('resolve_memory', { path: memoryPath })).id, topic);
  assert.equal((await client.readResource({ uri: 'memory://topics/' + topic + '/STATE.md' })).contents[0].text, '# State\nCheckpoint');
  const path = '/contents/' + memoryPath + '/STATE.md';
  const current = await github(path + '?ref=' + encodeURIComponent(branch));
  const manual = '# State\nManual GitHub change';
  await github(path, 'PUT', { message: 'memory(' + topic + '): Manual webhook acceptance',
    branch, sha: current.sha, content: Buffer.from(manual).toString('base64') });
  let converged = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await client.callTool({ name: 'read_memory_file', arguments: { topic, file: 'STATE.md' } });
    if (!result.isError && result.structuredContent.content === manual) { converged = true; break; }
    if (result.isError) assert.ok(['PUBLISH_ERROR', 'NOT_FOUND'].includes(result.structuredContent?.error),
      'Unexpected memory read failure during webhook verification.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.equal(converged, true, 'Real GitHub push webhook did not publish within 30 seconds.');
  const payload = JSON.stringify({
    repository: { full_name: process.env.GITHUB_OWNER + '/' + process.env.GITHUB_REPO },
    ref: 'refs/heads/' + branch, after: initial.git_commit,
  });
  const signature = 'sha256=' + createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');
  for (let i = 0; i < 2; i++) {
    const response = await fetch(new URL('/webhooks/github', base), { method: 'POST', body: payload,
      headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-Hub-Signature-256': signature } });
    assert.equal(response.status, 200);
  }
  assert.equal((await call('read_memory_file', { topic, file: 'STATE.md' })).content, manual);
  assert.equal((await rest('/api/v1/admin/reconcile', 'POST', { all: true })).status, 200);
  assert.equal((await call('search_memories', { query: topic })).topics[0].id, topic);
  console.log('PASS: private GitHub commits, remote publication, MCP Agent, conflicts, checkpoint, real push webhook and replay.');
} finally {
  if (created) {
    const ref = await github('/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/'));
    const response = await rest('/api/v1/topics/' + topic, 'DELETE', { expected_commit: ref.object.sha });
    const result = await response.json();
    if (!response.ok || !result.published) console.error('Cleanup needs attention for test topic: ' + topic);
  }
  await client.close();
}
