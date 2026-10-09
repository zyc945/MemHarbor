# 安装 MemHarbor

MemHarbor 提供查找、读取和整理保存记忆的统一入口。插件将 MCP 连接配置和 `memharbor` Skill 放在同一个包里；用户不需要记住 MCP 工具名。读取直接使用工具，保存默认先预览具体草稿，已有明确授权时按授权执行。

插件连接已经部署的 MemHarbor 服务，不会部署 Worker，也不会配置 GitHub 或 Cloudflare。安装前准备服务的 HTTPS `/mcp` 地址与 MemHarbor 访问令牌：只读令牌用于查找，可写令牌用于整理后的保存。不要使用 GitHub PAT。

## 选择安装方式

以下为 2026-09-22 的官方文档核对结果。客户端版本及组织策略可能限制功能；包结构校验不等于已完成真实客户端登录、连接和写入验收。

| 客户端 | 原生能力 | 本项目提供的入口 |
| --- | --- | --- |
| Codex 桌面端、CLI | 插件可打包 Skill 和 MCP；支持本地仓库市场 | 本地插件包，配置服务 URL，令牌由环境变量提供 |
| Codex IDE 扩展 | 官方文档当前说明不支持插件 | [独立 MCP](MCP_CLIENTS.md#codex) + [独立 Skill](SKILLS.md) |
| Claude Code | 插件可打包 Skill 和 MCP；`userConfig` 可询问地址及敏感凭据 | 原生插件与仓库市场 |
| Cursor | 插件可打包 Skill 和 MCP；插件变量可在市场配置界面填写 | 原生插件包；团队市场导入，或手动安装作为兼容入口 |

三份客户端清单位于 `plugins/memharbor`，共用一份 `skills/memharbor`。没有安装 hook、自动保存 hook、本地代理或自建 npm 安装器。包内仅保留配置占位符，不含个人服务地址或凭据。目前尚未上架任何公共插件市场。

以下本地安装命令从包含本文件的仓库根目录执行。源码仍为私有时，需要正常 Git 读取权限。使用本地命令可验证未发布的修改；只有相关版本推送后，远程安装才会取得相同内容。

## Claude Code

从本地源码添加市场并安装：

```sh
claude plugin marketplace add .
claude plugin install memharbor@memharbor --scope user
```

相关版本推送后，也可以将第一条改为：

```sh
claude plugin marketplace add zyc945/memharbor-public
```

启用插件时填写 `endpoint`（完整 HTTPS `/mcp` 地址）和 `token`（不含 `Bearer `）。令牌字段标记为敏感，由 Claude Code 的凭据机制保存；不要将真实令牌写入命令、项目设置或插件清单。启动新会话，在 `/mcp` 检查插件提供的服务。

这些配置字段依赖客户端对 `userConfig` 的支持；旧版本不弹出配置界面或不能替换变量时，更新客户端，或使用手动入口。不要通过把令牌硬编码进插件来规避兼容问题。

Claude Code 会为插件 Skill 添加命名空间，可能显示 `/memharbor:memharbor`。无需记住该命令，直接说“用 MemHarbor 整理这次讨论”即可。工具名也可能带有插件前缀，Skill 按功能识别。

## Codex 桌面端和 CLI

当前自托管服务地址需要配置在**本地安装来源副本**中；不承诺像 Claude Code 一样弹出配置表单。建议将整个源码仓库复制或克隆到专门的本地安装目录，避免把个人地址带入开发提交。

1. 在该副本的 `plugins/memharbor/.codex-plugin/plugin.json` 中，将 `mcpServers.memharbor.url` 的示例地址替换为自己的 HTTPS `/mcp` 地址。保留 `bearer_token_env_var: "MEMHARBOR_TOKEN"`，不填真实令牌。
2. 按 [凭据说明](MCP_CLIENTS.md#连接信息与令牌) 将选定的 MemHarbor 令牌注入客户端环境。
3. 从该副本根目录添加本地市场：

```sh
codex plugin marketplace add .
codex plugin add memharbor@memharbor
```

Codex 官方文档支持兼容读取仓库的 `.claude-plugin/marketplace.json`；组件使用本包的 `.codex-plugin/plugin.json`。若版本没有 `plugin add`，在支持插件的桌面端或 CLI `/plugins` 中选择已添加市场的 MemHarbor。安装后开启新会话。

不要在配置示例地址尚未替换时安装，也不要直接从 Git 远程安装这个 Codex 模板：远端模板不知道你的自托管地址。桌面进程必须获得令牌环境变量；仅在终端 export 不一定使已打开的桌面应用生效。

若客户端无法识别本地市场或插件提供的 Bearer 环境变量配置，使用[独立 MCP 配置](MCP_CLIENTS.md#codex)与[独立 Skill](SKILLS.md)，并禁用插件，避免重复连接。这条路径的原生安装与凭据连接仍需客户端验收。

## Cursor

对于 Teams / Enterprise 的团队市场，可由有权限的管理员在 **Dashboard → Plugins & MCPs → Team Marketplaces → Import from Repo** 导入源码仓库，选择 `plugins/memharbor` 的插件。需要该仓库的访问权限；组织策略也可能限制导入与本地插件。

安装插件后，在 **Plugins → Configure** 填写：

- `MEMHARBOR_URL`：服务的完整 HTTPS `/mcp` 地址。
- `MEMHARBOR_TOKEN`：MemHarbor 访问令牌，不含 `Bearer `。

变量由 Cursor 的插件配置机制替换，不是手动 MCP 配置中的 `${env:...}`。包内只声明变量名，不含值。令牌的保存与访问权限由客户端管理；本项目不额外承诺其加密存储方式。

Cursor 官方也支持复制插件到 `~/.cursor/plugins/local/memharbor` 后重新加载窗口；外部目录符号链接不受支持。但本包的变量配置是否在该本地入口可用尚未完成验证，因此它暂不作为普通用户的推荐路径。没有团队市场或变量配置界面时，使用 [Cursor MCP 配置](MCP_CLIENTS.md#cursor)及[独立 Skill](SKILLS.md)，不要将令牌写入插件文件。

公开市场分发需要源码公开并提交审核，目前未上架。不能将“包已提供”理解为已能在 Cursor 公共市场搜索安装。

## 从独立安装升级

- 已有 `memdock`、`memharbor-dock` 或 `memharbor-save` 时，按[旧名称迁移说明](SKILLS.md#从旧名称升级)移除原范围中的旧 Skill。
- 插件已包含 `memharbor` Skill，不再运行 `npx skills add` 安装同一份规则。
- 核对旧的独立 MCP 连接信息后，禁用旧条目，再启用插件连接。插件服务器可能带命名空间，不能靠“名称看起来不同”判断是不是两份连接。
- 保留旧配置备份，直到插件只读检查通过；失败时禁用插件，恢复原独立连接，不同时启用两套。

## 首次使用与验收

新会话先发送：

> 用 MemHarbor 查找记忆，只读取，不创建或修改数据。

确认能发现工具、认证通过、列表为空或返回预期结果。只读令牌可能仍能发现写工具，但服务端会拒绝写入，工具是否显示不是权限边界。

再发送：

> 用 MemHarbor 将这次讨论整理为记忆草稿，暂时不要保存。

检查草稿是否简明准确、已有相关记忆是否被正确选中、原任务和不确定性是否保留。仅查找、回顾或普通讨论不应触发保存。

完整写入验收应使用专用测试部署及明确的测试主题，经授权执行保存，再读取验证；不得为安装验证向真实数据仓库创建测试记忆。仅安装与结构检查通过时，应明确写入流程尚未验收。

## 更新与卸载

使用客户端原生插件管理界面或 CLI 更新、禁用、卸载 MemHarbor；本地 Codex 来源更新后重新核对 URL，并刷新市场和安装缓存。不要直接修改客户端缓存中的插件文件，更新会覆盖缓存。通过插件管理卸载不会删除服务端记忆；客户端保存的凭据是否一并移除，需在对应凭据设置中检查。

手动安装的 MCP 和 Skill 不归插件卸载管理，需按原范围分别移除。源码发布前同步递增三份插件版本，并重新验证组件发现与凭据配置。

## 官方依据

- [OpenAI：插件支持范围](https://developers.openai.com/codex/plugins/)
- [OpenAI：插件打包和市场](https://developers.openai.com/plugins/build/plugins)
- [Claude Code：插件清单、用户配置和命名空间](https://code.claude.com/docs/en/plugins-reference)
- [Cursor：插件安装、团队市场与本地开发](https://cursor.com/docs/plugins)
- [Cursor：插件变量和清单](https://cursor.com/docs/reference/plugins)
