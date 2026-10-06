---
title: 集成分支自动出包
slug: 集成分支自动出包
status: done
created: 2026-09-12
updated: 2026-10-06
external_ids: []
---

# 集成分支自动出包 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [集成分支自动出包](requirements/集成分支自动出包.md) | ready | 已确认范围与内测安装边界 |
| 交互 | - | not-required | 小型更新提示及关于页入口，交互规则随 REQ-405 与 TC-405 记录 |
| 调研 | - | not-required | 直接核实既有构建入口 |
| 方案 | [macOS 自动更新签名修复](solutions/macOS自动更新签名修复方案.md) | draft | 固定自签身份优先验证；Developer ID 备选 |
| 方案 | [发布页分层与可读发布说明](solutions/发布页分层与可读发布说明方案.md) | ready | 构建发布清理、整理版、按功能分组、同步上游摘要、AI 短版本 |
| 测试用例 | [自动出包](tests/cases/自动出包.md) | ready | 按仓库完成门禁建立 |
| 测试记录 | [本地验证](tests/runs/2026-09-12-local.md) | completed | 13 条合同测试，云构建尚未执行 |
| 测试记录 | [应用更新验证](tests/runs/2026-09-12-updates.md) | completed | 本地实现、APK、组件验证；真机安装与新发布待验 |
| 测试记录 | [原生更新验收](tests/runs/2026-09-13-native-update.md) | completed | arm64 真实替换、原生运行状态和原终端连续性通过；正式发布及 Android 默认源安装待验 |
| 测试记录 | [HTTP403修复验证](tests/runs/2026-09-13-update-http403.md) | completed | 失败恢复、公网回退、实际组件及修复APK通过；手机具体响应仍待接入 |
| 测试记录 | [发布说明与版本号兼容](tests/runs/2026-09-17-release-notes.md) | completed | 单测与真实发布记录预演通过；合入后的发布页待核对 |
| 测试记录 | [常规版本号](tests/runs/2026-09-17-preview-version.md) | completed | 编号、发布复核与版本比较通过；按 D-004 暂不合入 |
| 测试记录 | [打包任务清单契约](tests/runs/2026-09-23-packaging-census.md) | completed | 共享 packaging census 纳入 fork macOS job，定向门禁通过 |
| 测试记录 | [发布页分层与可读发布说明](tests/runs/2026-10-06-readable-releases.md) | completed | 单测、预演与合入后核对通过；真实 Claude 调用待配置 key |

## 2. 决策点记录

### D-006 2026-10-06：发布页分层与 AI 短版本

- 背景：用户指出集成分支的出包日志和 Release 页很乱、没有有效信息，官方 Release 很清晰；要求四项改进都做。核实发现已安装的桌面与 Android 集成包靠「预发布 + `integration-运行号-提交` tag」找更新，不能把构建合并成一个滚动发布或挪到别的仓库。
- 备选项：清理旧构建保留 5 个 / 10 个 / 不删；整理版在同步上游时加手动触发 / 每个 PR / 仅手动；AI 短版本先建草稿待确认 / 直接发布并标注 / 不接 AI。
- 最终决定：保留最近 10 个构建发布（被整理版引用的不删）；整理版在同步上游时自动出，也可手动触发；AI 短版本直接发布，标注由 AI 生成、未经人工审阅。
- 原因：用户选择。
- 影响范围：REQ-408～REQ-412；工作流增加手动触发选项与只读的摘要任务，仓库需要用户自行配置 `ANTHROPIC_API_KEY`。清理会让「已发布数量」变小，预览版编号随之改为现有最大编号加一（REQ-407）。

### D-005 2026-09-17：不再出 Intel 版

- 背景：合入 #31 后 Intel 构建机打 DMG 时解析不到 github.com 而失败，只能重跑；用户表示不需要 Intel 版，要求去掉。
- 最终决定：工作流只构建 Apple Silicon，发布只含 Apple Silicon DMG/ZIP 与 APK，桌面检查只要求 Apple Silicon ZIP。已安装的旧集成包把 Intel 更新 ZIP 当作发布完整的必要条件，所以每个发布附带同名的占位说明（合法 ZIP，只含 README），发布说明写明它不是安装包。
- 原因：不附占位文件时，所有已安装的集成包都看不到之后的发布，需要逐台手动重装。
- 影响范围：REQ-401、REQ-402、REQ-404；与 D-004 第二步合在同一个 PR。占位文件在用户确认所有集成包都更新到本版本之后可以移除。

### D-004 2026-09-17：发布内容随合入变化，版本号分两步切换

- 背景：用户指出集成包的发布说明和更新提示是固定文案，应按最新合入的 PR 显示；并要求版本号改为常规格式，不再是 `1.4.197-local.时间戳.提交`。
- 最终决定：第一步在发布说明、`build-info.json` 和桌面更新提示中列出相比上一个集成包的合入内容，同时让客户端提前识别 `上游版本-preview.N`，出包仍用旧版本号，改完合入。第二步再把出包切换为 `-preview.N`（N 为已发布集成包数加一），发布标题改为「Orca 版本号」。
- 原因：客户端会拒绝不认识的版本号格式，直接切换会让已安装的桌面和 Android 集成包收不到更新；更新提示文案由已安装版本生成，第一步装上后才会显示合入标题。
- 影响范围：新增 REQ-406、REQ-407。第二步须等用户确认桌面与 Android 集成包都已更新到第一步的版本后再合入。

### D-003 2026-09-12：补齐签名解决路线，不将本机环境失败误判为技术不可行

- 背景：用户要求解释阻塞并提供解决方案；上一轮未区分构建机信任和客户端指定要求验证。
- 建议：先在一次性 CI 构建机验证固定自签身份，保留 Squirrel 验签；移除构建信任后仍须通过同签名升级和实际重启，错签名必须拒绝。验证通过后才配置长期发布身份。
- 备选：Developer ID；不自写替换器，不放宽为只检查 bundle ID，不更改用户电脑的证书信任。
- 状态：方案已补齐，固定自签原生更新仍待 P0 实验，不宣称已经修复。

### D-002 2026-09-12：补齐应用内更新

- 背景：用户追加 fork 更新检查、ZIP/清单和移动端自动更新。
- 最终决定：仅集成构建启用 fork 更新源；桌面复用原更新器，Android 下载后校验并调用系统安装器。CI versionCode 改为构建时间递增，非集成版本不变。
- 影响范围：REQ-404、REQ-405；取消 D-001 中仅手动下载和禁止 CI versionCode 的限制，不改变签名核验要求。

### D-001 2026-09-12：独立 fork 内测发布

- 背景：macOS 既有流程限定上游且依赖 Apple 凭据；Android 只在标签或手动触发。
- 备选项：改上游正式发布；新增薄层工作流复用构建。
- 最终决定：采用独立工作流，同 SHA 并行构建，全部成功后成套发布。
- 原因：用户已同意先出未公证内测包；保持上游发布接缝为零。
- 影响范围：REQ-401、REQ-402、REQ-403；APK 沿用 Expo debug 签名并核验指纹，不生成密钥或暗改 versionCode。

