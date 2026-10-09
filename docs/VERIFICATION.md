# Verification — review fixes, 2026-10-08

A clean export of the staged source, with freshly installed dependencies, passed
`npm run typecheck`, all 100 unit tests in 15 files, both isolated Worker suites,
`npm run test:stdio`, and the terminating guided `npm run demo`.
The stdio regression checks reject invalid `MEMORY_ACCESS` before startup or
readiness reporting, for both persistent and demo entry points. Default, read,
and write demo preflights succeed while retaining `write_verified: false`.

The Skill now distinguishes standalone T0 local Git authority from T1/T2 private
GitHub authority, requires a push only for configured and authorized remote
sync, and reads complete affected files when updating topics with optional
files missing. The historical demo walkthrough points to the current optional
service demo and is explicitly separate from persistent T0 onboarding.

Skill validation passed for the source and standalone package. Documentation
checks passed for 28 source Markdown files (199 local links/anchors and 36 shell
examples) and seven standalone Markdown files (13 links/anchors and three shell
examples). Isolated local installation for Codex, Claude Code and Cursor produced
two physical Skill copies; all nine files in each matched the prepared package.

The public standalone Skill was synchronized at commit
`f33a8aeebe6b896d45d8a954f806e1edf4b12e0c`. Its nine-file allowlist and byte-for-byte
parity with the source Skill and root license were verified before publishing.
With token environment variables absent and Git global/system configuration,
credential helpers and interactive prompts disabled, remote HEAD verification,
`skills add --list`, and installation for all three client targets succeeded.
All nine installed files in both physical copies matched the published package.
The public repository contains only the standalone Skill distribution.

This round verifies service behavior, documentation and installation artifacts.
It does not rerun the historical native-client behavioral checks below. No live
GitHub/R2 memory mutation or cloud deployment was performed.

---

# Historical verification — review fixes, 2026-09-29

The remaining review defects are covered by regression tests: MCP ignored-field
compatibility against the frozen old program, list-contained fences and budget
integrity, and damaged-sidecar rejection and concurrent repair. Sidecars now use
v2 with a block count and SHA-256 payload digest, plus source/block/line-order
checks. Empty canonical bodies remain valid. Tests verify v1 objects are retained,
metadata cursors retain their fingerprints, and old body cursors receive restart
guidance. Enabled deployments must build v2 after upgrading; see
[the upgrade instructions](TIERS-USAGE.md).

Latest local validation:

- `npm run typecheck`: passed.
- `npm test`: 15 files, 100 tests passed, including the T1 pre-commit capacity fix.
- `npm run test:worker`: both isolated workerd suites passed, including both MCP
  protocol eras, ignored legacy filters, explicit filter rejection and v2 R2
  corruption repair without changing the canonical pointer.
- `npm run test:stdio`: passed against the isolated synthetic vault.
- `npm run evaluate`: 32 synthetic cases at 6/60/300 topics passed. Default
  metadata results still match the frozen program; v2 retains the expected body
  evidence. The linked [service report](evaluation/service-report.json) now
  records this v2 run. The build report below remains the historical baseline.

Worker APIs were checked against workers-types 5.20260929.1 and current official
best-practices documentation. No deployment, production mutation or remote
acceptance was performed. Agent behavior and native-client acceptance remain
pending; synthetic retrieval results do not establish real-task success rates.

---

# Historical verification — progressive tiers, 2026-09-24

Implemented the shared T0 Skill conventions, empty-ID migration, separate Node
stdio entry and bounded local caches, optional body sidecars and search filters,
byte-budget context, authenticated index projection, and optional scheduled
reconciliation. Existing schema 3 publication and default requests remain the
baseline. No production deployment, configuration change or production memory
write was performed for this implementation.

Local evidence:

- `npm run typecheck`: passed.
- `npm test`: 15 files, 78 tests passed, including previous-program compatibility,
  forward correction/noop timestamps, sidecar failure isolation, Unicode blocks,
  migration, local CAS, refresh failure, cache pressure and cursor eviction.
