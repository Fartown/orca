---
title: '远程工作区绝对路径打开'
slug: '远程工作区绝对路径打开'
status: implementing
created: 2026-09-11
updated: 2026-09-15
external_ids: []
---

# 远程工作区绝对路径打开 开发 Journal

## 1. 关键文档链接

| 类型     | 文档                                                                                                                 | 状态         | 说明                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| 需求     | [requirements/远程工作区绝对路径打开.md](requirements/远程工作区绝对路径打开.md)                                     | ready        | REQ-301～REQ-306;首轮批注已吸收,未决问题全部关闭                        |
| 交互     | -                                                                                                                    | not-required | 沿用弹窗现有行样式,无新 UI;用户动线在方案 §4.2                          |
| 调研     | [research/标签栏新建Tab弹窗打开文件路径链路调研.md](research/标签栏新建Tab弹窗打开文件路径链路调研.md)               | ready        | 现状链路、本地/远程分流点、其他入口对照与未知项                         |
| 方案     | [solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md](solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md) | approved     | 思路 B:主机策略对象;SSH 放行、runtime 只放行 worktree 内;已吸收首轮批注 |
| 测试用例 | [tests/cases/远程工作区绝对路径打开功能测试.md](tests/cases/远程工作区绝对路径打开功能测试.md)                       | ready        | TC-501～TC-512、TC-517～TC-519 单元规格,TC-513～TC-516 真机规格         |
| 测试记录 | [tests/runs/2026-09-11-本地真机与单元验证.md](tests/runs/2026-09-11-本地真机与单元验证.md)                           | completed    | TC-501～TC-512、TC-516 通过;TC-513～TC-515 因无 Linux SSH 主机 BLOCKED  |

## 2. 决策点记录

### D-005 弹窗不按路径位置拦截，推翻 D-002 与 D-004 的降级形式

- 日期：2026-09-15
- 背景：用户在本地工作区输入 `/Users/bytedance/workspace/forge/tmp/task`，被 D-004 的状态行「该远程工作区只能打开工作区内的文件。」拦下；该状态行只在策略判为 runtime 时出现，而用户机器上 `orca environment list` 为 0 个环境、`orca-data.json` 内无任何 runtime 标记，说明路由报出的环境 id 并不存在
- 最终决定：分类阶段不再比较路径与 worktree 的包含关系；远程 runtime 的 worktree 外路径照发请求，由传输层既有的 fail-closed 返回错误；同时在本功能内按环境目录校验路由给出的环境 id
- 原因：用户 2026-09-15 指示「不要拦任何路径」；且证据表明这条拦截对本地工作区误报，而拦截本身只是把传输层同一条 fail-closed 提前了一步，去掉不放宽任何主机边界
- 影响范围：REQ-306、分类器接缝、主机策略、6 个 locale（`absolutePathOutsideWorkspace` 键删除）

#### 备选项

- 只删拦截，不动归属判定（用户仍打不开：上下文里的环境 id 会让请求发往不存在的 runtime）
- 只修归属判定，保留 worktree 外拦截（不满足「不要拦任何路径」）
- 两者都做

#### 关联文档与需求点

- [需求 REQ-306](requirements/远程工作区绝对路径打开.md)、[测试用例 TC-508、TC-517～TC-519](tests/cases/远程工作区绝对路径打开功能测试.md)

### D-004 runtime worktree 外路径的降级保持状态行形式

- 日期：2026-09-11
- 背景：可选:可点行提交后报错,或与现状一致的不可点状态行
- 最终决定：不可点状态行
- 原因：用户 2026-09-11 批注:原来是啥样就啥样;现状远程封禁即状态行
- 影响范围：REQ-306、方案 §5.6/§5.8

#### 备选项

- 可点行,提交后报错
- 不可点状态行

#### 关联文档与需求点

- [需求 REQ-306](requirements/远程工作区绝对路径打开.md)、[方案 §5.6/§5.8](solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md)

### D-003 不考虑 Windows 远端,远程工作区固定按 POSIX 校验

- 日期：2026-09-11
- 背景：方案初稿设计了按 sshConnectionStates.remotePlatform 与 worktree 路径根形态推断远端平台
- 最终决定：远程一律 POSIX
- 原因：用户 2026-09-11 批注:不管 windows;减少一条依赖和两个用例
- 影响范围：REQ-303、方案 §5.5/§6.2/§6.3

#### 备选项

- 按 remotePlatform 推断并用路径根形态兜底
- 远程一律 POSIX

#### 关联文档与需求点

- [需求 REQ-303](requirements/远程工作区绝对路径打开.md)、[方案 §5.5](solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md)

### D-002 远程 runtime 不新增 RPC,只放行 worktree 内路径

- 日期：2026-09-11
- 背景：runtime 的 files.* RPC 只接受 worktree 相对路径,worktree 外绝对路径无任何方法可 stat
- 最终决定：不新增 RPC,分类阶段降级
- 原因：触及 host 侧安全边界与混版兼容;与主诉求 SSH 无关
- 影响范围：REQ-306、方案 §3.3/§5.6

