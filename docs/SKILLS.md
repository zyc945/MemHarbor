# MemHarbor：整理上下文，让记忆靠岸

`memharbor` 从当前对话和指定材料确定主题及后续使用目标，提炼关键事实、结论、必要依据与下一步，查找已有记忆并生成新建、更新或引用草稿。默认确认草稿后保存并回读验证；已有具体授权时直接执行，不需要手填 API 参数。首次接触项目请先看 [T0 第一次使用指南](FIRST_USE.md)，使用 Skill 和本地 Git 记忆库完成保存与找回。

Skill 位于 [`plugins/memharbor/skills/memharbor`](../plugins/memharbor/skills/memharbor/SKILL.md)，采用标准 `SKILL.md` 格式，可通过 [skills CLI](https://github.com/vercel-labs/skills) 安装到 Codex、Claude Code 和 Cursor。不需要发布 npm 包；`npx skills` 从代码仓库发现并安装 Skill。

已安装 [MemHarbor 插件](PLUGINS.md) 时无需再安装独立 Skill。以下命令适用于手动安装或不支持插件的客户端。

## 安装前

- 使用 Agent 时需已有可正常对话、已登录的客户端；skills CLI 只负责 Skill 文件，不能代替客户端安装或登录。
- 本机有 Git；下方 `npx` 安装方式需要 Node.js 和 npm，也可按[首次使用指南](FIRST_USE.md)复制完整 Skill 文件夹。
- 默认使用 T0：准备独立的本地 Git 记忆库，明确目录并授予 Agent 文件/Git 访问权限。
- 无存储入口时只能整理草稿，不能声称已查重或保存；没有远端的记忆库只保存在本机。
- 安装 Skill 不会部署 Worker、添加 MCP 服务器或配置凭据，也不会创建记忆。

以下命令指向公开的[独立 Skill 仓库](https://github.com/zyc945/memharbor-skill)，无需 GitHub 登录或私有源码权限，不访问记忆数据仓库。

## 使用 npx skills 安装

先查看可安装条目，不执行安装：

```sh
npx skills add zyc945/memharbor-skill --list
```

按客户端选择一条，在当前项目安装：

```sh
# Codex
npx skills add zyc945/memharbor-skill --skill memharbor --agent codex

# Claude Code
npx skills add zyc945/memharbor-skill --skill memharbor --agent claude-code

# Cursor
npx skills add zyc945/memharbor-skill --skill memharbor --agent cursor
```

需要跨项目使用时添加 `--global`。例如一次安装到三种客户端：

```sh
npx skills add zyc945/memharbor-skill --skill memharbor \
  --agent codex claude-code cursor --global
```

也可以先克隆公开 Skill 仓库，再从本地目录安装：

```sh
git clone https://github.com/zyc945/memharbor-skill.git
npx skills add ./memharbor-skill --skill memharbor --agent codex
```

上面的本地安装命令在 `memharbor-skill` 文件夹的父目录执行；若已在 Skill 仓库根目录，路径用 `.`。默认由 CLI 选择链接/复制方式；需要独立副本时使用 `--copy`。重启或新建 Agent 会话，让客户端发现新增 Skill。

公开安装只包含 Skill、使用说明、参考文件和许可，不包含私有数据仓库或个人部署信息。公开 Skill 仓库没有服务构建入口；使用 T0 或已有 MCP 无需构建服务。

## 从旧名称升级

本 Skill 曾使用 `memharbor-save`、`memharbor-dock`、`memdock` 三个名称。安装新名称不会自动删除旧安装；请按原安装范围移除旧版，再安装 `memharbor`，避免 Agent 同时加载两份规则。

```sh
# 原来全局安装时
npx skills remove memdock --global

# 原来项目级安装时，在对应项目目录执行
npx skills remove memdock
```

若安装的是更早的 `memharbor-save` 或 `memharbor-dock`，将上述命令中的旧名称替换为它。根据提示选择需要移除旧版的客户端。然后执行上面的新名称安装命令，并开启新会话。

## 使用示例

Codex 可以明确指定 Skill：

```text
使用 $memharbor 整理刚才的讨论，检查是否已有相关记忆，生成草稿供我确认。
```

独立安装时，支持斜杠 Skill 调用的客户端可使用 `/memharbor`；插件可能添加命名空间（如 Claude Code 的 `/memharbor:memharbor`），以客户端显示为准。通常直接使用自然语言即可：

```text
使用 memharbor，把这次排查结果补充到已有网络记忆，保留原有决策和未完成事项。
```

其他常见请求：

- “把当前项目的背景、进度和下一步整理成记忆。”
- “更新这条记忆：之前的方案已取消，现在采用刚才确认的新方案。”
- “仅整理记忆草稿，暂时不要保存。”
- “保存这次讨论，并引用已有的网络基础设施记忆。”
- “把这两条记忆建立双向引用，先给我看修改内容。”

如果缺少主题路径，Skill 会根据当前内容和仓库已有组织自动建议。只有目标有歧义、信息矛盾等影响正确保存的问题才需要澄清，不要求用户逐项填表。

## T0 读取与保存

先告诉 Agent 记忆库的绝对路径和本次授权范围。查找和续接只读取；保存时先查重、读取已有内容、整理草稿，按授权将本次修改作为一个 Git 提交保存，再回读验证。更新合并到原主题，保留无关信息；内容无变化时不提交。

新会话继续指定同一目录即可找回记忆。保存结果不明时，先核对原路径、文件和提交，不能盲目重复创建。完整练习见[第一次使用指南](FIRST_USE.md)，文件与提交规则见随 Skill 安装的[操作映射](../plugins/memharbor/skills/memharbor/references/vault-operations.md)。

<details>
<summary>已有 MCP 服务的保存、引用与恢复参考</summary>

以下流程供已有 T1/T2 服务用户查阅，连接配置见 [MCP 客户端指南](MCP_CLIENTS.md)。

## 读取与保存

“查找之前的方案”“继续上次的工作”只调用 MCP 搜索和读取，不进入保存流程，也不自动改写记忆。普通讨论不会自动保存。读取通常无需额外确认，但仍遵守客户端的工具审批策略。

写令牌包含读取权限；权限由服务端校验，是否执行本次写入仍取决于用户意图和草稿授权。

## 保存流程

1. 根据用户意图明确主题和未来用途，针对性查找已有记忆；准备更新时取得受影响文件在同一提交下的完整原文与版本基线，目标明确后停止扩大搜索。`CONTEXT.md` 必需，其余四文件可选；若 `load_context` 因请求了缺失文件返回 `NOT_FOUND`，改为逐文件读取，只跳过已确认缺失的可选文件。权限、网络或发布错误不能当作文件缺失；版本不一致时重新读取基线。
2. 按用途提炼本次增量，再依五文件分工组织；同一目标下合并，独立维护的主题才拆分，无实质增量则不提交。
3. 展示目标路径及具体内容或差异，等待用户确认。
4. 新建时按 path 调用 `create_memory` 并记录返回的 UUID，通过 files 一次提交完整五文件草稿；更新时一次 checkpoint 提交受影响文件。
5. 按 UUID 回读验证，返回 id、path、变更文件和发布结果。

Skill 不让用户填写 UUID：新建由服务生成，更新使用查找结果中的 id。移动位置需明确批准后调用 move_memory，普通内容更新不能修改 id/path。

新建支持 status 和 files，一次 Git 提交保存完整记忆；CONTEXT.md 只传正文，YAML 和标题由服务生成。Skill 不会把部分成功描述为全部完成。

新建的正常流程是“整理草稿 → 确认 → 一次 create → 一次 full 回读”。无需先创建模板再补充，也无需让用户填写标题、路径或 API 参数。参见随 Skill 安装的[五文件调用示例](../plugins/memharbor/skills/memharbor/references/memory-format.md#新建完整记忆)。

更新基于完整原文合并，不用摘要覆盖旧内容；不把推测写成事实，不编造来源，不自动完成没有证据的任务。内容无变化时不提交。

整理风格默认简明扼要、突出干货：优先记录关键事实、结论、必要依据、约束和下一步，省略聊天复述、重复铺垫和无关过程。精简以清晰准确为前提，保留影响理解、复现和执行的必要背景与参数，以及尚未确认的信息。

记忆应脱离当前对话和执行环境后仍可独立理解。记录机器、项目或操作时，明确有依据的对象标识、用途、路径归属和必要的网络或权限前提，避免只写“这台机器”“当前目录”“上面的配置”。不假设其他 Agent 拥有相同环境或访问能力；缺失信息标为待确认，不猜测，也不保存凭据。独立主题分别维护，共享背景通过已核实的记忆引用复用，同时保留当前主题必需的最小背景与依赖说明。

内容重点随用途选择：项目续接保留状态、阻塞与下一步；排障复现保留适用条件、关键参数和验证范围；决策记录保留选择、依据与取舍；知识复用保留结论、适用范围及来源。无需用户填写目标表单，也不要求每次填满所有文件。

默认确认具体草稿后再写入。用户明确授权同一方案直接保存时，Skill 尊重该授权；出现实质冲突、扩大范围或变更目标时仍需给出新的可审阅方案。

## 记忆相互引用

memharbor 会复用搜索结果，发现有实际依赖、决策依据或来源关系的其他记忆，读取目标内容验证后，将引用及关系说明纳入草稿。用户无需填写 UUID。链接使用 `memory://topics/<UUID>` 或 `memory://topics/<UUID>/DECISIONS.md` 等规范文件 URI，目录移动不改变链接身份。

默认只修改当前主题；用户明确要求双向引用时，双方修改一起预览、分别提交。引用已有记忆的新建流程仍只需一次 create。两个新主题互相引用则需先取得服务返回的 UUID，再补齐引用，Skill 会在预览中说明额外提交和部分失败的边界。

相关主题放 CONTEXT.md、决策依据放 DECISIONS.md、来源放 SOURCES.md，也可在任务正文就地引用。已有引用会保留并去重；找不到目标或无法读取时会明确说明，不生成猜测的链接、不自动改指向同路径的新记忆。

这是 Skill 的发现、验证和写入能力；服务端没有自动反向索引或删除联动，也不递归加载关联记忆。URI 指向当前内容，普通浏览器未必能直接打开，Agent 使用 MCP 读取。完整约定随 Skill 安装，见[记忆引用](../plugins/memharbor/skills/memharbor/references/memory-links.md)。

## 错误与恢复

- 连接不可用：保留草稿，说明尚未检查重复主题或保存结果。
- 只读令牌：可以整理和预览，写操作需要切换为写令牌。
- 并发冲突：重新读取并合并；无语义冲突时最多自动重试一次，不能简单替换 SHA 后覆盖原文。
- 已提交未发布：报告 Git 已保存、R2 未发布，提示按部署文档 reconcile；不盲目再次创建。
- 创建结果未知：先按 path 查找并核对内容，不盲目重建；回读失败时区分已发布但未验证与未保存，不自动删除回滚。

</details>

## 验证范围

发布前检查 Skill 元数据、引用文件、示例语法，并使用 skills CLI 在临时目录验证发现及三客户端安装产物。安装验证不修改个人客户端配置、不向真实数据仓库写入。

技能指导的是 Agent 的整理行为；格式校验和安装通过并不保证每次摘要都正确。首次使用时请检查预览，尤其是决策依据、待办状态和来源。客户端实际调用与写入验收应使用专用测试环境。
