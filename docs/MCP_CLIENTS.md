# 配置 MCP 客户端

MemHarbor 的 T2 提供 Streamable HTTP MCP 服务。下方原有配置介绍 Codex、Claude Code 和 Cursor 的 T2 连接方式，T1 stdio 见文末补充；使用占位地址，不包含实际部署信息或凭据。

支持插件的客户端可先查看 [统一安装指南](PLUGINS.md)。本文是独立 MCP 的兼容与排错入口；已启用插件提供的连接时，不要重复添加独立服务器。

## 连接信息与令牌

- 服务地址：`https://<worker-name>.<subdomain>.workers.dev/mcp`，也可以使用自己的 HTTPS 自定义域名。
- 传输：Streamable HTTP，不是 stdio 或旧版 SSE。
- 鉴权：`Authorization: Bearer <访问令牌>`。
- 只读使用 `MEMORY_READ_TOKEN`；需要创建、更新或 checkpoint 时使用 `MEMORY_WRITE_TOKEN`，写令牌包含读取权限。
- **不要使用 GitHub PAT**。`GITHUB_TOKEN` 只配置在 Worker 中，不能作为 Agent 的访问令牌。

以下示例统一用客户端环境变量 `MEMHARBOR_TOKEN` 保存选定的读或写令牌。它只是客户端变量名，不需要在 Worker 上新增同名 secret。变量值只包含令牌本身，不包含 `Bearer ` 前缀。

在 Bash/Zsh 中可以隐藏输入令牌，避免把值写入 shell 历史：

```bash
set +x
printf 'MemHarbor access token: ' >&2
read -r -s MEMHARBOR_TOKEN
printf '\n'
export MEMHARBOR_TOKEN
```

随后从同一终端启动客户端。也可以由系统凭据管理工具注入环境变量。该方式不会跨终端或重启自动持久化；启动客户端前需确保变量存在。

GUI 应用未必继承终端环境。若使用桌面版 Codex、IDE 扩展或 Cursor，应确保其进程获得变量；必要时完全退出应用，再从已设置变量的终端启动。远程开发时，变量需配置在实际建立 MCP 连接的环境中。

## Codex

在 `~/.codex/config.toml` 中合并以下配置，不要覆盖已有内容；同名表只保留一份：

```toml
[mcp_servers.memharbor]
url = "https://<worker-name>.<subdomain>.workers.dev/mcp"
bearer_token_env_var = "MEMHARBOR_TOKEN"
```

Codex 会读取变量并自动添加 `Bearer ` 前缀。也可以使用等价 CLI 命令，两种方式任选其一：

```sh
codex mcp add memharbor \
  --url 'https://<worker-name>.<subdomain>.workers.dev/mcp' \
  --bearer-token-env-var MEMHARBOR_TOKEN
```

执行 `codex mcp list` 检查注册情况，然后启动新的 Codex 会话。CLI、IDE 扩展等客户端使用对应环境中的 Codex 配置；项目级 `.codex/config.toml` 仅在受信任项目中加载。

MemHarbor 使用预设 Bearer token，不需要执行 OAuth 登录命令 `codex mcp login`。

## Claude Code

推荐注册到用户范围，供当前账号的各个项目使用：

```sh
claude mcp add-json --scope user memharbor \
  '{"type":"http","url":"https://<worker-name>.<subdomain>.workers.dev/mcp","headers":{"Authorization":"Bearer ${MEMHARBOR_TOKEN}"}}'
```

外层单引号有意保留 `${MEMHARBOR_TOKEN}`，由 Claude Code 在加载时展开，避免 shell 将真实令牌写入配置。命令适用于 Bash、Zsh 等 shell。

用户范围配置保存在 `~/.claude.json`。若只希望当前项目可用，将 `--scope user` 改为 `--scope local`；local 配置也保存在用户目录，不是项目内的 `.mcp.json`。

也可以手动在项目根目录的 `.mcp.json` 中合并配置：

```json
{
  "mcpServers": {
    "memharbor": {
      "type": "http",
      "url": "https://<worker-name>.<subdomain>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${MEMHARBOR_TOKEN}"
      }
    }
  }
}
```

项目级服务器可能需要首次使用批准。个人部署建议使用用户范围，避免把私人服务地址带入共享仓库。不要在多个范围重复注册同名服务器。

执行 `claude mcp list` 检查连接，进入 Claude Code 后用 `/mcp` 查看服务器与工具状态。

## Cursor

在全局文件 `~/.cursor/mcp.json` 中合并以下配置：

```json
{
  "mcpServers": {
    "memharbor": {
      "url": "https://<worker-name>.<subdomain>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MEMHARBOR_TOKEN}"
      }
    }
  }
}
```

Cursor 的变量语法是 `${env:MEMHARBOR_TOKEN}`，与 Claude Code 不同。HTTP 远程服务器不支持通过 `envFile` 加载变量；变量需由 Cursor 进程环境提供。

仅对当前项目启用时，可以改用项目根目录下的 `.cursor/mcp.json`。已有 `mcpServers` 时只添加其中的 `memharbor` 项。

确保环境变量可用后，重新启动 Cursor。已安装命令行启动器时，可完全退出 Cursor，再从设置好变量的终端执行 `cursor .`。在设置中的 MCP 管理入口（新版本为 Customize，部分版本为 Tools & MCP）检查服务已启用，并在 Agent 模式下使用。

## 验证与排错

向 Agent 发送：

> 调用 memharbor 的 list_memories，检查连接。只读取，不创建或修改数据。

