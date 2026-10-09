import { safeError } from '../domain/errors';
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function errorResponse(error: unknown) {
  const body = safeError(error);
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
    ALREADY_EXISTS: 409, CONTENT_TOO_LARGE: 413, GITHUB_ERROR: 502, PUBLISH_ERROR: 503,
    INTERNAL_ERROR: 500, INVALID_TOPIC: 400, INVALID_FILE: 400, INVALID_CONTENT: 400 }[body.error];
  const response = json(body, status);
  if (status === 401) response.headers.set('WWW-Authenticate', 'Bearer');
  return response;
}
