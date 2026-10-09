# 新用户安装与使用验收 — 2026-09-29

2026-09-29 初查从“没有 MemHarbor 配置、没有服务凭据”的视角检查安装与首次使用，只修改文档。2026-10-01 的功能修复和原生客户端验收见下文。两轮均未部署服务或写入真实记忆；安装与行为测试使用独立临时目录和合成数据。

## 发现及处理

| 问题 | 观察 | 处理 |
| --- | --- | --- |
| 远程源码不能当作公开可用入口 | 无鉴权 GitHub 仓库 API 返回 404；skill-installer download 同样返回 404 | README/首次使用指南明确源码权限前提和已有源码的本地安装路径；未将仓库改为公开 |
| Skill 安装指南仍要求先配远程 MCP/写令牌 | 与实际支持的 T0/T1 不一致 | 改为按存储方式选择权限；区分 GitHub PAT 与 MemHarbor 令牌 |
| 无凭据演示缺客户端完整配置 | 直接运行进程没有聊天界面，默认只读 | 增加三种客户端 stdio 配置、写开关和预期结果 |
| 新用户缺少完整使用样例 | 原文偏安装命令与 API 契约 | 增加草稿→确认→保存→更新→只读续接的合成练习 |
| README 工具表漏字段 | create_memory 实际支持 status/files | 同步修正中英文表格 |
| 临时演示易被当作持久存储 | 重新启动后仅剩初始主题 | 明确进程生命周期、持久存储切换及不自动迁移 |

## 已执行

环境：Node.js v22.22.0、npm 11.11.0、skills CLI 1.7.0，Linux。使用当前工作树源码进行本地安装；不表示未推送的文档已可通过远程安装获得。

1. 使用 `npx skills add /absolute/path/memharbor-source --list` 发现 `memharbor`（本机源码目录已改为通用占位符）。
2. 在临时目录执行 `npx skills add /absolute/path/memharbor-source --skill memharbor --agent codex claude-code cursor --copy --yes`，退出码 0。CLI 报告三个目标安装成功；本版生成 `.agents/skills/memharbor`（共享入口）和 `.claude/skills/memharbor`，未生成单独的 `.cursor/skills`。逐文件比较两份产物与源码，Skill、UI 元数据和四份引用文件均一致。这里确认的是安装产物，未推断 Cursor 的实际发现行为。
3. 干净重装依赖 `npm ci` 并构建 `npm run build:local` 成功。依赖审计提示 3 项 moderate 漏洞，本轮未改依赖或执行强制升级。
4. 按已安装 Skill 的服务格式整理合成“读书清单”，用官方 MCP Client 启动独立 demo，明确仅传 PATH 和访问模式，不传真实服务凭据：
   - 发现九个工具；创建前搜索为空。
   - `create_memory.files` 一次创建五文件，返回 `published=true`；full 回读五文件。
   - 使用回读的 commit 执行 checkpoint，更新 STATE/TODO；回读核实变化，并逐字比较 CONTEXT/DECISIONS/SOURCES 保持不变。
   - search/resolve 返回同一 UUID；只读续接前后 commit 不变。
   - 关闭进程，重新启动后新主题消失，仅剩初始合成主题。
   - read 模式调用 create 返回 `FORBIDDEN`。
5. `npm run typecheck` 通过；`npm test` 通过 15 个文件、100 项测试；`npm run test:stdio` 通过。新增 JSON/TOML 示例解析、本地链接目标检查和 `git diff --check` 均通过。

