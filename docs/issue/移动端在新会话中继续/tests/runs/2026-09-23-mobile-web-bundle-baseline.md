---
title: '2026-09-23 mobile web bundle 基线复验'
document_type: test-run
status: completed
created: 2026-09-23
updated: 2026-09-23
---

# 2026-09-23 mobile web bundle 基线复验

## 1. 执行信息

- 目的：归因并修复 `mobile web app bundle` gate 在续接功能合入后的闭包与分块基线漂移。
- 当前基线：`fork/integration` @ `ef98278cfc62ae6656222757d8d1a14bd0d1b0df`。
- 对照基线：fork 的 upstream merge-base @ `3bb9a4e261f90f566e0b358e878ecbb16366dda2`。
- 环境：macOS arm64；两端均执行 `mobile/package.json` 声明的五个 postinstall generator。
- 关联用例：TC-010。

## 2. 归因结果

### 2.1 Session route closure

| 指标     | merge-base | fork integration | 差值 |
| -------- | ---------: | ---------------: | ---: |
| 总模块   |       4211 |             4226 |  +15 |
| 本地模块 |       1025 |             1040 |  +15 |

完整列表差分为 15 个新增本地模块、0 个删除、0 个新增 vendored 模块。新增项均可沿 mobile session-continuation 入口到达：

- `../src/shared/agent-prompt-injection.ts`
- `../src/shared/agent-session-continuation/bounded-session-transcript.ts`
- `../src/shared/agent-session-continuation/continuation-prompt.ts`
- `../src/shared/issues/constants.ts`
- `../src/shared/terminal-input.ts`
- `src/session-continuation/MobileSessionContinuationSheet.tsx`
- `src/session-continuation/continuation-actions.ts`
- `src/session-continuation/continuation-agents.ts`
- `src/session-continuation/continuation-copy.ts`
- `src/session-continuation/continuation-delivery.ts`
- `src/session-continuation/continuation-rpc-operations.ts`
- `src/session-continuation/continuation-sheet-actions.ts`
- `src/session-continuation/continuation-source.ts`
- `src/session-continuation/use-mobile-session-continuation-scope.ts`
- `src/session-continuation/use-mobile-session-continuation.ts`

### 2.2 Route-prefix script sweep

- merge-base：`3, 7, 11, 16, 19, 26, 28, 33, 34, 43, 51, 56, 63, 64, 66`
- fork integration：`3, 7, 11, 16, 19, 26, 28, 33, 34, 43, 51, 56, 62, 63, 65`

前十二个前缀不变。session route 使图同时到达 `mobile/src/tasks/mobile-tui-agents.ts` 与 `src/shared/clipboard-text.ts`；加入 tasks route 后两者的 importer set 相同，esbuild 将原本独立的 clipboard chunk 合入 agent-catalog chunk，因此最后三个前缀各少一个脚本。

这是共享关系变化，不是容量放宽：`MOBILE_WEB_APP_BUNDLE_SCRIPT_MARGIN` 保持 4，设备 manifest 上限保持 256。派生资源边界从 31 路由顺延至 32 路由。

## 3. 执行结果

命令：

```sh
./node_modules/.bin/vitest run --config config/vitest.config.ts \
  config/scripts/mobile-web-app-session-terminal-closure.test.mjs \
  config/scripts/build-mobile-web-app-bundle.test.mjs
```

结果：PASS，2 个测试文件、49 项测试全部通过。测试中的当前 bundle 构建为 108 个 assets、7,682,447 bytes。

配套门禁：

- 续接桌面侧测试：7 个文件、33 项通过。
- 续接移动侧测试：6 个文件、34 项通过。
- 完整 typecheck 通过。
- changed-code quality 以 `origin/fork/integration` 为基线通过，3 个变更代码文件 0 个新增问题。
- localization catalog、runtime catalog、extraction、coverage 四项通过。
- `check:fork-features`、`check:fork-docs`、`check:architecture-policies` 通过。

## 4. 结论

基线变化全部能由 mobile session-continuation 的可达模块与 esbuild chunk 共享解释；未提高脚本 margin、总字节预算或设备资源上限。
