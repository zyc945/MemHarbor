# AI Memory Service — Implementation Specification

## Review fixes amendment — 2026-09-29

Search filters are validated by MemoryService only when scope is explicit,
including MCP requests. List-contained fences remain intact in search blocks
and budget sections. New sidecars use `_search/v2/<git_commit>.json`, with block
counts, a SHA-256 payload digest and block position/order checks. Existing v1
objects are retained; enabled deployments build v2 after upgrading. Old body
search cursors must restart, while metadata cursor fingerprints stay unchanged.
Canonical schema 3 publication and default reads/writes are unchanged.

## Progressive tiers amendment — 2026-09-24

The implementation adds a separate Node stdio entry, T0 Skill conventions,
opt-in body search in `_search/v1/<git_commit>.json`, explicit context byte
budgets, an authenticated public index projection, and an optional scheduled
handler. Existing schema 3 publication, default read/write results, nine MCP
tools, legacy cursors and secret-enabled webhooks remain the compatibility
baseline. New content conventions do not add required YAML fields or approval
gates. Index errors do not change canonical publication success; no automatic
data migration or production deployment is part of this implementation.

An explicitly standalone T0 vault uses local Git as its authoritative store and
does not require a remote or a push. T1/T2 and vaults shared with those services
continue to use the private GitHub repository as their authoritative store.

See [usage](TIERS-USAGE.md), [contracts and acceptance](TIERS.md),
[verification](VERIFICATION.md) and [remaining work](TODO.md). The historical
specification below is retained; local service checks do not replace real Agent
behavioral evaluation or isolated remote acceptance.

**Status:** V1 Implementation Specification
**Target:** Personal AI Context / Memory Infrastructure
**Primary clients:** Codex, Claude Code, ChatGPT-compatible agents, custom agents
**Runtime:** Cloudflare Workers
**Storage:** Cloudflare R2
**Version history:** GitHub private repository
**Agent protocol:** MCP
**Language:** TypeScript

---

# Immutable publication amendment — 2026-09-21

This amendment supersedes the R2 layout and publication algorithms below.
Git paths remain canonical; R2 uses content-addressed `_blobs/<sha>`, immutable
`_snapshots/<uuid>.json` (schema 3, index plus metadata), and a conditional ETag
`_current.json` pointer. Capture pointer before Git snapshot, prepare objects,
check HEAD, CAS pointer, recheck HEAD; retry at most three times. Never delete
old snapshots/blobs during publication. Each read pins one manifest.
Invalid canonical paths abort publication rather than disappearing from the index.
Git downloads reuse verified SHA cache entries and request-local blobs.
List/search accept cursor and return total/next_cursor/git_commit; pagination pins
one snapshot. List also supports path_prefix. Create accepts status and files for
one-commit full creation; CONTEXT.md input is body only. See PUBLICATION.md.

---

# Stable UUID and path amendment — 2026-09-21

This amendment supersedes all path-as-ID, legacy topics/<id> mapping, seven-tool,
and schema_version 1 examples in the historical specification below.

- `id` is a server-generated lowercase UUID v4 and remains unchanged when moved.
- `path` is a unique, case-sensitive Unicode NFC directory relative to the Git
  root, for both single- and multi-segment paths. Segments begin with a Unicode
  letter/number and then letters/numbers/marks/underscore/hyphen, max 64 code
  points each; whole path max 1024 UTF-16 units. No dot/empty segments, controls,
  backslashes, absolute paths or percent-encoded raw paths.
- CONTEXT YAML requires id, path, title, status, with optional description, aliases
  and tags. Directory must equal path; duplicate UUIDs and non-NFC directories or
  YAML paths fail validation before publication. Normal edits cannot change id/path.
- Create accepts path (not id) and returns id/path. Existing tool parameter `topic`
  means UUID only. No implicit UUID/path aliases. List/search entries contain both.
- Nine MCP tools: the original seven plus `resolve_memory({path})` (read) and
  `move_memory({topic,path,expected_commit,reason})` (write). Delete/reconcile stay
  REST-only. Resources use memory://topics/<UUID> and /<file>.
- REST /api/v1/topics/:topic uses UUID. GET /api/v1/topics/resolve?path=... resolves
  an exact encoded path; POST /api/v1/topics/:topic/move moves only direct files.
- Move uses one non-forced Git commit to rewrite YAML path and relocate the five
  files; children and unrelated files stay put. UUID remains unchanged. Occupied
  destinations/stale HEAD conflict; an already-completed move can retry as noop.
- Index and metadata schema_version 3 record UUID/path and snapshot commit. Reads
  resolve UUID through R2's global index and verify identity/commit/blob coherence.
  Git mutations resolve UUID from a validated canonical snapshot, never stale R2.
- Offline migration script previews by default; explicit --write generates UUIDs
  and adds path without moving directories or committing. Legacy topics/foo stays
  at path topics/foo. See IDENTITY_MIGRATION.md. No automatic identity guessing.

The original specification below is retained as historical implementation context;
README.md and the schemas describe the current contract.

---

# 1. Goal