应能发现九个工具：`list_memories`、`search_memories`、`load_context`、`read_memory_file`、`create_memory`、`update_memory`、`checkpoint_memory`、`resolve_memory`、`move_memory`。创建时传 path，后续读写的 topic 使用返回的 UUID；可用 resolve_memory 按 path 查找。没有主题时，查询返回空列表是正常结果。只读令牌也可以发现写工具，但执行写操作会返回 `FORBIDDEN`。

| 现象 | 检查方法 |
| --- | --- |
| `401` | 环境变量是否被客户端继承；令牌是否有效；是否误用了 GitHub PAT；是否重复添加了 Bearer 前缀 |
| 写操作返回 `403` / `FORBIDDEN` | 当前是否使用只读令牌；仅在需要写入时切换到写令牌 |
| 连接地址返回 `404` | 地址应以 `/mcp` 结尾，不是 `/api/v1/topics` |
| 工具返回 `NOT_FOUND` | 检查主题是否存在以及完整路径是否正确；这通常不是连接问题 |
| 工具列表为空或连接失败 | 检查配置语法、重启客户端、确认 MCP 已启用并通过客户端要求的信任批准 |
| 弹出 OAuth 登录 | 检查是否选错认证方式；此服务使用 Bearer token |

客户端与企业策略可能限制远程 MCP。配置正确仍不可用时，检查所用客户端版本与管理员策略。本文基于官方配置文档与 CLI 参数核对，不代表每款客户端的实际界面均已完成连接验收。

## 官方参考

- [OpenAI：Codex MCP](https://developers.openai.com/codex/mcp)
- [Anthropic：Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Cursor：MCP](https://cursor.com/docs/context/mcp)
## T1 本机 stdio 补充

此方式不需要 Cloudflare。先创建独立的私有 GitHub 数据仓库，用 README 初始化 main，并按[令牌指南前两节](GITHUB_TOKEN.md)创建只授权该仓库的 PAT（保存需要 Contents: Read and write）。T1 的 PAT 由本机服务进程使用，不使用上文 T2 的 `MEMHARBOR_TOKEN`。

在 Bash/Zsh 中设置环境，替换非秘密的仓库名称；不要把真实令牌写在命令中：

```sh
export GITHUB_OWNER='your-account'
export GITHUB_REPO='your-memory-data'
export GITHUB_BRANCH='main'
export MEMORY_ACCESS='write'
set +x
printf 'GitHub data-repository token: ' >&2
read -r -s GITHUB_TOKEN
printf '\n'
export GITHUB_TOKEN
node /absolute/path/MemHarbor/dist/local/main.mjs --check
```

应返回 `ready: true`、`read_verified: true`；它不验证远程写权限。失败时先核对仓库是否初始化、owner/repo、PAT 到期/审批/权限，不打印令牌排查。随后从**同一终端**启动客户端；桌面应用需要完全退出后从此环境启动，或使用宿主支持的凭据注入。环境变量不会自动跨终端或重启持久化。

Codex 合并进 `~/.codex/config.toml`：

```toml
[mcp_servers.memharbor]
command = "node"
args = ["/absolute/path/MemHarbor/dist/local/main.mjs"]
env_vars = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_TOKEN", "MEMORY_ACCESS"]
```

Claude Code 项目 `.mcp.json`（从同一终端启动以继承上述环境）：

```json
{"mcpServers":{"memharbor":{"command":"node","args":["/absolute/path/MemHarbor/dist/local/main.mjs"],"env":{"GITHUB_OWNER":"${GITHUB_OWNER}","GITHUB_REPO":"${GITHUB_REPO}","GITHUB_BRANCH":"${GITHUB_BRANCH}","GITHUB_TOKEN":"${GITHUB_TOKEN}","MEMORY_ACCESS":"${MEMORY_ACCESS}"}}}}
```

Cursor 项目 `.cursor/mcp.json`：

```json
{"mcpServers":{"memharbor":{"command":"node","args":["/absolute/path/MemHarbor/dist/local/main.mjs"],"env":{"GITHUB_OWNER":"${env:GITHUB_OWNER}","GITHUB_REPO":"${env:GITHUB_REPO}","GITHUB_BRANCH":"${env:GITHUB_BRANCH}","GITHUB_TOKEN":"${env:GITHUB_TOKEN}","MEMORY_ACCESS":"${env:MEMORY_ACCESS}"}}}}
```

示例只保存变量引用，不能把展开后的真实 token 写进文件。GUI 的 PATH 不包含 Node 时将 command 改为 Node 绝对路径。停用 `memharbor-demo` 后，先调用真实连接的 list_memories 确认目标，再按授权保存并回读。新数据仓库列表为空是正常的。

原 T2 地址和令牌配置继续有效。T1 先运行 `npm run build:local`，然后用客户端的 stdio MCP 配置直接启动 `node /absolute/path/MemHarbor/dist/local/main.mjs`；不要用会打印启动提示的 npm 命令作为协议入口。通过客户端安全环境提供 GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN，GITHUB_BRANCH 默认 main；MEMORY_ACCESS 默认 read，授权写入者显式设 write。

`--demo` 使用无凭证的临时合成数据，`--check` 做只读配置及读取预检；两者都不验证远程写权限。客户端配置层级仍以各宿主实际支持为准，详见[分层使用](TIERS-USAGE.md)。新增 scope/max_bytes 都是可选参数，仍为原九工具；新 Skill 与旧服务使用能力探测和响应核对，不要求更换部署或令牌。