- `npm run test:worker`: dry-run build and both isolated workerd suites passed;
  real local R2, GitHub API substitute, both MCP eras, default read I/O, new
  REST/MCP search/budgets, projection, signed-webhook compatibility and scheduled
  handler invocation. This does not verify real Cron trigger delivery.
- `npm run test:stdio`: official MCP client against a Node child process passed
  discovery, read/write permissions, full mutation/readback, body search and
  bounded reads using a synthetic vault, with no cloud resources.
- Skill metadata validator: passed. Native-client behavior remains unverified.
- `npm run evaluate`: 32 synthetic cases (29 positive, 3 empty-result negatives),
  at 6/60/300 topics. New default metadata results exactly match the frozen old
  program; enhanced all search recalls the expected evidence for these cases.
  Sources/revisions are checked, and response bytes, index bytes, object calls,
  build/retrieval time and local object-cache occupancy are recorded in
  [service-report.json](evaluation/service-report.json).

The evaluation deliberately includes body-only facts. It is a regression and
capability fixture, not a blind task benchmark or evidence of a general 100%
retrieval rate. Timings are one sample per scale on Node/Linux, not portable CI
thresholds. Object-cache accounting excludes Git download cache, parsed object
overhead and process RSS. [Build sizes](evaluation/build-report.json) compare
old/new Worker dry runs with identical installed dependencies; optional features
still increase bundle size even when disabled.

Compatibility uses an archived copy of actual commit
`faa989e20ed5c83d715f2937b3a3fcc7d78ea81a`, checksum-verified and rebuilt by
`scripts/legacy.mjs`. `test/fixtures/compatibility.json` was produced by that
program and includes synthetic source data, schema 3 objects, original responses
and cursors. Tests exercise default results, legacy filter/filter_hash cursors,
new default cursors consumed by the old program, and old-program read/write after
new publication without resetting Git or restoring old serving objects.

Remaining acceptance:

- Actual Agent/Skill behavior under the three fixed conditions, including T0
  file-tool/working-copy workflows, INDEX.md escaping, lost-result recovery,
  evidence verification, failed-attempt reuse and multi-topic source correction.
  The [Agent acceptance template](evaluation/AGENT-ACCEPTANCE.md) explicitly has
  no model results; SDK smoke tests do not substitute for this.
- Full native-client old/new compatibility and production-sized resource
  measurement; local synthetic coverage is not a zero-impact upgrade guarantee.
- Explicitly isolated real GitHub/PAT mutations, remote R2, signed push/Cron
  delivery, actual deployment upgrade and application-only rollback. No remote
  target was supplied for this implementation; production was not used as one.

Workers documentation requests in this environment returned HTTP 403. Runtime
signatures were checked against published workers-types 5.20260924.1, installed
Wrangler configuration schema and MCP SDK declarations, then exercised locally.
No compatibility date/flags were changed. Deployment trigger propagation still
needs confirmation in the operator's actual Cloudflare environment.

---

# Historical verification — 2026-09-21

## Implemented

All seven implementation phases have code and local automated coverage.
The original specification remains in IMPLEMENT.md. This is **not** a claim that
the full cloud-deployed V1 Definition of Done has passed.

## Local evidence

- TypeScript strict typecheck: passed.
- Vitest: 8 test files, 31 tests passed.
- Wrangler Worker dry-run build: passed.
- Generated Worker binding/runtime declarations: produced with Wrangler.
- Local workerd integration: passed using actual local R2 bindings, official MCP
  client SDK, 2025 Streamable HTTP and pinned 2026-07-28 protocol.
- Local end-to-end create/update/noop/conflict/checkpoint/delete: passed against
  isolated GitHub API substitute; actual GitHub adapter code runs inside workerd.
- Reads assert zero GitHub/network requests.
- Request validation, byte limits, malformed YAML, path restrictions, auth tiers,
  cross-origin refusal, error sanitization and webhook HMAC are covered.
