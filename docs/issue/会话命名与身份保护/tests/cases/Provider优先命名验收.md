---
title: Provider优先命名验收
document_type: test-case-list
status: ready
created: 2026-09-08
updated: 2026-09-10
issue: 会话命名与身份保护
---

# Provider优先命名验收

2026-09-09：按用户此前确认的完整目标恢复实施与测试。规格已同步[方案§6.2](../../solutions/Provider优先的会话命名统一方案.md#62-验收矩阵)：不新增人工名存储、编辑RPC或迁移；旧人工值只兼容回退，TC-200与既有v4迁移回归保留。此文档仅定义预期；执行结果以Test Run为准，ready不代表通过。

## 1. 替代范围与矩阵

- 本文件取代旧《Issues功能测试》中TC-060、TC-201～211、TC-214～223的命名优先级、权威存储、触发与消费断言；旧编号保留为历史兼容基线，不再要求实现旧Issues专属刷新器或人工名主显。
- TC-212/213的v4历史迁移仍需保留回归；TC-200的人工名与辅助会话过滤语义不因显示优先级改变而删除；TC-229/230的日志和隔离约束继续适用。
- UI消费矩阵：Workspace、Issues左侧/详情/绑定、Tab/分组/浮窗、Cmd+J/最近切换/拖拽/关闭确认、普通/弹出Dashboard与Agent Map、History及其删除/接续旁路、Activity、通知、Goal/Notes选择器、mobile/headless、structured Chat。
- 同名比较以相同profile/authority、执行scope、Provider identity及结果revision为前提；通知比对事件发生时捕获的会话名，不要求旧通知追溯改写。

## 2. 用例

### TC-231 全候选Provider优先

- 关联需求：REQ-025
- 输入和操作：Provider、人工、prompt、OSC、custom/quick同时存在；走全部消费矩阵
- 预期：Provider主显；Agent Tab和左侧一致；没有链外抢占

### TC-232 无Provider逐层回退

- 关联需求：REQ-025
- 输入和操作：按顺序移除人工、prompt、可信OSC、归属label
- 预期：各处依次显示同一人工/派生/实时/label/fallback；空白跳过

### TC-233 首prompt不冒充Provider

- 关联需求：REQ-025
- 输入和操作：scanner只有首问摘要，另有人工名
- 预期：人工名优先；来源明确为prompt而非provider；不开额外LLM

### TC-234 Provider晚生成与改名

- 关联需求：REQ-025
- 输入和操作：Claude ai/custom变化；Codex只更新index，transcript不变
- 预期：冷热/完整增量一致，已挂载各消费面收敛，无需重开Issues

### TC-235 失败和明确清除

- 关联需求：REQ-025、REQ-026
- 输入和操作：同identity已知Provider名；依次模拟断线、空结果、missing字段、明确撤销
- 预期：前三者不伪装撤销；明确撤销才去掉Provider候选，按相同回退排序

### TC-236 已有人工名兼容

- 关联需求：REQ-025、REQ-026
- 输入和操作：Provider存在/不存在两组；沿旧入口保存、取消、Clear、冲突与写失败
- 预期：Provider存在时主名不变；不存在时已有人工值回退生效；沿旧revision/失败合同，不新增tombstone或公共编辑RPC

### TC-237 无Issues独立工作

- 关联需求：REQ-025、REQ-026
- 输入和操作：无Issue/无Conversation或停用Issues装配，保留Provider identity
- 预期：Workspace/Tab/History/通知仍能一致自动命名；缺席旧人工适配不阻塞，也不创建新的DB或编辑入口

### TC-238 Issue组织不改名

- 关联需求：[Issues：原子绑定与改名](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-008-原子绑定与改名)、REQ-025、REQ-026
- 输入和操作：bind/rebind/unbind/delete Issue
- 预期：名称与公共记录不变；不新增专属标题请求/快照写入；session和Round保留原合同

### TC-239 旧数据保留

- 关联需求：[Issues：SQLite 与迁移](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-014-sqlite-与迁移)、REQ-026
- 输入和操作：旧user/legacy人工名、Provider/minted值和Tab custom并存
- 预期：不搬迁/删列；精确identity的旧人工值才进第2层；旧Provider快照不冒充原生证据；容器标签不升级成人工会话名

### TC-240 旧存储回归

- 关联需求：[Issues：SQLite 与迁移](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-014-sqlite-与迁移)、REQ-026
- 输入和操作：运行既有v4迁移与Rename/Clear失败回归；重复加载旧数据
- 预期：保留原兼容合同和数据；不新增receipt、复制迁移或自动回填；缺失证据不复活已清除的Provider缓存

### TC-241 旧人工归属冲突

- 关联需求：[Issues：SQLite 与迁移](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-014-sqlite-与迁移)、REQ-026
- 输入和操作：同identity多个不同人工名、无identity、scope有歧义
- 预期：不猜ID或覆盖原值；未能精确匹配的旧人工候选不投影，自动命名继续工作

### TC-242 Tab旧别名与普通shell

- 关联需求：REQ-025、REQ-026
- 输入和操作：模板/自动化/人工来源不明custom，单/多pane与shell
- 预期：Agent名字不被旧别名抢占；不将其批量标成人工session名；shell容器Rename保持

### TC-243 分屏与身份切换

- 关联需求：REQ-025、REQ-028
- 输入和操作：A/B同tab，切焦点、真换session、关闭重建pane；对照后台B、合法worker与未知观察
- 预期：每行用已确认的自身identity；Tab等于活跃pane；父标签不广播；后台B不替换父绑定，合法worker保留，unknown不凭prompt猜归属

### TC-244 异步迟到与revision

- 关联需求：[Issues：Receipt 与 revision](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-016-receipt-与-revision)、REQ-025、REQ-026
- 输入和操作：A请求未完切B；同A新请求先返回；Rename/Clear与导入并发
- 预期：旧响应不覆盖新绑定/新结果；A缓存可保留；清除不会被旧导入复活

### TC-245 稳定派生与设置

- 关联需求：REQ-025
- 输入和操作：无Provider/人工，首个有效任务后发“继续”或切换新话题；切tabAutoGenerateTitle
- 预期：同session保留稳定摘要，最新任务只改预览；renderer派生受统一设置控制，scanner有效首问摘要按合同保留；所有消费者相同；新session重新选名

### TC-246 搜索和操作旁路

- 关联需求：REQ-025
- 输入和操作：按Provider名/备用名/ID检索；History拖拽、删除确认、接续、Goal/Notes选目标
- 预期：显示结果一致且可搜索；操作ID/path/terminal handle不因名称变化而改变

### TC-247 仪表盘Activity通知

- 关联需求：REQ-025
- 输入和操作：同一revision在主/弹出Dashboard、Map、Activity及新通知发布
- 预期：会话标识取同一值；任务内容/状态另显；不再用当前prompt充当另一条主名

### TC-248 关闭重启与隔离

- 关联需求：[Issues：SQLite 与迁移](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-014-sqlite-与迁移)、[Issues：Authority 与 host](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-015-authority-与-host)、REQ-025、REQ-026
- 输入和操作：local/folder/SSH/paired、不同profile、WSL/home scope；关闭恢复
- 预期：名称按正确scope恢复；断线不读本地替代、不认为exited；模糊scope不投影其他会话旧人工值

### TC-249 Mobile与headless/Chat

- 关联需求：REQ-025、REQ-026
- 输入和操作：无桌面renderer，单/多pane；structured默认名后建立Provider handle
- 预期：同样优先级，不依赖桌面canonical provider；已有人工适配可用时接入、缺席明确披露；身份建立前不伪造会话名

### TC-250 新旧端与退出旧职责

- 关联需求：[Issues：Authority 与 host](../../../Issues看板与会话/requirements/Issues看板与会话.md#req-015-authority-与-host)、REQ-025、REQ-026
- 输入和操作：新旧客户端/host双向；旧Issues Rename入口；源码调用图审计
- 预期：新字段可选、旧title内容合同不变；新显示链只消费公共结果及可选旧人工适配，不依赖Issues局部请求/map；保留旧入口，未升级端不计新规则通过

### TC-251 低信息派生候选跳过

- 关联需求：REQ-025
- 输入和操作：无Provider/人工；单独“继续”“好的”“ok”“continue”、空白、清理后空串；另有合格实时标题
- 预期：prompt候选无效，实时标题生效；实时也只有状态/目录时继续降级；不调用LLM，不从UI各自评分

### TC-252 有效短请求与首问捕获

- 关联需求：REQ-025
- 输入和操作：“继续修复登录超时”“运行测试”；首条注入/确认后出现真实任务；后续普通回合
- 预期：不因子串/短长度误删有效请求；首个有效任务进入摘要，之后不被“继续”或普通新回合覆盖；未找到合格任务时实时回退可用

### TC-253 Provider终端标题分类

- 关联需求：REQ-025
- 输入和操作：摘要/人工名存在；一组有适配器协议和当前identity证据，一组只是看似名称的OSC/其他pane标题
- 预期：前组归Provider第一层；后组不因文本像名字而升级，不得跨pane借用；单纯来自Agent进程也不足以证明正式名

### TC-254 不误过滤明确命名

- 关联需求：REQ-025
- 输入和操作：Provider明确命名“继续”；无Provider时人工备用名“好的”；对照同文本作为prompt
- 预期：Provider/人工名保留各自优先级；同文本作为低信息prompt被跳过；质量过滤不擅自否决明确命名

## 3. 执行与证据要求

TC-245/247 的 Activity 必须挂载实际 `useAgentPaneThreads`，穿过 public name store → event builder → thread builder → 行/详情，不以只调用排序函数代替：

- 没有顶部 aiVaultTitle 时仍按自身 host/agent/sessionId 点查；仅原生名变更、不更新状态/Tab/epoch，也应刷新。分屏非选中 pane、retained 无 Tab、agent-session 适配都不能借当前 Tab 的另一会话名。
- 原生名、稳定文件首问摘要、当前任务/工具/回复各使用不同文本。原生名“继续”有效；详细后续 prompt 不能替换稳定首问。关闭 `tabAutoGenerateTitle` 禁止 renderer 从 Hook prompt 派生，但不撤销 Provider 文件已提取的 generatedTitle。
- A done → B working 和 A done → B done 都必须经过实际状态构建器；旧事件保留 A 的 ID/path、Provider 类型和时间，新事件使用 B 的时间，不继承 A 的实时名。旧版本 history 缺身份时保留原 prompt，但不得猜成当前 B；同身份历史才能作为稳定 prompt 的候选。
- 同状态换会话必须保留真实 HTTP→main snapshot/listener→IPC 的 `stateStartedAt` 输入，不能省略 timing 来测试 renderer 默认值。新 host 的 B 起点必须晚于 A；旧 host 仍传 A 起点时，renderer 不得把 B 与 A 去重。重复 B 旧时间事件后仍应保持 B 行、原历史 A 数量与 B 起点，正常不同 host 起点不得一律改为接收时刻。
- history 仅增加可选、受原 20 条上限约束的命名 provenance，不新增数据库、RPC 或事件 opcode。paired equality 和 publication 对身份字段单独变化敏感；旧端没有字段走未知身份回退。
- 正式可见的 Sidebar Activity 行与 hover 为核心 UI；legacy Activity 整页如果只能通过既有 store 导航打开，报告必须明确该 setup，不冒充正常按钮操作。搜索新名和原始任务关键词，检查未读/清除和缓存复用回归。

TC-247 的通知须经过实际生产入口，不以直接传完整 AgentStatusEntry 替代通知快照：

- 本地 Hook IPC 与 paired inventory 经各自字段投影、completion coordinator、renderer dispatch 和 main formatter；事件所属 Provider ID/path 必须保留，launchToken 等路由私有字段不得夹带到通知快照。旧端缺身份时不借新会话的容器名。
- 原生名（包括明确原生名“继续”）优先；无原生名时已有人工名、首个有效任务、自身实时名逐层回退，最新回合的“继续”与回复仍作为事件内容，不改写成会话名。
- 事件 A 冷读取中切 B、再切回 A；旧事件取其当次读取结果，当前 Tab/cache 保留新代结果。必须接真实公共 store 和 Gate invalidate，不只 mock 最终 resolver。A→B 本身可保留 A 缓存，不把缓存必须为空作为预期。
- 冷读取最多等待 1500ms；超时只发送已捕获的 fallback 一次，迟到结果不补发、不追溯重命名。未读标记仍在等待前发生；通知 ID、状态、回复/工具正文、焦点与去重规则保持原合同。
- terminal BEL 仅在自己的 live leaf、明确 Provider 相符时借用该 pane 身份；分屏兄弟、关闭 leaf、其他 Provider 或无身份事件不得继承旧生成名。
- process-exit 不借用未完成状态/回复，但同Provider的fresh已接受身份仍可提供名称；过期状态和另一Provider不能借名。名称证据与完成内容独立验收。
- desktop 与 mobile fanout 比较同一已格式化 title/body/notificationId。隔离后台验证可禁用 native transport 并读取真实 mobile replay；这不等于验证系统横幅、声音、真实手机或 headless 自主命名。

TC-234/246 的 History 回归须覆盖操作而非仅行文字：

- 只有 History 库存、没有同 identity 的 Tab/Dashboard/Issues 请求者时，Provider 改名后正常刷新，搜索、行、删除确认和接续来源名一致；不得借额外活跃 Tab 帮助刷新。
- 原生名、正式人工备用名、旧 scanner title、容器别名使用不同文本。取消删除/接续不删除源文件、不启动新 Provider；确认动作的 host、sessionId、filePath 不因显示改名改变。
- 删除确认仅对现有支持删除的 Provider 验收（如 Claude）。Codex 现有规则禁用删除，应断言菜单禁用及说明、再验证接续名称；不得为凑齐动作而解禁或强制点击。人工/prompt 回退的删除弹窗另用无原生名的 Claude 会话覆盖。
- 新扫描与较新的精确读取冲突时，扫描不能直接覆盖后者；重新确认过程中保留已确认名，重复扫描复用同一在途请求，断线不读本地替代。
- History 已获取新原生名且同 identity 仍有 Tab 时，继续操作菜单/搜索，顶部及其 slot 必须同步；已确认缓存投影不能等输入安静或另一个 host 的文件读取。必须联合断言两个入口，不能把只有 History 通过记作一致性通过。
- Claude 子日志共用父 sessionId 时，只显示子日志自身明确改名、Provider 侧车任务名或首个有效任务；不得读写父名称缓存或借用父人工名。独立子 identity 与其他 host 仍各自隔离，原始 sessionId 和日志路径不改写。

TC-243/244 的绑定反例必须经过真实公共名称 cache 和真实 Tab store，不以只替换 resolver 的单测代替整链：

- 同一路径 A→B→A；A 旧响应扣留，新绑定读到新名后再释放；同时观察 Top/Sidebar 中间态，旧响应不得经 cache 再投影。
- 叶子 PTY、终端 generation、host 变化但 session ID 不变；对应旧读失效，同 host 其他 identity 和其他 host 不受影响。
- 切到空 shell、split 暂无 active leaf、旧 leaf 已从 root 移除；不能借用另一 pane 或已移除 pane 的身份。
- 正常点击 Split 后，新 leaf 的 PTY 就绪，manager/DOM 所选 leaf 与状态、Top 必须自然一致；不额外点回旧 pane 来让测试通过。晚完成的非当前 pane 不得抢回选择。
- 新 session 或另一 Provider 已明确准入时，旧 native/manual/prompt 不可转交；同 session 改名保留首个有效 prompt，新 session 可重新捕获。
- 库存暂时缺失保留已确认名；之后若出现明确换 pane 的证据，仍能撤下旧绑定。缺记录本身不是退出证据。

定向单测验证来源、排序与竞态；真实存储验证flush、重跑、revision；主机路由验证scope；实际App按消费矩阵采证。证据必须记录commit/包版本、场景、期望/实际、同identity依据、截图/日志索引和未覆盖项，不能只报测试数量。

后台App遵守`ORCA_BACKGROUND_LAUNCH=1`，Electron/Playwright CDP交subagent执行，不激活窗口。真实端到端不得注入最终名称/会话身份或mock Provider读取；隔离metadata回放只能作为组件验证，不能顶替本节端到端验收。每个未运行的消费面、host或新旧端组合必须独立列为未验证。