## 3. 开发记录

### 2026-10-06 上游同步：撤下 mobile 网页包打包工作流普查的接缝

- 本轮目标：合并上游 `5cf3585b78` 时解决「上游删除、fork 修改」的冲突，保住功能本身
- 完成内容：上游 #25791 删除了 `config/scripts/mobile-web-bundle-packaging-workflow-contract.test.mjs`（低价值的测试清单）。本功能在其中登记的 `fork-integration-build.yml macos` 一行随文件一起失去作用；功能清单撤下该接缝、测试与 checks 中的引用。出包工作流本身不变
- 代码或文档变更：`config/fork-features.jsonc`；被删除的上游测试文件跟随上游
- 验证证据：同步后 `pnpm sync:upstream` 的门禁与本功能 checks 结果见 `.docs/fork-sync/2026-10-06/`
- 未解决问题：无
- 下一步：无

### 2026-10-06 #46 合入后核对出包、清理与整理版（done）

- 本轮目标：确认 REQ-408～REQ-411 在真实出包中生效，旧客户端仍能找到更新。
- 完成内容：#46 合入后推送出包为 `preview.40`，删除 30 个旧构建及其 tag，剩 10 个；手动触发带整理版的出包，得到 `preview.41` 与 Latest 整理版 `fork-v1.4.221-1`；未配置 key 时按设计省略 AI 短版本。
- 代码或文档变更：REQ-408～REQ-411 状态、测试记录「合入后核对」一节、本记录；无代码改动。
- 验证证据：[发布页分层与可读发布说明](tests/runs/2026-10-06-readable-releases.md)「合入后核对」一节；应用的更新检查代码对真实 GitHub 的 API 与 atom 两条路径都选中最新构建，不选整理版。
- 未解决问题：真实 Claude 调用由用户决定暂不测试；跨版本兼容检查要等下次同步上游（带进 `@streamparser/json`）后恢复。
- 下一步：用户配置 `ANTHROPIC_API_KEY` 后，在下次同步上游的整理版上核对短版本。

### 2026-10-06 发布页分层与可读发布说明（testing）

- 本轮目标：按 D-006 让集成分支的发布页像官方一样可读：构建发布只留最近 10 个，同步上游时另出整理版，说明按用户可见变化分组并写清同步带进了什么，整理版开头有 AI 中文短版本。
- 完成内容：
  - 新增发布说明整理（按功能分组、工程改动与固定说明折叠）、同步上游摘要（按发布时间匹配期间官方发布）、整理版、清理与 AI 短版本五个模块，以及摘要任务与发布任务共用的构建区间计算。
  - 预览版编号改为现有最大编号加一。
  - 工作流增加 `milestone` 手动选项与只读的 `release-summary` 任务；有写权限的发布任务仍不带密钥。
  - 预演中修正：上游列表超出输出缓冲；同步标题与官方版本矛盾；上游提交摘录混入基础设施改动；第一个整理版范围过窄。
- 代码或文档变更：
  - `config/scripts/integration-builds/` 新增 `release-notes.mjs`、`upstream-summary.mjs`、`release-context.mjs`、`milestone-release.mjs`、`prune-releases.mjs`、`ai-release-summary.mjs`、`command-output.mjs` 及两个测试文件；改 `publish-release.mjs`、`integration-releases.mjs`、`build-identity.mjs`、`integration-builds.test.mjs`。
  - `.github/workflows/fork-integration-build.yml`；登记表 `requiredFiles`。
  - REQ-407～REQ-412、TC-408～TC-413、方案文档。
- 验证证据：[发布页分层与可读发布说明](tests/runs/2026-10-06-readable-releases.md)；门禁输出在 `.docs/integration-release-notes-review/2026-10-06/evidence/gates/`（git 忽略）。
- 未解决问题：
  - REQ-412 的约定写入 AGENTS.md 与 fork 维护文档超出本功能范围，已由 #47 单独合入。
  - #46 首轮 CI 的 fork 差异门禁误报移动端测试类型：上游只在 PR 改动移动端时安装 `mobile/node_modules`，fork 差异门禁却总要检查移动端文件。已由 #48 在 fork 门禁块补装依赖修复，本机挪走依赖可复现、还原后消失。
  - #48 的 CI 另有两项与本功能无关的失败：上游已知的 `startup-line-prompt-carry` 测试；跨版本兼容检查拉取的上游 v1.4.221 依赖 `@streamparser/json`，集成分支同步到的上游还没有，下次同步上游后恢复。
  - 合入后的真实出包、清理与整理版未执行；仓库未配置 `ANTHROPIC_API_KEY`。
- 下一步：
  1. 开 PR 合入。
  2. 核对第一次出包的正文、编号与清理结果，并手动触发一次整理版。
  3. 请用户配置 `ANTHROPIC_API_KEY`。

### 2026-10-06 CI 门禁布局随上游 preflight 约束调整，并再同步 37 个上游提交（testing）

- 本轮目标：修掉推送后定时 x86 单测中由合并引入的工作流约束失败，并把 `fork/integration` 跟到最新上游。
- 完成内容：上游有测试逐条钉住 preflight 的步骤与阶段条件；合并时对上游变更代码检查和 React Doctor 加的“fork 仓库跳过”已撤回，上游步骤在 fork 上原样运行（它们覆盖 PR 改动行且包含 casting，原 fork casting 步骤删除），fork 的五个门禁集中成一块并登记进该约束测试；fork 首帧工作流测试跟随合并后的 trace 条件。之后再合入上游 `355e35b5f2`（33 个提交）与 `e65bbc95ce`（4 个提交），冲突均已解决。
- 代码或文档变更：`.github/workflows/pr.yml`、`config/scripts/pr-preflight-gates.test.mjs`（新接缝）、`config/scripts/worktree-switch-paint-workflow.test.mjs`、`config/architecture-policies.jsonc`；合并提交 `6e1759c945`、`af3cc1ce1d`。
- 验证证据：工作流相关 33 个测试文件 611 个用例通过；x86 定时任务原有 8 项失败中，4 项由合并引入且已修复，另 3 项只在 Node 26 失败、代码与上游逐字一致且上游同名任务同样失败，1 项 Terminal Perf 合并前就失败；本机全量单测失败文件与纯上游对照后无合并引入项，见 `.docs/upstream-sync/2026-10-05/sync3/`（git 忽略）。
- 未解决问题：Node 26 上的 3 项失败（SQLite undefined 绑定、Buffer 池化字节数、目录列举顺序）属于上游，未处理。
- 下一步：推送后手动触发 x86 单测确认只剩上游已知失败。

### 2026-10-06 同步上游 d17351401d：CI 与构建适配，移动端屏蔽上游更新提示（testing）

