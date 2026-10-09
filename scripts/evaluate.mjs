import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { legacy } from './legacy.mjs';
await build({ stdin: { contents: "export { MemoryService } from './src/memory/service'; export { Objects, Versions } from './test/fakes'; export { makeContext } from './src/memory/parser'; export { LocalObjectStore } from './src/store/local';", resolveDir: process.cwd() },
  outfile: 'dist/evaluate.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
const { MemoryService, Objects, Versions, makeContext, LocalObjectStore } = await import('../dist/evaluate.mjs');
const fixtures = JSON.parse(await readFile('test/fixtures/quality.json', 'utf8'));
const old = await legacy();
const report = { synthetic: true, runtime: process.version, platform: process.platform, samples_per_scale: 1,
  baseline_commit: 'faa989e20ed5c83d715f2937b3a3fcc7d78ea81a', cases: fixtures.cases.length, scales: [],
  agent_acceptance: 'pending: original workflow / improved navigation / opt-in body retrieval under fixed model and budgets' };
try {
  for (const copies of [1, 10, 50]) {
    const objects = new Objects(), versions = new Versions();
    let reads = 0, writes = 0;
    const get = objects.get.bind(objects), put = objects.put.bind(objects), cas = objects.compareAndSwap.bind(objects);
    objects.get = async key => { reads++; return get(key); };
    objects.put = async (...args) => { writes++; return put(...args); };
    objects.compareAndSwap = async (...args) => { writes++; return cas(...args); };
    for (let copy = 0; copy < copies; copy++) for (let i = 0; i < fixtures.topics.length; i++) {
      const t = fixtures.topics[i], path = copy ? 'noise/' + copy + '/' + t.path : t.path;
      const id = (copy * fixtures.topics.length + i + 1).toString(16).padStart(8, '0') + '-1111-4111-8111-111111111111';
      const body = copy ? '# Unrelated\n\nSynthetic ballast ' + copy : t.body;
      const topic = { ...t, id, path }; delete topic.body;
      if (copy) { topic.title = 'Noise ' + copy; topic.aliases = []; topic.tags = []; }
      for (const [file, content] of Object.entries({ 'CONTEXT.md': makeContext(topic, ''), 'STATE.md': body, 'DECISIONS.md': '# Decisions\n', 'TODO.md': '# TODO\n', 'SOURCES.md': '# Sources\n' }))
        versions.state.files[path + '/' + file] = { content, revision: id + '-' + file };
    }
    // The original program publishes the shared fixture before either retrieval implementation runs.
    const baseline = new old.module.MemoryService(objects, versions);
    await baseline.reconcileAll();
    const service = new MemoryService(objects, versions, 262144, undefined, { contentSearch: true });
    reads = 0; writes = 0;
    const begin = performance.now(); await service.buildSearchIndex(); const build_ms = performance.now() - begin;
    const build_reads = reads, build_writes = writes;
    const metrics = {}, baselineResults = new Map();
    for (const scope of ['baseline', 'metadata', 'all']) {
      let recall = 0, positive = 0, empty = 0, sources = 0, response_bytes = 0;
      reads = 0; const start = performance.now();
      for (const c of fixtures.cases) {
        const result = await (scope === 'baseline' ? baseline.searchMemories({ query: c.query, limit: 5 })
          : service.searchMemories({ query: c.query, limit: 5, ...(scope === 'all' ? { scope: 'all' } : {}) }));
        response_bytes += Buffer.byteLength(JSON.stringify(result));
        const actual = result.topics.map(t => t.path);
        if (scope === 'baseline') baselineResults.set(c.query, result);
        if (c.paths.length) { positive++; recall += c.paths.filter(path => actual.includes(path)).length / c.paths.length; }
        else { if (result.total !== 0) throw new Error('Negative case returned results: ' + c.kind); empty++; }
        if (scope === 'metadata') {
          const before = baselineResults.get(c.query);
          if (JSON.stringify(before) !== JSON.stringify(result)) throw new Error('Metadata baseline changed');
        }
        for (const topic of result.topics) for (const match of topic.matches ?? []) {
          const file = versions.state.files[topic.path + '/' + match.file];
          if (!file || file.revision !== match.revision || !file.content.includes(match.excerpt)) throw new Error('Evidence provenance mismatch');
          sources++;
        }
      }
      metrics[scope] = { recall_at_5: recall / positive, positive_cases: positive, true_empty_cases: empty,
        verified_matches: sources, response_bytes, retrieval_ms: performance.now() - start, object_reads: reads };
    }
    if (metrics.all.recall_at_5 !== 1) throw new Error('Required body evidence was not recalled');
    const index_bytes = [...objects.data].filter(([key]) => key.startsWith('_search/')).reduce((sum, [, object]) => sum + Buffer.byteLength(object.content), 0);
    const topic = (await service.resolveMemory({ path: fixtures.topics[0].path })).id;
    const full = await service.loadContext({ topic });
    const budget = await service.loadContext({ topic, max_bytes: 128 });
    const context_bytes = { complete: Object.values(full.files).reduce((n, content) => n + Buffer.byteLength(content), 0),
      budget: budget.coverage.returned_bytes, max_bytes: 128, partial: budget.coverage.partial };
    const local = new LocalObjectStore(), localService = new MemoryService(local, versions, 262144, undefined, { contentSearch: true });
    await local.lease(() => localService.reconcileAll());
    await local.lease(() => localService.buildSearchIndex());
    const baseSnapshot = await versions.snapshot();
    await versions.commitFiles(baseSnapshot, { [fixtures.topics[0].path + '/STATE.md']: '# Changed synthetic fixture\n' });
    await local.lease(() => localService.reconcileAll());
    report.scales.push({ topics: copies * fixtures.topics.length, build_ms, build_reads, build_writes, index_bytes, metrics, context_bytes,
      local_cache: { used_bytes: local.usedBytes, peak_bytes: local.peakBytes, limit_bytes: local.maxBytes, scope: 'object payloads and keys through snapshot replacement; excludes Git download cache, parsed JS objects and process RSS' } });
  }
  await mkdir('docs/evaluation', { recursive: true });
  await writeFile('docs/evaluation/service-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await old.close(); }
