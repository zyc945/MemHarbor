import type { MemoryVersionStore, Snapshot } from '../domain/types';
import { conflict } from '../domain/errors';
import { makeContext } from '../memory/parser';
import { blobSha } from '../github/blob';
// Explicit demonstration adapter, never selected by production configuration.
export async function syntheticVersions(): Promise<MemoryVersionStore> {
  const context = makeContext({ id: '11111111-1111-4111-8111-111111111111', path: 'demo/project', title: 'Synthetic project',
    status: 'active', aliases: [], tags: [] }, 'Use this synthetic vault to explore tools.');
  const files = { 'CONTEXT.md': context, 'STATE.md': '# State\n\nSynthetic migration failed on release 1; retry after updating the adapter.\n',
    'DECISIONS.md': '# Decisions\n\nSource S1: the synthetic experiment rejected reusing an old pointer.\n',
    'TODO.md': '# TODO\n\n- Verify release 2 before retrying.\n', 'SOURCES.md': '# Sources\n\nS1: synthetic fixture, no external evidence.\n' };
  const state: Snapshot = { commit: 'demo-0', tree: 'demo', updatedAt: '2026-09-24T00:00:00Z', files: {} };
  for (const [file, content] of Object.entries(files)) state.files['demo/project/' + file] = { content, revision: await blobSha(content) };
  let count = 0;
  return { head: async () => state.commit, snapshot: async () => structuredClone(state),
    commitFiles: async (base, changes) => {
      if (state.commit !== base.commit) conflict(state.commit);
      const prepared = await Promise.all(Object.entries(changes).map(async ([path, content]) =>
        [path, content === null ? null : { content, revision: await blobSha(content) }] as const));
      if (state.commit !== base.commit) conflict(state.commit);
      for (const [path, file] of prepared) { if (file) state.files[path] = file; else delete state.files[path]; }
      state.commit = 'demo-' + ++count; return state.commit;
    } };
}
