---
title: '手机打开工作区终端身份恢复'
slug: '手机打开工作区终端身份恢复'
status: testing
created: 2026-10-24
updated: 2026-10-24
external_ids: ['STA-3859']
---

# 手机打开工作区终端身份恢复 开发 Journal

## 1. 关键文档链接

| 类型     | 文档                                                                                     | 状态         | 说明                                                                              |
| -------- | ---------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| 需求     | [requirements/手机打开工作区终端身份恢复.md](requirements/手机打开工作区终端身份恢复.md) | ready        | REQ-001 至 REQ-006 均待实现；REQ-006 已收窄到本次 adoption 兜底                   |
| 交互     | -                                                                                        | not-required | 不新增 UI，也无独立交互事实源                                                     |
| 调研     | [research/手机激活终端认领证据.md](research/手机激活终端认领证据.md)                     | ready        | 现场、受控实验、上游历史及证据限制                                                |
| 方案     | [solutions/手机工作区原终端身份恢复方案.md](solutions/手机工作区原终端身份恢复方案.md)   | approved     | 最终窄版源码经指定 Claude 代码 review APPROVE；仅代表本次 slice，不是全量产品验收 |
| 测试用例 | [tests/cases/手机终端原身份恢复.md](tests/cases/手机终端原身份恢复.md)                   | ready        | 17 条长期规格；每条执行结果在本 Journal 与 ignored 原始证据中分开记录             |

## 2. 决策点记录

### D-001 先登记设计阶段边界

- 日期：2026-10-24
- 背景：手机打开工作区触发空终端已完成本机受控调查；完整修复与 SSH 尚未验证。
- 备选项：直接登记产品实现文件；先登记需求、调研和评审方案。
- 最终决定：本轮先做文档阶段 Fork 登记，在独立 `feat/mobile-terminal-surface-recovery` worktree 评审方案。
- 原因：尚未确认最终模块接线，不能虚构 owned 源码、seams、测试或声称 REQ 已实现。
- 影响范围：REQ-001 至 REQ-006；实施时按方案扩展 registry、scope 和检查。
- 关联文档：[需求](requirements/手机打开工作区终端身份恢复.md)、[证据](research/手机激活终端认领证据.md)、[方案](solutions/手机工作区原终端身份恢复方案.md)。

### D-002 保留后台呈现语义并按宿主三态认领

- 日期：2026-10-24
- 背景：首轮 Claude 评审指出后台创建和唤醒投影不应混同，执行主机已退出与暂不可验证也不能混同；静态审计发现窗口会话成员关系还需收敛验证。
- 备选项：创建时即时显示标签或将所有认领失败都视作退出；保留后台创建语义并在后续 wake/显示时恢复原身份，按宿主活性结论分流。
- 最终决定：保留后台创建不即时桌面 reveal；后续投影使用原 tab/leaf。`live` 严格认领，`unverifiable`、关闭和冲突不 fresh，只有原执行主机正向确认 `exited` 且 surface 有效时交回原有恢复。主进程 durable 成员关系先于 renderer 投影，收敛路径待实施验证。
- 原因：受控实验仅证明 `terminal.create` 的后台语义，不能替代完整 `terminal.createAgentSession`；失联不是退出证据；renderer 单方面保存新成员无法代替 host binding。
- 影响范围：REQ-001 至 REQ-006；完整配对入口 V11 和恢复后持久化 V12 仍待验证。
- 关联文档：[需求](requirements/手机打开工作区终端身份恢复.md)、[证据](research/手机激活终端认领证据.md)、[方案](solutions/手机工作区原终端身份恢复方案.md)。

### D-003 设计批准不授权产品实施

