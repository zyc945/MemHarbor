import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseContext } from '../src/memory/parser';
const script = resolve('scripts/migrate-memory-ids.mjs');
it('previews and migrates legacy paths without moves, preserves bodies and is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'memory-migration-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  try {
    git('init');
    for (const path of ['topics/legacy', '工作/网络']) {
      mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, path, 'CONTEXT.md'), '---\nid: ' + (path === 'topics/legacy' ? 'legacy' : path) + '\ntitle: Test\nstatus: active\n---\n\n# Body\nExact body.\n');
    }
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [script, root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
    expect(run().count).toBe(2);
    expect(readFileSync(join(root, 'topics/legacy/CONTEXT.md'), 'utf8')).toContain('id: legacy');
    const result = run('--write');
    for (const { path, id } of result.mappings) {
      const content = readFileSync(join(root, path, 'CONTEXT.md'), 'utf8');
      expect(parseContext(path, content)).toMatchObject({ path, id });
      expect(content.endsWith('\n\n# Body\nExact body.\n')).toBe(true);
    }
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'migration');
    expect(run('--write').count).toBe(0);
    // A later malformed topic must not leave an earlier valid legacy topic migrated.
    for (const [path, id] of [['a', 'a'], ['z', 'wrong']]) {
      mkdirSync(join(root, path));
      writeFileSync(join(root, path, 'CONTEXT.md'), '---\nid: ' + id + '\ntitle: Test\nstatus: active\n---\n');
    }
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'invalid');
    expect(() => run('--write')).toThrow();
    expect(readFileSync(join(root, 'a/CONTEXT.md'), 'utf8')).toContain('id: a');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('allocates absent/null/empty IDs, preserves valid IDs and previews zero changes immediately after writing', () => {
  const root = mkdtempSync(join(tmpdir(), 'memory-empty-ids-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  const id = '11111111-1111-4111-8111-111111111111';
  try {
    git('init');
    for (const [path, field] of [['absent', ''], ['null', 'id: null\n'], ['empty', 'id: ""\n'], ['valid', 'id: ' + id + '\n']]) {
      mkdirSync(join(root, path));
      writeFileSync(join(root, path, 'CONTEXT.md'), '---\n' + field + 'path: ' + JSON.stringify(path) + '\ntitle: Test\nstatus: active\n---\n\nExact body.\n');
    }
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [script, root, ...args], { encoding: 'utf8' }));
    expect(run()).toMatchObject({ count: 3, pending_ids: 3 });
    expect(run('--write').count).toBe(3);
    expect(run()).toMatchObject({ count: 0, pending_ids: 0 });
    expect(parseContext('valid', readFileSync(join(root, 'valid/CONTEXT.md'), 'utf8')).id).toBe(id);
    for (const path of ['absent', 'null', 'empty']) expect(readFileSync(join(root, path, 'CONTEXT.md'), 'utf8').endsWith('\n\nExact body.\n')).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
