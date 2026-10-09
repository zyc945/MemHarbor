import { z } from 'zod';
import { FILES, MODES } from './types';
import { MemoryError } from './errors';
export const pathSchema = z.string().overwrite(value => value.normalize('NFC')).max(1024)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_-]{0,63}(\/[\p{L}\p{N}][\p{L}\p{N}\p{M}_-]{0,63})*$/u)
  .describe('Full Unicode topic path, e.g. 工作/基础设施/网络. NFC normalized; case-sensitive. Each segment starts with a letter or number, followed by letters, numbers, combining marks, underscores or hyphens (max 64 code points).');
export const topicSchema = z.string().uuid().toLowerCase().describe('Immutable memory UUID, returned by create_memory, list_memories or resolve_memory. Not a path.');
export const fileSchema = z.enum(FILES);
export const statusSchema = z.enum(['active', 'paused', 'completed', 'archived']);
export const modeSchema = z.enum(Object.keys(MODES) as [keyof typeof MODES, ...(keyof typeof MODES)[]]);
export const limitSchema = z.number().int().min(1).max(100).default(50);
export const cursorSchema = z.string().min(1).max(4096).optional();
export const scopeSchema = z.enum(['metadata', 'content', 'all']);
export const budgetSchema = z.number().int().positive().max(262144 * FILES.length);
export const searchOptionsSchema = z.object({ scope: scopeSchema, status: statusSchema.optional(),
  path_prefix: pathSchema.optional(), include_archived: z.boolean().default(true) })
  .refine(v => v.include_archived || v.status !== 'archived', 'Archived status conflicts with exclusion.');
export const createSchema = z.object({
  path: pathSchema, title: z.string().trim().min(1).max(500),
  description: z.string().max(4000).optional(),
  aliases: z.array(z.string().min(1).max(500)).max(100).default([]),
  tags: z.array(z.string().min(1).max(100)).max(100).default([]),
  initial_context: z.string().default(''),
  status: statusSchema.default('active'),
  files: z.partialRecord(fileSchema, z.string()).optional()
    .describe('Initial Markdown for all five files. CONTEXT.md is body only; server generates UUID/path YAML and title.'),
}).strict().refine(value => !(value.initial_context && value.files?.['CONTEXT.md'] !== undefined),
  'Use either initial_context or files.CONTEXT.md, not both.');
export const updateSchema = z.object({
  topic: topicSchema, file: fileSchema, content: z.string(),
  reason: z.string().trim().min(1).max(1000), expected_revision: z.string().min(1),
}).strict();
export const checkpointSchema = z.object({
  topic: topicSchema, reason: z.string().trim().min(1).max(1000),
  expected_commit: z.string().min(1),
  files: z.partialRecord(fileSchema, z.string()).refine(v => Object.keys(v).length > 0),
}).strict();
export const moveSchema = z.object({
  topic: topicSchema, path: pathSchema, expected_commit: z.string().min(1),
  reason: z.string().trim().min(1).max(1000),
}).strict();
export function memoryPath(value: string) {
  const result = pathSchema.safeParse(value);
  if (!result.success) throw new MemoryError('INVALID_TOPIC', 'Invalid memory path.');
  return result.data;
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const path = result.error.issues[0]?.path[0];
    if (path === 'topic' || path === 'id' || path === 'path') throw new MemoryError('INVALID_TOPIC', 'Invalid memory UUID or path.');
    if (path === 'file' || (path === 'files' && result.error.issues[0]?.code === 'invalid_key'))
      throw new MemoryError('INVALID_FILE', 'Unsupported memory filename.');
    throw new MemoryError('INVALID_CONTENT', 'Invalid request fields.');
  }
  return result.data;
}
export function topic(value: string) {
  const result = topicSchema.safeParse(value);
  if (!result.success) throw new MemoryError('INVALID_TOPIC', 'Invalid topic ID.');
  return result.data;
}
export function file(value: string): typeof FILES[number] {
  const result = fileSchema.safeParse(value);
  if (!result.success) throw new MemoryError('INVALID_FILE', 'Unsupported memory filename.');
  return result.data;
}
