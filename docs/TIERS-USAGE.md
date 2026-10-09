# 分层使用与兼容升级

Language: 简体中文；英文概要见 [README](../README.md)。实施和验证状态见 [TIERS](TIERS.md)、[VERIFICATION](VERIFICATION.md)。采用 [MIT](../LICENSE)。

第一次使用请先看 [T0 本地记忆指南](FIRST_USE.md)，完成 Skill 安装、保存、更新和跨会话找回。本文保留已有分层配置参考；T1、T2 的独立入门说明留待[后续分析与编写](TODO.md#t0-first-documentation)。

## 选择接入方式

| 层 | 入口 | 资源与边界 |
| --- | --- | --- |
| T0 | 安装共享 Skill，使用已授权的文件工具或 Git 工作副本 | 私有 Git vault；多文件修改一次提交，无条件多文件工具需外部单写者保证 |
| T1 | 本机 Node stdio MCP | 私有 GitHub 仓库和 PAT，无云缓存资源；不开放 HTTP；默认只读 |
| T2 | 原 Worker REST/MCP | 保留 GitHub、私有 R2、原地址和令牌；新增功能分别显式启用 |

T0 的详细操作、精简主题、共享 vault 身份和可选 INDEX.md 见随 Skill 安装的[操作映射](../plugins/memharbor/skills/memharbor/references/vault-operations.md)与[共用格式](../plugins/memharbor/skills/memharbor/references/vault-format.md)。已有 UUID/schema 3 vault 无需迁移；服务错误不授权改用 T0 绕过服务写入。

## T1 stdio

需要 Node.js 22+。执行 `npm ci`、`npm run build:local`。MCP 客户端直接启动：

```json
{
  "command": "node",
  "args": ["/absolute/path/MemHarbor/dist/local/main.mjs"]
}
```

由客户端的安全环境或凭据管理提供 GITHUB_OWNER、GITHUB_REPO、GITHUB_TOKEN；GITHUB_BRANCH 默认 main。不要把真实 token 写入仓库。不同客户端的配置层级参照其 MCP 指南；此处不假定所有客户端会展开配置中的环境变量占位符。

MEMORY_ACCESS 默认 read，授权写入者可设 write；PAT 也须具备相应仓库权限。stdio 的 stdout 仅用于协议，诊断写 stderr。客户端不要启动会打印 npm 提示的 npm run 命令。

```sh
# 无凭证、无网络、退出后丢弃数据的合成演示（MCP 协议进程）
node dist/local/main.mjs --demo
# 合成写入演示，仅本进程数据
MEMORY_ACCESS=write node dist/local/main.mjs --demo
# 用已配置的安全环境检查配置及真实仓库读取，不执行远程写入
node dist/local/main.mjs --check
```

启动先取得完整基础快照；当前读取检查 GitHub HEAD，变化后重建，失败返回错误，不静默提供旧内容。协议握手和工具发现不额外刷新。分页固定旧快照；重启或缓存淘汰后旧游标报错，重新从第一页开始。写入仍为 Git 条件提交、基础发布，再独立构建可选索引。

Node 专用缓存上限：MEMORY_LOCAL_CACHE_BYTES 默认 32 MiB，MEMORY_GITHUB_CACHE_BYTES 默认 4 MiB，MEMORY_SNAPSHOT_BYTES 默认 8 MiB。基础对象缓存保护当前快照、活动读取及待切换对象；容量不足明确报错，不截断快照。可选正文索引另限输入 4 MiB、输出 8 MiB、10000 块，仍计入对象缓存。它们限制保留的数据和构建工作量，不是进程 RSS 保证；字符串、解析和临时快照也占内存。不要把这些限额套到旧 T2。

T1 写入也在创建 Git tree/commit 前按整笔变更后的规范文件 UTF-8 总字节数检查 MEMORY_SNAPSHOT_BYTES，计入新建、替换、移动和删除的净结果。超限返回 CONTENT_TOO_LARGE，不写 Git、不切换基础快照，原内容仍可读取和继续合法更新。未配置快照总量上限的 T2 保持原行为。

对象缓存优先淘汰未被保护的旧旁路索引，再按插入顺序淘汰其他旧对象；Git 下载缓存按插入顺序淘汰，不缓存单个超出其预算的 blob。Worker 可选正文构建另限输入 8 MiB、输出 16 MiB、20000 块；这些只是增强路径限额，不限制原基础快照读取。

## 可选搜索与预算

MEMORY_CONTENT_SEARCH 缺省或 false 时完全关闭，不构建、预热或读取正文索引。T1/T2 显式 true 后可构建；布尔值只接受 true/false，不接受 0/1/yes。

T2 可在已授权维护时调用 WRITE-only `POST /api/v1/admin/search-index`，请求体 `{}`。返回 status=search_indexed、git_commit、index_version；表示调用固定快照已完成，不保证仍是最新 HEAD。它不写 Git、不改基础指针；原 admin/reconcile 参数和结果不变。T1 启动/刷新/写后独立排队构建。普通读取不触发构建。

`search_memories` 或 REST 的 q 查询可显式传 scope=metadata/content/all，以及 status、path_prefix、include_archived（默认 true）。不传 scope 保留旧请求行为；REST 旧 q+status/path_prefix 继续忽略过滤。新客户端核对 search_scope；没有它不能当作增强生效。content/all 要求相同 commit 的索引就绪，PUBLISH_ERROR.details.component=search_index 区分 disabled/missing/corrupt/capacity 等原因；这些都不是没有相关内容。

索引仅搜索五文件正文，不含 CONTEXT YAML。匹配为原文短语、全部查询项；英文按词，连续 CJK 按码点二元组，支持单字。all 保留元数据排序，再补正文结果；没有语义推理。每主题最多 3 段、每段最多 1024 UTF-8 字节，带原文行号、标题、revision、truncated 和完整读取 URI。版本变化需重新核对。当前格式/算法为 v2，修复列表内围栏解析，并增加块数量、SHA-256 摘要及位置顺序校验；损坏对象报错，可由维护入口重建。摘要用于检测对象损坏，不是写入者身份认证。

从 v1 升级：保留 `_search/v1/`，新构建写入 `_search/v2/`。已开启正文检索的 T2 在升级后调用上述维护入口并确认 index_version=2，或等待后续发布/已配置的 Cron；T1 重启后自动排队构建。补建前 content/all 报索引未就绪，普通读写和元数据查询仍可用。旧正文游标返回 INVALID_CONTENT，按 details.action 去掉 cursor 重新查询；普通查询与 metadata 筛选游标继续可用。无需迁移 Git 数据、基础快照或配置。

load_context 显式 max_bytes 返回独立 sections/coverage，不返回 files/revisions。预算为标题路径和原文片段的 UTF-8 字节总和，不包括协议 JSON，也不是 token；超大块省略并报告。full 与预算同传拒绝。未传预算仍完整读取；缺失请求文件仍 NOT_FOUND，精简主题按实际文件回退，不能吞掉其他错误。写前必须完整原文及版本。

`GET /api/v1/index` 仍需 READ/WRITE Bearer 鉴权。公共格式 schema_version=1，只含生成时间、commit 及 path/title/status/可选 description/aliases/tags/updated_at，不含 UUID、正文、revision、存储键或索引片段。“公共格式”不是匿名公开。

## Cron 与旧部署

原 wrangler.jsonc 不增加触发器。新安装可参照独立 wrangler.cron.example.jsonc：`*/15 * * * *` 按 UTC 每 15 分钟完整 reconcile，再独立补建启用的正文索引。可见性延迟包含调度间隔、执行和索引就绪时间；不是实时服务或可靠任务队列。触发器配置传播也有延迟，应按 Cloudflare 控制台/日志确认生效。

Cron-only 新安装只需 GITHUB_TOKEN、MEMORY_READ_TOKEN、MEMORY_WRITE_TOKEN。已有 GITHUB_WEBHOOK_SECRET 缺省继续启用原签名 Webhook；显式 MEMORY_WEBHOOK_ENABLED=false 停用，true 但无 secret 仍拒绝。旧四项 secrets 全保留，不自动删除 GitHub webhook。

ctx.waitUntil 只承载受运行时限制的后续构建，失败单独记录，不改 published。未启用 Cron 时可通过后续发布或维护入口重试。基础 reconcile 仍使用原 HEAD/CAS，不因 HEAD 相同跳过修复。

升级沿用原 Worker 名称、域名、binding、仓库分支、令牌、compatibility_date/flags 和配置。先关闭新功能验收旧客户端，再逐项启用；不要用示例覆盖实际配置。省略 crons 与设为空数组不同，后者会移除触发器；合并配置前比较原配置。

回滚只恢复经验证的应用构建及本次新增配置。回滚到无 scheduled 的旧程序前撤回本次增加的 Cron，保留原有触发器/Webhook。保留最新 Git/R2 数据，不 reset、不强推、不恢复旧指针；旧程序忽略旁路对象。增强游标回滚后重新查询，原游标继续使用。schema 1/2 或路径 ID 的更早迁移另按原指南处理。

## 验证与限制

运行 typecheck、test、test:worker、test:stdio 和 evaluate。普通 CI 不调用模型、不读生产记忆、不做远程写入。服务评测使用 32 个合成案例与 6/60/300 主题，报告见 [service-report.json](evaluation/service-report.json)；正文专属题刻意覆盖原元数据无法召回的信息，不能把结果解释为真实任务提升比例。

Skill 的时间、来源、失败经验、核验和授权纠错是操作约定，不是服务端事实判断或强制审批。真实 Agent 三种条件的任务对照仍须独立验收；来源不可达不等于错误，归档不隔离，删除不物理擦除。真实仓库/PAT 写入、远程 R2、Webhook/Cron 投递与客户端安装仍须明确隔离目标；只读预检不证明写权限。
