# Implementation progress

- [x] Phase 1: Worker skeleton, authentication, schemas, health.
- [x] Phase 2: R2 read/search/context and stateless MCP.
- [x] Phase 3: GitHub version store, optimistic update, publishing.
- [x] Phase 4: Atomic create/checkpoint and deletion.
- [x] Phase 5: Signed GitHub webhook and current-HEAD repair.
- [x] Phase 6: Full/topic reconciliation and bootstrap documentation.
- [x] Phase 7: Security, concurrency, local integration and deployment build checks.
- [ ] External acceptance: real private GitHub repository and remote R2.
- [ ] External acceptance: real GitHub push webhook delivery.
- [ ] External acceptance: configured end-user Agent against deployed endpoint.

## Phase verification

| Phase | Main files/modules | Checks at that phase |
| --- | --- | --- |
| 1 | package/config, src/index.ts, src/auth, src/domain, src/http/responses.ts | Typecheck; 3 tests |
| 2 | src/r2/repository.ts, src/memory/{parser,search,service}.ts, src/mcp/server.ts, src/http/rest.ts | Typecheck; 6 tests |
| 3 | src/github/client.ts, src/r2/publisher.ts, service | Typecheck; 9 tests |
| 4 | service, REST/MCP mutation handlers, request limits | Typecheck; 12 tests |
| 5 | src/github/webhook.ts, Worker routing | Typecheck; 14 tests |
| 6 | publisher/reconciliation, repair tests | Typecheck; 17 tests |
| 7 | security/adapter/transport tests, scripts, README | Typecheck; 31 tests; workerd + MCP client integration; dry-run build |

The input directory contained only docs/IMPLEMENT.md and was not a Git checkout.
The source specification was preserved. The private data repository
was initialized with a README on main; no memory topics were created and no
initial deployment was performed during that phase.

## Reference deployment status — 2026-09-21

- [x] Create a private R2 bucket; disable public access.
- [x] Deploy the Worker to its configured HTTPS endpoint.
- [x] Generate and configure read/write tokens and webhook secret.
- [x] Configure the data repository push webhook and verify real ping delivery (HTTP 200).
- [x] Verify health, REST bearer auth, live R2 read binding, and legacy/modern MCP.
- [x] Configure GITHUB_TOKEN as a Worker secret and verify private repository access.
- [x] Bootstrap R2 through reconcile; verify REST and MCP list operations.
- [ ] Run remote writes and real push-delivery acceptance in an isolated test deployment.

This records verification of one reference deployment, not a ready-to-use public
service. GitHub reads and R2 bootstrap are verified; GitHub writes and real push
publication remain pending. See [the token setup guide](GITHUB_TOKEN.md) for configuration.
An existing broad GitHub CLI credential was not deployed to the Worker.

Runtime secrets belong outside Git, in Worker secrets or an external secret
manager. See VERIFICATION.md for verification scope and implementation limits.

## Hierarchical topic paths — 2026-09-21

- [x] Accept complete variable-depth topic IDs with per-segment validation.
- [x] Store multi-level topics directly at their paths; preserve legacy single IDs.
- [x] Discover, publish, search, read, update and checkpoint nested topics.
- [x] Delete only direct memory files; preserve descendants and sibling topics.
- [x] Support nested REST paths and encoded MCP resource identifiers.
- [x] Verify manual directory moves, metadata repair and stale-object cleanup.
- [x] Typecheck; 41 tests; workerd + local R2 integration.
- [x] Deploy while preserving Worker secrets; verify live REST and both MCP protocols.
- [x] Update data repository README to explain the directory and front-matter conventions.

At this feature verification stage, live GitHub writes were blocked by the missing
PAT. The later bootstrap result is recorded below; no example topics were created.

## Unicode topic paths — 2026-09-21

- [x] Unicode letters/numbers/marks with NFC normalization at API boundaries.
- [x] Canonical Git directories and YAML IDs must already use NFC; reject collisions.
- [x] Preserve ASCII compatibility and verify encoded REST/MCP Unicode paths.
- [x] Typecheck; 47 tests; workerd mutation cycle for ASCII, Chinese and accented IDs.
- [x] Deploy with secrets preserved; verify live routing; update both repositories' docs.

## Token configuration and bootstrap — 2026-09-21