#### 备选项

- 新增 files.statAbsolute 等 RPC
- 只放行 worktree 内路径,worktree 外分类阶段降级

#### 关联文档与需求点

- [需求 REQ-306](requirements/远程工作区绝对路径打开.md)、[调研 §4.4](research/标签栏新建Tab弹窗打开文件路径链路调研.md)、[方案 §3.3](solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md)

### D-001 采用增量扩展弹窗入口(思路 B)

- 日期：2026-09-11
- 背景：远程工作区绝对路径被 isLocalPathOpenBlocked 整体封禁;直接删守卫会带来平台校验、本地授权污染、缺归属标记、runtime 错误误导四个问题
- 最终决定：采用增量扩展弹窗入口
- 原因：只动登记接缝;复用终端链接入口已有的 SSH 打开契约;错误可回显到弹窗
- 影响范围：REQ-301～REQ-305、方案 §3.3/§5

#### 备选项

- 直接去掉守卫
- 增量扩展弹窗入口,布尔开关升级为主机策略对象
- 弹窗改调终端链接的 openDetectedFilePath

#### 关联文档与需求点

- [需求 REQ-301～REQ-305](requirements/远程工作区绝对路径打开.md)、[调研 §4.6](research/标签栏新建Tab弹窗打开文件路径链路调研.md)、[方案 §3.3](solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md)

## 3. 开发记录

### 2026-09-15 取消按路径位置的拦截并按环境目录校验归属

- 本轮目标：按用户 2026-09-15 的指示，让弹窗不再因为路径位置拒绝任何绝对路径，并修掉把本地工作区判成远程 runtime 的误判。
- 完成内容：删除分类器里的 `absolutePathScope` 预判与其文案键；主机策略改为要求路由给出的 runtime 环境 id 出现在已加载的环境目录中，目录未加载时维持封禁；新增 `toTabEntryAbsolutePathOperationContext`，把文件操作上下文的环境 id 对齐到判定出的主机，避免请求发往不存在的 runtime；`openTabBarEntry` 改用对齐后的上下文。
- 代码或文档变更：`src/renderer/src/components/tab-entry-remote-path/absolute-path-host-policy.ts` 与其测试；`src/renderer/src/components/tab-bar/` 下 `tab-create-entry-classifier.ts`、`tab-create-entry-action.ts`、`TabBarCreateEntry.tsx` 及两个测试；6 个 locale 删除 `absolutePathOutsideWorkspace`；`config/fork-features.jsonc` 的 goal、classifier 与两个 locale seam、`dependsOn` 增加 `runtime-file-client.ts`；本 issue 的 REQ-306、TC-508、新增 TC-517～TC-519 与决策点 D-005。
- 验证证据：单元 63 文件 529 用例通过；真机 TC-520 通过——worktree 外的绝对路径在弹窗里得到可点的 `Open file` 行并成功打开，两条旧状态行文案均未出现。证据在 `.docs/absolute-path-any-ui-validation/2026-09-15/evidence/`。`pnpm tc`、`oxlint`、三项 `verify:localization-*`、`check:architecture-policies`、`check:fork-features`、`check:fork-docs` 通过；`check:code-quality:changed` 为 319 项，与分支基线逐项相同，未新增。
- 未解决问题：把本地工作区判成远程 runtime 的上游成因未定位。可复现的事实是环境目录为空而路由仍给出环境 id，嫌疑在 `resolveActiveWorkspaceRoute` 对活跃工作区直接采信 `activeWorkspaceExecutionHostId`、不校验该环境是否存在；本轮只在本功能内按目录校验规避，未改上游路由。
- 下一步：提 PR 合回 `fork/integration`。

### 2026-09-11 合入 fork/integration