- Publisher failure after a successful Git commit, repair and retry without
  duplicate commit are covered with deterministic storage fault injection.
- Reconciliation rebuilds missing/corrupt metadata and removes stale objects.
- SDK client scripts are protocol-level Agent harnesses; they do not establish
  that a user's installed Codex/Claude/other Agent has been configured successfully.

Reproduce with:

```sh
npm ci
npm run typecheck
npm test
npm run test:worker
```

At the initial local-verification stage no remote deployment was made and no real
memory data was changed. Tests use
temporary local storage and fixed fake credentials. No Tailscale/public preview
service was started for this automated test run.

## Definition of Done coverage

| Scenario | Local coverage | External status |
| --- | --- | --- |
| A: Agent searches/loads R2 without GitHub | Tests and SDK → workerd → local R2 | Deployed Agent pending |
| B: update produces Git commit then R2 | Domain/adapter and workerd API substitute | Real GitHub/R2 pending |
| C: two Agents conflict | Concurrent domain test and SDK stale update | Real repository pending |
| D: Git succeeds, R2 fails, repair preserves history | Fault injection + noop retry | No remote fault injection performed |
| E: manual GitHub edit triggers current-HEAD repair | Signed duplicate/reordered webhook tests | Real delivery pending |
| F: several files become one logical commit | Adapter request sequence and workerd checkpoint | Real Git history pending |

The remote script checks repository privacy, remote publication, MCP access,
single-parent checkpoint history, direct GitHub editing followed by actual push
webhook delivery, and duplicate/old signed event replay. It is opt-in and creates
a disposable topic whose history remains in the test repository.

## Original implementation choices and limits (superseded by schema 3 below)

- Single-file mutations also use the Git Database API, with current blob comparison
  and a non-forced branch update. No Contents API mutation implementation is needed.
- The version-store boundary exposes coherent snapshot/head/commitFiles operations
  rather than separate per-file fetch methods.
- Full snapshot publication is used for mutations, topic reconciliation and push
  webhooks. This trades GitHub calls for straightforward index rebuilding in V1
  personal repositories. It is not suitable for large repositories.
- R2 multi-object publication is not atomic. Readers check file blob metadata and
  refuse inconsistent file/revision combinations. Failure or process termination
  still requires webhook replay or admin repair.
- HEAD is rechecked after publishing, with three attempts under contention.
  No distributed lock, queue, session storage or Durable Object was added.
- Identical update/checkpoint retries bypass stale preconditions only when all
  desired content already equals current GitHub content. Duplicate create is a
  conflict as required by the creation contract.
- Optional resources are exposed; destructive delete/reconcile remain REST-only.
- Configured repository privacy is checked before each canonical snapshot read.
  R2 public-access settings and PAT scope are deployment responsibilities.
- Memory content must not contain secrets. No general-purpose secret detector
  is claimed.

## Reference deployment — 2026-09-21

These observations describe a reference deployment. Personal account identifiers,
private repository addresses, endpoint names and webhook IDs are omitted.
Deployment-specific values must be supplied independently by each operator.

- Source and data were stored in separate repositories; the data repository was private.
- The data branch was initialized with a README, without memory topics.
- A Worker and private R2 bucket were provisioned through Cloudflare REST API.
- workers.dev was enabled; version preview URLs and public R2 access were disabled.
- MEMORY_READ_TOKEN, MEMORY_WRITE_TOKEN and GITHUB_WEBHOOK_SECRET were configured as secrets.
- A dedicated GitHub PAT was unavailable; GITHUB_TOKEN remained unset.
- The data repository webhook was enabled for push, with TLS verification enabled.

Observed live:

- GET /health → 200.
- Unauthenticated GET /api/v1/topics → 401.
- Read-authorized GET /api/v1/topics → 200 with empty topics.
- Official SDK over 2025 and pinned 2026-07-28 protocol: seven tools discovered,
  list_memories succeeds, create_memory with read token returns FORBIDDEN.
