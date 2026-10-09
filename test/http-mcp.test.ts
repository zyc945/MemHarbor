import { it, expect } from 'vitest';
import { MemoryService } from '../src/memory/service';
import { Objects, Versions } from './fakes';
import { rest } from '../src/http/rest';
import { mcp } from '../src/mcp/server';
import { jsonBody } from '../src/http/body';
const service = () => new MemoryService(new Objects(), new Versions());
const req = (path: string, method = 'GET', body?: unknown) => new Request('https://memory.test' + path, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function rpc(svc: MemoryService, method: string, params: unknown, access: 'read' | 'write' = 'read') {
  return mcp(new Request('https://memory.test/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), svc, access);
}
it.each(['works/infra/checkpoint', '工作/基础设施/网络'])('REST resolves path and uses UUID for reads, writes, moves and deletion: %s', async path => {
  const svc = service();
  await expect(rest(req('/api/v1/topics', 'POST', { path, title: 'Test' }), svc, 'read')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const created = await (await rest(req('/api/v1/topics', 'POST', { path, title: 'Test' }), svc, 'write')).json() as { id: string };
  const id = created.id;
  expect(await (await rest(req('/api/v1/topics/resolve?path=' + encodeURIComponent(path)), svc, 'read')).json()).toMatchObject({ id, path });
  expect(await (await rest(req('/api/v1/topics/' + id), svc, 'read')).json()).toMatchObject({ id, path });
  const read = await svc.readMemoryFile({ topic: id, file: 'STATE.md' });
  expect(await (await rest(req('/api/v1/topics/' + id + '/STATE.md', 'PUT', {
    content: 'REST update', reason: 'test', expected_revision: read.revision,
  }), svc, 'write')).json()).toMatchObject({ status: 'updated' });
  const args = { path: 'new/' + path, reason: 'test', expected_commit: (await svc.loadContext({ topic: id })).git_commit };
  await expect(rest(req('/api/v1/topics/' + id + '/move', 'POST', args), svc, 'read')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await (await rest(req('/api/v1/topics/' + id + '/move', 'POST', args), svc, 'write')).json()).toMatchObject({ id, status: 'moved' });
  expect(await (await rest(req('/api/v1/topics/' + id + '/STATE.md'), svc, 'read')).json()).toMatchObject({ id, path: args.path, content: 'REST update' });
  const checkpoint = await rest(req('/api/v1/topics/' + id + '/checkpoint', 'POST', {
    files: { 'STATE.md': 'Checkpoint' }, reason: 'test', expected_commit: (await svc.loadContext({ topic: id })).git_commit,
  }), svc, 'write');
  expect(await checkpoint.json()).toMatchObject({ status: 'checkpointed' });
  await rest(req('/api/v1/topics/' + id, 'DELETE', { expected_commit: (await svc.loadContext({ topic: id })).git_commit }), svc, 'write');
  await expect(svc.loadContext({ topic: id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(rest(req('/api/v1/topics/' + encodeURIComponent(path)), svc, 'read')).rejects.toMatchObject({ code: 'INVALID_TOPIC' });
});
it('MCP initializes, exposes nine tools, and enforces stable resource IDs', async () => {
  const svc = service();
  expect((await rpc(svc, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).status).toBe(200);
  const listed = await (await rpc(svc, 'tools/list', {})).json() as { result: { tools: { name: string }[] } };
  expect(listed.result.tools).toHaveLength(9);
  expect(listed.result.tools.some(t => /delete|reconcile/.test(t.name))).toBe(false);
  const args = { path: '个人/cafe\u0301', title: 'Cafe' };
  expect(await (await rpc(svc, 'tools/call', { name: 'create_memory', arguments: args })).json()).toMatchObject({ result: { isError: true, structuredContent: { error: 'FORBIDDEN' } } });
  const created = await (await rpc(svc, 'tools/call', { name: 'create_memory', arguments: args }, 'write')).json() as { result: { structuredContent: { id: string } } };
  const id = created.result.structuredContent.id;
  expect(await (await rpc(svc, 'tools/call', { name: 'resolve_memory', arguments: { path: args.path } })).json()).toMatchObject({ result: { structuredContent: { id, path: args.path.normalize('NFC') } } });
  const before = await svc.loadContext({ topic: id });
  const move = { name: 'move_memory', arguments: { topic: id, path: '个人/咖啡', expected_commit: before.git_commit, reason: 'move' } };
  expect(await (await rpc(svc, 'tools/call', move)).json()).toMatchObject({ result: { isError: true, structuredContent: { error: 'FORBIDDEN' } } });
  expect(await (await rpc(svc, 'tools/call', move, 'write')).json()).toMatchObject({ result: { structuredContent: { id, status: 'moved' } } });
  const resource = await (await rpc(svc, 'resources/read', { uri: 'memory://topics/' + id })).json() as { result: { contents: { text: string }[] } };
  expect(JSON.parse(resource.result.contents[0].text)).toMatchObject({ id, path: '个人/咖啡' });
  expect(await (await rpc(svc, 'resources/read', { uri: 'memory://topics/' + id + '/STATE.md' })).json()).toMatchObject({ result: { contents: [{ mimeType: 'text/markdown' }] } });
  expect(await (await rpc(svc, 'tools/call', { name: 'load_context', arguments: { topic: args.path } })).json()).toMatchObject({ result: { isError: true } });
});
it('decodes path lookup once and rejects traversal and malformed encoding', async () => {
  const svc = service();
  for (const path of ['../secret', 'a/%2e%2e', 'a\\b', 'a//b'])
    await expect(rest(req('/api/v1/topics/resolve?path=' + encodeURIComponent(path)), svc, 'read')).rejects.toThrow();
  await expect(rest(req('/api/v1/topics/%zz'), svc, 'read')).rejects.toThrow();
});
it('bounds request bytes and rejects invalid JSON', async () => {
  await expect(jsonBody(new Request('https://memory.test', { method: 'POST', body: 'x'.repeat(200) }), 100)).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
  await expect(jsonBody(new Request('https://memory.test', { method: 'POST', body: 'null' }), 100)).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
});
