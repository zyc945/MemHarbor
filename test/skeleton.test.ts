import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import { authenticate, requireWrite } from '../src/auth/bearer';
const secrets = { MEMORY_READ_TOKEN: 'read-secret', MEMORY_WRITE_TOKEN: 'write-secret', MAX_FILE_BYTES: '262144' };
describe('skeleton', () => {
  it('health needs no bindings', async () => {
    const response = await worker.fetch(new Request('https://memory.test/health'), {} as Env);
    expect(await response.json()).toEqual({ status: 'ok', version: '0.1.0' });
  });
  it('rejects missing auth', async () => {
    const response = await worker.fetch(new Request('https://memory.test/api/v1/topics'), secrets as Env);
    expect(response.status).toBe(401);
  });
  it('enforces access tiers', async () => {
    for (const access of ['read', 'write'] as const) {
      expect(await authenticate(new Request('https://memory.test', {
        headers: { Authorization: 'Bearer ' + access + '-secret' },
      }), secrets)).toBe(access);
    }
    expect(() => requireWrite('read')).toThrow('Write authorization');
  });
});
