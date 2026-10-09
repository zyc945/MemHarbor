import type { Env } from './env';
import { authenticate } from './auth/bearer';
import { MemoryError } from './domain/errors';
import { json, errorResponse } from './http/responses';
import { MemoryService, type AuditFields } from './memory/service';
import { R2Repository } from './r2/repository';
import { GitHubVersionStore } from './github/client';
import { webhook } from './github/webhook';
import { rest } from './http/rest';
import { boundedBody } from './http/body';
import { mcp } from './mcp/server';
import { flag } from './config';
function createService(env: Env, audit: AuditFields = {}) {
  const maxBytes = Number(env.MAX_FILE_BYTES);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 262144)
    throw new MemoryError('INTERNAL_ERROR', 'Invalid file size configuration.');
  const objects = new R2Repository(env.MEMORY_BUCKET);
  return new MemoryService(objects, new GitHubVersionStore({ owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH, token: env.GITHUB_TOKEN, maxBytes, cache: objects }), maxBytes,
    fields => Object.assign(audit, fields), { contentSearch: flag(env.MEMORY_CONTENT_SEARCH) });
}
async function buildOptionalIndex(service: MemoryService) {
  if (!service.options.contentSearch) return;
  try {
    const result = await service.buildSearchIndex();
    console.log(JSON.stringify({ operation: 'search_index', result: result.status, git_commit: result.git_commit }));
  } catch { console.log(JSON.stringify({ operation: 'search_index', result: 'failed' })); }
}
export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const audit: AuditFields = {};
    let operation = 'http';
    let result = 'error';
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        result = 'ok';
        return json({ status: 'ok', version: '0.1.0' });
      }
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) throw new MemoryError('FORBIDDEN', 'Cross-origin requests are not allowed.');
      const isWebhook = url.pathname === '/webhooks/github' && request.method === 'POST';
      const access = isWebhook ? 'read' : await authenticate(request, env);
      const service = createService(env, audit), maxBytes = service.maxBytes;
      let response: Response;
      if (isWebhook) {
        operation = 'github_webhook';
        if (!flag(env.MEMORY_WEBHOOK_ENABLED, Boolean(env.GITHUB_WEBHOOK_SECRET)))
          throw new MemoryError('NOT_FOUND', 'Webhook is disabled.');
        response = await webhook(request, service, {
          owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH, secret: env.GITHUB_WEBHOOK_SECRET ?? '',
        });
      } else {
        if (url.pathname === '/mcp') {
          operation = 'mcp';
          if (request.method === 'POST') {
            const body = await boundedBody(request, maxBytes * 30 + 16384);
            request = new Request(request, { body });
          }
          response = await mcp(request, service, access, code => { audit.result = code; });
        } else {
          operation = 'rest';
          response = await rest(request, service, access);
        }
      }
      if (service.publications && service.options.contentSearch && ctx) {
        // Scheduling failure must never change a successful canonical publication.
        try { ctx.waitUntil(buildOptionalIndex(service)); }
        catch { console.log(JSON.stringify({ operation: 'search_index', result: 'schedule_failed' })); }
      }
      result = String(response.status);
      response.headers.set('X-Request-Id', requestId);
      return response;
    } catch (error) {
      const response = errorResponse(error);
      result = String(response.status);
      response.headers.set('X-Request-Id', requestId);
      return response;
    } finally {
      console.log(JSON.stringify({ request_id: requestId, operation, duration_ms: Date.now() - started, result, ...audit }));
    }
  },
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const service = createService(env);
    try {
      const result = await service.reconcileAll();
      console.log(JSON.stringify({ operation: 'scheduled_reconcile', result: result.status, git_commit: result.git_commit }));
    } catch (error) {
      console.log(JSON.stringify({ operation: 'scheduled_reconcile', result: 'failed' }));
      throw error;
    }
    await buildOptionalIndex(service);
  },
};
