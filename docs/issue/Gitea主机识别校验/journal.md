---
title: 'Gitea 主机识别校验'
slug: 'Gitea主机识别校验'
status: done
created: 2026-11-03
updated: 2026-11-03
external_ids: []
---

# Gitea 主机识别校验开发 Journal

## 1. 关键文档链接

| 类型     | 文档                                      | 状态      | 说明                                 |
| -------- | ----------------------------------------- | --------- | ------------------------------------ |
| 需求     | [需求](requirements/Gitea主机识别校验.md) | ready     | REQ-2101～REQ-2103                   |
| 方案     | [方案](solutions/主机识别.md)             | ready     | 版本接口探测、判定表、缓存与执行主机 |
| 测试用例 | [用例](tests/cases/主机识别.md)           | ready     | 自动化与本地、SSH 真机               |
| 测试记录 | [记录](tests/runs/2026-11-03.md)          | completed | 自动化、门禁与本地/SSH 真机          |

## 2. 决策点记录

- 2026-11-03：用户要在 Orca 里像 GitHub 一样看公司内部代码平台的 MR 和 diff。该平台的 git 远程被兜底识别为 Gitea，所有请求失败。用户确认方案：公开 fork 里只放通用机制，平台接入另做插件；本功能是第一处通用改动。
- 只在主机明确回答「不是 Gitea」时放弃 Gitea 识别；网络失败、网关和限流错误、401/403 一律保持原行为，避免误伤真 Gitea 用户。
- 探测不带令牌：`ORCA_GITEA_TOKEN` 只发给已确认的 Gitea 主机。
- 「不是 Gitea」的结论复用远程地址探测的 5 分钟否定有效期；下一次询问由正常刷新触发，不加定时器、不重试。
- 公开文档不写内部平台的域名和接口细节。
- 探测跟着评审查询走，不改变执行位置：orcad 托管的 SSH 工作区在 SSH 主机上探测和发请求，直连 SSH 路由在客户端发。最初方案误写成 SSH 一律由客户端发出，真机验证的缓存键 `runtime:…` 暴露了这一点，已改正。

## 3. 开发记录

### 2026-11-03 implementing

- 本轮目标：让非 Gitea 的自建平台不再被识别为 Gitea，真 Gitea 与 Forgejo 不受影响。
- 完成内容：新增功能模块 `src/main/gitea-host-verification/`，接入 `getGiteaRepoSlug`；补上真 git、真 HTTP 的端到端用例和判定表用例；调整三个上游 Gitea 测试以适配探测。
- 代码或文档变更：功能目录、`src/main/gitea/client.ts` 接缝、三个上游测试、注册表、架构策略、`.gitignore` 放行与本功能文档。
- 验证证据：功能与 Gitea 相关 9 个测试文件 79 项通过；撤掉接缝后端到端用例失败（识别为 gitea），恢复后通过。真机验证进行中。
- 未解决问题：本地与 SSH 真机验证尚未完成。
- 下一步：完成真机验证与全部门禁，提 PR 合入 fork/integration。

### 2026-11-03 done

- 本轮目标：完成本地与 SSH 真机验证，改正方案里 SSH 场景的执行位置。
- 完成内容：本地、SSH 各两个场景（非 Gitea 平台、真 Gitea）全部通过；需求、方案、用例按 orcad 托管与直连 SSH 两条路径重写执行位置说明；补测试记录。
- 代码或文档变更：仅本功能文档。
- 验证证据：见 tests/runs/2026-11-03.md；证据目录 `.docs/gitea-host-verification-ui-validation/2026-11-03/`。
- 未解决问题：直连 SSH 路由（`ssh:` 主机）没有单独真机验证，由代码路径与单元测试覆盖。
- 下一步：推送分支并提 PR 合入 fork/integration。
