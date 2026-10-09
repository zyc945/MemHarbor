import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import { statusSchema, topicSchema, pathSchema, memoryPath } from '../domain/schemas';
import { MemoryError } from '../domain/errors';
import type { Topic } from '../domain/types';
const frontMatter = z.object({
  id: topicSchema, path: pathSchema, title: z.string().trim().min(1),
  status: statusSchema, description: z.string().optional(),
  aliases: z.array(z.string()).default([]), tags: z.array(z.string()).default([]),
}).strict();
export function parseContext(path: string, content: string): Topic {
  path = memoryPath(path);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new MemoryError('INVALID_CONTENT', 'CONTEXT.md requires YAML front matter.');
  try {
    const doc = parseDocument(match[1], { uniqueKeys: true });
    if (doc.errors.length) throw new Error('yaml');
    const raw = doc.toJS({ maxAliasCount: 20 });
    const parsed = frontMatter.parse(raw);
    if (raw.id !== parsed.id || raw.path !== parsed.path) throw new Error('non-canonical identity');
    if (parsed.path !== path) throw new Error('path');
    return parsed;
  } catch {
    throw new MemoryError('INVALID_CONTENT', 'CONTEXT.md requires a canonical UUID id and NFC path matching its directory. Migrate legacy path IDs before publishing.');
  }
}
export function makeContext(value: Topic, body: string) {
  return '---\n' + stringify(value) + '---\n\n# ' + value.title + '\n\n' + body + '\n';
}
export function validateContent(content: string, maxBytes: number) {
  if (new TextEncoder().encode(content).byteLength > maxBytes)
    throw new MemoryError('CONTENT_TOO_LARGE', 'Memory file exceeds the byte limit.');
  if (content.includes('\0')) throw new MemoryError('INVALID_CONTENT', 'NUL characters are not allowed.');
}

export function moveContext(content: string, path: string) {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(content);
  if (!match) throw new MemoryError('INVALID_CONTENT', 'Missing front matter.');
  const doc = parseDocument(match[2], { uniqueKeys: true });
  doc.set('path', path);
  return '---\n' + doc.toString() + '---\n' + content.slice(match[0].length);
}
