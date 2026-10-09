import type { MemoryVersionStore } from '../domain/types';
import { MemoryService, type ServiceOptions } from '../memory/service';
import { LocalObjectStore } from '../store/local';
import { readSnapshot } from '../r2/snapshot';

const reads = new Set(['listMemories', 'searchMemories', 'resolveMemory', 'readMemoryFile', 'loadContext', 'publicIndex']);
const writes = new Set(['createMemory', 'updateMemory', 'checkpointMemory', 'moveMemory', 'deleteMemory', 'reconcileAll', 'reconcileTopic']);
export class LocalRuntime {
  readonly core: MemoryService;
  readonly service: MemoryService;
  private queue: Promise<unknown> = Promise.resolve();
  private indexQueued = false;
  constructor(readonly objects: LocalObjectStore, readonly versions: MemoryVersionStore, maxBytes = 262144,
    options: ServiceOptions = {}, private report: (result: string) => void = () => {}) {
    this.core = new MemoryService(objects, versions, maxBytes, undefined, options);
    this.service = new Proxy(this.core, { get: (target, property) => {
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      const name = String(property);
      if (!reads.has(name) && !writes.has(name)) return value.bind(target);
      return (...args: unknown[]) => this.serial(async () => {
        const input = args[0] as { cursor?: string } | undefined;
        const before = target.publications;
        try {
          if (reads.has(name) && !input?.cursor) {
            const current = await readSnapshot(objects);
            if (await versions.head() !== current.snapshot.git_commit) await target.reconcileAll();
          }
          return await value.apply(target, args);
        } finally { if (target.publications !== before) this.scheduleIndex(); }
      });
    } });
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => this.objects.lease(operation));
    this.queue = next.catch(() => {}); return next;
  }
  async initialize() { await this.serial(() => this.core.reconcileAll()); this.scheduleIndex(); }
  private scheduleIndex() {
    if (!this.core.options.contentSearch || this.indexQueued) return;
    this.indexQueued = true;
    // Independent queued work; errors never change canonical write results.
    setTimeout(() => {
      this.indexQueued = false;
      void this.serial(() => this.core.buildSearchIndex()).then(() => this.report('search_indexed'), () => this.report('search_index_failed'));
    }, 0);
  }
}