- 日期：2026-10-24
- 背景：指定 Claude 第三轮定向复核给出 APPROVE，剩余非阻断 P2-7 指向首次接回 remount 的标记转交；全部验证仍为设计与源码阅读。
- 备选项：将设计批准视为实施和验收完成；仅结束方案评审并等待后续实施确认。
- 最终决定：方案标 `approved`，整体任务保持 `designing`，REQ-001 至 REQ-006 全部待实现；把 P2-7 同身份 remount 转交规则及 V08 验证写入设计，实施待用户后续确认。
- 原因：第三轮未运行单测、真机或 SSH 验证，且只定向复核第二轮剩余问题；设计批准不能替代产品修复或用户实施授权。
- 影响范围：REQ-006、W2、V08；当前不新增产品代码或正式测试。
- 关联文档：[需求](requirements/手机打开工作区终端身份恢复.md)、[证据](research/手机激活终端认领证据.md)、[方案](solutions/手机工作区原终端身份恢复方案.md)。

### D-004 撤回旧方案批准并重评技术路径

- 日期：2026-10-24
- 背景：指定 Claude 在第三轮批准后发出新消息撤回 APPROVE；上游 `79b87c4f7c` 三组本机对照显示单文件实验补丁可在该场景恢复原身份，而现行 SSH 唤醒路由与旧方案的覆盖假设不符。
- 备选项：继续按旧 10 处接缝方案推进；暂止旧方案，以新证据重新形成单文件方向并复核。
- 最终决定：旧方案降为 `draft` 并停止按其 10 处接缝推进，整体保持 `designing`，六项 REQ 全部待实现；单文件方向与 SSH 范围待新稿和独立复核，本轮不把实验补丁视为可发布实现或实施授权。
- 原因：设计批准已被原评审人明确撤回；三组结果仅是本机受控对照，SSH 仍是代码核查未实测，不能据此完成原需求。
- 影响范围：REQ-001 至 REQ-006、技术方案与后续验证矩阵；既往 D-001 至 D-003 保留为当时决策及历史记录，由本决策更新当前状态。
- 关联文档：[需求](requirements/手机打开工作区终端身份恢复.md)、[证据](research/手机激活终端认领证据.md)、[方案](solutions/手机工作区原终端身份恢复方案.md)。

### D-005 收缩为原身份兜底并进入实施

- 日期：2026-10-24
- 背景：用户明确授权推进到实际验证、代码 review 与 PR；上游单文件对照支持原身份方向，但调用方和关闭竞态反证不支持“全局只改一个文件”的保证。
- 备选项：继续已撤回的 10 文件路线；直接照搬仍带随机 fallback 的实验补丁；用 owned 策略与一个上游产品接缝完成原身份止血，并按实证决定是否扩边界。
- 最终决定：实施临时修复，新增 `src/renderer/src/mobile-terminal-surface-recovery/` 策略和测试，在 `worktree-agent-live-surface-adoption.ts` 一个产品接缝删除随机兜底；更新旧 gate 测试断言。REQ-006 限于本次 adoption 失败，通用连接 unknown 另列后续。默认不加 RPC/IPC、不启用布局 owner 暗开关；边界实测失败时仅增加必要接缝并重新评审。
- 原因：保留上游 stable pane 与现有激活行为，避免把 desktop `empty` seed 误当成 adoption 失败，也避免把本机单场景对照当作 SSH 验收。
- 影响范围：REQ-001 至 REQ-006；当前整体 `implementing`、方案 `reviewing`、正式 Test Case `draft`，全部 REQ 先保持待实现；实现结果和实际验证另记录。
- 关联文档：[需求](requirements/手机打开工作区终端身份恢复.md)、[证据](research/手机激活终端认领证据.md)、[方案](solutions/手机工作区原终端身份恢复方案.md)、[用例](tests/cases/手机终端原身份恢复.md)。

### D-006 保留非目标路径的上游 fallback