Implement a small, portable AI Memory / Context service that allows multiple AI agents to share long-lived context.

The system must make it easy for an agent to:

* discover available memories;
* search for a topic;
* load the current context of a topic;
* read individual memory files;
* update memory;
* checkpoint several related changes;
* create new memory topics.

The system must remain independent from any specific AI vendor.

Memory data must remain ordinary Markdown files.

Do **not** introduce PostgreSQL, vector databases, embeddings, GraphRAG, Redis, Durable Objects, or an LLM into V1.

The desired model is:

```text
GitHub
  =
canonical history / source of truth

Cloudflare R2
  =
latest published snapshot

Cloudflare Worker
  =
memory service + authentication + MCP

MCP
  =
agent-facing interface
```

---

# 2. Core design principles

## 2.1 GitHub is authoritative

Every mutation must first become a Git commit.

R2 is a derived serving layer.

If GitHub and R2 disagree:

```text
GitHub wins.
```

R2 must always be rebuildable from GitHub.

---

## 2.2 R2 is optimized for reads

Normal Agent reads must not call GitHub.

Read path:

```text
Agent
   ↓
MCP
   ↓
Worker
   ↓
R2
```

Write path:

```text
Agent
   ↓
MCP
   ↓
Worker
   ↓
GitHub commit
   ↓
R2 publish
```

R2 Workers bindings support direct `get`, `put`, `delete`, `head`, and `list` operations. R2 writes and deletes are strongly consistent, which makes it appropriate as the current-state serving layer.

---

## 2.3 Markdown is the persistent format

Do not create a proprietary memory database format.

A memory topic consists primarily of:

```text
CONTEXT.md
STATE.md
DECISIONS.md
TODO.md
SOURCES.md
```

The files must remain usable without this service.

A person should be able to clone the Git repository and understand/edit the complete memory system manually.

---

## 2.4 MCP exposes memory semantics, not storage semantics

Do not expose tools such as:

```text
get_r2_object()
put_r2_object()
github_commit_file()
```

Expose:

```text
search_memories()
load_context()
update_memory()
checkpoint_memory()
```

Agents should not need to know:

```text
bucket names
GitHub repository paths
Git SHAs
R2 object keys
Cloudflare account IDs
```

except revision identifiers returned for concurrency control.

---

# 3. Architecture

```text
                    Local / Remote Agents

             ┌──────────┬──────────┬──────────┐
             │          │          │          │
           Codex    Claude Code  Agent X   ChatGPT
             │          │          │          │
             └──────────┴──── MCP ─┴──────────┘
                              │
                              ▼
                https://memory.example.com/mcp

                    Cloudflare Worker
                              │
                ┌─────────────┴─────────────┐
                │                           │
              READ                        WRITE
                │                           │
                ▼                           ▼
        Cloudflare R2                GitHub REST API
        latest snapshot                    │
                                           │ commit
                                           ▼
                                      GitHub repo
                                           │
                                       push webhook
                                           │
                                           ▼
                                    Cloudflare Worker
                                           │
                                     reconcile/publish
                                           │
                                           ▼
                                          R2
```

The webhook path provides two properties:

1. GitHub edits performed outside the Memory API are reflected back into R2.
2. If synchronous R2 publishing after a commit fails, the GitHub webhook provides a second opportunity to publish the committed state.

---

# 4. Repository model

Use two repositories.

## Service repository

Suggested name:

```text
ai-memory-service
```

Contains Worker/MCP implementation.

## Data repository

Suggested name:

```text
ai-memory
```

Private repository containing only memory data.

Example:

```text
ai-memory/
├── README.md
└── topics/
    ├── upload-acceleration/
    │   ├── CONTEXT.md
    │   ├── STATE.md
    │   ├── DECISIONS.md
    │   ├── TODO.md
    │   └── SOURCES.md
    │
    └── agent-memory/
        ├── CONTEXT.md
        ├── STATE.md
        ├── DECISIONS.md
        ├── TODO.md
        └── SOURCES.md
```

Do not mix the Worker implementation with memory content.

---

# 5. R2 layout

Use one R2 bucket:

```text
ai-memory
```

Object layout:

```text
_index.json

topics/
├── upload-acceleration/
│   ├── CONTEXT.md
│   ├── STATE.md
│   ├── DECISIONS.md
│   ├── TODO.md
│   ├── SOURCES.md
│   └── _meta.json
│
└── agent-memory/
    ├── ...
    └── _meta.json
```

`_index.json` and `_meta.json` are derived serving metadata.

They do **not** need to be canonical Git files.

They must be reproducible from the Git repository.

---

# 6. Topic format

Each topic directory represents one long-lived subject.

Topic IDs must use:

```regex
^[a-z0-9][a-z0-9_-]{0,63}$
```

Examples:

```text
upload-acceleration
rds-aurora
agent-memory
dns-debugging
```

Reject:

```text
../foo
Foo Bar
a/b
```

Never allow arbitrary user-controlled paths.

---

# 7. CONTEXT.md

`CONTEXT.md` represents relatively stable context.

