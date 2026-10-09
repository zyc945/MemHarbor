# 操作意图到实际能力

优先实际可用的 MemHarbor 语义工具，按 schema 匹配，不硬编码宿主前缀。工具存在不代表有写权限。没有语义工具时才按能力选择 T0-MCP 文件工具或 T0-Git；鉴权、权限、网络、发布或可选索引错误不授权绕过已配置服务写 Git。

| 意图 | T1/T2 | T0 |
| --- | --- | --- |
| 发现目录 | list_memories(path_prefix)，翻完 next_cursor 才称完整 | 枚举目录/树；不能枚举时用有标记的 INDEX.md 并说明局限 |
| 定位路径 | resolve_memory 得 UUID，再读 | 精确路径读取 CONTEXT 并核对 path |
| 查找内容 | search_memories 默认元数据；增强能力见下 | 按宿主实际搜索范围说明，不冒称同等正文检索 |
| 读取 | load_context 按 mode，或 read_memory_file | 固定提交读取需要的文件 |
| 新建 | create_memory.files；CONTEXT 只传正文，由服务生成 YAML/标题 | 核实无同主题；按共用契约建身份，文件及已启用清单一次提交 |
| 更新 | checkpoint_memory(expected_commit)，单文件也可 update_memory(expected_revision) | 单文件 SHA 条件写；多文件含清单须同 commit |
| 移动 | move_memory(expected_commit)，只动直属五文件 | T0-Git 可单提交改 path 和直属文件/清单；T0-MCP 缺原子删除能力时不提供 |
| 删除 | T2 REST DELETE 带 expected_commit；stdio 无此工具 | T0-Git 明确预览直属文件、子主题和附件，保留未授权部分；T0-MCP 无完整原子能力时拒绝 |

T0-MCP 多文件工具没有基线条件时，须有外部单写者保证；写前回读不消除竞态。条件不成立则停止该写入，建议使用 T0-Git/T1。T0-Git 固定读取提交，只提交目标文件；同步到已授权远端时仅非强制 push，脏工作副本不盲目 pull，分叉不自动合并。每次逻辑写入一次提交。明确独立的本地 vault 可以没有远端，此时回读本地提交并报告“仅保存在本机，未同步”，不擅自添加远端。结果未知先查实际提交及已配置远端，不重建不同名字的主题。

## 搜索和上下文

先查看实际 tool schema。旧服务不支持增强参数时使用原请求；增强服务的 search 只有显式 scope=metadata/content/all 才启用 status/path_prefix/include_archived。include_archived 默认 true；当前任务可显式 false，追溯历史保留归档。scope=metadata 不依赖正文索引；content/all 还需部署启用并建好对应快照索引。

核对响应 search_scope。缺少它不能把旧服务忽略参数当作增强搜索成功。索引未启用、缺失、损坏或超额时报 PUBLISH_ERROR 的 search_index 组件原因；可说明范围后另查元数据，不当作真空结果，也不宣称 Git 写入失败。保留原查询与筛选分页；搜索片段只定位 file/heading/lines/revision，后续完整读取若版本变化须重新核对。

采用迭代导航：先按关键词搜索或按路径列目录，读取相关候选，再依据证据细化查询；已有确切路径时 resolve 比猜关键词更直接。正文搜索不是语义推理。

按 mode 读取最小需要范围：default=CONTEXT+STATE，decision 加 DECISIONS，planning 加 TODO，evidence 加 SOURCES，full 为五文件。精简主题遇到明确 NOT_FOUND 时逐文件回退，只跳过确实缺失的可选文件；版本不一致要重读，不能吞掉权限、网络或发布错误。

max_bytes 只用于只读节选，核对 sections/coverage、partial 与完整文件入口；返回 files 的旧服务没有执行预算。预算按 UTF-8 字节计，不是 token；full 与预算不能同传。写入前读完整文件和版本，同提交基线，不用节选拼成完整替换。

## 验证、引用与纠错

重要决策使用记忆前核对当前引用、版本、环境；来源不可达不是错误，引用丢失不是事实被否定。只读核验不写入；已有保存授权不重复询问。只展开当前问题直接相关的一跳，默认最多 3 个目标，按 UUID（T0 为规范路径）去重，不递归，不承诺完整关联发现或跨主题快照。

服务写入检查 isError、业务 status、published；committed_not_published 是 Git 已提交，需操作者 reconcile，不重发 create。T0 检查本地提交并回读；仅在授权同步时另查非强制推送结果，无远端时报告仅保存在本机。未知结果不能冒称完成。归档不隔离，Git 历史及旧快照仍可能保留删除内容；没有自动反向引用或级联修复。

来源纠错须显式限定范围，按来源编号及定位核查受影响结论，再逐主题正向修正并保留后续有效内容。报告未覆盖区域；不 reset/强推/回填旧指针，不承诺完整污染清除。来源描述不是已认证作者身份。
