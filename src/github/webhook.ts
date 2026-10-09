import { MemoryError } from '../domain/errors';
import type { MemoryService } from '../memory/service';
import { boundedBody } from '../http/body';
import { json } from '../http/responses';
export async function verifySignature(body: string, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    throw new MemoryError('UNAUTHORIZED', 'Invalid webhook signature.');
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const digest = Uint8Array.from(signature.slice(7).match(/../g)!, pair => parseInt(pair, 16));
  if (!await crypto.subtle.verify('HMAC', key, digest, bytes.encode(body)))
    throw new MemoryError('UNAUTHORIZED', 'Invalid webhook signature.');
}
export async function webhook(request: Request, service: MemoryService, config: {
  owner: string; repo: string; branch: string; secret: string;
}) {
  const body = await boundedBody(request, 2 * 1024 * 1024);
  await verifySignature(body, request.headers.get('X-Hub-Signature-256'), config.secret);
  let payload: { repository?: { full_name?: string }; ref?: string };
  try { payload = JSON.parse(body); }
  catch { throw new MemoryError('INVALID_CONTENT', 'Invalid webhook JSON.'); }
  if (!payload || typeof payload !== 'object') throw new MemoryError('INVALID_CONTENT', 'Invalid webhook payload.');
  if (payload.repository?.full_name?.toLowerCase() !== (config.owner + '/' + config.repo).toLowerCase())
    return json({ status: 'ignored', reason: 'repository' });
  if (request.headers.get('X-GitHub-Event') === 'ping') return json({ status: 'ok' });
  if (request.headers.get('X-GitHub-Event') !== 'push' || payload.ref !== 'refs/heads/' + config.branch)
    return json({ status: 'ignored', reason: 'event_or_branch' });
  // Rebuild from current HEAD, never from the event's historical "after" SHA.
  // Full refresh also covers truncated push commit lists and removed topics.
  return json(await service.reconcileAll());
}