Use YAML front matter:

```markdown
---
id: upload-acceleration
title: 跨境上传加速
aliases:
  - 上传兜底
  - TOS upload
  - aliyun ga
tags:
  - upload
  - tos
  - aliyun
status: active
---

# 跨境上传加速

## Goal

提高中国大陆客户端向海外对象存储上传的成功率。

## Background

...

## Constraints

...

## Architecture

...
```

Required front matter:

```text
id
title
status
```

Optional:

```text
aliases
tags
description
```

Allowed status values:

```text
active
paused
completed
archived
```

`id` must equal the topic directory name.

---

# 8. STATE.md

Represents the current working state.

Recommended structure:

```markdown
# Current State

Updated: 2026-09-21

## Current Status

...

## Current Problems

...

## Latest Confirmed Conclusions

...

## Next Focus

...
```

`STATE.md` should answer:

> If an agent resumes this topic today, what does it need to know immediately?

Do not turn STATE into an append-only history.

Update it to represent the latest valid state.

Git contains the historical versions.

---

# 9. DECISIONS.md

Store important decisions and rationale.

Recommended format:

```markdown
# Decisions

## D-20260921-001 — GitHub as canonical history

Status: active
Date: 2026-09-21

### Context

...

### Decision

GitHub is the canonical version history.

### Reasons

...

### Alternatives

...

### Consequences

...
```

If a decision becomes obsolete:

```text
Status: superseded
Superseded-by: D-20261001-002
```

Do not silently remove important historical decisions.

---

# 10. TODO.md

Only store actionable work.

Example:

```markdown
# TODO

- [x] Create R2 bucket
- [x] Implement read API
- [ ] Implement GitHub mutation path
- [ ] Configure webhook
- [ ] Configure Codex MCP
```

Do not put long analysis in this file.

---

# 11. SOURCES.md

Store provenance.

Example:

```markdown
# Sources

## Documentation

- Cloudflare R2 documentation
- GitHub REST API documentation

## Repositories

- project-x / src/network/

## Conversations

- 2026-09-21 architecture discussion

## External references

- ...
```

Never store:

```text
passwords
private keys
API secrets
bearer tokens
session cookies
```

---

# 12. Derived `_index.json`

R2 contains:

```text
/_index.json
```

Example:

```json
{
  "schema_version": 1,
  "generated_at": "2026-09-21T04:00:00Z",
  "topics": [
    {
      "id": "upload-acceleration",
      "title": "跨境上传加速",
      "description": "大陆客户端海外上传可靠性与兜底方案",
      "aliases": [
        "上传兜底",
        "TOS upload",
        "aliyun ga"
      ],
      "tags": [
        "upload",
        "tos",
        "aliyun"
      ],
      "status": "active",
      "updated_at": "2026-09-21T04:00:00Z"
    }
  ]
}
```

This file is a read/search optimization.

It is not the source of truth.

If lost:

```text
GitHub topics/*/CONTEXT.md
        ↓
rebuild
        ↓
_index.json
```

---

# 13. Derived `_meta.json`

Each topic receives:

```text
topics/{topic}/_meta.json
```

Example:

```json
{
  "schema_version": 1,
  "topic": "upload-acceleration",
  "git_commit": "abc123...",
  "published_at": "2026-09-21T04:00:00Z",
  "files": {
    "CONTEXT.md": {
      "git_blob_sha": "111...",
      "size": 5321
    },
    "STATE.md": {
      "git_blob_sha": "222...",
      "size": 2183
    }
  }
}
```

Purpose:

* identify which Git version produced the R2 snapshot;
* expose revisions to Agents;
* debug synchronization;
* support optimistic concurrency.

---

# 14. File constraints

V1 only permits these memory filenames:

```text
CONTEXT.md
STATE.md
DECISIONS.md
TODO.md
SOURCES.md
```

Do not permit arbitrary paths through mutation APIs.

Recommended maximum:

```text
256 KiB per Markdown file
```

If a topic consistently exceeds this, split the topic rather than increasing context indefinitely.

---

# 15. Authentication

Use three Worker secrets:

```text
MEMORY_READ_TOKEN
MEMORY_WRITE_TOKEN
GITHUB_TOKEN
```

And:

```text
GITHUB_WEBHOOK_SECRET
```

The GitHub token should initially be a fine-grained PAT restricted to the `ai-memory` repository with repository `Contents: write`; GitHub's file and Git database write APIs support this permission model.

Store secrets using Cloudflare Worker secrets, not source code or `wrangler.jsonc`. Wrangler supports secret configuration through `wrangler secret put`.

Authorization:

```text
READ token:
  list
  search
  load
  read

WRITE token:
  everything READ can do
  create
  update
  checkpoint
```

Do not send the GitHub token or R2 credentials to Agents.

---

# 16. Environment configuration

Non-secret Worker variables:

```text
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH=main
MAX_FILE_BYTES=262144
```

R2 binding:

```text
MEMORY_BUCKET
```

Secrets:

