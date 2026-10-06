---
title: "移动端上传任意文件"
slug: "移动端上传任意文件"
status: testing
created: 2026-10-06
updated: 2026-10-06
external_ids: []
---

# 移动端上传任意文件 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/移动端上传任意文件.md](requirements/移动端上传任意文件.md) | ready | REQ-001~006：入口、落到工作区所在机器、交给终端或 agent、100 MiB、新旧版本组合、临时文件清理 |
| 交互 | - | not-required | 沿用现有底部菜单与附件按钮，无独立设计稿 |
| 调研 | [research/移动端附件上传现状与技术链路.md](research/移动端附件上传现状与技术链路.md) | ready | 两种会话页形态、选择器、上传与落盘、目标机器判定、交付方式、版本兼容 |
| 方案 | [solutions/移动端文件附件上传方案.md](solutions/移动端文件附件上传方案.md) | reviewing | 新 RPC `fileAttachment.*` 流式写入目标机器临时目录；手机壳新接口 `native.file.*`；图片旧通道保留 |
| 测试用例 | [tests/cases/移动端上传任意文件.md](tests/cases/移动端上传任意文件.md) | ready | TC-001~018，覆盖本机与 SSH；执行记录见 [电脑端第一轮](tests/runs/2026-10-06-real-app-host-round-1.md)、[电脑端第二轮](tests/runs/2026-10-06-real-app-host-round-2.md)、[云真机第一轮](tests/runs/2026-10-06-cloud-device-round-1.md)、[云真机第二轮](tests/runs/2026-10-06-cloud-device-round-2.md) |

## 2. 决策点记录

### D-008 新桥接接口只占会话路由一个授权名额

- 日期：2026-10-06
- 背景：云真机第一轮发现，会话路由加上 `native.file.pick/read/release` 后授权共 17 个，超过主机与手机共同遵守的协议上限 16，电脑端拒收整份网页包，所有网页页面退回原生；构建期校验没有拦住
- 备选项：
  1. 调高上限：手机端也按 16 解析，旧手机壳会拒收新清单，不可行
  2. 放弃网页版的新接口：网页版会话页只能传约 18 MiB、文件名按类型生成，不满足已确认的 100 MiB
  3. 只新增 `native.file.pick`，句柄放进媒体登记，读取与释放走 `native.media.read/release`，读取偏移上限放宽到 100 MiB
- 最终决定：采用 3，并新增路由协议守护测试
- 原因：会话路由降为 15 个授权；放宽读取偏移对新旧版本组合安全（只有授予 `native.file.pick` 的新手机壳才会收到大偏移的读取）；手机壳侧重复的读取循环随之删除
- 影响范围：REQ-004、REQ-005；方案 §6；TC-003、TC-015

### D-007 聊天输入框插入纯路径，不用 `@路径`

- 日期：2026-10-06
- 背景：云真机第一轮中，聊天里含 `@路径` 的消息在 Claude 终端里停在输入框不提交：`@` 打开文件提及菜单，菜单吞掉发送时的回车；手动输入 `@/tmp/...` 同样复现
- 备选项：保留 `@路径` 并在发送前关掉菜单；插入纯路径（含空格时加引号）
- 最终决定：插入纯路径，并一律加引号（云真机第二轮又发现：以 `/` 开头的路径会弹 Claude 的斜杠命令建议）
- 原因：agent 能直接按绝对路径读取文件；不依赖各家终端 agent 的提及或斜杠命令菜单行为（Codex 输入 `@` 也会弹文件搜索，Q-3）
- 影响范围：REQ-003；方案 §5.4；TC-010

### D-006 SSH 主机上的上传目录放远端家目录，不放 `/tmp`

- 日期：2026-10-06
- 背景：自查发现 relay 的 `fs.tempDir` 在 Linux 上就是共享的 `/tmp`；relay 与 SFTP 按默认 umask 建目录和文件（通常 0755 / 0644），文件接口没有改权限的方法。多人共用的服务器上，别的账号能读到用户上传的 PDF、压缩包
- 备选项：
  1. 仍放 `/tmp`，接受风险（上游剪贴板图片 `/tmp/orca-paste-*.png` 现状如此）
  2. 给 relay 增加改权限或带 mode 的建目录接口：要改上游 relay 与 provider，接缝大
  3. 放远端用户家目录 `~/.orca-remote/file-attachments/`，靠家目录权限挡住其他账号
