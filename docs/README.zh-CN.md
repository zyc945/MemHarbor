# 文档导航

[English](README.md) | **简体中文** · [项目介绍](../README.zh-CN.md)

从 [T0 第一次使用指南](FIRST_USE.md)开始：安装 Skill、创建本地 Git 记忆库，再保存和找回记忆。[项目介绍](../README.zh-CN.md)和[英文指南](FIRST_USE.en.md)采用同一默认流程。

## T0 入门

- [第一次使用：安装、保存、更新与找回](FIRST_USE.md) — 简体中文 / [English](FIRST_USE.en.md)。
- [Skill 安装、升级与使用](SKILLS.md) — 简体中文。
- [独立 Skill 使用说明](../plugins/memharbor/skills/memharbor/README.md) — English，随 Skill 分发。

## 已有服务参考

T1、T2 的独立介绍留待后续分析和编写，见[文档待办](TODO.md#t0-first-documentation)。下列资料供已有服务用户查阅，不是 T0 的前置要求。英文翻译进度记录在 [TODO.md](TODO.md)。

| 文档 | 语言 |
| --- | --- |
| [GitHub 访问令牌：创建、配置、验证与轮换](GITHUB_TOKEN.md) | 简体中文 |
| [Codex、Claude Code、Cursor 的 MCP 配置](MCP_CLIENTS.md) | 简体中文 |
| [插件安装与客户端兼容性](PLUGINS.md) | 简体中文 |
| [发布快照、保留策略与升级](PUBLICATION.md) | 简体中文 |
| [从路径 ID 迁移到 UUID](IDENTITY_MIGRATION.md) | 简体中文 |

## 工程说明

| 文档 | 语言 |
| --- | --- |
| [实现规范](IMPLEMENT.md) | English |
| [验收记录与实现限制](VERIFICATION.md) | English |
| [实现进度与待验收事项](TODO.md) | English |
| [项目开发约定](../AGENTS.md) | English |

实现规范开头的修订说明优先于其中保留的历史示例。当前 API 契约以项目 README 和现行 schema 为准；验收记录区分已完成检查与尚待完成的外部验收。

## 文档维护

行为或配置变化时，同步更新中英文项目 README；命令名称、API 字段、占位符和验收状态应保持一致。尚未翻译的指南明确标注语言，新增译文时同步更新两份导航。

## 渐进式三层架构与记忆能力

- [统一实施清单](TIERS.md) — 简体中文，英文版待补；记录实现与本地验证状态，真实 Agent 和远程验收另列，不表示能力已部署上线。
- [分层使用与兼容升级](TIERS-USAGE.md) — 简体中文；T0/T1/T2 入口、显式开关、容量及回滚说明。
- [记忆管理生态与工程实践调研](MEMORY-ECOSYSTEM.md) — 简体中文；外部实践、证据局限及实施映射，项目自述不等于独立验证。