- 日期：2026-10-25
- 背景：指定 Claude 代码 review 给出 REQUEST_CHANGES；其 daemon 上游实测证明随机标签 fallback 可以 `isReattach:true` 接回同一 live PTY，无新增进程。此前“非目标全部 decline”会把原 agent 藏起来。
- 备选项：维持统一 decline；只新增 recorded tab 完全缺失时的原身份分支，其余保持上游 fallback。
- 最终决定：采用后者；REQ-006 限定新原身份分支不引入第二 writer，原 `bindToRecordedSurface` 先行，无 recorded、占用、原 leaf 缺失、跨工作区等仍按上游随机 fallback。numeric 本地 PTY 在这些非目标情形下可能继续留下空 shell，明确记为残留与后续范围。
- 原因：保留 daemon 的实测可用接回，不把本机 numeric 缺陷扩成所有 provider 的回归。关闭镜像迟到和跨轮多 leaf 尚需验证，不能提前宣称解决。
- 影响范围：REQ-006、临时方案、TC-003/004/005 及相关测试；整体 `testing`、方案 `reviewing`，全部 REQ 的实际验收状态待证据。
- 关联文档：[需求](requirements/手机打开工作区终端身份恢复.md)、[调研](research/手机激活终端认领证据.md)、[方案](solutions/手机工作区原终端身份恢复方案.md)、[用例](tests/cases/手机终端原身份恢复.md)。

### D-007 批准窄版代码评审并按用例范围结案

- 日期：2026-10-25
- 背景：Claude 第二轮解决阻断 P1，最终防御复核对四个源码文件的哈希一致快照给出 APPROVE（0 P0、0 P1）；本地和 SSH runtime 已有窄版执行证据，但多 leaf numeric、legacy relay、mixed peer 与 list→bind 微竞态未全量验收。
- 备选项：将局部证据升级为六项 REQ 全面完成；只批准当前有效 recorded、缺 tab、单 leaf slice，并逐 TC 报告结果与残留。
- 最终决定：方案标 `approved`，整体保持 `testing`；已执行的本地/daemon/SSH Git 与 folder repo 结果按 TC 和证据快照记录，未跑或被 selector 跳过的实例不标通过。上游 layout owner 正式翻转并完成本机、folder、SSH、关闭与迁移验收之前，不删除临时接缝。
- 原因：代码 review 与局部运行证据只覆盖窄版条件；P2-4 本机数字 PTY 多 leaf 循环和独立 folder selector 兼容边界仍在。
- 影响范围：REQ-001 至 REQ-006 的部分 slice，TC-001/004/006/013/014 及未运行用例；整体需求未标 `done`。
- 关联文档：[需求](requirements/手机打开工作区终端身份恢复.md)、[方案](solutions/手机工作区原终端身份恢复方案.md)、[用例](tests/cases/手机终端原身份恢复.md)。

## 3. 开发记录

### 2026-10-25 最终代码复核与窄版真实验证

