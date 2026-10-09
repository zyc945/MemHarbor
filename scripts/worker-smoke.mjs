import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fakeGitHub } from './fake-github.mjs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const github = fakeGitHub();
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: 'dist/index.js', compatibilityDate: '2026-09-21',
  compatibilityFlags: ['nodejs_compat'], r2Buckets: ['MEMORY_BUCKET'],
  bindings: {
    GITHUB_OWNER: 'test-owner', GITHUB_REPO: 'test-memory', GITHUB_BRANCH: 'main',
    MAX_FILE_BYTES: '262144', MEMORY_READ_TOKEN: 'local-read', MEMORY_WRITE_TOKEN: 'local-write',
    GITHUB_TOKEN: 'fake-github', GITHUB_WEBHOOK_SECRET: 'fake-webhook',
  },
  outboundService: request => github.fetch(request),
}));
let client;
try {
  assert.equal((await mf.dispatchFetch('http://localhost/health')).status, 200);
  assert.equal((await mf.dispatchFetch('http://localhost/api/v1/topics')).status, 401);
  const bucket = await mf.getR2Bucket('MEMORY_BUCKET');
  client = new Client({ name: 'local-acceptance-agent', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer local-read' } },
    fetch: (url, init) => mf.dispatchFetch(String(url), init),
  }));
  assert.equal((await client.listTools()).tools.length, 9);
  assert.equal((await client.callTool({ name: 'list_memories', arguments: {} })).structuredContent.topics.length, 0);
  const denied = await client.callTool({ name: 'create_memory', arguments: { path: 'blocked', title: 'Blocked' } });
  assert.equal(denied.structuredContent.error, 'FORBIDDEN');
  assert.equal((await client.listResourceTemplates()).resourceTemplates.length, 2);
  assert.equal(github.calls, 0);
  await client.close();
  client = new Client({ name: 'local-writing-agent', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer local-write' } },
    fetch: (url, init) => mf.dispatchFetch(String(url), init),
  }));
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError ?? false, false, JSON.stringify(result));
    return result.structuredContent;
  };
  for (const inputTopic of ['works/infra/network', '工作/基础设施/网络', '个人/cafe\u0301']) {
    const path = inputTopic.normalize('NFC');
    const beforeCommits = github.commitCount;
    const created = await call('create_memory', { path: inputTopic, title: '集成测试', initial_context: 'UTF-8 content' });
    assert.equal(created.published, true);
    const topic = created.id;
    assert.equal((await call('resolve_memory', { path: inputTopic })).id, topic);
    assert.equal(github.commitCount, beforeCommits + 1);
    const state = await call('read_memory_file', { topic, file: 'STATE.md' });
    const update = { topic, file: 'STATE.md', content: 'Updated state', reason: 'Runtime test', expected_revision: state.revision };
    const updated = await call('update_memory', update);
    assert.equal(updated.published, true);
    assert.equal((await call('read_memory_file', { topic, file: 'STATE.md' })).revision, updated.revision);
    assert.equal((await call('update_memory', update)).status, 'noop');
    assert.equal(github.commitCount, beforeCommits + 2);
    const conflict = await client.callTool({ name: 'update_memory', arguments: { ...update, content: 'Stale overwrite' } });
    assert.equal(conflict.structuredContent.error, 'CONFLICT');
    const checkpoint = await call('checkpoint_memory', {
      topic, reason: 'One checkpoint', expected_commit: updated.git_commit,
      files: { 'STATE.md': 'Final state', 'TODO.md': '# TODO\n- [x] runtime', 'DECISIONS.md': '# Decisions\nUse Git' },
    });
    assert.equal(checkpoint.published, true);
    assert.equal(github.commitCount, beforeCommits + 3);
    const resource = await client.readResource({ uri: 'memory://topics/' + topic + '/STATE.md' });
    assert.equal(resource.contents[0].text, 'Final state');
    const restRead = await mf.dispatchFetch('http://localhost/api/v1/topics/' + topic, {
      headers: { Authorization: 'Bearer local-read' },
    });
    assert.equal((await restRead.json()).topic, topic);
    const movedPath = 'moved/' + path;
    const moved = await call('move_memory', { topic, path: movedPath, expected_commit: checkpoint.git_commit, reason: 'Runtime move' });
    assert.equal(moved.id, topic);
    assert.equal(moved.published, true);
    assert.equal(github.commitCount, beforeCommits + 4);
    assert.equal((await client.readResource({ uri: 'memory://topics/' + topic + '/STATE.md' })).contents[0].text, 'Final state');
    assert.equal(await bucket.get(path + '/STATE.md'), null);
    assert.equal((await call('resolve_memory', { path: movedPath })).id, topic);
    const beforeRead = github.calls;
    assert.equal((await call('load_context', { topic, mode: 'full' })).files['STATE.md'], 'Final state');
    assert.equal(github.calls, beforeRead);
    const removed = await mf.dispatchFetch('http://localhost/api/v1/topics/' + topic, {
      method: 'DELETE', headers: { Authorization: 'Bearer local-write', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_commit: moved.git_commit }),
    });
    assert.equal((await removed.json()).status, 'deleted');
    assert.equal(await bucket.get(movedPath + '/STATE.md'), null);
  }
  // Exercise real R2 conditional writes, including create-if-absent.
  const initial = await bucket.put('_cas-test', 'first', { onlyIf: { etagDoesNotMatch: '*' } });
  assert.ok(initial);
  assert.equal(await bucket.put('_cas-test', 'second', { onlyIf: { etagDoesNotMatch: '*' } }), null);
  const swaps = await Promise.all(['a', 'b'].map(value => bucket.put('_cas-test', value, { onlyIf: { etagMatches: initial.etag } })));
  assert.equal(swaps.filter(Boolean).length, 1);
  const memories = [];
  for (let i = 0; i < 4; i++) memories.push(await call('create_memory', {
    path: 'capacity/' + i, title: 'Capacity', status: 'paused', files: {
      'CONTEXT.md': 'Context', 'STATE.md': '\uFEFFState ' + i, 'DECISIONS.md': 'Decision', 'TODO.md': 'Next', 'SOURCES.md': 'Source',
    },
  }));
  const target = await call('read_memory_file', { topic: memories[0].id, file: 'STATE.md' });
  assert.equal(target.content, '\uFEFFState 0');
  const beforeUpdate = github.calls;
  const removedBom = await call('update_memory', { topic: memories[0].id, file: 'STATE.md', content: 'State 0', reason: 'Remove BOM', expected_revision: target.revision });
  assert.equal(removedBom.status, 'updated');
  const requestCount = github.calls - beforeUpdate;
  assert.ok(requestCount < 20, 'Warm update request count: ' + requestCount);
  const firstPage = await call('list_memories', { path_prefix: 'capacity', limit: 2 });
  assert.equal(firstPage.total, 4);
  const nextPage = await mf.dispatchFetch('http://localhost/api/v1/topics?path_prefix=capacity&limit=2&cursor=' + encodeURIComponent(firstPage.next_cursor), {
    headers: { Authorization: 'Bearer local-read' },
  });
  const lastPage = await nextPage.json();
  assert.equal(lastPage.topics.length, 2);
  assert.equal(lastPage.next_cursor, null);
  console.log('PASS: R2 conditional publication, atomic full creation, REST/MCP pagination; four-topic warm update GitHub requests=' + requestCount);
  console.log('PASS: workerd stable UUID/path identities + Unicode moves + modern MCP + GitHub-adapter create/update/noop/conflict/checkpoint/delete against isolated fake GitHub; real local R2.');
  console.log('PASS: workerd health/auth, local R2, SDK Agent discovery/search/load/resources and write denial; zero outbound requests during reads.');
} finally {
  await client?.close();
  await mf.dispose();
}