- 本轮目标：同步上游后保住 fork 的 CI 门禁与打包步骤，并避免集成包被上游的新更新提示误导。
- 完成内容：`pr.yml` 按上游新的 preflight 布局接回 fork 门禁（全量代码质量、casting、架构、登记、文档），统一加 `static_analysis` 条件，并新增仅在 fork 仓库执行的补拉 `origin/main` 历史步骤（上游把检出深度降到 50）；`e2e.yml` 合并上游 `cancelled()` 与 fork 的首帧条件；`electron-builder` 与 `package.json` 接回 Goal 驱动、分享页面资源与三道 fork lint 门禁；上游新增的移动端更新检查在集成渠道下不提供来源，集成 APK 不会再被提示安装签名不同的 stablyai 版本。
- 代码或文档变更：`.github/workflows/pr.yml`、`.github/workflows/e2e.yml`、`config/electron-builder.config.cjs`、`package.json`、`mobile/app/_layout.tsx`、`mobile/src/integration-builds/integration-update-channel.ts`（新，含测试）、`mobile-updates.ts`、接缝 `mobile/src/app-update/app-update-runtime.ts`（新）。
- 验证证据：同步后 `pnpm sync:upstream` 的功能登记门禁、架构门禁（14 个策略集）与 25 条功能检查全部通过（`.docs/upstream-sync/2026-10-05/sync-run3.txt`），`pnpm tc` 通过，暂存的 10259 个代码文件 oxlint 零错误；`pr.yml` YAML 解析通过，审查在本机浅克隆上验证了补拉命令可用；集成渠道测试覆盖“集成包不查询上游、非集成包照常查询”。
- 未解决问题：`pr.yml` 的新步骤尚未在真实 CI 上运行，需由下一个 PR 验证。
- 下一步：下一个 PR 观察 preflight 中 fork 门禁与补拉步骤。

### 2026-09-23：补齐 fork macOS 打包任务的共享契约登记

- 本轮目标：修复上游移动 Web bundle packaging census 未登记 fork macOS job 导致的确定性 PR CI 失败，并让 integration-builds 自身检查覆盖该共享契约。
- 完成内容：把 `fork-integration-build.yml macos` 加入显式 packaging job 清单；继续由同一契约验证其执行 `build:mobile-web` 且先安装 `mobile/node_modules`；将共享测试登记为 integration-builds seam、测试和同步检查。
- 代码或文档变更：共享 packaging workflow contract、fork feature registry、architecture policy、TC-401 与本记录；不改变打包行为、发布格式或客户端更新协议。
- 验证证据：[打包任务清单契约](tests/runs/2026-09-23-packaging-census.md)。
- 未解决问题：真实 GitHub PR 门禁与合入后的 integration release 待远端执行。
- 下一步：先合入本修复，再更新功能 PR 到最新 `fork/integration` 并触发新的 preview release。

### 2026-09-17：#32 合入后核对第一个 preview 发布与桌面更新

- 本轮目标：确认版本号切换（REQ-407）、去掉 Intel（D-005）和更新提示显示合入标题（REQ-406）在真实发布与真实应用中生效。
- 完成内容：#32 合入后发布「Orca 1.4.197-preview.25」，只含 Apple Silicon、Android 与 Intel 占位说明。用户这台 Mac 上 #31 的版本通过运行时更新接口发现该版本，更新提示为 #32 的 PR 标题，安装后运行 `1.4.197-preview.25`，终端会话不受影响。只读确认另一台 Mac 已在 #31 的版本上。
- 代码或文档变更：无代码改动；REQ-406、REQ-407 状态与两份测试记录更新。
- 验证证据：[常规版本号](tests/runs/2026-09-17-preview-version.md)「合入后核对」一节；更新过程日志在 `.docs/integration-release-notes-ui-validation/2026-09-17/evidence/desktop-update-rpc-preview.log`。
- 未解决问题：用户手机上的 Android 集成包版本未知，早于 #31 的需要手动安装一次 APK；更新卡片未截图；Intel 占位文件暂时保留。
- 下一步：用户确认 Android 与两台 Mac 都在 #32 之后的版本上，再移除 Intel 占位文件。

### 2026-09-17：#31 合入后核对真实发布，并更新用户的桌面集成包

- 本轮目标：确认 REQ-406 在真实发布中生效，并按用户「你自己点」的要求更新用户这台 Mac 上的集成包，满足第二步合入前提。
- 完成内容：#31 合入后自动出包第一次尝试时，Intel 打 DMG 因构建机解析不到 github.com 失败；重跑后发布 `integration-35175801533-0231e645f69d`。发布说明与 `build-info.json` 正确列出 #31。通过运行时更新接口依次检查、下载、安装（与界面上点更新、重启同一路径），用户这台 Mac 从 e6277cf40f83 更新到 0231e645f69d，终端守护进程与其中的会话不受影响。
- 代码或文档变更：无代码改动；REQ-406 状态、测试记录「合入后核对」一节更新。
- 验证证据：[发布说明与版本号兼容](tests/runs/2026-09-17-release-notes.md)；更新过程日志在 `.docs/integration-release-notes-ui-validation/2026-09-17/evidence/desktop-update-rpc.log`。
- 未解决问题：更新提示里显示合入标题要等下一个集成包；另一台 Mac 与 Android 集成包是否已更新未知，没有更新的话，第二步合入后需要手动安装一次。
- 下一步：PR #32 CI 通过后合入，核对第一个 `-preview.N` 发布，并在这台 Mac 上再更新一次，验证版本号切换与更新提示里的合入标题。

### 2026-09-17：去掉 Intel 出包，保留旧集成包的更新路径

- 本轮目标：按用户要求去掉 Intel 出包（D-005），并让已安装的集成包继续自动更新。
- 完成内容：工作流 macOS 矩阵只留 arm64；发布包只含 Apple Silicon DMG/ZIP 与 APK，签名证据只核验 arm64，`latest-mac.yml` 只列 Apple Silicon ZIP；新增 `legacy-intel-placeholder.mjs`，在发布时生成 `orca-integration-macos-x64.zip` 占位说明并写入清单、校验和与上传列表；桌面检查不再要求 Intel ZIP。本次合入的集成包（#31）仍由含 Intel 任务的工作流发布，Intel 任务失败后重跑。
- 代码或文档变更：`publish-release.mjs`、新增 `legacy-intel-placeholder.mjs`、工作流 macOS 矩阵、`release-catalog.ts` 及对应测试；需求范围、REQ-404 验收、TC-401/TC-404 更新。
- 验证证据：功能检查 110 + 19 项通过，新增用例确认旧集成包要求的四个文件都在上传列表里、占位文件大小与清单一致、`latest-mac.yml` 不含 x64；占位 ZIP 用 `unzip -t` 校验通过，见[常规版本号](tests/runs/2026-09-17-preview-version.md)。
- 未解决问题：真实发布待合入后核对；占位文件何时移除取决于所有集成包是否都已更新。
- 下一步：与第二步一起开 PR，CI 通过后合入，核对第一个 `-preview.N` 发布。