- 本轮目标：根据最终四文件代码快照、Claude 复核与隔离本机/SSH 证据，按实际执行粒度更新方案和测试追踪。
- 完成内容：feature-owned helper 增加 `isValidHostTerminalTabId` 防御，不合规 web surface id 落回单次上游 fallback；最终 Claude 复核 APPROVE（0 P0、0 P1），剩 P2-4 本机 numeric 多 leaf 已知残留。隔离本机 numeric 三次激活及 renderer reload 保持原 PTY/PID/incarnation、新空 shell 0；daemon 三次激活后关闭再开未复活且 0 新 shell；手机先关闭从未在桌面显示的 tab、再激活三次，最终未复活且 0 新 shell。SSH managed orcad 的 Git 与 folder repo 各三次 mobile E2EE executionHost 激活，远端 PTY/incarnation 不变、本机和远端新 PTY 均 0。独立 `folder:<id>` 可远端创建终端，但三次 `worktree.activate` 都返回 `selector_not_found`，手机按 best-effort 跳过，未验证恢复分支。
- 代码或文档变更：Fork dependsOn 补 `src/shared/terminal-tab-id.ts`；方案改 `approved`、整体仍 `testing`，长期测试规格拆到可单独判定的 17 个 TC，README 重新生成。产品源码由实现代理修改，本 Journal 不代替其提交记录；本轮未提交或推送。
- 验证证据：本轮汇总 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/results.md`；最终 review `evidence/claude-code-review-final.md` 与 `evidence/code-review-manifest-final.json`；本机最终 guard 版 `evidence/final-local-reload-ready/steps.json`、`build/final-local-reload-ready.log`，此前本地原始 `evidence/narrow-local-reload/`、`evidence/narrow-daemon-close/`、`evidence/narrow-phone-close-never-shown/`，关闭顺序离线核对 `evidence/local-acceptance-summary.json`；SSH `evidence/ssh-runtime/steps.json`，清理 `evidence/ssh-cleanup-final.json`（夹具进程 0、专用 key 0、两处临时目录已删除）。最终静态门禁 `build/final-tc.log`、`build/final-tests.log`（59/59）、`build/final-code-quality.log`（按 PR base 扫描 0 finding）均 exit 0；本地化 extraction、catalogs、coverage 三门见 `build/dod-localization-*.log`，均通过。以下为当前证据快照，不把用例规格或代码 review 算作执行通过：

  | 用例/实例                         | 结论                      | 证据边界                                                                                                                                             |
  | --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
  | TC-001 本机 numeric 三次＋reload  | PASS（最终 guard 版源码） | 三次激活原 tab/leaf、PTY/PID/incarnation 连续，0 新空 shell；reload 后标签总数仅 baseline＋原 tab，PID/incarnation 不变；静止/后续输出由 TC-016 单测 |
  | TC-004 手机先关从未桌面显示的 tab | PASS（正常先关后开）      | 三次再打开 0 新空 shell、最终无原 tab；offline store 仅有关闭后快照，不覆盖 list→bind 微窗口                                                         |
  | TC-006 ssh-git / ssh-folder       | PASS / PASS               | managed orcad 各三次 activated true；远端 PTY/incarnation 连续，本机/远端新 PTY 0；不代表 SSH UI 映射 TC-017                                         |
  | TC-013 daemon 关闭后再开          | PASS                      | 三次激活 0 新 shell，关闭后最终 `noRevival:true`                                                                                                     |
  | TC-014 SSH 独立 folder            | INCONCLUSIVE              | `terminal.create` 成功；三次 activate 均 `selector_not_found` 并按既有 best-effort 跳过，0 新 PTY 仅证明安全跳过                                     |
  | TC-002/003/005/007～012/015～017  | NOT RUN                   | 含 legacy relay 真机、mixed peer、微竞态、内容/UI 及多 leaf；源码推导和上游对照不算当前运行                                                          |

- 未解决问题：独立 folder 恢复分支、legacy relay 真机、mixed peer、list→bind 微竞态、同/跨轮多 leaf、普通 connect unknown 与所有宏观 REQ 均未全量验收。SSH 长路径 Unix socket `EINVAL` 是初次夹具问题，已改短 `/private/tmp` 路径重跑，不记产品 FAIL；此前最终 guard 版 reload 立即请求曾遇瞬时 `runtime_unavailable`，驱动记录 readiness 等待后重跑通过，产品代码未增加重试。
- 下一步：由主代理统一格式化、暂存、提交与推进 PR，并核对 PR CI；PR 记录当前 slice 和已知残留，整体保持 `testing`。

### 2026-10-25 Claude 代码 review 后收窄实现边界

- 本轮目标：处理代码 review 的 daemon 反例，修订需求、方案、测试规格与 Fork 依赖，不预记修订代码通过。
- 完成内容：review 为 REQUEST_CHANGES（0 P0、1 P1、3 P2）。P1 推翻非目标统一 decline：仅新增有效 recorded 且原 tab 完全缺失时的原身份分支，其他随机 fallback 保留。将 other-client close-never-shown 的幽灵标签风险、daemon 非目标接回、同 tab 多 leaf 跨轮残留写入验证清单。
- 代码或文档变更：需求、调研、方案、测试用例、Journal 与依赖登记按实现代理最终 imports 对齐；产品修订由实现代理负责，本记录不回退或覆盖其文件。未提交或推送。
- 验证证据：Claude 原始报告 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/evidence/claude-code-review.md`；其 daemon 对照在上游 `79b87c4f7c`，不是本 PR 修订代码的运行验收。修订文档后 task-leader 结构校验通过（5 文档、6 REQ、11 TC、6 决策），`pnpm check:fork-features`、`pnpm check:fork-docs`、`pnpm check:architecture-policies` 与 `git diff --check` 通过；主代理正在做本机/SSH 实验，本记录尚未收到结果。
- 未解决问题：review 的 P1 修订仍需复审；关闭镜像迟到与跨轮多 leaf 未证明解决；本机 numeric 不可恢复情形的旧空 shell 残留；实际验收和全部 REQ 状态待证据。
- 下一步：实现代理稳定后重跑当前代码门禁、隔离本机/SSH 用例和 Claude 复审；据实际结果逐项更新状态并推进 PR。

