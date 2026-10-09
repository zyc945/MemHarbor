import type { MemoryService } from '../src/memory/service';
import type { rest } from '../src/http/rest';
import type { mcp } from '../src/mcp/server';
export function legacy(): Promise<{ module: { MemoryService: typeof MemoryService; rest: typeof rest; mcp: typeof mcp }; close(): Promise<void> }>;
