---
title: 集成分支自动出包
slug: 集成分支自动出包
status: testing
created: 2026-09-12
updated: 2026-09-12
external_ids: []
---

# 集成分支自动出包 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [集成分支自动出包](requirements/集成分支自动出包.md) | ready | 已确认范围与内测安装边界 |
| 交互 | - | not-required | 无应用 UI 变更 |
| 调研 | - | not-required | 直接核实既有构建入口 |
| 方案 | - | not-required | 小范围自动化，取舍见 D-001 |
| 测试用例 | [自动出包](tests/cases/自动出包.md) | ready | 按仓库完成门禁建立 |
| 测试记录 | [本地验证](tests/runs/2026-09-12-local.md) | completed | 13 条合同测试，云构建尚未执行 |

## 2. 决策点记录

### D-001 2026-09-12：独立 fork 内测发布

- 背景：macOS 既有流程限定上游且依赖 Apple 凭据；Android 只在标签或手动触发。
- 备选项：改上游正式发布；新增薄层工作流复用构建。
- 最终决定：采用独立工作流，同 SHA 并行构建，全部成功后成套发布。
- 原因：用户已同意先出未公证内测包；保持上游发布接缝为零。
- 影响范围：REQ-401、REQ-402、REQ-403；APK 沿用 Expo debug 签名并核验指纹，不生成密钥或暗改 versionCode。

## 3. 开发记录

### 2026-09-12：修复真实 PR 打包签名

- 本轮目标：让 PR 验证与 integration 发布使用同样的 ad-hoc 签名。
- 完成内容：GitHub arm64 实构建完成 DMG 后，验签抓到 electron-builder 默认跳过 PR 签名；允许 PR 的显式 ad-hoc 签名，不引入 Apple 凭据、不删除验签检查。
- 代码或文档变更：工作流与合同断言；同时保留原 App 更新元数据，仅禁止 electron-builder 发布及 updater feed 上传。
- 验证证据：[首次云构建](https://github.com/Fartown/orca/actions/runs/34695523934)，arm64 job 日志明确显示 PR signing skipped，随后 codesign 验证失败。
- 未解决问题：修正后的云构建待执行；Android 首轮仍在编译。
- 下一步：提交修复，在原 PR 复跑。

### 2026-09-12：实现并开始验证

- 本轮目标：同源并行出包，成功后发布。
- 完成内容：新增 workflow、构建身份、macOS 薄配置、APK 指纹核验及先草稿后公开的发布器。
- 代码或文档变更：全部实现位于功能自有路径，没有修改上游构建入口或移动端源码。
- 验证证据：[本地验证](tests/runs/2026-09-12-local.md)，13/13 合同测试通过；Expo prebuild 成功。
- 未解决问题：真实 GitHub 构建、发布待执行；手机签名未知。
- 下一步：运行仓库门禁，提交 PR 并验证真实云出包。

### 2026-09-12：开始实施

- 本轮目标：接通 GitHub 集成分支自动出包。
- 完成内容：核实现有工作流、签名和版本规则，创建独立 worktree。
- 代码或文档变更：登记功能、范围及需求。
- 验证证据：macOS 正式环境校验要求 Apple 凭据；Expo SDK 55 release 模板使用 debug 签名；新流程尚未执行。
- 未解决问题：真实云构建尚未验证，用户手机现有签名未知。
- 下一步：实现、定向测试和 GitHub 实构建。
