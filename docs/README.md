# Documentation

**English** | [简体中文](README.zh-CN.md) · [Project overview](../README.md)

Start with the [T0 first-use guide](FIRST_USE.en.md): install the Skill, create a local Git memory vault, then save and retrieve a memory. The [project overview](../README.md) and [Chinese guide](FIRST_USE.md) cover the same default workflow.

## T0: getting started

- [First use: install, save, update, and retrieve](FIRST_USE.en.md) — English / [简体中文](FIRST_USE.md).
- [Skill installation, updates, and usage](SKILLS.md) — 简体中文.
- [Standalone Skill README](../plugins/memharbor/skills/memharbor/README.md) — English; included with the Skill.

## Existing service references

Separate T1 and T2 introductions will be analyzed and written later; see [remaining documentation work](TODO.md#t0-first-documentation). The references below support existing service users. They are not prerequisites for T0. Remaining English translations are tracked in [TODO.md](TODO.md).

| Guide | Language |
| --- | --- |
| [GitHub token creation, configuration, verification, and rotation](GITHUB_TOKEN.md) | 简体中文 |
| [MCP setup for Codex, Claude Code, and Cursor](MCP_CLIENTS.md) | 简体中文 |
| [Plugin installation and client compatibility](PLUGINS.md) | 简体中文 |
| [Snapshot publication, retention, and upgrades](PUBLICATION.md) | 简体中文 |
| [Migration from path IDs to UUID identity](IDENTITY_MIGRATION.md) | 简体中文 |

## Engineering

| Document | Language |
| --- | --- |
| [Implementation specification](IMPLEMENT.md) | English |
| [Verification record and implementation limits](VERIFICATION.md) | English |
| [Progress and remaining acceptance](TODO.md) | English |
| [Project conventions](../AGENTS.md) | English |

The amendments at the top of the implementation specification supersede its historical examples. Use the project README and current schemas for the current API contract. Verification records distinguish completed checks from pending external acceptance.

## Maintaining documentation

Keep the English and Chinese project READMEs aligned when behavior or setup changes. Keep command names, API fields, placeholders, and verification status consistent across languages. Mark untranslated guides explicitly and update both navigation pages when adding a translation.

## Progressive tiers and memory quality

- [Unified implementation checklist](TIERS.md) — Simplified Chinese; English translation pending. Implementation and local verification status, with real Agent and remote acceptance tracked separately.
- [Tier setup and compatible upgrades](TIERS-USAGE.md) — Simplified Chinese. T0/T1/T2 usage, explicit feature switches, limits and rollback.
- [Memory ecosystem and engineering practices survey](MEMORY-ECOSYSTEM.md) — Simplified Chinese. External practices, evidence limitations and their implementation mapping; project claims are not independent verification.