```text
GITHUB_TOKEN
GITHUB_WEBHOOK_SECRET
MEMORY_READ_TOKEN
MEMORY_WRITE_TOKEN
```

Suggested `wrangler.jsonc` structure:

```json
{
  "name": "ai-memory-service",
  "main": "src/index.ts",
  "compatibility_date": "<current-date>",
  "vars": {
    "GITHUB_OWNER": "<owner>",
    "GITHUB_REPO": "ai-memory",
    "GITHUB_BRANCH": "main",
    "MAX_FILE_BYTES": "262144"
  },
  "r2_buckets": [
    {
      "binding": "MEMORY_BUCKET",
      "bucket_name": "ai-memory"
    }
  ]
}
```

Do not place secrets in this file.

---

# 17. REST API

MCP is the primary Agent interface.

REST remains useful for testing, administration, and non-MCP clients.

Base:

```text
/api/v1
```

Implement:

```text
GET    /api/v1/topics
GET    /api/v1/topics?q=<query>

POST   /api/v1/topics

GET    /api/v1/topics/:topic
GET    /api/v1/topics/:topic/:file

PUT    /api/v1/topics/:topic/:file

POST   /api/v1/topics/:topic/checkpoint

DELETE /api/v1/topics/:topic
```

Also:

```text
GET  /health
POST /webhooks/github
POST /api/v1/admin/reconcile
```

`DELETE` and `admin/reconcile` require WRITE authorization and must not initially be exposed as MCP tools.

---

# 18. MCP endpoint

Expose:

```text
/mcp
```

Use the current official MCP TypeScript SDK v2.

The current SDK supports MCP servers on Web Standard runtimes such as Cloudflare Workers and provides Streamable HTTP handling directly.

Use:

```text
@modelcontextprotocol/server
zod
```

Prefer stateless MCP.

Do not add session storage in V1.

The MCP implementation must call the same internal `MemoryService` used by REST.

Do **not** implement MCP by making HTTP requests back into the same Worker.

Correct:

```text
REST ─┐
      ├── MemoryService
MCP ──┘
```

Incorrect:

```text
MCP → fetch("https://self/api/v1/...")
```

---

# 19. MCP tools

Implement the following V1 tools.

## `list_memories`

Input:

```json
{
  "status": "active",
  "limit": 50
}
```

Both fields optional.

Return:

```json
{
  "topics": [
    {
      "id": "upload-acceleration",
      "title": "跨境上传加速",
      "description": "...",
      "status": "active",
      "updated_at": "..."
    }
  ]
}
```

Source:

```text
R2 /_index.json
```

---

## `search_memories`

Input:

```json
{
  "query": "阿里云上传兜底",
  "limit": 10
}
```

V1 search must be deterministic and local.

Search:

```text
id
title
aliases
tags
description
```

Ranking order:

```text
exact id
>
exact alias
>
title match
>
alias substring
>
tag match
>
description match
```

Support Chinese substring matching.

For English:

* lowercase;
* normalize whitespace;
* token matching.

Do not use embeddings in V1.

---

## `load_context`

Input:

```json
{
  "topic": "upload-acceleration",
  "mode": "default"
}
```

Modes:

```text
default
decision
planning
evidence
full
```

Behavior:

```text
default:
  CONTEXT.md
  STATE.md

decision:
  CONTEXT.md
  STATE.md
  DECISIONS.md

planning:
  CONTEXT.md
  STATE.md
  TODO.md

evidence:
  CONTEXT.md
  STATE.md
  SOURCES.md

full:
  all five files
```

Return:

```json
{
  "topic": "upload-acceleration",
  "git_commit": "...",
  "files": {
    "CONTEXT.md": "...",
    "STATE.md": "..."
  },
  "revisions": {
    "CONTEXT.md": "<git-blob-sha>",
    "STATE.md": "<git-blob-sha>"
  }
}
```

---

## `read_memory_file`

Input:

```json
{
  "topic": "upload-acceleration",
  "file": "DECISIONS.md"
}
```

Return:

```json
{
  "topic": "upload-acceleration",
  "file": "DECISIONS.md",
  "content": "...",
  "revision": "<git-blob-sha>",
  "git_commit": "..."
}
```

Only allow the five defined filenames.

---

## `create_memory`

Input:

```json
{
  "id": "new-topic",
  "title": "New Topic",
  "description": "...",
  "aliases": [],
  "tags": [],
  "initial_context": "..."
}
```

Operation must create, in a **single Git commit**:

```text
CONTEXT.md
STATE.md
DECISIONS.md
TODO.md
SOURCES.md
```

Initial empty files must still contain useful headings.

Then publish all five files to R2.

Finally update `_index.json`.

If the topic already exists:

```text
return CONFLICT
```

---

## `update_memory`

Input:

```json
{
  "topic": "upload-acceleration",
  "file": "STATE.md",
  "content": "...",
  "reason": "Completed fallback validation",
  "expected_revision": "<git-blob-sha>"
}
```

`expected_revision` is mandatory for updates to an existing file.

The service must compare it against GitHub's current blob SHA.

If different:

```text
return CONFLICT
```

