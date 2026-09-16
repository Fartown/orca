---
title: "远程主机绝对路径打开"
slug: "远程主机绝对路径打开"
status: testing
created: 2026-09-16
updated: 2026-09-16
external_ids: []
---

# 远程主机绝对路径打开 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/远程主机绝对路径打开.md](requirements/远程主机绝对路径打开.md) | ready | REQ-801～REQ-805 |
| 交互 | - | not-required | 无新 UI；成功路径就是文件正常打开 |
| 调研 | - | not-required | 主机既有 grant 机制的盘点写在 D-302 |
| 方案 | - | not-required | 要点记在 D-301、D-302 |
| 测试用例 | [tests/cases/远程主机绝对路径打开功能测试.md](tests/cases/远程主机绝对路径打开功能测试.md) | ready | TC-801 真机，TC-802～TC-810 单元 |
| 测试记录 | [tests/runs/2026-09-16-配对真机与单元验证.md](tests/runs/2026-09-16-配对真机与单元验证.md) | completed | TC-801 真机通过并带反向对照 |

## 2. 决策点记录

### D-302 复用主机既有的 grant 机制，不新造一套授权

- 日期：2026-09-16
- 背景：主机已有 `absolute-file` grant（`grantId` + TTL + 客户端绑定 + 读写 RPC），由终端链接与 native-chat 使用；缺的只是"肯为无出处的路径发放"与"桌面客户端会消费"
- 最终决定：新增一个只负责发放的 RPC，读写沿用 `files.*TerminalArtifact`
- 原因：撤销、过期、客户端绑定、硬链接与规范化检查全都现成；另造一套等于把这些护栏重写一遍并重新犯错
- 影响范围：REQ-801～REQ-805

#### 备选项

- 给 `files.read`/`files.write` 增加可选的绝对路径入参
- 新造一套独立的主机路径授权
- 复用既有 grant，只新增发放入口

#### 关联文档与需求点

- [需求 REQ-801](requirements/远程主机绝对路径打开.md)

### D-301 放开到整台主机，不限 provenance

- 日期：2026-09-15
- 背景：主机既有 grant 只发给"有出处"的路径（本终端打印过、native-chat 产出），且终端产物还限定在 /tmp 根下。用户实际要打开的是另一个已知工作区里的文件，走既有的 `crossWorkspace` 改投即可覆盖，无需扩大暴露面
- 最终决定：仍然放开到整台主机
- 原因：已把"既有机制足以覆盖你这次的路径"与"放开等于任何配对客户端可读写本机任意文件"两条摆明后，用户重申按最宽的做
- 影响范围：REQ-801、REQ-802，以及 13 处上游接缝带来的长期同步成本

#### 备选项

- 只走既有的 crossWorkspace 改投
- 白名单若干目录
- 放开整台主机

#### 关联文档与需求点

- [需求 REQ-801](requirements/远程主机绝对路径打开.md)、[docs/reference/ssh-execution-boundary.md](../../reference/ssh-execution-boundary.md)

## 3. 开发记录

### 2026-09-16 把上游接缝压成一行调用

- 本轮目标：降低这个功能长期的上游同步成本。
- 完成内容：13 处接缝里有 5 处是"往上游函数体里插一段逻辑"，是冲突真正会疼的地方。新增 `src/renderer/src/runtime-host-path/host-path-grant-seams.ts`，把这几段逻辑搬进功能自有目录，上游文件里只留一行调用：读 `readHostPathFileForTab`、写 `writeHostPathFileForTab`、弹窗 `resolveAbsoluteTabEntryReach`。
- 代码或文档变更：新增 seams 模块；`runtime-file-read-client.ts`、`runtime-file-mutation-client.ts`、`tab-create-entry-absolute-file.ts` 相应缩减；`fork-features.jsonc` 的 `mustContain` 改指新函数名，`requiredFiles` 与 `dependsOn` 补齐。
- 验证证据：三处接缝的新增行数 13→10、26→7、36→21，结构性改动合计 75→38 行；单元 284 文件 2027 条通过；真机 TC-801 重跑通过（`1 of 1`，标签页仍持有 grant）。`pnpm tc`、`oxlint`、`check:fork-features`、`check:code-quality:changed`(319，与基线同)通过。
- 未解决问题：`check:architecture-policies` 报 1 条 `src/main/runtime/rpc/errors.ts` 的 reference-drift。已在**一行未改**的 `fork/integration` 上复现，成因是 `origin/main` 前进而集成分支尚未同步，与本分支无关，下次 `pnpm sync:upstream` 后消失。
- 下一步：与其余 PR 一起合回 `fork/integration`。

### 2026-09-16 主机发放与客户端消费打通

- 本轮目标：配对客户端能打开主机上 worktree 之外的绝对路径。
- 完成内容：主机新增 `files.grantHostPath` 与策略模块 `src/main/remote-host-path-grant/`；客户端新增 `src/renderer/src/runtime-host-path/`（申请、读、写、过期换发）；`RuntimeFileOperationArgs`、`OpenFile`、编辑器上下文与内容加载器接上 grant；弹窗在 worktree 外改为申请 grant。同时把 2026-09-15 那轮里前提被证伪的"按环境目录校验"一段撤除，只保留"不按路径位置拦截"。
- 代码或文档变更：见 `config/fork-features.jsonc` 的 `remote-host-path-open` 条目（2 个自有目录 + 13 处接缝）；本 issue 全部文档。
- 验证证据：单元 `src/main/remote-host-path-grant` 6 条、`src/renderer/src/runtime-host-path` 10 条、`src/renderer/src/components/tab-bar` 542 条通过；真机 TC-801 通过并带反向对照（摘掉主机 RPC 后同一条用例失败）。`pnpm tc` 通过。
- 未解决问题：保存与 grant 过期只有单测证据，真机未构造；本功能引入 13 处上游接缝，后续 `pnpm sync:upstream` 的冲突面相应变大。
- 下一步：跑完其余门禁，与其他 PR 一起合回 `fork/integration`。

### 2026-09-16 真机暴露的两个实现缺陷

- 本轮目标：记录真机 UI 测试抓到而单测抓不到的两处。
- 完成内容：其一，主机铸造 grant 时没有规范化路径，macOS 上 `/var/...` 与 `/private/var/...` 的差异触发主机自身的 `terminal_file_grant_stale`；改为铸造前规范化，标签页也随之改用主机规范化后的路径命名。其二，编辑器内容加载器有一条既有拒绝「远程工作区不支持外部本地文件」，其前提正是本功能消除的限制，带 grant 的标签页需要豁免。
- 代码或文档变更：`runtime-file-commands-resolve-allowed-terminal-artifact-path.ts`、`tab-create-entry-absolute-file.ts`、`useEditorPanelFileContentLoader.ts`。
- 验证证据：两处修正前后各有一次真机运行，截图在 `.docs/remote-host-path-open-ui-validation/2026-09-16/evidence/`。
- 未解决问题：无。
- 下一步：无。这条记录用于说明为什么这个功能必须有真机验证——两处都通不过单测的自造替身。