### 2026-09-17：集成包改用常规预发布版本号（暂不合入）

- 本轮目标：实现 D-004 第二步，把集成包桌面版本号从 `1.4.197-local.时间戳.提交` 改为 `1.4.197-preview.N`，发布标题改为「Orca 版本号」。
- 完成内容：新增 `integration-releases.mjs`，跨分页统计已发布的集成包，并按「已发布数加一」生成版本号；上游版本带预发布后缀时出包失败。身份任务用只读令牌统计编号；发布前重新统计，编号被占用或已有更新的构建发布时拒绝发布。Android versionCode 改由身份任务输出传入发布任务，不再从版本号里的时间戳推算。上一个集成包的查找改用同一份发布列表。
- 代码或文档变更：`build-identity.mjs`、`publish-release.mjs`、新增 `integration-releases.mjs`、工作流身份与发布任务的环境变量、`integration-builds.test.mjs`；REQ-407 与 TC-408 更新，新增测试记录。无新增上游接缝。
- 验证证据：功能检查 109 + 19 项通过；真实发布记录预演得到下一个版本 `1.4.197-preview.24`，少一的编号被拒绝且没有写发布；两种版本比较都判定新格式高于最新已发布的旧格式版本；`oxlint`、变更代码质量门禁、`check:fork-features`、按 fork 同步基线的架构门禁通过，见[常规版本号](tests/runs/2026-09-17-preview-version.md)。
- 未解决问题：未在 GitHub 上真实出包；合入须等用户确认桌面与 Android 集成包都已更新到含 REQ-406 的版本，否则旧客户端会报清单无效。
- 下一步：REQ-406 合入并出包后，把本分支变基到 `fork/integration`、开草稿 PR；用户确认后合入，并核对第一个 `-preview.N` 集成包的发布与桌面、Android 更新。

### 2026-09-17：发布说明列出本次合入，客户端兼容常规版本号

- 本轮目标：按用户要求让集成包的发布说明和更新提示随合入的 PR 变化，并为版本号改为 `-preview.N` 做好客户端兼容（D-004 第一步）。
- 完成内容：发布脚本通过 GitHub 发布列表找到上一个已发布的集成包（跳过同一提交、草稿和更新的构建），用 `git log --first-parent` 列出之间的合入：PR 合并取 PR 标题，同步上游等直接提交取提交标题；写入发布说明「本次合入」一节（附上一个包与完整提交差异链接）和 `build-info.json` 的 `changes`。无法对比时只列本次提交，不阻止发布。发布任务检出改为全部历史、不含文件内容。共用清单解析同时接受 `-local.时间.提交` 与 `-preview.N`，合入列表格式不对时忽略；桌面更新提示用最新三条标题（其余 +N），新版本号格式的标题为「Orca 版本号」。
- 代码或文档变更：`publish-release.mjs`、发布工作流 publish 任务检出参数、`release-catalog.ts`、`integration-update-feed.ts` 及三处测试；新增 REQ-406、REQ-407、TC-407、TC-408 与测试记录。均在集成出包功能自有路径内，无新增上游接缝。`.gitignore` 补上本目录的放行规则（此前文档靠强制添加入库，新文件会被静默忽略），范围策略相应允许改 `.gitignore`。
- 验证证据：新用例在旧实现上 9 项失败、新实现 60 项通过；功能检查 101 + 19 项、原更新器回归 294 项、根与移动端类型检查、`oxlint`、`check:fork-features`、本地化三项通过；架构门禁按 fork 同步基线通过（默认基线的 1 条 `errors.ts` 漂移在干净集成分支上同样存在，来自更新的上游提交）。真实发布列表与集成分支历史的预演、按新检出方式拉取公开 fork 的探针均通过，见[发布说明与版本号兼容](tests/runs/2026-09-17-release-notes.md)。
- 未解决问题：合入后第一个集成包的发布页尚未核对；更新提示里的合入标题要等用户装上本版本、再出下一个包才能在真实应用里看到；第二步出包切换未实现。2026-09-14 记录引用的 `tests/runs/2026-09-14-android-download-resume.md` 因目录未放行从未入库，本机也已找不到，该链接失效。
- 下一步：合入后核对自动出包生成的发布页与 `build-info.json`；实现第二步但暂不合入，等用户确认桌面与 Android 集成包都已更新。

### 2026-09-14：断点续传与横幅安全区真机验收通过

- 本轮目标：把上一条记录里"真机未验证"的部分补上，用可注入故障的发布源在云真机上实测下载失败后的恢复行为。
- 完成内容：荣耀 Magic7（Android 16，arm64）上装本分支 `versionCode=200000000` 包、以 `=200000001` 作为待更新版本，逐条覆盖连接中断、504、忽略 Range 的 200、连接静止、跨 App 重启、缓存已完整、tag 不匹配、摘要失败八种起点，并完整走通一次"中断→续传→校验→系统安装确认"，装机版本号确实从 200000000 变成 200000001。发布源侧逐次记录到真实的 `Range` 请求头：四次失败的 offset 单调递增（0→146097→292134→423206），间隔 2.1s/5.1s/12.2s 与退避表一致；静止连接 47.7s 被取消后按 3,000,000 字节续上；摘要失败后缓存目录被清空。横幅在下载态整体位于状态栏下方。
- 代码或文档变更：无代码改动；新增 TC-406 与 `tests/runs/2026-09-14-android-download-resume.md`，验证脚本与逐次请求日志在 `.docs/integration-update-download-ui-validation/2026-09-14/`。验证期间把 `release-catalog.ts` 的两个常量临时指向本地发布源，验完已 `git checkout` 还原。
- 验证证据：[断点续传真机验证](tests/runs/2026-09-14-android-download-resume.md)。
- 未解决问题：用户线上 504 的成因仍没有响应头证据，本轮只证明同类失败后能续传而非重来；4xx 不重试只有单测覆盖，未在真机注入；架构门禁 4 条 `reference-drift` 属上游同步遗留，不在本轮范围。
- 下一步：合入后出新包，由用户在自己手机上确认下载不再从头再来。

### 2026-09-14：更新下载支持断点续传，修复横幅压状态栏