- 最终决定：采用 3，并在 POSIX 主机上经 SSH 执行一次 `chmod 700` 把上传根目录设为私有（代码审查指出家目录在部分发行版是 0755，单靠家目录挡不住）
- 原因：不改上游文件接口；根目录 0700 后其下所有上传对其他账号不可见，与本机 0700 私有根目录一致；与 Orca 远端的其他数据放在一处，便于用户找到和清理
- 影响范围：REQ-002、REQ-006；方案 §3、§4.3；TC-005

### D-005 移动端放行用 fork 自有名单，不改上游白名单文件

- 日期：2026-10-06
- 背景：上游 `runtime-rpc-mobile-method-allowlist.ts` 恰好 300 个有效行（`max-lines` 上限），且 `mobile-rpc-allowlist.test.ts` 按字面量解析该文件；加任何一个方法都会让提交钩子失败，而仓库规则禁止放宽 `max-lines`
- 备选项：
  1. 把 4 个方法合成 1 个带操作字段的方法：仍超 1 行
  2. 拆分上游白名单文件：改动大，每次上游同步都会冲突
  3. 新建 fork 自有名单，分发处同时认两个名单，测试同时读两个文件
- 最终决定：采用 3
- 原因：上游白名单保持逐字一致；fork 侧只有分发处一行判断和测试里读文件的一处是接缝；以后 fork 功能的移动端方法都登记在同一处
- 影响范围：REQ-001；方案 §4.5、§8

### D-004 新增专用 RPC，不扩展剪贴板图片接口、不开放通用文件写入

- 日期：2026-10-06
- 背景：手机要把任意文件写到工作区所在机器的临时目录，且主机不能把整个文件放进内存
- 备选项：
  1. 给 `clipboard.*Upload` 加可选文件名：旧主机会静默丢掉该字段，把 PDF 存成 `.png`，违反兼容规则
  2. 对手机开放 `files.writeBase64Chunk`：只能写进工作区目录，没有槽位、过期与失败清理，且等于开放通用二进制写权限
  3. 新增 `fileAttachment.startUpload / appendUploadChunk / commitUpload / abortUpload`
- 最终决定：采用 3
- 原因：旧主机对未知方法明确拒绝，手机能识别并给出「需要更新」；目标机器、目录、命名、清理全由电脑端决定，以后调整不需要升级手机
- 影响范围：REQ-002、REQ-004、REQ-005、REQ-006；方案 §4

### D-003 单文件上限 100 MiB，电脑端边收边写

- 日期：2026-10-06
- 背景：现有图片通道上限约 18 MiB，且主机把整个文件留在内存里
- 备选项：沿用 18 MiB；提高到 100 MiB 并改为流式写入
- 最终决定：100 MiB，流式写入（用户确认）
- 原因：覆盖大多数 PDF、压缩包和日志
- 影响范围：REQ-004；网页版会话页需要手机壳新接口才能超过 18 MiB（方案 §6）

### D-002 附件按钮点按弹出「照片 / 文件」

- 日期：2026-10-06
- 背景：终端输入栏现在是点按相册、长按文件，长按几乎无人发现；聊天输入框没有文件入口
- 备选项：保持现有手势；点按弹出选择
- 最终决定：点按弹出选择，终端与聊天一致（用户确认）
- 原因：入口可发现，两个输入框行为一致
- 影响范围：REQ-001

### D-001 文件放主机临时目录并保留原名

- 日期：2026-10-06
- 背景：文件需要落在 agent 能读到的机器上
- 备选项：主机临时目录；工作区内固定目录；两者都做（另加文件面板上传）
- 最终决定：主机临时目录，保留原文件名，不进工作区（用户确认）
- 原因：不污染 `git status`，用途是交给 agent 或终端
- 影响范围：REQ-002、REQ-006；Q-2（工作目录外文件的权限确认）待真机验证

## 3. 开发记录

### 2026-10-06 云真机第二轮与聊天路径加引号

- 本轮目标：验证网页版会话页、聊天纯路径的提交与 Q-2
- 完成内容：网页版会话页上入口、选择器、原名与 60 MiB、超限、聊天交付均通过；Q-2 观察到非 bypass 模式首次读取会弹「Read outside the working directories」；发现以 `/` 开头的路径会弹斜杠命令建议，聊天路径改为一律加引号
- 代码或文档变更：`src/shared/file-attachment-upload/file-attachment-delivery-text.ts` 及测试；本目录需求、方案、用例与执行记录
- 验证证据：[tests/runs/2026-10-06-cloud-device-round-2.md](tests/runs/2026-10-06-cloud-device-round-2.md)；共享 12 例、手机端 34 例通过
- 未解决问题：Q-2 是否改放工作区内待用户决定；Q-3 未验证；加引号后的聊天路径未在真机上复测（格式改动，单测覆盖）；第二轮中 Claude 一度使用真实 HOME，真实 `~/.claude/` 下的 daemon 日志与备份未清理（详见执行记录第 4 节）
- 下一步：合入 `fork/integration` 最新提交，跑全部门禁，推送并开 PR

