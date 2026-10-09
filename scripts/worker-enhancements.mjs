import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { fakeGitHub } from './fake-github.mjs';
// Local-only adapter invokes the real scheduled handler inside workerd.
await build({ stdin: { resolveDir: resolve('dist'), contents: `import worker from './index.js';
export default { async fetch(request, env, ctx) {
 if (new URL(request.url).pathname === '/__test/scheduled') {
  await worker.scheduled({ cron: '*/15 * * * *', scheduledTime: Date.now(), noRetry() {} }, env, ctx);
  return new Response('scheduled');
 }
 return worker.fetch(request, env, ctx);
} };\n` }, outfile: 'dist/worker-test-entry.js', bundle: true, format: 'esm', platform: 'neutral', external: ['node:*'], logLevel: 'silent' });
const github = fakeGitHub();
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, scriptPath: 'dist/worker-test-entry.js',
  compatibilityDate: '2026-09-21', compatibilityFlags: ['nodejs_compat'], r2Buckets: ['MEMORY_BUCKET'],
  bindings: { GITHUB_OWNER: 'test-owner', GITHUB_REPO: 'test-memory', GITHUB_BRANCH: 'main', MAX_FILE_BYTES: '262144',
    MEMORY_READ_TOKEN: 'local-read', MEMORY_WRITE_TOKEN: 'local-write', GITHUB_TOKEN: 'fake-github',
    MEMORY_CONTENT_SEARCH: 'true', MEMORY_WEBHOOK_ENABLED: 'false' }, outboundService: request => github.fetch(request) }));
let client;
try {
  const request = (path, method = 'GET', body, token = 'local-write') => mf.dispatchFetch('http://localhost' + path, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const created = await (await request('/api/v1/topics', 'POST', { path: 'synthetic/正文', title: 'Synthetic topic', files: { 'STATE.md': '# State\n\n正文检索 capsule café\n' } })).json();
  assert.equal(created.published, true);
  const denied = await request('/api/v1/admin/search-index', 'POST', {}, 'local-read'); assert.equal(denied.status, 403);
  assert.equal((await request('/api/v1/admin/search-index', 'POST', {})).status, 200);
  const bucket = await mf.getR2Bucket('MEMORY_BUCKET'), pointer = await (await bucket.get('_current.json')).text();
  for (const mode of ['modern', 'legacy']) {
    client = new Client({ name: 'isolated-enhancement-test', version: '1' }, mode === 'legacy' ? { versionNegotiation: { mode: 'legacy' } } : { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      requestInit: { headers: { Authorization: 'Bearer local-read' } }, fetch: (url, init) => mf.dispatchFetch(String(url), init) }));
    const calls = github.calls;
    const listed = (await client.listTools()).tools.find(tool => tool.name === 'search_memories');
    for (const name of ['scope', 'status', 'path_prefix', 'include_archived']) assert.ok(name in listed.inputSchema.properties);
    for (const extra of [{ include_archived: 'false' }, { status: null, path_prefix: ['wrong'] }]) {
      const original = await client.callTool({ name: 'search_memories', arguments: { query: 'Synthetic', ...extra } });
      assert.ok(!original.isError); assert.equal(original.structuredContent.total, 1);
      const enhanced = await client.callTool({ name: 'search_memories', arguments: { query: 'Synthetic', scope: 'metadata', ...extra } });
      assert.equal(enhanced.isError, true); assert.equal(enhanced.structuredContent.error, 'INVALID_CONTENT');
    }
    const search = await client.callTool({ name: 'search_memories', arguments: { query: '正文检索', scope: 'content' } });
    assert.ok(!search.isError); assert.equal(search.structuredContent.search_scope, 'content');
    assert.equal(search.structuredContent.topics[0].matches[0].file, 'STATE.md');
    const budget = await client.callTool({ name: 'load_context', arguments: { topic: created.id, max_bytes: 100 } });
    assert.ok(!budget.isError); assert.ok(!('files' in budget.structuredContent)); assert.ok(budget.structuredContent.coverage.returned_bytes <= 100);
    assert.equal(github.calls, calls);
    await client.close(); client = undefined;
  }
  const indexKey = '_search/v2/' + encodeURIComponent(created.git_commit) + '.json';
  const validIndex = await (await bucket.get(indexKey)).text(), broken = JSON.parse(validIndex);
  broken.blocks = [];
  await bucket.put(indexKey, JSON.stringify(broken));
  const corrupt = await (await request('/api/v1/topics?q=capsule&scope=content')).json();
  assert.equal(corrupt.error, 'PUBLISH_ERROR'); assert.equal(corrupt.details.component, 'search_index');
  assert.equal((await request('/api/v1/topics?q=Synthetic')).status, 200);
  const repaired = await (await request('/api/v1/admin/search-index', 'POST', {})).json();
  assert.equal(repaired.index_version, 2);
  assert.equal(await (await bucket.get(indexKey)).text(), validIndex);
  const projection = await (await request('/api/v1/index')).json();
  assert.equal(projection.schema_version, 1); assert.ok(!('id' in projection.topics[0]));
  assert.equal(await (await bucket.get('_current.json')).text(), pointer);
  assert.equal((await request('/webhooks/github', 'POST', {})).status, 404);
  assert.equal((await mf.dispatchFetch('http://localhost/__test/scheduled')).status, 200);
  assert.equal((await request('/api/v1/topics?q=capsule&scope=content')).status, 200);
  console.log('PASS: workerd enhanced REST, both MCP transports, sidecar maintenance, budgets, projection, disabled webhook and scheduled reconcile against isolated storage.');
} finally { await client?.close(); await mf.dispose(); }