新增配置字段依据 [Codex 官方 MCP 文档](https://developers.openai.com/codex/mcp)中的 STDIO `command`、`args`、`env` 定义核对。JSON/TOML 示例语法和文档本地链接另行检查。

## 复验

安装验收请新建临时目录，在该目录执行上面的 CLI 命令，将源码路径替换为自己的绝对路径。不要加 `--global`，避免改变现有全局安装。

从源码根目录执行：

```sh
npm ci
npm run typecheck
npm test
npm run test:stdio
```

本节记录的是合成 MCP 服务演示。复验时运行 `npm run demo`，或按 [README 的可选服务演示](../../README.zh-CN.md#可选服务演示)生成客户端配置，并确认演示请求只指向 `memharbor-demo`；该进程的数据不会持久保存。当前默认入门已改为 [T0 本地记忆流程](../FIRST_USE.md)，使用独立 Git 目录跨会话保存，两种流程不能混用。

## 2026-09-29 初查的验证边界

初查是隔离安装、按 Skill 契约执行的合成场景和真实 MCP stdio 协议验证，不是另一个新账号/独立模型的原生客户端对话评测。没有测试真实 GitHub 写权限、T2 云端部署、跨设备访问、客户端凭据 UI、插件安装升级或 T0 共享 vault 并发写入。原生客户端是否发现 Skill、是否按提示停止在草稿阶段、摘要质量和工具审批体验仍需独立验收；见 [TODO](../TODO.md) 与 [Agent 验收模板](AGENT-ACCEPTANCE.md)。


## 2026-10-01 修复与复验

本轮不再只补文档：新增可运行的引导演示与本机配置输出；修复预检漏验证访问模式的问题，并补充 Skill 首次连接指引。

### 具体修复

- `npm run demo` 现在自动连接合成 MCP、创建五文件、回读、更新、搜索/只读续接，然后退出，输出五步验证结果。原始 `node dist/local/main.mjs --demo` 仍是协议进程，默认权限仍为 read。
- `node scripts/demo.mjs --config codex|claude-code|cursor` 输出实际 Node/构建路径，明确设置演示 write 权限，不修改客户端配置、不写入凭据。
- 新增 `node dist/local/main.mjs --help`。原 `--check` 在访问模式验证前提前返回；现在 `MEMORY_ACCESS=invalid --demo --check` 返回 INVALID_CONTENT/退出码 1，不再报告 ready。
- Skill 随附首次连接说明与独立 README；缺少或存在多个存储入口时明确目标，不把演示误称为持久保存。独立 T0 无远端时报告本地提交/回读，不要求无意义的 push。
- 英文/中文首次使用流程补齐；T1 的完整凭据注入和三客户端配置不再要求先部署 Cloudflare。Bash/Zsh 令牌提示使用两者都支持的读入方式。
- 生成独立 `dist/memharbor-skill.zip`，含九个文件（Skill、README、UI 元数据、五份参考、MIT license），无服务代码、历史、凭据或实际记忆。解压后使用 skills CLI 可安装，不依赖私有源码仓库权限。

### 当前证据

| 验收 | 结果与范围 |
| --- | --- |
| 独立包安装 | 从 zip 解压目录安装到隔离目录，Codex/Claude 产物逐文件一致；Cursor 安装目标由 CLI 接受，未证明 Cursor 原生发现 |
| 干净源码首次运行 | 不含 node_modules、dist 或忽略的凭据文件的新副本中 `npm ci`、`npm run demo` 完成，退出码 0 |
| 配置输出 | 三种输出解析通过，TOML 与 JSON 描述相同的 demo 进程，绝对路径存在 |
| Skill 校验 | quick_validate.py 通过，随附引用完整 |
| 原生 Codex 0.159.0 发现 | 干净配置下 skills/list 返回 enabled=true、无错误；仅合成 MCP 暴露九个工具和有效 schema |
| 原生 Codex 已授权保存/更新/读取 | 成功读取安装的 Skill；create_memory → load_context → update_memory → load_context 成功。一次组合请求；数据保留由模型报告，底层逐字一致性另由协议测试证明 |
| 原生 Codex 仅草稿 | 成功读取 Skill，输出草稿并声明未保存、未访问记忆；零 MCP 调用/零写入。该提示未要求查重，因此不将它计为查重验证 |
| 独立 T0 行为测试 | 独立 Agent 按 Skill 在临时 Git vault 创建、更新，恰好两次提交；另一个读取进程后仍两次提交、工作区干净，原背景/决策保留，未读状态和未完成任务正确 |
| 回归 | typecheck、100 项 Vitest 测试、扩充后的 stdio 权限/五文件/checkpoint/回读检查、Worker 两套隔离测试均通过 |
| 文档 | 新增 JSON/TOML 示例、内部链接目标和 diff 空白检查通过 |

原生 Codex 测试所用 SKILL.md SHA-256：`63ff2a02427eea88daeb119e41ca0be062df5950fa7f682814838f58fedfbe83`；未显式指定测试模型，使用该 CLI 的默认选择，不将单次结果当作模型成功率。运行包版本 0.1.0。原生 workflow 起始 resolve 调用失败，已保留事件状态但未保留具体错误载荷，因此不推断错误代码。

### 验证限制与外部分发

- 原生 Codex 默认 sandbox 在本机因缺少 user namespaces 失败；成功行为测试在已核对仅启用合成服务的环境中避开该限制。没有修改用户的持久 sandbox/客户端配置。
- `--ignore-user-config` 单独使用不能隔离插件：初次尝试触发了已有 Cloudflare MCP 的 OAuth 刷新且失败。后续明确禁用非测试 MCP 和插件，预检只发现合成工具，无后续 OAuth 错误。认证内容未读取、复制或记录。
- Claude Code 2.1.196 未登录，独立尝试 API 用量为零；Cursor 未安装。两者的生成配置和安装产物通过，但原生行为仍未验收。
- 初次原生 Codex 检查是一次组合授权请求；下方补验已覆盖同一进程中的四轮对话。它不证明多轮重启后的 demo 持久性，demo 本来就不持久。独立 T0 证明本地持久化，真实 GitHub/PAT 写入、T2 部署和云端同步仍需专用远程目标。
- GitHub 确认源码仓库为 PRIVATE，匿名读取仍为 404。独立包可由维护者直接提供；当时公开安装入口尚待批准；2026-10-02 已完成授权发布与匿名安装复验，见下文。

临时验收产物在 `/tmp/memharbor-native-5CBmZ0`（原生客户端的无记忆正文事件/摘要）、`/tmp/memharbor-t0-eval-TTnxs0`（合成本地 vault 与断言结果）、`/tmp/memharbor-first-use-gg1Hpt`（干净源码、配置与包安装）。这些临时路径不是面向用户的永久安装入口。

### 同进程四轮对话补验

最终补验使用同一个原生 Codex app-server 进程和线程，按文档分四轮发送“查重与草稿”“确认保存”“授权更新”“只读续接”。每轮后直接通过同一 live MCP 查询真实合成数据，而不是只根据模型答复或 transport completed 判断成功。

| 阶段 | 直接验收结果 |
| --- | --- |
| 初始与草稿后 | 主题数量 1 → 1，搜索/读取成功，零写入 |
| 确认保存后 | 主题数量 2，恰好一个新 UUID；一次 create，isError=false、status=created、published=true |
| 更新后 | 仍为 2 个主题且 UUID 不变；一次 checkpoint，isError=false、status=checkpointed、published=true |
| 只读续接后 | 仍为 2 个主题，零写入，commit 不变 |

更新和最终回读均核对了已选书目、尚未阅读、每周频率、下一步第一章以及原有每次 30 分钟的偏好标记。没有业务错误或 OAuth 错误。原生 SKILL.md 校验和保持不变。已将不包含记忆正文的持久验收摘要保存为 [new-user-report.json](new-user-report.json)，包括逐轮工具业务状态、数量及保留检查；这仍是一个合成场景，不代表一般模型成功率。

首次多轮 recorder 只保留传输状态，出现两次 create 调用但缺少业务错误字段，不能判断是重试还是多创建；该次结果保持“不确定”，不用于通过结论。纠正 recorder 后，先以无模型 list 验证返回结构，再在上述最终补验中逐轮查询真实数量与 UUID，确认一次成功新建。没有为了通过验收放宽数量或写入限制。

独立包的最后一次安装从解压目录运行，移除 GITHUB_TOKEN/GH_TOKEN 环境变量后，九个安装文件（含 README、参考和 license）与当前 zip 逐字一致。另补充客户端安装/登录前提，避免把 skills CLI 文件安装误认为客户端已可对话。当时源码为 PRIVATE、公开分发待确认；下方记录后续发布结果。


## 2026-10-02 公开分发与匿名安装

经用户授权，已发布 [独立 Skill 仓库](https://github.com/zyc945/memharbor-skill)，提交 `4c69513c4bd0200898aa0716a90ed7f3b054564b`。仓库仅含九个文件：LICENSE、README、SKILL、agents/openai.yaml 和五份 references；没有服务源码、原仓库历史、凭据或记忆内容。原 MemHarbor 服务源码仓库仍为 PRIVATE。

- 无鉴权 GitHub API 确认独立仓库公开。
- 移除 GitHub token 环境变量、禁用 Git 全局/系统配置和凭据助手，在新目录运行 `npx --yes skills add zyc945/memharbor-skill --list` 与三客户端目标安装命令，均退出 0。
- Codex/Claude 安装目录的九个文件与发布内容逐字一致。Cursor 目标由安装 CLI 接受，仍不等于 Cursor 原生行为通过。
- 官方 Codex `install-skill-from-github.py` 使用 `--repo zyc945/memharbor-skill --path . --name memharbor --method download`，在无 token 环境下成功安装到隔离目录。
- 安装包重新从同一发布内容生成；Skill 指令校验和与原生四轮验收一致。README 和中英文首次使用指南已切换到公开入口；本地 T0 不依赖私有服务源码。

本次唯一远程写入为授权的独立 Skill 仓库发布，没有生产记忆写入或服务部署。原生 Claude/Cursor 和专用远程服务验收仍保留上述限制。
