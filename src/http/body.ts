import { MemoryError } from '../domain/errors';
export async function boundedBody(request: Request, maxBytes: number): Promise<string> {
  if (Number(request.headers.get('content-length')) > maxBytes)
    throw new MemoryError('CONTENT_TOO_LARGE', 'Request body is too large.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new MemoryError('CONTENT_TOO_LARGE', 'Request body is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new MemoryError('INVALID_CONTENT', 'Request must be valid UTF-8.'); }
}
export async function jsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await boundedBody(request, maxBytes));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('object');
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MemoryError) throw error;
    throw new MemoryError('INVALID_CONTENT', 'Request must be a JSON object.');
  }
}