- [x] Confirm the deployed Worker has a GITHUB_TOKEN secret without reading its value.
- [x] Reconcile returns HTTP 200, status reconciled and published true.
- [x] REST list and official MCP client list succeed; the index contains zero topics.
- [x] MCP discovery returns seven tools.

Bootstrap did not modify GitHub data. It verifies private repository reads and R2
publication, not PAT write permission, branch write rules, or real push delivery.
The remote mutation suite still requires an isolated test deployment.

## Stable UUID identity and mutable path — 2026-09-21

- [x] Generate immutable UUIDs on creation; keep Unicode organization in path.
- [x] Resolve paths explicitly; route reads/writes/resources through UUID.
- [x] Add atomic direct-file moves, protecting descendants and UUID identity.
- [x] Validate canonical UUID/path uniqueness and publish schema-version 2 index.
- [x] Provide offline preview/write migration and update Skill/client documentation.
- [x] Typecheck, 47 tests, workerd integration and migration fixture verification.
- [x] Deploy with secrets retained; bootstrap empty index; verify nine live MCP tools.

The reference data repository contained no topics, so no legacy data was rewritten.
Actual remote memory writes and moves remain part of isolated external acceptance.

## Review fixes — 2026-09-21

- [x] Reject invalid canonical paths without dropping existing serving data.
- [x] Immutable blobs/manifests and ETag pointer protect against stale publishers.
- [x] Verified Git blob cache and request-local deduplication reduce API requests.
- [x] Snapshot-pinned pagination and list path_prefix.
- [x] One-commit populated creation; memdock uses the updated contract.
- [x] Remove personal deployment values from current config and generated types.
- [x] Typecheck, 53 unit tests and workerd/R2 integration pass.
- [x] Deploy with secrets retained, reconcile schema 3, verify live REST and both MCP protocols without memory writes.

## Unicode edge-case fixes — 2026-09-21

- [x] Bound pagination cursor size independently of Unicode filter length; retain legacy cursor support.
- [x] Preserve BOM bytes in GitHub and R2 reads, keeping content and blob SHA consistent.
- [x] Normalize Unicode search fields and queries to NFC.
- [x] Typecheck, 56 tests and workerd/R2 integration pass.

## Unified MemHarbor entry and plugin packaging — 2026-09-22

- [x] Rename memdock to memharbor and preserve existing content/style guidance.
- [x] Distinguish read-only lookup from the authorized write workflow.
- [x] Package one shared Skill with Claude Code, Cursor and Codex manifests; retain independent MCP/Skill installation.
- [x] Verify official client capability differences and document credential configuration, migration, updates and uninstall.
- [x] Validate Skill/plugin metadata, Claude marketplace, local links and isolated skills CLI discovery/install artifacts.
- [ ] Complete native plugin installation, credential setup, read-only access, upgrade and uninstall in each supported client. Codex endpoint configuration is local-template based; Cursor local-plugin variable setup is not verified.
- [ ] Complete draft/confirmed-write/readback acceptance using an explicitly isolated test deployment and topic. No production test memories created.
- [ ] Publish reviewed package versions and consider public marketplace submission after the source is open. No npm installer or marketplace publication is implied.

## Bilingual documentation — 2026-09-22

- [x] Make the project README English by default and preserve the complete Chinese README with language-switch links.
- [x] Add English and Chinese documentation indexes, label guide languages, and preserve links to Chinese README sections.
- [ ] Translate the detailed setup and operations guides (GITHUB_TOKEN, MCP_CLIENTS, PLUGINS, SKILLS, PUBLICATION, IDENTITY_MIGRATION) into English while preserving Chinese access.

## Progressive tiers and memory quality — execution checklist

Implementation guide: [TIERS.md](TIERS.md); usage: [TIERS-USAGE.md](TIERS-USAGE.md) (Simplified Chinese). Research inputs include [MEMORY-ECOSYSTEM.md](MEMORY-ECOSYSTEM.md). Code and local verification were completed on 2026-09-24; this is not a production rollout or completed real-Agent acceptance.

Compatibility: retain UUID/schema 3, old configuration, nine tools, original default API/cursor semantics and secret-enabled webhooks. Body indexes default off and are independent of canonical publication. Cron requires an explicit configuration choice. Evidence conventions add no required fields, approval gates, read-triggered writes or timestamp refresh. Mandatory server approval remains a separate future opt-in design.

