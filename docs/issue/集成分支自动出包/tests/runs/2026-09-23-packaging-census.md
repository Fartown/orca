---
title: 打包任务清单契约验证
document_type: test-run
status: completed
created: 2026-09-23
updated: 2026-09-23
---

# 打包任务清单契约验证

## 范围

- 分支：`feat/integration-builds-packaging-contract`
- 基线：`fork/integration` `ef98278cfc62ae6656222757d8d1a14bd0d1b0df`
- 关联：REQ-401、TC-401
- 目标：共享 packaging census 识别 fork 的 macOS integration job，并验证该 job 在打包前构建 mobile web bundle、安装移动端依赖。

## 结果

| 检查                        | 结果                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 修复前定向测试              | FAIL，38 项中 1 项失败；实际发现 13 个 packaging jobs，显式清单只有 12 个，缺少 `fork-integration-build.yml macos` |
| 修复后定向测试              | PASS，38/38；fork macOS job 同时通过 bundle producer 与 mobile dependency install 两条断言                         |
| integration-builds 登记检查 | PASS；共享契约已登记为 seam、测试与 feature check                                                                  |
| fork 文档与架构门禁         | PASS                                                                                                               |

## 边界

- 本轮只修复共享测试清单及 feature 登记，不改变 `.github/workflows/fork-integration-build.yml` 的打包步骤。
- 云端 PR checks 与合入后的真实 integration release 单独跟踪，不用本地合同测试冒充发布成功。
