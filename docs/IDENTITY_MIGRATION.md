# 从路径 ID 升级为 UUID + path

当前契约把身份与目录分离：`id` 是服务端生成且不变的小写 UUID，`path` 是可修改、全仓库唯一的目录。创建使用 path；后续读写的 topic 参数使用 UUID。旧客户端和已安装 Skill 需要同步更新。

## 新旧数据对比

旧格式：

```yaml
id: 工作/基础设施/网络
title: 网络基础设施
status: active
```

新格式：

```yaml
id: 11111111-1111-4111-8111-111111111111
path: 工作/基础设施/网络
title: 网络基础设施
status: active
```

示例 UUID 不用于真实创建。迁移工具生成 UUID v4。目录和正文保持不变；旧的单段 id（如 legacy）原来存于 `topics/legacy/`，迁移后的 path 是 `topics/legacy`，不移动文件。新建单段 path（如 inbox）直接存于 `inbox/`。

## 空数据仓库

没有规范记忆文件时，无需迁移 Git 内容。部署新 Worker 后执行一次 reconcile，即可生成 schema_version 3 索引。

## 已有数据的离线迁移

在维护窗口暂停 Agent 写入和人工编辑，并暂时停用 push webhook，避免 Git 与 Worker 版本不匹配时触发发布。先保留数据仓库当前提交作为备份。迁移工具不使用网络、不提交、不推送、不修改 Worker。

1. 更新并干净检出数据仓库，确认没有未提交或未跟踪文件。服务源码目录先执行 `npm ci`。
2. 在服务源码目录执行预览，将示例路径替换为本地**数据仓库根目录**：

   ```sh
   node scripts/migrate-memory-ids.mjs /path/to/data-repository
   ```

   输出 old_id、path 和拟分配 UUID，不输出记忆正文。预览不持久化 UUID，正式执行会生成新的值，不应提前把预览 UUID 用于引用。
3. 检查目录与主题对应关系后执行：

   ```sh
   node scripts/migrate-memory-ids.mjs /path/to/data-repository --write
   ```

   工具先验证全部已跟踪的规范记忆目录、YAML 与身份，再修改旧格式 CONTEXT.md；保留正文和其他文件，已有正确 UUID/path 的主题不会重新分配 ID。无 CONTEXT 的目录、格式错误、非 NFC 路径、重复 UUID 会导致停止。默认按服务最大文件上限 262144 UTF-8 字节检查新增内容，若部署设置更小，应在提交前按实际限制检查。
4. 在数据仓库中检查 `git diff`，将迁移作为单个提交推送。保持 webhook 暂停；部署新 Worker 后执行 `POST /api/v1/admin/reconcile`，请求体 `{"all":true}`。
5. 检查 `published: true`，通过 list/resolve 确认 id/path，再按 UUID 读取原内容；恢复 webhook 和写入。

该脚本的多文件本地写入不是文件系统事务。若磁盘错误或中断，先检查 Git diff、恢复到已记录的迁移前提交，再重试。不要把未完成迁移的文件提交到远程。已提交成功后的再次执行不会重新生成既有 UUID。

新版本遇到旧 YAML 时会明确拒绝发布，不会猜测 id、自动转换或默默忽略旧主题。R2 元数据无需手工修改，reconcile 会重建当前快照；旧对象保留，见 [发布快照运维](PUBLICATION.md)。

## 客户端与 Skill 适配

| 操作 | 当前用法 |
| --- | --- |
| create_memory | 输入 path、title 等，记录返回的 id |
| list_memories / search_memories | 每项同时返回 id 与 path |
| resolve_memory | 输入原始 path，取得 UUID；REST 为 GET /api/v1/topics/resolve?path=... |
| load/read/update/checkpoint/delete | topic 或 REST 路径段使用 UUID |
| move_memory | topic 为 UUID，path 为新目录，加 expected_commit、reason |
| MCP 资源 | memory://topics/UUID 或 memory://topics/UUID/STATE.md |

移动只改变直属五个文件的位置，id 和资源 URI 不变，子主题不移动。普通 update/checkpoint 不允许改 id/path。手工移动 Git 目录时须同步修改 YAML path 并保留 id；克隆主题内容为另一主题时必须使用新的 UUID，不能复制原 UUID。

重新运行 [Skill 安装命令](SKILLS.md) 更新 `memharbor`，新建 Agent 会话刷新 MCP 工具 schema。Skill 自动解析路径并保存返回的 UUID，无需用户手填。
