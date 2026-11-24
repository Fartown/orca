---
title: 跨版本 Wire 夹具兼容
document_type: journal
status: testing
external_ids: ['Fartown/orca#115']
created: 2026-11-16
updated: 2026-11-16
---

# 跨版本 Wire 夹具兼容

## 1. 关键文档链接

| 类型     | 文档                                                            | 状态         | 说明                                            |
| -------- | --------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| 需求     | [跨版本 Wire 夹具兼容](requirements/跨版本Wire夹具兼容.md)      | ready        | REQ-001、REQ-002                                |
| 交互     | -                                                               | not-required | 开发机与 CI 的历史 checkout 夹具，无产品界面    |
| 调研     | -                                                               | not-required | 现有 `releaseModuleLocation` 已支持唯一同名迁移 |
| 方案     | -                                                               | not-required | 复用现有解析器，不引入新策略                    |
| 测试用例 | [历史协议路径与资源归属](tests/cases/历史协议路径与资源归属.md) | ready        | TC-001～TC-006                                  |

## 2. 决策点记录

### D-001 仅接受唯一迁移位置

- 日期：2026-11-16。
- 背景：历史 release checkout 将终端协议文件从 `src/shared/terminal-stream-protocol.ts` 移至 `src/shared/terminal/stream/terminal-stream-protocol.ts`，固定旧路径校验误拒已有 Wire 夹具。
- 备选项：放宽校验为任意同名文件；复用已有 `releaseModuleLocation` 的唯一同名迁移规则。
- 最终决定：复用已有解析器，仍要求解析后文件真实存在。
- 原因：保留缺失或歧义时的明确拒绝，不改变产品协议与主机连接策略。
- 影响范围：REQ-001、TC-001～TC-003；仅开发机及 CI 测试夹具。

### D-002 默认标签按 fork 同步快照筛选

- 日期：2026-11-16。
- 背景：本地默认使用全局 v1.4.256；CI 已按 `HEAD` 与 `origin/main` merge-base 的提交时间过滤晚发标签，当前 fork 快照对应的最新稳定标签为 v1.4.246。
- 备选项：使用 `--merged HEAD`；仅在 CI 删除标签；本地和 CI 共用快照候选规则。
- 最终决定：选择第三项；fork 以已配置 remote 身份识别，候选依据 tag `creatordate <= snapshot`，显式版本直通；上游仍用全局最新。
- 原因：固定 writer v1.4.245、v1.4.244、v1.4.219 早于快照但不一定是 HEAD 祖先；只在 CI 删除标签不能修复本地默认选择。
- 影响范围：REQ-002、TC-004～TC-006；只读取测试执行机 Git 元数据，不改变连接策略或用户 SSH 服务。

## 3. 开发记录

### 2026-11-21 上游同步到 fa60d0a566（testing）

- 本轮目标：`fork/integration` 从 `e723de1bfd` 合入上游到 `fa60d0a566`（四次合并：`22afb84f6a`、`9c3b42f644`、`d725f407e8`、`31df22fb1a`，冲突都在第一次），保持跨版本 wire 夹具只接受唯一迁移位置（D-001）与按同步快照筛选基准标签（D-002）。
- 完成内容：本功能 4 个冲突（全是 UU）。上游把发布检出代码搬到 `tests/e2e/cross-version-wire/release-checkouts/`，并在 `release-checkout-publication.ts` 引入自己的 `releaseModuleLocation`，取代了 fork 在这里的补丁，这条接缝退役；`release-checkout.ts`、`release-checkout.unit.test.ts` 以上游为底重放 fork 的唯一位置判定，单测「两个候选位置时报歧义」的夹具从 `[MOVED, older]` 改为 `[SHIPPED, older]`（合并报告没写原因，见未解决问题）；`check-daemon-protocol-crossing.mjs` 随上游搬到 `config/scripts/daemon-protocol/admission/` 后重放。checks 原来跑的 `release-module-locations.unit.test.ts` 被上游删除（#37814）。
- 代码或文档变更：`config/fork-features.jsonc` 接缝 5→4 条（3 条换路径、退役 `release-checkout-publication.ts`）；`tests` 与 checks 换新路径并去掉已删测试；`dependsOn` 2 条换路径（`stable-release-tags.mjs` 到 `config/scripts/release/versioning/`，`release-module-locations.ts` 到 `release-checkouts/`）。合并后没有本功能的单独修复提交。新棘轮基线未登记本功能条目。
- 验证证据：登记 checks 3 文件 16 项通过（`/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/sync-checks-run3.log`）；冲突解法见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/report-F-builds-plugins-goals.md`、`phase2-F.tsv`；最终门禁见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/final-gates.log`。真机抽查（`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/README.md`）未覆盖本功能；本机与 SSH 执行机上的历史版本实测都没有在同步后重跑。
- 未解决问题：上游 `releaseModuleLocation` 取代 fork 补丁后，D-001 的「只接受唯一迁移位置」在发布检出这一层改由上游实现承担，没有用真实历史版本复测；歧义夹具改用 `SHIPPED_TERMINAL_PROTOCOL` 的原因未记录，需确认没有放宽断言。
- 下一步：下次跑跨版本 e2e 时确认历史版本检出仍只认唯一迁移位置。

### 2026-11-16 快照规则与历史版本复测（testing）