- Real GitHub ping delivery → 200.
- Authorized reconcile → 502 GITHUB_ERROR: GitHub credentials are not configured.

These checks verify the deployment, R2 read binding, auth and transport, not
GitHub mutation or R2 publication acceptance. Supply a fine-grained PAT restricted
to the data repository with Contents read/write, then bootstrap and run the explicit
remote suite. See [GitHub token setup](GITHUB_TOKEN.md).
No memory topics were created during deployment. Existing unrelated Cloudflare
resources were preserved.

## Hierarchical topic paths — 2026-09-21

The complete path now identifies the topic: works/infra/network maps directly
to works/infra/network/CONTEXT.md and its four companion files. Legacy single
IDs retain topics/<id>/ storage. See the amendment in IMPLEMENT.md for the exact
validation and compatibility rules.

Evidence after the change:

- TypeScript typecheck: passed.
- Vitest: 9 files, 41 tests passed.
- Tests cover all five user examples, path traversal, full front-matter IDs,
  same-named leaves, parent/child creation and deletion, conflict/noop behavior,
  GitHub discovery, nested webhook repair, manual moves and R2 stale cleanup.
- workerd + real local R2 + isolated GitHub API substitute: nested MCP create,
  read, update, noop, conflict, checkpoint, encoded resource read and delete pass.
- Deployed Worker updated through Cloudflare API with secret bindings retained.
- Live legacy and pinned 2026-07-28 MCP accept works/infra/network and return
  NOT_FOUND for this absent topic; they reject traversal and read-token writes.
- Live REST accepts raw and URL-encoded hierarchical paths and returns NOT_FOUND.
- The data repository README updated to document the new layout; no sample topics created.

The live tests establish path handling, transport and authorization; they do not
claim a real GitHub write succeeded while GITHUB_TOKEN remains unavailable.

## Unicode topic paths — 2026-09-21

- Typecheck and 47 tests in 9 files pass. Coverage includes CJK, Arabic, Indic,
  Greek, supplementary-plane letters, combining marks, unsafe Unicode rejection,
  NFC identity across service operations, duplicate creation, and rejection of
  decomposed Git paths/collisions and YAML IDs before serving-snapshot changes.
- workerd + isolated GitHub substitute + real local R2: the complete mutation
  cycle passes for ASCII, Chinese, and decomposed accented input, including
  encoded REST paths and MCP resource URIs. No persistent preview was started.
- Deployment through Cloudflare API succeeded with existing secrets preserved.
- Live REST accepts segment-encoded and whole-ID-encoded Unicode paths. Legacy
  and pinned 2026-07-28 MCP accept Chinese/decomposed IDs and return NOT_FOUND
  for absent topics, and reject read-token writes with FORBIDDEN.
- The data repository README documents NFC and Unicode paths. No sample data was created.

At verification time, the dedicated GitHub PAT was still unavailable; actual remote GitHub mutations
and publication remain outside the verified scope.

## Token configuration and bootstrap — 2026-09-21

This supersedes the earlier missing-token blocker for repository reads and
bootstrap. Deployment identifiers and secret values are intentionally omitted.

- Worker secret metadata confirms GITHUB_TOKEN is configured; its value was not retrieved.
- Authorized POST /api/v1/admin/reconcile with {"all":true} returns HTTP 200,
  status reconciled and published true, verifying private GitHub reads and R2 publication.
- Read-authorized REST list returns HTTP 200 with zero topics.
- The official MCP client lists zero topics and discovers all seven tools.

No GitHub files were created or changed by these checks. GitHub write permissions,
branch rules and actual push-triggered publication remain unverified; the remote
mutation suite must target a dedicated test deployment. A successful reconcile
alone does not satisfy those acceptance criteria.

## Stable UUID identity and mutable path — 2026-09-21

This supersedes earlier path-as-ID API examples and seven-tool discovery counts.

