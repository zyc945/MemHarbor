import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Frozen source from faa989e; never regenerate it from current helpers.
export async function legacy() {
  const archive = resolve('test/fixtures/legacy.tar.gz');
  const manifest = JSON.parse(await readFile('test/fixtures/legacy.json', 'utf8'));
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  if (digest !== manifest.sha256) throw new Error('Legacy archive checksum mismatch');
  const dir = await mkdtemp(join(tmpdir(), 'memharbor-legacy-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', dir]);
    const outfile = join(dir, 'legacy.mjs');
    await build({ stdin: { contents: "export { MemoryService } from './src/memory/service'; export { rest } from './src/http/rest'; export { mcp } from './src/mcp/server'; export { makeContext } from './src/memory/parser'; export { Objects, Versions, ID, OTHER_ID } from './test/fakes';", resolveDir: dir },
      outfile, bundle: true, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, nodePaths: [resolve('node_modules')], logLevel: 'silent' });
    return { module: await import(pathToFileURL(outfile).href), close: () => rm(dir, { recursive: true, force: true }) };
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}