Do not overwrite.

Successful commit message:

```text
memory(upload-acceleration): Completed fallback validation
```

Then publish updated content to R2.

Return:

```json
{
  "status": "updated",
  "git_commit": "...",
  "revision": "...",
  "published": true
}
```

---

## `checkpoint_memory`

Used when an Agent has completed a meaningful unit of work.

Input:

```json
{
  "topic": "upload-acceleration",
  "reason": "Finish GA fallback evaluation",
  "expected_commit": "<git-commit-sha>",
  "files": {
    "STATE.md": "...",
    "DECISIONS.md": "...",
    "TODO.md": "..."
  }
}
```

All supplied files must be committed in **one Git commit**.

Use GitHub Git Database APIs:

```text
current branch ref
      ↓
current commit/tree
      ↓
create updated tree
      ↓
create commit
      ↓
update branch ref
```

GitHub's Git tree API explicitly supports creating a tree relative to a `base_tree`, followed by creation of a commit and update of the branch reference.

If branch HEAD differs from `expected_commit`:

```text
return CONFLICT
```

Do not attempt an automatic semantic merge.

Agent must:

```text
reload
→ reconcile changes
→ retry
```

---

# 20. MCP resources

Also expose read-only resource templates where practical:

```text
memory://topics/{topic}
memory://topics/{topic}/{file}
```

`memory://topics/{topic}` should represent the default context:

```text
CONTEXT.md
+
STATE.md
```

Resources are optional convenience.

The MCP tools remain the portable primary interface because client support for resource UX can differ.

---

# 21. GitHub single-file mutation

For `update_memory`, GitHub Contents API is acceptable.

Flow:

```text
GET current GitHub file
        ↓
obtain content + blob SHA
        ↓
compare expected_revision
        ↓
PUT updated content with current SHA
        ↓
Git commit created
```

GitHub's Contents API requires the current file SHA when updating an existing file and can return `409 Conflict`, which provides useful optimistic concurrency behavior.

Do not perform conflicting file create/update/delete operations against the same branch in parallel.

---

# 22. Multi-file Git mutation

For:

```text
create_memory
checkpoint_memory
```

do not create one commit per file.

Use GitHub Git Database APIs so the operation creates one commit containing all related changes.

Conceptually:

```text
GET refs/heads/main
        ↓
GET current commit
        ↓
create blobs/tree
        ↓
create commit(parent=current HEAD)
        ↓
PATCH refs/heads/main
```

Do not force-update the branch.

A non-fast-forward update must become:

```text
CONFLICT
```

---

# 23. Write transaction semantics

There is no distributed transaction between GitHub and R2.

Therefore define the transaction boundary as:

```text
GitHub commit = durable success
R2 publish     = materialization
```

Mutation flow:

```text
1. validate
2. concurrency check
3. GitHub commit
4. publish changed files to R2
5. update topic _meta.json
6. update _index.json when required
7. return response
```

Possible result:

```text
GitHub ✅
R2     ❌
```

Do **not** roll back GitHub.

Return:

```json
{
  "status": "committed_not_published",
  "git_commit": "abc123",
  "published": false
}
```

The GitHub webhook/reconcile mechanism must repair R2.

---

# 24. Idempotency

Mutation retries must not create unnecessary duplicate Git commits.

Before creating a commit:

```text
fetch current GitHub content
```

If GitHub already contains exactly the desired content:

```text
do not commit again
publish/re-publish R2
return status=noop
```

Example:

```json
{
  "status": "noop",
  "git_commit": "...",
  "published": true
}
```

This also allows a client to safely retry after:

```text
GitHub success
R2 failure
client timeout
```

---

# 25. Optimistic concurrency

Concurrency protection is mandatory.

## Single-file update

Use:

```text
expected_revision = Git blob SHA
```

## Multi-file checkpoint

Use:

```text
expected_commit = branch HEAD commit SHA
```

Never silently overwrite a different revision.

Conflict result:

```json
{
  "error": "CONFLICT",
  "message": "Memory changed since it was read.",
  "current_revision": "...",
  "action": "Reload memory and retry after reconciling changes."
}
```

---

# 26. GitHub webhook

Configure a GitHub repository webhook:

```text
POST https://memory.example.com/webhooks/github
```

Subscribe initially only to:

```text
push
```

Verify:

```text
X-Hub-Signature-256
```

using:

```text
GITHUB_WEBHOOK_SECRET
```

Reject invalid signatures.

Only process:

```text
configured repository
configured branch
```

---

# 27. Webhook reconciliation strategy

Do not blindly trust that webhook events arrive in strict order.

When a webhook is received:

```text
1. determine affected topics
2. query CURRENT GitHub branch HEAD
3. fetch the current files from that HEAD
4. publish that current state to R2
```

Do not publish content solely from the historical webhook payload.

This means an old/reordered webhook still converges toward current GitHub state.

The webhook must be idempotent.

---

# 28. Synchronous publish + webhook publish

When an API mutation succeeds:

```text
GitHub commit
        ↓
synchronous R2 publish
```

