import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseDocument } from 'yaml';
import { z } from 'zod';

// Offline migration only. No network, commits, pushes, or directory moves.
const args = process.argv.slice(2);
if (!args[0] || args.some((arg, i) => i > 0 && arg !== '--write'))
  throw new Error('Usage: node scripts/migrate-memory-ids.mjs <data-repository> [--write]');
const root = resolve(args[0]);
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
if (resolve(git('rev-parse', '--show-toplevel').trim()) !== root)
  throw new Error('Provide the root of the data repository.');
if (args.includes('--write') && git('status', '--porcelain').trim()) throw new Error('Migration writes require a clean data repository.');
const pathSchema = z.string().max(1024).regex(/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_-]{0,63}(\/[\p{L}\p{N}][\p{L}\p{N}\p{M}_-]{0,63})*$/u)
  .refine(value => value === value.normalize('NFC'));
const fields = z.object({
  id: z.string().nullish(), path: pathSchema.optional(), title: z.string().trim().min(1),
  status: z.enum(['active', 'paused', 'completed', 'archived']), description: z.string().optional(),
  aliases: z.array(z.string()).optional(), tags: z.array(z.string()).optional(),
}).strict();
const ids = new Set(), plan = [], directories = new Set(), contexts = new Set();
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
for (const file of tracked) {
  if (!/\/(CONTEXT|STATE|DECISIONS|TODO|SOURCES)\.md$/.test(file)) continue;
  const path = dirname(file);
  if (!pathSchema.safeParse(path).success) throw new Error('Invalid or non-NFC memory directory: ' + path);
  const full = resolve(root, file);
  const stat = lstatSync(full);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111)) throw new Error('Memory files must be regular non-executable files: ' + file);
  const original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(full));
  if (Buffer.byteLength(original) > 262144 || original.includes('\0')) throw new Error('Invalid memory content: ' + file);
  directories.add(path);
  if (!file.endsWith('/CONTEXT.md')) continue;
  contexts.add(path);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(original);
  if (!match) throw new Error('Missing front matter: ' + file);
  const doc = parseDocument(match[1], { uniqueKeys: true });
  if (doc.errors.length) throw new Error('Invalid YAML: ' + file);
  const checked = fields.safeParse(doc.toJS({ maxAliasCount: 20 }));
  if (!checked.success) throw new Error('Invalid front matter fields: ' + file);
  const data = checked.data;
  let id = data.id;
  if (data.path !== undefined && data.path !== path) throw new Error('Path does not match directory: ' + file);
  const empty = id === undefined || id === null || id === '';
  const valid = z.string().uuid().safeParse(id).success && id === id?.toLowerCase();
  if (empty) id = randomUUID();
  else if (!valid) {
    const legacy = path.startsWith('topics/') && !path.slice(7).includes('/') ? path.slice(7) : path;
    if (data.path !== undefined || data.id !== legacy) throw new Error('Invalid existing UUID or legacy ID: ' + file);
    id = randomUUID();
  }
  if (id !== data.id || data.path === undefined) {
    doc.set('id', id); doc.set('path', path);
    const content = '---\n' + doc.toString() + '---\n' + original.slice(match[0].length);
    if (Buffer.byteLength(content) > 262144 || content.includes('\0')) throw new Error('Invalid migrated content: ' + file);
    plan.push({ file, path, old_id: data.id, id, original, content });
  }
  if (ids.has(id)) throw new Error('Duplicate UUID: ' + file);
  ids.add(id);
}
for (const path of directories) if (!contexts.has(path)) throw new Error('Missing CONTEXT.md: ' + path);
// Validate every file before writing any changes. Preserve bodies and directories.
if (args.includes('--write')) {
  for (const item of plan)
    if (readFileSync(resolve(root, item.file), 'utf8') !== item.original) throw new Error('File changed during migration.');
  for (const item of plan) writeFileSync(resolve(root, item.file), item.content);
}
console.log(JSON.stringify({ mode: args.includes('--write') ? 'written' : 'preview', count: plan.length,
  pending_ids: plan.filter(item => item.id !== item.old_id).length,
  mappings: plan.map(({ path, old_id, id }) => ({ path, old_id, id })) }, null, 2));
