import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from '../mcp/server';
import { GitHubVersionStore } from '../github/client';
import { LocalObjectStore } from '../store/local';
import { LocalRuntime } from './runtime';
import { flag } from '../config';
import { MemoryError, safeError } from '../domain/errors';
import { syntheticVersions } from './synthetic';

function number(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new MemoryError('INVALID_CONTENT', 'Invalid local capacity configuration.');
  return value;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`MemHarbor stdio MCP server (Node.js 22+)

Usage: node dist/local/main.mjs [--demo] [--check]

  --demo   Temporary synthetic data; no GitHub credentials or persistent storage.
  --check  Check configuration and repository reads, then exit; does not verify writes.
  --help   Show this help.

Persistent storage requires GITHUB_OWNER, GITHUB_REPO and GITHUB_TOKEN.
GITHUB_BRANCH defaults to main. MEMORY_ACCESS defaults to read; set write to save.
Start this process from an MCP client. Waiting for protocol input is normal.
For a guided, credential-free round trip run: npm run demo
Setup: docs/MCP_CLIENTS.md (stdio); docs/FIRST_USE.md (local Git)`);
    return;
  }
  if (args.some(arg => !['--demo', '--check'].includes(arg))) throw new MemoryError('INVALID_CONTENT', 'Use --demo or --check.');
  const demo = args.includes('--demo'), check = args.includes('--check');
  const access = process.env.MEMORY_ACCESS ?? 'read';
  if (access !== 'read' && access !== 'write') throw new MemoryError('INVALID_CONTENT', 'MEMORY_ACCESS must be read or write.');
  const missing = ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN'].filter(key => !process.env[key]);
  if (!demo && missing.length) {
    if (check) console.log(JSON.stringify({ ready: false, missing, write_verified: false }));
    else console.error(JSON.stringify({ error: 'CONFIGURATION', missing }));
    process.exitCode = 1; return;
  }
  const maxBytes = number('MAX_FILE_BYTES', 262144, 262144);
  const objects = new LocalObjectStore(number('MEMORY_LOCAL_CACHE_BYTES', 32 * 1024 * 1024, 256 * 1024 * 1024));
  const versions = demo ? await syntheticVersions() : new GitHubVersionStore({ owner: process.env.GITHUB_OWNER!, repo: process.env.GITHUB_REPO!,
    branch: process.env.GITHUB_BRANCH ?? 'main', token: process.env.GITHUB_TOKEN!, maxBytes, cache: objects,
    maxCacheBytes: number('MEMORY_GITHUB_CACHE_BYTES', 4 * 1024 * 1024, 64 * 1024 * 1024),
    maxSnapshotBytes: number('MEMORY_SNAPSHOT_BYTES', 8 * 1024 * 1024, 64 * 1024 * 1024) });
  const runtime = new LocalRuntime(objects, versions, maxBytes, { contentSearch: flag(process.env.MEMORY_CONTENT_SEARCH),
    searchLimits: { inputBytes: 4 * 1024 * 1024, outputBytes: 8 * 1024 * 1024, blocks: 10000 } }, result => console.error(JSON.stringify({ result })));
  await runtime.initialize();
  if (check) {
    console.log(JSON.stringify({ ready: true, synthetic: demo, read_verified: true, write_verified: false,
      note: 'No remote mutation performed; branch rules and actual write permission remain unverified.' }));
    return;
  }
  if (demo) console.error('Synthetic in-memory demo; no GitHub connection or persistent memory.');
  serveStdio(() => createServer(runtime.service, access), { onerror: () => console.error('MCP transport error.') });
}
main().catch(error => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