- Typecheck passes; 47 tests in 10 files pass. Updated suites exercise immutable
  UUIDs, Unicode path resolution, occupied/stale moves, parent/child preservation,
  manual moves, normal-edit identity rejection, duplicate UUID/NFC validation,
  mixed R2 identity detection and schema-version bootstrap.
- Offline migration is tested in a temporary Git repository: preview does not
  write; execution retains bodies/directories; rerun does not reassign UUIDs;
  malformed later input prevents earlier files from being rewritten.
- workerd + local R2 + isolated GitHub substitute passes UUID create/read/update,
  noop/conflict/checkpoint, one-commit moves with stable resource URIs and deletion
  for ASCII, Chinese and decomposed accented paths.
- Skill validation, documented JSON/YAML/shell examples and local links pass.
- The data repository had zero canonical memory topics before deployment, so no
  data migration was needed. Its README was updated without creating memory data.
- Cloudflare API deployment preserved existing secrets. Live reconcile returned
  HTTP 200 with published true, rebuilding the schema-version 2 empty index.
- Both legacy and pinned 2026-07-28 MCP discover nine tools. Creation schema takes
  path, not id. UUID reads and Unicode path resolution accept their new inputs
  and report NOT_FOUND for absent memories; read-token create/move are forbidden.

Real GitHub memory writes/moves were not exercised in this deployment. The updated
remote acceptance script still requires an explicitly selected isolated target.

## Review fixes and schema 3 — 2026-09-21

- Typecheck passes; 53 tests in 11 files pass. New cases cover invalid canonical
  paths preserving the prior snapshot, paused stale publishers, interrupted
  preparation, pinned multi-file reads, cache integrity/deduplication, 105-row
  pagination across publication, Unicode filters and one-commit full creation.
- workerd + real local R2 conditional puts verify create-if-absent and competing
  ETag updates. MCP/REST pagination and full creation pass against isolated GitHub.
- A four-topic warm single-file update uses 13 GitHub requests, down from the
  reviewed 53. Read operations still make zero GitHub requests. This is a warm
  cache measurement, not a guarantee for cold imports or arbitrary repo sizes.
- Serving publication now uses immutable blobs/manifests and a CAS pointer;
  reads pin one manifest. Git remains authoritative; interrupted Git-to-R2
  publication may still require reconcile. No online garbage collection.
- Current tracked configuration and generated types use deployment placeholders;
  local production configuration is outside Git. Existing Git history was not rewritten.

Real remote memory mutations remain outside these checks; no test memories are
written into the user's canonical repository. See PUBLICATION.md for upgrade and retention.

Live follow-up: deployment through the Cloudflare API preserved secret bindings;
reconcile returned published=true and initialized schema 3. REST pagination and
both legacy/2026 MCP list returned zero topics. Discovery exposes all nine tools,
including new create files/status and list cursor fields. No GitHub memory data
was created or changed; only derived R2 serving data was rebuilt.

## Unicode pagination and byte preservation — 2026-09-21

- Typecheck and 56 tests pass. Long Unicode list/search filters now produce
  fixed-size SHA-256 filter digests in cursors; existing bounded legacy cursors
  remain accepted, and changed filters are still rejected. The reproduced
  4952/4136-character cursors now contain 206 characters and paginate successfully.
- GitHub blob decoding and R2 reads preserve UTF-8 BOM characters. The 19-byte
  fixture remains 19 bytes and matches its Git SHA; cache reuse is verified.
  CONTEXT.md still requires its YAML delimiter at the first character, so a
  leading BOM there is rejected instead of silently removed.
- Search normalizes query and indexed fields to NFC, including paths, titles,
  aliases, tags and descriptions. NFC and NFD forms return equivalent results.
- workerd with real local R2 and isolated GitHub passes, including BOM-preserving
  readback and a BOM-only removal producing an update rather than a false noop.

