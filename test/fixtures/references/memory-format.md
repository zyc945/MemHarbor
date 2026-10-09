# MemHarbor 记忆格式与 MCP 约定

## 目录和身份

`id` 是服务端创建时生成的小写 UUID，终身不变。`path` 是可修改且全仓库唯一的可读目录位置，例如 `工作/基础设施/网络`。目录中保存五个 Markdown 文件；单段路径也直接位于仓库根目录，不自动添加 `topics/` 前缀。迁移的旧目录可以保留 `topics/legacy` 作为完整 path。父主题和子主题相互独立。

path 区分大小写，并使用 Unicode NFC。每段以 Unicode 字母或数字开头，随后允许字母、数字、组合标记、下划线、连字符，最多 64 个码点；完整路径最多 1024 个 UTF-16 代码单元。拒绝空段、点段、反斜线、控制字符、百分号和绝对路径。

创建时传原始 `path`，不编码也不自行生成 id。查找路径使用 `resolve_memory({path})` 得到 id；`load_context`、`read_memory_file`、`update_memory`、`checkpoint_memory`、`move_memory` 的 `topic` 一律传 UUID。`move_memory` 修改位置但保留身份；普通内容更新不得修改 YAML id/path。引用使用稳定的 `memory://topics/<UUID>`。

需要发现相关记忆、生成主题/文件引用或建立双向关联时，参见[记忆引用约定](memory-links.md)。引用写在 Markdown 正文中，由 Skill 查找、验证并纳入批准草稿；服务端不会自动展开链接或生成反向引用。

## 五个文件

| 文件 | 保存内容 | 合并原则 |
| --- | --- | --- |
| CONTEXT.md | 稳定背景、目标、范围、术语、约束与必要关系 | 保留 YAML；短期进度移入 STATE，不复制整段聊天记录 |
| STATE.md | 当前可验证状态、最近结果、阻塞、下一关注点 | 区分“已验证”“待验证”；过期状态可按证据更新 |
| DECISIONS.md | 已采纳的决定、原因、约束和替代方案 | 新决策标明替代关系；保留有价值的历史依据 |
| TODO.md | 未完成任务、完成证据和必要依赖 | 使用复选框；不因未在新对话提及就删除旧任务 |
| SOURCES.md | 实际来源链接、文件、对话说明及支撑的结论 | 去重，注明来源用途；不编造 URL、引用或访问时间 |

每个文件仅在有实际信息时补充；不强行凑满模板。没有明确日期或责任人就省略。文件默认上限 262144 UTF-8 字节，部署可配置更小限制；不得默默截断。

正文以简明、准确、可复用为准：保留结论、关键事实、必要依据和行动信息，省略聊天复述与重复铺垫。长过程优先压缩为“结果、证据、适用条件、下一步”；只有排查复现或决策追溯需要时才保留步骤。精简不能省掉影响判断的限制、未知项、关键参数，也不能删除与本次更新无关的原有内容。

### CONTEXT.md 前置 YAML

只有 CONTEXT 需要这份前置 YAML，必须从文件第一个字符开始。允许的字段只有 `id`、`path`、`title`、`status`、`description`、`aliases`、`tags`；不要添加 `updated_at`、`revision` 等字段，它们由服务在派生索引/元数据中管理。

```markdown
---
id: 11111111-1111-4111-8111-111111111111
path: 工作/基础设施/网络
title: 网络基础设施
status: active
description: 网络架构、访问方式和维护约束
aliases:
  - 网络配置
tags:
  - 网络
---

# 网络基础设施

## 目标与范围

记录已确认的网络结构和长期约束。
```

`id`、`path`、`title`、`status` 必填；`description` 可省略，`aliases` 和 `tags` 可用空数组。id 必须保留服务返回的小写 UUID；path 必须与完整目录完全一致且已经是 NFC。示例 UUID 仅供说明，不能用于真实新建。状态仅允许 `active`、`paused`、`completed`、`archived`。更新时保留原状态，除非本次上下文明确支持改变并包含在批准中。含 YAML 特殊字符的字符串需正确引用。

其他文件使用普通 Markdown。例如：

```markdown
# Current State

## 已验证

- 在本次验证范围内，指定设备可以互相访问。

## 待验证

- 其他设备的连接情况尚未验证。
```

这只是内容结构示例，不能当作用户已经发生的事实。

## 工具输入与返回

