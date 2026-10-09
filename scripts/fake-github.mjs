import { createHash } from 'node:crypto';
export function fakeGitHub() {
  const blobs = new Map(), trees = new Map([['tree-0', {}]]), commits = new Map([
    ['commit-0', { tree: { sha: 'tree-0' }, committer: { date: '2026-09-21T00:00:00Z' }, parents: [] }],
  ]);
  let head = 'commit-0', calls = 0;
  const json = (value, status = 200) => Response.json(value, { status });
  return {
    get calls() { return calls; },
    get head() { return head; },
    get commitCount() { return commits.size - 1; },
    async fetch(request) {
      calls++;
      const url = new URL(request.url);
      if (url.hostname !== 'api.github.com' || !url.pathname.startsWith('/repos/test-owner/test-memory'))
        throw new Error('Unexpected outbound request');
      if (request.headers.get('Authorization') !== 'Bearer fake-github') return json({}, 401);
      const path = url.pathname.replace('/repos/test-owner/test-memory', '');
      if (request.method === 'GET') {
        if (path === '') return json({ private: true });
        if (path === '/git/ref/heads/main') return json({ object: { sha: head } });
        if (path.startsWith('/git/commits/')) return json(commits.get(path.split('/').at(-1)));
        if (path.startsWith('/git/trees/')) return json({ truncated: false, tree: Object.entries(trees.get(path.split('/').at(-1))).map(([path, sha]) => ({
          path, sha, mode: '100644', type: 'blob', size: Buffer.byteLength(blobs.get(sha)),
        })) });
        if (path.startsWith('/git/blobs/')) return json({
          content: Buffer.from(blobs.get(path.split('/').at(-1))).toString('base64'), encoding: 'base64',
        });
      }
      const body = await request.json();
      if (path === '/git/trees' && request.method === 'POST') {
        const tree = { ...trees.get(body.base_tree) };
        for (const entry of body.tree) {
          if (entry.sha === null) delete tree[entry.path];
          else {
            const bytes = Buffer.from(entry.content);
            const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
            blobs.set(sha, entry.content); tree[entry.path] = sha;
          }
        }
        const sha = 'tree-' + trees.size; trees.set(sha, tree); return json({ sha });
      }
      if (path === '/git/commits' && request.method === 'POST') {
        const sha = 'commit-' + commits.size;
        commits.set(sha, { tree: { sha: body.tree }, committer: { date: new Date().toISOString() }, parents: body.parents });
        return json({ sha });
      }
      if (path === '/git/refs/heads/main' && request.method === 'PATCH') {
        if (body.force !== false || commits.get(body.sha).parents[0] !== head) return json({}, 422);
        head = body.sha; return json({ object: { sha: head } });
      }
      return json({}, 404);
    },
  };
}
