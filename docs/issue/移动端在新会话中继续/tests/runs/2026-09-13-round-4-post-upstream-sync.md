---
title: "2026-09-13 第四轮：上游同步后的复验"
document_type: test-run
status: completed
created: 2026-09-13
updated: 2026-09-13
---

# 2026-09-13 第四轮：上游同步后的复验

## 1. 执行信息

- 执行时间：2026-09-13 23:00–23:25。
- 目的：确认与上游同步（`fork/integration` 前进 196 个提交）后，四处冲突解法与投递迁到 typed RPC operation 都没有问题。
- 测试环境：云真机小米 15；**dev client 重新构建并安装**（合并引入新原生模块，见下）；Metro 清缓存重启；主机为隔离 profile 的真实 Orca runtime（`PORT=6773`）加真 claude 会话。
- 代码版本：`feat/mobile-session-continuation` @ 合并 `fork/integration` 之后。
- 执行人：zhangchao.zc。

## 2. 执行结果

### 2.1 四处冲突解法

| 冲突 | 验证方式 | 结论 |
| --- | --- | --- |
| `mobile/app.config.js` | 实际求值四种 env 组合 | PASS。默认：development + versionCode 16；`ORCA_IOS_APS_ENVIRONMENT=production`：entitlement 与 plugin mode 同步变 production；`ORCA_INTEGRATION_VERSION_CODE=12345`：versionCode 生效且不影响 entitlement；两者同时：都生效。`name`/`slug` 等基础字段在四种情况下均保留 |
| `package.json` 的 `lint` | 解析脚本引用并与上游比对 | PASS。引用 17 个脚本全部存在；fork 三道门禁与上游新增的 `check:readme-local-links` 都在；上游 `lint` 里没有任何一项在合并中丢失 |
| `server-status-update.ts` | 分别删掉两行跑测试反证覆盖 | PASS。删 `commitStatusRowMutation` → agent-hooks 套件 1 条红；删 `recordClaudeSessionActivity` → 该套件全绿但 `pnpm tc` 红（未用导入）；连 import 一起删 → `check:fork-features` 红。每种丢失方式都有门禁拦截 |
| `worktree-switch-first-paint.spec.ts` | Playwright `--list` 解析 + 内容检查 | PASS。spec 可被解析并列出 1 条用例；上游的 `ORCA_BACKGROUND_LAUNCH` skip 守卫在位；fork 侧的截图留存改动（3 处 `screenshot` 引用）存活 |

### 2.2 投递迁到 typed RPC operation

| 项 | 结果 |
| --- | --- |
| 真机端到端（focused 模式，真 claude 源会话） | PASS。新会话创建、自动切换、实时渲染、agent 按 prompt 正确行事 |
| prompt 与共享内核逐字一致 | PASS，**1506 / 1506** |
| `[terminal-webview] engine error` | 0 次 |
| `scrollback DROPPED` / `data DROPPED` | 0 次 |
| 七种 outcome 的映射 | PASS。单测在 `sendRequest`（传输端口）层造假，`runRpcOperation` 的解码、acceptance 策略与 null/throw 映射都真实执行；create-failed / created-without-handle / delivered / no-context / not-ready / send-rejected / unknown 全部覆盖且断言未改动即通过 |

### 2.3 合并暴露的新问题

上游 #20068 引入了新原生模块 `expo-task-manager ~55.0.20`。真机上原有的 dev client 是合并前构建的，加载新 bundle 时直接崩在 `Cannot find native module 'ExpoTaskManager'`（白屏）。

处置：`npx expo prebuild --platform android` 后重新构建 arm64 debug 包（83 MB）并安装，之后一切正常，并出现上游新增的通知授权引导页。

**这是纯真机问题：typecheck 与全部单测都不会暴露它。** 后续同步只要 `mobile/package.json` 动了原生依赖，真机验证前就必须重建 dev client。

## 3. 证据索引

| 证据 | 类型 | 说明 |
| --- | --- | --- |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/device/50-postsync-render-*.png` | 截图 | 同步后真机上的新会话首屏实时渲染 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/prompts/postsync-received-focused.txt` | 日志 | 新会话 transcript 的首条 user message |

## 4. 缺陷与遗留问题

| 问题 | 严重程度 | 处理状态 |
| --- | --- | --- |
| `session-names` 的 seam `mustContain: "recordClaudeSessionActivity"` 仅匹配标识符，import 语句即可满足，无法单独拦住「调用被删但 import 保留」 | 低 | open。实测该情形被 `pnpm tc` 的未用导入规则兜住，当前无实际漏洞；但属巧合而非设计，建议把 `mustContain` 收紧为调用形态 |
| 旧主机 `cwd` 丢弃分支（TC-008） | 中 | open（已接受风险） |

## 5. 本轮结论

- 总体结论：四处冲突解法逐项实证无误；投递迁到 typed RPC operation 后真机端到端与 prompt 逐字一致均通过，失败分支映射由真实执行的单测覆盖。
- 上游 #20155 收紧了 `tui-idle` 判定，回包形状未变、本功能无需改动；但此前记录的就绪耗时是旧语义下的数字，已在 journal 标注需重新采集。
- 已接受风险：TC-008；seam `mustContain` 的宽松匹配。
