# 配置 GitHub 访问令牌

MemHarbor 使用 GitHub 细粒度个人访问令牌（Fine-grained personal access token，简称 PAT）访问私有数据仓库。T1 将它安全注入本机 stdio 服务的 `GITHUB_TOKEN` 环境变量；T2 将它保存为 Cloudflare Worker 的 `GITHUB_TOKEN` secret。T1 按本文前两节准备仓库和 PAT 后，转到[本机客户端配置](MCP_CLIENTS.md#t1-本机-stdio-补充)，无需配置 Cloudflare。

本文使用示例名称和占位符，不包含任何实际账号、私有仓库地址、部署地址或凭据。界面名称以 GitHub、Cloudflare 当前页面为准。

## 1. 准备数据仓库

在创建令牌前，确认：

- 已创建独立的 **私有数据仓库**，例如 `memory-data`。服务源码仓库与数据仓库分开；源码开源后，数据仓库仍应保持私有。
- 已用 README 初始化仓库，目标分支（例如 `main`）存在。
- 创建令牌的 GitHub 账号对数据仓库有写权限。令牌不能授予账号本身没有的权限。
- 目标分支的保护规则或 ruleset 允许该身份直接更新。MemHarbor 直接创建 Git 提交并更新分支，不创建 PR，也不强制推送。若现有规则要求 PR 或签名提交，应使用符合服务写入方式的专用数据仓库或分支。

## 2. 创建 Fine-grained PAT

1. 登录 GitHub，点击右上角头像，进入 **Settings**。
2. 在侧栏进入 **Developer settings → Personal access tokens → Fine-grained tokens**。
3. 点击 **Generate new token**。也可直接打开 [创建细粒度令牌页面](https://github.com/settings/personal-access-tokens/new)。按提示完成身份验证。
4. 填写令牌信息：

   | 字段 | 建议填写 |
   | --- | --- |
   | Token name | `memharbor-data-access`，便于后续识别用途 |
   | Description | `Read and write the MemHarbor memory data repository` |
   | Resource owner | **数据仓库所属的个人或组织**，不是服务源码仓库的所有者，除非两者相同 |
   | Expiration | 设置有限有效期，例如 90 天；若组织要求更短期限，以组织策略为准 |

5. 在 **Repository access** 选择 **Only select repositories**，仅勾选数据仓库，例如 `memory-data`。不要选择 **All repositories**，也不需要授权服务源码仓库。
6. 在 **Permissions / Repository permissions** 中添加或设置：

   | 权限 | 级别 | 用途 |
   | --- | --- | --- |
   | Contents | **Read and write** | 读取 Markdown 和 Git 对象、创建 tree/commit、更新分支引用 |
   | Metadata | **Read-only**（通常自动包含） | 读取仓库元数据，包括私有状态 |

   其他权限保持未授权。Worker 不需要 Actions、Workflows、Issues、Administration 或 Webhooks 管理权限；webhook 在仓库设置中单独创建，接收请求使用独立的 `GITHUB_WEBHOOK_SECRET` 验签。

7. 检查资源所有者、选中的仓库、权限与到期日，点击 **Generate token**。
8. 立即将生成的值保存到密码管理器，或按下一节直接录入 Cloudflare。离开生成页面后无法再次查看完整值；遗失时需重新生成。

如果数据仓库属于组织，令牌可能需要管理员审批。处于 **Pending** 状态的令牌不能访问所需私有资源；应等待审批通过后再验证。组织还可能限制 PAT 的使用和最长有效期。

若资源所有者或仓库不在可选列表中，先检查登录账号、仓库归属、组织成员身份与组织策略。细粒度 PAT 对外部协作者等场景存在限制，详见 [GitHub 官方说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations)；不要为了绕过配置问题默认改用授权范围更大的 classic PAT。

## 3. 保存到 Cloudflare Worker

本节只用于 T2：`GITHUB_TOKEN` 必须配置在 **Worker 运行环境**。仅添加到 GitHub 仓库的 Actions secrets 不会自动传给 Worker；GitHub Actions 自动提供的临时 `GITHUB_TOKEN` 也不能作为长期 Worker 凭据。

### 方式 A：使用 Wrangler（推荐）

在项目根目录执行。先确认 本机 `wrangler.local.jsonc` 中的 Cloudflare 账号、Worker 名称、`GITHUB_OWNER`、`GITHUB_REPO` 和 `GITHUB_BRANCH` 指向预期部署。

```sh
npx wrangler login
npx wrangler secret put GITHUB_TOKEN --config wrangler.local.jsonc
```

已通过 Cloudflare API token 等方式完成 Wrangler 认证的环境可跳过 `login`。这里的 Cloudflare 凭据只负责管理部署，与刚创建的 GitHub PAT 不同。

在命令的交互提示中粘贴 PAT 并确认。不要把令牌值直接写进命令、脚本、`wrangler.jsonc` 或 Markdown。对于已部署的 Worker，`secret put` 会更新 secret 并部署新版本；尚未部署时，继续完成 [README 的部署流程](../README.zh-CN.md#从空环境部署)。

如果自行配置了 Wrangler 命名环境，上传、部署和检查时均使用同一个 `--env <environment>`，避免把令牌写入错误环境。

可执行以下命令确认 secret 名称存在；该命令不显示 secret 值：

```sh
npx wrangler secret list --config wrangler.local.jsonc
```

### 方式 B：使用 Cloudflare 控制台

1. 登录 Cloudflare，进入目标账号的 **Workers & Pages**。
2. 打开已部署的目标 Worker，进入 **Settings → Variables and Secrets**。
3. 添加或编辑变量，名称填写 `GITHUB_TOKEN`，类型选择 **Secret**，值粘贴 PAT。
4. 保存并按界面提示部署生效。不要使用普通 Text 变量存储 PAT。

两种方式任选其一，无需重复配置。

## 4. 验证配置

`/health` 成功或 `secret list` 中出现名称，只能说明服务或配置存在，不能证明 GitHub 权限有效。通过 reconcile 验证仓库读取和 R2 发布。

下面的示例适用于 **Bash**。把地址替换为自己的 Worker HTTPS 地址，然后执行；交互输入的是 **MemHarbor 写令牌 `MEMORY_WRITE_TOKEN`**，不是 GitHub PAT。示例使用标准输入传递鉴权头，避免把令牌值放进命令参数。

```bash
(
  set +x
  MEMORY_BASE_URL='https://<worker-name>.<subdomain>.workers.dev'
  read -r -s -p 'MemHarbor write token: ' MEMORY_WRITE_TOKEN
  printf '\n'
  curl --fail-with-body --silent --show-error \
    "$MEMORY_BASE_URL/api/v1/admin/reconcile" \
    --header @- \
    --header 'Content-Type: application/json' \
    --data '{"all":true}' <<< "Authorization: Bearer $MEMORY_WRITE_TOKEN"
)
```

该操作读取配置的 GitHub 分支，并重建 R2 当前快照，不修改 GitHub 内容。对于已有数据，当前快照会按仓库现状重建；旧对象保留，详见 [发布快照运维](PUBLICATION.md)。

成功响应形如：

```json
{
  "status": "reconciled",
  "git_commit": "<commit-sha>",
  "published": true
}
```

只有 README、没有记忆主题的数据仓库也可以成功发布，主题列表为空属于正常情况。

reconcile **不验证 GitHub 写权限或分支规则**。完整写入验收应在专用测试仓库、测试 Worker 和测试 R2 桶中执行，见 [远程集成验收](../README.zh-CN.md#远程集成验收)。该测试会产生真实提交，即使删除测试主题也会保留历史。

## 5. 常见问题

| 现象 | 检查项 |
| --- | --- |
| MemHarbor 返回 `401` 或 `403` | 请求使用的是 MemHarbor 访问令牌；reconcile 要求写令牌。不要把 GitHub PAT 当作服务访问令牌 |
| `GITHUB_ERROR`，提示未配置凭据 | secret 名称必须为 `GITHUB_TOKEN`；检查 Worker、账号、环境及是否已部署生效 |
| `GITHUB_ERROR`，上游状态为 `401` | PAT 是否过期、被撤销，或粘贴时遗漏字符 |
| `GITHUB_ERROR`，上游状态为 `403` | 仓库权限、组织审批/访问策略或 GitHub API 限流；不要仅凭状态码判断为权限不足 |
| `GITHUB_ERROR`，上游状态为 `404` | `GITHUB_OWNER`、`GITHUB_REPO`、分支是否正确，PAT 是否选中了该私有仓库；GitHub 可能用 404 隐藏无权访问的私有资源 |
| 仓库必须为私有的错误 | 数据仓库不能设为公开，服务源码仓库可以独立开源 |
| reconcile 成功，但更新失败或 `CONFLICT` | 检查 Contents 是否为 Read and write、分支规则是否允许直接提交；也可能是并发提交或旧 revision，应重新读取后重试 |
| `INVALID_CONTENT` | 检查规范 Markdown、YAML、目录和 NFC 格式；不是增加 PAT 权限能够解决的问题 |
| `committed_not_published` | Git 提交已经成功，但快照发布失败；修复原因后 reconcile，不要直接重复创建主题 |

服务会隐藏上游错误正文。排查时可记录错误码、状态码和请求 ID，不要分享令牌、鉴权请求头或私人记忆内容。

## 6. 到期与轮换

1. 在到期前创建新的细粒度 PAT，保持同样的最小仓库授权。
2. 用相同方式更新 Worker 的 `GITHUB_TOKEN`。
3. 验证 reconcile，并在专用测试环境完成需要的写入验收。
4. 验证通过后，在 GitHub 的 Fine-grained tokens 页面撤销旧令牌，并更新密码管理器中的记录。

若令牌已经泄露，立即撤销，然后配置替代令牌；不要等待常规轮换流程。仅删除文档中的令牌不能使已经泄露的值失效。

## 7. 公开文档与配置约定

- 文档统一使用占位符，不写入实际私有数据仓库地址、个人部署域名、账号 ID、webhook ID 或个人主机上的凭据路径。
- PAT、MemHarbor 读写令牌和 webhook secret 分别保存，不能复用；不把 GitHub PAT 分发给 MCP 客户端。
- 本地开发仅使用专用测试凭据，按 `.dev.vars.example` 创建已被 Git 忽略的 `.dev.vars`。生产凭据保存在 Worker secrets 或外部密钥管理器。
- 开源前另行检查部署配置与 Git 历史。本次文档使用占位符，并不代表既有配置或历史提交中的部署标识已被移除；修改当前文件不会改写历史。

## 参考资料

- [GitHub：管理个人访问令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub：创建 Git 引用所需权限](https://docs.github.com/en/rest/git/refs#create-a-reference)
- [GitHub：更新 Git 引用所需权限](https://docs.github.com/en/rest/git/refs#update-a-reference)
- [Cloudflare：Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