- 本轮目标：解决用户手机上「各种报错、也不支持断点继续下载」，并修掉更新横幅压住状态栏和刘海。
- 完成内容：查实下载不可续传有三处原因——`createDownloadResumable` 被当成一次性下载（从不传 resumeData）、失败路径直接删掉半成品、返回码只认 200 所以续传返回的 206 反被判失败；另查实 expo-file-system 原生任务不看状态码就把响应体写进目标文件（`FileOutputStream(file, isResume)` 后直接拷贝 body），所以一次 504 会把错误页写进 APK。改为：带退避的 4 次重试（2s/5s/12s），每次按磁盘已有字节发 `Range`；用 tag 标记文件保证只对同一发布续传；非 2xx、忽略 Range 的 200、416 一律判半成品已污染，丢弃后从 0 重来；45s 无进度就取消当次连接并续传，不再干等满 10 分钟；摘要校验失败时清缓存，避免反复续在坏字节上。横幅按 `useSafeAreaInsets()` 补顶部 inset。
- 代码或文档变更：新增 `mobile/src/integration-builds/apk-download.ts` 及其用例，`mobile-updates.ts` 只保留 expo 侧接线，`IntegrationUpdateGate.tsx` 补安全区；无新增上游接缝。
- 验证证据：移动端 19 项（含续传 10 条新用例）与桌面侧 90 项通过；`mobile typecheck`、`oxlint`、根 `pnpm tc` 通过；`check:fork-features`、`check:fork-docs` 通过。
- 未解决问题：真机未验证——修复要随新 APK 生效，而用户手机上现有的下载器正是坏的那版，首包需手动安装；用户 504 的具体来源（GitHub 资源 CDN 还是中转）没有抓到响应头证明。架构门禁 4 条 `issues-existing-capability-reuse/reference-drift` 违规在干净的 `fork/integration` 上同样存在，属上游同步遗留，不在本轮范围。
- 下一步：合入后出新包，在小米真机上实测断点续传与横幅安全区。

### 2026-09-13：手机检查 HTTP403，补公开发布发现回退

- 本轮目标：修复用户最新版Android关于页检查返回403的失败路径，不改下载安装与签名。
- 完成内容：截图确认版本211405816且失败发生在检查阶段；当前无手机ADB，具体403响应源/限流头尚未取到。原共用源在API403时立即失败已复现；新增403/429回退同仓库Atom，复用清单身份校验并HEAD核对实际安装文件，候选有界，错误不冒充最新版。错误文案区分API、Atom和清单。
- 代码或文档变更：仅integration-builds共用release-catalog及回归用例，无新增上游接缝；扩展TC-404网络反例。
- 验证证据：新增403/429用例先红后绿；功能90项、移动9项、原updater291项通过；真实公网回退正确，实际组件5状态通过；修复APK211422028构建/验签和Android16 arm64模拟器安装启动检查通过；根/移动类型、质量、本地化、fork门禁及按fork基线的架构通过。见[HTTP403修复验证](tests/runs/2026-09-13-update-http403.md)。
- 未解决问题：用户手机具体403原因尚无响应头证明；本地修复已验证但尚未合入发布，未宣称已在用户手机恢复。
- 下一步：提交后续修复PR，按实际CI和发布结果交付，不把模拟器或故障注入当成用户手机证据。

### 2026-09-13：补记PR合入后的正式发布与Android覆盖验收

- 本轮目标：记录上轮合入后的终态，不以合入前testing快照代替实际结果。
- 完成内容：PR#11已合入fdce5272a155；自动工作流34715310107成功并齐套公开8个assets。Android16 arm64独立系统模拟器从默认GitHub源自动发现、真实下载、授权、取消重试、系统覆盖安装通过，211389538→211405816，125%设置保留，检查显示最新版。
- 代码或文档变更：本条仅补充既有验证事实，未改产品。
- 验证证据：`.docs/integration-updates-ui-validation/2026-09-12/android-native/README.md`含截图、层级、原生版本及取回已安装APK与公开清单的摘要比对；PR最新37checks为21成功16规则跳过，无失败运行中；正式发布5成功2规则跳过。
- 未解决问题：实体手机及其它Android版本不在该次证据范围；本轮用户手机暴露API403，需要另按上条修复。
- 下一步：保持正常升级链路，补失败恢复场景，不抹去此前测试边界。

### 2026-09-13：真实 Orca arm64 原生更新主流程通过

