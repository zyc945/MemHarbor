export type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_EXISTS'
  | 'INVALID_TOPIC' | 'INVALID_FILE' | 'INVALID_CONTENT' | 'CONTENT_TOO_LARGE'
  | 'CONFLICT' | 'GITHUB_ERROR' | 'PUBLISH_ERROR' | 'INTERNAL_ERROR';

export class MemoryError extends Error {
  constructor(public code: ErrorCode, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}
export function safeError(error: unknown) {
  const e = error instanceof MemoryError ? error : new MemoryError('INTERNAL_ERROR', 'Internal service error.');
  return { error: e.code, message: e.message, details: e.details };
}
export function conflict(current?: string): never {
  throw new MemoryError('CONFLICT', 'Memory changed since it was read.', {
    ...(current ? { current_revision: current } : {}), action: 'Reload memory and retry after reconciling changes.',
  });
}