- 本轮目标：把功能合回集成分支并收口本需求。
- 完成内容：PR [Fartown/orca#7](https://github.com/Fartown/orca/pull/7) 合并，合并提交 `7074bdc10`。合并前先把分支更新到当时的 `fork/integration`（会话命名与自托管产物两个 PR 已先合入），两处冲突按保留双方处理：`config/architecture-policies.jsonc` 同时保留 session-names 与本功能的策略对象，`docs/issue/README.md` 由 `pnpm generate:issue-index` 重新生成。
- 代码或文档变更：无新增功能代码；仅合并解冲突与本条记录。
- 验证证据：PR CI 16 项检查全部通过、0 项失败（typecheck、static analysis、8 个单测分片、macOS 与 Windows 打包、verify、root directory guard、test vs non-test LoC），其余项按路径过滤跳过；合并后本地复验 `pnpm tc` 通过、目标测试 62 文件 514 用例通过、`check:fork-features` 与 `check:fork-docs` 通过（识别 5 个功能）。
- 未解决问题：REQ-305（主机漂移时拒绝）仍只有单元证据，真机未构造该场景；`check:architecture-policies` 余 1 条越界位于 `src/main/orcad/orcad-entry.ts`，属基线既有项，本功能未触碰。
- 下一步：无。功能分支与其 worktree 在合并后清理；真机验证夹具保留在主 worktree 的 `.docs/remote-workspace-absolute-path-open-ui-validation/2026-09-11/`。

### 2026-09-11 真机验证全部通过

- 本轮目标：按方案 §6.3 在真实应用里验收 TC-513～TC-516。
- 完成内容：搭建真机验证夹具（Playwright 驱动真实 omnibox，SSH 主机为本机 loopback 上 root 运行的 sshd，用一次性密钥登录、跑完撤销），TC-513～TC-516 四条全部通过。期间两次误判已定位并还原：把非特权 sshd 起不来 relay 误判为「macOS 不能当 SSH 主机」，以及把脚手架未等弹窗卸载误判为主机策略缺陷（据此改写的实现已完整还原，被删的 selector 记忆化测试已恢复）。
- 代码或文档变更：`.docs/remote-workspace-absolute-path-open-ui-validation/2026-09-11/**`（夹具、脚本、证据）；`docs/issue/远程工作区绝对路径打开/tests/{cases,runs}/**`；三个 omnibox UI 测试改为 mock 新 hook，并登记进 `fork-features.jsonc` 的 tests 与两处架构白名单；需求 REQ 状态按实际证据更新。
- 验证证据：单元 62 文件 513 用例通过；端到端 4 条用例通过，`validation.log` 与截图在 `.docs/remote-workspace-absolute-path-open-ui-validation/2026-09-11/evidence/`；关键断言为 SSH worktree 外文件带 `externalSshTargetId`、worktree 内为相对路径、缺失路径回显 `File not found`。`pnpm tc`、oxlint/oxfmt、三项 `verify:localization-*`、`check:fork-features`、`check:fork-docs`、`check:code-quality:changed` 通过；`check:architecture-policies` 剩余 4 条越界来自基线 `f9f4855e7`，本分支未触碰。
- 未解决问题：无。对本机的临时改动（authorized_keys 一行、relay 部署）已全部回收并核对。
- 下一步：提交并提 PR 合回 `fork/integration`。

### 2026-09-11 实现主机策略模块与弹窗接缝

- 本轮目标：SSH 工作区在弹窗输入绝对路径可在远端打开；runtime 只放行 worktree 内；本地不变。
- 完成内容：新增 `tab-entry-remote-path/absolute-path-host-policy.ts` 与 `use-tab-entry-absolute-path-context.ts`；改造 4 个 tab-bar 接缝与 6 个 locale；登记 fork-features 条目、架构策略与仓库 ignore 例外；新增测试规格 TC-501～TC-516。
- 代码或文档变更：`src/renderer/src/components/tab-entry-remote-path/**`；`src/renderer/src/components/tab-bar/` 下 `tab-create-entry-action.ts`、`tab-create-entry-classifier.ts`、`tab-create-entry-absolute-file.ts`、`TabBarCreateEntry.tsx` 及两个测试；`src/renderer/src/i18n/locales/*.json`；`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、仓库 ignore 规则；本 issue 的需求状态、方案状态与测试规格。
- 验证证据：vitest 8 个文件 136 用例通过；`pnpm tc` 通过；oxlint/oxfmt 通过；4 个 `verify:localization-*` 通过；max-lines ratchet 通过；`check:fork-features` 通过。
- 未解决问题：真机验证 TC-513～TC-516 未执行（dev 配置目录 `orca-dev` 没有 SSH 目标；验证需按 `.docs/goal-ui-validation/2026-09-06/README.md` 的做法打包并重装 `Orca (local)`，重装前需用户确认）；`check:architecture-policies` 在本分支报出 4 条既有越界，均来自 `fork/integration` 已合入的 `f9f4855e7`（claude-owner-window：`src/shared/agent-hook-listener/*`、`src/main/orcad/orcad-entry.ts`），与本功能无关，本分支未触碰这些文件。
- 下一步：真机验证并记录 `tests/runs/`；提 PR 合回 `fork/integration`。

### 2026-09-11 登记需求并归档调研与方案

- 本轮目标：按 docs/issue 流程管理本需求，吸收首轮方案批注。
- 完成内容：创建 Journal 与主需求（REQ-301～REQ-306）；迁入调研文档；方案改为远程固定 POSIX、关闭 Q1～Q4 并迁入 `solutions/`。
- 代码或文档变更：`docs/issue/远程工作区绝对路径打开/**`。
- 验证证据：`validate_task.py` 结构校验通过；codebase-research 文档校验脚本通过；未运行代码测试。
- 未解决问题：无。
- 下一步：用户二次确认方案后登记 `config/fork-features.jsonc` 条目与策略白名单，进入实现；实现时补 `tests/cases`（TC-501 起）。