The same Git commit will subsequently generate a GitHub webhook.

The webhook may publish the same state again.

That is acceptable.

Publishing must be idempotent.

This intentional duplication provides self-healing.

---

# 29. Full reconciliation

Implement internal:

```text
reconcileAll()
reconcileTopic(topic)
```

Expose administrative endpoint:

```text
POST /api/v1/admin/reconcile
```

Possible input:

```json
{
  "topic": "upload-acceleration"
}
```

or:

```json
{
  "all": true
}
```

Algorithm for full reconciliation:

```text
read current GitHub main tree
        ↓
discover topics
        ↓
fetch canonical memory files
        ↓
replace corresponding R2 objects
        ↓
remove stale derived topic objects
        ↓
regenerate _index.json
        ↓
regenerate _meta.json
```

This operation is for repair/bootstrap, not normal reads.

---

# 30. Index updates

When:

```text
topic created
CONTEXT.md updated
topic deleted
```

update the corresponding `_index.json` entry.

When another topic file changes:

```text
STATE.md
DECISIONS.md
TODO.md
SOURCES.md
```

update:

```text
updated_at
```

for that topic.

Keep `_index.json` small and simple.

Do not place full memory content into the index.

---

# 31. Read path

`load_context` must read R2 only.

Example:

```text
load_context(
  topic="upload-acceleration",
  mode="decision"
)

       ↓

R2 GET:
topics/upload-acceleration/CONTEXT.md
topics/upload-acceleration/STATE.md
topics/upload-acceleration/DECISIONS.md
topics/upload-acceleration/_meta.json
```

No GitHub request should occur during a normal successful read.

---

# 32. Error model

Use a stable error model:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable explanation",
  "details": {}
}
```

Required error codes:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
ALREADY_EXISTS
INVALID_TOPIC
INVALID_FILE
INVALID_CONTENT
CONTENT_TOO_LARGE
CONFLICT
GITHUB_ERROR
PUBLISH_ERROR
INTERNAL_ERROR
```

Never expose:

```text
GitHub token
Worker secret
authorization header
internal stack trace
```

to MCP clients.

---

# 33. Service source layout

Implement approximately:

```text
ai-memory-service/
├── package.json
├── tsconfig.json
├── wrangler.jsonc
├── README.md
├── AGENTS.md
│
├── docs/
│   └── IMPLEMENTATION.md
│
├── src/
│   ├── index.ts
│   ├── env.ts
│   │
│   ├── domain/
│   │   ├── types.ts
│   │   ├── schemas.ts
│   │   └── errors.ts
│   │
│   ├── auth/
│   │   └── bearer.ts
│   │
│   ├── github/
│   │   ├── client.ts
│   │   ├── contents.ts
│   │   ├── git-database.ts
│   │   └── webhook.ts
│   │
│   ├── r2/
│   │   ├── repository.ts
│   │   └── publisher.ts
│   │
│   ├── memory/
│   │   ├── service.ts
│   │   ├── index.ts
│   │   ├── parser.ts
│   │   ├── search.ts
│   │   └── reconcile.ts
│   │
│   ├── mcp/
│   │   ├── server.ts
│   │   ├── tools.ts
│   │   └── resources.ts
│   │
│   └── http/
│       ├── router.ts
│       ├── rest.ts
│       └── responses.ts
│
└── test/
    ├── memory-service.test.ts
    ├── search.test.ts
    ├── concurrency.test.ts
    ├── webhook.test.ts
    └── integration.test.ts
```

Exact filenames may change if justified, but preserve these module boundaries.

---

# 34. Dependency policy

Keep dependencies minimal.

Required/expected:

```text
TypeScript
@modelcontextprotocol/server
zod
wrangler
```

Optional:

```text
yaml/front-matter parser
```

Avoid large frameworks unless they reduce meaningful complexity.

Do not add an ORM.

Do not add a database library.

Do not add an AI SDK.

---

# 35. GitHub client

Implement a small typed GitHub API client around `fetch`.

Do not require Octokit unless it clearly simplifies the code.

Required operations:

```text
get file
create/update file
get branch ref
get commit
create tree
create commit
update ref
list/read repository tree
```

Send the appropriate GitHub REST API version header.

Centralize GitHub error conversion.

---

# 36. R2 repository abstraction

Create a simple abstraction:

```ts
interface MemoryObjectStore {
  get(key: string): Promise<StoredObject | null>;
  put(
    key: string,
    content: string,
    metadata?: Record<string, string>
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<StoredObjectInfo[]>;
}
```

Cloudflare R2 implements this through the Worker binding.

This keeps the system portable to:

```text
AWS S3
RustFS
MinIO
```

later without changing MemoryService or MCP.

---

# 37. Git repository abstraction

Similarly:

```ts
interface MemoryVersionStore {
  readFile(...): Promise<VersionedFile>;
  updateFile(...): Promise<CommitResult>;
  commitFiles(...): Promise<CommitResult>;
  listCanonicalFiles(...): Promise<...>;
}
```

The concrete V1 implementation is GitHub.

