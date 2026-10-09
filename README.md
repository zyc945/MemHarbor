# MemHarbor

**English** | [简体中文](README.zh-CN.md) · [First-use guide](docs/FIRST_USE.en.md)

**Keep useful context for your next conversation.**

MemHarbor is a memory tool for AI agents. It turns discussions and working notes into memories you can review, update, and retrieve later—project context, decisions, troubleshooting results, and next steps.

Start with **the `memharbor` Skill and a local Git memory vault**, the T0 setup. Use it from Codex, Claude Code, or Cursor with authorized file/Git access. No MCP service or cloud storage account is needed.

## How it works

Tell the agent what to remember. It checks for related memories, reads existing content, and prepares a draft. Once you approve the content or explicitly ask to save it, the agent commits the changes to Git and reads them back to verify.

Your memories are ordinary Markdown files in a directory you choose. They persist across sessions, with changes recorded in Git. In a new conversation, point the agent at that same directory and ask it to retrieve the context you need. Normal conversation is not saved automatically.

## Quick start

Have Git and a signed-in AI client ready. The installation command below also requires Node.js/npm; [manual installation](docs/FIRST_USE.en.md#1-install-the-skill) is available without npm.

### 1. Install the Skill

Run this from the project where you use your agent:

```sh
npx skills add zyc945/memharbor-skill --skill memharbor --agent codex --copy
```

For Claude Code or Cursor, replace `codex` with `claude-code` or `cursor`. Add `--global` to use the Skill across projects. The [Skill repository](https://github.com/zyc945/memharbor-skill) is public and needs no GitHub login. If your installed plugin already includes the Skill, skip this step.

Open a new client session and confirm it discovers `memharbor`. Installing the Skill supplies the agent's instructions; the next step creates the memory vault.

### 2. Create your memory vault

Choose a new directory separate from your software project. In Bash/Zsh:

```sh
git init -b main "$HOME/memharbor-vault"
git -C "$HOME/memharbor-vault" var GIT_AUTHOR_IDENT
git -C "$HOME/memharbor-vault" rev-parse --show-toplevel
```

If the identity check fails, configure your own `user.name` and `user.email` for this repository, as shown in the [first-use guide](docs/FIRST_USE.en.md#2-create-a-local-memory-vault). The last command prints the absolute path to use below. Allow your agent to access that directory through the client's permission settings.

### 3. Save your first memory

Replace `/absolute/path/memharbor-vault` with the path printed above, then send:

```text
Use memharbor with /absolute/path/memharbor-vault only, as a local Git memory vault.
I authorize reading it and committing memory changes I approve. Do not add a remote.
I plan to read one technical book each week, starting with networking fundamentals.
I have not chosen a book yet. Check for duplicates and show me a draft; do not save yet.
```

Check the draft, then say:

```text
Save the approved draft and read it back to verify.
```

Expect the saved topic path, a Git commit, and the verification result. If the agent cannot access the directory or finish the commit, saving is incomplete.

### 4. Pick it up in a new conversation

Open a new session with the Skill available, replace the path as before, and send:

```text
Use memharbor with /absolute/path/memharbor-vault to find my reading plan.
Tell me what I decided and what to do next. Read only; do not update the memory.
```

The agent should retrieve the plan from your vault, including that no book has been chosen. A read-only request should create no commit.

## Everyday use

Once you have specified the vault, use ordinary requests:

| What you need | What to say |
| --- | --- |
| Resume work | “Find the project's current status, blockers, and next steps. Read only.” |
| Save a useful result | “Draft a memory of this troubleshooting result, including the conditions and verified solution.” |
| Update a decision | “Update the existing memory with this decision. Preserve the background and unfinished tasks; show me the changes first.” |

MemHarbor updates related topics and preserves useful context. You review the content; the agent handles file organization and Git operations. You do not need to fill in IDs or API parameters.

Without a remote, the vault stays on this machine. Cross-device access and backups need separate setup. Removing the Skill does not delete your saved memories.

## Where to go next

- [First-use walkthrough](docs/FIRST_USE.en.md): updating memories, checking results, and troubleshooting.
- [Skill installation and updates](docs/SKILLS.md) (简体中文): installation options and upgrading an existing copy.
- [Documentation](docs/README.md): existing service references, engineering notes, and verification scope.

[MIT license](LICENSE).

<details>
<summary>Existing service reference: setup, deployment, and API</summary>

A private GitHub repository stores canonical Markdown and its history, Cloudflare R2 serves the current snapshot, and a Cloudflare Worker exposes REST and stateless MCP. The service source and private data repository are separate. See the [implementation specification](docs/IMPLEMENT.md) and [tier reference](docs/TIERS-USAGE.md).

## Optional service demo

This repository contains the optional service implementation. The standalone Skill repository does not include the service build entry point.

With source access and Node.js 22+, build the credential-free demo:

```sh
git clone https://github.com/zyc945/MemHarbor.git
cd MemHarbor
npm ci
npm run demo
```

With an existing service-source copy, skip cloning. Repository access follows its GitHub visibility; the public Skill installation above is independent.

`npm run demo` completes a guided synthetic read/write round trip and exits. Generate configuration with the correct local paths using `node scripts/demo.mjs --config codex` (or `claude-code` / `cursor`), merge it into your client settings, then open a new session. The configuration launches the raw stdio server with `MEMORY_ACCESS=write`. The demo needs no credentials, has no web UI, and loses all changes when its process exits. Omit the access setting for read-only use. Merge the generated configuration into your client settings; do not launch MCP through npm. For persistent local memory, use T0 above; existing service options follow below. Already have a remote endpoint? Follow [MCP setup](docs/MCP_CLIENTS.md) and [Skill installation](docs/SKILLS.md), or install the [combined plugin](docs/PLUGINS.md).

## Storage and service options

T1: run `npm run build:local`, then configure the MCP client to launch `node /absolute/path/dist/local/main.mjs` directly. Supply GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN and optional GITHUB_BRANCH through its secure environment. Access defaults to read; authorized writers set `MEMORY_ACCESS=write`. `--check` performs a read-only preflight; `--demo` uses disposable synthetic data without credentials or GitHub. Neither verifies remote write permission. Do not launch through npm, whose stdout banners interfere with MCP.

Existing UUID/schema 3 installations keep their configuration, nine tools, complete default reads and webhook secret. `MEMORY_CONTENT_SEARCH=true` explicitly enables independent body indexes; WRITE-only `POST /api/v1/admin/search-index` with `{}` prepares a pinned snapshot. Index failures never change canonical publication success. New time/source conventions are optional Markdown, not required YAML fields. New installations may use the [separate 15-minute UTC Cron example](wrangler.cron.example.jsonc); existing deployments opt in separately. Roll back application/configuration only, retaining current Git/R2 data.

## Guides

The [documentation index](docs/README.md) lists available languages. The first-use walkthrough is available in English and Chinese. Other detailed setup guides are currently in Simplified Chinese; the deployment and API instructions below are in English.

- [T0 first use: local Git memory and troubleshooting](docs/FIRST_USE.en.md) (English / [简体中文](docs/FIRST_USE.md))
- [GitHub access tokens: creation, configuration, verification, and rotation](docs/GITHUB_TOKEN.md) (简体中文)
- [MCP setup for Codex, Claude Code, and Cursor](docs/MCP_CLIENTS.md) (简体中文)
- [MemHarbor plugins: installation and client compatibility](docs/PLUGINS.md) (简体中文)
- [Standalone Skill installation with npx skills](docs/SKILLS.md) (简体中文)
- [Implementation and verification record](docs/VERIFICATION.md) (English)
- [Remaining work](docs/TODO.md) (English)

The existing webhook-based T2 deployment requires a private GitHub data repository, a Cloudflare Worker, a private R2 bucket, and four Worker secrets:
`GITHUB_TOKEN`, `MEMORY_READ_TOKEN`, `MEMORY_WRITE_TOKEN`, and `GITHUB_WEBHOOK_SECRET`.
Replace the example names and placeholders below with your own configuration. New Cron-only installations can omit GITHUB_WEBHOOK_SECRET. An existing secret enables signed webhooks by default; explicit MEMORY_WEBHOOK_ENABLED=false disables them, and true without a secret still rejects requests.

## Install and check

Requires Node.js 22+.

```sh
npm ci
npm run types
npm run typecheck
npm test
npm run test:worker
```

The lockfile pins dependencies. The current official MCP package is `@modelcontextprotocol/server@2`.

- `npm test`: domain, GitHub adapter, REST/MCP, conflict, recovery, and webhook tests. No cloud access.
- `npm run test:worker`: builds the Worker, then verifies reads and writes with the official MCP client in workerd with temporary local R2 storage. GitHub is an isolated test double; no real repository is modified.
- `npm run dev`: Wrangler local mode, with R2 data under `.wrangler/`. GitHub still uses the real remote API; use only a dedicated test repository and test credentials during development.
- `npm run test:remote`: explicitly enabled remote write acceptance tests; see below.

## Deploy from scratch

1. Create a separate **private** GitHub data repository, such as `ai-memory`, and initialize `main` with a README. Keep the service source outside the data repository.
2. Follow the [GitHub token guide](docs/GITHUB_TOKEN.md) (简体中文) to create a fine-grained PAT granting **Contents: Read and write** only to the data repository. The target branch must allow direct commits by that identity; the service never force-pushes or automatically merges.
3. Create an R2 bucket in Cloudflare: `npx wrangler r2 bucket create your-memory-bucket`. Keep the bucket private, with public development URLs and public custom domains disabled.
4. Copy `wrangler.jsonc` to the Git-ignored `wrangler.local.jsonc`. Set `account_id`, Worker `name`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, and the bucket name to your own account and resources. The default file limit is 262144 bytes and can be lowered.
5. Configure the four Worker secrets separately:

   ```sh
   npx wrangler secret put MEMORY_READ_TOKEN --config wrangler.local.jsonc
   npx wrangler secret put MEMORY_WRITE_TOKEN --config wrangler.local.jsonc
   npx wrangler secret put GITHUB_TOKEN --config wrangler.local.jsonc
   npx wrangler secret put GITHUB_WEBHOOK_SECRET --config wrangler.local.jsonc
   ```

   Use distinct random read and write tokens. For local development, copy `.dev.vars.example` to the Git-ignored `.dev.vars` and fill in **test** credentials. Never put secrets in Markdown, configuration files, or Git.
6. Run `npm run deploy -- --config wrangler.local.jsonc` and record the Worker's HTTPS URL.
7. Create a webhook in the GitHub data repository: URL `https://<worker>/webhooks/github`, Content type `application/json`, and Secret matching `GITHUB_WEBHOOK_SECRET`. Subscribe only to `push`, enable SSL verification, and check that ping returns 200.
8. Send `{"all":true}` to `POST /api/v1/admin/reconcile` with the write token to rebuild existing data in R2. A repository containing only its initial README commit produces an empty index.
9. In the agent's remote MCP settings, select Streamable HTTP with endpoint `https://<worker>/mcp` and `Authorization: Bearer <MEMORY_READ_TOKEN or MEMORY_WRITE_TOKEN>`. Reference environment variables or a credential store supported by the client; do not commit tokens to the project.
10. Exercise `list_memories`, `create_memory`, `load_context`, and `checkpoint_memory`, then run remote acceptance tests. Use the dedicated test resources described below for write acceptance.

## MCP

Supports both 2025 Streamable HTTP and the SDK v2 2026 per-request protocol. It keeps no sessions and does not call its own REST API.

| Tool | Parameters | Permission |
| --- | --- | --- |
| list_memories | status?, path_prefix?, limit? (default 50, maximum 100 per page), cursor? | READ |
| search_memories | query, limit? (default 10, maximum 100 per page), cursor?, scope?, status?, path_prefix?, include_archived? | READ |
| resolve_memory | path | READ |
| load_context | topic (UUID), mode?, max_bytes? | READ |
| read_memory_file | topic (UUID), file | READ |
| create_memory | path, title, description?, aliases?, tags?, status?, files?, initial_context? | WRITE |
| update_memory | topic (UUID), file, content, reason, expected_revision | WRITE |
| checkpoint_memory | topic (UUID), files, reason, expected_commit | WRITE |
| move_memory | topic (UUID), path, reason, expected_commit | WRITE |

WRITE includes READ. Tools return structured results; errors have `isError: true` and a stable error object. Deletion and administrative repair are not exposed as MCP tools.

### Listing and pagination

**The 100-item limit for `list_memories` is per page, not a limit on the total number of memories.** Set `limit` to 1–100; the default is up to 50 per page. Continue with `cursor` for more results. Pagination does not limit the total count, but practical repository size remains subject to the runtime constraints below.

In responses, `topics` contains the current page, `total` counts all matching topics in the snapshot, `next_cursor` retrieves the next page, and `git_commit` identifies the snapshot's Git commit.

For example, to list active memories at `works/infra` and all descendant paths, first call `list_memories`:

```json
{"status":"active","path_prefix":"works/infra","limit":100}
```

If `next_cursor` is not `null`, pass it unchanged as `cursor` in the next call, keeping the same filters:

```json
{"status":"active","path_prefix":"works/infra","limit":100,"cursor":"<previous next_cursor>"}
```

Repeat until `next_cursor` is `null`. To list all memories, omit both `status` and `path_prefix` on every call. Cursors pin the snapshot from the first read; omit `cursor` and start again to see the latest data.

When looking for a specific memory, prefer `search_memories` or narrow the list with `path_prefix` to reduce calls and context usage. Traverse every page only when a full inventory is needed. `search_memories` also supports pagination, with a default of 10 and a maximum of 100 per page; keep `query` unchanged when continuing.

### Identity and reads

Creation returns a server-generated `id` and normalized `path`; list and search results include both. The `topic` parameter accepts only a UUID and never treats a path as an implicit ID.

Resource templates: `memory://topics/{topic}` (default context JSON) and `memory://topics/{topic}/{file}` (Markdown). `{topic}` is a UUID, so URIs remain stable when directories move.

Context modes: `default` loads CONTEXT + STATE; `decision` adds DECISIONS; `planning` adds TODO; `evidence` adds SOURCES; `full` loads all five files. A missing requested file returns NOT_FOUND. Default search reads only snapshot metadata and supports Chinese substring matching, English case/whitespace normalization, and token matching, with ties sorted by ID.


Explicit search scope=metadata/content/all enables status/path/archive filters; include_archived defaults true. Responses echo search_scope. Omitting scope preserves old behavior, including REST q queries ignoring status/path_prefix. Body search requires an enabled, ready index; failures identify component=search_index, never a false empty result. Matches include headings/lines/revisions and complete-file URIs, at most three excerpts per topic and 1024 UTF-8 bytes per excerpt; they are not full write baselines.

Explicit max_bytes selects read-only sections/coverage with omission counts and UTF-8 byte accounting, never replacement files/revisions. full rejects budgets. Recheck changed revisions before using evidence; reads do not automatically write or refresh updated_at. Lean topics with missing optional files may be read file by file, distinguishing NOT_FOUND from other failures.

## REST

All routes require Bearer authentication except health checks and the independently signature-verified webhook. Requests and responses use JSON; errors omit upstream response bodies and stacks.

| Method and path | Request |
| --- | --- |
| GET /health | No external storage calls |
| GET /api/v1/topics | Optional q, status, limit |
| POST /api/v1/topics | create_memory parameters |
| GET /api/v1/topics/resolve | Query parameter path; returns the exact UUID and index entry |
| GET /api/v1/index | Authenticated schema 1 projection of path/title/status/description/aliases/tags/updated_at and snapshot time/commit; no UUID, body or internal storage fields |
| POST /api/v1/admin/search-index | WRITE; `{}`; builds the enabled sidecar for a pinned snapshot without changing Git or the canonical pointer |
| GET /api/v1/topics/:topic | Optional mode |
| GET /api/v1/topics/:topic/:file | Read content and revision |
| PUT /api/v1/topics/:topic/:file | content, reason, expected_revision |
| POST /api/v1/topics/:topic/checkpoint | files, reason, expected_commit |
| POST /api/v1/topics/:topic/move | path, reason, expected_commit; preserves UUID |
| DELETE /api/v1/topics/:topic | expected_commit; requires WRITE |
| POST /api/v1/admin/reconcile | {"all":true} or {"topic":"UUID"}; requires WRITE |
| POST /webhooks/github | GitHub push; requires SHA-256 HMAC |

The `:topic` path parameter is a UUID. Encode the `path` query parameter for `resolve` with a standard utility such as URLSearchParams.

For example, with tokens supplied through environment variables:

```sh
curl --fail-with-body "$MEMORY_BASE_URL/api/v1/topics" \
  -H "Authorization: Bearer $MEMORY_READ_TOKEN"

curl --fail-with-body "$MEMORY_BASE_URL/api/v1/admin/reconcile" \
  -H "Authorization: Bearer $MEMORY_WRITE_TOKEN" \
  -H 'Content-Type: application/json' --data '{"all":true}'
```

Updates use the blob revision returned by a read; checkpoints use the returned `git_commit`. Single-file updates also use the Git Database API: one tree, one commit, and a non-forced ref update. A HEAD race may leave unreachable Git objects but will not overwrite the branch.

## Data and publication contract

Memories have an immutable UUID `id` and a mutable, unique directory `path`. Unicode paths are supported, as in this Chinese example:

```yaml
id: 11111111-1111-4111-8111-111111111111
path: 工作/基础设施/网络
title: 网络基础设施
status: active
```

`create_memory` generates UUID v4 IDs; the UUID above only illustrates the format. Each topic has five files—CONTEXT.md, STATE.md, DECISIONS.md, TODO.md, and SOURCES.md—under `<path>/`. A single-segment path maps directly to a root-level directory; no prefix is added.

Path segments support Unicode letters, numbers, combining marks, underscores, and hyphens. Each segment starts with a letter or number and has at most 64 code points. A full path has at most 1024 UTF-16 code units, is case-sensitive, and is normalized to NFC at API boundaries. Absolute paths, empty or dot segments, trailing slashes, backslashes, control characters, and percent signs are rejected. Git directories and YAML paths must already be NFC and match exactly.

Parent directories may be categories or topics with their own UUIDs. In one Git commit, `move_memory` moves only the topic's five direct files and updates its YAML path, preserving its ID, descendants, and unrelated files. An existing topic at the destination causes a conflict. Normal content updates cannot change `id` or `path`. Manual directory moves must also preserve the ID and update the YAML path; duplicate UUIDs or mismatched paths prevent publication.

If you know the path, first call `resolve_memory({"path":"工作/基础设施/网络"})`, then use the returned ID as `topic` in read and write tools. Creation example:

```json
{"path":"工作/基础设施/网络","title":"网络基础设施","initial_context":"长期背景正文"}
```

Exact REST lookup:

```js
const query = new URLSearchParams({ path: "工作/基础设施/网络" });
const url = "/api/v1/topics/resolve?" + query;
// After resolving the id: GET /api/v1/topics/<UUID>
// Stable resource URI: memory://topics/<UUID>/STATE.md
```

Legacy path IDs are no longer accepted for reads or writes. See the [UUID/path migration guide](docs/IDENTITY_MIGRATION.md) (简体中文). Index and metadata use `schema_version` 3 and can be rebuilt through reconcile without adding a database.

A Git commit means the data is durably saved. An R2 failure returns `committed_not_published` without rolling back Git. Retrying an update/checkpoint with identical content returns a noop and republishes, even if the expected revision is stale; different content still requires strict conflict checks. Creating an existing topic returns CONFLICT. Reconcile repairs publication failures after creation.

V1 targets small personal repositories. Publication validates the full Git snapshot, reusing R2 content by blob SHA and a request-local cache. It prepares immutable `_blobs/<sha>` and `_snapshots/<uuid>.json`, checks Git HEAD, then conditionally updates `_current.json` using its ETag, retrying races up to three times. Each read pins one manifest and never mixes files from different publications.

- Invalid canonical file paths, YAML, oversized files, non-regular files, or truncated Git trees reject the entire publication and preserve the last readable snapshot.
- List/search return `topics`, `total`, `next_cursor`, and `git_commit`. Pages contain at most 100 entries; continue with the cursor and unchanged filters. List supports `path_prefix` for a path and its descendants. Cursors pin an older snapshot; restart to refresh.
- Create supports `status` and `files`, saving all five complete files in one Git commit. `files.CONTEXT.md` accepts body content only; the server generates YAML and the title. Other files accept complete Markdown. `initial_context` remains supported but cannot supply body content alongside `files.CONTEXT.md`.
- Git and R2 are not a cross-service transaction. Interruptions can leave unpublished Git commits; webhook redelivery or reconcile repairs them. Commits to other topics can also cause checkpoint conflicts.
- Old manifests, blobs, and legacy path objects are retained rather than automatically deleted, protecting in-flight reads and pagination. Deleting a memory is not physical erasure. See [snapshot operations](docs/PUBLICATION.md) (简体中文) for capacity, upgrades, and maintenance.
- Caching reduces GitHub downloads, but full trees, file validation, and indexing still consume memory and subrequests. Larger cold imports require Workers Paid and an assessment of platform limits; capacity is not unlimited.
- Content and history remain in GitHub. Callers must never store passwords, secrets, cookies, or similar credentials.

## Remote integration acceptance

Use only a dedicated test Worker, private test repository, and private test R2 bucket. The script creates a unique `acceptance/smoke-*` topic, commits changes, edits GitHub directly to verify real webhook delivery, and deletes the test topic in `finally`. Historical commits remain.

Supply these environment variables securely outside the repository:

```text
MEMORY_REMOTE_TEST=1
MEMORY_BASE_URL=https://<test-worker>
MEMORY_READ_TOKEN
MEMORY_WRITE_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH=main
GITHUB_TOKEN
GITHUB_WEBHOOK_SECRET
```

Run `npm run test:remote`. It covers private repository access, commits and publication, the MCP client, stale-revision conflicts, noops, single-commit checkpoints, real GitHub push callbacks, and replay of older events. It exits immediately unless explicitly enabled. Local unit tests cover R2 fault injection; the remote script does not break bucket configuration to simulate failures.

## Engineering boundaries

`src/domain` defines types and validation; `src/memory` implements memory semantics; `src/github` and `src/r2` provide replaceable storage adapters. `src/http` and `src/mcp` call the same MemoryService directly. Structured logs contain only request IDs, operations, topic/file identifiers, commits, duration, and results—never tokens or Markdown bodies.

</details>
