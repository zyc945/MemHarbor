# MemHarbor Skill

**Keep useful context for your next conversation.**

MemHarbor is a memory tool for AI agents. It turns discussions and working notes into memories you can review, update, and retrieve later—project context, decisions, troubleshooting results, and next steps.

Start with **the `memharbor` Skill and a local Git memory vault**, the T0 setup. Use it from Codex, Claude Code, or Cursor with authorized file/Git access. No MCP service or cloud storage account is needed.

## How it works

Tell the agent what to remember. It checks for related memories, reads existing content, and prepares a draft. Once you approve the content or explicitly ask to save it, the agent commits the changes to Git and reads them back to verify.

Your memories are ordinary Markdown files in a directory you choose. They persist across sessions, with changes recorded in Git. In a new conversation, point the agent at that same directory and ask it to retrieve the context you need. Normal conversation is not saved automatically.

## Quick start

Have Git and a signed-in AI client ready. The installation command below also requires Node.js/npm; [manual installation](#installation-options) is available without npm.

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

If the identity check fails, set your own `user.name` and `user.email` with `git -C "$HOME/memharbor-vault" config user.name "Your Name"` and the corresponding `config user.email "your-email"`. These settings apply only to this vault. The last command prints the absolute path to use below. Allow your agent to access that directory through the client's permission settings.

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

## Installation options

This folder contains the complete standalone Skill. Keep `SKILL.md`, `agents/`, and all `references/` together. If you received a local copy, install it from its actual absolute path:

```sh
npx skills add /absolute/path/memharbor --skill memharbor --agent codex --copy
```

Without npm, copy the complete folder to your project's `.agents/skills/memharbor` (Codex) or `.claude/skills/memharbor` (Claude Code). For Cursor, use the Skill directory supported by your installed version. Update an existing installation deliberately instead of nesting another copy inside it, then open a new session.

## If something goes wrong

- **Skill not visible:** check the client and project/global installation scope, then open a new session.
- **Vault inaccessible:** check its absolute path and the client's directory permissions.
- **Save result unknown:** inspect the original topic path and Git history before creating another topic.
- **Memory missing in a new session:** specify the same vault and check the previous save result.

The bundled [operations reference](references/vault-operations.md) and [memory format](references/vault-format.md) describe the detailed rules (简体中文). Existing MCP users can consult the [connection notes](references/getting-started.md); the quick start above uses local Git.