- [x] Phase 0: MIT license and isolated CI configuration; local commands pass (hosted CI run not claimed).
- [x] Phase 1: Contracts, frozen previous-program source/checksum, synthetic responses/data/cursors, original Skill, 32-case quality fixture and Agent comparison template.
- [x] Phase 2 implementation: T0 Skill/references and optional index contract; empty-ID migration, evidence/time/source/failed-attempt conventions, authorized corrections and existing-tool navigation.
- [ ] Phase 2 behavioral acceptance: T0 file-tool/Git round trip, INDEX.md escaping and synchronized updates, lost-result recovery, shared-vault writes and new Skill against old MCP in actual clients. Migration forms and preservation already have local tests.
- [x] Phase 3: Optional body search/filters/sidecars, explicit byte-budget sections, unchanged default paths, old cursor round trips and failure isolation.
- [x] Phase 4: Separate Node stdio, HEAD refresh, bounded local and Git caches, credential-free synthetic demo and read-only preflight; local official-client smoke passed.
- [x] Phase 5: Authenticated public index projection with explicit field whitelist, independent of canonical publication.
- [x] Phase 6 implementation/local coverage: Separate Cron example and scheduled handler, compatible signed-webhook defaults and independent post-publication indexing. No actual deployment triggers changed.
- [x] Phase 7 service coverage: Typecheck, 78 unit tests, both workerd suites, Node stdio smoke, frozen-program rollback/read-write compatibility, source-correction/noop checks and synthetic service evaluation at 6/60/300 topics.
- [ ] Complete real Agent/Skill evaluation using [the template](evaluation/AGENT-ACCEPTANCE.md): original workflow, improved navigation and optional body retrieval under identical model/data/budgets; report actual task success, stale-fact misuse, appropriate abstention and cost.
- [ ] Complete use-time verification, failed-attempt reuse, multi-topic source recovery and no-unauthorized-write behavioral cases in actual clients; service tests do not establish model behavior.
- [ ] Complete the full native-client/deployment compatibility matrix and production-sized resource measurements. Local tests cover default I/O, old snapshots/cursors, application rollback, old webhook configuration and optional-index failures, but do not guarantee zero production impact.
- [ ] Complete explicitly isolated real GitHub/PAT mutations, remote R2, push/Cron delivery and deployment upgrade/rollback; no production test memories or remote mutations were made this round.

See [VERIFICATION.md](VERIFICATION.md) and the [service report](evaluation/service-report.json) for exact scope, measured costs and limitations. Archive is not quarantine; deletion is not physical erasure.

## T1 snapshot capacity fix — 2026-09-29

- [x] Check the proposed snapshot's UTF-8 total before creating Git objects or updating the ref when maxSnapshotBytes is configured. Count replacements, additions and deletions together; preserve unconfigured T2 behavior.
- [x] Reproduce the original failure, then verify overflow rejection leaves Git and the published pointer unchanged and allows subsequent reads and valid writes. Cover create/update/checkpoint/move, Unicode, exact limits, empty replacements and deletions using isolated data.
- [x] Typecheck, 88 tests and both isolated worker suites passed. No remote mutations or deployment performed; existing external acceptance items remain pending.

## Remaining review fixes — 2026-09-29

- [x] Preserve MCP requests without scope, including previously ignored invalid filter fields; validate explicit filters in MemoryService. Compare against the frozen original MCP implementation and exercise both HTTP protocol eras.
- [x] Preserve list-contained fences across inline/nested list markers, ordered-list indentation, tabs and blank lines. Verify budget sections cannot select half a valid fenced block and dedented sections remain visible.
- [x] Build v2 sidecars with block counts, a SHA-256 payload digest and block ID/source/line-order checks. Reject damaged objects and verify concurrent repair leaves Git and the canonical pointer unchanged; allow genuinely empty bodies.
- [x] Retain v1 objects, preserve metadata cursor fingerprints and explicitly reject old body cursors with restart guidance. Document enabled-deployment v2 rebuild and rollback requirements.
- [x] Typecheck, 100 tests, both isolated worker suites, Node stdio smoke and 32 synthetic retrieval cases at 6/60/300 topics passed. Real Agent/client and isolated remote acceptance remain pending; no deployment or production mutation performed.

## New-user onboarding — 2026-09-29

