# MemHarbor

[English](README.md) | **简体中文** · [第一次使用](docs/FIRST_USE.md)

**把有用的上下文，带到下一次对话。**

MemHarbor 是给 AI Agent 使用的记忆工具。它把讨论和工作记录整理成可审阅、可更新、可找回的记忆，适合保存项目背景、关键决策、排障结果和下一步。

从 **`memharbor` Skill + 本地 Git 记忆库** 开始，这就是 T0 使用方式。在 Codex、Claude Code 或 Cursor 中，授权 Agent 使用文件/Git 工具即可，无需部署 MCP 服务或开通云存储账号。

## 它如何工作

告诉 Agent 哪些内容值得记住。它会查找相关记忆、读取已有内容，并整理草稿。你确认内容或明确要求保存后，Agent 将修改提交到 Git，再回读验证。

记忆是保存在指定目录里的普通 Markdown 文件，可跨会话保留，修改过程由 Git 记录。新开对话时，指定同一个目录，就能让 Agent 找回需要的上下文。普通讨论不会自动保存。

## 快速开始

准备好 Git 和已登录、能正常对话的 AI 客户端。下方安装命令还需要 Node.js/npm；没有 npm 时可按[手动安装说明](docs/FIRST_USE.md#1-安装-skill)复制 Skill。

### 1. 安装 Skill

在使用 Agent 的项目目录执行：

```sh
npx skills add zyc945/memharbor-skill --skill memharbor --agent codex --copy
```

Claude Code / Cursor 分别将 `codex` 改为 `claude-code` / `cursor`，跨项目使用加 `--global`。[Skill 仓库](https://github.com/zyc945/memharbor-skill)已公开，无需 GitHub 登录。如果已安装的插件包含此 Skill，跳过这一步。

安装后新开客户端会话，确认能发现 `memharbor`。安装 Skill 是让 Agent 获得操作规则，记忆库在下一步创建。

### 2. 创建记忆库

选择一个独立于代码项目、尚未使用的目录，在 Bash/Zsh 中执行：

```sh
git init -b main "$HOME/memharbor-vault"
git -C "$HOME/memharbor-vault" var GIT_AUTHOR_IDENT
git -C "$HOME/memharbor-vault" rev-parse --show-toplevel
```

如果作者身份检查失败，按[首次使用指南](docs/FIRST_USE.md#2-创建本地记忆库)为这个仓库配置你自己的 `user.name` 和 `user.email`。最后一条命令会显示下面要用的绝对路径。通过客户端权限设置，允许 Agent 访问该目录。

### 3. 保存第一条记忆

把 `/absolute/path/memharbor-vault` 替换为刚才显示的路径，再发送：

```text
使用 memharbor，仅使用 /absolute/path/memharbor-vault 这个本地 Git 记忆库。
授权读取和提交我批准保存的记忆，不创建远端。
我计划每周读一本技术书，先读网络基础，目前尚未选择第一本书。
请先查重并展示草稿，暂时不要保存。
```

审阅草稿后说：

```text
保存刚才确认的草稿，并回读验证。
```

应得到实际保存的主题路径、Git 提交和验证结果。目录无法访问或提交未完成时，记忆还没有完成保存。

### 4. 新开对话，继续使用

在能够加载 Skill 的新会话里，替换同一个路径后发送：

```text
使用 memharbor，从 /absolute/path/memharbor-vault 找回读书计划，
告诉我之前的决定和下一步。只读取，不更新记忆。
```

Agent 应从记忆库中找回计划，包括“尚未选择第一本书”。只读请求不应产生提交。

## 日常怎么用

指定记忆库后，直接用自然语言提出需求：

| 想做什么 | 可以这样说 |
| --- | --- |
| 继续工作 | “找回这个项目的当前进展、阻塞和下一步，只读取。” |
| 沉淀经验 | “把这次排障结果整理成记忆草稿，保留适用条件和已验证的解决方法。” |
| 更新决定 | “把这个决定补充到已有记忆，保留背景和未完成事项，先展示修改。” |

MemHarbor 将新信息补充到相关主题，保留有用的上下文。你审阅内容，Agent 处理文件组织和 Git 操作，无需手填标识或 API 参数。

没有远端时，记忆库只保存在本机。跨设备访问和备份需要另行配置。移除 Skill 不会删除已保存的记忆。

## 接下来

- [第一次使用指南](docs/FIRST_USE.md)：更新记忆、检查结果和排查常见问题。
- [Skill 安装与升级](docs/SKILLS.md)：其他安装方式和已有副本的更新。
- [文档导航](docs/README.zh-CN.md)：已有服务参考、工程说明和验证范围。

采用 [MIT 许可](LICENSE)。

<details>
<summary>已有服务参考：配置、部署与 API</summary>

GitHub 私有仓库保存规范 Markdown 和历史，R2 提供当前快照，Cloudflare Worker 提供 REST 与无状态 MCP。服务源码仓库和私有数据仓库独立管理。参见[实现规范](docs/IMPLEMENT.md)和[分层参考](docs/TIERS-USAGE.md)。

## 可选服务演示

本仓库包含可选的服务实现。独立 Skill 仓库不包含服务构建入口。

取得源码访问权限后，使用 Node.js 22+ 构建无凭据演示：

```sh
git clone https://github.com/zyc945/MemHarbor.git
cd MemHarbor
npm ci
npm run demo
```

已有服务源码副本可跳过 clone。仓库访问权限以 GitHub 可见性为准，上方的公开 Skill 安装独立于此。

`npm run demo` 自动完成合成读写流程并退出。运行 `node scripts/demo.mjs --config codex`（或 `claude-code` / `cursor`）生成包含实际本机路径的配置，合并进客户端后开启新会话。生成的配置直接启动原始 stdio 服务，并明确设置 `MEMORY_ACCESS=write`。演示无需凭据、没有网页界面，进程退出后修改全部丢失；不设访问模式则只读。将生成的配置合并进客户端，不要经 npm 启动 MCP。本地持久记忆使用上方 T0 流程，已有服务的接入方式见下文。已有远程地址时，按 [MCP 配置](docs/MCP_CLIENTS.md)和 [Skill 安装](docs/SKILLS.md)接入，或安装[组合插件](docs/PLUGINS.md)。

## 存储与服务选择

T1 先运行 `npm run build:local`，客户端直接启动 `node /absolute/path/dist/local/main.mjs`。通过安全环境提供 GITHUB_OWNER、GITHUB_REPO、GITHUB_TOKEN，可选 GITHUB_BRANCH。默认只读，授权写入者设 `MEMORY_ACCESS=write`。`--check` 做只读配置/读取预检，`--demo` 使用无凭证、不连接 GitHub 的临时合成数据；都不证明远程写权限。MCP 不要经会向 stdout 打印启动提示的 npm 命令启动。

已有 UUID/schema 3 部署保留配置、九工具、默认完整读取和 Webhook secret。显式 `MEMORY_CONTENT_SEARCH=true` 启用独立正文索引，以 WRITE 调用 `POST /api/v1/admin/search-index`（`{}`）可准备固定快照；索引失败不改变基础发布成功。新时间/来源约定只是可选正文，不新增必填 YAML 字段。新安装可用[独立 Cron 示例](wrangler.cron.example.jsonc)，每 15 分钟按 UTC 同步；旧部署自行显式选择。回滚只撤回应用及新增配置，保留当前 Git/R2 数据。

## 配置指南

- [GitHub 访问令牌：创建、配置、验证与轮换](docs/GITHUB_TOKEN.md)
- [Codex、Claude Code、Cursor 的 MCP 配置](docs/MCP_CLIENTS.md)
- [MemHarbor 插件：安装入口与客户端兼容性](docs/PLUGINS.md)
- [独立 Skill：通过 npx skills 安装](docs/SKILLS.md)
- [实现与验收记录](docs/VERIFICATION.md)
- [待完成事项](docs/TODO.md)

原 Webhook 方式的 T2 部署需要私有 GitHub 数据仓库、Cloudflare Worker 和私有 R2 桶，以及四项 Worker secrets：
`GITHUB_TOKEN`、`MEMORY_READ_TOKEN`、`MEMORY_WRITE_TOKEN`、`GITHUB_WEBHOOK_SECRET`。
下文使用示例名称和占位符，部署时请替换为自己的配置。新安装仅用 Cron 可省略 GITHUB_WEBHOOK_SECRET；已有 secret 默认启用签名 Webhook，显式 MEMORY_WEBHOOK_ENABLED=false 停用，true 但缺 secret 仍拒绝。

## 安装与检查

需要 Node.js 22+。

```sh
npm ci
npm run types
npm run typecheck
npm test
npm run test:worker
```

锁文件固定依赖；当前官方 MCP 包为 `@modelcontextprotocol/server@2`。

- `npm test`：领域、GitHub 适配器、REST/MCP、冲突、失败恢复与 webhook 测试，不访问云端。
- `npm run test:worker`：先构建，再在 workerd + 临时本地 R2 中用官方 MCP 客户端验证读写；GitHub 为隔离替身，不会修改真实仓库。
- `npm run dev`：Wrangler 本地模式，R2 数据存于 `.wrangler/`。GitHub 仍是真实远程 API；开发时只使用专用测试仓库和凭据。
- `npm run test:remote`：显式启用的远程写入验收，见下文。

## 从空环境部署

1. 创建独立的 **私有** GitHub 数据仓库（例如 `ai-memory`），用 README 初始化 `main` 分支。不要把服务源码放入数据仓库。
2. 按 [GitHub 访问令牌配置指南](docs/GITHUB_TOKEN.md) 创建细粒度 PAT，只授权数据仓库的 **Contents: Read and write**。目标分支需允许该身份直接提交；服务不会强推或自动合并。
3. 在 Cloudflare 创建 R2 桶：`npx wrangler r2 bucket create your-memory-bucket`。保持桶私有，关闭公开开发 URL 和公开自定义域名。
4. 复制 `wrangler.jsonc` 为已忽略的 `wrangler.local.jsonc`，填写 `account_id`、Worker `name`、`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` 及桶名，使其指向自己的账号和资源。默认文件上限 262144 字节，可调低。
5. 分别配置四个 Worker secrets：

   ```sh
   npx wrangler secret put MEMORY_READ_TOKEN --config wrangler.local.jsonc
   npx wrangler secret put MEMORY_WRITE_TOKEN --config wrangler.local.jsonc
   npx wrangler secret put GITHUB_TOKEN --config wrangler.local.jsonc
   npx wrangler secret put GITHUB_WEBHOOK_SECRET --config wrangler.local.jsonc
   ```

   使用不同的随机读写令牌。本地开发可复制 `.dev.vars.example` 为 `.dev.vars` 并填写**测试**凭据；该文件已忽略。不要把密钥放入 Markdown、配置或 Git。
6. `npm run deploy -- --config wrangler.local.jsonc`，记录 Worker HTTPS 地址。
7. 在 GitHub 数据仓库创建 webhook：URL 为 `https://<worker>/webhooks/github`，Content type 为 `application/json`，Secret 与 `GITHUB_WEBHOOK_SECRET` 相同，仅订阅 `push`，启用 SSL 验证。检查 ping 返回 200。
8. 使用写令牌向 `POST /api/v1/admin/reconcile` 发送 `{"all":true}`，把现有数据重建到 R2。空仓库（已有 README 初始提交）会生成空索引。
9. 在 Agent 的远程 MCP 配置中选择 Streamable HTTP，端点为 `https://<worker>/mcp`，配置 `Authorization: Bearer <MEMORY_READ_TOKEN 或 MEMORY_WRITE_TOKEN>`。令牌应引用客户端支持的环境变量或密钥存储，不提交到项目。
10. 依次执行 `list_memories`、`create_memory`、`load_context`、`checkpoint_memory`，并运行远程验收。

## MCP

同时兼容 2025 Streamable HTTP 与 SDK v2 的 2026 每请求协议。不保存会话，不向自身 REST 发请求。

| 工具 | 参数 | 权限 |
| --- | --- | --- |
| list_memories | status?、path_prefix?、limit?（默认 50，每页上限 100）、cursor? | READ |
| search_memories | query、limit?（默认 10，每页上限 100）、cursor?、scope?、status?、path_prefix?、include_archived? | READ |
| resolve_memory | path | READ |
| load_context | topic（UUID）、mode?、max_bytes? | READ |
| read_memory_file | topic（UUID）、file | READ |
| create_memory | path、title、description?、aliases?、tags?、status?、files?、initial_context? | WRITE |
| update_memory | topic（UUID）、file、content、reason、expected_revision | WRITE |
| checkpoint_memory | topic（UUID）、files、reason、expected_commit | WRITE |
| move_memory | topic（UUID）、path、reason、expected_commit | WRITE |

WRITE 包含 READ 权限。工具返回结构化结果，错误为 `isError: true` 和稳定错误对象。删除和管理修复不作为 MCP 工具开放。

### 列表与分页

**`list_memories` 的 100 条限制是每页上限，不是记忆总数上限。** `limit` 可设为 1–100，省略时每页返回最多 50 条。超过一页的结果通过 `cursor` 继续读取；分页本身不限制总条数，但仓库实际容量仍受下文的运行资源约束。

返回字段中，`topics` 是当前页，`total` 是当前快照中符合筛选条件的总条数，`next_cursor` 用于读取下一页，`git_commit` 标识该快照的 Git 提交。

例如，列出 `works/infra` 及其所有后代路径下的活跃记忆，首次调用 `list_memories`：

```json
{"status":"active","path_prefix":"works/infra","limit":100}
```

若返回的 `next_cursor` 不为 `null`，将其原样填入下一次调用的 `cursor`，保留相同筛选条件：

```json
{"status":"active","path_prefix":"works/infra","limit":100,"cursor":"<上次返回的 next_cursor>"}
```

重复调用直到 `next_cursor` 为 `null`，才表示已读完本次结果。若需要列出全部记忆，首次和后续调用均省略 `status` 与 `path_prefix`。游标固定在首次读取的快照上；要查看最新数据，应省略 `cursor` 重新开始。

Agent 查找具体记忆时，优先使用 `search_memories` 或按 `path_prefix` 缩小列表范围，减少调用次数和上下文占用；仅在需要完整清单时遍历所有页。`search_memories` 同样支持分页，默认每页 10 条、最多 100 条，续页时保持 `query` 不变。

### 记忆标识与读取

创建返回服务生成的 `id` 和规范化后的 `path`，列表和搜索也包含两者。`topic` 只接收 UUID，不将路径隐式当作 id。

资源模板：`memory://topics/{topic}`（默认上下文 JSON）、`memory://topics/{topic}/{file}`（Markdown），其中 `{topic}` 是 UUID，目录移动后 URI 不变。

模式：default 为 CONTEXT+STATE；decision 加 DECISIONS；planning 加 TODO；evidence 加 SOURCES；full 为全部五个文件。缺少请求文件返回 NOT_FOUND。默认搜索仅读取快照元数据，支持中文子串、英文大小写/空白归一及 token 匹配，同分按 ID 排序。


显式 scope=metadata/content/all 才启用状态/路径/归档筛选，include_archived 默认 true；响应回传 search_scope。不传 scope 保留旧行为，包括 REST 的 q 查询仍忽略 status/path_prefix。正文查询需索引启用且就绪，不可用时返回 search_index 组件错误，不伪装空结果。每主题最多 3 段、每段最多 1024 UTF-8 字节，带标题、行号、revision 和完整读取 URI，不是完整写入基线。

显式 max_bytes 返回只读 sections/coverage，包含遗漏块数、UTF-8 字节计量，不返回可用于替换的 files/revisions。full 拒绝预算；使用证据前核对变更的版本。读取不自动写回或刷新 updated_at。精简主题可逐文件读取，确认可选文件缺失才跳过，不吞掉其他错误。

## REST

除健康检查和独立验签的 webhook 外均要求 Bearer 鉴权。JSON 请求与响应，错误不包含上游正文或栈。

| 方法与路径 | 请求 |
| --- | --- |
| GET /health | 无外部存储调用 |
| GET /api/v1/topics | 可选 q、status、limit |
| POST /api/v1/topics | create_memory 参数 |
| GET /api/v1/topics/resolve | 查询参数 path，精确返回 UUID 及索引信息 |
| GET /api/v1/index | 鉴权后的 schema 1 投影：path/title/status/description/aliases/tags/updated_at 与快照时间/commit，不含 UUID、正文或内部存储字段 |
| POST /api/v1/admin/search-index | WRITE；`{}`；为固定快照构建已启用的旁路索引，不改 Git 或基础指针 |
| GET /api/v1/topics/:topic | 可选 mode |
| GET /api/v1/topics/:topic/:file | 读取内容及 revision |
| PUT /api/v1/topics/:topic/:file | content、reason、expected_revision |
| POST /api/v1/topics/:topic/checkpoint | files、reason、expected_commit |
| POST /api/v1/topics/:topic/move | path、reason、expected_commit，保持 UUID |
| DELETE /api/v1/topics/:topic | expected_commit，要求 WRITE |
| POST /api/v1/admin/reconcile | {"all":true} 或 {"topic":"UUID"}，要求 WRITE |
| POST /webhooks/github | GitHub push；要求 SHA-256 HMAC |

路径参数 `:topic` 为 UUID；`resolve` 的 path 查询参数由 URLSearchParams 等标准工具编码。

例如，使用环境变量保存令牌后：

```sh
curl --fail-with-body "$MEMORY_BASE_URL/api/v1/topics" \
  -H "Authorization: Bearer $MEMORY_READ_TOKEN"

curl --fail-with-body "$MEMORY_BASE_URL/api/v1/admin/reconcile" \
  -H "Authorization: Bearer $MEMORY_WRITE_TOKEN" \
  -H 'Content-Type: application/json' --data '{"all":true}'
```

更新时使用读取返回的 blob revision，checkpoint 使用读取返回的 git_commit。单文件更新也用 Git Database API：一次 tree、一次 commit、非强制更新 ref。HEAD 竞争时可能产生不可达 Git 对象，但不会覆盖分支。

## 数据与发布约定

记忆使用不可变 UUID `id` 和可修改的唯一目录 `path`：

```yaml
id: 11111111-1111-4111-8111-111111111111
path: 工作/基础设施/网络
title: 网络基础设施
status: active
```

id 由 `create_memory` 使用 UUID v4 生成；上例只作格式说明。每个主题拥有 CONTEXT.md、STATE.md、DECISIONS.md、TODO.md、SOURCES.md 五个文件，存放在 `<path>/` 下。单段 path 也直接对应根目录下的文件夹，不自动加前缀。

path 支持 Unicode 字母、数字、组合标记、下划线和连字符，每段以字母或数字开头，最长 64 个码点。完整 path 最长 1024 个 UTF-16 代码单元，区分大小写，API 输入统一为 NFC。拒绝绝对路径、空段、点段、末尾斜线、反斜线、控制字符及百分号。Git 目录与 YAML path 必须已经是 NFC 且完全一致。

父目录可以只是分类，也可以拥有独立 UUID 的主题文件。`move_memory` 在一次 Git 提交中移动本主题直属五个文件并修改 YAML path，保留 id、子主题和无关文件；目标已有主题会冲突。普通内容更新不得修改 id 或 path。手动移动目录也必须保留 id，并同步修改 YAML path；重复 UUID 或路径不匹配会拒绝发布。

已知路径时，先调用 `resolve_memory({"path":"工作/基础设施/网络"})`，再将返回的 id 作为读写工具的 topic。创建示例：

```json
{"path":"工作/基础设施/网络","title":"网络基础设施","initial_context":"长期背景正文"}
```

REST 精确查找示例：

```js
const query = new URLSearchParams({ path: "工作/基础设施/网络" });
const url = "/api/v1/topics/resolve?" + query;
// 取得 id 后：GET /api/v1/topics/<UUID>
// 稳定资源 URI：memory://topics/<UUID>/STATE.md
```

旧版路径 id 不再作为读写标识接受，迁移步骤见 [UUID/path 升级指南](docs/IDENTITY_MIGRATION.md)。索引和元数据升级为 schema_version 3，可通过 reconcile 重建，无需新增数据库。

Git 提交即持久成功；R2 失败返回 `committed_not_published`，不回滚 Git。相同内容的 update/checkpoint 重试返回 noop 并重新发布，即使其预期 revision 已旧；内容不同时仍严格检查冲突。重复创建已有主题返回 CONFLICT，创建后发布失败可通过 reconcile 修复。

V1 面向小型个人仓库：发布仍验证完整 Git 快照，按 blob SHA 复用 R2 内容和请求内缓存。先准备不可变 `_blobs/<sha>` 与 `_snapshots/<uuid>.json`，检查 Git HEAD，再按 ETag 条件更新 `_current.json`；竞争失败最多重试三次。读请求固定在一份清单，不混用不同发布的文件。

- 非法规范文件路径、YAML、超限文件、非普通文件或截断 Git tree 会拒绝整个发布，保留上次可读快照。
- list/search 返回 `topics`、`total`、`next_cursor`、`git_commit`。每页最多 100 条；继续传 cursor 并保持筛选条件不变。list 可用 path_prefix 匹配该路径及后代。游标固定旧快照，刷新需重新开始。
- create 支持 `status` 和 `files`，一次 Git 提交保存五份完整内容；`files.CONTEXT.md` 只传正文，服务器生成 YAML 和标题。其他文件传完整 Markdown。`initial_context` 兼容保留，不能与 files.CONTEXT.md 同时提供正文。
- Git 与 R2 不是跨服务事务。中断可能留下未发布的 Git 提交；重投 webhook 或 reconcile 修复。其他主题的提交也可能使 checkpoint 冲突。
- 旧清单、blob 和旧版路径对象保留，不自动删除，避免破坏在途读取及分页；删除记忆不是物理擦除。容量、升级和维护说明见 [发布快照运维](docs/PUBLICATION.md)。
- 缓存减少 GitHub 下载，但全量树、文件验证和索引仍占内存及子请求。冷导入较大仓库需 Workers Paid 并评估限额，不承诺无限容量。
- 内容与历史保留在 GitHub；调用方不得写入密码、密钥、Cookie 等。

## 远程集成验收

只指向专用测试 Worker、私有测试仓库和私有测试 R2 桶。脚本会创建唯一 `acceptance/smoke-*` 主题、提交修改、直接编辑 GitHub 来验证真实 webhook，并在 finally 中删除该测试主题；历史提交会保留。

在外部安全注入以下环境变量，不要写入仓库：

```text
MEMORY_REMOTE_TEST=1
MEMORY_BASE_URL=https://<test-worker>
MEMORY_READ_TOKEN
MEMORY_WRITE_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH=main
GITHUB_TOKEN
GITHUB_WEBHOOK_SECRET
```

运行 `npm run test:remote`。测试涵盖私有仓库、提交与发布、MCP 客户端、旧 revision 冲突、noop、单提交 checkpoint、真实 GitHub push 回调和旧事件重放。未设置显式开关时会立即退出。R2 故障注入由本地单元测试覆盖，远程脚本不破坏桶配置来制造故障。

## 工程边界

`src/domain` 定义类型与校验；`src/memory` 承载语义；`src/github` 与 `src/r2` 实现可替换存储适配器；`src/http` 和 `src/mcp` 调用同一 MemoryService。结构化日志只记录请求 ID、操作、主题/文件、commit、耗时与结果，不记录令牌或 Markdown 正文。

</details>
