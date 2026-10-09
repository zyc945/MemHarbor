# Public source preparation

This repository contains the complete MemHarbor implementation, Skill, plugins,
documentation, tests and synthetic compatibility fixtures. It starts with an
independent release history; original development history is retained privately.
Memory data, deployment credentials and machine-specific service configuration
are not part of this source tree.

## Changes

- Start a new Git history instead of importing earlier deployment and identity
  metadata. Use the maintainer's GitHub noreply address for commits.
- Keep runtime source, tests, scripts, dependency versions, lockfile and frozen
  fixtures identical to the reviewed source snapshot.
- Replace machine-specific installation paths with generic examples and point
  source installation and plugin documentation at this repository.
- Retain dated verification records and the documented remote acceptance limits.
  Frozen baseline commit identifiers describe synthetic fixture provenance; their
  original commit objects are not imported into this repository.

## Verification on 2026-10-09

- Fresh `npm ci` installation succeeds.
- `npm run typecheck` succeeds; all 100 unit tests pass.
- `npm run test:worker` and `npm run test:stdio` succeed using isolated storage.
- `npm run evaluate` succeeds for 32 cases and 6/60/300-topic synthetic scales.
- Verify byte equality of runtime source, tests, scripts, dependency metadata and
  frozen fixtures against the reviewed source snapshot.
- Scan release files, Git metadata and compressed fixture contents before upload.

On 2026-10-09, this clean repository was published as
[zyc945/MemHarbor](https://github.com/zyc945/MemHarbor). Anonymous access to the
repository and README was verified. The original development repository remains
private, and an original-history commit is unavailable through this public
repository. Publication does not change any memory data repository visibility.
The six previously reported development dependency advisories and pending remote
and client acceptance remain tracked separately; this preparation preserves
dependency versions and application behavior.
