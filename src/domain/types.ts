export const FILES = ['CONTEXT.md', 'STATE.md', 'DECISIONS.md', 'TODO.md', 'SOURCES.md'] as const;
export type MemoryFile = typeof FILES[number];
export const MODES = {
  default: ['CONTEXT.md', 'STATE.md'],
  decision: ['CONTEXT.md', 'STATE.md', 'DECISIONS.md'],
  planning: ['CONTEXT.md', 'STATE.md', 'TODO.md'],
  evidence: ['CONTEXT.md', 'STATE.md', 'SOURCES.md'],
  full: FILES,
} as const;
export type Topic = {
  id: string; path: string; title: string; description?: string; aliases: string[]; tags: string[];
  status: 'active' | 'paused' | 'completed' | 'archived';
};
export type IndexEntry = Topic & { updated_at: string };
export type MemoryIndex = { schema_version: 3; git_commit: string; generated_at: string; topics: IndexEntry[] };
export type TopicMeta = {
  schema_version: 3; topic: string; path: string; git_commit: string; published_at: string;
  files: Partial<Record<MemoryFile, { git_blob_sha: string; size: number }>>;
};
export type PublishedSnapshot = MemoryIndex & { metadata: Record<string, TopicMeta> };
export type MemoryObject = { content: string; etag: string; metadata?: Record<string, string> };
export interface MemoryObjectStore {
  get(key: string): Promise<MemoryObject | null>;
  compareAndSwap(key: string, etag: string | null, content: string): Promise<boolean>;
  put(key: string, content: string, metadata?: Record<string, string>): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<{ key: string }[]>;
}
export type VersionedFile = { content: string; revision: string };
export type Snapshot = { commit: string; tree: string; files: Record<string, VersionedFile>; updatedAt: string };
export interface MemoryVersionStore {
  head(): Promise<string>;
  snapshot(): Promise<Snapshot>;
  commitFiles(base: Snapshot, changes: Record<string, string | null>, message: string): Promise<string>;
}