### 2026-10-06 代码审查与云真机第一轮的修复

- 本轮目标：处理代码审查 9 条与云真机第一轮的 2 个缺陷
- 完成内容：云真机第一轮在原生会话页上验证了入口菜单、系统选择器、终端上传与 `unzip -l`、超限提示、Claude Code 读取 PDF、聊天交付；发现网页包因授权超限被整份拒收（D-008）与聊天 `@路径` 不提交（D-007），均已修复。审查 9 条的处理：聊天缓存副本改为凡不作待发图片就释放；SSH 上传根目录 `chmod 700`（D-006）；Windows 保留名按第一个点判断并补 `CONIN$`/`CONOUT$`；base64 长度改为对无填充尾块也正确；单次选择合计不超过 200 MiB；按客户端限并发 4、全局 16；SSH 攒到 4 MiB 再写远端；SSH 写入目标按连接缓存；手机壳侧重复的读取循环随 D-008 删除，路径转义的副本因手机端无法引用 renderer 保留，由对照测试防漂移
- 代码或文档变更：`src/main/file-attachment-upload/**`、`src/main/runtime/rpc/methods/file-attachment-upload*.ts`、`src/shared/file-attachment-upload/**`、`mobile/src/file-attachment-upload/**`；上游接缝新增 `mobile/src/mobile-web-shell/bridge/bridge-media-verbs.ts`（读取偏移上限）；新增 `config/scripts/mobile-web-page-routes-contract.test.mjs`
- 验证证据：[tests/runs/2026-10-06-cloud-device-round-1.md](tests/runs/2026-10-06-cloud-device-round-1.md)；[tests/runs/2026-10-06-real-app-host-round-2.md](tests/runs/2026-10-06-real-app-host-round-2.md)（8 项全过，远端根目录 700）；重新构建的网页包清单通过协议校验；`pnpm tc`、手机端 `typecheck`、功能 checks（40 + 147 例）、`check:fork-features`、`check:fork-docs`、`check:architecture-policies --base Fartown/main`、`verify:rpc-params-catalog`、`check:runtime-electron-ratchet` 通过
- 未解决问题：网页版会话页（TC-018）与聊天纯路径的自动提交需要云真机第二轮确认；Q-2 需在非 bypass 的 Claude 会话里观察；Q-3 未验证
- 下一步：云真机第二轮，随后推送并开 PR

### 2026-10-06 真实 App 电脑端验证（本机 + SSH）

- 本轮目标：在真实 App 上验证电脑端写入、SSH 路由、断连、清理与手机权限边界
- 完成内容：编写 TC-001~017；隐藏隔离的本分支 e2e 构建 + 本机 root sshd（远端 HOME 隔离）上以手机身份跑 8 项检查，全部通过
- 代码或文档变更：`docs/issue/移动端上传任意文件/tests/**`；验证脚本 `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/scripts/`
- 验证证据：[tests/runs/2026-10-06-real-app-host-round-1.md](tests/runs/2026-10-06-real-app-host-round-1.md)；`.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/run-1791279687469/checks.json`
- 未解决问题：手机界面（入口、系统选择器、聊天交付、Claude Code 读取 PDF）尚未真机验收；Q-1、Q-2、Q-3 仍待确认
- 下一步：云真机上用本分支构建的 App 连本分支电脑端，跑 TC-001、TC-002、TC-003、TC-009、TC-010

### 2026-10-06 手机壳新接口与网页版会话页

