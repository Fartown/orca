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
| 需求     | [跨版本 Wire 夹具兼容](requirements/跨版本Wire夹具兼容.md)      | ready        | REQ-001                                         |
| 交互     | -                                                               | not-required | 开发机与 CI 的历史 checkout 夹具，无产品界面    |
| 调研     | -                                                               | not-required | 现有 `releaseModuleLocation` 已支持唯一同名迁移 |
| 方案     | -                                                               | not-required | 复用现有解析器，不引入新策略                    |
| 测试用例 | [历史协议路径与资源归属](tests/cases/历史协议路径与资源归属.md) | ready        | TC-001～TC-003                                  |

## 2. 决策点记录

### D-001 仅接受唯一迁移位置

- 日期：2026-11-16。
- 背景：历史 release checkout 将终端协议文件从 `src/shared/terminal-stream-protocol.ts` 移至 `src/shared/terminal/stream/terminal-stream-protocol.ts`，固定旧路径校验误拒已有 Wire 夹具。
- 备选项：放宽校验为任意同名文件；复用已有 `releaseModuleLocation` 的唯一同名迁移规则。
- 最终决定：复用已有解析器，仍要求解析后文件真实存在。
- 原因：保留缺失或歧义时的明确拒绝，不改变产品协议与主机连接策略。
- 影响范围：REQ-001、TC-001～TC-003；仅开发机及 CI 测试夹具。

## 3. 开发记录

### 2026-11-16 本地与SSH执行机验收（testing）

- 本轮目标：确认目录兼容修复没有降低版本或放宽协议存在性，解除原 UI PR #111 的历史夹具阻断。
- 完成内容：旧路径与唯一迁移位置可发布，缺失及同名歧义拒绝；v1.4.256 两个历史 suite 真正进入断言并通过。
- 代码或文档变更：源文件在实现冻结后未改；本条补充 REQ-001 的实测状态，维护功能保持独立分支与精确接缝。
- 验证证据：本地 release-checkout、release-module-locations 与两套历史 suite，4文件21/21通过；经已有 root-run 127.0.0.1:2222，在 SSH 测试执行机同一独立工作树运行两个 helper unit，2文件12/12通过。测试基线3de176f4加本轮冻结补丁，原始日志在 `.docs/cross-version-wire-fixture-compat-ui-validation/2026-11-16/evidence/local-fourfiles.log`、`ssh-helper-unit.log` 与 `ssh-executor-info.txt`；用户 SSH 服务不参与测试。
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