### 2026-10-24 Fork 实施登记与临时修复新稿

- 本轮目标：将用户授权的原身份止血落到 Fork 登记、精简方案和可追踪测试规格，不预记产品运行结果。
- 完成内容：与实现代理确认一个上游产品接缝、feature-owned 策略与测试、旧 gate 测试接缝及直接依赖；登记 scope、dependsOn、seams、checks。重写撤回旧稿为临时修复设计，说明 desktop `empty` 可 seed、手机 background 不消费 `empty`，以及关闭镜像、SSH runtime/legacy 的验收边界。建立关联 REQ 的本机/folder/SSH Test Case。
- 代码或文档变更：`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、需求、方案、测试用例与本 Journal；产品文件由并行实现代理负责，未由本记录预判其结果。未提交或推送。
- 验证证据：以当前 integration `f3a9db157f` 为基线，task-leader 结构校验通过（5 文档、6 REQ、9 TC、5 决策），`pnpm check:fork-features`、`pnpm check:fork-docs`、`pnpm check:architecture-policies` 均通过（架构检查 21 组 policy）；`git diff --check` 通过。此为文档与登记门禁，不代表产品验收。
- 未解决问题：实际 Claude 代码 review、本机/SSH/配对运行验收及旧 peer 构建数据未完成；全部 REQ 待实现或待验收。
- 下一步：产品实现后运行结构、类型、定向与 Fork 门禁；按用例采集真实证据，修复发现的问题并送 Claude review，完成后再由主代理推进 PR。

### 2026-10-24 单文件方向的调用方与关闭边界复核

- 本轮目标：回答单文件止血是否足以覆盖激活链，并核对 renderer 关闭镜像与 main 守卫各自能保证什么。
- 完成内容：上游实验补丁命中原 recorded surface 时有效，但其他情形仍保留随机 fallback。adoption 若仅返回 `declinedPtyIds`、`surfaced=false`，gate 可转为 `empty`；显式激活及启动 watcher 可能据此 seed 新 tab，手机后台 wake 不消费 `empty`，但 gate 前已有 wake/mount 且 gate 仍可能 resume。renderer 先建原标签、main 后续拒绝连接或绑定时，不能保证标签未短暂复活；`empty` 另建随机身份时也不能靠原 tombstone 保证不 spawn。
- 代码或文档变更：仅更新[调研](research/手机激活终端认领证据.md)与本 Journal；主方案仍 `draft`，整体 `designing`，全部 REQ 待实现。未改需求、产品源码、配置、索引，未提交。
- 验证证据：源码静态核查 `src/renderer/src/lib/worktree-agent-live-surface-adoption.ts:181-255`、`worktree-agent-activation-gate.ts:211-262`、`worktree-activation-gated-empty-reseed.ts:24-56`、`wake-sleeping-agents-in-background.ts:171-219`、`use-terminal-watcher-effects.ts:220-262`、`src/main/ipc/pty/pane/pane-spawn-operation.ts:41-64`；上游 `stopgap-experiment.patch` 仍有随机 fallback。本轮未重跑三组本机对照、未运行新测试或 SSH 实验。
- 未解决问题：单文件方向尚未形成新稿；关闭竞态、caller 端到端、完整 SSH runtime/legacy 路由待验证。Fork 新策略暂以 owned 路径、目标一个上游接缝的原身份止血为约束，不承诺最终只有一个产品文件；默认不新增 RPC/IPC、不顺带修通用 unknown 错误，边界证据失败时只增所需最小接缝。
- 下一步：把上述调用方结果和竞态列入新方案验证矩阵，取得新稿复核后再决定实施范围；本轮不启动产品实施。

### 2026-10-24 第三轮批准撤回与上游对照登记

- 本轮目标：按指定 Claude 新消息更正当前评审状态，记录上游本机对照及 SSH 证据边界。
- 完成内容：将方案状态由 `approved` 改为 `draft`，停止推进旧 10 处接缝路径；保留需求行为目标并标明技术方案待重写。上游 `79b87c4f7c` 三组本机对照分别为发布版新增 3 个空 shell、布局暗开关版新增 0 个但即时桌面 reveal、单文件实验补丁版新增 0 个且原 tab/leaf 接回。SSH 唤醒路由结论仅来自代码核查，未实测。
- 代码或文档变更：本轮仅更新需求、调研和 Journal；未改主方案、产品源码、配置或索引，未提交。
- 验证证据：新评审消息 `msg_35993fb35a08`；原调查 `.docs/mobile-empty-terminals-investigation/2026-10-24/README.md` 的“上游对照实测”及 `evidence/upstream-79b87c4f7c/`。本轮没有重跑三组实验。
- 未解决问题：单文件方向尚无新方案或复核；无记录 orphan、关闭竞态、SSH 旧 relay 与完整产品场景未验收；全部 REQ 待实现。
- 下一步：基于新证据重新界定技术方案和 SSH 范围，交回指定评审人复核；是否实施另待用户确认。

### 2026-10-24 第三轮设计通过与 remount 边界收尾

- 本轮目标：记录指定 Claude 第三轮定向复核结论，并同步非阻断 P2-7 的需求与证据边界。
- 完成内容：评审结果为设计层面 APPROVE，剩余 0 P0、0 P1、1 P2；主方案补首次接回未完成时同 executionHost/worktree/tab/leaf/ptyId/incarnation remount 的严格分类转交、旧回调不能清继任标记，以及 V08 用例。Journal 方案状态改 `approved`，整体仍 `designing`，所有 REQ 待实现。
- 代码或文档变更：本轮仅更新需求、调研和 Journal；主方案由并行负责者更新；未改产品源码、配置、正式测试，未提交。
- 验证证据：第三轮只读报告 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/evidence/claude-review-3.md`；评审人未运行测试，补入主稿的 P2-7 规则也未经过产品验证。
- 未解决问题：V01～V12 全部待实施后实测，本机/SSH 真实验收未完成；实施须用户后续确认。
- 下一步：在用户确认实施后登记真实 owned source、seams、dependsOn 和检查，完成产品实现与本机/SSH 验收。