- [x] Reproduce unauthenticated source-install 404; verify local skills CLI discovery and isolated copied artifacts for the requested client targets.
- [x] Exercise credential-free stdio create/read/checkpoint/search/resolve, unchanged-file preservation, read permissions and demo reset with the official MCP client.
- [x] Add first-use client configuration, practice prompts, persistence choices and troubleshooting; align English/Chinese READMEs and correct create_memory parameters.
- [ ] Verify native Codex/Claude Code/Cursor Skill discovery and draft/confirm/resume behavior in clean client profiles; isolated artifact/protocol tests do not establish Agent behavior.
- [x] Verify anonymous remote installation through the standalone public Skill repository (2026-10-02); service source remains private.

See [new-user verification record](evaluation/NEW-USER.md) for evidence and scope; remote acceptance remains separate; standalone T0 is verified below.


## First-use fixes and native verification — 2026-10-01

- [x] Make npm run demo a terminating guided round trip; generate demo client configs with current absolute paths.
- [x] Add stdio help and reject invalid MEMORY_ACCESS during --check before reporting readiness.
- [x] Bundle first-connection guidance and a standalone README; explain no-remote T0 persistence and multiple-service selection.
- [x] Add an English first-use guide and complete T1 credential/client examples; remove the misleading Worker-only PAT prerequisite.
- [x] Validate standalone nine-file Skill archive installation, fresh-source npm ci/demo, native Codex discovery and authorized synthetic create/update/read, plus draft-only no-write behavior.
- [x] Independently verify T0 two-commit create/update and fresh-process readback without changes.
- [x] Verify native Codex four-turn draft/confirm/update/read in one process with direct backend counts, one retained UUID, application success fields and unchanged final read commit; retain a content-free acceptance report.
- [x] Typecheck, 100 tests, expanded stdio smoke and both Worker suites pass.
- [x] Publish the authorized nine-file standalone Skill at https://github.com/zyc945/memharbor-skill and verify anonymous skills CLI installation plus the official Codex Skill installer (2026-10-02); service source remains private.
- [ ] Verify native Claude Code behavior after client login, and Cursor behavior on an installed client. Generated configs/artifacts are not native behavioral evidence.

Details and scope: [new-user verification](evaluation/NEW-USER.md). Earlier remote cloud/Agent comparison acceptance remains separate.

## T0 first documentation

- [x] Default the English/Chinese project introductions, first-use walkthroughs, documentation navigation, and standalone Skill README to T0: install the Skill, create a local Git vault, draft, save, update, and retrieve across sessions.
- [x] Refine the project and standalone Skill READMEs around purpose, the memory workflow, a complete T0 quick start, everyday requests, and follow-up guidance; keep existing service references outside the default path.
- [x] Retain existing service deployment/API references outside the default onboarding flow; preserve runtime behavior and existing service contracts.
- [ ] Analyze the audience, prerequisites, and upgrade needs for T1, then write its separate introduction and first-use guide.
- [ ] Analyze the audience, deployment needs, and operational boundaries for T2, then write its separate introduction and first-use guide.

## Review fixes — 2026-10-08

- [x] Validate MEMORY_ACCESS before either preflight readiness or startup; cover invalid modes for demo/persistent entry points and valid/default demo preflights.
- [x] Clarify local Git as the authority for standalone T0; retain private GitHub authority for T1/T2 and shared vaults, with remote synchronization only when configured and authorized.
- [x] Read complete affected files when updating sparse topics; keep missing-file errors and optional-file fallback explicit.
- [x] Replace the obsolete demo walkthrough link and distinguish historical MCP demo acceptance from the current T0 walkthrough.
- [x] Verify the complete repair from a clean source snapshot with typecheck, 100 unit tests, both Worker suites, stdio smoke, guided demo, and documentation/Skill validation.
- [x] Synchronize the public standalone Skill README and bundled rules at commit f33a8ae; anonymous discovery and three-client-target installation pass, with all nine files matching in both installed copies.

## Public source preparation — 2026-10-09

- [x] Prepare an independent release history with noreply commit identity; retain original development history privately.
- [x] Preserve runtime, tests, dependency metadata and frozen fixtures; normalize source installation links and machine-specific documentation paths.
- [x] Verify fresh installation, typecheck, 100 unit tests, Worker suites, stdio and 32-case synthetic evaluation; see [SOURCE_PREPARATION.md](SOURCE_PREPARATION.md).
- [ ] Upgrade the six reported development dependency advisories and rerun full CI.
- [ ] Complete source publication and update public installation/website entry points; continue existing isolated remote and client acceptance.