- 本轮目标：完成真实替换、原生 B 就绪及原 shell 连续性，推进集成发布。
- 完成内容：第十二轮真实 LaunchServices 正/错 HOME 前置通过；正常 A/B ZIP、签名/配置、默认 fork 手动检查、下载、staging、系统替换及 native B runtime 稳定通过。额外仪器化重开 B 后，同一 PTY 读取到更新前保存的随机 shell 值，排除回显和旧历史假阳性。
- 代码或文档变更：测试启动入口绑定规范化临时 home，生产守卫不变；补成功路径观察器日志保留和报告边界。后两项仅证据保留/文字，不改此次已通过的验收断言或产品代码。新增原生验收记录。
- 验证证据：[第十二轮 7m00s SUCCESS](https://github.com/Fartown/orca/actions/runs/34713324181)，被测 SHA 65d8777a0；native B PID 48661、Unix runtime 稳定 15459ms，after UI PID 49194、0 可见窗口，4 张实图，cleanup 无错误；371 项桌面/发布、9 项移动及本地门禁通过。
- 未解决问题：65d 的 Android 云构建在 Maven gson:2.9.1 依赖解析阶段失败，未编译产品代码；同一 URL 本地当前 HTTP 200，尚不能据此声称 runner 已恢复。整条工作流未结束时 GitHub 未接受单任务重跑。最新 CI 仍需全绿；正式完整发布和 Android 默认源系统覆盖安装待验。
- 下一步：按 merge-code 推进最新 CI、PR #11 合入及自动完整发布，再用已有 Android 隔离旧版执行覆盖更新验收；不绕过失败门禁。

### 2026-09-13：取得原生 B 异常正文，定位为验收隔离 HOME 传递失败

- 本轮目标：依据真实异常定位 NSAlert，修复后完成原生就绪与原终端连续性验收。
- 完成内容：第十一轮路由预检和唯一手动默认源检查通过，下载、原生 staging、磁盘替换通过；替换后 strict 验签再次通过。原生 B PID 56068 实录 `Refusing to start E2E outside its disposable home boundary`：其 HOME 被 LaunchServices 恢复为 runner home，ORCA_E2E_HOME_DIR 和 profile 仍正确。源码守卫及共用隔离 helper 与 integration 无差异，这是 P2 环境传递失败，不是签名或产品 updater 故障。
- 代码或文档变更：下一修复仅限 P2 签前生成入口，在应用导入前绑定并恢复本轮临时 Node home；记录前后值，保留生产隔离守卫。对齐已有 mock-keychain 测试开关，不声称本次错误来自钥匙串，也不覆盖真实钥匙串场景。
- 验证证据：[第十一轮](https://github.com/Fartown/orca/actions/runs/34712632663)，`native-exception-monitor.jsonl` 含完整栈，`native-process-56068.json` 的 postReplacementSignature.status=0；3fd63e079 本地更新回归 369 项、移动 9 项、双端 tc 及仓库门禁通过。
- 未解决问题：新隔离 bootstrap 尚待真实 LaunchServices 前置和完整原生升级复验；原终端恢复及 Android 默认云源覆盖安装仍未通过。
- 下一步：先验证真实原生启动下的隔离 home，再完整打包复跑；不删守卫、不更改系统全局环境。

### 2026-09-13：验证异常观察器，修正隔离更新检查的启动竞态

- 本轮目标：让唯一一次手动检查确定命中本轮隔离更新源，再获取原生 B 的异常。
- 完成内容：第十轮真实 Electron 前置探针同时捕获随机异常及默认 NSAlert 行为，证明只读观察器有效且未吞异常；随后 A/B 成品、A 界面和终端通过。更新检查返回没有完整集成版本，fixture 的 network.json 为空；该轮没有进入下载或原生 B，不能归为 B 再次启动失败。
- 代码或文档变更：复用隔离 profile 的 lastUpdateCheckAt 抑制 route 安装前的自动检查；源码确认原手动检查会承接后台在途请求。新增真实 main 默认 session 的 fork URL 路由预检，必须精确返回本轮 tag 才继续；请求到达即保存，失败也保存 updater 状态。只改测试，不改产品调度；此 P2 覆盖手动默认源检查，不声称覆盖启动自动检查。
- 验证证据：[第十轮](https://github.com/Fartown/orca/actions/runs/34711798974)；真实异常前置通过，失败界面及空网络记录保存在该轮证据目录；14 项 probe 合同通过，含错误 tag 拒绝和本轮 tag 通过。
- 未解决问题：尚未获得真实 B 的异常正文、原生就绪与终端恢复；Android 默认源系统覆盖安装仍待完整发布。PR #11 保持 Draft。
- 下一步：第十一轮仅运行 arm64，路由前置通过后重走原生更新，按实际异常修复。

### 2026-09-13：以真实异常前置探针替换失效的原生窗口取证

- 本轮目标：直接拿到 B 的 JavaScript 异常栈，先验证取证工具再完整打包。
- 完成内容：第九轮再次完成下载和磁盘替换，B PID 49275 卡在同一 NSAlert；lsof 和包内环境确认使用正确隔离目录，日志中无错误正文。JXA 的 CoreGraphics 返回值不能按 JS 数组调用 `.filter`，System Events 虽成功但没有窗口文字，故仍未取得具体错误，不能称已定位 Keychain 或产品根因。
- 代码或文档变更：删除本任务自己引入的失效 JXA 脚本及假 AX 合同，Git 可恢复；保留进程采样、状态路径、日志和真实 plist 只读回归。仅在 P2 生成的 main 构建产物签名前加入 `uncaughtExceptionMonitor` 日志，A/B 一致，保留 strict directive 并记录前后摘要；不进入生产源码或正式出包，不拦截异常。完整打包前先运行 prohibited 模式的极小 Electron 真实异常探针，必须同时读到随机错误和采到原 NSAlert 行为，否则立即失败。B 一旦出现实录异常即采证，不再空等就绪超时。
- 验证证据：[第九轮](https://github.com/Fartown/orca/actions/runs/34710531062)；13 项本地 probe 合同覆盖真实 Node 默认退出 1、原异常处理器退出 42、cwd/stack getter 诊断失败不改变原异常，以及 plist 不改写。新 Electron 前置探针尚待 CI 实跑，不能以 Node 合同代替。
- 未解决问题：B 的具体异常栈、原生就绪和终端恢复仍待验；Android 默认源系统安装仍待完整发布。63c1f2976 的 CI 重现既有 5 毫秒 teardown 测试失败，相关源码与 integration 一致、本地该组 30/30 通过；最终合入仍要求最新 CI 通过，不跳过该检查。
- 下一步：第十轮先验证只读异常观察器，再按真实错误修复并完成主流程验收。

### 2026-09-13：确认新版主进程卡在原生错误弹框，补齐只读取证

- 本轮目标：获取原生 B 启动阻断的真实错误，不以进程存在替代可用性。
- 完成内容：第八轮 A runtime 主 PID/socket 前置通过；A/B 正式 ZIP、签名/版本/架构/配置、真实终端、默认 fork 检查、下载、staging 和磁盘 B 通过。B 的新 PID 42889 由 launchd 启动且未保留测试参数，主线程全部采样停在 Electron/V8→`NSAlert runModal`；尚无弹框文案，不能归因于 Keychain。本轮升级前没有旧 daemon 被 PID 查询匹配，故第七轮识别漏洞不解释第八轮启动失败。
- 代码或文档变更：修正诊断的 `plutil -extract ... json` 缺少 `-o -` 导致空 stdout、并会改写测试包 plist 的错误；该操作发生在启动超时后，不是之前阻断原因。先独立保存进程 sample、状态路径和隔离日志；增加 hosted CI-only、own PID 的原生错误文字/窗口截图，各渠道有界且不 activate/点击；签前加入 Electron 原生日志配置，不改产品入口。
- 验证证据：[第八轮](https://github.com/Fartown/orca/actions/runs/34709797573)；脱敏 sample/native-selection-failure 位于 `.docs/integration-updates-ui-validation/2026-09-12/real-orca-ci/34709797573/`；12 项 probe 合同通过，包括真实临时 plist 前后 SHA-256 不变、非法 plist 不改内容及原生取证超时隔离。a225105b4 的更新相关回归 365 项、移动控制器 9 项、质量/架构/fork 门禁通过。
- 未解决问题：原生 B 尚未发布 runtime，原终端恢复及 Android 默认源系统覆盖安装未通过；PR #11 保持 Draft，未发布新固定签名集成包。
- 下一步：第九轮读取实际 NSAlert 错误栈，按证据修复后复验；Apple Silicon 之外不专项重跑。

### 2026-09-13：原生 staging 通过，修正验收的主进程识别

- 本轮目标：验证原生替换后的真正主进程和原终端连续性。
- 完成内容：第七轮正常 A/B ZIP、包内配置、签名、UI、终端和默认 fork 检查通过；原生日志确认下载完成、`macos_installer_ready` 和调用原生安装。磁盘已变 B，但旧探针选择同 executable 的第一个非 A PID，可能把应保留的终端 daemon 当成新主进程；本轮没有保存选中 PID，不能认定这就是唯一失败原因。
- 代码或文档变更：升级前保存全体同 executable PID 与脱敏 A runtime，并先断言 A 的状态路径/主 PID/socket 正确；B 必须同时满足新 metadata 主 PID、非升级前 PID、当前进程清单和磁盘版本。每次记录当前 metadata，避免早期 ENOENT 掩盖后续 PID 不匹配。额外重开仪器化 B 时仅等待该主 PID 退出，不等待需保留的 daemon 消失；补齐失败采样与状态路径证据。
- 验证证据：run 34709105346 的 Ready to Install 真截图和 updater 日志；源码确认 daemon 使用同一 Electron executable 且原生安装前采取 disconnect；10 项 probe 合同通过，覆盖旧 daemon 假阳性和先落证据再失败。
- 未解决问题：尚未证明第七轮识别出的 PID 是新版主进程，也未完成升级后原 shell 连续性。不能把下载、staging 或磁盘替换当作完整通过。
- 下一步：第八轮保持原验收强度，使用正确的主进程身份完成原生重启与终端恢复。

### 2026-09-13：真实界面与更新检查通过，纠正验收包目标

- 本轮目标：跑通真实 Orca 的默认 fork 检查、下载、安装和终端恢复。
- 完成内容：第六轮仅补测试用 `--use-mock-keychain` 后，main inventory 正常、renderer `1+1=2`、API/store 可用；真实 folder 终端执行随机标记，默认 fork 检查展示 B 的更新卡。下载阶段发现 `app-update.yml` 缺失。
- 代码或文档变更：核实 electron-builder 仅在 macOS dmg/zip target 写入该配置；原验收使用 `--dir` 绕开了此步骤，生产 wrapper 已是 dmg/zip。验收改用两次正常 zip 包装并复用 B 的原生 ZIP，不手造清单、不签后改包；生产成品校验同时检查实际包内配置，新增缺清单、错误更新源和缺缓存目录反例。
- 验证证据：run 34708536915 的实际页面截图、终端与 updater 状态；13 项成品合同与 8 项 probe 合同通过。完整更新相关回归 360 项、移动控制器 9 项通过。已下载 run 34708520840 的真实 PR arm64 ZIP，原样提取包内 `app-update.yml`，实际通用校验通过，包含具体 fork tag 和 `orca-updater` 缓存目录；证据在 `.docs/integration-updates-ui-validation/2026-09-12/pr-34708520840-arm64/`。
- 未解决问题：第六轮未完成下载/安装/重启，不能把前两个检查点称作完整升级；下一轮正常 ZIP 包待跑。
- 下一步：以生产同款 zip target 继续 arm64 原生验收；通过后推进完整清单发布和 Android 系统安装。

### 2026-09-13：隔离主进程启动阻塞，补齐原生移动端环境

- 本轮目标：用分层实证定位 Orca 启动阻塞，并继续原生安装验收。
- 完成内容：第五轮 A/B 成品核验通过；页面加载后主进程 inventory、renderer 简单表达式及独立 CDP 均超时，不能归因为 store 字段。失败清理自然结束，不再空挂。Android arm64 无窗口模拟器已创建，真实 APK 安装和设置/关于页启动通过。
- 代码或文档变更：测试启动补上仓库 packaged-issues 验收既有的 macOS `--use-mock-keychain`，仅作测试环境单变量对照；主进程超时直接采样已知自身 PID，不再依赖失联的 CDP 获取进程身份；单独记录原生重启是否保留参数。
- 验证证据：P2 run 34707940000；8 项 probe 合同通过；移动端 `.docs/integration-updates-ui-validation/2026-09-12/android-native/` 保存真实界面。当前远端仍是旧 schema 清单，关于页实际返回 `Invalid integration update manifest.`，没有把它当成更新通过。
- 未解决问题：钥匙串阻塞尚无线程栈证明；真实 Orca 原生更新/终端恢复、Android 应用内覆盖安装及完整清单发布仍待验。PR 新一轮既有会话关闭时间预算测试失败，源码与 integration 一致、本地 30/30 通过，已重跑失败 CI，未绕过门禁。
- 下一步：运行第六轮 arm64 单变量对照，按实际结果修复；发布完整更新清单后用已安装的 Android 旧版验证真实默认更新源与系统安装。

### 2026-09-13：两版成品核验通过，补齐启动失败现场

- 本轮目标：定位真实 Orca 界面启动阶段，避免验收程序超时后不退出。
- 完成内容：第三轮 A/B 的签名、版本、架构均核验通过；随后现有 `workspaceSessionReady` 条件等待超时，启动函数尚未返回导致测试连接未被关闭。已取消实证挂住的 CI 并保留日志。
- 代码或文档变更：保留原就绪条件，提前记录主进程与页面 URL、console/pageerror、实际 store/IPC 状态和截图；复用仓库既有有界关闭/进程兜底，失败不再空挂。
- 验证证据：run 34706228547 的已登录 GitHub 实时日志及下载 artifact；P2 合同 7/7 通过。现有日志不足以判断界面未就绪的根因，不凭超时去改产品代码。
- 未解决问题：真实界面就绪及后续原生安装仍未验过。
- 下一步：用完整启动现场继续定位，只跑 arm64；取得实际更新与原终端连续性结果。

第四轮补充：实际主 renderer URL 已加载，但复杂页面诊断本身无返回，未取得 API/store 值，不能推断产品根因。已取消该 CI；第五轮将简单 JS、IPC/store、DOM 各设 2 秒独立 deadline，补主进程窗口/CPU/内存、原生隐藏截图、独立 CDP 暂停状态和渲染进程线程栈。8 项诊断合同通过；保留原就绪条件，不把下载完成写成原生 staging 完成。

### 2026-09-13：真实包签名通过，修正成品证书提取参数

- 本轮目标：推进真实 Orca arm64 两版验收。
- 完成内容：第二轮 A/B 两个真实包 afterSign 均完成，MH_OBJECT 故障消失；后续核验命令暴露 Darwin 可选参数必须使用 `--extract-certificates=prefix` 的问题，已修正。
- 代码或文档变更：成品核验脚本与参数合同测试；签名证据在核验前保存，并添加真实运行阶段日志。
- 验证证据：本机原生 codesign 提取成功且 DER 公钥证书指纹与签名身份一致；10/10 核验回归通过；云端第二轮日志见 run 34705871876。
- 未解决问题：本轮停止于成品辅助核验，尚未启动真实 App，不能宣称升级/终端恢复通过。
- 下一步：复跑 arm64，继续到原生替换与原终端连续性结果。

### 2026-09-13：修复真实包中 MH_OBJECT 签名失败

- 本轮目标：解决 arm64 真实 Orca 首轮 afterSign 失败，并避免验收假阳性。
- 完成内容：确认 node-pty 的 `pty.o` 为不可执行 MH_OBJECT；仅对这种普通 `.o` 文件跳过代码签名，保留资源封装与哈希。实际 shared API 签名成功、Apple strict 通过，签后篡改该 `.o` 仍被 strict 拒绝。
- 代码或文档变更：签名自有模块及 3 项回归；真实 Orca 验收要求升级前后原 shell 值和 PTY 身份保留，拒绝从恢复历史文本假判成功；新原生进程须发布 runtime socket 并稳定存活。
- 验证证据：`.docs/integration-updates-ui-validation/2026-09-12/selfsigned-ci/mh-object-20260913/`；P2 合同 6/6、签名与策略 9/9 通过。
- 未解决问题：完整 Orca 下一轮原生安装尚未执行，不能据修复后的最小包宣称完成。
- 下一步：只重跑 arm64 真实 Orca 验收，继续按实际失败修复。

### 2026-09-13：按用户要求聚焦 Apple Silicon

- 本轮目标：用户明确“不用管英特尔”，集中验证 Apple Silicon 主链路。
- 完成内容：后续手动原生探针与真实 Orca 验收只运行 arm64；Intel 不作为本轮验收门槛，不继续专项修复或复跑。
- 代码或文档变更：缩小两个手动 probe 的 runner matrix；既有产品出包矩阵暂不改变。
- 验证证据：P0 arm64 云端通过；P2 arm64 首轮失败正在读取产物定位，不标记完成。
- 未解决问题：真实 Orca 自动升级、重启及终端恢复仍需通过。
- 下一步：修复 arm64 实际失败并复跑，完成主流程。

### 2026-09-13：固定发布身份与原生验收并行推进

- 本轮目标：把已通过的原生签名路线接入每次 integration 自动发布。
- 完成内容：生成并备份固定加密 PEM 身份，两个 Actions secrets 已配置；公开证书入库，私钥和密码不入库、不上传证据；PR 不获得生产密钥。
- 代码或文档变更：workflow 插入临时私钥准备、always 清理和成品证书/版本/架构验签；发布器缺少任一架构有效签名证据时拒绝发布；修正旧 ad-hoc 说明，保留一次手动迁移边界。
- 验证证据：桌面、发布与上游 updater 354 项通过；[P0 双架构原生正反例](https://github.com/Fartown/orca/actions/runs/34705144558) 和 [P2 真实 Orca](https://github.com/Fartown/orca/actions/runs/34705163149) 已启动，均锁定 8e2a56af2。
- 未解决问题：CI 原生验收和正式固定身份构建尚未结束；Android 真机系统安装仍未验证。
- 下一步：按 CI 实际失败继续修复；全部验收通过后才推进 PR #11 与 integration 发布。

### 2026-09-13：原生固定证书升级正反例通过

- 本轮目标：解决签名准备交互阻塞，实际验证替换与重启。
- 完成内容：采用固定版本 rcodesign 与 PEM 签名，不访问 keychain、不修改证书信任；本机连续两轮同证书升级、错证书拒绝、篡改拒绝均通过。
- 代码或文档变更：复用 afterSign 接缝，核验签名前后 entitlements、flags、Info.plist 和 asar 完整性；删除未发布且已证实不可用的 trust 授权尝试，失败历史与证据保留；新增真实 Orca 双架构 CI 验收入口。
- 验证证据：`.docs/integration-updates-ui-validation/2026-09-12/selfsigned-ci/local-rcodesign-20260913-0019/final-report.md`，3/3 用例、9 张截图、前后信任设置摘要一致；真实 Squirrel 替换和新进程版本通过。
- 未解决问题：最小 Electron 探针不等于完整 Orca；双架构 CI、真实 Orca 终端恢复及长期固定身份发布待验证。
- 下一步：并行执行两套 CI，接入正式发布签名与发布前公钥指纹校验，按失败证据继续修复。

### 2026-09-12：执行固定签名身份验证

- 本轮目标：用户要求实际验证并解决 macOS 原生自动更新，不能只给方案。
- 完成内容：把隔离探针收敛到功能自有脚本，接入既有 workflow 的双架构手动验证模式；普通构建/发布在此模式不执行。
- 代码或文档变更：新增临时签名、移除信任后的同证书升级/错证书/篡改包用例；固定发布身份导入脚本先做本地合同检查，尚未启用或创建长期密钥。
- 验证证据：桌面/发布/上游 updater 324 项、移动控制器 9 项通过；根与移动端类型检查、fork 功能/文档及架构门禁通过。原生 CI 正反例待执行，不能据单测宣称已解决。
- 未解决问题：固定证书下实际替换/重启、真实 Orca 两版升级及新版本云发布尚未完成。
- 下一步：运行双架构原生探针，按失败日志修复，通过后才接入固定发布身份和真实 Orca 验收。

第一轮 CI 更新：探针 [34703304011](https://github.com/Fartown/orca/actions/runs/34703304011) 在创建代码签名信任时等待交互授权超时，尚未产生已签 App，归类为环境准备失败，不能据此否定固定自签更新。正在补齐一次性 runner 的非交互授权及恢复，再执行同一组原生正反例；[PR #11](https://github.com/Fartown/orca/pull/11) 保持 Draft。

### 2026-09-12：更新链路实现与本地验证

- 本轮目标：让集成包检查 fork 更新，并加入 Android 应用内更新。
- 完成内容：双架构 ZIP/YAML 发布合同；集成构建标记；桌面 fork 清单/说明及停用上游更新通知；Android 递增版本、前台自动检查、手动入口、下载进度/超时、原生摘要/包名/版本/签名核验、授权与系统安装入口。
- 代码或文档变更：实现位于 integration-builds 和 orca-app-update 自有目录，上游入口保持注册接缝；登记 REQ-404/405、测试与报告。
- 验证证据：[应用更新验证](tests/runs/2026-09-12-updates.md)，APK 完整构建及实物核验通过，移动控制器 9 项、实际组件 CDP 13 项通过；上游 updater 回归和全部仓库要求的本地门禁通过。
- 未解决问题：无 Android 设备，真机覆盖安装未验；本轮未提交/推送/发布；macOS 原生自动安装因无有效稳定签名身份阻塞。
- 下一步：推进新 PR 与同源云构建，使用两版同签名包在设备验收；macOS 提供有效签名配置后再验原生安装。不要据本地 APK 或替身交互宣称已经上线。

### 2026-09-12：自动出包完成，开始更新链路

- 本轮目标：追加桌面更新文件与 Android 应用内更新。
- 完成内容：PR #10 已合入 fe61ba8b7a6b；集成构建 5/5 成功，双架构 DMG/APK 已发布并下载核验。
- 代码或文档变更：登记更新范围和最小运行时接缝，准备实现。
- 验证证据：[发布](https://github.com/Fartown/orca/releases/tag/integration-34698707948-fe61ba8b7a6b)；隔离 Electron 43.6.0 实测下载新 ZIP 后 Squirrel 拒绝不同 ad-hoc 签名，见 `.docs/integration-updates-ui-validation/2026-09-12/mac-signing-probe/`。
- 未解决问题：macOS 无有效签名身份，自动安装有阻塞；Android 更新实现和原生安装验证待执行。
- 下一步：实现 fork 清单、递增 APK 版本和 Android 检查/下载/系统安装。

### 2026-09-12：补齐真实签名诊断

- 本轮目标：定位 APK 末端指纹校验失败，避免不透明地放行。
- 完成内容：修正版两个 macOS 包的验签、原生运行时和上传全部通过；APK 在 17m37s 完成编译，但指纹校验失败。
- 代码或文档变更：编译前先验证 Expo 模板公钥证书；保留签名诊断和失败 APK；直接从标准 PEM 证书计算摘要，避免依赖工具显示文案，仍要求所有证书匹配原固定指纹。
- 验证证据：[云构建](https://github.com/Fartown/orca/actions/runs/34695990279)；本机用相同 Expo 模板和 Google Build Tools 36 生成、签名最小探针 APK，输出固定指纹匹配。云端末端失败的原始证书输出此前未保留，不能据本机探针断言其根因。
- 未解决问题：补充诊断后的云构建待执行；首轮常规 PR 检查已全部通过。
- 下一步：用新流程核对云端模板证书和实际 APK 证书，再推进发布。

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