### 2026-10-24 第二轮评审反馈与 v3 定向修订

- 本轮目标：逐条核对第二轮 Claude 只读报告，并使需求、调研、Journal 与 v3 的 W2 边界一致。
- 完成内容：第二轮仍为 REQUEST_CHANGES；首轮 9 条中 8 条在设计层面解决，P1-3 余项转为 P1-6；本轮新增 0 P0、1 P1、2 P2。v3 将两个 renderer 接缝改为 W2 确定修改：本次接回标记限定 unknown/无 PTY id 的失败分类，人工 retry 保持严格上下文；live 成功接回不因无回放和睡眠记录退役原 PID；明确退出证据为 SessionNotFound、sessionExpired、isSshSessionGoneError，HostGone 不由 renderer 猜退出。
- 代码或文档变更：本轮仅更新需求、调研和 Journal；主方案由并行负责者修订；未修改产品源码、测试、配置，未提交。
- 验证证据：Claude 第二轮只读报告 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/evidence/claude-review-2.md`；v3 §5.4/§5.5 与 V04/V08 已对应。报告未运行单测、真机或 SSH 验证。
- 未解决问题：v3 等待原评审人定向复核；W2 仍未实现；V04/V08、完整配对入口 V11、持久化时序 V12 未运行；全部 REQ 待实现。
- 下一步：取得定向复核结论；实施阶段先固定已知错误分支，再验证普通恢复不受影响及本机/SSH 真实路径。

### 2026-10-24 首轮评审反馈与 v2 文档对齐

- 本轮目标：处理指定 Claude 的首轮评审，核对后台创建和窗口会话收敛证据，使需求、调研与 v2 方案一致。
- 完成内容：首轮结论为 REQUEST_CHANGES，0 P0、5 P1、4 P2；v2 方案补主进程 durable 成员关系提交、既有保存重基、后台不即时 reveal、`live`/`unverifiable`/`exited` 分流及 V11/V12 验证边界。需求和调研同步明确待实现、待验证。
- 代码或文档变更：本轮仅更新需求、调研和 Journal；主方案由并行负责者修订；未改产品源码、正式测试，未提交。
- 验证证据：首轮报告 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/evidence/claude-review-1.md`、收敛审计 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/evidence/convergence-audit.md`、后台源码审计 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/evidence/background-source-audit.md`；均为忽略目录中的只读/受控证据，不是自然手机或 SSH 验收。
- 未解决问题：v2 尚待复审；完整配对 `terminal.createAgentSession`（V11）与恢复后新建/关闭/split、patch/set/unload/重启的本机和 SSH 收敛（V12）未验；全部 REQ 待实现。
- 下一步：复审 v2；实施阶段按最终方案补产品接线与高价值测试，再分别完成本机和 SSH 真实验收。

