# MemHarbor

Find and read relevant memories, or turn conversation context into concise drafts for review and saving. This package bundles the `memharbor` Skill and client-specific MCP connection definitions.

- `.claude-plugin/plugin.json`: Claude Code, with endpoint and sensitive token prompts.
- `.cursor-plugin/plugin.json`: Cursor, with endpoint and token variables.
- `.codex-plugin/plugin.json`: Codex local template; configure your endpoint in the local source copy and provide `MEMHARBOR_TOKEN` through the client environment.
- `skills/memharbor`: shared instructions and memory format references.

Use one installation route per client. Installing this package does not deploy a server. Never put real tokens in the package. Reads do not imply permission to write; saving previews the proposed changes unless the user has already authorized them.

See the repository's [installation and compatibility guide](https://github.com/zyc945/MemHarbor/blob/main/docs/PLUGINS.md) for setup, migration, verification, and uninstall instructions. Client authentication and end-to-end write acceptance remain subject to the verification limits documented there.
