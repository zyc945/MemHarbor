# First use of MemHarbor: T0 local memory

**English** | [简体中文](FIRST_USE.md)

T0 combines the `memharbor` Skill with your agent's authorized file/Git tools to keep memories in a separate local Git directory (a memory vault). This guide covers installation, saving, updating, and retrieval across sessions. No service deployment or cloud account is required.

## 1. Install the Skill

Have Git installed, sign in to Codex, Claude Code, or Cursor, and confirm normal chat works. From the project where you use the agent, run (this installer requires Node.js/npm):

```sh
npx skills add zyc945/memharbor-skill --skill memharbor --agent codex --copy
```

The [standalone Skill repository](https://github.com/zyc945/memharbor-skill) is public; no GitHub login or private-source access is needed. Replace `codex` with `claude-code` or `cursor` for those clients; add `--global` for use across projects. Open a new session and confirm the client discovers `memharbor`. The installer copies Skill files; it does not install the client or create a memory vault.

Without npm, copy the complete Skill folder to your project's `.agents/skills/memharbor` (Codex) or `.claude/skills/memharbor` (Claude Code); use the Skill directory supported by your Cursor version. Keep `SKILL.md`, `agents/`, and all `references/` together. Do not install another copy if the Skill or a plugin containing it is already installed. T0 itself requires no Node.js service.

## 2. Create a local memory vault

Choose a new directory separate from your software project. These commands work in Bash/Zsh:

```sh
git init -b main "$HOME/memharbor-vault"
git -C "$HOME/memharbor-vault" var GIT_AUTHOR_IDENT
```

If Git reports no author identity, use `git -C "$HOME/memharbor-vault" config user.name "Your Name"` and the corresponding `config user.email "your-email"` with your own identity. These settings apply only to this repository.

Allow the agent to access this directory through your client's permission settings. Files and commits persist across sessions; without a remote, they stay on this machine and are not backed up to GitHub.

## 3. Draft your first memory

Replace the path with the vault's actual absolute path, then tell the agent:

```text
Use memharbor with /absolute/path/memharbor-vault only, as a standalone local Git vault.
I authorize reading it and committing memory changes I approve.
Do not connect another memory service or add a remote.
I plan to read one technical book each week, starting with networking fundamentals.
I have not chosen a book yet. Check for duplicates, then draft my reading plan.
Do not save yet.
```

Check that the draft preserves the unchosen book and invents no title, date, completed task, or source. The agent proposes the topic and files; you do not need to enter UUIDs, Git SHAs, or tool parameters. Drafting should create no commit.

## 4. Save and verify

After reviewing the draft, say:

```text
Save the approved draft and read it back to verify.
```

Expect the actual saved path, Git commit, and readback result. If directory access or the commit fails, the agent should report that saving is incomplete. Showing a draft alone does not establish a successful save.

## 5. Update the same memory

```text
Use memharbor with the same vault to update that reading plan.
I selected Computer Networks but have not started reading. Next step: read chapter one.
Preserve the background and decision. Save this change directly and verify it.
```

Expect an update to the same topic, with unrelated information preserved and no duplicate topic. Normal conversation is not saved automatically. Once you authorize this specific save, the same content needs no repeated confirmation.

## 6. Retrieve in a new session

Open a new agent session and specify the same directory:

```text
Use memharbor with /absolute/path/memharbor-vault to find my reading plan.
Tell me my progress and next step. Read only; do not update the memory.
```

Expect the selected book, reading not yet started, and chapter one as the next step. Reading should create no commit. T0 search coverage depends on the client's actual file tools. Provide the saved topic path if needed; one empty search does not establish that a memory is absent.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Installation returns 404 | Use the public `zyc945/memharbor-skill` installation address |
| Skill not visible | Check project/global scope and open a new session; Codex can invoke `$memharbor` explicitly |
| Vault cannot be accessed | Check the absolute path and client directory permissions |
| Git commit fails | Check this repository's author identity, write permissions, and error; preserve unrelated changes |
| Memory missing in a new session | Specify the same vault and check the previous saved path and commit result |
| Save result is unknown | Inspect the original path, files, and Git history before attempting another creation |

To update a copied Skill, reinstall the newer version and open a new session. Removing the Skill does not delete the vault. Detailed rules are bundled in the [operations reference](../plugins/memharbor/skills/memharbor/references/vault-operations.md). See the [verification record](evaluation/NEW-USER.md) for client acceptance scope.

Existing service users can consult the [MCP configuration reference](MCP_CLIENTS.md). Separate T1 and T2 introductions are deferred to later analysis and writing; this walkthrough defaults to T0.