工具前缀由宿主决定，下表使用服务自身名称。以当前 MCP 发现的 schema 为准；若与此文档不一致，暂停依赖不兼容字段的写入并说明。

| 工具 | 输入要点 | 返回/用途 |
| --- | --- | --- |
| list_memories | 可选 status、path_prefix、cursor、limit（1–100，默认 50） | topics、total、next_cursor、git_commit |
| search_memories | query、可选 cursor、limit（1–100，默认 10） | 搜索路径、标题、别名、标签、description，不搜正文 |
| resolve_memory | path | 精确解析路径，返回 id、path 及索引字段 |
| move_memory | topic（UUID）、path、reason、expected_commit | 原子移动直属文件，保留 UUID，返回 id、path |
| load_context | topic（UUID）、mode: "full" | 五份完整 files、各文件 revisions、快照 git_commit |
| read_memory_file | topic（UUID）、file | 完整 content、文件 revision、git_commit |
| create_memory | path、title；可选 description、aliases、tags、status、files、initial_context | 一次提交五个文件；返回 id、path、status、git_commit、published |
| checkpoint_memory | topic、reason、expected_commit、files | 一次提交多个文件的完整替换文本 |
| update_memory | topic、file、content、reason、expected_revision | 替换一个已有文件；返回 revision 等结果 |

`create_memory` 自动写入 YAML 和一级标题，状态默认为 active。`files.CONTEXT.md` 或兼容字段 `initial_context` 只写正文，两者不能同时提供非空正文；不能传 `id`。其他 files 值为完整 Markdown。标题 1–500 字符、description 最多 4000 字符，aliases/tags 各最多 100 项。

`checkpoint_memory.files` 只能包含五个规范文件名，至少一个；值是完整 Markdown。`reason` 非空，最多 1000 字符。整个仓库共享分支 HEAD，其他主题的写入也可能触发 expected_commit 冲突。

更新步骤：

```json
{
  "topic": "11111111-1111-4111-8111-111111111111",
  "mode": "full"
}
```

上例 UUID 要替换为 resolve/list/search/create 返回的真实 id。读取完成、整理并获准后，把刚读取的 `git_commit` 放入 `expected_commit`，把合并后的完整内容放入 `files`。不要使用文档里的示例值或自行推测 SHA。

如果 `load_context(full)` 因某个文件缺失返回 NOT_FOUND，可逐个 `read_memory_file` 确认哪些文件存在：CONTEXT 必须存在；其他缺失文件只在计划和批准中明确补建。成功读取的文件应来自同一 git_commit，否则重新读取。权限、网络或发布错误不能当作空文件处理。

`updated`、`checkpointed`、`created` 或 `noop` 且 `published: true` 表示该操作已发布；`noop` 仍需回读确认。`committed_not_published` 不是普通失败，Git 已有提交。先检查 MCP 的 `isError` 与结构化业务结果，不仅检查 HTTP 状态。

## 新建完整记忆

通过 `create_memory({path,title,status,files})` 一次提交已批准的五文件内容。CONTEXT.md 只传正文，其他文件传完整 Markdown。返回 id 后用 `load_context(full)` 回读，不需要第二次 checkpoint。

例如，用户已确认“项目采用 Git 保存历史，R2 提供读取，接下来验证恢复流程”，可整理为以下 `create_memory` 参数。示例内容仅用于展示格式，实际调用应来自当前上下文：

```json
{
  "path": "工作/记忆服务",
  "title": "记忆服务",
  "files": {
    "CONTEXT.md": "## 目标\n\n保存可跨会话复用的项目记忆。",
    "STATE.md": "# 当前状态\n\n已确定存储方案；恢复流程待验证。",
    "DECISIONS.md": "# 决策\n\n使用 Git 保存历史，R2 提供读取。",
    "TODO.md": "# 待办\n\n- [ ] 验证恢复流程。",
    "SOURCES.md": "# 来源\n\n当前对话（无可用链接）：存储方案与后续验证任务。"
  }
}
```

这里省略了默认 active 的 status 和无必要的 description、aliases、tags。成功发布后，用返回的真实 id 调用 `load_context({topic: id, mode: "full"})`，核对五文件内容；CONTEXT.md 会额外包含服务生成的 YAML、一级标题和末尾换行，不能将这些预期差异视为写入失败。

列表和搜索沿 `next_cursor` 分页，保持原筛选条件。游标固定在首次查询的快照；重新从无游标请求开始才能看到最新索引。
