# 发布快照与升级

GitHub 是规范源。R2 的 schema 3 使用 `_blobs/<git-blob-sha>` 保存内容，`_snapshots/<uuid>.json` 保存不可变索引与元数据，`_current.json` 是当前快照指针。发布失败不会清理旧快照；ETag 条件写阻止旧发布者覆盖已切换的新指针。Git 与 R2 之间仍非事务，持续并发或中断后可重试 reconcile。

## 现有 schema 3 的增量升级

本轮不更改基础发布格式或协议，原数据与默认请求免迁移。正文索引默认关闭，启用后在 `_search/v2/<git_commit>.json` 独立构建；原始快照先发布，旁路失败不改变 published。WRITE-only `POST /api/v1/admin/search-index` 的 `{}` 请求可补建调用时固定的快照，不修改 Git 或基础指针；旧 reconcile 入口不变。普通读取不构建索引，增强查询遇到未就绪/损坏索引明确报错，不返回假空结果。没有新增在线 GC。

已使用 v1 正文索引的部署升级后补建 v2，并确认维护响应 index_version=2；v1 对象保留。v2 增加完整性校验并修复列表围栏解析，旧正文游标需要重新分页，元数据游标保持兼容。回滚后，若当前提交仅有 v2 索引，由旧版按其规则补建 v1，不回退 Git 或基础指针。关闭正文检索的部署无需构建索引。

Webhook 缺省沿用既有 secret，Cron 仅在明确选择后配置。兼容升级与回滚只涉及应用及新增配置，保留最新数据；不能照搬下方针对 schema 1/2 的旧迁移步骤去重建、覆盖或回退现有 schema 3 服务。详见[分层使用与升级](TIERS-USAGE.md)。

## 从 schema 1/2 升级

1. 确认 Git 文件已满足 UUID/path 格式；旧路径 ID 先按 [迁移指南](IDENTITY_MIGRATION.md) 离线处理。
2. 部署新 Worker，使用写令牌调用 `POST /api/v1/admin/reconcile`，请求体 `{"all":true}`。此操作不修改 GitHub。
3. 确认 published 为 true，再检查 list、search、load_context。旧索引存在但没有新指针时，读取返回 PUBLISH_ERROR，故安排短暂维护窗口。
4. 旧路径对象不影响新版本读取。不要直接回滚旧 Worker：旧版索引可能已过期，需配套重建其服务数据。

## 保留与容量

旧清单和 blob 不自动删除，以保护并发读和已发出的分页游标。删除记忆只从当前快照及 Git 当前分支移除，Git 历史、旧 R2 快照仍可能包含内容；持有旧游标且有读权限的客户端仍能分页旧索引。不要把删除操作当作物理擦除。

目前没有在线垃圾回收。需要回收空间时，安排维护窗口，停用写入、webhook 与读取，保留当前清单及其引用的全部 blob，离线清理其他对象；恢复后让客户端从第一页重新查询。不要配置会删除当前引用 blob 的桶级生命周期规则。对数据擦除有要求时，还需单独处理 Git 历史和备份。

缓存避免每次变更重复下载全部文件，但仍遍历完整 Git tree、验证文件并生成完整清单。冷启动所需外部请求随不同 blob 数量增长，R2 请求和内存也随仓库增长。较大导入需要评估 [Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)；Free 的外部子请求额度可能不足，Paid 也不代表无限容量。当前不支持超大仓库或分批导入。

## 部署配置

仓库中的 wrangler.jsonc 仅包含占位值。复制为被 Git 忽略的 wrangler.local.jsonc 后填写实际部署配置；所有 secret/deploy 命令使用 `--config wrangler.local.jsonc`。

也可以将配置保存在仓库之外，使用 `--config /absolute/path/wrangler.production.json`；此时 `main` 应为源入口的绝对路径，因为相对路径基于配置文件位置解析。令牌只放 Worker secrets 或外部安全环境。

本次清理只移除当前版本中的个人部署标识，不重写历史提交。开源前如需清理旧历史，应另行审查并规划迁移；不要把当前文件脱敏视为历史已清除。
