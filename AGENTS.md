# Project conventions

- Follow docs/IMPLEMENT.md; track remaining acceptance in docs/TODO.md.
- Keep GitHub authoritative and R2 rebuildable. No DB, LLM, Durable Objects, or automatic merge.
- REST and MCP call MemoryService directly. Keep provider details in adapters.
- Validate every mutation before committing, and never force-update a Git ref.
- Keep edits surgical. Run npm run typecheck and npm test for code changes.
- Run npm run test:worker for transport/runtime changes.
- Tests use isolated local storage by default. Remote tests require explicit test targets and MEMORY_REMOTE_TEST=1.
- Never print, commit or embed secrets; never log memory contents.
