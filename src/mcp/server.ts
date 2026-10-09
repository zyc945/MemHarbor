import { McpServer, WebStandardStreamableHTTPServerTransport, createMcpHandler, isLegacyRequest, ResourceTemplate } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { fileSchema, topicSchema, modeSchema, statusSchema, limitSchema, createSchema, updateSchema, checkpointSchema, pathSchema, moveSchema, cursorSchema, scopeSchema, budgetSchema } from '../domain/schemas';
import { MemoryError, safeError } from '../domain/errors';
import { requireWrite, type Access } from '../auth/bearer';
import type { MemoryService } from '../memory/service';
export async function toolResult(operation: () => Promise<object>, onError: (code: string) => void) {
  try {
    const result = await operation();
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: { ...result } };
  } catch (error) {
    const result = safeError(error);
    onError(result.error);
    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
  }
}
export function createServer(service: MemoryService, access: Access, onError: (code: string) => void = () => {}) {
  const server = new McpServer({ name: 'ai-memory-service', version: '0.1.0' });
  const run = (operation: () => Promise<object>) => toolResult(operation, onError);
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  server.registerTool('list_memories', {
    description: 'Discover topics, optionally under path_prefix. Use resolve_memory for an exact path, then read/load by UUID. Follow next_cursor until null; keep filters unchanged.',
    inputSchema: z.object({ status: statusSchema.optional(), limit: limitSchema, cursor: cursorSchema, path_prefix: pathSchema.optional() }), annotations,
  }, input => run(() => service.listMemories(input)));
  server.registerTool('search_memories', {
    description: 'Search metadata by default. Explicit scope enables filters; content/all additionally require an enabled, ready body index. Check search_scope; snippets are evidence locations, never complete write baselines. Refine queries and read matching files.',
    inputSchema: z.object({ query: z.string().min(1), limit: limitSchema.default(10), cursor: cursorSchema,
      scope: scopeSchema.optional(),
      // MemoryService validates filters only with explicit scope; old requests ignore them.
      status: z.unknown().optional().describe('With explicit scope: active, paused, completed or archived. Ignored without scope.'),
      path_prefix: z.unknown().optional().describe('With explicit scope: a Unicode topic path prefix. Ignored without scope.'),
      include_archived: z.unknown().optional().describe('With explicit scope: boolean, default true. Ignored without scope.') }), annotations,
  }, input => run(() => service.searchMemories(input)));
  server.registerTool('resolve_memory', {
    description: 'Resolve an exact Unicode path to its immutable memory UUID.',
    inputSchema: z.object({ path: pathSchema }), annotations,
  }, input => run(() => service.resolveMemory(input)));
  server.registerTool('load_context', {
    description: 'Load complete context by mode, or read-only sections with explicit max_bytes. Budget responses include coverage, not replacement files. full rejects budgets; use full files and revisions before mutations.',
    inputSchema: z.object({ topic: topicSchema, mode: modeSchema.default('default'), max_bytes: budgetSchema.optional() }), annotations,
  }, input => run(() => service.loadContext(input)));
  server.registerTool('read_memory_file', {
    description: 'Read one memory file and its revision.',
    inputSchema: z.object({ topic: topicSchema, file: fileSchema }), annotations,
  }, input => run(() => service.readMemoryFile(input)));

  server.registerTool('create_memory', {
    description: 'Create a topic at path with a server-generated immutable UUID and five Markdown files in one commit. Optional files provides initial content; CONTEXT.md is body only.', inputSchema: createSchema,
    annotations: { destructiveHint: false },
  }, input => run(async () => { requireWrite(access); return service.createMemory(input); }));
  server.registerTool('update_memory', {
    description: 'Replace one file using its expected revision.', inputSchema: updateSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
  }, input => run(async () => { requireWrite(access); return service.updateMemory(input); }));
  server.registerTool('checkpoint_memory', {
    description: 'Commit related file changes together using the expected commit.', inputSchema: checkpointSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
  }, input => run(async () => { requireWrite(access); return service.checkpointMemory(input); }));

  server.registerTool('move_memory', {
    description: 'Move only this memory’s five files to a new path, preserving its UUID and all child memories.',
    inputSchema: moveSchema, annotations: { destructiveHint: true, idempotentHint: true },
  }, input => run(async () => { requireWrite(access); return service.moveMemory(input); }));

  server.registerResource('topic-context', new ResourceTemplate('memory://topics/{topic}', { list: undefined }),
    { mimeType: 'application/json' }, async (uri, variables) => {
      try {
        const result = await service.loadContext({ topic: resourceTopic(String(variables.topic)) });
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
      } catch (error) { throw new Error(JSON.stringify(safeError(error))); }
    });
  server.registerResource('memory-file', new ResourceTemplate('memory://topics/{topic}/{file}', { list: undefined }),
    { mimeType: 'text/markdown' }, async (uri, variables) => {
      try {
        const result = await service.readMemoryFile({ topic: resourceTopic(String(variables.topic)), file: String(variables.file) });
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: result.content }] };
      } catch (error) { throw new Error(JSON.stringify(safeError(error))); }
    });
  return server;
}
function resourceTopic(value: string) {
  // Resources use the immutable UUID, never a directory path.
  try { return decodeURIComponent(value); }
  catch { throw new MemoryError('INVALID_TOPIC', 'Invalid topic URI encoding.'); }
}
export async function mcp(request: Request, service: MemoryService, access: Access, onError: (code: string) => void = () => {}) {

  if (!await isLegacyRequest(request)) {
    const handler = createMcpHandler(() => createServer(service, access, onError), { legacy: 'reject', responseMode: 'auto' });
    try { return await handler.fetch(request); }
    finally { await handler.close(); }
  }
  const server = createServer(service, access, onError);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true,
  });
  await server.connect(transport);
  try { return await transport.handleRequest(request); }
  finally { await server.close(); }
}