Do not spread GitHub-specific API details throughout MemoryService.

---

# 38. Domain service

`MemoryService` owns business semantics.

Suggested methods:

```text
listMemories()
searchMemories()
loadContext()
readMemoryFile()
createMemory()
updateMemory()
checkpointMemory()
reconcileTopic()
reconcileAll()
```

Both:

```text
REST
MCP
```

must call this service.

---

# 39. Search implementation

V1 search uses only the R2 index.

Do not scan every Markdown file per request.

Suggested scoring:

```text
id exact               +100
alias exact             +90
title exact             +80
id substring            +70
title substring         +60
alias substring         +50
tag exact               +40
description substring   +20
token overlap           +1..10
```

Exact weights may vary.

Tests must verify stable ordering.

---

# 40. MCP output design

Prefer structured output plus concise text.

Example:

```json
{
  "topic": "upload-acceleration",
  "title": "跨境上传加速",
  "git_commit": "abc123",
  "files": {
    "CONTEXT.md": "...",
    "STATE.md": "..."
  }
}
```

Do not bury revision identifiers only inside prose.

Agents need them for future updates.

---

# 41. Security requirements

Mandatory:

```text
private GitHub repository
private R2 bucket
Bearer auth on MCP
Bearer auth on REST
webhook signature verification
topic/path validation
file allowlist
content size limits
no secrets stored in memory
GitHub PAT restricted to one repository
```

Do not expose R2 publicly.

Do not expose GitHub token to clients.

Do not accept arbitrary R2 keys.

Do not allow:

```text
../
absolute paths
URL-decoded traversal
arbitrary filename mutation
```

---

# 42. Local development

Default development should use local R2 storage.

Cloudflare documents that `wrangler dev` uses local R2 state by default; a binding can explicitly be configured for remote access when intentionally testing against the real bucket.

Use:

```bash
npm install
npx wrangler dev
```

Local tests must not accidentally mutate production R2.

Provide a clearly named explicit mechanism for remote integration testing.

---

# 43. Bootstrap procedure

Implement/document:

```text
1. create private GitHub ai-memory repository
2. create main branch
3. create R2 ai-memory bucket
4. configure Worker R2 binding
5. configure GitHub fine-grained token
6. configure Worker secrets
7. deploy Worker
8. configure GitHub push webhook
9. call reconcileAll()
10. configure local Agent MCP endpoint
```

After reconciliation:

```text
GitHub
and
R2
```

must represent the same current memory tree.

---

# 44. Tests

At minimum implement the following.

## Parsing

* valid CONTEXT front matter;
* invalid topic ID;
* mismatched topic ID;
* malformed YAML;
* invalid status.

## Search

* exact ID first;
* aliases work;
* Chinese substring works;
* tags work;
* unrelated memory excluded;
* stable ordering.

## Read

* topic exists;
* missing topic;
* missing file;
* correct context modes.

## Update

* valid revision succeeds;
* stale revision returns conflict;
* identical content returns noop;
* file over size limit rejected;
* invalid filename rejected.

## Checkpoint

* several files become one commit;
* stale expected commit fails;
* partial invalid input creates no commit.

## Publish

* Git commit succeeds then R2 updated;
* GitHub failure leaves R2 unchanged;
* R2 failure returns committed_not_published;
* retry after publish failure does not create duplicate Git commit.

## Webhook

* invalid signature rejected;
* wrong repository ignored/rejected;
* wrong branch ignored;
* push republishes current GitHub state;
* duplicated webhook is harmless.

## Reconciliation

* missing R2 file restored;
* stale R2 file replaced;
* `_index.json` rebuilt;
* `_meta.json` rebuilt.

---

# 45. Observability

Use structured Worker logs.

Log:

```text
request_id
operation
topic
file
git_commit
duration_ms
result
```

Never log:

```text
Authorization headers
tokens
full private Markdown contents
GitHub secret
webhook secret
```

Important write log example:

```json
{
  "operation": "update_memory",
  "topic": "upload-acceleration",
  "file": "STATE.md",
  "git_commit": "abc123",
  "published": true,
  "duration_ms": 428
}
```

---

# 46. Health endpoint

Implement:

```text
GET /health
```

Response:

```json
{
  "status": "ok",
  "version": "<service-version>"
}
```

Do not make GitHub/R2 network calls for every simple health request.

Optionally add separately:

```text
GET /api/v1/admin/health/deep
```

for dependency verification.

---

# 47. Implementation phases

## Phase 1 — Skeleton

Implement:

```text
Worker
R2 binding
authentication
domain types
health endpoint
basic REST routing
```

No GitHub write yet.

---

## Phase 2 — Read path

Implement:

```text
R2 repository
_index.json
list
search
load_context
read_memory_file
```

Then expose through:

```text
REST
MCP
```

At the end of Phase 2, an Agent must be able to discover and load contexts.

---

## Phase 3 — GitHub version store

Implement:

```text
GitHub authentication
read file
single-file update
Git commit
optimistic concurrency
```

Then:

```text
GitHub first
R2 publish second
```

---