- 本轮目标：网页版会话页在新手机壳上保留原文件名并支持 100 MiB；旧手机壳照常可用
- 完成内容：新增桥接接口 `native.file.pick / read / release`（独立句柄登记、100 MiB 上限、非本 App 缓存副本一律拒绝、整次拒绝时删除已暂存副本）；会话路由把三者列为可选授权；页面在选择时按手机壳授权决定走新接口还是 `native.media.*`；补上真实 WebSocket + 端到端加密 + 移动端设备身份的集成测试
- 代码或文档变更：`mobile/src/file-attachment-upload/{bridge-file-verbs,native-file-verbs,use-native-file-verb-server,file-attachment-picker.web}.ts`；接缝 `bridge-native-verbs.ts`、`use-native-device-verbs.ts`、`bridge-port-pair-test-harness.ts`、`mobile-web-page-routes.mjs`、按键栏探针 `mobile-web-app-held-press-probe-routes.mjs`；授权清单钉住测试 `page-route-policy.test.ts`、`bridge-host-init.test.ts`
- 验证证据：`file-attachment-upload-mobile-ws.test.ts` 通过（手机身份上传 600 KB 文件逐字节一致，`files.writeBase64Chunk` 对手机仍为 `forbidden`）；手机端 `src/file-attachment-upload`、`src/mobile-web-shell`、`src/platform` 共 116 个测试文件通过；按键栏长按渲染门禁 7 例通过（曾因探针缺 `fileAttachments` 失败，已修）；`pnpm tc`、手机端 `typecheck`、`check:fork-features` 通过
- 未解决问题：本机 Playwright 的 WebKit 下载失败，webkit 相关的网页渲染门禁（mermaid、HTML 预览、抽屉、原生一致性、栈切换）本机无法执行，留给 CI；chromium 下同组门禁通过
- 下一步：隔离的真实 App 验证本机与 SSH 工作区（本机 sshd 127.0.0.1:2222，远端 HOME 隔离）

### 2026-10-06 电脑端上传接口与手机端入口

- 本轮目标：实现电脑端 `fileAttachment.*` 流式写入，以及手机端「照片 / 文件」入口、上传与交付
- 完成内容：电脑端按工作区判定目标机器（与终端启动同一规则），边收边写入本机或 SSH 主机的 `orca-file-attachments` 临时目录，带槽位归属、偏移校验、5 分钟空闲过期、失败清理与 7 天保留期清扫；手机端附件按钮改为弹出「Photo / File」，原生会话页用系统文档选择器分块读取，网页版会话页先走现有 `native.media.*`（约 18 MiB、名字按类型生成）；终端插入转义路径或图片粘贴，聊天输入框插入 `@路径` 或加入待发图片；旧电脑端只放行可作为附件的图片，其余提示更新
- 代码或文档变更：`src/shared/file-attachment-upload/**`、`src/main/file-attachment-upload/**`、`src/main/runtime/rpc/methods/file-attachment-upload*.ts`、`src/renderer/src/file-attachment-upload/**`、`mobile/src/file-attachment-upload/**`；接缝见方案 §8 与 `config/fork-features.jsonc`
- 验证证据：电脑端 `file-attachment-upload.test.ts` 16 例（本机、SSH 假文件系统、文件夹工作区、Windows 远端路径、断连、清扫、归属、偏移、并发、过期）与共享模块 13 例通过；`src/main/runtime/rpc` 全量 352 个测试文件通过；手机端功能 24 例通过，手机端全量 944 个测试文件中与本功能相关的 4 个已修复；`pnpm tc`、手机端 `typecheck`、`check:runtime-electron-ratchet`、`verify:rpc-params-catalog`、`check:fork-features`、`check:fork-docs`、`check:architecture-policies --base Fartown/main` 通过
- 未解决问题：手机端 `terminal-webview-payload-hash.test.ts` 在本机失败，原因是本机手机端依赖未随 4 天前的锁文件更新，与本功能无关；`check:tests-typecheck` 报 3 个「移动端续接会话」测试文件，同为既有问题；网页版会话页还没有原名与 100 MiB
- 下一步：手机壳新增 `native.file.pick/read/release`，网页版会话页在新手机壳上用原名与 100 MiB；随后做本机与 SSH 真机验证

### 2026-10-06 登记需求、调研与方案

- 本轮目标：按 fork 流程登记「移动端上传任意文件」，完成需求、调研与方案，进入实现
- 完成内容：用户确认存放位置、入口与大小上限三项取舍；完成现状调研（两种会话页形态、上传链路、目标机器判定、交付方式、版本兼容）；完成技术方案；在 `feat/mobile-file-attachment-upload` 分支登记功能
- 代码或文档变更：`docs/issue/移动端上传任意文件/**`、`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`
- 验证证据：`pnpm check:fork-features`、`pnpm check:fork-docs`、`pnpm check:architecture-policies -- --base Fartown/main` 通过，提交 `112fd202d3`
- 未解决问题：Q-1 保留期取值；Q-2 Claude Code 读取工作目录外文件是否弹权限确认；Q-3 Codex 对 `@路径` 的处理
- 下一步：实现电脑端 `fileAttachment.*` 与单测
