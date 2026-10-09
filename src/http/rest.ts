import { MemoryError } from '../domain/errors';
import type { MemoryService } from '../memory/service';
import { requireWrite, type Access } from '../auth/bearer';
import { jsonBody } from './body';
import { json } from './responses';
export async function rest(request: Request, service: MemoryService, access: Access): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/v1/index' && request.method === 'GET') return json(await service.publicIndex());
  if (url.pathname === '/api/v1/admin/search-index' && request.method === 'POST') {
    requireWrite(access);
    if (Object.keys(await jsonBody(request, 4096)).length) throw new MemoryError('INVALID_CONTENT', 'Expected an empty object.');
    return json(await service.buildSearchIndex());
  }
  if (url.pathname === '/api/v1/admin/reconcile' && request.method === 'POST') {
    requireWrite(access);
    const body = await jsonBody(request, 4096);
    if (Object.keys(body).length !== 1)
      throw new MemoryError('INVALID_CONTENT', 'Provide either topic or all: true.');
    if (typeof body.topic === 'string') return json(await service.reconcileTopic(body.topic));
    if (body.all === true) return json(await service.reconcileAll());
    throw new MemoryError('INVALID_CONTENT', 'Provide either topic or all: true.');
  }
  if (url.pathname !== '/api/v1/topics' && !url.pathname.startsWith('/api/v1/topics/'))
    throw new MemoryError('NOT_FOUND', 'Route not found.');
  let parts: string[];
  try { parts = url.pathname.split('/').slice(4).map(decodeURIComponent); }
  catch { throw new MemoryError('INVALID_TOPIC', 'Invalid URL encoding.'); }
  if (request.method === 'GET' && url.pathname === '/api/v1/topics') {
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
    return json(url.searchParams.has('q')
      ? await service.searchMemories({ query: url.searchParams.get('q')!, limit, cursor: url.searchParams.get('cursor') ?? undefined,
        ...(url.searchParams.has('scope') ? { scope: url.searchParams.get('scope')!, status: url.searchParams.get('status') ?? undefined,
          path_prefix: url.searchParams.get('path_prefix') ?? undefined, include_archived: booleanParameter(url.searchParams.get('include_archived')) } : {}) })
      : await service.listMemories({ status: url.searchParams.get('status') ?? undefined, limit, cursor: url.searchParams.get('cursor') ?? undefined, path_prefix: url.searchParams.get('path_prefix') ?? undefined }));
  }
  if (request.method === 'GET' && parts.length === 1 && parts[0] === 'resolve')
    return json(await service.resolveMemory({ path: url.searchParams.get('path') ?? '' }));
  const id = parts[0];
  const last = parts[1];
  if (request.method === 'GET') {
    if (parts.length === 1) return json(await service.loadContext({ topic: id, mode: url.searchParams.get('mode') ?? undefined,
      max_bytes: url.searchParams.has('max_bytes') ? Number(url.searchParams.get('max_bytes')) : undefined }));
    if (parts.length === 2) return json(await service.readMemoryFile({ topic: id, file: last }));
    throw new MemoryError('NOT_FOUND', 'Route not found.');
  }

  requireWrite(access);
  if (request.method === 'POST' && url.pathname === '/api/v1/topics')
    return json(await service.createMemory(await jsonBody(request, service.maxBytes * 30 + 16384)));
  if (request.method === 'PUT' && parts.length === 2)
    return json(await service.updateMemory({ ...await jsonBody(request, service.maxBytes * 6 + 16384), topic: id, file: last }));
  if (request.method === 'POST' && parts.length === 2 && last === 'checkpoint')
    return json(await service.checkpointMemory({ ...await jsonBody(request, service.maxBytes * 30 + 16384), topic: id }));
  if (request.method === 'POST' && parts.length === 2 && last === 'move')
    return json(await service.moveMemory({ ...await jsonBody(request, 8192), topic: id }));
  if (request.method === 'DELETE' && parts.length === 1 && id) {
    const body = await jsonBody(request, 4096);
    return json(await service.deleteMemory(id, typeof body.expected_commit === 'string' ? body.expected_commit : ''));
  }
  throw new MemoryError('NOT_FOUND', 'Route not found.');
}
function booleanParameter(value: string | null) {
  if (value === null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new MemoryError('INVALID_CONTENT', 'Boolean parameters must be true or false.');
}
