import { MemoryError } from '../domain/errors';
export type Access = 'read' | 'write';
export async function equalSecret(a: string, b: string): Promise<boolean> {
  const encode = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', encode.encode(v))));
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let difference = 0;
  for (let i = 0; i < xa.length; i++) difference |= xa[i] ^ ya[i];
  return difference === 0;
}
export async function authenticate(request: Request, secrets: { MEMORY_READ_TOKEN: string; MEMORY_WRITE_TOKEN: string }): Promise<Access> {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') ?? '');
  if (!match) throw new MemoryError('UNAUTHORIZED', 'Bearer authentication required.');
  if (secrets.MEMORY_WRITE_TOKEN && await equalSecret(match[1], secrets.MEMORY_WRITE_TOKEN)) return 'write';
  if (secrets.MEMORY_READ_TOKEN && await equalSecret(match[1], secrets.MEMORY_READ_TOKEN)) return 'read';
  throw new MemoryError('UNAUTHORIZED', 'Invalid bearer token.');
}
export function requireWrite(access: Access) {
  if (access !== 'write') throw new MemoryError('FORBIDDEN', 'Write authorization required.');
}