## Phase 4 — Create + checkpoint

Implement:

```text
Git Database API
multi-file commit
create_memory
checkpoint_memory
```

All related changes must become one commit.

---

## Phase 5 — Webhook self-healing

Implement:

```text
GitHub push webhook
HMAC verification
reconcile changed topics
manual GitHub edit → R2
```

---

## Phase 6 — Reconciliation

Implement:

```text
reconcileTopic
reconcileAll
admin endpoint
bootstrap procedure
```

---

## Phase 7 — Hardening

Implement/test:

```text
concurrency
idempotency
content limits
path traversal
error sanitization
structured logging
integration tests
```

---

# 48. Definition of Done

V1 is complete when all of the following work.

### Scenario A — Agent reads memory

```text
Agent:
search_memories("上传兜底")

→ upload-acceleration

Agent:
load_context("upload-acceleration")

→ receives CONTEXT + STATE from R2
```

No GitHub request should be required for this normal read.

---

### Scenario B — Agent updates memory

```text
Agent reads STATE.md
→ receives revision=A

Agent updates STATE.md
expected_revision=A

Worker:
GitHub commit succeeds
R2 updated

Agent receives:
revision=B
commit=C
published=true
```

GitHub history must contain the change.

---

### Scenario C — Two Agents conflict

```text
Agent A reads revision=1
Agent B reads revision=1

Agent A writes
→ revision=2

Agent B writes expected_revision=1
→ CONFLICT
```

Agent B must not overwrite Agent A.

---

### Scenario D — R2 publishing fails

```text
GitHub commit succeeds
R2 fails
```

Response:

```text
committed_not_published
```

After webhook/reconciliation:

```text
R2 == GitHub current state
```

No Git history is lost.

---

### Scenario E — Manual GitHub edit

User edits:

```text
topics/upload-acceleration/STATE.md
```

directly on GitHub.

GitHub webhook fires.

Worker reads current GitHub HEAD.

R2 is updated.

Subsequent Agent reads see the new state.

---

### Scenario F — Agent checkpoint

Agent updates:

```text
STATE.md
DECISIONS.md
TODO.md
```

using one `checkpoint_memory` call.

GitHub must contain exactly one logical commit for the checkpoint.

R2 must expose the updated files.

---

# 49. Explicitly out of scope for V1

Do not implement unless requested later:

```text
vector embeddings
semantic vector search
PostgreSQL
GraphRAG
knowledge graph
automatic conversation ingestion
automatic AI summarization
LLM-generated memory extraction
OAuth provider
multi-user account system
team ACL
web dashboard
mobile app
R2 object version history
distributed queues
Durable Objects
full Git merge UI
```

V1 should stay small.

---

# 50. Future-compatible boundaries

The architecture must make these future changes possible without changing MCP contracts.

Possible storage change:

```text
R2
↓
S3 / RustFS / MinIO
```

Possible search change:

```text
_index.json
↓
full-text / vector / hybrid
```

Possible version-store change:

```text
GitHub
↓
GitLab / Gitea / self-hosted Git
```

Possible authentication change:

```text
static Bearer token
↓
per-agent credentials / OAuth
```

The tools:

```text
search_memories
load_context
update_memory
checkpoint_memory
```

should remain stable.

---

# 51. Codex implementation instructions

Treat this document as the architectural source of truth.

Implementation rules:

1. Do not redesign the architecture unless an implementation constraint makes the specification impossible.
2. Prefer simple TypeScript and Web Standard APIs.
3. Keep domain logic independent from MCP, REST, GitHub, and R2 adapters.
4. Complete one phase at a time.
5. Add tests with each phase.
6. Do not introduce databases or AI dependencies.
7. Never silently resolve concurrent memory modifications.
8. GitHub must remain canonical for mutations.
9. R2 must remain rebuildable.
10. Do not expose destructive MCP tools in V1.
11. Never commit secrets.
12. Keep README deployment instructions synchronized with implementation.

Before implementation:

```text
- inspect current repository
- create implementation TODO
- identify existing conventions
- install only required dependencies
```

After each phase:

```text
- run typecheck
- run tests
- report changed files
- report remaining TODO
```

Before considering V1 complete:

```text
- run full test suite
- run local Worker integration test
- test real GitHub private repository integration
- test real R2 integration
- verify webhook
- verify MCP from a real local Agent
- document setup from an empty environment
```

Do not claim completion until the Definition of Done scenarios pass.

---

# 52. Final target

The resulting system should allow a local Agent to operate conceptually like:

```text
search_memories("RDS Aurora")
        ↓
load_context("rds-aurora")
        ↓
perform work
        ↓
checkpoint_memory(...)
```

while infrastructure handles:

```text
Git history
conflict detection
current-state publishing
cross-agent access
recovery
```

The final mental model is:

```text
                  MEMORY CONTENT
                       │
                       ▼
                    GitHub
                canonical history
                       │
                       ▼
                       R2
                 current snapshot
                       │
                       ▼
                      MCP
                       │
                       ▼
                    Agents
```

Keep this model simple and explicit throughout V1.