- 本轮目标：使本地与CI默认版本方向一致，并保留显式v1.4.256协议迁移覆盖，解除原UI PR #111的门禁阻断。
- 完成内容：本地与SSH执行机默认baseline和daemon均为v1.4.246，recent为v1.4.246/v1.4.245/v1.4.244；原五个稳定失败在默认完整目录中通过，未修改原断言、固定writer或CI流程。
- 代码或文档变更：REQ-002实现冻结；本条更新需求事实与本地/SSH执行证据。正式提交前生成并格式化索引，产品代码不在本维护分支中改动。
- 验证证据：基于eb3b0a3f加冻结补丁，本地登记检查4文件33/33；不设override的完整跨版本目录52文件226/226；显式v1.4.256的cross-version-web-device-key与preflight-workspace-scoped-downgrade两文件9/9。经已有root-run 127.0.0.1:2222，同工作树SSH执行机登记检查33/33、显式v1.4.256历史suite9/9；本地Node24.22.2、SSH Node24.16.0分别记录，不混作同一环境。证据在`.docs/cross-version-wire-fixture-compat-ui-validation/2026-11-16/evidence/req002/`，含Git diff及新文件内容指纹、执行机元数据、默认版本JSON与原始日志。
- 未解决问题：最终冻结提交的check:changed与CI待完成；专用SSH公钥及密钥由交付执行者按指纹精确撤销，不停止共享sshd。
- 下一步：提交维护修复后跑最终门禁，关联Fixes #115开PR；CI全绿后合入，再合基线进UI分支，完成#111最终检查与合入。

### 2026-11-16 同步快照基线整改（implementing）

- 本轮目标：让本地与 CI 的默认跨版本候选遵守同一 fork 同步快照规则，保留较新版本显式验收。
- 完成内容：确认 CI 已按 `git merge-base HEAD origin/main` 的提交时间删除晚发标签；新增 REQ-002 与 TC-004～TC-006，限定 fork 与上游默认行为、候选不足和显式 override。
- 代码或文档变更：需求、决策、用例；feature-owned 候选解析、checkout 与 daemon 默认选择接缝、精确注册和注入 Git 来源的单测。CI 原有 fetch 和删除标签步骤不变。
- 验证证据：原四个升级失败只见 withdrawn 卡差异，一个降级失败为 format 3/marker 6 不被 format 2/5 读取；当前仅归因为默认误选 v1.4.256，整改后的本地/SSH 和两套 cross-version 结果待执行。
- 未解决问题：新候选规则的本地/SSH 回归未执行；保留 REQ-001 对 v1.4.256 的显式兼容验收，不把较新版本失败改记通过。
- 下一步：由唯一测试执行者验证默认 v1.4.246 的全目录 cross-version suite，以及显式 v1.4.256 的两套历史 suite。

### 2026-11-16 本地与SSH执行机验收（testing）

- 本轮目标：确认目录兼容修复没有降低版本或放宽协议存在性，解除原 UI PR #111 的历史夹具阻断。
- 完成内容：旧路径与唯一迁移位置可发布，缺失及同名歧义拒绝；v1.4.256 两个历史 suite 真正进入断言并通过。
- 代码或文档变更：源文件在实现冻结后未改；本条补充 REQ-001 的实测状态，维护功能保持独立分支与精确接缝。
- 验证证据：本地 `release-checkout.unit.test.ts`、`release-module-locations.unit.test.ts`、`cross-version-web-device-key.unit.test.ts`、`preflight-workspace-scoped-downgrade.unit.test.ts`，4文件21/21通过；经已有 root-run 127.0.0.1:2222，在 SSH 测试执行机同一独立工作树运行两个 helper unit，2文件12/12通过。测试基线3de176f4加本轮冻结补丁，原始日志在 `.docs/cross-version-wire-fixture-compat-ui-validation/2026-11-16/evidence/local-fourfiles.log`、`ssh-helper-unit.log` 与 `ssh-executor-info.txt`；用户 SSH 服务不参与测试。
- 未解决问题：该维护 PR 最终检查与 CI 待完成；临时 SSH 公钥由交付执行者按精确 tag 撤销，不能停止共享 sshd 或删除共享历史 checkout 缓存。
- 下一步：生成索引、提交维护修复，最后运行 check:changed 并开关联 #115 的 PR；CI 全绿后合入，再将该基线合入原 UI 分支，复测原两套失败 suite 后完成 #111。

### 2026-11-16 路径兼容实现（implementing）

- 本轮目标：让 v1.4.256 的迁移后终端协议路径通过发布校验，保留缺失和歧义拒绝。
- 完成内容：发布校验复用 `releaseModuleLocation` 定位同一 `src/shared` 根目录内的唯一同名文件；单测覆盖旧路径、唯一迁移路径、缺失与歧义。
- 代码或文档变更：两个 cross-version Wire 上游测试文件的精确接缝、feature 注册、独立范围与预算、需求和用例；生成需求索引。
- 验证证据：`pnpm tc`、定向 oxlint、`pnpm check:fork-features`、`pnpm check:fork-docs`、`pnpm check:architecture-policies` 通过；实际单测和两个历史 suite 尚待唯一测试执行者运行。
- 未解决问题：历史 v1.4.256 两套 suite、本地与 SSH 执行机验收尚无修复后结果；不声明通过。
- 下一步：执行定向单测与两个历史 suite，并记录本地/SSH 执行机及 checkout commit。

### 2026-11-16 登记（implementing）

- 本轮目标：修复 Issue #115 的历史跨版本 Wire checkout 路径误拒。
- 完成内容：登记独立维护 feature、精确上游接缝、需求和本地/SSH 资源归属用例。
- 代码或文档变更：feature 注册、独立变更范围、集成预算、文档跟踪和 `.gitignore` 白名单。
- 验证证据：当前仅完成登记；实现、单测和两个历史 suite 由后续执行记录裁决。
- 未解决问题：v1.4.256 两个失败 suite 尚未在修复版本复跑。
- 下一步：复用现有迁移解析器实现发布校验，执行本地/SSH 单测及两套历史 suite。
