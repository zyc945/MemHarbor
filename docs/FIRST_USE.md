# 第一次使用 MemHarbor：T0 本地记忆

[English](FIRST_USE.en.md) | **简体中文**

T0 使用 `memharbor` Skill 和 Agent 已授权的文件/Git 工具，把记忆保存在独立的本地 Git 目录（记忆库）中。本篇从安装走到保存、更新和跨会话找回，无需部署服务或准备云账号。

## 1. 安装 Skill

先准备 Git，安装并登录 Codex、Claude Code 或 Cursor，确认普通对话正常。在使用 Agent 的项目目录执行（此安装方式需要 Node.js/npm）：

```sh
npx skills add zyc945/memharbor-skill --skill memharbor --agent codex --copy
```

[独立 Skill 仓库](https://github.com/zyc945/memharbor-skill)已公开，无需 GitHub 登录或私有源码权限。Claude Code / Cursor 分别改用 `claude-code` / `cursor`；跨项目使用加 `--global`。安装后新开会话，确认客户端能发现 `memharbor`。安装器只安装 Skill 文件，不会安装客户端或创建记忆库。

没有 npm 时，可将完整 Skill 文件夹复制到项目的 `.agents/skills/memharbor`（Codex）或 `.claude/skills/memharbor`（Claude Code）；Cursor 使用当前版本支持的 Skill 目录。保留 `SKILL.md`、`agents/` 和全部 `references/`。已有同名 Skill 或包含它的插件时，不重复安装。T0 运行本身不需要 Node.js 服务。

## 2. 创建本地记忆库

选择一个独立于代码项目、尚未使用的目录。以下命令适用于 Bash/Zsh：

```sh
git init -b main "$HOME/memharbor-vault"
git -C "$HOME/memharbor-vault" var GIT_AUTHOR_IDENT
```

如果 Git 提示缺少作者身份，用 `git -C "$HOME/memharbor-vault" config user.name "你的姓名"` 和对应的 `config user.email "你的邮箱"` 设置你自己的真实配置，只对该仓库生效。

通过客户端的权限设置允许 Agent 访问这个目录。文件和提交会跨会话保留；没有远端时只保存在本机，不代表已经备份到 GitHub。

## 3. 整理第一条记忆

把路径替换为刚创建目录的实际绝对路径，再告诉 Agent：

```text
使用 memharbor，仅使用 /absolute/path/memharbor-vault 这个独立本地 Git 记忆库。
授权读取和提交我批准保存的记忆，不连接其他记忆服务，也不创建远端。
我计划每周读一本技术书，先读网络基础，目前尚未选择第一本书。
请先查重，再整理读书计划草稿，暂时不要保存。
```

检查草稿是否保留“尚未选择第一本书”，没有编造书名、日期、已完成事项或来源。Agent 会按内容建议主题和文件，不需要你手填 UUID、Git SHA 或工具参数。草稿阶段不应产生提交。

## 4. 保存并验证

审阅后发送：

```text
保存刚才确认的草稿，并回读验证。
```

预期得到实际保存路径、Git 提交和回读结果。没有目录访问权限或提交失败时，Agent 应说明尚未完成，不能只展示草稿就声称保存成功。

## 5. 更新同一条记忆

```text
使用 memharbor，继续使用同一个记忆库。
更新刚才的读书计划：已选《计算机网络》，尚未开始阅读，下一步读第一章。
保留原有背景和决定，直接保存本次变更并回读验证。
```

应更新原主题，保留无关内容，不重复创建。普通讨论不会自动保存；明确授权本次保存后，无需反复确认同一内容。

## 6. 新会话找回

新开 Agent 会话，指定同一目录：

```text
使用 memharbor，从 /absolute/path/memharbor-vault 找回读书计划，
告诉我当前进展和下一步。只读取，不更新记忆。
```

应找回“已选书、未开始、下一步读第一章”，读取不产生提交。T0 的搜索范围取决于客户端实际具备的文件工具；找不到时可给出已保存的主题路径，不能把一次搜索无结果当作记忆不存在。

## 常见问题

| 情况 | 处理 |
| --- | --- |
| 安装返回 404 | 使用公开的 `zyc945/memharbor-skill` 安装地址 |
| 客户端看不到 Skill | 检查项目/全局范围，开启新会话；Codex 可显式使用 `$memharbor` |
| 无法访问记忆库 | 核对绝对路径与客户端目录权限 |
| Git 无法提交 | 检查该仓库的作者身份、写权限及错误信息，不覆盖无关改动 |
| 新会话找不到记忆 | 指定同一记忆库，核对先前的保存路径和提交结果 |
| 保存结果不明 | 先检查原路径、文件和 Git 历史，不盲目重复创建 |

更新已复制安装的 Skill 时，重新安装新版并开启新会话。移除 Skill 不会删除记忆库。详细规则见随 Skill 安装的[操作约定](../plugins/memharbor/skills/memharbor/references/vault-operations.md)，客户端验证范围见[验收记录](evaluation/NEW-USER.md)。

已有服务用户可查阅 [MCP 配置参考](MCP_CLIENTS.md)。T1、T2 的独立入门说明留待后续分析和编写，本篇以 T0 为默认流程。