### 2026-10-24 正式方案送交指定 Claude 审阅

- 本轮目标：完成技术方案并交由用户指定的既有 Claude 对话独立审查。
- 完成内容：写成 376 行主方案，包含系统/用户/状态三张图、复用评估、目标 TypeScript/Zod 契约、主机所有权、失败回退与验证矩阵；通过 Orca 会话邮箱发送给“排查频繁报错原因”，收件会话已显示 working。
- 代码或文档变更：主方案及本 Journal；未修改产品源码、正式测试或用户配置，未提交/推送。
- 验证证据：task-leader 结构与链接校验通过；Fork docs/features 原脚本通过；架构仍有与基线一致的 13 条 reference-drift，详见仓库根目录 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/README.md`。投递消息 msg_e581ab68737a，原回执在同证据目录 evidence/claude-review-send.json。
- 未解决问题：Claude 尚未返回结论；产品修复与 SSH/关闭竞态等验收仍未完成，不能标 approved 或 done。
- 下一步：读取指定 Claude 的实际报告，逐条处理方案问题并记录评审结论；未获实施授权前不写产品代码。

### 2026-10-24 设计阶段 Fork 登记

- 本轮目标：建立手机终端身份恢复的可审查事实与 Fork 文档登记。
- 完成内容：按主方案测试矩阵整理六个待实现 REQ 的本机/SSH 行为和验收，记录本机证据、上游来源及运行限制；声明无新增 UI、测试规格待决定。
- 代码或文档变更：仅需求、调研、Journal、Fork registry/文档 scope/白名单和生成索引；未修改产品源码或测试实现，未提交。
- 验证证据：文档与功能门禁通过；架构门禁的 13 条 reference-drift 与未改动 root 基线完全相同。原始输出记于 `.docs/mobile-terminal-surface-recovery-ui-validation/2026-10-24/build/`；本地调查原始证据见[调研](research/手机激活终端认领证据.md)。
- 未解决问题：方案仍在评审；关闭竞态、旧 peer、SSH 与配对 runtime 未完成产品验收；所有 REQ 待实现。
- 下一步：评审主方案；实施前按实际接线扩展 owned 源码、seams、测试和检查，再执行本机与 SSH 真机验证。