Deployment preserved existing secrets. Live health, authorized reconcile, REST
list and MCP search passed; no canonical GitHub memory files were modified.

## memdock memory references — 2026-09-21

- Skill supports proposing evidence-backed topic/file references, verifying targets,
  including links in approval previews and preserving them during incremental updates.
  Explicit bidirectional links use separately approved per-topic writes; new-topic
  cycles require returned UUIDs and a disclosed follow-up checkpoint.
- Skill metadata validation and local documentation links pass. An isolated
  MemoryService check saves a Markdown UUID/file reference, reads it back, moves
  its target and confirms the original UUID still reads the target file.
- No service schema, deployment or live memory changes were needed. These checks
  establish format and storage compatibility, not a guarantee of Agent judgment;
  there is no server-side backlink index or deletion cascade.

## memdock goal-oriented prompt — 2026-09-21

- The entrypoint now starts with topic, intended future use and new information;
  distinguishes create/update/reference/noop; and selects content by project,
  troubleshooting, decision or knowledge-reuse needs. Search can stop once the
  target is established, while incomplete discovery is disclosed.
- Skill validation, reference links, JSON examples and UI metadata checks pass.
- An independent simulated draft-only scenario retained timeout values, test
  counts, untested network scope, existing access constraints and unfinished
  tasks. It did not turn a successful workaround into a confirmed root cause,
  adopt an unapproved suggestion or save the draft. Only relevant files changed
  in the proposed draft. This checks one scenario, not general Agent reliability.
- No runtime code, live memory data or client configuration was changed.

## Unified MemHarbor package — 2026-09-22

- Renamed the shared Skill to `memharbor` under `plugins/memharbor/skills/`; preserved the pre-existing portability guidance and existing README pagination changes. Historical memdock verification sections above retain their original names.
- Read-only requests now exit through lookup/read guidance; ordinary discussion does not trigger saves. Write preview, existing authorization, conflict recovery and UUID references remain in the write workflow.
- `quick_validate.py` passes for the Skill; `validate_plugin.py` passes for the Codex compatibility manifest. Claude Code 2.1.196 `plugin validate --strict` passes for the plugin and repository marketplace. These validators check structure, not credential interpolation or service connectivity.
- JSON manifests and 30 local documentation links pass. Cursor variables match the placeholders in its inline MCP configuration. No actual endpoint or credential is embedded.
- `npx skills` discovers the renamed Skill from the repository root. Separate temporary projects successfully install the same Skill and all references for Codex, Claude Code and Cursor. Codex and Cursor both use `.agents/skills/memharbor` in this skills CLI version; a combined installation therefore produces two physical copies, not three. No personal client configuration was changed.
- Official documentation was fetched for Codex plugin support/packaging, Claude Code plugin references and Cursor plugin support/references. Codex CLI 0.155.1 and Claude Code 2.1.196 help confirm the documented CLI command forms. Codex native plugin HTTP parsing was additionally inspected in upstream `codex-rs/codex-mcp/src/plugin_config.rs`; this does not prove behavior in every released client.
- Native plugin installation and authentication, Cursor UI configuration, update/uninstall behavior, model-driven draft quality and confirmed writes remain external acceptance items. No inference session or real memory mutation was run. There are no runtime code changes, so runtime tests/deployment were not repeated.


## First-use usability and native checks — 2026-10-01

See [new-user verification](evaluation/NEW-USER.md) for the guided demo, real-path client configuration, access-mode preflight fix, standalone Skill package, native Codex discovery and synthetic save/update/read, draft-only authorization stop, and independent persistent T0 round trip. Typecheck, 100 unit tests, expanded stdio smoke and both isolated Worker suites pass. No cloud deployment or real memory mutation occurred. The standalone Skill is public at https://github.com/zyc945/memharbor-skill; anonymous skills CLI installation and the official Codex Skill installer passed on 2026-10-02. Service source remains private. Claude login and installed Cursor behavior remain external acceptance items; static config validation does not establish those outcomes.
